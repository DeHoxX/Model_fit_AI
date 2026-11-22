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

## ADR-0009: Conversational AI Advisor via Google Gemini SDK & Grounded Tool Calling
* **Status**: Accepted
* **Context**: ModelFit requires natural language model recommendation and sizing advice. Users should be able to state requirements in conversational English (e.g. "I have an RTX 3060 and want to run code generation"). The conversational agent must be strictly grounded: the LLM must NEVER invent or hallucinate memory estimates, model architectures, or performance numbers (AGENTS.md Rule 1 & Rule 2).
* **Decision**:
  1. Adopt the official Google GenAI SDK (`google-genai==2.33.0`) behind a provider-neutral `LLMClient` protocol configured via `LLM_PROVIDER`, `LLM_API_KEY`, and `LLM_MODEL`. No hardcoded model defaults are embedded in code or configuration.
  2. In testing (`APP_ENV=test`), `FakeScriptedLLMClient` provides deterministic mock turns without network dependencies or external keys. In development and production (`APP_ENV != "test"`), missing keys or models fail fast at startup; fallback to mocks in production is strictly forbidden.
  3. Automatic Function Calling (AFC) in `google-genai` is explicitly disabled via `types.AutomaticFunctionCallingConfig(disable=True)`. ModelFit's `ChatService` orchestrates execution explicitly, enforcing a hard round cap (`MAX_TOOL_ROUNDS = 5`), recording SSE events for each tool step, and executing post-checks.
  4. Post-Check Guardrail: Any model ID mentioned by the LLM that was not returned by a grounded tool execution during that turn is stripped from recommendation cards to prevent hallucinated recommendations.
  5. Per-IP Sliding-Window Rate Limiter: Chat endpoints are capped at 4 requests per minute per IP to protect Gemini API quotas and server resources, returning 429 `RATE_LIMITED` when exceeded.
  7. Prompt Injection Resistance & Limitations: System instructions instruct the LLM to never alter estimates or override system rules. However, prompt engineering alone cannot guarantee 100% prevention against novel adversarial injection techniques; automated injection testing is executed against a scripted fake LLM client in the test suite rather than live adversarial testing. The post-check validation mechanism strictly checks and strips model identifiers not produced by verified tool executions (it does not parse or verify arbitrary text statements).
  8. Candidate Evaluation Cap (MAX_CANDIDATES 25 -> 8): Evaluating a single candidate requires multiple upstream Hugging Face HTTP requests (metadata API, config.json fetch, and safetensors Range request). Capping candidate evaluation at 8 instead of 25 is a design choice, unmeasured.
* **Consequences**: Deterministic grounding, complete auditability over tool calls via SSE, robust rate limiting, and zero risk of hallucinated memory or model statistics.

## ADR-0010: Client-Side Session Storage for Conversation State & Hardware Matching Constraints
* **Status**: Accepted
* **Context**: Prior to Phase 5 database persistence, navigating away from `/chat` to view model cards or other routes unmounted the chat view and wiped active conversations. Additionally, every conversation bore the identical hardcoded title, and clicking sidebar items did not swap active conversation streams. On the backend, loose hardware matching silently defaulted to 12.0 GiB VRAM on unknown hardware or system RAM strings (e.g. '32GB RAM').
* **Decision**:
  1. Temporary Stopgap: Adopt `sessionStorage` (`modelfit_chat_sessions_v1`) to persist conversation sessions across tab navigations within the browser session. Phase 5 replaces this with PostgreSQL persistence.
  2. Storage Isolation: Only store user/assistant messages, text content, and recommendation cards. Never store credentials, API keys, or intermediate tool execution events.
  3. Titles: Dynamically derived from the first user prompt, stripped of markdown symbols and truncated to ~40 characters.
  4. Sidebar Navigation: Clicking conversations in the sidebar synchronizes the active message state and updates the view via `setMessages`.
  5. Unambiguous Hardware Matching: Removed silent 12GB default fallback in `estimate_memory` and `recommend_models`. Hardware profiles must match exactly or unambiguously against verified presets. System RAM (e.g. '32GB RAM') is never inferred as VRAM; unmatched or ambiguous hardware returns an explicit `needs_clarification` result.
  6. Range Request Status Codes: HTTP 206 Partial Content is accepted strictly on safetensors Range request paths, preserving strict HTTP 200 enforcement on standard API and config requests.
  7. LLM Timeout & High Demand Resiliency: Capped GenAI client calls with `LLM_TIMEOUT_MS = 15000` (15,000 ms per-attempt) and `attempts = 2` with up to 2.0s backoff (design choice, unmeasured). The worst case before timing out is 15s per attempt x 2 attempts + backoff (~32s worst case, not 15s total). Spikes in 503 high demand are surfaced as `LLM_MODEL_BUSY`, and connection/network failures are surfaced as `LLM_NETWORK_ERROR`.
