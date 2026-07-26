#!/usr/bin/env bash
#
# ONE-COMMAND full restore of GhelGheli onto a BLANK Ubuntu 24.04 server.
#
#   tar xzf ghelgheli_full_*.tar.gz
#   cd ghelgheli_full_*
#   bash restore.sh
#
# This script ships INSIDE every backup archive on purpose: a restore
# procedure that only exists on the server you just lost is not a procedure.
#
# It is idempotent — safe to re-run if it stops halfway.
#
set -Eeuo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-/var/www/GhelGheli}"
REPO="${REPO:-https://github.com/siliksama-creator/GhelGheli.git}"
DB_NAME="${DB_NAME:-ghelgheli}"
DB_USER="${DB_USER:-ghelgheli}"

BOLD=$'\e[1m'; GREEN=$'\e[1;32m'; CYAN=$'\e[1;36m'; RED=$'\e[1;31m'; YEL=$'\e[1;33m'; OFF=$'\e[0m'
step() { echo; echo "${CYAN}==> $*${OFF}"; }
ok()   { echo "${GREEN}  ✓ $*${OFF}"; }
warn() { echo "${YEL}  ! $*${OFF}"; }
die()  { echo "${RED}FATAL: $*${OFF}" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "این اسکریپت باید با کاربر root اجرا شود (sudo -i)"
[ -f "$HERE/MANIFEST.txt" ] || die "MANIFEST.txt پیدا نشد — داخل پوشه بازشده بکاپ اجرا کن"

echo "${BOLD}"
cat << 'BANNER'
   ____ _          _  ____ _          _ _
  / ___| |__   ___| |/ ___| |__   ___| (_)
 | |  _| '_ \ / _ \ | |  _| '_ \ / _ \ | |
 | |_| | | | |  __/ | |_| | | | |  __/ | |
  \____|_| |_|\___|_|\____|_| |_|\___|_|_|
              R E S T O R E
BANNER
echo "${OFF}"
grep -E '^(created_at|git_commit|db_size)' "$HERE/MANIFEST.txt" | sed 's/^/  /'
echo
read -rp "ادامه بدهم و سیستم را روی این سرور بازیابی کنم؟ [y/N] " a
[[ "$a" =~ ^[Yy]$ ]] || { echo "لغو شد."; exit 0; }

# ── 1. System packages ────────────────────────────────────────────────────
step "نصب بسته‌های سیستمی"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ufw nginx postgresql postgresql-contrib \
  certbot python3-certbot-nginx fail2ban unzip ca-certificates gnupg >/dev/null
ok "بسته‌های پایه نصب شدند"

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null
fi
ok "Node $(node -v)"

command -v pm2 >/dev/null 2>&1 || npm install -g pm2 >/dev/null 2>&1
ok "PM2 آماده"

# ── 2. Database role + database ───────────────────────────────────────────
step "ساخت دیتابیس و کاربر"
systemctl enable --now postgresql >/dev/null 2>&1 || true

if [ -f "$HERE/config/db_password" ]; then
  DB_PASS="$(cat "$HERE/config/db_password")"
  ok "رمز دیتابیس از بکاپ خوانده شد"
else
  DB_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
  warn "رمز دیتابیس در بکاپ نبود؛ یک رمز جدید ساخته شد"
fi
printf '%s' "$DB_PASS" > /root/.ghelgheli_db_pass
chmod 600 /root/.ghelgheli_db_pass

# Idempotent: create the role only if it is missing, always reset the password
# so it matches whatever the .env expects.
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 \
  || sudo -u postgres psql -qc "CREATE ROLE $DB_USER LOGIN" >/dev/null
sudo -u postgres psql -qc "ALTER ROLE $DB_USER WITH PASSWORD '$DB_PASS'" >/dev/null
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
  || sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
sudo -u postgres psql -qc "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER" >/dev/null
ok "دیتابیس $DB_NAME آماده است"

# ── 3. Application code ───────────────────────────────────────────────────
step "دریافت کد برنامه"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --all -q && git -C "$APP_DIR" reset --hard origin/main -q
  ok "مخزن موجود به‌روز شد"
else
  mkdir -p "$(dirname "$APP_DIR")"
  git clone -q "$REPO" "$APP_DIR" || die "clone نشد. اگر مخزن خصوصی است، کلید SSH را اول نصب کن."
  ok "کد از GitHub گرفته شد"
fi

# Pin to the exact commit the backup was taken from, so the schema in the
# dump and the code that reads it can never disagree.
COMMIT="$(grep '^git_commit' "$HERE/MANIFEST.txt" | awk '{print $3}')"
if [ -n "$COMMIT" ] && [ "$COMMIT" != "unknown" ]; then
  git -C "$APP_DIR" checkout -q "$COMMIT" 2>/dev/null \
    && ok "روی همان کامیت بکاپ (${COMMIT:0:7}) قفل شد" \
    || warn "کامیت ${COMMIT:0:7} پیدا نشد؛ روی آخرین نسخه main ماند"
fi

# ── 4. Secrets ────────────────────────────────────────────────────────────
step "بازگرداندن تنظیمات و کلیدها"
if [ -f "$HERE/config/backend.env" ]; then
  cp "$HERE/config/backend.env" "$APP_DIR/backend/.env"
  chmod 600 "$APP_DIR/backend/.env"
  ok ".env بکند بازگردانده شد"
else
  die "config/backend.env در بکاپ نیست — بدون آن برنامه بالا نمی‌آید"
fi
[ -f "$HERE/config/admin.env" ]   && cp "$HERE/config/admin.env"   "$APP_DIR/admin/.env"
[ -f "$HERE/config/userweb.env" ] && cp "$HERE/config/userweb.env" "$APP_DIR/userweb/.env"
for f in "$HERE"/config/*firebase*.json; do
  [ -e "$f" ] && cp "$f" "$APP_DIR/backend/" && ok "کلید Firebase بازگردانده شد"
done

if [ -d "$HERE/server/ssh" ]; then
  mkdir -p /root/.ssh && chmod 700 /root/.ssh
  cp "$HERE"/server/ssh/* /root/.ssh/ 2>/dev/null || true
  chmod 600 /root/.ssh/ghelgheli_deploy 2>/dev/null || true
  ok "کلید deploy گیت‌هاب بازگردانده شد"
fi

# ── 5. Dependencies ───────────────────────────────────────────────────────
step "نصب وابستگی‌ها (چند دقیقه طول می‌کشد)"
( cd "$APP_DIR/backend"  && npm ci --omit=dev >/dev/null 2>&1 ) && ok "backend"
( cd "$APP_DIR/admin"    && npm ci >/dev/null 2>&1 && npm run build >/dev/null 2>&1 ) && ok "admin ساخته شد"
( cd "$APP_DIR/userweb"  && npm ci >/dev/null 2>&1 && npm run build >/dev/null 2>&1 ) && ok "userweb ساخته شد"

# ── 6. Data ───────────────────────────────────────────────────────────────
step "بازگرداندن داده‌ها"
export PGPASSWORD="$DB_PASS"
# The dump was taken with --clean --if-exists, so this drops and recreates
# every object. Errors about objects that don't exist yet are expected and
# harmless on a fresh database.
psql -h localhost -U "$DB_USER" -d "$DB_NAME" -q -f "$HERE/db/ghelgheli.sql" \
  > /tmp/restore_db.log 2>&1 || warn "psql چند هشدار داد (روی دیتابیس خالی طبیعی است) — /tmp/restore_db.log"
ROWS=$(psql -h localhost -U "$DB_USER" -d "$DB_NAME" -tAc 'SELECT count(*) FROM users' 2>/dev/null || echo 0)
unset PGPASSWORD
[ "$ROWS" -gt 0 ] 2>/dev/null && ok "دیتابیس بازگردانده شد — $ROWS کاربر" || warn "جدول users خالی است؛ /tmp/restore_db.log را ببین"

if [ -d "$HERE/uploads" ]; then
  mkdir -p "$APP_DIR/backend/uploads"
  cp -a "$HERE/uploads/." "$APP_DIR/backend/uploads/"
  ok "$(find "$APP_DIR/backend/uploads" -type f | wc -l) فایل آپلودی بازگردانده شد"
fi

# Files that existed only on the old server (not in git, not in uploads).
if [ -d "$HERE/untracked" ]; then
  cp -a "$HERE/untracked/." "$APP_DIR/"
  ok "فایل‌های خارج از گیت بازگردانده شدند"
fi

# Sanity check: the data actually landed.
if [ -f "$HERE/db/TABLE_COUNTS.txt" ]; then
  echo "  ${BOLD}مقایسه با بکاپ:${OFF}"
  export PGPASSWORD="$DB_PASS"
  while read -r tbl expected; do
    [ -n "$tbl" ] || continue
    actual=$(psql -h localhost -U "$DB_USER" -d "$DB_NAME" -tAc \
      "SELECT count(*) FROM public.\"$tbl\"" 2>/dev/null || echo '?')
    if [ "$actual" = "$expected" ]; then
      [ "$expected" != "0" ] && printf '    ✓ %-30s %s\n' "$tbl" "$actual"
    else
      printf "${YEL}    ! %-30s انتظار %s، یافت %s${OFF}\n" "$tbl" "$expected" "$actual"
    fi
  done < "$HERE/db/TABLE_COUNTS.txt"
  unset PGPASSWORD
fi

# ── 7. Web server ─────────────────────────────────────────────────────────
step "پیکربندی nginx و SSL"
if [ -d "$HERE/server/nginx-sites" ]; then
  cp -a "$HERE/server/nginx-sites/." /etc/nginx/sites-available/
  for s in /etc/nginx/sites-available/*; do
    ln -sf "$s" "/etc/nginx/sites-enabled/$(basename "$s")"
  done
  rm -f /etc/nginx/sites-enabled/default
  ok "vhost بازگردانده شد"
fi
[ -d "$HERE/server/nginx-conf.d" ] && cp -a "$HERE/server/nginx-conf.d/." /etc/nginx/conf.d/
[ -f "$HERE/server/nginx.conf" ]   && cp "$HERE/server/nginx.conf" /etc/nginx/nginx.conf
[ -f "$HERE/server/99-ghelgheli.conf" ] && {
  cp "$HERE/server/99-ghelgheli.conf" /etc/sysctl.d/ && sysctl -p /etc/sysctl.d/99-ghelgheli.conf >/dev/null 2>&1
  ok "تنظیمات شبکه اعمال شد"
}

if [ -f "$HERE/server/letsencrypt.tar.gz" ]; then
  tar -xzf "$HERE/server/letsencrypt.tar.gz" -C /etc
  ok "گواهی‌های SSL بازگردانده شدند"
fi

if nginx -t >/dev/null 2>&1; then
  systemctl enable --now nginx >/dev/null 2>&1
  systemctl reload nginx
  ok "nginx بالا آمد"
else
  warn "پیکربندی nginx ایراد دارد — با «nginx -t» بررسی کن"
fi

# ── 8. Service ────────────────────────────────────────────────────────────
step "راه‌اندازی سرویس"
cd "$APP_DIR/backend"
pm2 delete ghelgheli-api >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs >/dev/null 2>&1 || pm2 start src/server.js --name ghelgheli-api >/dev/null 2>&1
pm2 save >/dev/null 2>&1
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
ok "API اجرا شد"

# ── 9. Scheduled jobs ─────────────────────────────────────────────────────
step "بازگرداندن زمان‌بندی بکاپ"
[ -d "$HERE/server/cron.d" ] && cp -a "$HERE/server/cron.d/." /etc/cron.d/ 2>/dev/null || true
[ -f "$HERE/server/root.crontab" ] && crontab "$HERE/server/root.crontab" 2>/dev/null || true
# Put the backup tooling back in place so the restored server keeps protecting
# itself — a restored box with no backups is a trap waiting to spring.
for s in backup_telegram.sh backup_latest.sh fetch_backup_from_telegram.sh; do
  [ -f "$APP_DIR/scripts/$s" ] && install -m 700 "$APP_DIR/scripts/$s" "/usr/local/bin/ghelgheli-${s%.sh}.sh"
done
[ -f "$APP_DIR/scripts/restore_from_backup.sh" ] && install -m 700 "$APP_DIR/scripts/restore_from_backup.sh" /usr/local/bin/ghelgheli-restore.sh
[ -f "$APP_DIR/scripts/fetch_backup_from_telegram.sh" ] && install -m 700 "$APP_DIR/scripts/fetch_backup_from_telegram.sh" /usr/local/bin/ghelgheli-fetch-backup.sh
[ -f "$HERE/config/telegram.conf" ] && { cp "$HERE/config/telegram.conf" /root/.ghelgheli_backup.conf; chmod 600 /root/.ghelgheli_backup.conf; }
if [ -f "$HERE/config/telegram_file_ids.tsv" ]; then
  mkdir -p /root/ghelgheli-backups
  cp "$HERE/config/telegram_file_ids.tsv" /root/ghelgheli-backups/file_ids.tsv
  chmod 600 /root/ghelgheli-backups/file_ids.tsv
fi
ok "ابزار بکاپ نصب شد"

# ── 10. Firewall ──────────────────────────────────────────────────────────
step "فایروال"
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 'Nginx Full' >/dev/null 2>&1 || true
ufw --force enable >/dev/null 2>&1 || true
systemctl enable --now fail2ban >/dev/null 2>&1 || true
ok "ufw و fail2ban فعال شدند"

# ── 11. Verify ────────────────────────────────────────────────────────────
step "بررسی نهایی"
sleep 4
HEALTH="$(curl -s --max-time 10 http://127.0.0.1:4000/health || echo '')"
echo
if echo "$HEALTH" | grep -q '"ok":true'; then
  echo "${GREEN}${BOLD}"
  echo "  ╔════════════════════════════════════════════╗"
  echo "  ║   ✓  بازیابی با موفقیت انجام شد            ║"
  echo "  ╚════════════════════════════════════════════╝"
  echo "${OFF}"
  echo "  کاربران بازگردانده‌شده : $ROWS"
  echo "  سلامت API              : $HEALTH"
  echo
  echo "${BOLD}کارهای باقی‌مانده روی سرور جدید:${OFF}"
  echo "  ۱. DNS دامنه‌ها را به IP این سرور ($(hostname -I | awk '{print $1}')) اشاره بده"
  echo "  ۲. بعد از پخش‌شدن DNS، اگر SSL کار نکرد:"
  echo "     certbot --nginx -d api.ghelghelishop.ir -d admin.ghelghelishop.ir \\"
  echo "             -d user.ghelghelishop.ir -d register.ghelghelishop.ir"
  echo "  ۳. یک بکاپ آزمایشی بگیر: ghelgheli-backup-telegram.sh --test"
else
  echo "${RED}${BOLD}  API بالا نیامد.${OFF}"
  echo "  لاگ را ببین: pm2 logs ghelgheli-api --err --lines 40"
  exit 1
fi
