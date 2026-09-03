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
const pointLedger = require('./pointService');
const wallet = require('./walletService');
const opsLimits = require('./opsLimits');
const liveContent = require('./liveContent');

/** درصد کمیسیون امتیازی (ثبت کارت و Tap) — از پنل ادمین قابل تنظیم،
 *  پیش‌فرض ۵ مثل ثابتِ قبلی. */
function commissionPercent() {
  return opsLimits.get().referralCommissionPercent;
}
/** سهم نقدی معرف از هر خرید مستقیم دوست، به درصد — از پنل قابل تنظیم. */
function purchaseCommissionPercent() {
  return opsLimits.get().referralPurchaseCommissionPercent;
}
/** آستانهٔ برداشتِ پیش‌فرض — فقط fallback. مقدارِ زنده از ops_limits می‌آید. */
const REFERRAL_WITHDRAWAL_THRESHOLD = 50000;

/** آستانهٔ برداشتِ درآمد نقدی معرف — از پنل ops_limits قابل تنظیم. */
function referralWithdrawalThreshold() {
  return opsLimits.get().referralWithdrawalThreshold || REFERRAL_WITHDRAWAL_THRESHOLD;
}

/** چرخش گردونه برای *هر یک* از دو طرف، به ازای یک معرفی موفق — از پنل
 *  قابل تنظیم، پیش‌فرض ۳ (خواستهٔ مالک). */
function spinsPerReferral() {
  return opsLimits.get().referralSpinsPerInvite;
}

/** به ازای هر این تعداد دعوت، یک چرخش روزانهٔ دائمی اضافه می‌شود. */
function invitesPerDailySpin() {
  return opsLimits.get().referralInvitesPerDailySpin;
}

/** سقف دعوت‌هایی که چرخش روزانه می‌سازند — از پنل قابل تنظیم. بعد از این،
 *  دعوت آزاد است ولی چرخش روزانهٔ بیشتری اضافه نمی‌کند. */
function maxInvitesForDaily() {
  return opsLimits.get().referralMaxInvitesForDaily;
}

/** چرخش روزانهٔ پایه که هر کاربر بدون هیچ دعوتی دارد — از پنل قابل تنظیم. */
function baseDailySpins() {
  return opsLimits.get().referralBaseDailySpins;
}

/**
 * «هر X دعوت = Y چرخش روزانه» — این Y از اعدادِ زنده می‌آید.
 *
 * تا این فاز، Y همیشه ۱ بود و عددِ «۱» در متن راهنمای وب/اندروید سفت بود.
 * حالا ادمین می‌تواند Y را از پنل (فاز ۳) عوض کند و همان راهنما بدون
 * آپدیت آپدیت می‌شود؛ مقدار پیش‌فرض ۱ است تا اقتصادِ فعلی دست‌نخورده بماند.
 */
function spinsPerDailyThreshold() {
  return liveContent.rules().spinsPerDailyThreshold;
}

