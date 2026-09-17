#!/usr/bin/env bash
#
# ═══════════════════════════════════════════════════════════════════════════
#  ghelgheli-capacity-apply  —  «سرور ارتقا داده شد؟ خودم می‌فهمم»
# ═══════════════════════════════════════════════════════════════════════════
#
# این اسکریپت را یک تایمرِ systemd روزی یک‌بار و بلافاصله بعد از هر بوت اجرا
# می‌کند. کارش:
#
#   ۱) سخت‌افزار را می‌خواند (هسته/رم) و پروفایلِ ظرفیت را می‌سازد
#      → backend/src/lib/capacity.js  (تنها منبعِ حقیقت)
#   ۲) با پروفایلِ ذخیره‌شده مقایسه می‌کند (backend/.capacity-state.json)
#   ۳) اگر عوض شده باشد — یعنی سرور ارتقا/تنزل داده شده — **خودش**:
#        • PM2 را با تعدادِ پروسهٔ جدید بالا می‌آورد (نسخهٔ اضافی را حذف
#          می‌کند، نسخهٔ تازه را اضافه می‌کند)
#        • فایلِ upstreamِ nginx را بازمی‌نویسد و nginx را reload می‌کند
#        • لیستِ پورت‌ها را برای اسکریپتِ سلامت به‌روز می‌کند
#        • در تلگرام پیام می‌دهد: از چه به چه تغییر کرد
#   ۴) اگر عوض نشده باشد، ساکت بیرون می‌آید (فقط یک خط لاگ)
#
# هیچ‌جای این مسیر نیاز به دستِ انسان ندارد. روی سرورِ ۲ هسته‌ای، اولین اجرا
# دقیقاً همان چیدمانِ امروز را تأیید می‌کند و هیچ ری‌استارتی نمی‌زند.
#
# ═══════════════════════════════════════════════════════════════════════════
#  چرا این کار بی‌خطر است
# ═══════════════════════════════════════════════════════════════════════════
#   • قبل از دست‌زدن به nginx، فایلِ جدید آزمایش می‌شود (`nginx -t`)؛ اگر
#     خراب باشد، نسخهٔ قبلی **بازگردانده** می‌شود و هیچ چیزی عوض نمی‌شود.
#   • upstream فقط پورت‌هایی را می‌گیرد که واقعاً بالا آمده و /health آن‌ها
#     جواب داده است؛ پس تا وقتی گرهٔ جدید سالم نشده، ترافیک به آن نمی‌رود.
#   • قفلِ flock مانع اجرای هم‌زمانِ دو نسخه می‌شود.
#   • تنزل هم مدیریت می‌شود (اگر سرور کوچک‌تر شد، گره‌های اضافه حذف می‌شوند).
#
# اجرای دستی:
#   ghelgheli-capacity-apply.sh            # فقط اگر تغییر باشد اعمال می‌کند
#   ghelgheli-capacity-apply.sh --force    # حتی بدون تغییر: بازچینی کامل
#   ghelgheli-capacity-apply.sh --dry-run  # فقط می‌گوید چه می‌کرد
#
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/GhelGheli}"
BACKEND="$APP_DIR/backend"
SERVICE_USER="${SERVICE_USER:-ghelgheli}"
PM2_HOME="${PM2_HOME:-/home/$SERVICE_USER/.pm2}"
PM2_BIN="${PM2_BIN:-/usr/lib/node_modules/pm2/bin/pm2}"
[ -x "$PM2_BIN" ] || PM2_BIN="$(command -v pm2)"
NODE_BIN="${NODE_BIN:-$(command -v node)}"

STATE="$BACKEND/.capacity-state.json"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-enabled/ghelgheli}"
NGINX_SNIPPET="${NGINX_SNIPPET:-/etc/nginx/snippets/ghelgheli-upstream.conf}"
PORTS_FILE="${PORTS_FILE:-/etc/ghelgheli-capacity-ports}"
HEALTH_SH="${HEALTH_SH:-$APP_DIR/monitor/health.sh}"
LOG_FILE="${LOG_FILE:-/var/log/ghelgheli-capacity.log}"
TG_CONF="${TG_CONF:-/root/.ghelgheli_backup.conf}"
TG_CONF_ALT="${TG_CONF_ALT:-$APP_DIR/monitor/telegram.env}"
LOCK_FILE="${LOCK_FILE:-/var/lock/ghelgheli-capacity.lock}"

