#!/usr/bin/env bash
# ============================================================================
#  پاک‌سازِ کش‌های اضافیِ VPS قلقلی — خواستهٔ مالک ۲۰۲۶-۰۹-۲۲:
#  «یک پاک‌کنندهٔ کش‌های اضافی و بی‌مورد داخلِ VPS که چیزهایی که اصلاً
#    نیازی نیست حجم و سرعتمون رو نگیرن»
# ============================================================================
#   ghelgheli-cache-clean.sh --dry   # فقط گزارش: چه‌قدر آزاد می‌شد (بدونِ حذف)
#   ghelgheli-cache-clean.sh --run   # پاکسازیِ واقعی + خلاصهٔ تلگرامی
#
# نصبِ زنده: /usr/local/bin/ghelgheli-cache-clean.sh
# زمان‌بندی: /etc/cron.d/ghelgheli-cache-clean → یکشنبه ۰۵:۱۵ (بعدِ
#            بکاپِ ۰۳:۳۵ و پیش از ساعتِ کاری؛ خلاصه به تلگرامِ مالک)
#
# قاعدهٔ طلایی — فقط چیزی حذف می‌شود که ۱۰۰٪ بازتولیدپذیر یا قطعاً کهنه است:
#   کشِ پکیج‌منیجرها (npm/pip/apt)، ژورنال/لاگِ چرخش‌یافتهٔ قدیمی،
#   اسکراچِ /tmp قدیمی‌تر از ۳ روز، کشِ regenerable وردپرسِ فروشگاه.
#   هرگز دست نمی‌خورد: node_modules، uploads، مرورگرهای Playwright
#   (/root/.cache/ms-playwright — ابزارهای تایپوگرافی/دود به آن نیاز دارند)،
#   بکاپ‌های داخلِ retention، آرتیفکت‌های /root/ghelghelishop-backup
#   (تصمیمِ مالک است)، دیتابیس و فایل‌های زندهٔ pm2/nginx.
set -Eeuo pipefail

MODE="${1:---dry}"
case "$MODE" in --dry|--run) ;; *) echo "usage: $0 [--dry|--run]" >&2; exit 2;; esac
LOG_FILE="/var/log/ghelgheli-cache-clean.log"
TG_CONF="/root/ghelgheli-backups/.telegram.conf"
TOTAL_KB=0

log() { echo "[$(date -Is)] [$MODE] $*" | tee -a "$LOG_FILE"; }
kb_of() { du -sk "$1" 2>/dev/null | awk '{s+=$1}END{print s+0}'; }
mb() { echo $(( ${1:-0} / 1024 )); }

# report LABEL ESTIMATE_KB — مقدارِ آزادشده/آزادشدنی را جمع و گزارش می‌کند
report() {
  TOTAL_KB=$(( TOTAL_KB + ${2:-0} ))
  if [ "$MODE" = "--run" ]; then log "$1: $(mb "$2")MB آزاد شد"
  else log "$1: $(mb "$2")MB آزاد می‌شد"; fi
}

# ── سپرِ مسیرهای حیاتی (تذکرِ مالک ۲۰۲۶-۰۹-۲۳) ─────────────────────────
# این پاک‌کننده هرگز نباید فایلِ مهم یا دیتابیس را حذف کند. دو لایه:
#   ۱) ذاتِ اسکریپت فقط فهرستِ سفیدِ هدف‌ها را rm می‌کند (کش‌ها و لاگ‌های
#      چرخیده)، نه «هر چه قدیمی است».
#   ۲) این سپر: هر هدفی که زیرِ یک مسیرِ حیاتی بیفتد، کلِ اجرا را متوقف
#      می‌کند (exit 3) تا یک اشتباهِ آینده بی‌صدا فاجعه نسازد.
#      دیتابیس هم اصلاً در دسترس این اسکریپت نیست: نه اعتبارنامهٔ DB دارد
#      نه هیچ دستورِ psql/delete روی داده — فقط فایل‌های کش و لاگ.
PROTECTED_PREFIXES=(
  /var/lib/postgresql
  /var/lib/mysql
  /etc
  /root/.ghelgheli-backups
  /root/ghelghelishop-backup
  /home/ghelgheli/.pm2
  /var/www/GhelGheli/backend/.env
  /var/www/GhelGheli/backend/uploads
  /var/www/GhelGheli/userweb/dist
  /var/www/ghelghelishop.com/wp-content/uploads
  /var/www/ghelghelishop.com/wp-content/cache/index.php
)
assert_safe() {
  for pre in "${PROTECTED_PREFIXES[@]}"; do
    case "$1" in
      "$pre"*)
        log "REFUSED: هدفِ $1 زیرِ مسیرِ حیاتیِ $pre است — اجرا متوقف شد"
        exit 3
        ;;
    esac
  done
}

log "── شروع ──"
DISK_BEFORE=$(df -k / | awk 'NR==2{print $3}')

# ۱) کشِ npm (هر دو کاربر) — کاملاً بازتولیدپذیر؛ خودِ npm تمیز می‌کند
for pair in "/root/.npm:root" "/home/ghelgheli/.npm:ghelgheli"; do
  d="${pair%%:*}"; u="${pair##*:}"
  [ -d "$d" ] || continue
  b=$(kb_of "$d")
  if [ "$MODE" = "--run" ]; then
    su - "$u" -c 'npm cache clean --force' >/dev/null 2>&1 || true
    report "npm-cache($u)" $(( b - $(kb_of "$d") ))
  else
    report "npm-cache($u)" "$b"
  fi
