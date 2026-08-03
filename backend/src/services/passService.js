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
  // ثبت کد کارت فیزیکی — بیشترین XP، چون درآمد واقعی شماست
  card_redeem:  { xp: 80, dailyCap: 240, label: 'ثبت کد کارت' },
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
async function activeSeason(client = pool) {
  const { rows } = await client.query(
    `SELECT * FROM pass_seasons
      WHERE is_active AND starts_at <= NOW() AND ends_at > NOW()
      ORDER BY starts_at DESC LIMIT 1`);
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
      WHERE user_id=$1 AND plan='plus' AND expires_at > NOW() LIMIT 1`,
    [userId]);
  return rows.length > 0;
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
      if (gain <= 0) { await client.query('ROLLBACK'); return { gained: 0, capped: true }; }

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

      await client.query('COMMIT');
      return { gained: gain, xp: Number(prog[0].xp), capped: gain < want };
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
  const season = await activeSeason();
  if (!season) return { active: false };

  const [progRes, tiersRes, claimsRes, plus] = await Promise.all([
    pool.query('SELECT xp FROM user_pass_progress WHERE user_id=$1 AND season_id=$2',
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

  const xp = Number(progRes.rows[0]?.xp || 0);
  const pos = tierFromXp(xp);
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
    hasPlus: plus,
    xp,
    tier: pos.tier,
    tierCount: TIER_COUNT,
    intoTier: pos.into,
    tierNeeds: pos.need,
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
  const season = await activeSeason();
  if (!season) throw Object.assign(new Error('فصلی فعال نیست'), { status: 400 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: tr } = await client.query(
      'SELECT * FROM pass_tiers WHERE id=$1 AND season_id=$2', [tierId, season.id]);
    const tier = tr[0];
    if (!tier) throw Object.assign(new Error('این پله پیدا نشد'), { status: 404 });

    // آیا کاربر اصلاً به این پله رسیده؟
    const { rows: pr } = await client.query(
      'SELECT xp FROM user_pass_progress WHERE user_id=$1 AND season_id=$2 FOR UPDATE',
      [userId, season.id]);
    const pos = tierFromXp(Number(pr[0]?.xp || 0));
    if (pos.tier < tier.tier) {
      throw Object.assign(new Error('هنوز به این پله نرسیده‌ای'), { status: 400 });
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
      await client.query(
        `UPDATE users SET current_points = current_points + $2,
                          lifetime_points = lifetime_points + $2,
                          monthly_league_points = monthly_league_points + $2,
                          updated_at = NOW()
          WHERE id = $1`, [userId, amount]);
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
  SOURCES, TIER_COUNT, xpForTier, cumulativeXp, tierFromXp,
  activeSeason, hasPlus, grantXp, status, claim, claimAll, tehranDay,
};
