#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/modelfit}"
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%SZ")
BACKUP_FILE="${BACKUP_DIR}/modelfit_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

echo "Starting backup to ${BACKUP_FILE}..."
docker compose exec -T db pg_dump -U modelfit modelfit | gzip > "${BACKUP_FILE}"

echo "Backup complete: ${BACKUP_FILE}"

# Keep last 7 days of backups
find "${BACKUP_DIR}" -name "modelfit_*.sql.gz" -mtime +7 -delete
