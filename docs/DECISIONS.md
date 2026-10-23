# Architectural Decision Records (ADRs)

## ADR-0001: Monorepo Stack and Layout
* **Status**: Accepted
* **Context**: ModelFit requires a clean separation of concerns between its deterministic estimation engine, API services, and frontend presentation layer, while allowing seamless scaling from a single-VM personal portfolio to a multi-user production service.
* **Decision**: We adopt a clean monorepo layout:
  * `apps/api`: Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy 2.x async with asyncpg, Alembic, structlog.
  * `apps/web`: Next.js (App Router), TypeScript strict, Tailwind CSS, shadcn/ui, TanStack Query.
  * `docs/`, `infra/`, `.github/workflows/`.
  * Within `apps/api`, module architecture enforces: `router.py` (HTTP only) -> `service.py` (logic) -> `repository.py` (database). The `modules/estimator` is strictly pure and isolated from web/db dependencies.
* **Consequences**: Easy local development, isolated testing, strict contracts, and future scalability.

## ADR-0002: Same-Origin Deployment via Reverse Proxy
* **Status**: Accepted
* **Context**: Frontend and backend run in separate containers/processes. Cross-origin browser calls require complex cookie/CORS setups and expose internal endpoints directly to the public web.
* **Decision**: Deploy Caddy as the single public entry point on ports 80/443. Next.js handles `/` routes, while Caddy (in production) and Next.js rewrites (in development) route `/api/*` to the FastAPI backend.
* **Consequences**: Browser interacts with a single origin, eliminating CORS issues and hiding internal backend ports from public exposure.

## ADR-0003: Standardized Error Envelope
* **Status**: Accepted
* **Context**: Inconsistent error payloads between HTTP errors, validation errors, and runtime failures complicate frontend error handling and degrade user experience.
* **Decision**: Every non-2xx HTTP response must return a standardized JSON error envelope:
  ```json
  {
    "error": {
      "code": "ERROR_CODE_STRING",
      "message": "Human readable message",
      "details": {},
      "request_id": "uuid-or-incoming-id"
    }
  }
  ```
  Internal stack traces are strictly prohibited from leaking to clients.
* **Consequences**: Client can reliably parse and type errors with `ApiError`, displaying contextual alerts and request IDs for troubleshooting.

## ADR-0004: Single-User / No-Accounts v1 and Scale-Up Path
* **Status**: Accepted
* **Context**: Portfolio v1 focuses on core estimation correctness, Hugging Face discovery, and chat recommendation without the friction of auth, email services, or Redis.
* **Decision**: Single-user implicit workspace in PostgreSQL without a user login system. All database interactions strictly funnel through repository classes.
* **Scale-up Path**: Adding multi-user auth in v2 requires only:
  1. Creating a `users` table via Alembic migration.
  2. Adding a foreign key `user_id` to tables via repositories.
  3. Injecting `current_user` dependency into routers without refactoring business logic.

## ADR-0005: Estimator Module Purity & Hardware Separation
* **Status**: Accepted
* **Context**: The memory estimation engine must remain a pure deterministic mathematical model, free of database, HTTP, or framework couplings, to ensure portable execution, sub-millisecond calculation, and complete testability without mocks.
* **Decision**: 
  1. `modelfit.modules.estimator` contains ONLY pure schemas (`schemas.py`), mathematical lookup constants (`constants.py`), and the calculation engine (`calculator.py`).
  2. All database persistence, SQLAlchemy models (`HardwareProfile`), repositories, services, and HTTP routes (`GET /api/v1/hardware` and `POST /api/v1/estimate`) are placed in `modelfit.modules.hardware`.
  3. Strict isolation is enforced via `import-linter` forbidding `modelfit.modules.estimator` from importing `fastapi`, `sqlalchemy`, `httpx`, `huggingface_hub`, or `modelfit.modules.hardware`.
* **Consequences**: Estimator logic remains 100% pure, unit tests run in memory without fixtures or network latency, and the hardware catalog can evolve independently.

