"""Tests for GroqLLMClient, KeyPool, and failure class isolation."""

import asyncio
import json
import os
from collections.abc import AsyncIterator

import httpx
import pytest
import respx
from pydantic import SecretStr

from modelfit.core.config import Settings
from modelfit.core.errors import AppError
from modelfit.modules.chat.groq_client import (
    CHAT_COMPLETIONS_ENDPOINT,
    GroqLLMClient,
    parse_retry_after,
)
from modelfit.modules.chat.key_pool import (
    AllKeysCoolingError,
    AllKeysDisabledError,
    KeyPool,
)
from modelfit.modules.chat.llm_client import StreamChunk


@pytest.fixture
def sample_keys() -> list[SecretStr]:
    return [
        SecretStr("gsk_key_zero_secret_123"),
        SecretStr("gsk_key_one_secret_456"),
        SecretStr("gsk_key_two_secret_789"),
    ]


@pytest.mark.asyncio
async def test_key_pool_round_robin_order(sample_keys: list[SecretStr]) -> None:
    """Verifies round-robin cycling across active keys."""
    pool = KeyPool(sample_keys)
    assert pool.total_keys == 3

    idx0, k0 = await pool.get_next_key()
    idx1, k1 = await pool.get_next_key()
    idx2, k2 = await pool.get_next_key()
    idx3, k3 = await pool.get_next_key()

    assert idx0 == 0 and k0.get_secret_value() == "gsk_key_zero_secret_123"
    assert idx1 == 1 and k1.get_secret_value() == "gsk_key_one_secret_456"
    assert idx2 == 2 and k2.get_secret_value() == "gsk_key_two_secret_789"
    assert idx3 == 0 and k3.get_secret_value() == "gsk_key_zero_secret_123"


@pytest.mark.asyncio
async def test_key_pool_429_cooldown_and_recovery() -> None:
    """Verifies that 429 sets cooldown and key becomes available once cooldown expires."""
    keys = [SecretStr("key_a"), SecretStr("key_b")]
    pool = KeyPool(keys)

    # First call gets key_a (idx 0)
    idx, _ = await pool.get_next_key()
    assert idx == 0

    # Report 429 with 0.1s cooldown
    await pool.report_429(0, retry_after=0.1)

    # Immediate next selection must skip key_a and return key_b (idx 1)
    idx, _ = await pool.get_next_key()
    assert idx == 1

    # While still in cooldown, another call should still return key_b
    idx, _ = await pool.get_next_key()
    assert idx == 1

    # Wait for cooldown to expire
    await asyncio.sleep(0.12)

    # Key_a should be recovered to active status
    idx, _ = await pool.get_next_key()
    assert idx == 0


@pytest.mark.asyncio
async def test_key_pool_401_disables_key_permanently() -> None:
    """Verifies that 401 permanently disables a key for the process lifetime."""
    keys = [SecretStr("key_a"), SecretStr("key_b")]
    pool = KeyPool(keys)

    # Disable key 0 on 401
    await pool.report_401(0)

    # Subsequent selections must only ever return key 1
    for _ in range(4):
        idx, _ = await pool.get_next_key()
        assert idx == 1


@pytest.mark.asyncio
async def test_key_pool_all_cooling_raises_error() -> None:
    """Verifies that AllKeysCoolingError is raised when every key is cooling."""
    keys = [SecretStr("key_a"), SecretStr("key_b")]
    pool = KeyPool(keys)

    await pool.report_429(0, retry_after=5.0)
    await pool.report_429(1, retry_after=10.0)

    with pytest.raises(AllKeysCoolingError) as exc_info:
        await pool.get_next_key()
    assert exc_info.value.wait_seconds > 0.0


@pytest.mark.asyncio
async def test_key_pool_all_disabled_raises_error() -> None:
    """Verifies that AllKeysDisabledError is raised when every key is disabled."""
    keys = [SecretStr("key_a"), SecretStr("key_b")]
    pool = KeyPool(keys)

    await pool.report_401(0)
    await pool.report_401(1)

    with pytest.raises(AllKeysDisabledError):
        await pool.get_next_key()


def test_parse_retry_after() -> None:
    assert parse_retry_after("5") == 5.0
    assert parse_retry_after("2.5") == 2.5
    assert parse_retry_after(None) is None
    assert parse_retry_after("invalid") is None
    assert parse_retry_after("-1") == 0.0


