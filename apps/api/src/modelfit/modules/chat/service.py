"""ChatService: Multi-turn tool execution loop, rate limiting, and post-check validation."""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from modelfit.core.errors import AppError
from modelfit.modules.catalog.rate_limiter import SlidingWindowRateLimiter
from modelfit.modules.chat.llm_client import LLMClient, get_llm_client
from modelfit.modules.chat.tools import TOOL_DECLARATIONS, execute_tool

logger = structlog.get_logger(__name__)

MAX_TOOL_ROUNDS = 5
MAX_INPUT_CHARS = 4000
MAX_HISTORY_MESSAGES = 20

# Sliding window rate limiter: 4 requests per minute per IP
chat_rate_limiter = SlidingWindowRateLimiter(max_requests=4, window_seconds=60.0)


@dataclass
class ChatSSEEvent:
    event: str
    data: dict[str, Any]


class ChatService:
    """Orchestrates natural language chat, tool executions, and deterministic post-checks."""

    def __init__(self, llm_client: LLMClient | None = None) -> None:
        self.llm_client = llm_client or get_llm_client()
        self._prompt_path = Path(__file__).parent / "prompts" / "system_v1.txt"
        self._system_prompt = self._load_system_prompt()

    def _load_system_prompt(self) -> str:
        if self._prompt_path.exists():
            return self._prompt_path.read_text(encoding="utf-8")
        return (
            "You are ModelFit Assistant. The deterministic engine is the single source of truth. "
            "Never invent numbers or alter estimates. Speed benchmarks are out of scope."
        )

    async def process_chat(
        self,
        messages: list[dict[str, str]],
        session: AsyncSession,
        client_ip: str | None = None,
    ) -> AsyncIterator[ChatSSEEvent]:
        """Runs the streaming chat loop with tool calling, SSE events, and safety post-checks."""
        # 1. Rate limiting
        if client_ip:
            try:
                chat_rate_limiter.check(client_ip)
            except AppError as exc:
                yield ChatSSEEvent(
                    event="error",
                    data={
                        "error": {
                            "code": exc.code,
                            "message": exc.message,
                            "details": exc.details,
                        }
                    },
                )
                yield ChatSSEEvent(event="done", data={})
                return

        # 2. Input validation & bounding
        bounded_messages = messages[-MAX_HISTORY_MESSAGES:]
        for m in bounded_messages:
            if len(m.get("content", "")) > MAX_INPUT_CHARS:
                m["content"] = m["content"][:MAX_INPUT_CHARS]

        # Multi-turn conversation buffer for the LLM
        contents: list[dict[str, Any]] = [
            {"role": m.get("role", "user"), "content": m.get("content", "")}
            for m in bounded_messages
        ]

        verified_model_ids: set[str] = set()
        rounds = 0

        try:
            while rounds < MAX_TOOL_ROUNDS:
                rounds += 1
                stream = self.llm_client.generate_stream(
                    contents=contents,
                    system_prompt=self._system_prompt,
                    tools=TOOL_DECLARATIONS,
                )

                function_calls_in_turn = []
                turn_text_parts = []

                async for chunk in stream:
                    if chunk.text:
                        turn_text_parts.append(chunk.text)
                        yield ChatSSEEvent(event="token", data={"text": chunk.text})
                    if chunk.function_calls:
                        for fc in chunk.function_calls:
                            function_calls_in_turn.append(fc)

                full_text = "".join(turn_text_parts)

                # If no tools called, conversation turn completed normally
                if not function_calls_in_turn:
                    contents.append({"role": "model", "content": full_text})
                    break

                # Record model's function call intent in contents
                f_calls = [
                    {"name": fc.name, "args": fc.args}
                    for fc in function_calls_in_turn
                ]
                contents.append({
                    "role": "model",
                    "content": full_text,
                    "function_calls": f_calls,
                })

                # Execute each tool call
                function_responses = []
                for fc in function_calls_in_turn:
                    # SSE event: tool_call carries name and status ONLY
                    yield ChatSSEEvent(
                        event="tool_call",
                        data={"name": fc.name, "status": "running"},
                    )

                    tool_result = await execute_tool(fc.name, fc.args, session)

                    # Extract verified model IDs from tool results
                    self._harvest_verified_models(fc.name, tool_result, verified_model_ids)

                    # If recommend_models returned structured cards, emit recommendation event
                    if fc.name == "recommend_models" and "recommendations" in tool_result:
                        # Post-check: ensure model IDs were grounded in tool results
                        sanitized_cards = self._post_check_recommendations(
                            tool_result.get("recommendations", []),
                            verified_model_ids,
                        )
                        yield ChatSSEEvent(
                            event="recommendation",
                            data={
                                "recommendations": sanitized_cards,
                                "dropped_oom_count": tool_result.get("dropped_oom_count", 0),
                                "dropped_unsupported_count": tool_result.get(
                                    "dropped_unsupported_count", 0
                                ),
                                "unsupported_reasons": tool_result.get("unsupported_reasons", []),
                                "warning": tool_result.get("warning"),
                            },
                        )

                    # SSE event: tool_result carries name and status ONLY
                    yield ChatSSEEvent(
                        event="tool_result",
                        data={"name": fc.name, "status": "completed"},
                    )

                    function_responses.append({
                        "name": fc.name,
                        "response": tool_result,
                    })

                # Append tool results to multi-turn contents for the next round
                contents.append({
                    "role": "user",
                    "function_responses": function_responses,
                })

            # Check if round cap was reached
            if rounds >= MAX_TOOL_ROUNDS:
                logger.warning("chat_tool_round_cap_reached", rounds=rounds)
                notice = (
                    "\n\n*(Note: Maximum tool iteration limit reached. "
                    "I have finalized the response based on the completed calculations.)*"
                )
                yield ChatSSEEvent(event="token", data={"text": notice})

        except Exception as exc:
            err_str = str(exc)
            logger.error("chat_service_error", error=err_str)
            is_rate = (
                "429" in err_str
                or "quota" in err_str.lower()
                or "resourceexhausted" in err_str.lower()
            )
            if is_rate:
                code = "LLM_RATE_LIMITED"
                msg = "The upstream AI service is temporarily rate limited. Please wait a moment."
            else:
                code = "LLM_ERROR"
                msg = "An error occurred while generating a response. Please try again."

            yield ChatSSEEvent(
                event="error",
                data={
                    "error": {
                        "code": code,
                        "message": msg,
                    }
                },
            )

        yield ChatSSEEvent(event="done", data={})

    def _harvest_verified_models(
        self,
        tool_name: str,
        tool_result: dict[str, Any],
        verified_set: set[str],
    ) -> None:
        """Extracts legitimate model repo IDs produced by tool executions."""
        if tool_name == "search_models":
            for item in tool_result.get("items", []):
                if "id" in item:
                    verified_set.add(item["id"])
        elif tool_name == "get_model_details":
            if "id" in tool_result:
                verified_set.add(tool_result["id"])
        elif tool_name == "recommend_models":
            for rec in tool_result.get("recommendations", []):
                if "model_id" in rec:
                    verified_set.add(rec["model_id"])

    def _post_check_recommendations(
        self,
        candidates: list[dict[str, Any]],
        verified_ids: set[str],
    ) -> list[dict[str, Any]]:
        """Validates that candidate model IDs match verified tool results.

        Limits: Validates repository identifiers against grounded tool executions.
        Does not parse or verify arbitrary numbers in free text sentences.
        """
        sanitized = []
        for c in candidates:
            m_id = c.get("model_id")
            if m_id and m_id in verified_ids:
                sanitized.append(c)
            else:
                logger.warning("attempted_model_hallucination", model_id=m_id)
        return sanitized
