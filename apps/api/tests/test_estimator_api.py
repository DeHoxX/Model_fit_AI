"""Integration tests for the hardware and memory estimation API endpoints."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from modelfit.modules.hardware.service import HardwareService


@pytest.mark.asyncio
async def test_get_hardware_empty_and_seeded(
    client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    """Tests GET /api/v1/hardware before and after idempotent seeding."""
    # 1. Initial list may be empty in in-memory test DB
    response = await client.get("/api/v1/hardware")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

    # 2. Seed presets via service
    service = HardwareService()
    seeded_count = await service.seed_default_presets(db_session)
    assert seeded_count == 6

    # 3. Retrieve list and verify contents
    response = await client.get("/api/v1/hardware")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 6
    names = [item["name"] for item in data]
    assert "NVIDIA GeForce RTX 3060 12GB" in names
    assert "NVIDIA A100-PCIE-80GB" in names
    assert "Apple Mac 16GB Unified" in names

    # 4. Verify idempotent seeding (re-run does not duplicate)
    reseed_count = await service.seed_default_presets(db_session)
    assert reseed_count == 6
    response2 = await client.get("/api/v1/hardware")
    assert len(response2.json()) == 6


@pytest.mark.asyncio
async def test_post_estimate_success(client: AsyncClient) -> None:
    """Tests successful POST /api/v1/estimate endpoint."""
    payload = {
        "model": {
            "id": "llama-3-8b",
            "architecture_name": "llama",
            "total_params": 8_030_000_000,
            "num_layers": 32,
            "hidden_size": 4096,
            "num_attention_heads": 32,
            "num_kv_heads": 8,
            "head_dim": 128,
            "attention_variant": "grouped_query",
        },
        "config": {
            "quantization": "q4_k_m",
            "kv_cache_dtype": "fp16",
            "context_length": 8192,
            "batch_size": 1,
            "runtime": "llama_cpp",
        },
        "hardware": {
            "name": "RTX 3060 12GB",
            "memory_bytes": 12_884_901_888,
            "kind": "gpu",
            "reserved_memory_bytes": 536_870_912,
        },
    }

    response = await client.post("/api/v1/estimate", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["weights_bytes"] == 4_868_187_500
    assert data["kv_cache_bytes"] == 1_073_741_824
    assert data["total_bytes"] == 6_411_691_372
    assert data["verdict"] == "fits"
    assert data["confidence"] == "high"


@pytest.mark.asyncio
async def test_post_estimate_validation_error_envelope(client: AsyncClient) -> None:
    """Verifies that invalid payloads return 422 with the standardized error envelope."""
    invalid_payload = {
        "model": {
            "id": "bad-model",
            "architecture_name": "llama",
        },
        "config": {
            "quantization": "fp16",
            "context_length": -100,  # Invalid: must be gt 0
        },
        "hardware": {
            "name": "GPU",
            "memory_bytes": 1000,
        },
    }

    response = await client.post("/api/v1/estimate", json=invalid_payload)
    assert response.status_code == 422
    body = response.json()
    assert "error" in body
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert "request_id" in body["error"]
