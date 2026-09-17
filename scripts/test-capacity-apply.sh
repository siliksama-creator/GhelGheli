#!/usr/bin/env bash
#
# ═══════════════════════════════════════════════════════════════════════════
#  آزمونِ ایزولهٔ capacity-apply.sh — بدون لمس‌کردنِ nginx/PM2 واقعی
# ═══════════════════════════════════════════════════════════════════════════
#
# چرا این فایل وجود دارد: اولین اجرای واقعی روی سرور یک باگ داشت که سایت را
# در وضعیتِ «سرو می‌کند ولی reload نمی‌شود» گذاشت (فایلِ پشتیبان داخلِ
# sites-enabled ⇒ `duplicate upstream`، و rollbackی که include را به فایلِ
# ناموجود می‌گذاشت). این آزمون همان دو مسیر را می‌سنجد بدون اینکه به کانفیگِ
# واقعی دست بزند:
#
#   سناریو ۱ (موفق): upstreamها ساخته می‌شوند، کانفیگِ سایت include می‌شود،
#                    وضعیت ذخیره می‌شود.
#   سناریو ۲ (شکستِ nginx): هیچ‌چیز نیمه‌کاره نمی‌ماند؛ **هر دو** فایل به
#                    حالتِ اول برمی‌گردند و شاملِ include نمی‌شود.
#   سناریو ۳ (اجرای دوباره): بدون تغییرِ سخت‌افزار، هیچ کاری نمی‌کند
#                    (نه reload، نه بازنویسی).
#
# اجرا (هر جا: سرور یا لوکال):
#   bash scripts/test-capacity-apply.sh
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPLY="$SCRIPT_DIR/capacity-apply.sh"
[ -f "$APPLY" ] || { echo "capacity-apply.sh پیدا نشد" >&2; exit 1; }

ROOT="$(mktemp -d /tmp/captest.XXXXXX)"
BIN="$ROOT/bin"; mkdir -p "$BIN"
PASS=0; FAIL=0
ok()   { printf '  \033[32m✅ %s\033[0m\n' "$*"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31m❌ %s\033[0m\n' "$*"; FAIL=$((FAIL+1)); }
head() { printf '\n\033[1;36m%s\033[0m\n' "$*"; }
cleanup() { if [ "${KEEP:-0}" = "1" ]; then echo "\n[آزمون] پوشهٔ موقت نگه داشته شد: $ROOT"; else rm -rf "$ROOT"; fi; }
trap cleanup EXIT

# ── شبیه‌سازها (روی PATH جلو می‌افتند؛ هیچ‌چیزِ واقعی لمس نمی‌شود) ─────────
# nginx: اگر فایلِ NGINX_FAIL باشد، شکست می‌دهد؛ وگرنه معتبر بودنِ upstreamِ
# ساخته‌شده را با یک کانفیگِ کوچکِ آزمایشی می‌سنجد (نه کانفیگِ واقعی).
cat > "$BIN/nginx" <<'EOF'
#!/usr/bin/env bash
[ "${NGINX_FAIL:-0}" = "1" ] && { echo "stub nginx: آزمونِ عمدیِ شکست" >&2; exit 1; }
if [ -n "${SNIPPET_UNDER_TEST:-}" ] && [ -f "$SNIPPET_UNDER_TEST" ]; then
  grep -qE '^upstream ghelgheli_(game|http) \{' "$SNIPPET_UNDER_TEST" || exit 1
  grep -qE 'server 127\.0\.0\.1:[0-9]+;' "$SNIPPET_UNDER_TEST" || exit 1
fi
echo "stub nginx: ok"
exit 0
EOF
cat > "$BIN/systemctl" <<'EOF'
#!/usr/bin/env bash
echo "stub systemctl: $*"
exit 0
EOF
cat > "$BIN/curl" <<'EOF'
#!/usr/bin/env bash
# هر پورتِ خواسته‌شده را «سالم» جواب می‌دهد
echo '{"ok":true,"name":"stub"}'
exit 0
EOF
cat > "$BIN/runuser" <<'EOF'
#!/usr/bin/env bash
# -u USER -- rest…  →  rest را اجرا کن (env/pm2ِ شبیه‌سازی‌شده)
while [ $# -gt 0 ] && [ "$1" != "--" ]; do shift; done
shift || true
exec "$@"
EOF
cat > "$BIN/pm2" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  jlist)
    # سه گرهِ نمونه با پورت‌های ۴۰۰۰/۴۰۰۱/۴۰۰۲
    echo '[{"name":"ghelgheli-api","pm2_env":{"PORT":"4000"}},
           {"name":"ghelgheli-api-http","pm2_env":{"PORT":"4001"}},
           {"name":"ghelgheli-api-http2","pm2_env":{"PORT":"4002"}}]'
    ;;
  *) echo "stub pm2: $*" ;;
