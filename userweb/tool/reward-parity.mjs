#!/usr/bin/env node
/**
 * گاردِ «جشنِ دریافت» — وب و اندروید باید یک چیز را نشان بدهند.
 *
 * ── چرا این گارد لازم است ────────────────────────────────────────────────
 *
 * خواستهٔ مالک در دورِ ۳۱: «هر وقت کاربر امتیاز می‌گیرد، لحظهٔ دریافت را
 * جلوی چشمش ببیند — و این رفتار در وب و اپ موبایل یکپارچه باشد». خطرِ
 * واقعی این است که به‌تدریج واگرا شود: یک نفر مسیرِ جایزهٔ تازه‌ای در وب
 * اضافه می‌کند و اندروید جا می‌ماند؛ یا کسی زمانبندی/متن/آیکون را در یک
 * طرف عوض می‌کند. هیچ‌کدام از اینها کامپایل را نمی‌شکند و هیچ تستی
 * نمی‌گیردشان — فقط کاربرِ اندروید می‌بیند «وب جشن دارد، اپ ندارد».
 *
 * ── چه چیزی سنجیده می‌شود ────────────────────────────────────────────────
 *
 *   ۱. هر دو کلاینت ویجتِ جشن دارند.
 *   ۲. زمانبندیِ نمایش یکی است (۲٬۴ ثانیه در هر دو).
 *   ۳. هر پنج منبعِ جایزه در هر دو تعریف شده‌اند.
 *   ۴. هر مسیرِ جایزه در هر دو وصل است (ماموریت/روزانه/اختصاصی، گردونه، زنجیرهٔ ورود).
 *   ۵. میزبانِ جشن در ریشهٔ وب سوار شده (تا روی همهٔ صفحه‌ها و بازی‌های
 *      تمام‌صفحه ظاهر شود، نه فقط داخلِ یک صفحه).
 *   ۶. آیکون‌های جشن در هر دو مجموعهٔ آیکون وجود دارند (وگرنه آیکونِ خالی).
 *   ۷. عدد با `fa()`/`faNum()` ساخته می‌شود و رقمِ لاتینِ سفت در رشته‌ها نیست.
 *   ۸. بدون ایموجی (وگرنه شکلِ جشن تابعِ فونتِ دستگاهِ کاربر می‌شود).
 *
 * این گارد برای هر بند یک شاهدِ *ایستا* می‌گیرد؛ رفتارِ زمان‌دار در
 * `mobile/test/reward_burst_test.dart` و ممیزیِ زندهٔ وب سنجیده می‌شود.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WEB = 'userweb/src';
const APP = 'mobile/lib';

const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

/**
 * متنِ کد بدونِ کامنت‌ها.
 *
 * سنجه‌های ۷ و ۸ (رقمِ سفت، ایموجی) باید فقط *رابط* را ببینند، ولی هر دو
 * نشانهٔ داخلیِ کدبیس در کامنت‌ها زندگی می‌کنند: `⚠️` که سبکِ معمولِ
 * هشدارهای ماست و ارجاع‌هایی مثل «بند ۵.۶». اگر کامنت‌ها پاک نشوند، گارد
 * به‌جای باگ، خودِ توضیحاتِ باگ را گزارش می‌کند — و گاردی که دروغ بگوید
 * خیلی زود خاموش می‌شود. (کنسولِ `no-emoji.mjs` هم دقیقاً همین می‌کند.)
 */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    // کامنتِ سه‌اسلشِ دارت و دو‌اسلشِ پایانِ خط، هر دو با الگوی بالا می‌آیند
    .replace(/^[ \t]*\/\/\/.*$/gm, '');
}

