#!/usr/bin/env node
//
// گاردِ همسانیِ «متنِ زنده» بین سرور، وب و اندروید (فاز ۲ نقشه‌راه).
//
// ═══════════════════════════════════════════════════════════════════════
// چرا یک گاردِ جدا، وقتی coin-parity هم هست؟
// ═══════════════════════════════════════════════════════════════════════
//
// `coin-parity` فقط **سکه** را می‌بیند. کلِ وعدهٔ فاز ۲ اما این است:
// «هر چیزی که کاربر می‌خواند از پنل عوض می‌شود، بدونِ نصبِ آپدیت».
// آن وعده چهار راهِdifferent دارد که بی‌گارد دیده نمی‌شوند:
//
//   ۱. کلیدی که فقط یک کلاینت می‌خواند → ادمین متن را عوض می‌کند، وب
//      تازه می‌شود و اندروید همان متنِ کهنه را نگه می‌دارد. در بازیِ
//      کراس‌پلی، دو کاربرِ همان مسابقه دو قانونِ متفاوت می‌خوانند.
//   ۲. نامِ جای‌نگهدارِ ناهم‌خوان → بدترین حالت. `text()` عمداً اگر یک
//      متغیر پیدا نشود **کلِ جمله** را به فول‌بک می‌برد (تا جملهٔ بی‌عدد
//      روی صفحه نیاید)، پس اثرِ جانبی‌اش این است که اتصالِ زنده **بی‌صدا**
//      بی‌اثر می‌شود: صفحه درست به نظر می‌رسد، تست‌های رندر سبزند، و
//      هیچ‌چیز از پنل نمی‌رسد. دقیقاً همین اتفاق افتاد وقتی اندروید
//      `quotaLow` را به‌جای `qLow` نوشته بود.
//   ۳. عددِ فول‌بکِ ناهم‌خوان با `RULE_DEFS` → وقتی config نرسد (آفلاین،
//      سرورِ قدیمی) هر دو کلاینت دو عددِ مختلف نشان می‌دهند.
//   ۴. رقمِ فارسیِ باقی‌مانده در رشته‌ها → «عددِ بی‌فهرستِ سفید» که
//      بند ۲ نقشه‌راه ممنوعش کرده.
//
// ═══════════════════════════════════════════════════════════════════════
// چرا پارسِ ایستا و نه اجرای فلاتر
// ═══════════════════════════════════════════════════════════════════════
//
// ما فقط می‌خواهیم بدانیم «کدام کلید، با کدام متغیرها» نوشته شده؛ اجرای
// واقعیِ فلاتر برای این پرسش لازم نیست و در CIِ این ریپو دقیقه‌ها هزینه
// دارد. کامنت‌ها حذف می‌شوند تا توضیحِ فارسیِ خودِ فایل‌ها مثبتِ کاذب
// نسازد (نسخهٔ اولِ `coin-parity` همین‌جا زمین خورد).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

/** کامنت‌های `//` و `/* *\/` را در JS و Dart حذف می‌کند. */
function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/\/?.*$/gm, '')
    .replace(/([^:])\/\/.*$/gm, '$1');
}

