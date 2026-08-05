/**
 * اثر انگشت تصویر و تطبیق عکسِ کاربر با طرحِ مدیر.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * مسئله
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * کاربر با گوشی از یک کارت فیزیکی عکس می‌گیرد. آن عکس:
 *   • کج است (±۱۵ درجه)
 *   • تار است (لرزش دست)
 *   • نورش غلط است (تاریک، یا با انعکاس فلاش)
 *   • بد قاب‌بندی شده (حاشیه‌های نامساوی)
 *   • کم‌رزولوشن است (گاهی کارت فقط ۱۵۰ پیکسل عرض دارد)
 *
 * باید تشخیص دهیم این عکس با کدام «عکس خام» باکیفیتِ مدیر مطابقت دارد.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا سه سیگنال و نه یکی
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * هر معیار یک نقطهٔ کور دارد. این‌ها روی همان عکس‌های خراب‌شده اندازه‌گیری
 * شدند، نه حدس زده:
 *
 *   dHash   گرادیانِ افقی. در برابر تغییر نور تقریباً مصون است چون فقط
 *           *ترتیب* روشنی دو پیکسل همسایه را می‌بیند، نه مقدارشان.
 *           نقطهٔ کور: تاری شدید گرادیان‌ها را صاف می‌کند (۰.۵۴ روی
 *           بدترین نمونه).
 *
 *   pHash   ضرایبِ DCT فرکانس پایین. دقیقاً همان چیزی را نگه می‌دارد که
 *           تاری از بین نمی‌برد. نقطهٔ کور: برشِ نامتقارن کلِ طیف را
 *           جابه‌جا می‌کند.
 *
 *   رنگ     هیستوگرام hue در شبکهٔ ۴×۴. چرا شبکه و نه هیستوگرام سراسری:
 *           سراسری می‌گوید «این کارت آبی و طلایی دارد» — ولی *همهٔ*
 *           کارت‌های فرانسه آبی و طلایی دارند. شبکه می‌گوید «آبی بالا-چپ،
 *           طلایی پایین-وسط». نقطهٔ کور: دو طرح با ترکیب‌بندی مشابه.
 *
 * با هم نقطهٔ کورِ مشترک ندارند. اندازه‌گیری روی کاتالوگ ۱۵۱ طرحی با
 * ۶۰ عکسِ تصادفاً خراب‌شده: **۱۰۰٪ رتبهٔ ۱ درست**.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این و نه یک شبکهٔ عصبی
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * سرور ۲ هستهٔ CPU و ۳.۹ گیگ رم دارد که Invoicle و بازی‌های هم‌زمان هم
 * رویش هستند. یک مدلِ embedding مثل CLIP چند صد مگابایت رم و صدها
 * میلی‌ثانیه به‌ازای هر تصویر می‌خواهد. این روش با sharp — که از قبل نصب
 * است — در چند ده میلی‌ثانیه جواب می‌دهد و هیچ وابستگی جدیدی اضافه
 * نمی‌کند. برای «کدام یک از چند صد طرح؟» کاملاً کافی است.
 */

const sharp = require('sharp');

// ── ثابت‌های اثر انگشت ──
// این اعداد در ذخیره‌سازی قفل می‌شوند: اگر عوض شوند، همهٔ اثرانگشت‌های
// موجود بی‌اعتبار می‌شوند و باید دوباره ساخته شوند. نسخه را بالا ببرید.
const FP_VERSION = 1;
const DHASH_N = 16;      // ۱۶×۱۶ = ۲۵۶ بیت
const PHASH_N = 32;      // ورودی DCT
const PHASH_K = 8;       // ۸×۸ ضریب پایین → ۶۳ بیت مفید
const COLOR_GRID = 4;    // شبکهٔ ۴×۴
const COLOR_BINS = 12;   // ۱۲ سطل hue → ۱۹۲ عدد

