// معرفی دوستان — کد چهاررقمی، کمیسیون ۵٪، و چرخش‌های گردونه.
//
// ═════════════════════════════════════════════════════════════════════════
// قانون‌ها، دقیقاً همان‌طور که مالک خواست
//
//   * دعوت **نامحدود** است.
//   * کد **۴ رقمی**، فقط عدد، بدون حرف انگلیسی. بزرگی/کوچکی حروف بی‌معنا
//     می‌شود چون اصلاً حرفی در کار نیست.
//   * ۵٪ کمیسیون، ولی **فقط** از دو منبع: امتیازی که دوست از ثبت کد کارت
//     می‌گیرد، و امتیازی که از بازی ضربه‌زن می‌گیرد.
//   * هر دو طرف — دعوت‌کننده و دعوت‌شونده — **۳ چرخش** می‌گیرند، فقط یک بار.
//   * به ازای هر ۱۰ دعوت، **۱ چرخش روزانهٔ دائمی** اضافه، تا سقف ۵۰ نفر.
//
// ═════════════════════════════════════════════════════════════════════════
// سه تصمیم که مالک نگفت ولی لازم بود
//
// ۱. کمیسیون **از جیب ما** است، نه از امتیاز دعوت‌شونده. اگر ۵٪ از او کم
//    می‌شد، کاربر تازه‌وارد بابت اینکه با کد دوستش آمده جریمه می‌شد —
//    برعکسِ کاری که یک سیستم دعوت باید بکند.
//
// ۲. کمیسیون **زنجیره‌ای نیست**. اگر A کاربر B را بیاورد و B کاربر C را، A
//    از امتیاز C چیزی نمی‌گیرد. زنجیره‌ای کردنش یعنی ساختن یک هرم: هزینه
//    نمایی بالا می‌رود و از نظر حقوقی هم در ایران دردسر است. با یک خط
//    تضمین می‌شود: کمیسیون هرگز خودش کمیسیون تولید نمی‌کند.
//
// ۳. ارقام فارسی و عربی به لاتین تبدیل می‌شوند. کاربر ایرانی با کیبورد
//    فارسی «۱۲۳۴» تایپ می‌کند، نه «1234». اگر این نرمال‌سازی نبود، کد
//    درستِ تایپ‌شده با کیبورد فارسی هرگز پیدا نمی‌شد و کاربر فکر می‌کرد کد
//    دوستش اشتباه است.
const crypto = require('crypto');
const { pool } = require('../config/db');

/** درصد کمیسیون. */
const COMMISSION_PERCENT = 5;

/** چرخش گردونه برای *هر یک* از دو طرف، به ازای یک معرفی موفق. */
const SPINS_PER_REFERRAL = 3;

/** به ازای هر این تعداد دعوت، یک چرخش روزانهٔ دائمی اضافه می‌شود. */
const INVITES_PER_DAILY_SPIN = 10;

/** سقف دعوت‌هایی که چرخش روزانه می‌سازند. بعد از این، دعوت آزاد است ولی
 *  چرخش روزانهٔ بیشتری اضافه نمی‌کند. */
const MAX_INVITES_FOR_DAILY = 50;

/** چرخش روزانهٔ پایه که هر کاربر بدون هیچ دعوتی دارد. */
const BASE_DAILY_SPINS = 1;

/**
 * منابعی که کمیسیون می‌سازند.
 *
 * لیست سفید است نه سیاه: اگر فردا منبع امتیاز تازه‌ای اضافه شود، به‌طور
 * پیش‌فرض کمیسیون **نمی‌سازد** تا کسی آگاهانه اینجا اضافه‌اش کند. برعکسش
 * یعنی هر قابلیت جدید بی‌سروصدا هزینه تولید کند.
 */
const COMMISSIONABLE = new Set(['card', 'tap']);

const CODE_LENGTH = 4;
const CODE_MIN = 1000;   // هرگز با صفر شروع نمی‌شود
const CODE_MAX = 9999;

/**
 * ارقام فارسی/عربی را به لاتین تبدیل می‌کند و هر چیز دیگری را دور می‌ریزد.
 *
 * U+06F0..U+06F9 ارقام فارسی و U+0660..U+0669 ارقام عربی‌اند. هر دو روی
 * کیبوردهای رایج ایرانی تولید می‌شوند.
 */
function normalizeDigits(input) {
  return String(input || '')
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\D/g, '');
}

/**
 * یک کد چهاررقمی تصادفی.
 *
 * crypto نه Math.random: کد قابل حدس یعنی کسی می‌تواند کد دیگران را
 * بازتولید کند. با فضای ۹٬۰۰۰تایی این حمله عملی نیست، ولی هزینهٔ درست
 * انجام دادنش صفر است.
 *
 * randomInt کران بالا را شامل نمی‌شود، پس CODE_MAX+1 داده می‌شود. سوگیری
 * پیمانه‌ای هم ندارد — که خودِ `% n` روی randomBytes دارد.
 */
function generateCode() {
  return String(crypto.randomInt(CODE_MIN, CODE_MAX + 1));
}

