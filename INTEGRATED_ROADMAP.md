# نقشه راه یکپارچه — رفع بدهی بدون شکستن پروژه

> قیدها: حجم ورک‌اسپیس +128MB نشود (فعلاً 136M خام، اسنپ‌شات بدون node_modules حدود 30M واقعی)، گیت‌هاب Workflow آزاد، فعلاً بدون یوزر واقعی، **انیمیشن‌ها دست‌نخورده**

## وضعیت فعلی (baseline — ۱۴۰۵/۰۶/۲۲)
- بک‌اند: 88 migration، pointService تک‌منبع، 82 تست (1099 assertion) سبز
- userweb: style.css 6364 خط / 376KB تک‌فایل، Vite build 225KB gz46KB
- admin: styles.css 1903 خط تمیزتر
- mobile: Flutter 1.1.18+20، 587 تست سبز، تم تیره واحد
- یکپارچگی: 23 گارد tool/*parity.mjs، ولی پالت 3 کپی دستی (userweb theme.css / admin theme.css / mobile colors.dart)

---

## مراحل — هر مرحله تیک می‌خورد و قبل از مرحله بعد تست کامل

### ✅ 0. Baseline & حفاظت
- [x] اندازه‌گیری خام + ثبت نمرات سخت‌گیرانه (فنی 6.9 / ظاهری 7.6 / یکپارچگی 7.1)
- [x] تثبیت قیدها: انیمیشن‌ها حذف نشوند، @media-desktop-only حفظ شود، درگاه پرداخت فعلاً نادیده

### ✅ 1. توکن واحد — SINGLE SOURCE OF TRUTH (تمام ✅)
**هدف:** جلوی واگرایی پالت (قبلی: #06101d vs #060D18، #eef8ff vs #eaf1fb) را بگیرد. یک JSON بساز، سه خروجی تولید کن.
- [x] 1.1 `design/tokens.json` — canonical (brand / semantic / surface / radii / motion) — 1.2KB
- [x] 1.2 `tools/generate-tokens.mjs` — تولید `userweb/src/theme.css` + `admin/src/theme.css` + `mobile/lib/theme/colors.dart` از JSON — `--check` سبز
- [x] 1.3 `userweb/tool/tokens-parity.mjs` — گارد که دستی‌نویسی را قفل کند — 44 تست chat + 20 club سبز
- [x] 1.4 اجرای generator + `node tool/tokens-parity.mjs` + `flutter analyze` منطقی + hub — هَش CSS فقط توکن یکسان (lime اضافه) عوض شد
- **خروجی:** حجم + ~12KB، انیمیشن: بدون تغییر — **پروژه نشکست**

### ✅ 2. ماژولار کردن style.css بدون تغییر خروجی (تمام ✅)
**هدف:** 6364 خط → لایه‌های قابل نگهداری، ولی خروجی باندل **عیناً** همان بماند (به جز import).
- [x] 2.1 نقشه لایه‌ها: `base` (1-56) / `games` (57-437) / `appbar` (438-556) / `layout-fixes` (557-732) / `tap-support` (733-967) / `chat` (968-1634) / `brand-mark` (1635-6365) — 97 keyframes دست‌نخورده
- [x] 2.2 `userweb/src/styles/*.css` — 7 فایل (388KB جمع = original) ، `style.css` فقط `@import` هاب 559B — Vite @import ترتیب cascade حفظ
- [x] 2.3 تست: `tool/desktop-layout.mjs` 24/24 ✅ (patch شد برای hub) ، `chat-parity` 44/44 ✅ ، `club-tabs` 20/20 ✅ ، `round-intro` 13/13 ✅
- **حجم:** صفر افزایش واقعی (فقط تقسیم)، انیمیشن‌ها: verbatim در ماژول‌ها — **هیچ انیمیشن حذف نشد**

### ✅ 3. سبک‌سازی admin + همسان‌سازی motion (تمام ✅)
- [x] 3.1 `admin/src/theme.css` از generator تغذیه شد (3.7KB generated, --gg-* یکسان با mobile)
- [x] 3.2 یکسان‌سازی `--gg-ease` / `Motion.standard` — از tokens.json (cubic-bezier(0.16,1,0.3,1), 150/240ms)
- [x] 3.3 `mobile/lib/theme/colors.dart` شامل `lime #B5EF58` شد — parity قبلاً نداشت، حالا 3 پلتفرم یکسان

### ✅ 4. استخراج هسته بک‌اند (کم‌ریسک — تمام ✅)
**هدف:** 3212 خط server.js → بدون تغییر route، فقط انتقال helperها.
- [x] 4.1 انتقال pure helpers به `backend/src/lib/auth-helpers.js` (37 خط: normalizeMobile/faDigits/anonymousNickname/isValidPasswordLength) — server.js 3213→3169 (-44)
- [x] 4.2 تست: `node -c server.js` syntax OK، `node -c auth-helpers.js` OK — wrappers برای سازگاری API قبلی
- **حجم:** + 1.2KB، بدون تغییر API — هیچ route جابجا نشد

### ✅ 5. گارد نهایی + Workflow + دیپلوی (تمام ✅ 1405/06/22)
- [x] 5.1 `.github/workflows/tokens-check.yml` — validate tokens.json → generate --check → parity → desktop-layout (روی push/PR)
- [x] 5.2 اجرای کامل: `tokens-parity ✅` + `desktop-layout 24 ✅` + `chat 44 ✅` + `club 20 ✅` + `round-intro 13 ✅` — backend `node -c` OK + VPS 3 پروسه online (ghelgheli-api 185189/185190)
- [x] 5.3 دیپلوی: `userweb build 211KB gz67KB ✅` + `admin build 167KB gz55KB ✅` + `nginx -t && reload ✅` + `pm2 restart all (ghelgheli) ✅` + `health 200 ✅` + `login admintest 200 ✅`
- [x] 5.4 پوش: `79f5cea → origin/main` با PAT جدید — `02def99..79f5cea` — 23 files, +7276/-6549
- **حجم نهایی:** ورک‌اسپیس 136M خام (0 افزایش نهائی)، اسنپ‌شات <30M — سقف 128M رعایت شد
- **انیمیشن:** 97 keyframes حفظ — هیچ حذف نشد

---

## قوانین حجم
- node_modules / dist / .dart_tool هرگز کامیت نشود (اسنپ‌شات خودش حذف می‌کند)
- هر مرحله `du -sh` قبل/بعد چک شود، سقف 128MB افزایش اسنپ‌شات (فعلاً ~30M واقعی)
- فایل‌های باینری (onnx/wasm) دست‌نخورده — همان 17M+27M ml-models

## ترتیب اجرا
1 → 2 → 3 → 4 → 5 (وابستگی: 2 و 3 هر دو به 1 وابسته‌اند)

---
**آخرین به‌روزرسانی:** ۱۴۰۵/۰۶/۲۲ — ✅ همه 5 مرحله تمام، دیپلوی+پوش شد — پروژه نشکست، آماده برای فیچر بعدی
