#!/usr/bin/env bash
# ============================================================================
#  همراستاسازیِ مالکیتِ اشیاءِ دیتابیس با کاربرِ سرویس
# ============================================================================
#
#   scripts/db-ownership-fix.sh            # تعمیر (idempotent)
#   scripts/db-ownership-fix.sh --check    # فقط شمارش، بدون تغییر (خروجی ۰)
#
# ── چرا این فایل وجود دارد (حادثهٔ واقعی، ۱ مهر ۱۴۰۵) ───────────────────
#
# یک بازیابیِ اضطراری با کاربرِ `postgres` انجام شد و چند جدول را با
# مالکِ postgres ساخت (از جمله `app_crash_reports_archive_20261001`).
# بعد از آن، بکاپِ **پیش از دیپلوی** — که با کاربرِ `ghelgheli` گرفته
# می‌شود — با این خطا مرد:
#
#     pg_dump: error: query failed:
#       ERROR:  permission denied for table app_crash_reports_archive_20261001
#
# و چون deploy.sh هر شکستِ بکاپ را fatal می‌داند، پیام نهایی این بود:
#
#     ERROR: pre-deploy backup failed; deployment aborted
#
# یعنی **دو دیپلوی پشتِ سرِ هم لغو شد** و هیچ‌کس ربطش را به بازیابیِ آن
# روز نمی‌دید. ریشه این بود که «مالکیتِ اشیاء» یک حالتِ پنهانِ دیتابیس
# است که هیچ‌جا پایش نمی‌شد.
#
# ── قرارداد ─────────────────────────────────────────────────────────────
#
# هر شیءِ schema عمومی (جدول، پارتیشن، sequence، view، matview، جدولِ
# خارجی) که مالکش `$DB_OWNER` نیست، به او منتقل می‌شود. اشیائی که عضوِ یک
# extension هستند (deptype='e') دست‌نخورده می‌مانند، وگرنه مدیریتِ خودِ
# extension (مثلِ pg_stat_statements) می‌شکند.
#
# این اسکریپت idempotent است: اگر چیزی برای تعمیر نباشد، هیچ ALTERی اجرا
# نمی‌کند و فقط همان را گزارش می‌دهد. برای همین هم پیش از بکاپِ دیپلوی،
# هم در بکاپِ زمان‌بندی‌شده و هم پس از بازیابی صدا زده می‌شود — یک
# پیاده‌سازی، سه مصرف‌کننده (قبلاً قرار بود سه نسخهٔ تکراری از یک SQL
# داشته باشیم که خودش منبعِ باگ بعدی می‌شد).
#
# نیاز: اجرا با root (چون به کاربرِ postgres سوئیچ می‌کند).
set -Eeuo pipefail

DB_NAME="${DB_NAME:-ghelgheli}"
DB_OWNER="${DB_OWNER:-ghelgheli}"
MODE="${1:-fix}"

log() { printf '[db-ownership] %s\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  log "SKIP: باید با root اجرا شود (برای سوئیچ به کاربرِ postgres)"
  exit 0
fi
command -v runuser >/dev/null 2>&1 || { log "SKIP: runuser نیست"; exit 0; }
runuser -u postgres -- psql -Atq -d "$DB_NAME" -c 'SELECT 1' >/dev/null 2>&1 \
  || { log "SKIP: دسترسی به دیتابیسِ $DB_NAME با کاربرِ postgres ممکن نیست"; exit 0; }

# یک کوئری، همهٔ انواعِ شیء. نامِ نوع در CASE ساخته می‌شود تا هم %s برای
# نامِ نوع و هم %I برای شناسه‌های نقل‌قول‌شده کار کند (نامِ شیئی با حرفِ
# بزرگ یا فاصله، بدون %I کوئری را می‌شکند).
OWNER_SQL="$(runuser -u postgres -- psql -Atq -d "$DB_NAME" -c "
  SELECT format('ALTER %s %I.%I OWNER TO %I;',
                CASE c.relkind
                  WHEN 'S' THEN 'SEQUENCE'
                  WHEN 'v' THEN 'VIEW'
                  WHEN 'm' THEN 'MATERIALIZED VIEW'
                  WHEN 'f' THEN 'FOREIGN TABLE'
                  ELSE 'TABLE' END,
                n.nspname, c.relname, '$DB_OWNER')
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r','p','S','v','m','f')
    AND pg_get_userbyid(c.relowner) <> '$DB_OWNER'
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')")"

if [ -z "$OWNER_SQL" ]; then
  log "OK: همهٔ اشیاءِ schema عمومی مالکِ $DB_OWNER هستند — کاری نبود"
  exit 0
fi

COUNT="$(printf '%s\n' "$OWNER_SQL" | grep -c '^ALTER' || true)"
if [ "$MODE" = "--check" ]; then
  log "FOUND: $COUNT شیء مالکِ کسِ دیگری است (حالتِ --check چیزی را عوض نکرد)"
  exit 0
fi

log "FIX: انتقالِ مالکیتِ $COUNT شیء به $DB_OWNER"
printf '%s\n' "$OWNER_SQL" | runuser -u postgres -- psql -q -v ON_ERROR_STOP=1 -d "$DB_NAME" >/dev/null
log "DONE: مالکیت اصلاح شد"
