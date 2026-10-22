# ModelFit VM Deployment Notes

## Prerequisites
- A Linux VM with Ubuntu 22.04+ LTS.
- Docker and Docker Compose v2 installed.
- Inbound ports 80 and 443 open. Port 5432 and 8000 kept internal / closed to public.

## Deployment Steps
1. Clone repo onto VM.
2. Copy `.env.example` to `.env` and fill secrets (`ADMIN_TOKEN`, `DATABASE_URL`, etc.).
3. Generate basic auth credentials for Caddy front door lock:
   ```bash
   caddy hash-password --plaintext 'your_secret_password'
   ```
4. Run migrations:
   ```bash
   docker compose -f docker-compose.prod.yml run --rm api alembic upgrade head
   ```
5. Launch services:
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```
