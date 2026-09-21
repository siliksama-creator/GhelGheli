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

# کمکیِ مشترکِ تلگرام — خواندنِ تنظیمات با تحمّلِ کوتیشن (باگِ ۲۶ شهریور:
# نگهبان با `cut -d= -f2-` مقدارِ داخلِ کوتیشن را هم برمی‌داشت و هیچ هشداری
# به تلگرام نمی‌رسید، بدونِ آنکه کسی بفهمد).
# shellcheck source=lib/telegram.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/telegram.sh"

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
NODE_RETRY_DELAY="${NODE_RETRY_DELAY:-2}"  # فاصلهٔ تلاشِ دوم پس از یک بارِ بی‌جواب (ثانیه)
NODE_PROBE_BUDGET="${NODE_PROBE_BUDGET:-15}"  # سقفِ زمانِ سنجشِ همهٔ گره‌ها در یک دور (ثانیه)

# ── چرا «تلاشِ دوم» لازم شد (۲۹ شهریور) ───────────────────────────────
#
# ساعتِ ۰۰:۲۱:۴۶ هشدارِ «گرهِ ۴۰۰۳ جواب نمی‌دهد» به تلگرام رفت و یک ثانیه
# بعد هم برای ۴۰۰۴ — ولی هیچ‌کدام ری‌استارت نشده بودند، هیچ خطایی در لاگِ
# اپ نبود، و سنجشِ بعدی (۹۰ ثانیه بعد) گفت «۵ نود روشن». یعنی یک وقفهٔ
# لحظه‌ای در پاسخِ /health بود (مهلتِ ۵ ثانیه در یک لحظهٔ پرمشغلهٔ کوتاه).
#
# هشدارِ نادرست از هشدارِ واقعی بدتر است: مالک نیمه‌شب بیدار می‌شود و
# اعتمادش به نگهبان از بین می‌رود. پس حالا هر گره دو بار سنجیده می‌شود
# (با ۲ ثانیه فاصله) و فقط اگر **هر دو** بی‌جواب بودند هشدار می‌رود.
# گرهِ واقعاً مرده در همان ثانیهٔ اول هم جواب نمی‌دهد؛ پس خبر دادنِ حادثهٔ
# واقعی کند نشده است.

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
  # ═══════════════════════════════════════════════════════════════════════
  # باگِ واقعیِ ۲۶ شهریور: این‌جا مقدارها با `cut -d= -f2-` خوانده می‌شدند،
  # یعنی **با کوتیشن** — و فایلِ تنظیمات مقدارها را داخل کوتیشن نگه می‌دارد.
  # نتیجه این بود که هیچ هشداری به تلگرام نمی‌رسید (۴۰۴)، ولی کسی نمی‌فهمید
  # چون نگهبان فقط هنگامِ خرابی پیام می‌فرستد. حالا از کمکیِ مشترک می‌خواند.
  # ═══════════════════════════════════════════════════════════════════════
  local TELEGRAM_BOT_TOKEN="" TELEGRAM_CHAT_ID=""
  TELEGRAM_BOT_TOKEN="$(tg_conf_get "$conf" TELEGRAM_BOT_TOKEN)"
  TELEGRAM_CHAT_ID="$(tg_conf_get "$conf" TELEGRAM_CHAT_ID)"
  if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
    log "ALERT (کلیدِ تلگرام ناقص): $text"
    return 0
  fi
  local err
  if ! err=$(tg_send_message "$TELEGRAM_BOT_TOKEN" "$TELEGRAM_CHAT_ID" \
      "$(printf '<b>نگهبانِ GhelGheli</b>\n\n%s\n\nزمان: %s' "$text" "$(date '+%Y-%m-%d %H:%M:%S %z')")"); then
    log "telegram send failed: $text | ${err:0:300}"
  fi
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
PROBE_START="$(date +%s)"
# یک گره = دو تلاش. خروجی: بدنهٔ پاسخ؛ کدِ خروج: ۰ اگر ok بود.
#
# ⚠️ سقفِ بودجه: اگر چند گره هم‌زمان مرده باشند، دو تلاشِ ۵ ثانیه‌ای برای هر
# کدام می‌تواند از فاصلهٔ ۳۰ ثانیه‌ایِ تایمر بلندتر شود و دورِ بعدی را عقب
# بیندازد. پس تا وقتی بودجهٔ این دور (۱۵ ثانیه) تمام نشده تلاشِ دوم انجام
# می‌شود؛ بعد از آن «جواب نداد» قطعی گرفته می‌شود (یک گرهٔ واقعاً مرده از
# همان تلاشِ اول هم خبر می‌دهد).
probe_node() {
  local port="$1" attempt body=""
  for attempt in 1 2; do
    body="$(curl -sS --max-time "$NODE_TIMEOUT" "http://127.0.0.1:${port}/health" 2>/dev/null || true)"
    if printf '%s' "$body" | grep -q '"ok":true'; then
      [ "$attempt" = "2" ] && log "گذرا [node_${port}] تلاشِ اول بی‌جواب بود، تلاشِ دوم سالم — هشدار نرفت"
      printf '%s' "$body"
      return 0
    fi
    if [ "$attempt" = "1" ]; then
      if [ $(( $(date +%s) - PROBE_START )) -ge "$NODE_PROBE_BUDGET" ]; then
        log "بودجهٔ ۱۵ ثانیه‌ایِ سنجش تمام شد — تلاشِ دوم برای پورت ${port} انجام نشد"
        break
      fi
      sleep "$NODE_RETRY_DELAY"
    fi
  done
  printf '%s' "$body"
  return 1
}

for PORT in $PORTS; do
  NODES_TOTAL=$((NODES_TOTAL + 1))
  if probe_node "$PORT" > /tmp/.gg-probe 2>/dev/null; then
    BODY="$(cat /tmp/.gg-probe)"
    NODES_OK=$((NODES_OK + 1))
  else
    BODY="$(cat /tmp/.gg-probe)" 
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
