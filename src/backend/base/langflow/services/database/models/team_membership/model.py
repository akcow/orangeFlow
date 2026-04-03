from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from uuid import UUID, uuid4

from pydantic import field_serializer
from sqlalchemy import Enum as SQLEnum
from sqlalchemy import Column, DateTime, UniqueConstraint, text
from sqlmodel import Field, SQLModel


class TeamRoleEnum(str, Enum):
    OWNER = "OWNER"
    ADMIN = "ADMIN"
    MEMBER = "MEMBER"


class TeamCreditLimitKind(str, Enum):
    UNLIMITED = "UNLIMITED"
    RECURRING = "RECURRING"
    FIXED = "FIXED"


class TeamCreditLimitInterval(str, Enum):
    DAILY = "DAILY"
    WEEKLY = "WEEKLY"
    MONTHLY = "MONTHLY"


class TeamMembershipBase(SQLModel):
    folder_id: UUID = Field(foreign_key="folder.id", index=True)
    user_id: UUID = Field(foreign_key="user.id", index=True)
    credit_limit: int | None = Field(default=None, nullable=True)
    credit_limit_kind: TeamCreditLimitKind = Field(
        default=TeamCreditLimitKind.UNLIMITED,
        sa_column=Column(
            SQLEnum(
                TeamCreditLimitKind,
                name="team_credit_limit_kind_enum",
                values_callable=lambda enum: [member.value for member in enum],
            ),
            nullable=False,
            server_default=text("'UNLIMITED'"),
        ),
    )
    credit_limit_interval: TeamCreditLimitInterval | None = Field(
        default=None,
        sa_column=Column(
            SQLEnum(
                TeamCreditLimitInterval,
                name="team_credit_limit_interval_enum",
                values_callable=lambda enum: [member.value for member in enum],
            ),
            nullable=True,
        ),
    )
    role: TeamRoleEnum = Field(
        default=TeamRoleEnum.MEMBER,
        sa_column=Column(
            SQLEnum(
                TeamRoleEnum,
                name="team_role_enum",
                values_callable=lambda enum: [member.value for member in enum],
            ),
            nullable=False,
            server_default=text("'MEMBER'"),
        ),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        sa_column=Column(DateTime(timezone=True), nullable=False, index=True),
    )

    @field_serializer("created_at")
    def _serialize_created_at(self, value: datetime):
        value = value.replace(microsecond=0)
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()


class TeamMembership(TeamMembershipBase, table=True):  # type: ignore[call-arg]
    __tablename__ = "team_membership"
    __table_args__ = (UniqueConstraint("folder_id", "user_id", name="uq_team_membership_folder_user"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)


class TeamMembershipRead(TeamMembershipBase):
    id: UUID
