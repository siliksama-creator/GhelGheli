const { pool } = require('../config/db');
const walletService = require('./walletService');

// LEAGUE MONTHS RUN ON THE IRANIAN CALENDAR, IN TEHRAN TIME.
//
// These used to be computed with Date.UTC(), which is wrong twice over:
//
//   * the boundary landed at 03:30 Tehran rather than midnight, so the last
//     3.5 hours of every month were scored into the NEXT one, and
//   * it followed the Gregorian month, not the Persian month the players and
//     the admin panel actually see. A season labelled "مرداد" started and
//     ended on Gregorian dates.
//
// Intl with the persian calendar gives the Jalali date for a moment in
// Tehran; from that we can walk to the exact instant a Persian month starts.
const TZ = 'Asia/Tehran';

const jalaliParts = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', {
  timeZone: TZ,
  year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: 'numeric', second: 'numeric',
  hour12: false,
});

/** Jalali Y/M/D plus Tehran wall-clock time for an instant. */
function toJalali(date = new Date()) {
  const p = Object.fromEntries(
    jalaliParts.formatToParts(date)
      .filter(x => x.type !== 'literal')
      .map(x => [x.type, Number(x.value)])
  );
  return p; // { year, month, day, hour, minute, second }
}

/**
 * The UTC instant at which a given Jalali year/month begins (midnight Tehran).
 *
 * Done by binary search over time rather than with a conversion formula: ask
 * Intl what the Tehran-local Jalali date is at instant X, and narrow until we
 * find the first millisecond that belongs to the target month. That is
 * automatically correct across leap years and any future DST change, because
 * the calendar authority is the platform, not arithmetic here.
 */
function jalaliMonthStart(jYear, jMonth) {
  const key = jYear * 12 + (jMonth - 1);
  const keyOf = d => { const p = toJalali(d); return p.year * 12 + (p.month - 1); };

  // Bracket the boundary: a point known to be before it and one after.
  // Persian year N starts around 21 March of Gregorian year N+621.
  let lo = Date.UTC(jYear + 620, 2, 1);          // a year early: safely before
  let hi = Date.UTC(jYear + 622, 5, 1);          // safely after

  // Guard against a bad bracket rather than looping forever.
  if (keyOf(new Date(lo)) >= key || keyOf(new Date(hi)) < key) {
    lo = Date.UTC(jYear + 618, 0, 1);
    hi = Date.UTC(jYear + 624, 0, 1);
  }

  // Binary search to the millisecond: lo is always < target month,
  // hi is always >= target month.
  while (hi - lo > 1) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (keyOf(new Date(mid)) < key) lo = mid;
    else hi = mid;
  }
  return new Date(hi);
}

/** e.g. "1405-05" — the Jalali month a moment falls in, Tehran time. */
function currentMonthYear(d = new Date()) {
  const p = toJalali(d);
  return `${p.year}-${String(p.month).padStart(2, '0')}`;
}

