// ═══════════════════════════════════════════════════════════════════════════
// سرویس سکه — ارزِ مهارتِ لیگ
// ═══════════════════════════════════════════════════════════════════════════
//
// سکه فقط از یک جا می‌آید: بردنِ یک مسابقهٔ آنلاینِ شرط‌دار مقابل یک انسانِ
// واقعی (به‌علاوهٔ لول‌های بازی ضربه‌زن). هر مسیرِ دیگری صفر است و این تصمیم
// عمدی است، نه فراموشی:
//
//   ربات      → صفر. ربات را می‌شود بی‌نهایت بار برد.
//   بازی رایگان→ صفر. اگر چیزی خرج نشود، سکه از هیچ ساخته می‌شود.
//   مساوی     → سکهٔ مساوی (طبق جدولِ تنظیم‌شده توسط ادمین).
//   باخت      → سکهٔ باختِ کوچک (طبق جدولِ تنظیم‌شده توسط ادمین).
//
// ── چرا سکه هرگز کسر نمی‌شود ──
//
// یک نسخهٔ اولیه «سکه از بازنده کم شود» را در نظر داشت. رد شد: بازنده
// همین حالا stake را از دست داده و کسرِ سکه یعنی دو بار جریمه. بدتر، صدرِ
// جدول آن‌وقت به‌جای «چه کسی بیشتر برده» می‌شد «چه کسی جرأت نکرده بازی
// کند» — دقیقاً برعکسِ چیزی که لیگ باید تشویق کند.
//
// ═══════════════════════════════════════════════════════════════════════════
// تنظیم‌پذیری توسط ادمین (خواستهٔ مالک — دورِ ۳۳)
// ═══════════════════════════════════════════════════════════════════════════
//
// جدولِ سکه، سهمیهٔ روزانه و سکهٔ هر لولِ ضربه‌زن حالا از
// `gameEconomyService` می‌آیند و ادمین در پنل (وب/اندروید) عوضشان می‌کند.
// پیش‌فرض‌ها دقیقاً همان اعدادِ قبلی‌اند. کلاینت‌ها متن‌هایشان را از
// `/api/config` می‌سازند، پس نوشته‌ها بدونِ آپدیتِ اپ عوض می‌شوند.

const { pool } = require('../config/db');

const economy = require('./gameEconomyService');

// جدولِ پیش‌فرض — فقط fallback است وقتی تنظیمِ سفارشی هنوز بارگذاری نشده.
//
// نسبتِ ۱:۱۰ بینِ دو سطحِ شرط عمدی است و با نسبتِ خودِ شرط (۱۰۰ به ۱۰۰۰)
// یکی است، تا هیچ سطحی «کارآمدتر» نباشد و بازیکن بر اساس سلیقه انتخاب کند
// نه بهینه‌سازی. (از دورِ ۲۶ هر سه بازی یکسان‌اند.)
const COIN_TABLE = Object.freeze(economy.DEFAULTS.coinRewards);

const ZERO_REWARD = Object.freeze({ win: 0, draw: 0, loss: 0 });

// سهمیهٔ روزانه، **مشترک بینِ هر سه بازی** — fallbackِ پیش‌فرض.
const DAILY_QUOTA = Object.freeze({ 100: 30, 1000: 15 });

const QUOTA_STAKES = Object.freeze([100, 1000]);

