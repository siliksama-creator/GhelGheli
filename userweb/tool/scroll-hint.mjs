#!/usr/bin/env node
//
// گاردِ «راهنمای اسکرول» — یک قرارداد، سه کلاینت (وب / پنل ادمین / اندروید).
//
// خواستهٔ مالک (۲۹ شهریور): «هر تبی که کاربرا نیاز دارن به اسکرول کنن،
// راهنمایی نشون داده بشه؛ اسکرول‌Help دسکتاپ چیدمان رو به‌هم ریخته؛
// اینو یکپارچه یه بار برای همیشه درستش کن.»
//
// این گارد «برای همیشه» را قابلِ اجرا می‌کند. هر موردش یک باگِ واقعیِ همان
// دور است که اگر کسی دوباره بسازد، CI قرمز می‌شود:
//
//   ۱. **پارگیِ متن‌ها بین وب و اندروید** — یک صفحه، دو جملهٔ متفاوت.
//   ۲. **`min-width` / `vw` در بلاکِ راهنما** — همان چیزی که روی دسکتاپ
//      چیدمان را به‌هم می‌ریخت (`desktop-layout.mjs` فقط یک بلاک
//      min-width را مجاز می‌داند؛ این‌جا ریشه‌کن می‌شود).
//   ۳. **لنگرِ نما به‌جای ستون** در پنل ادمین — قرص و ریل با
//      `position:fixed` کنارِ لبهٔ مانیتور می‌نشستند.
//   ۴. **`key` تکراری روی `<ScrollHint>`** — React دو فرزندِ هم‌کلید را
//      تکراری می‌بیند و در هر عوض‌کردنِ تب یک لایهٔ تازه به DOM اضافه
//      می‌کند **بدونِ حذفِ قبلی**: قرص‌های تب‌های قبلی روی هم می‌مانند
//      (سنجیده شد: سه تب که می‌رفتیم، چهار قرصِ روی‌هم‌افتاده).
//   ۵. **ضریبِ پرشِ قرص** باید در هر سه کلاینت یکی باشد (۰٫۶۲ صفحه).
//
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/** کامنت‌ها را حذف می‌کند تا شرحِ ماجرا (که خودش `key={tab}` را نام
 *  می‌برد) جای کد شمرده نشود. */
function strip(src) {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ok -', name);
  } catch (e) {
    console.error('  FAIL -', name);
    console.error('    ', String(e.message).slice(0, 400));
    process.exitCode = 1;
  }
}

// ── ۱) پارگیِ متن‌ها: وب ↔ اندروید ───────────────────────────────────────
//
// نگاشتِ کلیدِ تبِ وب به ایندکسِ صفحهٔ اندروید. عمداً صریح است (نه
// حدسی): اگر روزی صفحه‌ای جابه‌جا شود، این جدول باید دستی عوض شود و
// همین «دستی بودن» جلوی نگاشتِ خاموشِ اشتباه را می‌گیرد.
const KEY_TO_ANDROID_INDEX = {
  home: 0,
  cardreg: 1,
  wallet: 2,
  league: 3,
  club: 4,
  support: 5,
  profile: 6,
  wheel: 7,
  invite: 8,
  shop: 9,
  pass: 10,
  ledger: 12,
  apps: 13,
};

function webHints() {
  const src = read('userweb/src/main.jsx');
  const start = src.indexOf('const SCROLL_HINTS = {');
  assert.ok(start > -1, 'SCROLL_HINTS در main.jsx پیدا نشد');
  const body = src.slice(start, src.indexOf('};', start));
  const out = {};
  for (const m of body.matchAll(/^\s*([a-zA-Z][\w]*):\s*'([^']+)'/gm)) out[m[1]] = m[2];
  assert.ok(Object.keys(out).length > 5, 'SCROLL_HINTS خالی یا ناخوانا است');
  return out;
}

function androidHints() {
  const src = read('mobile/lib/screens/user/home_shell.dart');
  const start = src.indexOf('_scrollHints = {');
  assert.ok(start > -1, '_scrollHints در home_shell.dart پیدا نشد');
  const body = src.slice(start, src.indexOf('};', start));
  const out = {};
  for (const m of body.matchAll(/^\s*(\d+):\s*'([^']+)'/gm)) out[Number(m[1])] = m[2];
  assert.ok(Object.keys(out).length > 5, '_scrollHints خالی یا ناخوانا است');
  return out;
}

const web = webHints();
const android = androidHints();

