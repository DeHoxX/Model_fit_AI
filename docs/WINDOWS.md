# Windows & PowerShell Development Guide

This guide describes development workflows on Windows using PowerShell, serving as the native equivalent to the repo's `Makefile`.

---

## 1. Quick Reference: PowerShell Script (`scripts/dev.ps1`)

The repository includes a PowerShell runner script at [`scripts/dev.ps1`](file:///e:/CanItRunAI/scripts/dev.ps1).

You can run commands from the project root using PowerShell:

```powershell
# Start both FastAPI backend and Next.js frontend concurrently
.\scripts\dev.ps1

# Start FastAPI backend server only (uses API_PORT, default 8000)
.\scripts\dev.ps1 dev-api

# Start Next.js frontend dev server only
.\scripts\dev.ps1 dev-web

# Run all linters (ruff for Python, eslint for Next.js)
.\scripts\dev.ps1 lint

# Auto-format all code
.\scripts\dev.ps1 format

# Strict typechecking (mypy strict and tsc)
.\scripts\dev.ps1 typecheck

# Run test suites (pytest and vitest)
.\scripts\dev.ps1 test

# Apply database migrations
.\scripts\dev.ps1 migrate

# Create new alembic migration
.\scripts\dev.ps1 migration-new "migration_description"

# Generate TypeScript API client from FastAPI OpenAPI schema
.\scripts\dev.ps1 gen-apiclient

# Run the full validation gate via scripts/check.ps1
.\scripts\dev.ps1 check
```

---

## 2. Direct PowerShell Commands

If you prefer executing commands directly without the helper script:

| Action | PowerShell Command |
|---|---|
| **Run Full Check** | `.\scripts\check.ps1` |
| **Run Backend API** | `cd apps/api; uv run uvicorn modelfit.main:app --reload --port 8000` |
| **Run Frontend Web** | `cd apps/web; npm run dev` |
| **Alembic Migrate** | `cd apps/api; uv run alembic upgrade head` |
| **Python Lint** | `cd apps/api; uv run ruff check .` |
| **Python Typecheck** | `cd apps/api; uv run mypy --strict src/modelfit` |
| **Python Tests** | `cd apps/api; uv run pytest -v` |
| **Web Tests** | `cd apps/web; npm run test` |
