#!/usr/bin/env node
//
// گاردِ چیدمانِ موبایلِ پنل ادمین.
//
// چرا: ادمینِ موبایل قرار است ابزارِ اصلیِ مدیریت روی گوشی باشد (پنل ادمین از
// اپ موبایل حذف شده — بنگرید به docs/ADMIN_PANEL_MOBILE_RETIREMENT.md). این تست
// ایستا تضمین می‌کند که پایه‌های ریسپانسیو به‌طور تصادفی حذف نشوند:
//   ۱. پوسته دکمهٔ همبرگری و کشوی موبایل دارد.
//   ۲. CSS زیر ۹۶۰px سایدبار را off-canvas می‌کند و scrim/همبرگر را روشن.
//   ۳. هدف‌های لمسیِ دکمه‌های آیکونی روی موبایل ≥۴۴px است.
//   ۴. صفِ بررسیِ کارت (مهم‌ترین کار لمسی) قواعد موبایل دارد.
//   ۵. media query موبایل (۶۴۰px) وجود دارد.
//
// مثل desktop-layout.mjs در userweb، قبل از بررسی کامنت‌ها حذف می‌شوند تا متنِ
// توضیحی به‌جای کد شمرده نشود.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

// کامنت‌های خطی (//) و بلوکی (/* ... */) را حذف می‌کند تا متنِ توضیحی به‌جای
// کد شمرده نشود.
function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/([^:])\/\/.*$/gm, '$1');
}

const shell = strip(read('src/components/app-shell.jsx'));
const css = strip(read('src/styles.css'));

let checks = 0;
function ok(label, cond) {
  checks += 1;
  assert.ok(cond, `[FAIL] ${label}`);
  console.log(`  ok - ${label}`);
}

// ── ۱. پوسته: همبرگر، کشو، scrim و دکمهٔ بستن وجود دارند ──────────────────
ok('پوسته دکمهٔ همبرگری (mobile-menu-btn) دارد', /mobile-menu-btn/.test(shell));
ok('پوسته وضعیت کشوی موبایل (mobileOpen) را مدیریت می‌کند', /mobileOpen/.test(shell));
ok('پوسته scrim (sidebar-scrim) دارد', /sidebar-scrim/.test(shell));
ok('پوسته دکمهٔ بستنِ کشو (sidebar-close) دارد (C5)', /sidebar-close/.test(shell));

// ── ۲. CSS: کشوی off-canvas زیر ۹۶۰px ──────────────────────────────────────
ok('بلوک ریسپانسیو ۹۶۰px وجود دارد', /@media[^\n]*?max-width:\s*960px/.test(css));
ok('زیر ۹۶۰px سایدبار ثابت/off-canvas می‌شود', /\.sidebar\s*\{[^}]*position:\s*fixed/.test(css) ||
   /@media[^{]*max-width:\s*960px[\s\S]*?\.sidebar\s*\{[\s\S]*?position:\s*fixed/.test(css));
ok('کشوی باز به داخل می‌آید (.sidebar.open translateX(0))',
   /\.sidebar\.open[\s\S]*?translateX\(0\)/.test(css));
ok('همبرگر زیر ۹۶۰px نمایش داده می‌شود (mobile-menu-btn inline-flex)',
   /\.mobile-menu-btn\s*\{[^}]*display:\s*inline-flex/.test(css));

// ── ۳. هدف لمسی ≥۴۴px روی موبایل (C2) ──────────────────────────────────────
// بدنهٔ اولین media-query 640px را با تطبیقِ آکولاد استخراج می‌کنیم (regexِ
// غیر‌greedy روی آکولادهای تودرتو می‌شکند).
function mediaBody(src, maxWidth) {
  const head = src.match(new RegExp(`@media[^\\n]*?max-width:\\s*${maxWidth}px\\s*\\)`));
  if (!head) return null;
  let depth = 0, i = head.index;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(head.index + head[0].length, i);
}

ok('بلوک ریسپانسیو ۶۴۰px وجود دارد', /@media[^\n]*?max-width:\s*640px/.test(css));
const block = mediaBody(css, 640);
ok('محتوای بلوک ۶۴۰px استخراج شد', Boolean(block));
if (block) {
  ok('دکمه‌های آیکونی روی موبایل min-height ≥44px دارند (C2)',
     /\.btn-icon\s*\{[\s\S]*?min-(?:width|height):\s*44px/.test(block));
  // ── ۴. صف بررسی کارت روی موبایل (C1) ──
  ok('عکس‌های بررسی روی موبایل گرید دوستونه‌اند (C1)', /\.reviewShots\s*\{[\s\S]*?grid-template-columns/.test(block));
  ok('دکمه‌های بررسی روی موبایل تمام‌عرض و ≥46px هستند (C1)',
     /\.reviewActions\s+\.btn\s*\{[\s\S]*?min-height:\s*46px/.test(block));
}

// ── ۵. جداول پهن امن‌اند (اسکرول افقی داخل wrap، نه شکستن صفحه) ──────────────
ok('جداول داخل .table-wrap با overflow:auto محصورند',
   /\.table-wrap\s*\{[^}]*overflow:\s*auto/.test(css));

console.log(`\n${checks} بررسی گذشت.`);
