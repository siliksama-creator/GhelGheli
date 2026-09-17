#!/usr/bin/env node
/**
 * گاردِ «قابلِ‌انتقال‌بودنِ دامنه» — ۲۶ شهریور، برای انتقالِ پیشِ‌روی مالک.
 *
 * ── چرا این گارد لازم است ────────────────────────────────────────────────
 *
 * مالک گفت: «من قراره برم رو دامنه.کام». خطرِ واقعی این است که دامنه در
 * جایی از کد **هاردکد** بماند و روزِ انتقال، یا یادمان بیفتد یا بدتر:
 * فراموش شود و بخشی از محصول (مثلِ لینکِ دعوت در اپ، یا آدرسِ اشتراکِ
 * اتاق) بی‌سروصدا بشکند.
 *
 * پس این گارد همان «تنظیمِ‌گاه‌ها» را قفل می‌کند: چند جا دامنه تعیین
 * می‌شود، هر کدام از یک متغیر قابلِ تغییر، و همه با پیش‌فرضِ فعلی. نتیجه:
 * برای انتقال، **هیچ خطی از کد لازم نیست تغییر کند** — فقط متغیرها و
 * کانفیگِ سرور.
 *
 * ⚠️ این تست عمداً «پیش‌فرضِ فعلی» را هم می‌سنجد: اگر کسی روزی پیش‌فرض را
 *    به دامنهٔ نو عوض کند، تست سبز می‌ماند (چون فایل‌ها را می‌خواند نه
 *    دامنه را) — ولی اگر کسی دامنه را به‌جای متغیر در کد بچسباند، قرمز
 *    می‌شود. دقیقاً همان چیزی که می‌خواهیم.
 */
const fs = require('fs');
const path = require('path');

let pass = 0; let fail = 0;
const ok = (n, c, d = '') => { if (c) { pass += 1; console.log('  ✓', n); } else { fail += 1; console.log('  ✗', n, d ? `→ ${d}` : ''); } };

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