let checks = 0;
function ok(label, cond, detail = '') {
  assert.ok(cond, `✗ ${label}${detail ? `\n      ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${label}`);
}

// ── ۱) پیش‌فرض‌ها و قراردادِ سرور ───────────────────────────────────────
//
// ⚠️ `require('../src/services/liveContent.js')` اینجا ممکن نیست: آن فایل
// `opsConfig` را بالا می‌کشد که `pg` و استخرِ دیتابیس می‌خواهد. گاردِ CI
// نباید به دیتابیس نیاز داشته باشد، پس سه ثابتِ داده‌محور از متنِ منبع
// خوانده و با `eval` ساخته می‌شوند. اگر ساختارِ فایل عوض شود، یا بلوک
// پارس نشود، همین‌جا می‌ترکد — و بهتر است اینجا بترکد تا بی‌صدا بگذرد.
//
// `assert` روی طولِ بلوک هم لازم است: `indexOf('{')` اگر به آکولادِ داخلِ
// کامنتِ بالایی بخورد، یک چیزِ بی‌ربط استخراج می‌شود و همه‌چیز «سبزِ
// توخالی» می‌ماند. پس بلوک باید همان‌قدر بزرگ باشد که واقعاً هست.
function blockOf(src, name, min = 40) {
  const head = `const ${name} = Object.freeze(`;
  const at = src.indexOf(head);
  assert.ok(at >= 0, `✗ ${name} در liveContent.js پیدا نشد — گارد را به‌روز کن`);
  let i = src.indexOf('{', at + head.length);
  assert.ok(i > at, `✗ ${name}: آکولادِ بدنه پیدا نشد`);
  let depth = 0;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') {
      depth--;
      if (depth === 0) {
        const body = src.slice(i, k + 1);
        assert.ok(body.length > min,
          `✗ ${name}: بلوک فقط ${body.length} کاراکتر است — پارسِ ناقص، نه فایلِ خالی`);
        return body;
      }
    }
  }
  throw new Error(`✗ ${name}: بستنِ آکولاد پیدا نشد`);
}

const liveSrc = read('backend/src/services/liveContent.js');
const DEFAULT_COPY = eval(`(${blockOf(liveSrc, 'DEFAULT_COPY')})`);
const COPY_CONTRACT = eval(`(${blockOf(liveSrc, 'COPY_CONTRACT')})`);
const RULE_DEFS = eval(`(${blockOf(liveSrc, 'RULE_DEFS')})`);

const copyKeys = new Set();       // هر کلیدی که سرور می‌فرستد (رشته یا آرایه)
const stringKeys = new Set();     // فقط قالب‌های رشته‌ای (جای‌نگهداردار)
const templates = new Map();      // key → رشتهٔ قالبِ سرور
const placeholders = new Map();   // key → [نام‌های جای‌نگهدار]
for (const [group, fields] of Object.entries(DEFAULT_COPY)) {
  for (const [field, value] of Object.entries(fields)) {
    const key = `${group}.${field}`;
    copyKeys.add(key);
    // آرایه‌ها (مثل بندهای منشورِ حریم خصوصی) «قالبِ جای‌نگهداردار» نیستند:
    // هیچ `{x}` قابل‌تعویضی ندارند و در نتیجه ردیفِ `COPY_CONTRACT` هم
    // لازم ندارند — تستِ `testLiveContent` خودش ردیفِ بی‌مصرف را خطا
    // می‌داند، پس این‌جا هم همان قاعده را دنبال می‌کنیم و فقط رشته‌ها را
    // از قرارداد می‌خواهیم.
    if (typeof value !== 'string') continue;
    stringKeys.add(key);
    templates.set(key, value);
    const used = [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map(m => m[1]);
    placeholders.set(key, [...new Set(used)].sort());
  }
}
ok(`${copyKeys.size} قالبِ متنی در سرور ثبت شده`, copyKeys.size > 10);

{
  const missing = [...stringKeys].filter(k => {
    const [g, f] = k.split('.');
    return !Object.prototype.hasOwnProperty.call(COPY_CONTRACT[g] ?? {}, f);
  });
  ok('هر قالبِ پیش‌فرض در COPY_CONTRACT ردیف دارد', missing.length === 0,
    `${missing.join(', ')} → پیش‌نمایشِ پنل دربارهٔ این‌ها هیچ نمی‌داند`);
  // فقط ردیف‌هایِ رشته‌ای را می‌سنجیم؛ آرایه‌ها (مثل بندهای منشورِ حریم
  // خصوصی) جای‌نگهدارِ قابل‌تعویض ندارند و عمداً در قرارداد ردیف نمی‌خواهند.
  const stale = Object.entries(COPY_CONTRACT)
    .flatMap(([g, fields]) => Object.keys(fields).map(f => `${g}.${f}`))
    .filter(k => !stringKeys.has(k));
  ok('هیچ ردیفِ بی‌مصرفی در COPY_CONTRACT نمانده', stale.length === 0, stale.join(', '));
  // عددِ داخلِ قالب باید با همانِ قرارداد یکی باشد. دو فهرستِ دستی که دستی
  // عوض شوند حتماً یک روز جا می‌مانند — همان چیزی که در `tapSubtitle`
  // (که مصرف می‌شد ولی در قرارداد نبود) رخ داد.
  const drift = [...placeholders].filter(([key, used]) => {
    const [g, f] = key.split('.');
    const allowed = COPY_CONTRACT[g]?.[f];
    if (!Array.isArray(allowed)) return true;
    return used.join() !== [...new Set(allowed)].sort().join();
  });
  ok('جای‌نگهدارهای هر قالب با قراردتش یکی است', drift.length === 0,
    drift.map(([k, v]) => `${k} → {${v.join()}}`).join(' | '));
}

// ── ۲) استخراجِ اتصالِ هر کلاینت ────────────────────────────────────────
//
// سه امضای مجاز، چون هر سه خوانا و قابل‌گاردند:
//   text('k', fallback, { a, b })        وب — آرگومانِ سوم
//   rawText('k', fallback)               وب — بدونِ متغیر
//   liveText('k', fallback, vars: { … }) اندروید
//
// ⚠️ `dart format` آرگومان‌ها را به خطِ بعد می‌برد؛ الگوی چسبیده به
// پرانتز، آن فراخوانی‌ها را **نمی‌بیند** و گارد بی‌صدا کم‌کار می‌شود.
// الگو باید چندخطی باشد.
// دو شکلِ خواندنِ `copy` در کلاینت‌ها هست:
//  • رشته‌ها: `text(key, …)` / `rawText(key, …)` / `liveText(key, …)` — کلید
//    مو‌به‌مو در یک رشته می‌آید، پس `CALL` آن را می‌گیرد و vars را هم می‌خواند.
//  • فهرست‌ها: `rawList('support.privacySections', …)` (وب) و
//    `copySection('support', 'privacySections')` (دارت) — این دومی کلید را
//    *دو* آرگومان می‌گیرد و اگر در `CALL` می‌افتاد، `key.includes('.')`
//    ردش می‌کرد. نتیجه: گارد «کلیدِ بی‌مصرف» سه موردِ وصل‌شده را هم
//    بی‌مصرّف نشان می‌داد — یعنی گارد *کارِ جعلی* می‌ساخت (فشار برای
//    «برداشتنِ ردیف از سرور» تا سبز شود). پس یک شمارشگرِ جدا، فقط برای
//    بودِن/نبودِنِ مصرف — جای‌نگهدارِ این‌ها `{…}` نیست که بشود گم‌کرد.
const CALL = /(?:^|[^A-Za-z0-9_$.])(liveText|AppConfig\.instance\.text|rawText|text)\(\s*(['"])([a-zA-Z][a-zA-Z0-9_.]*)\2/gms;
const LIST_CALL = /(?:^|[^A-Za-z0-9_$.])(rawList)\(\s*(['"])([a-zA-Z][a-zA-Z0-9_.]*)\2/gms;
const SECTION_CALL = /(?:^|[^A-Za-z0-9_$.])copySection\(\s*(['"])([a-zA-Z][\w]*)\1\s*,\s*(['"])([a-zA-Z][\w]*)\3/gms;

/** پرانتزِ بازِ خودِ فراخوانی، از جایِ رشتهٔ کلید به عقب. */
function callOpen(src, beforeKey) {
  let i = beforeKey - 1;
  while (i >= 0 && /\s/.test(src[i])) i--;
  return src[i] === '(' ? i : -1;
}

/**
 * پایانِ رشتهٔ `quote`شده + شمارشِ `{`/`}`های سرِ‌بازِ داخلش.
 *
 * ⚠️ این «شمارش» دلیلِ بودنِ این تابع است. داخلِ template literal ها
 * عبارتِ `${fa(x)}` می‌آید و آن `{` در رشته، **آبجکتِ واقعی نیست**. اگر
 * شمارندهٔ آرگومان‌ها آن را نبیند، عمقش یک‌سو می‌رود و کامای جداکنندهٔ
 * آرگومانِ سوم «داخلِ آبجکت» تلقی می‌شود؛ نتیجه: گارد هیچ `vars`‌ای پیدا
 * نمی‌کند و کدِ درست را «متغیرِ جاافتاده» اعلام می‌کند — دقیقاً همان چیزی
 * که سه بار پشتِ سرِ هم ما را به بازنویسیِ گارد کشاند. پس رشته می‌خوانیم
 * و `{`/`}`های سرِ‌بازش را هم تحویلِ شمارنده می‌دهیم.
 */
function skipString(src, i) {
  const q = src[i];
  let k = i + 1;
  let stray = 0;
  while (k < src.length) {
    const c = src[k];
    if (c === '\\') { k += 2; continue; }
    if (c === q) return { end: k + 1, stray };
    if (q === '`' && c === '{') stray++;
    else if (q === '`' && c === '}') stray = stray > 0 ? stray - 1 : 0;
    k++;
  }
  return { end: k, stray };
}

/**
 * آرگومان‌های یک فراخوانی، از **پرانتزِ بازِ خودِ آن** به جلو.
 *
 * ⚠️ چرا از پرانتزِ چپ و نه از کلید به جلو: `text(…)` اغلب وسطِ JSX
 * نشسته است — `<b className="x">{text('k', fb, { v })}</b>`. اگر از کلید
 * شروع کنیم، اولین `)`ِ یافت‌شده می‌تواند متعلق به `fa(…)`ِ خطِ بعد باشد؛
 * آن‌وقت دو آرگومانِ درهم به کلیدِ درست می‌چسبد. نسخهٔ اولِ همین گارد
 * هر سه سنجه‌اش را روی همین سنگ شکست و کدِ سالم را قرمز می‌کرد.
 */
function argsAfter(src, from) {
  const out = [];
  let i = from;
  let depth = 0;
  let start = i;
  const flush = end => {
    const a = src.slice(start, end).trim();
    if (a) out.push(a);
    start = end + 1;
  };
  while (i < src.length && i - from < 4000) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') {
      const sk = skipString(src, i);
      depth += sk.stray;
      i = sk.end;
      continue;
    }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') {
      if (depth === 0) { flush(i); return out; }
      depth--;
    } else if (c === ',' && depth === 0) {
      flush(i);
    } else if (c === ';' && depth === 0) {
      flush(i);
      return out;
    }
    i++;
  }
  return out;
}

