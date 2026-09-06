/**
 * بازبینیِ خودکارِ پرونده‌های در صف توسط **خود سرور** (فاز ۴).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * خط‌قرمز: صفر تأییدِ اشتباه
 * ═══════════════════════════════════════════════════════════════════════════
 * دروازه «و» (AND) است نه «یا». خودکار فقط وقتی که **هر دو** شاهد قوی و موافق
 * باشند:
 *
 *   ۱) بصری (سرور، تمام‌رزولوشن): همان بازیکن رتبهٔ اول با نمره و حاشیهٔ خوب.
 *   ۲) چهره (YuNet→SFace): **یک چهرهٔ تمیز و مطمئن** در کادر باشد، همان بازیکن
 *      با نمره و حاشیهٔ خوب بالای آستانه بیاید.
 *
 * چندچهره‌ای‌بودن کادر (پوستر/کارت گروهی) باعث می‌شود مدل گاهی چهرهٔ اشتباه را
 * بردارد؛ پس وقتی بیش از یک چهره هست یا حاشیه کم است، **اصلاً روی چهره تکیه
 * نمی‌کنیم**. اگر چهره نبود/ضعیف بود ولی بصری قوی بود، خودکار نمی‌کنیم و در صف
 * می‌ماند (محافظه‌کارانه) — چون هدف صفری‌خطاست، نه بیشینه‌کردنِ خودکارسازی.
 *
 * خروجیِ تابع تصمیم‌گیر فقط «پیشنهاد» است؛ نوشتنِ وضعیت به `approved` در لایهٔ
 * مسیر با همان `creditSubmission` اتمیک انجام می‌شود (تا کد/امتیاز دوبار نشود).
 */

const fs = require('fs');
const path = require('path');
const vision = require('./serverVision');

// نسخهٔ بردارهای سرور؛ اگر مدلِ سرور عوض شد بالا می‌رود.
const SERVER_EMBED_VERSION = 1;

// ── آستانه‌ها (از اعتبارسنجی روی دادهٔ واقعیِ تخریب‌یافته کالیبره شده) ──
// بصری: روی عکسِ شبیه‌گوشی ۲۷/۲۷ درست با حاشیهٔ کافی.
const CARD_MIN_SCORE = 0.45;
const CARD_MIN_MARGIN = 0.012;
// چهره: فقط وقتی شاهدِ مثبت محسوب می‌شود که مطمئن و یکتا باشد.
const FACE_MIN_SCORE = 0.55;
const FACE_MIN_MARGIN = 0.15;
const FACE_MIN_DET = 0.85;