/**
 * منابعِ **امتیازی** که کمیسیون می‌سازند.
 *
 * دامنهٔ نهایی به‌خواستِ مالک — دو نوع کمیسیونِ کاملاً جدا:
 *
 *   ۱. کمیسیونِ **امتیازی** (همین لیست، ۵٪): از فعالیتِ امتیازیِ کاربرِ
 *      دعوت‌شده به معرف امتیاز می‌رسد. دو منبع دارد:
 *        - `tap`  → بازیِ ضربه‌زنِ دوستان
 *        - `card` → ثبتِ کارت توسط دوستان (هر دو مسیر: کدِ ساده و عکسی)
 *
 *   ۲. کمیسیونِ **نقدی** (`payPurchaseCommission`، ۵٪): فقط از فروشِ
 *      شاپ (`shop_item` | `plus_monthly` | `plus_annual`) و به کیف پول.
 *
 *      از دور ۱۸ این خریدها **۱۰۰٪ از کافه‌بازار** انجام می‌شوند، نه از
 *      موجودی کیف پول. یعنی هر کمیسیونی که اینجا پرداخت می‌شود پشتش یک
 *      پرداختِ واقعیِ تأییدشده توسط بازار وجود دارد — دیگر ممکن نیست
 *      کسی با جایزهٔ لیگ آیتم بخرد و برای معرفش کمیسیون بسازد.
 *
 *      مبلغِ مرجع، **قیمتِ کاملی** است که کاربر در بازار پرداخته
 *      (تصمیم مالک)، نه سهم خالصِ ما پس از کسر ~۳۰٪ کارمزد بازار. روی
 *      پلاس ۵۹٬۰۰۰ تومانی معرف ۲٬۹۵۰ می‌گیرد در حالی که سهم ما ۴۱٬۳۰۰
 *      است. آگاهانه سخاوتمندانه: عددی که کاربر می‌بیند همان عددی است که
 *      ۵٪ رویش حساب می‌شود.
 *
 * ⚠️ استثنای مهم — «کارتِ نقدی»:
 *
 *   کارتی که `card_types.cash_amount > 0` دارد، هنگام ثبت مستقیماً پولِ
 *   نقد به کیف پولِ کاربر می‌ریزد (`walletService.credit`, source
 *   `card_cash`). این کارت‌ها را **تیم** در سیستم ثبت می‌کند و بودجهٔ
 *   نقدیِ ثابتی دارند؛ اگر بابتشان کمیسیون هم پرداخت شود، هر کارتِ نقد
 *   دو بار از بودجه خرج برمی‌دارد. پس مالک صریحاً خواست:
 *
 *     «از کارت‌های نقدی که تیم ثبت می‌کند، دوستانِ کاربر کمیسیون نگیرند.»
 *
 *   این شرط اینجا اعمال نمی‌شود بلکه در **محلِ فراخوانی** است، چون فقط
 *   آنجا مقدارِ `cash_amount` در دسترس است. هر دو مسیرِ ثبتِ کارت
 *   (`server.js` → `POST /api/cards/redeem` و `photoCardService.js`)
 *   قبل از صدا زدنِ `payCommission` بررسی می‌کنند که
 *   `Number(card.cash_amount || 0) === 0` باشد.
 *
 * لیست سفید است نه سیاه: هر منبعی که اینجا نباشد کمیسیون نمی‌سازد —
 * پیش‌فرضِ امنی است، چون قابلیتِ جدید باید آگاهانه هزینه بسازد.
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
 * «پایه + (دعوت‌های شمرده ÷ آستانه) × ضریب» — پایه و آستانه در
 * ops_limits، و ضریب (live_rules.spinsPerDailyThreshold) از پنل: «هر آستانه = چند چرخش».
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
  const counted = Math.min(safe, maxInvitesForDaily());
  // ضریبِ «هر آستانه = چند چرخش» از اعدادِ زنده (live_rules) — پیش‌فرض ۱،
  // یعنی اقتصادِ فعلی دست‌نخورده؛ ادمین از پنل هر آستانه را به ۲ یا ۳
  // برساند، راهنمای دعوت (live_copy) هم هم‌زمان همان عدد تازه را چاپ
  // می‌کند چون هر دو از یک منبع می‌خوانند.
  return baseDailySpins()
    + Math.floor(counted / invitesPerDailySpin()) * spinsPerDailyThreshold();
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
    [[referrerId, newUserId], spinsPerReferral()]);

  const n = await invitedCount(referrerId, client);
  return {
    ok: true,
    referrerId,
    spinsAwarded: spinsPerReferral(),
    referrerInvites: n,
    referrerDailySpins: dailySpinsFor(n),
  };
}

/**
 * کمیسیونِ **امتیازی** ۵٪ به معرفِ کاربر.
 *
 * فعال برای منابعِ داخلِ `COMMISSIONABLE` (یعنی `card` و `tap`):
 * وقتی کاربرِ دعوت‌شده کارت ثبت می‌کند یا در بازیِ ضربه‌زن امتیاز
 * می‌گیرد، معرفش ۵٪ آن را به‌صورت **امتیاز** دریافت می‌کند.
 *
 * جدا از `payPurchaseCommission` است که کمیسیونِ **نقدی** فروشِ شاپ را
 * به کیف پول می‌ریزد. دو مسیر عمداً از هم مستقل‌اند: یکی امتیاز است و
 * زنجیره‌ای نیست، دیگری پول است و idempotent روی جدولِ جداگانه.
 *
 * ⚠️ کارتِ نقدی (`card_types.cash_amount > 0`) از این مسیر مستثناست —
 * شرطش در محلِ فراخوانی است، نه اینجا. توضیح کامل بالای `COMMISSIONABLE`.
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

  const earned = Math.ceil(points * commissionPercent() / 100);
  if (earned <= 0) return null;

  // معرف باید هنوز فعال باشد؛ اکانت مسدود نباید امتیاز جمع کند.
  const active = await client.query(
    `SELECT 1 FROM users WHERE id = $1 AND status = 'active'`, [referrerId]);
  if (!active.rows[0]) return null;

  // کمیسیون هم در دفتر ثبت می‌شود: مالک باید بتواند ببیند چه کسی از
  // معرفی چقدر گرفته — هم برای پاسخ به سؤال، هم برای کشفِ حلقه‌های
  // تقلبیِ دعوت.
  await pointLedger.credit(client, {
    userId: referrerId,
    points: earned,
    source: 'referral',
    referenceType: 'users',
    referenceId: userId,
    description: `کمیسیون ${commissionPercent()}٪ معرفی`,
    // `addLeaguePoints` پایین‌تر جدولِ لیگ را جدا به‌روز می‌کند، ولی
    // `users.monthly_league_points` را همین‌جا باید زیاد کنیم چون
    // صفحهٔ پروفایل از آن می‌خواند.
  });

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

/**
 * ۵٪ یک خرید واقعی را همان داخل تراکنش خرید به کیف پول معرف مستقیم واریز
 * می‌کند. ابتدا سند یکتای کمیسیون رزرو می‌شود و بعد wallet credit می‌خورد؛
 * بنابراین retry همان purchase هیچ‌وقت دوباره پول تولید نمی‌کند و rollback
 * هر کدام، خرید/کمیسیون/دفترکل را با هم برمی‌گرداند.
 */
