#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════════════
 *  پنلِ ادمینِ جوایزِ غیرنقدیِ لیگ — برابریِ وب و اندروید
 * ══════════════════════════════════════════════════════════════════════
 *
 * خواستهٔ مالک (دورِ ۲۶): «قسمت ادمین برای قرار دادن جوایز لیگ هم در اپ
 * اندروید و هم وب کامل شود».
 *
 * منطقِ تحویلِ جایزه در `testLeaguePerks.js` تست می‌شود. اینجا فقط
 * زنجیرهٔ **رابط ← API** بررسی می‌شود: اینکه هر دو پنل واقعاً
 * `perkTable` را می‌فرستند و می‌خوانند، و اینکه سرور همان چیزی را
 * برمی‌گرداند که پنل انتظار دارد.
 *
 * چرا این تست لازم بود: `perkTable` در سرور کامل و تست‌شده بود ولی هیچ
 * رابطی آن را نمی‌فرستاد. یعنی قابلیت روی کاغذ وجود داشت و در عمل
 * غیرقابل‌استفاده بود — و هیچ تستی این شکاف را نمی‌دید.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

let passed = 0;
let failed = 0;
function ok(condition, message) {
  try {
    assert.ok(condition, message);
    passed += 1;
    console.log(`  ✓ ${message}`);
  } catch (e) {
    failed += 1;
    console.log(`  ✗ ${message}`);
    console.log(`      ${e.message}`);
  }
}

const web = read('admin/src/pages/league.jsx');
const droid = read('mobile/lib/screens/admin/admin_league.dart');
const route = read('backend/src/routes/adminLeague.js');
const ui = read('admin/src/components/ui.jsx');

console.log('\n== پنل ادمین: جوایز غیرنقدی لیگ ==');

// ── ۱) هر دو پنل جدول را می‌فرستند ────────────────────────────────────
ok(/perkTable:\s*perks/.test(web),
  'وب هنگام ذخیره perkTable را در بدنهٔ PATCH می‌فرستد');
ok(/'perkTable':\s*_perks/.test(droid),
  'اندروید هنگام ذخیره perkTable را در بدنهٔ PATCH می‌فرستد');

// ── ۲) هر دو پنل جدول را از پاسخ می‌خوانند ────────────────────────────
ok(/setPerks\(Array\.isArray\(x\.perkTable\)/.test(web),
  'وب perkTable را از پاسخ سرور می‌خواند');
ok(/_perks\s*=\s*List<Map>\.from\(d\?\['perkTable'\]/.test(droid),
  'اندروید perkTable را از پاسخ سرور می‌خواند');

// ── ۳) فهرست آیتم‌های فروشگاه برای منوی کشویی ─────────────────────────
//
// بدون این فهرست، مدیر باید slug را از حفظ تایپ کند و یک تایپو تا
// لحظهٔ بستنِ فصل پنهان می‌ماند.
ok(/data\.shopItems\s*=\s*items/.test(route),
  'سرور فهرست آیتم‌های فعال فروشگاه را برای منوی کشویی برمی‌گرداند');
ok(/is_active\s*=\s*true/.test(route),
  'فقط آیتم‌های فعال پیشنهاد می‌شوند — جایزهٔ آیتمِ بازنشسته بی‌معناست');
ok(/setShopItems\(x\.shopItems/.test(web) && /shopItems\.map/.test(web),
  'وب آیتم‌ها را در منوی کشویی نشان می‌دهد، نه ورودی متنی آزاد');
ok(/_shopItems\s*=\s*List<Map>\.from\(d\?\['shopItems'\]/.test(droid)
  && /DropdownButtonFormField<String>\(\s*key: ValueKey\('perk_slug_/.test(droid),
  'اندروید آیتم‌ها را در منوی کشویی نشان می‌دهد، نه ورودی متنی آزاد');

// ── ۴) هر سه نوع جایزه در هر دو پنل ───────────────────────────────────
for (const kind of ['plus_days', 'points', 'shop_item']) {
  ok(web.includes(`'${kind}'`), `وب نوع ${kind} را پشتیبانی می‌کند`);
  ok(droid.includes(`'${kind}'`), `اندروید نوع ${kind} را پشتیبانی می‌کند`);
  ok(route.includes(`'${kind}'`), `سرور نوع ${kind} را می‌پذیرد`);
}

// ── ۵) میان‌بُرِ «۲۰ نفرِ بعدی» ────────────────────────────────────────
//
// دقیقاً خواستهٔ مالک: «۵۰ نفر نقدی، ۲۰ نفر بعدی غیرنقدی». بدون این
// دکمه مدیر باید ۲۰ بار روی «افزودن» بزند و ۲۰ بار رتبه تایپ کند.
ok(/length:\s*20/.test(web), 'وب دکمهٔ ساخت ۲۰ رتبهٔ یکجا دارد');
ok(/List<Map>\.generate\(\s*20,/.test(droid),
  'اندروید دکمهٔ ساخت ۲۰ رتبهٔ یکجا دارد');
ok(/Number\(winnerCount\)\s*\+\s*1/.test(web)
  && /_winnerCount\s*\+\s*1/.test(droid),
  'در هر دو پنل رتبه‌ها از درست بعدِ ردهٔ نقدی شروع می‌شوند');

// ── ۶) هشدارِ رتبهٔ تکراری، پیش از ذخیره ───────────────────────────────
//
// سرور رتبهٔ تکراری را با ۴۰۰ رد می‌کند. اگر پنل هشدار ندهد، مدیر بعدِ
// پر کردنِ ۲۰ ردیف یک پیام خطای مبهم می‌گیرد و نمی‌داند کدام ردیف.
ok(/perkRankCounts/.test(web) && /رتبهٔ تکراری/.test(web),
  'وب رتبهٔ تکراری را روی همان ردیف علامت می‌زند');
ok(/_isDuplicateRank/.test(droid) && /errorText: dup/.test(droid),
  'اندروید رتبهٔ تکراری را روی همان ردیف علامت می‌زند');
ok(/تکراری است/.test(route),
  'سرور هم به‌عنوان آخرین خط دفاع رتبهٔ تکراری را رد می‌کند');

// ── ۷) خطای ذخیره باید دیده شود ───────────────────────────────────────
//
// 🔴 باگِ واقعی: `save()` در وب هیچ `catch` نداشت. اگر سرور ردیف را رد
//    می‌کرد، Promise رد می‌شد، پیامی نشان داده نمی‌شد و مدیر خیال
//    می‌کرد ذخیره شده.
const saveBody = web.slice(web.indexOf('async function save()'),
  web.indexOf('async function saveDates()'));
ok(/catch\s*\(e\)/.test(saveBody) && /notify\(/.test(saveBody),
  'وب پیام خطای اعتبارسنجی سرور را به مدیر نشان می‌دهد');
const droidSave = droid.slice(droid.indexOf('Future<void> _save()'),
  droid.indexOf('Future<DateTime?> _pickDateTime'));
ok(/catch\s*\(e\)/.test(droidSave) && /_snack\(apiError\(e\)\)/.test(droidSave),
  'اندروید پیام خطای اعتبارسنجی سرور را به مدیر نشان می‌دهد');

// ── ۸) فصلِ ویرایش‌شونده همان فصلِ نمایش‌داده‌شده باشد ─────────────────
//
// 🔴 باگِ واقعی: `getLeaderboard` فصل را با `ORDER BY starts_at ASC`
//    برمی‌داشت و `ensureActiveSeason` با `DESC`. با دو لیگِ هم‌زمان —
//    که خودِ مالک خواسته — پنل جدولِ لیگ A را نشان می‌داد و ذخیره روی
//    لیگ B می‌نشست: مدیر عدد را عوض می‌کرد، پیام موفقیت می‌گرفت، و
//    بعدِ رفرش عددِ قبلی برمی‌گشت.
ok(/data\.prizeTable\s*=/.test(route) && /data\.seasonId\s*=\s*season\.id/.test(route),
  'سرور جدول و شناسهٔ همان فصلی را که PATCH ویرایش می‌کند برمی‌گرداند');
ok(/data\.editingSeasonTitle/.test(route),
  'سرور عنوان فصلِ ویرایش‌شونده را برمی‌گرداند تا پنل صریح باشد');
ok(/x\.prizeTable\?\.length\s*\?\s*x\.prizeTable/.test(web),
  'وب جدول نقدی را از prizeTable می‌خواند نه از season.prize_table');
ok(/d\?\['prizeTable'\]/.test(droid),
  'اندروید جدول نقدی را از prizeTable می‌خواند نه از season.prize_table');
ok(/editingTitle/.test(web) && /_editingTitle/.test(droid),
  'هر دو پنل نام فصلِ در حال ویرایش را به مدیر نشان می‌دهند');

// ── ۹) جوایز غیرنقدی نباید در صف تأیید مالی بیفتند ────────────────────
//
// ردهٔ غیرنقدی هیچ ردیف `league_payouts` نمی‌گیرد، پس متنِ رابط هم
// نباید به مدیر بگوید منتظر تأیید بماند.
ok(/نیازی به تأیید مالی ندارد/.test(web) && /نیازی به تأیید مالی ندارد/.test(droid),
  'هر دو پنل توضیح می‌دهند جایزهٔ غیرنقدی خودکار تحویل می‌شود');

// ── ۱۰) کامپوننتِ جدولِ وب واقعاً `head`+children را رندر کند ──────────
//
// 🔴 باگِ واقعی و از قبل موجود: `Table` فقط `rows`/`cols` را از props
//    بیرون می‌کشید. جدولِ «لیگ‌های هم‌زمان» با `head=` صدا زده می‌شد و
//    در پنلِ زنده **کاملاً خالی** رندر می‌شد — بی‌هیچ خطایی در کنسول.
ok(/export function Table\(\{[^}]*head[^}]*children/.test(ui),
  'کامپوننت Table شکل head+children را از props می‌گیرد');
ok(/if \(head\) \{/.test(ui) && /<tbody>\{children\}<\/tbody>/.test(ui),
  'کامپوننت Table فرزندان را واقعاً داخل tbody رندر می‌کند');

// ── ۱۱) ورودی‌های تعاملی نباید فوکوس را از دست بدهند ──────────────────
//
// ردیف‌های perk فیلدِ ورودی دارند. اگر کلیدِ پایدار نداشته باشند، هر
// بار که مدیر یک نویسه تایپ می‌کند ری‌اکت/فلاتر ویجت را دوباره می‌سازد
// و کیبورد بسته می‌شود.
ok(/key=\{`perk-\$\{i\}`\}/.test(web), 'ردیف‌های وب کلید پایدار دارند');
ok(/ValueKey\('perk_rank_\$i'\)/.test(droid)
  && /ValueKey\('perk_value_\$i'\)/.test(droid),
  'فیلدهای اندروید کلید پایدار دارند تا فوکوس نپرد');

console.log(
  failed === 0
    ? `\n✓ ${passed} تست موفق، ${failed} ناموفق`
    : `\n✗ ${passed} تست موفق، ${failed} ناموفق`);
process.exit(failed === 0 ? 0 : 1);
