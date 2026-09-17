#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// گاردِ «متنِ زنده‌ای که هیچ‌جا خوانده نمی‌شود»
// ═══════════════════════════════════════════════════════════════════════════
//
// ── چه چیزی این گارد را لازم کرد ──────────────────────────────────────────
//
// مالک یک متن را در پنل عوض کرد و در اپ تغییری ندید. بررسی نشان داد مسیر
// سالم است و تنها متنی که واقعاً عوض شده (`coinGuide.privateNote`) در هر دو
// کلاینت خوانده می‌شود؛ ولی همان بررسی یک کلاسِ کاملِ باگ را رو کرد:
//
//   کلیدهایی در `DEFAULT_COPY` هستند که **هیچ کلاینتی نمی‌خواند**. ادمین
//   آن‌ها را در پنل می‌بیند، ویرایش می‌کند، ذخیره می‌شود، و هیچ‌جای محصول
//   عوض نمی‌شود. دقیقاً همان تجربهٔ «پنل کار نمی‌کند».
//
// نمونهٔ واقعی: `coinGuide.lead` — پاراگرافِ معرفیِ راهنمای سکه، عمداً در هر
// دو کلاینت با `RichText`/`TextSpan` و رنگِ طلاییِ داخلِ جمله سفت‌شده است
// (تغییرش ظاهرِ محصول را عوض می‌کرد) ولی کلیدش در پنل قابل ویرایش مانده.
//
// گارد: هر کلیدِ برگ در `DEFAULT_COPY` باید **حداقل در یک کلاینت** خوانده
// شود؛ مگر اینکه صریحاً در `DEAD_KEYS` با دلیل ذکر شده باشد. کلیدِ تازه‌ای
// که کسی نمی‌خواند ⇒ قرمز.
//
// ⚠️ چرا جست‌وجوی رشته‌ای و نه اجرای واقعی: نه Flutter در CI بک‌اند هست و نه
//    می‌شود وب را در Node رندر کرد. اسکنِ متنِ منبع همان کاری است که گاردِ
//    همسایه (`live-copy-parity`) هم می‌کند و همان باگ را می‌گیرد.
//
// اجرا: `node tool/live-copy-coverage.mjs` از ریشهٔ `userweb`.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd(), '..');
const out = [];
const ok = (cond, msg, detail) =>
  (cond ? out.push(`  ✓ ${msg}`) : out.push(`  ✗ ${msg}${detail ? `\n      ${detail}` : ''}`) && process.exitCode === 0 && (process.exitCode = 1));

// ── ۱. کلیدهای برگِ سمتِ سرور ─────────────────────────────────────────────
const serverSrc = readFileSync(join(ROOT, 'backend/src/services/liveContent.js'), 'utf8');
const start = serverSrc.indexOf('const DEFAULT_COPY = Object.freeze({')
  + 'const DEFAULT_COPY = Object.freeze('.length;
let depth = 0;
let end = serverSrc.length;
for (let i = start; i < serverSrc.length; i += 1) {
  if (serverSrc[i] === '{') depth += 1;
  else if (serverSrc[i] === '}') {
    depth -= 1;
    if (depth === 0) { end = i + 1; break; }
  }
}
// آرایه‌ها (`support.privacySections`) خودشان متنِ قابلِ ویرایش‌اند؛ ولی
// اعضایشان (`title`/`body` داخلِ هر بند) **کلید** نیستند. اگر محتوای آرایه
// را نگه داریم، پارسر آن‌ها را به‌عنوانِ «کلیدِ مرده» می‌بیند و گارد دروغ
// قرمز می‌شود. پس اول هر بازهٔ `[…]` را حذف می‌کنیم و خودِ کلیدِ آرایه را
// به‌عنوانِ یک برگ نگه می‌داریم.
function stripArrays(src) {
  let outStr = '';
  let depthArr = 0;
  for (const ch of src) {
    if (ch === '[') { depthArr += 1; outStr += '['; continue; }
    if (ch === ']') { depthArr = Math.max(0, depthArr - 1); outStr += ']'; continue; }
    if (depthArr === 0) outStr += ch;
  }
  return outStr;
}
const block = stripArrays(serverSrc.slice(start, end));

const leaves = [];
const stack = [];
depth = 0;
for (const line of block.split('\n')) {
  const m = line.match(/^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_][\w]*))\s*:\s*(.*)$/);
  if (m) {
    const name = m[1] || m[2] || m[3];
    const value = (m[4] || '').trim();
    // فقط رشته‌ها «متنِ قابلِ ویرایش»اند؛ آرایه/آبجکت (مثل
    // `support.privacySections`) خودشان متنِ نهایی‌اند نه کلید.
    if (value.startsWith('{')) {
      stack.push(name);
    } else if (value.startsWith("'") || value.startsWith('"')
      || value.startsWith('`') || value.startsWith('[')) {
      // رشته یا آرایهٔ متن — هر دو «متنِ قابلِ ویرایشِ پنل»اند.
      leaves.push([...stack, name].join('.'));
    }
  }
  depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
  while (stack.length > Math.max(0, depth - 1)) stack.pop();
}
const keys = [...new Set(leaves)].sort();

