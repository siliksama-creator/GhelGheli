#!/usr/bin/env node
// نسخه‌های ۳۲۰/۴۸۰ تمام تصاویر موجود را پیش‌ساخت می‌کند.
//
// فقط فایلِ گمشده ساخته می‌شود؛ اجرای دوباره idempotent است. این اسکریپت
// در deploy اجرا می‌شود تا تصاویر قدیمی هم مثل uploadهای تازه هیچ‌وقت
// هزینهٔ sharp را به اولین کاربر تحمیل نکنند.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  prewarmThumbnailVariants,
  CARD_THUMB_WIDTHS,
} = require('../src/services/imageService');

const imageDir = path.join(__dirname, '..', 'uploads', 'images');
const thumbDir = path.join(__dirname, '..', 'uploads', '.thumbs');
const concurrency = 3;

async function main() {
  if (!fs.existsSync(imageDir)) {
    console.log('[thumb-prewarm] uploads/images وجود ندارد؛ کاری نیست');
    return;
  }
  fs.mkdirSync(thumbDir, { recursive: true });
  const files = fs.readdirSync(imageDir)
    .filter(name => /^[A-Za-z0-9._-]+$/.test(name))
    .filter(name => fs.statSync(path.join(imageDir, name)).isFile());
  let next = 0;
  let processed = 0;
  let alreadyWarm = 0;

  async function worker() {
    while (next < files.length) {
      const name = files[next++];
      const warm = CARD_THUMB_WIDTHS.every(width => {
        const f = path.join(thumbDir, `${width}-${name}.webp`);
        return fs.existsSync(f) && fs.statSync(f).size > 0;
      });
      if (warm) {
        alreadyWarm += 1;
        continue;
      }
      await prewarmThumbnailVariants(path.join(imageDir, name), name);
      processed += 1;
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(`[thumb-prewarm] ${processed} تصویر ساخته شد؛ ${alreadyWarm} تصویر از قبل گرم بود`);
}

main().catch(error => {
  console.error('[thumb-prewarm] failed:', error);
  process.exit(1);
});
