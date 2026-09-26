#!/usr/bin/env bash
# قفلِ «۴۰۴ِ چانک نباید immutable شود». nginx واقعی لازم نیست.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/scripts/nginx-asset-cache.py"
CONF="$ROOT/deploy/nginx-ghelgheli.conf"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

if grep -n 'immutable" always' "$CONF"; then
  echo "repo nginx still marks missing assets immutable" >&2
  exit 1
fi
grep -q 'location @ghelgheli_asset_miss' "$CONF"
grep -q 'no-store' "$CONF"

cat > "$TMP" <<'EOF'
server {
  server_name admin.example.com;
  location ^~ /assets/ {
    try_files $uri =404;
    expires 1y;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
  }
  location ^~ /ml/ {
    try_files $uri =404;
    add_header Cache-Control "public, max-age=2592000" always;
  }
}
server {
  server_name user.example.com;
  location ^~ /assets/ {
    try_files $uri =404;
    expires 1y;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
  }
}
EOF

python3 "$PY" "$TMP"
python3 - "$TMP" <<'PY'
import pathlib, sys
text = pathlib.Path(sys.argv[1]).read_text()
assert 'immutable" always' not in text, text
assert text.count('location @ghelgheli_asset_miss') == 2, text
assert text.count('Cache-Control "no-store"') == 2, text
assert 'try_files $uri @ghelgheli_asset_miss;' in text
assert 'max-age=2592000" always' not in text
assert 'public, max-age=31536000, immutable"' in text
print('fixture ok')
PY

cp "$TMP" "$TMP.once"
python3 "$PY" "$TMP"
cmp -s "$TMP" "$TMP.once"
echo "nginx asset-cache ok"