@pytest.mark.asyncio
@respx.mock
async def test_groq_429_failover_to_next_key(sample_keys: list[SecretStr]) -> None:
    """Verifies failover to the next active key when the first returns 429."""
    pool = KeyPool(sample_keys)
    client = GroqLLMClient(key_pool=pool)
    client.model = "llama-3.3-70b-versatile"

    # Route: first key (key_zero) returns 429 with Retry-After: 6
    # second key (key_one) returns 200 with SSE stream
    def response_side_effect(request: httpx.Request) -> httpx.Response:
        auth_header = request.headers.get("Authorization", "")
        if "gsk_key_zero_secret_123" in auth_header:
            return httpx.Response(429, headers={"Retry-After": "6"}, text="Rate limit exceeded")
        if "gsk_key_one_secret_456" in auth_header:
            sse_content = (
                'data: {"choices":[{"delta":{"content":"Hello from "}}]}\n\n'
                'data: {"choices":[{"delta":{"content":"Groq!"}}]}\n\n'
                "data: [DONE]\n\n"
            )
            return httpx.Response(200, text=sse_content)
        return httpx.Response(500)

    respx.post(CHAT_COMPLETIONS_ENDPOINT).mock(side_effect=response_side_effect)

    chunks: list[StreamChunk] = []
    async for chunk in client.generate_stream(
        contents=[{"role": "user", "content": "Hi"}],
        system_prompt="Test",
    ):
        chunks.append(chunk)

    full_text = "".join(c.text for c in chunks if c.text)
    assert full_text == "Hello from Groq!"


@pytest.mark.asyncio
@respx.mock
async def test_groq_401_disables_key_and_fails_over(sample_keys: list[SecretStr]) -> None:
    """Verifies that 401 disables the key and rotates to the next available key."""
    pool = KeyPool(sample_keys)
    client = GroqLLMClient(key_pool=pool)
    client.model = "llama-3.3-70b-versatile"

    def response_side_effect(request: httpx.Request) -> httpx.Response:
        auth_header = request.headers.get("Authorization", "")
        if "gsk_key_zero_secret_123" in auth_header:
            return httpx.Response(401, text='{"error":{"message":"Invalid API Key"}}')
        sse_text = (
            'data: {"choices":[{"delta":{"content":"Success with key 1"}}]}\n\n'
            "data: [DONE]\n\n"
        )
        return httpx.Response(200, text=sse_text)

    respx.post(CHAT_COMPLETIONS_ENDPOINT).mock(side_effect=response_side_effect)

    chunks = []
    async for chunk in client.generate_stream(
        contents=[{"role": "user", "content": "Test"}],
        system_prompt="Test",
    ):
        chunks.append(chunk)

    assert "".join(c.text for c in chunks if c.text) == "Success with key 1"
    # Key 0 must now be marked disabled in the pool
    assert pool._entries[0].status == "disabled"


