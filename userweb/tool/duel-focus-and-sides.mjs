#!/usr/bin/env node
// نگهبانِ «سمتِ درستِ بازیکن» و «کادرِ معیارِ راند» در دوئل کارت (وب + اندروید).
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این فایل وجود دارد
// ═══════════════════════════════════════════════════════════════════════════
//
// ۱) مالک (۲۹ شهریور) با اسکرین‌شات گفت: «من سمت راست هستم، ولی اونجا که
//    نوشته ربات و تو، برعکسِ پوزیشنِ من قرار گرفته.»
//    ریشه‌یابی: ردیفِ قدرتِ راند (`<strong class="duelPowerDuel">`) درست
//    `direction:rtl` داشت — ولی **یک قانونِ قدیمی‌تر و خاص‌تر**
//    (`.duelClashCore>strong{direction:ltr}` با وزنِ ۰-۱-۱ در برابر ۰-۱-۰)
//    آن را می‌شکست و «تو» را می‌برد سمتِ چپ. باگِ واقعی، فقط وب، هر دو
//    حالتِ کلاسیک/طوفان (هر دو همان مارک‌آپِ مشترک را می‌گیرند).
//
//    ⚠️ درسِ این باگ: در CSS کافی نیست که `direction:rtl` را ببینی؛ باید
//    ببینی **کدام قانون برندهٔ کَسکِید است**. پس این تست فقط وجودِ رشته را
//    نمی‌سنجد، یک موتورِ کوچکِ وزن‌دهی (specificity) دارد و برنده را حساب
//    می‌کند. اگر کسی دوباره یک سلکتورِ خاص‌تر با `ltr` اضافه کند، تست
//    می‌شکند — همان چیزی که این بار کسی را متوجه نکرد.
//
// ۲) خواستهٔ تازه: «هر راند سر چی بازی می‌شود» باید یک **کادرِ درشتِ
//    چشم‌گیر** باشد (نه قرصِ ۱۲پیکسلی)، در هر دو پلتفرم و هر دو حالت.
//    این تست تضمین می‌کند سمتِ وب و آینهٔ اندرویدش با هم جا نمانند.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// CSS از هابِ style.css خوانده می‌شود (همان کاری که round-intro-parity می‌کند)
// تا اگر فایل‌ها جابه‌جا شوند تست بی‌صدا سبز نشود.
function loadCss() {
  const hub = read('userweb/src/style.css');
  if (hub.includes("@import './styles/")) {
    const imports = [...hub.matchAll(/@import\s+['"]\.\/styles\/([^'"]+)['"]/g)].map((m) => m[1]);
    let combined = '';
    for (const f of imports) {
      try { combined += '\n' + read(`userweb/src/styles/${f}`); } catch { /* فایلِ اختیاری */ }
    }
    return combined || hub;
  }
  return hub;
}

const css = loadCss();
const jsx = read('userweb/src/cardDuelGame.jsx');
const dart = read('mobile/lib/screens/user/games/card_duel/card_duel_widgets.dart');
const html = read('userweb/index.html');
const baseCss = read('userweb/src/styles/base.css');

let passed = 0;
const check = (name, fn) => {
  fn();
  console.log(`  ✓ ${name}`);
  passed += 1;
};
const cssHas = (needle) => css.includes(needle);

// ═══════════════════════════════════════════════════════════════════════════
// موتورِ کوچکِ کَسکِید
// ═══════════════════════════════════════════════════════════════════════════

/** همهٔ قانون‌های CSS با ترتیبِ متنبعی + وزنِ سلکتور. */
function directionRules(source) {
  // کامنت‌ها حذف می‌شوند تا سلکتورهای نمونه‌داخلِ توضیح اشتباه خوانده نشوند.
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean)) !== null) {
    // انتخاب‌گرهای گروهی: هر کدام جدا حساب می‌شوند.
    const sels = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    const dir = /(^|;|\s)direction\s*:\s*(ltr|rtl)/.exec(m[2]);
    if (!dir) continue;
    for (const sel of sels) {
      rules.push({ sel, dir: dir[2], order: m.index, spec: specificity(sel) });
    }
  }
  return rules;
}