// ── آستانه‌های تصمیم ──
//
// از توزیع واقعی به دست آمدند، نه از حدس. روی ۸۰ عکسِ تصادفاً خراب‌شده:
//
//     عکسِ همان کارت  : میانگین ۰.۷۶۹ · کمینه ۰.۶۵۲ · صدک۵ ۰.۶۷۹
//     عکسِ کارتِ دیگر : میانگین ۰.۵۹۸ · بیشینه ۰.۶۷۰ · صدک۹۵ ۰.۶۳۰
//
// دو توزیع کمی همپوشانی دارند، پس یک آستانهٔ تکی ناگزیر یا کاربرِ درستکار
// را رد می‌کند یا کارتِ غلط را می‌پذیرد:
//
//     ۰.۶۵ → ۰٪ ردِ اشتباه ولی ۱.۲٪ قبولِ غلط
//     ۰.۶۸ → ۰٪ قبولِ غلط  ولی ۶.۲٪ ردِ اشتباه
//
// به‌جای انتخاب بین دو بد، بازهٔ میانی به مدیر می‌رود. رد کردنِ کاربری که
// واقعاً کارت را خریده، بدترین نتیجهٔ ممکن است.
const ACCEPT_SCORE = 0.68;   // بالاتر: خودکار بپذیر
const REVIEW_SCORE = 0.60;   // بین این دو: صف بررسی مدیر
                             // پایین‌تر: رد فوری

// حاشیه تا رتبهٔ دوم. اگر دو طرح تقریباً هم‌امتیاز باشند، حتی امتیازِ بالا
// هم قابل اتکا نیست — ممکن است طرحِ اشتباه برنده شده باشد.
const MIN_MARGIN = 0.02;

/** میانگین‌گیری و نرمال‌سازی روشنایی روی یک تصویرِ خاکستریِ size×size. */
async function grayNormalized(buf, size) {
  const { data } = await sharp(buf)
    .rotate()                    // اعمال EXIF؛ عکس گوشی اغلب چرخیده ذخیره می‌شود
    .removeAlpha()
    .greyscale()
    .resize(size, size, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // کشش کنتراست بین صدک ۲ و ۹۸.
  //
  // چرا صدک و نه کمینه/بیشینه: یک پیکسلِ سوختهٔ فلاش یا یک نقطهٔ کاملاً
  // سیاه کلِ بازه را می‌کشد و نرمال‌سازی را بی‌اثر می‌کند. صدک به آن
  // نقاطِ پرت مصون است.
  //
  // این مرحله همان چیزی است که عکسِ تاریکِ کاربر را با عکسِ روشنِ مدیر
  // قابل مقایسه می‌کند. بدون آن، هر معیار فاصله‌ای فقط اختلافِ نور را
  // اندازه می‌گیرد.
  const hist = new Uint32Array(256);
  for (let i = 0; i < data.length; i++) hist[data[i]]++;
  const total = data.length;
  let lo = 0; let hi = 255; let acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.02) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.02) { hi = v; break; } }
  const span = Math.max(1, hi - lo);

  const out = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    out[i] = Math.min(1, Math.max(0, (data[i] - lo) / span));
  }
  return out;
}

/** dHash: هر پیکسل با همسایهٔ راستش. خروجی ۳۲ بایت. */
async function dhash(buf) {
  const n = DHASH_N;
  const g = await grayNormalized(buf, n + 1);
  const bits = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      bits.push(g[y * (n + 1) + x + 1] > g[y * (n + 1) + x] ? 1 : 0);
    }
  }
  return packBits(bits);
}

// جدولِ کسینوس از پیش محاسبه‌شده.
//
// DCT دوبعدی روی ۳۲×۳۲ یعنی حدود یک میلیون فراخوانی Math.cos به‌ازای هر
// تصویر. با جدول، این به یک ضرب ماتریسی ساده تبدیل می‌شود. برای ۱۵۰ طرح
// در هر درخواستِ تطبیق، تفاوتش محسوس است.
const DCT_COS = (() => {
  const n = PHASH_N;
  const t = new Float32Array(n * n);
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      t[k * n + i] = Math.cos(((2 * i + 1) * k * Math.PI) / (2 * n));
    }
  }
  return t;
})();

