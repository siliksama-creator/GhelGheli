#!/usr/bin/env bash
#
# ═══════════════════════════════════════════════════════════════════════════
#  آزمونِ ایزولهٔ «مسیرِ هشدار» — بدونِ تلگرامِ واقعی، بدونِ سرورِ واقعی
# ═══════════════════════════════════════════════════════════════════════════
#
# چرا این فایل وجود دارد: این پروژه سه بار پشتِ‌سرِ‌هم روی همین مسیر ضربه
# خورده و هر سه بار بی‌صدا بود — یعنی دقیقاً وقتی لازم می‌شد (نصفِ‌شب، سرور
# خوابیده) معلوم می‌شد که هشدار نمی‌رسد. مسیرِ هشدارِ خراب از نبودِ هشدار
# بدتر است، چون آدم فکر می‌کند پشتش گرم است. سه باگِ واقعی:
#
#   الف) ۲۶ شهریور — تنظیماتِ تلگرام با کوتیشن خوانده می‌شد
#        (`TELEGRAM_BOT_TOKEN="881…"` ⇒ آدرسِ `/bot"881…"/sendMessage` ⇒ ۴۰۴).
#        بخشِ ۱ این آزمون همان را قفل می‌کند.
#
#   ب) ۲۹ شهریور ۰۰:۲۱ — نگهبان گفت «گرهِ ۴۰۰۳/۴۰۰۴ جواب نمی‌دهد» ولی هیچ
#        ری‌استارتی، هیچ خطایی و هیچ افتِ واقعی‌ای در کار نبود؛ یک وقفهٔ
#        لحظه‌ایِ ۵ ثانیه‌ای بود. فیکس: هر گره **دو بار** سنجیده می‌شود (با
#        بودجهٔ زمانیِ محدود تا دورِ ۳۰ ثانیه‌ای عقب نیفتد). بخشِ ۳ این آزمون.
#
#   ج) ۲۹ شهریور (دوّمین لایه، همین دور پیدا شد) — حالتِ آلارمِ گره فقط
#        «روشن» می‌شد و **هرگز پاک نمی‌شد**: پرچمِ `ALARM_node_4003=1` در
#        فایلِ وضعیت برای همیشه می‌ماند. نتیجه‌اش این بود که افتِ **بعدیِ**
#        همان گره کاملاً بی‌صدا می‌ماند (`alarm()` پرچمِ کهنه را می‌دید و
#        می‌گفت «قبلاً خبر داده‌ام»). بخشِ ۲ این آزمون همان را می‌سنجد.
#
# اجرا (هر جا: سرور یا لوکال):
#   bash scripts/test-monitor-alerts.sh
#
# هیچ‌چیزِ واقعی لمس نمی‌شود: نه تلگرام (مسیرِ تنظیمات به فایلِ ناموجود
# اشاره می‌کند)، نه PM2، نه پورت‌های تولید. «گره» یک سرورِ تزریقیِ کوچکِ
# Node روی یک پورتِ تصادفی است که همین آزمون بالا/پایین می‌کند.
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
HEALTH="$REPO/monitor/health.sh"
TG_LIB="$REPO/monitor/lib/telegram.sh"
[ -f "$HEALTH" ] || { echo "monitor/health.sh پیدا نشد" >&2; exit 1; }
[ -f "$TG_LIB" ] || { echo "monitor/lib/telegram.sh پیدا نشد" >&2; exit 1; }