async function payPurchaseCommission(
  client,
  { buyerId, purchaseType, purchaseReferenceId, purchaseAmount,
    gatewayProvider = null },
) {
  const amount = Math.floor(Number(purchaseAmount) || 0);
  if (amount <= 0 || !purchaseReferenceId) return null;
  if (!['shop_item', 'plus_monthly', 'plus_annual'].includes(purchaseType)) {
    throw new Error('نوع خرید برای کمیسیون معرفی معتبر نیست');
  }

  const buyer = await client.query(
    `SELECT u.referred_by
       FROM users u
      WHERE u.id=$1 AND u.status='active'`,
    [buyerId],
  );
  const referrerId = buyer.rows[0]?.referred_by;
  if (!referrerId || String(referrerId) === String(buyerId)) return null;

  const active = await client.query(
    `SELECT 1 FROM users WHERE id=$1 AND status='active'`, [referrerId]);
  if (!active.rows[0]) return null;

  const pct = purchaseCommissionPercent();
  const rate = pct / 100;
  const earned = Math.floor(amount * pct / 100);
  if (earned <= 0) return null;

  const reserved = await client.query(
    `INSERT INTO purchase_referral_commissions
       (referrer_id, referred_user_id, purchase_type, purchase_reference_id,
        purchase_amount, commission_rate, commission_amount, gateway_provider)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT(purchase_type, purchase_reference_id) DO NOTHING
     RETURNING id`,
    [referrerId, buyerId, purchaseType, purchaseReferenceId, amount, rate,
      earned, gatewayProvider],
  );
  if (!reserved.rows[0]) return { duplicate: true, referrerId, earned: 0 };

  const credited = await wallet.credit(client, {
    userId: referrerId,
    amount: earned,
    source: 'purchase_referral',
    referenceType: purchaseType,
    referenceId: purchaseReferenceId,
    description: `کمیسیون ${rate}٪ خرید مستقیم دوست (${purchaseType})`,
  });
  if (credited.duplicate) {
    // The ledger is the final idempotency guard. Backfill the audit link if a
    // legacy/manual repair had created the wallet row first.
    await client.query(
      `UPDATE purchase_referral_commissions
          SET wallet_transaction_id=$2 WHERE id=$1`,
      [reserved.rows[0].id, credited.transaction.id],
    );
    return { duplicate: true, referrerId, earned: 0 };
  }
  await client.query(
    `UPDATE purchase_referral_commissions
        SET wallet_transaction_id=$2 WHERE id=$1`,
    [reserved.rows[0].id, credited.transaction.id],
  );
  return {
    duplicate: false,
    referrerId,
    earned,
    walletTransactionId: credited.transaction.id,
  };
}

