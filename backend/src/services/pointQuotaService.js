// ═══════════════════════════════════════════════════════════════════════════
// سهمیهٔ روزانهٔ «امتیازِ کسب‌شده» از بازی‌های شرطیِ آنلاین
// ═══════════════════════════════════════════════════════════════════════════
//
// خواستهٔ مالک (۴ مهر ۱۴۰۵): «کاربرها از بازی‌های آنلاین نهایت می‌تونن
// ۲۰۰۰ امتیاز بدست بیارن. اگه سقف امتیاز پر بشه می‌تونن به بازی ادامه بدن
// ولی برد دیگه بهشون هیچ امتیازی نمیده، ولی همون سکهٔ همیشگی رو میده. ولی
// باخت دوباره سقف امتیاز بدست اوردشون کم می‌کنه.»
//
// ── چرا این لایه جدا از سهمیهٔ سکه است ──
//
// سهمیهٔ سکه (`user_coin_quota`) تعدادِ **مسابقه** را می‌شمارد و در «شروع»
// می‌سوزد؛ جلوی چاپِ سکه را می‌گیرد. ولی جابه‌جاییِ **امتیاز** بین دو
// بازیکن هیچ سقفی نداشت: سهمیهٔ سکه که پر می‌شد بازی ادامه داشت و امتیاز
// همچنان به برنده می‌رسید. یک بازیکنِ ماهر می‌توانست بی‌نهایت بازی کند و
// آن‌قدر امتیاز جمع کند که دیگر نیازی به ماموریت، صندوق یا ثبتِ کارت
// نداشته باشد — حفره‌ای که این سرویس می‌بندد.
//
// ── قراردادها ──
//
// * شمارنده، «سودِ خالصِ واریزشده» است: اصلِ ورودیِ برنده همیشه برمی‌گردد
//   و هرگز مشمولِ سقف نیست (وگرنه بُرد بعد از سقف یعنی باختِ خالص — پاداشِ
//   باختن!). فقط مازادِ برد (پات منهای ورودیِ خود) با سقف محدود می‌شود.
// * رسیدن به سقف بازی را نمی‌بندد: مسابقه انجام می‌شود، سکه‌ها طبقِ سهمیهٔ
//   سکه پرداخت می‌شوند، فقط سودِ امتیازی صفر یا ناقص واریز می‌شود.
// * باخت از شمارنده کم می‌کند و «جا باز می‌کند»، ولی شمارنده هرگز زیرِ صفر
//   نمی‌رود: باختِ عمدی نمی‌تواند فضایی بیشتر از کلِ سقف بسازد.
// * تساوی به‌اندازهٔ کمسیونِ کسرشده (باختِ واقعیِ هر طرف) جا باز می‌کند.
// * سقفِ صفر یعنی «بی‌سقف» — همان قراردادِ `dailyCap` در gameRewardService.
//
// ⚠️ همهٔ تابع‌های نوشتن **باید داخلِ تراکنشِ تسویه** و با همان `client`
// صدا زده شوند تا برد/واگذاریِ امتیاز و شمارنده با هم commit یا rollback
// شوند — وگرنه یک بار خطا یعنی شمردنِ امتیازی که هرگز واریز نشد.

const { pool } = require('../config/db');
const economy = require('./gameEconomyService');
const { tehranDate } = require('./coinService');

// ── منطقِ خالص (بدونِ دیتابیس) — نگهبانش `scripts/testPointQuota.js` ──────
//
// عمداً از کوئری جدا شده‌اند: آن‌جا که پول شمردن است باید بدونِ اتصال هم
// تست شود؛ کوئری‌ها فقط همین خروجی را می‌نویسند.

/**
 * چقدر از سودِ برد را می‌توان واریز کرد؟
 * @param {number} earnedBefore امتیازِ کسب‌شدهٔ امروز تا پیش از این برد
 * @param {number} profit       سودِ خالصِ این برد (پات منهای ورودیِ خود)
 * @param {number} cap          سقفِ روزانه؛ ۰ یا منفی یعنی بی‌سقف
 * @returns {{granted:number, earnedAfter:number, capped:boolean}}
 */
function computeEarn(earnedBefore, profit, cap) {
  const p = Math.max(0, Math.floor(Number(profit) || 0));
  const before = Math.max(0, Math.floor(Number(earnedBefore) || 0));
  const limit = Math.floor(Number(cap) || 0);
  if (!(limit > 0)) return { granted: p, earnedAfter: before, capped: false };
  const space = Math.max(0, limit - before);
  const granted = Math.min(p, space);
  return {
    granted,
    earnedAfter: before + granted,
    capped: p > granted,
  };
}

/**
 * باخت چقدر «جا باز می‌کند»؟ هرگز زیرِ صفر نمی‌رود.
 * @returns {number} شمارندهٔ تازه
 */