* **Consequences**: Persistent conversation journeys across model detail views, responsive sidebar navigation, zero silent hardware sizing errors, and immediate feedback during upstream API high-demand spikes or network disconnects.

## ADR-0011: Local-First Architecture: Transition from PostgreSQL & Docker to Embedded SQLite with aiosqlite
* **Status**: Accepted
* **Context**: ModelFit initially ran PostgreSQL 16 inside Docker Compose with `asyncpg` and production Caddy containers. While suitable for containerized server deployments, this introduced significant local setup friction, container overhead, and Docker requirements for development and testing.
* **Decision**:
  1. Replace PostgreSQL with embedded SQLite 3 driven by SQLAlchemy 2.x async engine with `aiosqlite`.
  2. Single file database: `modelfit.db` located at project root (git-ignored), configurable via `DATABASE_URL` with default `sqlite+aiosqlite:///./modelfit.db`.
  3. No PostgreSQL data is migrated: ModelFit starts with a clean SQLite database; hardware profiles are seeded idempotently from `hardware_presets.json` and Hugging Face model metadata is cached on demand.
  4. Python-side UUID defaults: Replaced PostgreSQL `server_default=text("gen_random_uuid()")` with SQLAlchemy `Uuid(as_uuid=True)` and Python-side `default=uuid.uuid4`.
  5. Single UTC timestamp source: Replaced `server_default=func.now()` with Python-side timezone-aware UTC (`UTCDateTime` TypeDecorator and `utc_now` default/onupdate).
  6. Batch migrations: Alembic configured with `render_as_batch=True` to support SQLite table recreation on schema modifications. Migration 0005 updated with dialect-aware cache expiration (`datetime('now', '-1 second')` for SQLite).
  7. Total Docker removal: Removed all Dockerfiles, compose configurations, Caddy infra files, and Docker mentions across docs and CI. CI runs directly on GitHub Actions runner with SQLite.
  8. API port setting: `API_PORT` setting (default 8000) added to Settings and used by `scripts/dev.ps1`.
* **Consequences**: Zero Docker requirement, instant local development, pure single-command launch via `scripts/dev.ps1`, zero loss of application capabilities (estimator, catalog, chat, recommend intact).

## Dependency Justifications
* `aiosqlite` (apps/api): Asynchronous driver for SQLite providing non-blocking database I/O for SQLAlchemy async sessions in a local-first environment without Docker.
* `huggingface-hub` (apps/api): Official Hugging Face client library for model metadata structures and ecosystem compatibility.
* `google-genai` (apps/api): Official Google GenAI SDK for Gemini streaming and function calling in the conversational advisor.
* `@playwright/test` (apps/web): Required for critical journeys and end-to-end browser testing as specified in AGENTS.md.
* `react-markdown` (apps/web): Safe markdown rendering for assistant responses in the chat interface.
* `rehype-sanitize` (apps/web): Strict HTML sanitization schema preventing XSS injection in user/assistant markdown.




## Decision Log

### D-001 | 2026-10-22 | Pure Estimator Module Isolated via import-linter
- **Decision**: `modelfit.modules.estimator` contains only pure mathematical lookup constants, data schemas, and deterministic calculation functions. It has zero imports from FastAPI, SQLAlchemy, httpx, huggingface_hub, or other application modules. Enforced by import-linter contracts in CI.
- **Why**: Memory estimation engine must remain a pure deterministic mathematical model, free of database, HTTP, or framework couplings, to ensure portable execution, sub-millisecond calculation, and complete testability without mocks.
- **Alternatives rejected**: Embedding estimation arithmetic inside API routers/services or coupling estimator models directly to SQLAlchemy database entities; rejected because it couples pure arithmetic to I/O and complicates testing.
- **Files/evidence**: ADR-0005 (`docs/DECISIONS.md`), `apps/api/pyproject.toml:63-79`, `apps/api/src/modelfit/modules/estimator/`, commit `7bbc02e`.

### D-002 | 2026-10-22 | Hugging Face Metadata Normalization Before Estimation
- **Decision**: All Hugging Face Hub metadata is parsed and validated into the internal `NormalizedModel` schema before reaching the estimator. The estimator never receives or inspects raw Hugging Face JSON.
- **Why**: Non-negotiable rule 3 in AGENTS.md; ensures schema stability, isolates estimator from upstream schema changes or missing keys, and centralizes validation and unit conversions.
- **Alternatives rejected**: Passing raw Hugging Face JSON dictionaries directly to the calculator; rejected because varying metadata formats and missing keys would cause brittle calculations or silent bugs.
- **Files/evidence**: AGENTS.md rule 3, `apps/api/src/modelfit/modules/catalog/normalizer.py`, `docs/PHASES.md:120-140`, commit `d870f11`.

