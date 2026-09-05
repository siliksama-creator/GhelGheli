#!/usr/bin/env bash
#
# رساندنِ compileSdk همهٔ ماژول‌ها به ۳۵.
#
# پلاگینِ onnxruntime (مدل بردار کارت) و وابسته‌های androidx چند پلاگینِ دیگر
# علیه android-34+ کامپایل می‌شوند. `flutter create` پیش‌فرضِ پایین‌تری
# می‌گذارد؛ فقط بلندکردنِ compileSdk خودِ app کافی نیست چون ماژول‌های پلاگین
# (url_launcher، audioplayers، onnxruntime …) هرکدام checkAarMetadata خود را
# روی همان عدد دارند. این تکه را در android/build.gradle (سطح پروژه) تزریق
# می‌کنیم تا بعد از ارزیابیِ هر پروژه، compileSdk آن به ۳۵ برسد.
#
# مثل بقیهٔ پچ‌ها، android/ در گیت نیست و در CI بازساخته می‌شود.
set -euo pipefail

cd "$(dirname "$0")/.."
GRADLE="android/build.gradle"
MARKER="GG_COMPILE_SDK_PATCH"
SDK=35

if [ ! -f "$GRADLE" ]; then
  echo "android/build.gradle پیدا نشد" >&2
  exit 1
fi

if grep -q "$MARKER" "$GRADLE"; then
  echo "پچِ compileSdk از قبل هست"
  exit 0
fi

cat >> "$GRADLE" <<EOF

// ── $MARKER ──
// پلاگین‌های جدید (onnxruntime، androidx/*) به compileSdk >= 34 نیاز دارند.
// بلندکردن فقط app کافی نیست؛ پس برای هر زیرپروژه بعد از ارزیابی تنظیم می‌شود.
subprojects {
    afterEvaluate { project ->
        if (project.hasProperty('android')) {
            project.android {
                if (compileSdk == null) {
                    compileSdk = $SDK
                } else if (compileSdk < $SDK) {
                    compileSdk = $SDK
                }
            }
        }
    }
}
EOF

# خودِ app را هم صریح بلند کن (مسیر پیش‌فرض ممکن است compileSdkVersion قدیمی باشد).
if [ -f android/app/build.gradle.kts ]; then
  sed -i "s/compileSdk = flutter.compileSdkVersion/compileSdk = $SDK/" android/app/build.gradle.kts
elif [ -f android/app/build.gradle ]; then
  sed -i "s/compileSdkVersion flutter.compileSdkVersion/compileSdkVersion $SDK/" android/app/build.gradle
fi

echo "پچِ compileSdk=$SDK اعمال شد"