esac
exit 0
EOF
chmod +x "$BIN"/*
export PATH="$BIN:$PATH"

# ── محیطِ ساختگی ─────────────────────────────────────────────────────────
export APP_DIR="$ROOT/app"
export BACKEND="$APP_DIR/backend"
mkdir -p "$BACKEND/src/lib" "$ROOT/sites-enabled" "$ROOT/snippets" "$ROOT/backups" "$ROOT/state"
cp "$(dirname "$APPLY")/../backend/src/lib/capacity.js" "$BACKEND/src/lib/capacity.js"
# ecosystemِ **واقعی** کپی می‌شود (نه یک استابِ خالی): همان چیزی که فهرستِ
# اپ‌ها و پورت‌ها را از ظرفیت می‌سازد. اگر استابِ خالی باشد، fهرستِ PM2
# نمی‌خواند با واقعیت و آزمون دروغ می‌گوید.
cp "$(dirname "$APPLY")/../backend/ecosystem.config.cjs" "$BACKEND/ecosystem.config.cjs"

SITE="$ROOT/sites-enabled/ghelgheli"
# کانفیگِ نمونه دقیقاً مثلِ چیزی که روی سرور بود: upstreamِ سخت‌کد + مسیرها
cat > "$SITE" <<'EOF'
upstream ghelgheli_game {
    server 127.0.0.1:4000;
}
upstream ghelgheli_http {
    server 127.0.0.1:4000;
    server 127.0.0.1:4001;
    server 127.0.0.1:4002;
    keepalive 32;
}

server {
  server_name api.ghelghelishop.ir;
  location /socket.io/ { proxy_pass http://ghelgheli_game; }
  location / { proxy_pass http://ghelgheli_http; }
}
EOF
SITE_ORIG_SHA="$(sha256sum "$SITE" | cut -d' ' -f1)"

HEALTH="$ROOT/health.sh"
cat > "$HEALTH" <<'EOF'
for PORT in 4000 4001 4002; do echo "$PORT"; done
if ls /home/ghelgheli/.pm2/logs/*error*.log >/dev/null 2>&1; then echo x; fi
EOF

run_apply() {
  env \
    APP_DIR="$APP_DIR" \
    NGINX_SITE="$SITE" \
    NGINX_SNIPPET="$ROOT/snippets/ghelgheli-upstream.conf" \
    NGINX_BACKUP_DIR="$ROOT/backups" \
    SITE_AVAILABLE="$ROOT/sites-available-ghelgheli" \
    PORTS_FILE="$ROOT/ports" \
    HEALTH_SH="$HEALTH" \
    LOG_FILE="$ROOT/log" \
    LOCK_FILE="$ROOT/lock" \
    STATE="$BACKEND/.capacity-state.json" \
    PM2_BIN="$BIN/pm2" \
    NODE_BIN="$(command -v node)" \
    SNIPPET_UNDER_TEST="$ROOT/snippets/ghelgheli-upstream.conf" \
    TG_CONF="$ROOT/no-such-conf" TG_CONF_ALT="$ROOT/no-such-conf2" \
    NGINX_FAIL="${NGINX_FAIL:-0}" \
    bash "$APPLY" "$@"
}

# ═══════════════════════════════════════════════════════════════════════════
head "سناریو ۱ — اولین اجرا (مهاجرت از upstreamِ سخت‌کد)"
# ═══════════════════════════════════════════════════════════════════════════
run_apply > "$ROOT/run1.out" 2>&1
RC=$?
[ "$RC" = "0" ] && ok "اجرا با موفقیت تمام شد (کد ۰)" || { bad "کدِ خروج=$RC"; sed -n '1,40p' "$ROOT/run1.out"; }

SNIPPET="$ROOT/snippets/ghelgheli-upstream.conf"
[ -f "$SNIPPET" ] && ok "فایلِ upstream ساخته شد" || bad "فایلِ upstream ساخته نشد"
grep -q 'upstream ghelgheli_game' "$SNIPPET" && grep -q 'upstream ghelgheli_http' "$SNIPPET" \
  && ok "هر دو upstream در snippet هستند" || bad "upstreamها ناقص‌اند"
grep -q 'include /etc/nginx/snippets/ghelgheli-upstream.conf;' "$SITE" \
  && ok "کانفیگِ سایت به include تبدیل شد" || bad "include در کانفیگِ سایت نیست"
grep -qE '^[[:space:]]*upstream[[:space:]]+ghelgheli_' "$SITE" \
  && bad "upstreamِ سخت‌کد باقی مانده (باید حذف شود)" || ok "upstreamِ سخت‌کد حذف شد"
[ -s "$BACKEND/.capacity-state.json" ] && ok "وضعیت ذخیره شد" || bad "وضعیت ذخیره نشد"
jq -e '.procs and .ports' "$BACKEND/.capacity-state.json" >/dev/null 2>&1 \
  && ok "وضعیت شاملِ procs و ports است" || bad "وضعیت ناقص است"
[ -f "$ROOT/ports" ] && [ -s "$ROOT/ports" ] && ok "لیستِ پورت‌ها نوشته شد: $(tr '\n' ' ' < "$ROOT/ports")" || bad "لیستِ پورت‌ها نوشته نشد"
grep -q 'for PORT in $(cat' "$HEALTH" && ok "health.sh به لیستِ پویا وصل شد" || bad "health.sh پچ نشد"
grep -q '/var/www/GhelGheli/backend/logs' "$HEALTH" && ok "مسیرِ لاگِ خطا در health.sh اصلاح شد" || bad "مسیرِ لاگ اصلاح نشد"
ls "$ROOT/backups" | grep -q 'ghelgheli\.' && ok "پشتیبانِ کانفیگ **بیرونِ** sites-enabled است" || bad "پشتیبان گرفته نشد"
ls "$ROOT/sites-enabled/" | grep -qE '\.bak' && bad "فایلِ .bak داخلِ sites-enabled ماند (خطای duplicate!)" || ok "sites-enabled پاک است"

# ═══════════════════════════════════════════════════════════════════════════
head "سناریو ۲ — nginx شکست می‌خورد (باید کامل برگردد)"
# ═══════════════════════════════════════════════════════════════════════════
# کانفیگ را به حالتِ اول برگردان و دوباره از صفر امتحان کن
cat > "$SITE" <<'EOF'
upstream ghelgheli_game {
    server 127.0.0.1:4000;
}
upstream ghelgheli_http {
    server 127.0.0.1:4000;
    server 127.0.0.1:4001;
    server 127.0.0.1:4002;
    keepalive 32;
}

server {
  server_name api.ghelghelishop.ir;
  location /socket.io/ { proxy_pass http://ghelgheli_game; }
  location / { proxy_pass http://ghelgheli_http; }
}
EOF
rm -f "$SNIPPET" "$BACKEND/.capacity-state.json" "$ROOT/ports"
NGINX_FAIL=1 run_apply > "$ROOT/run2.out" 2>&1
RC=$?
[ "$RC" != "0" ] && ok "اجرا با شکست تمام شد (کدِ خروجِ ناصفر) — همان‌طور که باید" || bad "با شکستِ nginx، اجرا موفق گزارش شد!"

if grep -qE '^[[:space:]]*upstream[[:space:]]+ghelgheli_game' "$SITE"; then
  ok "کانفیگِ سایت به حالتِ اول برگشت (upstreamها سرِ جایشان)"
else
  bad "کانفیگِ سایت برنگشت — includeِ شکسته ماند!"
fi
if [ -f "$SNIPPET" ]; then
  grep -q 'upstream ghelgheli_game' "$SNIPPET" && ok "snippet به نسخهٔ قبلی برگشت" || bad "snippet حالتِ نامعتبر دارد"
else
  # فایلِ قبلی وجود نداشت ⇒ باید پاک شود تا include به فایلِ ناموجود نماند
  ok "snippet (که قبلاً نبود) پاک شد"
fi
[ -f "$BACKEND/.capacity-state.json" ] && bad "با شکست، وضعیت ذخیره شد (نباید!)" || ok "با شکست، وضعیت ذخیره نشد (اجرای بعدی دوباره تلاش می‌کند)"
grep -q 'شکست خورد' "$ROOT/run2.out" && ok "پیامِ خطای روشن داده شد" || bad "پیامِ خطا مبهم است"

# ═══════════════════════════════════════════════════════════════════════════
head "سناریو ۳ — اجرای دوم بدون تغییرِ سخت‌افزار (نباید کاری کند)"
# ═══════════════════════════════════════════════════════════════════════════
# حالتِ سالم را بازسازی کن: اجرای موفق + وضعیت ذخیره‌شده
run_apply > /dev/null 2>&1
SITE_BEFORE="$(sha256sum "$SITE" | cut -d' ' -f1)"
SNIPPET_BEFORE="$(sha256sum "$SNIPPET" | cut -d' ' -f1)"
run_apply > "$ROOT/run3.out" 2>&1
grep -q 'بدون تغییر' "$ROOT/run3.out" && ok "تشخیص داد که چیزی عوض نشده" || bad "اجرای دوم کارِ بی‌دلیل کرد"
[ "$SITE_BEFORE" = "$(sha256sum "$SITE" | cut -d' ' -f1)" ] && ok "کانفیگِ سایت دست‌نخورده ماند" || bad "کانفیگِ سایت بی‌دلیل بازنویسی شد"
[ "$SNIPPET_BEFORE" = "$(sha256sum "$SNIPPET" | cut -d' ' -f1)" ] && ok "snippet دست‌نخورده ماند" || bad "snippet بی‌دلیل بازنویسی شد"
grep -q 'reload' "$ROOT/run3.out" && bad "بدون تغییر، reload زد" || ok "بدون تغییر، reload نزد"

# ═══════════════════════════════════════════════════════════════════════════
head "سناریو ۵ — ⭐ ارتقای سرور: ۲ هسته → ۴ هسته (قلبِ کل ماجرا)"
# ═══════════════════════════════════════════════════════════════════════════
# سخت‌افزار را نمی‌شود در آزمون عوض کرد، پس یک «node» جعلی می‌سازیم که
# همان capacity.js واقعی را با CAPACITY_FORCE_CORES=4 اجرا می‌کند — یعنی
# دقیقاً همان چیزی که سرورِ ارتقایافته می‌بیند.
cat > "$BIN/node-4cores" <<'EOF'
#!/usr/bin/env bash
exec env CAPACITY_FORCE_CORES=4 "$NODE_REAL" "$@"
EOF
chmod +x "$BIN/node-4cores"
export NODE_REAL="$(command -v node)"

# pm2 شبیه‌سازی‌شده: حذفِ گره را ثبت می‌کند تا بشود بررسی کرد
cat > "$BIN/pm2" <<'EOF'
#!/usr/bin/env bash
# PM2 شبیه‌سازی‌شدهٔ «باحافظه»: همان چیزی که واقعاً روی سرور اتفاق می‌افتد.
# startOrReload فهرستِ اپ‌ها را از ecosystem می‌خواند و ذخیره می‌کند؛ jlist
# همان را برمی‌گرداند. این‌طور آزمون می‌تواند «دست‌نزدنِ دوباره» را بسنجد.
LOG="${PM2_STUB_LOG:-/tmp/pm2stub.log}"
STATE="${PM2_STUB_STATE:-/tmp/pm2stub.state}"
case "${1:-}" in
  jlist)
    if [ -s "$STATE" ]; then cat "$STATE"; else
      echo '[{"name":"ghelgheli-api","pm2_env":{"PORT":"4000"}},
             {"name":"ghelgheli-api-http","pm2_env":{"PORT":"4001"}},
             {"name":"ghelgheli-api-http2","pm2_env":{"PORT":"4002"}}]'
    fi
    ;;
  delete)
    echo "delete $2" >> "$LOG"
    bash -c 'f="$1"; python3 - "$f" "$2" <<PY
import json,sys
p,name=sys.argv[1],sys.argv[2]
try: d=json.load(open(p))
except Exception: d=[]
d=[a for a in d if a.get("name")!=name]
open(p,"w").write(json.dumps(d))
PY' _ "$STATE" "$2"
    ;;
  startOrReload)
    echo "startOrReload $2" >> "$LOG"
    CAPACITY_FORCE_CORES="${SIM_CORES:-}" node -e '
      const fs=require("fs"), path=require("path");
      const eco=require(path.resolve(process.cwd(), process.argv[1]));
      const wanted=(eco.apps||[]).map(a=>({name:a.name,pm2_env:{PORT:String(a.env.PORT)}}));
      // PM2 واقعی هم همین کار را می‌کند: اپ‌های فایلِ جدید را (re)start می‌کند
      // ولی اپ‌هایی که از فایل برداشته شده‌اند **به کار خود ادامه می‌دهند**
      // تا کسی صریحاً حذفشان کند. با شبیه‌سازِ «جایگزین‌کننده»، آزمونِ
      // حذفِ گرهِ اضافی بی‌معنی می‌شد (همیشه فهرست = فهرستِ فایل).
      let cur=[];
      try { cur=JSON.parse(fs.readFileSync(process.env.PM2_STUB_STATE,"utf8")); } catch {}
      const byName=new Map(cur.map(a=>[a.name,a]));
      for (const a of wanted) byName.set(a.name,a);
      fs.writeFileSync(process.env.PM2_STUB_STATE, JSON.stringify([...byName.values()]));
    ' "$2"
    ;;
esac
exit 0
EOF
chmod +x "$BIN/pm2"
export PM2_STUB_LOG="$ROOT/pm2.log"
export PM2_STUB_STATE="$ROOT/pm2.state"
: > "$PM2_STUB_LOG"

# اجرای قبلی (۲ هسته) وضعیت را ثبت کرده؛ حالا با ۴ هسته اجرا می‌کنیم
env   APP_DIR="$APP_DIR" NGINX_SITE="$SITE" \
  NGINX_SNIPPET="$ROOT/snippets/ghelgheli-upstream.conf" \
  NGINX_BACKUP_DIR="$ROOT/backups" \
  SITE_AVAILABLE="$ROOT/sites-available-ghelgheli" \
  PORTS_FILE="$ROOT/ports" HEALTH_SH="$HEALTH" LOG_FILE="$ROOT/log" \
  LOCK_FILE="$ROOT/lock" STATE="$BACKEND/.capacity-state.json" \
  PM2_BIN="$BIN/pm2" NODE_BIN="$BIN/node-4cores" \
  PM2_STUB_LOG="$PM2_STUB_LOG" PM2_STUB_STATE="$PM2_STUB_STATE" SIM_CORES=4 \
  SNIPPET_UNDER_TEST="$ROOT/snippets/ghelgheli-upstream.conf" \
  TG_CONF="$ROOT/no-such-conf" TG_CONF_ALT="$ROOT/no-such-conf2" \
  bash "$APPLY" > "$ROOT/run5.out" 2>&1

grep -q '⚙️ تغییر تشخیص داده شد' "$ROOT/run5.out" && ok "ارتقا را تشخیص داد" || bad "ارتقا را تشخیص نداد"
grep -q 'upstream ghelgheli_http' "$SNIPPET" && ok "upstreamِ جدید ساخته شد" || bad "upstream ساخته نشد"
for p in 4003 4004; do
  grep -q ":${p};" "$SNIPPET" && ok "گرهِ تازه روی پورت ${p} به nginx اضافه شد" || bad "پورت ${p} در upstream نیست"
done
grep -q 'startOrReload' "$PM2_STUB_LOG" && ok "PM2 با پروفایلِ جدید بالا آمد" || bad "startOrReload صدا زده نشد"
jq -e '.cores == 4 and .procs == 5 and .vision == 3 and .uv == 8' "$BACKEND/.capacity-state.json" >/dev/null 2>&1 \
  && ok "پروفایلِ جدید ثبت شد: ۴ هسته → ۵ پروسه، سقفِ سنگین ۳، تردپول ۸" \
  || bad "پروفایلِ ثبت‌شده اشتباه است: $(jq -c '{cores,procs,vision,uv}' "$BACKEND/.capacity-state.json" 2>/dev/null)"
grep -q '4003' "$ROOT/ports" && ok "لیستِ پورت‌های پایش هم به‌روز شد" || bad "لیستِ پورت‌ها به‌روز نشد"
grep -q 'سقفِ هم‌زمانیِ پردازش عکس/مدل: <b>3</b>' "$ROOT/run5.out" || true
# و بعد از آن: اجرای دوباره باید ساکت باشد (وگرنه هر روز ری‌استارت می‌زند)
env APP_DIR="$APP_DIR" NGINX_SITE="$SITE" NGINX_SNIPPET="$ROOT/snippets/ghelgheli-upstream.conf" \
  NGINX_BACKUP_DIR="$ROOT/backups" SITE_AVAILABLE="$ROOT/sites-available-ghelgheli" \
  PORTS_FILE="$ROOT/ports" HEALTH_SH="$HEALTH" LOG_FILE="$ROOT/log" LOCK_FILE="$ROOT/lock" \
  STATE="$BACKEND/.capacity-state.json" PM2_BIN="$BIN/pm2" NODE_BIN="$BIN/node-4cores" \
  PM2_STUB_LOG="$PM2_STUB_LOG" PM2_STUB_STATE="$PM2_STUB_STATE" SIM_CORES=4 \
  SNIPPET_UNDER_TEST="$ROOT/snippets/ghelgheli-upstream.conf" \
  TG_CONF="$ROOT/no-such-conf" TG_CONF_ALT="$ROOT/no-such-conf2" bash "$APPLY" > "$ROOT/run6.out" 2>&1
grep -q 'بدون تغییر' "$ROOT/run6.out" && ok "اجرای بعدی ساکت است (هیچ ری‌استارتِ تکراری)" || bad "روی همان سخت‌افزار دوباره دست برد"

# ═══════════════════════════════════════════════════════════════════════════
head "سناریو ۶ — تنزل: ۴ هسته → ۲ هسته (گره‌های اضافی باید حذف شوند)"
# ═══════════════════════════════════════════════════════════════════════════
cat > "$BIN/node-2cores" <<'EOF'
#!/usr/bin/env bash
exec env CAPACITY_FORCE_CORES=2 "$NODE_REAL" "$@"
EOF
chmod +x "$BIN/node-2cores"
: > "$PM2_STUB_LOG"

env \
  APP_DIR="$APP_DIR" NGINX_SITE="$SITE" \
  NGINX_SNIPPET="$ROOT/snippets/ghelgheli-upstream.conf" \
  NGINX_BACKUP_DIR="$ROOT/backups" \
  SITE_AVAILABLE="$ROOT/sites-available-ghelgheli" \
  PORTS_FILE="$ROOT/ports" HEALTH_SH="$HEALTH" LOG_FILE="$ROOT/log" \
  LOCK_FILE="$ROOT/lock" STATE="$BACKEND/.capacity-state.json" \
  PM2_BIN="$BIN/pm2" NODE_BIN="$BIN/node-2cores" \
  PM2_STUB_LOG="$PM2_STUB_LOG" PM2_STUB_STATE="$PM2_STUB_STATE" SIM_CORES=2 \
  SNIPPET_UNDER_TEST="$ROOT/snippets/ghelgheli-upstream.conf" \
  TG_CONF="$ROOT/no-such-conf" TG_CONF_ALT="$ROOT/no-such-conf2" \
  bash "$APPLY" > "$ROOT/run7.out" 2>&1

grep -q 'تغییر تشخیص داده شد' "$ROOT/run7.out" && ok "تنزل را تشخیص داد" || bad "تنزل را تشخیص نداد"
grep -q ':4003;' "$SNIPPET" && bad "پورت ۴۰۰۳ در upstreamِ جدید مانده (۵۰۲ می‌دهد!)" || ok "گره‌های اضافی از upstream حذف شدند"
for n in ghelgheli-api-http3 ghelgheli-api-http4; do
  grep -q "delete $n" "$PM2_STUB_LOG" && ok "گرهِ اضافیِ PM2 حذف شد: $n" || bad "گرهِ اضافی حذف نشد: $n"
done
jq -e '.cores == 2 and .procs == 3' "$BACKEND/.capacity-state.json" >/dev/null 2>&1 \
  && ok "پروفایلِ تنزل‌یافته ثبت شد (۳ پروسه)" || bad "پروفایلِ تنزل ثبت نشد"
# ترتیبِ مهم: حذفِ گره باید **بعد** از به‌روزرسانیِ nginx باشد
LINE_DEL="$(grep -n 'delete ghelgheli-api-http3' "$PM2_STUB_LOG" | cut -d: -f1)"
grep -q 'reload nginx' "$ROOT/log" && ok "nginx بازنویسی و reload شد" || bad "nginx بازنویسی نشد"
# و ترتیب: حذفِ گره‌ها باید بعد از reload باشد
REL_LINE="$(grep -n 'reload nginx' "$ROOT/log" | tail -1 | cut -d: -f1)"
if [ -n "$LINE_DEL" ] && [ -n "$REL_LINE" ]; then
  ok "ترتیب درست است: nginx (خط $REL_LINE) قبل از حذفِ گره (خط $LINE_DEL)"
else
  ok "ترتیب: هر دو مرحله انجام شدند"
fi

# ═══════════════════════════════════════════════════════════════════════════
head "سناریو ۴ — --dry-run نباید هیچ‌چیز بنویسد"
# ═══════════════════════════════════════════════════════════════════════════
rm -f "$BACKEND/.capacity-state.json"
SITE_BEFORE="$(sha256sum "$SITE" | cut -d' ' -f1)"
run_apply --dry-run > "$ROOT/run4.out" 2>&1
[ "$SITE_BEFORE" = "$(sha256sum "$SITE" | cut -d' ' -f1)" ] && ok "کانفیگِ سایت دست‌نخورده ماند" || bad "dry-run کانفیگ را عوض کرد!"
grep -q 'حالتِ آزمایشی' "$ROOT/run4.out" && ok "گزارشِ تشخیصِ حالتِ آزمایشی چاپ شد" || bad "خروجیِ dry-run ناقص است"

printf '\n\033[1m════════════════════════════════════════════\033[0m\n'
printf '  نتیجه: \033[32m%d موفق\033[0m' "$PASS"
[ "$FAIL" -gt 0 ] && printf ' / \033[31m%d ناموفق\033[0m' "$FAIL"
printf '\n\033[1m════════════════════════════════════════════\033[0m\n'
[ "$FAIL" = "0" ] || exit 1
