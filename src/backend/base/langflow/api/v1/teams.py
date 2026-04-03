from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlmodel import func, select

from langflow.api.utils import CurrentActiveUser, DbSession
from langflow.api.v1.access import get_team_membership, require_folder_access
from langflow.services.database.models.admin_notification.model import (
    AdminNotification,
    AdminNotificationRecipient,
    AdminNotificationTargetType,
    AdminNotificationUserTarget,
)
from langflow.services.database.models.credit.model import CreditLedgerEntry, CreditLedgerEntryType
from langflow.services.database.models.flow.model import Flow
from langflow.services.database.models.folder.model import Folder
from langflow.services.database.models.team_membership.crud import ensure_team_membership
from langflow.services.database.models.team_membership.model import (
    TeamCreditLimitInterval,
    TeamCreditLimitKind,
    TeamMembership,
    TeamRoleEnum,
)
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
    email: str
    profile_image: str | None = None
    role: TeamRoleEnum
    credit_limit: int | None = None
    credit_limit_kind: TeamCreditLimitKind = TeamCreditLimitKind.UNLIMITED
    credit_limit_interval: TeamCreditLimitInterval | None = None
    credits_used: int = 0
    credits_remaining: int | None = None
    created_at: str


class AddTeamMemberRequest(BaseModel):
    username: str = Field(min_length=1)
    role: TeamRoleEnum = TeamRoleEnum.MEMBER


class UpdateTeamMemberRequest(BaseModel):
    role: TeamRoleEnum | None = None
    credit_limit: int | None = Field(default=None, ge=0)
    credit_limit_kind: TeamCreditLimitKind | None = None
    credit_limit_interval: TeamCreditLimitInterval | None = None


class TeamUserSearchResponse(BaseModel):
    user_id: UUID
    username: str
    nickname: str
    email: str
    profile_image: str | None = None
    is_current_user: bool = False
    is_member: bool = False
    role: TeamRoleEnum | None = None


class InviteTeamMemberRequest(BaseModel):
    user_id: UUID
    role: TeamRoleEnum = TeamRoleEnum.MEMBER


def _can_manage_team(current_role: TeamRoleEnum | None, current_user: User) -> bool:
    if current_user.is_superuser:
        return True
    return current_role in {TeamRoleEnum.OWNER, TeamRoleEnum.ADMIN}


def _can_change_team_roles(current_role: TeamRoleEnum | None, current_user: User) -> bool:
    if current_user.is_superuser:
        return True
    return current_role == TeamRoleEnum.OWNER


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def _resolve_current_role(
    session: DbSession,
    team: Folder,
    current_user: User,
) -> TeamRoleEnum | None:
    if current_user.is_superuser:
        return TeamRoleEnum.OWNER
    if team.user_id == current_user.id:
        return TeamRoleEnum.OWNER
    membership = await get_team_membership(session, team.id, current_user.id)
    return membership.role if membership else None


async def _create_team_invitation_notification(
    *,
    session: DbSession,
    team: Folder,
    invited_user: User,
    inviter: User,
) -> None:
    inviter_name = inviter.nickname or inviter.username
    team_name = team.name.strip() or "Team"
    title = f"{inviter_name} invited you to join {team_name}"
    content = (
        f"You have been added to team \"{team_name}\". "
        "Open the team workspace from My Notifications to collaborate on shared canvases."
    )
    notification = AdminNotification(
        title=title[:120],
        content=content,
        link=f"/all/folder/{team.id}",
        created_by_id=inviter.id,
        target_type=AdminNotificationTargetType.USERS,
        expires_at=_utc_now() + timedelta(days=7),
    )
    session.add(notification)
    await session.flush()
    session.add(AdminNotificationUserTarget(notification_id=notification.id, user_id=invited_user.id))
    session.add(AdminNotificationRecipient(notification_id=notification.id, user_id=invited_user.id))


