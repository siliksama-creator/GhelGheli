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
    new RegExp(`INSERT INTO user_card_inventory[\\s\\S]{0,260}${COL}`, 'i')
      .test(src));
  ck(`${label}: با نسخهٔ دوم عوضش نمی‌کند (COALESCE)`,
    new RegExp(`${COL}\\s*=\\s*COALESCE\\(${COL}`, 'i').test(src),
    'وگرنه خانهٔ اینونتوری با هر ثبت ورق می‌خورد و کشِ گوشی باطل می‌شود');
}

console.log('\n══ ۳. هر سه خوانندهٔ اینونتوری به‌روزند ══');
// اگر یکی جا بماند، کارتی که کاربر «پشت» می‌بیند برای حریفش «رو» دیده
// می‌شود.
// ⚠️ نسخهٔ اولِ این تست از `FROM user_card_inventory` به **جلو** برش
//    می‌زد و شکست — در حالی که هر سه کوئری درست بودند. دلیلش ساده است:
//    `SELECT ... COALESCE(...)` **قبلِ** `FROM` می‌آید، پس برشِ رو به
//    جلو هیچ‌وقت آن را نمی‌دید.
//
//    این دقیقاً همان دسته «تستی که سبز/قرمز بودنش چیزی را ثابت نمی‌کند»
//    است که باید مراقبش بود. حالا از `SELECT` تا انتهای کوئری برش
//    می‌خورد.
const readers = serverSrc.match(
  /SELECT[\s\S]{0,600}?FROM user_card_inventory[\s\S]{0,400}?`/g) || [];
const selectReaders = readers.filter(r => /JOIN card_types/i.test(r));
ck('حداقل سه کوئریِ خواننده پیدا شد',
  selectReaders.length >= 3, `پیدا شد: ${selectReaders.length}`);

let joined = 0;
const missing = [];
for (const r of selectReaders) {
  if (/LEFT JOIN photo_card_designs/i.test(r)
      && /COALESCE\(\s*d\.image_url/i.test(r)) joined += 1;
  else missing.push(r.slice(0, 70).replace(/\s+/g, ' '));
}
ck('همهٔ خواننده‌ها COALESCE(d.image_url, t.image_url) دارند',
  joined === selectReaders.length,
  `${joined} از ${selectReaders.length} — جا مانده: ${missing.join(' | ')}`);

console.log('\n══ ۴. بازگشتِ امن وقتی طرحی نیست ══');
// کدِ نام‌دار بدونِ عکس، و کلِ سیستمِ قدیمیِ «فقط کد»، هیچ طرحی ندارند.
// آن‌ها باید همان `card_types.image_url` را بگیرند نه هیچ.
ck('COALESCE به t.image_url برمی‌گردد',
  /COALESCE\(\s*d\.image_url\s*,\s*t\.image_url\s*\)/i.test(serverSrc),
  'بدونِ این، کارتِ بدونِ طرح تصویرِ خالی نشان می‌دهد');
// ⚠️ نسخهٔ اولِ این بررسی `[^T]\bJOIN photo_card_designs d\b` بود که
//    روی «LEFT JOIN» هم می‌خورد (چون ` JOIN` با فاصلهٔ قبلش مطابقت
//    می‌کرد) و بی‌دلیل قرمز می‌شد. شمردن صادقانه‌تر از regexِ منفی است:
//    هر ارجاع باید LEFT باشد.
const allJoins =
  (serverSrc.match(/JOIN photo_card_designs d\b/gi) || []).length;
const leftJoins =
  (serverSrc.match(/LEFT JOIN photo_card_designs d\b/gi) || []).length;
ck('همهٔ JOINها به photo_card_designs از نوعِ LEFT هستند',
  allJoins > 0 && allJoins === leftJoins,
  `${leftJoins} از ${allJoins} — JOIN معمولی کارتِ بدونِ طرح را کاملاً از اینونتوری حذف می‌کند`);

console.log(`\n${fail ? '✗' : '✓'} ${pass} موفق، ${fail} ناموفق\n`);
process.exit(fail ? 1 : 0);
