import math
import os
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models.task import ProcessingTask, TaskStatus
from app.models.book import Book
from app.models.user import User
from app.schemas.task import TaskResponse, TaskRetryRequest, TaskConfirmRequest, PaginatedTasks
from app.schemas.book import BookCandidate
from app.services.auth import get_current_user
from app.services.book_search import search_books
from app.config import settings

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _task_to_response(task: ProcessingTask) -> TaskResponse:
    resp = TaskResponse.model_validate(task)
    if task.image_filename:
        resp.image_url = f"/uploads/{task.image_filename}"
    return resp


@router.get("/pending-count")
async def pending_count(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(func.count()).select_from(ProcessingTask).where(
            ProcessingTask.user_id == current_user.id,
            ProcessingTask.status == TaskStatus.needs_attention,
        )
    )
    return {"count": result.scalar()}


@router.get("", response_model=PaginatedTasks)
async def list_tasks(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(ProcessingTask).where(ProcessingTask.user_id == current_user.id)
    if status:
        query = query.where(ProcessingTask.status == status)

    count_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_result.scalar()

    query = query.order_by(ProcessingTask.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    items = [_task_to_response(t) for t in result.scalars().all()]

    return PaginatedTasks(
        items=items, total=total, page=page, page_size=page_size,
        pages=max(1, math.ceil(total / page_size)),
    )


@router.post("/upload", response_model=TaskResponse, status_code=202)
async def upload_image(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    ext = os.path.splitext(file.filename or "img.jpg")[1] or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(settings.UPLOAD_DIR, filename)

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 20MB)")
    with open(filepath, "wb") as f:
        f.write(content)

    task = ProcessingTask(
        user_id=current_user.id,
        image_filename=filename,
        status=TaskStatus.pending,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    from app.worker.book_tasks import process_book_image
    celery_task = process_book_image.apply_async(args=[task.id])
    task.celery_task_id = celery_task.id
    await db.commit()
    await db.refresh(task)

    return _task_to_response(task)


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(task_id: int, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(ProcessingTask).where(ProcessingTask.id == task_id, ProcessingTask.user_id == current_user.id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return _task_to_response(task)


@router.post("/{task_id}/retry")
async def retry_task(
    task_id: int,
    req: TaskRetryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ProcessingTask).where(ProcessingTask.id == task_id, ProcessingTask.user_id == current_user.id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.ocr_title = req.title
    task.ocr_author = req.author
    await db.commit()

    candidates = await search_books(title=req.title, author=req.author, limit=15)
    task.book_candidates = candidates
    await db.commit()

    return {"candidates": candidates}


@router.post("/{task_id}/reprocess", response_model=TaskResponse)
async def reprocess_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-run the full AI pipeline on the uploaded image (clears AI cooldowns first)."""
    result = await db.execute(
        select(ProcessingTask).where(ProcessingTask.id == task_id, ProcessingTask.user_id == current_user.id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not task.image_filename:
        raise HTTPException(status_code=400, detail="Questo task non ha un'immagine da rielaborare")

    from app.services.ai_vision import clear_all_cooldowns
    clear_all_cooldowns()

    task.status = TaskStatus.pending
    task.error_message = None
    await db.commit()

    from app.worker.book_tasks import process_book_image
    celery_task = process_book_image.apply_async(args=[task.id])
    task.celery_task_id = celery_task.id
    await db.commit()
    await db.refresh(task)

    return _task_to_response(task)


@router.post("/{task_id}/confirm", response_model=TaskResponse)
async def confirm_task(
    task_id: int,
    req: TaskConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ProcessingTask).where(ProcessingTask.id == task_id, ProcessingTask.user_id == current_user.id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if req.open_library_id:
        existing = await db.execute(select(Book).where(Book.open_library_id == req.open_library_id))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Book already in collection")

    from app.services.section_assignment import assign_section_id_async
    section_id = await assign_section_id_async(
        title=req.title,
        author=req.author or "",
        genres=req.genres or "",
        db=db,
    )
    book = Book(
        open_library_id=req.open_library_id,
        title=req.title,
        author=req.author,
        isbn=req.isbn,
        year=req.year,
        cover_url=req.cover_url,
        genres=req.genres,
        publisher=req.publisher,
        page_count=req.page_count,
        language=req.language,
        section_id=section_id,
        added_by=current_user.id,
    )
    db.add(book)
    await db.flush()

    task.book_id = book.id
    task.status = TaskStatus.completed
    await db.commit()
    await db.refresh(task)

    return _task_to_response(task)


@router.post("/{task_id}/dismiss", response_model=TaskResponse)
async def dismiss_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ProcessingTask).where(ProcessingTask.id == task_id, ProcessingTask.user_id == current_user.id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.status = TaskStatus.dismissed
    await db.commit()
    await db.refresh(task)
    return _task_to_response(task)


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ProcessingTask).where(ProcessingTask.id == task_id, ProcessingTask.user_id == current_user.id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.image_filename:
        import os as _os
        path = _os.path.join(settings.UPLOAD_DIR, task.image_filename)
        if _os.path.exists(path):
            _os.remove(path)
    await db.delete(task)
    await db.commit()


@router.delete("", status_code=204)
async def delete_dismissed_tasks(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete all dismissed tasks (and their uploaded images) for the current user."""
    result = await db.execute(
        select(ProcessingTask).where(
            ProcessingTask.user_id == current_user.id,
            ProcessingTask.status == TaskStatus.dismissed,
        )
    )
    tasks = result.scalars().all()
    for task in tasks:
        if task.image_filename:
            import os as _os
            path = _os.path.join(settings.UPLOAD_DIR, task.image_filename)
            if _os.path.exists(path):
                _os.remove(path)
        await db.delete(task)
    await db.commit()
