"""Unit tests for the pure memory estimation engine.

Verifies the six hand-calculated test vectors, fallback mechanisms,
unsupported architectures, and edge conditions with complete arithmetic shown.
"""

from modelfit.modules.estimator.calculator import (
    estimate_memory,
)
from modelfit.modules.estimator.constants import (
    REASON_MISSING_ATTENTION_HEADS,
    REASON_MISSING_HIDDEN_SIZE,
    REASON_MISSING_LAYER_COUNT,
    REASON_MISSING_TOTAL_PARAMS,
    REASON_UNSUPPORTED_HYBRID,
    REASON_UNSUPPORTED_MLA,
    REASON_UNSUPPORTED_MULTIMODAL,
    REASON_UNSUPPORTED_SSM,
)
from modelfit.modules.estimator.schemas import (
    ArchitectureCategory,
    AttentionVariant,
    ConfidenceLevel,
    EstimationConfig,
    HardwareKind,
    HardwareProfileInput,
    InferenceRuntime,
    KVCacheDtype,
    NormalizedModel,
    QuantizationFormat,
    Verdict,
)


def test_vector_1_dense_mha() -> None:
    """Test Vector 1: Dense Multi-Head Attention (Llama-1 7B style).

    Exact Arithmetic:
    - total_params = 6,738,415,616
    - layers = 32, heads = 32, kv_heads = 32, head_dim = 128, hidden_size = 4096
    - Quantization: FP16 (16.0 bpw = 2.0 bytes/param)
      weights = 6,738,415,616 * 2 = 13,476,831,232 bytes (~12.55 GiB)
    - KV Cache: FP16 (2 bytes/elem), context = 2048, batch = 1
      kv_cache = 2 * 32 * 32 * 128 * 2048 * 1 * 2 = 1,073,741,824 bytes (1.00 GiB)
    - Runtime Overhead (llama.cpp): 256 MiB = 268,435,456 bytes
    - Activations (llama.cpp):
      base (128 MiB = 134,217,728) + 1 * 2048 * 4096 * 2 (16,777,216) = 150,994,944 bytes
    - Total:
      13,476,831,232 + 1,073,741,824 + 268,435,456 + 150,994,944 = 14,970,003,456 bytes (~13.94 GiB)
    - Hardware: RTX 3060 12GB (12,884,901,888 bytes, 536,870,912 reserved -> 12,348,030,976 usable)
    - Verdict: does_not_fit
    """
    model = NormalizedModel(
        id="llama-7b",
        architecture_name="llama",
        total_params=6_738_415_616,
        num_layers=32,
        hidden_size=4096,
        num_attention_heads=32,
        num_kv_heads=32,
        head_dim=128,
        attention_variant=AttentionVariant.FULL_MHA,
    )
    config = EstimationConfig(
        quantization=QuantizationFormat.FP16,
        kv_cache_dtype=KVCacheDtype.FP16,
        context_length=2048,
        batch_size=1,
        runtime=InferenceRuntime.LLAMA_CPP,
    )
    hardware = HardwareProfileInput(
        name="RTX 3060 12GB",
        memory_bytes=12_884_901_888,
        kind=HardwareKind.GPU,
        reserved_memory_bytes=536_870_912,
    )

    result = estimate_memory(model, config, hardware)

    assert result.weights_bytes == 13_476_831_232
    assert result.kv_cache_bytes == 1_073_741_824
    assert result.runtime_overhead_bytes == 268_435_456
    assert result.activation_bytes == 150_994_944
    assert result.total_bytes == 14_970_003_456
    assert result.verdict == Verdict.DOES_NOT_FIT
    assert result.headroom_bytes == (12_884_901_888 - 536_870_912) - 14_970_003_456
    assert result.confidence == ConfidenceLevel.HIGH