done

# ۲) کشِ pip — عمداً ms-playwright دست‌نخورده می‌ماند
if [ -d /root/.cache/pip ]; then
  b=$(kb_of /root/.cache/pip)
  if [ "$MODE" = "--run" ]; then
    assert_safe /root/.cache/pip
    rm -rf /root/.cache/pip
    report "pip-cache" "$b"
  else
    report "pip-cache" "$b"
  fi
fi

# ۳) کشِ deb دانلودشدهٔ apt (فقط archives؛ lists می‌ماند تا apt سریع بماند)
b=$(kb_of /var/cache/apt/archives)
if [ "$MODE" = "--run" ]; then
  apt-get clean >/dev/null 2>&1 || true
  report "apt-archives" $(( b - $(kb_of /var/cache/apt/archives) ))
else
  report "apt-archives" "$b"
fi

# ۴) ژورنالِ systemd — ۱۴ روز / سقفِ ۱۵۰ مگ (فراترش تاریخِ اشکال‌زدایی نیست)
jb=$(journalctl --disk-usage 2>/dev/null | grep -oE '[0-9.]+[MG]' | head -1 || echo '?')
if [ "$MODE" = "--run" ]; then
  journalctl --vacuum-time=14d --vacuum-size=150M >/dev/null 2>&1 || true
  ja=$(journalctl --disk-usage 2>/dev/null | grep -oE '[0-9.]+[MG]' | head -1 || echo '?')
  log "journal: $jb → $ja (vacuum 14d/150M)"
else
  log "journal: $jb (در اجرا به سقفِ ۱۴روز/۱۵۰MB می‌رسد)"
fi

# ۵) اسکراچِ /tmp قدیمی‌تر از ۳ روز — اسکراچِ تازهٔ عملیات دست‌نخورده؛
#    سوکت‌ها/دایرکتوری‌های systemd و pm2 مستثنی
b=$(find /tmp -mindepth 1 -maxdepth 1 -mtime +3 \! -name 'systemd*' \! -name '*.sock*' \! -name '.pm2*' \
      -exec du -sk {} + 2>/dev/null | awk '{s+=$1}END{print s+0}')
if [ "$MODE" = "--run" ]; then
  assert_safe /tmp
  find /tmp -mindepth 1 -maxdepth 1 -mtime +3 \! -name 'systemd*' \! -name '*.sock*' \! -name '.pm2*' \
    -exec rm -rf {} + 2>/dev/null || true
fi
report "tmp(3روز+)" "$b"

# ۶) لاگ‌های چرخش‌یافتهٔ قدیمی (فقط .gz و .1/.2… — لاگِ زنده دست‌نخورده)
b=$(find /var/log -maxdepth 2 \( -name '*.gz' -o -name '*.[0-9]' \) -mtime +14 \
      -printf '%k\n' 2>/dev/null | awk '{s+=$1}END{print s+0}')
if [ "$MODE" = "--run" ]; then
  assert_safe /var/log
  find /var/log -maxdepth 2 \( -name '*.gz' -o -name '*.[0-9]' \) -mtime +14 -delete 2>/dev/null || true
fi
report "varlog-rotate(14روز+)" "$b"

# ۷) کشِ وردپرسِ فروشگاه — فقط محتوای قدیمی‌تر از ۱ روز؛ supercache خودش
#    دوباره می‌سازد، تازه‌ها می‌مانند تا فروشگاه کند نشود
WPC=/var/www/ghelghelishop.com/wp-content/cache
if [ -d "$WPC" ]; then
  b=$(find "$WPC" -mindepth 1 -maxdepth 1 -mtime +1 -exec du -sk {} + 2>/dev/null | awk '{s+=$1}END{print s+0}')
  if [ "$MODE" = "--run" ]; then
    assert_safe "$WPC"
    find "$WPC" -mindepth 1 -maxdepth 1 -mtime +1 -exec rm -rf {} + 2>/dev/null || true
  fi
  report "wp-cache(shop,1روز+)" "$b"
fi

# ۸) چرخش‌های قدیمیِ لاگِ بک‌اند
BL=/var/www/GhelGheli/backend/logs
if [ -d "$BL" ]; then
  b=$(find "$BL" -name '*.gz' -mtime +14 -printf '%k\n' 2>/dev/null | awk '{s+=$1}END{print s+0}')
  if [ "$MODE" = "--run" ]; then
    assert_safe "$BL"
    find "$BL" -name '*.gz' -mtime +14 -delete 2>/dev/null || true
  fi
  report "backend-logs(14روز+)" "$b"
fi

DISK_AFTER=$(df -k / | awk 'NR==2{print $3}')
log "── پایان: مجموعِ برآورد $(mb "$TOTAL_KB")MB | دیسکِ مصرفی: $(mb "$DISK_BEFORE")MB → $(mb "$DISK_AFTER")MB ──"

# خلاصهٔ تلگرامی فقط در حالتِ اجرا (همان رازِ کانالِ بکاپ — رازِ دوم ندارد)
if [ "$MODE" = "--run" ] && [ -f "$TG_CONF" ]; then
  set -a; . "$TG_CONF"; set +a
  curl -sS --max-time 20 -X POST \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=🧹 پاکسازیِ کشِ VPS: ~$(mb "$TOTAL_KB")MB آزاد شد (npm/pip/apt/journal/tmp/لاگ‌های قدیمی/کشِ وردپرس). جزئیات: /var/log/ghelgheli-cache-clean.log" \
    >/dev/null 2>&1 || log "telegram send failed"
fi
