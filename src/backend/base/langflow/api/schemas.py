from uuid import UUID

from pydantic import BaseModel


class UploadFileResponse(BaseModel):
    """File upload response schema."""

    id: UUID
    name: str
    # Storage path key, always using forward slashes: "{uuid}/{filename...}".
    path: str
    size: int
    provider: str | None = None
