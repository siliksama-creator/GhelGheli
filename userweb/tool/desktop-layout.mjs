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

/** یک فایلِ سورسِ userweb را می‌خواند و کامنت‌هایش را حذف می‌کند. */
const read = (rel) => strip(fs.readFileSync(path.join(root, 'userweb', rel), 'utf8'));

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

// ── ۵. چیدمانِ داخلِ بازی (دور ۱۴) ─────────────────────────────────────
// اندازه‌گیری نشان داد داخلِ بازی‌ها روی دسکتاپ تا ۲۹۸px اسکرولِ عمودی
// داشت و گریدِ جفت‌یاب زیرِ نوارِ پایین پنهان می‌شد. این تست‌ها جلوی
// برگشتنِ علت‌های ریشه‌ای را می‌گیرند.

// (الف) پوستهٔ بازی نباید دوباره عرضش را inline ببندد؛ آن `maxWidth:640px`
// همان چیزی بود که همهٔ بازی‌ها را روی مانیتور در یک ستونِ باریک حبس کرد
// و چون inline بود، هیچ media query نمی‌توانست لغوش کند.
const gamesJsx = read('src/games.jsx');
ok('پوستهٔ بازی کلاسِ gameShell دارد (نه maxWidth inline)',
  /className=\{`card wide gameShell/.test(gamesJsx));
ok('در games.jsx هیچ maxWidth: \'640px\'ِ inline نمانده',
  !/maxWidth:\s*'640px'/.test(gamesJsx));
ok('حالتِ بازی با کلاسِ isPlaying به CSS اعلام می‌شود',
  /isPlaying/.test(gamesJsx));

// (ب) دوئل هم باید حالتش را اعلام کند تا چیدمانِ دو‌ستونه ممکن شود.
const duelJsx = read('src/cardDuelGame.jsx');
ok('دوئل حالتِ isSetup/isLive را روی duelPageV2 می‌گذارد',
  /duelPageV2 \$\{activeGame \? 'isLive' : 'isSetup'\}/.test(duelJsx));

// (ج) چیدمانِ دو‌ستونه فقط باید در media queryِ دسکتاپ باشد. اگر به
// قواعدِ پایه نشت کند، موبایل دیگر آینهٔ اندروید نیست.
ok('گریدِ دو‌ستونهٔ پوستهٔ بازی در قواعدِ پایه نیست',
  !/\.gameShell\.isPlaying\s*\{[^}]*display:\s*grid/.test(base));
ok('گریدِ دو‌ستونهٔ دوئل در قواعدِ پایه نیست',
  !/\.duelPageV2\.isSetup\s*\{[^}]*display:\s*grid/.test(base));
ok('چیدمانِ دو‌ستونهٔ پوستهٔ بازی در بلوکِ دسکتاپ تعریف شده',
  /\.gameShell\.isPlaying\s*\{[^}]*display:\s*grid/.test(css));
ok('چیدمانِ دو‌ستونهٔ دوئل در بلوکِ دسکتاپ تعریف شده',
  /\.duelPageV2\.isSetup\s*\{[^}]*display:\s*grid/.test(css));

// (د) گریدِ جفت‌یاب باید نسبت به ارتفاعِ نما هم بسته شود، وگرنه ردیفِ
// آخرِ کارت‌ها زیرِ نوارِ شناور می‌رود و بازی غیرقابلِ تمام‌کردن می‌شود.
// این باگ روی گوشی هم بود (۳۹۰×۸۴۴: کفِ گرید ۷۸۸ > نوار ۷۶۹).
ok('عرضِ گریدِ جفت‌یاب به vh مقید شده (ردیفِ آخر زیرِ نوار نرود)',
  /\.memGrid\s*\{[^}]*vh/.test(css));

// (ه) نوارِ تحلیلِ ترکیب کلاسِ عمومیِ `card` را هم دارد و `.card` عرضِ
// صریحِ min(560px,95vw) می‌دهد. در ستونِ ۵۲۳pxیِ دسکتاپ این یعنی ۳۷px
// بیرون‌زدگی از لبهٔ ستون (اندازه‌گیری‌شده: L=93 در برابرِ ستون L=130).
// روی گوشی رخ نمی‌داد چون مدیا کوئریِ ۹۰۰px با !important عرض را ۱۰۰٪
// می‌کند. پس در بلوکِ دسکتاپ حتماً باید width:100% خنثی‌اش کند.
ok('نوارِ تحلیلِ دوئل در دسکتاپ عرضِ ۵۶۰pxِ .card را خنثی می‌کند',
  /\.duelPageV2\.isSetup\s*>\s*\.duelIntelCompact\s*\{[^}]*width:\s*100%/.test(css));

// (و) ریلِ کناریِ بازیِ زنده باید ارتفاعِ ستون را پر کند. اندازه‌گیری:
// تخته ۷۲۴px و ریل ۱۴۳px ⇒ ۳۳۹px حفرهٔ خالی که نما را ناتمام نشان می‌داد.
ok('ریلِ کناریِ بازیِ زنده کلِ ارتفاعِ ستون را می‌گیرد و وسط‌چین می‌شود',
  /\.gameShellScore\s*\{[^}]*grid-area:\s*2\s*\/\s*2\s*\/\s*-1\s*\/\s*3[^}]*align-self:\s*center/.test(css));

// (ز) لپ‌تاپِ ۱۳۶۶×۷۶۸: تختهٔ زندهٔ دوئل تا y=۷۳۴ کشیده می‌شد ولی نوارِ
// شناور از y=۶۶۵ شروع می‌شود ⇒ ۶۹px همپوشانی و **هر پنج کارتِ دست** زیرِ
// نوار. یعنی روی رایج‌ترین رزولوشنِ لپ‌تاپ نوبت قابلِ بازی نبود.
// محافظِ padding-bottom:84px فقط در @media (max-width:520px) بود.
// درمان: جمع‌شدنِ تخته در همان بلوکِ max-height که penPitch/memGrid دارند.
const shortDesk = css.match(
  /@media\s*\(min-width:\s*1100px\)\s*and\s*\(max-height:\s*820px\)\s*\{([\s\S]*?)\n\}/);
ok('بلوکِ لپ‌تاپِ کوتاه (min-width:1100px و max-height:820px) وجود دارد',
  !!shortDesk);
ok('در لپ‌تاپِ کوتاه، ارتفاعِ کارت‌های دستِ دوئل مهار شده (زیرِ نوار نروند)',
  !!shortDesk && /\.duelPageV2\.isLive\s+\.duelHandV2\s+\.ggCardArt\s*\{[^}]*max-height/
    .test(shortDesk[1]));
ok('در لپ‌تاپِ کوتاه، پنلِ انتخابِ کارتِ دوئل هم جمع می‌شود',
  !!shortDesk && /\.duelPageV2\.isLive\s+\.duelChoicePanel\s*\{[^}]*padding/
    .test(shortDesk[1]));

console.log(`\n✅ ${checks} تست چیدمانِ دسکتاپ موفق بود\n`);
