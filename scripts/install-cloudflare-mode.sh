#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  نصبِ نگهبانِ سمتِ سرورِ سپرِ کلادفلر
# ═══════════════════════════════════════════════════════════════════════════
#
#   bash scripts/install-cloudflare-mode.sh            # نصب / به‌روزرسانی
#   bash scripts/install-cloudflare-mode.sh --dry-run  # فقط نشان بده
#   bash scripts/install-cloudflare-mode.sh --status   # وضعیتِ فعلی
#
# ── چرا این نصب *الان* انجام می‌شود و کاری هم نمی‌کند ─────────────────────
#
# خواستهٔ مالک: «آماده باشه، تا وقتی حمله نشده غیرفعال بمونه.» پس زیرساختِ
# سمتِ سرور از حالا نصب می‌شود ولی چون فایلِ حالت («on/off») وجود ندارد،
# نگهبان هر ۳۰ ثانیه بیدار می‌شود، می‌بیند چیزی نخواسته‌اند، و می‌خوابد.
# یعنی هیچ کانفیگی عوض نمی‌شود تا لحظه‌ای که خودِ مالک از پنل روشنش کند.
#
# چرا مسیرِ پنل باید قابلِ نوشتن برای کاربرِ `ghelgheli` باشد: پنل همان فایلِ
# حالت را می‌نویسد؛ این اسکریپت فقط پوشه را می‌سازد و مالکیتش را می‌دهد.
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/GhelGheli}"
APP_USER="${APP_USER:-ghelgheli}"
STATE_DIR="${STATE_DIR:-/var/lib/ghelgheli}"
UNIT_DIR=/etc/systemd/system
DRY=0
case "${1:-}" in
  --dry-run) DRY=1 ;;
  --status)
    bash "$APP_DIR/scripts/cloudflare-mode-apply.sh" --status
    systemctl list-timers 'ghelgheli-cloudflare-mode*' --no-pager | head -3
    exit 0 ;;
  "") ;;
  *) echo "usage: $0 [--dry-run|--status]" >&2; exit 2 ;;
esac
run() { if [ "$DRY" -eq 1 ]; then printf '  [dry] %s\n' "$*"; else "$@"; fi; }

[ -f "$APP_DIR/scripts/cloudflare-mode-apply.sh" ] || {
  echo "اسکریپتِ نگهبان در $APP_DIR/scripts پیدا نشد — اول دیپلوی کن." >&2; exit 1; }

echo "==> پوشهٔ حالت (پنل می‌نویسد، root می‌خواند)"
# 0750: کاربرِ برنامه می‌نویسد، root می‌خواند، بقیه هیچ.
run install -d -m 0750 -o "$APP_USER" -g "$APP_USER" "$STATE_DIR"

echo "==> اجراپذیر کردنِ نگهبان"
run chmod 0755 "$APP_DIR/scripts/cloudflare-mode-apply.sh"
if [ "$DRY" -eq 0 ]; then bash -n "$APP_DIR/scripts/cloudflare-mode-apply.sh" || { echo "نحوِ نگهبان خراب است." >&2; exit 1; }; fi

echo "==> نصبِ واحدهای systemd"
for unit in ghelgheli-cloudflare-mode.service ghelgheli-cloudflare-mode.timer; do
  src="$APP_DIR/deploy/systemd/$unit"
  [ -f "$src" ] || { echo "واحدِ $unit در مخزن نیست." >&2; exit 1; }
  run install -m 0644 "$src" "$UNIT_DIR/$unit"
done

run systemctl daemon-reload
run systemctl enable --now ghelgheli-cloudflare-mode.timer

if [ "$DRY" -eq 0 ]; then
  echo
  echo "==> وضعیت"
  systemctl --no-pager --lines=0 status ghelgheli-cloudflare-mode.timer | head -5 || true
  echo
  echo "==> اجرای یک‌بارهٔ نگهبان (باید بی‌کار برگردد چون سپر خاموش است):"
  bash "$APP_DIR/scripts/cloudflare-mode-apply.sh" || true
  bash "$APP_DIR/scripts/cloudflare-mode-apply.sh" --status
  echo
  printf 'یادآوری: تا وقتی خطِ سقفِ درخواست در کانفیگِ nginx باشد، سقفِ ضدِربات کار می‌کند؛\n'
  printf 'این نگهبان فقط «منبعِ» آی‌پی را درست می‌کند تا آن سقف کاربرانِ واقعی را نبندد.\n'
fi