def test_vector_2_grouped_query_attention() -> None:
    """Test Vector 2: Grouped-Query Attention (Llama-3 8B style).

    Exact Arithmetic:
    - total_params = 8,030,000,000
    - layers = 32, heads = 32, kv_heads = 8, head_dim = 128, hidden_size = 4096
    - Quantization: Q4_K_M (4.85 bpw = 4.85 / 8 = 0.60625 bytes/param)
      weights = 8,030,000,000 * (4.85 / 8) = 4,868,187,500 bytes (~4.53 GiB)
    - KV Cache: FP16 (2 bytes/elem), context = 8192, batch = 1
      kv_cache = 2 * 32 * 8 * 128 * 8192 * 1 * 2 = 1,073,741,824 bytes (1.00 GiB)
    - Runtime Overhead (llama.cpp): 256 MiB = 268,435,456 bytes
    - Activations (llama.cpp):
      base (128 MiB = 134,217,728) + 1 * 8192 * 4096 * 2 (67,108,864) = 201,326,592 bytes
    - Total:
      4,868,187,500 + 1,073,741,824 + 268,435,456 + 201,326,592 = 6,411,691,372 bytes (~5.97 GiB)
    - Hardware: RTX 3060 12GB (12,884_901_888 bytes, 536_870_912 reserved -> 12,348,030,976 usable)
      Usage ratio = 6,411,691,372 / 12,348,030,976 = ~0.519 (<= 0.90)
    - Verdict: fits
    """
    model = NormalizedModel(
        id="llama-3-8b",
        architecture_name="llama",
        total_params=8_030_000_000,
        num_layers=32,
        hidden_size=4096,
        num_attention_heads=32,
        num_kv_heads=8,
        head_dim=128,
        attention_variant=AttentionVariant.GROUPED_QUERY,
    )
    config = EstimationConfig(
        quantization=QuantizationFormat.Q4_K_M,
        kv_cache_dtype=KVCacheDtype.FP16,
        context_length=8192,
        batch_size=1,
        runtime=InferenceRuntime.LLAMA_CPP,
    )
    hardware = HardwareProfileInput(
        name="RTX 3060 12GB",
        memory_bytes=12_884_901_888,
        kind=HardwareKind.GPU,
        reserved_memory_bytes=536_870_912,
    )

    result = estimate_memory(model, config, hardware)

    assert result.weights_bytes == 4_868_187_500
    assert result.kv_cache_bytes == 1_073_741_824
    assert result.runtime_overhead_bytes == 268_435_456
    assert result.activation_bytes == 201_326_592
    assert result.total_bytes == 6_411_691_372
    assert result.verdict == Verdict.FITS
    assert result.headroom_bytes == (12_884_901_888 - 536_870_912) - 6_411_691_372
    assert result.confidence == ConfidenceLevel.HIGH


def test_vector_3_multi_query_attention() -> None:
    """Test Vector 3: Multi-Query Attention (Falcon 7B style).

    Exact Arithmetic:
    - total_params = 7,000,000,000
    - layers = 32, heads = 64, kv_heads = 1, head_dim = 64, hidden_size = 4096
    - Quantization: INT8 (8.0 bpw = 1.0 byte/param)
      weights = 7,000,000,000 * 1 = 7,000,000,000 bytes
    - KV Cache: INT8 (1 byte/elem), context = 2048, batch = 1
      kv_cache = 2 * 32 * 1 * 64 * 2048 * 1 * 1 = 8,388,608 bytes (8.0 MiB)
    - Runtime Overhead (llama.cpp): 268,435,456 bytes
    - Activations (llama.cpp): 134,217,728 + 1 * 2048 * 4096 * 2 = 150,994,944 bytes
    - Total: 7,000,000,000 + 8,388,608 + 268,435,456 + 150,994,944 = 7,427,819,008 bytes
    """
    model = NormalizedModel(
        id="falcon-7b",
        architecture_name="falcon",
        total_params=7_000_000_000,
        num_layers=32,
        hidden_size=4096,
        num_attention_heads=64,
        num_kv_heads=1,
        head_dim=64,
        attention_variant=AttentionVariant.MULTI_QUERY,
    )
    config = EstimationConfig(
        quantization=QuantizationFormat.INT8,
        kv_cache_dtype=KVCacheDtype.INT8,
        context_length=2048,
        batch_size=1,
        runtime=InferenceRuntime.LLAMA_CPP,
    )
    hardware = HardwareProfileInput(
        name="RTX 4090",
        memory_bytes=25_769_803_776,
        kind=HardwareKind.GPU,
        reserved_memory_bytes=1_073_741_824,
    )

    result = estimate_memory(model, config, hardware)

    assert result.weights_bytes == 7_000_000_000
    assert result.kv_cache_bytes == 8_388_608
    assert result.total_bytes == 7_427_819_008
    assert result.verdict == Verdict.FITS