/** بدنهٔ داخلیِ آبجکت (`vars: { … }` یا `{ … }`)؛ اگر آبجکت نبود `null`. */
function objBody(arg) {
  let lit = String(arg ?? '').trim();
  if (lit.startsWith('vars:')) lit = lit.slice(5).trim();
  if (!lit.startsWith('{')) return null;
  let depth = 0;
  for (let i = 0; i < lit.length; i++) {
    const c = lit[i];
    if (c === "'" || c === '"' || c === '`') {
      const sk = skipString(lit, i);
      depth += sk.stray;
      i = sk.end - 1;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      if (depth === 1) return lit.slice(1, i);
      depth--;
    }
  }
  return null;
}

/**
 * نامِ متغیرهایی که یک آبجکت به قالبِ متن می‌دهد.
 *
 * دو شکل پذیرفته می‌شود و **فقط** همین دو:
 *   • `{ percent: pct }`  → `percent`   (کلیدِ صریح)
 *   • `{ days }`          → `days`      (شکلِ کوتاهِ ES6 = `{ days: days }`)
 *
 * ⚠️ نسخهٔ اول، هر شناسه‌ای را در عمقِ ۱ با regex می‌زد؛ نتیجه‌اش این بود
 * که از `{ percent: pct }` بیرون می‌آمد: `percent, cent, rcent, ent, t…`
 * (چون در هر کاراکترِ میانی هم «کلید» می‌دید) و گارد، کدِ درست را با
 * «متغیرِ اضافی» قرمز می‌کرد. نسخهٔ دوم هم شکلِ کوتاه را نمی‌شناخت و
 * `days` و `tapCoins` را «جاافتاده» گزارش می‌داد — یعنی برنامه‌نویس را
 * وادار می‌کرد `{ days: days }` بنویسد تا گارد راضی شود. گاردی که سبکِ
 * نوشتنِ بد تحمیل کند یا خودش باگِ جعلی بسازد، از نبودنش بدتر است:
 * آدم را عادت می‌دهد قرمزی‌اش را نادیده بگیرد.
 */
