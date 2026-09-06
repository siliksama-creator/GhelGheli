/**
 * پردازشگرِ صفِ بازبینیِ کارت عکسی توسط خود سرور (فاز ۴).
 *
 * وقتی موبایل به‌خاطر حاشیهٔ کم کارتی را «در انتظار» می‌گذارد، این پردازشگر
 * (که آسنکرون و خارج از مسیر اصلی ثبت اجرا می‌شود) عکسِ کامل را با مدلِ روی
 * سرور دوباره می‌سنجد و اگر گیتِ محافظه‌کارانهٔ `serverVerify.decide` رد شد،
 * با **همان** تابع اتمیکِ `creditSubmission` کارت را تأیید می‌کند (نه مسیر
 * جداگانه، تا کد/امتیاز/اینونتوری دقیقاً مثل تأیید ادمین رفتار کند و دوبار نشود).
 *
 * تصمیم‌ها در ستون `server_verify` ذخیره می‌شوند تا در پنل ادمین وب دیده شوند.
 */

const fs = require('fs');
const path = require('path');
const serverVerify = require('./serverVerify');
const photoCards = require('./photoCardService');

// تأییدِ خودکارِ مواردِ پراطمینان.
//
// گیتِ محافظه‌کارانه (بصریِ قوی + چهرهٔ یکتای پراطمینان + توافق هر دو) روی
// دادهٔ واقعیِ تخریب‌یافته (کجی/تاری/فشرده، ۵۶ طرح) اعتبارسنجی شد: مواردی که
// خودکار کرد همگی درست بودند (صفر تأییدِ اشتباه) و بقیه امن در صف ماندند. پس
// به‌طور پیش‌فرض **فعال** است؛ اگر در محیطی لازم بود فقط «پیشنهاد» ثبت شود و
// تأیید دستی بماند، `SERVER_AUTO_APPROVE=false` در .env خاموشش می‌کند.
const AUTO_APPROVE_ENABLED = process.env.SERVER_AUTO_APPROVE !== 'false';

const UPLOAD_DISK_ROOT = path.resolve(__dirname, '..', '..', 'uploads');

function diskPath(userImagePath) {
  if (!userImagePath) return null;
  if (fs.existsSync(userImagePath)) return userImagePath;
  const base = path.basename(userImagePath);
  const p = path.join(UPLOAD_DISK_ROOT, 'images', base);
  return fs.existsSync(p) ? p : null;
}

/**
 * یک پروندهٔ در انتظار را بازبینی می‌کند.
 * @param {import('pg').Pool} pool
 * @param {{client?:any}} deps  برای تزریقِ addLeaguePoints/audit در مسیر
 * @returns {Promise<{checked:boolean, action:string, reason?:string,
 *   approved?:boolean, submissionId:string}>}
 */
