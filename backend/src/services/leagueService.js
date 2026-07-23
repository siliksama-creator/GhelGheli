const { pool } = require('../config/db');

function currentMonthYear(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function monthBounds(d = new Date()) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
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
async function closeActiveSeason() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const season = await ensureActiveSeason(client);
    const setting = await client.query("SELECT value FROM app_settings WHERE key='league_winner_count' LIMIT 1");
    const rawWinnerCount = setting.rows[0]?.value;
    const winnerCount = Number.isFinite(Number(rawWinnerCount)) && Number(rawWinnerCount) > 0 ? Math.floor(Number(rawWinnerCount)) : Math.max(10, (season.prize_table || []).length || 10);
    const { rows: leaders } = await client.query(
      `SELECT e.user_id, e.points, DENSE_RANK() OVER(ORDER BY e.points DESC) AS rank
       FROM league_leaderboard_entries e WHERE e.league_season_id=$1 ORDER BY e.points DESC LIMIT $2`,
      [season.id, winnerCount]
    );
    const prizeMap = new Map((season.prize_table || []).map(p => [Number(p.rank), Number(p.amount || 0)]));
    for (const entry of leaders) {
      const amount = prizeMap.get(Number(entry.rank)) || 0;
      await client.query(
        `INSERT INTO league_payouts(league_season_id,user_id,rank,amount)
         VALUES($1,$2,$3,$4) ON CONFLICT(league_season_id, rank) DO NOTHING`,
        [season.id, entry.user_id, entry.rank, amount]
      );
      await client.query('UPDATE league_leaderboard_entries SET rank=$1 WHERE league_season_id=$2 AND user_id=$3', [entry.rank, season.id, entry.user_id]);
    }
    await client.query("UPDATE league_seasons SET status='closed', updated_at=NOW() WHERE id=$1", [season.id]);
    await client.query('UPDATE users SET monthly_league_points=0');
    await client.query('COMMIT');
    return { seasonId: season.id, winners: leaders.length };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally { client.release(); }
}
module.exports = { ensureActiveSeason, addLeaguePoints, getLeaderboard, closeActiveSeason, defaultPrizeTable };
