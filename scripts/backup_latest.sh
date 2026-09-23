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

# ── خودترمیمیِ مالکیت پیش از دامپ ──────────────────────────────────────
#
# دامپ با کاربرِ $DB_USER گرفته می‌شود؛ اگر جدولی مالکِ کسِ دیگری باشد
# (مثلاً بعد از یک بازیابی با postgres) pg_dump با «permission denied»
# می‌ترکد. چون این اسکریپت از cron هم اجرا می‌شود، آن خطا آن‌جا فقط یک
# بکاپِ تازه‌نشده است — و بامدادی که کسی نگاه نمی‌کند، یعنی بی‌بکاپ
# ماندن. منطقِ تعمیر در یک فایل جدا است (scripts/db-ownership-fix.sh) تا
# همان یک پیاده‌سازی در دیپلوی، cron و بازیابی استفاده شود؛ نبودنش
# کشنده نیست، فقط رد می‌شود (سرورِ قدیمی نباید بشکند).
OWNERSHIP_FIX="${OWNERSHIP_FIX:-/usr/local/bin/ghelgheli-db-ownership-fix.sh}"
[ -x "$OWNERSHIP_FIX" ] || OWNERSHIP_FIX="$(cd "$(dirname "$0")" && pwd)/db-ownership-fix.sh"
if [ -x "$OWNERSHIP_FIX" ]; then
  DB_OWNER="$DB_USER" "$OWNERSHIP_FIX" || echo "backup: WARNING ownership fix failed" >&2
fi

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