/** وزنِ سلکتور (ids*1e6 + classes/attrs/pseudo*1e3 + types). */
function specificity(sel) {
  const noStrings = sel.replace(/\[[^\]]*\]/g, '[]').replace(/\([^)]*\)/g, '()');
  const ids = (noStrings.match(/#[\w-]+/g) || []).length;
  const classes = (noStrings.match(/\.[\w-]+/g) || []).length
    + (noStrings.match(/\[\]/g) || []).length
    + (noStrings.match(/:{1,2}[\w-]+(\(\))?/g) || []).length;
  const types = (noStrings
    .replace(/\[\]|:[^ >+~,]*/g, ' ')
    .match(/(^|[\s>+~,(])([a-zA-Z][\w-]*)/g) || []).length;
  return ids * 1e6 + classes * 1e3 + types;
}

/** تطبیقِ تقریبیِ سلکتور با یک عنصر: تنها کلاس‌های عنصر و نیاکانش شناخته‌اند. */
function matches(sel, { tag, classes, ancestors }) {
  const parts = sel.split(/\s*([>+~])\s*|\s+/).filter((p) => p && !' >+~'.includes(p));
  const last = parts[parts.length - 1];
  const own = last.match(/\.[\w-]+/g) || [];
  if (own.some((c) => !classes.includes(c.slice(1)))) return false;
  const tagIn = /(^|[\s>+~,(])([a-zA-Z][\w-]*)/.exec(last);
  if (tagIn && tagIn[2] !== tag) return false;
  for (const part of parts.slice(0, -1)) {
    const need = (part.match(/\.[\w-]+/g) || []).map((c) => c.slice(1));
    if (need.some((c) => !ancestors.includes(c))) return false;
  }
  return true;
}

/** برندهٔ کَسکِید برای یک عنصر: خاص‌ترین، و در تساوی آخرین در متن. */
function winningDirection(source, element) {
  const hits = directionRules(source)
    .filter((r) => matches(r.sel, element))
    .sort((a, b) => (a.spec - b.spec) || (a.order - b.order));
  return hits.length ? hits[hits.length - 1] : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ۱. سمتِ بازیکن در وب — «تو» راست، «ربات/حریف» چپ (کلاسیک و طوفان)
// ═══════════════════════════════════════════════════════════════════════════

check('CSS: ردیفِ قدرتِ راند عملاً RTL است (برندهٔ کَسکِید، نه رشتهٔ خام)', () => {
  const win = winningDirection(css, {
    tag: 'strong',
    classes: ['duelPowerDuel'],
    ancestors: ['duelClashCore', 'duelClash', 'duelClashCine', 'duelLiveArena'],
  });
  assert(win, 'هیچ قانونی برای `.duelPowerDuel` مقدارِ direction تعیین نمی‌کند');
  assert.strictEqual(win.dir, 'rtl',
    `قانونِ برنده «${win.sel}» با direction:${win.dir} است — «تو» سمتِ چپ می‌افتد`);
});

check('وب: «تو» در DOM جلوتر از حریف است (پس در RTL سمتِ راست)', () => {
  const orders = [
    ['duelClashSide mine', 'duelClashSide theirs'],
    ['duelPowerOwner mine', 'duelPowerOwner theirs'],
    ['className={`mine ${myAhead', 'className={`theirs ${theirAhead'],
  ];
  for (const [mine, theirs] of orders) {
    const a = jsx.indexOf(mine);
    const b = jsx.indexOf(theirs);
    assert(a !== -1 && b !== -1, `مارک‌آپِ «${mine}» یا «${theirs}» پیدا نشد`);
    assert(a < b, `«${mine}» باید قبل از «${theirs}» در DOM باشد`);
  }
});

check('وب: صفحه RTL است و هیچ‌جا `direction:ltr` روی ردیفِ سمت‌ها نمانده', () => {
  assert(html.includes('dir="rtl"'), 'index.html باید dir="rtl" داشته باشد');
  assert(/body\{[^}]*direction:rtl/.test(baseCss), 'body باید direction:rtl داشته باشد');
  // ردیف‌های دوئل هیچ‌وقت نباید در جهتِ چپ‌به‌راست بنشینند.
  for (const sel of ['.duelClashCine', '.duelPowerDuel']) {
    const re = new RegExp(`${sel.replace('.', '\\.')}\\{[^}]*direction:ltr`);
    assert(!re.test(css), `«${sel}» نباید ltr باشد`);
  }
});

check('هر دو حالت (کلاسیک/طوفان) از همین یک مارک‌آپِ سمت‌ها استفاده می‌کنند', () => {
  // طوفان فقط کلاسِ رنگ اضافه می‌کند؛ اگر روزی چیدمانِ جدا بسازد، این تست
  // می‌شکند و مجبور می‌شویم جهتِ آن را هم بسنجیم.
  assert(cssHas('.duelClashCine{direction:rtl}'), 'قراردادِ RTL صحنهٔ دوئل حذف شده');
  for (const cls of ['isStorm', 'inOvertime']) {
    const re = new RegExp(`\\.duelClashCine\\.${cls}[^{]*\\{[^}]*direction`);
    const m = re.exec(css);
    assert(!m || /direction:rtl/.test(m[0]), `حالتِ ${cls} جهتِ چیدمان را دستکاری می‌کند`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ۲. سمتِ بازیکن در اندروید — همان قرارداد
// ═══════════════════════════════════════════════════════════════════════════

check('اندروید: صحنهٔ برخورد RTL است و کارتِ «تو» اول (راست) می‌آید', () => {
  const clash = dart.slice(dart.indexOf('class _ClashStage'));
  const row = clash.slice(0, clash.indexOf('_ClashCardOwner'));
  assert(row.includes('textDirection: TextDirection.rtl'),
    'روی ردیفِ صحنهٔ برخورد باید TextDirection.rtl باشد');
  const mineAt = clash.indexOf("owner: 'تو'");
  const theirsAt = clash.indexOf('owner: opponentRole');
  assert(mineAt !== -1 && theirsAt !== -1, 'کارتِ «تو»/حریف پیدا نشد');
  assert(mineAt < theirsAt, 'کارتِ «تو» باید قبل از حریف بیاید تا سمتِ راست بنشیند');
});

check('اندروید: تختهٔ امتیاز RTL است و «تو» اول (راست) می‌آید', () => {
  const board = dart.slice(dart.indexOf('class _Scoreboard'));
  const mineAt = board.indexOf("role: 'تو'");
  const theirsAt = board.indexOf('role: opponentRole');
  assert(board.includes('textDirection: TextDirection.rtl'),
    'تختهٔ امتیاز باید RTL باشد');
  assert(mineAt !== -1 && theirsAt !== -1 && mineAt < theirsAt,
    'در تختهٔ امتیاز «تو» باید قبل از حریف بیاید');
});

// ═══════════════════════════════════════════════════════════════════════════
// ۳. کادرِ معیارِ راند — درشت، رنگی، در هر دو پلتفرم
// ═══════════════════════════════════════════════════════════════════════════

check('وب: کادرِ معیارِ راند جای قرصِ ۱۲پیکسلی را گرفته', () => {
  assert(jsx.includes('duelFocusBox'), 'کادرِ معیارِ راند در وب ساخته نشده');
  assert(cssHas('.duelFocusBox{'), 'استایلِ `.duelFocusBox` نوشته نشده');
  const b = /\.duelFocusBoxText b\{[^}]*font-size:([\d.]+)px/.exec(css);
  assert(b, 'اندازهٔ نامِ معیار پیدا نشد');
  assert(Number(b[1]) >= 15, `نامِ معیار ${b[1]}px است — «خیلی تو چشم» نیست`);
  // قرصِ قدیمی نباید برگردد (نه در CSS، نه در مارک‌آپ).
  assert(!cssHas('.duelFocusPill{'), 'قرصِ کوچکِ قدیمی به CSS برگشته');
  assert(!jsx.includes('duelFocusPill'), 'قرصِ کوچکِ قدیمی به مارک‌آپ برگشته');
});

check('وب: کادر ارتفاعِ اضافه نمی‌سازد (خطِ راهنما روی موبایل پنهان است)', () => {
  const media = css.slice(css.lastIndexOf('@media(max-width:700px)'));
  assert(/\.duelFocusBoxText em\{display:none\}/.test(media)
    || /\.duelFocusBoxText em\s*\{\s*display:\s*none/.test(css),
  'روی صفحهٔ باریک باید خطِ راهنمای کادر پنهان شود تا اسکرول زیاد نشود');
});

check('وب: معیارِ راند در صحنهٔ نتیجه هم چیپِ رنگی دارد', () => {
  assert(jsx.includes('duelClashFocus'), 'چیپِ معیار در صحنهٔ نتیجه ساخته نشده');
  assert(cssHas('.duelClashCore>span.duelClashFocus'), 'استایلِ چیپ نوشته نشده');
  // رنگ باید از همان نگاشتِ ویژگی بیاید، نه رنگِ ثابت.
  assert(jsx.includes('FOCUS_META'), 'نگاشتِ رنگِ معیارها در وب پیدا نشد');
});

check('اندروید: همان کادر در نبردِ زنده هست (نه قرصِ ۱۲پیکسلی)', () => {
  const live = dart.slice(dart.indexOf('class _LiveBattle'), dart.indexOf('class _LiveBattle') + 12000);
  // ⚠️ برشِ ثابت و نه regex: داخلِ آرگومان‌ها پرانتز وجود دارد
  // (`ValueKey(...)`) و regexِ غیرحریص وسطِ آن قطع می‌شود.
  const at = live.indexOf('_FocusBanner(');
  assert(at !== -1, 'کادرِ معیارِ راند در _LiveBattle صدا زده نمی‌شود');
  const call = live.slice(at, at + 700);
  assert(/dense:\s*true/.test(call), 'کادر باید حالتِ فشردهٔ داخلِ ردیفِ ساعت را بگیرد');
  assert(/storm:\s*roundMod == 'storm'/.test(call), 'نشانِ راندِ طوفانی وصل نیست');
  // خوانایی روی موبایل گاردِ جداگانه دارد: mobile/test/duel_focus_and_speed_test.dart
});

check('اندروید: خطِ راهنما در حالتِ فشرده پنهان است و نشانِ ×۲ دارد', () => {
  assert(dart.includes('if (text.isNotEmpty && !widget.dense)'),
    'خطِ راهنما در حالتِ فشرده پنهان نشده (ارتفاعِ اضافه)');
  assert(dart.includes('×۲ دوامتیازی'), 'نشانِ راندِ دو‌امتیازی روی کادر نیست');
});

check('هر دو پلتفرم یک متنِ کادر دارند (آینه‌گیِ وب↔اندروید)', () => {
  for (const t of ['نبرد بر سر', 'راند']) {
    assert(jsx.includes(t), `وب متنِ «${t}» را ندارد`);
    assert(dart.includes(t), `اندروید متنِ «${t}» را ندارد`);
  }
});

console.log(`\n✅ ${passed} تستِ معیارِ راند و سمتِ بازیکن موفق بود`);
