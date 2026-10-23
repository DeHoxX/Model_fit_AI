"""Pure deterministic estimation calculation engine.

Strictly isolated from FastAPI, SQLAlchemy, HTTP, and external databases.
Follows all formulas and mathematical models documented in docs/ESTIMATOR.md.
"""

from modelfit.modules.estimator.constants import (
    ACTIVATION_BASE_BYTES,
    BITS_PER_WEIGHT,
    KV_CACHE_BYTES_PER_ELEMENT,
    REASON_MISSING_ATTENTION_HEADS,
    REASON_MISSING_HIDDEN_SIZE,
    REASON_MISSING_LAYER_COUNT,
    REASON_MISSING_TOTAL_PARAMS,
    REASON_UNSUPPORTED_HYBRID,
    REASON_UNSUPPORTED_MLA,
    REASON_UNSUPPORTED_MULTIMODAL,
    REASON_UNSUPPORTED_SSM,
    RUNTIME_OVERHEAD_BYTES,
    VERDICT_FITS_THRESHOLD,
    VERDICT_TIGHT_THRESHOLD,
    WARNING_VLLM_PREALLOCATION,
)
from modelfit.modules.estimator.schemas import (
    ArchitectureCategory,
    AttentionVariant,
    ConfidenceLevel,
    EstimationConfig,
    EstimationResult,
    HardwareProfileInput,
    InferenceRuntime,
    NormalizedModel,
    Verdict,
)


def calculate_weights_bytes(model: NormalizedModel, config: EstimationConfig) -> int:
    """Calculates model weights footprint in bytes.

    For MoE models, always uses total_params, not active_params, because all expert
    tensors must reside in memory.
    """
    if model.total_params is None:
        raise ValueError("Cannot calculate weights: total_params is missing")
    bpw = BITS_PER_WEIGHT[config.quantization]
    return int((model.total_params * bpw) / 8)


def calculate_kv_cache_bytes(
    model: NormalizedModel,
    config: EstimationConfig,
    assumptions: list[str],
) -> int:
    """Calculates Key-Value cache memory footprint in bytes.

    Formula: 2 * num_layers * kv_heads * head_dim * cached_tokens * batch_size * bytes_per_element
    """
    if model.num_layers is None:
        raise ValueError("Cannot calculate KV cache: num_layers is missing")

    # Resolve KV heads
    if model.num_kv_heads is not None:
        kv_heads = model.num_kv_heads
    elif model.num_attention_heads is not None:
        kv_heads = model.num_attention_heads
        assumptions.append("Assuming num_kv_heads equals num_attention_heads (Full MHA)")
    else:
        raise ValueError("Cannot calculate KV cache: attention head counts are missing")

    # Resolve head dimension
    if model.head_dim is not None:
        head_dim = model.head_dim
    elif model.hidden_size is not None and model.num_attention_heads is not None:
        head_dim = model.hidden_size // model.num_attention_heads
        assumptions.append("Calculated head_dim as hidden_size / num_attention_heads")
    else:
        raise ValueError("Cannot calculate KV cache: head_dim could not be determined")

    # Resolve cached token count (sliding window cap)
    if (
        model.attention_variant == AttentionVariant.SLIDING_WINDOW
        and model.sliding_window_size is not None
    ):
        cached_tokens = min(config.context_length, model.sliding_window_size)
    else:
        cached_tokens = config.context_length

    bytes_per_elem = KV_CACHE_BYTES_PER_ELEMENT[config.kv_cache_dtype]

    return int(
        2
        * model.num_layers
        * kv_heads
        * head_dim
        * cached_tokens
        * config.batch_size
        * bytes_per_elem
    )


def calculate_activation_bytes(model: NormalizedModel, config: EstimationConfig) -> int:
    """Calculates inference activation memory workspace in bytes."""
    if model.hidden_size is None or model.num_layers is None:
        raise ValueError("Cannot calculate activations: hidden_size or num_layers is missing")

    base = ACTIVATION_BASE_BYTES[config.runtime]

    if config.runtime == InferenceRuntime.TRANSFORMERS:
        # Conservative forward-only inference activation buffer
        factor = 0.05
        dynamic = int(
            2
            * config.batch_size
            * config.context_length
            * model.hidden_size
            * model.num_layers
            * factor
        )
    else:
        # llama.cpp dynamic ring buffer / vLLM activation workspace
        dynamic = config.batch_size * config.context_length * model.hidden_size * 2

    return base + dynamic


def calculate_runtime_overhead_bytes(config: EstimationConfig) -> int:
    """Calculates fixed runtime framework and driver overhead in bytes."""
    return RUNTIME_OVERHEAD_BYTES[config.runtime]


