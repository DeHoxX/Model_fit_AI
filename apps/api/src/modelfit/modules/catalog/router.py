"""HTTP router for model catalog discovery and details."""

from typing import Literal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from modelfit.db.session import get_db
from modelfit.modules.catalog.rate_limiter import rate_limit_dependency
from modelfit.modules.catalog.schemas import (
    ModelDetailResponse,
    ModelListResponse,
)
from modelfit.modules.catalog.service import CatalogService

router = APIRouter(tags=["Model Catalog"])


def get_catalog_service() -> CatalogService:
    """Dependency provider for CatalogService."""
    return CatalogService()


@router.get(
    "/models",
    response_model=ModelListResponse,
    status_code=status.HTTP_200_OK,
    summary="List Hugging Face models",
    description=(
        "Lists models from Hugging Face Hub with sorting, search, and cursor-based pagination."
    ),
    dependencies=[Depends(rate_limit_dependency())],
)
async def list_models(
    search: str | None = Query(default=None, description="Search query string"),
    sort: Literal["downloads", "likes", "recent"] = Query(
        default="downloads", description="Sorting field"
    ),
    limit: int = Query(default=20, ge=1, le=50, description="Max results per page (capped at 50)"),
    cursor: str | None = Query(default=None, description="Opaque cursor for pagination"),
    session: AsyncSession = Depends(get_db),
    service: CatalogService = Depends(get_catalog_service),
) -> ModelListResponse:
    """Retrieves list of models matching criteria."""
    return await service.list_models(
        session=session,
        search=search,
        sort=sort,
        limit=limit,
        cursor=cursor,
    )


@router.get(
    "/models/{repo_id:path}",
    response_model=ModelDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get model details and normalized architecture",
    description="Retrieves normalized architecture metadata, provenance, and support status.",
    dependencies=[Depends(rate_limit_dependency())],
)
async def get_model(
    repo_id: str,
    session: AsyncSession = Depends(get_db),
    service: CatalogService = Depends(get_catalog_service),
) -> ModelDetailResponse:
    """Retrieves full details and normalized architecture for a Hugging Face model."""
    return await service.get_model_detail(session=session, repo_id=repo_id)
