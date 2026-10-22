# ModelFit — AI Model Discovery & Hardware Memory Estimator

ModelFit is a local-first platform designed to help technical and non-technical users discover AI models from Hugging Face, calculate exact deterministic hardware requirements (weights, KV cache, activations, and driver overhead), and receive natural-language recommendations through an AI advisor.

Designed with ChatGPT's minimal conversational advisor aesthetic and a dark pine obsidian & sage green palette (`#121615`, `#181e1c`, `#5a826e`, `#3a727d`).

---

## 1. Prerequisites
- **Python**: 3.12+ (managed with `uv`)
- **Node.js**: 22+ (with `npm` or `pnpm`)
- **Docker & Docker Compose**: v2.20+ (for containers and production Caddy)
- **Git**: 2.40+

---

## 2. Quick Start (Under 10 Commands)

```bash
# 1. Clone & copy environment variables
cp .env.example .env

# 2. Install backend dependencies with uv
cd apps/api && uv sync --extra dev

# 3. Export OpenAPI schema
uv run python scripts/export_openapi.py

# 4. Run backend development server
uv run uvicorn modelfit.main:app --reload --port 8000 &

# 5. Install frontend dependencies
cd ../web && npm install

# 6. Run frontend development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the Advisor UI or [http://localhost:3000/status](http://localhost:3000/status) for real-time system diagnostics.

---

## 3. Command Reference (`Makefile`)

| Command | Description |
| :--- | :--- |
| `make dev-api` | Run FastAPI backend locally with hot-reloading |
| `make dev-web` | Run Next.js web application locally with hot-reloading |
| `make test` | Run backend pytest suite and frontend vitest suite |
| `make check` | Run linter, type checks, and tests across backend and frontend |
| `make up` | Start PostgreSQL and background services in Docker |
| `make down` | Stop running containers |
| `make migrate` | Run Alembic database migrations up to head |
| `make gen-apiclient` | Deterministically export `openapi.json` and generate TypeScript client types |

---

## 4. Environment Variables Reference

| Variable | Required | Default | Purpose |
| :--- | :--- | :--- | :--- |
| `APP_ENV` | Yes | `development` | Runtime environment (`development`, `test`, `production`). |
| `DATABASE_URL` | Yes | `postgresql+asyncpg://...` | Connection URI for PostgreSQL with asyncpg driver. |
| `CORS_ORIGINS` | Yes | `http://localhost:3000` | Allowed origins. Strict validation refuses wildcard `*` in production. |
| `LOG_LEVEL` | No | `INFO` | Structlog level (`DEBUG`, `INFO`, `WARNING`, `ERROR`). |
| `APP_VERSION` | No | `1.0.0` | Application release version. |
| `GIT_SHA` | No | `development` | Git commit SHA for build tracking. |
| `ADMIN_TOKEN` | No | - | Secret token required for administrative endpoints (`Phase 5`). |
| `HF_TOKEN` | No | - | Hugging Face Hub API read token (`Phase 3+`). |
| `ANTHROPIC_API_KEY`| No | - | LLM API key for conversational advisor (`Phase 4+`). |

---

## 5. Architecture & Preserved UI Design Tokens

ModelFit preserves the visual styling and component ergonomics:
- **Base Canvas**: `#121615`
- **Sidebar Surface**: `#0e1211`
- **Card & Panel Surface**: `#181e1c`
- **User Message Bubble**: `#2e3e37` (Border `#3c4e46`)
- **Memory Allocation Bar**:
  - Model Weights: Sage Green `#5a826e`
  - KV Cache: Slate Teal `#3a727d`
  - Headroom: Muted Pine `#283731`
- **Modes**:
  1. *Conversational AI Advisor*: Natural language inquiry with quick-reply recommendation pills.
  2. *Advanced Spec*: Custom GPU selection, VRAM allocation, quantization precision, and context length.
  3. *Recommendation Report*: Speed estimates, terminal run command, and technical breakdown.

---

## 6. Troubleshooting

- **503 on `/api/v1/health/ready`**: The database is unreachable or taking longer than 2.0 seconds to respond. Check `DATABASE_URL` and ensure PostgreSQL is running.
- **CORS Rejected on Startup**: In production mode (`APP_ENV=production`), `CORS_ORIGINS` must not contain `*`. Specify exact origin domains.
- **Port Conflict**: If port 8000 or 3000 is occupied, set `PORT` in `.env` or pass `--port` when running servers.
