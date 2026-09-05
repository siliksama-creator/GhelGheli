/**
 * بنچ‌مارکِ سریعِ دقتِ هویت — مرجع‌ها از اثرانگشتِ آمادهٔ دیتابیس، فقط عکسِ
 * «کاربر» تازه تخریب و OCR می‌شود.
 *
 * تفاوت با benchCardIdentity: آن نسخه برای مرجع هم OCR تازه اجرا می‌کرد و روی
 * VPS تک‌هسته‌ای نیم‌ساعت می‌شد. این نسخه توکنِ متنِ مرجع را از همان
 * `text_tokens` که هنگام آپلود ساخته شده می‌خواند (دقیقاً همان چیزی که مسیر
 * زنده استفاده می‌کند) و فقط روی نسخه‌های تخریب‌شدهٔ عکسِ کاربر OCR می‌زند.
 *
 *   r1   : رتبه‌اولِ بصری درست بوده؟
 *   auto : خودکار کارتِ درست می‌داد؟
 *   bad  : خودکار کارتِ غلط می‌داد؟ (باید صفر بماند)
 *
 * فقط خواندنی.
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
            t.name AS card_name, t.player_lexemes, t.player_number
       FROM photo_card_designs d
       JOIN card_types t ON t.id = d.card_type_id
      WHERE d.is_active = true AND t.is_active = true
      ORDER BY d.id`,
  );
  const root = path.resolve(__dirname, '..', 'uploads', 'images');
  const disk = u => path.join(root, path.basename(String(u || '')));
  const designs = rows.filter(r => fs.existsSync(disk(r.image_url)))
    .map(r => ({ ...r, _path: disk(r.image_url) }));
  console.log(`طرح‌های واجد عکس: ${designs.length} از ${rows.length}`);

  const toF = v => (Array.isArray(v) ? v.map(Number) : []);
  // مرجع: اثرانگشت کامل از دیتابیس (همان text_tokens مسیر زنده).
  const refFps = designs.map(r => ({
    id: r.id, card_type_id: r.card_type_id,
    dhash: r.dhash, phash: r.phash,
    colorSig: toF(r.color_sig), texSig: toF(r.tex_sig),
    lumaSig: toF(r.luma_sig), rgbSig: toF(r.rgb_sig),
    textTokens: Array.isArray(r.text_tokens) ? r.text_tokens : [],
    playerLexemes: Array.isArray(r.player_lexemes) ? r.player_lexemes : [],
    playerNumber: r.player_number || null,
  }));

  const scenarios = {
    clean:  b => b,
    blur:   b => sharp(b).blur(3).webp({ quality: 60 }).toBuffer(),
    dark:   b => sharp(b).modulate({ brightness: 0.6 }).webp({ quality: 62 }).toBuffer(),
    rotate: b => sharp(b).rotate(6, { background: '#222' }).webp({ quality: 62 }).toBuffer(),
    lowres: b => sharp(b).resize(180, null, { fit: 'inside' }).webp({ quality: 58 }).toBuffer(),
    harsh:  b => sharp(b).rotate(9, { background: '#1a1a1a' }).blur(1.4)
                       .modulate({ brightness: 0.82 }).resize(300, null, { fit: 'inside' })
                       .webp({ quality: 55 }).toBuffer(),
  };

  // نمونه‌گیری: OCR روی VPS تک‌هسته‌ای گران است. روی زیرمجموعه‌ای از طرح‌ها
  // (به‌طور قطعی، نه تصادفی — تکرارپذیر) و چهار سناریوی گویا اندازه می‌گیریم تا
  // روی دیتای واقعی عدد بدهد بدون نیم‌ساعت CPU. متغیر محیطی BENCH_ALL=1 همه را
  // می‌سنجد.
  const STEP = process.env.BENCH_ALL === '1' ? 1 : 2;   // هر ۲ طرح یکی
  const USE_SCEN = process.env.BENCH_ALL === '1'
    ? Object.keys(scenarios)
    : ['clean', 'blur', 'harsh', 'rotate'];
  const picked = designs.filter((_, idx) => idx % STEP === 0);
  console.log(`سنجش روی ${picked.length} طرح × ${USE_SCEN.length} سناریو (BENCH_ALL=1 برای همه)`);

  const stat = () => ({ r1: 0, r1id: 0, idTop3: 0, auto: 0, bad: 0, review: 0, n: 0 });
  const R = {};
  for (const s of USE_SCEN) R[s] = stat();
  const confuse = [];

  for (let i = 0; i < designs.length; i++) {
    if (!picked.includes(designs[i])) continue;
    const truth = designs[i];
    const orig = await fs.promises.readFile(truth._path);
    const truthRef = refFps[i];
    for (const [sname, fn] of Object.entries(scenarios)) {
      if (!USE_SCEN.includes(sname)) continue;
      let qb; try { qb = await fn(orig); } catch { continue; }
      let qfp; try { qfp = await fp.fingerprint(qb); } catch { continue; }
      const match = fp.matchAgainst(qfp, refFps);
      const identity = cardIdentity.rankIdentity(
        { textTokens: qfp.textTokens, embedding: null }, refFps);
      const S = R[sname]; S.n++;

      const visTop = match.design;
      const visCorrect = visTop && visTop.card_type_id === truth.card_type_id;
      const inIdTop3 = identity.ranked.some(x => x.design.card_type_id === truth.card_type_id);
      const idCorrect = identity.found && identity.design.card_type_id === truth.card_type_id;
      const idWrong = identity.found && identity.design.card_type_id !== truth.card_type_id;
      if (visCorrect) S.r1++;
      if (idCorrect) S.r1id++;
      if (inIdTop3) S.idTop3++;

      const truthName = truth.card_name;
      const nameOf = d => designs.find(x => x.card_type_id === d.card_type_id)?.card_name || d.card_type_id;
      if (identity.found) {
        if (idCorrect) S.auto++;
        else if (idWrong) { S.bad++; confuse.push({ s: sname, truth: truthName, pick: nameOf(identity.design), score: identity.score }); }
        else S.review++;
      } else if (match.verdict === 'accept') {
        if (visCorrect) S.auto++;
        else { S.bad++; confuse.push({ s: sname, truth: truthName, pick: nameOf(match.design), score: match.score }); }
      } else S.review++;
      void truthRef;
    }
    if ((i + 1) % 8 === 0) console.error(`  …${i + 1}/${designs.length}`);
  }

  const pct = (a, b) => b ? `${(100 * a / b).toFixed(0)}%` : '–';
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('سناریو    تعداد  رتبه۱بصری  رتبه۱هویت  هویت‌در۳تای‌اول  تأییدخودکارِدرست  تأییدغلط(bad)  صف');
  for (const [s, S] of Object.entries(R)) {
    console.log(
      s.padEnd(9), String(S.n).padStart(4),
      pct(S.r1, S.n).padStart(8),
      pct(S.r1id, S.n).padStart(9),
      pct(S.idTop3, S.n).padStart(14),
      pct(S.auto, S.n).padStart(15),
      String(S.bad).padStart(12),
      pct(S.review, S.n).padStart(6),
    );
  }
  console.log('═══════════════════════════════════════════════════════════════');
  if (confuse.length) {
    console.log(`\n⚠️ ${confuse.length} مورد تأیید خودکارِ غلط (باید صفر باشد):`);
    confuse.slice(0, 25).forEach(c =>
      console.log(`  [${c.s}] درست=${c.truth} ← انتخاب=${c.pick} (${Number(c.score).toFixed(2)})`));
  } else {
    console.log('\n✅ هیچ تأیید خودکارِ غلطی در هیچ سناریویی نبود.');
  }
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
