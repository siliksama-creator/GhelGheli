#!/usr/bin/env node
/**
 * نگهبانِ پوششِ فروشگاه — آیا هر آیتمی که می‌فروشیم واقعاً اعمال می‌شود؟
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این فایل لازم شد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * سؤالِ مالک: «آیتم های شاپ رو بررسی کن ببین واقعا اون چیزی که ساخته شده
 * اعمال میشه؟ همه واقعی و سالم هستن؟»
 *
 * سؤالِ درستی است و جوابش را هیچ تستِ موجودی نمی‌داد. خطرِ خاصِ این حوزه:
 *
 *   کاربر پول می‌دهد → ردیف در `user_shop_items` ثبت می‌شود →
 *   API آن را در `cosmetics` برمی‌گرداند → **ولی کلاینت اسلاگ را
 *   نمی‌شناسد و بی‌صدا هیچ‌چیز رندر نمی‌کند.**
 *
 * هیچ خطایی رخ نمی‌دهد. نه در لاگ، نه روی صفحه. کاربر پول داده و چیزی
 * نگرفته — بدترین نوعِ باگ چون فقط با شکایتِ کاربر معلوم می‌شود.
 *
 * ── چرا این تست ایستا است و نه زنده ──
 *
 * کاتالوگ در **مایگریشن‌ها** تعریف می‌شود (پس در مخزن است) و رندرکننده‌ها
 * هم در کد. پس می‌شود بدونِ دیتابیس هم مچ کرد و در CI اجرا شد. تستِ
 * زنده لازم نیست چون هر دو طرف در همین مخزن‌اند.
 *
 * ⚠️ اگر روزی آیتمی مستقیم با SQL روی تولید اضافه شود (نه با مایگریشن)،
 *    این نگهبان نمی‌بیندش. `tools/audit_shop_live.py` همان را از روی
 *    دیتابیسِ زنده چک می‌کند.
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

const read = p => fs.readFileSync(p, 'utf8');
const migrations = fs.readdirSync(path.join(ROOT, 'migrations'))
  .filter(f => f.endsWith('.sql'))
  .map(f => read(path.join(ROOT, 'migrations', f)))
  .join('\n');

// ── استخراجِ کاتالوگ از مایگریشن‌ها ──
//
// ردیف‌های INSERT INTO shop_items به شکل ('slug','kind',...) هستند.
// به‌جای پارسِ کاملِ SQL (شکننده)، جفتِ اسلاگ/نوع را با regex برمی‌داریم
// و بعد صحتِ تعدادش را چک می‌کنیم تا اگر الگو عوض شد ساکت نماند.
const KINDS = ['club_badge', 'card_frame', 'name_color', 'profile_background',
  'result_template', 'match_effect', 'emote_pack', 'profile_badge'];

// ═══════════════════════════════════════════════════════════════════════════
// چرا کاتالوگ با یک پارسرِ حالت‌دار خوانده می‌شود و نه با یک regex
// ═══════════════════════════════════════════════════════════════════════════
//
// دو تلاشِ قبلی هر دو شکست خوردند و **هر دو بار قرمزیِ گمراه‌کننده** دادند:
//
//   ۱. regexی که فرض می‌کرد ترتیبِ ستون‌ها همیشه `(slug, kind, ...)` است
//      → فقط ۳۰ آیتم از ۷۲ پیدا شد و چهار نوع «صفر آیتم» گزارش شدند.
//   ۲. regexی که حداکثر چهار مقدارِ اولِ هر ردیف را می‌خواند
//      → ستونِ `payload` (که پنجم است) همیشه null می‌شد و ۱۷ آیتمِ سالم
//        «بی‌رندرکننده» اعلام شدند.
//   ۳. regexی که ردیف را تا انتهای خط می‌گرفت
//      → ردیف‌های چندخطی از قلم افتادند.
//
// درسِ ثبت‌شدهٔ همین پروژه: «وقتی تستی قرمز شد، اول مطمئن شو خود تست
// درست است». هر سه بار مقصر خودِ تست بود، نه محصول.
//
// SQL را نمی‌شود با regex پارس کرد. این پارسرِ کوچک ردیف‌ها را با شمردنِ
// پرانتز و احترام به رشته‌های نقل‌قولی جدا می‌کند — چند خطی هم باشند.
function splitRows(valuesBlock) {
  const rows = [];
  let depth = 0, inStr = false, buf = '';
  for (let i = 0; i < valuesBlock.length; i += 1) {
    const ch = valuesBlock[i];
    if (inStr) {
      // '' داخلِ رشته یعنی یک آپستروفِ ادبی، نه پایانِ رشته.
      if (ch === "'" && valuesBlock[i + 1] === "'") { buf += "''"; i += 1; continue; }
      if (ch === "'") inStr = false;
      buf += ch;
      continue;
    }
    if (ch === "'") { inStr = true; buf += ch; continue; }
    if (ch === '(') { depth += 1; if (depth === 1) { buf = ''; continue; } }
    if (ch === ')') { depth -= 1; if (depth === 0) { rows.push(buf); buf = ''; continue; } }
    if (depth > 0) buf += ch;
  }
  return rows;
}

/** مقادیرِ یک ردیف را جدا می‌کند؛ فقط رشته‌ها و NULL مهم‌اند. */
function splitValues(row) {
  const out = [];
  let inStr = false, buf = '', isStr = false;
  for (let i = 0; i < row.length; i += 1) {
    const ch = row[i];
    if (inStr) {
      if (ch === "'" && row[i + 1] === "'") { buf += "'"; i += 1; continue; }
      if (ch === "'") { inStr = false; continue; }
      buf += ch;
      continue;
    }
    // ⚠️ فاصله‌های قبل از نقلِ‌قول باید دور ریخته شوند، وگرنه مقدار
    //    `'  club_badge'` می‌شود و هیچ‌وقت با KINDS برابر نمی‌شود.
    //    این دقیقاً همان چیزی بود که `club_badge` را «صفر آیتم»
    //    نشان می‌داد در حالی که هر پنج ردیف درست پارس شده بودند.
    if (ch === "'") { inStr = true; isStr = true; buf = ''; continue; }
    if (ch === ',') { out.push(isStr ? buf : buf.trim()); buf = ''; isStr = false; continue; }
    buf += ch;
  }
  out.push(isStr ? buf : buf.trim());
  return out;
}