def test_vector_4_moe_uses_total_params() -> None:
    """Test Vector 4: Mixture of Experts (Mixtral 8x7B style).

    Verifies that MoE architectures allocate memory for total_params, not active_params.
    - total_params = 46,700,000,000, active_params = 12,900,000,000
    - Quantization: Q4_0 (4.5 bpw)
      weights = 46,700,000,000 * 4.5 / 8 = 26,268,750,000 bytes
    """
    model = NormalizedModel(
        id="mixtral-8x7b",
        architecture_name="mixtral",
        architecture_category=ArchitectureCategory.MOE,
        total_params=46_700_000_000,
        active_params=12_900_000_000,
        num_layers=32,
        hidden_size=4096,
        num_attention_heads=32,
        num_kv_heads=8,
        head_dim=128,
        num_experts=8,
        experts_per_token=2,
    )
    config = EstimationConfig(
        quantization=QuantizationFormat.Q4_0,
        kv_cache_dtype=KVCacheDtype.FP16,
        context_length=4096,
        batch_size=1,
        runtime=InferenceRuntime.LLAMA_CPP,
    )
    hardware = HardwareProfileInput(
        name="NVIDIA A100-PCIE-80GB",
        memory_bytes=85_899_345_920,
        kind=HardwareKind.GPU,
    )

    result = estimate_memory(model, config, hardware)

    assert result.weights_bytes == 26_268_750_000
    # Ensure active_params was NOT used
    assert result.weights_bytes != int(12_900_000_000 * 4.5 / 8)


def test_vector_5_sliding_window_attention() -> None:
    """Test Vector 5: Sliding-Window Attention (Mistral 7B style).

    Verifies KV cache capping at sliding_window_size.
    - layers = 32, kv_heads = 8, head_dim = 128, sliding_window_size = 4096
    - context_length = 32768 (8x window size)
    - cached_tokens = min(32768, 4096) = 4096
    - KV Cache = 2 * 32 * 8 * 128 * 4096 * 1 * 2 = 536,870,912 bytes (512 MiB)
    """
    model = NormalizedModel(
        id="mistral-7b",
        architecture_name="mistral",
        total_params=7_240_000_000,
        num_layers=32,
        hidden_size=4096,
        num_attention_heads=32,
        num_kv_heads=8,
        head_dim=128,
        attention_variant=AttentionVariant.SLIDING_WINDOW,
        sliding_window_size=4096,
    )
    config = EstimationConfig(
        quantization=QuantizationFormat.FP16,
        kv_cache_dtype=KVCacheDtype.FP16,
        context_length=32768,
        batch_size=1,
        runtime=InferenceRuntime.LLAMA_CPP,
    )
    hardware = HardwareProfileInput(
        name="RTX 4090",
        memory_bytes=25_769_803_776,
        kind=HardwareKind.GPU,
    )

    result = estimate_memory(model, config, hardware)

    assert result.kv_cache_bytes == 536_870_912
    # Without sliding window, 32768 tokens would be 4,294,967,296 bytes
    assert result.kv_cache_bytes != 4_294_967_296