### D-003 | 2026-10-23 | Grounded Tool-Only LLM Calling and Post-Check Verification
- **Decision**: Automatic Function Calling (AFC) in `google-genai` is disabled. `ChatService` orchestrates tool execution with a hard round cap (`MAX_TOOL_ROUNDS = 5`). A post-check guardrail scans the final response and strips any model ID mentioned by the LLM that was not returned by a verified tool execution during that turn.
- **Why**: AGENTS.md Rules 1 & 2: deterministic engine is single source of truth; LLMs hallucinate numbers and model names.
- **Alternatives rejected**: Letting LLM estimate memory or describe unverified models directly; using automatic function calling without inspection; rejected due to hallucinations and loss of auditability.
- **Files/evidence**: ADR-0009 (`docs/DECISIONS.md`), `apps/api/src/modelfit/modules/chat/service.py:270-310`, `apps/api/src/modelfit/modules/chat/service.py:348-375`, commit `2ad6efd`.

### D-004 | 2026-10-23 | Google Gemini SDK Behind Provider-Neutral LLMClient Interface
- **Decision**: LLM interactions use the official Google GenAI SDK (`google-genai==2.33.0`) placed behind a small, provider-neutral `LLMClient` protocol configured via `LLM_PROVIDER`, `LLM_API_KEY`, and `LLM_MODEL`.
- **Why**: Official SDK provides first-class streaming and function calling; provider-neutral protocol prevents vendor lock-in and allows testing with scripted fakes without external network access.
- **Alternatives rejected**: Direct vendor coupling in service layer; heavy orchestration frameworks (LangChain, LlamaIndex); rejected to adhere to AGENTS.md Rule 8 (no unnecessary dependencies).
- **Files/evidence**: ADR-0009 (`docs/DECISIONS.md`), `apps/api/src/modelfit/modules/chat/llm_client.py`, commit `2ad6efd`.

### D-005 | 2026-10-23 | Preservation of Groq Client with Multi-Key Pool
- **Decision**: Retain `GroqLLMClient` and `KeyPool` alongside the Gemini client, configured via `LLM_PROVIDER=groq` and `LLM_API_KEYS`.
- **Why**: Reason not recorded. [HYPOTHESIS: Groq client was implemented during Phase 4 development for low-latency testing or key rotation fallback and preserved to allow flexible provider switching].
- **Alternatives rejected**: Deleting Groq client when Gemini was selected as default provider; rejected to preserve tested fallback provider option.
- **Files/evidence**: `apps/api/src/modelfit/modules/chat/groq_client.py`, `apps/api/src/modelfit/modules/chat/key_pool.py`, commit `0e5cf7d`.

### D-006 | 2026-11-15 | Transition from PostgreSQL and Docker to Embedded SQLite with aiosqlite
- **Decision**: Replace PostgreSQL 16 and `asyncpg` with embedded SQLite 3 and `aiosqlite` via SQLAlchemy async engine. Single local database file `modelfit.db` (git-ignored), configurable via `DATABASE_URL`.
- **Why**: Eliminates container and Docker overhead for single-VM/local deployment; enables instant local development and zero external service dependencies.
- **Alternatives rejected**: Keeping PostgreSQL in Docker; synchronous SQLite driver (`sqlite3`) which blocks async event loop; rejected for simplicity and async compatibility.
- **Files/evidence**: ADR-0011 (`docs/DECISIONS.md`), `apps/api/pyproject.toml`, `apps/api/src/modelfit/db/session.py`.

### D-007 | 2026-11-15 | Python-Side UUID Defaults and Single UTC Timestamp Source (UTCDateTime)
- **Decision**: Use Python-side UUID generation (`default=uuid.uuid4`) with `sqlalchemy.types.Uuid(as_uuid=True)` and a single UTC timestamp source in Python (`UTCDateTime` TypeDecorator and `utc_now = lambda: datetime.now(UTC)`), removing database-side `server_default=text("gen_random_uuid()")` and `server_default=func.now()`.
- **Why**: SQLite does not provide native `gen_random_uuid()` or `TIMESTAMPTZ` types; Python-side generation guarantees consistent UUIDs and timezone-aware UTC datetimes across all platforms and SQLite reads.
- **Alternatives rejected**: Database triggers, SQLite extension functions, or storing naive datetimes; rejected because SQLite default datetimes drop timezone information.
- **Files/evidence**: ADR-0011 (`docs/DECISIONS.md`), `apps/api/src/modelfit/db/base.py`, `apps/api/tests/test_sqlite_persistence.py`.

