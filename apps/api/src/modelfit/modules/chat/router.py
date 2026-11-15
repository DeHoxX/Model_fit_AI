"""HTTP routes for conversational AI advisor with SSE streaming."""

import json
from collections.abc import AsyncIterator
from typing import Literal

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from modelfit.db.session import get_db
from modelfit.modules.chat.service import ChatService

router = APIRouter(tags=["chat"])


class ChatMessagePayload(BaseModel):
    role: Literal["user", "assistant"] = Field(description="Message role.")
    content: str = Field(description="Message text content.")


class ChatRequest(BaseModel):
    messages: list[ChatMessagePayload] = Field(
        min_length=1,
        max_length=50,
        description="Bounded conversation history.",
    )


def get_chat_service() -> ChatService:
    return ChatService()


@router.post(
    "/chat",
    summary="Send a message to the AI advisor and stream Server-Sent Events",
    response_class=StreamingResponse,
)
async def chat_completions(
    req: ChatRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
    service: ChatService = Depends(get_chat_service),
) -> StreamingResponse:
    """Streams token deltas, tool call status, and recommendation cards as Server-Sent Events."""
    client_ip = request.client.host if request.client else "unknown"

    async def sse_generator() -> AsyncIterator[str]:
        messages_dicts = [m.model_dump() for m in req.messages]
        try:
            async for event in service.process_chat(
                messages=messages_dicts,
                session=session,
                client_ip=client_ip,
            ):
                data_str = json.dumps(event.data)
                yield f"event: {event.event}\ndata: {data_str}\n\n"
        except Exception:
            err_payload = json.dumps({
                "error": {
                    "code": "INTERNAL_STREAM_ERROR",
                    "message": (
                        "An error occurred while communicating with the AI service. "
                        "Please retry."
                    ),
                }
            })
            yield f"event: error\ndata: {err_payload}\n\n"
            yield "event: done\ndata: {}\n\n"

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
