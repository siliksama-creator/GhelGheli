/**
 * نگهبانِ «سیگنال هست، ستون نیست».
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این فایل وجود دارد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * این باگ **دو بار** رخ داده و هر بار هفته‌ها بی‌سروصدا زنده مانده:
 *
 *   ۱. `texSig` به اثرانگشت اضافه شد، ستونش به دیتابیس نه.
 *   ۲. `texSig` در `rowToFp` خوانده نمی‌شد، پس `hasTex` همیشه false بود.
 *
 * در هر دو حالت هیچ خطایی رخ نمی‌داد. مقدار محاسبه می‌شد، دور ریخته
 * می‌شد، و موتور بی‌صدا به فرمولِ قدیمی برمی‌گشت — با آستانه‌هایی که
 * برای فرمولِ جدید کالیبره شده بودند. نتیجه‌اش امتیازهای ناسازگار بود:
 * یک کارت تأیید خودکار می‌گرفت و کارتِ دیگر با همان کیفیتِ عکس به صف
 * بررسی می‌رفت.
 *
 * تستِ واحدِ معمولی این را نمی‌گیرد چون هر تکه به‌تنهایی درست است. تنها
 * راهِ گرفتنش بررسیِ **اتصالِ بین لایه‌ها** است: هر کلیدی که
 * `fingerprint()` تولید می‌کند باید در مایگریشن، در `rowToFp`، و در
 * دستورهای `INSERT` حضور داشته باشد.
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
const routeSrc = fs.readFileSync(
  path.join(ROOT, 'src/routes/photoCards.js'), 'utf8');
const migrations = fs.readdirSync(path.join(ROOT, 'migrations'))
  .filter(f => f.endsWith('.sql'))
  .map(f => fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8'))
  .join('\n');

// نگاشتِ کلیدِ اثرانگشت → نامِ ستون در دو جدول.
//
// وقتی سیگنالِ تازه‌ای اضافه می‌شود، اینجا هم باید ثبت شود — و همان
// لحظه تست می‌گوید کدام لایه را فراموش کرده‌ای.
const SIGNALS = [
  { key: 'dhash', design: 'dhash', sub: 'img_dhash' },
  { key: 'phash', design: 'phash', sub: 'img_phash' },
  { key: 'colorSig', design: 'color_sig', sub: 'img_color' },
  { key: 'texSig', design: 'tex_sig', sub: 'img_tex' },
  { key: 'lumaSig', design: 'luma_sig', sub: 'img_luma' },
  { key: 'rgbSig', design: 'rgb_sig', sub: 'img_rgb' },
  { key: 'textTokens', design: 'text_tokens', sub: 'img_text' },
];

console.log('\n══ ۱. هر سیگنالِ اثرانگشت ستونِ خودش را دارد ══');
(async () => {
  const fp = require('../src/services/imageFingerprint');
  const sharp = require('sharp');

  // تصویرِ کوچکِ ساختگی — فقط برای دیدنِ شکلِ خروجی.
  const img = await sharp({
    create: { width: 64, height: 96, channels: 3,
      background: { r: 180, g: 40, b: 40 } },
  }).png().toBuffer();
  const f = await fp.fingerprint(img);

  for (const s of SIGNALS) {
    ck(`fingerprint() کلیدِ ${s.key} را تولید می‌کند`,
      f[s.key] !== undefined && f[s.key] !== null);
    ck(`ستونِ ${s.design} در مایگریشن‌ها هست`,
      migrations.includes(s.design), 'مایگریشن جا افتاده؟');
    ck(`ستونِ ${s.sub} در مایگریشن‌ها هست`,
      migrations.includes(s.sub), 'مایگریشن جا افتاده؟');
    ck(`rowToFp ستونِ ${s.design} را می‌خواند`,
      routeSrc.includes(`r.${s.design}`) || routeSrc.includes(`d.${s.design}`),
      'بدون این، سیگنال بی‌صدا نادیده گرفته می‌شود');
    ck(`INSERT پرونده ستونِ ${s.sub} را پر می‌کند`,
      routeSrc.includes(s.sub),
      'اثرانگشتِ کاربر ناقص ذخیره می‌شود');
  }

  console.log('\n══ ۲. سیگنال‌های خالی کرش نمی‌دهند ══');
  // اثرانگشتِ قدیمی که هنوز backfill نشده: باید بازگشتِ تدریجی کار کند.
  const old = { ...f, rgbSig: [], lumaSig: [], texSig: [] };
  const s1 = fp.similarity(f, old);
  ck('اثرانگشتِ ناقص عدد برمی‌گرداند نه NaN',
    Number.isFinite(s1), String(s1));
  ck('نمره در بازهٔ [۰,۱] می‌ماند', s1 >= 0 && s1 <= 1, String(s1));

  const empty = { dhash: Buffer.alloc(8), phash: Buffer.alloc(8),
    colorSig: [], texSig: [], lumaSig: [], rgbSig: [] };
  const s2 = fp.similarity(empty, empty);
  ck('اثرانگشتِ کاملاً خالی کرش نمی‌دهد', Number.isFinite(s2), String(s2));

  console.log('\n══ ۳. تصویرِ یکسان نمرهٔ کامل می‌گیرد ══');
  const same = fp.similarity(f, f);
  ck('شباهتِ یک تصویر با خودش ≈ ۱', same > 0.99, same.toFixed(4));

  console.log('\n══ ۴. رنگِ متفاوت واقعاً تشخیص داده می‌شود ══');
  // ── چرا این تست ارزش دارد ──
  //
  // باگی که `rgbSig` برای رفعش ساخته شد: دو کارت با قالبِ یکسان و
  // رنگِ پیراهنِ متفاوت نمرهٔ ۰.۶۵ می‌گرفتند. اگر روزی کسی وزنِ رنگ را
  // صفر کند، این تست قرمز می‌شود.
  const blue = await sharp({
    create: { width: 64, height: 96, channels: 3,
      background: { r: 40, g: 40, b: 180 } },
  }).png().toBuffer();
  const fb = await fp.fingerprint(blue);
  const cross = fp.similarity(f, fb);
  ck('قرمزِ یکدست و آبیِ یکدست از هم جدا می‌شوند',
    cross < 0.55, `نمره=${cross.toFixed(3)} (باید زیرِ آستانهٔ تأیید باشد)`);

  console.log('\n══ ۵. عکسی که کارت نیست تأیید نمی‌شود ══');
  // ── رگرسیونی که تستِ سرتاسری گرفت ──
  //
  // بعد از افزودنِ `rgbSig`، عکسِ یک کاغذِ راه‌راهِ سفید با گرادیانِ
  // نارنجی نمرهٔ ۰.۴۷۸ گرفت — بالای آستانهٔ ۰.۴۰ کدِ بی‌نام. یعنی کاربر
  // می‌توانست عکسِ دیوار بفرستد و کارت بگیرد.
  //
  // دو تصویرِ «تخت» هش‌های یکسان می‌دهند (هیچ لبه‌ای ندارند که تفاوت
  // بسازد) و با غیرفعال شدنِ رنگ، تمامِ وزن روی همان هش‌های بی‌معنی
  // می‌افتاد.
  const W = 300; const H = 300;
  const flat = Buffer.alloc(W * H * 3, 240);
  for (let y = 0; y < H; y += 20) {
    for (let k = 0; k < 6; k++) {
      for (let x = 0; x < W; x++) {
        const i = ((y + k) * W + x) * 3;
        if (i + 2 < flat.length) {
          flat[i] = 225; flat[i + 1] = 222; flat[i + 2] = 220;
        }
      }
    }
  }
  const paper = await fp.fingerprint(
    await sharp(flat, { raw: { width: W, height: H, channels: 3 } })
      .jpeg({ quality: 60 }).toBuffer());
  const orange = await fp.fingerprint(await sharp({
    create: { width: 420, height: 640, channels: 3,
      background: { r: 250, g: 180, b: 60 } },
  }).jpeg().toBuffer());

  const vsOrange = fp.similarity(paper, orange);
  const vsRed = fp.similarity(paper, f);
  ck('کاغذِ راه‌راه با گرادیانِ نارنجی تأیید نمی‌شود',
    vsOrange < 0.40, `نمره=${vsOrange.toFixed(3)} (آستانهٔ بی‌نام ۰.۴۰)`);
  ck('کاغذِ راه‌راه با کارتِ رنگی تأیید نمی‌شود',
    vsRed < 0.40, `نمره=${vsRed.toFixed(3)}`);

  console.log('\n══ ۶. تطبیقِ متنی ══');
  // ── چرا این تست‌ها ──
  //
  // OCR سیگنالی است که می‌تواند بی‌صدا از کار بیفتد: اگر tesseract نصب
  // نباشد، اگر پیش‌پردازش عوض شود، یا اگر ستونِ دیتابیس جا بیفتد.
  // در همهٔ این حالات هیچ خطایی رخ نمی‌دهد و موتور فقط کمی بدتر کار
  // می‌کند — بدترین نوعِ خرابی.
  const t1 = fp.textSimilarity(['DEMBELE', 'FRANCE'], ['DEMBELE', 'WORLDCUP']);
  ck('توکنِ یکسان شباهت می‌دهد', t1 !== null && t1 > 0,
    String(t1));
  const t2 = fp.textSimilarity(['EMBELE'], ['DEMBELE']);
  ck('حرفِ اولِ گم‌شده تحمل می‌شود (EMBELE ≈ DEMBELE)', t2 === 1,
    `${t2} — حرفِ اول اغلب در لبهٔ برش گم می‌شود`);
  const t3 = fp.textSimilarity(['HAKIMI', 'MOROCCO'], ['DEMBELE', 'FRANCE']);
  ck('دو نامِ متفاوت شباهتِ صفر می‌دهند', t3 === 0, String(t3));
  ck('نبودِ متن null می‌دهد نه صفر',
    fp.textSimilarity([], ['DEMBELE']) === null,
    '«نخواندم» با «خواندم و فرق داشت» یکی نیست');

  // متن نباید بتواند تطبیقِ ضعیف را نجات دهد و نه تطبیقِ قوی را بکشد.
  const strong = { ...f, textTokens: ['DEMBELE'] };
  const weak = { ...fb, textTokens: ['DEMBELE'] };
  const cSame = fp.combinedSimilarity(strong, { ...f, textTokens: ['DEMBELE'] });
  ck('متنِ هم‌خوان تطبیقِ درست را خراب نمی‌کند', cSame > 0.9,
    cSame.toFixed(3));
  const cCross = fp.combinedSimilarity(strong, weak);
  ck('متنِ مشترک به‌تنهایی دو کارتِ متفاوت را تأیید نمی‌کند',
    cCross < 0.55, `نمره=${cCross.toFixed(3)}`);

  console.log(`\n${fail ? '✗' : '✓'} ${pass} موفق، ${fail} ناموفق\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('✗ استثنا:', e);
  process.exit(1);
});
