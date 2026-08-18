#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// گاردِ «بدونِ ایموجی» — دورِ ۲۳
// ═══════════════════════════════════════════════════════════════════════════
//
// ── چرا این گارد وجود دارد ──
//
// حذفِ ایموجی یک‌بار انجام می‌شود، ولی برگشتنش تدریجی است: یک نفر برای
// «گرم‌تر شدنِ» یک پیام یک 🎉 می‌گذارد، شش ماه بعد دوباره همه‌جا ایموجی
// است. سه دلیلِ فنی که این را باگ می‌کند، نه سلیقه:
//
//   ۱. **شکلش دستِ ما نیست.** ایموجی را فونتِ سیستم‌عاملِ کاربر رسم
//      می‌کند؛ 🏆 روی سامسونگ، شیائومی، ویندوز و کروم چهار شکلِ متفاوت
//      دارد. یعنی هویتِ بصری روی هر دستگاه فرق می‌کند.
//   ۲. **رنگ نمی‌گیرد.** پالتِ برنامه طلایی/تیره است؛ ایموجی رنگِ ثابتِ
//      خودش را دارد و مثل وصله دیده می‌شود.
//   ۳. **اندازه‌اش با `font-size` است نه `width`.** همان تلهٔ واقعی که در
//      `.duelRoundIntroIcon` افتادیم.
//
// ── تنها استثنا ──
//
// صفحهٔ چت. آنجا ایموجی **محتوایی** است که کاربر خودش انتخاب و ارسال
// می‌کند، نه عنصرِ رابطِ کاربری. آن فهرست باید ایموجی بماند.
//
// اجرا: `node tool/no-emoji.mjs` از ریشهٔ `userweb` (در CI کنارِ بقیهٔ گاردها).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(process.cwd(), '..');

// ── دامنهٔ بررسی ──
const SCAN = [
  { dir: 'userweb/src', ext: ['.jsx', '.js'] },
  { dir: 'admin/src', ext: ['.jsx', '.js'] },
  { dir: 'mobile/lib', ext: ['.dart'] },
  { dir: 'backend/src', ext: ['.js'] },
];

// ── استثناها ──
//
// فقط مسیرِ ایموجیِ چت. هر افزودنی به این فهرست باید دلیلِ نوشته داشته باشد.
const ALLOW_FILES = new Set([
  'userweb/src/screens/Chat.jsx',      // فهرستِ `EMOJIS` که کاربر می‌فرستد
  'mobile/lib/screens/user/chat_page.dart', // آینهٔ همان فهرست (`_emojis`)
]);

// نمادهایی که ایموجیِ تصویری نیستند: فلش، علائمِ ریاضی و گلیف‌های
// تایپوگرافیک (★ ✦ ♛) که فونتِ خودِ برنامه رسمشان می‌کند و رنگ می‌گیرند.
const ALLOW_CHARS = new Set([
  '→', '←', '↑', '↓', '↩', '⟶', '✓', '✗', '✕', '⌄', '·', '—', '–',
  '★', '✦', '♛', '♚', '◆', '◎', '⌛', '×',
]);

// بازهٔ ایموجیِ تصویری. عمداً `\uFE0F` (variation selector) را هم می‌گیریم،
// چون همان چیزی است که یک گلیفِ ساده را به ایموجیِ رنگی تبدیل می‌کند.
// دورِ ۳۱: بازهٔ `1F0A0-1F2FF` جا افتاده بود و 🃏 (U+1F0CF، بلوکِ ورقِ
// بازی) از سه جای رابطِ کاربری رد شده بود — دقیقاً همان مشکلِ بندِ ۱:
// روی کرومِ هدلس یک خطِ سیاه‌وسفید است و روی گوشیِ واقعی جوکرِ رنگی.
const EMOJI = /[\u{1F0A0}-\u{1F2FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

function walk(dir, exts, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.some(e => name.endsWith(e))) out.push(full);
  }
  return out;
}

const problems = [];

for (const { dir, ext } of SCAN) {
  for (const file of walk(join(ROOT, dir), ext)) {
    const rel = relative(ROOT, file).split('\\').join('/');
    if (ALLOW_FILES.has(rel)) continue;

    // کامنت‌ها معاف‌اند: کاربر آنها را نمی‌بیند و ⚠️ در توضیحاتِ کد یک
    // نشانهٔ مفیدِ داخلی است. بلوک‌ها را با فضای هم‌طول جایگزین می‌کنیم تا
    // شمارهٔ خط‌ها جابه‌جا نشود — گرنه گزارشِ خطا به خطِ اشتباه اشاره می‌کند.
    const src = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));

    const lines = src.split('\n');
    lines.forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('///')) return;

      const hits = [...new Set((line.match(EMOJI) || []).filter(c => !ALLOW_CHARS.has(c)))];
      if (hits.length) {
        problems.push({ rel, line: i + 1, hits: hits.join(''), text: t.slice(0, 90) });
      }
    });
  }
}

if (problems.length) {
  console.error(`\n✗ ${problems.length} مورد ایموجی در رابطِ کاربری پیدا شد.\n`);
  console.error('  ایموجی را سیستم‌عاملِ کاربر رسم می‌کند؛ شکل و رنگش روی هر');
  console.error('  دستگاه فرق دارد. به‌جایش از آیکونِ مشترک استفاده کن:\n');
  console.error("    وب     → import { SvgIcon } from '.../components/IconAsset.jsx'");
  console.error("             <SvgIcon name=\"trophy\" size={18} />");
  console.error("    اندروید → import '.../widgets/ui_icon.dart'");
  console.error("             UiIcon('trophy', size: 18)\n");
  for (const p of problems) {
    console.error(`  ${p.rel}:${p.line}  ${p.hits}  ${p.text}`);
  }
  console.error('');
  process.exit(1);
}

console.log('✓ هیچ ایموجی‌ای در رابطِ کاربری نیست (به‌جز فهرستِ ایموجیِ چت)');
