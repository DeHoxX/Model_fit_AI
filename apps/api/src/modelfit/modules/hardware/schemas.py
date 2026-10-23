"""Pydantic schemas for hardware module and estimation requests."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from modelfit.modules.estimator.schemas import (
    EstimationConfig,
    HardwareKind,
    HardwareProfileInput,
    NormalizedModel,
)


class HardwareProfileResponse(BaseModel):
    """Stored hardware preset response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    kind: str
    memory_bytes: int
    reserved_memory_bytes: int
    source_url: str | None = None
    is_verified: bool
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class CustomHardwareInput(BaseModel):
    """Validation schema for user ad-hoc custom hardware profiles (not stored in DB)."""

    model_config = ConfigDict(extra="forbid")

    name: str = "Custom Hardware Profile"
    memory_gib: float = Field(gt=0, description="Memory size in GiB")
    reserved_memory_gib: float = Field(default=0, ge=0, description="Reserved memory in GiB")
    kind: HardwareKind = HardwareKind.GPU

    def to_hardware_profile_input(self) -> HardwareProfileInput:
        """Converts GiB input into exact integer byte specification."""
        gib_to_bytes = 1024 * 1024 * 1024
        return HardwareProfileInput(
            name=self.name,
            memory_bytes=int(self.memory_gib * gib_to_bytes),
            kind=self.kind,
            reserved_memory_bytes=int(self.reserved_memory_gib * gib_to_bytes),
        )


class EstimateRequest(BaseModel):
    """Request payload for memory estimation."""

    model_config = ConfigDict(extra="forbid")

    model: NormalizedModel | None = None
    repo_id: str | None = None
    config: EstimationConfig
    hardware: HardwareProfileInput

    @model_validator(mode="after")
    def validate_model_or_repo_id(self) -> "EstimateRequest":
        if self.model is None and self.repo_id is None:
            raise ValueError("Either 'model' or 'repo_id' must be provided.")
        return self