async function reviewOne(pool, submissionId, hooks = {}) {
  const client = await pool.connect();
  let imagePath = null;
  try {
    await client.query('BEGIN');
    const sres = await client.query(
      `SELECT * FROM photo_card_submissions WHERE id=$1 FOR UPDATE`,
      [submissionId],
    );
    const sub = sres.rows[0];
    if (!sub) { await client.query('ROLLBACK'); return { checked: false, action: 'missing', submissionId }; }
    if (sub.status !== 'pending') { await client.query('ROLLBACK'); return { checked: false, action: sub.status, submissionId }; }

    const file = diskPath(sub.user_image_path);
    if (!file) {
      await client.query('ROLLBACK');
      return { checked: false, action: 'no-image', reason: 'image-file-missing', submissionId };
    }
    imagePath = file;
    const buf = fs.readFileSync(file);

    // بردارهای مرجعِ سرور را در همین اتصال/تراکنش لازم نداریم (کش‌شده‌اند در جدول).
    const verdict = await serverVerify.decide(pool, sub, buf);

    // همیشه نظر سرور را ثبت می‌کنیم (حتی اگر خودکار نکنیم) تا پنل نشان دهد.
    await client.query(
      `UPDATE photo_card_submissions
          SET server_verify = $1
        WHERE id = $2`,
      [JSON.stringify({
        at: new Date().toISOString(),
        action: verdict.action,
        reason: verdict.reason,
        topName: verdict.topName || null,
        cardScore: verdict.cardScore ?? null,
        cardMargin: verdict.cardMargin ?? null,
        faceScore: verdict.faceScore ?? null,
        faceMargin: verdict.faceMargin ?? null,
        faceCount: verdict.faceCount ?? null,
        autoEnabled: AUTO_APPROVE_ENABLED,
      }), sub.id],
    );

    if (verdict.action !== 'approve') {
      await client.query('COMMIT');
      return { checked: true, action: 'queue', reason: verdict.reason, approved: false, submissionId };
    }

    if (!AUTO_APPROVE_ENABLED) {
      // حالت پیشنهاد (shadow): نظر قطعی ثبت شد ولی تأیید دستی می‌ماند.
      await client.query('COMMIT');
      return { checked: true, action: 'suggested-approve', reason: verdict.reason, approved: false, submissionId };
    }

    // ── تأیید خودکار با همان تابع اتمیکِ تأییدِ ادمین ──
    if (!sub.code_id) {
      await client.query('COMMIT');
      return { checked: true, action: 'queue', reason: 'no-code', approved: false, submissionId };
    }

    const design = verdict.designId
      ? (await client.query(
          `SELECT d.id, d.card_type_id, d.image_url
             FROM photo_card_designs d
             JOIN card_types t ON t.id=d.card_type_id
            WHERE d.id=$1 AND d.is_active=true AND t.is_active=true`,
          [verdict.designId])).rows[0] || null
      : null;

    const payload = await photoCards.creditSubmission(client, {
      userId: sub.user_id,
      codeId: sub.code_id,
      design,
      cardTypeId: design ? null : verdict.cardTypeId,
      adminId: null, // سیستم
    });

    if (payload?.points > 0 && hooks.addLeaguePoints) {
      await hooks.addLeaguePoints(client, sub.user_id, payload.points);
    }

    await client.query(
      `UPDATE photo_card_submissions
          SET status='approved', chosen_design_id=$1,
              decision_path='server_auto', reviewed_at=NOW(),
              user_image_path=NULL
        WHERE id=$2`,
      [design?.id ?? null, sub.id],
    );

    await client.query('COMMIT');

    // بعد از کامیت: عکس و اعلان.
    try { fs.unlinkSync(file); } catch { /* بی‌خیال */ }
    if (hooks.leaderboardSignal) hooks.leaderboardSignal();
    if (hooks.audit) {
      hooks.audit(null, 'auto_approve_photo_card', 'photo_card_submissions', sub.id,
        `تأیید خودکار سرور: ${verdict.topName}`, {
          cardScore: verdict.cardScore, faceScore: verdict.faceScore,
          reason: verdict.reason,
        }).catch(() => {});
    }
    return {
      checked: true, action: 'approved', approved: true, submissionId,
      cardTypeName: payload?.cardTypeName, points: payload?.points,
    };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * همهٔ پرونده‌های در انتظار را (با سقف) بازبینی می‌کند.
 * @returns {Promise<{processed:number, approved:number, queued:number, errors:number}>}
 */
async function sweepPending(pool, { limit = 20, ...hooks } = {}) {
  // اگر ابزار بینایی آماده نیست، بی‌سروصدا هیچ‌کاری نکن.
  const ready = await require('./serverVision').available();
  if (!ready) return { processed: 0, approved: 0, queued: 0, errors: 0, vision: false };

  try {
    await serverVerify.ensureReferenceEmbeddings(pool);
  } catch (e) {
    // اگر ساخت مرجع نیمه‌کاره ماند، باز هم با مرجع‌های موجود پیش برو.
  }

  const rows = (await pool.query(
    `SELECT id FROM photo_card_submissions
      WHERE status='pending'
      ORDER BY created_at ASC LIMIT $1`,
    [limit],
  )).rows;

  let approved = 0, queued = 0, errors = 0;
  for (const r of rows) {
    try {
      const out = await reviewOne(pool, r.id, hooks);
      if (out.action === 'approved') approved++;
      else if (out.checked) queued++;
    } catch (e) {
      errors++;
      // یک پروندهٔ خراب نباید کل جاروب را بشکند.
    }
  }
  return { processed: rows.length, approved, queued, errors, vision: true };
}

module.exports = {
  reviewOne,
  sweepPending,
  AUTO_APPROVE_ENABLED,
};
