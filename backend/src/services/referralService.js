// معرفی دوستان — کد اختصاصی، کمیسیون ۵٪، و جایزهٔ چرخش.
//
// ─────────────────────────────────────────────────────────────────────────
// قانون‌ها، همان‌طور که مالک خواست
//
//   * هر کاربر موقع ساخت اکانت یک کد اختصاصی می‌گیرد.
//   * هر کس با آن کد عضو شود، معرف **۵٪ از تمام امتیازهایی که او به هر
//     طریقی به دست می‌آورد** را می‌گیرد.
//   * معرف به ازای هر معرفی **۳ چرخش گردونه** می‌گیرد.
//
// ─────────────────────────────────────────────────────────────────────────
// دو تصمیم که مالک نگفت ولی لازم بود
//
// ۱. کمیسیون **از جیب ما** است، نه از امتیاز کاربر معرفی‌شده.
//    اگر ۵٪ از امتیاز او کم می‌شد، کاربر تازه‌وارد بابت اینکه با کد دوستش
//    آمده جریمه می‌شد — دقیقاً برعکسِ چیزی که سیستم معرفی باید بکند.
//
// ۲. کمیسیون **زنجیره‌ای نیست**. اگر A کاربر B را بیاورد و B کاربر C را،
//    A از امتیاز C چیزی نمی‌گیرد. زنجیره‌ای کردنش یعنی ساختن یک هرم، که هم
//    از نظر حقوقی در ایران دردسر است و هم هزینه‌اش نمایی بالا می‌رود.
//    این با یک خط تضمین می‌شود: کمیسیون هرگز خودش کمیسیون تولید نمی‌کند.
const crypto = require('crypto');
const { pool } = require('../config/db');

/** درصد کمیسیون. */
const COMMISSION_PERCENT = 5;

/** چرخش گردونه به ازای هر معرفی موفق. */
const SPINS_PER_REFERRAL = 3;

// بدون 0/O و 1/I/L: کد قرار است شفاهی به دوست گفته شود و این جفت‌ها مدام
// اشتباه شنیده و تایپ می‌شوند.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

/** یک کد تصادفی. crypto نه Math.random — کد قابل حدس یعنی سرقت معرفی. */
function generateCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/**
 * کد اختصاصی کاربر را برمی‌گرداند و اگر ندارد می‌سازد.
 *
 * حلقهٔ تلاش مجدد به‌خاطر ایندکس یکتاست: دو درخواست هم‌زمان می‌توانند یک کد
 * تولید کنند و هر دو چک «آیا وجود دارد؟» را رد کنند. تنها چیزی که واقعاً
 * برخورد را می‌بندد خطای 23505 دیتابیس است، پس همان را می‌گیریم.
 */
async function ensureCode(userId, client = pool) {
  const existing = await client.query(
    'SELECT referral_code FROM users WHERE id = $1', [userId]);
  if (!existing.rows[0]) {
    throw Object.assign(new Error('کاربر پیدا نشد'), { status: 404 });
  }
  if (existing.rows[0].referral_code) return existing.rows[0].referral_code;

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateCode();
    try {
      const r = await client.query(
        `UPDATE users SET referral_code = $2, updated_at = NOW()
          WHERE id = $1 AND referral_code IS NULL
        RETURNING referral_code`, [userId, code]);
      if (r.rows[0]) return r.rows[0].referral_code;
      // ردیف به‌روز نشد یعنی یک درخواست هم‌زمان کد را گذاشته؛ همان را بخوان.
      const again = await client.query(
        'SELECT referral_code FROM users WHERE id = $1', [userId]);
      if (again.rows[0]?.referral_code) return again.rows[0].referral_code;
    } catch (e) {
      if (e.code !== '23505') throw e;
      // برخورد کد — دوباره تلاش کن.
    }
  }
  throw Object.assign(new Error('تولید کد معرفی ناموفق بود'), { status: 500 });
}

/**
 * ثبت اینکه یک کاربر تازه با کد کسی آمده.
 *
 * روی همان تراکنشِ ثبت‌نام صدا زده می‌شود. هر شکستی اینجا **نباید** ثبت‌نام
 * را خراب کند: کد اشتباه یعنی «معرفی ثبت نشد»، نه «اکانت ساخته نشد».
 * برگردانده می‌شود که آیا ثبت شد یا نه، تا کلاینت بتواند پیام درست بدهد.
 */
