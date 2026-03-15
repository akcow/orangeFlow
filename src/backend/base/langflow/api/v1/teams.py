from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import func, select

from langflow.api.utils import CurrentActiveUser, DbSession
from langflow.services.database.models.folder.model import Folder
from langflow.services.database.models.team_membership.crud import ensure_team_membership
from langflow.services.database.models.team_membership.model import TeamMembership, TeamRoleEnum
from langflow.services.database.models.user.crud import get_user_by_username
from langflow.services.database.models.user.model import User

router = APIRouter(prefix="/teams", tags=["Teams"])


class TeamSummaryResponse(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    owner_id: UUID | None = None
    member_count: int = 0
    current_user_role: TeamRoleEnum | None = None


class TeamMemberResponse(BaseModel):
    user_id: UUID
    username: str
    nickname: str
    role: TeamRoleEnum
    created_at: str


class AddTeamMemberRequest(BaseModel):
    username: str = Field(min_length=1)
    role: TeamRoleEnum = TeamRoleEnum.MEMBER


class UpdateTeamMemberRequest(BaseModel):
    role: TeamRoleEnum


def _can_manage_team(current_role: TeamRoleEnum | None, current_user: User) -> bool:
    if current_user.is_superuser:
        return True
    return current_role in {TeamRoleEnum.OWNER, TeamRoleEnum.ADMIN}


@router.get("/", response_model=list[TeamSummaryResponse], status_code=200)
async def list_teams(
    session: DbSession,
    current_user: CurrentActiveUser,
    include_all: bool = False,
):
    membership_count_subquery = (
        select(
            TeamMembership.folder_id.label("folder_id"),
            func.count(TeamMembership.id).label("member_count"),
        )
        .group_by(TeamMembership.folder_id)
        .subquery()
    )

    if include_all:
        if not current_user.is_superuser:
            raise HTTPException(status_code=403, detail="Superuser only")
        rows = (
            await session.exec(
                select(Folder, membership_count_subquery.c.member_count)
                .outerjoin(membership_count_subquery, membership_count_subquery.c.folder_id == Folder.id)
                .order_by(Folder.name)
            )
        ).all()
        return [
            TeamSummaryResponse(
                id=folder.id,
                name=folder.name,
                description=folder.description,
                owner_id=folder.user_id,
                member_count=int(member_count or 0),
                current_user_role=None,
            )
            for folder, member_count in rows
        ]

    rows = (
        await session.exec(
            select(Folder, TeamMembership.role, membership_count_subquery.c.member_count)
            .join(TeamMembership, TeamMembership.folder_id == Folder.id)
            .outerjoin(membership_count_subquery, membership_count_subquery.c.folder_id == Folder.id)
            .where(TeamMembership.user_id == current_user.id)
            .order_by(Folder.name)
        )
    ).all()
    return [
        TeamSummaryResponse(
            id=folder.id,
            name=folder.name,
            description=folder.description,
            owner_id=folder.user_id,
            member_count=int(member_count or 0),
            current_user_role=role,
        )
        for folder, role, member_count in rows
    ]


@router.get("/{team_id}/members", response_model=list[TeamMemberResponse], status_code=200)
async def list_team_members(
    team_id: UUID,
    session: DbSession,
    current_user: CurrentActiveUser,
):
    current_membership = (
        await session.exec(
            select(TeamMembership).where(
                TeamMembership.folder_id == team_id,
                TeamMembership.user_id == current_user.id,
            )
        )
    ).first()
    if not current_membership and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Not a team member")

    rows = (
        await session.exec(
            select(TeamMembership, User)
            .join(User, User.id == TeamMembership.user_id)
            .where(TeamMembership.folder_id == team_id)
            .order_by(TeamMembership.created_at.asc())
        )
    ).all()
    return [
        TeamMemberResponse(
            user_id=user.id,
            username=user.username,
            nickname=user.nickname,
            role=membership.role,
            created_at=membership.created_at.replace(microsecond=0).isoformat(),
        )
        for membership, user in rows
    ]


@router.post("/{team_id}/members", response_model=TeamMemberResponse, status_code=201)
async def add_team_member(
    team_id: UUID,
    payload: AddTeamMemberRequest,
    session: DbSession,
    current_user: CurrentActiveUser,
):
    current_membership = (
        await session.exec(
            select(TeamMembership).where(
                TeamMembership.folder_id == team_id,
                TeamMembership.user_id == current_user.id,
            )
        )
    ).first()
    if not _can_manage_team(current_membership.role if current_membership else None, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")

    team = (await session.exec(select(Folder).where(Folder.id == team_id))).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    user = await get_user_by_username(session, payload.username.strip())
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    membership = await ensure_team_membership(
        session,
        folder_id=team_id,
        user_id=user.id,
        role=payload.role,
    )
    return TeamMemberResponse(
        user_id=user.id,
        username=user.username,
        nickname=user.nickname,
        role=membership.role,
        created_at=membership.created_at.replace(microsecond=0).isoformat(),
    )


@router.patch("/{team_id}/members/{user_id}", response_model=TeamMemberResponse, status_code=200)
async def update_team_member_role(
    team_id: UUID,
    user_id: UUID,
    payload: UpdateTeamMemberRequest,
    session: DbSession,
    current_user: CurrentActiveUser,
):
    current_membership = (
        await session.exec(
            select(TeamMembership).where(
                TeamMembership.folder_id == team_id,
                TeamMembership.user_id == current_user.id,
            )
        )
    ).first()
    if not _can_manage_team(current_membership.role if current_membership else None, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")

    membership = (
        await session.exec(
            select(TeamMembership).where(
                TeamMembership.folder_id == team_id,
                TeamMembership.user_id == user_id,
            )
        )
    ).first()
    if not membership:
        raise HTTPException(status_code=404, detail="Team member not found")

    user = (await session.exec(select(User).where(User.id == user_id))).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    membership.role = payload.role
    session.add(membership)
    await session.commit()
    await session.refresh(membership)

    return TeamMemberResponse(
        user_id=user.id,
        username=user.username,
        nickname=user.nickname,
        role=membership.role,
        created_at=membership.created_at.replace(microsecond=0).isoformat(),
    )
