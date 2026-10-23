"""Integration and API tests for the model catalog endpoints and repo_id estimation."""

import json
from collections.abc import Generator
from datetime import UTC
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx
from sqlalchemy.ext.asyncio import AsyncSession

from modelfit.modules.catalog.models import ModelCache
from modelfit.modules.catalog.rate_limiter import catalog_rate_limiter

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "hf"


def load_fixture(name: str) -> dict[str, Any]:
    with open(FIXTURES_DIR / f"{name}.json", encoding="utf-8") as f:
        data: dict[str, Any] = json.load(f)
        return data


@pytest.fixture(autouse=True)
def reset_limiter() -> Generator[None, None, None]:
    catalog_rate_limiter.reset()
    yield
    catalog_rate_limiter.reset()


@pytest.mark.asyncio
async def test_list_models_success(client: httpx.AsyncClient) -> None:

    models_list = load_fixture("models_list")
    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get("https://huggingface.co/api/models").respond(
            200,
            json=models_list,
            headers={"Link": '<https://huggingface.co/api/models?cursor=cur_abc123>; rel="next"'},
        )
        response = await client.get("/api/v1/models?limit=10&sort=downloads")

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert len(data["items"]) == 4
        assert data["items"][0]["id"] == "meta-llama/Meta-Llama-3-8B"
        assert data["next_cursor"] == "cur_abc123"
        assert data["has_more"] is True


@pytest.mark.asyncio
async def test_catalog_rate_limiting(client: httpx.AsyncClient) -> None:

    models_list = load_fixture("models_list")
    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get("https://huggingface.co/api/models").respond(200, json=models_list)

        # Trigger requests up to limiter max_requests (30)
        for _ in range(30):
            res = await client.get("/api/v1/models")
            assert res.status_code == 200

        # The 31st request should be rate limited
        blocked_res = await client.get("/api/v1/models")
        assert blocked_res.status_code == 429
        assert "Retry-After" in blocked_res.headers
        error_envelope = blocked_res.json()
        assert error_envelope["error"]["code"] == "RATE_LIMITED"


