import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Text, Enum
from sqlalchemy.sql import func
from app.database import Base


class TaskStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    needs_attention = "needs_attention"
    dismissed = "dismissed"
    failed = "failed"


class ProcessingTask(Base):
    __tablename__ = "processing_tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    image_filename = Column(String(256), nullable=True)
    celery_task_id = Column(String(256), nullable=True)
    status = Column(Enum(TaskStatus), default=TaskStatus.pending, nullable=False, index=True)
    ocr_title = Column(String(512), nullable=True)
    ocr_author = Column(String(512), nullable=True)
    book_candidates = Column(JSON, nullable=True)
    book_id = Column(Integer, ForeignKey("books.id", ondelete="SET NULL"), nullable=True)
    target_section_id = Column(Integer, ForeignKey("sections.id", ondelete="SET NULL"), nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
