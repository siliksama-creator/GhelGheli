#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// همسانیِ «پنلِ متن‌های زنده» بین وب و اندروید (فاز ۳)
//
// چرا این گارد، وقتی تازه یک صفحه نوشته‌ایم و «درست است»؟
//
// دو پنلِ ادمین از هم جدا هستند و هیچ زبانی بینشان مشترک نیست (`admin/*.jsx`
// در برابر `mobile/lib/screens/admin/*.dart`). تنها چیزی که این دو را «یکسان»
// نگه می‌دارد، حافظهٔ آدم است — و حافظه دقیقاً همان چیزی است که در این پروژه
// بارها ثابت شده قابل اتکا نیست (سه بار «عددِ ۳۰ جای ۵۰۰» فقط به‌خاطرِ همین
// جابه‌جا شد). پس هر دو پنل باید *سنجیده* شوند، نه تضمین داده شوند.
//
// گارد چه می‌بیند:
//  ۱) صفحه در *هر دو* پنل ثبت شده (NAV در وب، چهار فهرستِ هم‌شاخص در اندروید).
//  ۲) نامِ گروه‌های فارسی مو‌به‌مو یکی است (`GROUP_LABEL` ↔ `kAdminCopyGroups`).
//     اگر این دو فرق کند، ادمین در یک پنل «راهنمای سکه» می‌بیند و در دیگری
//     «سکه»، و برای ویرایشِ یک جمله دنبالِ دستهٔ خودش می‌گردد.
//  ۳) هر دو به *همهٔ* گروه‌های `DEFAULT_COPY` ردیف دارند و برعکس — یعنی پنل
//     هیچ‌وقت «نیمی از متن‌ها» را پنهان نمی‌کند (این همان «۱۰۰٪ parity»ی است که
//     در پذیرش خواسته شده).
//  ۴) چهار فهرستِ اندروید (`_pages`/`_titles`/`_icons`/`_subtitles`) هم‌طولند؛
//     یکی جابه‌جا شدن = صفحه با تیترِ صفحهٔ دیگر باز می‌شود و این فاجعهٔ
//     *بی‌صدا* است، چون هیچ خطایی نمی‌دهد.
//  ۵) قاعدهٔ «حداکثر یک درخواست به هر مسیر در هر build» در اندروید — همان
//     سقفی که در تستِ `home_shell_test` محصول را کنترل می‌کند؛ پنل هم نباید
//     با هر keystroke سه fetch بزند.
//
// مثلِ بقیهٔ گاردها: فقط فایل‌ها را می‌خواند. نه DB، نه شبکه، نه Flutter.
// ═══════════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
    return;
  }
  fail++;
  console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`);
};

/**
 * نخستین `{` یا `[` واقعیِ بعدِ marker. «واقعی» یعنی نه داخلِ کامنت، نه
 * داخلِ رشته. چرا این‌قدر وسواس: بلاکِ `///` بالایِ `DEFAULT_COPY` یک
 * `{name}` نمونه در خودش دارد و اگر همان را سرِ شیء بگیریم، شمارندهٔ عمق
 * گیج می‌شود و گارد *یک* گروه پیدا می‌کند و بعد با اطمینانِ کامل
 * «پنل وب گروهی را پنهان کرده» می‌گوید. گاردی که خودش باگ داشته باشد،
 * کارِ جعلی تولید می‌کند — یعنی می‌رویم کدِ درست را عوض می‌کنیم تا
 * ابزار راضی شود. (سه بار در این پروژه همین اشتباه را کردیم.)
 */
function openAt(src, from, brace) {
  let i = from;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) return -1; continue; }
    if (c === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? src.length : j + 2; continue; }
    if (c === '\'' || c === '"' || c === '`') {
      i++;
      while (i < src.length) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === c) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === brace) return i;
    i++;
  }
  return -1;
}

/** استخراجِ یک شیءِ `{…}` از متنِ منبع، با شمارشِ عمق و بی‌توجهی به رشته‌ها. */
function objectAt(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) return null;
  const open = openAt(src, at, '{');
  if (open < 0) return null;
  let depth = 0;
  let i = open;
  let quote = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') { quote = c; continue; }
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (!depth) return src.slice(open, i + 1); }
  }
  return null;
}

/** فهرستِ `[ … ]` با همان قاعده. */
function arrayAt(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) return null;
  const open = openAt(src, at, '[');
  let depth = 0;
  let i = open;
  let quote = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '\'' || c === '"' || c === '`') { quote = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (!depth) return src.slice(open + 1, i); }
  }
  return null;
}

