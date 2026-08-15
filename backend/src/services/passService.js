// گذر نبرد (Battle Pass) — «مسیر فصلی قلقلی»
//
// ═══════════════════════════════════════════════════════════════════════════
// ایدهٔ کلی
// ═══════════════════════════════════════════════════════════════════════════
//
// کاربر با **انجام دادن** کارها XP می‌گیرد (بازی، چرخش، ثبت کارت، دعوت)،
// XP او را در ۵۰ پله بالا می‌برد، و هر پله دو جایزه دارد: یکی در مسیر
// رایگان، یکی در مسیر پلاس. مسیر پلاس فقط با اشتراک «قلقلی پلاس» باز
// می‌شود — گذر نبرد جداگانه فروخته نمی‌شود.
//
// ═══════════════════════════════════════════════════════════════════════════
// سه تصمیم که عمداً گرفته شدند
// ═══════════════════════════════════════════════════════════════════════════
//
// ۱. XP فروختنی نیست.
//    هیچ مسیری برای خریدن XP وجود ندارد. فروشگاه صریحاً می‌گوید آیتم‌ها
//    «هیچ تأثیری روی امتیاز، جایزه یا رتبهٔ لیگ ندارند»؛ اگر پول
//    می‌توانست پله بخرد، همان pay-to-win می‌شد که از آن پرهیز شده.
//
// ۲. سقف XP روزانه.
//    بدون سقف، یک کاربر در یک شبِ بی‌خوابی کل فصل را تمام می‌کند و گذر
//    نبرد دقیقاً کاری که برایش ساخته شده (بازگشت روزانه) را انجام
//    نمی‌دهد. سقف روی **هر منبع** جداست تا کاربر مجبور شود تنوع داشته
//    باشد نه اینکه فقط یک بازی را تکرار کند.
//
// ۳. جایزه‌ها دستی دریافت می‌شوند، نه خودکار.
//    اگر خودکار واریز شود، کاربر لحظهٔ جایزه‌گرفتن را از دست می‌دهد —
//    و همان لحظه است که او را برمی‌گرداند. ضمناً وقتی کاربر پلاس را
//    بعداً می‌خرد، همهٔ پله‌های پلاسی که قبلاً رد کرده **بازمی‌شوند** و
//    یکجا قابل دریافت‌اند؛ این خودش انگیزهٔ خرید است.
const { pool } = require('../config/db');
const walletService = require('./walletService');
const pointLedger = require('./pointService');

// ── XP و پله‌ها ────────────────────────────────────────────────────────
//
// ۵۰ پله. XP لازم برای هر پله به‌آرامی زیاد می‌شود تا اول کار سریع حس
// پیشرفت بدهد و آخر کار ارزش داشته باشد. مجموع ≈ ۱۰٬۵۰۰ XP.
// اعداد با مدل انتخاب شدند، نه با حدس (tools/pass_economics.py و
// scripts/testPass.js):
//
//   مجموع کل مسیر = ۱۱٬۱۲۵ XP
//   کاربر فعال (~۲۵۰ XP در روز) در ۴۲ روز به ~۹۴٪ می‌رسد
//     → یعنی تمام کردنش ممکن است ولی تضمینی نیست؛ همان چیزی که باعث
//       می‌شود کاربر روزهای آخر هم برگردد.
//   نسخهٔ اول step=8 بود → ۱۴٬۸۰۰ XP → کاربر فعال فقط ۷۱٪ مسیر را
//     می‌رفت. تستِ اقتصادی همین را گرفت: گذری که هیچ‌کس تمامش نمی‌کند،
//     جایزهٔ آخرش تزئینی است و حس شکست می‌دهد نه پیشرفت.
const TIER_COUNT = 50;

