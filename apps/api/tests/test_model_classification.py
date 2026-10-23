"""Regression and classification tests for model support detection.

Verifies:
1. Hub info 200 + config.json 404 returns API 200 with MISSING_CONFIG, not 404.
2. Truly missing repo (Hub info 404) stays 404.
3. Estimating an unsupported or incomplete model returns verdict: cannot_estimate.
4. Decoder whitelist covers Qwen3, Llama, Gemma, Phi, and MoE.
5. Encoder-only, Whisper, Mamba, and image models are properly categorized.
"""

from typing import Any

import httpx
import pytest
import respx

# Test fixtures for different architectures
# 1. Real Hub capture: Qwen3 decoder LLM
QWEN3_CONFIG: dict[str, Any] = {
    "architectures": ["Qwen3ForCausalLM"],
    "model_type": "qwen3",
    "num_hidden_layers": 28,
    "hidden_size": 1024,
    "num_attention_heads": 16,
    "num_key_value_heads": 8,
    "vocab_size": 151936,
}

# 2. Real Hub capture: Llama-style decoder LLM
LLAMA_CONFIG: dict[str, Any] = {
    "architectures": ["LlamaForCausalLM"],
    "model_type": "llama",
    "num_hidden_layers": 32,
    "hidden_size": 4096,
    "num_attention_heads": 32,
    "num_key_value_heads": 8,
    "vocab_size": 32000,
}

# 3. Hand-written fixture: Gemma-style decoder LLM
GEMMA_CONFIG: dict[str, Any] = {
    "architectures": ["Gemma2ForCausalLM"],
    "model_type": "gemma2",
    "num_hidden_layers": 26,
    "hidden_size": 2304,
    "num_attention_heads": 8,
    "num_key_value_heads": 4,
    "vocab_size": 256000,
}

# 4. Hand-written fixture: Phi-style decoder LLM
PHI_CONFIG: dict[str, Any] = {
    "architectures": ["Phi3ForCausalLM"],
    "model_type": "phi3",
    "num_hidden_layers": 32,
    "hidden_size": 3072,
    "num_attention_heads": 32,
    "num_key_value_heads": 32,
    "vocab_size": 32064,
}

# 5. Hand-written fixture: Mixtral MoE decoder LLM
MIXTRAL_CONFIG: dict[str, Any] = {
    "architectures": ["MixtralForCausalLM"],
    "model_type": "mixtral",
    "num_hidden_layers": 32,
    "hidden_size": 4096,
    "num_attention_heads": 32,
    "num_key_value_heads": 8,
    "num_local_experts": 8,
    "num_experts_per_tok": 2,
    "vocab_size": 32000,
}

# 6. Real Hub capture: BERT encoder-only model
BERT_CONFIG: dict[str, Any] = {
    "architectures": ["BertModel"],
    "model_type": "bert",
    "num_hidden_layers": 12,
    "hidden_size": 768,
    "num_attention_heads": 12,
    "vocab_size": 30522,
}

# 7. Real Hub capture: Whisper speech model
WHISPER_CONFIG: dict[str, Any] = {
    "architectures": ["WhisperForConditionalGeneration"],
    "model_type": "whisper",
    "num_hidden_layers": 12,
    "hidden_size": 768,
    "vocab_size": 51865,
}

# 8. Real Hub capture: Mamba SSM model
MAMBA_CONFIG: dict[str, Any] = {
    "architectures": ["MambaForCausalLM"],
    "model_type": "mamba",
    "num_hidden_layers": 24,
    "hidden_size": 768,
    "vocab_size": 50280,
}