console.log('\n══ ۱) اپ (Flutter): آدرس‌ها از متغیرِ بیلد می‌آیند ══');
{
  const api = read('mobile/lib/api_client.dart');
  ok('آدرسِ API از `API_BASE_URL` خوانده می‌شود',
    /String\.fromEnvironment\(\s*'API_BASE_URL'/.test(api));
  ok('و یک مقدارِ پیش‌فرض دارد (بیلدِ بدونِ متغیر نمی‌شکند)',
    /defaultValue:\s*'https:\/\//.test(api));

  const share = read('mobile/lib/core/share_invite.dart');
  ok('دامنهٔ لینکِ دعوت از `PUBLIC_WEB_URL` خوانده می‌شود',
    /String\.fromEnvironment\(\s*'PUBLIC_WEB_URL'/.test(share));

  // ⚠️ رگرسیونِ واقعی که در بررسیِ زنده پیدا شد: پیش‌فرضِ اپ دامنهٔ اصلی
  //    بود که از بیرون جواب نمی‌دهد (کدِ ۰۰۰) در حالی که بک‌اند از زیردامنهٔ
  //    `user.` استفاده می‌کند (کدِ ۲۰۰). یعنی متنِ دعوت لینکِ مرده داشت.
  //    این‌جا قفل می‌شود که هر سه جا یک میزبان را نشان بدهند.
  const backendShareHost = (read('backend/src/services/presenceService.js')
    .match(/'https:\/\/([a-z.]+)'/) || [])[1];
  const appHost = (share.match(/defaultValue:\s*'https:\/\/([a-z.]+)'/) || [])[1];
  ok('دامنهٔ پیش‌فرضِ اپ و بک‌اند یکی است (لینکِ دعوت و اتاق یک‌جا را نشان می‌دهند)',
    !!backendShareHost && appHost === backendShareHost, `اپ=${appHost} بک‌اند=${backendShareHost}`);

  const deep = read('mobile/lib/core/deep_links.dart');
  ok('دامنهٔ پیش‌فرضِ لینکِ اتاق هم همان میزبانِ پاسخ‌دهنده است',
    new RegExp(`defaultValue: 'https://${backendShareHost}'`).test(deep), backendShareHost);
  ok('لینکِ ورود به اتاق، دامنه را از متغیر می‌گیرد (نه چسبیده در کد)',
    /String\.fromEnvironment\(\s*'PUBLIC_WEB_URL'/.test(deep) && /_collectWebHosts\(\)/.test(deep));
  ok('دامنهٔ فعلی هم در فهرستِ پذیرفته‌شده می‌ماند (لینک‌های قدیمی نمی‌شکنند)',
    /_legacyWebHosts/.test(deep) && /ghelghelishop\.ir/.test(deep));
  ok('مقایسهٔ دامنه حروفِ بزرگ/کوچک را یکی می‌کند (GhelGhelishop.IR هم کار کند)',
    /_webHosts\.contains\(uri\.host\.toLowerCase\(\)\)/.test(deep));

  const patch = read('mobile/tool/patch_android.sh');
  ok('مانیفستِ اندروید دامنه‌ها را از `PUBLIC_WEB_HOSTS` می‌گیرد',
    /PUBLIC_WEB_HOSTS/.test(patch) && /android:host="\{h\}"/.test(patch));
  ok('و پیش‌فرضش همان دامنهٔ فعلی است', /PUBLIC_WEB_HOSTS:-user\.ghelghelishop\.ir/.test(patch));

  const apk = read('.github/workflows/build-apk.yml');
  ok('بیلدِ APK هر دو متغیر را از تنظیماتِ مخزن می‌خواند (بدونِ تغییرِ کد)',
    /vars\.API_BASE_URL/.test(apk) && /vars\.PUBLIC_WEB_URL/.test(apk));

  // ⚠️ پیش‌فرضِ داخلِ ورک‌فلو **هم** مهم است: وقتی متغیرِ مخزن تعریف نشده
  //    باشد (وضعیتِ فعلی)، همین رشته در بیلد می‌نشیند. نسخهٔ قبلی دامنهٔ
  //    بدونِ زیردامنه بود که از بیرون پاسخ نمی‌دهد ⇒ لینکِ دعوتِ مرده در
  //    هر APK. این بررسی نمی‌گذارد سه جا (ورک‌فلو، اپ، بک‌اند) از هم
  //    جدا بیفتند.
  ok('پیش‌فرضِ PUBLIC_WEB_URL در ورک‌فلو همان دامنهٔ کارکننده است',
    /vars\.PUBLIC_WEB_URL \|\| 'https:\/\/user\.ghelghelishop\.ir'/.test(apk));
  // 🔴 کامنت داخلِ یک دستورِ ادامه‌دار (`\` در آخرِ خط) خطرناک است: شل
  //    خطِ بعد را به همان دستور می‌چسباند و `#` بقیهٔ دستور را می‌خورد.
  //    نسخهٔ اولِ همین توضیح‌ها دقیقاً همین‌جا بود و بیلدِ APK را با
  //    شکست تمام کرد، در حالی که APK ساخته شده بود و دو تعریفِ آخر هم
  //    بی‌صدا حذف شده بودند. این بررسی همان باگ را قفل می‌کند.
  const cmdStart = apk.indexOf('if flutter build apk');
  const cmdEnd = apk.indexOf('; then', cmdStart);
  const buildCmd = cmdStart < 0 || cmdEnd < 0 ? '' : apk.slice(cmdStart, cmdEnd);
  ok('دستورِ بیلدِ APK هیچ کامنتی داخلش ندارد (وگرنه شل بقیهٔ دستور را می‌خورد)',
    buildCmd.length > 0 && !/#/.test(buildCmd));

  ok('و در `share_invite.dart` هم همان دامنه پیش‌فرض است',
    /defaultValue: 'https:\/\/user\.ghelghelishop\.ir'/.test(share));
}

console.log('\n══ ۲) بک‌اند: هیچ آدرسی در منطقِ کار هاردکد نیست ══');
{
  const engine = read('backend/src/games/engine.js');
  const presence = read('backend/src/services/presenceService.js');
  ok('آدرسِ اشتراکِ نبرد از `PUBLIC_WEB_URL`/`CLIENT_URL` می‌آید',
    /process\.env\.PUBLIC_WEB_URL/.test(engine) && /process\.env\.CLIENT_URL/.test(engine));
  ok('آدرسِ اشتراکِ اتاقِ خصوصی هم همین‌طور',
    /process\.env\.PUBLIC_WEB_URL/.test(presence));

  // فایل‌های منطقیِ بک‌اند نباید دامنهٔ واقعی داشته باشند (کامنت‌ها استثناست).
  const logicFiles = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    if (e.isFile() && e.name.endsWith('.js')) logicFiles.push(full);
  });
  walk(path.join(ROOT, 'backend', 'src'));
  // استثنای صریح: بعضی جاها دامنهٔ فعلی **دادهٔ پیش‌فرض** است نه منطقِ کار
  // (مثلِ فهرستِ ابتداییِ کادرِ دامنه‌های سپرِ کلادفلر که مالک در پنل عوضش
  // می‌کند). این ناحیه با نشانهٔ `portability-ok-begin/end` مشخص می‌شود تا
  // استثنا عمدی و خوانا باشد، نه یک شکافِ پنهان در گارد.
  const offenders = [];
  for (const file of logicFiles) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    let exempt = false;
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.includes('portability-ok-begin')) { exempt = true; return; }
      if (trimmed.includes('portability-ok-end')) { exempt = false; return; }
      if (exempt) return;
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;  // توضیح
      if (/ghelghelishop\.ir/.test(line) && !/process\.env/.test(line)) {
        offenders.push(`${path.relative(ROOT, file)}:${i + 1}  ${trimmed.slice(0, 70)}`);
      }
    });
    if (exempt) offenders.push(`${path.relative(ROOT, file)}  ناحیهٔ استثنا بسته نشده (portability-ok-end جا افتاده)`);
  }
  ok('در منطقِ بک‌اند، دامنه فقط از متغیرِ محیطی خوانده می‌شود',
    offenders.length === 0, `\n      ${offenders.join('\n      ')}`);
}

