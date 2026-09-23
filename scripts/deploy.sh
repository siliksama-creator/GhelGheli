#!/usr/bin/env bash
#
# One-shot idempotent deploy for the GhelGheli VPS.
#
#   bash /var/www/GhelGheli/scripts/deploy.sh
#
# Replaces the ad-hoc "git pull && npm install && npm run build && pm2 restart"
# sequence that was being typed by hand (see root's bash history), which had
# no health check and no rollback: a bad commit took the API down silently.
#
# What it does:
#   1. Backs up the database first (so a bad migration is recoverable).
#   2. Pulls main, hard-syncing to origin so a dirty working tree on the
#      server can never block or half-apply a deploy.
#   3. Installs backend deps + runs pending migrations.
#   4. Rebuilds the admin panel and the user web app.
#   5. Reloads the API under PM2 and verifies /health, rolling back to the
#      previous commit automatically if the new build does not come up.
#
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/GhelGheli}"
BRANCH="${BRANCH:-main}"
API_URL="${API_URL:-http://127.0.0.1:4000/health}"
PM2_APP="${PM2_APP:-ghelgheli-api}"
SERVICE_USER="${SERVICE_USER:-ghelgheli}"
PM2_HOME="${PM2_HOME:-/home/$SERVICE_USER/.pm2}"
PM2_BIN="${PM2_BIN:-$(command -v pm2)}"
BACKUP_SCRIPT="${BACKUP_SCRIPT:-/usr/local/bin/ghelgheli-backup-latest.sh}"
DB_NAME="${DB_NAME:-ghelgheli}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }
pm2_user() {
  runuser -u "$SERVICE_USER" -- env \
    HOME="/home/$SERVICE_USER" USER="$SERVICE_USER" LOGNAME="$SERVICE_USER" \
    PM2_HOME="$PM2_HOME" \
    PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    "$PM2_BIN" "$@"
}

[ "$(id -u)" -eq 0 ] || die "deploy must run as root"
id "$SERVICE_USER" >/dev/null 2>&1 || die "service user $SERVICE_USER does not exist"
[ -d "$APP_DIR/.git" ] || die "$APP_DIR is not a git checkout"
cd "$APP_DIR"

PREVIOUS_SHA="$(git rev-parse HEAD)"
log "Current commit: $PREVIOUS_SHA"

# ── همراستاسازیِ مالکیتِ اشیاءِ دیتابیس پیش از بکاپ ───────────────────
#
# این گام پیش از بکاپ اجرا می‌شود و از یک اسکریپتِ جدا صدا زده می‌شود تا
# همین یک پیاده‌سازی در سه جا (دیپلوی، بکاپِ زمان‌بندی‌شده، پس از بازیابی)
# استفاده شود و سه نسخهٔ موازی از یک SQL نداشته باشیم.
#
# چرا لازم است (حادثهٔ واقعی، ۱ مهر ۱۴۰۵): یک بازیابی با کاربرِ postgres
# چند جدول را با مالکِ postgres گذاشت؛ بکاپِ پیش از دیپلوی با کاربرِ
# ghelgheli حقِ خواندنِ آن‌ها را نداشت، pg_dump شکست خورد و کلِ دیپلوی با
# «pre-deploy backup failed؛ deployment aborted» لغو شد — دو بار پشتِ سرِ
# هم. با این گام، مالکیت پیش از هر بکاپ خودترمیم می‌شود.
[ -x "$BACKUP_SCRIPT" ] || die "backup script is missing or not executable: $BACKUP_SCRIPT"
log "Fetching origin/$BRANCH"
git fetch origin "$BRANCH"
# Hard reset instead of pull: the server used to accumulate local changes in
# the (previously tracked) userweb/dist, which made `git pull` fail with
# "local changes would be overwritten".
git reset --hard "origin/$BRANCH"

# ترتیب مهم است: تازه بعد از reset، اسکریپتِ تازهٔ db-ownership-fix.sh روی
# دیسک هست. خودِ reset دیتابیس را لمس نمی‌کند (مایگریشن‌ها پایین‌ترند)، پس
# بکاپی که بعد از آن گرفته می‌شود، هنوز «دیتابیسِ پیش از این دیپلوی» است.
OWNERSHIP_FIX="$APP_DIR/scripts/db-ownership-fix.sh"
[ -x "$OWNERSHIP_FIX" ] || die "ownership fix script missing or not executable: $OWNERSHIP_FIX"
log "Aligning database object ownership"
"$OWNERSHIP_FIX"

[ -x "$BACKUP_SCRIPT" ] || die "backup script is missing or not executable: $BACKUP_SCRIPT"
log "Backing up database before deploying"
"$BACKUP_SCRIPT" || die "pre-deploy backup failed; deployment aborted"
# ⚠️ .env.staging فایل پیکربندیِ استیجینگِ دائمی است (تولید را لمس نمی‌کند)
# و مثلِ .env نباید با پاک‌سازیِ دیپلوی از بین برود، وگرنه اپِ استیجینگ بعد از
# دیپلویِ تولید به‌خاطر گم‌شدن env پایین نمی‌آید.
git clean -fd -e node_modules -e .env -e .env.staging -e uploads -e dist
NEW_SHA="$(git rev-parse HEAD)"
# release در health/crash inbox و build وب باید دقیقاً همان commit زنده باشد.
export APP_RELEASE="$NEW_SHA"
export GIT_SHA="$NEW_SHA"
log "Deploying commit: $NEW_SHA"

log "Installing backend dependencies"
cd "$APP_DIR/backend"
npm ci --omit=dev --no-audit --no-fund

log "Validating backend syntax"
node --check src/server.js || die "syntax error in backend/src/server.js"

log "Running database migrations"
npm run migrate

# ساختِ thumbnailهای گمشده قبل از reload. اسکریپت idempotent است و فقط
# تصاویر قدیمی‌ای را لمس می‌کند که نسخهٔ ۳۲۰/۴۸۰ ندارند؛ اولین کاربر نباید
# وسط انیمیشن هزینهٔ sharp را بدهد.
log "Prewarming card image thumbnails"
npm run thumbs:prewarm

log "Building admin panel"
cd "$APP_DIR/admin"
npm ci --no-audit --no-fund
# VITE_APP_RELEASE مثل userweb: کرش‌ریپورت‌های پنل باید به SHAی ریلیز بچسبند تا با
# سورس‌مپِ بایگانی‌شدهٔ همان ریلیز نگاشت شوند (قبلاً همیشه admin-web بود).
VITE_APP_RELEASE="$NEW_SHA" npm run build

log "Building user web app"
cd "$APP_DIR/userweb"
npm ci --no-audit --no-fund
VITE_APP_RELEASE="$NEW_SHA" npm run build

log "Archiving hidden sourcemaps (private - never served)"
# باندل‌ها hidden sourcemap دارند (.map بدون ارجاع در کد). آن‌ها را با شناسهٔ
# ریلیز بایگانیِ خصوصی می‌کنیم و از dist پاک می‌کنیم تا nginx هرگز سرویشان
# نکند؛ کرش‌ریپورت‌ها فیلد release دارند و با همین SHA نگاشت می‌شوند.
MAP_DIR="/root/ghelgheli-sourcemaps/$NEW_SHA"
mkdir -p "$MAP_DIR/admin" "$MAP_DIR/userweb"
chmod 700 /root/ghelgheli-sourcemaps "$MAP_DIR" "$MAP_DIR/admin" "$MAP_DIR/userweb"
for _app in admin userweb; do
  find "$APP_DIR/$_app/dist" -name '*.map' -exec mv {} "$MAP_DIR/$_app/" \; 
done
# نگه‌داشت: فقط ۱۰ ریلیزِ آخر (هر سری .map چند مگ است).
ls -1t /root/ghelgheli-sourcemaps | tail -n +11 | while read -r _old; do rm -rf "/root/ghelgheli-sourcemaps/$_old"; done || true

log "Reloading API as unprivileged user $SERVICE_USER"
cd "$APP_DIR/backend"
# Root performs deploy/migrations, but the network-facing Node process must
# never inherit root. Preserve only the two runtime-writable locations.
chown "$SERVICE_USER:$SERVICE_USER" .env
chmod 600 .env
chown -R "$SERVICE_USER:$SERVICE_USER" uploads
find uploads -type d -exec chmod 750 {} +
find uploads -type f -exec chmod 640 {} +
# Reload all apps defined in ecosystem.config.cjs (گره بازی + گره HTTP).
# قبلاً فقط $PM2_APP را reload می‌کرد؛ با افزوده‌شدنِ گره کمکیِ HTTP باید
# هر دو کد تازه را بگیرند. startOrReload اگر اپ نبود می‌سازد و اگر بود
# بدون‌داون‌تایم reload می‌کند.
pm2_user startOrReload ecosystem.config.cjs --update-env
pm2_user save

