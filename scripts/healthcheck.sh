#!/usr/bin/env bash
# ============================================================================
#  سلامت‌سنج و هشدارِ تلگرامیِ سرور GhelGheli
# ============================================================================
#
#   /usr/local/bin/ghelgheli-healthcheck.sh          # یک‌بار اجرا
#   /usr/local/bin/ghelgheli-healthcheck.sh --test   # ارسال پیام آزمایشی
#
# ── چرا هست ──────────────────────────────────────────────────────────
# قبل از این، اگر API می‌مرد، nginx خطا می‌داد یا دیسک پر می‌شد، هیچ‌جا
# زنگی به صدا درنمی‌آمد — تا وقتی کاربر خبر می‌داد. این اسکریپت هر ۵
# دقیقه با cron اجرا می‌شود و:
#
#   • زنده‌بودنِ API (PM2 + پاسخ /health)، وب کاربر و دیتابیس را می‌سنجد؛
#   • سنِ آخرین بکاپِ موفق را چک می‌کند (بکاپِ ۳۰ ساعت قبل = هشدار)؛
#   • دیسک و رم را با آستانهٔ امن می‌پاید؛
#   • هر مشکل را **یک‌بار** به تلگرام هشدار می‌دهد و رفع‌شدنش را هم خبر
#     می‌کند (فایل وضعیت از تکرارِ اسپم جلوگیری می‌کند).
#
# رمز بات/چت از همان فایلِ محرمانهٔ بکاپ خوانده می‌شود تا رازِ دومی
# روی سرور نباشد.
set -Eeuo pipefail

STATE_DIR="/var/lib/ghelgheli-health"
STATE_FILE="$STATE_DIR/state.env"
LOG_FILE="/var/log/ghelgheli-health.log"
CONF_FILE="/root/ghelgheli-backups/.telegram.conf"
mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"

# آستانه‌ها
DISK_WARN_PCT=85      # بالای ۸۵٪ استفادهٔ دیسک
MEM_WARN_PCT=92       # بالای ۹۲٪ رم
BACKUP_MAX_AGE_HOURS=30

log() { echo "[$(date -Is)] $*" >> "$LOG_FILE"; }

# ── ارسالِ پیام تلگرام ────────────────────────────────────────────────
tg_send() {
  local text="$1"
  if [ ! -f "$CONF_FILE" ]; then
    log "ALERT (no telegram conf): $text"
    return 0
  fi
  # shellcheck disable=SC1090
  set -a; . "$CONF_FILE"; set +a
  : "${TELEGRAM_BOT_TOKEN:?}"; : "${TELEGRAM_CHAT_ID:?}"
  local emoji_body="🚨 <b>هشدار سرور GhelGheli</b>%0A%0A${text// /%20}"
  # از --data-urlencode استفاده نمی‌کنیم تا وابسته به curl قدیمی نباشد؛
  # متن خودمان فارسی است و در بدنهٔ form ساده می‌نشیند.
  curl -sS --max-time 20 -X POST \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=$(printf '🚨 هشدار سرور GhelGheli\n\n%s\n\nزمان: %s' "$text" "$(date -Is)")" \
    -d "parse_mode=HTML" >/dev/null 2>&1 || log "telegram send failed: $text"
}

# وضعیت یک آلارم: فعال/بی‌فعال را در state نگه می‌داریم تا فقط یک‌بار
# خبر بدهیم و هنگام رفع هم «برگشت به حالت سالم» بفرستیم.
set_alarm() {
  local key="$1" active="$2" msg="$3"
  local prev_key="ALARM_${key}=1"
  local was_active=0
  if [ -f "$STATE_FILE" ] && grep -q "^${prev_key}$" "$STATE_FILE" 2>/dev/null; then
    was_active=1
  fi
  if [ "$active" = "1" ] && [ "$was_active" = "0" ]; then
    tg_send "$msg"
    log "ALERT ON  [$key] $msg"
    grep -v "^ALARM_${key}=" "$STATE_FILE" 2>/dev/null > "$STATE_FILE.tmp" || true
    echo "$prev_key" >> "$STATE_FILE.tmp"; mv "$STATE_FILE.tmp" "$STATE_FILE"
  elif [ "$active" = "0" ] && [ "$was_active" = "1" ]; then
    tg_send "✅ مشکل «${key}» برطرف شد و سرویس به حالت عادی برگشت."
    log "ALERT OFF [$key]"
    grep -v "^ALARM_${key}=" "$STATE_FILE" 2>/dev/null > "$STATE_FILE.tmp" || true
    mv "$STATE_FILE.tmp" "$STATE_FILE"
  fi
}

if [ "${1:-}" = "--test" ]; then
  tg_send "🧪 پیام آزمایشی: مانیتورینگ GhelGheli نصب شد و این کانال هشدارهاست."
  echo "test alert sent"
  exit 0
fi

FAILURES=()

# ── ۱) فرایند API (PM2) ──────────────────────────────────────────────
if ! sudo -u ghelgheli pm2 pid ghelgheli-api >/dev/null 2>&1; then
  FAILURES+=("process: فرایندِ ghelgheli-api زیر PM2 در حال اجرا نیست")
