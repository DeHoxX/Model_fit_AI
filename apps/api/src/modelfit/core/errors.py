"""Standard application errors and error envelope formatting."""

from typing import Any

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    """Base exception class for all operational and application errors."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        self.headers = headers or {}


class DatabaseUnavailableError(AppError):
    def __init__(self, message: str = "Database service is unavailable.") -> None:
        super().__init__(
            code="DATABASE_UNAVAILABLE",
            message=message,
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        )


def make_error_envelope(
    code: str,
    message: str,
    request_id: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Generates the canonical error envelope."""
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details or {},
            "request_id": request_id,
        }
    }


def get_request_id(request: Request) -> str:
    """Helper to extract the active request_id from state."""
    return getattr(request.state, "request_id", "req-unknown")


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    request_id = get_request_id(request)
    envelope = make_error_envelope(
        code=exc.code,
        message=exc.message,
        details=exc.details,
        request_id=request_id,
    )
    return JSONResponse(status_code=exc.status_code, content=envelope, headers=exc.headers)


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    request_id = get_request_id(request)
    details: dict[str, Any] = {"validation_errors": exc.errors()}
    envelope = make_error_envelope(
        code="VALIDATION_ERROR",
        message="Request validation failed.",
        details=details,
        request_id=request_id,
    )
    return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content=envelope)


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    request_id = get_request_id(request)
    code_map: dict[int, str] = {
        404: "NOT_FOUND",
        405: "METHOD_NOT_ALLOWED",
        403: "FORBIDDEN",
        401: "UNAUTHORIZED",
    }
    code = code_map.get(exc.status_code, f"HTTP_{exc.status_code}")
    envelope = make_error_envelope(
        code=code,
        message=str(exc.detail),
        details={},
        request_id=request_id,
    )
    return JSONResponse(status_code=exc.status_code, content=envelope)


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = get_request_id(request)
    # Generic message, never leak raw stack traces to the client
    envelope = make_error_envelope(
        code="INTERNAL_ERROR",
        message="An unexpected server error occurred.",
        details={},
        request_id=request_id,
    )
    return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content=envelope)
