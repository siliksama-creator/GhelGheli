// Automatic image optimisation for every upload.
//
// Phone cameras produce 3-8 MB JPEGs at 4000px wide. Storing those verbatim
// wasted VPS disk and — much worse — made every user who later views the
// image download megabytes over mobile data. This re-encodes uploads to a
// sane resolution and quality: visually near-identical, typically 85-95%
// smaller.
//
// Deliberately conservative:
//   * only downscales, never upscales a small image
//   * keeps the original if optimisation somehow produces a BIGGER file
//   * animated GIFs are passed through untouched (re-encoding kills them)
//   * any failure falls back to the original file rather than losing the
//     upload — a slow/large image beats a broken one.
const fs = require('fs');
const path = require('path');

let sharp = null;
try {
  sharp = require('sharp');
} catch {
  console.warn('[images] sharp unavailable — uploads will be stored as-is');
}

// 1600px is plenty for a full-screen view on any phone (typical device is
// 1080px wide) while cutting a 4000px camera shot to a fraction of its size.
const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 82;
const CARD_THUMB_WIDTHS = [320, 480];

/**
 * نسخه‌های پرمصرف کارت را همان لحظهٔ upload می‌سازد.
 *
 * قبلاً اولین کاربری که کارت را می‌دید باید هزینهٔ sharp را می‌داد. در
 * لاگ واقعی ده thumbnail هم‌زمان هرکدام حدود یک ثانیه طول کشیدند؛ بعد از
 * ساخته‌شدن همان درخواست زیر ۱ms بود. انتقال این هزینه به upload یعنی
 * انیمیشن/اینونتوری هیچ‌وقت منتظر ساخت تصویر نمی‌ماند.
 */
async function prewarmThumbnailVariants(sourcePath, filename) {
  if (!sharp || !sourcePath || !filename || !fs.existsSync(sourcePath)) return;
  const imageDir = path.dirname(sourcePath);
  const thumbDir = path.join(imageDir, '..', '.thumbs');
  fs.mkdirSync(thumbDir, { recursive: true });
  await Promise.all(CARD_THUMB_WIDTHS.map(async (width) => {
    const out = path.join(thumbDir, `${width}-${filename}.webp`);
    if (fs.existsSync(out) && fs.statSync(out).size > 0) return;
    const tmp = `${out}.${process.pid}-${Math.random().toString(36).slice(2)}.tmp`;
    try {
      await sharp(sourcePath, { failOn: 'none' })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(tmp);
      // اگر درخواست هم‌زمان route زودتر فایل را ساخت، خروجی او معتبر است.
      if (fs.existsSync(out)) fs.unlinkSync(tmp);
      else fs.renameSync(tmp, out);
    } catch (error) {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {/* ignore */}
      console.warn(`[thumb] prewarm ${width}px failed:`, error.message);
    }
  }));
}

const isAnimated = (mimetype, file) =>
  /gif/i.test(mimetype || '') || /\.gif$/i.test(file || '');

// فرمت‌هایی که sharp از آنها metadata می‌خواند و ما در آپلود می‌پذیریم.
// `jpeg` همان jpg است — نامی که libvips گزارش می‌کند.
const DECODE_FORMATS = new Set(['png', 'jpeg', 'webp', 'gif']);
// پسوندهای مجاز — همین RE در server.js هم برای فیلترِ multer استفاده می‌شود.
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif)$/i;

/**
 * راستی‌آزماییِ محتوای واقعیِ فایلِ تازه‌آپلودشده با sharp.
 *
 * فیلترِ multer فقط سراغِ «اعلامِ» فرستنده می‌رود (mimetype و پسوندِ نامِ
 * فایل) — هر دو سمتِ کلاینت‌اند و جعلشان هزینه‌ای ندارد. این تابع بعد از
 * نوشتنِ فایل روی دیسک، خودِ بایت‌ها را decode می‌کند؛ اگر sharp نتواند
 * تصویر بخواند یا فرمتش جزو فرمت‌های مجاز نباشد، فایل همان‌جا حذف و خطای
 * ۴۰۰ پرتاب می‌شود.
 *
 * چرا «حذف + ردِ صریح» و نه «نگه‌داشتنِ اصل» مثلِ fallbackِ optimizeUpload:
 * آن رفتار برای تصویرِ خرابِ واقعی درست است (عکسِ کند بهتر از عکسِ گم‌شده
 * است) ولی برای محتوای غیرتصویریِ جایگزین‌شده یعنی «ذخیرهٔ مطمئنِ فایلِ
 * حمله» — و با پسوندهای تازه‌فیلترشده دیگر نباید پیش بیاید. این تابع
 * تورِ آخر است: حتی اگر فایلی از فیلتر رد شود، تا decode نشود سرو نمی‌شود.
 *
 * باید بعد از multer و قبل از optimizeUpload صدا زده شود.
 */
async function verifyUpload(file) {
  if (!file || !file.path) return;
  // sharp جزو dependencies است؛ نبودنش فقط در محیطِ ناقصِ dev ممکن است.
  // در آن حالت به فیلترِ mimetype/پسوندِ multer اکتفا می‌کنیم.
  if (!sharp) return;
  let format = null;
  try {
    const meta = await sharp(file.path, { failOn: 'none' }).metadata();
    format = meta && meta.format;
  } catch {
    format = null;
  }
  if (!format || !DECODE_FORMATS.has(format)) {
    try { fs.unlinkSync(file.path); } catch { /* قبلاً حذف شده — اشکالی ندارد */ }
    throw Object.assign(new Error('فایل تصویری معتبر نیست'), { status: 400 });
  }
}

/**
 * Optimises a freshly uploaded file in place.
 *
 * @returns {Promise<{filename: string, bytesBefore: number, bytesAfter: number}>}
 *          The filename to store (may differ if the extension changed).
 */
async function optimizeUpload(file) {
  const original = file.path;
  const before = fs.statSync(original).size;

  if (!sharp || isAnimated(file.mimetype, file.originalname)) {
    return { filename: file.filename, bytesBefore: before, bytesAfter: before };
  }

  // WebP beats JPEG/PNG at the same perceived quality and every browser and
  // Android version we support decodes it.
  const outName = `${path.parse(file.filename).name}.webp`;
  const outPath = path.join(path.dirname(original), outName);

  try {
    await sharp(original, { failOn: 'none' })
      .rotate() // honour EXIF orientation, otherwise phone photos come out sideways
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toFile(outPath);

    const after = fs.statSync(outPath).size;

    // Tiny icons/screenshots can already be smaller than our re-encode.
    if (after >= before) {
      fs.unlinkSync(outPath);
      await prewarmThumbnailVariants(original, file.filename);
      return { filename: file.filename, bytesBefore: before, bytesAfter: before };
    }

    fs.unlinkSync(original);
    await prewarmThumbnailVariants(outPath, outName);
    return { filename: outName, bytesBefore: before, bytesAfter: after };
  } catch (err) {
    console.error('[images] optimisation failed, keeping original:', err.message);
    try {
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    } catch {/* ignore */}
    return { filename: file.filename, bytesBefore: before, bytesAfter: before };
  }
}

const kb = n => `${Math.round(n / 1024)}KB`;

module.exports = {
  optimizeUpload,
  verifyUpload,
  prewarmThumbnailVariants,
  CARD_THUMB_WIDTHS,
  kb,
  MAX_DIMENSION,
  IMAGE_EXT_RE,
};
