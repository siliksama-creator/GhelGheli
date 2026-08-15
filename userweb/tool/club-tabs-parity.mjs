#!/usr/bin/env node
//
// گاردِ نوارِ تب‌های «چت و بازی» — وب در برابر اندروید.
//
// چرا این فایل وجود دارد
// ──────────────────────
// در دور ۲۱ تبِ چهارم («گذر نبرد») به این نوار اضافه شد. تست‌های موجود
// همه سبز ماندند، ولی اندازه‌گیریِ واقعی در مرورگر نشان داد تب چهارم
// **کاملاً بیرون از نما** می‌افتد:
//
//     نما ۳۹۰px → نوار scrollWidth=452 ، دکمهٔ «گذر نبرد» در left:-70
//     نما ۳۶۰px → left:-100  (یعنی حتی لبه‌اش هم دیده نمی‌شد)
//
// یعنی هم تبِ جدید عملاً غیرقابل‌دسترس بود، هم نشانِ قرمزش (که کلّ
// خواستهٔ «آلرت قرمز روی گذر نبرد» است) با آن بیرون می‌ماند. دو علت:
//
//   ۱. لیبل‌های وب بلندتر از اندروید بودند: «چت روم» و «ماموریت و
//      دوستان» در برابرِ «چت» و «ماموریت». این خودش نقضِ قیدِ آینگی بود
//      و کسی متوجهش نشده بود چون هیچ گاردی متنِ تب‌ها را مقایسه نمی‌کرد.
//   ۲. در `@media(max-width:520px)` دکمه‌ها `flex:0 0 auto` داشتند، پس
//      کوچک نمی‌شدند و مجموعشان از عرضِ نما رد می‌شد.
//
// این گارد هر دو ریشه را می‌بندد: متنِ تب‌ها باید دقیقاً یکی باشد، و
// قاعدهٔ موبایل باید اجازهٔ کوچک‌شدن بدهد.
//
// ⚠️ این گاردِ ایستا است و ادعای «در نما جا می‌شود» را اثبات نمی‌کند —
//    آن ادعا با Playwright اندازه‌گیری شد. کارِ این فایل جلوگیری از
//    برگشتِ همان دو ریشه است.
//
// ⚠️ کامنت‌ها قبل از هر بررسی حذف می‌شوند؛ وگرنه همین توضیحات، که نامِ
//    کلاس‌ها و لیبل‌ها را در خود دارند، تست را الکی سبز می‌کردند.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/** کامنت‌های `//`، `/* *\/` و `{/* *\/}` را حذف می‌کند. */
function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

let pass = 0;
const check = (name, fn) => {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.log(`  ✗ ${name}\n      ${e.message}`);
    process.exitCode = 1;
  }
};

const web = strip(read('userweb/src/main.jsx'));
const android = strip(read('mobile/lib/screens/user/social_page.dart'));
const css = strip(read('userweb/src/style.css'));

console.log('نوارِ تب‌های باشگاه — آینگی و جاشدن در نما\n');

// ── ۱. متنِ تب‌ها در دو پلتفرم دقیقاً یکی باشد ──────────────────────
const LABELS = ['چت', 'بازی‌ها', 'ماموریت', 'گذر نبرد'];

const webBar = web.slice(
  web.indexOf('clubTabs socialTripleTabs'),
  web.indexOf('clubTabs socialTripleTabs') + 1800,
);

for (const label of LABELS) {
  check(`وب: تبِ «${label}»`, () => {
    // سه تبِ اول شکلِ `<UiIcon/> متن</button>` دارند و تبِ گذر نبرد
    // به‌خاطرِ نشانِ قرمز شکلِ `</span> متن` — پس هر دو را می‌پذیریم.
    assert.ok(
      new RegExp(`(?:/>|</span>)\\s*${label}\\s*(?:<|\\{)`).test(webBar),
      `لیبلِ «${label}» در نوارِ تب‌های وب پیدا نشد`,
    );
  });
  check(`اندروید: تبِ «${label}»`, () => {
    assert.ok(
      android.includes(`label: '${label}'`),
      `لیبلِ «${label}» در _items اندروید پیدا نشد`,
    );
  });
}

// لیبلِ بلندِ قدیمی نباید برگردد — همان چیزی که نوار را سرریز می‌کرد.
for (const dead of ['چت روم', 'ماموریت و دوستان']) {
  check(`لیبلِ بلندِ «${dead}» برنگشته`, () => {
    assert.ok(!webBar.includes(dead), `«${dead}» دوباره به نوارِ تب‌ها برگشته است`);
  });
}

// ── ۲. ترتیبِ تب‌ها یکی باشد (نشانِ قرمز به اندیس گره خورده) ─────────
check('ترتیبِ تب‌ها در دو پلتفرم یکسان است', () => {
  const androidOrder = [...android.matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(androidOrder.slice(0, 4), LABELS);
  const webOrder = LABELS.filter((l) => webBar.includes(l))
    .sort((a, b) => webBar.indexOf(a) - webBar.indexOf(b));
  assert.deepEqual(webOrder, LABELS, 'ترتیبِ تب‌های وب با اندروید فرق دارد');
});

check('اندروید نشان را با اندیسِ گذر نبرد می‌گیرد، نه عددِ ثابت', () => {
  assert.ok(android.includes('_passTab'), 'ثابتِ _passTab حذف شده');
  assert.ok(
    android.includes('i == _passTab ? passClaimable : 0'),
    'نشانِ قرمز دیگر به تبِ گذر نبرد گره نخورده',
  );
});

// ── ۳. قاعدهٔ موبایل باید اجازهٔ کوچک‌شدن بدهد ──────────────────────
const mobileRule = css.slice(
  css.indexOf('@media (max-width:520px)'),
  css.indexOf('@media (max-width:360px)'),
);

check('در ≤۵۲۰px دکمه‌ها سهمِ مساوی می‌گیرند (flex:1 1 0)', () => {
  assert.ok(mobileRule.includes('flex:1 1 0'), 'قاعدهٔ flex:1 1 0 پیدا نشد');
});

check('در ≤۵۲۰px مقدارِ ضدالگوی flex:0 0 auto برنگشته', () => {
  assert.ok(
    !mobileRule.includes('flex:0 0 auto'),
    'flex:0 0 auto برگشته — تبِ چهارم دوباره بیرونِ نما می‌افتد',
  );
});

check('در ≤۵۲۰px دکمه min-width:0 دارد تا واقعاً کوچک شود', () => {
  assert.ok(mobileRule.includes('min-width:0'), 'بدون min-width:0 فلکس‌آیتم کوچک نمی‌شود');
});

check('نوار در موبایل اسکرولِ افقیِ نامرئی ندارد', () => {
  assert.ok(
    !/overflow-x:\s*auto/.test(mobileRule),
    'overflow-x:auto یعنی تب می‌تواند پنهان بماند بدون هیچ نشانه‌ای',
  );
});

// ── ۴. آیکونِ گذر نبرد در باریک‌ترین حالت پنهان نشود ────────────────
const narrowRule = css.slice(css.indexOf('@media (max-width:360px)'));
check('در ≤۳۶۰px آیکونِ گذر نبرد استثنا شده تا نشانِ قرمز نپرد', () => {
  assert.ok(
    narrowRule.includes(':not(.passTabBtn)'),
    'آیکونِ تبِ گذر نبرد هم پنهان می‌شود و نشانِ قرمز با آن ناپدید می‌شود',
  );
});

// ── ۵. خودِ نشانِ قرمز ───────────────────────────────────────────────
const growth = strip(read('userweb/src/growth.css'));
check('نشان قرمزِ #ef4444 با انیمیشنِ نبض دارد', () => {
  const dot = growth.slice(growth.indexOf('.passAlertDot{'), growth.indexOf('@keyframes passAlertPulse'));
  assert.ok(dot.includes('#ef4444'), 'رنگِ قرمزِ نشان عوض شده');
  assert.ok(dot.includes('passAlertPulse'), 'انیمیشنِ نبض حذف شده');
});

check('نشان فقط وقتی جایزه‌ای آماده است دیده می‌شود', () => {
  assert.ok(web.includes('passClaimable > 0'), 'شرطِ passClaimable > 0 حذف شده');
  assert.ok(
    android.includes('badge: i == _passTab ? passClaimable : 0'),
    'شرطِ نشان در اندروید عوض شده',
  );
});

check('نسخهٔ خواندنی برای اسکرین‌ریدر هست', () => {
  assert.ok(web.includes('srOnly'), 'متنِ srOnly برای نشان حذف شده');
});

console.log(`\n${process.exitCode ? '❌' : '✅'} ${pass} تست`);
