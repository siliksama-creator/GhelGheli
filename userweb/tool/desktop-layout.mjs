#!/usr/bin/env node
//
// گاردِ چیدمانِ دسکتاپِ نسخهٔ وب.
//
// چرا این فایل وجود دارد
// ──────────────────────
// کل پرتالِ وب برای گوشی نوشته شده و اندروید هم آینهٔ همان است. تا وقتی
// کسی وب را روی مانیتور باز نکرده بود این تفاوت دیده نمی‌شد؛ اندازه‌گیری
// روی ۱۴۴۰px دو ایرادِ واقعی نشان داد:
//
//   ۱. سرریزِ افقی در تبِ بازی‌ها: `scrollWidth=2010` در برابرِ
//      `clientWidth=1440`. علت: کاشیِ بازی هم‌زمان کلاسِ `card` و
//      `gameTileSquare` می‌گیرد و `.card` عرضِ صریحِ `min(560px,95vw)`
//      دارد. داخل گریدی که ترکِ ۵۲۸px می‌سازد آن ۵۶۰px نمی‌شکند و کاشی
//      از قاب بیرون می‌زند. روی موبایل پنهان بود، چون
//      `@media(max-width:900px)` قانونِ `.card{width:100%!important}` را
//      دارد — یعنی ایراد **فقط** روی دسکتاپ ظاهر می‌شد.
//
//   ۲. چیدمانِ تک‌ستونیِ گوشی روی مانیتور: تبِ خانه ۲۶۸۹px ارتفاع داشت و
//      دو طرفِ صفحه خالی بود.
//
// ⚠️ نکتهٔ حیاتی برای هر تغییرِ بعدی: قیدِ پروژه می‌گوید «وب باید آینهٔ
//    اندروید باشد». بنابراین اصلاحاتِ دسکتاپ **فقط** حق دارند داخلِ
//    `@media (min-width: …)` بنشینند. اگر کسی همین قواعد را به قواعدِ
//    پایه منتقل کند، ظاهرِ گوشی هم عوض می‌شود و آینه می‌شکند. تستِ ۳
//    دقیقاً همین را می‌بندد.
//
// ⚠️ گاردِ ایستا نباید کامنت را کد بخواند؛ `strip()` قبل از هر بررسی
//    کامنت‌ها را حذف می‌کند وگرنه همین توضیحات تست را سبز می‌کردند.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');

/** کامنت‌های `//` و `/* *\/` را حذف می‌کند تا متنِ توضیحی به‌جای کد شمرده نشود. */
function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/\/?.*$/gm, '')
    .replace(/([^:])\/\/.*$/gm, '$1');
}

const css = strip(fs.readFileSync(path.join(root, 'userweb/src/style.css'), 'utf8'));

let checks = 0;
function ok(label, cond) {
  checks += 1;
  assert.ok(cond, `✗ ${label}`);
  console.log(`  ✓ ${label}`);
}

// ── ۱. کاشیِ بازی نباید عرضِ ثابتِ ارثیِ `.card` را نگه دارد ───────────────
// بلوک را بلوک‌محور جدا می‌کنیم، نه با `[\s\S]*$` که تا آخرِ فایل می‌بلعد.
const tileBlock = css.match(/\.gameTileSquare\s*\{([^}]*)\}/);
ok('بلوکِ .gameTileSquare پیدا شد', Boolean(tileBlock));
ok('کاشیِ بازی عرضش را به کانتینر گره زده (width:100%) تا ۵۶۰pxِ .card سرریز نکند',
  /width\s*:\s*100%/.test(tileBlock[1]));
ok('کاشیِ بازی min-width:0 دارد تا ترکِ گرید بتواند کوچکش کند',
  /min-width\s*:\s*0/.test(tileBlock[1]));

// ── ۲. اصلاحاتِ دسکتاپ واقعاً وجود دارند ────────────────────────────────
ok('بلوکِ دسکتاپ (min-width:1100px) در استایل هست',
  /@media\s*\(\s*min-width:\s*1100px\s*\)/.test(css));

// ── ۳. مهم‌ترین تست: هیچ اصلاحِ دسکتاپی نباید بیرونِ media query باشد ─────
// روشِ سنجش: بلوک‌های `@media (min-width: …)` را با شمارشِ آکولاد جدا و از
// متن حذف می‌کنیم؛ چیزی که می‌ماند «قواعدِ پایه»‌ای است که موبایل هم
// می‌بیند. سپس مطمئن می‌شویم نشانه‌های چیدمانِ دسکتاپ آنجا نیستند.
function stripMinWidthBlocks(src) {
  let out = '';
  let i = 0;
  const re = /@media[^{]*min-width[^{]*\{/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    out += src.slice(i, m.index);
    let depth = 1;
    let j = m.index + m[0].length;
    while (j < src.length && depth > 0) {
      if (src[j] === '{') depth += 1;
      else if (src[j] === '}') depth -= 1;
      j += 1;
    }
    i = j;
    re.lastIndex = j;
  }
  return out + src.slice(i);
}

const base = stripMinWidthBlocks(css);

// نوارِ ناوبری روی گوشی باید تمام‌عرض و چسبیده به پایین بماند. اگر
// «پیلِ وسط‌چین»ِ دسکتاپ به قواعدِ پایه نشت کند، این را می‌گیریم.
const baseNavBlocks = base.match(/\.mobileNav\s*\{[^}]*\}/g) || [];
ok('در قواعدِ پایه، .mobileNav هیچ transform: translateX ندارد (پیلِ وسط‌چین فقط دسکتاپ است)',
  !baseNavBlocks.some(b => /transform\s*:\s*translateX/.test(b)));
ok('در قواعدِ پایه، .mobileNav با left:0;right:0 تمام‌عرض می‌ماند',
  baseNavBlocks.some(b => /left:\s*0/.test(b) && /right:\s*0/.test(b)));

// گریدهایی که روی دسکتاپ ستون‌دار شده‌اند نباید در پایه ستون‌دار باشند.
const baseInv = base.match(/\.homeInventoryPreview\s*\{[^}]*\}/);
ok('کلکسیونِ خانه در قواعدِ پایه سه‌ستونیِ موبایل مانده',
  Boolean(baseInv) && /repeat\(\s*3\s*,/.test(baseInv[0]));

const baseTileGrid = base.match(/\.gameTileGrid\s*\{[^}]*\}/);
ok('گریدِ کاشیِ بازی در قواعدِ پایه دوستونیِ موبایل مانده',
  Boolean(baseTileGrid) && /repeat\(\s*2\s*,/.test(baseTileGrid[0]));

// ── ۴. تستِ شکست (fail-test) روی خودِ منطق ──────────────────────────────
// اگر `stripMinWidthBlocks` درست کار نکند، تستِ ۳ همیشه سبز می‌شود و بی‌ارزش
// است. با یک نمونهٔ ساختگی ثابت می‌کنیم که واقعاً محتوای داخلِ media را
// حذف و محتوای بیرونش را نگه می‌دارد.
const sample = '.a{color:red}@media (min-width:1100px){.b{color:blue}}.c{color:green}';
const stripped = stripMinWidthBlocks(sample);
ok('منطقِ حذفِ media-block: محتوای داخلِ min-width حذف می‌شود',
  !stripped.includes('.b'));
ok('منطقِ حذفِ media-block: محتوای بیرونِ آن دست‌نخورده می‌ماند',
  stripped.includes('.a') && stripped.includes('.c'));

console.log(`\n✅ ${checks} تست چیدمانِ دسکتاپ موفق بود\n`);
