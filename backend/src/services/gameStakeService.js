const { pool } = require('../config/db');
const pointService = require('./pointService');

// مسابقهٔ عمومی فقط دو ورودی رسمی دارد. لابی خصوصی علاوه بر این دو،
// رایگان و ۵۰۰۰ هم دارد. عددِ دلخواه از payload هرگز پذیرفته نمی‌شود.
const PUBLIC_STAKES = Object.freeze([0, 100, 1000]);
const LOBBY_STAKES = Object.freeze([0, 100, 1000, 5000]);

class StakeError extends Error {
  constructor(message, code = 'STAKE_ERROR') {
    super(message);
    this.name = 'StakeError';
    this.code = code;
    this.status = 400;
  }
}

function parseStake(raw, allowed) {
  const value = raw === undefined || raw === null || raw === '' ? 0 : Number(raw);
  if (!Number.isSafeInteger(value) || !allowed.includes(value)) {
    throw new StakeError('مقدار امتیاز مسابقه معتبر نیست', 'INVALID_STAKE');
  }
  return value;
}

const parsePublicStake = raw => parseStake(raw, PUBLIC_STAKES);
const parseLobbyStake = raw => parseStake(raw, LOBBY_STAKES);

function createGameStakeService(db = pool, points = pointService) {
  async function canAfford(userId, stake) {
    if (stake === 0) return { ok: true, balance: null };
    const { rows } = await db.query(
      'SELECT current_points, status FROM users WHERE id=$1', [userId]);
    const user = rows[0];
    if (!user || user.status !== 'active') {
      throw new StakeError('حساب کاربری برای مسابقه در دسترس نیست', 'USER_UNAVAILABLE');
    }
    const balance = Number(user.current_points || 0);
    return { ok: balance >= stake, balance };
  }

  /**
   * ورودی هر دو بازیکن را پیش از game:start در یک تراکنش رزرو می‌کند.
   * قفل‌ها بر اساس UUID مرتب می‌شوند تا دو بازی هم‌زمان با بازیکنان مشترک
   * deadlock نسازند. بعد از این تابع، ساخت اتاق امن است؛ قبلش نه.
   */
  async function reserveMatch({ matchId, gameId, stake, playerXId, playerOId }) {
    if (!matchId || !playerXId || !playerOId || playerXId === playerOId) {
      throw new StakeError('بازیکنان مسابقه معتبر نیستند', 'INVALID_PLAYERS');
    }
    if (!LOBBY_STAKES.includes(stake) || stake === 0) {
      throw new StakeError('ورودی مسابقه امتیازی معتبر نیست', 'INVALID_STAKE');
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const ids = [playerXId, playerOId].sort();
      const { rows } = await client.query(
        `SELECT id, current_points, status
           FROM users
          WHERE id = ANY($1::uuid[])
          ORDER BY id
          FOR UPDATE`, [ids]);
      if (rows.length !== 2 || rows.some(u => u.status !== 'active')) {
        throw new StakeError('یکی از بازیکنان در دسترس نیست', 'USER_UNAVAILABLE');
      }
      const byId = new Map(rows.map(r => [r.id, Number(r.current_points || 0)]));
      const low = rows.find(r => Number(r.current_points || 0) < stake);
      if (low) {
        throw new StakeError('برای ورود به این مسابقه امتیاز کافی نداری', 'INSUFFICIENT_POINTS');
      }

      const grossPot = stake * 2;
      const commission = Math.ceil(grossPot * 0.10);
      const netPot = grossPot - commission;
      await client.query(
        `INSERT INTO game_stake_matches
           (id, game_id, player_x_id, player_o_id, stake_points,
            gross_pot, commission_points, net_pot, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'reserved')`,
        [matchId, gameId, playerXId, playerOId, stake, grossPot, commission, netPot]);

      // چون ردیف‌های users همین بالا FOR UPDATE شده‌اند، هر debit باید دقیقاً
      // کل stake را کم کند. کسر جزئی اینجا خطاست و کل transaction برمی‌گردد.
      for (const userId of ids) {
        const d = await points.debit(client, {
          userId,
          points: stake,
          source: 'game',
          referenceType: 'game_stake_entry',
          referenceId: matchId,
          description: `ورودی مسابقه ${stake} امتیازی`,
          league: false,
        });
        if (!d || d.delta !== -stake) {
          throw new StakeError('رزرو امتیاز مسابقه کامل نشد', 'RESERVE_FAILED');
        }
        byId.set(userId, d.balanceAfter);
      }

      await client.query('COMMIT');
      return {
        matchId, stake, grossPot, commission, netPot,
        balances: Object.fromEntries(byId),
      };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  /** تسویهٔ برد یا تساوی؛ قفل ردیف match آن را idempotent می‌کند. */
  async function settleMatch({ matchId, winnerUserId = null, draw = false }) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        'SELECT * FROM game_stake_matches WHERE id=$1 FOR UPDATE', [matchId]);
      const match = rows[0];
      if (!match) throw new StakeError('سند مسابقه پیدا نشد', 'MATCH_NOT_FOUND');
      if (match.status !== 'reserved') {
        await client.query('COMMIT');
        return { duplicate: true, status: match.status, outcome: match.outcome };
      }

      const stake = Number(match.stake_points);
      const netPot = Number(match.net_pot);
      const players = [match.player_x_id, match.player_o_id].sort();
      let outcome;
      let winnerBalanceAfter = null;

      if (draw) {
        for (const userId of players) {
          await points.credit(client, {
            userId,
            points: stake,
            source: 'game',
            referenceType: 'game_stake_draw_refund',
            referenceId: matchId,
            description: `بازگشت ورودی مسابقه مساوی (${stake} امتیاز)`,
            league: false,
            lifetimeGain: 0,
          });
        }
        outcome = 'draw';
      } else {
        if (![match.player_x_id, match.player_o_id].includes(winnerUserId)) {
          throw new StakeError('برنده مسابقه معتبر نیست', 'INVALID_WINNER');
        }
        // lifetime فقط سود واقعی را می‌گیرد؛ برگشت اصل stake «کسب تازه» نیست.
        const payout = await points.credit(client, {
          userId: winnerUserId,
          points: netPot,
          source: 'game',
          referenceType: 'game_stake_payout',
          referenceId: matchId,
          description: `برد پات مسابقه ${stake} امتیازی`,
          league: false,
          lifetimeGain: Math.max(0, netPot - stake),
        });
        winnerBalanceAfter = Number(payout?.balanceAfter ?? 0);
        outcome = 'winner';
      }

      await client.query(
        `UPDATE game_stake_matches
            SET status='settled', outcome=$2, winner_user_id=$3, settled_at=NOW()
          WHERE id=$1 AND status='reserved'`,
        [matchId, outcome, draw ? null : winnerUserId]);
      await client.query('COMMIT');
      return {
        duplicate: false,
        status: 'settled',
        outcome,
        stake,
        netPot,
        commission: Number(match.commission_points),
        winnerUserId: draw ? null : winnerUserId,
        winnerBalanceAfter: draw ? null : winnerBalanceAfter,
      };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async function refundMatch(matchId, referenceType = 'game_stake_stale_refund') {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        'SELECT * FROM game_stake_matches WHERE id=$1 FOR UPDATE', [matchId]);
      const match = rows[0];
      if (!match || match.status !== 'reserved') {
        await client.query('COMMIT');
        return { refunded: false, status: match?.status || 'missing' };
      }
      const stake = Number(match.stake_points);
      for (const userId of [match.player_x_id, match.player_o_id].sort()) {
        await points.credit(client, {
          userId,
          points: stake,
          source: 'game',
          referenceType,
          referenceId: matchId,
          description: 'بازگشت خودکار ورودی مسابقه ناتمام',
          league: false,
          lifetimeGain: 0,
        });
      }
      await client.query(
        `UPDATE game_stake_matches
            SET status='refunded', outcome='stale_refund', settled_at=NOW()
          WHERE id=$1 AND status='reserved'`, [matchId]);
      await client.query('COMMIT');
      return { refunded: true, stake };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async function refundStaleMatches(olderMinutes = 60) {
    const mins = Math.min(24 * 60, Math.max(10, Number(olderMinutes) || 60));
    const { rows } = await db.query(
      `SELECT id FROM game_stake_matches
        WHERE status='reserved'
          AND created_at < NOW() - ($1::text || ' minutes')::interval
        ORDER BY created_at LIMIT 100`, [mins]);
    let refunded = 0;
    for (const row of rows) {
      const result = await refundMatch(row.id);
      if (result.refunded) refunded++;
    }
    return refunded;
  }

  return { canAfford, reserveMatch, settleMatch, refundMatch, refundStaleMatches };
}

module.exports = {
  ...createGameStakeService(),
  createGameStakeService,
  parsePublicStake,
  parseLobbyStake,
  PUBLIC_STAKES,
  LOBBY_STAKES,
  StakeError,
};
