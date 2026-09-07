// گاردِ راهنماهای فیلد (hint) در پنل وب ادمین.
//
// قبلاً helperTextهای پنلِ ادمینِ *اندروید* را با hintهای وب می‌سنجید. پنل
// ادمین از اپ موبایل حذف شد (docs/ADMIN_PANEL_MOBILE_RETIREMENT.md) و مدیریت
// فقط با پنل وب است؛ پس این گارد حالا تضمین می‌کند که:
//   • تعداد hintهای پنل وب از حدِ فاز ۳.۴ پایین‌تر نیامده (یعنی چیزی موقع
//     حذفِ پنل موبایل جا نیفتاده)؛
//   • هر صفحه‌ای که قبلاً راهنما داشت هنوز hint دارد؛
//   • در هیچ hintی متنِ خالی یا صرفاً فاصله نمانده.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const WEB_PAGES = path.join(ROOT, 'admin/src/pages');

let ok = 0;
const fail = [];
const check = (cond, msg) => (cond ? ok++ : fail.push(msg));

const read = (p) => fs.readFileSync(p, 'utf8');

const webHints = new Map();
const webPages = {};
for (const file of fs.readdirSync(WEB_PAGES)) {
  if (!file.endsWith('.jsx')) continue;
  const page = file.replace(/\.jsx$/, '');
  const src = read(path.join(WEB_PAGES, file));
  webPages[page] = [];
  for (const m of src.matchAll(/hint="([^"]*)"/g)) {
    webHints.set(m[1], file);
    webPages[page].push(m[1]);
  }
}

// قاعدهٔ ۱: حجم راهنماها — باید در حدّ فاز ۳.۴ بماند.
check(webHints.size >= 100,
  'تعداد hintهای وب (' + webHints.size + ') از حدِ انتظارِ فاز ۳.۴ کمتر است — چیزی حذف شده؟');

// قاعدهٔ ۲: hint خالی یا سفید نمانده باشد (راهنمای مرده).
const empty = [...webHints.keys()].filter((t) => !t.trim());
check(empty.length === 0, 'راهنمای خالی/سفید در پنل وب هست: ' + empty.length);

// قاعدهٔ ۳: صفحاتی که ذاتاً فرم دارند نباید بی‌راهنما باشند. این صفحات در فاز
// ۳.۴ راهنما داشتند؛ اگر یکی صفر شد یعنی پسرفت. (صفحات فقط-نمایشی مثل
// داشبورد/مانیتورینگ لازم نیست.)
const FORM_PAGES_WITH_HINTS = ['engine', 'settings', 'shop', 'rewards', 'wheel', 'battle-pass'];
for (const page of FORM_PAGES_WITH_HINTS) {
  check((webPages[page] || []).length > 0,
    'صفحهٔ ' + page + ' هیچ hintی ندارد — راهنماهای فیلد حذف شده‌اند؟');
}

if (fail.length) {
  console.error('✗ گاردِ راهنماهای پنل وب شکست:');
  for (const f of fail) console.error('  - ' + f);
  process.exit(1);
}
console.log(`✅ ${ok} بررسیِ راهنماهای پنل وب موفق (${webHints.size} hint یکتا در ${Object.values(webPages).filter((h) => h.length).length} صفحه)`);