log "Waiting for API health check"
HEALTHY=0
for i in $(seq 1 20); do
  if curl -fsS -m 3 "$API_URL" >/dev/null 2>&1; then HEALTHY=1; break; fi
  sleep 1
done

if [ "$HEALTHY" -ne 1 ]; then
  log "Health check FAILED — rolling back to $PREVIOUS_SHA"
  git reset --hard "$PREVIOUS_SHA"
  cd "$APP_DIR/backend" && npm ci --omit=dev --no-audit --no-fund
  pm2_user startOrReload ecosystem.config.cjs --update-env
  pm2_user save
  die "Deploy rolled back. Check the $SERVICE_USER PM2 logs for $PM2_APP"
fi

log "Checking user session TTL (جلسهٔ همیشگی)"
# ⚠️ چرا این بررسی لازم است: خواستهٔ مالک «همیشگی» است و در *کد* پیش‌فرضِ
# توکنِ کاربر ۱۰ سال است — ولی سرور یک `.env` جدا دارد که همان مقدار را
# بازنویسی می‌کند. یک‌بار همین اتفاق افتاد (env روی ۳۰d مانده بود) و هیچ
# چیزی هم هشدار نداد. این بررسی آن حالت را پرصدا می‌کند.
ENV_FILE="$APP_DIR/backend/.env"
if [ -f "$ENV_FILE" ]; then
  TTL_VALUE=$(grep -E '^JWT_EXPIRES_IN=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'\'' ')
  TTL_DAYS=$(printf '%s' "$TTL_VALUE" | sed -n 's/^\([0-9]\+\)d$/\1/p')
  case "$TTL_VALUE" in
    "") : ;;   # خالی ⇒ پیش‌فرضِ کد (۱۰ سال) اعمال می‌شود
    *y) : ;;   # بر حسبِ سال ⇒ کوتاه نیست
    *) if [ -z "$TTL_DAYS" ] || [ "$TTL_DAYS" -lt 365 ]; then
         printf '  \033[1;33mهشدار: JWT_EXPIRES_IN=%s → جلسهٔ کاربران کوتاه است (درست: 3650d)\033[0m\n' "$TTL_VALUE" >&2
       fi ;;
  esac
fi

log "Installing nginx snippets (rate limit)"
# ═══════════════════════════════════════════════════════════════════════════
# سقفِ درخواستِ عمومی — خواستهٔ مالک (۲۶ شهریور): «۳۰ درخواست در ثانیه از هر
# آی‌پی؛ جلوی موجِ ربات‌ها را می‌گیرد و برای کاربرِ واقعی بی‌ضرر است.»
#
# دو اسنیپتِ ردیابی‌شده در مخزن به پوشهٔ snippets نصب می‌شوند:
#   • ghelgheli-ratelimit.conf          → تعریفِ zone (سطحِ http)
#   · ghelgheli-ratelimit-location.conf → خطِ limit_req (داخلِ location)
#
# نصب idempotent است: فقط اگر محتوا فرق کند کپی می‌شود، پس هر دیپلوی
# ساعتِ تغییرِ فایلِ nginx را بی‌دلیل عوض نمی‌کند.
RATELIMIT_SNIPPETS=(
  "deploy/ghelgheli-ratelimit.conf:ghelgheli-ratelimit.conf"
  "deploy/ghelgheli-ratelimit-location.conf:ghelgheli-ratelimit-location.conf"
  # بستنِ راهِ اسکنرها (۲۹ شهریور): اسکنرِ خودکار ۲۶۳ درخواست زد و چون
  # SPA هر مسیرِ ناشناس را با ۲۰۰ جواب می‌داد، همه «موفق» شمرده شد.
  # این اسنیپت مسیرهای نقطه‌دار و نشانه‌های CMS/PHP را ۴۰۴ می‌کند.
  "deploy/ghelgheli-scanner-block.conf:ghelgheli-scanner-block.conf"
  # سروِ APK از خودِ سرور (تصمیمِ مالک: بدونِ کافه‌بازار). همین اسنیپت
  # هم `/app/` را سرو می‌کند و هم برای `/api/admin/apk/upload` سقفِ
  # بدنه را به ۲۵۰ مگابایت می‌برد (سقفِ عمومیِ vhostها ۲۰ مگ است و
  # بدونِ آن، آپلودِ ۶۰ مگابایتی در خودِ nginx با ۴۱۳ می‌مرد).
  "deploy/ghelgheli-apk.conf:ghelgheli-apk.conf"
)
# ⚠️ باگِ واقعی که ۲۹ شهریور پیدا شد: مسیرِ مبدأ نسبی بود و در این نقطه از
# اسکریپت، cwd روی `$APP_DIR/backend` است — پس `[ -f deploy/... ]` هیچ‌وقت
# برقرار نمی‌شد و اسنیپت‌ها **بی‌صدا** نصب نمی‌شدند (سقفِ درخواست و بستنِ
# اسکنرها هر دو بی‌اثر می‌ماندند بدونِ یک کلمه هشدار). حالا مسیر از
# `$APP_DIR` ساخته می‌شود و نبودِ فایل هم صریح هشدار می‌دهد.
for pair in "${RATELIMIT_SNIPPETS[@]}"; do
  src="${APP_DIR}/${pair%%:*}"; dst="/etc/nginx/snippets/${pair##*:}"
  if [ ! -f "$src" ]; then
    printf '  \033[1;33mهشدار: فایلِ اسنیپت پیدا نشد: %s\033[0m\n' "$src" >&2
    continue
  fi
  if ! cmp -s "$src" "$dst"; then
    install -m 0644 "$src" "$dst"
    printf '  updated %s\n' "$dst"
  fi