else
  # ── ۲) پاسخ سلامت روی localhost (همان پورتی که nginx پروکسی می‌کند) ──
  HEALTH="$(curl -sS --max-time 10 http://127.0.0.1:4000/health 2>/dev/null || true)"
  if ! echo "$HEALTH" | grep -q '"ok":true'; then
    FAILURES+=("api: پاسخ /health سالم نیست — ${HEALTH:-بدون پاسخ}")
  fi
fi

# ── ۳) وب کاربر از بیرون (از دید کاربر واقعی) ─────────────────────────
WEB_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 https://user.ghelghelishop.ir/ 2>/dev/null || echo 000)"
case "$WEB_CODE" in 2??|3??) : ;; *) FAILURES+=("web: وب کاربر کد $WEB_CODE برگرداند") ;; esac

API_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 https://api.ghelghelishop.ir/health 2>/dev/null || echo 000)"
case "$API_CODE" in 2??) : ;; *) FAILURES+=("api-public: دامنه api کد $API_CODE برگرداند") ;; esac

# ── ۴) دیتابیس: اتصال + خواندنِ یک ردیف ──────────────────────────────
if ! PGPASSWORD="$(cat /root/.ghelgheli_db_pass 2>/dev/null)" \
     psql -h localhost -U ghelgheli -d ghelgheli -tAc "SELECT 1" >/dev/null 2>&1; then
  FAILURES+=("database: اتصال به Postgres تولید برقرار نشد")
fi

# ── ۵) سنِ آخرین بکاپِ محلی ──────────────────────────────────────────
LATEST="/root/ghelgheli-backups/ghelgheli_latest.sql.gz"
if [ -f "$LATEST" ]; then
  AGE_H=$(( ( $(date +%s) - $(stat -c %Y "$LATEST") ) / 3600 ))
  if [ "$AGE_H" -gt "$BACKUP_MAX_AGE_HOURS" ]; then
    FAILURES+=("backup: آخرین بکاپِ محلی ${AGE_H} ساعت قدیمی‌تر از ${BACKUP_MAX_AGE_HOURS} ساعت است")
  fi
else
  FAILURES+=("backup: فایلِ بکاپِ محلی (ghelgheli_latest.sql.gz) وجود ندارد")
fi

# ── ۵ب) نتیجهٔ آخرین تستِ بازیابیِ بکاپ (verify_backup) ───────────────
VERIFY_STATE="$STATE_DIR/backup-verify.env"
if [ -f "$VERIFY_STATE" ]; then
  # shellcheck disable=SC1090
  STATUS="$(grep -E '^LAST_STATUS=' "$VERIFY_STATE" | tail -1 | cut -d= -f2-)"
  if [ "$STATUS" = "fail" ]; then
    REASON="$(grep -E '^LAST_REASON=' "$VERIFY_STATE" | tail -1 | cut -d= -f2-)"
    FAILURES+=("backup-restore: آخرین تستِ بازیابیِ بکاپ شکست خورد — ${REASON:-دلیل نامشخص}")
  fi
fi

# ── ۶) فضای دیسک ─────────────────────────────────────────────────────
DISK_PCT="$(df -P / | awk 'NR==2 {gsub("%",""); print $5}')"
if [ "${DISK_PCT:-0}" -ge "$DISK_WARN_PCT" ]; then
  FAILURES+=("disk: استفادهٔ دیسک ${DISK_PCT}٪ است (آستانه ${DISK_WARN_PCT}٪)")
fi

# ── ۷) فشار حافظه ────────────────────────────────────────────────────
MEM_PCT="$(free | awk '/^Mem:/ {printf "%d", ($3/$2)*100}')"
if [ "${MEM_PCT:-0}" -ge "$MEM_WARN_PCT" ]; then
  FAILURES+=("memory: استفادهٔ رم ${MEM_PCT}٪ است (آستانه ${MEM_WARN_PCT}٪)")
fi

# ── جمع‌بندی و آلارم‌ها ───────────────────────────────────────────────
# برای هر کلیدِ ممکن وضعیت را به‌روز می‌کنیم؛ آلارم‌های فعلی یک کلید
# ترکیبی دارند تا پیام کامل یک‌جا برود.
if [ "${#FAILURES[@]}" -eq 0 ]; then
  # همه سالم: هر آلارمِ بازِ قبلی را خاموش کن.
  if [ -f "$STATE_FILE" ]; then
    while IFS='=' read -r k _; do
      case "$k" in ALARM_*) set_alarm "${k#ALARM_}" 0 "" ;; esac
    done < "$STATE_FILE"
  fi
  log "healthy (disk=${DISK_PCT}% mem=${MEM_PCT}% web=${WEB_CODE} api=${API_CODE})"
else
  MSG="$(printf '• %s\n' "${FAILURES[@]}")"
  set_alarm "health" 1 "$MSG"
  log "UNHEALTHY: ${MSG//$'\n'/ | }"
fi

exit 0
