#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  نگهبانِ سمتِ سرورِ سپرِ کلادفلر — خواندنِ آی‌پیِ واقعیِ کاربر
# ═══════════════════════════════════════════════════════════════════════════
#
# ── چرا این اسکریپت لازم است ──────────────────────────────────────────────
#
# وقتی پنلِ ادمین سپر را روشن می‌کند، ترافیک از لبهٔ کلادفلر می‌آید. از دیدِ
# nginx آن‌وقت **همهٔ کاربران یک آی‌پی دارند** (آی‌پیِ همان لبه). نتیجه‌اش اگر
# این کار را نکنیم:
#
#   • سقفِ «۳۰ درخواست در ثانیه از هر آی‌پی» که ساختیم، به‌جای ربات‌ها
#     کاربرانِ واقعی را می‌بندد (هر ۳۰ درخواست، کلِ کاربران پشتِ سقف).
#   • لاگ‌ها بی‌مصرف می‌شوند: نمی‌شود فهمید کدام آی‌پی دارد حمله می‌کند.
#
# راهِ حل: به nginx یاد بده آی‌پیِ واقعی را از هدرِ `CF-Connecting-IP` بخواند
# و فقط به لبه‌های خودِ کلادفلر اعتماد کند.
#
# ── چرا از سمتِ root و با فایل ────────────────────────────────────────────
#
# پنل با کاربرِ `ghelgheli` اجرا می‌شود و کانفیگِ nginx دستِ root است. اگر
# می‌خواستیم پنل مستقیم nginx را عوض کند، باید به آن کاربر sudo می‌دادیم؛
# یعنی یک مسیرِ ارتقای دسترسی که هر باگِ وب را به کنترلِ کلِ سرور تبدیل
# می‌کند. در عوض: پنل فقط یک فایلِ دو کلمه‌ای می‌نویسد («on»/«off») و این
# نگهبانِ root هر ۳۰ ثانیه می‌بیند و اعمال می‌کند. هیچ ورودیِ بیرونی به دستور
# تبدیل نمی‌شود.
#
# ── رفتارِ امن ───────────────────────────────────────────────────────────
#
#   • `nginx -t` قبل از هر reload؛ اگر تست رد شد، **پشتیبان برمی‌گردد**.
#   • idempotent: اگر وضعیتِ فعلی همان باشد، هیچ کاری نمی‌کند.
#   • خاموش‌کردن، خطِ include را برمی‌دارد (نه اینکه کانفیگ را از نو بسازد).
#
# نصب: `bash scripts/install-cloudflare-mode.sh` (واحدها + تایمر هر ۳۰ ثانیه)
# اجرای دستی: `bash scripts/cloudflare-mode-apply.sh --status|--force`
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/GhelGheli}"
STATE_DIR="${STATE_DIR:-/var/lib/ghelgheli}"
DESIRED_FILE="${DESIRED_FILE:-$STATE_DIR/cloudflare-mode}"
APPLIED_FILE="${APPLIED_FILE:-$STATE_DIR/cloudflare-mode.applied}"
SNIPPET_DIR="${SNIPPET_DIR:-/etc/nginx/snippets}"
SNIPPET="$SNIPPET_DIR/ghelgheli-cloudflare-realip.conf"
SITE="${NGINX_SITE:-/etc/nginx/sites-enabled/ghelgheli}"
BACKUP_DIR="${BACKUP_DIR:-/root/ghelgheli-nginx-backups}"
FALLBACK_IPS="$APP_DIR/deploy/ghelgheli-cloudflare-ips.txt"
LOG="${LOG:-/var/log/ghelgheli-cloudflare-mode.log}"
INCLUDE_LINE='include /etc/nginx/snippets/ghelgheli-cloudflare-realip.conf;'
MARKER_BEGIN='# ── کلادفلر: خواندنِ آی‌پیِ واقعی (خودکار — دست نزن) ──'

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%:z')" "$*" | tee -a "$LOG"; }

desired() {
  [ -r "$DESIRED_FILE" ] || { echo ""; return; }
  head -1 "$DESIRED_FILE" | tr -d '[:space:]'
}
# ⚠️ خطِ اول فقط «on» یا «off» است و خطِ دوم زمان. اگر زمان به خطِ اول
#    بچسبد، مقایسهٔ WANT و HAVE هرگز برابر نمی‌شود و نگهبان هر ۳۰ ثانیه
#    دوباره اسنیپت می‌سازد و nginx را reload می‌کند — یعنی بی‌دلیل. (این باگ
#    در آزمایشِ محلی پیدا شد: بارِ دوم باید کاملاً بی‌کار برمی‌گشت.)
applied() {
  [ -r "$APPLIED_FILE" ] || { echo ""; return; }
  head -1 "$APPLIED_FILE" | tr -d '[:space:]'
}
write_applied() { printf '%s\n%s\n' "$1" "$(date '+%Y-%m-%dT%H:%M:%S%:z')" > "$APPLIED_FILE"; }

