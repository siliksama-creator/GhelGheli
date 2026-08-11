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

# ═══════════════════════════════════════════════════════════════════════════
# <queries> — بدون این، دکمه‌های اشتراک‌گذاری روی اندروید ۱۱+ نمی‌کارند
# ═══════════════════════════════════════════════════════════════════════════
#
# از اندروید ۱۱ (API 30) «نمایان‌بودنِ بسته‌ها» محدود شد: یک اپ فقط
# اپ‌هایی را می‌بیند که در <queries> اعلام کرده باشد. اثرش روی ما:
#
#   • `canLaunchUrl('tg://...')` همیشه false برمی‌گرداند، حتی وقتی
#     تلگرام نصب است،
#   • و در بعضی دستگاه‌ها خودِ `launchUrl` هم با
#     ActivityNotFoundException شکست می‌خورد.
#
# یعنی صفحهٔ دعوت چهار دکمه داشت که هیچ‌کدام کار نمی‌کردند — و چون
# استثنا گرفته می‌شود، هیچ خطایی هم دیده نمی‌شد. فقط «هیچ اتفاقی
# نمی‌افتد»، بدترین حالتِ ممکن برای کاربر.
#
# منطقِ کد (core/share_invite.dart) عمداً به `canLaunchUrl` تکیه
# نمی‌کند و مستقیم امتحان می‌کند، ولی اعلامِ scheme همچنان لازم است
# تا Intent اصلاً حل شود.
QUERIES_BODY = """        <!-- پیام‌رسان‌هایی که کد دعوت به آن‌ها فرستاده می‌شود -->
        <intent>
            <action android:name="android.intent.action.VIEW"/>
            <data android:scheme="tg"/>
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW"/>
            <data android:scheme="whatsapp"/>
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW"/>
            <data android:scheme="rubika"/>
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW"/>
            <data android:scheme="bale"/>
        </intent>
        <!-- بازگشتِ وب، وقتی هیچ‌کدام از اپ‌های بالا نصب نیستند -->
        <intent>
            <action android:name="android.intent.action.VIEW"/>
            <data android:scheme="https"/>
        </intent>
"""

# ═══════════════════════════════════════════════════════════════════════════
# چرا «آیا <queries> هست؟» بررسیِ غلطی بود
# ═══════════════════════════════════════════════════════════════════════════
#
# نسخهٔ قبلی این بود:
#
#     if "<queries>" not in src: ...اضافه کن
#     else: print("already present")
#
# در فلاترِ قدیمی درست کار می‌کرد چون مانیفستِ تولیدشده هیچ <queries>
# نداشت. ولی `flutter create` در نسخه‌های جدید **خودش** یک بلوکِ
# <queries> می‌گذارد (برای PROCESS_TEXT). آن‌وقت شرط رد می‌شد، پیامِ
# دلگرم‌کنندهٔ «already present» چاپ می‌شد، و scheme های پیام‌رسان‌ها
# **هرگز اضافه نمی‌شدند**.
#
# بیلد بلافاصله بعدش در مرحلهٔ راستی‌آزمایی می‌افتاد — که خوب است —
# ولی پیامِ لاگ دقیقاً خلافِ واقعیت را می‌گفت و دنبال کردنش وقت می‌برد.
#
# درسِ کلی: شرط باید همان چیزی را بسنجد که واقعاً می‌خواهیم، نه یک
# نشانهٔ غیرمستقیم. چیزی که می‌خواهیم «scheme های ما اعلام شده‌اند»
# است، نه «تگِ <queries> وجود دارد».
if 'android:scheme="tg"' in src:
    print("messenger schemes already declared")
elif "<queries>" in src:
    # بلوکِ فلاتر هست: محتوای ما را داخلش تزریق کن، نه یک بلوکِ دوم.
    # دو تگِ <queries> در یک مانیفست خطای مِرج می‌دهد.
    src = src.replace("<queries>", "<queries>\n" + QUERIES_BODY, 1)
    print("merged messenger schemes into existing <queries>")
else:
    # درست پیش از بسته شدنِ <manifest> — هر جای دیگری معتبر نیست.
    src = src.replace("</manifest>",
                      "    <queries>\n" + QUERIES_BODY + "    </queries>\n</manifest>", 1)
    print("added <queries> for messenger deep links")

# Ship a real Persian app name rather than the raw Dart package identifier.
src = src.replace('android:label="ghelgheli_mobile"', 'android:label="GhelGheli"')

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print(f'added permissions: {missing or "none (already present)"}')
PY

# ── Stable production application id ───────────────────────────────────────
# Flutter generates com.example.ghelgheli_mobile on every clean CI runner.
# That placeholder cannot be published safely and Firebase binds its Android
# app permanently to the package id. Patch every generated location to the
# final id selected by the owner before Google Services is evaluated.
python3 - <<'PY'
from pathlib import Path
import re

package = 'ir.ghelghelishop.ghelgheli'
app = Path('android/app/build.gradle.kts')
groovy = Path('android/app/build.gradle')
if app.exists():
    src = app.read_text()
    src, n1 = re.subn(r'(namespace\s*=\s*)["\'][^"\']+["\']',
                      rf'\1"{package}"', src, count=1)
    src, n2 = re.subn(r'(applicationId\s*=\s*)["\'][^"\']+["\']',
                      rf'\1"{package}"', src, count=1)
    if not (n1 and n2):
        raise SystemExit('ERROR: namespace/applicationId not found in Kotlin Gradle')
    app.write_text(src)
