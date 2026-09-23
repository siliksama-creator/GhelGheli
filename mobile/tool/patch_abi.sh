#!/usr/bin/env bash
#
# قفل‌کردنِ معماری‌های داخلِ APK روی arm64 + arm32.
#
# ═══════════════════════════════════════════════════════════════════════════
# چرا این اسکریپت وجود دارد
# ═══════════════════════════════════════════════════════════════════════════
# `mobile/android/` در گیت نیست و CI هر بار با `flutter create` از نو
# می‌سازدش؛ پس هر تنظیمی در گریدل باید در CI اعمال شود — همان دلیلی که
# patch_android.sh (مجوزها)، patch_signing.sh (امضا) و patch_shrink.sh (R8)
# وجود دارند.
#
# ═══════════════════════════════════════════════════════════════════════════
# چه مشکلی را می‌بندد (اندازه‌گیری‌شده، ۲ مهر ۱۴۰۵)
# ═══════════════════════════════════════════════════════════════════════════
# از وقتی انتشار از پنلِ خودمان انجام می‌شود، APK **یونیورسال** ساخته
# می‌شود: یک فایل برای همهٔ گوشی‌ها. ولی `--target-platform` فقط خودِ اپ را
# محدود می‌کند، نه وابستگی‌ها؛ نتیجه این بود که فایلِ ۹۰ مگابایتی
# `lib/x86_64/libdatastore_shared_counter.so` را هم داشت — کتابخانه‌ای که
# **فقط برای شبیه‌ساز** است و روی هیچ گوشیِ واقعی نصب نمی‌شود.
#
# `ndk.abiFilters` در گریدل روی **همهٔ ماژول‌ها** اثر می‌گذارد.
#
# ⚠️ این کار جای `--split-per-abi` را نمی‌گیرد (و نباید بگیرد):
#    آن گزینه برای **سبک‌ترکردنِ دانلود** بود؛ یونیورسال عمداً سنگین‌تر است
#    تا یک لینک برای همه کافی باشد. هدفِ این اسکریپت فقط برداشتنِ حجمِ مردهٔ
#    شبیه‌ساز است، نه برگشتن به چند فایل.
#
# اجرا: از پوشهٔ mobile/ بعد از `flutter create`.
set -Eeuo pipefail

cd "$(dirname "$0")/.."
KTS="android/app/build.gradle.kts"
GRADLE="android/app/build.gradle"

if [ -f "$KTS" ]; then TARGET="$KTS"; FLAVOUR="kts"
elif [ -f "$GRADLE" ]; then TARGET="$GRADLE"; FLAVOUR="groovy"
else
  echo "ERROR: no app build.gradle(.kts) found — run flutter create first" >&2
  exit 1
fi

python3 - "$TARGET" "$FLAVOUR" <<'PY'
import re, sys

path, flavour = sys.argv[1], sys.argv[2]
src = open(path, encoding='utf-8').read()

if 'abiFilters' in src:
    print('abiFilters already present')
    raise SystemExit(0)

m = re.search(r'\n\s*defaultConfig\s*\{', src)
if not m:
    print('ERROR: defaultConfig block not found')
    raise SystemExit(1)

if flavour == 'kts':
    inner = ('\n        ndk {\n'
             '            // x86_64 حذف می‌شود: کتابخانه‌های بومیِ پلاگین‌ها (مثل datastore)\n'
             '            // بدونِ این فیلتر برای شبیه‌ساز هم بسته‌بندی می‌شوند و فقط\n'
             '            // حجمِ دانلودِ کاربر را بالا می‌برند.\n'
             '            abiFilters += listOf("arm64-v8a", "armeabi-v7a")\n'
             '        }\n')
else:
    inner = ('\n        ndk {\n'
             "            abiFilters 'arm64-v8a', 'armeabi-v7a'\n"
             '        }\n')

at = m.end()
src = src[:at] + inner + src[at:]
open(path, 'w', encoding='utf-8').write(src)
print('abiFilters injected into defaultConfig')
PY

echo "--- verifying ---"
grep -q 'abiFilters' "$TARGET" && echo "  OK   abiFilters present" \
  || { echo "  FAIL abiFilters missing"; exit 1; }
