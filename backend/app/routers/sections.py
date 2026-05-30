from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.section import Section
from app.models.user import User
from app.schemas.section import SectionCreate, SectionUpdate, SectionResponse
from app.services.auth import get_current_user

router = APIRouter(prefix="/api/sections", tags=["sections"])


@router.get("", response_model=List[SectionResponse])
async def list_sections(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Section).order_by(Section.name))
    return result.scalars().all()


@router.post("", response_model=SectionResponse, status_code=201)
async def create_section(
    data: SectionCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    section = Section(**data.model_dump())
    db.add(section)
    await db.commit()
    await db.refresh(section)
    return section


@router.put("/{section_id}", response_model=SectionResponse)
async def update_section(
    section_id: int,
    data: SectionUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Section).where(Section.id == section_id))
    section = result.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    for field, val in data.model_dump(exclude_none=True).items():
        setattr(section, field, val)
    await db.commit()
    await db.refresh(section)
    return section


@router.delete("/{section_id}", status_code=204)
async def delete_section(
    section_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Section).where(Section.id == section_id))
    section = result.scalar_one_or_none()
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    await db.delete(section)
    await db.commit()
