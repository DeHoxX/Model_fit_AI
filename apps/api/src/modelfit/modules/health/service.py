"""Health check business logic."""

import asyncio

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from modelfit.core.config import settings
from modelfit.core.errors import DatabaseUnavailableError


class HealthService:
    @staticmethod
    async def check_readiness(session: AsyncSession) -> dict[str, str]:
        """Runs a SELECT 1 check on the database with a 2-second timeout."""
        try:
            async with asyncio.timeout(2.0):
                result = await session.execute(text("SELECT 1"))
                row = result.scalar()
                if row != 1:
                    raise DatabaseUnavailableError("Unexpected database response on health check.")
        except Exception as exc:
            raise DatabaseUnavailableError(f"Database readiness check failed: {exc}") from exc

        return {"status": "ready", "database": "connected"}

    @staticmethod
    def get_metadata() -> dict[str, str]:
        """Returns version, git SHA, and environment."""
        return {
            "version": settings.APP_VERSION,
            "git_sha": settings.GIT_SHA,
            "environment": settings.APP_ENV,
        }