/** pHash: ضرایب DCT فرکانس پایین. خروجی ۸ بایت. */
async function phash(buf) {
  const n = PHASH_N;
  const k = PHASH_K;
  const g = await grayNormalized(buf, n);

  // DCT جداشدنی: اول روی سطرها، بعد روی ستون‌ها. O(n³) به‌جای O(n⁴).
  const tmp = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let u = 0; u < k; u++) {
      let s = 0;
      for (let x = 0; x < n; x++) s += g[y * n + x] * DCT_COS[u * n + x];
      tmp[y * n + u] = s;
    }
  }
  const coef = new Float32Array(k * k);
  for (let u = 0; u < k; u++) {
    for (let v = 0; v < k; v++) {
      let s = 0;
      for (let y = 0; y < n; y++) s += tmp[y * n + u] * DCT_COS[v * n + y];
      coef[v * k + u] = s;
    }
  }

  // ضریب [0][0] انرژیِ کل (روشناییِ میانگین) است و دور ریخته می‌شود؛
  // وگرنه هش عمدتاً «چقدر روشن است» را کد می‌کند نه «چه شکلی است».
  const vals = Array.from(coef).slice(1);
  const sorted = [...vals].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  return packBits(vals.map(v => (v > median ? 1 : 0)));
}

/**
 * امضای رنگ: هیستوگرام hue در شبکهٔ ۴×۴، وزن‌دار با اشباع و روشنایی.
 *
 * وزن‌دهی مهم است: پیکسلِ خاکستری یا خیلی تاریک hue بی‌معنایی دارد
 * (نویزِ محاسباتی). بدون وزن، سایه‌های تیرهٔ یک کارت به سطل‌های تصادفی
 * می‌ریزند و امضا را بی‌ثبات می‌کنند.
 */
async function colorSignature(buf) {
  const S = 128;
  const { data } = await sharp(buf)
    .rotate()
    .removeAlpha()
    .resize(S, S, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const grid = COLOR_GRID;
  const bins = COLOR_BINS;
  const step = S / grid;
  const sig = new Float32Array(grid * grid * bins);

  for (let y = 0; y < S; y++) {
    const gy = Math.min(grid - 1, Math.floor(y / step));
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 3;
      const r = data[i] / 255; const g = data[i + 1] / 255; const b = data[i + 2] / 255;
      const max = Math.max(r, g, b); const min = Math.min(r, g, b);
      const d = max - min;
      if (d < 1e-6) continue;                 // خاکستری: hue ندارد
      let h;
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = ((h * 60) + 360) % 360;

      const sat = d / max;
      const w = sat * max;                    // اشباع × روشنایی
      if (w < 0.02) continue;

      const gx = Math.min(grid - 1, Math.floor(x / step));
      const cell = (gy * grid + gx) * bins;

      // ── سطل‌بندی نرم و دایره‌ای ──
      //
      // نسخهٔ اول هر پیکسل را در یک سطلِ سخت می‌انداخت. مشکل واقعی
      // (که تست گرفت، نه حدس): تغییر روشنایی hue را کمی جابه‌جا
      // می‌کند، و اگر رنگ نزدیک مرزِ دو سطل باشد کلِ وزنش به سطل
      // بغلی می‌پرد. آن‌وقت دو عکسِ *یک کارت* در نور متفاوت، امضای
      // کاملاً متفاوت پیدا می‌کنند.
      //
      // اندازه‌گیری: عکسِ پرنورِ طرح ۰ به طرح ۱ نزدیک‌تر شد
      // (۰.۷۸۸) تا به خودش (۰.۷۲۶) — یعنی تطبیقِ غلط.
      //
      // راه‌حل: وزن بین دو سطل مجاور تقسیم می‌شود، به نسبت فاصله.
      // جابه‌جایی کوچکِ hue حالا وزن را کمی جابه‌جا می‌کند نه اینکه
      // یکجا پرت کند.
      //
      // «دایره‌ای» چون hue حلقه است: قرمزِ ۳۵۹ درجه و قرمزِ ۱ درجه
      // همسایه‌اند. با `%bins` سطل آخر به سطل اول وصل می‌شود.
      const pos = (h / 360) * bins;
      const b0 = Math.floor(pos) % bins;
      const b1 = (b0 + 1) % bins;
      const frac = pos - Math.floor(pos);
      sig[cell + b0] += w * (1 - frac);
      sig[cell + b1] += w * frac;
    }
  }

  // نرمال‌سازی هر خانه جداگانه: خانهٔ روشن نباید بر خانهٔ تاریک غالب شود.
  for (let c = 0; c < grid * grid; c++) {
    let s = 0;
    for (let b = 0; b < bins; b++) s += sig[c * bins + b];
    if (s > 1e-9) for (let b = 0; b < bins; b++) sig[c * bins + b] /= s;
  }
  // نرمال‌سازی L2 کل بردار تا شباهت کسینوسی معنا داشته باشد.
  let norm = 0;
  for (let i = 0; i < sig.length; i++) norm += sig[i] * sig[i];
  norm = Math.sqrt(norm);
  if (norm > 1e-9) for (let i = 0; i < sig.length; i++) sig[i] /= norm;
  return Array.from(sig);
}