done
# ⚠️ فایلِ کانفیگِ سایت روی سرور زندگی می‌کند (در مخزن نیست: بلوکِ upstream را
#    اسکریپتِ ظرفیت بازنویسی می‌کند). اگر include جا افتاده باشد، اسنیپت‌ها
#    نصب می‌شوند ولی کاری نمی‌کنند — پس صریح هشدار می‌دهیم، نه بی‌صدا.
if ! grep -q 'ghelgheli-ratelimit.conf' /etc/nginx/sites-enabled/ghelgheli 2>/dev/null; then
  printf '  \033[1;33mهشدار: include سقفِ درخواست در کانفیگِ nginx نیست — سقف اعمال نمی‌شود\033[0m\n' >&2
fi

# ── include اسنیپتِ ضدِاسکنر ────────────────────────────────────────────────
# فایلِ کانفیگِ سایت روی سرور زندگی می‌کند (در مخزن نیست) و certbot هم
# دستش به آن است؛ پس به‌جای «بازنویسیِ» فایل، فقط یک خط به آن اضافه می‌کنیم
# — آن هم اگر نبود. کارِ درج در `scripts/nginx-add-include.py` است (تست‌پذیر
# و اتمیک). ⚠️ بکاپ آن **بیرونِ** /etc/nginx می‌رود: نسخهٔ اول که بکاپ را
# داخلِ sites-enabled می‌گذاشت، باعثِ خطای `duplicate upstream` و شکستِ
# `nginx -t` شد (nginx همهٔ فایل‌های آن پوشه را می‌خواند).
ensure_scanner_include() {
  local file=/etc/nginx/sites-enabled/ghelgheli
  [ -f "$file" ] || return 0
  # include فقط وقتی معنا دارد که خودِ اسنیپت نصب شده باشد.
  if [ ! -f /etc/nginx/snippets/ghelgheli-scanner-block.conf ]; then
    printf '  \033[1;33mهشدار: اسنیپتِ ضدِاسکنر نصب نشده — include اضافه نشد\033[0m\n' >&2
    return 0
  fi
  if ! python3 "$APP_DIR/scripts/nginx-add-include.py" "$file" \
      "include /etc/nginx/snippets/ghelgheli-scanner-block.conf;"; then
    printf '  \033[1;33mهشدار: include ضدِاسکنر اضافه نشد (کانفیگ دست‌نخورده)\033[0m\n' >&2
  fi
}
if ! grep -q 'ghelgheli-scanner-block.conf' /etc/nginx/sites-enabled/ghelgheli 2>/dev/null; then
  log "Adding scanner-block include to nginx site config"
  ensure_scanner_include
fi

