.PHONY: up down logs dev-api dev-web lint format typecheck test migrate migration-new gen-apiclient check

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

dev-api:
	cd apps/api && uv run uvicorn modelfit.main:app --reload --port 8000

dev-web:
	cd apps/web && npm run dev

lint:
	cd apps/api && uv run ruff check .
	cd apps/web && npm run lint

format:
	cd apps/api && uv run ruff format .
	cd apps/web && npm run format

typecheck:
	cd apps/api && uv run mypy --strict src/modelfit
	cd apps/web && npm run typecheck

test:
	cd apps/api && uv run pytest -v
	cd apps/web && npm run test

migrate:
	cd apps/api && uv run alembic upgrade head

migration-new:
	cd apps/api && uv run alembic revision --autogenerate -m "$(name)"

gen-apiclient:
	cd apps/api && uv run python scripts/export_openapi.py
	cd apps/web && npm run gen:api

check: lint typecheck test
