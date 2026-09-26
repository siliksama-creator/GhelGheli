#!/usr/bin/env bash
# انتشارِ خروجیِ Vite بدونِ پاک‌کردنِ چانک‌های hashدارِ قبلی.
#
#   publish-spa-dist.sh <next-dir> <live-dir> [map-dir]
#
# چرا: `vite build` پوشهٔ live را خالی می‌کند. هر تبِ باز (وب، کرومِ اندروید،
# پنل) هنوز به اسمِ قبلی اشاره می‌کند و آن فایل ۴۰۴ می‌شود. اگر آن ۴۰۴
# immutable کش شده باشد، رفرش هم درمانش نمی‌کند.
#
# ترتیب مهم است: اول دارایی‌های تازه کنارِ قبلی‌ها می‌نشینند، بعد index.html
# عوض می‌شود. هیچ پنجره‌ای نیست که HTMLِ تازه به فایلِ نبود اشاره کند، یا
# HTMLِ کهنه به فایلی که پاک شده. *.map هرگز سرو نمی‌شود. فایلِ قدیمی‌تر از
# KEEP_DAYS (پیش‌فرض ۳۰) حذف می‌شود.
set -euo pipefail

NEXT="${1:?next dir}"
LIVE="${2:?live dir}"
MAP_DIR="${3:-}"
KEEP_DAYS="${KEEP_DAYS:-30}"

if [ ! -f "$NEXT/index.html" ]; then
  echo "publish-spa-dist: index.html در $NEXT نیست" >&2
  exit 1
fi

if [ -n "$MAP_DIR" ]; then
  mkdir -p "$MAP_DIR"
  find "$NEXT" -name '*.map' -type f -exec mv {} "$MAP_DIR/" \;
else
  find "$NEXT" -name '*.map' -type f -delete
fi

mkdir -p "$LIVE/assets" "$NEXT/assets"

# فایل‌های hashدارِ قبلی را به درختِ تازه بیاور. روی فایلِ بیلدِ جدید
# بازنویسی نکن — اسمِ یکسان یعنی محتوای یکسان.
if [ -d "$LIVE/assets" ]; then
  while IFS= read -r -d '' f; do
    rel="${f#"$LIVE/assets"/}"
    dest="$NEXT/assets/$rel"
    if [ ! -e "$dest" ]; then
      mkdir -p "$(dirname "$dest")"
      cp -a "$f" "$dest"
    fi
  done < <(find "$LIVE/assets" -type f -print0)
fi

find "$NEXT/assets" -type f -mtime "+${KEEP_DAYS}" -delete

mkdir -p "$LIVE"
cp -a "$NEXT/assets/." "$LIVE/assets/"

while IFS= read -r -d '' item; do
  base="$(basename "$item")"
  case "$base" in
    assets|index.html) continue ;;
  esac
  cp -a "$item" "$LIVE/$base"
done < <(find "$NEXT" -mindepth 1 -maxdepth 1 -print0)

# index.html آخر، و با rename تا نیمهٔ فایل سرو نشود.
cp -a "$NEXT/index.html" "$LIVE/index.html.next"
mv -f "$LIVE/index.html.next" "$LIVE/index.html"

find "$LIVE" -name '*.map' -type f -delete
find "$LIVE/assets" -type f -mtime "+${KEEP_DAYS}" -delete
rm -rf "$NEXT"
