from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from langflow.services.database.models.flow.model import Flow
from langflow.services.database.models.folder.model import Folder
from langflow.services.database.models.team_membership.model import TeamMembership
from langflow.services.database.models.user.model import User


async def get_team_membership(
    session: AsyncSession,
    folder_id: UUID,
    user_id: UUID,
) -> TeamMembership | None:
    stmt = select(TeamMembership).where(
        TeamMembership.folder_id == folder_id,
        TeamMembership.user_id == user_id,
    )
    return (await session.exec(stmt)).first()


async def can_access_folder(
    session: AsyncSession,
    folder: Folder | None,
    user: User,
) -> bool:
    if folder is None:
        return False
    if user.is_superuser:
        return True
    if folder.user_id is None:
        return True
    if folder.user_id == user.id:
        return True
    membership = await get_team_membership(session, folder.id, user.id)
    return membership is not None


async def require_folder_access(
    session: AsyncSession,
    folder_id: UUID,
    user: User,
    *,
    not_found_detail: str = "Project not found",
) -> Folder:
    folder = await session.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail=not_found_detail)
    if not await can_access_folder(session, folder, user):
        raise HTTPException(status_code=403, detail="Permission denied")
    return folder


async def can_access_flow(
    session: AsyncSession,
    flow: Flow | None,
    user: User,
) -> bool:
    if flow is None:
        return False
    if user.is_superuser:
        return True
    if flow.user_id == user.id:
        return True
    if flow.folder_id is None:
        return False
    folder = await session.get(Folder, flow.folder_id)
    return await can_access_folder(session, folder, user)


async def require_flow_access(
    session: AsyncSession,
    flow_id: UUID,
    user: User,
    *,
    not_found_detail: str = "Flow not found",
) -> Flow:
    flow = await session.get(Flow, flow_id)
    if not flow:
        raise HTTPException(status_code=404, detail=not_found_detail)
    if not await can_access_flow(session, flow, user):
        raise HTTPException(status_code=403, detail="Permission denied")
    return flow
