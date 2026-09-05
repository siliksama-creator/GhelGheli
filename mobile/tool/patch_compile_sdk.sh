#!/usr/bin/env bash
#
# رساندنِ compileSdk همهٔ ماژول‌ها به ۳۵.
#
# پلاگینِ onnxruntime (مدل بردار کارت) و وابسته‌های androidx چند پلاگینِ دیگر
# علیه android-34+ کامپایل می‌شوند. `flutter create` پیش‌فرضِ پایین‌تری
# می‌گذارد؛ فقط بلندکردنِ compileSdk خودِ app کافی نیست چون ماژول‌های پلاگین
# (url_launcher، audioplayers، onnxruntime …) هرکدام checkAarMetadata خود را
# دارند. این تکه را در فایلِ گرادلِ سطح پروژه تزریق می‌کنیم تا بعد از ارزیابیِ
# هر زیرپروژه، compileSdk آن به ۳۵ برسد.
#
# فلاترِ جدید (3.47) پروژه را با Kotlin DSL می‌سازد (build.gradle.kts)؛
# نسخه‌های قدیمی Groovy (build.gradle). هر دو را پوشش می‌دهیم. مثل بقیهٔ پچ‌ها،
# android/ در گیت نیست و در CI بازساخته می‌شود.
set -Eeuo pipefail

cd "$(dirname "$0")/.."
SDK=35
MARKER="GG_COMPILE_SDK_PATCH"

# فایل سطح پروژه (root) را پیدا کن.
ROOT=""
for f in android/build.gradle.kts android/build.gradle; do
  if [ -f "$f" ]; then ROOT="$f"; break; fi
done

if [ -z "$ROOT" ]; then
  echo "android/build.gradle(.kts) پیدا نشد — آیا flutter create اجرا شده؟" >&2
  exit 1
fi

if ! grep -q "$MARKER" "$ROOT"; then
  cat >> "$ROOT" <<EOF

// ── $MARKER ──
// پلاگین‌های جدید (onnxruntime، androidx/*) به compileSdk >= 34 نیاز دارند.
// بلندکردن فقط app کافی نیست؛ برای هر زیرپروژه بعد از ارزیابی تنظیم می‌شود.
subprojects {
    afterEvaluate {
        if (it.hasProperty('android')) {
            it.android {
                if (compileSdk == null || compileSdk < $SDK) {
                    compileSdk = $SDK
                }
            }
        }
    }
}
EOF
fi

# خودِ app را هم صریح بلند کن (در Kotlin DSL متغیر flutter.compileSdkVersion).
if [ -f android/app/build.gradle.kts ]; then
  sed -i "s/compileSdk = flutter.compileSdkVersion/compileSdk = $SDK/" android/app/build.gradle.kts
elif [ -f android/app/build.gradle ]; then
  sed -i "s/compileSdkVersion flutter.compileSdkVersion/compileSdkVersion $SDK/" android/app/build.gradle
fi

echo "پچِ compileSdk=$SDK اعمال شد روی $ROOT"