async def _get_team_credit_usage_by_user(session: DbSession, team_id: UUID) -> dict[UUID, int]:
    return await _get_team_credit_usage_by_user_since(session, team_id)


async def _get_team_credit_usage_by_user_since(
    session: DbSession,
    team_id: UUID,
    period_start: datetime | None = None,
) -> dict[UUID, int]:
    conditions = [
        Flow.folder_id == team_id,
        CreditLedgerEntry.entry_type == CreditLedgerEntryType.USAGE_CHARGE,
    ]
    if period_start is not None:
        conditions.append(CreditLedgerEntry.created_at >= period_start)

    rows = (
        await session.exec(
            select(
                CreditLedgerEntry.user_id,
                func.coalesce(func.sum(-CreditLedgerEntry.delta), 0).label("credits_used"),
            )
            .join(Flow, Flow.id == CreditLedgerEntry.flow_id)
            .where(*conditions)
            .group_by(CreditLedgerEntry.user_id)
        )
    ).all()
    return {user_id: int(credits_used or 0) for user_id, credits_used in rows}


def _current_month_start() -> datetime:
    now = _utc_now()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _current_week_start() -> datetime:
    now = _utc_now()
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start_of_day - timedelta(days=start_of_day.weekday())


def _current_day_start() -> datetime:
    now = _utc_now()
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _resolve_credit_limit_kind(
    membership: TeamMembership,
) -> TeamCreditLimitKind:
    if membership.credit_limit is None:
        return TeamCreditLimitKind.UNLIMITED
    if membership.credit_limit_kind in {
        TeamCreditLimitKind.RECURRING,
        TeamCreditLimitKind.FIXED,
    }:
        return membership.credit_limit_kind
    return TeamCreditLimitKind.FIXED


def _resolve_credit_limit_interval(
    membership: TeamMembership,
    kind: TeamCreditLimitKind,
) -> TeamCreditLimitInterval | None:
    if kind != TeamCreditLimitKind.RECURRING:
        return None
    return membership.credit_limit_interval or TeamCreditLimitInterval.MONTHLY


def _to_team_member_response(
    membership: TeamMembership,
    user: User,
    *,
    fixed_credits_used: int = 0,
    recurring_daily_credits_used: int = 0,
    recurring_weekly_credits_used: int = 0,
    recurring_monthly_credits_used: int = 0,
) -> TeamMemberResponse:
    credit_limit_kind = _resolve_credit_limit_kind(membership)
    credit_limit_interval = _resolve_credit_limit_interval(
        membership,
        credit_limit_kind,
    )
    effective_credit_limit = (
        None if credit_limit_kind == TeamCreditLimitKind.UNLIMITED else membership.credit_limit
    )
    if credit_limit_kind == TeamCreditLimitKind.RECURRING:
        if credit_limit_interval == TeamCreditLimitInterval.DAILY:
            credits_used = recurring_daily_credits_used
        elif credit_limit_interval == TeamCreditLimitInterval.WEEKLY:
            credits_used = recurring_weekly_credits_used
        else:
            credits_used = recurring_monthly_credits_used
    else:
        credits_used = fixed_credits_used
    credits_remaining = None
    if effective_credit_limit is not None:
        credits_remaining = max(effective_credit_limit - credits_used, 0)

    return TeamMemberResponse(
        user_id=user.id,
        username=user.username,
        nickname=user.nickname,
        email=user.username,
        profile_image=user.profile_image,
        role=membership.role,
        credit_limit=effective_credit_limit,
        credit_limit_kind=credit_limit_kind,
        credit_limit_interval=credit_limit_interval,
        credits_used=credits_used,
        credits_remaining=credits_remaining,
        created_at=membership.created_at.replace(microsecond=0).isoformat(),
    )


