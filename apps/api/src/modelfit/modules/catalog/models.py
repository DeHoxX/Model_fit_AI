"""SQLAlchemy model for cached Hugging Face model metadata."""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from modelfit.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ModelCache(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Database entity storing cached Hugging Face model metadata."""

    __tablename__ = "model_cache"

    hf_model_id: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    author: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    model_name: Mapped[str] = mapped_column(String(150), index=True, nullable=False)
    pipeline_tag: Mapped[str | None] = mapped_column(String(50), nullable=True)
    likes: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    downloads: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    # HTTP Caching Headers & TTL
    etag: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_modified: Mapped[str | None] = mapped_column(String(100), nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True, nullable=False
    )

    # Normalized payloads & Provenance
    raw_config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    normalized_payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    architecture_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_supported: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true"), nullable=False
    )
    support_status: Mapped[str] = mapped_column(
        String(50), default="supported_llm", server_default="supported_llm", nullable=False
    )
    support_reason_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    support_reason_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    gated: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("false"), nullable=False
    )
    license: Mapped[str | None] = mapped_column(String(100), nullable=True)
    param_provenance: Mapped[str] = mapped_column(
        String(50), default="derived", server_default="derived", nullable=False
    )

