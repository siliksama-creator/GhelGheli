// ─────────────────────────────────────────────────────────────────────────────
// لیگِ معرف‌ها — آفرِ زمان‌دار برای دعوت‌کنندگان، و پرداختِ جایزه‌شان
// ─────────────────────────────────────────────────────────────────────────────
//
// ── خواستهٔ مالک (۴ مهر ۱۴۰۵) ────────────────────────────────────────────────
//
//   «در قسمت دعوت از دوستان باید یک تب جدید ایجاد کنی که تاپ ۱۰ بیشترین
//    دعوت‌کننده مشخص باشه و رنک هر فرد رو هم نشون بده حتی اگه تو تاپ ۱۰ نباشه.
//    و باید امکانی در پنل ادمین بسازی که اگه خواست به تاپ دعوت‌کنندگان جایزه
//    بده … اگه ادمین از پنل یه آفر مثل لیگ دعوت‌کنندگان قرار داد و کانفیگش
//    کرد، داخل تب دعوت‌کنندگان لیگ معرف‌ها برگزار بشه، به هر تعدادی که خواست،
//    در هر محدودهٔ زمانی جایزه تعیین بشه.»
//
// ── سه تصمیم که مالک نگفت و این‌جا گرفته شده ─────────────────────────────────
//
// ۱. «دعوتِ معتبر» یعنی کاربری که `status='active'` است. همین تعریف از قبل در
//    `referralService.invitedCount` بود و دو تعریفِ متفاوت برای «تعداد دعوت»
//    یعنی صفحهٔ دعوت یک عدد بگوید و جدولِ لیگ عددِ دیگری — همان دسته
//    ناهماهنگی‌ای که کاربر را به بی‌اعتمادی می‌برد.
//
// ۲. تساوی: هر کس **زودتر** به آن عدد رسیده بالاتر می‌ایستد. «زمانِ رسیدن به
//    عددِ فعلی» از خودِ داده درمی‌آید (زمانِ ورودِ N-اُمین دعوت‌شوندهٔ او) و
//    جدولِ جدا لازم ندارد — پس برای دعوت‌های قدیمی هم درست کار می‌کند.
//
// ۳. رتبهٔ هر کاربر همیشه محاسبه می‌شود، حتی بیرونِ تاپ ۱۰ («رنک هر فرد رو هم
//    نشون بده حتی اگه تو تاپ ۱۰ نباشه»). رتبه از همان کوئری می‌آید، نه از
//    جایگاهِ کاربر در فهرستِ برگشتی.
//
// ── چرا «آفرِ فعال» با یک ایندکسِ یکتا در دیتابیس قید شده ──────────────────
//
// تصمیمِ مالک: «فقط یکی در هر زمان». اگر این قید را در کد می‌گذاشتیم، دو
// درخواستِ هم‌زمانِ پنل می‌توانست دو آفرِ فعال بسازد و بعد صفحهٔ کاربر
// نمی‌دانست کدام جدول را نشان دهد. ایندکسِ پارسیال (مهاجرت ۱۰۱) این را از
// جنسِ دیتابیس می‌کند: دومی خطا می‌گیرد، هرچند از کدام مسیر آمده باشد.
const { pool } = require('../config/db');
const { faDigits, faAmount } = require('../lib/faNum');
const points = require('./pointService');
const wallet = require('./walletService');
const coinLedger = require('./coinLedger');
const { createNotification } = require('./notificationService');

/** سقفِ ردیف‌های جدولِ جایزه — «به هر تعدادی که خواست» ولی نه بی‌نهایت. */
const MAX_PRIZE_ROWS = 50;
/** سقفِ هر عددِ جایزه، تا یک صفرِ اضافی اقتصاد را خراب نکند. */
const MAX_PRIZE_VALUE = 100000000;
/** تاپِ نمایشی در جدول‌ها. */
const TOP_LIMIT = 10;

const prizeError = (message) => Object.assign(new Error(message), { status: 400 });

