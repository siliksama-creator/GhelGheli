/**
 * نگهبان: هر فایل JSX باید React را import کند.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این تست وجود دارد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * این پروژه `vite.config.js` ندارد، پس افزونهٔ React با تنظیمات پیش‌فرض
 * روی **runtime کلاسیک** کار می‌کند: هر تگ JSX به `React.createElement`
 * ترجمه می‌شود. اگر فایلی `React` را import نکند، در زمان build هیچ
 * خطایی نمی‌گیرد — کامپایل موفق است، فایل ساخته می‌شود، deploy می‌شود —
 * و فقط در مرورگر و فقط وقتی آن کامپوننت رندر شود می‌ترکد:
 *
 *     ReferenceError: React is not defined
 *
 * دقیقاً همین اتفاق افتاد: `PhotoCardBox` بدون این import نوشته شد،
 * build سبز بود، و صفحهٔ اصلیِ کاربر **کاملاً سفید** شد — چون خطای
 * یک کامپوننت کل درخت را با خودش می‌برد.
 *
 * این بدترین نوع باگ است: در CI دیده نمی‌شود، در تست واحد دیده نمی‌شود،
 * و فقط کاربر نهایی آن را می‌بیند.
 *
 * راه‌حل جایگزین (تنظیم `jsxRuntime: 'automatic'` در vite.config) عمداً
 * انتخاب نشد: یعنی دست زدن به پیکربندی build همهٔ صفحه‌ها برای رفع یک
 * فایل. این نگهبان ارزان‌تر و صریح‌تر است.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../src', import.meta.url).pathname;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.jsx')) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const offenders = [];

for (const f of files) {
  const src = readFileSync(f, 'utf8');

  // آیا اصلاً JSX دارد؟ فایلی که فقط ثابت export می‌کند نیازی به React ندارد.
  //
  // الگو عمداً ساده است: `<Tag` یا `</Tag` یا `<>`. تحلیل کامل نحو برای
  // این کار زیادی است و ریسکِ منفیِ کاذب دارد.
  const hasJsx = /<[A-Za-z][\w.]*[\s/>]|<>/.test(
    // کامنت‌های تک‌خطی حذف می‌شوند تا مثال‌های داخل توضیحات شمرده نشوند.
    src.replace(/^\s*\/\/.*$/gm, ''),
  );
  if (!hasJsx) continue;

  const importsReact = /^import\s+React\b/m.test(src)
    || /^import\s+\*\s+as\s+React\b/m.test(src);

  if (!importsReact) offenders.push(f.replace(ROOT, 'src'));
}

if (offenders.length) {
  console.error('✗ این فایل‌های JSX «React» را import نکرده‌اند:\n');
  for (const f of offenders) console.error('   ' + f);
  console.error(
    '\nبا runtime کلاسیک، build سبز می‌ماند ولی صفحه در مرورگر با\n'
    + '«React is not defined» سفید می‌شود. یک خط اضافه کنید:\n'
    + "   import React from 'react';\n",
  );
  process.exit(1);
}

console.log(`✓ هر ${files.length} فایل JSX، React را import کرده است`);
