from __future__ import annotations

import os
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from lfx.utils.provider_credentials import (
    DEFAULT_PROVIDER_KEY,
    ProviderCredentials,
    get_provider_credentials,
    mask_secret,
    save_provider_credentials,
)

from langflow.services.deps import get_settings_service

router = APIRouter(prefix="/provider-credentials", tags=["Provider Credentials"])


class ProviderCredentialField(BaseModel):
    present: bool
    masked: str | None
    source: Literal["saved", "env", "unset"]


class ProviderCredentialsResponse(BaseModel):
    provider: str
    app_id: ProviderCredentialField
    access_token: ProviderCredentialField
    api_key: ProviderCredentialField
    updated_at: str | None = None


class ProviderCredentialsUpdate(BaseModel):
    app_id: str | None = Field(default=None, description="Optional App ID / client identifier")
    access_token: str | None = Field(default=None, description="Optional access token / client secret")
    api_key: str | None = Field(default=None, description="Optional API key")


def _env_mapping(provider: str) -> dict[str, str]:
    provider = provider.lower()
    if provider == "deepseek":
        return {
            "app_id": "DEEPSEEK_APP_ID",
            "access_token": "DEEPSEEK_ACCESS_TOKEN",
            "api_key": "DEEPSEEK_API_KEY",
        }
    if provider == "gemini":
        return {
            "app_id": "GEMINI_APP_ID",
            "access_token": "GEMINI_ACCESS_TOKEN",
            "api_key": "GEMINI_API_KEY",
        }
    if provider in {"dashscope", "dashscope_tts", "qwen_tts"}:
        return {
            "app_id": "TTS_APP_ID",
            "access_token": "TTS_TOKEN",
            "api_key": "DASHSCOPE_API_KEY",
        }
    # default：豆包
    return {
        "app_id": "TTS_APP_ID",
        "access_token": "TTS_TOKEN",
        "api_key": "ARK_API_KEY",
    }


def _resolve_provider(provider: str | None) -> str:
    return (provider or DEFAULT_PROVIDER_KEY).strip() or DEFAULT_PROVIDER_KEY


def _resolve_field(
    stored_value: str | None,
    env_var: str,
) -> ProviderCredentialField:
    env_value = os.getenv(env_var, "")
    if stored_value:
        return ProviderCredentialField(present=True, masked=mask_secret(stored_value), source="saved")
    if env_value:
        return ProviderCredentialField(present=True, masked=mask_secret(env_value), source="env")
    return ProviderCredentialField(present=False, masked=None, source="unset")


def _build_response(
    provider: str,
    creds: ProviderCredentials,
    env_mapping: dict[str, str],
) -> ProviderCredentialsResponse:
    return ProviderCredentialsResponse(
        provider=provider,
        app_id=_resolve_field(creds.app_id, env_mapping["app_id"]),
        access_token=_resolve_field(creds.access_token, env_mapping["access_token"]),
        api_key=_resolve_field(creds.api_key, env_mapping["api_key"]),
        updated_at=creds.updated_at,
    )


@router.get("")
@router.get("/")
def get_default_provider_credentials_handler() -> ProviderCredentialsResponse:
    return get_provider_credentials_handler(DEFAULT_PROVIDER_KEY)


@router.put("")
@router.put("/")
def update_default_provider_credentials_handler(
    payload: ProviderCredentialsUpdate,
) -> ProviderCredentialsResponse:
    return update_provider_credentials_handler(DEFAULT_PROVIDER_KEY, payload)


@router.get("/{provider}")
def get_provider_credentials_handler(provider: str | None) -> ProviderCredentialsResponse:
    provider = _resolve_provider(provider)
    try:
        settings_service = get_settings_service()
        env_mapping = _env_mapping(provider)
        creds = get_provider_credentials(provider, settings_service.settings.config_dir)
        return _build_response(provider, creds, env_mapping)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.put("/{provider}")
def update_provider_credentials_handler(
    provider: str | None,
    payload: ProviderCredentialsUpdate,
) -> ProviderCredentialsResponse:
    provider = _resolve_provider(provider)
    try:
        settings_service = get_settings_service()
        env_mapping = _env_mapping(provider)
        persisted = save_provider_credentials(
            provider=provider,
            payload=payload.model_dump(),
            config_dir=settings_service.settings.config_dir,
        )
        return _build_response(provider, persisted, env_mapping)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc
