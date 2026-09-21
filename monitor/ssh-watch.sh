#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  نگهبانِ ورودِ SSH و یکپارچگیِ سرور — «کسی قِلقِلکِ در را نمی‌زند؟»
# ═══════════════════════════════════════════════════════════════════════════
#
# ── چرا این فایل وجود دارد (۲۹ شهریور، درخواستِ مالک) ─────────────────────
#
# مالک گفت: «امنیتِ سرور را بالا ببر، ولی ورودِ پسوردی و کارِ ایجنت‌ها را
# خراب نکن.» ورودِ پسوردی یعنی درِ سرور از نظرِ فنی برای همه باز است؛ پس
# تنها لایهٔ باقی‌مانده این است که **بفهمیم چه کسی از آن در رد می‌شود**.
# این اسکریپت همان چشم است:
#
#   ۱) موجِ تلاشِ ناموفق: اگر در ۱۵ دقیقه ≥۳ آی‌پیِ مختلف بن شوند (یعنی
#      یک کمپینِ توزیع‌شده، نه یک ربات) → پیامِ فوری.
#   ۲) «اول شکست، بعد موفقیت» — خطرناک‌ترین حالت. اگر آی‌پی‌ای هم تلاشِ
#      ناموفق داشته و هم بعداً موفق شده باشد → پیامِ فوری (سکوت ۶ ساعته).
#   ۳) یکپارچگیِ فایل‌های حساس: اثرِ انگشتِ `/etc/shadow`، `sudoers`،
#      `authorized_keys`، `cron`، کانفیگِ sshd و `.env`. هر تغییر → پیام با
#      نامِ دقیقِ فایل‌های عوض‌شده. (خودِ این خصلتِ ضدِ «نصبِ درِ پشتی» است.)
#   ۴) خالصهٔ روزانهٔ ورودها (یک پیام در ۲۴ ساعت): چند ورودِ موفق، از چند
#      آی‌پی، چند بن — بی‌اسپم، فقط برای اطلاع.
#
# ── چرا برای هر ورودِ موفق پیام نمی‌فرستد ─────────────────────────────────
#
# ایجنت‌های هوشِ مصنوعی از ده‌ها آی‌پیِ ابریِ متغیر وارد می‌شوند (در ۷ روزِ
# گذشته صدها ورودِ موفق از ده‌ها آی‌پی ثبت شده). اگر برای هر ورود خبر می‌داد،
# مالک در چند ساعت به یک دریای پیام می‌رسید و هشدارِ واقعی را هم دیگر
# نمی‌دید. پس: ورودهای عادی در خالصهٔ روزانه می‌آیند؛ فقط الگوهای مشکوک فوری.
#
# اجرا: توسط systemd timer هر ۶۰ ثانیه (ghelgheli-sshwatch.timer)
# دستی:  bash monitor/ssh-watch.sh [--dry-run] [--refresh] [--digest]
#          --dry-run = فقط چاپ در ترمینال، هیچ پیامی به تلگرام نرود
#          --refresh = اثرِ انگشتِ فایل‌های حساس از نو ثبت شود (بدونِ هشدار)
#          --digest  = خالصهٔ روزانه همین حالا فرستاده شود
#
# همچون نگهبان‌های دیگر: فقط می‌خواند و پیام می‌فرستد؛ هیچ چیزی را عوض
# نمی‌کند جز دو فایلِ حالتِ خودش در /var/lib/ghelgheli-ssh-watch.
set -Eeuo pipefail

# ⚠️ دو درسِ واقعیِ همان ساعتِ اولِ نصب (۲۹ شهریور):
#
#  ۱) locale: اجرا از ترمینالِ من و اجرا از systemd دو locale متفاوت دارند و
#     `sort` در هر کدام ترتیبِ دیگری می‌سازد. نتیجه: دو فایلِ **یکسان** در
#     `diff` کاملاً متفاوت دیده می‌شدند و نگهبان برای هر ۴۷ فایل هشدارِ
#     «کسی روی سرور دست برده» داد — هشدارِ کاذبِ نصبِ اولیه. حالا locale
#     ثابت است (C)، پس ترتیبِ همیشه یکی است.
#  ۲) هم‌زمانی: تایمرِ ۶۰ ثانیه‌ای و اجرای دستی می‌توانند روی هم بیفتند و
#     فایلِ اثرِ انگشت را وسطِ نوشتن بخوانند (همان هشدارِ کاذب از سمتِ دیگر).
#     حالا اجرای دوم با flock بی‌صدا کنار می‌رود.
export LC_ALL=C LANG=C

# کمکیِ مشترکِ تلگرام (خواندنِ تنظیمات با تحملِ کوتیشن)
# shellcheck source=lib/telegram.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/telegram.sh"

