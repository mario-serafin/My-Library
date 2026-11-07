"""Export / import of the whole library as a JSON document.

Format (version 1):
{
  "app": "my-library", "version": 1, "exported_at": "...",
  "sections": [{"name", "description", "genres", "is_system"}],
  "books":    [{"title", "author", ..., "section": "<section name>", "created_at"}]
}
Books reference sections by NAME (not id) so a backup can be restored on a
different database.  Import is additive: it never deletes or overwrites anything.
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.book import Book
from app.models.section import Section
from app.models.user import User
from app.services.auth import get_current_user

router = APIRouter(prefix="/api/library", tags=["library"])

FORMAT_APP = "my-library"
FORMAT_VERSION = 1


class SectionDump(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: Optional[str] = Field(default=None, max_length=512)
    genres: Optional[str] = Field(default=None, max_length=512)
    is_system: bool = False


class BookDump(BaseModel):
    title: str = Field(min_length=1, max_length=512)
    author: Optional[str] = Field(default=None, max_length=512)
    isbn: Optional[str] = Field(default=None, max_length=32)
    year: Optional[int] = None
    description: Optional[str] = None
    cover_url: Optional[str] = Field(default=None, max_length=1024)
    genres: Optional[str] = Field(default=None, max_length=512)
    publisher: Optional[str] = Field(default=None, max_length=256)
    page_count: Optional[int] = None
    language: Optional[str] = Field(default=None, max_length=64)
    open_library_id: Optional[str] = Field(default=None, max_length=64)
    section: Optional[str] = None            # section name
    created_at: Optional[datetime] = None


class LibraryDump(BaseModel):
    app: str = FORMAT_APP
    version: int
    exported_at: Optional[datetime] = None
    sections: List[SectionDump] = []
    books: List[BookDump] = []


class ImportResult(BaseModel):
    books_in_file: int
    books_created: int
    books_skipped_duplicates: int
    sections_created: int


def _norm(s: Optional[str]) -> str:
    return (s or "").strip().lower()


@router.get("/export")
async def export_library(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    sections = (await db.execute(select(Section).order_by(Section.name))).scalars().all()
    books = (await db.execute(select(Book).order_by(Book.id))).scalars().all()
    section_name = {s.id: s.name for s in sections}

    dump = LibraryDump(
        version=FORMAT_VERSION,
        exported_at=datetime.now(timezone.utc),
        sections=[
            SectionDump(name=s.name, description=s.description, genres=s.genres, is_system=s.is_system)
            for s in sections
        ],
        books=[
            BookDump(
                title=b.title, author=b.author, isbn=b.isbn, year=b.year,
                description=b.description, cover_url=b.cover_url, genres=b.genres,
                publisher=b.publisher, page_count=b.page_count, language=b.language,
                open_library_id=b.open_library_id,
                section=section_name.get(b.section_id),
                created_at=b.created_at,
            )
            for b in books
        ],
    )
    filename = f"my-library-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    return JSONResponse(
        content=dump.model_dump(mode="json"),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import", response_model=ImportResult)
async def import_library(
    dump: LibraryDump,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if dump.app != FORMAT_APP:
        raise HTTPException(status_code=400, detail="File non valido: non è un export di My Library")
    if dump.version != FORMAT_VERSION:
        raise HTTPException(status_code=400, detail=f"Versione del formato non supportata: {dump.version}")

    # ── Sections: match by name, create the missing ones ───────────────────────
    existing_sections = (await db.execute(select(Section))).scalars().all()
    by_name = {_norm(s.name): s for s in existing_sections}
    sections_created = 0

    async def get_or_create_section(name: str, src: Optional[SectionDump] = None) -> Section:
        nonlocal sections_created
        key = _norm(name)
        if key in by_name:
            return by_name[key]
        sec = Section(
            name=name.strip(),
            description=src.description if src else None,
            genres=src.genres if src else None,
            is_system=False,   # never create system sections from a file
        )
        db.add(sec)
        await db.flush()
        by_name[key] = sec
        sections_created += 1
        return sec

    for s in dump.sections:
        await get_or_create_section(s.name, s)

    # ── Books: skip those already present (OL id / ISBN / title+author) ─────────
    existing_books = (await db.execute(
        select(Book.open_library_id, Book.isbn, Book.title, Book.author)
    )).all()
    seen_ol = {r.open_library_id for r in existing_books if r.open_library_id}
    seen_isbn = {r.isbn for r in existing_books if r.isbn}
    seen_ta = {(_norm(r.title), _norm(r.author)) for r in existing_books}

    created = skipped = 0
    for b in dump.books:
        ta = (_norm(b.title), _norm(b.author))
        if (
            (b.open_library_id and b.open_library_id in seen_ol)
            or (b.isbn and b.isbn in seen_isbn)
            or ta in seen_ta
        ):
            skipped += 1
            continue

        section_id = None
        if b.section and b.section.strip():
            section_id = (await get_or_create_section(b.section)).id

        data = b.model_dump(exclude={"section", "created_at"})
        book = Book(**data, section_id=section_id, added_by=current_user.id)
        if b.created_at:
            book.created_at = b.created_at
        db.add(book)

        if b.open_library_id:
            seen_ol.add(b.open_library_id)
        if b.isbn:
            seen_isbn.add(b.isbn)
        seen_ta.add(ta)
        created += 1

    await db.commit()
    return ImportResult(
        books_in_file=len(dump.books),
        books_created=created,
        books_skipped_duplicates=skipped,
        sections_created=sections_created,
    )