MODE="apply"
for a in "$@"; do
  case "$a" in
    --force)   MODE="force" ;;
    --dry-run) MODE="dry" ;;
    *) echo "استفاده: $0 [--force|--dry-run]" >&2; exit 2 ;;
  esac
done

log()  { printf '[%s] %s\n' "$(date -Is)" "$*" | tee -a "$LOG_FILE"; }
die()  { log "❌ خطا: $*"; notify "❌ <b>تنظیم ظرفیت ناموفق بود</b>%0A<code>$*</code>"; exit 1; }

# تلگرام: همان کانفیگِ بکاپ (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID).
# اگر آن نبود، از کانفیگِ مانیتور استفاده می‌کنیم (BOT_TOKEN / CHAT_ID).
notify() {
  local text="$1" token="" chat=""
  if [ -r "$TG_CONF" ]; then
    # shellcheck disable=SC1090
    set +u; . "$TG_CONF" 2>/dev/null || true; set -u
    token="${TELEGRAM_BOT_TOKEN:-}"; chat="${TELEGRAM_CHAT_ID:-}"
  fi
  if [ -z "$token" ] && [ -r "$TG_CONF_ALT" ]; then
    set +u; . "$TG_CONF_ALT" 2>/dev/null || true; set -u
    token="${BOT_TOKEN:-}"; chat="${CHAT_ID:-}"
  fi
  [ -z "$token" ] && { log "ℹ️ کانفیگِ تلگرام پیدا نشد؛ پیام ارسال نشد"; return 0; }
  local IFS=',' id
  for id in $chat; do
    id="$(echo "$id" | xargs)"
    [ -z "$id" ] && continue
    curl -sS --max-time 20 -X POST "https://api.telegram.org/bot${token}/sendMessage" \
      -d "chat_id=${id}" -d "parse_mode=HTML" \
      --data-urlencode "text=${text}" >/dev/null 2>&1 || true
  done
}

# PM2 با کاربرِ سرویس، دقیقاً مثلِ scripts/deploy.sh
pm2_user() {
  runuser -u "$SERVICE_USER" -- env \
    HOME="/home/$SERVICE_USER" USER="$SERVICE_USER" LOGNAME="$SERVICE_USER" \
    PM2_HOME="$PM2_HOME" \
    PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    "$PM2_BIN" "$@"
}

# ── ۰) قفلِ تک‌اجرایی ─────────────────────────────────────────────────────
exec 9>"$LOCK_FILE"
flock -n 9 || { log "دستِ دیگری همین حالا اجرا می‌شود؛ رد شد"; exit 0; }

[ -f "$BACKEND/src/lib/capacity.js" ] || die "capacity.js پیدا نشد ($BACKEND/src/lib/capacity.js)"

# ── ۱) پروفایلِ تازه از سخت‌افزارِ واقعی ──────────────────────────────────
# capacity.js عمداً هیچ وابستگی‌ای ندارد (فقط ماژول os) تا همین‌جا با کاربرِ
# root و بدون نصب چیزی اجرا شود.
# نکته: CAPACITY_FORCE_CORES هرگز نباید روی سرور ست شود — اگر ست بود،
# تشخیصِ واقعی بی‌اثر می‌شود؛ پس در این اسکریپت پاکش می‌کنیم.
NEW_JSON="$(env -u CAPACITY_FORCE_CORES -u VISION_CONCURRENCY -u CAPACITY_HTTP \
  "$NODE_BIN" "$BACKEND/src/lib/capacity.js" --json)" || die "اجرای capacity.js شکست خورد"

NEW_CORES="$(jq -r '.cores' <<<"$NEW_JSON")"
NEW_MEM="$(jq -r '.memTotalMB' <<<"$NEW_JSON")"
NEW_PROCS="$(jq -r '.procs' <<<"$NEW_JSON")"
NEW_VISION="$(jq -r '.vision' <<<"$NEW_JSON")"
NEW_UV="$(jq -r '.uv' <<<"$NEW_JSON")"
NEW_POOL="$(jq -r '.poolMax' <<<"$NEW_JSON")"
NEW_PORTS="$(jq -r '.ports|join(" ")' <<<"$NEW_JSON")"
NEW_NAMES="$(jq -r '.names|join(" ")' <<<"$NEW_JSON")"

# ── ۲) مقایسه با وضعیتِ ذخیره‌شده ─────────────────────────────────────────
OLD_CORES=""; OLD_PROCS=""; OLD_PORTS=""; OLD_VISION=""
if [ -f "$STATE" ]; then
  OLD_CORES="$(jq -r '.cores // empty' "$STATE" 2>/dev/null || true)"
  OLD_PROCS="$(jq -r '.procs // empty' "$STATE" 2>/dev/null || true)"
  OLD_PORTS="$(jq -r '.ports|join(" ")' "$STATE" 2>/dev/null || true)"
  OLD_VISION="$(jq -r '.vision // empty' "$STATE" 2>/dev/null || true)"
fi

CURRENT_PORTS="$(pm2_user jlist 2>/dev/null | jq -r '[.[] | .pm2_env.PORT | select(.!=null)] | sort | join(" ")' 2>/dev/null || true)"
CURRENT_NODES="$(pm2_user jlist 2>/dev/null | jq -r '[.[] | select(.name|startswith("ghelgheli-api")) | .name] | length' 2>/dev/null || echo 0)"

CHANGED=0
[ "$OLD_CORES" != "$NEW_CORES" ] && CHANGED=1
[ "$OLD_PORTS" != "$NEW_PORTS" ] && CHANGED=1
[ "$CURRENT_NODES" != "$NEW_PROCS" ] && CHANGED=1
[ "$(tr -d ' ' <<<"$CURRENT_PORTS")" != "$(tr -d ' ' <<<"$NEW_PORTS")" ] && CHANGED=1
grep -q 'ghelgheli_http' "$NGINX_SNIPPET" 2>/dev/null || CHANGED=1   # اولین اجرا: مهاجرت به snippet

if [ "$MODE" = "dry" ]; then
  log "🔎 حالتِ آزمایشی — تشخیص: هسته=$NEW_CORES رم=${NEW_MEM}MB پروسه=$NEW_PROCS پورت‌ها=[$NEW_PORTS]"
  log "🔎 ذخیره‌شده: هسته=${OLD_CORES:--} پروسه=${OLD_PROCS:--} پورت‌ها=[${OLD_PORTS:--}] | الان روی PM2: ${CURRENT_NODES} گره"
  [ "$CHANGED" = "1" ] && log "🔎 نتیجه: تغییر لازم است (با --force یا بدون فلگ اعمال می‌شود)" \
                       || log "🔎 نتیجه: همه‌چیز هم‌خوان است؛ کاری لازم نیست"
  exit 0
fi

if [ "$CHANGED" = "0" ] && [ "$MODE" != "force" ]; then
  # ضربانِ روزانه: می‌گوید نگاه کردم و همه‌چیز هم‌خوان بود.
  log "✅ بدون تغییر — هسته=$NEW_CORES رم=${NEW_MEM}MB گره‌ها=$NEW_PROCS (سقفِ کارِ سنگین=$NEW_VISION)"
  exit 0
fi

if [ "$MODE" = "force" ] && [ "$CHANGED" = "0" ]; then
  log "🔁 اجرای اجباری (بدون تغییرِ سخت‌افزار) — بازچینیِ کامل"
fi

log "⚙️ تغییر تشخیص داده شد → هسته: ${OLD_CORES:--} → $NEW_CORES | پروسه: ${OLD_PROCS:--} → $NEW_PROCS | پورت‌ها: [${OLD_PORTS:--}] → [$NEW_PORTS]"

# ═══════════════════════════════════════════════════════════════════════════
#  ۳) بالا آوردن PM2 با پروفایلِ جدید
# ═══════════════════════════════════════════════════════════════════════════
# ecosystem.config.cjs خودش capacity.js را صدا می‌زند، پس شمارِ گره‌ها،
# UV_THREADPOOL_SIZE، PG_POOL_MAX و سقف‌های حافظه خودکار درست می‌شوند.
log "🚀 pm2 startOrReload با پروفایلِ جدید…"
( cd "$BACKEND" && pm2_user startOrReload ecosystem.config.cjs --update-env ) >>"$LOG_FILE" 2>&1 \
  || die "pm2 startOrReload شکست خورد"
