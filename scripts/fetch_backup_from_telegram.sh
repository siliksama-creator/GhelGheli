#!/usr/bin/env bash
#
# Pull the latest GhelGheli backup out of Telegram onto THIS machine.
#
# The point: on a brand-new server you have nothing — no archive, no scripts,
# only a bot token. This single file bridges that gap. Paste it (or curl it
# from GitHub), give it the token, and it downloads the newest backup and
# hands you the exact command to restore.
#
#   bash fetch_backup_from_telegram.sh                 # uses saved config
#   bash fetch_backup_from_telegram.sh <TOKEN> <CHAT>  # bare new server
#   bash fetch_backup_from_telegram.sh --restore       # download AND restore
#
set -Eeuo pipefail

CONF="${CONF:-/root/.ghelgheli_backup.conf}"
WORK="${WORK:-/root/ghelgheli-backups}"
DEST="${DEST:-/root/ghelgheli-restore}"

BOLD=$'\e[1m'; GREEN=$'\e[1;32m'; CYAN=$'\e[1;36m'; RED=$'\e[1;31m'; YEL=$'\e[1;33m'; OFF=$'\e[0m'
step() { echo; echo "${CYAN}==> $*${OFF}"; }
ok()   { echo "${GREEN}  ✓ $*${OFF}"; }
die()  { echo "${RED}خطا: $*${OFF}" >&2; exit 1; }

AUTO_RESTORE=0
ARGS=()
for a in "$@"; do
  case "$a" in
    --restore) AUTO_RESTORE=1 ;;
    *) ARGS+=("$a") ;;
  esac
done

# ── Credentials ───────────────────────────────────────────────────────────
if [ "${#ARGS[@]}" -ge 2 ]; then
  TELEGRAM_BOT_TOKEN="${ARGS[0]}"
  TELEGRAM_CHAT_ID="${ARGS[1]}"
elif [ -f "$CONF" ]; then
  # shellcheck disable=SC1090
  . "$CONF"
else
  echo "${BOLD}اعتبارنامه تلگرام${OFF}"
  read -rp "  توکن ربات: " TELEGRAM_BOT_TOKEN
  read -rp "  Chat ID:   " TELEGRAM_CHAT_ID
fi
: "${TELEGRAM_BOT_TOKEN:?توکن لازم است}"
: "${TELEGRAM_CHAT_ID:?chat id لازم است}"

API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"
mkdir -p "$DEST"

step "بررسی اتصال به تلگرام"
curl -sS --max-time 20 "$API/getMe" | grep -q '"ok":true' || die "توکن معتبر نیست"
ok "ربات تأیید شد"

# ── Locate the newest archive ─────────────────────────────────────────────
# Three strategies, in order of reliability. A bot cannot list its own sent
# messages (Telegram API limitation), which is exactly why the backup script
# records file_ids and pins the newest message.
FILE_ID=""
SOURCE=""

# 1. Local index, if this machine still has one.
if [ -z "$FILE_ID" ] && [ -f "$WORK/file_ids.tsv" ]; then
  FILE_ID=$(tail -1 "$WORK/file_ids.tsv" | cut -f3)
  [ -n "$FILE_ID" ] && SOURCE="فهرست محلی"
fi