@pytest.mark.asyncio
@respx.mock
async def test_groq_403_returns_non_retryable_error_immediately(
    sample_keys: list[SecretStr],
) -> None:
    """403 Forbidden must NOT disable keys and must NOT loop through all keys."""
    pool = KeyPool(sample_keys)
    client = GroqLLMClient(key_pool=pool)
    client.model = "llama-3.3-70b-versatile"

    call_count = 0

    def response_side_effect(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(403, text='{"error":{"message":"Model access restricted"}}')

    respx.post(CHAT_COMPLETIONS_ENDPOINT).mock(side_effect=response_side_effect)

    with pytest.raises(AppError) as exc_info:
        async for _ in client.generate_stream(
            contents=[{"role": "user", "content": "Test"}],
            system_prompt="Test",
        ):
            pass

    assert exc_info.value.code == "LLM_AUTH_ERROR"
    assert "403 Forbidden" in exc_info.value.message
    # Must stop immediately: call_count must be exactly 1
    assert call_count == 1
    # Key 0 must NOT be marked disabled
    assert pool._entries[0].status == "active"


@pytest.mark.asyncio
@respx.mock
async def test_groq_two_429s_in_same_turn_stops_rotation(sample_keys: list[SecretStr]) -> None:
    """If 2 distinct keys return 429 in the same turn, stop rotating and return LLM_RATE_LIMITED."""
    pool = KeyPool(sample_keys)
    client = GroqLLMClient(key_pool=pool)
    client.model = "llama-3.3-70b-versatile"

    call_count = 0

    def response_side_effect(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(429, headers={"Retry-After": "4"}, text="Rate limit exceeded")

    respx.post(CHAT_COMPLETIONS_ENDPOINT).mock(side_effect=response_side_effect)

    with pytest.raises(AppError) as exc_info:
        async for _ in client.generate_stream(
            contents=[{"role": "user", "content": "Test"}],
            system_prompt="Test",
        ):
            pass

    assert exc_info.value.code == "LLM_RATE_LIMITED"
    # Even though 3 keys exist in the pool, rotation stopped after 2 keys returned 429
    assert call_count == 2


@pytest.mark.asyncio
@respx.mock
async def test_groq_mid_stream_failure_does_not_rotate_or_retry(
    sample_keys: list[SecretStr],
) -> None:
    """If any chunk has already been yielded, mid-stream disconnects must NEVER rotate or retry."""
    pool = KeyPool(sample_keys)
    client = GroqLLMClient(key_pool=pool)
    client.model = "llama-3.3-70b-versatile"

    call_count = 0

    class BrokenStreamIterator(httpx.AsyncByteStream):
        def __init__(self) -> None:
            self.lines = [
                b'data: {"choices":[{"delta":{"content":"First partial token"}}]}\n\n',
            ]
            self.index = 0

        async def __aiter__(self) -> AsyncIterator[bytes]:
            for line in self.lines:
                yield line
            raise httpx.ReadTimeout("Connection dropped mid-stream")

    def response_side_effect(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(200, stream=BrokenStreamIterator())

    respx.post(CHAT_COMPLETIONS_ENDPOINT).mock(side_effect=response_side_effect)

    yielded_chunks: list[StreamChunk] = []
    with pytest.raises(AppError) as exc_info:
        async for chunk in client.generate_stream(
            contents=[{"role": "user", "content": "Test"}],
            system_prompt="Test",
        ):
            yielded_chunks.append(chunk)

    assert len(yielded_chunks) == 1
    assert yielded_chunks[0].text == "First partial token"
    assert exc_info.value.code == "LLM_NETWORK_ERROR"
    assert "mid-stream" in exc_info.value.message
    # No failover to key 1 occurred
    assert call_count == 1


@pytest.mark.asyncio
@respx.mock
async def test_groq_single_key_transient_503_retry() -> None:
    """Verifies transient 503 retries with backoff succeed even with a single key."""
    single_key = [SecretStr("only_single_key")]
    pool = KeyPool(single_key)
    client = GroqLLMClient(key_pool=pool)
    client.model = "llama-3.3-70b-versatile"

    attempts = 0

    def response_side_effect(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(503, text="Service Temporarily Unavailable")
        sse_text = (
            'data: {"choices":[{"delta":{"content":"Recovered from 503"}}]}\n\n'
            "data: [DONE]\n\n"
        )
        return httpx.Response(200, text=sse_text)

    respx.post(CHAT_COMPLETIONS_ENDPOINT).mock(side_effect=response_side_effect)

    chunks = []
    async for chunk in client.generate_stream(
        contents=[{"role": "user", "content": "Test"}],
        system_prompt="Test",
    ):
        chunks.append(chunk)

    assert attempts == 2
    assert "".join(c.text for c in chunks if c.text) == "Recovered from 503"


@pytest.mark.asyncio
@respx.mock
async def test_groq_single_key_network_timeout_retry() -> None:
    """Verifies network timeout retries with backoff succeed even with a single key."""
    single_key = [SecretStr("only_single_key")]
    pool = KeyPool(single_key)
    client = GroqLLMClient(key_pool=pool)
    client.model = "llama-3.3-70b-versatile"

    attempts = 0

    def response_side_effect(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise httpx.ConnectTimeout("Connect timeout")
        sse_text = (
            'data: {"choices":[{"delta":{"content":"Connected on attempt 2"}}]}\n\n'
            "data: [DONE]\n\n"
        )
        return httpx.Response(200, text=sse_text)

    respx.post(CHAT_COMPLETIONS_ENDPOINT).mock(side_effect=response_side_effect)

    chunks = []
    async for chunk in client.generate_stream(
        contents=[{"role": "user", "content": "Test"}],
        system_prompt="Test",
    ):
        chunks.append(chunk)

    assert attempts == 2
    assert "".join(c.text for c in chunks if c.text) == "Connected on attempt 2"


@pytest.mark.asyncio
@respx.mock
async def test_groq_reasoning_field_ignored(sample_keys: list[SecretStr]) -> None:
    """Verifies that delta.reasoning / reasoning_content is ignored and not yielded to users."""
    pool = KeyPool(sample_keys)
    client = GroqLLMClient(key_pool=pool)
    client.model = "openai/gpt-oss-120b"

    sse_data = (
        'data: {"choices":[{"delta":{"reasoning":"Secret thinking...","content":"Answer"}}]}\n\n'
        'data: {"choices":[{"delta":{"reasoning_content":"More internal reasoning"}}]}\n\n'
        'data: {"choices":[{"delta":{"content":" is 42."}}]}\n\n'
        "data: [DONE]\n\n"
    )
    respx.post(CHAT_COMPLETIONS_ENDPOINT).mock(return_value=httpx.Response(200, text=sse_data))

    chunks = []
    async for chunk in client.generate_stream(
        contents=[{"role": "user", "content": "Calculate"}],
        system_prompt="Test",
    ):
        chunks.append(chunk)

    full_text = "".join(c.text for c in chunks if c.text)
    assert full_text == "Answer is 42."
    assert "Secret thinking" not in full_text
    assert "internal reasoning" not in full_text


@pytest.mark.asyncio
@respx.mock
async def test_groq_tool_calling_round_trip(sample_keys: list[SecretStr]) -> None:
    """Verifies that streamed tool calls are accumulated and yielded as FunctionCallInfo."""
    pool = KeyPool(sample_keys)
    client = GroqLLMClient(key_pool=pool)
    client.model = "llama-3.3-70b-versatile"

    chunk1 = {
        "choices": [{
            "delta": {
                "tool_calls": [{
                    "index": 0,
                    "id": "call_abc",
                    "type": "function",
                    "function": {"name": "estimate_memory", "arguments": '{"model_id": '},
                }]
            }
        }]
    }
    chunk2 = {
        "choices": [{
            "delta": {
                "tool_calls": [{
                    "index": 0,
                    "function": {"arguments": '"meta-llama/Llama-3-8B"}'},
                }]
            }
        }]
    }
    sse_data = (
        f"data: {json.dumps(chunk1)}\n\n"
        f"data: {json.dumps(chunk2)}\n\n"
        "data: [DONE]\n\n"
    )
    respx.post(CHAT_COMPLETIONS_ENDPOINT).mock(return_value=httpx.Response(200, text=sse_data))

    chunks = []
    async for chunk in client.generate_stream(
        contents=[{"role": "user", "content": "Estimate Llama 3"}],
        system_prompt="Test",
        tools=[{"name": "estimate_memory", "description": "Estimate memory", "parameters": {}}],
    ):
        chunks.append(chunk)

    tool_chunks = [c for c in chunks if c.function_calls]
    assert len(tool_chunks) == 1
    assert tool_chunks[0].function_calls is not None
    fc = tool_chunks[0].function_calls[0]
    assert fc.name == "estimate_memory"
    assert fc.call_id == "call_abc"
    assert fc.args == {"model_id": "meta-llama/Llama-3-8B"}


@pytest.mark.asyncio
@respx.mock
async def test_groq_malformed_tool_args_handled_safely(sample_keys: list[SecretStr]) -> None:
    """Malformed JSON in tool arguments must not raise JSONDecodeError."""
    pool = KeyPool(sample_keys)
    client = GroqLLMClient(key_pool=pool)
    client.model = "llama-3.3-70b-versatile"

    sse_data = (
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_err",'
        '"type":"function","function":{"name":"search_models",'
        '"arguments":"{invalid_json:"}}]}}]}\n\n'
        "data: [DONE]\n\n"
    )
    respx.post(CHAT_COMPLETIONS_ENDPOINT).mock(return_value=httpx.Response(200, text=sse_data))

    chunks = []
    async for chunk in client.generate_stream(
        contents=[{"role": "user", "content": "Search"}],
        system_prompt="Test",
        tools=[{"name": "search_models", "description": "Search", "parameters": {}}],
    ):
        chunks.append(chunk)

    tool_chunks = [c for c in chunks if c.function_calls]
    assert len(tool_chunks) == 1
    assert tool_chunks[0].function_calls is not None
    fc = tool_chunks[0].function_calls[0]
    assert fc.name == "search_models"
    assert "_malformed_arguments" in fc.args
    assert fc.args["_malformed_arguments"] == "{invalid_json:"


@pytest.mark.asyncio
@respx.mock
async def test_groq_no_secrets_in_logs_or_errors(
    sample_keys: list[SecretStr],
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Verifies that API keys are strictly never logged in error outputs."""
    pool = KeyPool(sample_keys)
    client = GroqLLMClient(key_pool=pool)
    client.model = "llama-3.3-70b-versatile"

    secret_str = sample_keys[0].get_secret_value()

    respx.post(CHAT_COMPLETIONS_ENDPOINT).mock(
        return_value=httpx.Response(500, text=f"Internal crash with key {secret_str}")
    )

    with pytest.raises(AppError):
        async for _ in client.generate_stream(
            contents=[{"role": "user", "content": "Crash"}],
            system_prompt="Test",
        ):
            pass

    # Ensure secret string never appeared in log capture
    assert secret_str not in caplog.text


@pytest.mark.skipif(
    not os.getenv("RUN_GROQ_LIVE_TEST"),
    reason="Skipped by default; set RUN_GROQ_LIVE_TEST=1 and LLM_API_KEYS to run live smoke test",
)
@pytest.mark.asyncio
async def test_groq_live_smoke() -> None:
    """Optional live smoke test against Groq's production API."""
    Settings()
    client = GroqLLMClient()
    chunks = []
    async for chunk in client.generate_stream(
        contents=[{"role": "user", "content": "Reply with 'OK'."}],
        system_prompt="You are a test assistant.",
    ):
        chunks.append(chunk)
    text = "".join(c.text for c in chunks if c.text)
    assert len(text) > 0
