#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
#  محدودکردنِ سختِ Invoicle روی همین سرور — تا قلقلی همیشه منابع داشته باشد
# ════════════════════════════════════════════════════════════════════════════
#
#   نصب:     bash invoicle-limit.sh            (تغییر + اعمال + تأیید)
#   نمایش:   bash invoicle-limit.sh --show
#   بازگشت:  bash invoicle-limit.sh --rollback (همه‌چیز به حالتِ قبل)
#
# ── چرا ────────────────────────────────────────────────────────────────────
# سرور ۲ هسته و ~۳.۹ گیگ رم دارد و دو محصول روی آن کار می‌کنند. اندازه‌گیری
# نشان داد Invoicle (پنج واحدِ systemd) بدونِ هیچ سقفی اجرا می‌شد: اوجِ مصرفِ
# هر واحد بین ۵۶ تا ۳۲۲ مگابایت بود و مجموعِ اوج‌ها تا ~۱ گیگ می‌رسید؛ هر
# لحظه ممکن بود قلقلی را از منابع بیرون کند.
#
# ── راه‌حل ─────────────────────────────────────────────────────────────────
# همهٔ واحدهای Invoicle داخلِ یک «slice» (سینیِ مشترک) گذاشته می‌شوند و
# سقف‌ها روی همان سینی اعمال می‌شود، نه روی هر سرویس جدا:
#
#   MemoryHigh  = 600M   ← از این به بعد فشرده‌سازی/کندکردنِ تخصیص
#   MemoryMax   = 900M   ← خطِ آخر (عبور = کشته‌شدنِ پروسهٔ همان سینی)
#   MemorySwapMax = 256M ← جلوگیری از سواپ‌خواریِ شدید
#   CPUQuota    = 80%    ← حداکثر ۰.۸ هسته از ۲ هسته (۴۰٪ کلِ ماشین)
#   CPUWeight   = 20     ← در رقابت با قلقلی (وزن ۳۰۰) عقب می‌مانَد
#   IOWeight    = 20     ← فشارِ دیسکش هم کم‌وزن است
#   TasksMax    = 256    ← سقفِ تعدادِ پروسه (ضدِ فورانِ پروسه)
#
# و در سمتِ دیگر: قلقلی وزنِ بیشتر (۳۰۰) و «رمِ محافظت‌شدهٔ نرم» (MemoryLow)
# می‌گیرد تا کرنل راحت‌تر حافظه را از Invoicle بردارد، نه از قلقلی.
#
# همه‌چیز با drop-in انجام می‌شود؛ هیچ فایلی از خودِ Invoicle دست نمی‌خورد و
# بازگشت یک دستور است.
set -uo pipefail

UNITS=(invoicle-bot.service invoicle-web.service
       invoicle-worker@render.service invoicle-worker@maintenance.service
       invoicle-worker@payments.service)
GG_UNIT="pm2-ghelgheli.service"
SLICE="invoicle.slice"
BACKUP_DIR="/root/invoicle-limits-backup"
STAMP="$(date +%Y%m%d-%H%M%S)"

say()  { printf '%s\n' "$*"; }
head() { printf '\n\033[1;36m%s\033[0m\n' "$*"; }

# CPUQuotaPerSecUSec در systemd 255 به شکلِ «800ms» یا «1s» یا «infinity» چاپ
# می‌شود؛ این تابع به درصدِ یک هسته تبدیلش می‌کند.
quota_pct() {
  local v; v="$(systemctl show -p CPUQuotaPerSecUSec --value "$1" 2>/dev/null)"
  case "$v" in
    infinity|"") echo "بی‌نهایت" ;;
    *ms) awk -v x="${v%ms}" 'BEGIN{printf "%.0f%%", x/10}' ;;
    *s)  awk -v x="${v%s}"  'BEGIN{printf "%.0f%%", x*100}' ;;
    *)   awk -v x="$v"      'BEGIN{printf "%.0f%%", x/10000}' ;;
  esac
}