case "${1:-}" in
  --status)
    printf 'خواستهٔ پنل: %s\nاعمال‌شده روی سرور: %s\n' "$(desired)" "$(applied)"
    printf 'فایلِ include در %s: %s\n' "$SITE" "$(grep -qF "$INCLUDE_LINE" "$SITE" && echo 'هست' || echo 'نیست')"
    printf 'اسنیپت: %s\n' "$( [ -f "$SNIPPET" ] && echo 'موجود' || echo 'ساخته نشده' )"
    exit 0 ;;
  --force) : ;;   # بدونِ توجه به وضعیت، دوباره اعمال کن
  "") : ;;
  *) echo "usage: $0 [--status|--force]" >&2; exit 2 ;;
esac

WANT="$(desired)"
HAVE="$(applied)"
if [ "${1:-}" != "--force" ] && [ "$WANT" = "$HAVE" ]; then
  exit 0   # چیزی برای انجام نیست — این خط، هر ۳۰ ثانیه اجرا می‌شود
fi

# ═══════════════════════════════════════════════════════════════════════════
#  ساختِ اسنیپتِ آی‌پی‌های کلادفلر
# ═══════════════════════════════════════════════════════════════════════════
build_snippet() {
  local ips
  # نسخهٔ تازه از خودِ کلادفلر؛ اگر نرسید، فهرستِ پشتیبانِ مخزن.
  #
  # ⚠️ دو باگِ واقعی که روی سرورِ تولید دیده شدند و این‌جا بسته شده‌اند:
  #
  #   ۱. خروجیِ curl همیشه با خطِ جدید تمام نمی‌شود، پس چسباندنِ دو فهرستِ
  #      v4 و v6 آخرین آی‌پیِ نسخهٔ ۴ را به اولین آی‌پیِ نسخهٔ ۶ می‌چسباند
  #      («131.0.72.0/222400:cb00::/32») و nginx کلِ کانفیگ را رد می‌کند.
  #      حالا بین دو فهرست صریحاً خطِ جدید گذاشته می‌شود.
  #   ۲. فیلترِ قبلی هر رشتهٔ بی‌معنی را می‌پذیرفت. حالا فقط چیزی قبول است
  #      که شکلِ درستِ CIDR داشته باشد — هم IPv4 (با نقطه) و هم IPv6.
  #      ⚠️ در نسخهٔ اولِ همین اصلاح، نقطه از الگو جا افتاد و کلِ IPv4 حذف
  #      شد؛ گاردِ رفتاری همان لحظه قرمز شد و نگذاشت به تولید برسد.
  ips=$( {
        curl -sf -m 15 https://www.cloudflare.com/ips-v4; printf '\n'
        curl -sf -m 15 https://www.cloudflare.com/ips-v6; printf '\n'
      } 2>/dev/null | grep -E '^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$|^[0-9a-fA-F:]{2,45}/[0-9]{1,3}$' || true )
  if [ -z "$ips" ] && [ -r "$FALLBACK_IPS" ]; then
    log "دریافتِ فهرستِ آی‌پی‌ها از کلادفلر ممکن نشد؛ فهرستِ پشتیبانِ مخزن استفاده شد."
    ips=$(grep -E '^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$|^[0-9a-fA-F:]{2,45}/[0-9]{1,3}$' "$FALLBACK_IPS")
  fi
  [ -n "$ips" ] || { log "خطا: هیچ فهرستِ آی‌پی‌ای در دسترس نبود."; return 1; }

  local count; count=$(printf '%s\n' "$ips" | wc -l)
  mkdir -p "$SNIPPET_DIR"
  {
    printf '# ═══════════════════════════════════════════════════════════════\n'
    printf '#  خواندنِ آی‌پیِ واقعیِ کاربر وقتی ترافیک از کلادفلر می‌آید\n'
    printf '#  ساختهٔ خودکار توسط scripts/cloudflare-mode-apply.sh — دست نزن.\n'
    printf '#  تعدادِ محدوده‌ها: %s | زمان: %s\n' "$count" "$(date '+%Y-%m-%d %H:%M:%S %z')"
    printf '# ═══════════════════════════════════════════════════════════════\n'
    printf '# فقط به لبه‌های خودِ کلادفلر اعتماد می‌شود؛ هدرِ CF-Connecting-IP\n'
    printf '# از هر جای دیگری بیاید نادیده گرفته می‌شود (وگرنه هر رباتی\n'
    printf '# می‌توانست با یک هدرِ دروغ، سقفِ ضدِربات را دور بزند).\n'
    printf '%s\n' "$ips" | sed 's/^/set_real_ip_from /; s/$/;/'
    printf 'real_ip_header CF-Connecting-IP;\n'
    printf 'real_ip_recursive on;\n'
  } > "$SNIPPET.tmp"
  mv "$SNIPPET.tmp" "$SNIPPET"
  chmod 0644 "$SNIPPET"
  log "اسنیپت ساخته شد ($count محدودهٔ آی‌پی)."
}