elif groovy.exists():
    src = groovy.read_text()
    src, n1 = re.subn(r'(namespace\s+)["\'][^"\']+["\']',
                      rf'\1"{package}"', src, count=1)
    src, n2 = re.subn(r'(applicationId\s+)["\'][^"\']+["\']',
                      rf'\1"{package}"', src, count=1)
    if not (n1 and n2):
        raise SystemExit('ERROR: namespace/applicationId not found in Gradle')
    groovy.write_text(src)
else:
    raise SystemExit('ERROR: Android app Gradle file not found')

activities = list(Path('android/app/src/main').rglob('MainActivity.kt'))
activities += list(Path('android/app/src/main').rglob('MainActivity.java'))
if len(activities) != 1:
    raise SystemExit(f'ERROR: expected one MainActivity, found {len(activities)}')
old = activities[0]
text = re.sub(r'^package\s+[\w.]+', f'package {package}', old.read_text(), count=1,
              flags=re.MULTILINE)
new = Path('android/app/src/main') / ('kotlin' if old.suffix == '.kt' else 'java')
new = new.joinpath(*package.split('.'), old.name)
new.parent.mkdir(parents=True, exist_ok=True)
new.write_text(text)
if new != old:
    old.unlink()

manifest = Path('android/app/src/main/AndroidManifest.xml')
ms = manifest.read_text()
ms = ms.replace('android:name=".MainActivity"',
                f'android:name="{package}.MainActivity"')
manifest.write_text(ms)
print(f'production package id: {package}')
PY

# ── Firebase / Google Services ─────────────────────────────────────────────
# فایل از GitHub Secret در CI بازسازی می‌شود و هرگز وارد git نمی‌شود. بدون
# plugin گوگل، وجودِ google-services.json به‌تنهایی هیچ resourceای برای
# Firebase.initializeApp تولید نمی‌کند و push بی‌صدا خاموش می‌ماند.
if [ -f android/app/google-services.json ]; then
  python3 - <<'PY'
from pathlib import Path

settings = Path('android/settings.gradle.kts')
app = Path('android/app/build.gradle.kts')
if settings.exists() and app.exists():
    s = settings.read_text()
    marker = 'id("com.android.application")'
    if 'com.google.gms.google-services' not in s:
        pos = s.find(marker)
        if pos < 0:
            raise SystemExit('ERROR: Android application plugin marker not found')
        line_end = s.find('\n', pos)
        s = s[:line_end + 1] + '    id("com.google.gms.google-services") version "4.4.3" apply false\n' + s[line_end + 1:]
        settings.write_text(s)
    a = app.read_text()
    if 'com.google.gms.google-services' not in a:
        a = a.replace('plugins {', 'plugins {\n    id("com.google.gms.google-services")', 1)
        app.write_text(a)
else:
    raise SystemExit('ERROR: Gradle Kotlin files not found')

# A valid JSON for a different Android package builds surprisingly far and
# then Firebase.initializeApp fails at runtime. Fail CI at the source instead.
import json
cfg = json.loads(Path('android/app/google-services.json').read_text())
packages = {
    c.get('client_info', {}).get('android_client_info', {}).get('package_name')
    for c in cfg.get('client', [])
}
expected = 'ir.ghelghelishop.ghelgheli'
if expected not in packages:
    raise SystemExit(f'ERROR: google-services.json has {sorted(packages)}, expected {expected}')
PY
  echo "  OK   Firebase google-services plugin and package id"
else
  echo "  WARN google-services.json نیست؛ اپ ساخته می‌شود ولی Push غیرفعال می‌ماند"
fi

echo "--- verifying ---"
for p in INTERNET ACCESS_NETWORK_STATE POST_NOTIFICATIONS; do
  if grep -q "android.permission.$p" "$MANIFEST"; then
    echo "  OK   $p"
  else
    echo "  FAIL $p is missing"
    exit 1
  fi
done
grep -q 'android:label="GhelGheli"' "$MANIFEST" && echo "  OK   app label" || echo "  WARN app label unchanged"
grep -Rqs 'ir.ghelghelishop.ghelgheli' android/app/build.gradle* \
  && grep -Rqs '^package ir.ghelghelishop.ghelgheli' android/app/src/main \
  && echo "  OK   production package id" \
  || { echo "  FAIL production package id"; exit 1; }

# بدون <queries> صفحهٔ دعوت چهار دکمهٔ بی‌اثر دارد و هیچ خطایی هم
# دیده نمی‌شود — پس اینجا سخت‌گیرانه بررسی می‌شود.
for sch in tg whatsapp rubika bale; do
  if grep -q "android:scheme=\"$sch\"" "$MANIFEST"; then
    echo "  OK   query scheme $sch"
  else
    echo "  FAIL query scheme $sch is missing — دکمهٔ اشتراک‌گذاری کار نمی‌کند"
    exit 1
  fi
done
