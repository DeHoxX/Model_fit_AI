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
