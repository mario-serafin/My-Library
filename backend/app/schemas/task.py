from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, ConfigDict
from app.models.task import TaskStatus
from app.schemas.book import BookCandidate, BookResponse


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    image_filename: Optional[str]
    image_url: Optional[str] = None
    status: TaskStatus
    ocr_title: Optional[str]
    ocr_author: Optional[str]
    book_candidates: Optional[List[Any]]
    book_id: Optional[int]
    target_section_id: Optional[int]
    error_message: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]


class TaskRetryRequest(BaseModel):
    title: str
    author: str = ""


class TaskConfirmRequest(BaseModel):
    open_library_id: Optional[str] = None
    title: str
    author: Optional[str] = None
    isbn: Optional[str] = None
    year: Optional[int] = None
    cover_url: Optional[str] = None
    genres: Optional[str] = None
    publisher: Optional[str] = None
    page_count: Optional[int] = None
    language: Optional[str] = None
    section_id: Optional[int] = None


class PaginatedTasks(BaseModel):
    items: List[TaskResponse]
    total: int
    page: int
    page_size: int
    pages: int