// ── ۱) پنل وب ─────────────────────────────────────────────────────────────
const WEB_PAGE = 'admin/src/pages/live-copy.jsx';
const WEB_MAIN = 'admin/src/main.jsx';
const webPage = read(WEB_PAGE);
const webMain = read(WEB_MAIN);

// هر دو پنل با *یک* قاعده خوانده می‌شوند (regexِ `'key': 'value'` روی بدنهٔ
// شیء). عمداً eval نمی‌کنیم: نسخهٔ وب شیء را با `const GROUP_LABEL = {…}`
// تعریف می‌کند و اگر `objectAt` را از نامِ متغیر شروع کنیم، رشتهٔ `const …`
// به eval می‌رود و بی‌صدا null برمی‌گردد — یعنی یک گاردِ «سبزِ کور». همان
// دامی که سرِ گاردِ متنِ زنده سه بار خوردیم؛ تکرارش نمی‌کنیم.
// کلید در JS می‌تواند بی‌نقل‌قول باشد (`referral: '…'`) و در دارت باید
// نقل‌قول داشته باشد (`'referral': '…'`)؛ پس `?` — وگرنه یک پنل «پنهان‌کننده»
// به‌نظر می‌رسید در حالی که فقط زبانِ نگارشش فرق دارد.
const pairRe = /'?([a-zA-Z][a-zA-Z0-9_]*)'?\s*:\s*'([^']*)'/g;
const groupsOf = (body) => {
  const out = {};
  if (!body) return out;
  for (const m of body.matchAll(pairRe)) out[m[1]] = m[2];
  return out;
};
const webGroups = groupsOf(objectAt(webPage, 'const GROUP_LABEL'));
ok('پنل وب: `GROUP_LABEL` خوانده شد', Object.keys(webGroups).length > 0,
  `${Object.keys(webGroups).length} گروه`);

