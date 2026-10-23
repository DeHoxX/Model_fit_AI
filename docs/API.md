# ModelFit API Specification

## Conventions
- Base Path: `/api/v1`
- JSON format: snake_case
- Primary Keys: UUID
- Timestamps: UTC ISO-8601 `timestamptz`
- Error Envelope:
  ```json
  {
    "error": {
      "code": "STRING_ERROR_CODE",
      "message": "Human-readable explanation",
      "details": {},
      "request_id": "uuid-string"
    }
  }
  ```

## Endpoints

### System & Health

#### Liveness Check
- **Route**: `GET /api/v1/health/live`
- **Response**: `200 OK`
  ```json
  {
    "status": "live"
  }
  ```

#### Readiness Check
- **Route**: `GET /api/v1/health/ready`
- **Behavior**: Executes `SELECT 1` on the database within 2 seconds.
- **Success**: `200 OK`
  ```json
  {
    "status": "ready",
    "database": "connected"
  }
  ```
- **Failure**: `503 Service Unavailable` with standard error envelope (`DATABASE_UNAVAILABLE`).

#### Metadata
- **Route**: `GET /api/v1/meta`
- **Response**: `200 OK`
  ```json
  {
    "version": "1.0.0",
    "git_sha": "development",
    "environment": "development"
  }
  ```

---

### Hardware & Memory Estimation

#### List Hardware Profiles
- **Route**: `GET /api/v1/hardware`
- **Response**: `200 OK` with list of preset hardware profiles.
  ```json
  [
    {
      "id": "c1f71a74-...",
      "name": "NVIDIA GeForce RTX 4090",
      "kind": "gpu",
      "memory_bytes": 25769803776,
      "reserved_memory_bytes": 1073741824,
      "source_url": "https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4090/",
      "is_verified": true,
      "notes": "24 GB GDDR6X",
      "created_at": "2026-10-22T00:00:00Z",
      "updated_at": "2026-10-22T00:00:00Z"
    }
  ]
  ```

#### Deterministic Memory Estimation
- **Route**: `POST /api/v1/estimate`
- **Request Body**:
  Either `model` or `repo_id` must be provided.
  ```json
  {
    "repo_id": "meta-llama/Meta-Llama-3-8B",
    "config": {
      "quantization": "q4_k_m",
      "kv_cache_dtype": "fp16",
      "context_length": 8192,
      "batch_size": 1,
      "runtime": "llama_cpp",
      "gpu_count": 1,
      "tensor_parallel_degree": 1
    },
    "hardware": {
      "name": "RTX 4090",
      "memory_bytes": 25769803776,
      "kind": "gpu",
      "reserved_memory_bytes": 1073741824
    }
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "weights_bytes": 4868187500,
    "kv_cache_bytes": 1073741824,
    "activation_bytes": 201326592,
    "runtime_overhead_bytes": 268435456,
    "total_bytes": 6411691372,
    "per_device_bytes": null,
    "verdict": "fits",
    "headroom_bytes": 18284370580,
    "assumptions": [],
    "warnings": [],
    "unsupported_reasons": [],
    "confidence": "high"
  }
  ```

---

### Model Catalog (Phase 3 Discovery)

#### List Models
- **Route**: `GET /api/v1/models`
- **Query Parameters**:
  - `search` (string, optional): Search query for model or author.
  - `sort` (enum: `downloads`, `likes`, `recent`, default: `downloads`).
  - `limit` (integer, default: 20, max: 50).
  - `cursor` (string, optional): Opaque pagination cursor.
- **Rate Limit**: 30 requests/minute per client IP (429 `RATE_LIMITED` with `Retry-After`).
- **Response**: `200 OK`
  ```json
  {
    "items": [
      {
        "id": "meta-llama/Meta-Llama-3-8B",
        "author": "meta-llama",
        "model_name": "Meta-Llama-3-8B",
        "pipeline_tag": "text-generation",
        "likes": 8450,
        "downloads": 1250000,
        "is_supported": true,
        "total_params": 8030261248,
        "gated": false,
        "license": "llama3"
      }
    ],
    "next_cursor": "cur_abc123",
    "has_more": true
  }
  ```

#### Get Model Detail
- **Route**: `GET /api/v1/models/{repo_id:path}`
- **Behavior**: Checks local `model_cache` first. On cache miss or expiration, queries Hugging Face API, inspects safetensors header byte range (0-7 and JSON header range) for exact parameter counts without downloading weights, normalizes architecture, and persists to cache with 24h TTL.
- **Stale Fallback**: If upstream Hugging Face is unreachable (`503`), serves cached metadata with a `warning` field.
- **Response**: `200 OK`
  ```json
  {
    "id": "meta-llama/Meta-Llama-3-8B",
    "author": "meta-llama",
    "model_name": "Meta-Llama-3-8B",
    "pipeline_tag": "text-generation",
    "likes": 8450,
    "downloads": 1250000,
    "is_supported": true,
    "gated": false,
    "license": "llama3",
    "param_provenance": "safetensors",
    "normalized_model": {
      "id": "meta-llama/Meta-Llama-3-8B",
      "architecture_name": "LlamaForCausalLM",
      "architecture_category": "standard_transformer",
      "total_params": 8030261248,
      "active_params": 8030261248,
      "num_layers": 32,
      "hidden_size": 4096,
      "num_attention_heads": 32,
      "num_kv_heads": 8,
      "head_dim": 128,
      "vocab_size": 128256,
      "max_context_length": 8192,
      "intermediate_size": 14336,
      "tie_word_embeddings": false,
      "num_experts": null,
      "experts_per_token": null,
      "attention_variant": "grouped_query",
      "sliding_window_size": null
    },
    "warning": null
  }
  ```
