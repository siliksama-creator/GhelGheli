#!/usr/bin/env bash
#
# ═══════════════════════════════════════════════════════════════════════════
#  آزمونِ ایزولهٔ نگهبانِ امنیت — بدونِ تلگرامِ واقعی، بدونِ لاگِ واقعی
# ═══════════════════════════════════════════════════════════════════════════
#
# چرا: این نگهبان روی «مسیرِ هشدار» کار می‌کند؛ اگر خراب باشد کسی نمی‌فهمد.
# سه باگِ واقعیِ همین روز اینجا قفل می‌شوند:
#
#   • locale: اجرا از ترمینال و از systemd ترتیبِ sort را عوض می‌کرد و برای هر
#     ۴۵ فایلِ سالم، هشدارِ «کسی روی سرور دست برده» می‌رفت (هشدارِ کاذب).
#   • متنِ نادرست: پیامِ موج می‌گفت «تلاشِ ناموفقِ رمزِ SSH» درحالی‌که آن
#     آی‌پی‌ها از جیلِ اسکنِ وب بن شده بودند ⇒ حالا نامِ جیل از لاگ خوانده
#     می‌شود و متن بر همان اساس نوشته می‌شود.
#   • `--dry-run` مُهرِ «قبلاً هشدار دادم» می‌گذاشت ⇒ یک آزمونِ بی‌خطر می‌توانست
#     هشدارِ واقعیِ بعدی را بخورد. حالا dry-run **هیچ‌چیز** نمی‌نویسد.
#
# اجرا: bash scripts/test-ssh-watch.sh
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
WATCH="$REPO/monitor/ssh-watch.sh"
[ -f "$WATCH" ] || { echo "monitor/ssh-watch.sh پیدا نشد" >&2; exit 1; }