ok('پنل وب: صفحه در NAV ثبت است', /'live-copy',\s*'متن‌های زنده'/.test(webMain));
ok('پنل وب: صفحه تنبل بارگذاری می‌شود (مثل بقیهٔ صفحات)',
  /LiveCopyPage = lazy\(\(\) => import\('\.\/pages\/live-copy\.jsx'\)/.test(webMain));

// ── ۲) پنل اندروید ────────────────────────────────────────────────────────
const MOBILE_PAGE = 'mobile/lib/screens/admin/admin_live_copy.dart';
const MOBILE_SHELL = 'mobile/lib/screens/admin/admin_shell.dart';
const mobilePage = read(MOBILE_PAGE);
const mobileShell = read(MOBILE_SHELL);

const andGroups = groupsOf(objectAt(mobilePage, 'kAdminCopyGroups ='));
ok('پنل اندروید: `kAdminCopyGroups` خوانده شد', Object.keys(andGroups).length > 0,
  `${Object.keys(andGroups).length} گروه`);

const diff = [];
for (const k of new Set([...Object.keys(webGroups), ...Object.keys(andGroups)])) {
  if (!(k in webGroups)) diff.push(`${k}: فقط در اندروید`);
  else if (!(k in andGroups)) diff.push(`${k}: فقط در وب`);
  else if (webGroups[k] !== andGroups[k]) {
    diff.push(`${k}: وب «${webGroups[k]}» ↔ اندروید «${andGroups[k]}»`);
  }
}
ok('نامِ گروه‌ها در دو پنل واژه‌به‌واژه یکی است', diff.length === 0, diff.join(' | '));

// ── ۳) پوششِ کاملِ گروه‌ها (۱۰۰٪ parity) ──────────────────────────────────
const svcSrc = read('backend/src/services/liveContent.js');
const copySrc = objectAt(svcSrc, 'const DEFAULT_COPY =');
const serverGroups = new Set();
{
  // گروه‌ها = کلیدهایِ سطحِ اوّلِ `DEFAULT_COPY` (تورفتگیِ دو فاصله، بعدِش
  // `{`). چرا خط‌به‌خط و نه با شمارشِ عمق: مقدارهایِ ما رشته‌هایِ
  // جای‌نگهداردارند («هر {invitesPerDailySpin} دعوت…») و هر `{` درونِ
  // رشته، شمارندهٔ عمق را یک دانه بالا می‌برد و برای همیشه آن را پایین
  // نمی‌آورد — نتیجه: گارد *یک* گروه می‌بیند و بقیه را «پنهان‌شده» اعلام
  // می‌کند. دقیقاً همان دامِ «پارسرِ نیمه‌دستِ JS» که در گاردِ متنِ زنده
  // شش بار خوردیم؛ درسش این بود: سنجه‌هایِ ساده را با *ساختارِ نگارش*
  // بزن، نه با شبیه‌سازیِ پارسر.
  const open = openAt(svcSrc, svcSrc.indexOf('const DEFAULT_COPY ='), '{');
  const body = open < 0 ? '' : svcSrc.slice(open, svcSrc.indexOf('\n}', open) > 0
    ? svcSrc.indexOf('\n}', open) + 2 : open + 9000);
  for (const line of body.split('\n')) {
    const m = /^  ([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*\{\s*$/.exec(line);
    if (m) serverGroups.add(m[1]);
  }
}

ok(`گروه‌هایِ سرور پیدا شد (${serverGroups.size})`, serverGroups.size >= 8);
const noWeb = [...serverGroups].filter((g) => !(g in webGroups));
const noAnd = [...serverGroups].filter((g) => !(g in andGroups));
ok('پنل وب هیچ گروهی را پنهان نکرده', noWeb.length === 0, noWeb.join(', '));
ok('پنل اندروید هیچ گروهی را پنهان نکرده', noAnd.length === 0, noAnd.join(', '));
const extraWeb = Object.keys(webGroups).filter((g) => !serverGroups.has(g));
const extraAnd = Object.keys(andGroups).filter((g) => !serverGroups.has(g));
ok('گروه‌هایِ بی‌منبع (که هیچ متنی ندارند) در پنل‌ها نیستند',
  extraWeb.length === 0 && extraAnd.length === 0,
  [...extraWeb, ...extraAnd].join(', '));

// ── ۴) هم‌طولیِ چهار فهرستِ اندروید ───────────────────────────────────────
{
  const count = (marker) => {
    const body = arrayAt(mobileShell, marker);
    if (!body) return -1;
    return body.split('\n').filter((l) => /^\s*[A-Za-z'`]/.test(l.trim()) && l.trim()).length;
  };
  const pages = (arrayAt(mobileShell, 'late final List<Widget> _pages') || '')
    .split('\n').filter((l) => l.trim().startsWith('Admin')).length;
  const titles = count('static const _titles');
  const icons = count('static const _icons');
  const subs = count('static const _subtitles');
  ok(`چهار فهرستِ اندروید هم‌طولند (صفحات ${pages}، تیتر ${titles}، آیکون ${icons}، توضیح ${subs})`,
    pages > 0 && pages === titles && pages === icons && pages === subs,
    'جابه‌جا‌شدنِ یکی = صفحه با تیتر/آیکونِ صفحهٔ دیگر باز می‌شود و هیچ خطایی نمی‌دهد');
  ok('اندروید: «متن‌های زنده» در فهرستِ تیترها هست',
    /'متن\u200cهای زنده'/.test(mobileShell));
  ok('اندروید: صفحه ساخته می‌شود', /AdminLiveCopy\(api: widget\.api\)/.test(mobileShell));
  ok('اندروید: importِ صفحه هست', /import 'admin_live_copy\.dart';/.test(mobileShell));
}

// ── ۵) رفتارِ یکسانِ «پیش‌نمایشِ زنده» و «قفلِ ذخیره» ─────────────────────
//
// این دو، دو قولِ محصولیِ این صفحه‌اند. اگر یکی‌شان فقط در یک پنل باشد،
// ادمین در آن پنل «پیش‌نمایش» دارد و در دیگری کور ویرایش می‌کند — و بعد
// می‌گوید «پنلِ موبایل باگ دارد» در حالی که فقط نصفش ساخته شده.
ok('وب: پیش‌نمایش از `/preview` می‌گیرد', /live-content\/preview/.test(webPage));
ok('اندروید: پیش‌نمایش از `/preview` می‌گیرد', /live-content\/preview/.test(mobilePage));

// «preview را صدا می‌زند» گاردِ بی‌ارزشی بود: نسخهٔ اندروید دقیقاً همین را
// داشت و `_preview` را **هیچ‌جا نمایش نمی‌داد** — `dart analyze` آن را
// `unused_field` و از نوعِ error گفت و CI قرمز شد (صفحه‌ای که هرگز
// کامپایل نشده بود، با ✅ در نقشه‌راه ایستاده بود). پس دو سنجهٔ واقعی:
//  • خروجیِ سرور باید در ویجتِ متنی بنشیند، نه فقط در یک field؛
//  • هیچ Futureِ بیawait در این صفحه نماند (قاعدهٔ همان‌جا، نه در کل ریپو).
{
  const renders = /Text\(\s*filled\b/.test(mobilePage) ||
    /_previewOf\(/.test(mobilePage) && /Text\(\s*\n?\s*filled/.test(mobilePage);
  ok('اندروید: خروجیِ preview در متنِ «در اپ:» نشسته، نه فقط در یک فیلد',
    renders, 'پیش‌نمایشِ بی‌مصرف = هم باگِ analyze، هم ادمینِ کور');
  // خط‌به‌خط، نه با `slice` و `$`: تعریفِ `Future<void> _loadHistory() async {`
  // هم `-loadHistory()` را دارد و اگر کلِ متنِ قبلی را بکاوی، هر `await`ِ
  // دیگری در فایل آن را «پوشش‌داده» می‌نمایاند — گاردی که *سبزِ کور* است.
  const naked = mobilePage.split('\n')
    .map((l, i) => ({ l: l.replace(/\/\/.*$/, '').trim(), i: i + 1 }))
    .filter(({ l }) => l.includes('_loadHistory()') && !/async\s*\{?\s*$/.test(l) &&
      !/^(await|return)\b/.test(l));
  ok('اندروید: هیچ فراخوانیِ Futureِ بیawait نمانده', naked.length === 0,
    naked.map((x) => `خط ${x.i}: ${x.l}`).join(' | ') +
      ' — unawaited_futures در این پروژه error است، warning نه');
  ok('اندروید: fieldهایِ بی‌مصرف نگه نمی‌داریم (منبعِ حقیقتِ دوم)',
    !/_ruleValues\s*=/.test(mobilePage),
    'پاسخِ PATCHِ rules باید روی کنترلرها بنشیند (`_syncNums`)، نه در یک mapِ خاموش');

  // قاعدهٔ خطِ سومی که از همین CI گرفتیم: هر `await` که *قبل* از
  // `ScaffoldMessenger/of(context)` اضافه شود، باید `if (mounted)` هم
  // داشته باشد. دورِ قبل ما `_loadHistory()` را await کردیم (که خودش رفعِ
  // خطایِ دیگری بود) و همان await، پیامِ موفقیت را از میانِ async gap
  // عبور داد → `use_build_context_synchronously`. یعنی «رفعِ یک خطایِ
  // analyzer» بدونِ این سنجه، خودش خطایِ بعدی را می‌ساخت.
  {
    const ls = mobilePage.split('\n');
    let sinceAwait = 0;
    const exposed = [];
    for (let i = 0; i < ls.length; i++) {
      const t = ls[i].replace(/\/\/.*$/, '').trim();
      if (!t) continue;
      // چیزی که `use_build_context_synchronously` رد می‌کند، مصرفِ context
      // در خطوطِ **بعد از** وقفه است؛ `if (mounted)` (در همان خط یا خطِ
      // قبل) همان مصرف را ایمن می‌کند. این heuristic است نه type-check —
      // قضاوتِ آخر با خودِ دارت است — و هدفِ ما یک چیزِ مشخص است: رفعِ یک
      // خطایِ analyzer نباید بی‌سر‌و‌صدا خطایِ بعدی را بسازد (این دور
      // `await _loadHistory()` که خودش رفعِ باگ بود، پیامِ موفقیت را
      // بی‌محافظ کرد).
      const prev = i > 0 ? ls[i - 1].replace(/\/\/.*$/, '').trim() : '';
      const guarded = /\bif\s*\(\s*!?mounted\s*\)/.test(t) || /\bif\s*\(\s*!?mounted\s*\)/.test(prev);
      if (/\bif\s*\(\s*!?mounted\s*\)/.test(t)) sinceAwait = 0;
      // دامنه عمداً فقط `ScaffoldMessenger.of(context)` است، نه هر مصرفِ
      // context. چرا: نسخهٔ «همهٔ contextها» ابتدا `showDialog(context: …)`
      // را قرمز کرد، بعد `Navigator.pop(ctx)` داخلِ *builderِ* دیالوگ را —
      // و builder توابعِ مستقل‌اند که هیچ awaitِ بیرونی را نمی‌بینند. برای
      // تشخیصِ درست باید بلوکِ بستگی (closure) را پیمود، و یک grepِ
      // خط‌محور آن را ندارد؛ گاردی که دو سومِ قرمزی‌هایش خطایِ جعلی باشد،
      // فقط عضلهٔ «بی‌توجهی به قرمزی» را در تیم قوی می‌کند. الگوی واقعیِ
      // این پروژه (و همان که CI را قرمز کرد) پیامِ بعد از await است.
      if (sinceAwait > 0 && !guarded && /ScaffoldMessenger\.of\(context\)/.test(t)) {
        exposed.push(`خط ${i + 1}: ${t.slice(0, 60)}`);
        sinceAwait = 0; // یک بار به‌ازای هر await کافی است، نه هر خط
      }
      // شمارشِ await **آخر از همه** — در
      // `final ok = await showDialog(context: context…)` آرگومان پیش از وقفه
      // خوانده می‌شود و اگر اول بشماریم، خودِ خطِ سالم قرمز می‌شود.
      if (/\bawait\b/.test(t)) sinceAwait++;
    }
    ok('اندروید: context بعدِ await بی‌محافظ نمی‌آید', exposed.length === 0,
      exposed.join(' | ') + ' — use_build_context_synchronously هم error است');
  }
}
ok('وب: ذخیره با هشدارِ جای‌نگهدار قفل می‌شود', /disabled=\{missing\.length > 0\}/.test(webPage));
ok('اندروید: ذخیره با هشدارِ جای‌نگهدار قفل می‌شود',
  /warnings\.isNotEmpty\)\s*\?\s*null\s*:\s*_save/.test(mobilePage));
ok('وب: «حالتِ حرفه‌ای» کلیدهایِ فنی را نشان می‌دهد', /admin\.proCopy|proMode/.test(webPage));
ok('اندروید: «حالتِ حرفه‌ای» کلیدهایِ فنی را نشان می‌دهد', /_proMode/.test(mobilePage));
ok('اندروید: کنترلرها در dispose آزاد می‌شوند', /for \(final c in _text\.values\)[\s\S]{0,80}dispose\(\)/.test(mobilePage));

// «بازگشت به پیش‌فرضِ کد» هم باید در *هر دو* پنل باشد (بند ۳.۱). این دکمه
// عمداً بی‌ذخیره است: فقط فرم را پر می‌کند. اگر یکی از دو پنل ذخیره‌یِ
// یک‌کلیکه داشت و دیگری نه، ادمین در یکی «پیش‌نمایشِ بازگشت» دارد و در
// دیگری مستقیم به متنِ روزِ اوّل می‌پرد — و «دو پنلِ یکسان» شکسته است.
ok('وب: دکمهٔ «بازگشت به پیش‌فرضِ کد» دارد',
  /live-content\/defaults/.test(webPage) && /busyDefaults/.test(webPage));
ok('اندروید: دکمهٔ «پیش‌فرضِ کد» دارد',
  /live-content\/defaults/.test(mobilePage) && /_loadingDefaults/.test(mobilePage));
ok('هر دو پنل: پیش‌فرض را «روی فرم» می‌نشانند و ذخیرهٔ خودکار نمی‌کنند',
  !/defaults[\s\S]{0,200}PATCH[^)]*copy/.test(webPage));
// و مهم‌تر: «پیش‌فرض‌ها» باید واقعاً به کنترلرها بنشینند، وگرنه ظاهر
// عوض می‌شود و ذخیره همان متنِ قبلی را برمی‌گرداند (دکمهٔ توخالی).
ok('اندروید: مقدارها روی کنترلرها بازنشانی می‌شوند (`_applyValues`)',
  /void _applyValues\(/.test(mobilePage)
  && mobilePage.split('_applyValues(').length >= 4);

// سقفِ درخواست: همان قانونی که محصولِ کاربر را کنترل می‌کند.
{
  const posts = (mobilePage.match(/widget\.api\.(get|post|patch)\(/g) || []).length;
  ok(`اندروید: پنل ${posts} نقطهٔ درخواست دارد (سقفِ منطقی ۱۲)`, posts <= 12);
  ok('اندروید: پیش‌نمایش با تأخیرِ تایپ می‌چسبد (نه هر کلید)',
    /Timer\(const Duration\(milliseconds: (3\d\d|4\d\d|5\d\d)\)/.test(mobilePage));
}

console.log(`\n${fail ? '✗' : '✅'} ${pass} بررسیِ همسانیِ پنلِ متن‌ها موفق بود${fail ? `، ${fail} ناموفق` : ''}\n`);
process.exit(fail ? 1 : 0);