### D-008 | 2026-11-15 | Alembic Batch-Mode Table Rebuilding for SQLite Migrations
- **Decision**: Configure Alembic with `render_as_batch=True` in `alembic/env.py` and wrap column alterations in `op.batch_alter_table(...)`. Migration 0005 uses dialect-aware query (`datetime('now', '-1 second')` for SQLite).
- **Why**: SQLite has limited `ALTER TABLE` support (cannot directly drop columns or alter constraints without table recreation).
- **Alternatives rejected**: Writing separate raw SQLite migration scripts; disabling table alterations; rejected because Alembic batch mode transparently recreates tables.
- **Files/evidence**: ADR-0011 (`docs/DECISIONS.md`), `apps/api/alembic/env.py`, `apps/api/alembic/versions/0004_add_model_cache_license.py`, `0005_model_support_status.py`.

### D-009 | 2026-11-15 | Complete Elimination of Docker Requirements
- **Decision**: Delete all Dockerfiles, docker-compose configurations, Caddy containers, and container CI services. Run API and frontend directly on host processes via `scripts/dev.ps1` and `Makefile`.
- **Why**: User requirement to make ModelFit fully local and eliminate container dependencies, overhead, and VM virtualization friction.
- **Alternatives rejected**: Retaining Docker for production only; rejected because the project target is fully local execution without Docker.
- **Files/evidence**: ADR-0011 (`docs/DECISIONS.md`), `scripts/dev.ps1`, `scripts/check.ps1`, `.github/workflows/ci.yml`.

### D-010 | 2026-10-22 | Explicit Reserved Memory Allowances per Hardware Profile Kind
- **Decision**: Hardware presets explicitly configure `reserved_memory_bytes`: consumer GPUs reserve 512 MiB to 1024 MiB (e.g. RTX 3060 reserves 512 MiB, RTX 4090 reserves 1024 MiB); dedicated datacenter accelerators (A100, H100) reserve 0; Apple unified memory reserves 3 GiB or more. Usable memory is defined as `memory_bytes - reserved_memory_bytes`.
- **Why**: Operating systems and display drivers consume GPU/system memory before model loading. Consumer systems running displays cannot allocate 100% of VRAM to weights and KV cache.
- **Alternatives rejected**: Fixed percentage reserve across all devices; assuming 100% available VRAM; rejected because consumer display overhead causes out-of-memory errors.
- **Files/evidence**: `docs/ESTIMATOR.md:98-100`, `apps/api/src/modelfit/modules/hardware/seeds/hardware_presets.json`.

### D-011 | 2026-10-23 | Cap Maximum Recommendation Candidates at 8 (Reduced from 25)
- **Decision**: Cap maximum candidate model evaluation in recommendations at 8 (reduced from 25). Stated in ADR-0009 and `docs/PHASES.md` as "design choice, unmeasured".
- **Why**: Evaluating each candidate model requires multiple upstream Hugging Face HTTP requests (metadata API, config.json fetch, and safetensors Range request). Stated in ADR-0009 and `docs/PHASES.md` as "design choice, unmeasured" to reduce latency and rate limit pressure.
- **Alternatives rejected**: Evaluating 25 candidates; rejected due to high upstream HTTP overhead and request latency.
- **Files/evidence**: ADR-0009:96 (`docs/DECISIONS.md`), `apps/api/src/modelfit/modules/recommend/service.py`, `docs/PHASES.md:223`, commit `0e5cf7d`.

### D-012 | 2026-10-23 | Sliding-Window Rate Limiting on Chat Endpoints (4 req/min/IP)
- **Decision**: Apply in-process sliding-window rate limiter on `/chat` endpoints capped at 4 requests per minute per IP, returning HTTP 429 `RATE_LIMITED` when exceeded.
- **Why**: Protect upstream LLM provider API quotas (Gemini/Groq tier limits) and server resources from abuse or denial-of-service.
- **Alternatives rejected**: Unrestricted endpoints; external Redis-based rate limiter (AGENTS.md prohibits Redis in v1); rejected to maintain zero extra services.
- **Files/evidence**: ADR-0009:94 (`docs/DECISIONS.md`), `apps/api/src/modelfit/modules/chat/service.py`, commit `2ad6efd`.

### D-013 | 2026-10-23 | Root Route ("/") Immediate Redirect to Chat ("/chat")
- **Decision**: Root web route `apps/web/src/app/page.tsx` immediately redirects incoming traffic to `/chat`.
- **Why**: Reason not recorded in commit/ADR. [HYPOTHESIS: Established in Phase 4 to present the conversational advisor as the primary landing interface for ModelFit].
- **Alternatives rejected**: Static marketing landing page or direct catalog view; rejected in Phase 4 to center the advisor experience.
- **Files/evidence**: `apps/web/src/app/page.tsx`, `docs/PHASES.md:229`, commit `0e5cf7d`.