AUTH_LOG="${AUTH_LOG:-/var/log/auth.log}"
F2B_LOG="${F2B_LOG:-/var/log/fail2ban.log}"
STATE_DIR="${STATE_DIR:-/var/lib/ghelgheli-ssh-watch}"
STATE_LOG="${STATE_LOG:-/var/log/ghelgheli-ssh-watch.log}"
TG_CONF="${TG_CONF:-/root/ghelgheli-backups/.telegram.conf}"
TG_CONF_ALT="${TG_CONF_ALT:-/root/.ghelgheli_backup.conf}"
INTEGRITY_PATHS_FILE="${INTEGRITY_PATHS_FILE:-}"
NOW_EPOCH="${NOW_EPOCH:-$(date +%s)}"

DRY_RUN=0 FORCE_DIGEST=0 REFRESH=0 TEST_ALERT=0
for arg in "$@"; do
  case "$arg" in
    --dry-run)   DRY_RUN=1 ;;
    --digest)    FORCE_DIGEST=1 ;;
    --refresh)   REFRESH=1 ;;
    --test-alert) TEST_ALERT=1 ;;
    *) echo "usage: $0 [--dry-run] [--digest] [--refresh] [--test-alert]" >&2; exit 2 ;;
  esac
done

# ⚠️ درسِ ۲۹ شهریور: در حالتِ آزمایشی، **هیچ فایلی نوشته نمی‌شود**. قبلاً
# `--dry-run` مُهرِ «قبلاً هشدار دادم» را هم می‌گذاشت؛ یعنی یک آزمونِ بی‌خطر
# می‌توانست هشدارِ واقعیِ بعدی را بخورد — همان اشتباهی که با locale هم رخ داد.
# حالا: dry-run = فقط بخوان و چاپ کن (فقط لاگ که append-only است نوشته می‌شود).
state_write() { [ "$DRY_RUN" = "1" ] && return 0; "$@"; }

# آستانه‌ها (قابلِ بازنویسی با متغیرِ محیطی، برای آزمون)
CAMPAIGN_BANS="${CAMPAIGN_BANS:-3}"          # چند بن تا «کمپین» شمرده شود
CAMPAIGN_WINDOW="${CAMPAIGN_WINDOW:-900}"    # پنجرهٔ کمپین (ثانیه)
BAN_COOLDOWN="${BAN_COOLDOWN:-1800}"         # سکوتِ هشدارِ کمپین
SUCCESS_COOLDOWN="${SUCCESS_COOLDOWN:-21600}" # سکوتِ هشدارِ هر آی‌پیِ مشکوک
DIGEST_PERIOD="${DIGEST_PERIOD:-86400}"      # خالصهٔ روزانه
PERSIST_THRESHOLD="${PERSIST_THRESHOLD:-100}"  # تلاشِ ناموفقِ «کند» از یک آی‌پی
PERSIST_COOLDOWN="${PERSIST_COOLDOWN:-43200}"  # سکوتِ ۱۲ ساعته برای هر آی‌پی
LOOKBACK="${LOOKBACK:-86400}"                # پنجرهٔ آمارِ خالصه/موفقیت‌ها

mkdir -p "$STATE_DIR" 2>/dev/null || true
chmod 700 "$STATE_DIR" 2>/dev/null || true

# فقط یک نمونه در هر لحظه (تایمر + اجرای دستی).
# ⚠️ حالتِ آزمایشی هرگز قفل نمی‌گیرد: dry-run هیچ‌چیز نمی‌نویسد، پس قفل لازم
# ندارد — و اگر بگیرد، یک اجرای دستی می‌تواند بی‌صدا هیچ کاری نکند (همین
# اتفاق روزِ نصب افتاد و خروجیِ خالیِ گمراه‌کننده داد).
if [ "$DRY_RUN" = "0" ] && command -v flock >/dev/null 2>&1; then
  exec 9>"$STATE_DIR/lock" 2>/dev/null || true
  if ! flock -n 9; then
    log "skip: نمونهٔ دیگری از نگهبان در حالِ اجراست (این دور رد شد)"
    exit 0
  fi
fi
BANS_FILE="$STATE_DIR/bans.recent"
LAST_BAN_FILE="$STATE_DIR/last-ban-epoch"
DIGEST_FILE="$STATE_DIR/last-digest"
INTEGRITY_FILE="$STATE_DIR/integrity.sha256"

log() { printf '[%s] %s\n' "$(date -d "@$NOW_EPOCH" '+%Y-%m-%dT%H:%M:%S%:z')" "$*" >> "$STATE_LOG" 2>/dev/null || true; }

# ── کلاس‌های بی‌صدا (درخواستِ مالک، ۱۴۰۵-۰۶-۳۰) ────────────────────────────
# موج‌هایی که لایهٔ دفاعی (fail2ban / سقفِ ضدربات) خودش مهارشان کرده برای
# مالک «خبرِ مهم» نیستند: پیامِ جداگانه نمی‌گیرند. به‌جایش با برچسبِ SUPPRESSED
# لاگ می‌شوند و شمارش می‌شوند؛ تعدادشان در پانوشتِ پیامِ مهمِ بعدی می‌آید تا
# هیچ چیزی واقعاً گم نشود. خالصهٔ روزانه هم سرِ جای خودش می‌ماند.
SUPPRESS_FILE="$STATE_DIR/suppressed.count"

quiet_key() {
  case "$1" in
    campaign_*|persist_*) return 0 ;;
    *) return 1 ;;
  esac
}

suppress_note() {
  local key="$1" msg="$2" n=0
  [ -f "$SUPPRESS_FILE" ] && n="$(cat "$SUPPRESS_FILE" 2>/dev/null || echo 0)"
  case "$n" in ''|*[!0-9]*) n=0 ;; esac
  state_write bash -c "printf '%s\n' '$((n+1))' > '$SUPPRESS_FILE' 2>/dev/null || true"
  if [ "$DRY_RUN" = "1" ]; then
    log "SUPPRESSED (آزمایشی) [$key] ${msg//$'\n'/ }"
  else
    log "SUPPRESSED [$key] ${msg//$'\n'/ }"
  fi
}

with_suppress_footer() {
  local msg="$1" n=0
  [ -f "$SUPPRESS_FILE" ] && n="$(cat "$SUPPRESS_FILE" 2>/dev/null || echo 0)"
  case "$n" in ''|*[!0-9]*) n=0 ;; esac
  if [ "$n" -gt 0 ]; then
    msg="$msg

🔇 همچنین از پیامِ مهمِ قبلی تا حالا، $n رویدادِ بی‌اهمیت (موجِ حمله‌ای که لایهٔ دفاعی خودش blocked کرد) رخ داد و جداگانه ارسال نشد."
    state_write bash -c "printf '0\n' > '$SUPPRESS_FILE' 2>/dev/null || true"
  fi
  printf '%s' "$msg"
}

# ── ارسالِ پیام (یا چاپ در حالتِ آزمایشی) ──────────────────────────────────
send() {
  local text="$1"
  if [ "$DRY_RUN" = "1" ]; then
    printf '\n┌── پیامِ تلگرام (آزمایشی) ──\n%s\n└────────────────────────────\n' "$text"
    return 0
  fi
  local conf="" token chat
  [ -f "$TG_CONF" ] && conf="$TG_CONF"
  [ -z "$conf" ] && [ -f "$TG_CONF_ALT" ] && conf="$TG_CONF_ALT"
  if [ -z "$conf" ]; then log "ALERT (کلیدِ تلگرام پیدا نشد): $text"; return 0; fi
  token="$(tg_conf_get "$conf" TELEGRAM_BOT_TOKEN)"
  chat="$(tg_conf_get "$conf" TELEGRAM_CHAT_ID)"
  if [ -z "$token" ] || [ -z "$chat" ]; then log "ALERT (کلیدِ تلگرام ناقص): $text"; return 0; fi
  local err
  if ! err=$(tg_send_message "$token" "$chat" "$(printf '<b>نگهبانِ امنیتِ GhelGheli</b>\n\n%s\n\nزمان: %s' "$text" "$(date -d "@$NOW_EPOCH" '+%Y-%m-%d %H:%M:%S')")"); then
    log "telegram send failed: ${err:0:200}"
  fi
}

# پیامِ آزمایشی — برای اینکه مالک هر وقت خواست مطمئن شود مسیرِ تلگرام سالم است:
#   bash monitor/ssh-watch.sh --test-alert
if [ "$TEST_ALERT" = "1" ]; then
  send "🧪 <b>پیامِ آزمایشی</b>

این پیام فقط برای این است که مطمئن شوی مسیرِ هشدارِ تلگرام سالم است. کاری لازم نیست. پیام‌های واقعیِ زیر از این نگهبان می‌آید:
• ورودِ موفق از آی‌پی‌ای که تلاشِ ناموفق داشته (خطرناک‌ترین)
• ورودِ موفق با کاربرِ غیرِ root
• تغییرِ یکی از فایل‌های حساسِ سرور
• از کار افتادنِ خودِ لایهٔ دفاعی (fail2ban)
• خالصهٔ روزانه (۱ پیام در ۲۴ ساعت)
موج‌های حمله‌ای که fail2ban یا سقفِ ضدربات خودش مهارشان کند پیامِ جداگانه
نمی‌گیرند؛ تعدادشان در پانوشتِ پیامِ مهمِ بعدی و در خالصهٔ روزانه می‌آید."
  [ "$DRY_RUN" = "1" ] && log "test-alert previewed (آزمایشی)" || log "test-alert sent"
  exit 0
fi

# هشدار با سکوتِ کلیدِ مشخص (تا یک چیز هر ۶۰ ثانیه تکرار نشود)
alert_once() {
  local key="$1" msg="$2" cooldown="$3" stamp_file="$STATE_DIR/alert-$1" last=0
  [ -f "$stamp_file" ] && last="$(cat "$stamp_file" 2>/dev/null || echo 0)"
  case "$last" in ''|*[!0-9]*) last=0 ;; esac
  # کلاسِ بی‌اهمیت: فقط لاگ + شمارش؛ تلگرام ساکت می‌ماند.
  # همان سکویِ کلید هم رعایت می‌شود تا یک موج، یک بار شمرده شود (نه هر دقیقه).
  if quiet_key "$key"; then
    if [ $((NOW_EPOCH - last)) -ge "$cooldown" ]; then
      suppress_note "$key" "$msg"
      state_write bash -c "printf '%s\n' '$NOW_EPOCH' > '$stamp_file' 2>/dev/null || true"
    fi
    return 0
  fi
  if [ $((NOW_EPOCH - last)) -ge "$cooldown" ]; then
    send "$(with_suppress_footer "$msg")"
    # در حالتِ آزمایشی، لاگ هم صریحاً «آزمایشی» می‌شود تا بعداً کسی خطِ لاگ را
    # با هشدارِ واقعیِ ارسال‌شده اشتباه نگیرد (و آزمون‌ها هم قابلِ‌اتکا بمانند).
    if [ "$DRY_RUN" = "1" ]; then
      log "ALERT (آزمایشی) [$key] ${msg//$'\n'/ }"
    else
      log "ALERT [$key] ${msg//$'\n'/ }"
    fi
    state_write bash -c "printf '%s\n' '$NOW_EPOCH' > '$stamp_file' 2>/dev/null || true"
  fi
}

# ═══════════════════════════════════════════════════════════════════════════
#  ۱) بن‌های تازهٔ fail2ban — موج یا تک‌تک؟
# ═══════════════════════════════════════════════════════════════════════════
# چرا از لاگِ fail2ban و نه از لاگِ auth: بن‌شدن یعنی خودِ لایهٔ دفاعی تصمیم
# گرفته؛ همان لحظهٔ درست برای خبر دادن به مالک است.
# ⚠️ درسِ ۲۹ شهریور (نسخهٔ اولِ همین نگهبان): پیامش می‌گفت «به‌خاطرِ تلاشِ
# ناموفقِ رمزِ SSH بن شدند» — ولی آن چهار آی‌پی در واقع از جیلِ **nginx-scan**
# بن شده بودند (اسکنِ وب، صفر تلاشِ رمزِ SSH). پیامِ هشدار باید دقیق باشد،
# وگرنه مالک دنبالِ چیزِ اشتباهی می‌رود. حالا نامِ جیل هم از لاگ خوانده
# می‌شود و متنِ پیام بر اساسِ همان نوشته می‌شود.
jail_title() {
  case "$1" in
    sshd)                    printf 'تلاشِ ناموفقِ رمزِ SSH' ;;
    nginx-scan)              printf 'اسکنِ وب — جست‌وجوی فایل‌های حساس (.env/.git/phpinfo)' ;;
    ghelghelishop-wplogin)   printf 'تلاشِ ورود به پنلِ وردپرس' ;;
    *)                       printf 'هشدارِ لایهٔ دفاعی (%s)' "$1" ;;
  esac
}
new_bans=()      # «epoch|ip|jail»
if [ -r "$F2B_LOG" ]; then
  LAST="$(cat "$LAST_BAN_FILE" 2>/dev/null || echo 0)"
  case "$LAST" in ''|*[!0-9]*) LAST=0 ;; esac
  max_seen="$LAST"
  # خطِ نمونه: 2026-09-21 10:46:44,915 fail2ban.actions [828]: NOTICE  [nginx-scan] Ban 85.203.21.159
  while IFS= read -r line; do
    ip="${line##* }"
    case "$ip" in ''|*[!0-9.]*) continue ;; esac
    ts="${line:0:19}"                       # YYYY-MM-DD HH:MM:SS
    ep="$(date -d "$ts" +%s 2>/dev/null || echo 0)"
    [ "$ep" -le "$LAST" ] && continue
    [ "$ep" -gt "$max_seen" ] && max_seen="$ep"
    jail="$(printf '%s' "$line" | sed -n 's/.*\[\([^]]*\)\] Ban .*/\1/p')"
    [ -n "$jail" ] || jail=unknown
    new_bans+=("${ep}|${ip}|${jail}")
  done < <(grep -a '\] Ban ' "$F2B_LOG" 2>/dev/null | tail -200 || true)
  state_write bash -c "printf '%s\n' '$max_seen' > '$LAST_BAN_FILE' 2>/dev/null || true"
  for b in "${new_bans[@]:-}"; do [ -n "$b" ] && state_write bash -c "printf '%s\n' '$b' >> '$BANS_FILE'"; done
fi

# پروندهٔ بن‌ها را کوتاه نگه دار (۷ روز)
if [ -s "$BANS_FILE" ]; then
  cutoff=$((NOW_EPOCH - 604800))
  awk -F'|' -v c="$cutoff" '$1 >= c' "$BANS_FILE" > "$BANS_FILE.tmp" 2>/dev/null || true
  state_write mv "$BANS_FILE.tmp" "$BANS_FILE"
fi

# کمپین: چند بنِ متفاوت در پنجرهٔ کوتاه — جدا برای هر جیل (پیامِ درست)
#
# ⚠️ نکته: فهرستِ بن‌ها = «پروندهٔ ذخیره‌شده» **به‌علاوهٔ** بن‌های همین اجرا.
# چرا: در حالتِ آزمایشی پرونده نوشته نمی‌شود، ولی می‌خواهیم پیش‌نمایش دقیقاً
# همان چیزی را نشان بدهد که در اجرای واقعی هشدار می‌داد (وگرنه dry-run
# بی‌معنا می‌شد). در حالتِ واقعی، sort -u تکراری‌ها را جمع می‌کند.
bans_view() {
  cat "$BANS_FILE" 2>/dev/null || true
  for b in "${new_bans[@]:-}"; do [ -n "$b" ] && printf '%s\n' "$b"; done
}
if [ -s "$BANS_FILE" ] || [ "${#new_bans[@]}" -gt 0 ]; then
  since=$((NOW_EPOCH - CAMPAIGN_WINDOW))
  for j in $(bans_view | awk -F'|' -v s="$since" '$1 >= s {print $3}' | sort -u || true); do
    [ -n "$j" ] && [ "$j" != "unknown" ] || continue
    ips="$(bans_view | awk -F'|' -v s="$since" -v j="$j" '$1 >= s && $3 == j {print $2}' | sort -u | head -8 || true)"
    count="$(printf '%s\n' "$ips" | grep -c . || true)"
    [ "${count:-0}" -ge "$CAMPAIGN_BANS" ] || continue
    alert_once "campaign_$j" "🚨 موجِ حملهٔ خودکار به سرور — $(jail_title "$j")

در ${CAMPAIGN_WINDOW} ثانیهٔ گذشته ${count} آی‌پیِ متفاوت توسطِ جیل «${j}» بسته شدند (یعنی موجِ توزیع‌شده، نه یک ربات):
$(printf '%s\n' "$ips" | sed 's/^/• /')

لایهٔ دفاعی (fail2ban) خودش کار را کرده و آی‌پی‌ها بسته شده‌اند؛ کاری از تو لازم نیست. این پیام فقط برای اطلاعِ توست که بدانی چه می‌گذرد. اگر موج ادامه داشت، همان آی‌پی‌ها را در کلادفلر هم ببند." "$BAN_COOLDOWN"
  done
fi

# ═══════════════════════════════════════════════════════════════════════════
#  ۲) «اول شکست، بعد موفقیت» — الگویِ ورودِ نفوذی
# ═══════════════════════════════════════════════════════════════════════════
# آی‌پی‌ای که هم تلاشِ ناموفق داشته و هم بعداً موفق شده، یعنی کسی رمز را
# بالاخره حدس زده (یا لو رفته) — همین یک الگو ارزشِ کلِ این نگهبان را دارد.
if [ -r "$AUTH_LOG" ]; then
  # ورودهای موفقِ ۲۴ ساعتِ گذشته (بر اساس مُهرِ زمانیِ خط، نه زمانِ فایل)
  while IFS= read -r line; do
    ts="${line%% *}"; ts="${ts%%.*}"                 # 2026-09-21T10:45:03+03:30
    ep="$(date -d "$ts" +%s 2>/dev/null || echo 0)"
    [ "$ep" -eq 0 ] && continue
    [ $((NOW_EPOCH - ep)) -gt "$LOOKBACK" ] && continue
    ip="$(printf '%s' "$line" | awk '{for(i=1;i<=NF;i++) if($i=="from") print $(i+1)}')"
    case "$ip" in ''|*[!0-9.]*) continue ;; esac
    # آیا همین آی‌پی تلاشِ ناموفق هم داشته؟
    fails="$(grep -ac "Failed password.*from ${ip} " "$AUTH_LOG" 2>/dev/null || true)"
    if [ "${fails:-0}" -gt 0 ]; then
      alert_once "success_$ip" "🚨 ورودِ موفق از آی‌پی‌ای که تلاشِ ناموفق هم داشته