// ── تصویرِ لحظه‌ایِ تنظیمات اقتصاد ─────────────────────────────────────
//
// توابعِ سینک (coinRewardFor و…) نمی‌توانند await کنند؛ پس از یک تصویرِ
// کش‌شده استفاده می‌کنیم که در پس‌زمینه تازه می‌شود. اگر هنوز نیامده
// (یا دیتابیس در دسترس نباشد — مثلِ تست‌های واحد) جدولِ پیش‌فرض می‌افتد.
// مسیرهای async (سهمیهٔ روزانه) مستقیم از سرویس می‌خوانند.
let snapshot = null; // { at, value }
function snapshotEconomy() {
  const now = Date.now();
  if (!snapshot || now - snapshot.at > 15000) {
    // ⚠️ مقدار قبلی را پاک نکن. نسخهٔ اول `value: null` می‌گذاشت و
    //    همان تیک برمی‌گشت — یعنی هر ۱۵ ثانیه، *اولین* مسابقه‌ای که
    //    تسویه می‌شد جدولِ پیش‌فرض می‌گرفت نه عددِ ادمین. `then` حتی
    //    اگر load از کشِ حافظه جواب بدهد، بعد از این فراخوانی اجرا
    //    می‌شود. مقدار کهنه تا جواب تازه برسد درست‌تر از پیش‌فرض است.
    const previous = snapshot?.value || null;
    snapshot = { at: now, value: previous };
    economy.load()
      .then(value => { snapshot = { at: Date.now(), value }; })
      .catch(() => { /* مقدار قبلی یا پیش‌فرض می‌ماند */ });
  }
  return snapshot.value;
}

/**
 * روزِ تقویمیِ تهران به شکل YYYY-MM-DD.
 *
 * ⚠️ چرا نه `new Date().toISOString().slice(0,10)`:
 *    آن UTC می‌دهد. تهران +۳:۳۰ است، پس سهمیهٔ کاربر ساعت ۳:۳۰ بامداد ریست
 *    می‌شد — وسطِ شب، در حالی که کاربر هنوز بیدار است و بازی می‌کند. از دیدِ
 *    او سهمیه «تصادفی» برمی‌گشت.
 *
 * ⚠️ چرا نه محاسبهٔ دستیِ +۳:۳۰:
 *    ایران از ۱۴۰۱ ساعتِ تابستانی را حذف کرده، ولی این تابع نباید به آن
 *    تصمیمِ سیاسی وابسته باشد. `Intl` جدولِ tz سیستم را می‌خواند و اگر
 *    روزی برگردد، خودش درست می‌ماند.
 */
