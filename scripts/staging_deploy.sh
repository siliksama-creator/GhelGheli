#!/usr/bin/env bash
# ============================================================================
#  دیپلوی روی **استیجینگِ دائمی** (بدون لمس تولید)
# ============================================================================
#
#   sudo bash scripts/staging_deploy.sh
#
# بعد از هر تغییر می‌توان این را اجرا کرد: کدِ مخزن را pull می‌کند،
# وابستگی/مایگریشنِ استیجینگ را می‌زند و اپِ ghelgheli-staging را ری‌استارت
# (با env تازه) می‌کند. هرگز به تولید (۴۰۰۰/۴۰۰۱) یا دیتابیس تولید دست
# نمی‌زند.
set -Eeuo pipefail

APP_DIR="/var/www/GhelGheli"
BACK="$APP_DIR/backend"
ENV_FILE="$BACK/.env.staging"
APP_NAME="ghelgheli-staging"

log() { echo -e "\e[1;36m==> $*\e[0m"; }
die() { echo -e "\e[1;31mFATAL: $*\e[0m" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "با root اجرا کن"
[ -f "$ENV_FILE" ] || die ".env.staging نیست — اول staging_setup.sh را اجرا کن"

cd "$APP_DIR"
log "۱) به‌روزرسانیِ کد"
git pull --ff-only

cd "$BACK"
log "۲) وابستگی‌ها"
# ── مقاوم‌سازی در برابرِ مالکیتِ root ─────────────────────────────────
# اجرای تست‌های E2E (که به devDependencies مثل socket.io-client نیاز
# دارند) گاهی با `npm install` دستیِ root انجام می‌شود و مالکیتِ
# node_modules و کش npm را به root می‌برد؛ دیپلویِ بعدی که به‌عنوانِ
# کاربرِ ghelgheli اجرا می‌شود آن‌وقت با «operation not permitted» می‌میرد.
# پس پیش از نصب، مالکیتِ همان چیزهایی که npm می‌نویسد یک‌دست می‌شود؛ این
# عملیات idempotent است و روی دیپلویِ سالم هیچ کاری نمی‌کند.
chown -R ghelgheli:ghelgheli \
  "$BACK/node_modules" \
  "$BACK/package.json" "$BACK/package-lock.json" \
  /home/ghelgheli/.npm 2>/dev/null || true
sudo -u ghelgheli npm install --omit=dev --no-audit --no-fund \
  || { echo "::: نصب به‌عنوان ghelgheli نشد؛ پس از اصلاحِ مالکیت یک‌بار دیگر" \
       "به‌عنوانِ root نصب و بلافاصله مالکیت به ghelgheli برگردانده می‌شود." >&2; \
       npm install --omit=dev --no-audit --no-fund \
       && chown -R ghelgheli:ghelgheli "$BACK/node_modules" "$BACK/package.json" "$BACK/package-lock.json"; }

log "۳) مایگریشنِ استیجینگ"
# DATABASE_URL از .env.staging می‌آید، نه تولید.
sudo -u ghelgheli bash -c 'set -a; . "'"$ENV_FILE"'"; set +a; node scripts/migrate.js'

log "۴) ری‌استارت اپ استیجینگ (با env تازه)"
sudo -u ghelgheli bash -c '
  set -a; . "'"$ENV_FILE"'"; set +a
  cd "'"$BACK"'"
  pm2 restart '"$APP_NAME"' --update-env
'
sudo -u ghelgheli pm2 save

log "۵) سلامت"
for i in $(seq 1 25); do
  if curl -fsS http://127.0.0.1:4100/health >/dev/null 2>&1; then
    echo "   استیجینگ سالم: $(curl -s http://127.0.0.1:4100/health)"; break
  fi
  sleep 1
  [ "$i" = 25 ] && die "استیجینگ سالم نشد"
done

echo
log "استیجینگ به‌روزرسانی شد. اجرای تست‌ها روی آن:"
echo "   BASE=http://127.0.0.1:4100 E2E_ADMIN_USER=Admin E2E_ADMIN_PASS='Staging@2026' node scripts/testE2E.js"
echo "   BASE=http://127.0.0.1:4100 E2E_ADMIN_USER=Admin E2E_ADMIN_PASS='Staging@2026' node scripts/testAdminRoleDepth.js"
echo "   BASE=http://127.0.0.1:4100 node scripts/loadTest.js   # بدون ALLOW_PROD"
