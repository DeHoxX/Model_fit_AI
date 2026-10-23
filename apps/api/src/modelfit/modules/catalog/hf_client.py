"""Asynchronous HTTP client for interacting with the Hugging Face Hub API.

Enforces:
- Safetensors header inspection via HTTP Range requests (never downloads weights).
- Error mapping to domain AppErrors:
  MODEL_NOT_FOUND, GATED_REPO, HF_RATE_LIMITED, UPSTREAM_UNAVAILABLE.
- Transparent caching-friendly headers (ETag, If-None-Match).
"""

import json
import math
import re
import struct
from typing import Any, cast
from urllib.parse import unquote

import httpx
import structlog

from modelfit.core.config import settings
from modelfit.core.errors import AppError

logger = structlog.get_logger(__name__)

HF_API_BASE = "https://huggingface.co/api"
HF_HUB_BASE = "https://huggingface.co"


class HubClient:
    """Async client for querying Hugging Face models and inspecting metadata headers."""

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client
        self._token = settings.HF_TOKEN

    def _get_headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        headers: dict[str, str] = {
            "User-Agent": f"ModelFit/{settings.APP_VERSION}",
            "Accept": "application/json",
        }
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        if extra:
            headers.update(extra)
        return headers

    async def _request(
        self,
        method: str,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        timeout: float = 10.0,
    ) -> httpx.Response:
        req_headers = self._get_headers(headers)
        try:
            if self._client:
                response = await self._client.request(
                    method, url, params=params, headers=req_headers, timeout=timeout
                )
            else:
                async with httpx.AsyncClient(follow_redirects=True) as client:
                    response = await client.request(
                        method, url, params=params, headers=req_headers, timeout=timeout
                    )
        except (httpx.TimeoutException, httpx.ConnectError, httpx.NetworkError) as exc:
            logger.warning("hf_hub_network_error", url=url, error=str(exc))
            raise AppError(
                code="UPSTREAM_UNAVAILABLE",
                message="Hugging Face Hub is unreachable.",
                status_code=503,
            ) from exc

        if response.status_code == 404:
            raise AppError(
                code="MODEL_NOT_FOUND",
                message=f"Requested resource at '{url}' was not found on Hugging Face Hub.",
                status_code=404,
            )
        elif response.status_code in (401, 403):
            raise AppError(
                code="GATED_REPO",
                message="Resource is gated or private. Access is restricted.",
                status_code=403,
            )
        elif response.status_code == 429:
            retry_after = response.headers.get("Retry-After", "60")
            raise AppError(
                code="HF_RATE_LIMITED",
                message="Upstream Hugging Face rate limit exceeded.",
                status_code=429,
                details={"retry_after": retry_after},
                headers={"Retry-After": retry_after},
            )
        elif response.status_code >= 500:
            raise AppError(
                code="UPSTREAM_UNAVAILABLE",
                message=f"Hugging Face Hub returned upstream error ({response.status_code}).",
                status_code=502,
            )
        elif response.status_code != 200:
            # Handle client errors like 400 Bad Request (e.g. invalid pagination cursor)
            error_msg = f"Hugging Face Hub returned status {response.status_code}."
            try:
                err_data = response.json()
                if isinstance(err_data, dict) and "error" in err_data:
                    error_msg = str(err_data["error"])
            except Exception:
                pass
            raise AppError(
                code="UPSTREAM_ERROR",
                message=error_msg,
                status_code=response.status_code if response.status_code < 500 else 502,
            )

        return response

    async def list_models(
        self,
        search: str | None = None,
        sort: str = "downloads",
        limit: int = 20,
        cursor: str | None = None,
    ) -> tuple[list[dict[str, Any]], str | None]:
        """Lists models from Hugging Face API with sort and cursor-based pagination."""
        url = f"{HF_API_BASE}/models"
        hf_sort = "downloads"
        if sort == "likes":
            hf_sort = "likes"
        elif sort == "recent":
            hf_sort = "lastModified"

        params: dict[str, Any] = {
            "limit": min(limit, 50),
            "sort": hf_sort,
            "direction": -1,
            "expand": ["likes", "downloads", "pipeline_tag", "gated", "private", "lastModified"],
        }
        if search:
            params["search"] = search
        if cursor:
            params["cursor"] = cursor

        resp = await self._request("GET", url, params=params)
        try:
            data = resp.json()
        except Exception as exc:
            raise AppError(
                code="UPSTREAM_ERROR",
                message="Hugging Face Hub returned invalid JSON.",
                status_code=502,
            ) from exc

        if not isinstance(data, list):
            raise AppError(
                code="UPSTREAM_ERROR",
                message="Hugging Face Hub returned an unexpected data format.",
                status_code=502,
            )

        # Parse next cursor from Link header if available
        next_cursor = None
        link_header = resp.headers.get("Link", "")
        if 'rel="next"' in link_header:
            match = re.search(r"cursor=([^&>]+)", link_header)
            if match:
                next_cursor = unquote(match.group(1))

        return data, next_cursor

    async def fetch_model_info(self, repo_id: str) -> dict[str, Any]:
        """Fetches repo metadata from /api/models/{repo_id}."""
        url = f"{HF_API_BASE}/models/{repo_id}"
        resp = await self._request("GET", url)
        return cast(dict[str, Any], resp.json())

    async def fetch_raw_config(
        self,
        repo_id: str,
        etag: str | None = None,
    ) -> tuple[dict[str, Any] | None, str | None, str | None, bool]:
        """Fetches raw config.json.

        Returns: (config_dict, etag, last_modified, not_modified).
        If config.json is not present (404), returns (None, None, None, False) cleanly.
        """
        url = f"{HF_HUB_BASE}/{repo_id}/raw/main/config.json"
        headers: dict[str, str] = {}
        if etag:
            headers["If-None-Match"] = etag

        try:
            resp = await self._request("GET", url, headers=headers)
        except AppError as exc:
            if exc.code == "MODEL_NOT_FOUND":
                logger.info("config_json_not_found", repo_id=repo_id)
                return None, None, None, False
            raise

        if resp.status_code == 304:
            return {}, etag, resp.headers.get("Last-Modified"), True

        try:
            config_data = resp.json()
        except Exception as exc:
            logger.warning("config_json_malformed", repo_id=repo_id, error=str(exc))
            return None, None, None, False

        return (
            config_data,
            resp.headers.get("ETag"),
            resp.headers.get("Last-Modified"),
            False,
        )


    async def inspect_safetensors_header(self, repo_id: str) -> int | None:
        """Fetches safetensors header metadata using HTTP Range requests.

        NEVER downloads weight tensors. Returns total parameter count if header is parsed.
        """
        url = f"{HF_HUB_BASE}/{repo_id}/resolve/main/model.safetensors"
        try:
            # 1. Fetch first 8 bytes to get uint64 header size
            resp = await self._request("GET", url, headers={"Range": "bytes=0-7"})
            if len(resp.content) < 8:
                return None

            header_len = struct.unpack("<Q", resp.content[:8])[0]
            # Safety check: header length should be reasonable (< 50MB)
            if header_len <= 0 or header_len > 50_000_000:
                return None

            # 2. Fetch the JSON header metadata range
            end_byte = 8 + header_len - 1
            header_resp = await self._request("GET", url, headers={"Range": f"bytes=8-{end_byte}"})
            header_data = json.loads(header_resp.content.decode("utf-8"))

            total_params = 0
            for key, val in header_data.items():
                if key == "__metadata__":
                    continue
                shape = val.get("shape", [])
                if shape:
                    total_params += math.prod(shape)

            return total_params if total_params > 0 else None
        except Exception as exc:
            logger.debug("safetensors_header_inspection_failed", repo_id=repo_id, error=str(exc))
            return None