آی‌پی: ${ip}
تعدادِ خطوطِ تلاشِ ناموفقِ همان آی‌پی در لاگ: ${fails}
زمانِ ورود: $(date -d "@$ep" '+%Y-%m-%d %H:%M:%S')

این تنها الگویی است که «نفوذِ موفق» را از «نویزِ اینترنت» جدا می‌کند. اگر این آی‌پی را نمی‌شناسی، همین حالا رمزِ root را عوض کن و بعد در کلادفلر ببند." "$SUCCESS_COOLDOWN"
    fi
  done < <(grep -a 'Accepted' "$AUTH_LOG" 2>/dev/null | tail -120 || true)

  # ── ورودِ موفق با کاربری غیرِ root: هیچ‌کس نباید با کاربرِ دیگری وارد شود ──
  # (ایجنت‌ها همه root اند؛ اگر روزی کاربرِ جدیدی وارد شود، یعنی کسی حساب
  #  ساخته یا حسابِ دیگری باز شده — خبرش را باید فوراً بدانی.)
  while IFS= read -r line; do
    ts="${line%% *}"; ts="${ts%%.*}"
    ep="$(date -d "$ts" +%s 2>/dev/null || echo 0)"
    [ "$ep" -eq 0 ] && continue
    [ $((NOW_EPOCH - ep)) -gt "$LOOKBACK" ] && continue
    user="$(printf '%s' "$line" | awk '{for(i=1;i<=NF;i++) if($i=="for") print $(i+1)}')"
    ip="$(printf '%s' "$line" | awk '{for(i=1;i<=NF;i++) if($i=="from") print $(i+1)}')"
    [ -n "$user" ] && [ "$user" != "root" ] || continue
    alert_once "nonroot_$user" "🚨 ورودِ موفق با کاربرِ غیرِ root

کاربر: ${user}
آی‌پی: ${ip}
زمان: $(date -d "@$ep" '+%Y-%m-%d %H:%M:%S')

همهٔ ایجنت‌ها با root وارد می‌شوند؛ پس هر کاربرِ دیگری روی این سرور یعنی کسی حساب ساخته یا حسابِ کاربرِ دیگری باز شده. اگر این را نمی‌شناسی، همین حالا رمزها را عوض کن." "$SUCCESS_COOLDOWN"
  done < <(grep -a 'Accepted' "$AUTH_LOG" 2>/dev/null | tail -120 || true)

  # ── تلاشِ پیوستهٔ «کُند» (slow brute force) ──────────────────────────────
  # کسی که هر ۱۰ دقیقه ۴ بار رمز را غلط می‌زند هرگز به سقفِ ۵ نرسد و بن نشود؛
  # ولی در طولِ روز صدها تلاش جمع می‌کند. آستانه: ≥۱۰۰ خطِ ناموفق از یک آی‌پی.
  while read -r cnt ip; do
    [ -n "$ip" ] || continue
    [ "$cnt" -ge "$PERSIST_THRESHOLD" ] || continue
    alert_once "persist_$ip" "🚨 تلاشِ پیوستهٔ رمزِ SSH از یک آی‌پی

آی‌پی: ${ip}
تعدادِ تلاشِ ناموفق (کلِ لاگِ جاری): ${cnt}

این الگوها آرام‌اند و ممکن است زیرِ آستانهٔ بن‌شدن بمانند. اگر این آی‌پی را نمی‌شناسی، در کلادفلر ببندش و رمزها را تازه کن." "$PERSIST_COOLDOWN"
  done < <(grep -a 'Failed password' "$AUTH_LOG" 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="from") print $(i+1)}' | grep -E '^[0-9.]+$' | sort | uniq -c | sort -rn | head -5 || true)
fi

# ═══════════════════════════════════════════════════════════════════════════
#  ۳) یکپارچگیِ فایل‌های حساس — «کسی درِ پشتی نگذاشته؟»
# ═══════════════════════════════════════════════════════════════════════════
# فهرستِ پیش‌فرض: جاهایی که اگر عوض شوند، معنایش «کسی دسترسی گرفته» است.
# (کانفیگِ nginx و یونیت‌های systemd عمداً این‌جا هستند: تغییرشان هم خطر است.)
if [ -n "$INTEGRITY_PATHS_FILE" ]; then
  mapfile -t ipaths < "$INTEGRITY_PATHS_FILE" 2>/dev/null || ipaths=()
