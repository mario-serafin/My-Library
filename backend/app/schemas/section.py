from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class SectionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    genres: Optional[str] = None


class SectionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    genres: Optional[str] = None


class SectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str]
    genres: Optional[str]
    created_at: datetime
