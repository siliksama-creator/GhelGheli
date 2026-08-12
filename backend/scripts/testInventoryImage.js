/**
 * نگهبانِ «تصویرِ اینونتوری» — رو یا پشت، تصادفی.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این تست وجود دارد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * خواستهٔ مالک: «وقتی کاربر کارت رو ثبت میکنه بصورت تصادفی پشت و یا روی
 * کارت انتخاب بشه، اینطوری زیبایی اینونتوری بیشتر میشه».
 *
 * پیاده‌سازی‌اش ستونِ تازه‌ای می‌خواست (`display_design_id`) و **دقیقاً**
 * همان الگوی خرابی را دارد که در این پروژه سه بار تکرار شد:
 *
 *     کد ستون را می‌نویسد → مایگریشن جا می‌ماند → هیچ خطایی نمی‌دهد
 *
 * با `tex_sig`، بعد `rgb_sig`، بعد `text_tokens`. هر سه بار مقدار محاسبه
 * می‌شد، دور ریخته می‌شد، و کسی متوجه نمی‌شد چون سکوت می‌کرد.
 *
 * ولی اینجا یک خطرِ **بدترِ** دیگر هم هست که مخصوصِ خودِ این قابلیت است:
 *
 * ── خطرِ «نصفِ کارت‌ها تصادفی، نصفِ دیگر نه» ──
 *
 * دو مسیرِ کاملاً جدا در اینونتوری می‌نویسند:
 *
 *   ۱. `photoCardService.creditSubmission` — ثبت با عکس + کد
 *   ۲. `server.js` مسیرِ `/api/cards/redeem` — سیستمِ قدیمیِ «فقط کد»
 *
 * اگر فقط یکی‌شان قرعه بیندازد، کاربر صفحه‌ای می‌بیند که نصفِ کارت‌هایش
 * تصادفی‌اند و نصفِ دیگر همیشه تصویرِ پیش‌فرض. این **بدتر** از نداشتنِ
 * قابلیت است، چون بی‌قاعده به نظر می‌رسد نه عمدی.
 *
 * ── و خطرِ «خواننده‌ای که جا می‌ماند» ──
 *
 * سه کوئریِ جدا اینونتوری را می‌خوانند: `/api/profile`، `/api/bootstrap`،
 * و پروفایلِ عمومی. اگر یکی به‌روز نشود، کارتی که کاربر «پشت» می‌بیند
 * برای حریفش «رو» دیده می‌شود. دقیقاً همین دسته ناهماهنگی قبلاً باعث شد
 * کارتِ عکسی اصلاً در پروفایلِ عمومی دیده نشود.
 */
const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;

function ck(name, cond, detail = '') {
  if (cond) { pass += 1; console.log('  ✓', name); }
  else { fail += 1; console.log('  ✗', name, detail ? `→ ${detail}` : ''); }
}

const ROOT = path.join(__dirname, '..');
const serverSrc = fs.readFileSync(path.join(ROOT, 'src/server.js'), 'utf8');
const svcSrc = fs.readFileSync(
  path.join(ROOT, 'src/services/photoCardService.js'), 'utf8');