function varNames(arg) {
  const body = objBody(arg);
  if (body === null) return [];
  const out = [];
  for (const part of splitTop(body)) {
    const t = part.trim();
    if (!t) continue;
    const kv = /^['"]?([a-zA-Z$_][a-zA-Z0-9$_]*)['"]?\s*:/.exec(t);
    if (kv) { out.push(kv[1]); continue; }
    // شکلِ کوتاه: کلِ ردیف باید یک شناسهٔ تنها باشد؛ `fa(pct)` و
    // `ruleNumber('x', 4)` این‌طور نیستند و اشتباه شمرده نمی‌شوند.
    const short = /^[a-zA-Z$_][a-zA-Z0-9$_]*$/.test(t);
    if (short) out.push(t);
  }
  return [...new Set(out)].sort();
}

/** شکستنِ بدنهٔ آبجکت در کاماهای هم‌سطح (رشته و براکت‌ها را نمی‌شکند). */
function splitTop(body) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "'" || c === '"' || c === '`') {
      const sk = skipString(body, i);
      depth += sk.stray;
      i = sk.end - 1;
      continue;
    }
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ',' && depth === 0) { out.push(body.slice(start, i)); start = i + 1; }
  }
  out.push(body.slice(start));
  return out;
}

function filesIn(dir, exts) {
  const out = [];
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!p.includes('node_modules')) walk(p); return; }
    if (exts.some(x => e.name.endsWith(x))) out.push(p);
  });
  walk(path.join(root, dir));
  return out;
}

const CLIENTS = {
  web: { dir: 'userweb/src', exts: ['.js', '.jsx'] },
  android: { dir: 'mobile/lib', exts: ['.dart'] },
};

/**
 * هر فراخوانیِ متنِ زنده در یک کلاینت.
 *
 * نتیجه: `key → { vars, fallbacks, files }`. توجه که `vars` **اشتراکِ**
 * همهٔ جای‌فراخوانی‌های آن کلید است، نه فقط یکی: اگر یک صفحه متغیر را
 * پاس بدهد و صفحهٔ دیگر نه، آن صفحهٔ دوم در عملِ واقعی جملهٔ بی‌عدد
 * (در بهترین حالت: فول‌بکِ خودش) نشان می‌دهد — پس گارد باید سخت‌گیر باشد
 * و هر دو را با هم بخواهد.
 */