PASS=0; FAIL=0
ok()   { printf '  \033[32m✅ %s\033[0m\n' "$*"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31m❌ %s\033[0m\n' "$*"; FAIL=$((FAIL+1)); }
head() { printf '\n\033[1;36m%s\033[0m\n' "$*"; }

ROOT="$(mktemp -d /tmp/ggssh.XXXXXX)"
cleanup() { if [ "${KEEP:-0}" = "1" ]; then echo "\n[آزمون] پوشهٔ موقت: $ROOT"; else rm -rf "$ROOT"; fi; }
trap cleanup EXIT

NOW="$(date +%s)"
mkdir -p "$ROOT/state" "$ROOT/etc"
printf 'secret-v1\n' > "$ROOT/etc/shadow"
printf 'root ALL=(ALL) ALL\n' > "$ROOT/etc/sudoers"
printf '%s\n%s\n' "$ROOT/etc/shadow" "$ROOT/etc/sudoers" > "$ROOT/paths.txt"
: > "$ROOT/auth.log"; : > "$ROOT/fail2ban.log"

ts_auth() { TZ=Asia/Tehran date -d "@$1" '+%Y-%m-%dT%H:%M:%S+03:30'; }
ts_f2b()  { TZ=Asia/Tehran date -d "@$1" '+%Y-%m-%d %H:%M:%S'; }
ban() { printf '%s,000 fail2ban.actions [828]: NOTICE  [%s] Ban %s\n' "$(ts_f2b "$1")" "$2" "$3" >> "$ROOT/fail2ban.log"; }

# اجرای «آزمایشی» = فقط بخوان و چاپ کن (هیچ فایلی نمی‌نویسد)
run_dry() {
  AUTH_LOG="$ROOT/auth.log" F2B_LOG="$ROOT/fail2ban.log" \
  STATE_DIR="$ROOT/state" STATE_LOG="$ROOT/sshwatch.log" \
  INTEGRITY_PATHS_FILE="$ROOT/paths.txt" NOW_EPOCH="$NOW" \
  TG_CONF="$ROOT/no.conf" TG_CONF_ALT="$ROOT/no2.conf" \
  bash "$WATCH" --dry-run "$@" 2>&1
}
# اجرای «واقعی» ولی با تنظیماتِ تلگرامِ ناموجود ⇒ هیچ پیامی بیرون نمی‌رود
run_real() {
  AUTH_LOG="$ROOT/auth.log" F2B_LOG="$ROOT/fail2ban.log" \
  STATE_DIR="$ROOT/state" STATE_LOG="$ROOT/sshwatch.log" \
  INTEGRITY_PATHS_FILE="$ROOT/paths.txt" NOW_EPOCH="$NOW" \
  TG_CONF="$ROOT/no.conf" TG_CONF_ALT="$ROOT/no2.conf" \
  bash "$WATCH" "$@" 2>&1
}
sent_count() { grep -c "ALERT \[$1\]" "$ROOT/sshwatch.log" 2>/dev/null || echo 0; }

# ═══════════════════════════════════════════════════════════════════════════
head "۱) حالتِ آزمایشی نباید هیچ فایلی بنویسد (باگِ «خوردنِ هشدار»)"
# ═══════════════════════════════════════════════════════════════════════════
OUT="$(run_dry)"
[ -f "$ROOT/state/integrity.sha256" ] && bad "dry-run فایلِ اثرِ انگشت ساخت!" || ok "dry-run فایلِ حالت نساخت"
[ -f "$ROOT/state/last-digest" ] && bad "dry-run مُهرِ خالصه گذاشت!" || ok "dry-run مُهرِ خالصه نگذاشت"
printf '%s' "$OUT" | grep -q 'آزمایشی' && ok "گزارشِ آزمایشی چاپ شد" || bad "گزارشِ آزمایشی چاپ نشد"

# ═══════════════════════════════════════════════════════════════════════════
head "۲) پایه‌گذاریِ واقعی + سکوتِ اجرای بی‌تغییر"
# ═══════════════════════════════════════════════════════════════════════════
OUT="$(run_real)"
printf '%s' "$OUT" | grep -q 'پیامِ تلگرام\|🚨' && bad "اجرای اول پیامِ الکی داد" || ok "اجرای اول (پایه‌گذاری) ساکت بود"
[ "$(grep -c . "$ROOT/state/integrity.sha256" 2>/dev/null)" = "2" ] && ok "اثرِ انگشتِ هر دو فایل ثبت شد" \
  || bad "اثرِ انگشت ناقص: $(grep -c . "$ROOT/state/integrity.sha256" 2>/dev/null)"
OUT="$(run_dry)"
printf '%s' "$OUT" | grep -q 'تغییر کرده' && bad "اجرای بی‌تغییر هشدار داد" || ok "اجرای بی‌تغییر ساکت بود"
OUT="$(LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8 run_dry)"
printf '%s' "$OUT" | grep -q 'تغییر کرده' && bad "localeِ متفاوت هشدارِ کاذب ساخت" || ok "localeِ متفاوت هشدارِ کاذب نساخت"

# ═══════════════════════════════════════════════════════════════════════════
head "۳) تغییرِ فایلِ حساس — نامِ فایل در پیام، و dry-run عوضش نمی‌کند"
# ═══════════════════════════════════════════════════════════════════════════
BEFORE="$(md5sum "$ROOT/state/integrity.sha256" | cut -d' ' -f1)"
printf 'secret-v2-BACKDOOR\n' > "$ROOT/etc/shadow"
OUT="$(run_dry)"
printf '%s' "$OUT" | grep -q 'تغییر کرده' && ok "هشدارِ تغییرِ فایل آمد" || bad "هشدارِ تغییر نیامد"
printf '%s' "$OUT" | grep -q 'shadow' && ok "نامِ فایلِ عوض‌شده در پیام هست" || bad "نامِ فایل نبود"
[ "$BEFORE" = "$(md5sum "$ROOT/state/integrity.sha256" | cut -d' ' -f1)" ] && ok "dry-run اثرِ انگشت را عوض نکرد" \
  || bad "dry-run اثرِ انگشت را عوض کرد!"
run_real >/dev/null; OUT="$(run_dry)"
printf '%s' "$OUT" | grep -q 'تغییر کرده' && bad "بعد از ثبتِ تازه باز هم هشدار داد" || ok "بعد از ثبتِ تازه ساکت شد"
grep -q 'INTEGRITY CHANGE' "$ROOT/sshwatch.log" && ok "تغییر در لاگ ثبت شد" || bad "در لاگ ثبت نشد"

# ═══════════════════════════════════════════════════════════════════════════
head "۴) موجِ حمله — با نامِ درستِ جیل (باگِ متنِ نادرست)"
# ═══════════════════════════════════════════════════════════════════════════
for i in 1 2 3; do ban $((NOW - 100 * i)) sshd "203.0.113.$i"; done
for i in 1 2 3; do ban $((NOW - 60 * i)) nginx-scan "198.51.100.$i"; done
OUT="$(run_dry)"
printf '%s' "$OUT" | grep -q 'موجِ حملهٔ خودکار به سرور — تلاشِ ناموفقِ رمزِ SSH' \
  && ok "موجِ SSH با متنِ درست آمد" || bad "متنِ موجِ SSH نادرست/نیامد"
printf '%s' "$OUT" | grep -q 'موجِ حملهٔ خودکار به سرور — اسکنِ وب' \
  && ok "موجِ اسکنِ وب با متنِ درست آمد" || bad "متنِ موجِ اسکنِ وب نیامد"
printf '%s' "$OUT" | grep -q '203.0.113.1' && ok "آی‌پی‌های موج در پیام هستند" || bad "آی‌پی‌ها نبودند"
# ضدِ اسپم فقط در حالتِ واقعی معنا دارد (dry-run مُهر نمی‌گذارد)
run_real >/dev/null; run_real >/dev/null
[ "$(sent_count campaign_sshd)" = "1" ] && ok "موجِ یکسان دوباره هشدار نداد (سکوتِ ۳۰ دقیقه‌ای)" \
  || bad "موج دوباره هشدار داد: $(sent_count campaign_sshd)×"

# ═══════════════════════════════════════════════════════════════════════════
head "۵) الگوهای نفوذ: «شکست سپس موفقیت»، کاربرِ غیرِ root، تلاشِ پیوسته"
# ═══════════════════════════════════════════════════════════════════════════
{
  printf '%s vm sshd[1]: Failed password for root from 198.51.100.9 port 5 ssh2\n' "$(ts_auth $((NOW - 400)))"
  printf '%s vm sshd[2]: Accepted password for root from 198.51.100.9 port 6 ssh2\n' "$(ts_auth $((NOW - 300)))"
} >> "$ROOT/auth.log"
OUT="$(run_dry)"
printf '%s' "$OUT" | grep -q 'ورودِ موفق از آی‌پی' && ok "هشدارِ «شکست سپس موفقیت» آمد" || bad "هشدارِ نفوذ نیامد"
printf '%s' "$OUT" | grep -q '198.51.100.9' && ok "آی‌پیِ مشکوک در پیام هست" || bad "آی‌پی در پیام نبود"

printf '%s vm sshd[3]: Accepted password for ubuntu from 192.0.2.77 port 7 ssh2\n' "$(ts_auth $((NOW - 200)))" >> "$ROOT/auth.log"
OUT="$(run_dry)"
printf '%s' "$OUT" | grep -q 'ورودِ موفق با کاربرِ غیرِ root' && ok "ورودِ کاربرِ غیرِ root خبر داده شد" \
  || bad "ورودِ غیرِ root دیده نشد"

for i in $(seq 1 120); do
  printf '%s vm sshd[4]: Failed password for root from 203.0.113.250 port $i ssh2\n' "$(ts_auth $((NOW - 500)))" >> "$ROOT/auth.log"
done
OUT="$(run_dry)"
printf '%s' "$OUT" | grep -q 'تلاشِ پیوستهٔ رمزِ SSH' && ok "تلاشِ پیوستهٔ «کند» تشخیص داده شد" \
  || bad "تلاشِ پیوسته دیده نشد"

# ═══════════════════════════════════════════════════════════════════════════
head "۶) خالصهٔ روزانه، --refresh و --test-alert"
# ═══════════════════════════════════════════════════════════════════════════
OUT="$(run_dry --digest)"
printf '%s' "$OUT" | grep -q 'خالصهٔ روزانهٔ امنیتِ سرور' && ok "خالصهٔ روزانه ساخته شد" || bad "خالصه نیامد"
printf '%s' "$OUT" | grep -q 'بسته‌شده در ۲۴ ساعت' && ok "خالصه آمارِ بن را به تفکیک دارد" || bad "آمارِ بن در خالصه نیست"
printf '%s' "$OUT" | grep -q 'پرتلاش‌ترین آی‌پیِ مهاجم' && ok "پرتلاش‌ترین مهاجم در خالصه هست" || bad "پرتلاش‌ترین مهاجم نیست"
run_real --digest >/dev/null
OUT="$(run_dry)"
printf '%s' "$OUT" | grep -q 'خالصهٔ روزانه' && bad "خالصه دوباره فرستاده شد (باید ۲۴ ساعت ساکت باشد)" \
  || ok "خالصه در همان روز تکرار نشد"
printf 'root ALL=(ALL) NOPASSWD: ALL\n' > "$ROOT/etc/sudoers"
OUT="$(run_real --refresh)"
printf '%s' "$OUT" | grep -q 'تغییر کرده' && bad "--refresh باز هم هشدارِ تغییر داد" || ok "با --refresh هشدارِ تغییر نیامد"
OUT="$(run_dry)"
printf '%s' "$OUT" | grep -q 'تغییر کرده' && bad "بعد از --refresh هشدار داد" || ok "بعد از --refresh ساکت ماند"
OUT="$(run_dry --test-alert)"
printf '%s' "$OUT" | grep -q 'پیامِ آزمایشی' && ok "--test-alert پیامِ آزمایشی می‌سازد" || bad "--test-alert کار نکرد"

printf '\n\033[1m════════════════════════════════════════════\033[0m\n'
printf '  نتیجه: \033[32m%d موفق\033[0m' "$PASS"
[ "$FAIL" -gt 0 ] && printf ' / \033[31m%d ناموفق\033[0m' "$FAIL"
printf '\n\033[1m════════════════════════════════════════════\033[0m\n'
[ "$FAIL" = "0" ] || exit 1
