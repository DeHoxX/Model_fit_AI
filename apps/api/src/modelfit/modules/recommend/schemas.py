from typing import Literal

from pydantic import BaseModel, Field

from modelfit.modules.estimator.schemas import (
    EstimationResult,
    HardwareProfileInput,
    QuantizationFormat,
    ResolvedHardware,
)


class RequirementSpec(BaseModel):
    """Structured requirements extracted from user conversation or direct API call."""

    task: Literal["general", "coding", "reasoning", "writing"] | None = Field(
        default=None,
        description="Target use case for the model.",
    )
    hardware: HardwareProfileInput | None = Field(
        default=None,
        description="Target hardware device specifications.",
    )
    memory_budget_bytes: int | None = Field(
        default=None,
        description="Explicit memory budget in bytes if no hardware profile name is known.",
    )
    max_context: int = Field(
        default=8192,
        ge=512,
        le=131072,
        description="Target maximum context length in tokens.",
    )
    quantization_preference: QuantizationFormat = Field(
        default=QuantizationFormat.Q4_K_M,
        description="Preferred quantization precision.",
    )
    license_preference: Literal["permissive", "open_weights", "any"] = Field(
        default="any",
        description="License filtering preference.",
    )
    size_range: tuple[float, float] | None = Field(
        default=None,
        description="Parameter size range in billions of parameters (min_b, max_b).",
    )
    language_needs: list[str] | None = Field(
        default=None,
        description="Specific natural or programming language needs.",
    )


class ScoringBreakdown(BaseModel):
    """Detailed score components calculated for a candidate."""

    headroom_score: float = Field(ge=0.0, le=1.0)
    downloads_score: float = Field(ge=0.0, le=1.0)
    recency_score: float = Field(ge=0.0, le=1.0)
    license_score: float = Field(ge=0.0, le=1.0)
    total_score: float = Field(ge=0.0, le=1.0)


class RecommendationCandidate(BaseModel):
    """A ranked model candidate with its deterministic estimate and score breakdown."""

    model_id: str
    model_name: str
    author: str
    pipeline_tag: str
    license: str | None
    estimate: EstimationResult
    verdict: str
    warnings: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    scoring: ScoringBreakdown
    rank_reasons: list[str] = Field(default_factory=list)
    quantization: str = "q4_k_m"
    kv_cache_dtype: str = "fp16"
    runtime: str = "llama_cpp"
    context_length: int = 8192
    resolved_hardware: ResolvedHardware | None = None


class ClarificationNeeded(BaseModel):
    """Returned when essential requirements (hardware or task) are missing."""

    needs_clarification: bool = True
    missing_fields: list[str]
    message: str


class RecommendationResponse(BaseModel):
    """Full deterministic recommendation response."""

    recommendations: list[RecommendationCandidate]
    dropped_oom_count: int = 0
    dropped_unsupported_count: int = 0
    unsupported_reasons: list[str] = Field(default_factory=list)
    warning: str | None = None
