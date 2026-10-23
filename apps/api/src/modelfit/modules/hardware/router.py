"""HTTP Router for hardware presets and memory estimation."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from modelfit.db.session import get_db
from modelfit.modules.catalog.service import CatalogService
from modelfit.modules.estimator.schemas import EstimationResult
from modelfit.modules.hardware.schemas import (
    EstimateRequest,
    HardwareProfileResponse,
)
from modelfit.modules.hardware.service import HardwareService

router = APIRouter(tags=["Hardware & Estimation"])


def get_hardware_service() -> HardwareService:
    """Dependency provider for HardwareService."""
    return HardwareService()


def get_catalog_service() -> CatalogService:
    """Dependency provider for CatalogService."""
    return CatalogService()


@router.get(
    "/hardware",
    response_model=list[HardwareProfileResponse],
    status_code=status.HTTP_200_OK,
    summary="List hardware profiles",
    description="Returns all preset hardware profiles with memory specifications.",
)
async def list_hardware(
    session: AsyncSession = Depends(get_db),
    service: HardwareService = Depends(get_hardware_service),
) -> list[HardwareProfileResponse]:
    """Retrieves all registered hardware profiles from the database."""
    profiles = await service.list_profiles(session)
    return [HardwareProfileResponse.model_validate(p) for p in profiles]


@router.post(
    "/estimate",
    response_model=EstimationResult,
    status_code=status.HTTP_200_OK,
    summary="Estimate model memory",
    description="Performs deterministic memory estimation for model, config, and hardware.",
)
async def estimate(
    request: EstimateRequest,
    session: AsyncSession = Depends(get_db),
    hardware_service: HardwareService = Depends(get_hardware_service),
    catalog_service: CatalogService = Depends(get_catalog_service),
) -> EstimationResult:
    """Executes deterministic memory estimation via the pure calculation engine."""
    return await hardware_service.estimate_for_request(
        session=session,
        request=request,
        catalog_service=catalog_service,
    )
