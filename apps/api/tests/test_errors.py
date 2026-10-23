"""Tests for error envelope compliance across 404, 422, 500 and security headers."""

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel, Field

from modelfit.core.errors import (
    unhandled_exception_handler,
    validation_error_handler,
)
from modelfit.core.middleware import (
    RequestIDAndLoggingMiddleware,
)


@pytest.mark.asyncio
async def test_404_error_envelope(client: AsyncClient) -> None:
    response = await client.get("/api/v1/non_existent_route")
    assert response.status_code == 404
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "NOT_FOUND"
    assert "request_id" in data["error"]
    assert data["error"]["request_id"] != ""


@pytest.mark.asyncio
async def test_request_id_propagation() -> None:
    app = FastAPI()
    app.add_middleware(RequestIDAndLoggingMiddleware)

    @app.get("/ping")
    async def ping() -> dict[str, str]:
        return {"ping": "pong"}

    transport = ASGITransport(app=app)
    custom_id = "test-custom-request-id-12345"
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/ping", headers={"X-Request-ID": custom_id})

    assert res.headers.get("X-Request-ID") == custom_id


@pytest.mark.asyncio
async def test_security_headers_present(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health/live")
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("X-Frame-Options") == "DENY"
    assert response.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"


@pytest.mark.asyncio
async def test_422_validation_error_envelope() -> None:
    app = FastAPI()
    app.add_middleware(RequestIDAndLoggingMiddleware)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    class ItemPayload(BaseModel):
        num: int = Field(gt=10)

    @app.post("/validate")
    async def validate_item(item: ItemPayload) -> dict[str, int]:
        return {"num": item.num}

    from typing import Any, cast

    from fastapi.exceptions import RequestValidationError

    app.add_exception_handler(RequestValidationError, cast(Any, validation_error_handler))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.post("/validate", json={"num": 3})

    assert res.status_code == 422
    data = res.json()
    assert "error" in data
    assert data["error"]["code"] == "VALIDATION_ERROR"
    assert "validation_errors" in data["error"]["details"]


@pytest.mark.asyncio
async def test_500_internal_error_envelope() -> None:
    app = FastAPI()
    app.add_middleware(RequestIDAndLoggingMiddleware)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    @app.get("/boom")
    async def trigger_boom() -> None:
        raise RuntimeError("Secret internal failure message")

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/boom")

    assert res.status_code == 500
    data = res.json()
    assert "error" in data
    assert data["error"]["code"] == "INTERNAL_ERROR"
    # Never leak stack trace or internal error text
    assert data["error"]["message"] == "An unexpected server error occurred."
    assert "Secret internal failure message" not in res.text
