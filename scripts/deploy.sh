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

[ -x "$BACKUP_SCRIPT" ] || die "backup script is missing or not executable: $BACKUP_SCRIPT"
log "Backing up database before deploying"
"$BACKUP_SCRIPT" || die "pre-deploy backup failed; deployment aborted"

log "Fetching origin/$BRANCH"
git fetch origin "$BRANCH"
# Hard reset instead of pull: the server used to accumulate local changes in
# the (previously tracked) userweb/dist, which made `git pull` fail with
# "local changes would be overwritten".
git reset --hard "origin/$BRANCH"
git clean -fd -e node_modules -e .env -e uploads -e dist
NEW_SHA="$(git rev-parse HEAD)"
# release در health/crash inbox و build وب باید دقیقاً همان commit زنده باشد.
export APP_RELEASE="$NEW_SHA"
export GIT_SHA="$NEW_SHA"
log "Deploying commit: $NEW_SHA"

log "Installing backend dependencies"
cd "$APP_DIR/backend"
npm ci --omit=dev --no-audit --no-fund

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
npm run build

log "Building user web app"
cd "$APP_DIR/userweb"
npm ci --no-audit --no-fund
VITE_APP_RELEASE="$NEW_SHA" npm run build

log "Reloading API as unprivileged user $SERVICE_USER"
cd "$APP_DIR/backend"
# Root performs deploy/migrations, but the network-facing Node process must
# never inherit root. Preserve only the two runtime-writable locations.
chown "$SERVICE_USER:$SERVICE_USER" .env
chmod 600 .env
chown -R "$SERVICE_USER:$SERVICE_USER" uploads
find uploads -type d -exec chmod 750 {} +
find uploads -type f -exec chmod 640 {} +
if pm2_user describe "$PM2_APP" >/dev/null 2>&1; then
  pm2_user reload "$PM2_APP" --update-env
else
  pm2_user start ecosystem.config.cjs
fi
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
  pm2_user reload "$PM2_APP" --update-env || pm2_user start ecosystem.config.cjs
  pm2_user save
  die "Deploy rolled back. Check the $SERVICE_USER PM2 logs for $PM2_APP"
fi

log "Reloading nginx"
nginx -t && systemctl reload nginx

log "Deploy OK — $NEW_SHA is live"
curl -fsS -m 5 "$API_URL"; echo
