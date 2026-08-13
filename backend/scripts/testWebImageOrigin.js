#!/usr/bin/env node
/**
 * نگهبانِ «تصویر از کدام دامنه گرفته می‌شود».
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * باگی که این فایل جلویش را می‌گیرد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * گزارش مالک: «کارت ها در نسخه وب نمایش داده نمیشدن».
 *
 * سرور مسیرِ **نسبی** می‌دهد: `/uploads/images/....webp`. هر کدی که آن
 * رشته را مستقیم به `fetch()` بدهد، مرورگر نسبت به **مبدأ صفحه** حلش
 * می‌کند:
 *
 *     https://user.ghelghelishop.ir/uploads/...   ← هیچ فایلی نیست
 *     https://api.ghelghelishop.ir/uploads/...    ← درست
 *
 * و چون nginx برای SPA قاعدهٔ `try_files $uri /index.html` دارد، پاسخ
 * **۴۰۴ نیست**؛ ۲۰۰ با `index.html` است. پس:
 *
 *   • `response.ok` صادق است
 *   • HTML به‌عنوان «تصویر» در Cache Storage ذخیره می‌شود
 *   • دفعهٔ بعد همان blob به `<img>` می‌رسد و رمزگشایی نمی‌شود
 *   • کاربر کارتِ خالی می‌بیند، **بدونِ هیچ خطایی در کنسول**
 *
 * این بدترین کلاسِ باگ است چون همه‌چیز «موفق» گزارش می‌شود. تستِ
 * دودیِ موجود هم نگرفتش: صفحه رندر می‌شد و خطای JS نداشت.
 *
 * دو قاعده که اینجا تضمین می‌شوند:
 *   ۱. هیچ `fetch` تصویری بدونِ مطلق‌سازی انجام نشود.
 *   ۲. هیچ پاسخی بدونِ بررسیِ `content-type: image/*` کش نشود.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..');
let pass = 0;
const failures = [];
function ck(name, cond, detail = '') {
  if (cond) { pass += 1; console.log('  ✓', name); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log('  ✗', name, detail ? `→ ${detail}` : ''); }
}
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');

const cacheLib = read('userweb/src/lib/imageCache.js');
const sw = read('userweb/public/image-cache-sw.js');
const cachedImg = read('userweb/src/components/CachedImg.jsx');

console.log('\n══ ۱. کشِ سمتِ اپ URL را مطلق می‌کند ══');
ck('imageCache از asset() استفاده می‌کند', /import\s*\{\s*asset\s*\}/.test(cacheLib),
  'بدونِ آن، fetch به دامنهٔ وب‌اپ می‌رود نه API');
ck('primeImageCache روی URL مطلق fetch می‌کند',
  /const absolute = asset\(url\);[\s\S]{0,400}fetch\(absolute/.test(cacheLib));
ck('lookupCachedImage روی URL مطلق fetch می‌کند',
  /const absolute = asset\(url\);[\s\S]{0,900}fetch\(absolute/.test(cacheLib));
// هیچ fetchی نباید مستقیم روی متغیرِ خامِ url باشد.
ck('هیچ fetch خامی روی مسیرِ نسبی نمانده',
  !/fetch\(url,/.test(cacheLib),
  'یک fetch(url, ...) باقی مانده که مسیرِ نسبی می‌گیرد');

console.log('\n══ ۲. فقط تصویرِ واقعی کش می‌شود ══');
ck('imageCache نوعِ محتوا را می‌سنجد',
  /content-type[\s\S]{0,120}image\//.test(cacheLib),
  'response.ok کافی نیست — index.html هم ok است');
ck('service worker نوعِ محتوا را می‌سنجد',
  /content-type[\s\S]{0,120}image\//.test(sw));
ck('imageCache ورودیِ معیوبِ قدیمی را پاک می‌کند',
  /cache\.delete\(/.test(cacheLib),
  'کاربری که یک بار HTML کش کرده باید خودبه‌خود ترمیم شود');
ck('service worker ورودیِ معیوب را پاک می‌کند', /cache\.delete\(/.test(sw));

console.log('\n══ ۳. نسخهٔ کش بالا رفته تا کشِ مسموم دور ریخته شود ══');
const libVersion = (cacheLib.match(/ghelgheli-img-v(\d+)/) || [])[1];
const swVersion = (sw.match(/ghelgheli-img-v(\d+)/) || [])[1];
ck('نسخهٔ کش در هر دو فایل تعریف شده', !!libVersion && !!swVersion);
ck('نسخهٔ کشِ اپ و service worker یکی است', libVersion === swVersion,
  `اپ v${libVersion} ولی SW v${swVersion} — دو کشِ جدا یعنی دو برابر فضا و رفتارِ ناسازگار`);
ck('نسخه از v2 جلوتر رفته', Number(libVersion) >= 3,
  'بدونِ بالا بردنِ نسخه، کشِ مسمومِ کاربرانِ فعلی باقی می‌ماند');
ck('service worker کش‌های قدیمی را در activate پاک می‌کند',
  /activate[\s\S]{0,400}caches\.keys\(\)[\s\S]{0,300}caches\.delete/.test(sw));

console.log('\n══ ۴. CachedImg مسیر را از asset می‌گذراند ══');
ck('CachedImg برای مسیرِ نسبی asset() می‌زند',
  /asset\(src\)/.test(cachedImg));

console.log(`\n${failures.length ? '✗' : '✓'} ${pass} موفق، ${failures.length} ناموفق`);
if (failures.length) {
  console.log('\nشکست‌ها:');
  failures.forEach(f => console.log('  ·', f));
  process.exit(1);
}
if (pass < 10) {
  console.log(`\n✗ فقط ${pass} سنجه اجرا شد — کمتر از انتظار`);
  process.exit(1);
}
