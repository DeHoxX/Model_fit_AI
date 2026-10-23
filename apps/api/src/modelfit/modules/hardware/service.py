"""Business logic service for hardware profiles and estimation execution."""

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any

from sqlalchemy.ext.asyncio import AsyncSession

from modelfit.modules.catalog.schemas import SupportStatus
from modelfit.modules.estimator.calculator import estimate_memory
from modelfit.modules.estimator.schemas import (
    ConfidenceLevel,
    EstimationConfig,
    EstimationResult,
    HardwareProfileInput,
    NormalizedModel,
    Verdict,
)
from modelfit.modules.hardware.models import HardwareProfile
from modelfit.modules.hardware.repository import HardwareRepository

if TYPE_CHECKING:
    from modelfit.modules.catalog.service import CatalogService
    from modelfit.modules.hardware.schemas import EstimateRequest


class HardwareService:
    """Service layer managing hardware profiles and dispatching estimation."""

    def __init__(self, repository: HardwareRepository | None = None) -> None:
        self.repository = repository or HardwareRepository()

    async def list_profiles(self, session: AsyncSession) -> list[HardwareProfile]:
        """Retrieves all stored hardware profiles."""
        profiles = await self.repository.list_profiles(session)
        return list(profiles)

    async def seed_default_presets(self, session: AsyncSession) -> int:
        """Seeds default hardware presets from versioned JSON file idempotently."""
        seed_path = Path(__file__).parent / "seeds" / "hardware_presets.json"
        if not seed_path.exists():
            return 0
        with open(seed_path, encoding="utf-8") as f:
            presets_data: list[dict[str, Any]] = json.load(f)
        return await self.repository.seed_presets(session, presets_data)

    def estimate(
        self,
        model: NormalizedModel,
        config: EstimationConfig,
        hardware: HardwareProfileInput,
    ) -> EstimationResult:
        """Executes pure deterministic memory estimation."""
        return estimate_memory(model, config, hardware)

    async def estimate_for_request(
        self,
        session: AsyncSession,
        request: "EstimateRequest",
        catalog_service: "CatalogService",
    ) -> EstimationResult:
        """Coordinates estimation for an EstimateRequest.

        Handles unsupported or incomplete models cleanly.
        """
        if request.model is not None:
            return self.estimate(request.model, request.config, request.hardware)

        assert request.repo_id is not None
        detail = await catalog_service.get_model_detail(session, request.repo_id)

        if detail.support_status != SupportStatus.SUPPORTED_LLM:
            reason = detail.support_reason_code or "UNSUPPORTED_ARCHITECTURE"
            message = (
                detail.support_reason_message
                or "Model is not supported for memory estimation."
            )
            return EstimationResult(
                weights_bytes=0,
                kv_cache_bytes=0,
                activation_bytes=0,
                runtime_overhead_bytes=0,
                total_bytes=0,
                per_device_bytes=None,
                verdict=Verdict.CANNOT_ESTIMATE,
                headroom_bytes=0,
                assumptions=[],
                warnings=[],
                unsupported_reasons=[f"{reason}: {message}"],
                confidence=ConfidenceLevel.LOW,
            )

        return self.estimate(detail.normalized_model, request.config, request.hardware)