const catalogue = new Map();
// اسلاگ → کلیدی که واقعاً به کلاینت می‌رود (payload یا خودِ slug).
const renderKey = new Map();
// ⚠️ `VALUES` مرزِ درستی برای پایانِ فهرستِ ستون‌هاست، ولی پایانِ خودِ
//    دستور `;` نیست: بعضی INSERTها `ON CONFLICT (slug) DO NOTHING;`
//    دارند و اگر تا اولین `;` بخوانیم مشکلی نیست، اما فهرستِ ستون‌ها
//    نباید با `[^)]*` گرفته شود چون بعضی نام‌ها پرانتز ندارند ولی
//    خودِ الگو در اولین `)` می‌ایستد و بقیهٔ بلوک را می‌بلعد.
//    اینجا فهرستِ ستون‌ها تا `)` قبل از `VALUES` گرفته می‌شود.
for (const block of migrations.matchAll(
  /INSERT INTO shop_items\s*\(([\s\S]*?)\)\s*VALUES([\s\S]*?);/gi)) {
  const cols = block[1].split(',').map(c => c.trim().toLowerCase());
  const iSlug = cols.indexOf('slug');
  const iKind = cols.indexOf('kind');
  const iPayload = cols.indexOf('payload');
  if (iSlug < 0 || iKind < 0) continue;
  // ⚠️ `ON CONFLICT (slug) DO NOTHING` انتهای بعضی INSERTهاست و
  //    `(slug)`ِ آن یک «ردیفِ» قلابی می‌سازد که پارسر را می‌لغزاند.
  //    قبل از تفکیکِ ردیف‌ها بریده می‌شود.
  const valuesOnly = block[2].split(/\bON\s+CONFLICT\b/i)[0];
  for (const row of splitRows(valuesOnly)) {
    const vals = splitValues(row);
    const slug = vals[iSlug];
    const kind = vals[iKind];
    if (!KINDS.includes(kind) || !/^[a-z0-9_]+$/.test(slug || '')) continue;
    catalogue.set(slug, kind);
    // ── چرا payload و نه slug ──
    //
    // سرور `COALESCE(i.payload, i.slug)` را به کلاینت می‌دهد. یعنی
    // `frame_gold` روی سیم `gold` می‌شود و `color_gold` می‌شود
    // `#FFC53D`. جست‌وجوی slug در کدِ کلاینت جوابِ غلط می‌دهد.
    const payload = iPayload >= 0 ? vals[iPayload] : null;
    renderKey.set(slug,
      payload && payload !== 'NULL' && /^[a-z0-9_#]+$/i.test(payload) ? payload : slug);
  }
}

// ── حذف‌شده‌ها را باید کنار گذاشت ──
//
// مایگریشنِ ۰۲۵ پنج باشگاهِ ایرانی را با `DELETE` واقعی برداشت (نه
// `is_active=false`؛ دلیلش در خودِ آن فایل توضیح داده شده). ولی ردیفِ
// INSERTشان در مایگریشنِ ۰۲۰ سرِ جایش می‌ماند — تاریخچه بازنویسی
// نمی‌شود.
//
// نسخهٔ اولِ این تست همان پنج تا را «لوگو ندارند» گزارش کرد. مثبتِ
// کاذب بود: آیتم اصلاً وجود ندارد که لوگو بخواهد. راستی‌آزمایی روی
// دیتابیسِ زنده هم تأیید کرد که این پنج ردیف نیستند.
for (const del of migrations.matchAll(
  /DELETE FROM shop_items([\s\S]*?);/gi)) {
  const clause = del[1];
  // حذف بر اساسِ payload (الگوی مایگریشنِ ۰۲۵) یا بر اساسِ slug.
  for (const lst of clause.matchAll(/\b(payload|slug)\s+IN\s*\(([^)]*)\)/gi)) {
    const col = lst[1].toLowerCase();
    const values = [...lst[2].matchAll(/'([^']+)'/g)].map(v => v[1]);
    for (const [slug] of catalogue) {
      const key = col === 'slug' ? slug : renderKey.get(slug);
      if (values.includes(key)) { catalogue.delete(slug); renderKey.delete(slug); }
    }
  }
}

console.log('\n══ ۱. کاتالوگ از مایگریشن‌ها خوانده شد ══');
ck('حداقل ۶۰ آیتم پیدا شد', catalogue.size >= 60,
  `فقط ${catalogue.size} — الگوی INSERT عوض شده؟`);
const byKind = {};
for (const [, kind] of catalogue) byKind[kind] = (byKind[kind] || 0) + 1;
for (const kind of KINDS) {
  ck(`نوعِ «${kind}» آیتم دارد (${byKind[kind] || 0})`, (byKind[kind] || 0) > 0);
}

// ── منابعِ رندر ──
const webCosmetics = read(path.join(REPO, 'userweb/src/components/Cosmetics.jsx'));
const webMotion = read(path.join(REPO, 'userweb/src/components/cosmeticsMotion.css'));
const webStyle = read(path.join(REPO, 'userweb/src/style.css'));
const webEffect = read(path.join(REPO, 'userweb/src/components/MatchEffectVisual.jsx'));
const webAll = `${webCosmetics}\n${webMotion}\n${webStyle}\n${webEffect}`;

const dartPalette = read(path.join(REPO, 'mobile/lib/core/cosmetic_palette.dart'));
const dartCosmetics = read(path.join(REPO, 'mobile/lib/core/cosmetics.dart'));
const dartEffect = read(path.join(REPO, 'mobile/lib/widgets/match_effect_visual.dart'));
const dartMotion = read(path.join(REPO, 'mobile/lib/widgets/cosmetic_motion.dart'));
const dartAssets = read(path.join(REPO, 'mobile/lib/core/assets.dart'));
const dartAll = `${dartPalette}\n${dartCosmetics}\n${dartEffect}\n${dartMotion}\n${dartAssets}`;

/**
 * آیا اسلاگ در متنِ رندرکننده هست؟
 *
 * ⚠️ جست‌وجوی خامِ رشته کافی نیست: اسلاگِ `gold` زیررشتهٔ `gold_gradient`
 *    است و باعثِ مثبتِ کاذب می‌شود. مرزِ کلمه لازم است.
 */
const mentions = (haystack, slug) =>
  new RegExp(`[^a-z0-9_]${slug}[^a-z0-9_]`).test(haystack);

console.log('\n══ ۲. هر آیتمِ فروشگاه در **وب** رندرکننده دارد ══');
{
  const missing = [];
  for (const [slug, kind] of catalogue) {
    // نشانِ باشگاه با فایلِ تصویر رندر می‌شود نه با کلاس؛ جدا چک می‌شود.
    if (kind === 'club_badge') continue;
    // بستهٔ ایموت payload ندارد و متنِ ثابت است؛ رندرکنندهٔ اختصاصی ندارد.
    if (kind === 'emote_pack') continue;
    if (!mentions(webAll, renderKey.get(slug))) missing.push(`${kind}/${slug}`);
  }
  ck('هیچ آیتمی در وب بی‌رندرکننده نیست', missing.length === 0,
    missing.length ? `${missing.length} مورد: ${missing.slice(0, 8).join('، ')}` : '');
}

console.log('\n══ ۳. هر آیتمِ فروشگاه در **اندروید** رندرکننده دارد ══');
{
  const missing = [];
  for (const [slug, kind] of catalogue) {
    if (kind === 'club_badge' || kind === 'emote_pack') continue;
    if (!mentions(dartAll, renderKey.get(slug))) missing.push(`${kind}/${slug}`);
  }
  ck('هیچ آیتمی در اندروید بی‌رندرکننده نیست', missing.length === 0,
    missing.length ? `${missing.length} مورد: ${missing.slice(0, 8).join('، ')}` : '');
}

console.log('\n══ ۴. نشانِ باشگاه‌ها فایلِ تصویر دارد ══');
{
  // ⚠️ درخواستِ مکررِ مالک: «لوگوهای باشگاه دست نخورند».
  // اینجا فقط **وجود** چک می‌شود، محتوا دست نمی‌خورد.
  const missingWeb = [];
  const missingApp = [];
  for (const [slug, kind] of catalogue) {
    if (kind !== 'club_badge') continue;
    // ⚠️ فایل‌ها با نامِ کاملِ اسلاگ و پسوندِ .webp ذخیره شده‌اند
    //    (`club_barcelona.webp`)، نه با کلیدِ کوتاه‌شده و .png.
    //    نسخهٔ اولِ این تست هر ۱۶ باشگاه را «گمشده» گزارش کرد که
    //    مثبتِ کاذبِ محض بود.
    const webFile = path.join(REPO, 'userweb/public/shop', `${slug}.webp`);
    const appFile = path.join(REPO, 'mobile/assets/shop', `${slug}.webp`);
    if (!fs.existsSync(webFile)) missingWeb.push(slug);
    if (!fs.existsSync(appFile)) missingApp.push(slug);
  }
  ck('لوگوی همهٔ باشگاه‌ها در وب هست', missingWeb.length === 0, missingWeb.join('، '));
  ck('لوگوی همهٔ باشگاه‌ها در اندروید هست', missingApp.length === 0, missingApp.join('، '));
}

console.log('\n══ ۵. دو کلاینت دقیقاً یک مجموعه را می‌شناسند ══');
{
  // اگر یکی اسلاگی را بشناسد و دیگری نه، همان آیتم روی یک دستگاه کار
  // می‌کند و روی دیگری نه — و کاربر فکر می‌کند اپ خراب است.
  const webOnly = [];
  const appOnly = [];
  for (const [slug, kind] of catalogue) {
    if (kind === 'club_badge' || kind === 'emote_pack') continue;
    const w = mentions(webAll, renderKey.get(slug));
    const a = mentions(dartAll, renderKey.get(slug));
    if (w && !a) webOnly.push(slug);
    if (a && !w) appOnly.push(slug);
  }
  ck('آیتمی نیست که فقط در وب کار کند', webOnly.length === 0, webOnly.join('، '));
  ck('آیتمی نیست که فقط در اندروید کار کند', appOnly.length === 0, appOnly.join('، '));
}

console.log('\n══ ۶. افکتِ نبرد فازِ اجرا دارد ══');
{
  // یک افکت که در هیچ فازی (entry/finish) پشتیبانی نشود، خریداری
  // می‌شود ولی هرگز اجرا نمی‌شود.
  const effects = [...catalogue].filter(([, k]) => k === 'match_effect').map(([s]) => s);
  const noPhaseWeb = effects.filter(s => !mentions(webEffect, s));
  const noPhaseApp = effects.filter(s => !mentions(dartEffect, s));
  ck(`هر ${effects.length} افکت در وب نقاشی می‌شود`, noPhaseWeb.length === 0, noPhaseWeb.join('، '));
  ck(`هر ${effects.length} افکت در اندروید نقاشی می‌شود`, noPhaseApp.length === 0, noPhaseApp.join('، '));
}

console.log('\n══ ۷. قالبِ کارتِ نتیجه پالت دارد ══');
{
  const templates = [...catalogue].filter(([, k]) => k === 'result_template').map(([s]) => s);
  const missWeb = templates.filter(s => !mentions(webCosmetics, s));
  const missApp = templates.filter(s => !mentions(dartPalette, s));
  ck(`هر ${templates.length} قالب در وب پالت دارد`, missWeb.length === 0, missWeb.join('، '));
  ck(`هر ${templates.length} قالب در اندروید پالت دارد`, missApp.length === 0, missApp.join('، '));
}

console.log('\n══ ۸. رنگِ نام: هم گرادیان هم انیمیشن ══');
{
  const colors = [...catalogue].filter(([, k]) => k === 'name_color').map(([s]) => s);
  // رنگ‌های hex در payload ذخیره می‌شوند نه در slug؛ فقط اسلاگ‌های نام‌دار.
  const named = colors.filter(s => !s.startsWith('color_'));
  const missGradient = named.filter(s => !mentions(webCosmetics, s));
  ck(`هر ${named.length} رنگِ نام‌دار در NAME_GRADIENTS وب هست`,
    missGradient.length === 0, missGradient.join('، '));
  const missApp = named.filter(s => !mentions(dartPalette, s));
  ck(`هر ${named.length} رنگِ نام‌دار در پالتِ اندروید هست`,
    missApp.length === 0, missApp.join('، '));
}

console.log(`\n${failures.length ? '✗' : '✓'} ${pass} موفق، ${failures.length} ناموفق`);
if (failures.length) {
  console.log('\nشکست‌ها:');
  failures.forEach(f => console.log('  ·', f));
  process.exit(1);
}
// نگهبانِ خودِ نگهبان: «۰ ناموفق» نباید یعنی «چیزی سنجیده نشد».
if (pass < 15) {
  console.log(`\n✗ فقط ${pass} سنجه اجرا شد — کمتر از انتظار`);
  process.exit(1);
}
