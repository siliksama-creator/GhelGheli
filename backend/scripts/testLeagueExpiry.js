#!/usr/bin/env node
/**
 * نگهبانِ «هر لیگی که مهلتش تمام شد بسته می‌شود».
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * باگی که این فایل جلویش را می‌گیرد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * تنها زمان‌بندِ خودکارِ بستنِ لیگ این بود:
 *
 *     cron.schedule('5 0 1 * *', () => closeActiveSeason())
 *
 * «اولِ هر ماهِ میلادی، ۰۰:۰۵» — و فقط روی یک لیگ، چون
 * `closeActiveSeason()` بدونِ آرگومان سراغِ `ensureActiveSeason` می‌رود
 * که `ORDER BY starts_at DESC LIMIT 1` دارد.
 *
 * روی دیتابیسِ زنده اندازه گرفته شد:
 *
 *     لیگ هفتگی قهرمانان  ends_at = ۱۴۰۵/۰۵/۲۳ ۱۹:۱۴  → منقضی ✅
 *     لیگ برتر ماهانه     ends_at = ۱۴۰۵/۰۶/۰۱ ۰۰:۰۰  → هنوز فعال
 *
 * لیگِ هفتگی از روزِ قبل تمام شده بود و بسته نشده بود؛ ۲۶۶۹ امتیاز و یک
 * ردیفِ لیدربورد بلاتکلیف مانده بود و `league_payouts` خالی بود. با
 * زمان‌بندِ قبلی تا اولِ شهریور هم بسته نمی‌شد.
 *
 * خواستهٔ مالک: «تعداد روز لیگ فقط توسط ادمین مشخص میشه و اصلا ربطی به
 * ماهانه و هفتگی نداره، ساعت اتمامش هم ادمین به تاریخ ایران مشخص میکنه».
 *
 * ── چرا تستِ ایستا ──
 *
 * مثلِ `testMultiLeague.js`: در CI پستگرس نیست، و چیزی که اینجا اهمیت
 * دارد شکلِ کوئری و زمان‌بندِ کرون است. بستنِ واقعی روی VPS تأیید شد.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0;
const failures = [];
function ck(name, cond, detail = '') {
  if (cond) { pass += 1; console.log('  ✓', name); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log('  ✗', name, detail ? `→ ${detail}` : ''); }
}

const server = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
const league = fs.readFileSync(path.join(ROOT, 'src', 'services', 'leagueService.js'), 'utf8');

/**
 * کامنت‌ها را حذف می‌کند.
 *
 * لازم است چون توضیحِ بالای کرونِ جدید عمداً زمان‌بندِ قدیمی را نقل
 * می‌کند تا آیندگان بدانند چه چیزی و چرا عوض شد. بدونِ این پاک‌سازی،
 * تست همان کامنت را کدِ زنده می‌دید و اشتباهی قرمز می‌شد — که اولین بار
 * دقیقاً همین اتفاق افتاد.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const serverCode = stripComments(server);
const leagueCode = stripComments(league);

console.log('\n══ ۱. زمان‌بندِ کرون ══');

ck('زمان‌بندِ «اولِ ماه» دیگر وجود ندارد',
  !/cron\.schedule\(\s*['"]5 0 1 \* \*['"]/.test(serverCode),
  'الگوی 5 0 1 * * هنوز در کدِ زندهٔ server.js هست');

const hourly = /cron\.schedule\(\s*['"]5 \* \* \* \*['"][\s\S]{0,400}?closeExpiredSeasons/.test(serverCode);
ck('کرونِ ساعتی closeExpiredSeasons را صدا می‌زند', hourly);

ck('کرونِ لیگ timezone تهران دارد',
  /closeExpiredSeasons\(\)[\s\S]{0,300}?timezone:\s*['"]Asia\/Tehran['"]/.test(serverCode),
  'بدون timezone، تاریخی که مدیر به وقت ایران داده اشتباه تفسیر می‌شود');

console.log('\n══ ۲. انتخابِ لیگ‌ها بر پایهٔ ends_at، نه نوع ══');

const fnMatch = leagueCode.match(/async function closeExpiredSeasons\(\)[\s\S]*?\n}/);
ck('تابعِ closeExpiredSeasons وجود دارد', !!fnMatch);
const fn = fnMatch ? fnMatch[0] : '';

ck('همهٔ ردیف‌های active را می‌گیرد',
  /status\s*=\s*'active'/.test(fn));

ck('شرطِ انقضا روی ends_at است',
  /ends_at\s*<=\s*NOW\(\)/.test(fn));

ck('هیچ فیلترِ league_type در انتخاب نیست',
  !/league_type/.test(fn),
  'بستن نباید به نوعِ لیگ وابسته باشد');

ck('LIMIT 1 ندارد — همهٔ لیگ‌های منقضی بسته می‌شوند',
  !/LIMIT\s+1/i.test(fn));

ck('هر لیگ با seasonId صریح بسته می‌شود',
  /closeActiveSeason\(\s*\{\s*seasonId/.test(fn),
  'بدون seasonId دوباره فقط تازه‌ترین لیگ بسته می‌شود');

console.log('\n══ ۳. محافظ‌ها ══');

ck('force پاس داده نمی‌شود',
  !/force:\s*true/.test(fn),
  'محافظِ «فصل هنوز در جریان است» باید فعال بماند');

ck('شکستِ یک لیگ بقیه را متوقف نمی‌کند',
  /try\s*\{[\s\S]*?catch/.test(fn));

ck('closeExpiredSeasons صادر شده است',
  /module\.exports[\s\S]*closeExpiredSeasons/.test(leagueCode));

ck('مسیرهای دستیِ مدیر دست‌نخورده مانده‌اند',
  /closeActiveSeason\(\{\s*force:\s*req\.body/.test(
    stripComments(fs.readFileSync(path.join(ROOT, 'src', 'routes', 'adminLeague.js'), 'utf8'))),
  'دکمهٔ «بستن لیگ» در پنل نباید از کار بیفتد');

console.log('\n══ ۴. ریستِ امتیازِ ماهانه ══');

// این ستون شمارندهٔ نمایشیِ سراسری است و بینِ همهٔ لیگ‌ها مشترک. اگر
// بستنِ یک لیگ آن را صفر کند، امتیازِ نمایشیِ لیگ‌های همچنان فعال هم
// پاک می‌شود. حالا فقط وقتی صفر می‌شود که هیچ لیگِ فعالِ دیگری نمانده.
const resetGuard = /SELECT 1 FROM league_seasons[\s\S]{0,200}?status\s*=\s*'active'[\s\S]{0,120}?id\s*<>/.test(leagueCode);
ck('صفر کردنِ monthly_league_points مشروط به نبودِ لیگِ فعالِ دیگر است',
  resetGuard,
  'وگرنه بستنِ لیگِ هفتگی امتیازِ نمایشیِ لیگِ ماهانه را هم صفر می‌کند');

console.log('\n══ ۵. عرضِ month_year بینِ دو جدول یکسان است ══');

// این باگ واقعی بود و همین کرونِ جدید لوش داد:
//
//     value too long for type character varying(7)
//
// `league_seasons.month_year` به VARCHAR(32) پهن شده بود تا `1405-W32`
// را جا بدهد، ولی `user_league_history.month_year` روی VARCHAR(7) مانده
// بود. `closeActiveSeason` مقدار را از اولی به دومی کپی می‌کند، پس
// بستنِ هر لیگِ غیرماهانه با rollback شکست می‌خورد — یعنی لیگِ هفتگی
// اصلاً قابلِ بستن نبود. تا وقتی کرونِ قدیمی فقط تازه‌ترین لیگ را
// می‌بست، این خطا هیچ‌وقت اجرا نمی‌شد و پنهان مانده بود.
const migDir = path.join(ROOT, 'migrations');
const allMigrations = fs.readdirSync(migDir).sort()
  .map((f) => fs.readFileSync(path.join(migDir, f), 'utf8')).join('\n');

// آخرین عرضی که به هر ستون داده شده برنده است.
function lastWidth(re) {
  let m; let last = null;
  const rx = new RegExp(re, 'gi');
  while ((m = rx.exec(allMigrations)) !== null) last = Number(m[1]);
  return last;
}

const histWidth = lastWidth(String.raw`user_league_history[\s\S]{0,400}?month_year\s+(?:TYPE\s+)?VARCHAR\((\d+)\)`)
  || lastWidth(String.raw`ALTER TABLE user_league_history[\s\S]{0,200}?month_year TYPE VARCHAR\((\d+)\)`);
const seasonWidth = lastWidth(String.raw`month_year\s+VARCHAR\((\d+)\)\s+UNIQUE`);

ck('عرضِ month_year در user_league_history پیدا شد', histWidth !== null,
  String(histWidth));
ck('user_league_history.month_year حداقل به اندازهٔ league_seasons است',
  histWidth !== null && histWidth >= 32,
  `عرضِ فعلی ${histWidth} — شناسه‌هایی مثل 1405-W32 (۸ کاراکتر) و بلندتر باید جا شوند`);
ck('مایگریشنِ پهن‌سازی وجود دارد',
  fs.existsSync(path.join(migDir, '065_widen_user_league_history_month_year.sql')));

console.log('');
if (failures.length) {
  console.log(`✗ ${pass} موفق، ${failures.length} ناموفق`);
  failures.forEach((f) => console.log('   -', f));
  process.exit(1);
}
console.log(`✓ ${pass} موفق، 0 ناموفق`);