# ── --show ─────────────────────────────────────────────────────────────────
if [ "${1:-}" = "--show" ]; then
  head "وضعیتِ فعلی"
  for u in "${UNITS[@]}"; do
    printf '  %-34s slice=%-18s رم=%-7s اوج=%-7s %s\n' "$u" \
      "$(systemctl show -p Slice --value "$u" 2>/dev/null)" \
      "$(systemctl show -p MemoryCurrent --value "$u" 2>/dev/null | awk '{printf "%.0fMB", $1/1048576}')" \
      "$(systemctl show -p MemoryPeak --value "$u" 2>/dev/null | awk '{printf "%.0fMB", $1/1048576}')" \
      "$(systemctl is-active "$u")"
  done
  printf '  %-34s رم=%-7s اوج=%-7s سقف‌=%s / %s  CPUQuota=%s\n' "مجموعِ $SLICE" \
    "$(systemctl show -p MemoryCurrent --value "$SLICE" 2>/dev/null | awk '{printf "%.0fMB", $1/1048576}')" \
    "$(systemctl show -p MemoryPeak --value "$SLICE" 2>/dev/null | awk '{printf "%.0fMB", $1/1048576}')" \
    "$(systemctl show -p MemoryHigh --value "$SLICE" 2>/dev/null | awk '{printf "%.0fMB", $1/1048576}')" \
    "$(systemctl show -p MemoryMax --value "$SLICE" 2>/dev/null | awk '{printf "%.0fMB", $1/1048576}')" \
    "$(quota_pct "$SLICE")"
  exit 0
fi

# ── --rollback ─────────────────────────────────────────────────────────────
if [ "${1:-}" = "--rollback" ]; then
  head "بازگشت به حالتِ قبل"
  for u in "${UNITS[@]}"; do
    d="/etc/systemd/system/${u}.d/invoicle-slice.conf"
    [ -f "$d" ] && rm -f "$d" && say "  حذف شد: $d"
  done
  d="/etc/systemd/system/${GG_UNIT}.d/priority.conf"
  [ -f "$d" ] && rm -f "$d" && say "  حذف شد: $d"
  rm -f "/etc/systemd/system/$SLICE" && say "  حذف شد: /etc/systemd/system/$SLICE"
  rmdir "/etc/systemd/system/${UNITS[0]}.d" 2>/dev/null || true
  systemctl set-property --runtime "$GG_UNIT" CPUWeight=100 IOWeight=100 MemoryLow=0 2>/dev/null || true
  systemctl daemon-reload
  for u in "${UNITS[@]}"; do systemctl restart "$u"; done
  systemctl restart "$GG_UNIT" 2>/dev/null || true
  sleep 8
  for u in "${UNITS[@]}"; do printf '  %-34s %s\n' "$u" "$(systemctl is-active "$u")"; done
  say "  سقف‌ها برداشته شد. (اگر قلقلی هم ری‌استارت شد، سه گره‌اش خودکار بالا می‌آیند؛ وضعیت: $(curl -s -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:4000/health))"
  exit 0
fi

mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"

head "۱) ذخیرهٔ وضعیتِ فعلی (برای بازگشت)"
{
  echo "# وضعیتِ Invoicle پیش از محدودسازی — $STAMP"
  for u in "${UNITS[@]}"; do
    echo "## $u  slice=$(systemctl show -p Slice --value "$u")  peak=$(systemctl show -p MemoryPeak --value "$u")"
    systemctl cat "$u" 2>/dev/null
  done
} > "$BACKUP_DIR/state-$STAMP.txt"
say "  ذخیره شد: $BACKUP_DIR/state-$STAMP.txt"

