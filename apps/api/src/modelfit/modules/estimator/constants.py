"""Deterministic memory estimation constants and lookup tables.

All constants, threshold ratios, and lookup tables live strictly in this file.
Formulas, derivations, and source citations are documented in docs/ESTIMATOR.md.
"""

from typing import Final

from modelfit.modules.estimator.schemas import (
    InferenceRuntime,
    KVCacheDtype,
    QuantizationFormat,
)

# Bits per weight for each quantization format
# Documented in docs/ESTIMATOR.md
BITS_PER_WEIGHT: Final[dict[QuantizationFormat, float]] = {
    QuantizationFormat.FP32: 32.0,
    QuantizationFormat.FP16: 16.0,
    QuantizationFormat.BF16: 16.0,
    QuantizationFormat.INT8: 8.0,
    QuantizationFormat.Q8_0: 8.5,
    QuantizationFormat.Q5_K_M: 5.5,  # TODO(verify)
    QuantizationFormat.Q4_K_M: 4.85,
    QuantizationFormat.Q4_K_S: 4.5,
    QuantizationFormat.Q4_0: 4.5,
    QuantizationFormat.Q4_1: 5.0,
    QuantizationFormat.AWQ_4BIT: 4.5,  # TODO(verify)
    QuantizationFormat.GPTQ_4BIT: 4.5,  # TODO(verify)
}

# Bytes per element stored in Key and Value caches
KV_CACHE_BYTES_PER_ELEMENT: Final[dict[KVCacheDtype, int]] = {
    KVCacheDtype.FP16: 2,
    KVCacheDtype.BF16: 2,
    KVCacheDtype.FP8: 1,
    KVCacheDtype.INT8: 1,
}

# Base activation workspace memory in bytes per runtime
# TODO(verify)
ACTIVATION_BASE_BYTES: Final[dict[InferenceRuntime, int]] = {
    InferenceRuntime.LLAMA_CPP: 128 * 1024 * 1024,  # 128 MiB dynamic scratch buffer
    InferenceRuntime.VLLM: 256 * 1024 * 1024,  # 256 MiB batching workspace
    InferenceRuntime.TRANSFORMERS: 0,
}

# Fixed runtime driver, context, and framework memory overhead in bytes
# TODO(verify)
RUNTIME_OVERHEAD_BYTES: Final[dict[InferenceRuntime, int]] = {
    InferenceRuntime.LLAMA_CPP: 256 * 1024 * 1024,  # 256 MiB CUDA/Metal context
    InferenceRuntime.VLLM: 1024 * 1024 * 1024,  # 1024 MiB PyTorch/NCCL context
    InferenceRuntime.TRANSFORMERS: 512 * 1024 * 1024,  # 512 MiB PyTorch context
}

# Fit verdict thresholds relative to usable memory
VERDICT_FITS_THRESHOLD: Final[float] = 0.90
VERDICT_TIGHT_THRESHOLD: Final[float] = 1.00

# Error reason codes for cannot_estimate
REASON_MISSING_TOTAL_PARAMS: Final[str] = "MISSING_TOTAL_PARAMS"
REASON_MISSING_LAYER_COUNT: Final[str] = "MISSING_LAYER_COUNT"
REASON_MISSING_HIDDEN_SIZE: Final[str] = "MISSING_HIDDEN_SIZE"
REASON_MISSING_ATTENTION_HEADS: Final[str] = "MISSING_ATTENTION_HEADS"
REASON_UNSUPPORTED_MLA: Final[str] = "UNSUPPORTED_ARCHITECTURE_MLA"
REASON_UNSUPPORTED_SSM: Final[str] = "UNSUPPORTED_ARCHITECTURE_SSM"
REASON_UNSUPPORTED_HYBRID: Final[str] = "UNSUPPORTED_ARCHITECTURE_HYBRID"
REASON_UNSUPPORTED_MULTIMODAL: Final[str] = "UNSUPPORTED_ARCHITECTURE_MULTIMODAL"

# Runtime warnings
WARNING_VLLM_PREALLOCATION: Final[str] = (
    "vLLM default configuration (gpu_memory_utilization = 0.90) pre-allocates 90% of GPU VRAM "
    "at startup for its KV cache block pool. This calculation reflects theoretical required memory."
)
