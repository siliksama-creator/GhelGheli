#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  نصب/به‌روزرسانیِ نگهبانِ امنیت (SSH + یکپارچگیِ فایل‌ها) — هر ۶۰ ثانیه
# ═══════════════════════════════════════════════════════════════════════════
#
#   bash scripts/install-ssh-watch.sh           # نصب یا به‌روزرسانی
#   bash scripts/install-ssh-watch.sh --dry-run # فقط نشان بده چه می‌کند
#   bash scripts/install-ssh-watch.sh --remove  # حذفِ کاملِ نگهبان
#
# چرا اسکریپتِ جدا و نه داخلِ deploy.sh: مثلِ نگهبانِ حمله، به لاگِ ssh و
# فایلِ تنظیماتِ تلگرامِ همین سرور وابسته است و نصبش یک‌بار برای همیشه است.
#
# ⚠️ نکتهٔ مهم برای مالک: این نگهبان **ورودِ پسوردی را نمی‌بندد**. ایجنت‌های
# هوشِ مصنوعی همان‌طور با رمزِ root وارد می‌شوند؛ این فقط چشم است، نه قفلِ
# اضافه — به همین دلیل هیچ ریسکی برای کارِ ایجنت‌ها ندارد.
#
# چرا پایه‌گذاری (baseline) اولیه ساکت است: اولین اجرا اثرِ انگشتِ فایل‌های
# حساس را ثبت می‌کند و پیام نمی‌دهد؛ وگرنه نصبِ خودش یک هشدارِ الکی می‌ساخت.
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
  run systemctl disable --now ghelgheli-sshwatch.timer || true
  run rm -f "$UNIT_DIR/ghelgheli-sshwatch.timer" "$UNIT_DIR/ghelgheli-sshwatch.service"
  run systemctl daemon-reload
  printf 'نگهبانِ امنیت حذف شد (اسکریپت و فایل‌های حالت در مخزن/دایرکتوریِ حالت ماندند).\n'
  exit 0
fi

[ -f "$APP_DIR/monitor/ssh-watch.sh" ] || { echo "اسکریپتِ نگهبان در $APP_DIR/monitor پیدا نشد — اول دیپلوی کن." >&2; exit 1; }

echo "==> اجراپذیر کردنِ اسکریپت"
run chmod 0755 "$APP_DIR/monitor/ssh-watch.sh"

echo "==> بررسیِ نحو"
if [ "$DRY" -eq 0 ]; then bash -n "$APP_DIR/monitor/ssh-watch.sh" || { echo "نحوِ اسکریپت خراب است." >&2; exit 1; }; fi

echo "==> نصبِ واحدهای systemd"
for unit in ghelgheli-sshwatch.service ghelgheli-sshwatch.timer; do
  src="$APP_DIR/deploy/systemd/$unit"
  [ -f "$src" ] || { echo "واحدِ $unit در مخزن نیست." >&2; exit 1; }
  run install -m 0644 "$src" "$UNIT_DIR/$unit"
done

run systemctl daemon-reload
run systemctl enable --now ghelgheli-sshwatch.timer

if [ "$DRY" -eq 0 ]; then
  echo
  echo "==> وضعیت"
  systemctl --no-pager --lines=0 status ghelgheli-sshwatch.timer | head -5 || true
  systemctl list-timers 'ghelgheli-sshwatch*' --no-pager | head -3 || true
  echo
  echo "==> آزمونِ خشک (بدونِ ارسالِ پیام تلگرام):"
  bash "$APP_DIR/monitor/ssh-watch.sh" --dry-run || true
  echo
  echo "==> حالتِ ذخیره‌شده:"
  ls -la /var/lib/ghelgheli-ssh-watch/ 2>/dev/null || true
fi
