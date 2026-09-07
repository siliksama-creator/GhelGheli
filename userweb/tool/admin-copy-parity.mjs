// گاردِ «پنلِ متن‌های زنده».
//
// قبلاً این فایل همسانیِ پنلِ وب ادمین با پنلِ ادمینِ *اندروید* را می‌سنجید.
// پنل ادمین از اپ موبایل کاملاً حذف شد (docs/ADMIN_PANEL_MOBILE_RETIREMENT.md)
// و مدیریت فقط با پنل وب است؛ پس این گارد حالا تضمین می‌کند که پنل وب:
//   ۱) همهٔ گروه‌های متنیِ سرور را پوشش می‌دهد (هیچ گروهی پنهان نمانده) و
//      گروهِ بی‌منبع ندارد؛
//   ۲) در منوی ناوبری با عضوِ گروهِ ششم ثبت و تنبل بارگذاری می‌شود؛
//   ۳) گروه‌بندیِ منو با جدولِ نام‌ها سازگار است؛
//   ۴) قول‌های محصولیِ صفحه (پیش‌نمایش، قفلِ ذخیره، حالت حرفه‌ای، بازگشت به
//      پیش‌فرض) در پنل وب حاضرند.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

/** بدنهٔ یک تخصیصِ object/array را با تطبیقِ آکولاد برمی‌گرداند. */
function objectAt(src, marker) {
  const i = src.indexOf(marker);
  if (i < 0) return null;
  const openCh = src.indexOf('{', i);
  const openAr = src.indexOf('[', i);
  let open = openCh;
  if (openAr >= 0 && (openCh < 0 || openAr < openCh)) open = openAr;
  if (open < 0) return null;
  const close = src[open] === '{' ? '}' : ']';
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === src[open]) depth++;
    else if (src[j] === close) { depth--; if (depth === 0) return src.slice(open + 1, j); }
  }
  return null;
}

const webPage = read('admin/src/pages/live-copy.jsx');
const webMain = read('admin/src/main.jsx');

// ── ۱) گروه‌های متنی در پنل وب ────────────────────────────────────────────
const pairRe = /'?([a-zA-Z][a-zA-Z0-9_]*)'?\s*:\s*'([^']*)'/g;
const groupsOf = (body) => {
  const out = {};
  if (!body) return out;
  for (const m of body.matchAll(pairRe)) out[m[1]] = m[2];
  return out;
};
const webGroups = groupsOf(objectAt(webPage, 'const GROUP_LABEL'));
ok('پنل وب: GROUP_LABEL خوانده شد', Object.keys(webGroups).length > 0,
  `${Object.keys(webGroups).length} گروه`);