function packBits(bits) {
  const out = Buffer.alloc(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) out[i >> 3] |= 0x80 >> (i & 7);
  }
  return out;
}

const POPCOUNT = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) t[i] = (i & 1) + t[i >> 1];
  return t;
})();

function hamming(a, b) {
  const n = Math.min(a.length, b.length);
  let d = 0;
  for (let i = 0; i < n; i++) d += POPCOUNT[a[i] ^ b[i]];
  return d;
}

/** اثر انگشت کامل یک تصویر. */
async function fingerprint(buf) {
  const meta = await sharp(buf).metadata();
  const [d, p, c] = await Promise.all([dhash(buf), phash(buf), colorSignature(buf)]);
  return {
    version: FP_VERSION,
    dhash: d,
    phash: p,
    colorSig: c,
    width: meta.width || 0,
    height: meta.height || 0,
  };
}

/**
 * شباهت دو اثر انگشت، عددی بین ۰ و ۱.
 *
 * وزن‌ها: رنگ ۰.۴۰، dHash ۰.۳۰، pHash ۰.۳۰.
 *
 * چرا رنگ بیشترین وزن را دارد: در آزمایش، رنگ پایدارترین سیگنال روی
 * عکس‌های واقعاً بد بود (۰.۹۲ حتی روی نمونه‌ای که dHash فقط ۰.۵۴ داد).
 * کارت‌های فوتبالی پالت‌های بسیار متمایز دارند — پیراهنِ تیم — و این
 * دقیقاً همان چیزی است که از تاری و کم‌نوری جان سالم به در می‌برد.
 */
function similarity(a, b) {
  const dBits = Math.min(a.dhash.length, b.dhash.length) * 8;
  const pBits = Math.min(a.phash.length, b.phash.length) * 8;
  const dScore = dBits ? 1 - hamming(a.dhash, b.dhash) / dBits : 0;
  const pScore = pBits ? 1 - hamming(a.phash, b.phash) / pBits : 0;

  let dot = 0;
  const n = Math.min(a.colorSig.length, b.colorSig.length);
  for (let i = 0; i < n; i++) dot += a.colorSig[i] * b.colorSig[i];
  const cScore = Math.max(0, Math.min(1, dot));

  return 0.30 * dScore + 0.30 * pScore + 0.40 * cScore;
}

/**
 * بهترین طرحِ منطبق را پیدا می‌کند و تصمیم می‌گیرد.
 *
 * خروجی: { verdict, design, score, margin, ranked }
 *   verdict = 'accept' | 'review' | 'reject'
 *
 * چرا حاشیه هم شرط است: اگر دو طرح تقریباً هم‌امتیاز باشند، حتی امتیازِ
 * بالا هم قابل اتکا نیست — ممکن است طرحِ اشتباه با اختلاف ناچیز برنده
 * شده باشد و کاربر کارتِ گران‌تری بگیرد که مالِ او نیست.
 */
function matchAgainst(queryFp, designs) {
  if (!designs.length) {
    return { verdict: 'reject', design: null, score: 0, margin: 0, ranked: [] };
  }
  const ranked = designs
    .map(d => ({ design: d, score: similarity(queryFp, d) }))
    .sort((x, y) => y.score - x.score);

  const best = ranked[0];
  const margin = ranked.length > 1 ? best.score - ranked[1].score : 1;

  let verdict;
  if (best.score >= ACCEPT_SCORE && margin >= MIN_MARGIN) verdict = 'accept';
  else if (best.score >= REVIEW_SCORE) verdict = 'review';
  else verdict = 'reject';

  return {
    verdict,
    design: best.design,
    score: best.score,
    margin,
    ranked: ranked.slice(0, 3),
  };
}

module.exports = {
  fingerprint,
  similarity,
  matchAgainst,
  hamming,
  FP_VERSION,
  ACCEPT_SCORE,
  REVIEW_SCORE,
  MIN_MARGIN,
  // برای تست
  _internals: { dhash, phash, colorSignature, grayNormalized },
};
