import math
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.database import get_db
from app.models.book import Book
from app.models.user import User
from app.schemas.book import BookCreate, BookUpdate, BookResponse, PaginatedBooks, BookSearchRequest, BookCandidate
from app.services.auth import get_current_user
from app.services.book_search import search_books
from app.services.section_assignment import assign_section_id_async

router = APIRouter(prefix="/api/books", tags=["books"])


@router.get("", response_model=PaginatedBooks)
async def list_books(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    section_id: Optional[int] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = select(Book)
    if section_id is not None:
        query = query.where(Book.section_id == section_id)
    if search:
        term = f"%{search}%"
        query = query.where(or_(Book.title.ilike(term), Book.author.ilike(term)))

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar()

    query = query.order_by(Book.title).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    items = result.scalars().all()

    return PaginatedBooks(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, math.ceil(total / page_size)),
    )


@router.post("/search", response_model=List[BookCandidate])
async def search_books(
    req: BookSearchRequest,
    _: User = Depends(get_current_user),
):
    return await search_books(title=req.title, author=req.author, limit=15)


@router.post("", response_model=BookResponse, status_code=201)
async def create_book(
    data: BookCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.open_library_id:
        existing = await db.execute(select(Book).where(Book.open_library_id == data.open_library_id))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Book already in collection")

    section_id = await assign_section_id_async(
        title=data.title,
        author=data.author or "",
        genres=data.genres or "",
        db=db,
    )
    book_data = data.model_dump()
    book_data["section_id"] = section_id
    book = Book(**book_data, added_by=current_user.id)
    db.add(book)
    await db.commit()
    await db.refresh(book)
    return book


@router.get("/{book_id}", response_model=BookResponse)
async def get_book(book_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Book).where(Book.id == book_id))
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


@router.put("/{book_id}", response_model=BookResponse)
async def update_book(
    book_id: int,
    data: BookUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Book).where(Book.id == book_id))
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    for field, val in data.model_dump(exclude_none=True).items():
        setattr(book, field, val)
    await db.commit()
    await db.refresh(book)
    return book


@router.delete("/{book_id}", status_code=204)
async def delete_book(book_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Book).where(Book.id == book_id))
    book = result.scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    await db.delete(book)
    await db.commit()
