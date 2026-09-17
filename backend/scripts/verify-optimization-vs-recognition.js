#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  آیا بهینه‌سازیِ عکس، دقتِ تشخیص را ضعیف می‌کند؟
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * این آزمون به‌جای استدلال، عدد می‌دهد. برای هر طرحِ مرجعِ فعال:
 *
 *   الف) یک «عکسِ شبیه‌گوشی» می‌سازد: همان تصویر، بزرگ‌شده تا ۲۴۰۰px و
 *        ذخیره‌شده به‌عنوان JPEG با کیفیت ۸۰ — یعنی همان چیزی که گوشیِ
 *        کاربر به‌عنوان «فایلِ خامِ آپلود» می‌فرستد.
 *   ب) همان فایل را از `optimizeUpload` عبور می‌دهد (۱۶۰۰px، WebP کیفیت
 *        ۸۲) — یعنی همان چیزی که **روی دیسک ذخیره می‌شود** و بعداً صفِ
 *        تشخیصِ سرور آن را می‌خواند.
 *
 * بعد هر دو را با مدلِ واقعیِ کارت امبد می‌کند و در برابر ۵۶ طرحِ مرجع
 * رتبه‌بندی می‌کند:
 *
 *   • آیا رتبهٔ اول (این کارتِ کیست؟) عوض می‌شود؟
 *   • نمرهٔ برترین تطبیق و حاشیهٔ آن چقدر فرق می‌کند؟
 *   • سیگنالِ چهره (تعداد چهره، نمرهٔ تشخیص) عوض می‌شود؟
 *
 * نکتهٔ مهمی که این آزمون اثبات نمی‌کند: ماژولِ اثرانگشتِ ۱۲۸۰بعدی
 * (`fpEngine`) در مسیرِ درون‌درخواستی روی **بافرِ خامِ آپلود** حساب
 * می‌شود، نه روی فایلِ ذخیره‌شده؛ پس بهینه‌سازی هیچ راهی برای اثرگذاری روی
 * آن ندارد (کد: src/routes/photoCards.js → fingerprint(workBuf)).
 *
 * اجرا (روی سرور یا هر جایی که کد+مدل+دیتابیس هست، از پوشهٔ backend):
 *   node scripts/verify-optimization-vs-recognition.js [--limit=10] [--quiet]
 */
'use strict';

require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const ARGS = process.argv.slice(2);
const LIMIT = Number((ARGS.find(a => a.startsWith('--limit=')) || '').split('=')[1]) || 0;
const QUIET = ARGS.includes('--quiet');

const { pool } = require('../src/config/db');
const vision = require('../src/services/serverVision');
const { optimizeUpload } = require('../src/services/imageService');

const UPLOAD_ROOT = path.resolve(__dirname, '..', 'uploads');

const designFile = (imageUrl) => {
  if (!imageUrl || !String(imageUrl).startsWith('/uploads/')) return null;
  const p = path.join(UPLOAD_ROOT, String(imageUrl).replace(/^\/uploads/, ''));
  return fs.existsSync(p) ? p : null;
};

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const pct = (x) => `${(x * 100).toFixed(1)}%`;

/** رتبه‌بندیِ یک بردار در برابر همهٔ بردارهای مرجع. */
function rank(vec, refs) {
  const scored = refs
    .map(r => ({ id: r.id, score: vision.cosine(vec, r.vec) }))
    .sort((a, b) => b.score - a.score);
  const top = scored[0];
  const second = scored[1];
  return {
    topId: top && top.id,
    score: top ? top.score : 0,
    margin: top && second ? top.score - second.score : 0,
    rank1: scored.slice(0, 3).map(s => `${String(s.id).slice(0, 8)}:${s.score.toFixed(3)}`).join(' '),
  };
}

