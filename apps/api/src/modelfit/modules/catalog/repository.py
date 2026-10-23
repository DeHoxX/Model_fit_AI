"""Database repository for Hugging Face model cache entities."""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from modelfit.modules.catalog.models import ModelCache


class CatalogRepository:
    """Handles persistence and retrieval of cached Hugging Face model metadata."""

    async def get_by_repo_id(self, session: AsyncSession, repo_id: str) -> ModelCache | None:
        """Finds cached model by HF repository ID."""
        stmt = select(ModelCache).where(ModelCache.hf_model_id == repo_id)
        result = await session.execute(stmt)
        return result.scalars().first()

    async def get_by_repo_ids(
        self, session: AsyncSession, repo_ids: list[str]
    ) -> dict[str, ModelCache]:
        """Finds cached models by HF repository IDs, returning a dict mapping repo_id to ModelCache.
        """
        if not repo_ids:
            return {}
        stmt = select(ModelCache).where(ModelCache.hf_model_id.in_(repo_ids))
        result = await session.execute(stmt)
        return {c.hf_model_id: c for c in result.scalars().all()}

    async def upsert(
        self,
        session: AsyncSession,
        data: dict[str, Any],
    ) -> ModelCache:
        """Inserts or updates a cached model record."""
        repo_id = data["hf_model_id"]
        cached = await self.get_by_repo_id(session, repo_id)
        now = datetime.now(UTC)

        if cached is None:
            cached = ModelCache(
                hf_model_id=repo_id,
                author=data.get("author", "unknown"),
                model_name=data.get("model_name", repo_id),
                pipeline_tag=data.get("pipeline_tag"),
                likes=data.get("likes", 0),
                downloads=data.get("downloads", 0),
                etag=data.get("etag"),
                last_modified=data.get("last_modified"),
                fetched_at=now,
                expires_at=data["expires_at"],
                raw_config=data.get("raw_config", {}),
                normalized_payload=data.get("normalized_payload", {}),
                architecture_name=data.get("architecture_name"),
                is_supported=data.get("is_supported", True),
                support_status=data.get("support_status", "supported_llm"),
                support_reason_code=data.get("support_reason_code"),
                support_reason_message=data.get("support_reason_message"),
                gated=data.get("gated", False),
                license=data.get("license"),
                param_provenance=data.get("param_provenance", "derived"),
            )
            session.add(cached)
        else:
            cached.author = data.get("author", cached.author)
            cached.model_name = data.get("model_name", cached.model_name)
            cached.pipeline_tag = data.get("pipeline_tag", cached.pipeline_tag)
            cached.likes = data.get("likes", cached.likes)
            cached.downloads = data.get("downloads", cached.downloads)
            cached.etag = data.get("etag", cached.etag)
            cached.last_modified = data.get("last_modified", cached.last_modified)
            cached.fetched_at = now
            cached.expires_at = data["expires_at"]
            cached.raw_config = data.get("raw_config", cached.raw_config)
            cached.normalized_payload = data.get("normalized_payload", cached.normalized_payload)
            cached.architecture_name = data.get("architecture_name", cached.architecture_name)
            cached.is_supported = data.get("is_supported", cached.is_supported)
            cached.support_status = data.get("support_status", cached.support_status)
            cached.support_reason_code = data.get("support_reason_code", cached.support_reason_code)
            cached.support_reason_message = data.get(
                "support_reason_message", cached.support_reason_message
            )
            cached.gated = data.get("gated", cached.gated)
            cached.license = data.get("license", cached.license)
            cached.param_provenance = data.get("param_provenance", cached.param_provenance)

        await session.flush()
        return cached

    async def list_cached(
        self,
        session: AsyncSession,
        search: str | None = None,
        sort: str = "downloads",
        limit: int = 50,
        offset: int = 0,
    ) -> list[ModelCache]:
        """Lists cached models with optional filtering and sorting."""
        stmt = select(ModelCache)
        if search:
            pattern = f"%{search.lower()}%"
            stmt = stmt.where(
                (ModelCache.hf_model_id.ilike(pattern))
                | (ModelCache.author.ilike(pattern))
                | (ModelCache.model_name.ilike(pattern))
            )

        if sort == "likes":
            stmt = stmt.order_by(desc(ModelCache.likes))
        elif sort == "recent":
            stmt = stmt.order_by(desc(ModelCache.fetched_at))
        else:  # Default to downloads
            stmt = stmt.order_by(desc(ModelCache.downloads))

        stmt = stmt.limit(limit).offset(offset)
        result = await session.execute(stmt)
        return list(result.scalars().all())