PASS=0; FAIL=0
ok()   { printf '  \033[32m✅ %s\033[0m\n' "$*"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31m❌ %s\033[0m\n' "$*"; FAIL=$((FAIL+1)); }
head() { printf '\n\033[1;36m%s\033[0m\n' "$*"; }

ROOT="$(mktemp -d /tmp/ggalerts.XXXXXX)"
STUB_PID=""
cleanup() {
  [ -n "$STUB_PID" ] && kill -9 "$STUB_PID" 2>/dev/null
  if [ "${KEEP:-0}" = "1" ]; then echo "\n[آزمون] پوشهٔ موقت نگه داشته شد: $ROOT"
  else rm -rf "$ROOT"; fi
}
trap cleanup EXIT

# ═══════════════════════════════════════════════════════════════════════════
head "بخشِ ۱ — خواندنِ تنظیماتِ تلگرام (باگِ کوتیشن: ۲۶ شهریور)"
# ═══════════════════════════════════════════════════════════════════════════
CONF="$ROOT/telegram.conf"
cat > "$CONF" <<'EOF'
TELEGRAM_BOT_TOKEN="8815400000:AAH-quoted-token"
TELEGRAM_CHAT_ID='2129700000'
BACKUP_CHAT_ID=  2129700001
EOF
# shellcheck source=../monitor/lib/telegram.sh
source "$TG_LIB"
t1="$(tg_conf_get "$CONF" TELEGRAM_BOT_TOKEN)"
t2="$(tg_conf_get "$CONF" TELEGRAM_CHAT_ID)"
t3="$(tg_conf_get "$CONF" BACKUP_CHAT_ID)"
[ "$t1" = "8815400000:AAH-quoted-token" ] && ok "کوتیشنِ جفت از توکن برداشته شد" \
  || bad "توکن با کوتیشن برگشت: [$t1]"
[ "$t2" = "2129700000" ] && ok "کوتیشنِ تک از chat_id برداشته شد" || bad "chat_id با کوتیشن: [$t2]"
[ "$t3" = "2129700001" ] && ok "فاصلهٔ اضافه هم تحمل شد" || bad "فاصله پاک نشد: [$t3]"
[ -z "$(tg_conf_get "$CONF" NOPE_KEY)" ] && ok "کلیدِ ناموجود رشتهٔ خالی می‌دهد (نه خطا)" || bad "کلیدِ ناموجود خروجیِ ناخواسته داد"

# ═══════════════════════════════════════════════════════════════════════════
head "بخشِ ۲ — چرخهٔ عمرِ آلارمِ گره: خرابی ⇒ بازیابی ⇒ خرابیِ دوباره"
# ═══════════════════════════════════════════════════════════════════════════
# «گره» = سرورِ تزریقی. mode=up یعنی سالم، mode=hang-first یعنی تلاشِ اول
# بی‌جواب (شبیه‌سازیِ همان وقفهٔ ۵ ثانیه‌ایِ نیمه‌شب).
PORT="${GG_TEST_PORT:-$(( 41000 + RANDOM % 3000 ))}"
cat > "$ROOT/stub.js" <<'EOF'
const http = require('http'), fs = require('fs'), path = require('path');
const port = Number(process.argv[2]), root = process.argv[3];
const modeFile = path.join(root, 'mode'), hitFile = path.join(root, 'hits');
http.createServer((req, res) => {
  let n = 0; try { n = Number(fs.readFileSync(hitFile, 'utf8')); } catch (e) {}
  fs.writeFileSync(hitFile, String(n + 1));
  const mode = (() => { try { return fs.readFileSync(modeFile, 'utf8').trim(); } catch (e) { return 'up'; } })();
  const send = () => {
    const b = JSON.stringify({ ok: true, name: 'stub', port });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) });
    res.end(b);
  };
  if (mode === 'hang-first' && n === 0) { setTimeout(send, 5000); return; }  // تلاشِ اول بی‌جواب
  send();
}).listen(port, '127.0.0.1');
EOF

echo "up" > "$ROOT/mode"; : > "$ROOT/hits"
: > "$ROOT/ports"; echo "$PORT" > "$ROOT/ports"
mkdir -p "$ROOT/state"
LOG="$ROOT/health.log"; : > "$LOG"
STATE="$ROOT/state/monitor-state.env"

run_health() {
  PORTS_FILE="$ROOT/ports" STATE_DIR="$ROOT/state" LOG_FILE="$LOG" \
  HEARTBEAT_S=99999 DISK_WARN_PCT=99 MEM_WARN_PCT=99 NODE_TIMEOUT=2 NODE_RETRY_DELAY=1 \
  TG_CONF="$ROOT/no-such.conf" TG_CONF_ALT="$ROOT/no-such-2.conf" APP_DIR="$ROOT" \
  bash "$HEALTH" >/dev/null 2>&1
}
# گره همیشه با حالتِ «سالم» بالا می‌آید تا حلقهٔ انتظار خودش اولین درخواست
# را مصرف کند؛ بعد حالتِ دلخواه جدا تنظیم می‌شود (وگرنه در سناریوی
# hang-first همین حلقهٔ انتظار، «تلاشِ اول» را می‌سوزاند و آزمون بی‌معنا می‌شد).
start_stub() {
  echo "up" > "$ROOT/mode"; : > "$ROOT/hits"
  node "$ROOT/stub.js" "$PORT" "$ROOT" >/dev/null 2>&1 &
  STUB_PID=$!
  for _ in $(seq 1 25); do curl -sf -m 1 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 && return 0; sleep 0.2; done
  return 1
}
set_mode() { echo "$1" > "$ROOT/mode"; : > "$ROOT/hits"; }
stop_stub() { [ -n "$STUB_PID" ] && kill -9 "$STUB_PID" 2>/dev/null; wait "$STUB_PID" 2>/dev/null; STUB_PID=""; sleep 0.3; }
on_count()  { grep -c "ALERT ON  \[node_${PORT}\]"  "$LOG" 2>/dev/null || true; }
off_count() { grep -c "ALERT OFF \[node_${PORT}\]"  "$LOG" 2>/dev/null || true; }

