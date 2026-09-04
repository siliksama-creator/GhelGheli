#!/usr/bin/env bash
# ============================================================================
#  تستِ بازیابیِ بکاپ (backup restore drill)
# ============================================================================
#
#   /usr/local/bin/ghelgheli-verify-backup.sh            # تستِ آخرین بکاپ
#
# ── چرا هست ──────────────────────────────────────────────────────────
# «بکاپی که هیچ‌وقت بازیابی نشده، بکاپ نیست.» این اسکریپت روزانه بعد از
# بکاپ اجرا می‌شود و ثابت می‌کند که فایلِ دیشب واقعاً قابلِ برگرداندن است:
#
#   ۱. آخرین dump محلی (ghelgheli_latest.sql.gz) را در یک دیتابیسِ
#      موقتِ ghelgheli_restoretest بارگذاری می‌کند؛
#   ۲. gzip integrity و وجودِ جدول‌های کلیدی (users، game_stake_matches،
#      wallet_transactions) و صحتِ شمارش‌ها را می‌سنجد؛
#   ۳. تارِ uploads را هم یک‌بار فهرست می‌کند تا خراب نباشد؛
#   ۴. دیتابیسِ موقت را در انتها می‌اندازد؛
#   ۵. نتیجه را در فایلِ state می‌نویسد تا healthcheck اگر تست شکست خورد
#      هشدار بدهد، و در حالتِ --test خلاصه را به تلگرام می‌فرستد.
#
# هیچ تماسی با دیتابیسِ production ندارد.
set -Eeuo pipefail

BACKUP_DIR="${BACKUP_DIR:-/root/ghelgheli-backups}"
DUMP="$BACKUP_DIR/ghelgheli_latest.sql.gz"
UPLOADS_TAR="$BACKUP_DIR/ghelgheli_uploads_latest.tar.gz"
STATE_FILE="/var/lib/ghelgheli-health/backup-verify.env"
LOG_FILE="/var/log/ghelgheli-backup-verify.log"
CONF_FILE="/root/ghelgheli-backups/.telegram.conf"
DB_PASS_FILE="${DB_PASS_FILE:-/root/.ghelgheli_db_pass}"
TEST_DB="ghelgheli_restoretest_$$"

mkdir -p "$(dirname "$STATE_FILE")"
log() { echo "[$(date -Is)] $*" >> "$LOG_FILE"; }
tg_send() {
  [ -f "$CONF_FILE" ] || { log "(no telegram) $*"; return 0; }
  # shellcheck disable=SC1090
  set -a; . "$CONF_FILE"; set +a
  curl -sS --max-time 20 -X POST \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=$*" >/dev/null 2>&1 || true
}

cleanup() {
  sudo -u postgres psql -d postgres \
    -c "DROP DATABASE IF EXISTS $TEST_DB;" >/dev/null 2>&1 || true
}
trap cleanup EXIT

FAIL=()

log "starting restore test on $TEST_DB"

# ── ۱) فایل تازه و سالم؟ ─────────────────────────────────────────────
if [ ! -f "$DUMP" ]; then FAIL+=("فایل dump وجود ندارد: $DUMP"); fi
if [ "${#FAIL[@]}" -eq 0 ]; then
  if ! gzip -t "$DUMP" 2>/dev/null; then
    FAIL+=("آزمونِ gzip روی dump شکست خورد (فایل خراب است)")
  fi
  AGE_H=$(( ( $(date +%s) - $(stat -c %Y "$DUMP") ) / 3600 ))
  if [ "$AGE_H" -gt 30 ]; then FAIL+=("dump ${AGE_H} ساعت قدیمی است"); fi
fi

# ── ۲) بارگذاری در دیتابیسِ موقت ────────────────────────────────────
if [ "${#FAIL[@]}" -eq 0 ]; then
  sudo -u postgres psql -d postgres \
    -c "CREATE DATABASE $TEST_DB OWNER ghelgheli;" >/dev/null
  if ! gunzip -c "$DUMP" | PGPASSWORD="$(cat "$DB_PASS_FILE")" \
       psql -h localhost -U ghelgheli -d "$TEST_DB" -q >/dev/null 2>>"$LOG_FILE"; then
    FAIL+=("بارگذاریِ dump در دیتابیسِ تست شکست خورد (restore ناقص)")
  fi
fi

# ── ۳) جدول‌های کلیدی و داده ─────────────────────────────────────────
if [ "${#FAIL[@]}" -eq 0 ]; then
  for tbl in users admin_users game_stake_matches wallet_transactions; do
    CNT="$(PGPASSWORD="$(cat "$DB_PASS_FILE")" psql -h localhost -U ghelgheli \
            -d "$TEST_DB" -tAc "SELECT to_regclass('public.$tbl') IS NOT NULL;" 2>/dev/null || echo 0)"
    [ "$CNT" = "t" ] || FAIL+=("جدولِ $tbl در dump بازیابی‌شده موجود نیست")
  done
  USERS="$(PGPASSWORD="$(cat "$DB_PASS_FILE")" psql -h localhost -U ghelgheli \
            -d "$TEST_DB" -tAc 'SELECT count(*) FROM users;' 2>/dev/null || echo -1)"
  if [ "${USERS:--1}" -lt 1 ]; then FAIL+=("شمارش کاربران در dump غیرمنطقی است: $USERS"); fi
  log "restore test ok — users=$USERS"
fi

# ── ۴) تارِ uploads سالم است؟ ───────────────────────────────────────
if [ -f "$UPLOADS_TAR" ]; then
  if ! gzip -t "$UPLOADS_TAR" 2>/dev/null; then
    FAIL+=("آزمونِ gzip روی آرشیو uploads شکست خورد")
  elif ! tar -tzf "$UPLOADS_TAR" >/dev/null 2>&1; then
    FAIL+=("آرشیو uploads قابلِ فهرست‌کردن نیست")
  fi
fi

# ── ۵) گزارش ─────────────────────────────────────────────────────────
if [ "${#FAIL[@]}" -eq 0 ]; then
  {
    echo "LAST_OK_AT=$(date -Is)"
    echo "LAST_OK_USERS=${USERS:-unknown}"
    echo "LAST_STATUS=ok"
  } > "$STATE_FILE"
  chmod 600 "$STATE_FILE"
  log "BACKUP VERIFY OK"
  if [ "${1:-}" = "--test" ]; then
    tg_send "✅ تستِ بازیابیِ بکاپ موفق بود — dump در دیتابیسِ موقت بارگذاری و راستی‌آزمایی شد (کاربران: ${USERS})."
  fi
  exit 0
else
  MSG="$(printf '• %s\n' "${FAIL[@]}")"
  {
    echo "LAST_FAIL_AT=$(date -Is)"
    echo "LAST_STATUS=fail"
    echo "LAST_REASON=$(printf '%s; ' "${FAIL[@]}")"
  } > "$STATE_FILE"
  chmod 600 "$STATE_FILE"
  log "BACKUP VERIFY FAILED: $MSG"
  tg_send "🚨 تستِ بازیابیِ بکاپ شکست خورد:
$MSG"
  exit 1
fi
