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
BACKUP_SCRIPT="${BACKUP_SCRIPT:-/usr/local/bin/ghelgheli-backup-latest.sh}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[ -d "$APP_DIR/.git" ] || die "$APP_DIR is not a git checkout"
cd "$APP_DIR"

PREVIOUS_SHA="$(git rev-parse HEAD)"
log "Current commit: $PREVIOUS_SHA"

if [ -x "$BACKUP_SCRIPT" ]; then
  log "Backing up database before deploying"
  "$BACKUP_SCRIPT" || echo "WARNING: backup failed, continuing anyway"
fi

log "Fetching origin/$BRANCH"
git fetch origin "$BRANCH"
# Hard reset instead of pull: the server used to accumulate local changes in
# the (previously tracked) userweb/dist, which made `git pull` fail with
# "local changes would be overwritten".
git reset --hard "origin/$BRANCH"
git clean -fd -e node_modules -e .env -e uploads -e dist
NEW_SHA="$(git rev-parse HEAD)"
log "Deploying commit: $NEW_SHA"

log "Installing backend dependencies"
cd "$APP_DIR/backend"
npm install --omit=dev --no-audit --no-fund

log "Running database migrations"
npm run migrate

log "Building admin panel"
cd "$APP_DIR/admin"
npm install --no-audit --no-fund
npm run build

log "Building user web app"
cd "$APP_DIR/userweb"
npm install --no-audit --no-fund
npm run build

log "Reloading API"
cd "$APP_DIR/backend"
if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 reload "$PM2_APP" --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

log "Waiting for API health check"
HEALTHY=0
for i in $(seq 1 20); do
  if curl -fsS -m 3 "$API_URL" >/dev/null 2>&1; then HEALTHY=1; break; fi
  sleep 1
done

if [ "$HEALTHY" -ne 1 ]; then
  log "Health check FAILED — rolling back to $PREVIOUS_SHA"
  git reset --hard "$PREVIOUS_SHA"
  cd "$APP_DIR/backend" && npm install --omit=dev --no-audit --no-fund
  pm2 reload "$PM2_APP" --update-env || pm2 start ecosystem.config.cjs
  die "Deploy rolled back. Check: pm2 logs $PM2_APP --err"
fi

log "Reloading nginx"
nginx -t && systemctl reload nginx

log "Deploy OK — $NEW_SHA is live"
curl -fsS -m 5 "$API_URL"; echo
