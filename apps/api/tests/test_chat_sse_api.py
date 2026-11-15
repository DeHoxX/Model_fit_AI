"""Integration tests for POST /api/v1/chat SSE endpoint."""

import pytest
from httpx import ASGITransport, AsyncClient

from modelfit.main import create_app


@pytest.mark.asyncio
async def test_chat_sse_stream_success() -> None:
    """Verifies that POST /api/v1/chat returns text/event-stream with token and done events."""
    app = create_app()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/chat",
            json={"messages": [{"role": "user", "content": "Hello advisor!"}]},
        )
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")

        lines = resp.text.split("\n")
        events = [line.replace("event: ", "") for line in lines if line.startswith("event: ")]
        assert "token" in events
        assert "done" in events


@pytest.mark.asyncio
async def test_chat_rate_limiting_exceeded() -> None:
    """Verifies that exceeding the 4 req/min limit yields a RATE_LIMITED error event."""
    from modelfit.modules.chat.service import chat_rate_limiter

    # Clear limiter for clean test run
    chat_rate_limiter.reset()

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Send 4 requests (within limit)
        for _ in range(4):
            r = await ac.post(
                "/api/v1/chat",
                json={"messages": [{"role": "user", "content": "Ping"}]},
            )
            assert r.status_code == 200

        # 5th request should trigger rate limit event
        r5 = await ac.post(
            "/api/v1/chat",
            json={"messages": [{"role": "user", "content": "Ping 5"}]},
        )
        assert r5.status_code == 200
        assert "RATE_LIMITED" in r5.text