@pytest.mark.asyncio
async def test_get_model_detail_and_cache(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:
    llama_data = load_fixture("llama_3_8b")
    repo_id = "meta-llama/Meta-Llama-3-8B"

    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get(f"https://huggingface.co/api/models/{repo_id}").respond(
            200,
            json=llama_data,
        )
        respx_mock.get(f"https://huggingface.co/{repo_id}/raw/main/config.json").respond(
            200,
            json=llama_data["config"],
            headers={"ETag": '"etag-llama3"', "Last-Modified": "Wed, 21 Oct 2026 07:28:00 GMT"},
        )
        # Safetensors range request 404 -> falls back cleanly to derived
        respx_mock.get(f"https://huggingface.co/{repo_id}/resolve/main/model.safetensors").respond(
            404
        )

        response = await client.get(f"/api/v1/models/{repo_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == repo_id
        assert data["author"] == "meta-llama"
        assert data["model_name"] == "Meta-Llama-3-8B"
        assert data["is_supported"] is True
        assert data["param_provenance"] == "derived"
        assert data["normalized_model"]["num_layers"] == 32


@pytest.mark.asyncio
async def test_hub_error_mapping_404(client: httpx.AsyncClient) -> None:
    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get("https://huggingface.co/api/models/nonexistent/model").respond(404)

        response = await client.get("/api/v1/models/nonexistent/model")
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "MODEL_NOT_FOUND"


@pytest.mark.asyncio
async def test_hub_error_mapping_gated_403(client: httpx.AsyncClient) -> None:
    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get("https://huggingface.co/api/models/private/model").respond(403)

        response = await client.get("/api/v1/models/private/model")
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "GATED_REPO"


@pytest.mark.asyncio
async def test_stale_cache_when_hub_is_down(
    client: httpx.AsyncClient, db_session: AsyncSession
) -> None:

    # Pre-populate database cache
    from datetime import datetime, timedelta

    repo_id = "cached/offline-model"
    cache_row = ModelCache(
        hf_model_id=repo_id,
        author="cached",
        model_name="offline-model",
        likes=10,
        downloads=100,
        expires_at=datetime.now(UTC) - timedelta(hours=1),  # Expired!
        raw_config={"num_hidden_layers": 12, "hidden_size": 768, "num_attention_heads": 12},
        normalized_payload={
            "id": repo_id,
            "architecture_name": "offline_arch",
            "architecture_category": "standard_transformer",
            "num_layers": 12,
            "hidden_size": 768,
            "num_attention_heads": 12,
            "total_params": 110000000,
            "tie_word_embeddings": False,
            "attention_variant": "full_mha",
        },
        is_supported=True,
        gated=False,
        param_provenance="config",
    )
    db_session.add(cache_row)
    await db_session.commit()

    # Simulate Hub network error (503 UPSTREAM_UNAVAILABLE)
    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get(f"https://huggingface.co/api/models/{repo_id}").respond(503)

        response = await client.get(f"/api/v1/models/{repo_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == repo_id
        expected_warn = "Hugging Face Hub is unreachable. Serving cached metadata (stale)."
        assert data["warning"] == expected_warn


@pytest.mark.asyncio
async def test_estimate_with_repo_id(client: httpx.AsyncClient) -> None:

    llama_data = load_fixture("llama_3_8b")
    repo_id = "meta-llama/Meta-Llama-3-8B"

    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get(f"https://huggingface.co/api/models/{repo_id}").respond(
            200,
            json=llama_data,
        )
        respx_mock.get(f"https://huggingface.co/{repo_id}/raw/main/config.json").respond(
            200,
            json=llama_data["config"],
        )
        respx_mock.get(f"https://huggingface.co/{repo_id}/resolve/main/model.safetensors").respond(
            404
        )

        payload = {
            "repo_id": repo_id,
            "config": {
                "quantization": "fp16",
                "context_length": 4096,
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

        response = await client.post("/api/v1/estimate", json=payload)
        assert response.status_code == 200
        result = response.json()
        assert "verdict" in result
        assert "total_bytes" in result
        assert result["weights_bytes"] > 0


@pytest.mark.asyncio
async def test_list_models_hub_error_returns_app_error_not_500(
    client: httpx.AsyncClient,
) -> None:
    """Unhandled HTTP error from Hub (e.g. 400 Bad Request) must return AppError, not 500."""
    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get("https://huggingface.co/api/models").respond(
            400,
            json={"error": "Invalid pagination cursor"},
        )
        response = await client.get("/api/v1/models?cursor=bad_cursor")
        assert response.status_code != 500
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] != "INTERNAL_ERROR"


@pytest.mark.asyncio
async def test_list_models_hub_non_list_json_returns_app_error_not_500(
    client: httpx.AsyncClient,
) -> None:
    """Non-list JSON payload from Hub on 200 OK must return AppError, not 500."""
    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get("https://huggingface.co/api/models").respond(
            200,
            json={"unexpected": "dictionary instead of list"},
        )
        response = await client.get("/api/v1/models")
        assert response.status_code != 500
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] != "INTERNAL_ERROR"


@pytest.mark.asyncio
async def test_pagination_cursor_double_encoding_regression(client: httpx.AsyncClient) -> None:
    """Walk 3 pages through the API where Page 2 Link header cursor ends in %3D%3D.

    Assert:
    1. The cursor query parameter received by the Hub on Page 3 equals the raw base64 ending in '=='
       (never '%25' or double-encoded '%253D%253D').
    2. No duplicate model IDs across the 3 pages.
    """
    page1_models = [
        {"id": "author/model-1", "downloads": 100},
        {"id": "author/model-2", "downloads": 90},
    ]
    page2_models = [
        {"id": "author/model-3", "downloads": 80},
        {"id": "author/model-4", "downloads": 70},
    ]
    page3_models = [
        {"id": "author/model-5", "downloads": 60},
        {"id": "author/model-6", "downloads": 50},
    ]

    cursor_page1 = "cursor_without_padding"
    # Raw base64 cursor ending in ==, which HF emits URL-encoded in the Link header as %3D%3D:
    raw_cursor_page2 = "eyIkb3IiOlt7ImRvd25sb2FkcyI6NjY2MDg0NX1dfQ=="
    link_cursor_page2 = "eyIkb3IiOlt7ImRvd25sb2FkcyI6NjY2MDg0NX1dfQ%3D%3D"

    hub_requests: list[httpx.Request] = []

    with respx.mock(assert_all_called=False) as respx_mock:

        def capture_hub_request(request: httpx.Request) -> httpx.Response:
            hub_requests.append(request)
            url_str = str(request.url)

            if "cursor=" not in url_str:
                # Page 1
                link_hdr = f'<https://huggingface.co/api/models?cursor={cursor_page1}>; rel="next"'
                return httpx.Response(200, json=page1_models, headers={"Link": link_hdr})
            elif cursor_page1 in url_str:
                # Page 2
                link_hdr = (
                    f'<https://huggingface.co/api/models?cursor={link_cursor_page2}>; rel="next"'
                )
                return httpx.Response(200, json=page2_models, headers={"Link": link_hdr})
            else:
                # Page 3
                return httpx.Response(200, json=page3_models)

        respx_mock.get("https://huggingface.co/api/models").mock(side_effect=capture_hub_request)

        # 1. Fetch Page 1
        resp1 = await client.get("/api/v1/models?limit=2")
        assert resp1.status_code == 200
        data1 = resp1.json()
        assert len(data1["items"]) == 2
        cursor1 = data1["next_cursor"]
        assert cursor1 == cursor_page1

        # 2. Fetch Page 2
        resp2 = await client.get(f"/api/v1/models?limit=2&cursor={cursor1}")
        assert resp2.status_code == 200
        data2 = resp2.json()
        assert len(data2["items"]) == 2
        cursor2 = data2["next_cursor"]

        # 3. Fetch Page 3 using cursor2 (simulating browser URLSearchParams encoding)
        from urllib.parse import quote

        encoded_cursor2 = quote(cursor2)
        resp3 = await client.get(f"/api/v1/models?limit=2&cursor={encoded_cursor2}")
        assert resp3.status_code == 200
        data3 = resp3.json()
        assert len(data3["items"]) == 2

        # Verify no duplicate model IDs across pages
        all_ids = (
            [m["id"] for m in data1["items"]]
            + [m["id"] for m in data2["items"]]
            + [m["id"] for m in data3["items"]]
        )
        assert len(all_ids) == len(set(all_ids)) == 6

        # Verify Page 3 request sent to the Hub:
        assert len(hub_requests) == 3
        page3_hub_req = hub_requests[2]
        raw_query = page3_hub_req.url.query.decode("ascii")

        # Crucial assertions:
        # 1. Must NOT contain '%25' (double-encoding artifact)
        assert "%25" not in raw_query, f"Double encoding detected in Hub URL: {raw_query}"
        # 2. The cursor query parameter received by the Hub equals raw base64 ending in '=='
        assert page3_hub_req.url.params["cursor"] == raw_cursor_page2
