#!/usr/bin/env bash
# Example: nightly MongoDB backup via cron.
# 1. cp mongodb-backup.example.sh mongodb-backup.sh && chmod +x mongodb-backup.sh
# 2. Edit BACKUP_ROOT, optionally MONGODB_URI / MONGODB_DB (or export before run).
# 3. crontab: 0 2 * * * /opt/scripts/mongodb-backup.sh >> /var/log/po-mongo-backup.log 2>&1
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/parent-orientation-mongo}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_ROOT}/${STAMP}"

if [[ -z "${MONGODB_URI:-}" ]]; then
  echo "Set MONGODB_URI (same as app .env) before running."
  exit 1
fi

DB_NAME="${MONGODB_DB:-parent_orientation}"

mkdir -p "$OUT"
mongodump --uri="$MONGODB_URI" --db="$DB_NAME" --out="$OUT/dump"
tar -czf "${OUT}.tar.gz" -C "$OUT" dump
rm -rf "$OUT"
echo "Backup written: ${OUT}.tar.gz"
find "$BACKUP_ROOT" -name '*.tar.gz' -mtime +30 -delete 2>/dev/null || true