/** ریزسندهای نقدی برای حسابرسی مدیر؛ هیچ تغییری در دفترکل نمی‌دهد. */
async function purchaseCommissionAudit({ limit = 100, offset = 0 } = {}) {
  const n = Math.max(1, Math.min(500, Math.floor(Number(limit) || 100)));
  const o = Math.max(0, Math.floor(Number(offset) || 0));
  const { rows } = await pool.query(
    `SELECT c.id, c.purchase_type, c.purchase_reference_id,
            c.purchase_amount, c.commission_rate, c.commission_amount,
            c.wallet_transaction_id, c.created_at,
            r.nickname AS referrer_nickname, r.mobile AS referrer_mobile,
            b.nickname AS buyer_nickname, b.mobile AS buyer_mobile
       FROM purchase_referral_commissions c
       JOIN users r ON r.id=c.referrer_id
       JOIN users b ON b.id=c.referred_user_id
      ORDER BY c.created_at DESC LIMIT $1 OFFSET $2`,
    [n, o],
  );
  const total = await pool.query(
    `SELECT COUNT(*)::int AS count,
            COALESCE(SUM(commission_amount),0)::bigint AS amount
       FROM purchase_referral_commissions`,
  );
  return {
    rows: rows.map((row) => ({
      ...row,
      purchase_amount: Number(row.purchase_amount),
      commission_amount: Number(row.commission_amount),
      commission_rate: Number(row.commission_rate),
    })),
    totalCount: Number(total.rows[0]?.count || 0),
    totalCommission: Number(total.rows[0]?.amount || 0),
  };
}

/** خلاصهٔ معرفی برای صفحهٔ کاربر. */
async function summary(userId) {
  const code = await ensureCode(userId);
  const [invited, earnings, cashEarnings, spins, recent, walletRow, walletSettings] = await Promise.all([
    invitedCount(userId),
    pool.query(
      `SELECT COALESCE(SUM(earned_points),0)::int AS total
         FROM referral_earnings WHERE referrer_id = $1`, [userId]),
    pool.query(
      `SELECT COALESCE(SUM(commission_amount),0)::bigint AS total,
              COUNT(*)::int AS purchase_count
         FROM purchase_referral_commissions WHERE referrer_id=$1`, [userId]),
    pool.query('SELECT bonus_spins FROM users WHERE id = $1', [userId]),
    pool.query(
      `SELECT u.nickname, u.first_name, u.joined_at,
              COALESCE((SELECT SUM(e.earned_points)
                          FROM referral_earnings e
                         WHERE e.referred_id=u.id AND e.referrer_id=$1),0)::int AS earned,
              COALESCE((SELECT SUM(c.commission_amount)
                          FROM purchase_referral_commissions c
                         WHERE c.referred_user_id=u.id AND c.referrer_id=$1),0)::bigint AS cash_earned
         FROM users u
        WHERE u.referred_by = $1 AND u.status = 'active'
        ORDER BY u.joined_at DESC LIMIT 50`, [userId]),
    pool.query('SELECT wallet_balance FROM users WHERE id=$1', [userId]),
    wallet.getWalletSettings(),
  ]);

  const daily = dailySpinsFor(invited);
  // چند دعوت دیگر تا چرخش روزانهٔ بعدی. وقتی به سقف رسیده باشد null است تا
  // رابط کاربری «۰ نفر مانده» نشان ندهد.
  const atCap = invited >= maxInvitesForDaily();
  const toNext = atCap
    ? null
    : invitesPerDailySpin() - (invited % invitesPerDailySpin());

  return {
    code,
    commissionPercent: commissionPercent(),
    purchaseCommissionPercent: purchaseCommissionPercent(),
    withdrawalThreshold: Number(
      walletSettings.minWithdrawal || referralWithdrawalThreshold(),
    ),
    walletBalance: Number(walletRow.rows[0]?.wallet_balance || 0),
    cashCommissionEarned: Number(cashEarnings.rows[0]?.total || 0),
    commissionedPurchases: Number(cashEarnings.rows[0]?.purchase_count || 0),
    cashWithdrawReady: Number(walletRow.rows[0]?.wallet_balance || 0)
      >= Number(walletSettings.minWithdrawal || referralWithdrawalThreshold()),
    spinsPerReferral: spinsPerReferral(),
    invitesPerDailySpin: invitesPerDailySpin(),
    maxInvitesForDaily: maxInvitesForDaily(),
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
      cashEarnedFromThem: Number(r.cash_earned || 0),
    })),
  };
}

module.exports = {
  ensureCode, attachReferrer, payCommission, payPurchaseCommission,
  purchaseCommissionAudit, summary,
  generateCode, normalizeDigits, dailySpinsFor, invitedCount,
  commissionPercent, purchaseCommissionPercent,
  REFERRAL_WITHDRAWAL_THRESHOLD, referralWithdrawalThreshold,
  spinsPerReferral,
  // نام قدیمی که auth.js هنوز صدا می‌زند — alias زنده‌ی spinsPerReferral.
  get SPINS_PER_REFERRAL() { return spinsPerReferral(); },
  invitesPerDailySpin, maxInvitesForDaily, baseDailySpins,
  spinsPerDailyThreshold,
  COMMISSIONABLE,
};
