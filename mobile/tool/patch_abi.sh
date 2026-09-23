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
# چه مشکلی را می‌بندد (دو اندازه‌گیریِ زنده، ۲ مهر ۱۴۰۵)
# ═══════════════════════════════════════════════════════════════════════════
# از وقتی انتشار از پنلِ خودمان انجام می‌شود، APK **یونیورسال** ساخته
# می‌شود: یک فایل برای همهٔ گوشی‌ها.
#
#   ۱. `--target-platform` فقط خودِ اپ را محدود می‌کند: فایلِ ۹۰ مگابایتیِ
#      اول `lib/arm64-v8a`، `lib/armeabi-v7a` **و** `lib/x86_64` را داشت.
#   ۲. `ndk.abiFilters` هم کافی نبود: کتابخانهٔ بومیِ پلاگین‌ها از AARهای
#      آماده می‌آید و در مرحلهٔ **بسته‌بندی** کنارِ فیلترِ بیلد می‌نشیند.
#      گاردِ «Sanity check» در ورک‌فلو همان را گرفت
#      (`lib/x86_64/libdatastore_shared_counter.so`).
#
# پس هر دو لایه اعمال می‌شود:
#   • defaultConfig.ndk.abiFilters      → محدودکردنِ بیلدِ NDK
#   • android.packaging.jniLibs.excludes → بیرون‌گذاشتنِ کتابخانه‌های آمادهٔ
#     وابستگی‌ها (قطعیِ قطعی)
#
# ⚠️ این کار جای `--split-per-abi` را نمی‌گیرد (و نباید بگیرد): آن گزینه
#    برای سبک‌ترکردنِ دانلود بود؛ یونیورسال عمداً سنگین‌تر است تا یک لینک
#    برای همه کافی باشد. هدف این‌جاست که حجمِ مردهٔ شبیه‌ساز دانلود نشود.
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

DEAD_ABIS = ['lib/x86_64/**', 'lib/x86/**', 'lib/mips/**', 'lib/mips64/**']
changed = []

# ── ۱) فیلترِ بیلدِ NDK داخلِ defaultConfig ────────────────────────────────
if 'abiFilters' not in src:
    m = re.search(r'(?:^|\n)[ \t]*defaultConfig\s*\{', src)
    if not m:
        print('ERROR: defaultConfig block not found')
        raise SystemExit(1)
    if flavour == 'kts':
        inner = ('\n        ndk {\n'
                 '            abiFilters listOf("arm64-v8a", "armeabi-v7a")\n'
                 '        }\n')
    else:
        inner = ("\n        ndk {\n"
                 "            abiFilters 'arm64-v8a', 'armeabi-v7a'\n"
                 "        }\n")
    src = src[:m.end()] + inner + src[m.end():]
    changed.append('abiFilters')

# ── ۲) بیرون‌گذاشتنِ کتابخانه‌های آمادهٔ وابستگی‌ها در بسته‌بندی ────────────
if 'jniLibs' not in src:
    m = re.search(r'(?:^|\n)[ \t]*android\s*\{', src)
    if not m:
        print('ERROR: android block not found')
        raise SystemExit(1)
    if flavour == 'kts':
        block = ('\n    packaging {\n'
                 '        jniLibs {\n'
                 '            // پلاگین‌ها کتابخانهٔ بومیِ آمادهٔ خود را برای هر سه\n'
                 '            // معماری داخلِ AAR دارند؛ این فهرست در مرحلهٔ بسته‌بندی\n'
                 '            // آن‌ها را بیرون می‌گذارد (injected by tool/patch_abi.sh).\n'
                 '            excludes.addAll(listOf(' +
                 ', '.join('"%s"' % a for a in DEAD_ABIS) + '))\n'
                 '        }\n'
                 '    }\n')
    else:
        block = ("\n    packaging {\n"
                 "        jniLibs {\n"
                 "            excludes.addAll([" +
                 ', '.join("'%s'" % a for a in DEAD_ABIS) + '])\n'
                 "        }\n"
                 "    }\n")
    src = src[:m.end()] + block + src[m.end():]
    changed.append('jniLibsExcludes')

open(path, 'w', encoding='utf-8').write(src)
print('changed:', ', '.join(changed) if changed else 'nothing (already patched)')
PY

echo "--- verifying ---"
grep -q 'abiFilters' "$TARGET" && echo "  OK   abiFilters present" \
  || { echo "  FAIL abiFilters missing"; exit 1; }
grep -q 'jniLibs' "$TARGET" && echo "  OK   jniLibs excludes present" \
  || { echo "  FAIL jniLibs excludes missing"; exit 1; }
