#!/usr/bin/env node
/**
 * نگهبانِ «دو لیگ هم‌زمان».
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * باگی که این فایل جلویش را می‌گیرد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * خواستهٔ مالک: «ادمین در پنل اندروید و وب بتونه ۲ لیگ رو هم زمان قرار
 * بده و زمان شروع و پایان رو ادمین مشخص کنه».
 *
 * زیرساخت از قبل بود: `league_seasons` چند ردیفِ `active` می‌پذیرد،
 * `getLeaderboard` فهرست را می‌خواند، و پنل هم فرمِ ساخت دارد. ولی
 * `addLeaguePoints` فقط `ensureActiveSeason()` را صدا می‌زد که
 * `ORDER BY starts_at DESC LIMIT 1` دارد.
 *
 * یعنی **فقط تازه‌ترین لیگ امتیاز می‌گرفت**. روی دیتابیسِ زنده اندازه
 * گرفته شد:
 *
 *     لیگ هفتگی قهرمانان (تازه‌تر) → ۱۰۴ بازیکن، ۹۴۳۰ امتیاز
 *     لیگ برتر ماهانه            → ۱ بازیکن،  ۲۸۲۴ امتیاز
 *
 * لیگِ ماهانه از لحظهٔ ساختِ لیگِ هفتگی یخ زد. قابلیت روی کاغذ بود.
 *
 * ── چرا تستِ ایستا و نه زنده ──
 *
 * این تست بدونِ دیتابیس هم باید در CI اجرا شود. شکلِ کوئری و قواعدش را
 * می‌سنجد؛ درستیِ اجرایش با `EXPLAIN` روی دیتابیسِ واقعی تأیید شد و
 * `testE2E` در CI با پستگرسِ واقعی می‌چرخد.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REPO = path.join(ROOT, '..');
let pass = 0;
const failures = [];
function ck(name, cond, detail = '') {
  if (cond) { pass += 1; console.log('  ✓', name); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log('  ✗', name, detail ? `→ ${detail}` : ''); }
}
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');

const svc = read('backend/src/services/leagueService.js');
const adminRoutes = read('backend/src/routes/adminLeague.js');

console.log('\n══ ۱. امتیاز به همهٔ لیگ‌های فعال می‌رود ══');
{
  const fn = svc.slice(svc.indexOf('async function addLeaguePoints'),
    svc.indexOf('async function getLeaderboard'));
  ck('addLeaguePoints از SELECT روی league_seasons تغذیه می‌شود',
    /INSERT INTO league_leaderboard_entries[\s\S]*?SELECT[\s\S]*?FROM league_seasons/.test(fn),
    'اگر تک‌ردیفی VALUES بزند، فقط یک لیگ امتیاز می‌گیرد');
  ck('همهٔ ردیف‌های active را می‌گیرد', /WHERE s\.status = 'active'/.test(fn));
  ck('LIMIT 1 در مسیرِ اصلی نمانده',
    !/FROM league_seasons[\s\S]{0,400}LIMIT 1/.test(fn),
    'LIMIT 1 یعنی برگشت به همان باگ');
  ck('ON CONFLICT برای جمع‌زدن امتیاز هست',
    /ON CONFLICT\(league_season_id, user_id\)[\s\S]{0,160}points \+ EXCLUDED\.points/.test(fn));
}

console.log('\n══ ۲. بازهٔ زمانی که مدیر تعیین کرده رعایت می‌شود ══');
{
  const fn = svc.slice(svc.indexOf('async function addLeaguePoints'),
    svc.indexOf('async function getLeaderboard'));
  ck('لیگی که هنوز شروع نشده امتیاز نمی‌گیرد',
    /s\.starts_at\s*<=\s*NOW\(\)/.test(fn),
    'مدیر می‌تواند لیگ را از قبل بسازد؛ نباید زودتر پر شود');
  ck('لیگی که تمام شده امتیاز نمی‌گیرد',
    /s\.ends_at\s*>\s*NOW\(\)/.test(fn));
}

console.log('\n══ ۳. شرط‌های ورودِ لیگ ══');
{
  const fn = svc.slice(svc.indexOf('async function addLeaguePoints'),
    svc.indexOf('async function getLeaderboard'));
  ck('لیگِ ویژهٔ پلاس فقط به مشترک امتیاز می‌دهد',
    /plus_only[\s\S]{0,200}user_subscriptions/.test(fn));
  // ⚠️ user_subscriptions ستون status ندارد — پیش‌نویسِ اول داشت و
  //    خطای SQL می‌داد. این سنجه جلوی برگشتش را می‌گیرد.
  // ⚠️ فقط داخلِ خودِ SQL جست‌وجو می‌شود، نه در کامنت‌ها. نسخهٔ اول
  //    کلِ تابع را می‌گشت و کامنتی که همین اشتباه را **توضیح می‌داد**
  //    باعثِ قرمزیِ کاذب شد. تستی که کامنت را با کد اشتباه بگیرد،
  //    نویسنده را وادار می‌کند مستندات را پاک کند تا سبز شود.
  // کامنت‌های SQL (`-- ...`) هم باید کنار گذاشته شوند: توضیحِ همین
  // اشتباه داخلِ خودِ کوئری نوشته شده و بدونِ این فیلتر، تست خودش را
  // قرمز می‌کند.
  const sqlOnly = (fn.match(/`[\s\S]*?`/g) || []).join('\n')
    .split('\n').filter(line => !/^\s*--/.test(line)).join('\n');
  ck('از ستونِ ناموجودِ status استفاده نمی‌کند',
    !/us\.status/.test(sqlOnly),
    'user_subscriptions ستونِ status ندارد؛ اشتراکِ فعال = expires_at آینده');
  ck('حداقلِ امتیازِ ورود رعایت می‌شود',
    /min_points_entry[\s\S]{0,200}lifetime_points/.test(fn));
}

console.log('\n══ ۴. امتیاز هرگز بی‌صدا گم نمی‌شود ══');
{
  const fn = svc.slice(svc.indexOf('async function addLeaguePoints'),
    svc.indexOf('async function getLeaderboard'));
  // اگر فیلترها هیچ لیگی برنگردانند (مثلاً ends_at گذشته ولی کرونِ
  // بستن هنوز نرسیده)، امتیاز باید جایی ثبت شود نه اینکه دور ریخته شود.
  ck('اگر هیچ لیگی واجد شرایط نبود، fallback دارد',
    /rowCount === 0[\s\S]{0,400}ensureActiveSeason/.test(fn),
    'بدونِ آن، امتیازِ کاربر در شکافِ زمانی گم می‌شود');
}

console.log('\n══ ۵. مدیر می‌تواند لیگ بسازد و تاریخ بدهد ══');
{
  ck('مسیرِ ساختِ لیگ تازه هست',
    /router\.post\(\s*'\/admin\/league(\/seasons)?'/.test(adminRoutes)
    || /admin\/league\/create/.test(adminRoutes),
    'بدونِ آن مدیر نمی‌تواند لیگ دوم بسازد');
  ck('مسیرِ ویرایشِ تاریخِ لیگ هست',
    /admin\/league\/[^']*dates/.test(adminRoutes));
  ck('مسیرِ فهرستِ لیگ‌ها برای پنل هست',
    /admin\/league\/seasons/.test(adminRoutes) || /admin\/league'/.test(adminRoutes));
}

console.log(`\n${failures.length ? '✗' : '✓'} ${pass} موفق، ${failures.length} ناموفق`);
if (failures.length) {
  console.log('\nشکست‌ها:');
  failures.forEach(f => console.log('  ·', f));
  process.exit(1);
}
if (pass < 12) {
  console.log(`\n✗ فقط ${pass} سنجه اجرا شد — کمتر از انتظار`);
  process.exit(1);
}