const migrations = fs.readdirSync(path.join(ROOT, 'migrations'))
  .filter(f => f.endsWith('.sql'))
  .map(f => fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8'))
  .join('\n');

const COL = 'display_design_id';

console.log('\n══ ۱. ستون واقعاً در مایگریشن‌ها هست ══');
// همان درسی که با tex_sig / rgb_sig / text_tokens گرفته شد: کدی که به
// ستونِ ناموجود می‌نویسد، خطا می‌دهد؛ ولی کدی که از ستونِ ناموجود
// **می‌خواند** با LEFT JOIN فقط NULL می‌گیرد و بی‌صدا کار نمی‌کند.
ck(`ستونِ ${COL} در مایگریشن‌ها اضافه شده`,
  migrations.includes(COL), 'مایگریشن جا افتاده؟');
ck('روی جدولِ درست (user_card_inventory) اضافه شده',
  /ALTER TABLE\s+user_card_inventory[\s\S]{0,200}display_design_id/i
    .test(migrations));
ck('به photo_card_designs ارجاع دارد',
  /display_design_id[\s\S]{0,200}REFERENCES\s+photo_card_designs/i
    .test(migrations),
  'بدونِ کلیدِ خارجی، طرحِ حذف‌شده ارجاعِ مرده باقی می‌گذارد');
ck('ON DELETE SET NULL دارد، نه CASCADE',
  /display_design_id[\s\S]{0,260}ON DELETE SET NULL/i.test(migrations),
  'CASCADE یعنی حذفِ یک طرح، کارتِ کاربر را از مجموعه‌اش پاک کند');

console.log('\n══ ۲. هر دو مسیرِ ثبت قرعه می‌اندازند ══');
// اگر فقط یکی این کار را بکند، نصفِ کارت‌های کاربر تصادفی‌اند و نصفِ
// دیگر نه — که بی‌قاعده به نظر می‌رسد، نه عمدی.
for (const [label, src] of [
  ['ثبت با عکس (photoCardService)', svcSrc],
  ['ثبت با کدِ تنها (server.js)', serverSrc],
]) {
  ck(`${label}: از photo_card_designs طرح انتخاب می‌کند`,
    /FROM photo_card_designs[\s\S]{0,160}ORDER BY random\(\)/i.test(src),
    'این مسیر همیشه تصویرِ پیش‌فرض را نشان می‌دهد');
  ck(`${label}: فقط طرحِ فعال را برمی‌دارد`,
    /photo_card_designs[\s\S]{0,120}is_active\s*=\s*true[\s\S]{0,80}random\(\)/i
      .test(src),
    'طرحِ غیرفعال نباید در اینونتوری ظاهر شود');
  ck(`${label}: مقدار را در INSERT می‌نویسد`,
    new RegExp(`INSERT INTO user_card_inventory[\\s\\S]{0,300}${COL}`, 'i')
      .test(src));
  ck(`${label}: با نسخهٔ دوم عوضش نمی‌کند (COALESCE)`,
    new RegExp(`COALESCE\\(\\s*user_card_inventory\\.${COL}`, 'i').test(src),
    'وگرنه خانهٔ اینونتوری با هر ثبت ورق می‌خورد و کشِ گوشی باطل می‌شود');

  // ── نگهبانِ باگِ مسابقه ──
  //
  // الگوی `SELECT ... if(found) UPDATE else INSERT` با دو درخواستِ
  // هم‌زمان روی **اولین** نسخهٔ یک کارت می‌شکند: هر دو SELECT خالی
  // می‌بینند، هر دو INSERT می‌زنند، دومی به `uq_inventory_active`
  // می‌خورد و تراکنش برمی‌گردد.
  //
  // ⚠️ این حدس نبود. با دو `psql` هم‌زمان بازتولید شد:
  //      ERROR: duplicate key value violates unique constraint
  //    و بعد از تبدیل به ON CONFLICT، شش تراکنشِ هم‌زمان → یک ردیف با
  //    quantity=6 و صفر خطا.
  //
  // تستِ سرتاسری این را نگرفت چون قفلِ ردیفِ کد دو درخواست را **گاهی**
  // سریال می‌کند. تکیه بر آن سریال‌سازیِ تصادفی درست نیست.
  ck(`${label}: UPSERT اتمیک است (ON CONFLICT)`,
    /INSERT INTO user_card_inventory[\s\S]{0,400}ON CONFLICT/i.test(src),
    'الگوی SELECT-سپس-INSERT با درخواستِ هم‌زمان کد را می‌سوزاند');
  ck(`${label}: ON CONFLICT ایندکسِ جزئی را هدف می‌گیرد`,
    /ON CONFLICT \(user_id, card_type_id\)\s*WHERE consumed_in_reward = false/i
      .test(src),
    'بدونِ شرطِ WHERE، Postgres نمی‌داند کدام ایندکسِ جزئی را هدف بگیرد');
  ck(`${label}: دیگر SELECT-سپس-INSERT ندارد`,
    !/SELECT id(?:, display_design_id)? FROM user_card_inventory[\s\S]{0,200}(?:if \(inv\.rows|inv\.rows\[0\])/i
      .test(src),
    'الگوی قدیمی برگشته — باگِ مسابقه هم با آن برمی‌گردد');
}

console.log('\n══ ۳. هر سه خوانندهٔ اینونتوری طرحِ رو را نشان می‌دهند ══');
const frontUses = (serverSrc.match(/cardDuel\.FRONT_IMAGE_SQL/g) || []).length;
ck('profile و bootstrap و پروفایل عمومی از FRONT_IMAGE_SQL می‌خوانند',
  frontUses >= 3, `پیدا شد: ${frontUses}`);
const duelSvc = fs.readFileSync(path.join(ROOT, 'src/services/cardDuelService.js'), 'utf8');
ck('FRONT_IMAGE_SQL فقط طرح رو را برمی‌دارد و به t.image_url برمی‌گردد',
  /COALESCE\(pd\.side, 'front'\) = 'front'/.test(duelSvc)
  && /ORDER BY pd\.created_at DESC LIMIT 1\),\s*t\.image_url/.test(duelSvc));
ck('خواننده‌ها دیگر پشتِ تصادفی را تصویر اصلی نمی‌کنند',
  !/COALESCE\(\s*d\.image_url\s*,\s*t\.image_url\s*\)/.test(serverSrc));

console.log('\n══ ۴. بازگشتِ امن وقتی طرحی نیست ══');
ck('اگر طرح رو نباشد t.image_url نمایش داده می‌شود',
  /t\.image_url/.test(duelSvc));

console.log(`\n${fail ? '✗' : '✓'} ${pass} موفق، ${fail} ناموفق\n`);
process.exit(fail ? 1 : 0);