/// حداکثر پله‌ای که در یک روز باز می‌شود.
///
/// ═══════════════════════════════════════════════════════════════════════
/// چرا این وجود دارد — ایراد مالک
/// ═══════════════════════════════════════════════════════════════════════
///
/// «افرادی که نخریدنش بیش از حد دارن امتیاز میگیرن ... فقط دوتا بتل پس
///  در روز باز میشه»
///
/// اندازه‌گیری شد و درست بود: کاربرِ حداکثری با ۸۲۵ XP در روز، **هفت
/// پله** در روز اول باز می‌کرد و کل مسیر ۵۰ پله‌ای را در چند روز تمام
/// می‌کرد. وقتی مسیر رایگان این‌قدر سخاوتمند باشد نه کسی پلاس می‌خرد و
/// نه گذر نبرد کاری که برایش ساخته شده (بازگشت روزانه) را انجام می‌دهد.
///
/// سقف XP کافی نبود چون پله‌های اول ارزان‌اند (۱۰۰، ۱۰۵، ۱۱۰...)، پس
/// همان XP در روز اول هفت پله می‌داد و در روزهای آخر دو پله. سقف روی
/// **تعداد پله** دقیقاً چیزی را محدود می‌کند که باید.
///
/// XPِ اضافه هدر نمی‌رود: در ستون xp می‌ماند و فردا که سقف باز می‌شود
/// بلافاصله تبدیل به پله می‌شود.
const MAX_TIERS_PER_DAY = 2;
const XP_BASE = 100;   // پلهٔ ۱
const XP_STEP = 5;     // هر پله این‌قدر گران‌تر از قبلی (پلهٔ ۵۰ = ۳۴۵)

/** XP لازم برای رسیدن از پلهٔ n-1 به n. */
function xpForTier(n) {
  return XP_BASE + (n - 1) * XP_STEP;
}

/** XP تجمعی لازم برای رسیدن به پلهٔ n. */
function cumulativeXp(n) {
  let s = 0;
  for (let i = 1; i <= n; i++) s += xpForTier(i);
  return s;
}

/** از XP کل، پلهٔ فعلی و پیشرفت داخل پلهٔ بعد را در می‌آورد. */
function tierFromXp(xp) {
  const total = Math.max(0, Number(xp) || 0);
  let acc = 0;
  for (let t = 1; t <= TIER_COUNT; t++) {
    const need = xpForTier(t);
    if (acc + need > total) {
      return { tier: t - 1, into: total - acc, need, total };
    }
    acc += need;
  }
  return { tier: TIER_COUNT, into: 0, need: 0, total };
}

// ── منابع XP و سقف روزانهٔ هرکدام ─────────────────────────────────────
//
// اعداد طوری چیده شده‌اند که یک کاربر فعال روزانه ~۲۵۰ XP بگیرد، یعنی
// در ۴۲ روز حدود ۱۰٬۵۰۰ — دقیقاً کل مسیر. کسی که فقط گاهی می‌آید،
// نیمهٔ مسیر را می‌رود، و همین «نزدیک بودن به پلهٔ بعد» انگیزهٔ خرید
// پلاس است.
const SOURCES = {
  // بازی‌های چندنفره و تک‌نفره
  game_play:    { xp: 15, dailyCap: 90,  label: 'انجام بازی' },
  game_win:     { xp: 25, dailyCap: 75,  label: 'برد در بازی' },
  // بازی ضربه‌زن
  tap_level:    { xp: 30, dailyCap: 60,  label: 'لول بازی ضربه‌زن' },
  // گردونه
  wheel_spin:   { xp: 20, dailyCap: 40,  label: 'چرخاندن گردونه' },
  // ═════════════════════════════════════════════════════════════════════
  // «ثبت کارت» عمداً اینجا **نیست**
  // ═════════════════════════════════════════════════════════════════════
  //
  // قبلاً `card_redeem: { xp: 80, dailyCap: 240 }` بود. خواستهٔ صریح
  // مالک: «ثبت کارت در هیچ حالتی نباید بتل‌پس رو چه در رایگان چه در
  // پلاس باز کنه».
  //
  // چرا کلِ تعریف حذف شد و نه فقط فراخوانی‌هایش:
  //
  //   `grantXp` برای اکشنِ ناشناخته بی‌سروصدا `return` می‌کند. اگر
  //   تعریف می‌ماند و فقط دو فراخوانی پاک می‌شد، هر کسی فردا
  //   `grantXp(id, 'card_redeem')` می‌نوشت دوباره کار می‌کرد و هیچ‌کس
  //   متوجه نمی‌شد.
  //
  //   با حذفِ تعریف، آن فراخوانی هیچ اثری ندارد **و** تستِ
  //   `هیچ اکشنی برای ثبت کارت وجود ندارد` قرمز می‌شود.
  //
  // منطقِ تصمیم: گذر نبرد پاداشِ **فعالیت در بازی** است. ثبتِ کارت
  // خریدی است که کاربر بیرون از اپ انجام داده و امتیاز، جایزهٔ نقدی و
  // کارتِ خودش را دارد. دادنِ XP بابتش یعنی هرکس پول بیشتری خرج کند
  // در گذر نبرد جلو می‌افتد — که هدفِ گذر نبرد نیست.
  // دعوت دوست
  referral:     { xp: 100, dailyCap: 300, label: 'دعوت دوست' },
  // ورود روزانه
  daily_login:  { xp: 20, dailyCap: 20,  label: 'ورود روزانه' },
};