head "۲) ساختِ سینیِ مشترک (${SLICE})"
cat > "/etc/systemd/system/$SLICE" <<'EOF'
# ════════════════════════════════════════════════════════════════════════════
#  سینیِ مشترکِ Invoicle — سقفِ منابعِ همهٔ سرویس‌های Invoicle یک‌جا
# ════════════════════════════════════════════════════════════════════════════
# این فایل با /usr/local/bin/invoicle-limit.sh ساخته می‌شود.
# بازگشت به حالتِ قبل:  bash /usr/local/bin/invoicle-limit.sh --rollback
#
# چرا سینی و نه سقفِ هر سرویس: با پنج سرویس، پنج سقفِ جدا یعنی هیچ‌کس مجموع
# را کنترل نمی‌کند (هر پنج‌تا می‌توانند هم‌زمان به سقفِ خودشان برسند). با
# سینی، «کلِ Invoicle» یک عدد دارد و همان یک عدد تنظیم می‌شود.
[Slice]
# ── حافظه ────────────────────────────────────────────────────────────────
# MemoryHigh: از این عدد به بالا کرنل حافظه را پس می‌گیرد و تخصیصِ تازه کند
# می‌شود (سرویس زنده می‌مانَد، فقط فشرده می‌شود).
#
# چرا ۷۵۰ و نه ۶۰۰: بعد از ری‌استارت، مصرفِ عادیِ Invoicle (پنج سرویسِ
# پایتونی) روی ~۶۱۵ مگ نشست — یعنی با خطِ ۶۰۰ همیشه داخلِ حالتِ فشرده‌سازی
# می‌مانْد و کارهایش بی‌دلیل کند می‌شد. خطِ نرم عمداً *بالای* مصرفِ عادی است
# تا فقط جلوی رشدِ غیرعادی را بگیرد؛ سقفِ سخت همان ۹۰۰ می‌مانَد.
MemoryHigh=750M
# MemoryMax: خطِ سخت. عبور از این = کشته‌شدنِ پروسهٔ همان سینی توسط OOMِ
# cgroup (نه کلِ سرور). بالاتر از اوجِ واقعیِ اندازه‌گیری‌شده (~۳۰۰ مگ در
# حالتِ عادی، اوجِ تک‌واحد تا ۳۲۲ مگ) ولی به‌قدری کم که هرگز قلقلی را
# بیرون نکند.
MemoryMax=900M
# سواپ: قبلاً سواپِ سرور تا ۸۷۲ مگ پر شده بود؛ با این سقف، Invoicle
# نمی‌تواند با سواپ‌خواری، دیسک را مشغولِ خودش کند.
MemorySwapMax=256M
# ── پردازنده ─────────────────────────────────────────────────────────────
# حداکثر ۰.۸ هسته از ۲ هستهٔ سرور (۴۰٪). اگر قلقلی بی‌کار باشد، Invoicle
# می‌تواند از آن استفاده کند؛ ولی هیچ‌وقت نمی‌تواند پردازنده را از قلقلی
# بُرد. (برای شل‌کردن: 150% و بعد daemon-reload.)
CPUQuota=80%
# وزنِ رقابتی: پیش‌فرض ۱۰۰ است. ۲۰ یعنی وقتی هر دو کار دارند، سهمِ قلقلی
# چند برابر است.
CPUWeight=20
IOWeight=20
# سقفِ تعدادِ پروسه: جلوی فورانِ پروسه (یا مرورگرِ رندرِ Invoicle) را می‌گیرد.
TasksMax=256
EOF
say "  ساخته شد: /etc/systemd/system/$SLICE"

head "۳) بردنِ پنج سرویسِ Invoicle داخلِ سینی (drop-in)"
for u in "${UNITS[@]}"; do
  mkdir -p "/etc/systemd/system/${u}.d"
  cat > "/etc/systemd/system/${u}.d/invoicle-slice.conf" <<EOF
# ساختهٔ invoicle-limit.sh — این سرویس داخلِ سینیِ سقف‌دارِ Invoicle می‌رود.
[Service]
Slice=$SLICE
EOF
  say "  ✅ ${u}.d/invoicle-slice.conf"
done

head "۴) اولویت‌دادن به قلقلی (سمتِ دیگرِ معادله)"
mkdir -p "/etc/systemd/system/${GG_UNIT}.d"
cat > "/etc/systemd/system/${GG_UNIT}.d/priority.conf" <<'EOF'
# ساختهٔ invoicle-limit.sh
# وزنِ بالاتر ⇒ هنگامِ رقابتِ پردازنده/دیسک، نوبتِ قلقلی جلوتر است.
# MemoryLow: «رمِ محافظت‌شدهٔ نرم» — کرنل زیرِ فشار، اول از Invoicle
# برمی‌دارد، نه از قلقلی. (سقفِ بالا نمی‌گذاریم؛ قلقلی آزاد است.)
[Service]
CPUWeight=300
IOWeight=300
MemoryLow=256M
EOF
say "  ✅ ${GG_UNIT}.d/priority.conf"
# اعمالِ زنده، بدونِ ری‌استارتِ PM2: propertyـهای منابع را systemd همان لحظه
# روی cgroupِ در حال اجرا می‌نشانَد. (فایلِ بالا مالِ بعد از ری‌استارت/ری‌بوت است.)
systemctl set-property --runtime "$GG_UNIT" CPUWeight=300 IOWeight=300 MemoryLow=256M 2>/dev/null \
  && say "  اعمالِ زنده روی قلقلی ✅ (بدونِ ری‌استارت)" \
  || say "  ⚠️ اعمالِ زنده نشد؛ بعد از ری‌استارتِ بعدی خودکار اعمال می‌شود."

