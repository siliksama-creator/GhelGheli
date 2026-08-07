#!/usr/bin/env bash
#
# Interactive one-time setup for the daily Telegram backup.
#
#   bash /var/www/GhelGheli/scripts/setup_telegram_backup.sh
#
# Asks for the bot token and chat id, verifies BOTH by actually talking to
# Telegram (a wrong chat id is the single most common failure and it fails
# silently otherwise), installs the scripts, writes the cron entry and sends
# a real test backup so you can see it arrive before you walk away.
#
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/GhelGheli}"
CONF=/root/.ghelgheli_backup.conf

BOLD=$'\e[1m'; GREEN=$'\e[1;32m'; CYAN=$'\e[1;36m'; RED=$'\e[1;31m'; YEL=$'\e[1;33m'; OFF=$'\e[0m'
step() { echo; echo "${CYAN}==> $*${OFF}"; }
ok()   { echo "${GREEN}  ✓ $*${OFF}"; }
die()  { echo "${RED}خطا: $*${OFF}" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "با root اجرا کن"

echo "${BOLD}"
echo "  ┌──────────────────────────────────────────┐"
echo "  │   راه‌اندازی بکاپ روزانه به تلگرام        │"
echo "  └──────────────────────────────────────────┘"
echo "${OFF}"

# ── Token ─────────────────────────────────────────────────────────────────
if [ -f "$CONF" ]; then
  # shellcheck disable=SC1090
  . "$CONF"
  echo "  تنظیمات قبلی پیدا شد (ربات: ...${TELEGRAM_BOT_TOKEN: -6})"
  read -rp "  می‌خواهی عوضش کنی؟ [y/N] " ch
  [[ "$ch" =~ ^[Yy]$ ]] && { TELEGRAM_BOT_TOKEN=""; TELEGRAM_CHAT_ID=""; }
fi

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ]; then
  echo
  echo "${BOLD}گام ۱ — توکن ربات${OFF}"
  echo "  اگر ربات نداری: در تلگرام به @BotFather پیام بده و /newbot بزن."
  read -rp "  توکن ربات: " TELEGRAM_BOT_TOKEN
fi
[ -n "$TELEGRAM_BOT_TOKEN" ] || die "توکن خالی است"

API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"
step "بررسی توکن"
ME=$(curl -sS --max-time 20 "$API/getMe")
echo "$ME" | grep -q '"ok":true' || die "توکن معتبر نیست"
BOTNAME=$(echo "$ME" | grep -o '"username":"[^"]*"' | head -1 | cut -d'"' -f4)
ok "ربات @${BOTNAME} تأیید شد"

