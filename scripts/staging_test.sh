#!/usr/bin/env bash
# ============================================================================
#  اجرای خوداتکای کاملِ تست‌های راستی‌آزمایی روی استیجینگِ دائمی (پورت ۴۱۰۰)
# ============================================================================
#
#   sudo bash scripts/staging_test.sh
#
# کل سوئیتِ زنده را روی استیجینگ اجرا می‌کند: E2E پول، عمق نقش ادمین،
# سوکت لیدربورد (شامل بستن فصل + تأیید واریز + reconnect)، و تست بار.
# DATABASE_URL از خود .env.staging خوانده می‌شود تا فاز مدیریتی تست
# (صدرنشین‌کردن برنده) هم کار کند. هیچ چیزی روی تولید اجرا نمی‌شود.
#
# برخلاف قبل، دیگر به نصبِ دستیِ دیپندنسیِ تستی نیاز نیست: `socket.io-client`
# جزو وابستگی‌های نصب‌شدهٔ استیجینگ است.
set -Eeuo pipefail

APP_DIR="/var/www/GhelGheli"
BACK="$APP_DIR/backend"
ENV_FILE="$BACK/.env.staging"
APP_NAME="ghelgheli-staging"

log() { echo -e "\e[1;36m==> $*\e[0m"; }
die() { echo -e "\e[1;31mFATAL: $*\e[0m" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "با root اجرا کن"
[ -f "$ENV_FILE" ] || die ".env.staging نیست — اول staging_setup.sh"

# ── env استیجینگ را برای تست‌ها بارگذاری کن ──────────────────────────────
set -a; . "$ENV_FILE"; set +a
export DATABASE_URL
export BASE="http://127.0.0.1:4100"
export E2E_ADMIN_USER="Admin"
export E2E_ADMIN_PASS="Staging@2026"

cd "$BACK"

log "سلامت استیجینگ"
curl -fsS "$BASE/health" >/dev/null || die "استیجینگ پاسخ نمی‌دهد ($BASE/health)"

run() { # نام + دستور
  local name="$1"; shift
  log "$name"
  # مالکیت node_modules را پیش از اجرا درست نگه دار (idempotent) تا اگر کسی
  # قبلاً با root نصب کرده، تست زیر ghelgheli هم بی‌خطا اجرا شود.
  chown -R ghelgheli:ghelgheli node_modules 2>/dev/null || true
  if sudo -E -u ghelgheli env \
      BASE="$BASE" DATABASE_URL="$DATABASE_URL" \
      E2E_ADMIN_USER="$E2E_ADMIN_USER" E2E_ADMIN_PASS="$E2E_ADMIN_PASS" \
      "$@"; then
    echo "   ✓ $name سبز"
  else
    echo "   ✗ $name شکست خورد" >&2
    die "تست شکست خورد: $name"
  fi
}

run "E2E مسیرهای پول"                           node scripts/testE2E.js
run "E2E عمق نقش‌های ادمین"                     node scripts/testAdminRoleDepth.js
export TEST_SEASON_CLOSE=1
run "E2E سوکت لیدربورد (فصل+پرداخت+reconnect)" node scripts/testLeaderboardSocket.js
unset TEST_SEASON_CLOSE
export CONCURRENCY=40
export DURATION=10
run "تست بار HTTP"                              node scripts/loadTest.js

log "همهٔ تست‌های زندهٔ استیجینگ سبز شدند ✅"
echo "یادآوری: کاربران تستی در استیجینگ می‌مانند (دیتابیس تستی/دورریختنی)."
