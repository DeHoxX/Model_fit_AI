"""Deterministic normalization pipeline mapping Hugging Face Hub metadata to NormalizedModel.

Ensures the estimator never sees raw Hugging Face JSON structures.
"""

from typing import Any

from modelfit.modules.estimator.schemas import (
    ArchitectureCategory,
    AttentionVariant,
    NormalizedModel,
)


def normalize_hf_config(
    repo_id: str,
    raw_config: dict[str, Any] | None,
    safetensors_params: int | None = None,
) -> tuple[NormalizedModel, str]:
    """Normalizes Hugging Face config.json and optional safetensors metadata into NormalizedModel.

    Returns (NormalizedModel, provenance_string).
    """
    if not raw_config:
        return (
            NormalizedModel(
                id=repo_id,
                architecture_name="Unknown",
                architecture_category=ArchitectureCategory.STANDARD_TRANSFORMER,
                total_params=safetensors_params,
                active_params=safetensors_params,
            ),
            "safetensors" if safetensors_params else "derived",
        )

    architectures = raw_config.get("architectures", [])
    arch_str = architectures[0] if architectures else raw_config.get("model_type", "unknown")
    model_type = raw_config.get("model_type", "").lower()


    # 1. Determine Architecture Category
    if (
        "deepseekv2" in arch_str.lower()
        or "deepseek_v2" in model_type
        or "kv_lora_rank" in raw_config
    ):
        arch_cat = ArchitectureCategory.MLA
    elif (
        "mamba" in arch_str.lower() or model_type == "mamba" or "ssm" in raw_config.get("tags", [])
    ):
        arch_cat = ArchitectureCategory.SSM
    elif (
        "mixtral" in arch_str.lower()
        or "moe" in arch_str.lower()
        or "num_local_experts" in raw_config
        or "num_experts" in raw_config
    ):
        arch_cat = ArchitectureCategory.MOE
    elif "vision_config" in raw_config or "llava" in arch_str.lower() or "multimodal" in model_type:
        arch_cat = ArchitectureCategory.MULTIMODAL
    else:
        arch_cat = ArchitectureCategory.STANDARD_TRANSFORMER

    # 2. Layer count
    num_layers = (
        raw_config.get("num_hidden_layers")
        or raw_config.get("n_layer")
        or raw_config.get("num_layers")
    )

    # 3. Hidden size
    hidden_size = (
        raw_config.get("hidden_size") or raw_config.get("d_model") or raw_config.get("n_embd")
    )

    # 4. Attention heads
    num_heads = raw_config.get("num_attention_heads") or raw_config.get("n_head")

    # 5. KV heads & Attention Variant
    multi_query = raw_config.get("multi_query", False)
    num_kv_heads = (
        raw_config.get("num_key_value_heads")
        or raw_config.get("n_head_kv")
        or (1 if multi_query else None)
    )

    sliding_window = raw_config.get("sliding_window") or raw_config.get("sliding_window_size")

    if sliding_window is not None and sliding_window > 0:
        attn_variant = AttentionVariant.SLIDING_WINDOW
    elif multi_query or num_kv_heads == 1:
        attn_variant = AttentionVariant.MULTI_QUERY
    elif num_kv_heads is not None and num_heads is not None and num_kv_heads < num_heads:
        attn_variant = AttentionVariant.GROUPED_QUERY
    else:
        attn_variant = AttentionVariant.FULL_MHA

    # 6. Head dimension
    head_dim = raw_config.get("head_dim")
    if head_dim is None and hidden_size is not None and num_heads is not None and num_heads > 0:
        head_dim = hidden_size // num_heads

    # 7. Max Context Length
    max_context = (
        raw_config.get("max_position_embeddings")
        or raw_config.get("max_sequence_length")
        or raw_config.get("seq_length")
        or raw_config.get("n_positions")
    )

    # 8. MoE Experts
    num_experts = raw_config.get("num_local_experts") or raw_config.get("num_experts")
    experts_per_tok = raw_config.get("num_experts_per_tok") or raw_config.get("experts_per_token")

    # 9. Parameters Count & Provenance
    total_params: int | None
    if safetensors_params is not None and safetensors_params > 0:
        total_params = safetensors_params
        provenance = "safetensors"
    elif "num_parameters" in raw_config:
        total_params = int(raw_config["num_parameters"])
        provenance = "config"
    else:
        # Standard analytical heuristic calculation for parameter counts
        total_params = estimate_params_from_dimensions(
            num_layers=num_layers,
            hidden_size=hidden_size,
            vocab_size=raw_config.get("vocab_size", 32000),
            intermediate_size=raw_config.get("intermediate_size"),
            num_experts=num_experts,
        )
        provenance = "derived"

    active_params = total_params
    if arch_cat == ArchitectureCategory.MOE and num_experts and experts_per_tok and total_params:
        # Active parameters estimate for MoE
        active_params = int(total_params * (experts_per_tok / num_experts))

    normalized = NormalizedModel(
        id=repo_id,
        architecture_name=arch_str,
        architecture_category=arch_cat,
        total_params=total_params,
        active_params=active_params,
        num_layers=num_layers,
        hidden_size=hidden_size,
        num_attention_heads=num_heads,
        num_kv_heads=num_kv_heads,
        head_dim=head_dim,
        vocab_size=raw_config.get("vocab_size"),
        max_context_length=max_context,
        intermediate_size=raw_config.get("intermediate_size"),
        tie_word_embeddings=raw_config.get("tie_word_embeddings", False),
        num_experts=num_experts,
        experts_per_token=experts_per_tok,
        attention_variant=attn_variant,
        sliding_window_size=sliding_window,
    )

    return normalized, provenance


def estimate_params_from_dimensions(
    num_layers: int | None,
    hidden_size: int | None,
    vocab_size: int = 32000,
    intermediate_size: int | None = None,
    num_experts: int | None = None,
) -> int | None:
    """Calculates theoretical transformer parameter count when safetensors header is absent."""
    if num_layers is None or hidden_size is None:
        return None

    # Embeddings
    emb_params = vocab_size * hidden_size

    # Intermediate MLP size (standard LLaMA is ~3.5x hidden_size if not specified)
    d_ff = intermediate_size or int(hidden_size * 3.5)

    # Per layer: self_attention (4 * hidden^2) + MLP (3 * hidden * d_ff for SwiGLU)
    experts_mult = num_experts if num_experts and num_experts > 1 else 1
    layer_params = (4 * hidden_size * hidden_size) + (3 * hidden_size * d_ff * experts_mult)

    total = emb_params + (num_layers * layer_params)
    return total
