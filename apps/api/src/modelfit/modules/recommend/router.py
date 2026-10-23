"""HTTP routes for deterministic recommendations."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from modelfit.db.session import get_db
from modelfit.modules.catalog.service import CatalogService
from modelfit.modules.recommend.schemas import (
    ClarificationNeeded,
    RecommendationResponse,
    RequirementSpec,
)
from modelfit.modules.recommend.service import RecommendService

router = APIRouter(tags=["recommend"])


def get_recommend_service() -> RecommendService:
    catalog_service = CatalogService()
    return RecommendService(catalog_service=catalog_service)


@router.post(
    "/recommend",
    response_model=RecommendationResponse | ClarificationNeeded,
    summary="Get deterministic model recommendations based on hardware and requirements",
)
async def get_recommendations(
    spec: RequirementSpec,
    session: AsyncSession = Depends(get_db),
    service: RecommendService = Depends(get_recommend_service),
) -> RecommendationResponse | ClarificationNeeded:
    """Calculates deterministic model rankings based on memory fit and scoring."""
    return await service.recommend(spec=spec, session=session)