# ── (۱) گره مرده است: باید هشدار بدهد ─────────────────────────────────────
run_health
[ "$(on_count)" = "1" ] && ok "گرهِ مرده هشدار داد (ALERT ON)" || bad "هشدارِ گرهِ مرده نیامد (ON=$(on_count))"
grep -q "^ALARM_node_${PORT}=1$" "$STATE" && ok "پرچمِ آلارم ثبت شد" || bad "پرچمِ آلارم ثبت نشد"

# ── (۲) گره سالم شد: باید «برطرف شد» بگوید و پرچم را پاک کند ──────────────
start_stub && ok "گرهِ تزریقی بالا آمد (پورت $PORT)" || bad "گرهِ تزریقی اصلاً بالا نیامد"
run_health
[ "$(off_count)" = "1" ] && ok "بازیابی خبر داده شد (ALERT OFF)" || bad "پیامِ «برطرف شد» نیامد (OFF=$(off_count))"
grep -q "^ALARM_node_${PORT}=" "$STATE" && bad "پرچمِ کهنه پاک نشد — افتِ بعدی بی‌صدا می‌شود!" \
  || ok "پرچمِ آلارم پاک شد (گره از حالتِ هشدار بیرون آمد)"

# ── (۳) پایدارِ سالم: نباید اسپم کند ──────────────────────────────────────
run_health; run_health
[ "$(on_count)" = "1" ] && [ "$(off_count)" = "1" ] && ok "گرهِ سالم هیچ پیامِ تکراری‌ای نساخت" \
  || bad "اسپمِ هشدار (ON=$(on_count) OFF=$(off_count))"

# ═══════════════════════════════════════════════════════════════════════════
head "بخشِ ۳ — افتِ دوباره (باگِ اصلی: پرچمِ کهنه افتِ بعدی را می‌خورد)"
# ═══════════════════════════════════════════════════════════════════════════
stop_stub
run_health
[ "$(on_count)" = "2" ] && ok "افتِ دوبارهٔ همان گره هم هشدار داد (۲× ALERT ON)" \
  || bad "افتِ دوباره بی‌صدا ماند — پرچمِ کهنه هشدار را قورت داد (ON=$(on_count))"

# ═══════════════════════════════════════════════════════════════════════════
head "بخشِ ۴ — وقفهٔ لحظه‌ای: تلاشِ اول بی‌جواب، تلاشِ دوم سالم ⇒ بدونِ هشدار"
# ═══════════════════════════════════════════════════════════════════════════
# از حالتِ «آلارم روشن» شروع می‌کنیم تا مطمئن شویم سنجشِ دو‌باره واقعاً کار
# می‌کند (شبیهِ همان ۰۰:۲۱:۴۶). اگر رد شود، پرچم دوباره روشن می‌ماند.
start_stub; run_health                      # پرچم پاک شود (حالتِ عادی)
set_mode hang-first                            # درخواستِ بعدی = بی‌جواب (۵ ثانیه)
ON_BEFORE="$(on_count)"
run_health
[ "$(on_count)" = "$ON_BEFORE" ] && ok "وقفهٔ لحظه‌ای باعثِ هشدارِ کاذب نشد" \
  || bad "هشدارِ کاذب روی وقفهٔ لحظه‌ای (ON=$(on_count))"
grep -q "گذرا \[node_${PORT}\]" "$LOG" && ok "لاگ توضیحِ شفاف داد («تلاشِ اول بی‌جواب، تلاشِ دوم سالم»)" \
  || bad "لاگِ گذرا نوشته نشد"
grep -q "^ALARM_node_${PORT}=" "$STATE" && bad "پرچمِ آلارم روی وقفهٔ گذرا روشن شد" \
  || ok "حالتِ هشدار تمیز ماند"

printf '\n\033[1m════════════════════════════════════════════\033[0m\n'
printf '  نتیجه: \033[32m%d موفق\033[0m' "$PASS"
[ "$FAIL" -gt 0 ] && printf ' / \033[31m%d ناموفق\033[0m' "$FAIL"
printf '\n\033[1m════════════════════════════════════════════\033[0m\n'
[ "$FAIL" = "0" ] || exit 1
