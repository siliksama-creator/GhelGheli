/**
 * گاردِ بک‌تیک در بلوک‌های <style>{`…`}</style>
 *
 * ═══════════════════════════════════════════════════════════════════════
 * چرا این گارد وجود دارد
 * ═══════════════════════════════════════════════════════════════════════
 * در `Shop.jsx` یک کامنتِ CSS نوشته شده بود که داخلش نامِ کلاس را بین
 * بک‌تیک گذاشته بود:
 *
 *     /* … عمداً از قابِ `.shopShelf` پیروی نمی‌کند … *​/
 *
 * آن بک‌تیک‌ها، رشتهٔ قالبیِ `<style>{`…`}</style>` را وسطِ کار می‌بندند.
 * از آن نقطه به بعد جاوااسکریپت بقیهٔ CSS را «تگ‌تمپلیت» می‌بیند و
 * تلاش می‌کند رشته را **صدا بزند**:
 *
 *     TypeError: "…css…".shopShelf is not a function
 *
 * نتیجه در تولید: کلِ صفحهٔ فروشگاه سفید می‌شد. هیچ تستِ واحدی و هیچ
 * بیلدی نمی‌گرفتش — چون از نظر نحوی معتبر است و فقط در زمانِ اجرا
 * می‌ترکد. دقیقاً همین اشکال در `CardBox.jsx` هم بود و رونماییِ صندوق
 * را می‌شکست.
 *
 * قانون: داخل بلوکِ <style> هرگز بک‌تیک ننویس — حتی داخل کامنت.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.jsx') || p.endsWith('.js')) out.push(p);
  }
  return out;
}

const OPEN = '<style>{`';
const offenders = [];

for (const file of walk('src')) {
  const src = readFileSync(file, 'utf8');
  let i = 0;
  while ((i = src.indexOf(OPEN, i)) !== -1) {
    const start = i + OPEN.length;
    const closeTag = src.indexOf('</style>', start);
    // اولین بک‌تیکِ فرار‌نشده بعد از شروع بلوک
    let j = start;
    for (;;) {
      j = src.indexOf('`', j);
      if (j === -1) break;
      if (src[j - 1] !== '\\') break;
      j += 1;
    }
    // اگر بک‌تیکِ پایانی قبل از </style> بیفتد و بینشان CSS بماند ⇒ خراب
    if (j !== -1 && closeTag !== -1 && j < closeTag - 2) {
      const line = src.slice(0, j).split('\n').length;
      const ctx = src.slice(Math.max(0, j - 70), j + 30).replace(/\n/g, ' · ');
      offenders.push(`${file}:${line}\n    …${ctx}…`);
    }
    i = closeTag === -1 ? start : closeTag;
  }
}

if (offenders.length) {
  console.error('✗ بک‌تیکِ زودهنگام داخل بلوک <style> پیدا شد.');
  console.error('  این خطا صفحه را در زمان اجرا سفید می‌کند و در بیلد دیده نمی‌شود.\n');
  for (const o of offenders) console.error('  ' + o + '\n');
  process.exit(1);
}

console.log('✓ style-backtick: هیچ بک‌تیکی داخل بلوک‌های <style> نیست.');