### D-014 | 2026-11-15 | Compact Quality Gate Output and Log Isolation
- **Decision**: Update `scripts/check.ps1` to emit a single-line `PASS <step>` on success, a compact filtered error view on failure, save raw outputs to `scripts/.check-logs/<step>.log`, print a copyable `=== FAILED SUMMARY ===` block at completion, and continue running all steps with exit code 1 if any step fails.
- **Why**: Reduce terminal noise and cognitive overhead during validation runs, enabling immediate scanning of failures and full post-mortem inspection via dedicated log files without polluting terminal buffers.
- **Alternatives rejected**: Failing fast at first error (prevents feedback on subsequent components); verbose full-stream terminal output (too noisy in interactive and agentic workflows).
- **Files/evidence**: `scripts/check.ps1`, `.gitignore`.

### D-015 | 2026-11-15 | Groq Stream Handler Indentation Restoration
- **Decision**: Dedent the response handler block (status 429, 500/503, non-200, and status 200 SSE streaming iteration) in `GroqLLMClient.generate_stream` by 4 spaces (to column 20) to align with `if status == 401:`.
- **Why**: In commit `0e5cf7d`, lines 250–391 were mistakenly indented inside `if status == 401:` directly following `continue`. Consequently, all non-401/403 responses (including 200 OK and 503 retries) bypassed the handlers and exited silently after 5 attempts without yielding tokens or handling errors.
- **Alternatives rejected**: Rewriting the streaming generator or replacing the client architecture; rejected to keep existing client interfaces and error classes intact.
- **Files/evidence**: `apps/api/src/modelfit/modules/chat/groq_client.py:250-391`, commit `0e5cf7d`.

### D-016 | 2026-11-15 | Hermetic Test Environment Configuration for LLM Client
- **Decision**: Configure `LLM_API_KEY="test-key"` and `LLM_MODEL="test-model"` in `apps/api/tests/conftest.py` via `os.environ` prior to application imports.
- **Why**: `GeminiLLMClient.__init__` enforces presence of `LLM_API_KEY` and `LLM_MODEL`. Unit and integration tests instantiating `GeminiLLMClient` directly raised `RuntimeError` when running without a host API key configured.
- **Alternatives rejected**: Altering `GeminiLLMClient.__init__` to bypass validation in test mode (prohibited by prompt); requiring developer host `.env` to supply real keys during tests (violates test hermeticity and exposes credentials).
- **Files/evidence**: `apps/api/tests/conftest.py`, `apps/api/src/modelfit/modules/chat/llm_client.py:48-58`, `apps/api/tests/test_chat_service.py:285,424`.

### D-017 | 2026-11-15 | Synchronization of ORM Model Server Defaults with Migrations
- **Decision**: Add `server_default` annotations to ORM models (`HardwareProfile`: `kind="gpu"`, `reserved_memory_bytes="0"`, `is_verified=text("0")`; `ModelCache`: `likes="0"`, `downloads="0"`, `is_supported=text("1")`, `support_status="supported_llm"`, `gated=text("0")`, `param_provenance="derived"`) matching Alembic migrations 0002, 0003, and 0005.
- **Why**: Alembic migration drift test `test_sqlite_schema_matches_orm_metadata` checks schema equivalence with `compare_server_default=True`. Without explicit ORM `server_default`, autogenerate detected false-positive drift between the migrated DB tables and ORM metadata. SQLite batch alterations in migration 0005 strictly require a server default for non-null column additions.
- **Alternatives rejected**: Weakening the schema drift test by disabling `compare_server_default=True` (prohibited by user); stripping `server_default` from migrations (would break SQLite batch column additions in migration 0005).
- **Files/evidence**: `apps/api/src/modelfit/modules/hardware/models.py`, `apps/api/src/modelfit/modules/catalog/models.py`, `apps/api/tests/test_schema_migration_sqlite.py`, Alembic versions 0002, 0003, 0005.

### D-018 | 2026-11-15 | Unified SQLite PRAGMA Connection Initializer
- **Decision**: Introduce `setup_sqlite_pragmas(async_engine: AsyncEngine)` in `apps/api/src/modelfit/db/session.py` and register it on both the production engine (`session.py`) and the test engine (`tests/conftest.py`). Issues `PRAGMA journal_mode=WAL`, `PRAGMA foreign_keys=ON`, and `PRAGMA busy_timeout=5000` on every new connection.
- **Why**: SQLite defaults to `foreign_keys=OFF`, `busy_timeout=0`, and `journal_mode=DELETE`. Enabling foreign keys enforces relational integrity, WAL mode eliminates reader/writer contention during concurrent requests, and busy timeout prevents immediate lock exceptions under write spikes. Sharing the helper between `session.py` and `conftest.py` guarantees tests exercise the exact production connection configuration.
- **Alternatives rejected**: Separate PRAGMA configurations in test and production; relying on SQLite default connection properties; rejected because tests would fail to exercise production concurrency and foreign key enforcement behavior.
- **Files/evidence**: `apps/api/src/modelfit/db/session.py`, `apps/api/tests/conftest.py`, `apps/api/tests/test_sqlite_persistence.py`.

