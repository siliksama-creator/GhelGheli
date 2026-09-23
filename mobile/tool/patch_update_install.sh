#!/usr/bin/env bash
#
# تزریقِ نصب‌کنندهٔ داخل‌اپی به پروژهٔ اندرویدِ بازساخته‌شده در CI.
#
# ═══════════════════════════════════════════════════════════════════════════
# چرا این اسکریپت وجود دارد
# ═══════════════════════════════════════════════════════════════════════════
#
# از مهر ۱۴۰۵، دیالوگِ آپدیتِ اپ فایلِ APK را خودش دانلود می‌کند و باید
# نصب‌کنندهٔ سیستم را هم خودش باز کند (`lib/services/app_updater.dart`).
# آن فراخوان از یک MethodChannel به اسم `ghelgheli/update` می‌گذرد که سمتِ
# بومی‌اش (کاتلین) باید در `android/` باشد — ولی `android/` در git نیست و
# در هر اجرای CI با `flutter create` از نو ساخته می‌شود. پس مثلِ بقیهٔ
# پچ‌های `mobile/tool/`، این تکهٔ بومی هم این‌جا تزریق می‌شود.
#
# چه چیزی اضافه می‌کند:
#   ۱. دسترسیِ `REQUEST_INSTALL_PACKAGES` در مانیفست (نصبِ APK از داخلِ اپ
#      بدونِ آن روی اندروید ۸+ حتی به صفحهٔ «اجازه بده» هم نمی‌رسد).
#   ۲. یک FileProvider (`ggFileProvider`) + فایلِ مسیرها
#      (`res/xml/gg_file_paths.xml`) — از اندروید ۷ به بعد، دادنِ مسیرِ
#      خامِ فایل (`file://`) به اپِ دیگر ممنوع است و نصب با
#      FileUriExposedException می‌میرد.
#   ۳. فایلِ `UpdateInstaller.kt` کنارِ MainActivity: شنوندهٔ کانال و
#      سازندهٔ Intentِ نصب.
#   ۴. قلاب در `MainActivity.configureFlutterEngine` که شنونده را ثبت می‌کند.
#
# ترتیبِ اجرا مهم است: این اسکریپت باید *بعد* از `patch_android.sh` اجرا
# شود، چون MainActivity را همان اسکریپت به پکیجِ نهایی
# (`ir.ghelghelishop.ghelgheli`) می‌برد.
#
# اجرا از ریشهٔ `mobile/`، بعد از `flutter create` و `patch_android.sh`.
set -Eeuo pipefail

MANIFEST="android/app/src/main/AndroidManifest.xml"
[ -f "$MANIFEST" ] || { echo "ERROR: $MANIFEST not found (run flutter create first)"; exit 1; }

python3 - "$MANIFEST" <<'PY'
import re
import sys
from pathlib import Path

manifest_path = Path(sys.argv[1])
src = manifest_path.read_text(encoding='utf-8')

# ── ۱) دسترسیِ نصب ──────────────────────────────────────────────────
perm = 'android.permission.REQUEST_INSTALL_PACKAGES'
anchor = '<manifest xmlns:android="http://schemas.android.com/apk/res/android">'
if perm not in src:
    src = src.replace(
        anchor, anchor + f'\n    <uses-permission android:name="{perm}"/>', 1)
    print('added permission: REQUEST_INSTALL_PACKAGES')
else:
    print('permission already present: REQUEST_INSTALL_PACKAGES')

# ── ۲) FileProvider ─────────────────────────────────────────────────
# `applicationId` در زمانِ بیلد جای‌گذاری می‌شود، پس نیازی به سفت‌کردنِ
# نامِ پکیج نیست و با هر applicationIdای درست کار می‌کند.
provider_block = """
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.ggFileProvider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/gg_file_paths" />
        </provider>
"""
if 'ggFileProvider' not in src:
    close = src.find('</application>')
    if close == -1:
        raise SystemExit('ERROR: no </application> found for FileProvider')
    src = src[:close] + provider_block + src[close:]
    print('added FileProvider: ggFileProvider')
else:
    print('FileProvider already present: ggFileProvider')

manifest_path.write_text(src, encoding='utf-8')

# ── ۳) فایلِ مسیرهای FileProvider ────────────────────────────────────
res_xml = Path('android/app/src/main/res/xml')
res_xml.mkdir(parents=True, exist_ok=True)
paths_file = res_xml / 'gg_file_paths.xml'
if not paths_file.exists():
    paths_file.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<!-- مسیرهای نصب‌کنندهٔ داخل‌اپی (patch_update_install.sh). -->\n'
        '<!-- فایلِ APK در حافظهٔ داخلیِ خودِ اپ می‌نشیند (files-path)؛ -->\n'
        '<!-- بقیهٔ مسیرها برای انعطافِ آینده‌اند و چیزی را لو نمی‌دهند. -->\n'
        '<paths>\n'
        '    <files-path name="gg_update" path="." />\n'
        '    <cache-path name="gg_cache" path="." />\n'
        '    <external-files-path name="gg_external" path="." />\n'
        '    <external-cache-path name="gg_external_cache" path="." />\n'
        '</paths>\n',
        encoding='utf-8')
    print('wrote res/xml/gg_file_paths.xml')
else:
    print('res/xml/gg_file_paths.xml already present')

# ── ۴) کدِ کاتلینِ نصب‌کننده ──────────────────────────────────────────
mains = list(Path('android/app/src/main').rglob('MainActivity.kt'))
if len(mains) != 1:
    raise SystemExit(
        f'ERROR: expected one MainActivity.kt, found {len(mains)} '
        '(run patch_android.sh first)')
