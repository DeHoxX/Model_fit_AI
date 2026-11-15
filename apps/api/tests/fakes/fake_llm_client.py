"""Scripted Fake LLM Client for hermetic testing.

Only accessible in APP_ENV=test.
"""

from collections.abc import AsyncIterator
from typing import Any

from modelfit.modules.chat.llm_client import FunctionCallInfo, StreamChunk

# Backwards compatibility aliases
FakeFunctionCall = FunctionCallInfo
FakeStreamChunk = StreamChunk


class FakeScriptedLLMClient:
    """Scripted fake client that yields pre-configured turn responses."""

    def __init__(self, script: list[list[StreamChunk]] | None = None) -> None:
        self.script: list[list[StreamChunk]] = script or []
        self.call_history: list[dict[str, Any]] = []

    def queue_turn(self, chunks: list[StreamChunk]) -> None:
        self.script.append(chunks)

    async def generate_stream(
        self,
        contents: list[dict[str, Any]],
        system_prompt: str,
        tools: list[Any] | None = None,
    ) -> AsyncIterator[StreamChunk]:
        self.call_history.append(
            {
                "contents": [dict(c) for c in contents],
                "system_prompt": system_prompt,
                "tools": tools,
            }
        )
        if not self.script:
            yield StreamChunk(text="Default scripted fallback response.")
            return

        turn_chunks = self.script.pop(0)
        for chunk in turn_chunks:
            yield chunk