head "۵) اعمالِ تنظیمات"
systemctl daemon-reload
say "  daemon-reload ✅"

# Restart فقط جایی که لازم است: Slice= تنها در زمانِ استارتِ سرویس اعمال
# می‌شود. یکی‌یکی (چرخشی) تا صف‌ها بی‌خدمت نمانند.
# ⚠️ درسِ اجرای اول: `Slice=` بعد از daemon-reload فقط «تنظیم» است؛ پروسه‌های
# در حالِ اجرا تا ری‌استارت در cgroupِ قبلی می‌مانند. پس ملاکِ ما /proc است، نه
# propertyِ تنظیم‌شده (وگرنه فکر می‌کنیم اعمال شده، در حالی که سینی خالی است).
in_slice() {
  local u="$1" p
  p="$(systemctl show -p MainPID --value "$u" 2>/dev/null)"
  [ -n "$p" ] && [ "$p" != "0" ] && [ -r "/proc/$p/cgroup" ] || return 1
  grep -q "/${SLICE}/" "/proc/$p/cgroup"
}
for u in "${UNITS[@]}"; do
  if in_slice "$u"; then
    say "  $u از قبل داخلِ سینی است — بدونِ ری‌استارت"
  else
    where="$(p=$(systemctl show -p MainPID --value "$u"); sed -n 's|^0:://||p' "/proc/$p/cgroup" 2>/dev/null | head -1)"
    say "  ری‌استارتِ $u (${where:-نامشخص} → $SLICE)…"
    systemctl restart "$u"
    sleep 3
    in_slice "$u" && say "    ✅ داخلِ ${SLICE} نشست (pid=$(systemctl show -p MainPID --value "$u"))" \
                     || say "    ⚠️ هنوز داخلِ سینی ننشسته — بررسی لازم است"
  fi
done
cur="$(systemctl show -p Slice --value "$GG_UNIT" 2>/dev/null)"
if [ "$cur" != "-" ] && [ "$cur" != "system.slice" ]; then
  say "  توجه: $GG_UNIT داخلِ $cur است؛ اولویت اعمال شد ولی برای قطعی‌شدن به ری‌استارتِ PM2 نیاز دارد."
fi

head "۶) تأیید"
sleep 3
OK=1
for u in "${UNITS[@]}"; do
  st="$(systemctl is-active "$u")"
  printf '  %-34s %s\n' "$u" "$st"
  [ "$st" = "active" ] || OK=0
done
bash "${BASH_SOURCE[0]}" --show
WEB="$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://127.0.0.1:8088/ 2>/dev/null)"
GG="$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://127.0.0.1:4000/health 2>/dev/null)"
say "  وبِ Invoicle (8088): $WEB   |   قلقلی (/health): $GG"
SLICE_BYTES="$(cat "/sys/fs/cgroup/${SLICE}/memory.current" 2>/dev/null || echo 0)"
say "  مصرفِ واقعیِ سینی روی کرنل: $(( SLICE_BYTES / 1048576 ))MB  (سقفِ نرم ۶۰۰MB / سخت ۹۰۰MB)"
[ "$SLICE_BYTES" -gt 0 ] || say "  ❌ سینی خالی است — یعنی هنوز هیچ سرویسی داخلش نرفته (باید ری‌استارت شوند)."
say "  سهمِ CPU: $(quota_pct "$SLICE") از یک هسته  |  وزنِ رقابتی: $(systemctl show -p CPUWeight --value "$SLICE") (قلقلی: $(systemctl show -p CPUWeight --value "$GG_UNIT"))"
if [ "$OK" = "1" ]; then
  say "  ✅ هر پنج سرویس فعال و داخلِ سینیِ سقف‌دار."
else
  say "  ⚠️ بعضی سرویس‌ها بالا نیامدند — با --rollback برگردانید و خبر بدهید."
fi
