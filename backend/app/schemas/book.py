from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class BookCandidate(BaseModel):
    open_library_id: Optional[str] = None
    title: str
    author: Optional[str] = None
    year: Optional[int] = None
    isbn: Optional[str] = None
    cover_url: Optional[str] = None
    genres: Optional[str] = None
    publisher: Optional[str] = None
    page_count: Optional[int] = None
    language: Optional[str] = None
    confidence: float = 0.0


class BookSearchRequest(BaseModel):
    title: str = ""
    author: str = ""


class BookCreate(BaseModel):
    open_library_id: Optional[str] = None
    title: str
    author: Optional[str] = None
    isbn: Optional[str] = None
    year: Optional[int] = None
    description: Optional[str] = None
    cover_url: Optional[str] = None
    genres: Optional[str] = None
    publisher: Optional[str] = None
    page_count: Optional[int] = None
    language: Optional[str] = None
    section_id: Optional[int] = None


class BookUpdate(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    section_id: Optional[int] = None
    year: Optional[int] = None
    isbn: Optional[str] = None
    genres: Optional[str] = None
    description: Optional[str] = None
    publisher: Optional[str] = None
    page_count: Optional[int] = None
    language: Optional[str] = None
    cover_url: Optional[str] = None


class CoverSearchRequest(BaseModel):
    title: str = ""
    author: str = ""
    isbn: str = ""


class CoverCandidate(BaseModel):
    url: str
    source: str
    language: Optional[str] = None
    edition: Optional[str] = None


class BookResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    author: Optional[str]
    isbn: Optional[str]
    year: Optional[int]
    description: Optional[str]
    cover_url: Optional[str]
    genres: Optional[str]
    publisher: Optional[str]
    page_count: Optional[int]
    language: Optional[str]
    open_library_id: Optional[str]
    section_id: Optional[int]
    added_by: Optional[int]
    created_at: datetime


class PaginatedBooks(BaseModel):
    items: List[BookResponse]
    total: int
    page: int
    page_size: int
    pages: int