def test_vector_6_tiny_edge_model() -> None:
    """Test Vector 6: Tiny Edge Model (SmolLM-135M style).

    - total_params = 135,000,000, layers = 30, heads = 9, kv_heads = 3,
      head_dim = 64, hidden_size = 576
    - Quantization: FP16 (2.0 bytes/param)

      weights = 135,000,000 * 2 = 270,000,000 bytes (~257.5 MiB)
    - Tested on 2GB Raspberry Pi / low-resource board
    """
    model = NormalizedModel(
        id="smollm-135m",
        architecture_name="llama",
        total_params=135_000_000,
        num_layers=30,
        hidden_size=576,
        num_attention_heads=9,
        num_kv_heads=3,
        head_dim=64,
    )
    config = EstimationConfig(
        quantization=QuantizationFormat.FP16,
        kv_cache_dtype=KVCacheDtype.FP16,
        context_length=2048,
        batch_size=1,
        runtime=InferenceRuntime.LLAMA_CPP,
    )
    hardware = HardwareProfileInput(
        name="Low RAM Board",
        memory_bytes=2 * 1024 * 1024 * 1024,
        kind=HardwareKind.CPU_RAM,
        reserved_memory_bytes=256 * 1024 * 1024,
    )

    result = estimate_memory(model, config, hardware)

    assert result.weights_bytes == 270_000_000
    assert result.verdict == Verdict.FITS


def test_unsupported_architectures_return_cannot_estimate_never_raise() -> None:
    """Ensures MLA, SSM, Hybrid, and Multimodal return cannot_estimate without throwing."""
    config = EstimationConfig(
        quantization=QuantizationFormat.FP16,
        context_length=2048,
    )
    hardware = HardwareProfileInput(
        name="GPU",
        memory_bytes=16 * 1024 * 1024 * 1024,
    )

    categories = [
        (ArchitectureCategory.MLA, REASON_UNSUPPORTED_MLA),
        (ArchitectureCategory.SSM, REASON_UNSUPPORTED_SSM),
        (ArchitectureCategory.HYBRID, REASON_UNSUPPORTED_HYBRID),
        (ArchitectureCategory.MULTIMODAL, REASON_UNSUPPORTED_MULTIMODAL),
    ]

    for cat, reason in categories:
        model = NormalizedModel(
            id=f"test-{cat.value}",
            architecture_name=cat.value,
            architecture_category=cat,
            total_params=7_000_000_000,
            num_layers=32,
            hidden_size=4096,
            num_attention_heads=32,
        )
        res = estimate_memory(model, config, hardware)
        assert res.verdict == Verdict.CANNOT_ESTIMATE
        assert reason in res.unsupported_reasons
        assert res.headroom_bytes == 0
        assert res.confidence == ConfidenceLevel.LOW


def test_missing_metadata_returns_cannot_estimate_never_raise() -> None:
    """Missing essential fields cleanly returns cannot_estimate with explicit reason codes."""
    config = EstimationConfig(
        quantization=QuantizationFormat.FP16,
        context_length=2048,
    )
    hardware = HardwareProfileInput(
        name="GPU",
        memory_bytes=16 * 1024 * 1024 * 1024,
    )

    # Missing total_params
    m1 = NormalizedModel(
        id="m1",
        architecture_name="llama",
        num_layers=32,
        hidden_size=4096,
        num_attention_heads=32,
    )
    res1 = estimate_memory(m1, config, hardware)
    assert res1.verdict == Verdict.CANNOT_ESTIMATE
    assert REASON_MISSING_TOTAL_PARAMS in res1.unsupported_reasons

    # Missing num_layers
    m2 = NormalizedModel(
        id="m2",
        architecture_name="llama",
        total_params=7_000_000_000,
        hidden_size=4096,
        num_attention_heads=32,
    )
    res2 = estimate_memory(m2, config, hardware)
    assert res2.verdict == Verdict.CANNOT_ESTIMATE
    assert REASON_MISSING_LAYER_COUNT in res2.unsupported_reasons

    # Missing hidden_size
    m3 = NormalizedModel(
        id="m3",
        architecture_name="llama",
        total_params=7_000_000_000,
        num_layers=32,
        num_attention_heads=32,
    )
    res3 = estimate_memory(m3, config, hardware)
    assert res3.verdict == Verdict.CANNOT_ESTIMATE
    assert REASON_MISSING_HIDDEN_SIZE in res3.unsupported_reasons

    # Missing num_attention_heads
    m4 = NormalizedModel(
        id="m4",
        architecture_name="llama",
        total_params=7_000_000_000,
        num_layers=32,
        hidden_size=4096,
    )
    res4 = estimate_memory(m4, config, hardware)
    assert res4.verdict == Verdict.CANNOT_ESTIMATE
    assert REASON_MISSING_ATTENTION_HEADS in res4.unsupported_reasons