### D-019 | 2026-11-15 | Native Command Stderr Stream Isolation in PowerShell Development Runner
- **Decision**: In `scripts/dev.ps1`, launch development services in background jobs via `cmd.exe /c "... 2>&1"`, set `$ErrorActionPreference = "Continue"` within the dev runner loop, use `Receive-Job -ErrorAction SilentlyContinue`, and monitor `$apiJob.State` / `$webJob.State` to detect real non-zero process exits.
- **Why**: In Windows PowerShell 5.1, native executables writing to standard error (`stderr`) generate `ErrorRecord` objects with category `NativeCommandError`. Standard logging frameworks like Uvicorn and npm emit informational output (e.g. `INFO: Will watch for changes...`) to stderr. When piped through `Receive-Job ... | ForEach-Object ...` under `$ErrorActionPreference = "Stop"`, PowerShell converts these informational records into terminating exceptions, immediately crashing the development runner at startup. Redirecting stderr to stdout at the OS level via `cmd.exe /c "... 2>&1"` prevents PowerShell from generating `ErrorRecord` objects while preserving full colorized, prefixed output for both services.
- **Alternatives rejected**: Discarding stderr with `2>$null` (hides server startup logs and runtime tracebacks); removing `$ErrorActionPreference = "Stop"` globally from `scripts/dev.ps1` (weakens error detection in other script targets); relying on `$PSNativeCommandUseErrorActionPreference` (unsupported in Windows PowerShell 5.1).
- **Files/evidence**: `scripts/dev.ps1:50-100`.

### D-020 | 2026-11-15 | Unified Provider-Aware LLM Credential Validation
- **Decision**: Centralize startup LLM credential and model validation in `Settings.validate_llm_credentials()` (`apps/api/src/modelfit/core/config.py`), called both by Pydantic's `validate_settings` model validator on initialization and by `lifespan` in `apps/api/src/modelfit/main.py`. Remove the duplicate hardcoded `LLM_API_KEY` check from `main.py`.
- **Why**: `config.py` is the single source of truth for configuration rules. It already implements provider-aware validation (`LLM_PROVIDER=groq` accepts non-empty `llm_api_key_list` from either `LLM_API_KEYS` or `LLM_API_KEY`; `LLM_PROVIDER=gemini` requires `LLM_API_KEY`). The duplicate check in `main.py:43` checked only `settings.LLM_API_KEY`, causing a startup crash on valid Groq configurations that configure `LLM_API_KEYS` instead of `LLM_API_KEY`.
- **Alternatives rejected**: Adding another duplicate provider check inside `main.py` (maintains two divergent sources of truth); forcing users to define both `LLM_API_KEY` and `LLM_API_KEYS` (violates .env contract and creates redundant configuration).
- **Files/evidence**: `apps/api/src/modelfit/core/config.py`, `apps/api/src/modelfit/main.py:41-45`, `apps/api/tests/test_settings.py`.

### D-021 | 2026-11-15 | Test Fixture Integration for Lifespan Database Seeding and SQLite Settings Verification
- **Decision**: Update `test_settings.py` to assert SQLite database URL format (`sqlite+aiosqlite:` and `modelfit.db`) instead of legacy PostgreSQL passwords, and integrate `prepare_database` / `TestSessionLocal` for tests exercising the FastAPI `lifespan` startup path.
- **Why**: Phase B migrated from PostgreSQL to SQLite (`aiosqlite`). Legacy tests in `test_settings.py` asserted PostgreSQL credentials (`modelfit_dev_password`) that no longer exist in `.env`. Furthermore, `main.py:lifespan` idempotently seeds hardware presets into `hardware_profiles` on startup; running lifespan in a test without the prepared database schema caused `sqlite3.OperationalError: no such table: hardware_profiles`.
- **Alternatives rejected**: Removing database seeding from production `lifespan` (violates production startup requirements); weakening settings assertions to trivial non-empty checks.
- **Files/evidence**: `apps/api/tests/test_settings.py:37-49`, `apps/api/tests/test_settings.py:169-192`.