pm2_user save >/dev/null 2>&1 || true

# ── ۴) انتظار برای سالم‌شدنِ همهٔ پورت‌ها (فقط سالم‌ها به nginx می‌روند) ──
HEALTHY_PORTS=""
for i in $(seq 1 30); do
  HEALTHY_PORTS=""
  for p in $NEW_PORTS; do
    if curl -sf --max-time 3 "http://127.0.0.1:${p}/health" 2>/dev/null | grep -q '"ok":true'; then
      HEALTHY_PORTS="$HEALTHY_PORTS $p"
    fi
  done
  HEALTHY_PORTS="$(echo "$HEALTHY_PORTS" | xargs)"
  [ "$(wc -w <<<"$HEALTHY_PORTS")" = "$(wc -w <<<"$NEW_PORTS")" ] && break
  sleep 2
done

if [ -z "$HEALTHY_PORTS" ]; then
  die "هیچ پورتی بعد از ری‌استارت جواب نداد — nginx دست‌نخورده ماند (نیاز به بررسیِ دستی)"
fi

# پورت‌هایی که **الان** در nginx ثبت‌اند (تا بفهمیم ناقص‌بودنِ گره‌ها خطرناک است یا نه)
CUR_UPSTREAM_PORTS="$(grep -oE '127\.0\.0\.1:[0-9]+' "$NGINX_SNIPPET" 2>/dev/null | cut -d: -f2 | sort -u | tr '\n' ' ' || true)"

ALL_HEALTHY=1
[ "$(wc -w <<<"$HEALTHY_PORTS")" = "$(wc -w <<<"$NEW_PORTS")" ] || ALL_HEALTHY=0

DEAD_REFERENCED=0
for p in $CUR_UPSTREAM_PORTS; do
  grep -qw "$p" <<<"$HEALTHY_PORTS" || DEAD_REFERENCED=1
done

if [ "$ALL_HEALTHY" = "0" ]; then
  if [ "$DEAD_REFERENCED" = "0" ]; then
    # همهٔ گره‌های ثبت‌شده در nginx سالم‌اند؛ فقط گره‌های تازه بالا نیامده‌اند.
    # دست نمی‌زنیم (سایت سالم است) و وضعیت را ذخیره نمی‌کنیم تا اجرای بعدی
    # همین کار را از نو امتحان کند.
    log "⚠️ فقط ${HEALTHY_PORTS:-هیچ} از [${NEW_PORTS}] سالم شد؛ nginx دست‌نخورده ماند و وضعیت ذخیره نشد (تلاشِ بعدی روزِ بعد)."
    notify "⚠️ <b>قل‌قلی — گره‌های تازه بالا نیامدند</b>
سالم: <code>${HEALTHY_PORTS:-هیچ}</code>
انتظار: <code>${NEW_PORTS}</code>
nginx دست‌نخورده ماند (سایت کار می‌کند). اجرای بعدی خودکار دوباره تلاش می‌کند.
🕒 $(date -Is)"
    exit 0
  fi
  log "⚠️ بعضی پورت‌های ثبت‌شده در nginx مرده‌اند؛ upstream فقط با پورت‌های سالم بازنویسی می‌شود: $HEALTHY_PORTS"
fi

# ═══════════════════════════════════════════════════════════════════════════
#  ۶) upstreamِ nginx — با نسخهٔ آزمایشی و بازگشتِ خودکار
# ═══════════════════════════════════════════════════════════════════════════
#
# ⚠️ دو درسی که با آزمونِ واقعی روی همین سرور گرفته شد (و این کد حالا رعایت
#    می‌کند) — هر دو یک بار سایت را در وضعیتِ «قابلِ سرو ولی غیرِقابلِ
#    reload» گذاشتند:
#
#   ۱) فایلِ پشتیبانِ کانفیگ **نباید داخلِ sites-enabled باشد**. nginx
#      همهٔ فایل‌های آن پوشه را include می‌کند؛ پس یک نسخهٔ `.bak` کنارِ
#      فایلِ اصلی یعنی `duplicate upstream "ghelgheli_game"` و شکستِ
#      `nginx -t`. پشتیبان‌ها می‌روند در $NGINX_BACKUP_DIR.
#      (سرویسِ در حالِ اجرا تا زمانی که reload نشود سالم می‌ماند، ولی هر
#      reload/ری‌استارتِ بعدی شکست می‌خورد — یعنی بمبِ ساعتی. پس اول این
#      پوشه پاک‌سازی می‌شود.)
#
#   ۲) ترتیبِ کار مهم است: **اول snippet ساخته شود، بعد کانفیگِ سایت include
#      کند**. اگر برعکس شود، بینِ دو مرحله یک لحظه کانفیگِ ناقص روی دیسک
#      هست. و بازگشت (rollback) باید **هر دو** فایل را برگرداند، نه فقط
#      یکی — وگرنه include به فایلِ ناموجود می‌ماند.
GAME_PORT="${NEW_PORTS%% *}"     # گرهِ بازی همیشه پورتِ اول است (۴۰۰۰)
HTTP_PORTS="$HEALTHY_PORTS"      # همهٔ گره‌ها HTTP هم سرو می‌کنند (مثلِ امروز)
NGINX_BACKUP_DIR="${NGINX_BACKUP_DIR:-/root/ghelgheli-nginx-backups}"

# ── ۶-۰) پاک‌سازی: هیچ فایلِ دیگری در sites-enabled نباید upstream داشته باشد
mkdir -p "$NGINX_BACKUP_DIR"
while IFS= read -r stray; do
  [ -z "$stray" ] && continue
  [ "$stray" = "$NGINX_SITE" ] && continue
  case "$(basename "$stray")" in
    *bak*|*old*|*~|*.save)
      log "🧹 فایلِ پشتیبانِ سرگردان در sites-enabled (باعثِ خطای duplicate upstream می‌شد) → $NGINX_BACKUP_DIR"
      mv -f "$stray" "$NGINX_BACKUP_DIR/"
      ;;
    *)
      die "فایلِ نامنتظر با upstream در sites-enabled: $stray — دستی بررسی کنید (دست نزدم)"
      ;;
  esac
done < <(grep -rlE '^[[:space:]]*upstream[[:space:]]+ghelgheli_' /etc/nginx/sites-enabled/ 2>/dev/null || true)

mkdir -p "$(dirname "$NGINX_SNIPPET")"
TMP_SNIPPET="$(mktemp /tmp/gg-upstream.XXXXXX)"
{
  echo "# ⚠️ این فایل خودکار ساخته می‌شود — دستی ویرایش نکنید."
  echo "# سازنده: /usr/local/bin/ghelgheli-capacity-apply.sh  (ساخته‌شده در $(date -Is))"
  echo "# تعداد گره‌ها از سخت‌افزارِ همین لحظه می‌آید: هسته=$NEW_CORES گره=$NEW_PROCS"
  echo "upstream ghelgheli_game {"
  echo "    server 127.0.0.1:${GAME_PORT};"
  echo "}"
  echo "upstream ghelgheli_http {"
  for p in $HTTP_PORTS; do echo "    server 127.0.0.1:${p};"; done
  echo "    keepalive 32;"
  echo "}"
} > "$TMP_SNIPPET"

# ── ۶-۱) اول snippet سرِ جایش برود (سایت هنوز دست‌نخورده است) ──
SITE_BACKUP=""
SNIPPET_BACKUP=""
[ -f "$NGINX_SNIPPET" ] && { SNIPPET_BACKUP="$NGINX_BACKUP_DIR/ghelgheli-upstream.conf.$(date +%s).bak"; cp -a "$NGINX_SNIPPET" "$SNIPPET_BACKUP"; }
install -m 644 "$TMP_SNIPPET" "$NGINX_SNIPPET"
rm -f "$TMP_SNIPPET"

# ── ۶-۲) بعد کانفیگِ سایت: بلوکِ upstreamِ سخت‌کدشده → include (یک‌بار) ──
if grep -qE '^[[:space:]]*upstream[[:space:]]+ghelgheli_(game|http)' "$NGINX_SITE" 2>/dev/null; then
  log "🔧 تبدیلِ upstreamِ سخت‌کدشده به include (یک‌بار برای همیشه)"
  SITE_BACKUP="$NGINX_BACKUP_DIR/$(basename "$NGINX_SITE").$(date +%s).bak"
  cp -a "$NGINX_SITE" "$SITE_BACKUP"
  python3 - "$NGINX_SITE" <<'PY'
