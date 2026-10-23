"""Estimator module: Pure deterministic memory and fit estimation engine (Phase 2).

This package contains ONLY pure calculation logic and schemas.
No database, HTTP, or framework dependencies are permitted here.
"""

from modelfit.modules.estimator.calculator import (
    calculate_activation_bytes,
    calculate_kv_cache_bytes,
    calculate_runtime_overhead_bytes,
    calculate_weights_bytes,
    estimate_memory,
)
from modelfit.modules.estimator.schemas import (
    ArchitectureCategory,
    AttentionVariant,
    ConfidenceLevel,
    EstimationConfig,
    EstimationResult,
    HardwareKind,
    HardwareProfileInput,
    InferenceRuntime,
    KVCacheDtype,
    MetadataCompleteness,
    NormalizedModel,
    QuantizationFormat,
    Verdict,
)

__all__ = [
    "calculate_weights_bytes",
    "calculate_kv_cache_bytes",
    "calculate_activation_bytes",
    "calculate_runtime_overhead_bytes",
    "estimate_memory",
    "ArchitectureCategory",
    "AttentionVariant",
    "ConfidenceLevel",
    "EstimationConfig",
    "EstimationResult",
    "HardwareKind",
    "HardwareProfileInput",
    "InferenceRuntime",
    "KVCacheDtype",
    "MetadataCompleteness",
    "NormalizedModel",
    "QuantizationFormat",
    "Verdict",
]