### D-022 | 2026-11-15 | Hardware Matching Rule R-E: Unknown GPU with Explicit VRAM & System RAM Disambiguation
- **Decision**: When an unknown GPU name is accompanied by an explicit VRAM or memory size (e.g. "RTX 4070 12GB", "RTX 4070 12GiB", "12GB RTX 4070"), construct a user-provided `HardwareProfileInput` retaining the sanitized user's name with an assumption note and a 5% reserve. If a user specifies VRAM that differs from a matched preset (e.g. "RTX 3060 8GB" vs 12GB preset, or "RTX 4090 32GB VRAM" vs 24GB preset), treat it as a user-provided profile rather than silently using the preset. Forbid proxying in `system_v1.txt`. Any memory figure associated with system RAM (e.g. "32GB RAM", "32 GB of RAM", "system memory", "memory of system") is recognized as host memory and strictly stripped prior to VRAM extraction across all tools, preset matching, and post-check capacity grounding. Queries specifying only system RAM trigger clarification without guessing a GPU.
- **Why**: Resolving an unknown GPU to a proxy preset (e.g. RTX 4070 to RTX 3060) violates ModelFit's deterministic grounding principles (AGENTS.md Rule 1 and Rule 2). Furthermore, treating system RAM (e.g. "32GB RAM") as GPU VRAM would oversize GPU capacity, recommend incompatible large models, and cause out-of-memory errors on consumer machines.
- **Alternatives rejected**: Silently falling back to a 12GB preset (ADR-0010 rejected this); treating host RAM as shared VRAM on discrete GPU systems; unstripped regex number extraction.
- **Files/evidence**: `apps/api/src/modelfit/modules/chat/tools.py:_match_hardware_profile`, `_clean_hardware_query`, `apps/api/src/modelfit/modules/chat/prompts/system_v1.txt`, `apps/api/src/modelfit/modules/chat/service.py`, `apps/api/tests/test_chat_service.py`.

### D-023 | 2026-11-15 | Sanitization of Untrusted Hardware Profile Names (Rule R-F)
- **Decision**: Introduce `_sanitize_hardware_name` in `tools.py` to strip ASCII control characters (0x00-0x1f, 0x7f) and markdown/HTML delimiters (`*_<>[]`), collapse redundant whitespace, and cap length to 64 characters before constructing user-provided hardware profiles.
- **Why**: Hardware strings in chat queries are untrusted user input. Without sanitization, crafted names could inject prompt instructions into subsequent turns or break UI rendering in recommendation cards.
- **Alternatives rejected**: Rejecting names with special characters (poor UX for informal typing); unconstrained strings in card headers.
- **Files/evidence**: `apps/api/src/modelfit/modules/chat/tools.py:_sanitize_hardware_name`, `apps/api/tests/test_chat_service.py:test_sanitize_hardware_name_untrusted_input`.

### D-024 | 2026-11-15 | Grounded Resolved Hardware Profile on Estimate Results and Recommendation Cards
- **Decision**: Introduce `ResolvedHardware(name: str, usable_memory_bytes: int, profile_type: str)` and attach it as an additive field `resolved_hardware` on `EstimationResult` (returned by `POST /api/v1/estimate`) and `RecommendationCandidate` (rendered in chat recommendation cards).
- **Why**: Cards and estimate results must explicitly indicate the resolved hardware name, exact usable bytes, and whether the profile originated from a verified preset or user-provided input, without relying on LLM recall.
- **Alternatives rejected**: Omitting hardware from recommendation card payload; storing formatted strings in estimator schemas (estimator schemas remain pure byte integers).
- **Files/evidence**: `apps/api/src/modelfit/modules/estimator/schemas.py`, `apps/api/src/modelfit/modules/estimator/calculator.py`, `apps/api/src/modelfit/modules/recommend/schemas.py`, `apps/web/src/components/chat/RecommendationCardView.tsx`.

### D-025 | 2026-11-15 | Single Unit Rule (GiB) and Grounded Memory Figures Post-Check (Rule R-C)
- **Decision**: Standardize on binary GiB across the entire system. Tools emit preformatted GiB strings (`formatted_gib`) in the chat/tool layer. In `ChatService`, implement a deterministic post-check `_post_check_memory_figures` that validates memory figures (GiB/GB) in the assistant's final text against verified figures returned by tools during that turn. Any ungrounded or decimal GB figures are replaced with a safe fallback notice `[refer to card for verified memory requirements]` and logged. Document limits in `ChatService`.
- **Why**: Eliminates discrepancy where UI cards displayed binary GiB (`11.0 GiB`) while the LLM performed manual arithmetic or decimal conversions (`11.80 GB`), enforcing Rule 1 and Rule 2.
- **Alternatives rejected**: Relying purely on system prompt prompt-engineering (non-deterministic); computing formatted strings inside pure estimator module (violates byte-only separation).
- **Files/evidence**: `apps/api/src/modelfit/modules/chat/service.py:_post_check_memory_figures`, `apps/api/src/modelfit/modules/chat/tools.py:_format_gib_dict`, `apps/api/tests/test_chat_service.py`.

