#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
#  نگهبانِ سلامتِ GhelGheli — هر ۳۰ ثانیه
# ════════════════════════════════════════════════════════════════════════════
#
#   اجراکننده: systemd  →  ghelgheli-health.timer (هر ۳۰ ثانیه)
#                          ghelgheli-health.service → همین فایل
#
#   /var/www/GhelGheli/monitor/health.sh
#
# ── چرا این فایل حالا داخلِ گیت است (و قبلاً نبود) ─────────────────────────
#
# این اسکریپت اولین‌بار بیرونِ گیت و فقط روی سرور ساخته شده بود. دیپلوی
# (deploy.sh) پس از هر انتشار `git clean -fd` می‌زند تا فایل‌های سرگردان را
# پاک کند — فایل‌های *ردیابی‌شده* را دست نمی‌زند، ولی همین فایل چون تعقیب
# نمی‌شد پاک شد و سرویسِ ۳۰ ثانیه‌ای از کار افتاد (خطای 203/EXEC، هر ۳۰
# ثانیه یک خط در journald). حالا داخلِ مخزن است، پس از هر دیپلوی سرِ جایش
# می‌مانَد.
#
# ── چه می‌کند ──────────────────────────────────────────────────────────────
#
#   ۱. هر گرهٔ API را روی پورتِ خودش می‌سنجد (فهرستِ پورت از فایلِ ظرفیت
#      می‌آید، پس افزودن/کم‌کردنِ گره با ارتقای سرور خودکار درست می‌ماند).
#   ۲. دیسک و رمِ آزاد را با آستانهٔ امن می‌پاید.
#   ۳. هر تغییرِ وضعیت را **یک‌بار** به تلگرام خبر می‌دهد (و رفعِ آن را هم).
#   ۴. هر ۱۰ دقیقه یک «همه‌چیز آرام» در لاگ می‌نویسد تا معلوم باشد زنده است.
#
# هیچ چیزی را تغییر نمی‌دهد و هیچ‌وقت پروسه‌ای را ری‌استارت نمی‌کند: PM2 خودش
# گرهِ مرده را بالا می‌آورد؛ کارِ این فایل فقط *دیدن* و *خبر دادن* است.
# پس اگر جایی خطا داد، فقط لاگ می‌شود و کدِ خروج همیشه ۰ است — وگرنه systemd
# هر ۳۰ ثانیه یک «failed» تحویل می‌دهد.
#
# ── تنظیمات (همه با متغیرِ محیط قابل‌تغییرند) ───────────────────────────────
#
#   PORTS_FILE   فهرستِ پورت‌های گره (پیش‌فرض /etc/ghelgheli-capacity-ports)
#   LOG_FILE     فایلِ لاگ (پیش‌فرض /var/log/ghelgheli-health.log)
#   STATE_DIR    وضعیتِ آلارم‌ها (پیش‌فرض /var/lib/ghelgheli-health)
#   HEARTBEAT_S  فاصلهٔ «همه‌چیز آرام» (پیش‌فرض ۶۰۰ ثانیه)
set -uo pipefail

APP_DIR="${APP_DIR:-/var/www/GhelGheli}"
PORTS_FILE="${PORTS_FILE:-/etc/ghelgheli-capacity-ports}"
LOG_FILE="${LOG_FILE:-/var/log/ghelgheli-health.log}"
STATE_DIR="${STATE_DIR:-/var/lib/ghelgheli-health}"
STATE_FILE="$STATE_DIR/monitor-state.env"
HEARTBEAT_FILE="$STATE_DIR/last-heartbeat"
HEARTBEAT_S="${HEARTBEAT_S:-600}"

# آستانه‌ها
DISK_WARN_PCT="${DISK_WARN_PCT:-85}"     # بالای ۸۵٪ استفادهٔ دیسک
MEM_WARN_PCT="${MEM_WARN_PCT:-92}"       # بالای ۹۲٪ مصرفِ رم
NODE_TIMEOUT="${NODE_TIMEOUT:-5}"        # مهلتِ پاسخِ /health هر گره (ثانیه)

# کلیدِ تلگرام بیرونِ مخزن است تا راز هرگز داخلِ گیت نرود و دیپلوی
# (`git clean`) هم پاکش نکند.
TG_CONF="${TG_CONF:-/root/ghelgheli-backups/.telegram.conf}"
TG_CONF_ALT="${TG_CONF_ALT:-/root/.ghelgheli_backup.conf}"

mkdir -p "$STATE_DIR" 2>/dev/null || true
chmod 700 "$STATE_DIR" 2>/dev/null || true

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] $*" >> "$LOG_FILE" 2>/dev/null || true; }

# ── ارسالِ پیامِ تلگرام ─────────────────────────────────────────────────────
tg_send() {
  local text="$1" conf=""
  [ -f "$TG_CONF" ] && conf="$TG_CONF"
  [ -z "$conf" ] && [ -f "$TG_CONF_ALT" ] && conf="$TG_CONF_ALT"
  if [ -z "$conf" ]; then
    log "ALERT (بدونِ کلیدِ تلگرام): $text"
    return 0
  fi
  # shellcheck disable=SC1090
  local TELEGRAM_BOT_TOKEN="" TELEGRAM_CHAT_ID=""
  TELEGRAM_BOT_TOKEN="$(grep -m1 -E '^TELEGRAM_BOT_TOKEN=' "$conf" | cut -d= -f2-)"
  TELEGRAM_CHAT_ID="$(grep -m1 -E '^TELEGRAM_CHAT_ID=' "$conf" | cut -d= -f2-)"
  if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
    log "ALERT (کلیدِ تلگرام ناقص): $text"
    return 0
  fi
  curl -sS --max-time 20 -X POST \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=$(printf '🖥 <b>نگهبانِ GhelGheli</b>\n\n%s\n\nزمان: %s' "$text" "$(date '+%Y-%m-%d %H:%M:%S %z')")" \
    -d "parse_mode=HTML" >/dev/null 2>&1 || log "telegram send failed: $text"
}

