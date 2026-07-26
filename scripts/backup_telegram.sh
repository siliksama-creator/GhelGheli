#!/usr/bin/env bash
#
# Daily full backup → Telegram.
#
# WHY A NEW SCRIPT: backup_latest.sh only dumps the database and the uploads
# folder. Restoring from it onto a fresh VPS would still leave you without
# the .env (DB password, JWT_SECRET, Firebase keys), the nginx vhost, the SSL
# certificates or the cron entries — i.e. it is a DATA backup, not a DISASTER
# RECOVERY backup. This one captures everything needed to rebuild the whole
# system from nothing, and ships it off-server so losing the VPS is survivable.
#
# The archive is deliberately SMALL (~1 MB): node_modules, build output and
# logs are excluded because `npm ci` regenerates them exactly from the
# lockfile. Shipping 400 MB of node_modules daily would be pure waste.
#
# Usage:
#   ghelgheli-backup-telegram.sh          # normal daily run
#   ghelgheli-backup-telegram.sh --test   # run now and report loudly
#
set -Eeuo pipefail
# Without this a failure inside a pipeline (e.g. `pg_dump | gzip`) is hidden
# by the exit status of the LAST command, so a broken dump looked successful.
set -o pipefail

CONF="${CONF:-/root/.ghelgheli_backup.conf}"
APP_DIR="${APP_DIR:-/var/www/GhelGheli}"
WORK="${WORK:-/root/ghelgheli-backups}"
DB_NAME="${DB_NAME:-ghelgheli}"
DB_USER="${DB_USER:-ghelgheli}"
DB_HOST="${DB_HOST:-localhost}"
DB_PASS_FILE="${DB_PASS_FILE:-/root/.ghelgheli_db_pass}"
STATE="$WORK/.telegram_state"

TEST_MODE=0
[ "${1:-}" = "--test" ] && TEST_MODE=1

# ── Config ────────────────────────────────────────────────────────────────
if [ ! -f "$CONF" ]; then
  echo "FATAL: $CONF not found. Run setup_telegram_backup.sh first." >&2
  exit 1
fi
# shellcheck disable=SC1090
. "$CONF"
: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN missing from $CONF}"
: "${TELEGRAM_CHAT_ID:?TELEGRAM_CHAT_ID missing from $CONF}"

API="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}"
STAMP="$(date +%Y-%m-%d_%H%M)"
STAGE="$(mktemp -d /tmp/ggbak.XXXXXX)"
ARCHIVE="$WORK/ghelgheli_full_${STAMP}.tar.gz"

# Always clean up, even on failure — a half-built staging dir full of
# secrets must never be left behind in /tmp.
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

log() { echo "[$(date -Is)] $*"; }

# Telegram is the only alarm channel we have; if the backup itself fails,
# say so THERE rather than only in a log nobody reads.
notify_failure() {
  local msg="$1"
  curl -sS --max-time 30 -X POST "$API/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    -d "parse_mode=HTML" \
    --data-urlencode "text=❌ <b>بکاپ قل‌قلی ناموفق بود</b>%0A%0A<code>${msg}</code>%0A%0A🕒 $(date -Is)" \
    >/dev/null 2>&1 || true
}
# Two traps with distinct jobs:
#   ERR fires at the point of failure, so $LINENO is the line that ACTUALLY
#       broke (inside an EXIT trap it is the trap's own line — useless).
#   EXIT only cleans up, and must preserve the real exit code. The previous
#       single-trap version ended on a successful `cleanup`, so the script
#       reported SUCCESS after a failed dump — the worst possible lie for a
#       backup tool. Proven: a permission error exited 0.
on_error() {
  local rc=$? line=$1
  notify_failure "خط ${line} خطا داد (کد ${rc})"
  log "FAILED at line ${line} (exit ${rc})"
}
trap 'on_error $LINENO' ERR
trap 'rc=$?; cleanup; exit $rc' EXIT

mkdir -p "$WORK" && chmod 700 "$WORK"

# ── 1. Database ───────────────────────────────────────────────────────────
log "dumping database"
mkdir -p "$STAGE/db"