import re, sys
p = sys.argv[1]
src = open(p, encoding='utf-8').read()
new, n = re.subn(r'(?ms)^upstream\s+ghelgheli_(?:game|http)\s*\{.*?\n\}\n?', '', src)
if n:
    inc = ('# upstreamها از پروفایلِ ظرفیت ساخته می‌شوند (خودکار). '
           'منبع: /usr/local/bin/ghelgheli-capacity-apply.sh\n'
           'include /etc/nginx/snippets/ghelgheli-upstream.conf;\n\n')
    new = inc + new.lstrip('\n')
    open(p, 'w', encoding='utf-8').write(new)
    print(f'  حذف {n} بلوکِ upstream و افزودن include')
PY
fi

# ── ۶-۳) تست؛ اگر خراب بود، **هر دو** فایل برگردند ──
if ! nginx -t >>"$LOG_FILE" 2>&1; then
  log "❌ کانفیگِ nginx معتبر نبود → بازگشتِ کاملِ کانفیگ"
  [ -n "$SITE_BACKUP" ] && cp -a "$SITE_BACKUP" "$NGINX_SITE"
  if [ -n "$SNIPPET_BACKUP" ]; then cp -a "$SNIPPET_BACKUP" "$NGINX_SNIPPET"; else rm -f "$NGINX_SNIPPET"; fi
  if nginx -t >>"$LOG_FILE" 2>&1; then
    die "تستِ nginx شکست خورد؛ کانفیگِ قبلی برگردانده شد و nginx دست‌نخورده است"
  else
    die "تستِ nginx شکست خورد و بازگشت هم نگرفت — نیازِ فوری به بررسیِ دستی: nginx -t"
  fi
fi
systemctl reload nginx >>"$LOG_FILE" 2>&1 || die "reloadِ nginx شکست خورد"

# ── ۶-۴) حالا که nginx دیگر به گره‌های قدیمی اشاره نمی‌کند، حذفشان کن ──
#
# ⚠️ ترتیب مهم است: اگر **قبل** از به‌روزرسانیِ nginx گره‌ها را حذف کنیم،
#    روی تنزل (مثلاً ۸ هسته → ۲) ترافیک به پورتی می‌رود که دیگر وجود ندارد
#    و ۵۰۲ می‌گیریم. حالا اول nginx با لیستِ جدید بازنویسی می‌شود و بعد
#    گره‌های بی‌استفاده خاموش می‌شوند.
STALE="$(pm2_user jlist 2>/dev/null | jq -r '.[] | select(.name|startswith("ghelgheli-api")) | .name' 2>/dev/null || true)"
for name in $STALE; do
  if ! grep -qw "$name" <<<"$NEW_NAMES"; then
    log "🧹 حذفِ گرهِ اضافیِ PM2 (دیگر در nginx نیست): $name"
    pm2_user delete "$name" >/dev/null 2>&1 || true
  fi
done
pm2_user save >/dev/null 2>&1 || true

# کپیِ sites-available هم‌راستا شود تا اگر روزی کسی از آن کپی گرفت،
# نسخهٔ قدیمی با upstreamِ سخت‌کد برنگردد (روی این سرور آن فایل symlink نیست).
SITE_AVAILABLE="${SITE_AVAILABLE:-/etc/nginx/sites-available/$(basename "$NGINX_SITE")}"
if [ -f "$SITE_AVAILABLE" ] && ! cmp -s "$SITE_AVAILABLE" "$NGINX_SITE"; then
  cp -a "$SITE_AVAILABLE" "$NGINX_BACKUP_DIR/$(basename "$SITE_AVAILABLE").$(date +%s).bak"
  install -m 644 "$NGINX_SITE" "$SITE_AVAILABLE"
  log "🔧 sites-available هم‌راستا شد (زیرِ پشتیبان گرفته شد)"
fi

# ── ۷) لیستِ پورت‌ها برای اسکریپتِ سلامت (وگرنه روی پورتِ نبوده هشدار می‌دهد) ──
printf '%s\n' "$HTTP_PORTS" | tr ' ' '\n' | sed '/^$/d' > "$PORTS_FILE"

