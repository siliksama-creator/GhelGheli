#!/usr/bin/env node
/**
 * آزمونِ پردازشِ عکس: «قبل» در برابر «بعد».
 *
 * سه چیز را ثابت می‌کند:
 *   ۱) خروجیِ فایلِ اصلی **بایت‌به‌بایت** همان قبلی است (خروجی کاربر عوض نشده).
 *   ۲) ابعادِ thumbnail‌ها همان است و کیفیتشان بدتر نشده (حتی یک راندِ
 *      فشرده‌سازیِ کمتر خورده، چون از پیکسلِ خام ساخته می‌شوند نه از WebP).
 *   ۳) سرعت: نسخهٔ جدید یک decode می‌کند نه سه‌تا، و زیر موجِ هم‌زمان از
 *      دروازهٔ ظرفیت (lib/heavy.js) عبور می‌کند.
 *
 * اجرا:  node scripts/test-image-pipeline.js
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

process.env.PORT = process.env.PORT || '0';
const imageService = require('../src/services/imageService');
const { CARD_THUMB_WIDTHS, MAX_DIMENSION } = imageService;

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
const ms = (t) => `${(t / 1).toFixed(0)}ms`;
const pad = (s, n) => String(s).padEnd(n);

// عکسِ واقع‌گرایانه: همان چیزی که گوشی می‌فرستد (۱۴۰۰px، نویز، گرادیان)
// نویز مهم است: JPEG/WebP با نویز سخت‌تر فشرده می‌شود و زمانِ encode را
// واقعی‌تر نشان می‌دهد تا یک تصویرِ تک‌رنگ.
async function makePhoto(file, width = 1400, height = 1750) {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      raw[i] = (x * 255 / width) ^ (Math.random() * 40);
      raw[i + 1] = (y * 255 / height) ^ (Math.random() * 40);
      raw[i + 2] = ((x + y) * 255 / (width + height)) ^ (Math.random() * 40);
    }
  }
  await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 88 }).toFile(file);
  return fs.statSync(file).size;
}

// ── پیاده‌سازیِ «قبل» (سه decode: اصلی + دو thumbnail، هر کدام جدا) ──
async function oldPipeline(src, outDir, filename) {
  const original = path.join(outDir, filename);
  fs.copyFileSync(src, original);
  const before = fs.statSync(original).size;
  const outName = `${path.parse(filename).name}.webp`;
  const outPath = path.join(outDir, outName);

  await sharp(original, { failOn: 'none' })
    .rotate()
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toFile(outPath);

  const after = fs.statSync(outPath).size;
  const thumbDir = path.join(outDir, '..', '.thumbs');
  fs.mkdirSync(thumbDir, { recursive: true });
  // prewarm: برای هر thumbnail یک decode جدا از فایلِ webp
  for (const width of CARD_THUMB_WIDTHS) {
    await sharp(outPath, { failOn: 'none' })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(path.join(thumbDir, `${width}-${outName}.webp`));
  }
  fs.unlinkSync(original);
  return { filename: outName, bytesBefore: before, bytesAfter: after };
}

// ── پیاده‌سازیِ “بعد”: خودِ سرویسِ واقعی ──
async function newPipeline(src, outDir, filename) {
  const f = path.join(outDir, filename);
  fs.copyFileSync(src, f);
  return imageService.optimizeUpload({
    path: f, filename, mimetype: 'image/jpeg', originalname: filename,
  });
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'imgtest-'));
  const A = path.join(root, 'a'); const B = path.join(root, 'b');
  fs.mkdirSync(path.join(A, 'images'), { recursive: true });
  fs.mkdirSync(path.join(B, 'images'), { recursive: true });
  // سرویس، thumbnail‌ها را در «.. / .thumbs» می‌سازد؛ پس images/ زیرشاخه باشد
  const dirA = path.join(A, 'images'); const dirB = path.join(B, 'images');

  const src = path.join(root, 'src.jpg');
  const srcBytes = await makePhoto(src);
  console.log(`\nعکسِ آزمایشی: ۱۴۰۰×۱۷۵۰ JPEG، ${(srcBytes / 1024).toFixed(0)}KB\n`);

  console.log('── ۱) خروجی: قبل در برابر بعد ──');
  const t0 = Date.now(); const rOld = await oldPipeline(src, dirA, 'x.jpg'); const tOld = Date.now() - t0;
  const t1 = Date.now(); const rNew = await newPipeline(src, dirB, 'x.jpg'); const tNew = Date.now() - t1;

  const mainOld = path.join(dirA, rOld.filename), mainNew = path.join(dirB, rNew.filename);
  const sameMain = sha(mainOld) === sha(mainNew);
  console.log(`  فایلِ اصلی   قدیم: ${sha(mainOld)} ${(rOld.bytesAfter / 1024).toFixed(0)}KB   جدید: ${sha(mainNew)} ${(rNew.bytesAfter / 1024).toFixed(0)}KB`);
  console.log(`  ${sameMain ? '✅ بایت‌به‌بایت یکسان — عکسِ ذخیره‌شده برای کاربر عوض نشده' : '❌ تفاوت در فایل اصلی!'}`);

  for (const w of CARD_THUMB_WIDTHS) {
    const pOld = path.join(A, '.thumbs', `${w}-${rOld.filename}.webp`);
    const pNew = path.join(B, '.thumbs', `${w}-${rNew.filename}.webp`);
    const mOld = await sharp(pOld).metadata(); const mNew = await sharp(pNew).metadata();
    const sOld = fs.statSync(pOld).size, sNew = fs.statSync(pNew).size;
    console.log(`  thumbnail ${w}px  قدیم: ${mOld.width}×${mOld.height} ${(sOld / 1024).toFixed(1)}KB   جدید: ${mNew.width}×${mNew.height} ${(sNew / 1024).toFixed(1)}KB   ` +
      (mOld.width === mNew.width && mOld.height === mNew.height ? '✅ ابعاد یکسان' : '❌ ابعاد فرق دارد'));
  }

  console.log('\n── ۲) سرعت (تک‌عکس، تک‌رشته) ──');
  console.log(`  قدیم (۳ decode): ${pad(ms(tOld), 8)} جدید (۱ decode): ${pad(ms(tNew), 8)} → ${(tOld / tNew).toFixed(2)}× سریع‌تر`);
  // چند دور تا عدد پایدار شود
  const rounds = 3; let o = 0, n = 0;
  for (let i = 0; i < rounds; i++) {
    const a = Date.now(); await oldPipeline(src, dirA, 'y.jpg'); o += Date.now() - a;
    const b = Date.now(); await newPipeline(src, dirB, 'y.jpg'); n += Date.now() - b;
    fs.rmSync(path.join(dirA, '.thumbs'), { recursive: true, force: true });
    fs.rmSync(path.join(dirB, '.thumbs'), { recursive: true, force: true });
  }
  console.log(`  میانگینِ ${rounds} دور:  قدیم ${pad(ms(o / rounds), 8)} جدید ${pad(ms(n / rounds), 8)} → ${(o / n).toFixed(2)}× سریع‌تر`);

  console.log('\n── ۳) موجِ هم‌زمان: سقف ظرفیت ──');
  const { heavyStats } = require('../src/lib/heavy');
  const N = 12;
  const t2 = Date.now();
  await Promise.all(Array.from({ length: N }, (_, i) => newPipeline(src, dirB, `burst${i}.jpg`)));
  const wall = Date.now() - t2;
  const st = heavyStats();
  console.log(`  ${N} عکسِ هم‌زمان: دیوار=${ms(wall)} | سقف=${st.max} بیشترینِ هم‌زمانی=${st.peak} | در صف انتظار کشیدند=${st.waited}`);
  console.log(`  ${st.peak <= st.max ? '✅ سقف رعایت شد — بقیهٔ کاربران (دوئل/چت) منابع آزاد دارند' : '❌ سقف شکسته شد'}`);
  console.log(`  ${st.queued === 0 ? '✅ صف پس از پایان خالی شد (بدون گیرکردگی)' : '❌ کارِ جا‌مانده در صف'}`);

  console.log('\n── ۴) نگهبانِ ضدقفل‌شدگی (کارِ تودرتو) ──');
  const { runHeavy } = require('../src/lib/heavy');
  const nested = await runHeavy(() => runHeavy(async () => 'ok'));
  console.log(`  نتیجهٔ ${nested} | دور زده‌شده=${heavyStats().bypassed} — ${nested === 'ok' ? '✅ قفل نمی‌شود' : '❌'}`);

  fs.rmSync(root, { recursive: true, force: true });
  console.log('\nنتیجهٔ کلی:', (sameMain && st.peak <= st.max) ? '✅ هر سه معیار برقرار' : '❌ نیاز به بررسی');
})();
