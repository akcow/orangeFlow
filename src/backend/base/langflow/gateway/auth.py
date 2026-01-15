from contextlib import asynccontextmanager
import os
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from langflow.api.utils import DbSession
from langflow.gateway.errors import AuthError
from langflow.services.database.models.api_key.crud import check_key


async def get_hosted_key(
    db: DbSession,
    authorization: Optional[str] = Header(None),
) -> str:
    """
    Validates the Hosted Gateway Key.
    Checks:
    1. Static env var HOSTED_GATEWAY_KEY (Legacy/Dev)
    2. Database for valid ApiKey (User-generated)
    """
    if not authorization:
        raise AuthError(message="缺少 Authorization 请求头")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer":
        raise AuthError(message="认证方式无效（需要 Bearer）")

    # 1. Check Env Var (Master Key)
    expected_key = os.getenv("HOSTED_GATEWAY_KEY")
    if expected_key and token == expected_key:
        return token
    
    # 2. Check Database (User Keys)
    # The token usually starts with "sk-".
    # We reuse Langflow's existing API Key infrastructure.
    user = await check_key(db, token)
    if user:
        return token

    raise AuthError(message="API Key 无效或已过期")
