/**
 * قفلِ موقت پس از چند کدِ غلطِ پشت‌سرهم.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این جدا از محدودکنندهٔ نرخ است
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `submitLimiter` (۲۰ درخواست در ساعت) از **منابع سرور** محافظت می‌کند:
 * هر درخواست یک تصویر را رمزگشایی می‌کند و ~۲۰ms CPU می‌خورد.
 *
 * این ماژول از **بانکِ کد** محافظت می‌کند. تفاوت مهم است:
 *
 *   • کاربری که ۲۰ عکسِ درست می‌فرستد، مزاحم نیست — فقط پرمصرف است.
 *   • کاربری که ۵ کدِ غلط پشت‌سرهم می‌زند، کارت ندارد و دارد حدس می‌زند.
 *
 * با ۲۰ حدس در ساعت، یک حساب در روز ۴۸۰ حدس می‌زند. قفلِ ۳ ساعته این را
 * به حداکثر ۴۰ حدس در روز می‌رساند — یعنی هزینهٔ حمله ۱۲ برابر می‌شود،
 * بدون اینکه کاربرِ درستکار (که نهایتاً یکی دو بار کد را اشتباه می‌خواند)
 * حتی متوجه شود.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چه چیزی شمرده می‌شود و چه چیزی نه
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * فقط **کدِ غلط**:
 *   ✓ کد در سیستم نیست
 *   ✓ فرمت کد نامعتبر است
 *
 * عمداً شمرده نمی‌شود:
 *   ✗ عکس تشخیص داده نشد — خطای کاربر نیست، پرونده به مدیر می‌رود
 *   ✗ کد قبلاً استفاده شده — کاربر واقعاً کد را داشته، فقط دیر رسیده
 *   ✗ کد در حال بررسی است — همان‌طور
 *
 * اگر این تفکیک نبود، کاربری با گوشیِ ضعیف که پنج بار عکسِ تار فرستاده
 * سه ساعت قفل می‌شد — دقیقاً همان کسی که باید کمکش کنیم.
 */

const opsLimits = require('./opsLimits');

/** حداکثر خطای پشت‌سرهم پیش از قفل — از پنل ادمین قابل تنظیم است
 *  (پیش‌فرض ۵، همان ثابتِ قبلی کد). */
function maxFails() {
  return opsLimits.get().photoLockMaxFails;
}

/** مدت قفل — خواستهٔ صریح مالک: ۳ ساعت. */
const LOCK_MS = 3 * 60 * 60 * 1000;

/**
 * وضعیت قفلِ یک کاربر را می‌خواند.
 *
 * @returns {{locked: boolean, until: Date|null, remainingMs: number,
 *            failStreak: number, triesLeft: number}}
 */
async function getState(pool, userId, now = new Date()) {
  const { rows } = await pool.query(
    `SELECT fail_streak, locked_until FROM photo_card_attempts WHERE user_id=$1`,
    [userId],
  );
  const row = rows[0];
  if (!row) {
    return { locked: false, until: null, remainingMs: 0, failStreak: 0, triesLeft: maxFails() };
  }
  const until = row.locked_until ? new Date(row.locked_until) : null;
  const locked = until != null && until.getTime() > now.getTime();
  return {
    locked,
    until: locked ? until : null,
    remainingMs: locked ? until.getTime() - now.getTime() : 0,
    failStreak: row.fail_streak || 0,
    // وقتی قفل منقضی شده، شمارنده عملاً صفر است حتی اگر هنوز در جدول
    // عددی مانده باشد؛ `registerFailure` آن را پاک می‌کند.
    triesLeft: locked ? 0 : Math.max(0, maxFails() - (row.fail_streak || 0)),
  };
}

/**
 * یک کدِ غلط را ثبت می‌کند و در صورت لزوم قفل می‌اندازد.
 *
 * @returns {{locked: boolean, remainingMs: number, triesLeft: number, failStreak: number}}
 */
async function registerFailure(pool, userId, now = new Date()) {
  // ── چرا همه‌چیز در یک دستور ──
  //
  // خواندن، شمردن و نوشتن در سه دستور جدا یک مسابقهٔ زمانی می‌ساخت: دو
  // درخواستِ هم‌زمان هر دو «۴» می‌خواندند و هر دو «۵» می‌نوشتند، پس
  // کاربر یک تلاشِ اضافه می‌گرفت. با `ON CONFLICT ... DO UPDATE` کلِ
  // عملیات اتمیک است.
  //
  // شرطِ داخل CASE: اگر قفلِ قبلی منقضی شده، شمارنده از ۱ شروع می‌شود
  // نه از جایی که مانده بود. وگرنه کاربری که سه ساعت صبر کرده با یک
  // خطای دیگر بلافاصله دوباره قفل می‌شد.
  const { rows } = await pool.query(
    `INSERT INTO photo_card_attempts(user_id, fail_streak, last_fail_at, updated_at)
     VALUES($1, 1, $2, $2)
     ON CONFLICT (user_id) DO UPDATE SET
       fail_streak = CASE
         WHEN photo_card_attempts.locked_until IS NOT NULL
              AND photo_card_attempts.locked_until <= $2 THEN 1
         ELSE photo_card_attempts.fail_streak + 1
       END,
       last_fail_at = $2,
       updated_at = $2
     RETURNING fail_streak`,
    [userId, now],
  );

  const streak = rows[0].fail_streak;
  if (streak < maxFails()) {
    return {
      locked: false,
      remainingMs: 0,
      triesLeft: maxFails() - streak,
      failStreak: streak,
    };
  }

  const until = new Date(now.getTime() + LOCK_MS);
  await pool.query(
    `UPDATE photo_card_attempts SET locked_until=$2, updated_at=$3 WHERE user_id=$1`,
    [userId, until, now],
  );
  return { locked: true, remainingMs: LOCK_MS, triesLeft: 0, failStreak: streak };
}

/**
 * پس از ثبتِ موفق، شمارنده و قفل پاک می‌شوند.
 *
 * چرا کاملاً پاک و نه فقط کاهش: کاربری که کارتِ واقعی ثبت کرده ثابت
 * کرده مهاجم نیست. نگه داشتنِ نیمی از شمارنده فقط باعث می‌شد دفعهٔ
 * بعد زودتر قفل شود بدون هیچ دلیل امنیتی.
 */
async function clearFailures(pool, userId) {
  await pool.query(
    `UPDATE photo_card_attempts
        SET fail_streak=0, locked_until=NULL, updated_at=NOW()
      WHERE user_id=$1 AND (fail_streak > 0 OR locked_until IS NOT NULL)`,
    [userId],
  );
}

/** «۲ ساعت و ۱۵ دقیقه» — برای پیامِ کاربر. */
function humanRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h} ساعت و ${m} دقیقه`;
  if (h > 0) return `${h} ساعت`;
  return `${m} دقیقه`;
}

module.exports = {
  maxFails,
  LOCK_MS,
  getState,
  registerFailure,
  clearFailures,
  humanRemaining,
};
