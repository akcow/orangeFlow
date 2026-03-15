from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

from pydantic import BaseModel, field_validator, model_validator
from sqlalchemy import JSON, Column
from sqlmodel import Field, Relationship, SQLModel

from langflow.schema.serialize import UUIDstr

if TYPE_CHECKING:
    from langflow.services.database.models.api_key.model import ApiKey
    from langflow.services.database.models.flow.model import Flow
    from langflow.services.database.models.folder.model import Folder
    from langflow.services.database.models.variable.model import Variable


class UserOptin(BaseModel):
    github_starred: bool = Field(default=False)
    dialog_dismissed: bool = Field(default=False)
    discord_clicked: bool = Field(default=False)
    # Add more opt-in actions as needed


class User(SQLModel, table=True):  # type: ignore[call-arg]
    id: UUIDstr = Field(default_factory=uuid4, primary_key=True, unique=True)
    username: str = Field(index=True, unique=True)
    nickname: str = Field(index=True, unique=True)
    password: str = Field()
    profile_image: str | None = Field(default=None, nullable=True)
    is_active: bool = Field(default=False)
    is_superuser: bool = Field(default=False)
    is_reviewer: bool = Field(default=False)
    create_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_login_at: datetime | None = Field(default=None, nullable=True)
    api_keys: list["ApiKey"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "delete"},
    )
    store_api_key: str | None = Field(default=None, nullable=True)
    flows: list["Flow"] = Relationship(back_populates="user")
    variables: list["Variable"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "delete"},
    )
    folders: list["Folder"] = Relationship(
        back_populates="user",
        sa_relationship_kwargs={"cascade": "delete"},
    )
    optins: dict[str, Any] | None = Field(
        sa_column=Column(JSON, default=lambda: UserOptin().model_dump(), nullable=True)
    )

    @model_validator(mode="before")
    @classmethod
    def default_nickname_to_username(cls, data):
        if isinstance(data, dict) and not data.get("nickname") and data.get("username"):
            data["nickname"] = data["username"]
        return data


class UserCreate(SQLModel):
    username: str = Field()
    nickname: str = Field()
    password: str = Field()
    optins: dict[str, Any] | None = Field(
        default={"github_starred": False, "dialog_dismissed": False, "discord_clicked": False}
    )

    @field_validator("username", "nickname")
    @classmethod
    def validate_identity_fields(cls, value: str) -> str:
        value = value.strip()
        if not value:
            msg = "This field cannot be empty."
            raise ValueError(msg)
        return value

    @field_validator("username")
    @classmethod
    def validate_username_as_email(cls, value: str) -> str:
        if value.lower() == "admin":
            return value
        import re
        if not re.match(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$", value):
            raise ValueError("Please provide a valid email address.")
        return value


class UserRead(SQLModel):
    id: UUID = Field(default_factory=uuid4)
    username: str = Field()
    nickname: str = Field()
    profile_image: str | None = Field()
    store_api_key: str | None = Field(nullable=True)
    is_active: bool = Field()
    is_superuser: bool = Field()
    is_reviewer: bool = Field(default=False)
    create_at: datetime = Field()
    updated_at: datetime = Field()
    last_login_at: datetime | None = Field(nullable=True)
    optins: dict[str, Any] | None = Field(default=None)


class UserUpdate(SQLModel):
    username: str | None = None
    nickname: str | None = None
    profile_image: str | None = None
    password: str | None = None
    is_active: bool | None = None
    is_superuser: bool | None = None
    is_reviewer: bool | None = None
    last_login_at: datetime | None = None
    optins: dict[str, Any] | None = None

    @field_validator("username", "nickname")
    @classmethod
    def validate_optional_identity_fields(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            msg = "This field cannot be empty."
            raise ValueError(msg)
        return value

    @field_validator("username")
    @classmethod
    def validate_username_as_email(cls, value: str | None) -> str | None:
        if value is None or value.lower() == "admin":
            return value
        import re
        if not re.match(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$", value):
            raise ValueError("Please provide a valid email address.")
        return value
