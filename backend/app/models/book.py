from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from app.database import Base


class Book(Base):
    __tablename__ = "books"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(512), nullable=False, index=True)
    author = Column(String(512), nullable=True, index=True)
    isbn = Column(String(32), nullable=True, index=True)
    year = Column(Integer, nullable=True)
    description = Column(Text, nullable=True)
    cover_url = Column(String(1024), nullable=True)
    genres = Column(String(512), nullable=True)
    publisher = Column(String(256), nullable=True)
    page_count = Column(Integer, nullable=True)
    language = Column(String(64), nullable=True)
    open_library_id = Column(String(64), nullable=True, index=True)
    section_id = Column(Integer, ForeignKey("sections.id", ondelete="SET NULL"), nullable=True)
    added_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