# ── Chat id ───────────────────────────────────────────────────────────────
if [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
  echo
  echo "${BOLD}گام ۲ — مقصد بکاپ${OFF}"
  echo "  ${YEL}الان در تلگرام به @${BOTNAME} پیام «سلام» بده، بعد Enter بزن.${OFF}"
  echo "  (اگر می‌خواهی به یک کانال خصوصی برود، ربات را ادمین کانال کن و"
  echo "   یک پیام در کانال بفرست.)"
  read -rp "  آماده‌ای؟ Enter..." _

  for try in 1 2 3; do
    UP=$(curl -sS --max-time 20 "$API/getUpdates")
    TELEGRAM_CHAT_ID=$(echo "$UP" | python3 -c "
import sys, json
try: d = json.load(sys.stdin)
except Exception: sys.exit()
for x in reversed(d.get('result', [])):
    m = x.get('message') or x.get('channel_post') or {}
    cid = m.get('chat', {}).get('id')
    if cid:
        print(cid); break
" 2>/dev/null || true)
    [ -n "$TELEGRAM_CHAT_ID" ] && break
    echo "  ${YEL}چیزی نیامد. یک پیام دیگر بفرست...${OFF}"
    sleep 4
  done

  if [ -z "$TELEGRAM_CHAT_ID" ]; then
    echo "  خودکار پیدا نشد."
    read -rp "  Chat ID را دستی وارد کن: " TELEGRAM_CHAT_ID
  fi
fi
[ -n "$TELEGRAM_CHAT_ID" ] || die "Chat ID خالی است"
ok "مقصد: $TELEGRAM_CHAT_ID"

# Prove we can actually post there BEFORE relying on it.
step "تست ارسال پیام"
R=$(curl -sS --max-time 20 -X POST "$API/sendMessage" \
  -d "chat_id=$TELEGRAM_CHAT_ID" -d "parse_mode=HTML" \
  --data-urlencode "text=🔧 <b>سیستم بکاپ قل‌قلی وصل شد</b>%0Aاز امشب هر شب ساعت ۳:۳۰ بکاپ کامل اینجا می‌آید.")
echo "$R" | grep -q '"ok":true' || die "ارسال نشد. مطمئن شو به ربات پیام داده‌ای (یا ادمین کانال است)."
ok "پیام تست رسید — تلگرامت را ببین"

# ── Persist ───────────────────────────────────────────────────────────────
umask 077
cat > "$CONF" << EOF
# GhelGheli off-site backup credentials. Keep mode 600.
TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN"
TELEGRAM_CHAT_ID="$TELEGRAM_CHAT_ID"
EOF
chmod 600 "$CONF"
ok "تنظیمات در $CONF ذخیره شد"

# The credentials must travel inside the archive too, otherwise a restored
# server would silently stop backing itself up.
mkdir -p /root/ghelgheli-backups
cp "$CONF" /root/ghelgheli-backups/.telegram.conf 2>/dev/null || true
chmod 600 /root/ghelgheli-backups/.telegram.conf 2>/dev/null || true

# ── Install ───────────────────────────────────────────────────────────────
step "نصب اسکریپت‌ها"
install -m 700 "$APP_DIR/scripts/backup_telegram.sh"      /usr/local/bin/ghelgheli-backup-telegram.sh
install -m 700 "$APP_DIR/scripts/restore_from_backup.sh"  /usr/local/bin/ghelgheli-restore.sh
install -m 700 "$APP_DIR/scripts/fetch_backup_from_telegram.sh" /usr/local/bin/ghelgheli-fetch-backup.sh
ok "/usr/local/bin/ghelgheli-backup-telegram.sh"
ok "/usr/local/bin/ghelgheli-restore.sh"
ok "/usr/local/bin/ghelgheli-fetch-backup.sh"

step "زمان‌بندی روزانه"
cat > /etc/cron.d/ghelgheli-telegram-backup << 'CRON'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# Full off-site backup to Telegram, ONCE a day — 03:35.
#
# ── چرا از دو بار در روز به یک بار برگشت ──
#
# زمان‌بندیِ دوباره‌درروز وقتی نوشته شد که آرشیو ~۷۵۰ کیلوبایت بود و
# استدلالش هم درست بود: «۲۲ مگابایت در سال، هیچ است».
#
# آن استدلال دیگر صادق نیست. با آپلودِ عکسِ کارت‌ها، آرشیو به **۲۸
# مگابایت** رسید (اندازه‌گیریِ ۷ آگوست) — یعنی سالی ۲۰ گیگابایت آپلود
# به تلگرام، روی VPSی که با Invoicle شریک است. و چون هر عکسِ کارت
# برای همیشه در uploads/ می‌ماند، این عدد فقط بالا می‌رود؛ اسکریپت
# خودش در ۸ تکه (۳۶۰ مگابایت) دست از کار می‌کشد.
#
# درخواستِ صریحِ مالک هم همین بود: روزی یک بار.
#
# پنجرهٔ بدترین‌حالتِ از‌دست‌رفتنِ داده ۲۴ ساعت می‌شود به‌جای ۱۲. این
# قابل قبول است چون بک‌آپِ محلیِ `ghelgheli-backup-latest.sh` هر شب
# ۳:۳۰ (پنج دقیقه زودتر) روی همین سرور اجرا می‌شود و برای برگرداندنِ
# سریع کافی است؛ نسخهٔ تلگرام برای فاجعه (از دست رفتنِ کلِ VPS) است.
35 3 * * * root /usr/local/bin/ghelgheli-backup-telegram.sh >> /var/log/ghelgheli-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/ghelgheli-telegram-backup
systemctl restart cron >/dev/null 2>&1 || true
ok "روزی یک بار: ۳:۳۵ بامداد"

# Rotate our own log so it can never fill the disk.
cat > /etc/logrotate.d/ghelgheli-backup << 'LOGR'
/var/log/ghelgheli-backup.log {
  weekly
  rotate 8
  compress
  missingok
  notifempty
  copytruncate
}
LOGR
ok "چرخش لاگ تنظیم شد"

# ── First real run ────────────────────────────────────────────────────────
step "گرفتن اولین بکاپ واقعی"
echo "  (چند ثانیه طول می‌کشد)"
if /usr/local/bin/ghelgheli-backup-telegram.sh --test; then
  echo
  echo "${GREEN}${BOLD}"
  echo "  ╔════════════════════════════════════════════╗"
  echo "  ║  ✓ همه‌چیز آماده است                       ║"
  echo "  ╚════════════════════════════════════════════╝"
  echo "${OFF}"
  echo "  تلگرامت را باز کن — فایل بکاپ آنجاست."
  echo
  echo "${BOLD}دستورهای مفید:${OFF}"
  echo "  بکاپ فوری     : ghelgheli-backup-telegram.sh --test"
  echo "  دیدن لاگ      : tail -f /var/log/ghelgheli-backup.log"
  echo "  بازیابی       : فایل را روی سرور جدید باز کن و bash restore.sh"
else
  die "اولین بکاپ شکست خورد — /var/log/ghelgheli-backup.log را ببین"
fi
