#!/usr/bin/env node
//
// گاردِ «دسکتاپ = موبایل» نسخهٔ وب (۱۴۰۵/۰۷/۳۰).
//
// تصمیم مالک: وبِ دسکتاپ هم همان چیدمانِ موبایل را نشان دهد —
// یک ستونِ وسط‌چینِ ۵۴۰px روی پس‌زمینهٔ تمام‌صفحه. چیدمان‌های
// چندستونهٔ قدیمیِ دسکتاپ (۱۴ بلاک min-width) حذف شدند.
//
// این گارد سه چیز را قفل می‌کند:
//   ۱. هیچ بلاک min-width جدیدی برنمی‌گردد، مگرِ همان یک بلوکِ
//      «پوستهٔ دسکتاپ» (DESKTOP-SHELL) که فقط نوارِ ناوبری را
//      وسط‌چین می‌کند — قاعدهٔ محتوایی در آن ممنوع است.
//   ۲. سقفِ عرضِ پرتال و صفحه ۵۴۰px است (نه ۷۲۰/۱۰۸۰/۱۲۸۰/۱۴۰۰).
//   ۳. قواعدِ پایهٔ موبایل دست‌نخورده‌اند: تک‌ستونِ `.grid`،
//      `.wide,.card{width:100%}` و پوستهٔ بازیِ ۶۴۰px.
//
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');

/** کامنت‌ها را حذف می‌کند تا متنِ توضیحی به‌جای کد شمرده نشود. */
function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/\/?.*$/gm, '')
    .replace(/([^:])\/\/.*$/gm, '$1');
}

function loadCss() {
  const hub = fs.readFileSync(path.join(root, 'userweb/src/style.css'), 'utf8');
  if (hub.includes("@import './styles/")) {
    const imports = [...hub.matchAll(/@import\s+['"]\.\/styles\/([^'"]+)['"]/g)].map(m => m[1]);
    let combined = '';
    for (const f of imports) {
      const p = path.join(root, 'userweb/src/styles', f);
      if (fs.existsSync(p)) combined += '\n' + fs.readFileSync(p, 'utf8');
    }
    return combined || hub;
  }
  return hub;
}

const css = strip(loadCss());
const appbar = fs.readFileSync(path.join(root, 'userweb/src/styles/appbar.css'), 'utf8');
const base = fs.readFileSync(path.join(root, 'userweb/src/styles/base.css'), 'utf8');

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ok -', name);
  } catch (e) {
    console.error('  FAIL -', name);
    console.error('    ', String(e.message).slice(0, 300));
    process.exitCode = 1;
  }
}

// ── ۱) فقط یک بلاک min-width مجاز است: پوستهٔ دسکتاپ ──────────────
const minWidthBlocks = [...css.matchAll(/@media[^{]*\(\s*min-width[^)]*\)\s*\{[\s\S]*?\n\}/g)];
check('فقط یک بلاک min-width در کل استایل‌ها (پوستهٔ دسکتاپ) باقی مانده', () => {
  assert.equal(minWidthBlocks.length, 1, `انتظار ۱ بلاک بود، ${minWidthBlocks.length} پیدا شد`);
});

check('بلاکِ مجاز در آستانهٔ ۹۰۰px است', () => {
  assert.ok(minWidthBlocks.length === 1);
  assert.ok(/min-width:\s*900px/.test(minWidthBlocks[0][0]), 'آستانه باید 900px باشد');
});

check('پوستهٔ دسکتاپ فقط نوارِ ناوبری و پرتال را لمس می‌کند (بدون قاعدهٔ محتوایی)', () => {
  assert.ok(minWidthBlocks.length === 1);
  const body = minWidthBlocks[0][0].slice(minWidthBlocks[0][0].indexOf('{'));
  const parts = body.split(/[{]}+/).map(x => x.trim()).filter(Boolean);
  // قطعات جایگزین‌اند: [پیش، سلکتور1، قواعد1، سلکتور2، قواعد2، ...]
  const selectors = parts.filter((x, idx) => idx % 2 === 1).flatMap(x => x.split(',')).map(x => x.trim()).filter(Boolean);
  const allowed = new Set(['.portal', '.portal > .mobileNav', '.mobileNav', '.mobileNav button', '.mobileNav button:not(.on):hover']);
  for (const sel of selectors) {
    assert.ok(allowed.has(sel), `سلکتورِ غیرمجاز در پوستهٔ دسکتاپ: ${sel}`);
  }
});

check('هیچ سقفِ قدیمیِ دسکتاپ (1080/1120/1240/1280/1380/1400/1560px) باقی نمانده', () => {
  for (const px of ['1240px', '1280px', '1380px', '1400px', '1560px']) {
    assert.ok(!css.includes('max-width: ' + px) && !css.includes('max-width:' + px), `سقفِ قدیمی ${px} هنوز هست`);
  }
});

// ── ۲) سقفِ عرضِ ۵۴۰px ──────────────────────────────────────────
check('`.page` در ۵۴۰px سقف دارد', () => {
  assert.ok(/\.page\{[^}]*max-width:\s*540px/.test(base), 'قاعدهٔ .page max-width:540px در base.css نیست');
});

check('`.portal` در ۵۴۰px سقف دارد و وسط‌چین است', () => {
  assert.ok(/\.portal\s*\{[^}]*max-width:\s*540px[^}]*margin-inline:\s*auto/.test(appbar), 'قاعدهٔ .portal max-width:540px در appbar.css نیست');
});

// ── ۳) قواعدِ پایهٔ موبایل دست‌نخورده (آینهٔ اندروید) ──────────
check('`.grid` تک‌ستون است (قاعدهٔ موبایل حالا همواره‌ای شده)', () => {
  assert.ok(/\.grid,\.formgrid\{grid-template-columns:1fr\}/.test(css), 'قاعدهٔ تک‌ستون .grid/.formgrid پیدا نشد');
});

check('`.wide,.card` در عرضِ کامل می‌نشینند', () => {
  assert.ok(/\.wide,\.card\{width:100%!important\}/.test(css), 'قاعدهٔ width:100% .wide/.card پیدا نشد');
});

check('پوستهٔ بازی همچنان ۶۴۰px (آینهٔ اندروید) است', () => {
  assert.ok(/\.gameShell\s*\{\s*max-width:\s*640px/.test(css), 'قاعدهٔ .gameShell max-width:640px پیدا نشد');
});

check('نوارِ ناوبریِ موبایل (دکِ پایین) دست‌نخورده است', () => {
  assert.ok(/\.mobileNav\s*\{\s*position: fixed;/.test(css), 'دکِ پایینِ mobileNav پیدا نشد');
});

check('هیچ min-width دیگری در growth.css باقی نمانده', () => {
  const growth = fs.readFileSync(path.join(root, 'userweb/src/growth.css'), 'utf8');
  assert.ok(!/@media[^{]*min-width/.test(growth), 'growth.css هنوز بلاک min-width دارد');
});

check('theme.css (تولیدشده) بلاک min-width ندارد', () => {
  const theme = fs.readFileSync(path.join(root, 'userweb/src/theme.css'), 'utf8');
  assert.ok(!/@media[^{]*min-width/.test(theme), 'theme.css هنوز بلاک min-width دارد');
});

console.log(`\n${passed} check(s) passed`);