# DUMP AS THE POSTGRES SUPERUSER, NOT AS THE APP ROLE.
#
# This was a real, proven failure. The app role (`ghelgheli`) only owns the
# tables the migrations created under it. The moment ANY table appears with a
# different owner — a future migration run as postgres, a manual fix, an
# extension's table — pg_dump aborts with:
#     ERROR: permission denied for table <name>
# and the ENTIRE backup fails. Not partially: nothing gets sent.
#
# Reproduced deliberately: created one table as postgres, and that single
# table stopped the whole backup. In production that means the night a new
# feature ships, backups silently stop — and you find out the day you need
# one. The superuser can always read everything, so this can never recur.
#
# --clean --if-exists keeps the restore idempotent (safe on a database that
# already has tables). --no-owner --no-privileges lets the dump restore
# cleanly onto a fresh server where role names may differ.
if sudo -n -u postgres true 2>/dev/null; then
  sudo -u postgres pg_dump --clean --if-exists --no-owner --no-privileges \
    "$DB_NAME" > "$STAGE/db/ghelgheli.sql"
else
  # Fallback for environments without sudo access to the postgres account.
  log "WARNING: cannot sudo to postgres; dumping as $DB_USER (tables owned by"
  log "         another role will be MISSING). Fix with: ALTER TABLE ... OWNER TO $DB_USER"
  export PGPASSWORD="$(cat "$DB_PASS_FILE")"
  pg_dump -h "$DB_HOST" -U "$DB_USER" --clean --if-exists --no-owner --no-privileges \
    "$DB_NAME" > "$STAGE/db/ghelgheli.sql"
fi

# An empty or truncated dump is worse than no dump, because it looks like a
# success. Refuse anything implausibly small.
if [ ! -s "$STAGE/db/ghelgheli.sql" ] || [ "$(stat -c%s "$STAGE/db/ghelgheli.sql")" -lt 1000 ]; then
  notify_failure "دامپ دیتابیس خالی یا ناقص است. بکاپ ارسال نشد."
  log "FATAL: dump is empty or truncated"
  exit 1
fi
DB_BYTES=$(stat -c%s "$STAGE/db/ghelgheli.sql")