@router.get("/", response_model=list[TeamSummaryResponse], status_code=200)
async def list_teams(
    session: DbSession,
    current_user: CurrentActiveUser,
    include_all: bool = False,
):
    current_membership_subquery = (
        select(
            TeamMembership.folder_id.label("folder_id"),
            TeamMembership.role.label("role"),
        )
        .where(TeamMembership.user_id == current_user.id)
        .subquery()
    )

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
            select(Folder, current_membership_subquery.c.role, membership_count_subquery.c.member_count)
            .outerjoin(current_membership_subquery, current_membership_subquery.c.folder_id == Folder.id)
            .outerjoin(membership_count_subquery, membership_count_subquery.c.folder_id == Folder.id)
            .where(
                or_(
                    Folder.user_id == current_user.id,
                    current_membership_subquery.c.folder_id.is_not(None),
                )
            )
            .order_by(Folder.name)
        )
    ).all()
    return [
        TeamSummaryResponse(
            id=folder.id,
            name=folder.name,
            description=folder.description,
            owner_id=folder.user_id,
            member_count=max(int(member_count or 0), 1 if folder.user_id == current_user.id else 0),
            current_user_role=TeamRoleEnum.OWNER if folder.user_id == current_user.id else role,
        )
        for folder, role, member_count in rows
    ]