## ADR-0006: Hugging Face Discovery, Safetensors Headers & Stale Caching
* **Status**: Accepted
* **Context**: Discovering AI models requires querying Hugging Face Hub APIs. Downloading model weight files to count parameters would overwhelm server bandwidth and memory. Network outages must not crash the application.
* **Decision**:
  1. Parameter counts and tensor datatypes are extracted by reading the first 8 bytes (little-endian uint64 header size) and subsequent JSON header byte range from `model.safetensors` via HTTP Range requests. Never download model weights.
  2. Metadata is persisted in `model_cache` with ETag, Last-Modified, fetched_at, and 24h TTL.
  3. Stale-while-revalidate: If upstream Hugging Face Hub is unreachable (`503`), cached models are served with an explicit `warning` header/field.
  4. In-process sliding-window rate limiter protects endpoints (30 req/min per IP) returning 429 `RATE_LIMITED` with `Retry-After`.
  5. Maximum page size is strictly capped at 50 with opaque cursor-based pagination.
* **Consequences**: Exact parameter counts with zero weight downloads, resilient offline operations, and fast cached response times.

## ADR-0007: Real PostgreSQL Schema Drift and Migration Testing
* **Status**: Accepted
* **Context**: SQLite in-memory tests create tables via `Base.metadata.create_all`, which bypasses Alembic migrations entirely and masks column/type drift between ORM models and Alembic migration scripts.
* **Decision**:
  1. Add `apps/api/tests/test_schema_migration_postgres.py` which runs migrations (`upgrade head`, `downgrade -1`, and re-`upgrade head`) against a dedicated scratch database (`modelfit_test`) on real PostgreSQL using `TEST_DATABASE_URL`.
  2. Use `alembic.autogenerate.compare_metadata` to strictly assert zero schema differences between the reflected PostgreSQL database and `Base.metadata`.
  3. Continuous Integration (CI) and local testing environments require an active PostgreSQL service so this gate runs against real Postgres.
* **Consequences**: Eliminates silent ORM/migration drift before reaching production or deployment.

## ADR-0008: Deterministic Model Support Classification & Non-LLM Handling
* **Status**: Accepted
* **Context**: Hugging Face Hub contains non-LLM models (vision, audio, video) and encoder-only architectures (BERT, MiniLM), as well as repositories missing standard `config.json` (ComfyUI pipelines). These must be first-class deterministic outcomes, returning explicit reasons rather than 404/500 errors or attempting autoregressive KV-cache estimation.
* **Decision**:
  1. Introduce `classifier.py` implementing `classify_model_support()` with stable reason codes (`MISSING_CONFIG`, `MALFORMED_CONFIG`, `INCOMPLETE_METADATA`, `UNSUPPORTED_MODALITY`, `UNSUPPORTED_ENCODER_ONLY`, `UNSUPPORTED_ARCHITECTURE`).
  2. Only recognized causal decoder families (Qwen, Llama, Gemma, Phi, Mistral, Mixtral MoE) with complete metadata are classified as `supported_llm`.
  3. Missing `config.json` on existing repositories returns HTTP 200 with `support_status: "incomplete_metadata"` and reason `MISSING_CONFIG`. Truly non-existent repositories stay HTTP 404 `MODEL_NOT_FOUND`.
  4. Non-supported models submitted to `POST /api/v1/estimate` return HTTP 200 with `verdict: "cannot_estimate"` and explicit reasons in `unsupported_reasons` without raising exceptions.
  5. List cards (`ModelSummary`) default to `not_checked` unless known from cache.
  6. Migration `0005_model_support_status` adds `support_status`, `support_reason_code`, and `support_reason_message` to `model_cache`, expiring existing rows so they are re-classified on next fetch.
* **Consequences**: Rock-solid resilience against non-decoder Hub repositories, explicit user feedback, and strict preservation of estimator purity.

## Dependency Justifications
* `huggingface-hub` (apps/api): Official Hugging Face client library for model metadata structures and ecosystem compatibility.
* `@playwright/test` (apps/web): Required for critical journeys and end-to-end browser testing as specified in AGENTS.md.


