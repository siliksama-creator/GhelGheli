'use strict';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  دفترِ سکه — ثبتِ هر واریز و کسرِ سکه
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── چرا ──────────────────────────────────────────────────────────────────
 *
 * نقطه‌های ورودِ سکه در این پروژه پراکنده‌اند: بردِ بازیِ آنلاین
 * (`gameStakeService`)، جایزهٔ ضربه‌زن، و انتقال/پاک‌شدنِ سکه در پایانِ لیگ
 * (`leagueService`). پیش از این هیچ‌کدام ردپایی نمی‌گذاشتند؛ کاربر فقط عددِ
 * کل را می‌دید. این ماژول تنها جایی است که سکه ثبت می‌شود تا:
 *
 *   • کاربر در «دفترِ سکه» ببیند از کدام بازی چقدر گرفته؛
 *   • پایانِ لیگ («سکه‌ها کجا رفت؟») توضیح داشته باشد، نه سکوت؛
 *   • بشود ثابت کرد یک بردِ واقعی سکه‌اش را گرفته (پاسخ به پشتیبانی،
 *     بدونِ گشتنِ دستی در جدولِ رتبه‌بندی).
 *
 * ── قاعده‌ها ─────────────────────────────────────────────────────────────
 *
 *  ۱. **داخلِ تراکنشِ همان کار.** هر فراخوانی `client` تراکنشی می‌گیرد، نه
 *     `pool`. اگر تسویهٔ بازی rollback شود، ردیفِ دفتر هم می‌رود؛ دفتر هرگز
 *     از واقعیت جلو نمی‌افتد.
 *  ۲. **خطا پرتاب نمی‌کند.** دفتر یک کارِ جانبی است؛ اگر ثبتش شکست بخورد
 *     نباید تسویهٔ بازی/بستنِ لیگ را بشکند. خطا لاگ می‌شود و `null`
 *     برمی‌گردد. (همان قاعدهٔ `cardDecisionNotify`.)
 *  ۳. **delta صفر ثبت نمی‌شود** — قانونِ دیتابیس هم همین است.
 *  ۴. **موجودی از خودِ دیتابیس خوانده می‌شود**، نه از حافظه؛ وگرنه با
 *     درخواست‌های هم‌زمان، `balance_after` دروغ می‌شود.
 */
const { pool } = require('../config/db');
const logger = require('../lib/logger');

/** منابعِ شناخته‌شده — برچسبِ فارسی‌شان در `SOURCE_LABELS` است. */
const SOURCES = Object.freeze([
  'game',           // بردِ بازیِ آنلاین (دوئل و…) — از gameStakeService
  'tap',            // لول‌های ضربه‌زن
  'league_carryover', // (تاریخی) درصدی که به لیگِ بعدی منتقل می‌شد
  'vault_deposit',  // واریزِ کاربر از صندوق سکه به یک لیگِ فعال
  'league_end',     // سکه‌هایی که با بسته‌شدنِ لیگ از شمارندهٔ نمایشی می‌رود
  'wheel',          // گردونهٔ شانس (اگر روزی سکه بدهد)
  'admin_adjust',   // دستِ مدیر
  'other',
]);

const SOURCE_LABELS = Object.freeze({
  game: 'بردِ بازی',
  tap: 'ضربه‌زن',
  league_carryover: 'انتقالِ سکه به لیگِ بعد',
  vault_deposit: 'واریز از صندوق سکه',
  league_end: 'پایانِ لیگ',
  wheel: 'گردونهٔ شانس',
  admin_adjust: 'تنظیمِ مدیر',
  other: 'سایر',
});

/**
 * یک حرکتِ سکه را ثبت می‌کند.
 *
 * @param {object} client  کلاینتِ تراکنشِ جاری (نه pool)
 * @param {object} o
 * @param {string} o.userId
 * @param {number} o.delta           مثبت=واریز، منفی=کسر
 * @param {string} o.source          یکی از SOURCES
 * @param {string} [o.referenceType] مثل 'game'، 'photo'، 'league'
 * @param {string} [o.referenceId]
 * @param {string} [o.description]   جمله‌ای که کاربر می‌بیند
 * @returns {Promise<number|null>} موجودیِ بعد از تغییر، یا null اگر ثبت نشد
 */