function scan(client) {
  const used = new Map();
  for (const file of filesIn(client.dir, client.exts)) {
    const src = strip(read(path.relative(root, file)));
    for (const m of src.matchAll(new RegExp(CALL.source, 'gms'))) {
      const key = m[3];
      if (!key.includes('.')) continue;
      const quoteAt = src.indexOf(key, m.index) - 1;
      const callAt = callOpen(src, quoteAt);
      if (callAt < 0) continue;
      const args = argsAfter(src, callAt + 1);
      if (!args.length) continue;
      const rec = used.get(key) ?? { vars: new Set(), fallbacks: [], files: new Set() };
      rec.files.add(path.relative(root, file));
      const fbText = /^(?:`([\s\S]*?)`|'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")$/.exec(args[0]);
      if (fbText) rec.fallbacks.push((fbText[1] ?? fbText[2] ?? fbText[3]).trim());
      // آرگومانِ آخر فقط وقتی آبجکت است که واقعاً `{…}`/`vars: {…}` باشد؛
      // در `liveText('k', 'رشته')` همان آرگومانِ دوم است و تفسیرش به
      // آبجکت، کلماتِ داخلِ رشته را «متغیر» می‌کرد.
      const last = args.length > 1 ? args[args.length - 1] : '';
      if (last && last !== args[0]) for (const v of varNames(last)) rec.vars.add(v);
      used.set(key, rec);
    }
  }
  return used;
}

const used = { web: scan(CLIENTS.web), android: scan(CLIENTS.android) };
console.log(`\n══ اتصالِ خوانده‌شده: وب ${used.web.size} کلید، اندروید ${used.android.size} ══`);
ok('هر دو کلاینت حداقل یک کلیدِ زنده می‌خوانند',
  used.web.size > 0 && used.android.size > 0);
// گاردی که هیچ فراخوانی‌ای پیدا نکند، سبزِ بی‌معنی است. این خط عمداً
// تعدادِ کم را هم رد می‌کند تا یک refactorِ بزرگ، گارد را کور نکند.
ok('تعدادِ کلیدهای پیداشده معقول است',
  used.web.size >= 12 && used.android.size >= 8,
  `وب ${used.web.size} / اندروید ${used.android.size}`);

// ── ۳) هیچ‌کس کلیدِ بی‌سرور نمی‌خواند ───────────────────────────────────
for (const [label, map] of Object.entries(used)) {
  const ghost = [...map.keys()].filter(k => !copyKeys.has(k));
  ok(`${label}: هر کلیدِ مصرفی در پیش‌فرضِ سرور وجود دارد`, ghost.length === 0,
    `${ghost.join(', ')} → سرور هرگز این‌ها را نمی‌فرستد، پس متن همیشه فول‌بک است`);
}

// ── ۴) نامِ متغیرها با قرارداد یکی باشد ────────────────────────────────
//
// این همان خطی است که باگِ `quotaLow`/`qLow` را می‌گیرد.
for (const [label, map] of Object.entries(used)) {
  const bad = [];
  for (const [key, rec] of map) {
    const allowed = placeholders.get(key);
    if (!allowed) continue;
    if (!allowed.length) {
      if (rec.vars.size) bad.push(`${key}: قالب جای‌نگهدار ندارد ولی متغیر پاس داده شد (${[...rec.vars].join()})`);
      continue;
    }
    if (rec.vars.size === 0) {
      bad.push(`${key}: هیچ متغیری پاس داده نشده در حالی که قالب {${allowed.join()}} می‌خواهد → کلِ جمله به فول‌بک می‌رود و اتصالِ زنده بی‌اثر می‌شود`);
      continue;
    }
    const extra = [...rec.vars].filter(v => !allowed.includes(v));
    const missing = allowed.filter(v => !rec.vars.has(v));
    if (extra.length || missing.length) {
      bad.push(`${key}: پاس‌داده {${[...rec.vars].sort().join()}} ≠ قرارداد {${allowed.join()}}`
        + (extra.length ? ` — اضافی: ${extra.join()}` : '')
        + (missing.length ? ` — جاافتاده: ${missing.join()}` : ''));
    }
  }
  ok(`${label}: نامِ جای‌نگهدارها با COPY_CONTRACT می‌خواند`, bad.length === 0,
    bad.join('\n      '));
}

// ── ۵) گروه‌های مشترک باید در **هر دو** کلاینت سیم‌کشی باشند ────────────
//
// عمداً فهرستِ گروه‌ها صریح است نه «همه‌چیز»: بعضی متن‌ها (منشورِ حریم
// خصوصی، برچسب‌های بولدشدهٔ بدونِ متغیر) فعلاً فقط در وب زنده‌اند و این
// تصمیمِ فاز است. گاردِ مبهم، روزی که کسی آن‌ها را اضافه کند، بی‌سر‌و‌صدا
// سبز می‌ماند — و روزی که کسی یکی را حذف کند هم همین‌طور.
const SHARED_GROUPS = ['coinGuide', 'referral', 'reconnect', 'games', 'wheel',
  'avatars', 'plus', 'photoReview', 'streak'];

// استثناهای **صریح و ثبت‌شده**، به‌جای شل‌کردنِ کل قاعده.
//
// `plus.monthlyBadge` («۳۰ روز») روی وب یک برچسبِ کنارِ عنوانِ پلن است؛
// در اندروید چنین برچسبی در چیدمانِ کارتِ پلن وجود ندارد و افزودنش یعنی
// **تغییرِ ظاهر** — همان چیزی که مالک در بند ۱ نقشه‌راه منع کرده («ظاهرِ
// اپلیکیشن کاربر نباید عوض شود»). پس فعلاً خوانده نمی‌شود و این خط
// صریحاً می‌گوید چرا؛ اگر روزی طرحِ کارت عوض شد، همین ردیف حذف می‌شود.
// سنجه‌های دیگرِ همان کلید (وجود در سرور، قراردادِ جای‌نگهدار، برابریِ
// فول‌بک) همچنان اجرا می‌شوند.
const EXEMPT_ONE_SIDE = new Map([
  ['plus.monthlyBadge', 'برچسبِ «۳۰ روز» در چیدمانِ اندروید جای ندارد؛ افزودنش تغییرِ ظاهر است'],
  // جملهٔ تأییدِ خریدِ پلاس فقط در دیالوگِ اندروید چنین جایگاهی دارد؛ کارتِ
  // پلنِ وب فهرستِ `benefits` را از سرور می‌خواند و «تیترِ یک‌جمله‌ای» ندارد.
  // بردنِ این جمله به وب یعنی تغییرِ چیدمانِ کارت — طرحِ کاربر خطِ قرمز است.
  // در عوض اندروید *وصل* شد (قبلاً «۳۰ روز» در متنِ کد سفت بود).
  ['plus.benefitsNote', 'جملهٔ تأییدِ خرید تنها در دیالوگِ اندروید جای دارد'],
  // کارتِ استریکِ وب و اندروید دو طرحِ متفاوت‌اند: وب «روز ۳ از ۷ تکمیل
  // شد؛ زنجیره‌ات امن است» را نشان می‌دهد و اندروید دو خطِ فشردهٔ
  // «چرخه ۷ روزه · روز ۳ · ۲۰۰ امتیاز هدیه». هر دو از **یک** منبع
  // (تعدادِ ردیف‌های پاداش) عدد می‌گیرند، پس عدد یکی است؛ فقط جمله‌بندی
  // فرق دارد و این «تغییرِ ظاهر» نیست. اگر روزی طرح‌ها یکی شد، این
  // سه ردیف حذف می‌شوند.
  ['streak.webDone', 'طرحِ کارتِ استریکِ وب با اندروید فرق دارد (جملهٔ کامل در برابر دو خطِ فشرده)'],
  ['streak.cycleDone', 'فقط در کارتِ فشردهٔ اندروید جا دارد؛ وب جای آن جملهٔ دیگری دارد'],
  ['streak.cycleNext', 'فقط در کارتِ فشردهٔ اندروید جا دارد؛ وب جای آن جملهٔ دیگری دارد'],
]);
{
  // استثناها نمی‌توانند «بی‌نهایat» باشند: هر ردیفِ جدولِ بالا باید
  // واقعاً در سرور وجود داشته باشد، وگرنه یک یادداشتِ کهنه برای کلیدی که
  // حذف شده، ابدی می‌شود و گارد برای همیشه کور می‌ماند.
  const dead = [...EXEMPT_ONE_SIDE.keys()].filter(k => !copyKeys.has(k));
  ok('فهرستِ استثنا کهنه نشده', dead.length === 0, dead.join(', '));
}
for (const group of SHARED_GROUPS) {
  const server = [...copyKeys].filter(k => k.startsWith(`${group}.`));
  if (!server.length) continue;
  const w = new Set([...used.web.keys()].filter(k => k.startsWith(`${group}.`)));
  const a = new Set([...used.android.keys()].filter(k => k.startsWith(`${group}.`)));
  ok(`گروه «${group}» در هر دو کلاینت سیم‌کشی است`, w.size > 0 && a.size > 0,
    `وب ${w.size} کلید، اندروید ${a.size} کلید از ${server.length} کلیدِ سرور`);
  const onlyWeb = [...w].filter(k => !a.has(k) && !EXEMPT_ONE_SIDE.has(k));
  const onlyAnd = [...a].filter(k => !w.has(k) && !EXEMPT_ONE_SIDE.has(k));
  ok(`گروه «${group}»: یک کلید، هر دو کلاینت`,
    onlyWeb.length === 0 && onlyAnd.length === 0,
    [onlyWeb.length && `فقط وب: ${onlyWeb.join()}`,
      onlyAnd.length && `فقط اندروید: ${onlyAnd.join()}`].filter(Boolean).join(' | '));
}

// ── ۵.۵) بدهیِ وصل‌نشده: چه کلیدهایی هیچ کلاینتی نمی‌خواند ────────────────
//
// عمداً *قرمزِ دائمی* نمی‌شود: یک قرمزیِ همیشگی تیم را به «خاموش‌کردنِ
// گارد» عادت می‌دهد که بدترین پیامدِ ممکن است. اما سکوت هم بدتر از قرمزی
// است — کلیدی که هیچ‌جا خوانده نشود یعنی پنلی که فیلدش را نشان می‌دهد و
// هیچ کلاینتی اجراش نمی‌کند («۱۰۰٪ parity» دقیقاً همین‌جا می‌شکند). پس:
// چاپ می‌کنیم و فقط اگر از سقفِ بدهی‌هایِ مستند رد شد، قرمز می‌شویم.
const listUsed = new Set();
for (const client of Object.values(CLIENTS)) {
  for (const file of filesIn(client.dir, client.exts)) {
    const src = strip(read(path.relative(root, file)));
    for (const m of src.matchAll(new RegExp(LIST_CALL.source, 'gms'))) listUsed.add(m[3]);
    for (const m of src.matchAll(new RegExp(SECTION_CALL.source, 'gms'))) listUsed.add(`${m[2]}.${m[4]}`);
  }
}
ok(`خواندنِ فهرستی هم شمرده شد (${listUsed.size} کلید)`, listUsed.size >= 1);
{
  const unwired = [...copyKeys].filter(
    (k) => !used.web.has(k) && !used.android.has(k) && !listUsed.has(k));
  // امروز فقط یک بدهیِ مستند داریم: `coinGuide.lead` (متنِ RichText —
  // وصل‌کردنش یعنی از‌دست‌رفتنِ بولدِ انتخابی و در نتیجه تغییرِ طرح).
  // سقف = 1 یعنی هر کلیدِ بی‌مصرفِ *دیگری* که اضافه شود قرمز است.
  const UNWIRED_CAP = 1;
  ok(`کلیدِ بی‌مصرفِ پنل از سقفِ ${UNWIRED_CAP} بیشتر نشد (${unwired.length})`,
    unwired.length <= UNWIRED_CAP,
    unwired.join(', ') + ' → یا وصلش کن یا صریح از DEFAULT_COPY بردار');
  if (unwired.length) console.log(`  · بدهیِ مستند: ${unwired.join('، ')}`);
}

// ── ۵.۶) فول‌بک نباید «قالبِ ناپر‌شده» باشد ──────────────────────────────
//
// `text(key, fallback, vars)` در دو حالت fallback را *بی‌دست‌زدن* برمی‌گرداند:
// نه template‌ای از سرور رسیده، یا جای‌نگهدارِ لازم پیدا نشده. اگر fallback
// خودش `{days}` باشد، همان آکولاد روی صفحه می‌آید — و چون فقط در حالتِ
// آفلاین/سرورِ قدیمی رخ می‌دهد، هیچ‌کس در توسعه نمی‌بیندش (همین دام را ما
// سرِ «سقفِ تیکت» وب خوردیم: رقمِ سفت ممنوع بود، قالبِ ناپر‌شده نه).
//
// قاعدهٔ درست: یا fallback را با `fa()`/`faNum()` از همان عددِ روز بساز،
// یا کلیدِ بی‌جای‌نگهدار انتخاب کن. سنجه روی *فول‌بکِ ثبت‌شدهٔ هر کلید*
// می‌نشیند، پس نیازی به دانستنِ خطوطِ مصرف نیست.
{
  const leaks = [];
  for (const [side, map] of Object.entries(used)) {
    for (const [key, rec] of map) {
      for (const fb of rec?.fallbacks ?? []) {
        if (/\{[a-zA-Z][a-zA-Z0-9_]*\}/.test(fb)) leaks.push(`${side}: ${key} → «${fb.slice(0, 60)}…»`);
      }
    }
  }
  ok('هیچ فول‌بکی جای‌نگهدارِ ناپر‌شده در خودش ندارد', leaks.length === 0,
    leaks.join(' | '));
}

// ── ۵.۷) لینکِ نصب/آپدیت: هیچ دامنه‌ای در کلاینت سفت نمی‌شود ──────────────
//
// دقیقاً همان بیماریِ «۵ تا عکس» ولی در قالبِ لینک: وب یک دامنهٔ
// fallbackِ سفت در کد داشت و اندروید هیچ fallbackی. یعنی با `updateUrl` خالی
// (که پیش‌فرضِ مخزن است!) دکمهٔ وب به سایت می‌رفت و دکمهٔ اندروید هیچ کاری
// نمی‌کرد. حالا سرور لینک را از `ops_limits.bazaarApiBase` +
// `app.bazaarPackage` می‌سازد. این سنجه هر http(s) سفت‌شده در *متن*
// کلاینت‌ها را می‌گیرد — نه hrefهای staticِ خودِ باندل (لوگو، manifest).
{
  const siteRe = /https?:\/\/(?!www\.w3\.org|schemas\.|localhost)[\w.-]+/g;
  const offenders = [];
  for (const [side, client] of Object.entries(CLIENTS)) {
    for (const file of filesIn(client.dir, client.exts)) {
      const src = strip(read(path.relative(root, file)));
      // تنها *رشته‌های* داخلِ کد، آن‌هم جایی که `updateUrl` یا `bazaar`
      // در همان خط هست — تا خطِ import یا کامنتِ URL‌دار بی‌دلیل قرمز نشود.
      for (const line of src.split('\n')) {
        if (!/updateUrl|bazaar|Bazaar/.test(line)) continue;
        const hit = line.match(siteRe);
        if (hit) offenders.push(`${side}/${path.basename(file)}: ${hit[0]}`);
      }
    }
  }
  ok('هیچ آدرسِ سایتی در کلاینت به‌عنوانِ fallbackِ لینکِ آپدیت سفت نشده',
    offenders.length === 0, offenders.join(' | '));
}

// ── ۶) عددِ فول‌بک = عددِ سرور ───────────────────────────────────────────
//
// بند ۲ نقشه‌راه: کلاینت حقِ «عددِ کارِ خودِ ما» را ندارد، ولی **باید**
// یک فول‌بک داشته باشد که با مقدارِ واقعیِ امروز مو‌به‌مو یکی باشد؛ اگر
// فرق کند، کاربرِ آفلاین عددی می‌بیند که در هیچ پنلی وجود ندارد و
// «بازگردانی تنظیمات» هم درستش نمی‌کند.
const badFallbacks = [];
for (const [name, def] of Object.entries(RULE_DEFS)) {
  const re = new RegExp(`(?:ruleNumber|liveRule)\\(\\s*['"]${name}['"]\\s*,\\s*(\\d+)`, 'g');
  for (const [label, client] of Object.entries(CLIENTS)) {
    const hits = [];
    for (const file of filesIn(client.dir, client.exts)) {
      const src = strip(read(path.relative(root, file)));
      for (const m of src.matchAll(re)) hits.push({ file: path.relative(root, file), value: Number(m[1]) });
    }
    if (!hits.length) continue;
    const wrong = hits.filter(h => h.value !== def.value);
    ok(`«${name}» در ${label} (${hits.length} نقطه) با فول‌بکِ ${def.value}`,
      wrong.length === 0, wrong.map(h => `${h.file} → ${h.value}`).join(' | '));
    if (wrong.length) badFallbacks.push(name);
  }
}
ok('هیچ عددِ فول‌بکی با `RULE_DEFS` نمی‌جنگد', badFallbacks.length === 0);

// ── ۷) رقم‌های بی‌فهرستِ سفید ────────────────────────────────────────────
//
// بند ۱ نقشه‌راه: در UI هیچ رقمی نباید بماند که پنل به آن دسترسی ندارد.
// سنجه: هر رشتهٔ فارسیِ دارای رقمِ خام، در فایلِ وصل‌شده به یک کلید،
// باید **همان رقم** را در قالبِ سرور هم داشته باشد (یعنی همان‌جا ادمین
// می‌تواند عوضش کند). رقمی که فقط در فول‌بکِ ما هست و در قالب نیست، یعنی
// یک عددِ دوسَره: سرور می‌گوید ۲۴، ما روی آفلاین ۳۰ نشان می‌دهیم.
{
  const digitsOf = s => new Set([...String(s).matchAll(/[۰-۹][۰-۹٬،]*/g)].map(m => m[0]));
  const bad = [];
  for (const [label, client, map] of [
    ['وب', CLIENTS.web, used.web],
    ['اندروید', CLIENTS.android, used.android],
  ]) {
    for (const [key, rec] of map) {
      const server = digitsOf(templates.get(key) ?? '');
      for (const fb of rec.fallbacks) {
        // `${…}` یک عددِ ساختاری است، نه رقمِ سفت‌شده.
        const raw = fb.replace(/\$\{[^}]*\}/g, ' ');
        for (const d of digitsOf(raw)) {
          if (!server.has(d)) {
            bad.push(`${key} (${label}): «${d}» در فول‌بک هست ولی در قالبِ سرور نیست\n        ${[...rec.files][0]}`);
          }
        }
      }
    }
  }
  ok('هیچ رقمِ سفت‌شده‌ای در فول‌بک‌ها نمانده که پنل نداند', bad.length === 0,
    bad.slice(0, 10).join('\n      '));
}