check('هر تبِ وب، جملهٔ یکسانِ خودش را در اندروید دارد', () => {
  const missing = [];
  const differs = [];
  for (const [key, text] of Object.entries(web)) {
    const idx = KEY_TO_ANDROID_INDEX[key];
    assert.ok(idx !== undefined, `کلید «${key}» در نگاشتِ اندروید نیست`);
    const theirs = android[idx];
    if (theirs === undefined) missing.push(`${key} (ایندکس ${idx})`);
    else if (theirs !== text) differs.push(`${key}: وب «${text}» ≠ اندروید «${theirs}»`);
  }
  assert.equal(missing.length, 0, `صفحه‌های بی‌راهنما در اندروید: ${missing.join(', ')}`);
  assert.equal(differs.length, 0, `جمله‌های ناهم‌خوان: ${differs.join(' | ')}`);
});

check('اندروید راهنمای اضافه‌ای ندارد که در وب نباشد (و برعکس)', () => {
  const usedIndexes = new Set(Object.values(KEY_TO_ANDROID_INDEX));
  const extras = Object.keys(android).map(Number).filter((i) => !usedIndexes.has(i));
  assert.equal(extras.length, 0,
    `ایندکس‌های بی‌معادل در اندروید: ${extras.join(', ')} — هر صفحهٔ اسکرول‌دار باید در وب هم راهنما داشته باشد`);
  assert.equal(Object.keys(web).length, Object.keys(android).length,
    `شمارِ راهنماها یکی نیست: وب ${Object.keys(web).length}، اندروید ${Object.keys(android).length}`);
});

// ── ۲) قراردادِ CSS در وب و پنل ─────────────────────────────────────────
const webHintCss = (() => {
  const css = read('userweb/src/styles/brand-mark.css');
  const start = css.indexOf('.scrollHintLayer {');
  assert.ok(start > -1, 'بلاکِ `.scrollHintLayer` در brand-mark.css پیدا نشد');
  const end = css.indexOf('@media (prefers-reduced-motion: reduce)', start);
  return css.slice(start, end > -1 ? end : start + 6000);
})();

const adminHintCss = (() => {
  const css = read('admin/src/styles.css');
  const start = css.indexOf('.scrollHintLayer {');
  assert.ok(start > -1, 'بلاکِ `.scrollHintLayer` در admin/src/styles.css پیدا نشد');
  const end = css.indexOf('.scrollHintChevron {', start);
  return css.slice(start, end > -1 ? end : start + 4000);
})();

check('هیچ `min-width` و هیچ `vw` در بلاکِ راهنمای اسکرول (وب/پنل)', () => {
  for (const [name, css] of [['وب', webHintCss], ['پنل', adminHintCss]]) {
    assert.ok(!/min-width\s*:/.test(css), `${name}: min-width در بلاکِ راهنما هست`);
    assert.ok(!/\d\s*vw/.test(css), `${name}: واحدِ vw در بلاکِ راهنما هست`);
  }
});

check('لایهٔ راهنما نمایش‌پذیر است (قفلِ `display:none` برنگشته)', () => {
  // نسخهٔ وبِ قبلی عمداً با `display:none!important` خاموش شده بود؛ یعنی
  // کاربرِ وب هیچ راهنمایی نداشت. این خط جلوگیری از برگشتِ همان است.
  assert.ok(!/scrollHint[\s\S]{0,400}display:\s*none\s*!important/.test(webHintCss),
    'بلاکِ راهنما دوباره `display:none!important` دارد');
});

check('ریلِ وب به لبهٔ ستون می‌چسبد، نه لبهٔ نما (لنگرِ ستون)', () => {
  const layer = webHintCss.slice(webHintCss.indexOf('.scrollHintLayer {'));
  assert.ok(/position:\s*fixed/.test(layer), 'لایه باید fixed باشد (بدونِ جابه‌جاییِ چیدمان)');
  assert.ok(/max-width/.test(layer) && /margin-inline:\s*auto/.test(layer),
    'لایه سقفِ عرض و وسط‌چینی ندارد — روی دسکتاپ از ستون بیرون می‌زند');
});

check('پنل ادمین: نشانه‌ها `position:fixed` نیستند (ریشهٔ «دسکتاپ به‌هم ریخت»)', () => {
  for (const cls of ['.scrollHintRail {', '.scrollHintPill {']) {
    const i = adminHintCss.indexOf(cls);
    assert.ok(i > -1, `${cls} در CSS پنل پیدا نشد`);
    const block = adminHintCss.slice(i, adminHintCss.indexOf('}', i));
    assert.ok(/position:\s*absolute/.test(block),
      `${cls} باید absolute باشد (لنگر = قابِ محتوا)، نه fixed`);
    assert.ok(!/position:\s*fixed/.test(block),
      `${cls} دوباره به نمای صفحه چسبیده است`);
  }
  assert.ok(/position:\s*absolute[\s\S]{0,120}inset:\s*0/.test(adminHintCss),
    'لایهٔ پنل باید با inset:0 روی قابِ محتوا بنشیند');
});

