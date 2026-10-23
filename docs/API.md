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

---

### Recommendations & Natural Language Chat

#### Get Model Recommendations
- **Route**: `POST /api/v1/recommend`
- **Behavior**: Evaluates candidate models against user requirements and hardware constraints. Filters out unsupported architectures and models that will OOM, then applies deterministic multi-objective ranking (headroom curve, downloads, recency, license alignment).
- **Request Body**:
  ```json
  {
    "task": "coding",
    "hardware": {
      "name": "RTX 3060 12GB",
      "memory_bytes": 12884901888,
      "kind": "gpu",
      "reserved_memory_bytes": 1073741824
    },
    "memory_budget_bytes": null,
    "quantization_preference": "Q4_K_M",
    "license_preference": "permissive",
    "context_length": 4096,
    "max_candidates": 5
  }
  ```
- **Response**: `200 OK` (when requirements are complete)
  ```json
  {
    "recommendations": [
      {
        "model_id": "meta-llama/Meta-Llama-3-8B",
        "score": 0.88,
        "fits": true,
        "fits_tight": false,
        "estimated_total_bytes": 5899264000,
        "breakdown": {
          "headroom_score": 1.0,
          "downloads_score": 0.85,
          "recency_score": 0.90,
          "license_score": 1.0
        },
        "reason": "Optimal 54% memory utilization with high community adoption and permissive license alignment."
      }
    ],
    "dropped_oom_count": 2,
    "dropped_unsupported_count": 1,
    "unsupported_reasons": ["mamba architecture is unsupported in v1"]
  }
  ```
- **Clarification Response**: `200 OK` with `ClarificationNeeded` schema if required fields (`task` or hardware) are missing:
  ```json
  {
    "missing_fields": ["task"],
    "prompt": "Please specify what you would like to use the model for (e.g., coding, general chat, reasoning, writing)."
  }
  ```

#### Chat Advisor (SSE Stream)
- **Route**: `POST /api/v1/chat`
- **Rate Limit**: 4 requests per minute per IP. Returns `429 RATE_LIMITED` with `Retry-After`.
- **Behavior**: Streams Server-Sent Events (SSE) representing LLM tokens, tool calling iterations, and post-checked recommendation cards.
- **Request Body**:
  ```json
  {
    "messages": [
      {"role": "user", "content": "I have an RTX 3060 12GB and want a model for code generation."}
    ]
  }
  ```
- **SSE Stream Protocol**:
  Each event is formatted as `event: <type>\ndata: <json>\n\n`:
  - `event: token`: Emitted as text streams from the model.
    ```json
    {"token": "Here"}
    ```
  - `event: tool_call`: Emitted when the model triggers a grounded tool.
    ```json
    {"name": "recommend_models", "args": {"task": "coding", "hardware_name": "RTX 3060 12GB"}}
    ```
  - `event: tool_result`: Emitted when tool execution completes.
    ```json
    {"name": "recommend_models", "status": "completed", "summary": "Found 3 matching candidates"}
    ```
  - `event: recommendation`: Emitted after model completion with grounded, verified candidate cards.
    ```json
    {"recommendations": [{"model_id": "Qwen/Qwen2.5-Coder-7B", "fits": true, "score": 0.91}]}
    ```
  - `event: done`: Emitted at stream conclusion.
    ```json
    {}
    ```
  - `event: error`: Emitted if an unhandled error or quota exhaustion occurs.
    ```json
    {"code": "LLM_QUOTA_EXCEEDED", "message": "Upstream LLM rate limit or quota exceeded. Please try again shortly."}
    ```