@pytest.mark.asyncio
async def test_missing_config_returns_200_incomplete_metadata(client: httpx.AsyncClient) -> None:
    """Repo info 200 + config.json 404 must return API 200 with MISSING_CONFIG, not 404."""
    repo_id = "test-org/image-model"
    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get(f"https://huggingface.co/api/models/{repo_id}").respond(
            200,
            json={
                "id": repo_id,
                "author": "test-org",
                "model_name": "image-model",
                "likes": 5,
                "downloads": 50,
                "tags": ["diffusion"],
            },
        )
        respx_mock.get(f"https://huggingface.co/{repo_id}/raw/main/config.json").respond(404)
        respx_mock.get(f"https://huggingface.co/{repo_id}/resolve/main/model.safetensors").respond(404)

        resp = await client.get(f"/api/v1/models/{repo_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["support_status"] == "incomplete_metadata"
        assert data["support_reason_code"] == "MISSING_CONFIG"
        assert data["is_supported"] is False


@pytest.mark.asyncio
async def test_truly_missing_repo_returns_404(client: httpx.AsyncClient) -> None:
    """Truly missing repo (first Hub info call 404) must return 404 MODEL_NOT_FOUND."""
    repo_id = "nonexistent/deleted-repo"
    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get(f"https://huggingface.co/api/models/{repo_id}").respond(404)

        resp = await client.get(f"/api/v1/models/{repo_id}")
        assert resp.status_code == 404
        data = resp.json()
        assert data["error"]["code"] == "MODEL_NOT_FOUND"


@pytest.mark.asyncio
async def test_estimate_unsupported_model_returns_cannot_estimate(
    client: httpx.AsyncClient,
) -> None:
    """POST /estimate with repo_id for unsupported model returns cannot_estimate verdict."""
    repo_id = "test-org/bert-model"
    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get(f"https://huggingface.co/api/models/{repo_id}").respond(
            200,
            json={"id": repo_id, "pipeline_tag": "sentence-similarity"},
        )
        respx_mock.get(f"https://huggingface.co/{repo_id}/raw/main/config.json").respond(
            200, json=BERT_CONFIG
        )
        respx_mock.get(f"https://huggingface.co/{repo_id}/resolve/main/model.safetensors").respond(404)

        payload = {
            "repo_id": repo_id,
            "config": {
                "quantization": "fp16",
                "context_length": 512,
                "batch_size": 1,
                "runtime": "llama_cpp",
                "gpu_count": 1,
                "tensor_parallel_degree": 1,
            },
            "hardware": {
                "name": "RTX 4090",
                "memory_bytes": 25769803776,
                "kind": "gpu",
                "reserved_memory_bytes": 1073741824,
            },
        }

        resp = await client.post("/api/v1/estimate", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["verdict"] == "cannot_estimate"
        assert len(data["unsupported_reasons"]) > 0


@pytest.mark.parametrize(
    ("repo_id", "config", "expected_status", "expected_reason"),
    [
        ("org/qwen", QWEN3_CONFIG, "supported_llm", None),
        ("org/llama", LLAMA_CONFIG, "supported_llm", None),
        ("org/gemma", GEMMA_CONFIG, "supported_llm", None),
        ("org/phi", PHI_CONFIG, "supported_llm", None),
        ("org/mixtral", MIXTRAL_CONFIG, "supported_llm", None),
        ("org/bert", BERT_CONFIG, "unsupported_modality", "UNSUPPORTED_ENCODER_ONLY"),
        ("org/whisper", WHISPER_CONFIG, "unsupported_modality", "UNSUPPORTED_MODALITY"),
        ("org/mamba", MAMBA_CONFIG, "unsupported_architecture", "UNSUPPORTED_ARCHITECTURE"),
    ],
)
@pytest.mark.asyncio
async def test_architecture_classification(
    client: httpx.AsyncClient,
    repo_id: str,
    config: dict[str, Any],
    expected_status: str,
    expected_reason: str | None,
) -> None:
    """Verifies deterministic classification across decoder LLMs, encoders, audio, and SSMs."""
    if "Whisper" in str(config.get("architectures")):
        pipeline_tag = "automatic-speech-recognition"
    elif "Bert" in str(config.get("architectures")):
        pipeline_tag = "sentence-similarity"
    else:
        pipeline_tag = "text-generation"

    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get(f"https://huggingface.co/api/models/{repo_id}").respond(
            200,
            json={"id": repo_id, "pipeline_tag": pipeline_tag},
        )
        respx_mock.get(f"https://huggingface.co/{repo_id}/raw/main/config.json").respond(
            200, json=config
        )
        respx_mock.get(f"https://huggingface.co/{repo_id}/resolve/main/model.safetensors").respond(404)

        resp = await client.get(f"/api/v1/models/{repo_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["support_status"] == expected_status
        assert data["support_reason_code"] == expected_reason
        assert data["is_supported"] == (expected_status == "supported_llm")