// ── ۸) فول‌بکِ هر دو کلاینت یکی باشد ────────────────────────────────────
//
// اگر اندروید «حدود ۳۰٪ تخفیف» و وب «حدود ۳۰٪ صرفه‌جویی» را فول‌بک
// داشته باشد، تا اولین ویرایشِ ادمین هیچ‌کس متوجه نمی‌شود؛ بعد از آن یکی
// از دو کلاینت جمله‌ای را نگه می‌دارد که دیگری رها کرده. برای کلیدهای
// **بدونِ متغیر** مقایسه بی‌خطر است (کلیدهای دارای متغیر، قالبِ سرور را
// با ساختارِ متفاوتِ JSX/TextSpan می‌پُرند و برابریِ رشته‌ای از آن‌ها
// انتظار نیست).
{
  const norm = s => s.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
  const diffs = [];
  let compared = 0;
  for (const key of copyKeys) {
    if ((placeholders.get(key) ?? []).length) continue;
    const w = used.web.get(key)?.fallbacks.map(norm) ?? [];
    const a = used.android.get(key)?.fallbacks.map(norm) ?? [];
    if (!w.length || !a.length) continue;
    compared += 1;
    const common = w.some(x => a.includes(x));
    if (!common) {
      diffs.push(`${key}\n        وب: «${w[0].slice(0, 58)}»\n        اندروید: «${a[0].slice(0, 58)}»`);
    }
  }
  ok(`فول‌بکِ مشترک‌ها واژه‌به‌واژه یکی است (${compared} کلید مقایسه شد)`,
    compared > 0 && diffs.length === 0, diffs.join('\n      '));
}

console.log(`\n✅ ${checks} بررسیِ همسانیِ متنِ زنده موفق بود\n`);