function tehranDate(now = new Date()) {
  // en-CA چون خروجی‌اش دقیقاً YYYY-MM-DD است — نه MM/DD/YYYY.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/**
 * پاداشِ سکهٔ یک بازی در یک سطحِ شرط، برای هر سه نتیجه.
 *
 * همیشه یک شیء برمی‌گرداند (هرگز null) تا فراخواننده مجبور نباشد قبل از
 * `.win` بررسیِ وجود بکند؛ ترکیبِ ناشناخته صرفاً صفر می‌دهد.
 *
 * @returns {{win:number, draw:number, loss:number}}
 */
function coinRewardFor(gameId, stake) {
  const table = snapshotEconomy()?.coinRewards || COIN_TABLE;
  const row = table[gameId];
  if (!row) return ZERO_REWARD;
  const entry = row[Number(stake)];
  if (!entry) return ZERO_REWARD;
  // عددهای تنظیم‌شده ممکن است صفر باشند (ادمین «باخت = ۰ سکه» بگذارد)؛
  // ساختار را دست‌نخورده برمی‌گردانیم تا مصرف‌کننده‌ها `0` ببینند نه `undefined`.
  return {
    win: Number.isFinite(Number(entry.win)) ? Number(entry.win) : ZERO_REWARD.win,
    draw: Number.isFinite(Number(entry.draw)) ? Number(entry.draw) : ZERO_REWARD.draw,
    loss: Number.isFinite(Number(entry.loss)) ? Number(entry.loss) : ZERO_REWARD.loss,
  };
}

/**
 * پاداشِ یک نتیجهٔ مشخص، به عدد.
 *
 * @param {'win'|'draw'|'loss'} outcome
 */
function coinFor(gameId, stake, outcome) {
  const r = coinRewardFor(gameId, stake);
  return Number(r[outcome] || 0);
}

/**
 * آیا این ترکیب اصلاً سکه‌ای در بر دارد؟
 *
 * جایگزینِ الگوی قدیمیِ `coinRewardFor(...) > 0` که حالا روی یک شیء
 * اعمال می‌شد و **همیشه false** می‌داد — خطایی که بی‌سروصدا سهمیه را
 * مصرف‌نشده می‌گذاشت و کلِ سیستمِ سکه را خاموش می‌کرد.
 */
function hasCoinReward(gameId, stake) {
  const r = coinRewardFor(gameId, stake);
  return r.win > 0 || r.draw > 0 || r.loss > 0;
}

// ── سکهٔ بازیِ ضربه‌زن ──────────────────────────────────────────────────
//
// هر لولِ تمام‌شده به‌طورِ ثابت `tapCoinsPerLevel` سکه می‌دهد (پیش‌فرضِ
// مالک: «هر لول ۵ سکه»). جمعِ کلِ مسیرِ ۵۰ لولی **۲۵۰ سکه** است.
//
// ⚠️ عدد از `gameEconomyService` می‌آید و ادمین در پنل عوضش می‌کند؛
//    متنِ راهنمای داخلِ اپ/وب هم از همان عدد ساخته می‌شود (بدون آپدیت).
//
// ⚠️ ضربه‌زن **فصلی نیست** — پیشرفتِ لول با پایانِ فصل صفر نمی‌شود.
//    خواستهٔ صریحِ مالک: «چون اصلا در یک ماه به پایانش ممکنه نرسن چون
//    لول های بالا سخت تره». سکهٔ ضربه‌زن هم یک‌بار در طولِ عمرِ حساب
//    گرفته می‌شود، نه هر ماه.
const TAP_LEVELS_PER_COIN_STEP = 5; // سازگاری قدیمی؛ منبعِ حقیقت اکنون تنظیمات است

/** سکهٔ یک لولِ مشخصِ ضربه‌زن. لولِ نامعتبر ⇒ صفر. */
function tapLevelCoin(level) {
  const lv = Math.trunc(Number(level) || 0);
  if (lv < 1) return 0;
  const perLevel = snapshotEconomy()?.tapCoinsPerLevel;
  const n = Number.isFinite(Number(perLevel)) ? Number(perLevel) : 5;
  return n;
}

/** جمعِ سکهٔ چند لول. */
function tapCoinsFor(levels) {
  if (!Array.isArray(levels)) return 0;
  return levels.reduce((s, lv) => s + tapLevelCoin(lv), 0);
}

/** آیا این سطحِ شرط اصلاً سهمیه مصرف می‌کند؟ (۵۰۰۰ لابی سکه ندارد) */
function quotaTracked(stake) {
  return QUOTA_STAKES.includes(Number(stake));
}

const quotaColumn = stake => (Number(stake) === 1000 ? 'used_1000' : 'used_100');
const quotaLimit = stake => DAILY_QUOTA[Number(stake)] || 0;

function createCoinService(db = pool) {
  /**
   * سهمیهٔ مصرف‌شده و باقی‌ماندهٔ امروزِ یک کاربر — فقط خواندن.
   * برای نمایشِ چشمی در کلاینت.
   */
  async function getQuota(userId, now = new Date()) {
    const date = tehranDate(now);
    const cfg = await economy.load().catch(() => null);
    const limits = cfg?.dailyCoinQuota || DAILY_QUOTA;
    const { rows } = await db.query(
      `SELECT used_100, used_1000 FROM user_coin_quota
        WHERE user_id=$1 AND quota_date=$2`, [userId, date]);
    const used100 = Number(rows[0]?.used_100 || 0);
    const used1000 = Number(rows[0]?.used_1000 || 0);
    return {
      date,
      used: { 100: used100, 1000: used1000 },
      limit: { 100: limits[100], 1000: limits[1000] },
      remaining: {
        100: Math.max(0, limits[100] - used100),
        1000: Math.max(0, limits[1000] - used1000),
      },
    };
  }

  /**
   * یک واحد از سهمیهٔ امروز را مصرف می‌کند. **باید داخلِ تراکنشِ رزرو**
   * صدا زده شود و `client` همان کلاینتِ تراکنش باشد.
   *
   * @returns {Promise<boolean>} true اگر سهمیه داشت و مصرف شد.
   *
   * ── چرا مصرف در «شروع» و نه در «برد» ──
   *
   * اگر سهمیه موقعِ برد کم می‌شد، بازیکن می‌توانست بی‌نهایت بازی کند و فقط
   * بردها بشمارند — یعنی سقف عملاً سقفِ «برد» بود نه سقفِ «فعالیت»، و دو
   * حسابِ هماهنگ می‌توانستند نوبتی ببرند و هر دو سقف را پر کنند. با کسر در
   * شروع، هر مسابقه از سهمیهٔ **هر دو** طرف خرج می‌کند و تبانی دو برابر
   * گران می‌شود.
   *
   * ── چرا این کوئری اتمیک است ──
   *
   * الگوی INSERT…ON CONFLICT…WHERE در یک دستور هم ردیف را می‌سازد و هم
   * شرطِ سقف را بررسی می‌کند. `rowCount` صفر یعنی سقف پر بوده. اگر به‌جایش
   * SELECT-سپس-UPDATE می‌نوشتیم، دو مسابقهٔ هم‌زمانِ همان کاربر می‌توانستند
   * هر دو آخرین واحدِ سهمیه را ببینند و سقف یکی رد شود.
   */
  async function consumeQuota(client, userId, stake, now = new Date()) {
    if (!quotaTracked(stake)) return false;
    const col = quotaColumn(stake);
    // سقف از تنظیماتِ ادمین؛ اگر دیتابیسِ تنظیمات در دسترس نبود (تستِ واحد)،
    // سقفِ پیش‌فرض.
    const cfg = await economy.load().catch(() => null);
    const limit = cfg?.dailyCoinQuota
      ? Number(cfg.dailyCoinQuota[Number(stake)] ?? quotaLimit(stake))
      : quotaLimit(stake);
    const date = tehranDate(now);
    const other = col === 'used_100' ? 'used_1000' : 'used_100';

    const { rowCount } = await client.query(
      `INSERT INTO user_coin_quota (user_id, quota_date, ${col}, ${other})
            VALUES ($1, $2, 1, 0)
       ON CONFLICT (user_id, quota_date) DO UPDATE
              SET ${col} = user_coin_quota.${col} + 1,
                  updated_at = NOW()
            WHERE user_coin_quota.${col} < $3`,
      [userId, date, limit]);
    return rowCount > 0;
  }

  /**
   * برگشتِ یک واحد سهمیه — وقتی مسابقه بدونِ نتیجه رها شده.
   *
   * `GREATEST(0, …)` لازم است چون اگر روزِ تهران بینِ شروع و برگشت عوض شده
   * باشد، ردیفِ امروز ممکن است اصلاً آن مصرف را نداشته باشد. آن‌وقت بدونِ
   * محافظ، شمارنده منفی می‌شد و CHECK می‌شکست و کلِ برگشتِ امتیاز
   * rollback می‌شد — یعنی یک بازیِ نیمه‌کاره، امتیازِ کاربر را می‌بلعید.
   * ⚠️ این سناریو واقعی است: مسابقهٔ ناتمام تا ۶۰ دقیقه بعد refund می‌شود،
   *    و ۶۰ دقیقه به‌راحتی از نیمه‌شب رد می‌شود.
   */
  async function releaseQuota(client, userId, stake, date) {
    if (!quotaTracked(stake) || !date) return;
    const col = quotaColumn(stake);
    await client.query(
      `UPDATE user_coin_quota
          SET ${col} = GREATEST(0, ${col} - 1), updated_at = NOW()
        WHERE user_id = $1 AND quota_date = $2`,
      [userId, date]);
  }

  /**
   * سکه را به برندهٔ فصلِ جاری اضافه می‌کند.
   *
   * دو نوشتن در یک تراکنش:
   *   league_leaderboard_entries.coins ← حقیقتِ رتبه‌بندی
   *   users.coins                      ← شمارندهٔ نمایشیِ سریع
   *
   * ⚠️ ردیفِ leaderboard ممکن است هنوز وجود نداشته باشد (کاربری که امتیازِ
   *    لیگ نگرفته ولی مسابقه برده). پس INSERT…ON CONFLICT، نه UPDATE.
   *    نسخهٔ اولِ این تابع UPDATE بود و سکهٔ چنین کاربرانی **بی‌صدا گم**
   *    می‌شد — تازه‌واردی که اولین کارش بردِ یک مسابقه بود، هیچ سکه‌ای
   *    نمی‌گرفت.
   *
   * ⚠️ شرطِ فصل دقیقاً مثل addLeaguePoints است (starts_at/ends_at)، ولی
   *    عمداً `ensureActiveSeason` صدا **نمی‌زند**: اگر هیچ لیگی فعال نیست،
   *    سکه هم جایی برای رفتن ندارد و ساختنِ یک لیگِ خودکار وسطِ تسویهٔ یک
   *    مسابقه، عوارضِ ناخواسته دارد. شمارندهٔ users.coins هم در آن حالت
   *    دست‌نخورده می‌ماند تا با حقیقت نخواند.
   *
   * @returns {Promise<number>} سکهٔ واقعاً اضافه‌شده (۰ اگر لیگی فعال نبود)
   */
  async function awardCoins(client, userId, amount) {
    // ⚠️ `Number.isFinite` لازم است و تزئینی نیست: `Math.trunc(Infinity)`
    //    خودِ `Infinity` است و `Math.max(0, Infinity)` هم همین‌طور، پس یک
    //    مقدارِ بی‌نهایت از گاردِ `|| 0` **رد می‌شود** و مستقیم به کوئری
    //    می‌رسد. آنجا یا ستونِ integer خطا می‌دهد و کلِ تسویهٔ مسابقه
    //    rollback می‌شود (بازیکن پاتش را نمی‌گیرد)، یا بدتر، عددی نامعقول
    //    در جدولِ رتبه‌بندی می‌نشیند. تستِ testCoins.js این را می‌پاید.
    const n = Number(amount);
    if (!Number.isFinite(n)) return 0;
    const coins = Math.max(0, Math.trunc(n));
    if (!coins) return 0;

    const { rowCount } = await client.query(
      `INSERT INTO league_leaderboard_entries (league_season_id, user_id, points, coins)
       SELECT s.id, $1, 0, $2
         FROM league_seasons s
        WHERE s.status = 'active'
          AND s.starts_at <= NOW()
          AND s.ends_at   >  NOW()
          AND (s.plus_only = false OR EXISTS (
                SELECT 1 FROM user_subscriptions us
                 WHERE us.user_id = $1 AND us.expires_at > NOW()))
          AND (s.min_points_entry = 0 OR EXISTS (
                SELECT 1 FROM users u
                 WHERE u.id = $1 AND u.lifetime_points >= s.min_points_entry))
        ON CONFLICT (league_season_id, user_id)
        DO UPDATE SET coins = league_leaderboard_entries.coins + EXCLUDED.coins,
                      updated_at = NOW()`,
      [userId, coins]);

    if (!rowCount) return 0;

    await client.query(
      'UPDATE users SET coins = coins + $2, updated_at = NOW() WHERE id = $1',
      [userId, coins]);
    return coins;
  }

  /**
   * هرسِ ردیف‌های سهمیهٔ قدیمی. بدونِ این، جدول به ازای هر کاربرِ فعال
   * روزی یک ردیف رشد می‌کند و هیچ‌وقت کوچک نمی‌شود.
   * ۷ روز نگه می‌داریم تا اگر لازم شد بشود دیروز را بررسی کرد.
   */
  async function pruneQuota(keepDays = 7) {
    const days = Math.max(1, Math.trunc(Number(keepDays) || 7));
    const { rowCount } = await db.query(
      `DELETE FROM user_coin_quota
        WHERE quota_date < (CURRENT_DATE - ($1::text || ' days')::interval)`,
      [days]);
    return rowCount || 0;
  }

  return {
    getQuota, consumeQuota, releaseQuota, awardCoins, pruneQuota,
  };
}

module.exports = {
  ...createCoinService(),
  createCoinService,
  coinRewardFor,
  coinFor,
  hasCoinReward,
  tapLevelCoin,
  tapCoinsFor,
  TAP_LEVELS_PER_COIN_STEP,
  quotaTracked,
  tehranDate,
  COIN_TABLE,
  DAILY_QUOTA,
};
