"""ChatService: Multi-turn tool execution loop, rate limiting, and post-check validation."""

import contextlib
import json
import re
import time
import traceback
from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from modelfit.core.config import settings
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
        verified_requirement_figures: set[str] = set()
        hardware_capacity_phrases: set[str] = set()
        executed_calls: dict[str, Any] = {}
        rounds = 0

        # Harvest user-stated hardware and memory capacity phrases from user inputs
        gpu_name_pattern = re.compile(
            r"\b(?:nvidia|geforce|rtx|gtx|amd|radeon|rx|intel|arc|"
            r"apple\s+m\d+(?:\s+(?:pro|max|ultra))?|m\d+(?:\s+(?:pro|max|ultra))?|"
            r"mac(?:book)?(?:\s+(?:pro|max))?|tesla|quadro|a100|h100|h200|l40|v100)\b"
            r"[^\n,;]{0,30}?\b\d+\s*(?:gib|gb|g)\b"
            r"(?!\s*(?:of\s+)?(?:system\s+)?(?:ram|memory))",
            re.IGNORECASE,
        )
        vram_ram_pattern = re.compile(
            r"\b\d+\s*(?:gib|gb|g)\s+(?:vram|ram|system\s+ram)\b|"
            r"\b(?:vram|ram)\s*(?:of|:)?\s*\d+\s*(?:gib|gb|g)\b",
            re.IGNORECASE,
        )
        user_memory_pattern = re.compile(
            r"\b(\d+(?:\.\d+)?)\s*(?:gib|gb|g)\b",
            re.IGNORECASE,
        )
        user_stated_figures: set[str] = set()
        for m in bounded_messages:
            if m.get("role") == "user":
                u_text = m.get("content", "")
                for u_m in gpu_name_pattern.finditer(u_text):
                    hardware_capacity_phrases.add(u_m.group(0).lower().strip())
                for u_m in vram_ram_pattern.finditer(u_text):
                    hardware_capacity_phrases.add(u_m.group(0).lower().strip())
                for u_m in user_memory_pattern.finditer(u_text):
                    user_stated_figures.add(u_m.group(1))

        try:
            while rounds < MAX_TOOL_ROUNDS:
                t_round_0 = time.perf_counter()
                rounds += 1
                stream = self.llm_client.generate_stream(
                    contents=contents,
                    system_prompt=self._system_prompt,
                    tools=TOOL_DECLARATIONS,
                )

                function_calls_in_turn = []
                turn_text_parts = []
                turn_raw_parts: list[Any] = []

                async for chunk in stream:
                    if chunk.text:
                        turn_text_parts.append(chunk.text)
                    if chunk.function_calls:
                        for fc in chunk.function_calls:
                            function_calls_in_turn.append(fc)
                    if chunk.raw_parts:
                        turn_raw_parts.extend(chunk.raw_parts)

                full_text = "".join(turn_text_parts)

                # If no tools called, conversation turn completed normally (final answer)
                if not function_calls_in_turn:
                    # Buffer and post-check before emitting any token (Rule R-C)
                    sanitized_full_text = self._post_check_memory_figures(
                        full_text,
                        verified_requirement_figures,
                        hardware_capacity_phrases,
                        user_stated_figures,
                    )
                    # Emit final verified answer once without diff wrappers
                    yield ChatSSEEvent(event="token", data={"text": sanitized_full_text})

                    contents.append({"role": "model", "content": sanitized_full_text})
                    dt_round_ms = (time.perf_counter() - t_round_0) * 1000
                    logger.debug(
                        "chat_round_timing",
                        round=rounds,
                        duration_ms=round(dt_round_ms, 1),
                    )
                    break

                # Record model's function call intent in contents
                f_calls = [{"name": fc.name, "args": fc.args} for fc in function_calls_in_turn]
                contents.append(
                    {
                        "role": "model",
                        "content": full_text,
                        "function_calls": f_calls,
                        "raw_parts": turn_raw_parts if turn_raw_parts else None,
                    }
                )

                # Execute each tool call
                function_responses = []
                for fc in function_calls_in_turn:
                    # SSE event: tool_call carries name and status ONLY
                    yield ChatSSEEvent(
                        event="tool_call",
                        data={"name": fc.name, "status": "running"},
                    )

                    t_tool_0 = time.perf_counter()
                    call_sig = f"{fc.name}:{json.dumps(fc.args, sort_keys=True)}"
                    if call_sig in executed_calls:
                        prev_result = executed_calls[call_sig]
                        tool_result = (
                            dict(prev_result)
                            if isinstance(prev_result, dict)
                            else {"result": prev_result}
                        )
                        tool_result["duplicate_call"] = True
                        tool_result["note"] = (
                            f"Call '{fc.name}' with identical arguments was already executed. "
                            "Skipping re-execution."
                        )
                        tool_result["retryable"] = False
                    else:
                        tool_result = await execute_tool(fc.name, fc.args, session)
                        executed_calls[call_sig] = tool_result

                    dt_tool_ms = (time.perf_counter() - t_tool_0) * 1000
                    logger.debug("chat_tool_timing", tool=fc.name, duration_ms=round(dt_tool_ms, 1))

                    # Extract verified model IDs, requirement figures, and hardware capacity phrases
                    self._harvest_verified_models(fc.name, tool_result, verified_model_ids)
                    self._harvest_verified_memory_figures(
                        fc.name,
                        tool_result,
                        verified_requirement_figures,
                        hardware_capacity_phrases,
                    )

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

                    function_responses.append(
                        {
                            "name": fc.name,
                            "response": tool_result,
                        }
                    )

                # Append tool results to multi-turn contents for the next round
                contents.append(
                    {
                        "role": "user",
                        "function_responses": function_responses,
                    }
                )
                dt_round_ms = (time.perf_counter() - t_round_0) * 1000
                logger.debug("chat_round_timing", round=rounds, duration_ms=round(dt_round_ms, 1))

            # Check if round cap was reached
            if rounds >= MAX_TOOL_ROUNDS:
                logger.warning("chat_tool_round_cap_reached", rounds=rounds)
                synth_contents = list(contents)
                synth_contents.append(
                    {
                        "role": "user",
                        "content": (
                            "Maximum tool iteration limit reached. "
                            "Please synthesize a final, clear "
                            "answer for the user based on the tool results gathered so far. "
                            "Do not attempt to call any more tools. If a tool reported an error, "
                            "gated status, or missing information, explain it directly to the user "
                            "without inventing any numbers."
                        ),
                    }
                )
                try:
                    synth_stream = self.llm_client.generate_stream(
                        contents=synth_contents,
                        system_prompt=self._system_prompt,
                        tools=None,
                    )
                    synth_text_parts = []
                    async for chunk in synth_stream:
                        if chunk.text:
                            synth_text_parts.append(chunk.text)
                    synth_full_text = "".join(synth_text_parts)
                    sanitized_synth = self._post_check_memory_figures(
                        synth_full_text,
                        verified_requirement_figures,
                        hardware_capacity_phrases,
                        user_stated_figures,
                    )
                    yield ChatSSEEvent(event="token", data={"text": sanitized_synth})
                except Exception as synth_exc:
                    logger.warning("synthesis_stream_failed", error=str(synth_exc))
                    yield ChatSSEEvent(
                        event="token",
                        data={
                            "text": (
                                "I reached the maximum iteration limit while analyzing this "
                                "request. Please review the tool outputs above or provide "
                                "specific model/hardware details."
                            )
                        },
                    )

                notice = (
                    "\n\n*(Note: Maximum tool iteration limit reached. "
                    "I have finalized the response based on the completed calculations.)*"
                )
                yield ChatSSEEvent(event="token", data={"text": notice})

        except Exception as exc:
            exc_type = type(exc).__name__
            raw_err_str = str(exc)
            # Redact any accidental secret leakage across all configured keys
            safe_err = raw_err_str
            tb_str = traceback.format_exc()
            for key_obj in settings.llm_api_key_list:
                k_val = key_obj.get_secret_value()
                if k_val:
                    safe_err = safe_err.replace(k_val, "[REDACTED]")
                    tb_str = tb_str.replace(k_val, "[REDACTED]")

            logger.error(
                "chat_service_error",
                exception_type=exc_type,
                error=safe_err,
                traceback=tb_str,
            )

            is_busy = (
                "503" in raw_err_str
                or "unavailable" in raw_err_str.lower()
                or "high demand" in raw_err_str.lower()
            )
            is_network = (
                "connecttimeout" in raw_err_str.lower()
                or "connecterror" in raw_err_str.lower()
                or "readtimeout" in raw_err_str.lower()
                or "networkerror" in raw_err_str.lower()
                or "timeout" in exc_type.lower()
                or "connect" in exc_type.lower()
            )
            is_rate = (
                "429" in raw_err_str
                or "quota" in raw_err_str.lower()
                or "resourceexhausted" in raw_err_str.lower()
            )
            is_auth = (
                "401" in raw_err_str
                or "403" in raw_err_str
                or "unauthenticated" in raw_err_str.lower()
                or "permissiondenied" in raw_err_str.lower()
                or "api_key" in raw_err_str.lower()
            )

            if isinstance(exc, AppError):
                code = exc.code
                msg = exc.message
            elif is_busy:
                code = "LLM_MODEL_BUSY"
                msg = (
                    "The AI model is currently busy with high demand. "
                    "Please retry your request in a moment."
                )
            elif is_network:
                code = "LLM_NETWORK_ERROR"
                msg = "Could not reach the AI service. Please retry."
            elif is_rate:
                code = "LLM_RATE_LIMITED"
                msg = "The upstream AI service is temporarily rate limited. Please wait a moment."
            elif is_auth:
                code = "LLM_AUTH_ERROR"
                msg = "AI service authentication error. Check LLM_API_KEY configuration."
            else:
                code = f"ERROR_{exc_type.upper()}"
                # Keep client-facing message safe and concise (first 100 characters max)
                if safe_err:
                    msg = f"Inference error ({exc_type}): {safe_err[:100]}"
                else:
                    msg = f"An error occurred ({exc_type})."

            yield ChatSSEEvent(
                event="error",
                data={
                    "error": {
                        "code": code,
                        "message": msg,
                    }
                },
            )
        finally:
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

    def _harvest_verified_memory_figures(
        self,
        tool_name: str,
        tool_result: dict[str, Any],
        verified_requirement_figures: set[str],
        hardware_capacity_phrases: set[str],
    ) -> None:
        """Harvests grounded requirement figures and hardware capacity phrases from tool results."""
        if tool_name == "estimate_memory":
            fmt = tool_result.get("formatted_gib")
            if isinstance(fmt, dict):
                for val in fmt.values():
                    if isinstance(val, str):
                        match = re.search(r"\b(\d+(?:\.\d+)?)\s*GiB\b", val, re.IGNORECASE)
                        if match:
                            num = match.group(1)
                            verified_requirement_figures.add(num)
                            if num.endswith(".0"):
                                verified_requirement_figures.add(num[:-2])
            res_hw = tool_result.get("resolved_hardware")
            if isinstance(res_hw, dict):
                hw_name = res_hw.get("name")
                if hw_name:
                    hardware_capacity_phrases.add(hw_name.lower())

        elif tool_name == "recommend_models":
            res_hw = tool_result.get("resolved_hardware")
            if isinstance(res_hw, dict):
                hw_name = res_hw.get("name")
                if hw_name:
                    hardware_capacity_phrases.add(hw_name.lower())
            for rec in tool_result.get("recommendations", []):
                fmt = rec.get("formatted_gib")
                if isinstance(fmt, dict):
                    for val in fmt.values():
                        if isinstance(val, str):
                            match = re.search(r"\b(\d+(?:\.\d+)?)\s*GiB\b", val, re.IGNORECASE)
                            if match:
                                num = match.group(1)
                                verified_requirement_figures.add(num)
                                if num.endswith(".0"):
                                    verified_requirement_figures.add(num[:-2])
                c_hw = rec.get("resolved_hardware")
                if isinstance(c_hw, dict):
                    hw_name = c_hw.get("name")
                    if hw_name:
                        hardware_capacity_phrases.add(hw_name.lower())

        elif tool_name == "list_hardware":
            for prof in tool_result.get("profiles", []):
                p_name = prof.get("name")
                if p_name:
                    hardware_capacity_phrases.add(p_name.lower())

    def _post_check_memory_figures(
        self,
        text: str,
        verified_requirement_figures: set[str],
        hardware_capacity_phrases: set[str],
        user_stated_figures: set[str] | None = None,
    ) -> str:
        """Validates that memory figures in assistant response match tool outputs.

        Contextual Grounding Rules (Rule R-C):
        - A figure is grounded as a hardware-capacity mention if it appears as part of a
          substring matching a resolved hardware name or if it is an echo of a user-stated
          capacity figure outside requirement claims.
        - Any memory-REQUIREMENT figure (e.g. 'needs 12 GiB', 'requires 11.0 GiB', 'headroom')
          must strictly match verified numbers in formatted_gib.
        - Ungrounded or hallucinated requirement figures are replaced with:
          '[refer to card for verified memory requirements]'.
        """
        user_figures = user_stated_figures or set()
        user_numbers: set[float] = set()
        for uf in user_figures:
            with contextlib.suppress(ValueError):
                user_numbers.add(float(uf))

        if not verified_requirement_figures and not hardware_capacity_phrases and not user_figures:
            return text

        # 1. Identify character spans in text that correspond to hardware capacity mentions
        text_lower = text.lower()
        capacity_spans: list[tuple[int, int]] = []
        for phrase in hardware_capacity_phrases:
            clean_phrase = phrase.strip().lower()
            if not clean_phrase or len(clean_phrase) < 3:
                continue
            start = 0
            while True:
                idx = text_lower.find(clean_phrase, start)
                if idx == -1:
                    break
                capacity_spans.append((idx, idx + len(clean_phrase)))
                start = idx + len(clean_phrase)

        # 2. Inspect all memory figure occurrences
        pattern = r"\b(\d+(?:\.\d+)?)\s*(GiB|GB)\b"

        req_before_pattern = re.compile(
            r"\b(?:needs?|needed|requires?|requiring|required|takes?|taking|"
            r"minimum|footprint\s+(?:of\s+)?|headroom\s+(?:of\s+)?|"
            r"total\s+(?:memory\s+)?(?:of\s+)?)\b[^\.\,\;\!\?]*$",
            re.IGNORECASE,
        )
        req_after_pattern = re.compile(
            r"^[^\.\,\;\!\?]*(?:\b(?:required|needed|total|headroom|free\s+headroom|"
            r"for\s+weights|weights|kv\s+cache|activations?|runtime\s+overhead)\b)",
            re.IGNORECASE,
        )

        def _replace_match(m: re.Match[str]) -> str:
            m_start, m_end = m.span()
            # If the figure is part of a hardware capacity phrase, preserve it
            for c_start, c_end in capacity_spans:
                if c_start <= m_start and m_end <= c_end:
                    return m.group(0)

            num = m.group(1)
            unit = m.group(2)
            is_num = num.replace(".", "", 1).isdigit()
            num_val = float(num) if is_num else None

            # Check if this figure appears in requirement context
            window_before = text[max(0, m_start - 50) : m_start]
            window_after = text[m_end : min(len(text), m_end + 40)]
            is_req_claim = bool(
                req_before_pattern.search(window_before) or req_after_pattern.search(window_after)
            )

            # If not a requirement claim, check if it is a plain echo of a user-stated capacity
            if not is_req_claim and num_val is not None:
                is_user_echo = num in user_figures or any(
                    abs(un - num_val) < 1e-4 for un in user_numbers
                )
                if is_user_echo:
                    return m.group(0)

            # Otherwise, figure is a memory-requirement claim. Check against verified tool figures.
            is_verified = False
            if num_val is not None and verified_requirement_figures:
                for vf in verified_requirement_figures:
                    if vf.replace(".", "", 1).isdigit() and abs(float(vf) - num_val) < 1e-4:
                        is_verified = True
                        break

            if is_verified:
                return f"{num} GiB"

            logger.warning(
                "unverified_memory_requirement_detected",
                hallucinated_figure=f"{num} {unit}",
                allowed_requirements=list(verified_requirement_figures),
            )
            return "[refer to card for verified memory requirements]"

        return re.sub(pattern, _replace_match, text, flags=re.IGNORECASE)

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