// ── ۲. کلیدهایی که هر کلاینت می‌خواند ────────────────────────────────────
const readAll = (dir, ext) => {
  const files = [];
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (entry.endsWith(ext)) files.push(p);
    }
  };
  walk(dir);
  return files;
};
const keyPattern = /(?:liveText|text)\(\s*'([a-zA-Z][\w.]*)'/g;
const nsPattern = /['"`]((?:coinGuide|plus|referral|update|support|wheel|streak|games|photoReview|reconnect|avatars)\.[A-Za-z0-9_.]+)['"`]/g;

const collect = (files) => {
  const found = new Set();
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(keyPattern)) found.add(m[1]);
    for (const m of src.matchAll(nsPattern)) found.add(m[1]);
  }
  return found;
};
const webKeys = collect(readAll(join(ROOT, 'userweb/src'), '.jsx').concat(readAll(join(ROOT, 'userweb/src'), '.js')));
const dartKeys = collect(readAll(join(ROOT, 'mobile/lib'), '.dart'));

// ── ۳. کلیدهای مردهٔ شناخته‌شده (با دلیل) ─────────────────────────────────
//
// ⚠️ افزودنِ یک کلید این‌جا یعنی «این متن عمداً از پنل خوانده نمی‌شود» —
//    پس یا باید در پنل به‌عنوانِ «غیرفعال» دیده شود یا از قرارداد حذف شود.
//    مقدار: دلیلِ کوتاه که چرا کلاینتی نمی‌خواندش.
const DEAD_ALLOWED = {
  'coinGuide.lead':
    'پاراگرافِ معرفیِ راهنمای سکه در وب (`CoinGuide.jsx`) و اپ (`coin_guide.dart`) '
    + 'با RichText و رنگِ طلاییِ داخلِ جمله سفت‌شده است؛ خواندنش از پنل یعنی از '
    + 'دست‌رفتنِ آن رنگ‌آمیزی. اگر روزی خوانده شد، این ردیف را حذف کنید.',
};

// ── ۴. بررسی‌ها ──────────────────────────────────────────────────────────
out.push('\n== متن‌های زندهٔ خوانده‌نشده ==');
ok(keys.length >= 35, `کلیدهای برگِ سرور پیدا شد (${keys.length}) — کفِ ۳۵`);

const dead = keys.filter((k) => !webKeys.has(k) && !dartKeys.has(k));
const newDead = dead.filter((k) => !DEAD_ALLOWED[k]);
ok(newDead.length === 0,
  'هیچ کلیدِ مرده‌ای در پنل نیست (هر متنِ قابلِ ویرایش، جایی خوانده می‌شود)',
  newDead.map((k) => `      • ${k} — در پنل قابل ویرایش است ولی هیچ کلاینتی نمی‌خواندش`).join('\n'));

const documented = dead.filter((k) => DEAD_ALLOWED[k]);
ok(Object.keys(DEAD_ALLOWED).every((k) => keys.includes(k)),
  'استثناهای مستندشده هنوز در قرارداد هستند (ردیفِ کهنه نمانده)',
  Object.keys(DEAD_ALLOWED).filter((k) => !keys.includes(k)).join('، '));

// هر دو کلاینت حداقل یک متن از پنل می‌خوانند — «کوربودنِ» یک پلتفرم قرمز است.
const webHits = keys.filter((k) => webKeys.has(k)).length;
const dartHits = keys.filter((k) => dartKeys.has(k)).length;
ok(webHits >= 25, `وب ${webHits} متنِ زنده می‌خواند`, 'کف: ۲۵');
ok(dartHits >= 25, `اندروید ${dartHits} متنِ زنده می‌خواند`, 'کف: ۲۵');

// ⚠️ پیامِ خطا باید مسیرِ اصلاح را بگوید، نه فقط «قرمز شد».
if (newDead.length) {
  out.push('');
  out.push('  راهِ اصلاح: یا کلید را در کلاینت‌ها بخوانید (`liveText` در اپ،');
  out.push('  `text(' + "'…'" + ')` در وب)، یا اگر متن عمداً سفت است، ردیفش را به');
  out.push('  `DEAD_ALLOWED` در همین فایل با دلیل اضافه کنید.');
}

console.log(out.join('\n'));
console.log(`\n${newDead.length ? '✗' : '✅'} ${keys.length} کلید، ${webHits} در وب، ` +
  `${dartHits} در اندروید، ${documented.length} استثنای مستند\n`);
if (newDead.length) process.exit(1);
