from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict
from app.models.user import UserRole


class UserCreate(BaseModel):
    username: str
    password: str
    role: UserRole = UserRole.user
    email: Optional[str] = None


class UserUpdate(BaseModel):
    password: Optional[str] = None
    role: Optional[UserRole] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None
    default_section_id: Optional[int] = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: Optional[str]
    role: UserRole
    default_section_id: Optional[int]
    is_active: bool
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