let failures = 0;
function ok(label, pass, detail = '') {
  console.log(`  ${pass ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures += 1;
}

const WEB_BURST = `${WEB}/components/RewardBurst.jsx`;
const APP_BURST = `${APP}/widgets/reward_burst.dart`;

console.log('\n══ جشنِ دریافت: هم‌سانیِ وب و اندروید ══');

// ── ۱) وجودِ ویجتِ جشن در هر دو کلاینت ──
ok('وب ویجتِ جشن دارد', fs.existsSync(path.join(root, WEB_BURST)));
ok('اندروید ویجتِ جشن دارد', fs.existsSync(path.join(root, APP_BURST)));
if (failures) {
  console.log(`\n✗ ${failures} بررسیِ جشن شکست خورد\n`);
  process.exit(1);
}
const webBurst = read(WEB_BURST);
const appBurst = read(APP_BURST);

// ── ۲) زمان‌بندیِ یکسان ──
const webMs = /VISIBLE_MS\s*=\s*(\d+)/.exec(webBurst)?.[1];
const appMs = /_visibleMs\s*=\s*(\d+)/.exec(appBurst)?.[1];
ok('زمانِ نمایش در وب تعریف شده', Boolean(webMs), `${webMs}ms`);
ok('زمانِ نمایش در اندروید تعریف شده', Boolean(appMs), `${appMs}ms`);
ok('زمانِ نمایش در دو کلاینت یکی است', Boolean(webMs && appMs) && webMs === appMs);

// ── ۳) منابعِ جایزه ──
// پنج منبعی که امروز جایزه می‌دهند. اگر روزی مسیرِ ششم اضافه شد (مثلاً
// «جایزهٔ لیگ»)، این گارد می‌شکند تا کسی مجبور شود هر دو کلاینت را وصل کند.
const SOURCES = ['mission', 'daily', 'custom', 'wheel', 'streak'];
const webMissing = SOURCES.filter(
  s => !new RegExp(`(?:'|"|\\b)${s}(?:'|"|\\s*:)`).test(webBurst));
const appMissing = SOURCES.filter(s => !new RegExp(`RewardSource\\.${s}\\b`).test(appBurst));
ok('وب هر پنج منبع را می‌شناسد', webMissing.length === 0, webMissing.join('، '));
ok('اندروید هر پنج منبع را می‌شناسد', appMissing.length === 0, appMissing.join('، '));
// ضمناً هر منبع در وب باید عنوانِ زندهٔ خودش را بخواند (کلیدِ `reward.*`).
const webSourceKeys = SOURCES.filter(s => !read(WEB_BURST).includes(`reward.${s}`));
ok('هر منبع در وب عنوانِ زندهٔ خودش را می‌خواند', webSourceKeys.length === 0,
  webSourceKeys.join('، '));
const appSourceKeys = SOURCES.filter(s => !appBurst.includes(`reward.${s}`));
ok('هر منبع در اندروید عنوانِ زندهٔ خودش را می‌خواند', appSourceKeys.length === 0,
  appSourceKeys.join('، '));

// ── ۴) سیم‌کشیِ مسیرهای جایزه در هر دو ──
// وب: سه فایل؛ اندروید: سه فایلِ آینه.
const WEB_PATHS = [
  ['ماموریت/روزانه/اختصاصی', `${WEB}/GrowthHub.jsx`, 'celebrateReward'],
  ['گردونه', `${WEB}/screens/Wheel.jsx`, 'celebrateReward'],
  ['زنجیرهٔ ورود', `${WEB}/components/LoginStreak.jsx`, 'celebrateReward'],
];
const APP_PATHS = [
  ['ماموریت/روزانه/اختصاصی', `${APP}/screens/user/games/growth_panel.dart`, 'RewardBurst.celebrate'],
  ['گردونه', `${APP}/screens/user/wheel_page.dart`, 'RewardBurst.celebrate'],
  ['زنجیرهٔ ورود', `${APP}/screens/user/login_streak_card.dart`, 'RewardBurst.celebrate'],
];
for (const [label, file, needle] of WEB_PATHS) {
  const src = fs.existsSync(path.join(root, file)) ? read(file) : '';
  ok(`وب: مسیرِ ${label} جشن می‌فرستد`, src.includes(needle), file);
}
for (const [label, file, needle] of APP_PATHS) {
  const src = fs.existsSync(path.join(root, file)) ? read(file) : '';
  ok(`اندروید: مسیرِ ${label} جشن می‌فرستد`, src.includes(needle), file);
}
// اگر یک طرف مسیرهایی در فهرستِ بالا اضافه کند و طرفِ دیگر نه، تعدادِ
// سیم‌کشی‌ها واگرا می‌شود. این بند همان را می‌گیرد.
ok('تعدادِ مسیرهای جشن در دو کلاینت یکی است',
  WEB_PATHS.length === APP_PATHS.length,
  `وب ${WEB_PATHS.length} / اندروید ${APP_PATHS.length}`);

// ── ۵) میزبانِ سراسری در ریشهٔ وب ──
const mainSrc = read(`${WEB}/main.jsx`);
ok('میزبانِ جشن در ریشهٔ وب سوار است', /<RewardBurstHost\s*\/>/.test(mainSrc),
  'بدونِ این، جشن فقط داخلِ صفحهٔ جایزه می‌ماند و در صفحه‌های دیگر دیده نمی‌شود');

// ── ۶) آیکون‌ها در هر دو مجموعه ──
// نامِ آیکون‌ها محلی‌اند (نه در قراردادِ متن)، پس این گارد تنها جایی است که
// می‌تواند «آیکونِ خالی» را قبل از دیدنِ کاربر بگیرد.
const iconAsset = read(`${WEB}/components/IconAsset.jsx`);
const uiIcon = read(`${APP}/widgets/ui_icon.dart`);
const webIconNames = new Set(
  [...iconAsset.matchAll(/^\s{2,4}'?([a-z_]{3,})'?\s*:/gm)].map(m => m[1]));
const appIconNames = new Set([...uiIcon.matchAll(/^\s{4}'([a-z_]+)':/gm)].map(m => m[1]));
const usedIcons = new Set([
  ...[...webBurst.matchAll(/icon=["']([a-z_]+)["']/g)].map(m => m[1]),
  ...[...webBurst.matchAll(/name:\s*'([a-z_]+)'/g)].map(m => m[1]),
  ...[...appBurst.matchAll(/_chip\('([a-z_]+)'/g)].map(m => m[1]),
  ...[...appBurst.matchAll(/:\s*'([a-z_]+)',/g)].map(m => m[1]),
]);
usedIcons.delete('a'); // از نگاشت‌های دیگر
const badIcons = [...usedIcons].filter(n => !webIconNames.has(n) || !appIconNames.has(n));
ok('هر آیکونِ جشن در هر دو مجموعه هست', badIcons.length === 0 && usedIcons.size >= 3,
  badIcons.length ? badIcons.join('، ') : `${usedIcons.size} آیکون`);

// ── ۷) عددِ فارسی، بی‌رقمِ لاتین ──
ok('وب عدد را با fa() می‌سازد', /\bfa\(/.test(webBurst));
ok('اندروید عدد را با faNum() می‌سازد', /\bfaNum\(/.test(appBurst));
// رقمِ لاتینِ سفت داخلِ رشتهٔ نمایشی: مثلاً '100 امتیاز'. تنظیماتِ CSS
// (۲۴۰۰ میلی‌ثانیه، اندازهٔ فونت) عدد دارند و اشکالی ندارد — پس فقط
// رشته‌های فارسی‌دار بررسی می‌شوند.
const latinInText = [];
for (const [label, src] of [['وب', code(webBurst)], ['اندروید', code(appBurst)]]) {
  for (const m of src.matchAll(/(['"`])([^'"`\n]*[آ-ی][^'"`\n]*)\1/g)) {
    if (/[0-9۰-۹]/.test(m[2]) && !/\$\{|fa\(|faNum\(/.test(m[2])) {
      latinInText.push(`${label}: «${m[2]}»`);
    }
  }
}
ok('هیچ رقمِ سفتی داخلِ رشتهٔ نمایشیِ جشن نیست', latinInText.length === 0,
  latinInText.join(' | '));

// ── ۸) بدون ایموجی ──
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
ok('وب: جشن ایموجی ندارد', !EMOJI.test(code(webBurst)));
ok('اندروید: جشن ایموجی ندارد', !EMOJI.test(code(appBurst)));

if (failures) {
  console.log(`\n✗ ${failures} بررسیِ جشنِ دریافت شکست خورد\n`);
  process.exit(1);
}
console.log('\n✅ جشنِ دریافت در وب و اندروید هم‌سان است\n');
