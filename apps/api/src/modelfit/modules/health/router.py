"""Health endpoints router."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from modelfit.db.session import get_db
from modelfit.modules.health.service import HealthService

router = APIRouter(prefix="", tags=["health"])


@router.get("/health/live", summary="Liveness Probe")
async def health_live() -> dict[str, str]:
    """Returns 200 if the process is alive."""
    return {"status": "live"}


@router.get("/health/ready", summary="Readiness Probe")
async def health_ready(session: AsyncSession = Depends(get_db)) -> dict[str, str]:
    """Returns 200 if the database responds within 2 seconds, otherwise 503 error envelope."""
    return await HealthService.check_readiness(session)


@router.get("/meta", summary="Application Metadata")
async def meta() -> dict[str, str]:
    """Returns version, git SHA, and environment."""
    return HealthService.get_metadata()
