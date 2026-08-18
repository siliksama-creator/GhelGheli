// ═══════════════════════════════════════════════════════════════════════════
// سرویس سکه — ارزِ مهارتِ لیگ
// ═══════════════════════════════════════════════════════════════════════════
//
// سکه فقط از یک جا می‌آید: بردنِ یک مسابقهٔ آنلاینِ شرط‌دار مقابل یک انسانِ
// واقعی. هر مسیرِ دیگری صفر است و این تصمیم عمدی است، نه فراموشی:
//
//   ربات      → صفر. ربات را می‌شود بی‌نهایت بار برد.
//   بازی رایگان→ صفر. اگر چیزی خرج نشود، سکه از هیچ ساخته می‌شود.
//   مساوی     → صفر. مساوی «برد» نیست و ورودی‌اش هم کامل برمی‌گردد.
//   باخت      → صفر. سکه هرگز کم نمی‌شود؛ فقط ریست فصلی دارد.
//
// ── چرا سکه هرگز کسر نمی‌شود ──
//
// یک نسخهٔ اولیه «سکه از بازنده کم شود» را در نظر داشت. رد شد: بازنده
// همین حالا stake را از دست داده و کسرِ سکه یعنی دو بار جریمه. بدتر، صدرِ
// جدول آن‌وقت به‌جای «چه کسی بیشتر برده» می‌شد «چه کسی جرأت نکرده بازی
// کند» — دقیقاً برعکسِ چیزی که لیگ باید تشویق کند.

const { pool } = require('../config/db');

// ── جدولِ پاداش ──
//
// نسبتِ ۱:۱۰ بینِ دو سطحِ شرط عمدی است و با نسبتِ خودِ شرط (۱۰۰ به ۱۰۰۰)
// یکی است، تا هیچ سطحی «کارآمدتر» نباشد و بازیکن بر اساس سلیقه انتخاب کند
// نه بهینه‌سازی.
//
// دوئل کارت دو برابرِ بقیه می‌دهد چون طولانی‌ترین بازی است (۵ دور × ۲۰
// ثانیه) و بیشترین تصمیمِ واقعی را دارد. پنالتی و جفت‌یاب سریع‌ترند، پس
// اگر پاداشِ برابر می‌دادند، دوئل کارت عملاً متروک می‌شد.
// ── بازنویسیِ دورِ ۲۶: پاداشِ سه‌حالته و برابر بینِ بازی‌ها ──────────────
//
// جدولِ قبلی دو مشکل داشت که هر دو در بازیِ واقعی دیده شدند:
//
// ۱. **فقط برنده سکه می‌گرفت.** بازنده از یک مسابقهٔ نزدیک و خوب دقیقاً
//    صفر می‌گرفت. چون سهمیه در **شروع** خرج می‌شود، باختن یعنی سهمیه رفته
//    و هیچ نگرفته‌ای — و بهترین راهبردِ ممکن این می‌شد که وقتی بازی را
//    عقب هستی رها کنی. حالا باخت هم سکه دارد (کم، ولی نه صفر).
//
// ۲. **دوئل کارت دو برابر می‌داد.** منطقش «طولانی‌تر است» بود، ولی نتیجه‌اش
//    این شد که پنالتی و جفت‌یاب از نظرِ سکه بی‌معنا شدند. حالا هر سه بازی
//    یکسان‌اند و انتخابِ بازی سلیقه‌ای است نه بهینه‌سازی — همان چیزی که
//    از اول هدف بود ولی جدول نقضش می‌کرد.
//
// نسبتِ ۱۰ / ۳ / ۱ عمدی است: برد سه برابرِ مساوی می‌ارزد و مساوی سه برابرِ
// باخت. فاصله به‌قدری هست که برد واقعاً بخواهی، و به‌قدری کم که یک روزِ
// بد، فصلت را نابود نکند. شبیه‌سازی (`/tmp/rev/`) با نرخِ تساویِ ۴.۵٪
// نشان داد نسبتِ سکهٔ «بازیکنِ ۹۳٪» به «بازیکنِ ۳۰٪» از ۳.۱۰ به ۲.۵۰
// می‌رسد — مهارت هنوز روشن برنده است، ولی شکافْ دیگر ناامیدکننده نیست.
const COIN_TABLE = Object.freeze({
  card_duel: Object.freeze({
    100:  Object.freeze({ win: 10, draw: 3, loss: 1 }),
    1000: Object.freeze({ win: 30, draw: 9, loss: 3 }),
  }),
  penalty: Object.freeze({
    100:  Object.freeze({ win: 10, draw: 3, loss: 1 }),
    1000: Object.freeze({ win: 30, draw: 9, loss: 3 }),
  }),
  memory: Object.freeze({
    100:  Object.freeze({ win: 10, draw: 3, loss: 1 }),
    1000: Object.freeze({ win: 30, draw: 9, loss: 3 }),
  }),
});

