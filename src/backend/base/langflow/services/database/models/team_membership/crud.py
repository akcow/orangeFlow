from uuid import UUID

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from langflow.services.database.models.team_membership.model import TeamMembership, TeamRoleEnum


async def ensure_team_membership(
    session: AsyncSession,
    *,
    folder_id: UUID,
    user_id: UUID,
    role: TeamRoleEnum = TeamRoleEnum.MEMBER,
) -> TeamMembership:
    stmt = select(TeamMembership).where(
        TeamMembership.folder_id == folder_id,
        TeamMembership.user_id == user_id,
    )
    membership = (await session.exec(stmt)).first()
    if membership:
        if membership.role != role:
            membership.role = role
            session.add(membership)
            await session.commit()
            await session.refresh(membership)
        return membership

    membership = TeamMembership(folder_id=folder_id, user_id=user_id, role=role)
    session.add(membership)
    await session.commit()
    await session.refresh(membership)
    return membership