/** روز جاری به وقت تهران (YYYY-MM-DD). */
function tehranDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

// ── فصل ────────────────────────────────────────────────────────────────
/// مهلتِ دریافتِ جایزه بعد از پایان فصل (روز).
///
/// ═══════════════════════════════════════════════════════════════════════
/// چرا این وجود دارد — باگی که جایزه‌های کاربر را می‌سوزاند
/// ═══════════════════════════════════════════════════════════════════════
///
/// `activeSeason()` شرط `ends_at > NOW()` داشت و همه‌جا — از جمله
/// `claim()` — از همان می‌خواند. یعنی دقیقاً در ثانیهٔ پایان فصل:
///
///   • `status()` مقدار `{ active: false }` برمی‌گرداند
///   • `claim()` خطای «فصلی فعال نیست» می‌دهد
///
/// کاربری که پلهٔ ۵۰ را باز کرده بود ولی جایزه‌اش را **هنوز نگرفته
/// بود**، آن را برای همیشه از دست می‌داد. این بدترین حالتِ ممکن است:
/// کاربر تمام فصل تلاش کرده و درست در لحظهٔ موفقیت دستش خالی می‌ماند.
/// برای کاربر پلاس که پول داده، این مستقیماً یعنی حس کلاهبرداری.
///
/// حالا دو مفهوم جدا شده‌اند:
///   `activeSeason()`     → فصلی که هنوز XP می‌پذیرد (برای grantXp)
///   `claimableSeason()`  → فصلی که هنوز می‌شود جایزه‌اش را گرفت
const CLAIM_GRACE_DAYS = 7;

async function activeSeason(client = pool) {
  const { rows } = await client.query(
    `SELECT * FROM pass_seasons
      WHERE is_active AND starts_at <= NOW() AND ends_at > NOW()
      ORDER BY starts_at DESC LIMIT 1`);
  return rows[0] || null;
}

/**
 * فصلی که هنوز می‌شود جایزه‌هایش را دریافت کرد.
 *
 * فصل جاری، یا اگر تازه تمام شده، تا `CLAIM_GRACE_DAYS` روز بعد از
 * پایانش. XP دیگر اضافه نمی‌شود (آن کارِ activeSeason است) ولی
 * پله‌هایی که کاربر **قبلاً باز کرده** قابل دریافت می‌مانند.
 */
async function claimableSeason(client = pool) {
  const { rows } = await client.query(
    `SELECT * FROM pass_seasons
      WHERE is_active AND starts_at <= NOW()
        AND ends_at > NOW() - ($1 || ' days')::interval
      ORDER BY starts_at DESC LIMIT 1`,
    [String(CLAIM_GRACE_DAYS)]);
  return rows[0] || null;
}

/**
 * آیا کاربر اشتراک پلاسِ فعال دارد؟
 *
 * همان جدولی که shopService.plusStatus می‌خواند — عمداً منبع حقیقت یکی
 * است، وگرنه دو تعریفِ متفاوت از «پلاس بودن» به‌وجود می‌آید.
 */
async function hasPlus(userId, client = pool) {
  const { rows } = await client.query(
    `SELECT 1 FROM user_subscriptions
      WHERE user_id=$1 AND plan IN ('plus','plus_annual') AND expires_at > NOW() LIMIT 1`,
    [userId]);
  return rows.length > 0;
}

