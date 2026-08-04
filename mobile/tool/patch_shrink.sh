#!/usr/bin/env bash
#
# فعال کردن R8 (کوچک‌سازی و مبهم‌سازی کد) در بیلد ریلیز.
#
# ═══════════════════════════════════════════════════════════════════════════
# چرا این اسکریپت وجود دارد
# ═══════════════════════════════════════════════════════════════════════════
#
# `mobile/android/` در گیت نیست و CI هر بار با `flutter create` از نو
# می‌سازدش، پس هر تنظیمی که در build.gradle بنویسیم پیش از بیلد پاک
# می‌شود. دقیقاً همان دلیلی که tool/patch_android.sh و
# tool/patch_signing.sh وجود دارند.
#
# ═══════════════════════════════════════════════════════════════════════════
# چرا R8 مهم است — و چرا فقط دربارهٔ اندازهٔ فایل نیست
# ═══════════════════════════════════════════════════════════════════════════
#
# پروژهٔ پیش‌فرضِ فلاتر R8 را **خاموش** می‌گذارد. اثرش سه‌تاست:
#
#   ۱. **اندازهٔ APK.** کلاس‌ها و متدهای بی‌استفادهٔ کتابخانه‌ها
#      (firebase، dio، audioplayers، image_picker) همه در DEX می‌مانند.
#
#   ۲. **حافظهٔ زمان اجرا — دلیل اصلیِ این تغییر.** اندروید فایل‌های DEX
#      را در حافظه mmap می‌کند و جدول‌های کلاس/متد/رشته را برای هر پروسه
#      نگه می‌دارد. DEX بزرگ‌تر یعنی جدول‌های بزرگ‌تر و صفحاتِ بیشترِ
#      رزیدنت — هزینه‌ای که از لحظهٔ اجرا پرداخت می‌شود، حتی اگر آن کدها
#      هرگز فراخوانی نشوند. روی گوشیِ کم‌رم که مالک نگرانش بود، همین
#      تفاوت بین «اپ زنده می‌ماند» و «سیستم می‌کشدش» است.
#
#   ۳. **زمان راه‌اندازی.** verify و بارگذاریِ DEX کمتر.
#
# ═══════════════════════════════════════════════════════════════════════════
# چرا قوانین keep لازم‌اند و چه اتفاقی بدون آن‌ها می‌افتد
# ═══════════════════════════════════════════════════════════════════════════
#
# R8 هر کلاسی را که «از کد قابل رسیدن نباشد» حذف می‌کند. ولی چند دسته
# کلاس از جاهایی صدا زده می‌شوند که R8 نمی‌بیند:
#
#   • کلاس‌هایی که از **JNI / کد بومیِ فلاتر** با نام رشته‌ای پیدا
#     می‌شوند (خودِ موتور فلاتر و پلاگین‌ها).
#   • کلاس‌هایی که با **بازتاب (reflection)** ساخته می‌شوند — Firebase
#     و Gson دقیقاً همین کار را می‌کنند.
#   • کلاس‌هایی که فقط در **AndroidManifest** نام برده شده‌اند.
#
# اگر این‌ها keep نشوند، بیلد موفق می‌شود و اپ **در زمان اجرا** با
# ClassNotFoundException کرش می‌کند — بدترین حالت ممکن، چون تستِ دیباگ
# (که R8 ندارد) هیچ‌وقت آن را نشان نمی‌دهد.
#
# برای همین `minifyEnabled` روشن ولی `shrinkResources` هم روشن است و
# قوانین زیر محافظه‌کارانه نوشته شده‌اند: هر چیزی که ممکن است از بیرونِ
# دیدِ R8 صدا زده شود، نگه داشته می‌شود. سود اصلی از حذفِ کتابخانه‌های
# بی‌استفاده می‌آید، نه از تراشیدنِ کدِ خودمان.
#
# از پوشهٔ `mobile/` اجرا شود، بعد از `flutter create --platforms=android .`
set -Eeuo pipefail

KTS="android/app/build.gradle.kts"
GRADLE="android/app/build.gradle"
RULES="android/app/proguard-rules.pro"

if [ -f "$KTS" ]; then
  TARGET="$KTS"; FLAVOUR="kts"
elif [ -f "$GRADLE" ]; then
  TARGET="$GRADLE"; FLAVOUR="groovy"