if [ -f "$HEALTH_SH" ]; then
  HEALTH_PATCHED=0
  # الف) لیستِ پورت‌ها: از سخت‌کد به فایلی که همین اسکریپت می‌نویسد.
  if grep -q 'for PORT in 4000 4001 4002; do' "$HEALTH_SH"; then
    sed -i 's|for PORT in 4000 4001 4002; do|for PORT in $(cat /etc/ghelgheli-capacity-ports 2>/dev/null \|\| echo "4000 4001 4002"); do|' "$HEALTH_SH"
    sed -i 's|رم ${FREE_MB}MB، 3 نود روشن|رم ${FREE_MB}MB، $(wc -w < /etc/ghelgheli-capacity-ports 2>/dev/null || echo 3) نود روشن|' "$HEALTH_SH" 2>/dev/null || true
    HEALTH_PATCHED=1
  fi
  # ب) مسیرِ لاگِ خطا: PM2 لاگ‌ها را در backend/logs می‌نویسد (out_file در
  #    ecosystem.config.cjs)، نه در ~/.pm2/logs. با مسیرِ اشتباه، بررسیِ
  #    EADDRINUSE — همان خطایی که با اضافه‌شدنِ پروسه اتفاق می‌افتد — کور بود.
  if grep -q '/home/ghelgheli/.pm2/logs' "$HEALTH_SH" 2>/dev/null; then
    sed -i 's|/home/ghelgheli/\.pm2/logs|/var/www/GhelGheli/backend/logs|g' "$HEALTH_SH"
    HEALTH_PATCHED=1
  fi
  [ "$HEALTH_PATCHED" = "1" ] && { bash -n "$HEALTH_SH" || die "پچِ health.sh خراب شد — بررسی کنید"; log "🔧 health.sh: لیستِ پورتِ پویا + مسیرِ درستِ لاگ"; }
fi

# ═══════════════════════════════════════════════════════════════════════════
#  ۸) ذخیرهٔ وضعیت + گزارش
# ═══════════════════════════════════════════════════════════════════════════
TMP_STATE="$(mktemp /tmp/gg-state.XXXXXX)"
jq -n --argjson c "$NEW_JSON" \
      --arg ports "$HTTP_PORTS" \
      --arg at "$(date -Is)" \
      --arg rev "$(cd "$APP_DIR" && git rev-parse --short HEAD 2>/dev/null || echo '-')" \
      '$c + {appliedPorts: ($ports|split(" ")), appliedAt: $at, appRev: $rev}' > "$TMP_STATE"
install -m 644 "$TMP_STATE" "$STATE"
chown "$SERVICE_USER:$SERVICE_USER" "$STATE" 2>/dev/null || true
rm -f "$TMP_STATE"

REV="$(cd "$APP_DIR" && git rev-parse --short HEAD 2>/dev/null || echo '-')"
SUMMARY="هسته=$NEW_CORES | گره‌ها=$NEW_PROCS | سقفِ کارِ سنگین=$NEW_VISION | uv=$NEW_UV | استخرِ DB=$NEW_POOL | پورت‌ها=${HTTP_PORTS// /, }"
log "✅ اعمال شد — $SUMMARY (revision=$REV)"

DIR="نامعلوم → همان"
if [ -n "$OLD_CORES" ] && [ "$OLD_CORES" != "$NEW_CORES" ]; then
  DIR="⚠️ <b>تغییرِ سخت‌افزار</b>: هسته $OLD_CORES → $NEW_CORES، پروسه ${OLD_PROCS:--} → $NEW_PROCS"
elif [ "$MODE" = "force" ]; then
  DIR="اجرای اجباری (بدون تغییرِ سخت‌افزار ثبت‌شده)"
else
  DIR="اولین ثبتِ پروفایل/مهاجرت به تنظیمِ خودکار"
fi
notify "⚙️ <b>قل‌قلی — تنظیمِ خودکارِ ظرفیت</b>
${DIR}

هسته: <b>${NEW_CORES}</b> | رم: ${NEW_MEM}MB
گره‌های API: <b>${NEW_PROCS}</b> (پورت ${HTTP_PORTS// /, })
سقفِ هم‌زمانیِ پردازش عکس/مدل: <b>${NEW_VISION}</b> (یک هسته برای موتورِ بازی آزاد)
تردپول: ${NEW_UV} | استخرِ دیتابیس: ${NEW_POOL}
کد: ${REV}
🕒 $(date -Is)"
exit 0