/**
 * کد اختصاصی کاربر را برمی‌گرداند و اگر ندارد می‌سازد.
 *
 * حلقهٔ تلاش مجدد به‌خاطر ایندکس یکتاست: دو درخواست هم‌زمان می‌توانند یک کد
 * تولید کنند و هر دو چک «آیا وجود دارد؟» را رد کنند. تنها چیزی که واقعاً
 * برخورد را می‌بندد خطای 23505 دیتابیس است، پس همان را می‌گیریم.
 *
 * تعداد تلاش‌ها ۴۰ است نه ۸: فضای کد فقط ۹٬۰۰۰ تاست و هرچه پرتر شود
 * احتمال برخورد بالاتر می‌رود. با ۵٬۰۰۰ کاربر (نیمهٔ فضا) احتمال شکست ۴۰
 * تلاش پیاپی حدود ۱۰^-۱۲ است.
 */
async function ensureCode(userId, client = pool) {
  const existing = await client.query(
    'SELECT referral_code FROM users WHERE id = $1', [userId]);
  if (!existing.rows[0]) {
    throw Object.assign(new Error('کاربر پیدا نشد'), { status: 404 });
  }
  if (existing.rows[0].referral_code) return existing.rows[0].referral_code;

  for (let attempt = 0; attempt < 40; attempt++) {
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
  throw Object.assign(
    new Error('تولید کد معرفی ناموفق بود — فضای کد پر شده است'),
    { status: 500 });
}

/**
 * چند چرخش روزانه این کاربر دارد.
 *
 * پایه ۱، به‌علاوهٔ یکی به ازای هر ۱۰ دعوت، تا سقف ۵۰ دعوت. یعنی بیشترین
 * حالت ۶ چرخش در روز است (۱ پایه + ۵ از دعوت).
 *
 * از روی COUNT حساب می‌شود نه یک ستون ذخیره‌شده. یک شمارندهٔ ذخیره‌شده باید
 * در هر ثبت‌نام، هر حذف کاربر و هر مسدودسازی به‌روز شود، و اولین جایی که
 * یادمان برود عدد تا ابد غلط می‌ماند.
 */
function dailySpinsFor(invitedCount) {
  // کف صفر لازم است، نه فقط سقف.
  //
  // بدون `Math.max(0, ...)` یک عدد منفی — که COUNT هرگز نمی‌دهد ولی یک
  // فراخوانی اشتباه یا دادهٔ خراب می‌تواند بدهد — سهمیه را به صفر یا کمتر
  // می‌برد و کاربر **کاملاً** از گردونه محروم می‌شود. یعنی یک ورودی بد،
  // به‌جای اینکه بی‌اثر باشد، قابلیت را خاموش می‌کند.
  const n = Number(invitedCount);
  const safe = Number.isFinite(n) ? Math.max(0, n) : 0;
  const counted = Math.min(safe, MAX_INVITES_FOR_DAILY);
  return BASE_DAILY_SPINS + Math.floor(counted / INVITES_PER_DAILY_SPIN);
}

/** تعداد دعوت‌های موفق یک کاربر. */
async function invitedCount(userId, client = pool) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM users
      WHERE referred_by = $1 AND status = 'active'`, [userId]);
  return rows[0].n;
}

/**
 * ثبت اینکه یک کاربر تازه با کد کسی آمده، و دادن جایزه به **هر دو طرف**.
 *
 * روی همان تراکنشِ ثبت‌نام صدا زده می‌شود. هر شکستی اینجا **نباید** ثبت‌نام
 * را خراب کند: کد اشتباه یعنی «معرفی ثبت نشد»، نه «اکانت ساخته نشد».
 */
async function attachReferrer(client, newUserId, rawCode) {
  const code = normalizeDigits(rawCode);
  if (!code) return { ok: false, reason: 'empty' };
  if (code.length !== CODE_LENGTH) return { ok: false, reason: 'invalid' };

  const ref = await client.query(
    `SELECT id FROM users WHERE referral_code = $1 AND status = 'active'`,
    [code]);
  const referrerId = ref.rows[0]?.id;
  if (!referrerId) return { ok: false, reason: 'not_found' };

  // خودمعرفی: کسی نباید کد خودش را وارد کند و ۶ چرخش بگیرد.
  if (referrerId === newUserId) return { ok: false, reason: 'self' };

  // فقط یک بار. شرط `referred_by IS NULL` یعنی اگر کاربر قبلاً معرف دارد،
  // این UPDATE هیچ ردیفی را عوض نمی‌کند — به‌جای اینکه معرف قبلی را
  // بازنویسی کند و دور دوم جایزه بدهد.
  const attached = await client.query(
    `UPDATE users SET referred_by = $2, referred_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND referred_by IS NULL
    RETURNING id`, [newUserId, referrerId]);
  if (!attached.rows[0]) return { ok: false, reason: 'already_referred' };

  // جایزه برای **هر دو**. مالک: «هر دو کاربر یعنی هم کسی که دعوت شده هم
  // کسی که دعوت کرده هر دو ۳ شانس گردونه بگیرند».
  await client.query(
    `UPDATE users SET bonus_spins = bonus_spins + $2, updated_at = NOW()
      WHERE id = ANY($1::uuid[])`,
    [[referrerId, newUserId], SPINS_PER_REFERRAL]);

  const n = await invitedCount(referrerId, client);
  return {
    ok: true,
    referrerId,
    spinsAwarded: SPINS_PER_REFERRAL,
    referrerInvites: n,
    referrerDailySpins: dailySpinsFor(n),
  };
}

/**
 * کمیسیون ۵٪ را به معرفِ [userId] می‌دهد — اگر معرفی داشته باشد و منبع
 * کمیسیون‌ساز باشد.
 *
 * گرد کردن **به بالا** است: با نرخ ۵٪، هر امتیاز کمتر از ۲۰ به سمت صفر گرد
 * می‌شد و معرف از ریز-امتیازها — که بیشترِ فعالیت روزمره است — هیچ
 * نمی‌گرفت. سقفش هم ۱ امتیاز در هر رویداد است، پس هزینه‌اش ناچیز است.
 *
 * @returns {Promise<null|{referrerId, earned}>}
 */
async function payCommission(client, userId, basePoints, source) {
  // لیست سفید. منبعی که اینجا نیست، کمیسیون نمی‌سازد — و این پیش‌فرضِ امنی
  // است: قابلیت جدید باید آگاهانه اضافه شود، نه اینکه بی‌سروصدا هزینه بسازد.
  if (!COMMISSIONABLE.has(source)) return null;

  const points = Math.floor(Number(basePoints) || 0);
  // فقط امتیاز مثبت. یک اصلاح منفی نباید از معرف پس بگیرد — او کاری نکرده
  // که جریمه شود.
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

  // THE LEADERBOARD IS A SEPARATE TABLE, AND IT IS WHAT THE LEAGUE READS.
  //
  // `users.monthly_league_points` above feeds the profile screen;
  // `league_leaderboard_entries` feeds the actual standings and the payout.
  // Writing only the first meant a referrer saw their commission on their
  // profile but never moved up the league — the two numbers would drift
  // apart by exactly the commission earned, all month, and the prize would
  // go to the wrong person.
  //
  // Required lazily to avoid a require cycle: leagueService does not import
  // this file today, but it is one refactor away from doing so, and a cycle
  // here would surface as an undefined function at runtime rather than a
  // clear error at load.
  // eslint-disable-next-line global-require
  const { addLeaguePoints } = require('./leagueService');
  await addLeaguePoints(client, referrerId, earned);

  await client.query(
    `INSERT INTO referral_earnings
       (referrer_id, referred_id, base_points, earned_points, source)
     VALUES ($1,$2,$3,$4,$5)`,
    [referrerId, userId, points, earned, String(source).slice(0, 32)]);

  return { referrerId, earned };
}

/** خلاصهٔ معرفی برای صفحهٔ کاربر. */
async function summary(userId) {
  const code = await ensureCode(userId);
  const [invited, earnings, spins, recent] = await Promise.all([
    invitedCount(userId),
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
        WHERE u.referred_by = $1 AND u.status = 'active'
        GROUP BY u.id, u.nickname, u.first_name, u.joined_at
        ORDER BY u.joined_at DESC LIMIT 50`, [userId]),
  ]);

  const daily = dailySpinsFor(invited);
  // چند دعوت دیگر تا چرخش روزانهٔ بعدی. وقتی به سقف رسیده باشد null است تا
  // رابط کاربری «۰ نفر مانده» نشان ندهد.
  const atCap = invited >= MAX_INVITES_FOR_DAILY;
  const toNext = atCap
    ? null
    : INVITES_PER_DAILY_SPIN - (invited % INVITES_PER_DAILY_SPIN);

  return {
    code,
    commissionPercent: COMMISSION_PERCENT,
    spinsPerReferral: SPINS_PER_REFERRAL,
    invitesPerDailySpin: INVITES_PER_DAILY_SPIN,
    maxInvitesForDaily: MAX_INVITES_FOR_DAILY,
    invitedCount: invited,
    totalEarned: earnings.rows[0].total,
    bonusSpins: Number(spins.rows[0]?.bonus_spins) || 0,
    dailySpins: daily,
    invitesToNextDailySpin: toNext,
    atDailyCap: atCap,
    friends: recent.rows.map((r) => ({
      nickname: r.nickname || r.first_name || 'کاربر',
      joinedAt: r.joined_at,
      earnedFromThem: r.earned,
    })),
  };
}

module.exports = {
  ensureCode, attachReferrer, payCommission, summary,
  generateCode, normalizeDigits, dailySpinsFor, invitedCount,
  COMMISSION_PERCENT, SPINS_PER_REFERRAL,
  INVITES_PER_DAILY_SPIN, MAX_INVITES_FOR_DAILY, BASE_DAILY_SPINS,
  COMMISSIONABLE,
};
