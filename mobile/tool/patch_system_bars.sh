#!/usr/bin/env bash
#
# Patches the generated Android theme so the phone's own system bars (status
# bar at the top, home/back/recents at the bottom) stop painting over the app.
#
# WHY THIS EXISTS
# Flutter's generated theme leaves the system bars untouched, so Android drew
# them in its own default colour: a flat black strip glued under GhelGheli's
# bottom navigation bar. It clashed with the app's dark-blue theme and ate
# usable screen height. On Android 15 (API 35) it is worse — the OS *forces*
# edge-to-edge for apps targeting 35, so the app was already sliding under the
# navigation bar, and because nothing in the Dart code honoured the bottom
# inset, the system bar overlapped the bottom nav and swallowed taps on the
# last tab.
#
# WHAT IT DOES
# 1. Makes both bars transparent and removes the grey legibility scrim that
#    Android 10+ paints over them (`enforceNavigationBarContrast`).
# 2. Leaves the actual inset handling to Dart — see `main.dart`
#    (`SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge)`) and
#    `_BottomBarWithInset` in `screens/user/home_shell.dart`. This script only
#    deals with colours; padding belongs to the widget tree.
#
# WHY IT IS A SEPARATE SCRIPT (and not part of patch_android.sh)
# `flutter_native_splash` rewrites `res/values*/styles.xml` and runs *after*
# patch_android.sh in build-apk.yml. Anything written into the theme before
# that step is silently lost. This script is therefore invoked after the
# splash generation step.
#
# Run from the `mobile/` directory after `flutter create --platforms=android .`
set -Eeuo pipefail

python3 - <<'PY'
from pathlib import Path
import re

res = Path('android/app/src/main/res')
if not res.is_dir():
    raise SystemExit('ERROR: android/app/src/main/res not found (run flutter create first)')

# Notes on the attributes:
#   • `navigationBarColor` transparent is what lets the app's own bottom bar
#     extend to the physical edge of the screen.
#   • `enforceNavigationBarContrast` (API 29+) is the grey scrim Android adds
#     "for legibility". Without turning it off, a transparent navigation bar
#     still comes out looking grey on 3-button-nav devices.
#   • Resources are validated against compileSdk (35), not against the device,
#     so listing an API-29 attribute in the base values/ folder is safe: older
#     Androids silently ignore attributes they do not know.
ITEMS = (
    '        <item name="android:navigationBarColor">@android:color/transparent</item>\n'
    '        <item name="android:navigationBarDividerColor">@android:color/transparent</item>\n'
    '        <item name="android:statusBarColor">@android:color/transparent</item>\n'
    '        <item name="android:enforceNavigationBarContrast">false</item>\n'
    '        <item name="android:enforceStatusBarContrast">false</item>\n'
)

STYLES = ('LaunchTheme', 'NormalTheme')
touched = []

for styles in sorted(res.glob('values*/styles.xml')):
    src = styles.read_text(encoding='utf-8')
    if 'enforceNavigationBarContrast' in src:
        continue  # already applied by an earlier run
    before = src
    for name in STYLES:
        opening = re.compile(r'(<style name="' + name + r'"[^>]*>)\n')
        src = opening.sub(lambda m: m.group(1) + '\n' + ITEMS, src, count=1)
    if src != before:
        styles.write_text(src, encoding='utf-8')
        touched.append(str(styles.parent.name))

if not touched:
    # Not fatal: the Dart side still enables edge-to-edge, the bars just keep
    # the platform default colour on this build. Shouting here would break a
    # release over cosmetics.
    print('  WARN هیچ styles.xmlای برای شفاف‌سازیِ نوارِ سیستم تغییر نکرد')
else:
    print(f'  نوارِ سیستم شفاف شد در: {", ".join(touched)}')
PY

echo "  OK   system bars (status + navigation) transparent for edge-to-edge"