const ZERO_REWARD = Object.freeze({ win: 0, draw: 0, loss: 0 });

// سهمیهٔ روزانه، **مشترک بینِ هر سه بازی**.
//
// اشتراکی بودن مهم‌ترین بخشِ این عدد است: اگر هر بازی سهمیهٔ خودش را
// داشت، بازیکن با چرخیدن بینِ سه بازی سه برابر سکه می‌گرفت و سقف عملاً
// بی‌اثر می‌شد.
//
// سقفِ عملیِ روزانه = ۳۰×۲ + ۱۵×۲۰ = ۳۶۰ سکه (اگر همه‌اش دوئل و همه‌اش برد
// باشد، که در عمل غیرممکن است چون نرخِ بردِ متوسط ۵۰٪ است).
const DAILY_QUOTA = Object.freeze({ 100: 30, 1000: 15 });

const QUOTA_STAKES = Object.freeze([100, 1000]);

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
  const row = COIN_TABLE[gameId];
  if (!row) return ZERO_REWARD;
  return row[Number(stake)] || ZERO_REWARD;
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
// هر لولِ تمام‌شده `ceil(level/5)` سکه می‌دهد: لول ۱ تا ۵ یک سکه، ۶ تا ۱۰
// دو سکه، … و ۴۶ تا ۵۰ ده سکه. جمعِ کلِ مسیرِ ۵۰ لولی **۲۷۵ سکه** است.
//
// ── چرا پلکانی و نه ثابت ──
//
// لول‌های بالا با ضریبِ ۱.۰۵ رشد می‌کنند، یعنی لولِ ۵۰ چند برابرِ لولِ ۱
// ضربه می‌خواهد. پاداشِ ثابت یعنی نرخِ سکه بر ساعت مدام سقوط کند و بازیکنِ
// پیشرفته دقیقاً وقتی که بیشترین زحمت را می‌کشد کمترین بازده را بگیرد.
//
// ── چرا این عدد و نه بزرگ‌تر ──
//
// با سقفِ ۲ لول در روز، کلِ مسیر ۲۵ روز طول می‌کشد و ۲۷۵ سکه یعنی حدودِ
// ۳.۲٪ سکهٔ یک بازیکنِ متوسط در فصل. شبیه‌سازی (`/tmp/rev/tap.py`) نشان
// داد حسابی که **فقط** ضربه‌زن بازی کند به ۴.۴٪ سکهٔ رتبهٔ ۱۰۰ می‌رسد —
// یعنی ضربه‌زن به‌تنهایی راهی به جایزه نیست، ولی زحمتش هم بی‌مزد نمی‌ماند.
// نسبتِ مهارتِ کلِ اقتصاد از ۲.۵۰ فقط به ۲.۴۵ می‌آید.
//
// ⚠️ ضربه‌زن **فصلی نیست** — پیشرفتِ لول با پایانِ فصل صفر نمی‌شود.
//    خواستهٔ صریحِ مالک: «چون اصلا در یک ماه به پایانش ممکنه نرسن چون
//    لول های بالا سخت تره». پس این ۲۷۵ سکه یک‌بار در طولِ عمرِ حساب
//    گرفته می‌شود، نه هر ماه — و همین آن را از یک منبعِ دائمیِ تورم به یک
//    پاداشِ آشناسازیِ یک‌بارمصرف تبدیل می‌کند.
const TAP_LEVELS_PER_COIN_STEP = 5;

/** سکهٔ یک لولِ مشخصِ ضربه‌زن. لولِ نامعتبر ⇒ صفر. */
function tapLevelCoin(level) {
  const lv = Math.trunc(Number(level) || 0);
  if (lv < 1) return 0;
  return Math.ceil(lv / TAP_LEVELS_PER_COIN_STEP);
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
    const { rows } = await db.query(
      `SELECT used_100, used_1000 FROM user_coin_quota
        WHERE user_id=$1 AND quota_date=$2`, [userId, date]);
    const used100 = Number(rows[0]?.used_100 || 0);
    const used1000 = Number(rows[0]?.used_1000 || 0);
    return {
      date,
      used: { 100: used100, 1000: used1000 },
      limit: { 100: DAILY_QUOTA[100], 1000: DAILY_QUOTA[1000] },
      remaining: {
        100: Math.max(0, DAILY_QUOTA[100] - used100),
        1000: Math.max(0, DAILY_QUOTA[1000] - used1000),
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
    const limit = quotaLimit(stake);
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
