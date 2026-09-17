#!/usr/bin/env bash
#
# ═══════════════════════════════════════════════════════════════════════════
#  capacity-install — نصبِ «تنظیمِ خودکارِ ظرفیت» روی سرور
# ═══════════════════════════════════════════════════════════════════════════
#
# یک‌بار اجرا می‌شود و بعد از آن هیچ‌چیز دستی لازم نیست:
#
#   ۱) اسکریپت را در /usr/local/bin/ghelgheli-capacity-apply.sh می‌گذارد
#   ۲) سرویس + تایمرِ systemd را نصب و فعال می‌کند
#      (روزی یک‌بار ۰۴:۲۰ + ۹۰ ثانیه بعد از هر بوت)
#   ۳) یک‌بار همان اسکریپت را اجرا می‌کند تا وضعیتِ فعلی ثبت شود
#
# از این به بعد اگر سرور ارتقا داده شود، اولین بوتِ بعدی خودش می‌فهمد،
# تعداد گره‌ها و upstreamِ nginx را بازچینی می‌کند و در تلگرام خبر می‌دهد.
#
# اجرا (روی سرور، با کاربرِ root):
#   bash scripts/capacity-install.sh
#   bash scripts/capacity-install.sh --dry-run   # فقط نمایش می‌دهد
#
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/GhelGheli}"
BIN="/usr/local/bin/ghelgheli-capacity-apply.sh"
SRC="$APP_DIR/scripts/capacity-apply.sh"
UNIT_DIR="/etc/systemd/system"
DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

[ "$(id -u)" = "0" ] || { echo "باید با کاربرِ root اجرا شود." >&2; exit 1; }
[ -f "$SRC" ] || { echo "فایل پیدا نشد: $SRC" >&2; exit 1; }

say "۱/۴ نصبِ اسکریپت در $BIN"
if [ "$DRY" = "1" ]; then echo "  (آزمایشی) install -m 755 $SRC $BIN"; else
  install -m 755 "$SRC" "$BIN"
  bash -n "$BIN" || { echo "خطای نحوی در اسکریپت!" >&2; exit 1; }
fi

say "۲/۴ نصبِ واحدهای systemd"
for u in ghelgheli-capacity.service ghelgheli-capacity.timer; do
  src="$APP_DIR/deploy/systemd/$u"
  [ -f "$src" ] || { echo "فایل واحد پیدا نشد: $src" >&2; exit 1; }
  if [ "$DRY" = "1" ]; then echo "  (آزمایشی) install -m 644 $src $UNIT_DIR/$u"; else
    install -m 644 "$src" "$UNIT_DIR/$u"
  fi
done
if [ "$DRY" = "0" ]; then
  systemctl daemon-reload
  systemctl enable --now ghelgheli-capacity.timer
fi

say "۳/۴ وضعیتِ تایمر"
if [ "$DRY" = "0" ]; then
  systemctl list-timers ghelgheli-capacity.timer --no-pager || true
fi

say "۴/۴ اولین اجرا (ثبتِ پروفایلِ فعلی)"
if [ "$DRY" = "1" ]; then echo "  (آزمایشی) $BIN --dry-run"; else
  "$BIN" --dry-run || true
  "$BIN"
fi

say "تمام ✅"
cat <<'EOT'
از این لحظه:
  • روزی یک‌بار ۰۴:۲۰ و ۹۰ ثانیه بعد از هر بوت، سخت‌افزار بررسی می‌شود.
  • اگر هسته/رم عوض شده باشد → PM2 و upstreamِ nginx خودکار بازچینی می‌شوند.
  • پیامِ تغییر در تلگرام می‌آید (از چه به چه).
  • اگر همه‌چیز مثل قبل باشد، فقط یک خط لاگ می‌نویسد و کاری نمی‌کند.

بررسیِ دستیِ وضعیت:
  /usr/local/bin/ghelgheli-capacity-apply.sh --dry-run
  cat /var/www/GhelGheli/backend/.capacity-state.json
  curl -s http://127.0.0.1:4000/health | jq .capacity
  tail -20 /var/log/ghelgheli-capacity.log
EOT
