"""Hypothesis property-based tests for memory estimation invariants."""

from hypothesis import given
from hypothesis import strategies as st

from modelfit.modules.estimator.calculator import (
    calculate_weights_bytes,
    estimate_memory,
)
from modelfit.modules.estimator.schemas import (
    AttentionVariant,
    EstimationConfig,
    HardwareKind,
    HardwareProfileInput,
    InferenceRuntime,
    KVCacheDtype,
    NormalizedModel,
    QuantizationFormat,
)

model_strategy = st.builds(
    NormalizedModel,
    id=st.just("hypo-model"),
    architecture_name=st.just("transformer"),
    total_params=st.integers(min_value=10_000_000, max_value=500_000_000_000),
    num_layers=st.integers(min_value=1, max_value=128),
    hidden_size=st.integers(min_value=256, max_value=16384),
    num_attention_heads=st.integers(min_value=1, max_value=64),
    num_kv_heads=st.integers(min_value=1, max_value=64),
    head_dim=st.integers(min_value=32, max_value=256),
    attention_variant=st.sampled_from(list(AttentionVariant)),
)

hardware_strategy = st.builds(
    HardwareProfileInput,
    name=st.just("Test Hardware"),
    memory_bytes=st.integers(min_value=1_000_000_000, max_value=1_000_000_000_000),
    kind=st.sampled_from(list(HardwareKind)),
    reserved_memory_bytes=st.integers(min_value=0, max_value=500_000_000),
)


@given(
    model=model_strategy,
    quant=st.sampled_from(list(QuantizationFormat)),
    kv_dtype=st.sampled_from(list(KVCacheDtype)),
    ctx=st.integers(min_value=128, max_value=65536),
    batch=st.integers(min_value=1, max_value=16),
    runtime=st.sampled_from(list(InferenceRuntime)),
    hardware=hardware_strategy,
)
def test_hypothesis_invariants(
    model: NormalizedModel,
    quant: QuantizationFormat,
    kv_dtype: KVCacheDtype,
    ctx: int,
    batch: int,
    runtime: InferenceRuntime,
    hardware: HardwareProfileInput,
) -> None:
    """Hypothesis invariant checks:

    1. Total equals sum of parts.
    2. All memory values are non-negative.
    """
    config = EstimationConfig(
        quantization=quant,
        kv_cache_dtype=kv_dtype,
        context_length=ctx,
        batch_size=batch,
        runtime=runtime,
    )
    res = estimate_memory(model, config, hardware)

    # 1. Total equals exact sum of parts
    assert res.total_bytes == (
        res.weights_bytes + res.kv_cache_bytes + res.activation_bytes + res.runtime_overhead_bytes
    )

    # 2. Memory is strictly non-negative
    assert res.weights_bytes >= 0
    assert res.kv_cache_bytes >= 0
    assert res.activation_bytes >= 0
    assert res.runtime_overhead_bytes >= 0
    assert res.total_bytes >= 0


@given(
    model=model_strategy,
    quant=st.sampled_from(list(QuantizationFormat)),
    ctx1=st.integers(min_value=512, max_value=4096),
    ctx2=st.integers(min_value=4097, max_value=16384),
    hardware=hardware_strategy,
)
def test_hypothesis_context_monotonicity(
    model: NormalizedModel,
    quant: QuantizationFormat,
    ctx1: int,
    ctx2: int,
    hardware: HardwareProfileInput,
) -> None:
    """Hypothesis: Larger context length never decreases total memory."""
    # Ensure sliding window does not cap both to the same size
    model.attention_variant = AttentionVariant.FULL_MHA

    cfg1 = EstimationConfig(
        quantization=quant,
        context_length=ctx1,
    )
    cfg2 = EstimationConfig(
        quantization=quant,
        context_length=ctx2,
    )

    res1 = estimate_memory(model, cfg1, hardware)
    res2 = estimate_memory(model, cfg2, hardware)

    assert res2.total_bytes >= res1.total_bytes
    assert res2.kv_cache_bytes >= res1.kv_cache_bytes


@given(
    model=model_strategy,
    params=st.integers(min_value=1_000_000, max_value=100_000_000_000),
)
def test_hypothesis_quantization_bit_order(
    model: NormalizedModel,
    params: int,
) -> None:
    """Hypothesis: Lower bits per weight never increases weights bytes."""
    model.total_params = params

    cfg_fp32 = EstimationConfig(quantization=QuantizationFormat.FP32, context_length=1024)
    cfg_fp16 = EstimationConfig(quantization=QuantizationFormat.FP16, context_length=1024)
    cfg_int8 = EstimationConfig(quantization=QuantizationFormat.INT8, context_length=1024)
    cfg_q4 = EstimationConfig(quantization=QuantizationFormat.Q4_0, context_length=1024)

    w_fp32 = calculate_weights_bytes(model, cfg_fp32)
    w_fp16 = calculate_weights_bytes(model, cfg_fp16)
    w_int8 = calculate_weights_bytes(model, cfg_int8)
    w_q4 = calculate_weights_bytes(model, cfg_q4)

    assert w_fp32 >= w_fp16
    assert w_fp16 >= w_int8
    assert w_int8 >= w_q4
