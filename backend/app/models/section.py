from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.database import Base


class Section(Base):
    __tablename__ = "sections"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False)
    description = Column(String(512), nullable=True)
    genres = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