# COMPLETENESS GUARD.
# pg_dump takes the whole database, so any table added in the future (new
# leagues, new game modes, new reward types) is included automatically with
# no change here. But "automatically" is a claim worth PROVING on every run:
# a permission change or a --exclude-table slipping into the command would
# silently drop a table and nobody would notice until a restore.
# So: count the tables Postgres knows about, count the ones in the dump, and
# refuse to ship a backup that lost any of them.
LIVE_TABLES=$(sudo -u postgres psql -d "$DB_NAME" -tAc \
  "SELECT count(*) FROM information_schema.tables
   WHERE table_schema='public' AND table_type='BASE TABLE'" 2>/dev/null || echo 0)
DUMP_TABLES=$(grep -c '^CREATE TABLE public\.' "$STAGE/db/ghelgheli.sql" || echo 0)

if [ "$LIVE_TABLES" -gt 0 ] && [ "$DUMP_TABLES" -lt "$LIVE_TABLES" ]; then
  notify_failure "دامپ ناقص است: $DUMP_TABLES جدول از $LIVE_TABLES جدول دیتابیس. بکاپ ارسال نشد."
  log "FATAL: dump has $DUMP_TABLES of $LIVE_TABLES tables"
  exit 1
fi
log "database: $DUMP_TABLES/$LIVE_TABLES tables captured"

# Per-table row counts, stored in the archive. This turns "the backup ran"
# into "the backup contains 6 users and 2 card types" — the only way to spot
# a dump that succeeded but captured an empty database.
: > "$STAGE/db/TABLE_COUNTS.txt"
for t in $(sudo -u postgres psql -d "$DB_NAME" -tAc \
  "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"); do
  n=$(sudo -u postgres psql -d "$DB_NAME" -tAc "SELECT count(*) FROM public.\"$t\"" 2>/dev/null || echo '?')
  printf '%-34s %s\n' "$t" "$n" >> "$STAGE/db/TABLE_COUNTS.txt"
done

unset PGPASSWORD

# ── 2. Uploaded files ─────────────────────────────────────────────────────
log "collecting uploads"
if [ -d "$APP_DIR/backend/uploads" ]; then
  mkdir -p "$STAGE/uploads"
  cp -a "$APP_DIR/backend/uploads/." "$STAGE/uploads/" 2>/dev/null || true
fi

# ── 2b. Anything on disk that git does NOT track ──────────────────────────
# Static assets (avatars, logo, fonts, game art) live in git, so they come
# back with `git clone` and do not belong in a daily archive. But a file that
# is BOTH untracked and outside uploads/ exists only on this server — if we
# skip it, it is gone forever. This sweeps up any such stragglers so future
# features cannot quietly create an unbacked-up directory.
log "checking for untracked files"
if command -v git >/dev/null && [ -d "$APP_DIR/.git" ]; then
  STRAY=$(cd "$APP_DIR" && git status --porcelain --ignored 2>/dev/null \
    | grep '^!!' | cut -c4- \
    | grep -vE '^(node_modules/|.*/node_modules/|backend/uploads/|.*/dist/|.*/build/|.*\.log$|backend/\.env$|admin/\.env$|userweb/\.env$)' || true)
  if [ -n "$STRAY" ]; then
    mkdir -p "$STAGE/untracked"
    echo "$STRAY" | while read -r f; do
      [ -e "$APP_DIR/$f" ] || continue
      mkdir -p "$STAGE/untracked/$(dirname "$f")"
      cp -a "$APP_DIR/$f" "$STAGE/untracked/$f" 2>/dev/null || true
    done
    log "captured untracked: $(echo "$STRAY" | tr '\n' ' ')"
  fi
fi

# ── 3. Secrets & server configuration ─────────────────────────────────────
# This is the part the old backup was missing entirely. Without these files a
# "restore" gets you an app that cannot start.
log "collecting secrets and server config"
mkdir -p "$STAGE/config"
[ -f "$APP_DIR/backend/.env" ]   && cp "$APP_DIR/backend/.env"   "$STAGE/config/backend.env"
[ -f "$DB_PASS_FILE" ]           && cp "$DB_PASS_FILE"           "$STAGE/config/db_password"
[ -f "$APP_DIR/admin/.env" ]     && cp "$APP_DIR/admin/.env"     "$STAGE/config/admin.env"     2>/dev/null || true
[ -f "$APP_DIR/userweb/.env" ]   && cp "$APP_DIR/userweb/.env"   "$STAGE/config/userweb.env"   2>/dev/null || true
# Firebase service account, if one is present anywhere in backend/
find "$APP_DIR/backend" -maxdepth 2 -name '*firebase*.json' -not -path '*/node_modules/*' \
  -exec cp {} "$STAGE/config/" \; 2>/dev/null || true
# The Telegram credentials themselves. Without these a restored server would
# come up healthy but SILENTLY STOP BACKING ITSELF UP — the worst possible
# failure mode, because you'd only discover it the second time you needed a
# backup. restore.sh reads this file back into /root/.ghelgheli_backup.conf.
[ -f "$CONF" ] && cp "$CONF" "$STAGE/config/telegram.conf"
# Index of previous archives' Telegram file_ids, so a restored server can
# reach back to an OLDER backup (e.g. if the newest one contains a mistake
# you are trying to undo).
[ -f "$WORK/file_ids.tsv" ] && cp "$WORK/file_ids.tsv" "$STAGE/config/telegram_file_ids.tsv"

mkdir -p "$STAGE/server"
cp -a /etc/nginx/sites-available "$STAGE/server/nginx-sites" 2>/dev/null || true
cp /etc/nginx/nginx.conf "$STAGE/server/nginx.conf" 2>/dev/null || true
cp -a /etc/nginx/conf.d "$STAGE/server/nginx-conf.d" 2>/dev/null || true
cp -a /etc/cron.d "$STAGE/server/cron.d" 2>/dev/null || true
cp /etc/sysctl.d/99-ghelgheli.conf "$STAGE/server/" 2>/dev/null || true
crontab -l > "$STAGE/server/root.crontab" 2>/dev/null || true
pm2 save >/dev/null 2>&1 || true
cp /root/.pm2/dump.pm2 "$STAGE/server/pm2-dump.json" 2>/dev/null || true
# The SSH deploy key that lets the server pull from GitHub.
mkdir -p "$STAGE/server/ssh"
cp /root/.ssh/ghelgheli_deploy* "$STAGE/server/ssh/" 2>/dev/null || true

# Let's Encrypt. Certificates can simply be re-issued after a restore, but
# keeping them means the restored site is HTTPS immediately rather than after
# a DNS propagation + ACME round trip.
tar -czf "$STAGE/server/letsencrypt.tar.gz" -C /etc letsencrypt 2>/dev/null || true

# ── 4. Manifest — what this archive is and how to restore it ─────────────
GIT_COMMIT="$(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
cat > "$STAGE/MANIFEST.txt" << MANIFEST
GhelGheli full backup
=====================
created_at : $(date -Is)
hostname   : $(hostname)
git_commit : $GIT_COMMIT
db_size    : $DB_BYTES bytes (uncompressed SQL)
os         : $(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME")
node       : $(node -v 2>/dev/null || echo n/a)
postgres   : $(psql --version 2>/dev/null | head -1 || echo n/a)

CONTENTS
  db/ghelgheli.sql         full database dump (--clean --if-exists)
  db/TABLE_COUNTS.txt      row count per table, to verify the dump is not empty
  uploads/                 user-uploaded images
  config/backend.env       API secrets: DB password, JWT_SECRET, Firebase
  config/db_password       PostgreSQL password for the ghelgheli role
  server/nginx-*           vhost + tuning
  server/letsencrypt.tar.gz SSL certificates
  server/pm2-dump.json     PM2 process list
  server/root.crontab      scheduled jobs
  server/ssh/              GitHub read-only deploy key
  untracked/               any file on disk that git does not track
  restore.sh               ONE-COMMAND full restore

WHAT IS IN THE DATABASE DUMP
  Every table, always — pg_dump takes the whole database, so features added
  later are captured with no change to this script. Verified on each run by
  comparing the table count in the dump against the live database.

$(cat "$STAGE/db/TABLE_COUNTS.txt" 2>/dev/null | sed 's/^/  /')

NOT INCLUDED (regenerated, not lost)
  node_modules/  -> npm ci rebuilds it exactly from package-lock.json
  dist/ build/   -> rebuilt by scripts/deploy.sh
  logs           -> not needed to run the system

HOW TO RESTORE ON A BRAND-NEW SERVER
  1. Fresh Ubuntu 24.04, log in as root
  2. Download this .tar.gz from Telegram onto it
  3. tar xzf ghelgheli_full_*.tar.gz && cd ghelgheli_full_*
  4. bash restore.sh
  The script installs every dependency, recreates the database, restores the
  data, puts the secrets back and starts the service.
MANIFEST

# ── 5. The restore script travels INSIDE the archive ─────────────────────
# Deliberate: a restore script that lives only on the dead server is useless.
cp "$(dirname "$0")/restore_from_backup.sh" "$STAGE/restore.sh" 2>/dev/null \
  || cp /usr/local/bin/ghelgheli-restore.sh "$STAGE/restore.sh" 2>/dev/null \
  || echo "WARNING: restore script not found, archive will lack restore.sh" >&2
chmod +x "$STAGE/restore.sh" 2>/dev/null || true

# ── 6. Pack ───────────────────────────────────────────────────────────────
log "packing"
PACKDIR="ghelgheli_full_${STAMP}"
mv "$STAGE" "/tmp/$PACKDIR"
STAGE="/tmp/$PACKDIR"   # keep the trap pointing at the right place
tar -czf "$ARCHIVE" -C /tmp "$PACKDIR"
chmod 600 "$ARCHIVE"
SIZE_BYTES=$(stat -c%s "$ARCHIVE")
SIZE_H=$(du -h "$ARCHIVE" | cut -f1)
log "archive $ARCHIVE ($SIZE_H)"

# Telegram rejects documents over 50 MB from bots. We are ~1 MB, but if the
# uploads folder ever explodes we must fail LOUDLY rather than silently stop
# having off-site backups.
MAX=$((50 * 1024 * 1024))
if [ "$SIZE_BYTES" -gt "$MAX" ]; then
  notify_failure "حجم بکاپ ${SIZE_H} از سقف ۵۰MB تلگرام بیشتر شد. باید فایل‌های آپلودی جداگانه آرشیو شوند."
  log "FATAL: archive exceeds Telegram's 50MB bot limit"
  exit 1
fi

# ── 7. Send ───────────────────────────────────────────────────────────────
log "uploading to Telegram"
USERS=$(sudo -u postgres psql -d "$DB_NAME" -tAc 'SELECT count(*) FROM users' 2>/dev/null || echo '?')
CAPTION="✅ <b>بکاپ کامل قل‌قلی</b>
📅 $(date '+%Y-%m-%d  %H:%M')
📦 حجم: <b>${SIZE_H}</b>
👥 کاربران: <b>${USERS}</b>
🔖 کامیت: <code>${GIT_COMMIT:0:7}</code>

<i>برای بازیابی: فایل را روی سرور جدید باز کن و</i> <code>bash restore.sh</code> <i>را اجرا کن.</i>"

HTTP=$(curl -sS --max-time 300 -w '%{http_code}' -o /tmp/tg_resp.json \
  -F "chat_id=${TELEGRAM_CHAT_ID}" \
  -F "parse_mode=HTML" \
  -F "caption=${CAPTION}" \
  -F "document=@${ARCHIVE}" \
  "$API/sendDocument")

if [ "$HTTP" != "200" ] || ! grep -q '"ok":true' /tmp/tg_resp.json 2>/dev/null; then
  ERR=$(head -c 300 /tmp/tg_resp.json 2>/dev/null)
  notify_failure "ارسال فایل به تلگرام شکست خورد (HTTP $HTTP): $ERR"
  log "FATAL: Telegram upload failed: $HTTP $ERR"
  exit 1
fi

# Record the Telegram file_id. A bot cannot list its own sent messages, so
# without this the only way to fetch yesterday's archive is to open Telegram
# by hand. Storing the id means `ghelgheli-fetch-backup.sh` can pull the
# latest archive straight onto a brand-new server with one command.
FILE_ID=$(python3 -c "
import sys, json
try:
    print(json.load(open('/tmp/tg_resp.json'))['result']['document']['file_id'])
except Exception:
    pass
" 2>/dev/null || true)

if [ -n "$FILE_ID" ]; then
  printf '%s\t%s\t%s\n' "$(date -Is)" "$(basename "$ARCHIVE")" "$FILE_ID" >> "$WORK/file_ids.tsv"
  # Keep only the last 60 entries so the index cannot grow without bound.
  tail -60 "$WORK/file_ids.tsv" > "$WORK/file_ids.tsv.tmp" && mv "$WORK/file_ids.tsv.tmp" "$WORK/file_ids.tsv"
  chmod 600 "$WORK/file_ids.tsv"
  # Pin the newest id to the chat itself, so it survives losing the server:
  # a pinned message is the one thing you can always find in a busy chat.
  MSG_ID=$(python3 -c "
import json
try: print(json.load(open('/tmp/tg_resp.json'))['result']['message_id'])
except Exception: pass
" 2>/dev/null || true)
  if [ -n "$MSG_ID" ]; then
    curl -sS --max-time 20 -X POST "$API/unpinAllChatMessages" \
      -d "chat_id=${TELEGRAM_CHAT_ID}" >/dev/null 2>&1 || true
    curl -sS --max-time 20 -X POST "$API/pinChatMessage" \
      -d "chat_id=${TELEGRAM_CHAT_ID}" -d "message_id=${MSG_ID}" \
      -d "disable_notification=true" >/dev/null 2>&1 || true
  fi
fi

date -Is > "$STATE"
log "sent OK"

# ── 8. Local retention ────────────────────────────────────────────────────
# Keep a week locally as a fast rollback path; Telegram is the long-term copy.
find "$WORK" -name 'ghelgheli_full_*.tar.gz' -mtime +7 -delete 2>/dev/null || true

if [ "$TEST_MODE" = "1" ]; then
  echo
  echo "=========================================="
  echo " TEST OK — archive sent to Telegram"
  echo " size: $SIZE_H"
  echo " file: $ARCHIVE"
  echo "=========================================="
fi