/**
 * ستون DATE پستگرس را به رشتهٔ YYYY-MM-DD تبدیل می‌کند.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * چرا toISOString() اینجا غلط است — باگی که سقف روزانه را بی‌اثر کرد
 * ═══════════════════════════════════════════════════════════════════════
 *
 * درایور pg یک ستون DATE را به Date جاوااسکریپت تبدیل می‌کند و آن را در
 * **منطقهٔ زمانی سرور** تفسیر می‌کند. سرور روی Asia/Tehran است (UTC+3:30)،
 * پس `2026-08-04` به این شکل در می‌آید:
 *
 *     2026-08-03T20:30:00.000Z
 *
 * و `toISOString().slice(0,10)` می‌دهد **«2026-08-03»** — یعنی یک روز
 * عقب. نتیجه: `sameDay` همیشه false بود، شمارندهٔ روزانه هر بار صفر
 * می‌شد، و سقف ۲ پله عملاً وجود نداشت. کاربر با یک XP، ۱۲ پله باز کرد.
 *
 * روی سرور زنده اثبات شد:
 *     tiers_day در دیتابیس: 2026-08-04
 *     toISOString():        2026-08-03   ← ناهماهنگ
 *     tehranDay():          2026-08-04
 *
 * راه‌حل: از اجزای **محلیِ** Date استفاده کن، نه UTC. چون سرور روی
 * تهران است، اجزای محلی همان روز تهران‌اند.
 */
