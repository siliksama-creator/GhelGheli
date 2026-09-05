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
  # در Kotlin DSL extension اندروید مستقیم در دسترس نیست؛ با reflection روی
  # extension کاملاًن‌شدهٔ com.android.build.gradle.BaseExtension مقداردهی
  # می‌کنیم (در Groovy و Kotlin هر دو به یک شکل کامپایل می‌شود).
  cat >> "$ROOT" <<EOF

// ── $MARKER ──
// پلاگین‌های جدید (onnxruntime، androidx/*) به compileSdk >= 34 نیاز دارند.
// بلندکردن فقط app کافی نیست؛ برای هر زیرپروژه بعد از ارزیابی تنظیم می‌شود.
subprojects {
    val applyCompileSdk = {
        val androidExt = extensions.findByName("android")
        if (androidExt != null) {
            // چند امضا در نسخه‌های مختلف AGP وجود دارد: setCompileSdk(int|String)
            // یا setCompileSdkVersion(int).
            try {
                val m = androidExt.javaClass.methods.firstOrNull {
                    it.name == "setCompileSdk" && it.parameterTypes.size == 1
                        && (it.parameterTypes[0] == Int::class.javaPrimitiveType || it.parameterTypes[0] == String::class.java)
                }
                if (m != null) {
                    if (m.parameterTypes[0] == Int::class.javaPrimitiveType) m.invoke(androidExt, $SDK)
                    else m.invoke(androidExt, "android-$SDK")
                } else {
                    androidExt.javaClass.methods.first { it.name == "setCompileSdkVersion" }
                        .invoke(androidExt, $SDK)
                }
            } catch (ignored: Exception) { }
        }
    }
    // در چیدمان جدید فلاتر (settings.gradle.kts + includeBuild) ممکن است بعضی
    // ماژول‌ها تا این لحظه قبلاً evaluate شده باشند؛ afterEvaluate روی پروژهٔ
    // evaluate‌شده خطا می‌دهد. هر دو حالت را پوشش می‌دهیم.
    if (state.executed) {
        applyCompileSdk()
    } else {
        afterEvaluate { applyCompileSdk() }
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