def estimate_memory(
    model: NormalizedModel,
    config: EstimationConfig,
    hardware: HardwareProfileInput,
) -> EstimationResult:
    """Pure entrypoint: executes deterministic memory estimation for a given model,

    configuration, and hardware profile.
    """
    assumptions: list[str] = []
    warnings: list[str] = []
    unsupported_reasons: list[str] = []

    # 1. Audit architecture support
    if model.architecture_category == ArchitectureCategory.MLA:
        unsupported_reasons.append(REASON_UNSUPPORTED_MLA)
    elif model.architecture_category == ArchitectureCategory.SSM:
        unsupported_reasons.append(REASON_UNSUPPORTED_SSM)
    elif model.architecture_category == ArchitectureCategory.HYBRID:
        unsupported_reasons.append(REASON_UNSUPPORTED_HYBRID)
    elif model.architecture_category == ArchitectureCategory.MULTIMODAL:
        unsupported_reasons.append(REASON_UNSUPPORTED_MULTIMODAL)

    # 2. Audit metadata completeness
    completeness = model.check_completeness()
    if not completeness.is_complete:
        if "total_params" in completeness.missing_fields:
            unsupported_reasons.append(REASON_MISSING_TOTAL_PARAMS)
        if "num_layers" in completeness.missing_fields:
            unsupported_reasons.append(REASON_MISSING_LAYER_COUNT)
        if "hidden_size" in completeness.missing_fields:
            unsupported_reasons.append(REASON_MISSING_HIDDEN_SIZE)
        if "num_attention_heads" in completeness.missing_fields:
            unsupported_reasons.append(REASON_MISSING_ATTENTION_HEADS)

    # If unsupported or missing fields: return cannot_estimate cleanly without raising
    if unsupported_reasons:
        return EstimationResult(
            weights_bytes=0,
            kv_cache_bytes=0,
            activation_bytes=0,
            runtime_overhead_bytes=0,
            total_bytes=0,
            per_device_bytes=None,
            verdict=Verdict.CANNOT_ESTIMATE,
            headroom_bytes=0,
            assumptions=assumptions,
            warnings=warnings,
            unsupported_reasons=unsupported_reasons,
            confidence=ConfidenceLevel.LOW,
        )

    # 3. Check context length overflow warning
    if model.max_context_length is not None and config.context_length > model.max_context_length:
        warnings.append(
            f"Requested context length ({config.context_length}) exceeds model max_context_length "
            f"({model.max_context_length}). "
            "May cause degraded output or attention extrapolation errors."
        )

    # 4. Check runtime specific warnings
    if config.runtime == InferenceRuntime.VLLM:
        warnings.append(WARNING_VLLM_PREALLOCATION)

    # 5. Calculate component memory footprints
    weights_bytes = calculate_weights_bytes(model, config)
    kv_cache_bytes = calculate_kv_cache_bytes(model, config, assumptions)
    activation_bytes = calculate_activation_bytes(model, config)
    runtime_overhead_bytes = calculate_runtime_overhead_bytes(config)
    total_bytes = weights_bytes + kv_cache_bytes + activation_bytes + runtime_overhead_bytes

    # 6. Tensor Parallelism / Multi-GPU sharding
    per_device_bytes: int | None = None
    if config.tensor_parallel_degree > 1:
        tp = config.tensor_parallel_degree
        if model.num_kv_heads is not None and model.num_kv_heads % tp != 0:
            warnings.append(
                f"num_kv_heads ({model.num_kv_heads}) is not evenly divisible by "
                f"tensor_parallel_degree ({tp}). May cause head imbalance across GPUs."
            )
        sharded_weights = weights_bytes // tp
        sharded_kv = kv_cache_bytes // tp
        sharded_acts = activation_bytes // tp
        per_device_bytes = sharded_weights + sharded_kv + sharded_acts + runtime_overhead_bytes

    # 7. Usable Memory and Fit Verdict
    usable_memory = hardware.memory_bytes - hardware.reserved_memory_bytes
    comparison_bytes = per_device_bytes if per_device_bytes is not None else total_bytes

    usage_ratio = comparison_bytes / usable_memory if usable_memory > 0 else float("inf")

    if usage_ratio <= VERDICT_FITS_THRESHOLD:
        verdict = Verdict.FITS
    elif usage_ratio <= VERDICT_TIGHT_THRESHOLD:
        verdict = Verdict.FITS_TIGHT
    else:
        verdict = Verdict.DOES_NOT_FIT

    headroom_bytes = usable_memory - comparison_bytes

    # 8. Confidence level derivation:
    # 0 assumptions -> HIGH, 1 assumption -> MEDIUM, 2+ assumptions -> LOW
    num_assumptions = len(assumptions)
    if num_assumptions == 0:
        confidence = ConfidenceLevel.HIGH
    elif num_assumptions == 1:
        confidence = ConfidenceLevel.MEDIUM
    else:
        confidence = ConfidenceLevel.LOW

    return EstimationResult(
        weights_bytes=weights_bytes,
        kv_cache_bytes=kv_cache_bytes,
        activation_bytes=activation_bytes,
        runtime_overhead_bytes=runtime_overhead_bytes,
        total_bytes=total_bytes,
        per_device_bytes=per_device_bytes,
        verdict=verdict,
        headroom_bytes=headroom_bytes,
        assumptions=assumptions,
        warnings=warnings,
        unsupported_reasons=[],
        confidence=confidence,
    )