function computeRelease(earnedBefore, amount) {
  const before = Math.max(0, Math.floor(Number(earnedBefore) || 0));
  const take = Math.max(0, Math.floor(Number(amount) || 0));
  return Math.max(0, before - take);
}

// ── لایهٔ دیتابیس ──────────────────────────────────────────────────────────

/** سقفِ زندهٔ امروز از تنظیمِ اقتصاد (کشِ ۱۵ ثانیه‌ای خودِ سرویس). */
async function capOf() {
  const cfg = await economy.load().catch(() => null);
  return Math.max(0, Math.floor(Number(cfg?.dailyPointQuota) || 0));
}

/**
 * وضعیتِ امروزِ یک کاربر — فقط خواندن، برای نمایش در صفحهٔ انتخابِ ورودی.
 * شکلِ پاسخ آینهٔ `coins.getQuota` است تا کلاینت‌ها یک قرارداد ببینند.
 */
async function getQuota(userId, now = new Date()) {
  const cap = await capOf();
  const date = tehranDate(now);
  if (!(cap > 0)) return { date, cap: 0, earned: 0, remaining: null };
  const { rows } = await pool.query(
    `SELECT earned FROM user_point_quota
      WHERE user_id=$1 AND quota_date=$2`, [userId, date]);
  const earned = Math.max(0, Number(rows[0]?.earned || 0));
  return { date, cap, earned, remaining: Math.max(0, cap - earned) };
}

/**
 * سودِ یک برد را تا سقفِ امروز واریزپذیر می‌کند.
 * **باید داخلِ تراکنشِ تسویه** صدا زده شود.
 *
 * الگوی قفل مثلِ خودِ `settleMatch` (سطرِ `FOR UPDATE` روی سندِ مسابقه):
 * دو مسابقهٔ هم‌زمانِ یک کاربر نمی‌توانند هر دو «آخرین واحدِ سقف» را
 * ببینند، چون ردیفِ سهمیه پیش از محاسبه قفل می‌شود.
 *
 * @returns {Promise<{granted:number, earnedAfter:number, capped:boolean,
 *   remainingAfter:number}>}
 */
async function earn(client, userId, profit, now = new Date()) {
  const p = Math.max(0, Math.floor(Number(profit) || 0));
  const cap = await capOf();
  if (!(cap > 0)) {
    return { granted: p, earnedAfter: 0, capped: false, remainingAfter: null };
  }
  const date = tehranDate(now);
  const { rows } = await client.query(
    `SELECT earned FROM user_point_quota
      WHERE user_id=$1 AND quota_date=$2 FOR UPDATE`, [userId, date]);
  const before = Math.max(0, Number(rows[0]?.earned || 0));
  const { granted, earnedAfter, capped } = computeEarn(before, p, cap);
  if (rows[0]) {
    await client.query(
      `UPDATE user_point_quota
          SET earned=$3, updated_at=NOW()
        WHERE user_id=$1 AND quota_date=$2`, [userId, date, earnedAfter]);
  } else {
    await client.query(
      `INSERT INTO user_point_quota (user_id, quota_date, earned)
       VALUES ($1, $2, $3)`, [userId, date, earnedAfter]);
  }
  return { granted, earnedAfter, capped, remainingAfter: Math.max(0, cap - earnedAfter) };
}

/**
 * باخت/تساوی: به‌اندازهٔ امتیازِ ازدست‌رفته «جا باز می‌کند».
 * بی‌درخواست (بدونِ اثر) اگر ردیفی برای امروز نباشد. زیرِ صفر نمی‌رود.
 */
async function release(client, userId, amount, now = new Date()) {
  const take = Math.max(0, Math.floor(Number(amount) || 0));
  if (take === 0) return;
  const cap = await capOf();
  if (!(cap > 0)) return;
  const date = tehranDate(now);
  // GREATEST همان قراردادِ «زیرِ صفر نمی‌رود» است — در خودِ SQL تا هیچ
  // مسیرِ همزمانی نتواند ردیف را منفی کند.
  await client.query(
    `UPDATE user_point_quota
        SET earned = GREATEST(earned - $3, 0), updated_at = NOW()
      WHERE user_id=$1 AND quota_date=$2`, [userId, date, take]);
}

/** پاک‌سازیِ ردیف‌های کهنه — همان ریتمِ `coins.pruneQuota`. */
async function pruneQuota(keepDays = 7) {
  const { rowCount } = await pool.query(
    `DELETE FROM user_point_quota
      WHERE quota_date < (CURRENT_DATE - ($1::text || ' days')::interval)`,
    [String(keepDays)]);
  return rowCount;
}

module.exports = {
  computeEarn,
  computeRelease,
  getQuota,
  earn,
  release,
  pruneQuota,
};
