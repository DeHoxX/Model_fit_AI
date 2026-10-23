"""Unit tests for Hugging Face configuration normalizer."""

import json
from pathlib import Path
from typing import Any

from modelfit.modules.catalog.normalizer import normalize_hf_config
from modelfit.modules.estimator.schemas import ArchitectureCategory, AttentionVariant

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "hf"


def load_fixture(name: str) -> dict[str, Any]:
    with open(FIXTURES_DIR / f"{name}.json", encoding="utf-8") as f:
        data: dict[str, Any] = json.load(f)
        return data


def test_normalize_llama3_8b() -> None:

    data = load_fixture("llama_3_8b")
    config = data["config"]
    normalized, provenance = normalize_hf_config(
        repo_id=data["id"],
        raw_config=config,
        safetensors_params=8_030_261_248,
    )

    assert normalized.id == "meta-llama/Meta-Llama-3-8B"
    assert normalized.architecture_category == ArchitectureCategory.STANDARD_TRANSFORMER
    assert normalized.attention_variant == AttentionVariant.GROUPED_QUERY
    assert normalized.num_layers == 32
    assert normalized.hidden_size == 4096
    assert normalized.num_attention_heads == 32
    assert normalized.num_kv_heads == 8
    assert normalized.head_dim == 128
    assert normalized.total_params == 8_030_261_248
    assert provenance == "safetensors"
    assert normalized.check_completeness().is_complete is True


def test_normalize_mistral_7b_sliding_window() -> None:
    data = load_fixture("mistral_7b")
    config = data["config"]
    normalized, provenance = normalize_hf_config(
        repo_id=data["id"],
        raw_config=config,
    )

    assert normalized.id == "mistralai/Mistral-7B-v0.1"
    assert normalized.attention_variant == AttentionVariant.SLIDING_WINDOW
    assert normalized.sliding_window_size == 4096
    assert normalized.architecture_category == ArchitectureCategory.STANDARD_TRANSFORMER
    assert provenance == "derived"
    assert normalized.total_params is not None
    assert normalized.total_params > 5_000_000_000


def test_normalize_mixtral_8x7b_moe() -> None:
    data = load_fixture("mixtral_8x7b")
    config = data["config"]
    normalized, provenance = normalize_hf_config(
        repo_id=data["id"],
        raw_config=config,
    )

    assert normalized.id == "mistralai/Mixtral-8x7B-v0.1"
    assert normalized.architecture_category == ArchitectureCategory.MOE
    assert normalized.num_experts == 8
    assert normalized.experts_per_token == 2
    assert normalized.active_params is not None
    assert normalized.total_params is not None
    assert normalized.active_params < normalized.total_params
    assert provenance == "derived"


def test_normalize_falcon_7b_mqa() -> None:
    data = load_fixture("falcon_7b")
    config = data["config"]
    normalized, provenance = normalize_hf_config(
        repo_id=data["id"],
        raw_config=config,
    )

    assert normalized.id == "tiiuae/falcon-7b"
    assert normalized.attention_variant == AttentionVariant.MULTI_QUERY
    assert normalized.num_kv_heads == 1


def test_normalize_deepseek_v2_mla_unsupported() -> None:
    data = load_fixture("deepseek_v2")
    config = data["config"]
    normalized, provenance = normalize_hf_config(
        repo_id=data["id"],
        raw_config=config,
    )

    assert normalized.architecture_category == ArchitectureCategory.MLA


def test_normalize_mamba_ssm_unsupported() -> None:
    data = load_fixture("mamba_130m")
    config = data["config"]
    normalized, provenance = normalize_hf_config(
        repo_id=data["id"],
        raw_config=config,
    )

    assert normalized.architecture_category == ArchitectureCategory.SSM
