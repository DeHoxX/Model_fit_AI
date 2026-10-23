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


@dataclass
class StreamChunk:
    text: str | None = None
    function_calls: list[FunctionCallInfo] | None = None


class LLMClient(Protocol):
    """Protocol for LLM streaming and function calling."""

    def generate_stream(
        self,
        contents: list[dict[str, Any]],
        system_prompt: str,
        tools: list[Any],
    ) -> AsyncIterator[StreamChunk]: ...


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
        self.client = genai.Client(api_key=settings.LLM_API_KEY)
        self.model = settings.LLM_MODEL

    async def generate_stream(
        self,
        contents: list[dict[str, Any]],
        system_prompt: str,
        tools: list[Any],
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
            yield StreamChunk(
                text=chunk.text if chunk.text else None,
                function_calls=fcalls,
            )


def get_llm_client() -> LLMClient:
    """Factory creating LLM client.

    In APP_ENV=test, returns FakeScriptedLLMClient for hermetic testing.
    In development and production, strictly instantiates GeminiLLMClient.
    """
    if settings.APP_ENV == "test":
        from tests.fakes.fake_llm_client import FakeScriptedLLMClient
        return FakeScriptedLLMClient()
    return GeminiLLMClient()
