#!/usr/bin/env bash
# ============================================================================
#  راه‌اندازیِ **استیجینگِ دائمیِ** GhelGheli روی VPS (یک‌بار اجرا می‌شود)
# ============================================================================
#
#   sudo bash scripts/staging_setup.sh
#
# چه می‌سازد (همه روی مرزِ جدا از تولید):
#   • دیتابیسِ جدا : ghelgheli_staging (اسکیمای مستقل، بدون دادهٔ تولید)
#   • backend/.env.staging (JWT_SECRET و رمزِ ادمینِ متفاوت، پورت ۴۱۰۰)
#   • اپِ PM2 به‌نام ghelgheli-staging که بعد از ریبوت هم بالا می‌آید.
#
# چرا اکوسیستم‌فایل ندارد: PM2 نسخهٔ ۷ فقط فایلی را که دقیقاً
# `ecosystem.config.*` نام دارد به‌چشمِ کانفیگ می‌خواند و هر نامِ دیگر را
# «اسکریپت» فرض می‌کند. برای اینکه با دیپلویِ تولید (که همان نامِ رسمی را
# دارد) تداخل نکند، استیجینگ را مستقیم با `pm2 start src/server.js` و
# متغیرهایِ اکسپورت‌شده از .env.staging اجرا می‌کنیم — ساده و قطعی.
#
# استیجینگ عمومی نیست: روی ۱۲۷.۰.۰.۱:۴۱۰۰ می‌شنود و nginx برایش دامنه/TLS
# ندارد؛ فقط از روی خود سرور (یا SSH tunnel) در دسترس است.
set -Eeuo pipefail

APP_DIR="/var/www/GhelGheli"
BACK="$APP_DIR/backend"
STAGING_DB="ghelgheli_staging"
ENV_FILE="$BACK/.env.staging"
APP_NAME="ghelgheli-staging"

log() { echo -e "\e[1;36m==> $*\e[0m"; }
die() { echo -e "\e[1;31mFATAL: $*\e[0m" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "با root اجرا کن (sudo bash $0)"
[ -d "$BACK" ] || die "مسیر $BACK پیدا نشد"

log "۱) دیتابیسِ استیجینگ (ghelgheli_staging)"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$STAGING_DB'" | grep -q 1 \
  || sudo -u postgres createdb -O ghelgheli "$STAGING_DB"
echo "   پایگاه آماده است."

log "۲) فایل .env.staging"
if [ -f "$ENV_FILE" ]; then
  echo "   .env.staging از قبل هست؛ دست‌نخورده می‌ماند."
else
  DBPASS="$(grep -oP 'DATABASE_URL=postgres://ghelgheli:\K[^@]+' "$BACK/.env")"
  REDIS_LINE="$(grep -oP '^REDIS_URL=\K.*' "$BACK/.env" || true)"
  # JWT و رمزِ ادمینِ متفاوت با تولید، تا توکنِ استیجینگ هرگز در تولید
  # پذیرفته نشود (مرزِ امنیتی).
  JWT="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  cat > "$ENV_FILE" <<ENVV
DATABASE_URL=postgres://ghelgheli:${DBPASS}@127.0.0.1:5432/${STAGING_DB}
JWT_SECRET=${JWT}
NODE_ENV=staging
PORT=4100
ADMIN_DEFAULT_USERNAME=Admin
ADMIN_DEFAULT_PASSWORD=Staging@2026
MAIN_ADMIN_USERNAME=Admin
MAIN_ADMIN_PASSWORD=Staging@2026
ALLOW_PASSWORD_REGISTRATION=true
OTP_DEV_MODE=true
REDIS_URL=${REDIS_LINE}
ENVV
  chown ghelgheli:ghelgheli "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "   ساخته شد (رمز ادمین استیجینگ: Staging@2026)."
fi

log "۳) مایگریشن و ادمینِ اولیه"
( cd "$BACK"
  set -a; . "$ENV_FILE"; set +a
  sudo -u ghelgheli env DATABASE_URL="$DATABASE_URL" node scripts/migrate.js
  sudo -u ghelgheli env DATABASE_URL="$DATABASE_URL" \
    ADMIN_DEFAULT_USERNAME=Admin ADMIN_DEFAULT_PASSWORD=Staging@2026 \
    MAIN_ADMIN_USERNAME=Admin MAIN_ADMIN_PASSWORD=Staging@2026 \
    ALLOW_PASSWORD_REGISTRATION=true OTP_DEV_MODE=true JWT_SECRET="$JWT_SECRET" \
    node scripts/seedAdmin.js )

log "۴) اپِ PM2 استیجینگ (روی 127.0.0.1:4100)"
# پاک‌کردنِ اجراهای اشتباهیِ احتمالی (که به‌جای کانفیگ، فایل را اسکریپت
# اجرا کرده‌اند و با نامِ فایل دیده می‌شوند).
for badname in ecosystem.staging ecosystem.config.staging; do
  sudo -u ghelgheli pm2 delete "$badname" >/dev/null 2>&1 || true
done
# env استیجینگ را در شِل بارگذاری کن، سپس سرور را مستقیم استارت بزن؛
# PM2 متغیرهای اکسپورت‌شده را به اپ تزریق می‌کند.
sudo -u ghelgheli bash -c '
  set -a; . "'"$ENV_FILE"'"; set +a
  cd "'"$BACK"'"
  pm2 start src/server.js --name '"$APP_NAME"' \
    --max-memory-restart 600M --node-args="--max-old-space-size=768" \
    --update-env || pm2 restart '"$APP_NAME"' --update-env
'
sudo -u ghelgheli pm2 save || true

log "۵) سلامت"
for i in $(seq 1 25); do
  if curl -fsS http://127.0.0.1:4100/health >/dev/null 2>&1; then
    echo "   استیجینگ بالا است: $(curl -s http://127.0.0.1:4100/health)"; exit 0
  fi
  sleep 1
done
die "استیجینگ بالا نیامد — لاگ: sudo -u ghelgheli pm2 logs $APP_NAME"
