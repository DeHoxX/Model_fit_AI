"""Provider-neutral LLMClient interface and Google Gemini implementation."""

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Protocol

import structlog

from modelfit.core.config import settings

logger = structlog.get_logger(__name__)


@dataclass
class FunctionCallInfo:
    name: str
    args: dict[str, Any]
    call_id: str | None = None


@dataclass
class StreamChunk:
    text: str | None = None
    function_calls: list[FunctionCallInfo] | None = None
    raw_parts: list[Any] | None = None


class LLMClient(Protocol):
    """Protocol for LLM streaming and function calling."""

    def generate_stream(
        self,
        contents: list[dict[str, Any]],
        system_prompt: str,
        tools: list[Any] | None = None,
    ) -> AsyncIterator[StreamChunk]: ...


LLM_TIMEOUT_MS: int = 15000  # milliseconds, per-attempt
LLM_RETRY_ATTEMPTS: int = 2
LLM_RETRY_MAX_DELAY: float = 2.0


class GeminiLLMClient:
    """Official Google GenAI client implementing provider-neutral LLMClient."""

    def __init__(self) -> None:
        if not settings.LLM_API_KEY:
            raise RuntimeError(
                "LLM_API_KEY is required in development and production modes. "
                "Please configure LLM_API_KEY in your environment."
            )
        if not settings.LLM_MODEL:
            raise RuntimeError(
                "LLM_MODEL is required in development and production modes. "
                "Please configure LLM_MODEL in your environment "
                "(e.g. export LLM_MODEL=<model-name>)."
            )

        from google import genai
        from google.genai import types

        # Cap per-attempt timeout and retries (design choice, unmeasured)
        # Note: google-genai HttpOptions.timeout is in milliseconds
        self.http_options = types.HttpOptions(
            timeout=LLM_TIMEOUT_MS,  # milliseconds, per-attempt
            retry_options=types.HttpRetryOptions(
                attempts=LLM_RETRY_ATTEMPTS,  # Max 2 attempts instead of unbounded delays
                max_delay=LLM_RETRY_MAX_DELAY,
            ),
        )
        self.client = genai.Client(api_key=settings.LLM_API_KEY, http_options=self.http_options)
        self.model = settings.LLM_MODEL

    async def generate_stream(
        self,
        contents: list[dict[str, Any]],
        system_prompt: str,
        tools: list[Any] | None = None,
    ) -> AsyncIterator[StreamChunk]:
        """Streams responses with automatic function calling disabled."""
        from google.genai import types

        # Build tools list for Gemini
        gemini_tools: list[types.Tool] = []
        if tools:
            func_decls = []
            for t in tools:
                func_decls.append(
                    types.FunctionDeclaration(
                        name=t["name"],
                        description=t["description"],
                        parameters=t.get("parameters"),
                    )
                )
            gemini_tools.append(types.Tool(function_declarations=func_decls))

        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            tools=gemini_tools if gemini_tools else None,  # type: ignore[arg-type]
            # Disable automatic function calling so tool calls can be intercepted,
            # audited, and post-checked
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            temperature=0.2,
            max_output_tokens=2048,
        )

        # Convert contents to Gemini types.Content
        gemini_contents: list[types.Content] = []
        for c in contents:
            role = "user" if c.get("role") == "user" else "model"
            # If original model raw parts (containing thought_signature) are present,
            # pass them back untouched so thinking models do not reject tool turns
            if role == "model" and c.get("raw_parts"):
                gemini_contents.append(types.Content(role="model", parts=list(c["raw_parts"])))
                continue

            parts: list[types.Part] = []
            if "content" in c and c["content"]:
                parts.append(types.Part.from_text(text=c["content"]))
            if "function_calls" in c:
                for fc in c["function_calls"]:
                    parts.append(
                        types.Part.from_function_call(
                            name=fc["name"],
                            args=fc["args"],
                        )
                    )
            if "function_responses" in c:
                for fr in c["function_responses"]:
                    parts.append(
                        types.Part.from_function_response(
                            name=fr["name"],
                            response={"result": fr["response"]},
                        )
                    )
            if parts:
                gemini_contents.append(types.Content(role=role, parts=parts))

        response_stream = await self.client.aio.models.generate_content_stream(
            model=self.model,
            contents=gemini_contents,
            config=config,
        )

        async for chunk in response_stream:
            fcalls = None
            if chunk.function_calls:
                fcalls = [
                    FunctionCallInfo(
                        name=fc.name or "",
                        args=dict(fc.args) if fc.args else {},
                    )
                    for fc in chunk.function_calls
                ]

            raw_parts = None
            if (
                chunk.candidates
                and chunk.candidates[0].content
                and chunk.candidates[0].content.parts
            ):
                raw_parts = list(chunk.candidates[0].content.parts)
            elif getattr(chunk, "parts", None) and chunk.parts is not None:
                raw_parts = list(chunk.parts)

            yield StreamChunk(
                text=chunk.text if chunk.text else None,
                function_calls=fcalls,
                raw_parts=raw_parts,
            )


def get_llm_client() -> LLMClient:
    """Factory creating LLM client.

    In APP_ENV=test, returns FakeScriptedLLMClient for hermetic testing.
    In development and production, instantiates GroqLLMClient or GeminiLLMClient
    depending on LLM_PROVIDER setting.
    """
    if settings.APP_ENV == "test":
        from tests.fakes.fake_llm_client import FakeScriptedLLMClient
        return FakeScriptedLLMClient()
    if settings.LLM_PROVIDER == "groq":
        from modelfit.modules.chat.groq_client import GroqLLMClient
        return GroqLLMClient()
    return GeminiLLMClient()
