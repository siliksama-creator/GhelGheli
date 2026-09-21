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

DRY_RUN=0 FORCE_DIGEST=0 REFRESH=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --digest)  FORCE_DIGEST=1 ;;
    --refresh) REFRESH=1 ;;
    *) echo "usage: $0 [--dry-run] [--digest] [--refresh]" >&2; exit 2 ;;
  esac
done

# آستانه‌ها (قابلِ بازنویسی با متغیرِ محیطی، برای آزمون)
CAMPAIGN_BANS="${CAMPAIGN_BANS:-3}"          # چند بن تا «کمپین» شمرده شود
CAMPAIGN_WINDOW="${CAMPAIGN_WINDOW:-900}"    # پنجرهٔ کمپین (ثانیه)
BAN_COOLDOWN="${BAN_COOLDOWN:-1800}"         # سکوتِ هشدارِ کمپین
SUCCESS_COOLDOWN="${SUCCESS_COOLDOWN:-21600}" # سکوتِ هشدارِ هر آی‌پیِ مشکوک
DIGEST_PERIOD="${DIGEST_PERIOD:-86400}"      # خالصهٔ روزانه
LOOKBACK="${LOOKBACK:-86400}"                # پنجرهٔ آمارِ خالصه/موفقیت‌ها

mkdir -p "$STATE_DIR" 2>/dev/null || true
chmod 700 "$STATE_DIR" 2>/dev/null || true
BANS_FILE="$STATE_DIR/bans.recent"
LAST_BAN_FILE="$STATE_DIR/last-ban-epoch"
DIGEST_FILE="$STATE_DIR/last-digest"
INTEGRITY_FILE="$STATE_DIR/integrity.sha256"

log() { printf '[%s] %s\n' "$(date -d "@$NOW_EPOCH" '+%Y-%m-%dT%H:%M:%S%:z')" "$*" >> "$STATE_LOG" 2>/dev/null || true; }

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

# هشدار با سکوتِ کلیدِ مشخص (تا یک چیز هر ۶۰ ثانیه تکرار نشود)
alert_once() {
  local key="$1" msg="$2" cooldown="$3" stamp_file="$STATE_DIR/alert-$1" last=0
  [ -f "$stamp_file" ] && last="$(cat "$stamp_file" 2>/dev/null || echo 0)"
  case "$last" in ''|*[!0-9]*) last=0 ;; esac
  if [ $((NOW_EPOCH - last)) -ge "$cooldown" ]; then
    send "$msg"
    log "ALERT [$key] ${msg//$'\n'/ }"
    printf '%s\n' "$NOW_EPOCH" > "$stamp_file" 2>/dev/null || true
  fi
}

# ═══════════════════════════════════════════════════════════════════════════
#  ۱) بن‌های تازهٔ fail2ban — موج یا تک‌تک؟
# ═══════════════════════════════════════════════════════════════════════════
# چرا از لاگِ fail2ban و نه از لاگِ auth: بن‌شدن یعنی خودِ لایهٔ دفاعی تصمیم
# گرفته؛ همان لحظهٔ درست برای خبر دادن به مالک است.
new_bans=()      # «epoch|ip»
if [ -r "$F2B_LOG" ]; then
  LAST="$(cat "$LAST_BAN_FILE" 2>/dev/null || echo 0)"
  case "$LAST" in ''|*[!0-9]*) LAST=0 ;; esac
  max_seen="$LAST"
  # خطِ نمونه: 2026-09-21 08:48:00,768 fail2ban.actions [828]: NOTICE [sshd] Ban 1.2.3.4
  while IFS= read -r line; do
    ip="${line##* }"
    case "$ip" in ''|*[!0-9.]*) continue ;; esac
    ts="${line:0:19}"                       # YYYY-MM-DD HH:MM:SS
    ep="$(date -d "$ts" +%s 2>/dev/null || echo 0)"
    [ "$ep" -le "$LAST" ] && continue
    [ "$ep" -gt "$max_seen" ] && max_seen="$ep"
    new_bans+=("${ep}|${ip}")
  done < <(grep -a '\] Ban ' "$F2B_LOG" 2>/dev/null | tail -200 || true)
  printf '%s\n' "$max_seen" > "$LAST_BAN_FILE" 2>/dev/null || true
  for b in "${new_bans[@]:-}"; do [ -n "$b" ] && printf '%s\n' "$b" >> "$BANS_FILE"; done
fi

# پروندهٔ بن‌ها را کوتاه نگه دار (۷ روز)
if [ -s "$BANS_FILE" ]; then
  cutoff=$((NOW_EPOCH - 604800))
  awk -F'|' -v c="$cutoff" '$1 >= c' "$BANS_FILE" > "$BANS_FILE.tmp" 2>/dev/null || true
  mv "$BANS_FILE.tmp" "$BANS_FILE" 2>/dev/null || true
