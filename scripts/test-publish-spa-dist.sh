#!/usr/bin/env bash
# قفلِ «دیپلوی چانکِ تبِ باز را پاک نکند و index.html را آخر بنویسد».
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
LIVE="$TMP/live"
NEXT="$TMP/next"
MAPS="$TMP/maps"
mkdir -p "$LIVE/assets" "$NEXT/assets"

echo old > "$LIVE/assets/photo-cards-OLD.js"
touch -d '10 days ago' "$LIVE/assets/photo-cards-OLD.js"
echo ancient > "$LIVE/assets/photo-cards-ANCIENT.js"
touch -d '40 days ago' "$LIVE/assets/photo-cards-ANCIENT.js"
printf '%s\n' '<script src="/assets/photo-cards-NEW.js"></script>' > "$NEXT/index.html"
echo new > "$NEXT/assets/photo-cards-NEW.js"
echo map > "$NEXT/assets/photo-cards-NEW.js.map"
echo sw > "$NEXT/image-cache-sw.js"

KEEP_DAYS=30 bash "$ROOT/scripts/publish-spa-dist.sh" "$NEXT" "$LIVE" "$MAPS"

test -f "$LIVE/assets/photo-cards-NEW.js"
test -f "$LIVE/assets/photo-cards-OLD.js"
test ! -e "$LIVE/assets/photo-cards-ANCIENT.js"
test ! -e "$LIVE/assets/photo-cards-NEW.js.map"
test -f "$MAPS/photo-cards-NEW.js.map"
test -f "$LIVE/image-cache-sw.js"
grep -q photo-cards-NEW "$LIVE/index.html"
test ! -d "$NEXT"
test ! -e "$LIVE/index.html.next"

NEXT="$TMP/next2"
mkdir -p "$NEXT/assets"
printf '%s\n' '<script src="/assets/photo-cards-NEWER.js"></script>' > "$NEXT/index.html"
echo newer > "$NEXT/assets/photo-cards-NEWER.js"
KEEP_DAYS=30 bash "$ROOT/scripts/publish-spa-dist.sh" "$NEXT" "$LIVE"
test -f "$LIVE/assets/photo-cards-OLD.js"
test -f "$LIVE/assets/photo-cards-NEWER.js"
grep -q photo-cards-NEWER "$LIVE/index.html"
echo "publish-spa-dist ok"