# ═══════════════════════════════════════════════════════════════════════════
#  دست‌کاریِ کانفیگِ سایت — با پشتیبان و برگشتِ خودکار
# ═══════════════════════════════════════════════════════════════════════════
enable_include() {
  grep -qF "$INCLUDE_LINE" "$SITE" && return 0
  local anchor
  anchor=$(grep -n 'include /etc/nginx/snippets/ghelgheli-upstream.conf;' "$SITE" | head -1 | cut -d: -f1)
  if [ -z "$anchor" ]; then
    # جای دومِ امن: بالای فایل (سطحِ http است و include همین‌جا معتبر).
    anchor=1
  fi
  python3 - "$SITE" "$anchor" "$INCLUDE_LINE" "$MARKER_BEGIN" <<'PY'
import sys
path, line_no, include, marker = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
with open(path, encoding='utf-8') as fh:
    lines = fh.readlines()
block = [f"{marker}\n", f"{include}\n"]
# بعد از خطِ شاملِ upstream می‌نشیند (شمارهٔ خط یک‌پایه است).
lines[line_no:line_no] = block
with open(path, 'w', encoding='utf-8') as fh:
    fh.writelines(lines)
PY
  log "خطِ include به کانفیگِ سایت اضافه شد."
}

disable_include() {
  grep -qF "$INCLUDE_LINE" "$SITE" || return 0
  python3 - "$SITE" "$INCLUDE_LINE" "$MARKER_BEGIN" <<'PY'
import sys
path, include, marker = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path, encoding='utf-8') as fh:
    lines = fh.readlines()
out = [l for l in lines if l.strip() != include.strip() and l.strip() != marker.strip()]
with open(path, 'w', encoding='utf-8') as fh:
    fh.writelines(out)
PY
  log "خطِ include از کانفیگِ سایت برداشته شد."
}

# ⚠️ ترتیب مهم است: پشتیبان باید **پیش از** هر دست‌کاری گرفته شود. نسخهٔ
# اول پشتیبان را داخلِ همین تابع (یعنی پس از تغییر) می‌گرفت؛ نتیجه این بود که
# در برگشت، همان حالتِ ناسالم بازگردانده می‌شد. این را آزمایشِ رفتاریِ
# backend/scripts/testCloudflarePanel.js گرفت («کانفیگ به وضعیتِ قبلی برمی‌گردد»).
apply_nginx() {
  local backup="$1" test_out=""
  # ⚠️ خروجیِ nginx باید در لاگ بیفتد. نسخهٔ اول آن را به /dev/null می‌ریخت و
  #    وقتی روی سرورِ تولید کانفیگ رد شد، تنها چیزی که می‌شد فهمید «رد شد» بود
  #    نه «چرا». (علت واقعی: چسبیدنِ دو فهرستِ آی‌پی به هم.)
  if test_out=$(nginx -t 2>&1) && systemctl reload nginx; then
    log "کانفیگِ nginx سالم بود و reload شد. (پشتیبان: $backup)"
    return 0
  fi
  log "خطا: کانفیگِ nginx رد شد؛ برگشت به پشتیبان."
  printf '%s\n' "$test_out" | head -5 | sed 's/^/    nginx: /' | tee -a "$LOG" >/dev/null
  cp -p "$backup" "$SITE"
  if nginx -t >/dev/null 2>&1 && systemctl reload nginx; then
    log "بازگردانی موفق بود؛ سایت روی حالتِ قبلی سالم است."
  else
    log "بازگردانی هم ناموفق بود — توجهِ انسانی لازم است (پشتیبان: $backup)."
  fi
  return 1
}

# ═══════════════════════════════════════════════════════════════════════════
#  اجرا
# ═══════════════════════════════════════════════════════════════════════════
main() {
  mkdir -p "$BACKUP_DIR"
  local backup="$BACKUP_DIR/ghelgheli.$(date +%F-%H%M%S).$$.cloudflare.bak"
  cp -p "$SITE" "$backup"     # عکسِ لحظهٔ قبل از تغییر — مرجعِ برگشت

  if [ "$WANT" = "on" ]; then
    build_snippet || exit 1
    enable_include
    apply_nginx "$backup" || exit 1
    write_applied "on"
    log "سپرِ کلادفلر از دیدِ سرور فعال شد — آی‌پیِ واقعیِ کاربر خوانده می‌شود."
  elif [ "$WANT" = "off" ] || [ -z "$WANT" ]; then
    disable_include
    apply_nginx "$backup" || exit 1
    write_applied "${WANT:-off}"
    log "سپر از دیدِ سرور خاموش است — ترافیک مستقیم، آی‌پیِ خودِ کاربر."
  else
    log "مقدارِ ناشناخته در فایلِ حالت: '$WANT' — کاری انجام نشد."
    exit 1
  fi
}
main