async function attachReferrer(client, newUserId, rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return { ok: false, reason: 'empty' };
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return { ok: false, reason: 'invalid' };

  const ref = await client.query(
    `SELECT id FROM users WHERE referral_code = $1 AND status = 'active'`,
    [code]);
  const referrerId = ref.rows[0]?.id;
  if (!referrerId) return { ok: false, reason: 'not_found' };

  // خودمعرفی: کسی نباید کد خودش را وارد کند و ۳ چرخش بگیرد.
  if (referrerId === newUserId) return { ok: false, reason: 'self' };

  // فقط یک بار. شرط `referred_by IS NULL` یعنی اگر کاربر قبلاً معرف دارد،
  // این UPDATE هیچ ردیفی را عوض نمی‌کند — به‌جای اینکه معرف قبلی را
  // بازنویسی کند و ۳ چرخش دوم بدهد.
  const attached = await client.query(
    `UPDATE users SET referred_by = $2, referred_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND referred_by IS NULL
    RETURNING id`, [newUserId, referrerId]);
  if (!attached.rows[0]) return { ok: false, reason: 'already_referred' };

  // جایزهٔ معرف: ۳ چرخش گردونه.
  await client.query(
    'UPDATE users SET bonus_spins = bonus_spins + $2, updated_at = NOW() WHERE id = $1',
    [referrerId, SPINS_PER_REFERRAL]);

  return { ok: true, referrerId, spinsAwarded: SPINS_PER_REFERRAL };
}

/**
 * کمیسیون ۵٪ را به معرفِ [userId] می‌دهد — اگر معرفی داشته باشد.
 *
 * این تابع باید از **هر** مسیری که به کاربر امتیاز می‌دهد صدا زده شود.
 * روی همان تراکنش، تا اگر عملیات اصلی برگشت، کمیسیون هم برگردد.
 *
 * گرد کردن **به بالا** است: با نرخ ۵٪، هر امتیاز کمتر از ۲۰ به سمت صفر گرد
 * می‌شد و معرف از ریز-امتیازها — که بیشترِ فعالیت روزمره است — هیچ
 * نمی‌گرفت. سقفش هم همان ۱ امتیاز در هر رویداد است، پس هزینه‌اش ناچیز.
 *
 * @returns {Promise<null|{referrerId, earned}>}
 */
async function payCommission(client, userId, basePoints, source) {
  const points = Math.floor(Number(basePoints) || 0);
  // فقط امتیاز مثبت. یک اصلاح منفی توسط مدیر نباید از معرف پس بگیرد —
  // او کاری نکرده که جریمه شود.
  if (points <= 0) return null;

  const u = await client.query(
    'SELECT referred_by FROM users WHERE id = $1', [userId]);
  const referrerId = u.rows[0]?.referred_by;
  if (!referrerId) return null;

  const earned = Math.ceil(points * COMMISSION_PERCENT / 100);
  if (earned <= 0) return null;

  // معرف باید هنوز فعال باشد؛ اکانت مسدود نباید امتیاز جمع کند.
  const active = await client.query(
    `SELECT 1 FROM users WHERE id = $1 AND status = 'active'`, [referrerId]);
  if (!active.rows[0]) return null;

  await client.query(
    `UPDATE users SET
       current_points        = current_points + $2,
       lifetime_points       = lifetime_points + $2,
       monthly_league_points = monthly_league_points + $2,
       updated_at = NOW()
     WHERE id = $1`, [referrerId, earned]);

  await client.query(
    `INSERT INTO referral_earnings
       (referrer_id, referred_id, base_points, earned_points, source)
     VALUES ($1,$2,$3,$4,$5)`,
    [referrerId, userId, points, earned, String(source || 'unknown').slice(0, 32)]);

  return { referrerId, earned };
}

/** خلاصهٔ معرفی برای صفحهٔ کاربر. */
async function summary(userId) {
  const code = await ensureCode(userId);
  const [invited, earnings, spins, recent] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS n FROM users WHERE referred_by = $1`, [userId]),
    pool.query(
      `SELECT COALESCE(SUM(earned_points),0)::int AS total
         FROM referral_earnings WHERE referrer_id = $1`, [userId]),
    pool.query('SELECT bonus_spins FROM users WHERE id = $1', [userId]),
    pool.query(
      `SELECT u.nickname, u.first_name, u.joined_at,
              COALESCE(SUM(e.earned_points),0)::int AS earned
         FROM users u
         LEFT JOIN referral_earnings e
                ON e.referred_id = u.id AND e.referrer_id = $1
        WHERE u.referred_by = $1
        GROUP BY u.id, u.nickname, u.first_name, u.joined_at
        ORDER BY u.joined_at DESC LIMIT 50`, [userId]),
  ]);

  return {
    code,
    commissionPercent: COMMISSION_PERCENT,
    spinsPerReferral: SPINS_PER_REFERRAL,
    invitedCount: invited.rows[0].n,
    totalEarned: earnings.rows[0].total,
    bonusSpins: Number(spins.rows[0]?.bonus_spins) || 0,
    friends: recent.rows.map((r) => ({
      nickname: r.nickname || r.first_name || 'کاربر',
      joinedAt: r.joined_at,
      earnedFromThem: r.earned,
    })),
  };
}

module.exports = {
  ensureCode, attachReferrer, payCommission, summary,
  generateCode,
  COMMISSION_PERCENT, SPINS_PER_REFERRAL,
};