fi

# کمپین: چند بنِ متفاوت در پنجرهٔ کوتاه
if [ -s "$BANS_FILE" ]; then
  since=$((NOW_EPOCH - CAMPAIGN_WINDOW))
  campaign="$(awk -F'|' -v s="$since" '$1 >= s {print $2}' "$BANS_FILE" 2>/dev/null | sort -u | head -8 || true)"
  count="$(printf '%s\n' "$campaign" | grep -c . || true)"
  if [ "${count:-0}" -ge "$CAMPAIGN_BANS" ]; then
    alert_once campaign "🚨 کمپینِ ورودِ ناموفق روی SSH

در ${CAMPAIGN_WINDOW} ثانیهٔ گذشته ${count} آی‌پیِ متفاوت به‌خاطر تلاشِ ناموفقِ رمز بن شدند (یعنی موجِ توزیع‌شده، نه یک ربات):
$(printf '%s\n' "$campaign" | sed 's/^/• /')

لایه‌های دفاعی (fail2ban + سقفِ تلاش) کار می‌کنند و ورودِ پسوردی بسته نشده. اگر این موج ادامه داشت، آی‌پی‌های بالا را در کلادفلر هم ببند." "$BAN_COOLDOWN"
  fi
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
tmp_hash="$STATE_DIR/integrity.new"
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
  cp -f "$tmp_hash" "$INTEGRITY_FILE" 2>/dev/null || true
  log "baseline یکپارچگی ثبت شد ($(grep -c . "$INTEGRITY_FILE" 2>/dev/null || echo 0) فایل)"
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
    cp -f "$tmp_hash" "$INTEGRITY_FILE" 2>/dev/null || true
    log "INTEGRITY CHANGE: $(printf '%s\n' "$changed" | awk '{print $NF}' | tr '\n' ' ')"
  fi
fi
rm -f "$tmp_hash" 2>/dev/null || true

# ═══════════════════════════════════════════════════════════════════════════
#  ۴) خالصهٔ روزانه (یک پیام در ۲۴ ساعت)
# ═══════════════════════════════════════════════════════════════════════════
last_digest="$(cat "$DIGEST_FILE" 2>/dev/null || echo 0)"
case "$last_digest" in ''|*[!0-9]*) last_digest=0 ;; esac
if [ "$FORCE_DIGEST" = "1" ] || [ $((NOW_EPOCH - last_digest)) -ge "$DIGEST_PERIOD" ]; then
  since=$((NOW_EPOCH - LOOKBACK))
  bans_24="$(awk -F'|' -v s="$since" '$1 >= s' "$BANS_FILE" 2>/dev/null | wc -l | tr -d ' ')"
  bans_ips="$(awk -F'|' -v s="$since" '$1 >= s {print $2}' "$BANS_FILE" 2>/dev/null | sort -u | wc -l | tr -d ' ')"
  ok_lines="$(grep -a 'Accepted' "$AUTH_LOG" 2>/dev/null | tail -400 || true)"
  ok_24="$(printf '%s\n' "$ok_lines" | grep -c . || true)"
  ok_ips="$(printf '%s\n' "$ok_lines" | awk '{for(i=1;i<=NF;i++) if($i=="from") print $(i+1)}' | grep -E '^[0-9.]+$' | sort -u | wc -l | tr -d ' ')"
  fails_24="$(grep -ac 'Failed password' "$AUTH_LOG" 2>/dev/null || true)"
  send "📊 خالصهٔ روزانهٔ امنیتِ سرور

• تلاشِ ناموفقِ رمز (کلِ لاگِ جاری): ${fails_24:-0}
• آی‌پی‌های بن‌شده در ۲۴ ساعت: ${bans_24:-0} بن از ${bans_ips:-0} آی‌پی
• ورودهای موفق: ${ok_24:-0} ورود از ${ok_ips:-0} آی‌پیِ متفاوت
  (ایجنت‌های خودت از آی‌پی‌های ابریِ متغیر می‌آیند، پس این عدد طبیعی است)
• فایل‌های حساسِ پایش‌شده: $(grep -c . "$INTEGRITY_FILE" 2>/dev/null || echo 0)

سطحِ دفاع: fail2ban فعال (۳ جیل) · ورودِ پسوردی باز (برای ایجنت‌ها) با سقفِ ۱۰ تلاش در هر اتصال · ufw فقط ۲۲/۸۰/۴۴۳."
  printf '%s\n' "$NOW_EPOCH" > "$DIGEST_FILE" 2>/dev/null || true
  log "digest sent"
fi

exit 0