# ── زیرساختِ سروِ APK ─────────────────────────────────────────────────────
#
# سه کار، همه idempotent:
#   ۱. پوشهٔ نگه‌داری (بیرونِ APP_DIR تا `git clean` پاکش نکند).
#   ۲. درجِ include اسنیپت در vhostهایی که باید /app/ را سرو کنند. فایلِ
#      vhost در گیت نیست (certbot آن را می‌سازد/عوض می‌کند) پس هر بار
#      بررسی و در صورت نبود درج می‌شود؛ اگر `nginx -t` رد کند، فایل
#      **بازگردانده می‌شود** و دیپلوی ادامه می‌دهد (سروِ اپ نباید بیلدِ وب
#      را بخواباند).
APK_DIR="${APK_DIR:-/var/www/ghelgheli-apk}"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 755 "$APK_DIR"
log "APK hosting directory ready: $APK_DIR"
ensure_apk_include() {
  python3 - "$1" "$2" <<'PYEOF'
import sys, re, shutil, datetime, subprocess
vhost, anchor = sys.argv[1], sys.argv[2]
try:
    src = open(vhost, encoding='utf-8').read()
except FileNotFoundError:
    sys.exit(0)
lines = src.splitlines(True)
hits = [i for i, l in enumerate(lines) if anchor in l and 'server_name' in l]
if not hits:
    sys.exit(0)
start = hits[0]
end = len(lines)
for j in range(start + 1, len(lines)):
    if re.match(r'^\s*server\s*\{', lines[j]):
        end = j
        break
if 'ghelgheli-apk.conf' in ''.join(lines[start:end]):
    sys.exit(0)
inc = '  include /etc/nginx/snippets/ghelgheli-apk.conf;\n'
backup = vhost + '.bak.' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
shutil.copy2(vhost, backup)
open(vhost, 'w', encoding='utf-8').write(''.join(lines[:start + 1] + [inc] + lines[start + 1:]))
if subprocess.run(['nginx', '-t'], capture_output=True).returncode != 0:
    shutil.copy2(backup, vhost)
    print('  ⚠️ nginx -t بعد از درجِ include رد شد — فایل بازگردانده شد: ' + vhost)
    sys.exit(0)
print('  ✅ include به ' + vhost + ' اضافه شد (' + anchor + ')')
PYEOF
}
NGINX_MAIN=/etc/nginx/sites-enabled/ghelgheli
if [ -f "$NGINX_MAIN" ]; then
  ensure_apk_include "$NGINX_MAIN" 'server_name api.ghelghelishop'
  ensure_apk_include "$NGINX_MAIN" 'server_name admin.ghelghelishop'
  ensure_apk_include "$NGINX_MAIN" 'server_name register.ghelghelishop'
fi

log "Reloading nginx"
nginx -t && systemctl reload nginx

# ── نگهبانِ سلامتِ سرور ────────────────────────────────────────────────────
# monitor/health.sh هر ۳۰ ثانیه با systemd اجرا می‌شود و گره‌های API، دیسک و
# رم را می‌پاید. یک‌بار نسخهٔ بیرونِ گیتِ همین فایل با `git clean` در دیپلوی
# پاک شد و سرویس بی‌صدا از کار افتاد؛ حالا فایل ردیابی‌شده است، ولی این‌جا هم
# یک‌بار وضعیتش را گزارش می‌دهیم تا اگر روزی جابه‌جا/غیرفعال شد، همان لحظه
# در لاگِ دیپلوی پیدا باشد (بدونِ شکستنِ انتشار).
if [ -x "$APP_DIR/monitor/health.sh" ] && systemctl is-active --quiet ghelgheli-health.timer; then
  echo "monitor: ✅ نگهبانِ سلامتِ ۳۰ثانیه‌ای فعال است"
else
  echo "monitor: ⚠️ نگهبانِ سلامتِ ۳۰ثانیه‌ای فعال نیست — monitor/health.sh و ghelgheli-health.timer را ببینید" >&2
fi

# کرون بکاپ تلگرام از /usr/local/bin می‌خواند، نه از مخزن. اگر این کپی
# نباشد، اصلاح اسکریپت با دپلوی به سرور نمی‌رسد و آرشیو دیشب همان شکاف
# قدیمی را تکرار می‌کند.
log "Installing backup tooling"
for pair in \
  "backup_telegram.sh:ghelgheli-backup-telegram.sh" \
  "restore_from_backup.sh:ghelgheli-restore.sh" \
  "verify_backup.sh:ghelgheli-verify-backup.sh"
do
  src="$APP_DIR/scripts/${pair%%:*}"; dst="/usr/local/bin/${pair##*:}"
  if [ -f "$src" ]; then
    install -m 700 "$src" "$dst"
  fi
done

log "Deploy OK — $NEW_SHA is live"
curl -fsS -m 5 "$API_URL"; echo