/** Start/end instants of the Jalali month containing `d`. */
function monthBounds(d = new Date()) {
  const p = toJalali(d);
  const start = jalaliMonthStart(p.year, p.month);
  const nextMonth = p.month === 12 ? 1 : p.month + 1;
  const nextYear = p.month === 12 ? p.year + 1 : p.year;
  const end = jalaliMonthStart(nextYear, nextMonth);
  return { start, end };
}
function defaultPrizeTable() {
  return Array.from({ length: 10 }, (_, i) => ({ rank: i + 1, amount: 0 }));
}
async function ensureActiveSeason(client = pool) {
  const { rows } = await client.query("SELECT * FROM league_seasons WHERE status='active' ORDER BY starts_at DESC LIMIT 1");
  if (rows[0]) return rows[0];
  const { start, end } = monthBounds();
  const my = currentMonthYear();
  const inserted = await client.query(
    `INSERT INTO league_seasons(month_year, starts_at, ends_at, status, prize_table)
     VALUES ($1,$2,$3,'active',$4) ON CONFLICT (month_year) DO UPDATE SET status='active' RETURNING *`,
    [my, start, end, JSON.stringify(defaultPrizeTable())]
  );
  return inserted.rows[0];
}
async function addLeaguePoints(client, userId, points) {
  const season = await ensureActiveSeason(client);
  await client.query(
    `INSERT INTO league_leaderboard_entries(league_season_id,user_id,points)
     VALUES($1,$2,$3)
     ON CONFLICT(league_season_id,user_id)
     DO UPDATE SET points=league_leaderboard_entries.points + EXCLUDED.points, updated_at=NOW()`,
    [season.id, userId, points]
  );
}
async function getLeaderboard(limit = 100) {
  const season = await ensureActiveSeason();
  const { rows } = await pool.query(
    `SELECT e.user_id, e.points, DENSE_RANK() OVER(ORDER BY e.points DESC) AS rank,
            u.nickname, u.first_name, u.last_name, u.profile_image_url
     FROM league_leaderboard_entries e
     JOIN users u ON u.id=e.user_id
     WHERE e.league_season_id=$1 AND u.status='active'
     ORDER BY e.points DESC, e.updated_at ASC LIMIT $2`,
    [season.id, limit]
  );
  return { season, entries: rows };
}
async function closeActiveSeason({ force = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock the season row so two concurrent runs (a cron overlapping a manual
    // admin trigger) cannot both pay out the same month.
    const season = await ensureActiveSeason(client);
    const locked = await client.query(
      'SELECT status, ends_at FROM league_seasons WHERE id=$1 FOR UPDATE', [season.id]);
    if (locked.rows[0]?.status === 'closed') {
      await client.query('COMMIT');
      return { seasonId: season.id, winners: 0, skipped: 'already closed' };
    }
    // Refuse to close a season early unless explicitly forced. A misfiring
    // cron in the middle of the month would otherwise wipe every player's
    // monthly points and hand out prizes for a half-finished league.
    const endsAt = locked.rows[0]?.ends_at;
    if (!force && endsAt && new Date(endsAt) > new Date()) {
      await client.query('COMMIT');
      return { seasonId: season.id, winners: 0, skipped: 'season still running' };
    }
    const setting = await client.query("SELECT value FROM app_settings WHERE key='league_winner_count' LIMIT 1");
    const rawWinnerCount = setting.rows[0]?.value;
    const winnerCount = Number.isFinite(Number(rawWinnerCount)) && Number(rawWinnerCount) > 0 ? Math.floor(Number(rawWinnerCount)) : Math.max(10, (season.prize_table || []).length || 10);
    const { rows: leaders } = await client.query(
      `SELECT e.user_id, e.points, DENSE_RANK() OVER(ORDER BY e.points DESC) AS rank
       FROM league_leaderboard_entries e WHERE e.league_season_id=$1 ORDER BY e.points DESC LIMIT $2`,
      [season.id, winnerCount]
    );
    // دفاع لایه‌دوم: ورودی از API حالا اعتبارسنجی می‌شود، ولی جدول‌های
    // ذخیره‌شدهٔ قدیمی (یا ویرایش مستقیم در دیتابیس) ممکن است هنوز مبلغ
    // منفی/NaN داشته باشند. یک مقدار بد نباید **کل بستن لیگ** را بخواباند
    // و همهٔ برنده‌ها را بی‌جایزه بگذارد — بازتولید شد: قید
    // league_payouts_amount_check می‌شکست و فصل «active» می‌ماند.
    // پس مقدار نامعتبر را به صفر تبدیل می‌کنیم و هشدار می‌دهیم.
    const prizeMap = new Map();
    for (const p of season.prize_table || []) {
      const rank = Number(p?.rank);
      let amount = Number(p?.amount ?? 0);
      if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
        console.error(`[league] جایزهٔ نامعتبر برای رتبهٔ ${p?.rank} (${p?.amount}) — صفر در نظر گرفته شد`);
        amount = 0;
      }
      if (Number.isFinite(rank)) prizeMap.set(rank, amount);
    }
    let credited = 0;
    let creditedUsers = 0;
    for (const entry of leaders) {
      const amount = prizeMap.get(Number(entry.rank)) || 0;
      // TIE HANDLING.
      // DENSE_RANK gives tied players the same rank, which is correct. The
      // conflict target used to be (season, rank), so on a tie for 3rd place
      // the second player's insert hit ON CONFLICT DO NOTHING and their prize
      // vanished with no error. The real invariant is one payout per USER per
      // season — see migration 014.
      const payout = await client.query(
        `INSERT INTO league_payouts(league_season_id,user_id,rank,amount)
         VALUES($1,$2,$3,$4)
         ON CONFLICT(league_season_id, user_id) DO UPDATE
           SET rank = EXCLUDED.rank, amount = EXCLUDED.amount
         RETURNING id, paid_at`,
        [season.id, entry.user_id, entry.rank, amount]
      );
      await client.query('UPDATE league_leaderboard_entries SET rank=$1 WHERE league_season_id=$2 AND user_id=$3', [entry.rank, season.id, entry.user_id]);

      // PAY THE WINNER.
      //
      // This step did not exist: closing a season wrote a league_payouts row
      // and stopped there, so the prize was recorded but the money never
      // reached anyone's wallet. Nobody had actually been paid.
      //
      // walletService.credit is idempotent on (source, reference_id), so a
      // re-run of the close job — or a retry after a crash mid-transaction —
      // cannot pay the same rank twice.
      if (amount > 0 && !payout.rows[0].paid_at) {
        const res = await walletService.credit(client, {
          userId: entry.user_id,
          amount,
          source: 'league',
          referenceType: 'league_payout',
          referenceId: payout.rows[0].id,
          description: `جایزهٔ لیگ ${season.month_year} — رتبهٔ ${entry.rank}`,
        });
        if (!res.duplicate) {
          credited += amount;
          creditedUsers += 1;
        }
        await client.query(
          'UPDATE league_payouts SET paid_at=NOW() WHERE id=$1',
          [payout.rows[0].id]);
      }
    }
    await client.query(
      "UPDATE league_seasons SET status='closed', paid_at=NOW(), updated_at=NOW() WHERE id=$1",
      [season.id]);
    await client.query('UPDATE users SET monthly_league_points=0');
    await client.query('COMMIT');
    return {
      seasonId: season.id,
      winners: leaders.length,
      credited,
      creditedUsers,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally { client.release(); }
}
module.exports = { ensureActiveSeason, addLeaguePoints, getLeaderboard, closeActiveSeason, defaultPrizeTable };