// ── ۳) `key` تکراری روی ScrollHint (باگِ چند-لایه‌ای شدن) ────────────────
function scrollHintElement(src, file) {
  const start = src.indexOf('<ScrollHint');
  assert.ok(start > -1, `عنصرِ <ScrollHint> در ${file} پیدا نشد`);
  // ⚠️ فقط تا پایانِ خودِ همین عنصر (`/>`) — نه چند صد نویسه جلوتر،
  //    وگرنه `key={tab}` خواهرِ بعدی (`<main key={tab}>`) هم شمرده
  //    می‌شود و گارد بی‌گناه قرمز می‌شود.
  const end = src.indexOf('/>', start);
  return src.slice(start, end > -1 ? end + 2 : start + 600);
}

check('هیچ `key={tab}`/`key={activePage}` روی <ScrollHint> نیست', () => {
  // دلیلِ دقیق: خواهرِ همین عنصر (`<main key={tab}>`) همان کلید را دارد؛
  // React دو فرزندِ هم‌کلید را تکراری می‌سازد و عناصرِ قبلی را حذف
  // **نمی‌کند** → با هر جابه‌جاییِ تب یک لایهٔ راهنما اضافه می‌شود.
  // ⚠️ الگو باید «key» مستقل را بگیرد، نه `resetKey` را
  //    (`resetKey={tab}` درست و لازم است؛ تفاوت یک نویسه است).
  const webEl = scrollHintElement(strip(read('userweb/src/main.jsx')), 'main.jsx');
  assert.ok(!/[\s<]key=\{tab\}/.test(webEl), 'وب: `key={tab}` روی <ScrollHint> برگشته است');
  const adminEl = scrollHintElement(strip(read('admin/src/components/app-shell.jsx')), 'app-shell.jsx');
  assert.ok(!/[\s<]key=\{activePage\}/.test(adminEl),
    'پنل: `key={activePage}` روی <ScrollHint> برگشته است');
});

check('هر دو کلاینت، تازه‌سازیِ تب را با resetKey/resetToken می‌دهند', () => {
  assert.ok(/resetKey=\{tab\}/.test(read('userweb/src/main.jsx')),
    'وب: `resetKey={tab}` گم شده — راهنما بعد از تبِ دوم دیگر نمی‌آید');
  assert.ok(/resetKey=\{activePage\}/.test(read('admin/src/components/app-shell.jsx')),
    'پنل: `resetKey={activePage}` گم شده');
  assert.ok(/resetToken:\s*entry\.key == _index \? _visitTick : null/.test(
    read('mobile/lib/screens/user/home_shell.dart')),
    'اندروید: `resetToken` به تبِ فعال وصل نیست — قرص بعد از یک‌بار اسکرول برنمی‌گردد');
});

// ── ۴) ضریبِ پرشِ قرص در سه کلاینت یکی باشد ─────────────────────────────
check('ضریبِ «یک صفحه پایین» در وب/پنل/اندروید یکی است (۰٫۶۲)', () => {
  const webFactor = /0\.62/.test(read('userweb/src/components/ScrollHint.jsx'));
  const adminFactor = /0\.62/.test(read('admin/src/components/ScrollHint.jsx'));
  const dartFactor = /0\.62/.test(read('mobile/lib/widgets/scroll_hint.dart'));
  assert.ok(webFactor, 'وب: ضریبِ ۰٫۶۲ نیست');
  assert.ok(adminFactor, 'پنل: ضریبِ ۰٫۶۲ نیست');
  assert.ok(dartFactor, 'اندروید: ضریبِ ۰٫۶۲ نیست');
});

check('اندروید جملهٔ واقعیِ صفحه را نشان می‌دهد (متنِ جانشین برنگشته)', () => {
  // نسخهٔ قبلی هر برچسبِ بلندتر از ۱۶ نویسه را با «ادامه پایین‌تر» عوض
  // می‌کرد — یعنی عملاً هیچ صفحه‌ای جملهٔ خودش را نمی‌دید.
  const dart = read('mobile/lib/widgets/scroll_hint.dart');
  assert.ok(!/label\.length\s*>\s*16/.test(dart),
    'منطقِ جایگزینیِ متن (label.length > 16) برگشته است');
});

console.log(`\n${passed} check(s) passed`);
