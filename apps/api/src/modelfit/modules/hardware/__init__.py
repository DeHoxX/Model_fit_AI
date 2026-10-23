"""Hardware module: Hardware profiles and memory estimation router (Phase 2)."""

from modelfit.modules.hardware.models import HardwareProfile
from modelfit.modules.hardware.repository import HardwareRepository
from modelfit.modules.hardware.router import router
from modelfit.modules.hardware.schemas import (
    CustomHardwareInput,
    EstimateRequest,
    HardwareProfileResponse,
)
from modelfit.modules.hardware.service import HardwareService

__all__ = [
    "HardwareProfile",
    "HardwareRepository",
    "HardwareService",
    "HardwareProfileResponse",
    "CustomHardwareInput",
    "EstimateRequest",
    "router",
]
