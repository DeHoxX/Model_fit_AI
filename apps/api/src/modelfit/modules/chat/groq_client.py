"""Groq LLM Client with API key rotation, cooldown, and failure class isolation."""

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

import httpx
import structlog

from modelfit.core.config import settings
from modelfit.core.errors import AppError
from modelfit.modules.chat.key_pool import AllKeysCoolingError, AllKeysDisabledError, KeyPool
from modelfit.modules.chat.llm_client import FunctionCallInfo, LLMClient, StreamChunk

logger = structlog.get_logger(__name__)

GROQ_BASE_URL: str = "https://api.groq.com/openai/v1"
CHAT_COMPLETIONS_ENDPOINT: str = f"{GROQ_BASE_URL}/chat/completions"

# Separate retry bounds
MAX_KEY_FAILOVERS: int = 3
MAX_TRANSIENT_RETRIES: int = 2
MAX_TOTAL_ATTEMPTS: int = 5
TRANSIENT_BACKOFF_SECONDS: float = 0.5


def parse_retry_after(header_val: str | None) -> float | None:
    """Parses Retry-After header as seconds float if present."""
    if not header_val:
        return None
    try:
        val = float(header_val.strip())
        return max(0.0, val)
    except (ValueError, TypeError):
        return None


class GroqLLMClient(LLMClient):
    """Client for Groq Chat Completions API with key rotation and resilient failover."""

    def __init__(self, key_pool: KeyPool | None = None) -> None:
        if key_pool is not None:
            self.key_pool = key_pool
        else:
            keys = settings.llm_api_key_list
            if not keys:
                raise RuntimeError(
                    "At least one Groq API key is required when LLM_PROVIDER=groq. "
                    "Configure LLM_API_KEYS or LLM_API_KEY."
                )
            self.key_pool = KeyPool(keys)

        self.model = settings.LLM_MODEL or ""
        self.connect_timeout = settings.LLM_CONNECT_TIMEOUT_SECONDS
        self.read_timeout = settings.LLM_READ_TIMEOUT_SECONDS

    def _convert_tools(self, tools: list[Any] | None) -> list[dict[str, Any]] | None:
        """Converts ModelFit tool declarations to OpenAI function tool definitions."""
        if not tools:
            return None
        formatted = []
        for t in tools:
            formatted.append({
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t["description"],
                    "parameters": t.get("parameters", {}),
                },
            })
        return formatted

    def _convert_contents(
        self, contents: list[dict[str, Any]], system_prompt: str
    ) -> list[dict[str, Any]]:
        """Converts multi-turn conversation buffer into OpenAI-compatible messages."""
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system_prompt}
        ]

        for c in contents:
            role = c.get("role", "user")
            if role in ["model", "assistant"]:
                if c.get("function_calls"):
                    tool_calls = []
                    for i, fc in enumerate(c["function_calls"]):
                        call_id = fc.get("call_id") or f"call_{i}"
                        tool_calls.append({
                            "id": call_id,
                            "type": "function",
                            "function": {
                                "name": fc["name"],
                                "arguments": (
                                    json.dumps(fc.get("args", {}))
                                    if isinstance(fc.get("args"), dict)
                                    else str(fc.get("args", "{}"))
                                ),
                            },
                        })
                    messages.append({
                        "role": "assistant",
                        "content": c.get("content") or None,
                        "tool_calls": tool_calls,
                    })
                else:
                    messages.append({
                        "role": "assistant",
                        "content": c.get("content") or "",
                    })
            else:
                # User turn or tool return turn
                if c.get("function_responses"):
                    for i, fr in enumerate(c["function_responses"]):
                        call_id = fr.get("call_id") or f"call_{i}"
                        resp_content = fr.get("response", {})
                        messages.append({
                            "role": "tool",
                            "tool_call_id": call_id,
                            "content": (
                                json.dumps(resp_content)
                                if not isinstance(resp_content, str)
                                else resp_content
                            ),
                        })
                else:
                    messages.append({
                        "role": "user",
                        "content": c.get("content") or "",
                    })

        return messages

    async def generate_stream(
        self,
        contents: list[dict[str, Any]],
        system_prompt: str,
        tools: list[Any] | None = None,
    ) -> AsyncIterator[StreamChunk]:
        """Streams tokens and function calls with key failover, retries, and mid-stream safety."""
        messages = self._convert_contents(contents, system_prompt)
        groq_tools = self._convert_tools(tools)

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "temperature": 0.2,
            "max_tokens": 2048,
            # Suppress chain-of-thought exposure per Groq docs:
            # https://console.groq.com/docs/reasoning
            # When tools are enabled, reasoning_format='raw' throws 400.
            # 'hidden' suppresses reasoning output cleanly.
            "reasoning_format": "hidden",
        }
        if groq_tools:
            payload["tools"] = groq_tools
            payload["tool_choice"] = "auto"

        key_failovers = 0
        transient_retries = 0
        total_attempts = 0
        rate_limited_keys_this_turn: set[int] = set()

        timeout = httpx.Timeout(
            connect=self.connect_timeout,
            read=self.read_timeout,
            write=5.0,
            pool=5.0,
        )

        has_yielded = False

        while total_attempts < MAX_TOTAL_ATTEMPTS:
            total_attempts += 1

            # Obtain an active key from the pool
            try:
                key_index, secret_key = await self.key_pool.get_next_key()
            except AllKeysCoolingError as e:
                raise AppError(
                    code="LLM_RATE_LIMITED",
                    message=(
                        "The upstream AI service is temporarily rate limited. "
                        "Please wait a moment."
                    ),
                    details={"wait_seconds": e.wait_seconds},
                ) from e
            except AllKeysDisabledError as e:
                raise AppError(
                    code="LLM_AUTH_ERROR",
                    message="AI service authentication error. All API keys are disabled.",
                ) from e

            headers = {
                "Authorization": f"Bearer {secret_key.get_secret_value()}",
                "Content-Type": "application/json",
            }

            try:
                async with (
                    httpx.AsyncClient(timeout=timeout) as client,
                    client.stream(
                        "POST",
                        CHAT_COMPLETIONS_ENDPOINT,
                        headers=headers,
                        json=payload,
                    ) as response,
                ):
                    status = response.status_code

                    # Check 403 Forbidden: do NOT disable keys, non-retryable
                    if status == 403:
                        logger.error(
                            "groq_api_forbidden",
                            key_index=key_index,
                            status_code=403,
                        )
                        raise AppError(
                            code="LLM_AUTH_ERROR",
                            message=(
                                "AI service authentication error (403 Forbidden). "
                                "Check model or project permissions."
                            ),
                        )

                    # Check 401 Unauthorized: disable this key, rotate to next
                    if status == 401:
                        await self.key_pool.report_401(key_index)
                        key_failovers += 1
                        if key_failovers >= min(self.key_pool.total_keys, MAX_KEY_FAILOVERS):
                            raise AppError(
                                code="LLM_AUTH_ERROR",
                                message=(
                                    "AI service authentication error (401 Unauthorized). "
                                    "Check LLM_API_KEY configuration."
                                ),
                            )
                        continue

                        # Check 429 Rate Limit
                        if status == 429:
                            retry_after = parse_retry_after(response.headers.get("Retry-After"))
                            await self.key_pool.report_429(key_index, retry_after)
                            rate_limited_keys_this_turn.add(key_index)

                            # If two different keys return 429 in the same turn, stop rotating
                            if len(rate_limited_keys_this_turn) >= 2:
                                logger.warning(
                                    "groq_multiple_keys_rate_limited",
                                    count=len(rate_limited_keys_this_turn),
                                )
                                raise AppError(
                                    code="LLM_RATE_LIMITED",
                                    message=(
                                        "The upstream AI service is temporarily rate limited. "
                                        "Please wait a moment."
                                    ),
                                    details={"wait_seconds": retry_after or 10.0},
                                )

                            key_failovers += 1
                            if key_failovers >= min(self.key_pool.total_keys, MAX_KEY_FAILOVERS):
                                raise AppError(
                                    code="LLM_RATE_LIMITED",
                                    message=(
                                        "The upstream AI service is temporarily rate limited. "
                                        "Please wait a moment."
                                    ),
                                    details={"wait_seconds": retry_after or 10.0},
                                )
                            continue

                        # Check 503 or 500 transient errors
                        if status in [500, 502, 503, 504]:
                            transient_retries += 1
                            logger.warning(
                                "groq_transient_error",
                                status_code=status,
                                retry_count=transient_retries,
                            )
                            if transient_retries > MAX_TRANSIENT_RETRIES:
                                raise AppError(
                                    code="LLM_MODEL_BUSY",
                                    message=(
                                        "The AI model is currently busy with high demand. "
                                        "Please retry your request in a moment."
                                    ),
                                )
                            await asyncio.sleep(TRANSIENT_BACKOFF_SECONDS * transient_retries)
                            continue

                        # If other non-200 error
                        if status != 200:
                            err_body = await response.aread()
                            # Redact any secret key from log output
                            err_text = err_body.decode(errors="replace")
                            for k in settings.llm_api_key_list:
                                err_text = err_text.replace(k.get_secret_value(), "[REDACTED]")
                            logger.error(
                                "groq_api_unexpected_status",
                                status_code=status,
                                error_text=err_text[:200],
                            )
                            raise AppError(
                                code=f"LLM_HTTP_{status}",
                                message=f"Upstream inference returned status {status}.",
                            )

                        # Response status is 200: stream SSE chunks
                        tool_calls_accumulator: dict[int, dict[str, Any]] = {}

                        async for line in response.aiter_lines():
                            if not line:
                                continue
                            if line.startswith("data: "):
                                data_str = line[6:].strip()
                                if data_str == "[DONE]":
                                    break
                                try:
                                    chunk_json = json.loads(data_str)
                                except json.JSONDecodeError:
                                    continue

                                choices = chunk_json.get("choices")
                                if not choices:
                                    continue
                                delta = choices[0].get("delta", {})

                                # Filter out any reasoning field emitted by reasoning models
                                # (e.g. delta.reasoning or delta.reasoning_content)
                                text_content = delta.get("content")
                                if text_content:
                                    has_yielded = True
                                    yield StreamChunk(text=text_content)

                                # Accumulate streaming tool calls
                                tc_deltas = delta.get("tool_calls")
                                if tc_deltas:
                                    has_yielded = True
                                    for tc_delta in tc_deltas:
                                        idx = tc_delta.get("index", 0)
                                        if idx not in tool_calls_accumulator:
                                            tool_calls_accumulator[idx] = {
                                                "id": tc_delta.get("id") or f"call_{idx}",
                                                "name": "",
                                                "arguments": "",
                                            }
                                        if tc_delta.get("id"):
                                            tool_calls_accumulator[idx]["id"] = tc_delta["id"]
                                        func_info = tc_delta.get("function", {})
                                        if func_info.get("name"):
                                            tool_calls_accumulator[idx]["name"] += func_info["name"]
                                        if func_info.get("arguments"):
                                            tool_calls_accumulator[idx]["arguments"] += (
                                                func_info["arguments"]
                                            )

                        # Stream finished successfully: yield any completed tool calls
                        if tool_calls_accumulator:
                            fcalls: list[FunctionCallInfo] = []
                            for idx in sorted(tool_calls_accumulator.keys()):
                                item = tool_calls_accumulator[idx]
                                name = item["name"]
                                raw_args = item["arguments"]
                                call_id = item["id"]
                                try:
                                    args_dict = json.loads(raw_args) if raw_args.strip() else {}
                                    if not isinstance(args_dict, dict):
                                        args_dict = {"_raw_argument": args_dict}
                                except json.JSONDecodeError:
                                    args_dict = {"_malformed_arguments": raw_args}
                                fcalls.append(
                                    FunctionCallInfo(
                                        name=name,
                                        args=args_dict,
                                        call_id=call_id,
                                    )
                                )
                            yield StreamChunk(function_calls=fcalls)

                        return

            except (
                httpx.ConnectTimeout,
                httpx.ReadTimeout,
                httpx.ConnectError,
                httpx.NetworkError,
            ) as net_err:
                # INVARIANT: If any chunk has already been yielded in this attempt,
                # NEVER rotate or retry. Return a clean error immediately.
                if has_yielded:
                    logger.error(
                        "groq_network_error_mid_stream",
                        key_index=key_index,
                        error=type(net_err).__name__,
                    )
                    raise AppError(
                        code="LLM_NETWORK_ERROR",
                        message="Connection to the AI service was interrupted mid-stream.",
                    ) from net_err

                transient_retries += 1
                logger.warning(
                    "groq_network_timeout",
                    key_index=key_index,
                    error=type(net_err).__name__,
                    retry_count=transient_retries,
                )
                if transient_retries > MAX_TRANSIENT_RETRIES:
                    raise AppError(
                        code="LLM_NETWORK_ERROR",
                        message="Could not reach the AI service. Please retry.",
                    ) from net_err
                await asyncio.sleep(TRANSIENT_BACKOFF_SECONDS * transient_retries)
                continue

            except AppError:
                raise

            except Exception as exc:
                if has_yielded:
                    logger.error("groq_error_mid_stream", key_index=key_index, error=str(exc))
                    raise AppError(
                        code="INTERNAL_STREAM_ERROR",
                        message="An error occurred while streaming from the AI service.",
                    ) from exc
                raise
