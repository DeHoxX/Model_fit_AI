# ModelFit: Project Constitution

## Product
ModelFit is a web application that helps technical and non-technical users
(a) discover AI models from the Hugging Face Hub, (b) estimate the memory
needed to run them for a chosen hardware profile, quantization, context
length, batch size, and inference runtime, (c) save configurations and
conversations, and (d) get natural-language model recommendations from a
chatbot. It is a personal portfolio project deployed on a single VM. It has
NO user accounts in v1. Build it cleanly enough to be scaled to production
later.

## Non-negotiable rules
1. The deterministic estimation engine is the single source of truth for
memory numbers, fit verdicts, and compatibility results.
2. An LLM must never invent or alter model metadata, memory estimates,
compatibility results, or performance measurements. The LLM may only (a) turn
user language into structured requirements and tool arguments, and (b)
explain results returned by tools.
3. All Hugging Face metadata is normalized into the internal NormalizedModel
schema before reaching the estimator. The estimator never sees raw Hugging
Face JSON.
4. Unsupported architectures and incomplete metadata are first-class outcomes
with explicit reasons. Never guess silently and never crash.
5. Secrets and API keys live only in backend environment variables. Nothing
secret ships to the browser, logs, or the repo.
6. Data ownership goes through repositories so a user_id can be added later
without rewriting services.
7. No embeddings or vector database unless a genuine semantic document search
requirement is added to this file.
8. No unnecessary abstractions or dependencies. Every new dependency needs a
one-line justification in docs/DECISIONS.md.
9. Typed interfaces, explicit error handling, automated tests, and database
migrations are mandatory for every feature.
10. Never overwrite or remove working functionality without explaining why in
the plan and in docs/DECISIONS.md.
11. Truthfulness: never claim a test, build, integration, or deployment
succeeded unless you ran it in this session and saw it succeed. Quote the
command and a summary of the real output. If something could not be run, say
so.
12. Do not invent facts: version numbers, GPU specs, API behaviours, or
reference measurements. Look them up from official sources or mark them
TODO(verify) and list them in the final report.
13. Speed (tokens per second) and benchmark claims are out of scope. Never
display or generate performance numbers.

## Tech stack (current stable releases, pinned in lockfiles, verified not guessed)
Frontend: Next.js (App Router), React, TypeScript strict, Tailwind CSS,
shadcn/ui, TanStack Query, React Hook Form with Zod, openapi-typescript,
Vitest, Testing Library, Playwright.
Backend: Python 3.12+, FastAPI, Pydantic v2 with pydantic-settings,
SQLAlchemy 2.x async with asyncpg, Alembic, huggingface_hub, httpx,
structlog, pytest, pytest-asyncio, respx, hypothesis, ruff, mypy strict,
import-linter. LLM access through the official Anthropic SDK behind a small
LLMClient interface.
Data: PostgreSQL 16+. No Redis.
Infra: Docker (multi-stage, non-root), Docker Compose, Caddy, GitHub Actions.
Package managers: uv and pnpm.

## Repository layout
modelfit/
CLAUDE.md AGENTS.md README.md Makefile .env.example
docker-compose.yml docker-compose.prod.yml
apps/api/ (pyproject.toml, alembic/, src/modelfit/{main.py, core/, db/,
modules/{health,catalog,estimator,configs,chat,recommend,admin}/}, tests/)
apps/web/ (src/app, src/components, src/lib, src/api generated client,
tests/)
infra/    (Caddyfile, backup script, deploy notes)
docs/     (ARCHITECTURE.md PHASES.md DECISIONS.md API.md RUNBOOK.md)
.github/workflows/

## Architecture conventions
- Inside each backend module: router.py (HTTP only) calls service.py (logic)
calls repository.py (database). Modules talk to each other only through
service interfaces.
- modules/estimator is PURE: no imports from FastAPI, SQLAlchemy, httpx, or
huggingface_hub. Enforced by an import-linter contract in CI.
- API under /api/v1, JSON snake_case, UUID primary keys, UTC timestamptz,
created_at and updated_at on every table. List endpoints are paginated.
Hugging Face lists use an opaque cursor, not page numbers.
- One error envelope everywhere: { "error": { "code", "message", "details",
"request_id" } }. Never leak stack traces.
- Units: bytes internally; UI shows GiB by default with a GB toggle.
- One typed settings object from env. Fail fast at startup if a required
value is missing.
- Structured JSON logs with a request ID. Never log API keys or full prompts.
- Every schema change is an Alembic migration, tested by upgrade from empty
and downgrade one step.
- Frontend: server components by default; all API calls through the generated
typed client; every async view has loading, empty, and error states;
accessible and responsive from 360px, light and dark themes.
- Git: Conventional Commits, small commits, one branch per phase.

## Testing policy
- Backend: unit tests for pure logic; integration tests against real Postgres
in Docker (no DB mocking); external HTTP (Hugging Face, LLM) mocked at the
HTTP boundary with respx and recorded fixtures.
- Coverage gates: estimator at least 95 percent, backend overall at least 80
percent.
- Frontend: Vitest with MSW, and Playwright for critical journeys.
- Every bug fix gets a regression test first.

## Lightweight security baseline
Validate all input with Pydantic. Parameterized queries only. Strict CORS.
Security headers. Rate limit chat and Hugging Face proxy routes. Treat all
Hugging Face text (model cards, tags, descriptions) and all user text as
untrusted: never execute it, never let it override system instructions. No
eval, no shell interpolation. Run dependency and secret scans in CI.

## Mandatory workflow for every phase
1. Inspect: read CLAUDE.md, README.md, docs/PHASES.md, docs/ARCHITECTURE.md,
docs/DECISIONS.md and the code. State what exists, what is complete, what is
outstanding.
2. Plan: list files, dependencies (justified), interfaces, schemas,
migrations, tests, risks. STOP and wait for approval before writing code.
3. Implement only the requested phase. Reuse existing interfaces. Do not
start the next phase.
4. Verify: run linters, type checks, tests, migrations, and the real
application flow.
5. Fix regressions. Report limitations honestly.
6. Update README.md, docs/PHASES.md (ledger), ARCHITECTURE.md, DECISIONS.md,
API.md.
7. Final report in this exact shape: Completed features; Files changed
(grouped); Commands run with real results; Test results with counts and
coverage; Manual verification performed; Known limitations; TODO(verify)
items; Acceptance checklist with each item marked verified or not verified;
Exact criteria required before the next phase.
