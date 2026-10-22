# ModelFit Runbook

## Development Commands
- `make up`: Start PostgreSQL and local development services in Docker.
- `make dev-api`: Run FastAPI backend locally with hot-reloading.
- `make dev-web`: Run Next.js frontend locally with hot-reloading.
- `make test`: Run backend pytest and frontend test suites.
- `make check`: Run linting, typechecks, and test suites across the stack.
- `make migrate`: Run Alembic migrations up to head.

## Troubleshooting
### Database Connection Failure
- Verify PostgreSQL is running: `docker compose ps`
- Verify connection string: `DATABASE_URL` in `.env`
- Inspect logs: `docker compose logs -f db`
