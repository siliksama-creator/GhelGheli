#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# تستِ سرتاسریِ «چند ماموریتِ اختصاصی» روی دیتابیسِ دورریختنیِ سرور
# ═══════════════════════════════════════════════════════════════════════════
# چرا دیتابیسِ جدا: مسیرِ دریافتِ امتیاز، پول است. این تست باید با کاربرِ
# واقعی و امتیازِ واقعی اجرا شود، ولی **نه** روی دادهٔ کاربران. پس یک
# دیتابیسِ تازه ساخته می‌شود، مایگریشن می‌خورد، سرور روی پورتِ ۴۹۹۹ بالا
# می‌آید، تست اجرا می‌شود و در پایان دیتابیس حذف می‌شود.
set -uo pipefail

APP=/var/www/GhelGheli/backend
DB="ggmm_test_$(date +%s)"
cd "$APP" || exit 1

# مسیرِ اسکریپتِ تست نسبت به ریشهٔ مخزن (این فایل داخلِ backend/scripts/ است)
FLOW="/var/www/GhelGheli/backend/scripts/e2eMultiMission.mjs"
[ -f "$FLOW" ] || FLOW="$(cd "$(dirname "$0")" && pwd)/e2eMultiMission.mjs"

# محیطِ واقعیِ سرور (رمزِ دیتابیس، کلیدِ JWT، کلیدِ رمزنگاریِ فیلدها)
set -a
# shellcheck disable=SC1091
. ./.env
set +a

TDB=$(printf '%s' "$DATABASE_URL" | sed "s#/[^/?]*\($\|?\)#/${DB}\1#")
if [ "$TDB" = "$DATABASE_URL" ]; then echo "✗ ساختِ URLِ دیتابیسِ تست ناموفق"; exit 1; fi

MASK='s#(://[^:]+:)[^@]*@#\1***@#g'
echo "db=$DB"
su postgres -c "createdb -O ghelgheli $DB" || exit 1

export DATABASE_URL="$TDB" PORT=4999 NODE_ENV=test
export ALLOW_PASSWORD_REGISTRATION=true OTP_DEV_MODE=true
export ADMIN_DEFAULT_USERNAME="${MAIN_ADMIN_USERNAME:-${ADMIN_DEFAULT_USERNAME:-Admin}}"
export ADMIN_DEFAULT_PASSWORD="${MAIN_ADMIN_PASSWORD:-${ADMIN_DEFAULT_PASSWORD:-CiTestOnly@2026}}"

echo "--- migrate ---"
if ! npm run migrate >/tmp/ggmm-migrate.log 2>&1; then
  echo "✗ migrate"; tail -8 /tmp/ggmm-migrate.log | sed -E "$MASK"; su postgres -c "dropdb --if-exists $DB"; exit 1
fi

echo "--- seed:admin ---"
if ! npm run seed:admin >/tmp/ggmm-seed.log 2>&1; then
  echo "✗ seed"; tail -8 /tmp/ggmm-seed.log | sed -E "$MASK"; su postgres -c "dropdb --if-exists $DB"; exit 1
fi

echo "--- boot (port 4999) ---"
nohup node src/server.js >/tmp/ggmm-server.log 2>&1 &
API=$!
for _ in $(seq 1 45); do
  curl -fsS http://127.0.0.1:4999/health >/dev/null 2>&1 && break
  sleep 1
done
if ! curl -fsS http://127.0.0.1:4999/health >/dev/null 2>&1; then
  echo "✗ سرور بالا نیامد"; tail -25 /tmp/ggmm-server.log | sed -E "$MASK"
  kill "$API" 2>/dev/null; su postgres -c "dropdb --if-exists $DB"; exit 1
fi
echo "api up"

BASE=http://127.0.0.1:4999 \
GG_ADMIN_USER="$ADMIN_DEFAULT_USERNAME" GG_ADMIN_PASS="$ADMIN_DEFAULT_PASSWORD" \
node backend/scripts/e2eMultiMission.mjs
CODE=$?

kill "$API" 2>/dev/null
sleep 1
su postgres -c "dropdb --if-exists $DB"
echo "── flow exit=$CODE (دیتابیسِ تست حذف شد)"
exit $CODE
