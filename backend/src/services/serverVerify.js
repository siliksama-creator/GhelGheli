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
 * رتبه‌بندیِ بردارِ عکسِ کاربر در برابر مرجع‌ها (فقط طراحی‌های هم‌طرف در صورت
 * معلوم‌بودن طرف). خروجی: [{name, designId, cardTypeId, score, margin, face...}].
 */
async function rankAgainst(pool, { cardVec, faceVec }) {
  const refs = (await pool.query(
    `SELECT d.id AS design_id, d.side, ct.id AS card_type_id, ct.name,
            d.server_embedding, d.server_face_embedding
       FROM photo_card_designs d
       JOIN card_types ct ON ct.id = d.card_type_id
      WHERE d.is_active = true AND ct.is_active = true`,
  )).rows;

  const cardRank = [];
  const faceRank = [];
  for (const r of refs) {
    const se = asArray(r.server_embedding);
    const fe = asArray(r.server_face_embedding);
    const base = { name: r.name, designId: r.design_id, cardTypeId: r.card_type_id, side: r.side };
    if (cardVec && se) cardRank.push({ ...base, score: vision.cosine(cardVec, se) });
    if (faceVec && fe) faceRank.push({ ...base, score: vision.cosine(faceVec, fe) });
  }
  cardRank.sort((a, b) => b.score - a.score);
  faceRank.sort((a, b) => b.score - a.score);
  // حاشیهٔ هر ردیف = نمره‌اش منهای بهترینِ بازیکنِ **دیگر**.
  const withMargin = (rank) => rank.map((row, idx) => {
    const other = rank.find((r) => r.cardTypeId !== row.cardTypeId);
    return { ...row, margin: other ? row.score - other.score : row.score };
  });
  return { cardRank: withMargin(cardRank), faceRank: withMargin(faceRank) };
}

/**
 * یک پرونده را روی سرور بازبینی می‌کند و تصمیم می‌دهد.
 * @returns {Promise<{action:'approve'|'queue', reason:string, cardTypeId?, designId?,
 *   cardScore?, cardMargin?, faceScore?, faceMargin?, faceCount?, topName?}>}
 */
async function decide(pool, submission, imageBuf) {
  const ready = await vision.available();
  if (!ready) return { action: 'queue', reason: 'vision-unavailable' };

  const [cardVec, faceRes] = await Promise.all([
    vision.embedCard(imageBuf),
    vision.embedFace(imageBuf),
  ]);
  const faceVec = faceRes && faceRes.v ? faceRes.v : null;

  const { cardRank, faceRank } = await rankAgainst(pool, { cardVec, faceVec });

  const topCard = cardRank[0];
  const topFace = faceRank[0];

  if (!topCard) return { action: 'queue', reason: 'no-card-reference' };

  const g = gate({
    topCard, topFace,
    faceCount: faceRes.faceCount,
    faceDetected: faceRes.detScore,
  });

  if (g.action === 'approve') {
    return {
      action: 'approve',
      reason: 'card+face-agree',
      cardTypeId: topCard.cardTypeId,
      designId: topCard.designId,
      topName: topCard.name,
      cardScore: topCard.score,
      cardMargin: topCard.margin,
      faceScore: g.faceScore,
      faceMargin: g.faceMargin,
      faceCount: faceRes.faceCount,
    };
  }

  return {
    action: 'queue',
    reason: g.reason,
    topName: topCard.name,
    cardScore: topCard.score,
    cardMargin: topCard.margin,
    faceScore: g.faceScore,
    faceMargin: g.faceMargin,
    faceCount: faceRes.faceCount,
    cardTop: topCard,
    faceTop: topFace || null,
  };
}

/**
 * گیتِ خالصِ تصمیم — جدا از مدل تا تست‌پذیر باشد.
 *
 * تأیید خودکار فقط وقتی که بصری قوی است **و** چهره یکتا/پراطمینان **و** هر دو
 * بر یک بازیکنند. هر حالت دیگر (بصری ضعیف، چهرهٔ نبوده، چندچهره‌ای، حاشیه کم،
 * یا تضادِ چهره) → صف.
 */
function gate({ topCard, topFace, faceCount, faceDetected }) {
  const cardOk = !!topCard
    && topCard.score >= CARD_MIN_SCORE
    && topCard.margin >= CARD_MIN_MARGIN;

  let faceOk = false;
  let faceAgrees = false;
  let faceScore = null, faceMargin = null;

  const faceUsable = !!topFace && faceCount === 1 && faceDetected >= FACE_MIN_DET;
  if (faceUsable) {
    faceScore = topFace.score;
    faceMargin = topFace.margin;
    if (topFace.score >= FACE_MIN_SCORE && topFace.margin >= FACE_MIN_MARGIN) {
      faceOk = true;
      faceAgrees = topFace.cardTypeId === topCard.cardTypeId;
    }
  }

  if (cardOk && faceOk && faceAgrees) {
    return { action: 'approve', reason: 'card+face-agree', faceScore, faceMargin };
  }
  if (faceOk && !faceAgrees) {
    return { action: 'queue', reason: 'face-contradicts', faceScore, faceMargin };
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
  rankAgainst,
  SERVER_EMBED_VERSION,
  CARD_MIN_SCORE,
  CARD_MIN_MARGIN,
  FACE_MIN_SCORE,
  FACE_MIN_MARGIN,
};
