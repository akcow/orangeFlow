from typing import Any, Optional

from fastapi import HTTPException, status


class GatewayError(HTTPException):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        provider: Optional[str] = None,
        request_id: str = "",
    ):
        super().__init__(status_code=status_code, detail=message)
        self.code = code
        self.message = message
        self.provider = provider
        self.request_id = request_id

    def to_dict(self) -> dict[str, Any]:
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "provider": self.provider,
                "request_id": self.request_id,
            }
        }


class AuthError(GatewayError):
    def __init__(self, message: str = "Invalid Hosted Key", request_id: str = ""):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="PROVIDER_AUTH_FAILED",
            message=message,
            request_id=request_id,
        )


class ModelNotFoundError(GatewayError):
    def __init__(self, model: str, request_id: str = ""):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            code="MODEL_NOT_FOUND",
            message=f"Model '{model}' not found or not supported.",
            request_id=request_id,
        )


class UpstreamError(GatewayError):
    def __init__(self, message: str, provider: str, code: str = "UPSTREAM_ERROR", request_id: str = ""):
        super().__init__(
            status_code=status.HTTP_502_BAD_GATEWAY,
            code=code,
            message=message,
            provider=provider,
            request_id=request_id,
        )