console.log('\n══ ۳) وب و پنل: آدرس در زمانِ بیلد تعیین می‌شود ══');
{
  for (const [name, file] of [['وب (کاربر)', 'userweb/src/lib/api.js'], ['پنلِ ادمین', 'admin/src/lib/api.js']]) {
    const s = read(file);
    ok(`${name}: آدرس از VITE_API_BASE با پیش‌فرضِ سالم`, /import\.meta\.env\.VITE_API_BASE/.test(s) && /https:\/\//.test(s));
  }
}

console.log('\n══ ۴) سپرِ کلادفلر: فهرستِ دامنه‌ها از پنل قابلِ ویرایش است ══');
{
  const guard = read('backend/src/services/cloudflareGuard.js');
  ok('دامنه‌ها در کد فقط یک فهرستِ پیش‌فرض‌اند (نه شرطِ سخت‌گیرانه)',
    /DEFAULT_DOMAINS/.test(guard) && /normalizeDomains/.test(guard));
  ok('ذخیرهٔ تنظیمات فهرست را کامل جایگزین می‌کند (برای دامنهٔ نو)',
    /domains:/.test(guard) && /saveConfig/.test(guard));
  const page = read('admin/src/pages/cloudflare.jsx');
  ok('پنل می‌گوید برای دامنهٔ نو فقط کادرِ دامنه‌ها را عوض کن',
    /دامنهٔ نو|انتقال/.test(page));
}

console.log('\n══ ۵) نشانه‌گذاری‌ برای قدمِ انسانیِ انتقال (نیم‌سرور) ══');
{
  const page = read('admin/src/pages/cloudflare.jsx');
  ok('پنل توضیح می‌دهد که تغییرِ نیم‌سرور در پنلِ ایرنیک انجام می‌شود (نه در کد)',
    /ایرنیک/.test(page) && /نیم‌سرور/.test(page));
  const guard = read('backend/src/services/cloudflareGuard.js');
  ok('پیامِ خطای «ناحیه فعال نیست» هم همین را می‌گوید',
    /نیم‌سرور/.test(guard));
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} بررسی موفق، ${fail} ناموفق\n`);
process.exit(fail === 0 ? 0 : 1);
