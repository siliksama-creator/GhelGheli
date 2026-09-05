/**
 * بنچ‌مارکِ دقتِ لایهٔ هویت روی **عکس‌های واقعیِ کاتالوگ** — سنجش تکرارپذیر.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این اسکریپت
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * تست‌های واحد (`testCardIdentity`) منطق را با ورودیِ دستی می‌سنجند، ولی دقتِ
 * واقعی روی عکسِ واقعی فقط با اندازه‌گیری معلوم می‌شود. این اسکریپت:
 *
 *   • همهٔ طرح‌های فعال را از دیتابیس می‌خواند (اثرانگشت بصری + واژه‌نامه).
 *   • برای هر طرح، از روی **عکس مرجعِ واقعی** نسخه‌های «عکسِ گوشی» می‌سازد:
 *     تاری، چرخش، تاریکی، رزولوشنِ پایین، و ترکیبی.
 *   • روی هر نسخه OCR و اثرانگشت اجرا می‌شود و با کلِ کاتالوگ سنجیده می‌شود.
 *
 * سه عدد گزارش می‌شود:
 *   • r1   : رتبهٔ اول درست بوده؟ (صرفِ نظر از آستانه)
 *   • auto : سیستم خودکار تأیید می‌کرد و **کارتِ درست** می‌داد؟
 *   • bad  : سیستم خودکار کارتِ **غلط** می‌داد؟ (باید صفر بماند)
 *
 * فقط خواندنی است (SELECT + خواندن فایل)؛ چیزی نمی‌نویسد.
 *
 * اجرا روی سرور:  DATABASE_URL=… node scripts/benchCardIdentity.js
 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const fp = require('../src/services/imageFingerprint');
const cardIdentity = require('../src/services/cardIdentity');

async function main() {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const { rows } = await pool.query(
    `SELECT d.id, d.card_type_id, d.image_url, d.text_tokens,
            d.dhash, d.phash, d.color_sig, d.tex_sig, d.luma_sig, d.rgb_sig,
            t.name AS card_name,
            t.player_lexemes, t.player_number
       FROM photo_card_designs d
       JOIN card_types t ON t.id = d.card_type_id
      WHERE d.is_active = true AND t.is_active = true
      ORDER BY d.id`,
  );

  const uploadsRoot = path.resolve(__dirname, '..', 'uploads', 'images');
  const diskPath = (url) => path.join(uploadsRoot, path.basename(String(url || '')));

  // فقط طرح‌هایی که فایل عکسشان روی دیسک هست.
  const designs = [];
  for (const r of rows) {
    const p = diskPath(r.image_url);
    if (fs.existsSync(p)) designs.push({ ...r, _path: p });
  }
  console.log(`طرح‌های واجد عکس روی دیسک: ${designs.length} از ${rows.length}`);

  const toFloats = v => (Array.isArray(v) ? v.map(Number) : []);
  const fpDesigns = designs.map(r => ({
    id: r.id,
    card_type_id: r.card_type_id,
    image_url: r.image_url,
    dhash: r.dhash, phash: r.phash,
    colorSig: toFloats(r.color_sig),
    texSig: toFloats(r.tex_sig),
    lumaSig: toFloats(r.luma_sig),
    rgbSig: toFloats(r.rgb_sig),
    textTokens: Array.isArray(r.text_tokens) ? r.text_tokens : [],
    playerLexemes: Array.isArray(r.player_lexemes) ? r.player_lexemes : [],
    playerNumber: r.player_number || null,
  }));

  // سناریوهای تخریب (شبیه‌سازیِ عکسِ گوشی).
  const scenarios = {
    clean:    b => b,
    blur:     b => sharp(b).blur(3).webp({ quality: 60 }).toBuffer(),
    dark:     b => sharp(b).modulate({ brightness: 0.6 }).webp({ quality: 62 }).toBuffer(),
    rotate:   b => sharp(b).rotate(6, { background: '#222' }).webp({ quality: 62 }).toBuffer(),
    lowres:   b => sharp(b).resize(180, null, { fit: 'inside' }).resize(900, null, { fit: 'inside' }).webp({ quality: 58 }).toBuffer(),
    harsh:    b => sharp(b).rotate(9, { background: '#1a1a1a' }).blur(1.4)
                          .modulate({ brightness: 0.82 }).resize(300, null, { fit: 'inside' })
                          .webp({ quality: 55 }).toBuffer(),
  };

  const stat = () => ({ r1: 0, r1id: 0, auto: 0, bad: 0, review: 0, n: 0 });
  const results = {};
  for (const s of Object.keys(scenarios)) results[s] = stat();
  const confusions = [];

  for (let di = 0; di < designs.length; di++) {
    const truth = designs[di];
    const orig = await fs.promises.readFile(truth._path);

    for (const [sname, fn] of Object.entries(scenarios)) {
      let qbuf;
      try { qbuf = await fn(orig); } catch { continue; }
      let queryFp;
      try { queryFp = await fp.fingerprint(qbuf); } catch { continue; }

      // تطبیق بصری (موتور قدیمی + OCR مرجع).
      const match = fp.matchAgainst(queryFp, fpDesigns);
      // لایهٔ هویت (نام‌خوانِ واژه‌نامه + embedding).
      const identity = cardIdentity.rankIdentity(
        { textTokens: queryFp.textTokens, embedding: null }, fpDesigns);

      const S = results[sname];
      S.n++;
      const visCorrect = match.design && match.design.card_type_id === truth.card_type_id;
      const idCorrect = identity.found && identity.design
        && identity.design.card_type_id === truth.card_type_id;
      const idWrong = identity.found && identity.design
        && identity.design.card_type_id !== truth.card_type_id;

      if (visCorrect) S.r1++;
      if (idCorrect) S.r1id++;

      // تصمیم یکپارچه (همان منطق decideSubmission برای کدِ بی‌نام: هویت قاطع
      // برنده است؛ وگرنه موتور بصری با آستانهٔ آزاد).
      if (identity.found) {
        if (idCorrect) S.auto++;
        else if (idWrong) { S.bad++; confusions.push({ s: sname, truth: truth.card_name, picked: identity.design && (fpDesigns.find(d=>d.id===identity.design.id)||{}).card_name, score: identity.score }); }
        else S.review++;
      } else if (match.verdict === 'accept') {
        if (visCorrect) S.auto++;
        else { S.bad++; confusions.push({ s: sname, truth: truth.card_name, picked: match.design && match.design.id, score: match.score }); }
      } else {
        S.review++;
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('سناریو      تعداد   رتبه۱(بصری)  هویت‌درست   تأییدخودکارِدرست   تأییدِغلط(bad)   صف');
  for (const [s, S] of Object.entries(results)) {
    const pct = (a, b) => b ? `${(100 * a / b).toFixed(0)}%` : '–';
    console.log(
      s.padEnd(11),
      String(S.n).padStart(4),
      pct(S.r1, S.n).padStart(8),
      pct(S.r1id, S.n).padStart(10),
      pct(S.auto, S.n).padStart(14),
      String(S.bad).padStart(12),
      pct(S.review, S.n).padStart(7),
    );
  }
  console.log('═══════════════════════════════════════════════════════');
  if (confusions.length) {
    console.log('\nنمونه‌های تأییدِ غلط (باید بررسی شوند):');
    confusions.slice(0, 20).forEach(c =>
      console.log(`  [${c.s}] درست=${c.truth} ← انتخاب=${c.picked} (${Number(c.score).toFixed(2)})`));
  } else {
    console.log('\n✅ هیچ تأییدِ خودکارِ غلطی در هیچ سناریویی رخ نداد.');
  }
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
