#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  نصب/به‌روزرسانیِ نگهبانِ حمله (systemd timer هر ۶۰ ثانیه)
# ═══════════════════════════════════════════════════════════════════════════
#
#   bash scripts/install-attack-watch.sh          # نصب یا به‌روزرسانی
#   bash scripts/install-attack-watch.sh --dry-run # فقط نشان بده چه می‌کند
#   bash scripts/install-attack-watch.sh --remove  # حذفِ کاملِ نگهبان
#
# چرا اسکریپتِ جدا و نه داخلِ deploy.sh: این نگهبان به فایلِ تنظیماتِ تلگرامِ
# همین سرور و لاگِ nginx وابسته است و نصبش یک‌بار برای همیشه است؛ گذاشتنش
# داخلِ چرخهٔ هر دیپلوی فقط سطحِ ریسکِ دیپلوی را بالا می‌برد.
#
# idempotent است: هر چند بار هم اجرا شود، نتیجه یکی است.
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/GhelGheli}"
UNIT_DIR=/etc/systemd/system
DRY=0
REMOVE=0
case "${1:-}" in
  --dry-run) DRY=1 ;;
  --remove) REMOVE=1 ;;
  "") ;;
  *) echo "usage: $0 [--dry-run|--remove]" >&2; exit 2 ;;
esac
run() { if [ "$DRY" -eq 1 ]; then printf '  [dry] %s\n' "$*"; else "$@"; fi; }

if [ "$REMOVE" -eq 1 ]; then
  run systemctl disable --now ghelgheli-attackwatch.timer || true
  run rm -f "$UNIT_DIR/ghelgheli-attackwatch.timer" "$UNIT_DIR/ghelgheli-attackwatch.service"
  run systemctl daemon-reload
  printf 'نگهبانِ حمله حذف شد (خودِ اسکریپتِ اسکریپت در مخزن دست‌نخورده ماند).\n'
  exit 0
fi

[ -f "$APP_DIR/monitor/attack-watch.sh" ] || { echo "اسکریپتِ نگهبان در $APP_DIR/monitor پیدا نشد — اول دیپلوی کن." >&2; exit 1; }

echo "==> اجراپذیر کردنِ اسکریپت"
# ⚠️ تلهٔ واقعیِ همین امروز: نسخهٔ اول `install src src` می‌کرد (خودش روی خودش)
# و install با خطای «same file» می‌ایستاد؛ چون اسکریپت‌ها از قبل در مخزنِ سرور
# هستند، تنها کاری که لازم است اجراپذیر کردنشان است.
run chmod 0755 "$APP_DIR/monitor/attack-watch.sh"

echo "==> بررسیِ نحو"
if [ "$DRY" -eq 0 ]; then bash -n "$APP_DIR/monitor/attack-watch.sh" || { echo "نحوِ اسکریپت خراب است." >&2; exit 1; }; fi

echo "==> نصبِ واحدهای systemd"
for unit in ghelgheli-attackwatch.service ghelgheli-attackwatch.timer; do
  src="$APP_DIR/deploy/systemd/$unit"
  [ -f "$src" ] || { echo "واحدِ $unit در مخزن نیست." >&2; exit 1; }
  run install -m 0644 "$src" "$UNIT_DIR/$unit"
done

run systemctl daemon-reload
run systemctl enable --now ghelgheli-attackwatch.timer

if [ "$DRY" -eq 0 ]; then
  echo
  echo "==> وضعیت"
  systemctl --no-pager --lines=0 status ghelgheli-attackwatch.timer | head -5 || true
  systemctl list-timers 'ghelgheli-attackwatch*' --no-pager | head -3 || true
  echo
  echo "==> آزمونِ خشک (بدونِ ارسالِ پیام تلگرام):"
  bash "$APP_DIR/monitor/attack-watch.sh" --dry-run || true
fi