def test_head_dim_fallback_and_confidence_levels() -> None:
    """Verifies that missing head_dim falls back safely to hidden_size / num_attention_heads

    and drops confidence from HIGH to MEDIUM.
    """
    model = NormalizedModel(
        id="fallback-model",
        architecture_name="llama",
        total_params=7_000_000_000,
        num_layers=32,
        hidden_size=4096,
        num_attention_heads=32,
        num_kv_heads=32,
        # head_dim omitted
    )
    config = EstimationConfig(
        quantization=QuantizationFormat.FP16,
        context_length=2048,
    )
    hardware = HardwareProfileInput(
        name="GPU",
        memory_bytes=24 * 1024 * 1024 * 1024,
    )

    res = estimate_memory(model, config, hardware)
    assert res.verdict == Verdict.FITS
    assert len(res.assumptions) == 1
    assert "Calculated head_dim as hidden_size / num_attention_heads" in res.assumptions[0]
    assert res.confidence == ConfidenceLevel.MEDIUM

    # Omit num_kv_heads too -> 2 assumptions -> confidence LOW
    model2 = NormalizedModel(
        id="fallback-model-2",
        architecture_name="llama",
        total_params=7_000_000_000,
        num_layers=32,
        hidden_size=4096,
        num_attention_heads=32,
        # both num_kv_heads and head_dim omitted
    )
    res2 = estimate_memory(model2, config, hardware)
    assert len(res2.assumptions) == 2
    assert res2.confidence == ConfidenceLevel.LOW


def test_context_length_warning_when_exceeding_max() -> None:
    """Appends explicit warning if requested context exceeds model max_context_length."""
    model = NormalizedModel(
        id="context-test",
        architecture_name="llama",
        total_params=7_000_000_000,
        num_layers=32,
        hidden_size=4096,
        num_attention_heads=32,
        head_dim=128,
        max_context_length=4096,
    )
    config = EstimationConfig(
        quantization=QuantizationFormat.FP16,
        context_length=8192,
    )
    hardware = HardwareProfileInput(
        name="GPU",
        memory_bytes=24 * 1024 * 1024 * 1024,
    )

    res = estimate_memory(model, config, hardware)
    assert any("exceeds model max_context_length" in w for w in res.warnings)


def test_tensor_parallelism_sharding_and_validation() -> None:
    """Verifies multi-GPU sharding calculation and validation."""
    model = NormalizedModel(
        id="tp-model",
        architecture_name="llama",
        total_params=8_000_000_000,
        num_layers=32,
        hidden_size=4096,
        num_attention_heads=32,
        num_kv_heads=8,
        head_dim=128,
    )
    config = EstimationConfig(
        quantization=QuantizationFormat.FP16,
        context_length=2048,
        gpu_count=2,
        tensor_parallel_degree=2,
    )
    hardware = HardwareProfileInput(
        name="2x RTX 4090",
        memory_bytes=24 * 1024 * 1024 * 1024,
    )

    res = estimate_memory(model, config, hardware)
    assert res.per_device_bytes is not None
    # Each device holds weights/2 + kv/2 + act/2 + overhead
    expected_device_bytes = (
        res.weights_bytes // 2
        + res.kv_cache_bytes // 2
        + res.activation_bytes // 2
        + res.runtime_overhead_bytes
    )
    assert res.per_device_bytes == expected_device_bytes
