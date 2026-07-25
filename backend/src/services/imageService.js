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

const isAnimated = (mimetype, file) =>
  /gif/i.test(mimetype || '') || /\.gif$/i.test(file || '');

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
      return { filename: file.filename, bytesBefore: before, bytesAfter: before };
    }

    fs.unlinkSync(original);
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

module.exports = { optimizeUpload, kb, MAX_DIMENSION };