else
  ipaths=(
    /etc/passwd /etc/shadow /etc/group /etc/gshadow /etc/sudoers
    /etc/ssh/sshd_config
    /etc/ssh/sshd_config.d/*.conf
    /etc/cron.d/*
    /var/spool/cron/crontabs/*
    /root/.ssh/authorized_keys
    /home/*/.ssh/authorized_keys
    /var/www/GhelGheli/backend/.env
    /root/ghelgheli-backups/.telegram.conf
    /etc/nginx/sites-enabled/*
    /etc/nginx/snippets/*
    /etc/systemd/system/ghelgheli-*.service
    /etc/systemd/system/ghelgheli-*.timer
  )
fi
shopt -s nullglob
tmp_hash="$STATE_DIR/integrity.$$.new"   # مخصوصِ همین اجرا (بدونِ تداخل)
: > "$tmp_hash"
for p in "${ipaths[@]}"; do
  for f in $p; do
    [ -f "$f" ] || continue
    h="$(sha256sum "$f" 2>/dev/null | awk '{print $1}')"
    [ -n "$h" ] && printf '%s  %s\n' "$h" "$f" >> "$tmp_hash"
  done
done
shopt -u nullglob
sort -k2 "$tmp_hash" -o "$tmp_hash" 2>/dev/null || true

if [ "$REFRESH" = "1" ] || [ ! -f "$INTEGRITY_FILE" ]; then
  # در حالتِ آزمایشی هیچ‌چیز نوشته نمی‌شود (پایه‌گذاری هم نه) — تا یک آزمونِ
  # بی‌خطر، هشدارِ واقعیِ بعدی را نخورد.
  if [ "$DRY_RUN" = "1" ]; then
    printf '\n(آزمایشی) پایه‌گذاری می‌شد: %s فایل\n' "$(grep -c . "$tmp_hash" 2>/dev/null || echo 0)"
  else
    cp -f "$tmp_hash" "$INTEGRITY_FILE" 2>/dev/null || true
  fi
  [ "$DRY_RUN" = "1" ] || log "baseline یکپارچگی ثبت شد ($(grep -c . "$INTEGRITY_FILE" 2>/dev/null || echo 0) فایل)"
  [ "$REFRESH" = "1" ] && send "♻️ اثرِ انگشتِ فایل‌های حساس از نو ثبت شد ($(grep -c . "$INTEGRITY_FILE" 2>/dev/null || echo 0) فایل). تغییرهای این فاصله عمداً نادیده گرفته شدند."
else
  changed="$(diff <(sort "$INTEGRITY_FILE") <(sort "$tmp_hash") 2>/dev/null | grep -E '^[<>]' || true)"
  if [ -n "$changed" ]; then
    detail="$(printf '%s\n' "$changed" | sed -E 's/^< [0-9a-f]+  /  حذف/; s/^> [0-9a-f]+  /  تغییر/; s/^< /  ● /; s/^> /  ● /' | head -12)"
    alert_once integrity "🚨 فایل‌های حساسِ سرور تغییر کرده‌اند

$(printf '%s\n' "$changed" | awk '{print $NF}' | sort -u | sed 's/^/• /' | head -12)

اگر این تغییر کارِ خودت (یا ایجنتِ خودت) بوده، با
  bash /var/www/GhelGheli/monitor/ssh-watch.sh --refresh
اثرِ انگشتِ تازه ثبت می‌شود و هشدار نمی‌آید. اگر نبوده، یعنی کسی روی سرور دست برده — همین حالا رمزها را عوض کن." 0
    state_write cp -f "$tmp_hash" "$INTEGRITY_FILE" 2>/dev/null || true
    [ "$DRY_RUN" = "1" ] && log "INTEGRITY CHANGE (آزمایشی): $(printf '%s\n' "$changed" | awk '{print $NF}' | tr '\n' ' ')" \
      || log "INTEGRITY CHANGE: $(printf '%s\n' "$changed" | awk '{print $NF}' | tr '\n' ' ')"
  fi
fi
rm -f "$tmp_hash" 2>/dev/null || true

# ═══════════════════════════════════════════════════════════════════════════
#  ۳٫۵) زنده‌بودنِ fail2ban — اگر خودِ لایهٔ دفاعی بمیرد، خبرِ مهم است
# ═══════════════════════════════════════════════════════════════════════════
F2B_FAIL_FILE="$STATE_DIR/f2b-fail"
if fail2ban-client ping >/dev/null 2>&1; then
  state_write bash -c "printf '0\n' > '$F2B_FAIL_FILE' 2>/dev/null || true"
else
  f2b_f=0
  [ -f "$F2B_FAIL_FILE" ] && f2b_f="$(cat "$F2B_FAIL_FILE" 2>/dev/null || echo 0)"
  case "$f2b_f" in ''|*[!0-9]*) f2b_f=0 ;; esac
  state_write bash -c "printf '%s\n' '$((f2b_f+1))' > '$F2B_FAIL_FILE' 2>/dev/null || true"
  if [ $((f2b_f+1)) -ge 2 ]; then
    alert_once fail2ban_down "🚨 لایهٔ دفاعیِ fail2ban پاسخ نمی‌دهد!

دو بررسیِ پیاپیِ نگهبان، ping به fail2ban جواب نگرفت. یعنی فعلاً بستنِ خودکارِ آی‌پی‌ها اتفاق نمی‌افتد و موج‌های حمله بند نمی‌شوند.
همین حالا: systemctl restart fail2ban — اگر بالا نیامد، به من بگو تا لاگش را بررسی کنم." 3600
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════
#  ۴) خالصهٔ روزانه (یک پیام در ۲۴ ساعت)
# ═══════════════════════════════════════════════════════════════════════════
last_digest="$(cat "$DIGEST_FILE" 2>/dev/null || echo 0)"
case "$last_digest" in ''|*[!0-9]*) last_digest=0 ;; esac
if [ "$FORCE_DIGEST" = "1" ] || [ $((NOW_EPOCH - last_digest)) -ge "$DIGEST_PERIOD" ]; then
  since=$((NOW_EPOCH - LOOKBACK))
  bans_24="$(awk -F'|' -v s="$since" '$1 >= s' "$BANS_FILE" 2>/dev/null | wc -l | tr -d ' ')"
  bans_ips="$(awk -F'|' -v s="$since" '$1 >= s {print $2}' "$BANS_FILE" 2>/dev/null | sort -u | wc -l | tr -d ' ')"
  # به تفکیکِ نوع: اسکنِ وب یا تلاشِ رمزِ SSH
  bans_ssh="$(awk -F'|' -v s="$since" '$1 >= s && $3 == "sshd"' "$BANS_FILE" 2>/dev/null | wc -l | tr -d ' ')"
  bans_web="$(awk -F'|' -v s="$since" '$1 >= s && $3 == "nginx-scan"' "$BANS_FILE" 2>/dev/null | wc -l | tr -d ' ')"
  # ردیف‌های قدیمیِ قبل از این نسخه نامِ جیل نداشتند (دو ستونه بودند) — نه
  # پنهانشان می‌کنیم و نه در دستهٔ اشتباه می‌شماریمشان.
  bans_unk="$(awk -F'|' -v s="$since" '$1 >= s && (NF < 3 || $3 == "")' "$BANS_FILE" 2>/dev/null | wc -l | tr -d ' ')"
  top_atk="$(grep -a 'Failed password' "$AUTH_LOG" 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="from") print $(i+1)}' | grep -E '^[0-9.]+$' | sort | uniq -c | sort -rn | head -1 | awk '{print $2" ("$1" تلاش)"}' || true)"
  ok_lines="$(grep -a 'Accepted' "$AUTH_LOG" 2>/dev/null | tail -400 || true)"
  ok_24="$(printf '%s\n' "$ok_lines" | grep -c . || true)"
  ok_ips="$(printf '%s\n' "$ok_lines" | awk '{for(i=1;i<=NF;i++) if($i=="from") print $(i+1)}' | grep -E '^[0-9.]+$' | sort -u | wc -l | tr -d ' ')"
  fails_24="$(grep -ac 'Failed password' "$AUTH_LOG" 2>/dev/null || true)"
  send "📊 خالصهٔ روزانهٔ امنیتِ سرور

• تلاشِ ناموفقِ رمزِ SSH (کلِ لاگِ جاری): ${fails_24:-0}
• بسته‌شده در ۲۴ ساعت: ${bans_24:-0} آی‌پی از ${bans_ips:-0} آی‌پیِ متفاوت
     - تلاشِ رمزِ SSH: ${bans_ssh:-0} بن
     - اسکنِ وب: ${bans_web:-0} بن
     - ثبت‌شده پیش از به‌روزرسانیِ نگهبان: ${bans_unk:-0}
• پرتلاش‌ترین آی‌پیِ مهاجم: ${top_atk:-ندارد}
• ورودهای موفقِ خودت/ایجنت‌ها: ${ok_24:-0} ورود از ${ok_ips:-0} آی‌پی
  (ایجنت‌ها از آی‌پی‌های ابریِ متغیر می‌آیند، پس این عدد طبیعی است)
• فایل‌های حساسِ پایش‌شده: $(grep -c . "$INTEGRITY_FILE" 2>/dev/null || echo 0)

سطحِ دفاع: fail2ban فعال (۳ جیل) · ورودِ پسوردی باز (برای ایجنت‌ها) با سقفِ ۱۰ تلاش در هر اتصالِ · ufw فقط ۲۲/۸۰/۴۴۳.
برای آزمودنِ مسیرِ هشدار هر وقت خواستی: bash monitor/ssh-watch.sh --test-alert"
  state_write bash -c "printf '%s\n' '$NOW_EPOCH' > '$DIGEST_FILE' 2>/dev/null || true"
  [ "$DRY_RUN" = "1" ] && log "digest previewed (آزمایشی)" || log "digest sent"
fi

exit 0