@router.get("/{team_id}/members", response_model=list[TeamMemberResponse], status_code=200)
async def list_team_members(
    team_id: UUID,
    session: DbSession,
    current_user: CurrentActiveUser,
):
    await require_folder_access(session, team_id, current_user, not_found_detail="Team not found")
    fixed_usage_by_user_id = await _get_team_credit_usage_by_user(session, team_id)
    recurring_daily_usage_by_user_id = await _get_team_credit_usage_by_user_since(
        session,
        team_id,
        _current_day_start(),
    )
    recurring_weekly_usage_by_user_id = await _get_team_credit_usage_by_user_since(
        session,
        team_id,
        _current_week_start(),
    )
    recurring_monthly_usage_by_user_id = await _get_team_credit_usage_by_user_since(
        session,
        team_id,
        _current_month_start(),
    )

    rows = (
        await session.exec(
            select(TeamMembership, User)
            .join(User, User.id == TeamMembership.user_id)
            .where(TeamMembership.folder_id == team_id)
            .order_by(TeamMembership.created_at.asc())
        )
    ).all()
    return [
        _to_team_member_response(
            membership,
            user,
            fixed_credits_used=fixed_usage_by_user_id.get(user.id, 0),
            recurring_daily_credits_used=recurring_daily_usage_by_user_id.get(user.id, 0),
            recurring_weekly_credits_used=recurring_weekly_usage_by_user_id.get(user.id, 0),
            recurring_monthly_credits_used=recurring_monthly_usage_by_user_id.get(user.id, 0),
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
    team = await require_folder_access(session, team_id, current_user, not_found_detail="Team not found")
    current_role = await _resolve_current_role(session, team, current_user)
    if not _can_manage_team(current_role, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")
    if payload.role == TeamRoleEnum.OWNER:
        raise HTTPException(status_code=400, detail="Team owner role cannot be assigned")

    user = (
        await session.exec(
            select(User).where(
                User.username == payload.username.strip(),
                User.is_active == True,  # noqa: E712
            )
        )
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    membership = await ensure_team_membership(
        session,
        folder_id=team_id,
        user_id=user.id,
        role=payload.role,
    )
    return _to_team_member_response(membership, user)


@router.patch("/{team_id}/members/{user_id}", response_model=TeamMemberResponse, status_code=200)
async def update_team_member_role(
    team_id: UUID,
    user_id: UUID,
    payload: UpdateTeamMemberRequest,
    session: DbSession,
    current_user: CurrentActiveUser,
):
    team = await require_folder_access(session, team_id, current_user, not_found_detail="Team not found")
    current_role = await _resolve_current_role(session, team, current_user)
    if not _can_manage_team(current_role, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")
    if not payload.model_fields_set:
        raise HTTPException(status_code=400, detail="No changes provided")

    if "role" in payload.model_fields_set and not _can_change_team_roles(current_role, current_user):
        raise HTTPException(status_code=403, detail="Only the team owner can change member roles")

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

    if "role" in payload.model_fields_set:
        if payload.role is None:
            raise HTTPException(status_code=400, detail="role cannot be null")
        if membership.role == TeamRoleEnum.OWNER:
            raise HTTPException(status_code=400, detail="Owner role cannot be modified")
        if payload.role == TeamRoleEnum.OWNER:
            raise HTTPException(status_code=400, detail="Team owner role cannot be assigned")
        membership.role = payload.role

    credit_fields = {
        "credit_limit",
        "credit_limit_kind",
        "credit_limit_interval",
    }
    if credit_fields.intersection(payload.model_fields_set):
        legacy_unlimited_request = (
            "credit_limit" in payload.model_fields_set
            and payload.credit_limit is None
            and "credit_limit_kind" not in payload.model_fields_set
            and "credit_limit_interval" not in payload.model_fields_set
        )
        legacy_fixed_request = (
            "credit_limit" in payload.model_fields_set
            and payload.credit_limit is not None
            and "credit_limit_kind" not in payload.model_fields_set
            and "credit_limit_interval" not in payload.model_fields_set
        )

        next_kind = (
            TeamCreditLimitKind.UNLIMITED
            if legacy_unlimited_request
            else TeamCreditLimitKind.FIXED
            if legacy_fixed_request
            else payload.credit_limit_kind
            if "credit_limit_kind" in payload.model_fields_set
            else _resolve_credit_limit_kind(membership)
        )
        next_limit = (
            payload.credit_limit
            if "credit_limit" in payload.model_fields_set
            else membership.credit_limit
        )
        next_interval = (
            payload.credit_limit_interval
            if "credit_limit_interval" in payload.model_fields_set
            else membership.credit_limit_interval
        )

        if next_kind == TeamCreditLimitKind.UNLIMITED:
            membership.credit_limit = None
            membership.credit_limit_kind = TeamCreditLimitKind.UNLIMITED
            membership.credit_limit_interval = None
        elif next_kind == TeamCreditLimitKind.FIXED:
            if next_limit is None:
                raise HTTPException(status_code=400, detail="credit_limit is required for fixed limits")
            membership.credit_limit = next_limit
            membership.credit_limit_kind = TeamCreditLimitKind.FIXED
            membership.credit_limit_interval = None
        else:
            if next_limit is None:
                raise HTTPException(status_code=400, detail="credit_limit is required for recurring limits")
            membership.credit_limit = next_limit
            membership.credit_limit_kind = TeamCreditLimitKind.RECURRING
            membership.credit_limit_interval = next_interval or TeamCreditLimitInterval.MONTHLY

    session.add(membership)
    await session.commit()
    await session.refresh(membership)

    fixed_usage_by_user_id = await _get_team_credit_usage_by_user(session, team_id)
    recurring_daily_usage_by_user_id = await _get_team_credit_usage_by_user_since(
        session,
        team_id,
        _current_day_start(),
    )
    recurring_weekly_usage_by_user_id = await _get_team_credit_usage_by_user_since(
        session,
        team_id,
        _current_week_start(),
    )
    recurring_monthly_usage_by_user_id = await _get_team_credit_usage_by_user_since(
        session,
        team_id,
        _current_month_start(),
    )
    return _to_team_member_response(
        membership,
        user,
        fixed_credits_used=fixed_usage_by_user_id.get(user.id, 0),
        recurring_daily_credits_used=recurring_daily_usage_by_user_id.get(user.id, 0),
        recurring_weekly_credits_used=recurring_weekly_usage_by_user_id.get(user.id, 0),
        recurring_monthly_credits_used=recurring_monthly_usage_by_user_id.get(user.id, 0),
    )


@router.delete("/{team_id}/members/{user_id}", status_code=204)
async def remove_team_member(
    team_id: UUID,
    user_id: UUID,
    session: DbSession,
    current_user: CurrentActiveUser,
):
    team = await require_folder_access(session, team_id, current_user, not_found_detail="Team not found")
    current_role = await _resolve_current_role(session, team, current_user)
    if not _can_manage_team(current_role, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot remove yourself from the team")

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
    if membership.role == TeamRoleEnum.OWNER:
        raise HTTPException(status_code=400, detail="Team owner cannot be removed")

    await session.delete(membership)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{team_id}/leave", status_code=204)
async def leave_team(
    team_id: UUID,
    session: DbSession,
    current_user: CurrentActiveUser,
):
    team = await require_folder_access(session, team_id, current_user, not_found_detail="Team not found")
    current_role = await _resolve_current_role(session, team, current_user)
    if current_role == TeamRoleEnum.OWNER and team.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Team owner must dissolve the team instead")

    membership = await get_team_membership(session, team_id, current_user.id)
    if not membership:
        raise HTTPException(status_code=404, detail="Team membership not found")

    await session.delete(membership)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{team_id}/search-users", response_model=list[TeamUserSearchResponse], status_code=200)
async def search_team_users(
    team_id: UUID,
    session: DbSession,
    current_user: CurrentActiveUser,
    query: str = Query(default="", min_length=1, max_length=120),
):
    team = await require_folder_access(session, team_id, current_user, not_found_detail="Team not found")
    current_role = await _resolve_current_role(session, team, current_user)
    if not _can_manage_team(current_role, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")

    normalized_query = query.strip().lower()
    if not normalized_query:
        return []

    memberships = (
        await session.exec(select(TeamMembership).where(TeamMembership.folder_id == team_id))
    ).all()
    membership_by_user_id = {membership.user_id: membership.role for membership in memberships}

    rows = (
        await session.exec(
            select(User)
            .where(
                User.is_active == True,  # noqa: E712
                or_(
                    func.lower(User.username).like(f"%{normalized_query}%"),
                    func.lower(User.nickname).like(f"%{normalized_query}%"),
                ),
            )
            .order_by(User.nickname.asc(), User.username.asc())
            .limit(20)
        )
    ).all()

    return [
        TeamUserSearchResponse(
            user_id=user.id,
            username=user.username,
            nickname=user.nickname,
            email=user.username,
            profile_image=user.profile_image,
            is_current_user=user.id == current_user.id,
            is_member=user.id in membership_by_user_id,
            role=membership_by_user_id.get(user.id),
        )
        for user in rows
    ]


@router.post("/{team_id}/invite", response_model=TeamMemberResponse, status_code=201)
async def invite_team_member(
    team_id: UUID,
    payload: InviteTeamMemberRequest,
    session: DbSession,
    current_user: CurrentActiveUser,
):
    team = await require_folder_access(session, team_id, current_user, not_found_detail="Team not found")
    current_role = await _resolve_current_role(session, team, current_user)
    if not _can_manage_team(current_role, current_user):
        raise HTTPException(status_code=403, detail="Permission denied")
    if payload.role == TeamRoleEnum.OWNER:
        raise HTTPException(status_code=400, detail="Team owner role cannot be assigned")
    if payload.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You are already in this team")

    user = (
        await session.exec(
            select(User).where(
                User.id == payload.user_id,
                User.is_active == True,  # noqa: E712
            )
        )
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing_membership = await get_team_membership(session, team_id, user.id)
    if existing_membership:
        raise HTTPException(status_code=400, detail="User is already in this team")

    membership = await ensure_team_membership(
        session,
        folder_id=team_id,
        user_id=user.id,
        role=payload.role,
    )
    await _create_team_invitation_notification(
        session=session,
        team=team,
        invited_user=user,
        inviter=current_user,
    )
    await session.commit()
    await session.refresh(membership)

    return _to_team_member_response(membership, user)
