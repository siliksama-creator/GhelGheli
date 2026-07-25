#!/usr/bin/env bash
#
# Patches the Android project that `flutter create` regenerates in CI.
#
# WHY THIS EXISTS
# `mobile/android/` is gitignored and rebuilt from scratch on every CI run.
# Flutter's generated project puts <uses-permission android:name="INTERNET">
# only in the DEBUG manifest — the release manifest has no permissions at
# all. The shipped APK therefore had no network access, which is why login,
# card images, ticket attachments and the game sockets all failed for real
# users while working perfectly in local/debug testing.
#
# Run from the `mobile/` directory after `flutter create --platforms=android .`
set -Eeuo pipefail

MANIFEST="android/app/src/main/AndroidManifest.xml"
[ -f "$MANIFEST" ] || { echo "ERROR: $MANIFEST not found (run flutter create first)"; exit 1; }

python3 - "$MANIFEST" <<'PY'
import sys

path = sys.argv[1]
with open(path, encoding='utf-8') as f:
    src = f.read()

PERMISSIONS = [
    # Without this the release APK cannot reach the API at all.
    'android.permission.INTERNET',
    # Lets the app tell "offline" apart from "server down".
    'android.permission.ACCESS_NETWORK_STATE',
    # Android 13+ runtime permission for FCM notifications.
    'android.permission.POST_NOTIFICATIONS',
]

anchor = '<manifest xmlns:android="http://schemas.android.com/apk/res/android">'
missing = [p for p in PERMISSIONS if p not in src]
if missing:
    block = ''.join(f'    <uses-permission android:name="{p}"/>\n' for p in missing)
    src = src.replace(anchor, anchor + '\n' + block, 1)

# Ship a real Persian app name rather than the raw Dart package identifier.
src = src.replace('android:label="ghelgheli_mobile"', 'android:label="قل‌قلی"')

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print(f'added permissions: {missing or "none (already present)"}')
PY

echo "--- verifying ---"
for p in INTERNET ACCESS_NETWORK_STATE POST_NOTIFICATIONS; do
  if grep -q "android.permission.$p" "$MANIFEST"; then
    echo "  OK   $p"
  else
    echo "  FAIL $p is missing"
    exit 1
  fi
done
grep -q 'android:label="قل‌قلی"' "$MANIFEST" && echo "  OK   app label" || echo "  WARN app label unchanged"