### D-026 | 2026-11-15 | Hardware Profile Preset Provenance Preservation and Exact User Display Name Rule
- **Decision**: Preserve `is_preset` flag when transforming `RequirementSpec.hardware` to `HardwareProfileInput` in `RecommendService.recommend()`. Default ad-hoc memory budget fallback (`Custom Memory Budget`) to `is_preset=False`. For user-provided hardware profiles, display names are derived by `_extract_display_name(query)` which preserves the user's exact input phrase, brand prefixes (e.g. 'NVIDIA'), prepositions (e.g. 'with'), and capitalization, stripping only system RAM phrases and their immediate connectors (e.g. 'with 32GB RAM' is stripped so system RAM does not appear in the GPU name) before sanitization via `_sanitize_hardware_name`.
- **Why**: `HardwareProfileInput` defaults `is_preset=True`. When `RecommendService.recommend()` instantiated a new `HardwareProfileInput` from `spec.hardware`, it previously omitted `is_preset=spec.hardware.is_preset`. As a result, user-provided hardware profiles passed via `RequirementSpec` were mistakenly estimated as `preset` instead of `user_provided`. Furthermore, overly aggressive query cleaning previously stripped prepositions like 'with' and prefixes from user-provided profile names. Separating display name extraction from number/preset parsing guarantees that user hardware phrasing is accurately reflected on cards.
- **Alternatives rejected**: Overriding `is_preset` based on string matching inside `recommend/service.py`; using stripped numeric-cleaning strings to build display names; retaining system RAM phrases in GPU profile names.
- **Files/evidence**: `apps/api/src/modelfit/modules/recommend/service.py:88`, `apps/api/src/modelfit/modules/chat/tools.py:_extract_display_name`, `apps/api/tests/test_recommend_service.py`, `apps/api/tests/test_chat_service.py`.

### D-027 | 2026-11-15 | Contextual Memory Post-Check Grounding, User Echo Differentiation, and Pre-Stream Buffering
- **Decision**: Buffer tokens for the final synthesis round and `MAX_TOOL_ROUNDS` synthesis stream, executing `_post_check_memory_figures` before emitting token events. Grounding differentiates hardware-capacity mentions and plain echoes of user-stated figures from memory-requirement claims: (a) figures within resolved hardware profile names or exact user capacity phrases are preserved as hardware specs; (b) numbers stated by the user across conversation inputs (including RAM, VRAM, unified memory, or bare GB) and echoed back outside requirement clauses are preserved as user capacity echoes (even in turns without tool executions); (c) any memory-requirement claim (preceded/followed by indicators like 'needs', 'requires', 'total', 'headroom', 'weights') must strictly match verified figures in `formatted_gib` (exact float equality `< 1e-4`). Requirement claims not matching tool results (or stated when no tool executed) are replaced with `[refer to card for verified memory requirements]`. On mid-turn stream failures, unverified buffered text is discarded; only `error` and `done` events are emitted.
- **Why**: Rule R-C and AGENTS.md Rule 2 require deterministic grounding for memory estimates while avoiding false-positive replacements when the assistant clarifies or echoes user-provided numbers (e.g. asking "Is this 32GB system RAM, or 32GB Unified Memory?"). Without requirement-context detection, conversational clarification turns mistakenly replaced the user's own numbers with fallback notices.
- **Alternatives rejected**: Bypassing post-checks entirely on clarification turns (would allow ungrounded memory requirement claims like 'you need 16 GiB' to slip through without tool verification); regex matching only exact phrase substrings (broke on natural variation like '32GB system RAM' vs '32GB RAM').
- **Files/evidence**: `apps/api/src/modelfit/modules/chat/service.py:_post_check_memory_figures`, `apps/api/tests/test_chat_service.py`.

## Open Decisions
* **"/" redirect vs landing page**: The root route currently redirects immediately to `/chat`. Whether to maintain an immediate redirect or build a dedicated marketing/overview landing page for first-time visitors remains open.
* **phase4-complete git tag**: Git tags `phase1-complete`, `phase2-complete`, and `phase3-complete` exist, but `phase4-complete` is listed in `docs/PHASES.md` without having been tagged in the git repository.
* **Groq file origin and retention policy**: `groq_client.py` and `key_pool.py` were added during Phase 4 alongside Gemini without an explicit ADR explaining why two distinct providers are concurrently maintained; open whether Groq should remain as an active provider or be migrated/deprecated.
