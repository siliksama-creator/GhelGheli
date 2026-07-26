// Personal bests + leaderboard for the solo (time-attack) mode.
//
// NOTE: solo runs award NO points on purpose. A single player cannot be
// refereed by an opponent, so tying the balance to it would be a free farm.
// The reward is the record itself.
const { pool } = require('../config/db');

/// Ordering used everywhere: fastest wins, fewest flips breaks the tie.
const ORDER = 'duration_ms ASC, flips ASC, created_at ASC';

async function bestOf(userId, gameId, client = pool) {
  const { rows } = await client.query(
    `SELECT duration_ms, flips, created_at FROM solo_records
     WHERE user_id=$1 AND game_id=$2 ORDER BY ${ORDER} LIMIT 1`,
    [userId, gameId],
  );
  return rows[0] || null;
}

/**
 * Stores a finished run and reports whether it beat the player's own best.
 * @returns {{isRecord:boolean, best:object|null, previous:object|null, rank:number|null}}
 */
async function submitRun({ userId, gameId, durationMs, flips }) {
  const ms = Math.trunc(Number(durationMs));
  const f = Math.trunc(Number(flips));
  // Reject nonsense rather than poisoning the leaderboard with it.
  if (!userId || !gameId || !Number.isFinite(ms) || ms <= 0 || !Number.isFinite(f) || f <= 0) {
    return { isRecord: false, best: null, previous: null, rank: null };
  }

  const previous = await bestOf(userId, gameId);
  await pool.query(
    `INSERT INTO solo_records(user_id, game_id, duration_ms, flips)
     VALUES($1,$2,$3,$4)`,
    [userId, gameId, ms, f],
  );

  const isRecord = !previous
    || ms < previous.duration_ms
    || (ms === previous.duration_ms && f < previous.flips);

  // Rank among every player's PERSONAL best, not among all runs — otherwise
  // one very good player filling the top ten would hide everyone else.
  const { rows } = await pool.query(
    `WITH bests AS (
       SELECT DISTINCT ON (user_id) user_id, duration_ms, flips
       FROM solo_records WHERE game_id=$1
       ORDER BY user_id, ${ORDER}
     )
     SELECT count(*)::int + 1 AS rank FROM bests
     WHERE (duration_ms, flips) < ($2::int, $3::int)`,
    [gameId, isRecord ? ms : (previous?.duration_ms ?? ms), isRecord ? f : (previous?.flips ?? f)],
  );

  return {
    isRecord,
    best: isRecord ? { durationMs: ms, flips: f } : {
      durationMs: previous.duration_ms, flips: previous.flips,
    },
    previous: previous ? { durationMs: previous.duration_ms, flips: previous.flips } : null,
    rank: rows[0]?.rank ?? null,
  };
}

/// Top personal bests. One row per player so a single fast user can't own
/// the whole board.
async function leaderboard(gameId, limit = 20) {
  const n = Math.max(1, Math.min(100, Math.trunc(Number(limit)) || 20));
  const { rows } = await pool.query(
    `WITH bests AS (
       SELECT DISTINCT ON (r.user_id)
              r.user_id, r.duration_ms, r.flips, r.created_at
       FROM solo_records r WHERE r.game_id=$1
       ORDER BY r.user_id, ${ORDER}
     )
     SELECT b.duration_ms, b.flips, b.created_at,
            u.id AS user_id, u.nickname, u.first_name,
            u.profile_image_url, u.profile_avatar_key
     FROM bests b JOIN users u ON u.id = b.user_id
     ORDER BY b.duration_ms ASC, b.flips ASC, b.created_at ASC
     LIMIT $2`,
    [gameId, n],
  );
  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.user_id,
    nickname: r.nickname || r.first_name || 'کاربر',
    profileImageUrl: r.profile_image_url || null,
    profileAvatarKey: r.profile_avatar_key || null,
    durationMs: r.duration_ms,
    flips: r.flips,
    createdAt: r.created_at,
  }));
}

/// Everything the solo screen needs in ONE round trip: my best + the board.
async function summary(userId, gameId) {
  const [mine, board] = await Promise.all([
    bestOf(userId, gameId),
    leaderboard(gameId, 20),
  ]);
  const myRank = board.findIndex(r => r.userId === userId);
  return {
    gameId,
    best: mine ? { durationMs: mine.duration_ms, flips: mine.flips, createdAt: mine.created_at } : null,
    rank: myRank >= 0 ? myRank + 1 : null,
    leaderboard: board,
  };
}

module.exports = { submitRun, leaderboard, bestOf, summary };