else
  echo "ERROR: no app build.gradle(.kts) found — run flutter create first"
  exit 1
fi
echo "patching $TARGET ($FLAVOUR)"

mkdir -p "$(dirname "$RULES")"
cat > "$RULES" <<'RULES_EOF'
# قوانین R8 برای GhelGheli.
#
# اصلِ راهنما: محافظه‌کار باش. یک کلاسِ اضافه که نگه داشته شود چند
# کیلوبایت هزینه دارد؛ یک کلاسِ لازم که حذف شود، کرشِ زمانِ اجرا در
# دستِ کاربر است که در تستِ دیباگ اصلاً دیده نمی‌شود.

# ── فلاتر و کد بومی ──
# موتور فلاتر این‌ها را با نام از JNI پیدا می‌کند.
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.embedding.** { *; }
-dontwarn io.flutter.embedding.**

# ── Firebase / Google Play Services ──
# با بازتاب نمونه ساخته می‌شوند؛ حذفشان یعنی نوتیفیکیشن‌ها بی‌صدا
# می‌میرند.
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# ── audioplayers ──
# سرویس پخش از manifest صدا زده می‌شود، نه از کد.
-keep class xyz.luan.audioplayers.** { *; }

# ── image_picker ──
# از طریق Intent و FileProvider کار می‌کند.
-keep class androidx.core.content.FileProvider { *; }

# ── مدل‌های سریال‌شونده ──
# هر کلاسی که با بازتاب از JSON ساخته می‌شود باید نامش بماند.
-keepattributes Signature
-keepattributes *Annotation*
-keepattributes InnerClasses
-keepattributes EnclosingMethod

# ── ردیابیِ کرش ──
# بدون این، استک‌تریسِ کرش‌های ریلیز بی‌معنی می‌شود و دیباگ کردنِ
# گزارشِ کاربر عملاً غیرممکن است.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ── هشدارهای بی‌خطر ──
# این کلاس‌ها فقط در محیط‌های دیگر (دسکتاپ/سرور) وجود دارند و اندروید
# هرگز به آن‌ها نمی‌رسد.
-dontwarn javax.annotation.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
RULES_EOF
echo "  wrote $RULES"

python3 - "$TARGET" "$FLAVOUR" <<'PY'
import re, sys

path, flavour = sys.argv[1], sys.argv[2]
src = open(path, encoding='utf-8').read()

if 'proguard-rules.pro' in src:
    print('shrink config already present')
    raise SystemExit(0)

if flavour == 'kts':
    # نکتهٔ ظریف: پروژهٔ تولیدیِ فلاتر معمولاً بلوک release را با
    # `signingConfig` می‌سازد. ما داخل همان بلوک اضافه می‌کنیم تا مطمئن
    # شویم فقط ریلیز کوچک می‌شود — کوچک کردنِ دیباگ، هر بار بیلدِ محلی
    # را کند می‌کند بدون هیچ سودی.
    addition = '''
            // ── R8 (کوچک‌سازی کد و منابع) — tool/patch_shrink.sh ──
            //
            // فلاتر این‌ها را پیش‌فرض خاموش می‌گذارد. روشن بودنشان هم
            // APK را کوچک می‌کند و هم — مهم‌تر — جدول‌های DEX را که
            // اندروید برای کل عمرِ پروسه رزیدنت نگه می‌دارد.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
'''
    pat = re.compile(r'(release\s*\{)')
else:
    addition = '''
            // ── R8 (کوچک‌سازی کد و منابع) — tool/patch_shrink.sh ──
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
'''
    pat = re.compile(r'(release\s*\{)')

new, n = pat.subn(lambda m: m.group(1) + addition, src, count=1)
if n == 0:
    print('ERROR: could not find a release build type block')
    raise SystemExit(1)

open(path, 'w', encoding='utf-8').write(new)
print('shrink config injected')
PY

echo "--- verifying ---"
grep -q 'proguard-rules.pro' "$TARGET" \
  && echo "  OK   proguard rules wired" \
  || { echo "  FAIL proguard rules not wired"; exit 1; }
if grep -qE 'isMinifyEnabled = true|minifyEnabled true' "$TARGET"; then
  echo "  OK   minify enabled"
else
  echo "  FAIL minify not enabled"
  exit 1
fi
[ -f "$RULES" ] && echo "  OK   $RULES exists"
