#!/usr/bin/env bash
set -Eeuo pipefail

# Keeps only the latest backup by overwriting the same files on each run.
# Intended for VPS cron/systemd daily execution.
APP_DIR="${APP_DIR:-/var/www/GhelGheli}"
BACKUP_DIR="${BACKUP_DIR:-/root/ghelgheli-backups}"
DB_NAME="${DB_NAME:-ghelgheli}"
DB_USER="${DB_USER:-ghelgheli}"
DB_HOST="${DB_HOST:-localhost}"
DB_PASS_FILE="${DB_PASS_FILE:-/root/.ghelgheli_db_pass}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

export PGPASSWORD="$(cat "$DB_PASS_FILE")"
TMP_DB="$BACKUP_DIR/ghelgheli_latest.sql.gz.tmp"
FINAL_DB="$BACKUP_DIR/ghelgheli_latest.sql.gz"
pg_dump -h "$DB_HOST" -U "$DB_USER" "$DB_NAME" | gzip -9 > "$TMP_DB"
mv "$TMP_DB" "$FINAL_DB"
chmod 600 "$FINAL_DB"

if [ -d "$APP_DIR/backend/uploads" ]; then
  TMP_UPLOADS="$BACKUP_DIR/ghelgheli_uploads_latest.tar.gz.tmp"
  FINAL_UPLOADS="$BACKUP_DIR/ghelgheli_uploads_latest.tar.gz"
  tar -czf "$TMP_UPLOADS" -C "$APP_DIR/backend" uploads
  mv "$TMP_UPLOADS" "$FINAL_UPLOADS"
  chmod 600 "$FINAL_UPLOADS"
fi

date -Is > "$BACKUP_DIR/last_backup_at.txt"
echo "Latest backup written to $BACKUP_DIR"