const asInt = (value, fallback = 0, min = 0, max = MAX_PRIZE_VALUE) => {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/**
 * پاک‌سازیِ جدولِ جایزهٔ ادمین.
 *
 * هر ردیف = یک رتبه. رتبه‌های تکراری حذف می‌شوند (اولی می‌ماند) و ردیفِ
 * بی‌جایزه کنار گذاشته می‌شود: ردیفِ «رتبهٔ ۳ با صفرِ همه‌چیز» فقط جدولِ
 * کاربر را شلوغ می‌کند و در پرداخت هم ردیفِ بی‌مقدار می‌سازد.
 */
function sanitizePrizeTable(raw) {
  if (!Array.isArray(raw)) return [];
  const rows = [];
  const seen = new Set();
  for (const item of raw.slice(0, MAX_PRIZE_ROWS)) {
    const rank = asInt(item?.rank, 0, 0, 100000);
    if (!rank || seen.has(rank)) continue;
    const row = {
      rank,
      label: String(item?.label ?? '').trim().slice(0, 60) || `رتبهٔ ${faDigits(rank)}`,
      points: asInt(item?.points),
      coins: asInt(item?.coins),
      spins: asInt(item?.spins, 0, 0, 1000),
      cash: asInt(item?.cash),
    };
    if (!row.points && !row.coins && !row.spins && !row.cash) continue;
    seen.add(rank);
    rows.push(row);
  }
  return rows.sort((a, b) => a.rank - b.rank);
}

/**
 * جدولِ معرف‌ها در یک بازهٔ زمانی.
 *
 * `startsAt`/`endsAt` هر دو اختیاری‌اند: بدونِ آن‌ها همان پرس‌وجو «همهٔ
 * زمان‌ها» می‌دهد. یک کوئری، دو کاربرد — پس «معرف‌های برتر تا کنون» و
 * «لیگِ معرف‌ها» هرگز دو تعریفِ متفاوت از رتبه‌بندی ندارند.
 *
 * @returns {Promise<{rows: object[], total: number}>}
 */
async function leaderboard({
  startsAt = null, endsAt = null, minInvites = 1, limit = TOP_LIMIT,
  offset = 0, userId = null, client = pool,
} = {}) {
  const { rows } = await client.query(
    `WITH counted AS (
       SELECT u.referred_by AS referrer_id,
              u.referred_at AS at,
              ROW_NUMBER() OVER (
                PARTITION BY u.referred_by
                ORDER BY u.referred_at ASC, u.id ASC
              ) AS rn
         FROM users u
        WHERE u.referred_by IS NOT NULL
          AND u.status = 'active'
          AND u.referred_at IS NOT NULL
          AND ($1::timestamptz IS NULL OR u.referred_at >= $1)
          AND ($2::timestamptz IS NULL OR u.referred_at < $2)
     ), agg AS (
       SELECT referrer_id, COUNT(*)::int AS invites
         FROM counted GROUP BY referrer_id
     ), reached AS (
       -- زمانِ رسیدن به عددِ فعلی: ورودِ N-اُمین دعوت‌شونده (N = تعدادِ فعلی).
       -- همین ستون، تساویِ دو نفر با عددِ برابر را حل می‌کند.
       SELECT a.referrer_id, a.invites, c.at AS reached_at
         FROM agg a JOIN counted c
           ON c.referrer_id = a.referrer_id AND c.rn = a.invites
     ), ranked AS (
       SELECT r.referrer_id, r.invites, r.reached_at,
              (RANK() OVER (
                 ORDER BY r.invites DESC, r.reached_at ASC, r.referrer_id ASC
               ))::int AS rank
         FROM reached r
        WHERE r.invites >= $3
     )
     SELECT k.rank, k.invites, k.reached_at,
            u.id AS user_id, u.nickname, u.first_name,
            u.profile_image_url, u.profile_avatar_key
       FROM ranked k JOIN users u ON u.id = k.referrer_id
      WHERE ($4::uuid IS NULL OR k.referrer_id = $4)
      ORDER BY k.rank
      LIMIT $5 OFFSET $6`,
    [startsAt, endsAt, minInvites, userId, limit, offset]);
  return rows.map(mapRow);
}

function mapRow(r) {
  return {
    userId: r.user_id,
    nickname: r.nickname || r.first_name || 'کاربر قلقلی',
    avatarUrl: r.profile_image_url || null,
    avatarKey: r.profile_avatar_key || null,
    invites: Number(r.invites || 0),
    rank: Number(r.rank || 0),
    reachedAt: r.reached_at || null,
  };
}

/** رتبهٔ یک کاربر در یک بازه — حتی اگر بیرونِ تاپ ۱۰ باشد. */
async function standing(userId, opts = {}) {
  if (!userId) return null;
  const rows = await leaderboard({ ...opts, userId, limit: 1 });
  return rows[0] || null;
}

/** آفرِ فعالِ لیگِ معرف‌ها (یا `null` اگر ادمین آفری نساخته). */
async function activeSeason(client = pool) {
  const { rows } = await client.query(
    `SELECT * FROM invite_league_seasons
      WHERE status = 'active' AND starts_at <= NOW() AND ends_at > NOW()
      ORDER BY starts_at DESC LIMIT 1`);
  return rows[0] || null;
}

/** آفرِ فعال، به شکلِ قابل‌نمایش به کاربر (+ جدول و رتبهٔ خودش). */
async function leagueView(userId) {
  const season = await activeSeason();
  if (!season) return null;
  const prizes = Array.isArray(season.prize_table) ? season.prize_table : [];
  const [rows, me] = await Promise.all([
    leaderboard({
      startsAt: season.starts_at, endsAt: season.ends_at,
      minInvites: season.min_invites, limit: TOP_LIMIT,
    }),
    standing(userId, {
      startsAt: season.starts_at, endsAt: season.ends_at,
      minInvites: season.min_invites,
    }),
  ]);
  return {
    title: season.title,
    startsAt: season.starts_at,
    endsAt: season.ends_at,
    minInvites: season.min_invites,
    prizes,
    rows,
    me,
    // رتبهٔ کاربر وقتی بیرونِ تاپ است، در جدول نیست؛ کلاینتی که `me` را جدا
    // می‌گیرد لازم نیست خودش حساب کند.
    meInTop: Boolean(me && rows.some((r) => r.userId === me.userId)),
  };
}

/** آرشیوِ آفرهای تمام‌شده — برندگان از ردیف‌های پرداخت (اسنپ‌شات، نه محاسبهٔ دوباره). */
async function archive(userId, limit = 4) {
  const { rows: seasons } = await pool.query(
    `SELECT id, title, starts_at, ends_at, closed_at
       FROM invite_league_seasons
      WHERE status IN ('finished', 'cancelled')
      ORDER BY COALESCE(closed_at, ends_at) DESC
      LIMIT $1`, [limit]);
  if (!seasons.length) return [];
  const ids = seasons.map((s) => s.id);
  const { rows: winners } = await pool.query(
    `SELECT p.season_id, p.rank, p.invites, p.label, p.status,
            u.id AS user_id, u.nickname, u.first_name
       FROM invite_league_payouts p JOIN users u ON u.id = p.user_id
      WHERE p.season_id = ANY($1::uuid[]) AND p.status <> 'cancelled'
      ORDER BY p.season_id, p.rank`, [ids]);
  return seasons.map((s) => {
    const all = winners.filter((w) => w.season_id === s.id);
    return {
      title: s.title,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      top: all.slice(0, 3).map((w) => ({
        ...mapRow({ user_id: w.user_id, nickname: w.nickname, first_name: w.first_name,
          invites: w.invites, rank: w.rank }),
        label: w.label,
      })),
      me: userId ? (all.find((w) => w.user_id === userId)
        ? mapRow({ user_id: userId, invites: all.find((w) => w.user_id === userId).invites,
          rank: all.find((w) => w.user_id === userId).rank })
        : null) : null,
    };
  });
}

/**
 * همهٔ چیزی که تبِ «دعوت از دوستان» لازم دارد: تاپِ همهٔ زمان‌ها، لیگِ جاری و
 * آرشیو. یک تابع تا دو تبِ کلاینت هرگز دو منبعِ حقیقت نداشته باشند.
 */
async function overview(userId) {
  const [allTimeRows, allTimeMe, league, history] = await Promise.all([
    leaderboard({ limit: TOP_LIMIT }),
    standing(userId),
    leagueView(userId),
    archive(userId),
  ]);
  return {
    allTime: {
      rows: allTimeRows,
      me: allTimeMe,
      meInTop: Boolean(allTimeMe && allTimeRows.some((r) => r.userId === allTimeMe.userId)),
    },
    league,
    history,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// بستنِ دوره و ساختِ پرداخت‌ها
// ═══════════════════════════════════════════════════════════════════════════

/**
 * برندگانِ یک دوره را از جدولِ رتبه‌بندی بیرون می‌کشد (بدونِ نوشتن).
 * پنل ادمین پیش از بستن، همین را نشان می‌دهد تا مدیر بداند چه کسی چه می‌گیرد.
 */
async function previewWinners(season, client = pool) {
  const prizes = Array.isArray(season.prize_table) ? season.prize_table : [];
  if (!prizes.length) return [];
  const maxRank = prizes.reduce((acc, p) => Math.max(acc, Number(p.rank) || 0), 1);
  const rows = await leaderboard({
    startsAt: season.starts_at, endsAt: season.ends_at,
    minInvites: season.min_invites, limit: maxRank, client,
  });
  const byRank = new Map(rows.map((r) => [r.rank, r]));
  return prizes.map((prize) => {
    const winner = byRank.get(Number(prize.rank)) || null;
    return { prize, winner };
  });
}

/** متنِ «چی بردی» برای اعلان — مثلِ لیگِ ماهانه، در یک جا. */
function prizeSummary(prize) {
  const parts = [];
  if (Number(prize.points) > 0) parts.push(`${faAmount(prize.points)} امتیاز`);
  if (Number(prize.coins) > 0) parts.push(`${faAmount(prize.coins)} سکهٔ قلقلی`);
  if (Number(prize.spins) > 0) parts.push(`${faAmount(prize.spins)} چرخش گردونه`);
  if (Number(prize.cash) > 0) parts.push(`${faAmount(prize.cash)} تومان`);
  return parts.join(' + ') || 'جایزه';
}

/**
 * پایانِ یک دوره: برندگان را قفل می‌کند و ردیف‌های پرداختِ **در انتظارِ
 * تأیید** می‌سازد. پرداختِ واقعی در `approvePayouts` انجام می‌شود.
 *
 * ── چرا دو مرحله ──────────────────────────────────────────────────────────
 *
 * تصمیمِ مالک: «لیستِ تأیید برای ادمین (مثل لیگ)». خودکار پرداخت‌کردن یعنی
 * یک اشتباهِ تنظیمات (مثلاً رتبهٔ ۱ با ۱۰ میلیون تومان) بی‌برگشت پول
 * می‌دهد؛ با مرحلهٔ تأیید، مدیر پیش از واریز عددِ واقعی را می‌بیند.
 */
async function closeSeason({ seasonId, adminId = null } = {}) {
  if (!seasonId) throw prizeError('شناسهٔ آفر لازم است');
  const client = await pool.connect();
  let season = null;
  let created = [];
  let skipped = [];
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT * FROM invite_league_seasons WHERE id=$1 FOR UPDATE', [seasonId]);
    season = rows[0];
    if (!season) throw Object.assign(new Error('آفر پیدا نشد'), { status: 404 });
    if (season.status !== 'active') {
      throw Object.assign(new Error('این آفر قبلاً بسته شده است'), { status: 409 });
    }

    const preview = await previewWinners(season, client);
    for (const { prize, winner } of preview) {
      if (!winner) {
        skipped.push({ rank: prize.rank, reason: 'کسی به این رتبه نرسید' });
        continue;
      }
      const { rows: ins } = await client.query(
        `INSERT INTO invite_league_payouts
           (season_id, user_id, rank, invites, label,
            prize_points, prize_coins, prize_spins, prize_cash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (season_id, user_id) DO NOTHING
         RETURNING id`,
        [season.id, winner.userId, prize.rank, winner.invites, prize.label || null,
          Number(prize.points) || 0, Number(prize.coins) || 0,
          Number(prize.spins) || 0, Number(prize.cash) || 0]);
      if (ins[0]) created.push({ ...prize, userId: winner.userId, invites: winner.invites, payoutId: ins[0].id });
    }

    await client.query(
      `UPDATE invite_league_seasons
          SET status='finished', closed_at=NOW(), updated_at=NOW()
        WHERE id=$1`, [season.id]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  // اعلانِ زنگوله (+ پوش). مثلِ لیگِ ماهانه: «بردی، جایزه بعد از تأیید می‌آید».
  // چرا بیرونِ تراکنش: شکستِ اعلان نباید بستنِ دوره را برگرداند.
  for (const row of created) {
    const body = `تبریک! با ${faDigits(row.invites)} دعوتِ معتبر رتبهٔ ${faDigits(row.rank)} لیگ معرف‌ها را گرفتی`
      + ` و ${prizeSummary(row)} بردی. جایزه پس از تأیید مدیر به حسابت واریز می‌شود.`;
    createNotification(row.userId, 'invite_league', `رتبهٔ ${faDigits(row.rank)} لیگ معرف‌ها`, body)
      .catch((e) => console.error('[invite-league] notify failed:', e.message));
  }

  return { season, created, skipped, adminId };
}

// ═══════════════════════════════════════════════════════════════════════════
// تأیید و پرداخت
// ═══════════════════════════════════════════════════════════════════════════

/**
 * پرداختِ جایزهٔ برندگان.
 *
 * ⚠️ هر ردیف در **تراکنشِ خودش** پرداخت می‌شود. اگر یک ردیف خراب باشد (مثلاً
 *    کاربرش حذف شده)، بقیه واریز می‌شوند و مدیر گزارشِ خطای همان ردیف را
 *    می‌بیند؛ یک خطا نباید دستِ همه را خالی بگذارد.
 */
async function approvePayouts({ payoutId = null, seasonId = null, adminId = null } = {}) {
  const { rows: targets } = await pool.query(
    `SELECT p.*, s.title AS season_title FROM invite_league_payouts p
       JOIN invite_league_seasons s ON s.id = p.season_id
      WHERE p.status = 'pending'
        AND ($1::uuid IS NULL OR p.id = $1)
        AND ($2::uuid IS NULL OR p.season_id = $2)
      ORDER BY p.created_at`, [payoutId, seasonId]);

  const paid = [];
  const failed = [];
  for (const payout of targets) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT * FROM invite_league_payouts
          WHERE id=$1 AND status='pending' FOR UPDATE`, [payout.id]);
      const row = rows[0];
      if (!row) { await client.query('ROLLBACK'); continue; }

      const reference = { referenceType: 'invite_league_payout', referenceId: row.id };
      const description = `جایزهٔ «${row.label || `رتبهٔ ${row.rank}`}» لیگ معرف‌ها — ${payout.season_title}`;

      if (Number(row.prize_points) > 0) {
        await points.credit(client, {
          userId: row.user_id, points: Number(row.prize_points),
          source: 'invite_league', ...reference, description, adminId,
          // ⚠️ `league: false` — مثلِ جایزهٔ غیرنقدیِ لیگ: امتیازِ جایزه نباید
          //    در جدولِ لیگِ ماهانهٔ بعد بنشیند، وگرنه جایزه به خودش برمی‌گردد.
          league: false,
        });
      }
      if (Number(row.prize_coins) > 0) {
        await client.query(
          'UPDATE users SET coins = coins + $2, updated_at = NOW() WHERE id=$1',
          [row.user_id, Number(row.prize_coins)]);
        await coinLedger.record(client, {
          userId: row.user_id, delta: Number(row.prize_coins),
          source: 'invite_league', ...reference, description,
        });
      }
      if (Number(row.prize_spins) > 0) {
        await client.query(
          'UPDATE users SET bonus_spins = bonus_spins + $2, updated_at = NOW() WHERE id=$1',
          [row.user_id, Number(row.prize_spins)]);
      }
      if (Number(row.prize_cash) > 0) {
        await wallet.credit(client, {
          userId: row.user_id, amount: Number(row.prize_cash),
          source: 'invite_league', ...reference, description,
        });
      }

      await client.query(
        `UPDATE invite_league_payouts
            SET status='paid', paid_at=NOW(), approved_by=$2
          WHERE id=$1`, [row.id, adminId]);
      await client.query('COMMIT');
      paid.push(row);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      failed.push({ id: payout.id, userId: payout.user_id, message: e.message });
    } finally {
      client.release();
    }
  }

  for (const row of paid) {
    const body = `جایزهٔ لیگ معرف‌ها واریز شد: ${prizeSummary({
      points: row.prize_points, coins: row.prize_coins,
      spins: row.prize_spins, cash: row.prize_cash,
    })} — بابت ${faDigits(row.invites)} دعوت و رتبهٔ ${faDigits(row.rank)}.`;
    createNotification(row.user_id, 'invite_league', 'جایزهٔ لیگ معرف‌ها رسید', body)
      .catch((e) => console.error('[invite-league] payout notify failed:', e.message));
  }

  return { paid: paid.length, failed };
}

// ═══════════════════════════════════════════════════════════════════════════
// پنل ادمین
// ═══════════════════════════════════════════════════════════════════════════

/** همهٔ چیزی که صفحهٔ «لیگ معرف‌ها» در پنل لازم دارد. */
async function adminOverview() {
  const [active, seasons, payouts] = await Promise.all([
    activeSeason(),
    pool.query(
      `SELECT s.*,
              (SELECT COUNT(*)::int FROM invite_league_payouts p
                WHERE p.season_id = s.id AND p.status <> 'cancelled') AS winner_count,
              (SELECT COUNT(*)::int FROM invite_league_payouts p
                WHERE p.season_id = s.id AND p.status = 'pending') AS pending_count
         FROM invite_league_seasons s
        ORDER BY COALESCE(s.closed_at, s.ends_at) DESC LIMIT 20`),
    pool.query(
      `SELECT p.*, u.nickname, u.first_name, s.title AS season_title
         FROM invite_league_payouts p
         JOIN users u ON u.id = p.user_id
         JOIN invite_league_seasons s ON s.id = p.season_id
        WHERE p.status = 'pending'
        ORDER BY s.closed_at DESC NULLS LAST, p.rank LIMIT 200`),
  ]);

  const preview = active ? await previewWinners(active) : [];
  const live = active ? await leaderboard({
    startsAt: active.starts_at, endsAt: active.ends_at,
    minInvites: active.min_invites, limit: 20,
  }) : [];

  return {
    active: active ? { ...active, preview, leaderboard: live } : null,
    seasons: seasons.rows,
    pendingPayouts: payouts.rows.map((p) => ({
      id: p.id, seasonId: p.season_id, seasonTitle: p.season_title,
      userId: p.user_id, nickname: p.nickname || p.first_name || 'کاربر',
      rank: p.rank, invites: p.invites, label: p.label,
      prizes: {
        points: Number(p.prize_points), coins: Number(p.prize_coins),
        spins: Number(p.prize_spins), cash: Number(p.prize_cash),
      },
      status: p.status, createdAt: p.created_at,
    })),
  };
}

module.exports = {
  MAX_PRIZE_ROWS,
  sanitizePrizeTable,
  leaderboard,
  standing,
  activeSeason,
  leagueView,
  archive,
  overview,
  previewWinners,
  prizeSummary,
  closeSeason,
  approvePayouts,
  adminOverview,
};
