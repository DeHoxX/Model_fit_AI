"""Deterministic classification pipeline for Hugging Face model support.

Classifies every Hugging Face model into exactly one of:
- supported_llm
- unsupported_architecture
- unsupported_modality
- incomplete_metadata

Follows strict rules documented in docs/ESTIMATOR.md without any external dependencies.
"""

from typing import Any

from modelfit.modules.catalog.schemas import SupportStatus

# Non-text modalities identified by pipeline_tag
NON_TEXT_PIPELINES: set[str] = {
    "text-to-image",
    "image-to-text",
    "image-to-image",
    "image-classification",
    "image-segmentation",
    "object-detection",
    "zero-shot-image-classification",
    "automatic-speech-recognition",
    "audio-classification",
    "audio-to-audio",
    "text-to-audio",
    "text-to-speech",
    "voice-activity-detection",
    "text-to-video",
    "video-classification",
    "depth-estimation",
    "robotics",
}

# Encoder-only pipelines and architectures where autoregressive KV-cache does not apply
ENCODER_PIPELINES: set[str] = {
    "fill-mask",
    "sentence-similarity",
    "feature-extraction",
    "token-classification",
}

ENCODER_ARCHITECTURES: set[str] = {
    "bertmodel",
    "bertformaskedlm",
    "bertforsequenceclassification",
    "robertamodel",
    "robertaformaskedlm",
    "robertaforsequenceclassification",
    "albertmodel",
    "debertamodel",
    "debertav2model",
    "distilbertmodel",
    "electramodel",
    "camembertmodel",
    "xlmrobertamodel",
}

# Whitelist of known autoregressive decoder LLM families
KNOWN_DECODER_FAMILIES: set[str] = {
    "qwen",
    "qwen2",
    "qwen3",
    "llama",
    "mistral",
    "gemma",
    "gemma2",
    "phi",
    "phi3",
    "mixtral",
    "starcoder",
    "starcoder2",
    "deepseek",
    "command-r",
    "olmo",
    "falcon",
    "bloom",
    "opt",
    "gpt",
    "gpt2",
    "gpt_neox",
    "gptj",
    "internlm",
    "internlm2",
    "stablelm",
}


def classify_model_support(
    pipeline_tag: str | None,
    raw_config: dict[str, Any] | None,
    config_missing: bool = False,
    is_malformed: bool = False,
) -> tuple[SupportStatus, str | None, str | None]:
    """Determines exact SupportStatus, reason code, and user-facing message for any model."""
    # 1. Missing or unparseable config
    if config_missing or raw_config is None:
        return (
            SupportStatus.INCOMPLETE_METADATA,
            "MISSING_CONFIG",
            "Repository does not contain a standard config.json.",
        )

    if is_malformed:
        return (
            SupportStatus.INCOMPLETE_METADATA,
            "MALFORMED_CONFIG",
            "The repository config.json could not be parsed as valid JSON.",
        )

    # 2. Check for non-text pipeline tag
    clean_tag = (pipeline_tag or "").strip().lower()
    if clean_tag in NON_TEXT_PIPELINES:
        return (
            SupportStatus.UNSUPPORTED_MODALITY,
            "UNSUPPORTED_MODALITY",
            f"The '{clean_tag}' modality is not supported for memory estimation.",
        )

    # Extract architecture string and model_type
    architectures = raw_config.get("architectures", [])
    arch_str = architectures[0] if architectures and isinstance(architectures, list) else ""
    arch_lower = arch_str.lower()
    model_type = str(raw_config.get("model_type", "")).lower()

    # 3. Check for encoder-only embeddings or masked LMs
    if clean_tag in ENCODER_PIPELINES or any(enc in arch_lower for enc in ENCODER_ARCHITECTURES):
        return (
            SupportStatus.UNSUPPORTED_MODALITY,
            "UNSUPPORTED_ENCODER_ONLY",
            "Encoder-only architecture; autoregressive KV-cache estimation does not apply.",
        )

    # 4. Check for unsupported state-space / SSM / MLA / Multimodal
    if "mamba" in arch_lower or model_type == "mamba" or "ssm" in raw_config.get("tags", []):
        return (
            SupportStatus.UNSUPPORTED_ARCHITECTURE,
            "UNSUPPORTED_ARCHITECTURE",
            "State-space / Mamba architectures are not currently supported.",
        )

    if (
        "deepseekv2" in arch_lower
        or "deepseek_v2" in model_type
        or "kv_lora_rank" in raw_config
    ):
        return (
            SupportStatus.UNSUPPORTED_ARCHITECTURE,
            "UNSUPPORTED_ARCHITECTURE",
            "Multi-head Latent Attention (MLA) architectures are not currently supported.",
        )

    if "vision_config" in raw_config or "llava" in arch_lower or "multimodal" in model_type:
        return (
            SupportStatus.UNSUPPORTED_ARCHITECTURE,
            "UNSUPPORTED_ARCHITECTURE",
            "Multimodal architectures are not currently supported.",
        )

    # 5. Check if decoder architecture is recognized
    is_decoder = (
        arch_lower.endswith("forcausallm")
        or arch_lower.endswith("lmheadmodel")
        or any(fam in arch_lower or fam in model_type for fam in KNOWN_DECODER_FAMILIES)
    )

    if not is_decoder and arch_str:
        return (
            SupportStatus.UNSUPPORTED_ARCHITECTURE,
            "UNSUPPORTED_ARCHITECTURE",
            f"Architecture '{arch_str}' is not a recognized causal decoder LLM.",
        )

    # 6. Check completeness of essential fields
    num_layers = (
        raw_config.get("num_hidden_layers")
        or raw_config.get("n_layer")
        or raw_config.get("num_layers")
    )
    hidden_size = (
        raw_config.get("hidden_size") or raw_config.get("d_model") or raw_config.get("n_embd")
    )
    num_heads = (
        raw_config.get("num_attention_heads")
        or raw_config.get("n_head")
        or raw_config.get("num_heads")
    )

    if num_layers is None or hidden_size is None or num_heads is None:
        missing_parts: list[str] = []
        if num_layers is None:
            missing_parts.append("num_layers")
        if hidden_size is None:
            missing_parts.append("hidden_size")
        if num_heads is None:
            missing_parts.append("num_attention_heads")
        missing_str = ", ".join(missing_parts)
        return (
            SupportStatus.INCOMPLETE_METADATA,
            "INCOMPLETE_METADATA",
            f"Model config is missing essential architecture dimensions: {missing_str}.",
        )

    # Passes all gates: supported causal decoder LLM
    return SupportStatus.SUPPORTED_LLM, None, None