(async () => {
  const ready = await vision.available();
  if (!ready) {
    console.error('مدلِ سرور در دسترس نیست — این آزمون روی سرورِ واقعی اجرا شود.');
    process.exit(1);
  }

  const designs = (await pool.query(
    `SELECT id, image_url, server_embedding
       FROM photo_card_designs
      WHERE is_active = true AND server_embedding IS NOT NULL
      ORDER BY id`,
  )).rows;

  if (designs.length < 2) {
    console.error('طرحِ مرجعِ کافی برای رتبه‌بندی وجود ندارد.');
    process.exit(1);
  }
  const refs = designs
    .filter(d => Array.isArray(d.server_embedding) && d.server_embedding.length)
    .map(d => ({ id: d.id, vec: d.server_embedding }));

  const list = LIMIT ? designs.slice(0, LIMIT) : designs;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'optcheck-'));
  const imgDir = path.join(tmp, 'images');
  fs.mkdirSync(imgDir, { recursive: true });

  console.log(`\n  ${list.length} طرحِ مرجع، ${refs.length} بردارِ مرجع، مدلِ سرور فعال\n`);
  console.log('  ─'.repeat(34));
  console.log('  طرح      رتبهٔ اولِ خام   رتبهٔ اولِ بهینه‌شده   اختلافِ نمره   حاشیه');
  console.log('  ─'.repeat(34));

  const dScore = [], dMargin = [];
  let top1Same = 0, top1Right = 0, faceSame = 0, faceChecked = 0;
  const mismatches = [];

  for (const d of list) {
    const src = designFile(d.image_url);
    if (!src) continue;

    // «فایلِ خامِ شبیه‌گوشی»: بزرگ‌شده + JPEG
    const meta = await sharp(src).metadata();
    const raw = path.join(imgDir, `q-${d.id}.jpg`);
    await sharp(src)
      .resize({ width: Math.max(2400, meta.width || 0), withoutEnlargement: false })
      .jpeg({ quality: 80 })
      .toFile(raw);

    // همان چیز روی دیسکِ سرور می‌نشیند:
    const optCopy = path.join(imgDir, `o-${d.id}.jpg`);
    fs.copyFileSync(raw, optCopy);
    const optimized = await optimizeUpload({
      path: optCopy, filename: `o-${d.id}.jpg`, mimetype: 'image/jpeg', originalname: `o-${d.id}.jpg`,
    });
    const storedPath = path.join(imgDir, optimized.filename);

    const [rawBuf, storedBuf] = [fs.readFileSync(raw), fs.readFileSync(storedPath)];
    const [vRaw, vStored] = [await vision.embedCard(rawBuf), await vision.embedCard(storedBuf)];
    if (!vRaw || !vStored) continue;

    const rRaw = rank(vRaw, refs);
    const rStored = rank(vStored, refs);
    const same = rRaw.topId === rStored.topId;
    if (same) top1Same++;
    if (String(rRaw.topId) === String(d.id) && String(rStored.topId) === String(d.id)) top1Right++;
    else mismatches.push({ id: d.id, raw: rRaw.rank1, stored: rStored.rank1 });

    dScore.push(Math.abs(rRaw.score - rStored.score));
    dMargin.push(Math.abs(rRaw.margin - rStored.margin));

    if (!QUIET) {
      console.log(`  ${String(d.id).slice(0, 8)}  ${rRaw.score.toFixed(4)}${same ? '  ✅' : '  ❌'}      `
        + `${rStored.score.toFixed(4)}      Δ=${(rStored.score - rRaw.score >= 0 ? '+' : '')}`
        + `${(rStored.score - rRaw.score).toFixed(4)}   ${rStored.margin.toFixed(4)}`);
    }

    // سیگنالِ چهره روی همان دو ورودی (هر دو از یک فایل ذخیره‌شده می‌آیند)
    const [fRaw, fStored] = [await vision.embedFace(rawBuf), await vision.embedFace(storedBuf)];
    if (fRaw && fStored) {
      faceChecked++;
      const sameFace = fRaw.faceCount === fStored.faceCount
        && (fRaw.v === null) === (fStored.v === null);
      if (sameFace) faceSame++;
    }
  }

  fs.rmSync(tmp, { recursive: true, force: true });

  const n = dScore.length;
  console.log('\n  ═══════════════════════════════════════════════════════════════');
  console.log(`  نمونه‌های سنجیده‌شده: ${n}`);
  console.log(`  رتبهٔ اول یکسان (خام در برابر بهینه‌شده): ${top1Same}/${n}  (${pct(top1Same / n)})`);
  console.log(`  تشخیصِ درست در هر دو حالت: ${top1Right}/${n}  (${pct(top1Right / n)})`);
  console.log(`  میانگینِ |اختلافِ نمره|: ${mean(dScore).toFixed(5)}   بیشینه: ${Math.max(...dScore).toFixed(5)}`);
  console.log(`  میانگینِ |اختلافِ حاشیه|: ${mean(dMargin).toFixed(5)}   بیشینه: ${Math.max(...dMargin).toFixed(5)}`);
  if (faceChecked) {
    console.log(`  سیگنالِ چهره یکسان (تعداد/وجودِ بردار): ${faceSame}/${faceChecked}`);
  }
  if (mismatches.length) {
    console.log('\n  ⚠️ مواردی که رتبهٔ اول عوض شد:');
    for (const m of mismatches) console.log(`    ${m.id}\n      خام:   ${m.raw}\n      بهینه: ${m.stored}`);
  } else {
    console.log('\n  ✅ در هیچ نمونه‌ای رتبهٔ اول عوض نشد.');
  }
  console.log('  ═══════════════════════════════════════════════════════════════\n');

  await pool.end();
})().catch(async (e) => {
  console.error('خطا:', e.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