function pgDateToDay(v) {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * XP انباشته را — تا سقف روزانه — به «پلهٔ باز شده» تبدیل می‌کند.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * چرا این تابع جداست و نه داخل grantXp
 * ═══════════════════════════════════════════════════════════════════════
 *
 * نسخهٔ اول این منطق را وسط grantXp گذاشته بود، **بعد از** جایی که تابع
 * وقتی سقفِ XPِ آن منبع پر بود `return` می‌کرد. نتیجهٔ باگ روی سرور زنده
 * دیده شد:
 *
 *     XP=۵۰۰۰ (استحقاق پلهٔ ۲۹) ولی پلهٔ باز شده = ۰، معلق = ۲۹
 *
 * یعنی کاربری که XP داشت ولی سقفِ همهٔ منابعش پر شده بود، **هیچ‌وقت**
 * پله‌اش باز نمی‌شد — حتی فردا. چون فردا هم اولین چیزی که صدا زده
 * می‌شد grantXp بود و باز همان مسیر زودهنگام.
 *
 * حالا این تابع مستقل است و از دو جا صدا زده می‌شود: بعد از هر XP، و
 * هر بار که کاربر وضعیت را می‌خواند. پس حتی اگر کاربر یک هفته چیزی
 * نگیرد، لحظه‌ای که صفحه را باز کند پله‌های امروزش باز می‌شوند.
 */
async function syncTiers(userId, seasonId, client = pool) {
  const day = tehranDay();
  const { rows } = await client.query(
    `SELECT xp, unlocked_tier, tiers_day, tiers_today
       FROM user_pass_progress WHERE user_id=$1 AND season_id=$2`,
    [userId, seasonId]);
  const row = rows[0];
  if (!row) return null;

  const sameDay = pgDateToDay(row.tiers_day) === day;
  const usedToday = sameDay ? Number(row.tiers_today) || 0 : 0;
  const room = Math.max(0, MAX_TIERS_PER_DAY - usedToday);

  const current = Math.min(TIER_COUNT, Number(row.unlocked_tier) || 0);
  const earned = tierFromXp(Number(row.xp)).tier;
  const grant = Math.min(Math.max(0, earned - current), room);

  if (grant > 0 || !sameDay) {
    await client.query(
      `UPDATE user_pass_progress
          SET unlocked_tier = $3, tiers_day = $4::date, tiers_today = $5
        WHERE user_id = $1 AND season_id = $2`,
      [userId, seasonId, current + grant, day, usedToday + grant]);
  }
  return {
    tier: current + grant,
    tiersToday: usedToday + grant,
    pending: Math.max(0, earned - (current + grant)),
    unlockedNow: grant,
  };
}

// ── اعطای XP ───────────────────────────────────────────────────────────
/**
 * XP می‌دهد و سقف روزانه را رعایت می‌کند.
 *
 * هرگز throw نمی‌کند: این تابع از داخل مسیرهای بازی و گردونه صدا زده
 * می‌شود و یک خطای گذرا در گذر نبرد **نباید** باعث شکست خوردِ خودِ بازی
 * شود. در بدترین حالت کاربر آن XP را نمی‌گیرد.
 */
async function grantXp(userId, source, { multiplier = 1 } = {}) {
  try {
    const cfg = SOURCES[source];
    if (!cfg || !userId) return null;
    const season = await activeSeason();
    if (!season) return null;

    const day = tehranDay();
    const want = Math.max(0, Math.round(cfg.xp * multiplier));
    if (want <= 0) return null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // چقدر از سقف امروزِ این منبع باقی مانده؟
      const { rows: used } = await client.query(
        `SELECT xp FROM pass_xp_log
          WHERE user_id=$1 AND season_id=$2 AND day=$3 AND source=$4 FOR UPDATE`,
        [userId, season.id, day, source]);
      const already = Number(used[0]?.xp || 0);
      const room = Math.max(0, cfg.dailyCap - already);
      const gain = Math.min(want, room);
      if (gain <= 0) {
        // سقفِ این منبع پر است، ولی XPِ قبلی ممکن است هنوز منتظر تبدیل
        // به پله باشد (مثلاً روز عوض شده). قبلاً اینجا return می‌شد و
        // پله برای همیشه قفل می‌ماند — باگی که روی سرور زنده دیده شد.
        const sync = await syncTiers(userId, season.id, client);
        await client.query('COMMIT');
        return { gained: 0, capped: true, ...(sync || {}) };
      }

      await client.query(
        `INSERT INTO pass_xp_log(user_id, season_id, day, source, xp)
         VALUES($1,$2,$3,$4,$5)
         ON CONFLICT (user_id, season_id, day, source)
         DO UPDATE SET xp = pass_xp_log.xp + EXCLUDED.xp`,
        [userId, season.id, day, source, gain]);

      const { rows: prog } = await client.query(
        `INSERT INTO user_pass_progress(user_id, season_id, xp)
         VALUES($1,$2,$3)
         ON CONFLICT (user_id, season_id)
         DO UPDATE SET xp = user_pass_progress.xp + EXCLUDED.xp, updated_at = NOW()
         RETURNING xp`,
        [userId, season.id, gain]);

      // XP همیشه اضافه می‌شود (بالا)، ولی تبدیلش به پله سقف روزانه دارد.
      const sync = await syncTiers(userId, season.id, client);

      await client.query('COMMIT');
      return {
        gained: gain,
        xp: Number(prog[0].xp),
        capped: gain < want,
        tier: sync?.tier ?? 0,
        tiersToday: sync?.tiersToday ?? 0,
        tierCapped: (sync?.pending ?? 0) > 0,
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[pass] grantXp failed:', e.message);
    return null;
  }
}

// ── وضعیت برای کلاینت ─────────────────────────────────────────────────
async function status(userId) {
  // در مهلتِ ارفاق هم وضعیت را نشان بده تا کاربر بتواند جایزه‌های
  // باز‌شده‌اش را بگیرد. `grace` به کلاینت می‌گوید حالت «فقط دریافت» است.
  const season = await claimableSeason();
  if (!season) return { active: false };
  const ended = new Date(season.ends_at) <= new Date();

  // پله‌های امروز را قبل از خواندن باز کن.
  //
  // بدون این، کاربری که دیروز XP جمع کرده و امروز فقط صفحه را باز
  // می‌کند (بدون بازی)، پله‌اش باز نمی‌شد تا وقتی یک XP جدید بگیرد.
  await syncTiers(userId, season.id).catch(() => null);

  const [progRes, tiersRes, claimsRes, plus] = await Promise.all([
    pool.query(`SELECT xp, unlocked_tier, tiers_day, tiers_today
                  FROM user_pass_progress WHERE user_id=$1 AND season_id=$2`,
      [userId, season.id]),
    pool.query(`SELECT id, tier, track, kind, amount, payload, label
                  FROM pass_tiers WHERE season_id=$1 ORDER BY tier, track`,
      [season.id]),
    pool.query(`SELECT c.tier_id FROM user_pass_claims c
                  JOIN pass_tiers t ON t.id = c.tier_id
                 WHERE c.user_id=$1 AND t.season_id=$2`,
      [userId, season.id]),
    hasPlus(userId),
  ]);

  const pr = progRes.rows[0] || {};
  const xp = Number(pr.xp || 0);
  const day = tehranDay();
  const sameDay = pgDateToDay(pr.tiers_day) === day;
  const tiersToday = sameDay ? Number(pr.tiers_today) || 0 : 0;

  // پلهٔ واقعی از ستون unlocked_tier می‌آید، نه از XP.
  //
  // این تفاوت مهم است: XP می‌تواند جلوتر باشد (کاربر امروز زیاد بازی
  // کرده) ولی پله تا فردا باز نمی‌شود. اگر اینجا از XP حساب می‌کردیم،
  // سقف روزانه فقط یک عدد تزئینی بود.
  const unlocked = Math.min(TIER_COUNT, Number(pr.unlocked_tier) || 0);
  // پیشرفت داخل پلهٔ بعد، نسبت به پلهٔ باز شده.
  const spent = cumulativeXp(unlocked);
  const nextNeed = unlocked < TIER_COUNT ? xpForTier(unlocked + 1) : 0;
  const into = Math.max(0, Math.min(nextNeed, xp - spent));
  const pos = { tier: unlocked, into, need: nextNeed };
  const claimed = new Set(claimsRes.rows.map(r => r.tier_id));

  const tiers = [];
  for (let t = 1; t <= TIER_COUNT; t++) {
    const row = { tier: t, xpNeeded: cumulativeXp(t), unlocked: pos.tier >= t };
    for (const track of ['free', 'plus']) {
      const r = tiersRes.rows.find(x => x.tier === t && x.track === track);
      if (!r) continue;
      row[track] = {
        id: r.id, kind: r.kind, amount: Number(r.amount),
        payload: r.payload, label: r.label,
        claimed: claimed.has(r.id),
        // مسیر پلاس فقط با اشتراک قابل دریافت است؛ ولی همیشه **دیده**
        // می‌شود — دیدنِ چیزی که از دست می‌دهی، خودش انگیزهٔ خرید است.
        locked: track === 'plus' && !plus,
      };
    }
    tiers.push(row);
  }

  const claimable = tiers.reduce((n, row) => {
    for (const track of ['free', 'plus']) {
      const r = row[track];
      if (r && row.unlocked && !r.claimed && !r.locked) n++;
    }
    return n;
  }, 0);

  return {
    active: true,
    season: {
      id: season.id, name: season.name,
      endsAt: season.ends_at,
      daysLeft: Math.max(0,
        Math.ceil((new Date(season.ends_at) - Date.now()) / 86400000)),
    },
    // فصل تمام شده ولی هنوز در مهلتِ دریافت است: کلاینت باید نوار
    // «فقط فرصت دریافت» را نشان دهد و XP جدید وعده ندهد.
    ended,
    graceDays: CLAIM_GRACE_DAYS,
    graceDaysLeft: ended
      ? Math.max(0, Math.ceil(
        (new Date(season.ends_at).getTime() + CLAIM_GRACE_DAYS * 86400000
          - Date.now()) / 86400000))
      : null,
    hasPlus: plus,
    xp,
    tier: pos.tier,
    tierCount: TIER_COUNT,
    intoTier: pos.into,
    tierNeeds: pos.need,
    // ── سقف روزانه ────────────────────────────────────────────────────
    // کلاینت این‌ها را برای نشانِ قرمز کنار آیکون و پیام «سقف امروز پر
    // شد» لازم دارد.
    tiersToday,
    maxTiersPerDay: MAX_TIERS_PER_DAY,
    dayCapReached: tiersToday >= MAX_TIERS_PER_DAY,
    // XP جمع‌شده‌ای که هنوز به پله تبدیل نشده چون سقف پر است. صفر یعنی
    // چیزی معلق نمانده.
    pendingTiers: Math.max(0, tierFromXp(xp).tier - unlocked),
    claimable,
    tiers,
    sources: Object.entries(SOURCES).map(([k, v]) => ({
      source: k, xp: v.xp, dailyCap: v.dailyCap, label: v.label,
    })),
  };
}

// ── دریافت جایزه ──────────────────────────────────────────────────────
/**
 * یک پله را دریافت می‌کند.
 *
 * همه‌چیز داخل یک تراکنش است و کلید اصلیِ user_pass_claims تضمین
 * می‌کند دوبار دریافت غیرممکن باشد — حتی با دو درخواست هم‌زمان. بدون
 * آن، جایزهٔ نقدی با دو تپ سریع دوبار واریز می‌شد.
 */
async function claim(userId, tierId) {
  // عمداً claimableSeason و نه activeSeason: پله‌ای که کاربر باز کرده
  // نباید در ثانیهٔ پایان فصل بسوزد. توضیح کامل کنار CLAIM_GRACE_DAYS.
  const season = await claimableSeason();
  if (!season) throw Object.assign(new Error('مهلت دریافت جایزه‌های این فصل تمام شده'), { status: 400 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: tr } = await client.query(
      'SELECT * FROM pass_tiers WHERE id=$1 AND season_id=$2', [tierId, season.id]);
    const tier = tr[0];
    if (!tier) throw Object.assign(new Error('این پله پیدا نشد'), { status: 404 });

    // آیا کاربر اصلاً این پله را **باز کرده**؟
    //
    // از unlocked_tier خوانده می‌شود نه از XP. با سقف روزانهٔ ۲ پله،
    // کاربر می‌تواند XPِ پلهٔ ۵ را داشته باشد ولی هنوز فقط پلهٔ ۲ را باز
    // کرده باشد؛ اگر اینجا از XP حساب می‌کردیم، جایزه‌های قفل را
    // می‌گرفت و کل سقف بی‌معنی می‌شد.
    const { rows: pr } = await client.query(
      `SELECT xp, unlocked_tier FROM user_pass_progress
        WHERE user_id=$1 AND season_id=$2 FOR UPDATE`,
      [userId, season.id]);
    const unlocked = Number(pr[0]?.unlocked_tier || 0);
    if (unlocked < tier.tier) {
      throw Object.assign(
        new Error('هنوز این پله را باز نکرده‌ای'), { status: 400 });
    }

    if (tier.track === 'plus' && !(await hasPlus(userId, client))) {
      throw Object.assign(
        new Error('این جایزه مخصوص اعضای قلقلی پلاس است'), { status: 403 });
    }

    // قفلِ ضدتکرار در سطح دیتابیس.
    const ins = await client.query(
      `INSERT INTO user_pass_claims(user_id, tier_id) VALUES($1,$2)
       ON CONFLICT DO NOTHING RETURNING tier_id`,
      [userId, tierId]);
    if (!ins.rowCount) {
      throw Object.assign(new Error('این جایزه قبلاً دریافت شده'), { status: 400 });
    }

    const amount = Number(tier.amount || 0);
    let granted = { kind: tier.kind, amount, label: tier.label };

    if (tier.kind === 'points' && amount > 0) {
      // از دفترِ امتیاز می‌گذرد تا در «ریز امتیازات» با برچسبِ پلهٔ
      // گذر نبرد دیده شود. توضیح در مایگریشنِ ۰۴۵.
      await pointLedger.credit(client, {
        userId,
        points: amount,
        source: 'pass_reward',
        referenceType: 'pass_tiers',
        referenceId: tier.id || null,
        description: `پاداش گذر نبرد — ${tier.label || `پله ${tier.tier_index ?? ''}`}`,
      });
    } else if (tier.kind === 'spins' && amount > 0) {
      await client.query(
        'UPDATE users SET bonus_spins = bonus_spins + $2, updated_at=NOW() WHERE id=$1',
        [userId, amount]);
    } else if (tier.kind === 'cash' && amount > 0) {
      await walletService.credit(client, {
        userId, amount, source: 'pass',
        referenceType: 'pass_tier', referenceId: tier.id,
        description: `جایزهٔ گذر نبرد — پلهٔ ${tier.tier}`,
      });
    } else if (tier.kind === 'shop_item' && tier.payload) {
      const { rows: item } = await client.query(
        'SELECT id, name FROM shop_items WHERE slug=$1', [tier.payload]);
      if (item[0]) {
        // price_paid صفر: هدیه است، نه خرید. تاریخچهٔ کیف پول نباید
        // تراکنشی نشان دهد که هرگز اتفاق نیفتاده.
        await client.query(
          `INSERT INTO user_shop_items(user_id, item_id, price_paid)
           VALUES($1,$2,0) ON CONFLICT DO NOTHING`,
          [userId, item[0].id]);
        granted.label = item[0].name;
      }
    }

    await client.query('COMMIT');
    return granted;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** همهٔ جوایزِ قابل دریافت را یکجا می‌گیرد. */
async function claimAll(userId) {
  const st = await status(userId);
  if (!st.active) return { claimed: 0 };
  const ids = [];
  for (const row of st.tiers) {
    for (const track of ['free', 'plus']) {
      const r = row[track];
      if (r && row.unlocked && !r.claimed && !r.locked) ids.push(r.id);
    }
  }
  let n = 0;
  for (const id of ids) {
    try { await claim(userId, id); n++; } catch { /* یکی رد شد، بقیه ادامه */ }
  }
  return { claimed: n };
}

module.exports = {
  SOURCES, TIER_COUNT, MAX_TIERS_PER_DAY,
  xpForTier, cumulativeXp, tierFromXp, syncTiers, pgDateToDay,
  activeSeason, claimableSeason, CLAIM_GRACE_DAYS,
  hasPlus, grantXp, status, claim, claimAll, tehranDay,
};