# وضعیتِ یک آلارم: فقط هنگامِ تغییر خبر می‌دهد (نه اسپمِ هر ۳۰ ثانیه).
alarm() {
  local key="$1" active="$2" msg="$3" was=0
  [ -f "$STATE_FILE" ] && grep -q "^ALARM_${key}=1$" "$STATE_FILE" 2>/dev/null && was=1
  if [ "$active" = "1" ] && [ "$was" = "0" ]; then
    tg_send "🚨 $msg"
    log "ALERT ON  [$key] $msg"
    grep -v "^ALARM_${key}=" "$STATE_FILE" 2>/dev/null > "$STATE_FILE.tmp" || true
    echo "ALARM_${key}=1" >> "$STATE_FILE.tmp"
    mv "$STATE_FILE.tmp" "$STATE_FILE"
  elif [ "$active" = "0" ] && [ "$was" = "1" ]; then
    tg_send "✅ مشکل «${key}» برطرف شد و سرویس به حالتِ عادی برگشت."
    log "ALERT OFF [$key]"
    grep -v "^ALARM_${key}=" "$STATE_FILE" 2>/dev/null > "$STATE_FILE.tmp" || true
    mv "$STATE_FILE.tmp" "$STATE_FILE"
  fi
}

# ── ۱) گره‌های API ─────────────────────────────────────────────────────────
# فهرستِ پورت از فایلِ ظرفیت می‌آید؛ اگر نبود، پروفایلِ پایهٔ دوهسته‌ای.
PORTS="$(cat "$PORTS_FILE" 2>/dev/null | tr -s '[:space:]' ' ' || true)"
[ -z "${PORTS// /}" ] && PORTS="4000 4001 4002"

NODES_OK=0
NODES_TOTAL=0
NODES_DOWN=""
for PORT in $PORTS; do
  NODES_TOTAL=$((NODES_TOTAL + 1))
  BODY="$(curl -sS --max-time "$NODE_TIMEOUT" "http://127.0.0.1:${PORT}/health" 2>/dev/null || true)"
  if printf '%s' "$BODY" | grep -q '"ok":true'; then
    NODES_OK=$((NODES_OK + 1))
  else
    NODES_DOWN="${NODES_DOWN}${NODES_DOWN:+, }${PORT}"
    # آلارمِ هر پورت جدا نگه داشته می‌شود تا اگر دو گره افتاد، هر دو خبر داده شود.
    alarm "node_${PORT}" "1" "گرهِ API روی پورت ${PORT} جواب نمی‌دهد (${BODY:-بدونِ پاسخ}). اگر خودش بالا نیامد، وضعیتِ PM2 را ببینید."
  fi
done

# ── ۲) منابع ───────────────────────────────────────────────────────────────
DISK_PCT="$(df -P / 2>/dev/null | awk 'NR==2 {gsub(/%/,"",$5); print $5}')"
DISK_PCT="${DISK_PCT:-0}"
FREE_MB="$(awk '/^MemAvailable:/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)"
MEM_TOTAL_MB="$(awk '/^MemTotal:/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 1)"
MEM_USED_PCT=$(( MEM_TOTAL_MB > 0 ? (MEM_TOTAL_MB - FREE_MB) * 100 / MEM_TOTAL_MB : 0 ))

if [ "$DISK_PCT" -gt "$DISK_WARN_PCT" ]; then
  alarm "disk" "1" "فضای دیسک به ${DISK_PCT}٪ رسید (آستانه ${DISK_WARN_PCT}٪)."
else
  alarm "disk" "0" ""
fi
if [ "$MEM_USED_PCT" -gt "$MEM_WARN_PCT" ]; then
  alarm "mem" "1" "مصرفِ رم به ${MEM_USED_PCT}٪ رسید (آزاد: ${FREE_MB}MB، آستانه ${MEM_WARN_PCT}٪)."
else
  alarm "mem" "0" ""
fi

# ── ۳) ضربان ───────────────────────────────────────────────────────────────
# «همه‌چیز آرام» هر HEARTBEAT_S یک‌بار، تا لاگ نشان بدهد نگهبان زنده است.
NOW="$(date +%s)"
LAST="$(cat "$HEARTBEAT_FILE" 2>/dev/null || echo 0)"
case "$LAST" in ''|*[!0-9]*) LAST=0 ;; esac
if [ $((NOW - LAST)) -ge "$HEARTBEAT_S" ]; then
  if [ "$NODES_OK" = "$NODES_TOTAL" ] && [ "$DISK_PCT" -le "$DISK_WARN_PCT" ] && [ "$MEM_USED_PCT" -le "$MEM_WARN_PCT" ]; then
    log "✅ همه‌چیز آرام — دیسک ${DISK_PCT}%، رم ${FREE_MB}MB، ${NODES_OK} نود روشن"
  else
    log "⚠️ گره ${NODES_OK}/${NODES_TOTAL} — دیسک ${DISK_PCT}%، رم ${FREE_MB}MB${NODES_DOWN:+، خاموش: $NODES_DOWN}"
  fi
  echo "$NOW" > "$HEARTBEAT_FILE" 2>/dev/null || true
fi

exit 0
