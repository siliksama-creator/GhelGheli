// Awards points for finished ONLINE matches.
//
// Rules that matter:
//   * bot games award nothing — otherwise points could be farmed on repeat
//   * a daily cap stops two friends from trading wins all night
//   * points can go negative for a loss if the admin configures it, but a
//     user's balance is never pushed below zero
//   * every change is written to game_results so support can explain it
const { pool } = require('../config/db');

const DEFAULTS = {
  enabled: false,
  winPoints: 10,
  losePoints: 0,
  drawPoints: 0,
  dailyCap: 10,
};

const int = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

async function getGameRewardSettings(client = pool) {
  const { rows } = await client.query(
    "SELECT value FROM app_settings WHERE key='game_reward_settings' LIMIT 1",
  );
  const v = rows[0]?.value;
  if (!v || typeof v !== 'object') return { ...DEFAULTS };
  return {
    enabled: Boolean(v.enabled),
    // Clamped to a sane band so a typo in the panel can't hand out 1e9 points.
    winPoints: Math.max(0, Math.min(1000, int(v.winPoints, DEFAULTS.winPoints))),
    losePoints: Math.max(-1000, Math.min(0, int(v.losePoints, DEFAULTS.losePoints))),
    drawPoints: Math.max(-1000, Math.min(1000, int(v.drawPoints, DEFAULTS.drawPoints))),
    dailyCap: Math.max(0, Math.min(500, int(v.dailyCap, DEFAULTS.dailyCap))),
  };
}

async function saveGameRewardSettings(body, adminId) {
  const value = {
    enabled: Boolean(body.enabled),
    winPoints: Math.max(0, Math.min(1000, int(body.winPoints, DEFAULTS.winPoints))),
    losePoints: Math.max(-1000, Math.min(0, int(body.losePoints, DEFAULTS.losePoints))),
    drawPoints: Math.max(-1000, Math.min(1000, int(body.drawPoints, DEFAULTS.drawPoints))),
    dailyCap: Math.max(0, Math.min(500, int(body.dailyCap, DEFAULTS.dailyCap))),
  };
  await pool.query(
    `INSERT INTO app_settings(key,value,updated_by_admin_id,updated_at)
     VALUES('game_reward_settings',$1,$2,NOW())
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,
       updated_by_admin_id=EXCLUDED.updated_by_admin_id, updated_at=NOW()`,
    [JSON.stringify(value), adminId],
  );
  return value;
}

/// How many scoring matches this user already had today.
async function countToday(client, userId) {
  const { rows } = await client.query(
    `SELECT count(*)::int AS c FROM game_results
     WHERE user_id=$1 AND created_at >= date_trunc('day', NOW())`,
    [userId],
  );
  return rows[0].c;
}

/**
 * Records the outcome of a finished match and applies the point change.
 *
 * @param {object} p
 * @param {string} p.gameId
 * @param {boolean} p.vsBot     bot matches are logged as 0 points
 * @param {string|null} p.winner 'X' | 'O' | 'DRAW' | 'DISCONNECT' | null
 * @param {object} p.players    { X: {id}, O: {id} }
 * @returns {Promise<Array<{userId:string, delta:number, outcome:string}>>}
 */
async function recordMatch({ gameId, vsBot, winner, players }) {
  // Only completed human-vs-human games score. A DISCONNECT is deliberately
  // NOT scored: quitting shouldn't hand the other player free points, and
  // punishing a dropped connection would be unfair on a mobile network.
  if (vsBot) return [];
  if (winner !== 'X' && winner !== 'O' && winner !== 'DRAW') return [];

  const xId = players?.X?.id;
  const oId = players?.O?.id;
  if (!xId || !oId || xId === oId) return [];

  const cfg = await getGameRewardSettings();
  if (!cfg.enabled) return [];

  const outcomeFor = sym =>
    winner === 'DRAW' ? 'draw' : (winner === sym ? 'win' : 'loss');
  const deltaFor = outcome =>
    outcome === 'win' ? cfg.winPoints
      : outcome === 'loss' ? cfg.losePoints
        : cfg.drawPoints;

  const applied = [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const [sym, userId] of [['X', xId], ['O', oId]]) {
      const outcome = outcomeFor(sym);
      let delta = deltaFor(outcome);

      // Daily cap only limits POSITIVE awards; a penalty always applies.
      if (delta > 0 && cfg.dailyCap > 0) {
        const used = await countToday(client, userId);
        if (used >= cfg.dailyCap) delta = 0;
      }

      await client.query(
        `INSERT INTO game_results(user_id,opponent_user_id,game_id,outcome,points_delta)
         VALUES($1,$2,$3,$4,$5)`,
        [userId, sym === 'X' ? oId : xId, gameId, outcome, delta],
      );

      if (delta !== 0) {
        // GREATEST(...,0) keeps a balance from going negative after a penalty.
        // lifetime_points only ever grows, so a loss must not reduce it.
        // ── دفتر امتیاز با قفل ردیف (FOR UPDATE) ──
        //
        // باگ قبلی: `RETURNING (SELECT current_points …)` زیرکوئری را از
        // اسنپ‌شاتِ ابتدای دستور می‌خواند. تحت همزمانی دو مسابقه،
        // before_val با مقدار واقعیِ قبل از این UPDATE یکی نبود و
        // تفاضلِ دفتر غلط ثبت می‌شد.
        //
        // الگو مثل pointService: قفل، محاسبهٔ actual داخل SQL، بعد UPDATE.
        const { rows: bal } = await client.query(
          `WITH locked AS (
             SELECT id, current_points AS before_val
               FROM users WHERE id = $2 FOR UPDATE
           ),
           calc AS (
             SELECT id, before_val,
                    GREATEST(before_val + $1, 0) AS after_val,
                    GREATEST(before_val + $1, 0) - before_val AS actual
               FROM locked
           )
           UPDATE users u SET
             current_points = c.after_val,
             lifetime_points = u.lifetime_points + GREATEST(c.actual, 0),
             monthly_league_points = GREATEST(u.monthly_league_points + c.actual, 0),
             updated_at = NOW()
            FROM calc c
           WHERE u.id = c.id
           RETURNING c.after_val AS current_points, c.actual, c.before_val`,
          [delta, userId],
        );
        if (bal[0]) {
          const actual = Number(bal[0].actual);
          if (actual !== 0) {
            await client.query(
              `INSERT INTO point_transactions
                 (user_id, delta, balance_after, source, reference_type,
                  description)
               VALUES ($1,$2,$3,'game','game_results',$4)`,
              [userId, actual, bal[0].current_points,
                outcome === 'win' ? `برد در بازی ${gameId}`
                  : outcome === 'loss' ? `باخت در بازی ${gameId}`
                    : `بازی ${gameId}`]);
          }
        }
        // NO REFERRAL COMMISSION HERE — deliberately.
        //
        // The owner narrowed the rule: "این ۵ درصد فقط از امتیازهایی بدست
        // میاد که کاربر خودش کارت ثبت کرده و یا امتیاز رو از بازی ضربه زن
        // بدست آورده". Online matches are neither.
        //
        // It also closes a farm: two accounts trading wins would mint
        // commission for whoever referred them, on top of the points
        // themselves. The daily cap limits the points but would not have
        // limited that.
      }
      applied.push({ userId, delta, outcome });
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[gameReward] failed to record match:', e.message);
    return [];
  } finally {
    client.release();
  }
  return applied;
}

module.exports = {
  getGameRewardSettings,
  saveGameRewardSettings,
  recordMatch,
  DEFAULTS,
};