# 2. The pinned message in the chat — survives losing the server entirely.
if [ -z "$FILE_ID" ]; then
  FILE_ID=$(curl -sS --max-time 20 "$API/getChat?chat_id=${TELEGRAM_CHAT_ID}" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    doc = d['result']['pinned_message']['document']
    print(doc['file_id'])
except Exception:
    pass
" 2>/dev/null || true)
  [ -n "$FILE_ID" ] && SOURCE="پیام سنجاق‌شده در چت"
fi

# 3. Anything the user forwarded back to the bot.
if [ -z "$FILE_ID" ]; then
  FILE_ID=$(curl -sS --max-time 20 "$API/getUpdates" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    for u in reversed(d.get('result', [])):
        m = u.get('message') or u.get('channel_post') or {}
        doc = m.get('document')
        if doc and 'ghelgheli' in (doc.get('file_name') or '').lower():
            print(doc['file_id']); break
except Exception:
    pass
" 2>/dev/null || true)
  [ -n "$FILE_ID" ] && SOURCE="پیام فوروارد‌شده به ربات"
fi

if [ -z "$FILE_ID" ]; then
  echo
  echo "${YEL}${BOLD}فایل بکاپ خودکار پیدا نشد.${OFF}"
  echo
  echo "  ساده‌ترین راه: در تلگرام آخرین فایل بکاپ را ${BOLD}فوروارد کن به همان ربات${OFF}،"
  echo "  بعد این اسکریپت را دوباره اجرا کن."
  echo
  echo "  یا اگر فایل را روی کامپیوترت دانلود کرده‌ای:"
  echo "    scp ghelgheli_full_*.tar.gz root@$(hostname -I | awk '{print $1}'):$DEST/"
  exit 1
fi
ok "بکاپ پیدا شد (منبع: $SOURCE)"

# ── Download ──────────────────────────────────────────────────────────────
step "دانلود"
META=$(curl -sS --max-time 30 "$API/getFile?file_id=${FILE_ID}")
echo "$META" | grep -q '"ok":true' || die "getFile ناموفق: $(echo "$META" | head -c 200)"
FPATH=$(echo "$META" | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['file_path'])")

ARCHIVE="$DEST/ghelgheli_backup.tar.gz"
curl -sS --max-time 600 -o "$ARCHIVE" \
  "https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${FPATH}" \
  || die "دانلود ناموفق"
[ -s "$ARCHIVE" ] || die "فایل دانلودشده خالی است"

# A truncated download would fail confusingly later; catch it here.
tar tzf "$ARCHIVE" >/dev/null 2>&1 || die "آرشیو سالم نیست (دانلود ناقص؟)"
ok "دانلود شد: $(du -h "$ARCHIVE" | cut -f1)"

step "باز کردن"
rm -rf "$DEST"/ghelgheli_full_* 2>/dev/null || true

# A very large backup is sent as numbered parts (ghelgheli_*.tar.gz.part00,
# .part01, ...). If the user dropped those in here, join them first.
if ls "$DEST"/*.part[0-9][0-9] >/dev/null 2>&1; then
  step "ادغام تکه‌های بکاپ"
  cat "$DEST"/*.part[0-9][0-9] > "$DEST/joined.tar.gz"
  if tar tzf "$DEST/joined.tar.gz" >/dev/null 2>&1; then
    ARCHIVE="$DEST/joined.tar.gz"
    ok "$(ls "$DEST"/*.part[0-9][0-9] | wc -l) تکه ادغام شد"
  else
    die "ادغام تکه‌ها ناموفق بود — احتمالاً یک تکه کم است"
  fi
fi

tar xzf "$ARCHIVE" -C "$DEST"
UNPACKED=$(ls -d "$DEST"/ghelgheli_full_* 2>/dev/null | head -1)
[ -n "$UNPACKED" ] || die "پوشه بازشده پیدا نشد"
ok "$(basename "$UNPACKED")"

echo
echo "${BOLD}محتویات این بکاپ:${OFF}"
grep -E '^(created_at|git_commit|db_size)' "$UNPACKED/MANIFEST.txt" 2>/dev/null | sed 's/^/  /'
if [ -f "$UNPACKED/db/TABLE_COUNTS.txt" ]; then
  echo "  جدول‌های دارای داده:"
  awk '$2 > 0 {printf "    %-32s %s\n", $1, $2}' "$UNPACKED/db/TABLE_COUNTS.txt"
fi
IMGS=$(find "$UNPACKED/uploads" -type f 2>/dev/null | wc -l)
echo "  عکس‌های آپلودی: $IMGS فایل"

# ── Restore ───────────────────────────────────────────────────────────────
echo
if [ "$AUTO_RESTORE" = "1" ]; then
  step "اجرای بازیابی"
  cd "$UNPACKED" && bash restore.sh
else
  echo "${GREEN}${BOLD}  آماده بازیابی.${OFF}"
  echo
  echo "  برای بازگرداندن کامل سیستم:"
  echo "    ${BOLD}cd $UNPACKED && bash restore.sh${OFF}"
  echo
  echo "  یا فقط برای برداشتن یک فایل (مثلاً عکس یک کارت):"
  echo "    ls $UNPACKED/uploads/images/"
fi