async function record(client, {
  userId, delta, source = 'other', referenceType = null,
  referenceId = null, description = null,
} = {}) {
  try {
    if (!userId) return null;
    const d = Math.trunc(Number(delta));
    if (!Number.isFinite(d) || d === 0) return null;

    // موجودیِ *بعد از* تغییر — تغییر خودش را فراخوان قبلاً زده است. قفلِ
    // ردیف (FOR UPDATE) تضمین می‌کند عددی که می‌نویسیم با همان لحظه یکی است.
    const { rows } = await client.query(
      'SELECT coins FROM users WHERE id=$1 FOR UPDATE', [userId]);
    if (!rows[0]) return null;
    const after = Math.max(0, Number(rows[0].coins) || 0);

    const src = SOURCES.includes(source) ? source : 'other';
    await client.query(
      `INSERT INTO coin_transactions
         (user_id, delta, balance_after, source, reference_type,
          reference_id, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId, d, after, src, referenceType,
        referenceId != null ? String(referenceId).slice(0, 64) : null,
        description ? String(description).slice(0, 300) : null]);
    return after;
  } catch (e) {
    // ⚠️ عمداً پرتاب نمی‌کند: دفترِ سکه نباید تسویهٔ بازی یا بستنِ لیگ را
    //    بشکند. اگر این خطا زیاد شد، در لاگِ سرور دیده می‌شود.
    logger.warn(`[coinLedger] ثبتِ سکه ناموفق بود (نادیده): ${e.message}`);
    return null;
  }
}

/** ریزِ سکه‌های یک کاربر با صفحه‌بندی. */
async function history(userId, { limit = 25, offset = 0, source = null } = {}) {
  const lim = Math.min(100, Math.max(1, Math.trunc(Number(limit) || 25)));
  const off = Math.max(0, Math.trunc(Number(offset) || 0));
  const params = [userId];
  let where = 'WHERE user_id = $1';
  if (source && SOURCES.includes(source)) {
    params.push(source);
    where += ` AND source = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT id, delta, balance_after, source, reference_type, reference_id,
            description, created_at
       FROM coin_transactions
       ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, lim + 1, off]);

  const hasMore = rows.length > lim;
  const page = hasMore ? rows.slice(0, lim) : rows;

  const { rows: totalRows } = await pool.query(
    `SELECT count(*)::int AS n, COALESCE(SUM(delta),0)::int AS sum
       FROM coin_transactions ${where}`, params);

  const { rows: sums } = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END),0)::int AS earned,
            COALESCE(SUM(CASE WHEN delta < 0 THEN -delta ELSE 0 END),0)::int AS spent
       FROM coin_transactions WHERE user_id = $1`, [userId]);

  return {
    transactions: page.map(r => ({
      id: r.id,
      delta: Number(r.delta),
      balanceAfter: Number(r.balance_after),
      source: r.source,
      sourceLabel: SOURCE_LABELS[r.source] || r.source,
      referenceType: r.reference_type,
      referenceId: r.reference_id,
      description: r.description,
      created_at: r.created_at,
    })),
    page: { limit: lim, offset: off, count: page.length, total: Number(totalRows[0]?.n || 0), hasMore },
    totals: {
      earned: Number(sums[0]?.earned || 0),
      spent: Number(sums[0]?.spent || 0),
    },
  };
}

/**
 * ثبتِ گروهی (مثلاً پایانِ لیگ که هزاران کاربر را هم‌زمان صفر می‌کند).
 *
 * چرا یک کوئری: `record()` برای هر کاربر یک `SELECT … FOR UPDATE` اضافه
 * می‌کند. در بستنِ لیگ این یعنی هزاران رفت‌وبرگشتِ اضافه در یک تراکنش —
 * و تراکنشِ طولانی قفلِ جدولِ کاربران را نگه می‌دارد. اینجا موجودیِ بعد از
 * تغییر را **فراخوان** می‌دهد (خودش می‌داند) و یک `INSERT` می‌نشیند.
 *
 * @param {object} client
 * @param {Array<{userId:string, delta:number, balanceAfter:number,
 *   source:string, referenceType?:string, referenceId?:string,
 *   description?:string}>} entries
 * @returns {Promise<number>} تعدادِ ردیف‌های ثبت‌شده
 */
async function recordBulk(client, entries = []) {
  try {
    const rows = (Array.isArray(entries) ? entries : [])
      .map((e) => ({
        userId: e && e.userId,
        delta: Math.trunc(Number(e && e.delta)),
        after: Math.max(0, Math.trunc(Number(e && e.balanceAfter) || 0)),
        source: SOURCES.includes(e && e.source) ? e.source : 'other',
        refType: e && e.referenceType != null ? String(e.referenceType).slice(0, 40) : null,
        refId: e && e.referenceId != null ? String(e.referenceId).slice(0, 64) : null,
        desc: e && e.description ? String(e.description).slice(0, 300) : null,
      }))
      .filter((e) => e.userId && Number.isFinite(e.delta) && e.delta !== 0);
    if (!rows.length) return 0;

    await client.query(
      `INSERT INTO coin_transactions
         (user_id, delta, balance_after, source, reference_type,
          reference_id, description)
       SELECT * FROM unnest(
         $1::uuid[], $2::int[], $3::int[], $4::text[], $5::text[],
         $6::text[], $7::text[])`,
      [rows.map(r => r.userId), rows.map(r => r.delta), rows.map(r => r.after),
        rows.map(r => r.source), rows.map(r => r.refType),
        rows.map(r => r.refId), rows.map(r => r.desc)]);
    return rows.length;
  } catch (e) {
    logger.warn(`[coinLedger] ثبتِ گروهیِ سکه ناموفق بود (نادیده): ${e.message}`);
    return 0;
  }
}

module.exports = { record, recordBulk, history, SOURCES, SOURCE_LABELS };