ok('پنل وب: صفحه در NAV ثبت است', /'live-copy',\s*'متن‌های زنده'/.test(webMain));
ok('پنل وب: صفحه تنبل بارگذاری می‌شود (مثل بقیهٔ صفحات)',
  /LiveCopyPage = lazy\(\(\) => import\('\.\/pages\/live-copy\.jsx'\)/.test(webMain));

// ── ۲) پوششِ کاملِ گروه‌ها نسبت به سرور ───────────────────────────────────
const svcSrc = read('backend/src/services/liveContent.js');
const serverGroups = new Set();
{
  const open = svcSrc.indexOf('{', svcSrc.indexOf('const DEFAULT_COPY ='));
  const body = open < 0 ? '' : svcSrc.slice(open, svcSrc.indexOf('\n}', open) > 0
    ? svcSrc.indexOf('\n}', open) + 2 : open + 9000);
  for (const line of body.split('\n')) {
    const m = /^  ([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*\{\s*$/.exec(line);
    if (m) serverGroups.add(m[1]);
  }
}
ok(`گروه‌های سرور پیدا شد (${serverGroups.size})`, serverGroups.size >= 8);
const noWeb = [...serverGroups].filter((g) => !(g in webGroups));
ok('پنل وب هیچ گروهی را پنهان نکرده', noWeb.length === 0, noWeb.join(', '));
const extraWeb = Object.keys(webGroups).filter((g) => !serverGroups.has(g));
ok('گروه‌های بی‌منبع در پنل وب نیستند', extraWeb.length === 0, extraWeb.join(', '));

// ── ۳) گروه‌بندیِ منوی وب ─────────────────────────────────────────────────
{
  const webNav = objectAt(webMain, 'const NAV = [') || '';
  const webRows = webNav.split(/\],\s*\n\s*\[/).map((x) => x.trim());
  const webIds = webRows.map((r) => /^'([\w-]+)'/.exec(r)?.[1] ?? '');
  const lastStr = (r) => {
    const m = [...r.matchAll(/'([^']+)'/g)];
    return m.length ? m[m.length - 1][1] : null;
  };
  const webRowGroups = webRows.map(lastStr);
  ok(`وب: هر ${webIds.length} ردیفِ NAV عضوِ ششمِ گروه‌دار دارد`,
    webIds.length >= 20 && webRowGroups.every(Boolean),
    `ردیف ${webIds.length}، بی‌گروه ${webRowGroups.filter((x) => !x).length}`);

  const labels = (src, marker) =>
    (objectAt(src, marker) || '').match(/'[\w-]+':\s*'[^']+'/g) || [];
  const webLabelRows = labels(webMain, 'const NAV_GROUPS = {');
  const labelKeys = new Set(webLabelRows.map((x) => /^'([\w-]+)'/.exec(x)[1]));
  const realGroups = webRowGroups.filter((g) => labelKeys.has(g));
  ok('وب: ردیفِ آخرِ هر قلم، کلیدِ شناخته‌شدهٔ گروه است',
    realGroups.length === webIds.length, `${realGroups.length}/${webIds.length}`);

  const orphans = [...new Set(webRowGroups)].filter((g) => !labelKeys.has(g));
  ok('هر گروهِ مصرفی در جدولِ نام‌ها ردیف دارد', orphans.length === 0, orphans.join(', '));
  ok('هر نامِ جدول در واقع مصرف می‌شود (گروهِ یتیم = سرتیترِ مرده)',
    [...labelKeys].every((k) => webRowGroups.includes(k)),
    [...labelKeys].filter((k) => !webRowGroups.includes(k)).join(', '));
}

// ── ۴) فیلدِ تازهٔ bazaarPackage در تنظیماتِ وب ───────────────────────────
{
  const webSettings = read('admin/src/pages/settings.jsx');
  ok('وب: «نامِ بستهٔ کافه‌بازار» در تنظیمات هست', /bazaarPackage/.test(webSettings),
    'در سرور هست، در پنل نیست = هرگز قابلِ عوض نیست');
  ok('وب: مقدار در stateِ اولیه هست (وگرنه فیلد روی undefined می‌سوزد)',
    /bazaarPackage:\s*''/.test(webSettings));
}

// ── ۵) قول‌های محصولیِ صفحه در پنل وب ─────────────────────────────────────
ok('وب: پیش‌نمایش از /preview می‌گیرد', /live-content\/preview/.test(webPage));
ok('وب: ذخیره با هشدارِ جای‌نگهدار قفل می‌شود', /disabled=\{missing\.length > 0\}/.test(webPage));
ok('وب: «حالتِ حرفه‌ای» کلیدهای فنی را نشان می‌دهد', /admin\.proCopy|proMode/.test(webPage));
ok('وب: دکمهٔ «بازگشت به پیش‌فرضِ کد» دارد',
  /live-content\/defaults/.test(webPage) && /busyDefaults/.test(webPage));
ok('وب: پیش‌فرض را «روی فرم» می‌نشاند و ذخیرهٔ خودکار نمی‌کند',
  !/defaults[\s\S]{0,200}PATCH[^)]*copy/.test(webPage));

console.log(`\n${fail ? '✗' : '✅'} ${pass} بررسیِ پنلِ متن‌های زنده (وب) موفق بود${fail ? `، ${fail} ناموفق` : ''}\n`);
process.exit(fail ? 1 : 0);