function asArray(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * بردارهای مرجعِ تولیدشده روی سرور را برای همهٔ طراحی‌های فعال تضمین می‌کند.
 * فقط طراحی‌هایی که تصویرشان روی دیسک هست پردازش می‌شوند؛ نتیجه در DB کش می‌شود
 * تا هر بار مدل اجرا نشود.
 */
// ریشهٔ دیسکِ تصاویر: بک‌اند زیر backend/ است و آدرس‌ها `/uploads/images/...`.
const UPLOAD_DISK_ROOT = path.resolve(__dirname, '..', '..', 'uploads');

function designFilePath(imageUrl) {
  if (!imageUrl || !String(imageUrl).startsWith('/uploads/')) return null;
  const rel = String(imageUrl).replace(/^\/uploads/, '');
  const p = path.join(UPLOAD_DISK_ROOT, rel);
  return fs.existsSync(p) ? p : null;
}

async function ensureReferenceEmbeddings(pool) {
  const ready = await vision.available();
  if (!ready) return { ok: false, reason: 'vision-unavailable' };

  const rows = (await pool.query(
    `SELECT id, image_url,
            server_embedding, server_face_embedding,
            server_embedding_version AS cev,
            server_face_embedding_version AS cfv
       FROM photo_card_designs
      WHERE is_active = true`,
  )).rows;

  let cardDone = 0, faceDone = 0, skipped = 0;
  for (const r of rows) {
    const file = designFilePath(r.image_url);
    if (!file) { skipped++; continue; }

    const needCard = asArray(r.server_embedding) === null
      || r.cev !== SERVER_EMBED_VERSION;
    const needFace = r.cfv !== SERVER_EMBED_VERSION;
    if (!needCard && !needFace) continue;

    const buf = fs.readFileSync(file);
    const set = [];
    const params = [];
    let i = 1;

    if (needCard) {
      const cv = await vision.embedCard(buf);
      if (cv) {
        params.push(JSON.stringify(cv)); set.push(`server_embedding=$${i++}`);
        params.push(SERVER_EMBED_VERSION); set.push(`server_embedding_version=$${i++}`);
        cardDone++;
      }
    }
    if (needFace) {
      const fe = await vision.embedFace(buf);
      // مرجع فقط وقتی بردار چهره می‌گیرد که **یک چهرهٔ تمیز و مطمئن** باشد؛
      // کارت‌های چندچهره‌ای/پوستر طبیعتاً بردار چهره نمی‌گیرند (نسخه ثبت می‌شود
      // تا دوباره اجرا نشود، ولی برداری ذخیره نمی‌شود).
      if (fe && fe.v && fe.faceCount === 1 && fe.detScore >= FACE_MIN_DET) {
        params.push(JSON.stringify(fe.v)); set.push(`server_face_embedding=$${i++}`);
        faceDone++;
      }
      params.push(SERVER_EMBED_VERSION); set.push(`server_face_embedding_version=$${i++}`);
      faceDone += fe && fe.v && fe.faceCount === 1 ? 0 : 0;
    }
    if (!set.length) continue;
    params.push(r.id);
    await pool.query(
      `UPDATE photo_card_designs SET ${set.join(', ')} WHERE id=$${i}`,
      params,
    );
  }
  return { ok: true, cardDone, faceDone, skipped };
}

/**
 * مرجع‌های فعال (بردارهای بصری/چهرهٔ ساخته‌شده روی سرور) را یک‌بار می‌خواند.
 */
async function loadRefs(pool) {
  const rows = (await pool.query(
    `SELECT d.id AS design_id, d.side, ct.id AS card_type_id, ct.name,
            d.server_embedding, d.server_face_embedding
       FROM photo_card_designs d
       JOIN card_types ct ON ct.id = d.card_type_id
      WHERE d.is_active = true AND ct.is_active = true`,
  )).rows;
  return rows.map((r) => ({
    name: r.name,
    designId: r.design_id,
    cardTypeId: r.card_type_id,
    side: r.side,
    cardVec: asArray(r.server_embedding),
    faceVec: asArray(r.server_face_embedding),
  }));
}

/** رتبه‌بندی یک بردار در برابر مرجع‌ها (در حافظه) با حاشیه تا بازیکنِ بعدی. */
function rankVector(vec, refs, key) {
  if (!vec) return [];
  const list = refs
    .filter((r) => r[key])
    .map((r) => ({ name: r.name, designId: r.designId, cardTypeId: r.cardTypeId,
      side: r.side, score: vision.cosine(vec, r[key]) }))
    .sort((a, b) => b.score - a.score);
  return list.map((row) => {
    const other = list.find((r) => r.cardTypeId !== row.cardTypeId);
    return { ...row, margin: other ? row.score - other.score : row.score };
  });
}

/**
 * یک پرونده را روی سرور بازبینی می‌کند و تصمیم می‌دهد.
 *
 * برای جبرانِ حاشیهٔ میز/پس‌زمینه، چند واریانتِ برش (کامل + برش‌های مرکزی)
 * امبد می‌شوند و قوی‌ترینشان (بیشترین حاشیهٔ بصری) مبنای تصمیم است.
 *
 * @returns {Promise<{action:'approve'|'queue', reason:string, cardTypeId?, designId?,
 *   cardScore?, cardMargin?, faceScore?, faceMargin?, faceCount?, topName?, crop?}>}
 */
async function decide(pool, submission, imageBuf) {
  const ready = await vision.available();
  if (!ready) return { action: 'queue', reason: 'vision-unavailable' };

  const refs = await loadRefs(pool);

  const variants = await vision.cropVariants(imageBuf);
  let best = null;
  for (const v of variants) {
    const [cardVec, faceRes] = await Promise.all([
      vision.embedCard(v.buf),
      vision.embedFace(v.buf),
    ]);
    const cardRank = rankVector(cardVec, refs, 'cardVec');
    const topCard = cardRank[0] || null;

    let faceTop = null, faceUsable = false;
    const faceVec = faceRes && faceRes.v ? faceRes.v : null;
    if (faceVec && faceRes.faceCount === 1 && faceRes.detScore >= FACE_MIN_DET) {
      const faceRank = rankVector(faceVec, refs, 'faceVec');
      faceTop = faceRank[0] || null;
      faceUsable = !!faceTop;
    }
    const cand = {
      crop: v.label,
      topCard,
      faceTop,
      faceUsable,
      faceCount: faceRes ? faceRes.faceCount : 0,
      faceDetected: faceRes ? faceRes.detScore : 0,
    };
    // بهترین واریانت = قوی‌ترین حاشیهٔ بصری (و اگر مساوی، نمرهٔ بالاتر).
    if (topCard && (!best || !best.topCard
      || topCard.margin > best.topCard.margin
      || (topCard.margin === best.topCard.margin && topCard.score > best.topCard.score))) {
      best = cand;
    }
  }

  if (!best || !best.topCard) return { action: 'queue', reason: 'no-card-reference' };

  const g = gate({
    topCard: best.topCard,
    topFace: best.faceTop,
    faceUsable: best.faceUsable,
  });

  const base = {
    topName: best.topCard.name,
    cardScore: best.topCard.score,
    cardMargin: best.topCard.margin,
    faceScore: g.faceScore,
    faceMargin: g.faceMargin,
    faceCount: best.faceCount,
    crop: best.crop,
  };

  if (g.action === 'approve') {
    return {
      action: 'approve',
      reason: g.reason,
      cardTypeId: best.topCard.cardTypeId,
      designId: best.topCard.designId,
      ...base,
    };
  }
  return { action: 'queue', reason: g.reason, ...base };
}

// ── آستانه‌های لایهٔ A: تأیید فقط با بصری (چهره انیمه/پیدا‌نشده) ──
// روی عکسِ شبیه‌گوشی با برش، نمره/حاشیهٔ بازیکنِ درست به این حد می‌رسد؛ هر چیز
// مبهم (تار/براق) پایین‌تر می‌ماند. تضادِ قاطعِ چهره همیشه ترمز می‌زند.
const CARD_ONLY_MIN_SCORE = 0.62;
const CARD_ONLY_MIN_MARGIN = 0.075;

/**
 * گیتِ خالصِ تصمیم — جدا از مدل تا تست‌پذیر باشد.
 *
 * دولایه (خط‌قرمز «صفر تأییدِ اشتباه»):
 *   • لایهٔ A (card-only): بصری فوق‌قوی (نمره+حاشیهٔ بالا) → تأیید، مگر آنکه
 *     چهرهٔ یکتای پراطمینان بازیکنِ دیگری را بگوید (تضاد → صف). این لایه کارت‌های
 *     با چهرهٔ سبکِ انیمه را که YuNet نمی‌گیرد نجات می‌دهد.
 *   • لایهٔ B (card+face): بصری خوب + چهرهٔ یکتای پراطمینانِ موافق → تأیید.
 *   • هر چیز دیگر (بصری ضعیف، حاشیه کم، تضاد چهره، چهرهٔ مبهم) → صف.
 */
function gate({ topCard, topFace, faceUsable }) {
  if (!topCard) return { action: 'queue', reason: 'no-card-reference' };

  // چهرهٔ «قابل‌اتکا» یک چهرهٔ یکتای پراطمینان است (پیش‌فیلترشده در decide).
  const faceStrong = !!faceUsable && !!topFace
    && topFace.score >= FACE_MIN_SCORE
    && topFace.margin >= FACE_MIN_MARGIN;
  const faceAgrees = faceStrong && topFace.cardTypeId === topCard.cardTypeId;
  const faceContradicts = faceStrong && !faceAgrees;
  const faceScore = faceUsable && topFace ? topFace.score : null;
  const faceMargin = faceUsable && topFace ? topFace.margin : null;

  // لایهٔ A: بصری فوق‌قوی و بدون تضادِ چهره.
  if (topCard.score >= CARD_ONLY_MIN_SCORE
    && topCard.margin >= CARD_ONLY_MIN_MARGIN
    && !faceContradicts) {
    return {
      action: 'approve',
      reason: faceAgrees ? 'card-strong-face-agree' : 'card-strong',
      faceScore, faceMargin,
    };
  }
  // تضادِ قاطعِ چهره → هرگز خودکار.
  if (faceContradicts) {
    return { action: 'queue', reason: 'face-contradicts', faceScore, faceMargin };
  }
  // لایهٔ B: بصری خوب + چهرهٔ موافق.
  const cardOk = topCard.score >= CARD_MIN_SCORE && topCard.margin >= CARD_MIN_MARGIN;
  if (cardOk && faceAgrees) {
    return { action: 'approve', reason: 'card+face-agree', faceScore, faceMargin };
  }
  if (!cardOk) {
    return { action: 'queue', reason: 'card-weak', faceScore, faceMargin };
  }
  return { action: 'queue', reason: 'face-not-confident', faceScore, faceMargin };
}

module.exports = {
  ensureReferenceEmbeddings,
  decide,
  gate,
  loadRefs,
  rankVector,
  SERVER_EMBED_VERSION,
  CARD_MIN_SCORE,
  CARD_MIN_MARGIN,
  CARD_ONLY_MIN_SCORE,
  CARD_ONLY_MIN_MARGIN,
  FACE_MIN_SCORE,
  FACE_MIN_MARGIN,
};