pkg_dir = mains[0].parent
pkg_line = next(
    (l for l in mains[0].read_text(encoding='utf-8').splitlines()
     if l.startswith('package ')),
    None)
if pkg_line is None:
    raise SystemExit('ERROR: package line not found in MainActivity.kt')
package = pkg_line.split('package ', 1)[1].strip()

installer = pkg_dir / 'UpdateInstaller.kt'
installer.write_text(
    f"""package {package}

import android.app.Activity
import android.content.Intent
import androidx.core.content.FileProvider
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File

// نصب‌کنندهٔ داخل‌اپی — تزریق‌شده با tool/patch_update_install.sh.
//
// سمتِ دارت (`lib/services/app_updater.dart`) بعد از دانلود و بررسیِ
// sha256، متدِ `installApk` را با مسیرِ فایل صدا می‌زند. این‌جا همان فایل
// با FileProvider به URIی امن تبدیل و نصب‌کنندهٔ سیستم باز می‌شود.
//
// اگر کاربر هنوز «نصبِ برنامه‌های ناشناس» را برای قلقلی مجاز نکرده باشد،
// خودِ اندروید صفحهٔ اجازه را نشان می‌دهد؛ بعد از اجازه، کاربر با دکمهٔ
// «نصب»ِ همان دیالوگ دوباره شلیک می‌کند (مرحلهٔ done هم install را قبول
// می‌کند، دقیقاً برای همین برگشت).
object UpdateInstaller {{
    fun register(activity: Activity, engine: FlutterEngine) {{
        MethodChannel(
            engine.dartExecutor.binaryMessenger, "ghelgheli/update")
            .setMethodCallHandler {{ call, result ->
                if (call.method == "installApk") {{
                    val path = call.argument<String>("path")
                    if (path.isNullOrEmpty() || !File(path).exists()) {{
                        result.error(
                            "not-found", "APK file not found", null)
                        return@setMethodCallHandler
                    }}
                    try {{
                        val uri = FileProvider.getUriForFile(
                            activity,
                            activity.packageName + ".ggFileProvider",
                            File(path))
                        val intent = Intent(Intent.ACTION_VIEW).apply {{
                            setDataAndType(
                                uri,
                                "application/vnd.android.package-archive")
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            addFlags(
                                Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }}
                        activity.startActivity(intent)
                        result.success("ok")
                    }} catch (e: Exception) {{
                        result.error(
                            "install-failed", e.message, null)
                    }}
                }} else {{
                    result.notImplemented()
                }}
            }}
    }}
}}
""",
    encoding='utf-8')
print(f'wrote UpdateInstaller.kt in package {package}')

# ── ۵) قلاب در MainActivity ───────────────────────────────────────────
main_src = mains[0].read_text(encoding='utf-8')
if 'UpdateInstaller.register' in main_src:
    print('MainActivity hook already present')
else:
    one_liner = re.search(
        r'class\s+MainActivity\s*:\s*FlutterActivity\s*\(\s*\)', main_src)
    if not one_liner:
        raise SystemExit(
            'ERROR: MainActivity shape is unexpected — refusing to guess. '
            'Expected a one-liner `class MainActivity: FlutterActivity()`.')
    expanded = (
        'class MainActivity : FlutterActivity() {\n'
        '    override fun configureFlutterEngine'
        '(flutterEngine: FlutterEngine) {\n'
        '        super.configureFlutterEngine(flutterEngine)\n'
        '        UpdateInstaller.register(this, flutterEngine)\n'
        '    }\n'
        '}')
    main_src = (main_src[:one_liner.start()] + expanded +
                main_src[one_liner.end():])
    anchor_imp = 'import io.flutter.embedding.android.FlutterActivity'
    if ('import io.flutter.embedding.engine.FlutterEngine' not in main_src and
            anchor_imp in main_src):
        main_src = main_src.replace(
            anchor_imp,
            anchor_imp + '\nimport io.flutter.embedding.engine.FlutterEngine',
            1)
    mains[0].write_text(main_src, encoding='utf-8')
    print('hooked UpdateInstaller into MainActivity')
PY

echo "--- verifying ---"
grep -q 'android.permission.REQUEST_INSTALL_PACKAGES' "$MANIFEST" \
  && echo "  OK   REQUEST_INSTALL_PACKAGES" \
  || { echo "  FAIL REQUEST_INSTALL_PACKAGES is missing"; exit 1; }
grep -q 'ggFileProvider' "$MANIFEST" \
  && echo "  OK   FileProvider in manifest" \
  || { echo "  FAIL FileProvider is missing — install crashes on Android 7+"; exit 1; }
[ -f android/app/src/main/res/xml/gg_file_paths.xml ] \
  && echo "  OK   gg_file_paths.xml" \
  || { echo "  FAIL gg_file_paths.xml is missing"; exit 1; }
[ -f android/app/src/main/kotlin/ir/ghelghelishop/ghelgheli/UpdateInstaller.kt ] \
  && echo "  OK   UpdateInstaller.kt" \
  || { echo "  FAIL UpdateInstaller.kt is missing"; exit 1; }
grep -Rqs 'UpdateInstaller.register' android/app/src/main/kotlin \
  && echo "  OK   MainActivity hook" \
  || { echo "  FAIL MainActivity hook is missing — channel never answers"; exit 1; }
