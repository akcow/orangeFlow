from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from langflow.gateway.model_catalog import serialize_gateway_model_catalog
from langflow.services.auth.utils import get_current_active_superuser
from langflow.services.deps import get_settings_service
from lfx.utils.provider_relays import (
    create_provider_relay,
    delete_provider_relay,
    list_provider_relays_for_admin,
    reorder_provider_relays,
    serialize_provider_relay_for_response,
    update_provider_relay,
)

router = APIRouter(
    prefix="/provider-relays",
    tags=["Provider Relays"],
    dependencies=[Depends(get_current_active_superuser)],
)


RelayProvider = Literal[
    "openai",
    "12api",
    "gemini",
    "doubao",
    "dashscope",
    "qwen",
    "sora",
    "veo",
    "vidu",
    "kling",
    "jimeng",
]
RelayServiceType = Literal["any", "text", "image", "video", "audio"]


class ProviderRelayCreate(BaseModel):
    name: str = Field(..., description="Display name for the relay config")
    service_type: RelayServiceType = Field(default="any")
    provider: RelayProvider
    base_url: str | None = Field(default=None)
    api_key: str | None = Field(default=None)
    access_key: str | None = Field(default=None)
    secret_key: str | None = Field(default=None)
    model_patterns: list[str] = Field(default_factory=list)
    priority: int = Field(default=100)
    enabled: bool = Field(default=True)
    is_default: bool = Field(default=False)


class ProviderRelayUpdate(BaseModel):
    name: str | None = None
    service_type: RelayServiceType | None = None
    provider: RelayProvider | None = None
    base_url: str | None = None
    api_key: str | None = None
    access_key: str | None = None
    secret_key: str | None = None
    model_patterns: list[str] | None = None
    priority: int | None = None
    enabled: bool | None = None
    is_default: bool | None = None


class ProviderRelayResponse(BaseModel):
    id: str
    name: str
    service_type: RelayServiceType
    provider: RelayProvider
    base_url: str | None
    api_key_present: bool
    api_key_masked: str | None
    access_key_present: bool = False
    access_key_masked: str | None = None
    secret_key_present: bool = False
    secret_key_masked: str | None = None
    model_patterns: list[str]
    priority: int
    enabled: bool
    is_default: bool
    created_at: str | None = None
    updated_at: str | None = None
    managed_via: str = "relay"
    system_default: bool = False
    credential_provider: str | None = None
    deletable: bool = True
    reorderable: bool = True
    editable_fields: list[str] | None = None


class ProviderRelayModelCatalogItem(BaseModel):
    id: str
    full_name: str
    model_type: str
    owned_by: str
    relay_provider: RelayProvider
    relay_service_type: RelayServiceType


class DeleteProviderRelayResponse(BaseModel):
    id: str
    deleted: bool


class ProviderRelayReorderPayload(BaseModel):
    relay_ids: list[str]


def _serialize_many(relays):
    return [ProviderRelayResponse(**serialize_provider_relay_for_response(relay)) for relay in relays]


@router.get("", response_model=list[ProviderRelayResponse])
@router.get("/", response_model=list[ProviderRelayResponse])
def get_provider_relays_handler() -> list[ProviderRelayResponse]:
    try:
        settings_service = get_settings_service()
        relays = list_provider_relays_for_admin(
            settings_service.settings.config_dir,
            include_secrets=True,
        )
        return _serialize_many(relays)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/model-catalog", response_model=list[ProviderRelayModelCatalogItem])
def get_provider_relay_model_catalog_handler() -> list[ProviderRelayModelCatalogItem]:
    try:
        return [ProviderRelayModelCatalogItem(**item) for item in serialize_gateway_model_catalog()]
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("", response_model=ProviderRelayResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ProviderRelayResponse, status_code=status.HTTP_201_CREATED)
def create_provider_relay_handler(payload: ProviderRelayCreate) -> ProviderRelayResponse:
    try:
        settings_service = get_settings_service()
        relay = create_provider_relay(payload.model_dump(), settings_service.settings.config_dir)
        return ProviderRelayResponse(**serialize_provider_relay_for_response(relay))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/reorder", response_model=list[ProviderRelayResponse])
def reorder_provider_relays_handler(payload: ProviderRelayReorderPayload) -> list[ProviderRelayResponse]:
    try:
        settings_service = get_settings_service()
        relays = reorder_provider_relays(payload.relay_ids, settings_service.settings.config_dir)
        return _serialize_many(relays)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.patch("/{relay_id}", response_model=ProviderRelayResponse)
def update_provider_relay_handler(relay_id: str, payload: ProviderRelayUpdate) -> ProviderRelayResponse:
    try:
        settings_service = get_settings_service()
        relay = update_provider_relay(
            relay_id,
            payload.model_dump(exclude_unset=True),
            settings_service.settings.config_dir,
        )
        return ProviderRelayResponse(**serialize_provider_relay_for_response(relay))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Relay config not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.delete("/{relay_id}", response_model=DeleteProviderRelayResponse)
def delete_provider_relay_handler(relay_id: str) -> DeleteProviderRelayResponse:
    try:
        settings_service = get_settings_service()
        deleted = delete_provider_relay(relay_id, settings_service.settings.config_dir)
        if not deleted:
            raise HTTPException(status_code=404, detail="Relay config not found")
        return DeleteProviderRelayResponse(id=relay_id, deleted=True)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc
