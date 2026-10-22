"""Tests for health check and metadata endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import AsyncMock, patch

from modelfit.db.session import get_db
from modelfit.main import create_app


@pytest.mark.asyncio
async def test_health_live(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health/live")
    assert response.status_code == 200
    data = response.json()
    assert data == {"status": "live"}
    assert "x-request-id" in response.headers


@pytest.mark.asyncio
async def test_health_ready_success(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["database"] == "connected"


@pytest.mark.asyncio
async def test_health_ready_db_failure() -> None:
    """When the DB is unreachable, /health/ready must return a 503 error envelope."""
    app = create_app()

    mock_session = AsyncMock(spec=AsyncSession)
    mock_session.execute.side_effect = ConnectionRefusedError("Database connection refused")

    async def override_failing_db() -> AsyncSession:
        return mock_session

    app.dependency_overrides[get_db] = override_failing_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/api/v1/health/ready")

    assert response.status_code == 503
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "DATABASE_UNAVAILABLE"
    assert "request_id" in data["error"]


@pytest.mark.asyncio
async def test_meta(client: AsyncClient) -> None:
    response = await client.get("/api/v1/meta")
    assert response.status_code == 200
    data = response.json()
    assert "version" in data
    assert "git_sha" in data
    assert "environment" in data
