// Tap game — server-side authority and anti-cheat.
//
// The client is treated as HOSTILE. Everything it claims is re-derived here:
// the level curve, the plausibility of the reported rate, the signature over
// the payload, and whether we have seen this exact batch before.
//
// Five independent gates, cheapest first:
//   1. Authentication (handled by the `auth` middleware upstream).
//   2. Shape validation — types and bounds on every field.
//   3. HMAC signature over a canonical string, keyed by SHA-256 of the
//      caller's own session token. Wrong/absent signature => 401.
//   4. Replay protection — strictly increasing sequence + unseen nonce.
//   5. Plausibility — taps must fit inside the elapsed window at a rate a
//      human hand can actually produce.
//
// A batch failing 3 or 4 is an attack and is refused outright. A batch
// failing 5 is *clamped or dropped* and recorded, because a laggy phone can
// legitimately report a slightly odd window.
const crypto = require('crypto');
const { pool } = require('../config/db');

// ── curve ──────────────────────────────────────────────────────────────────
// MUST stay identical to mobile/lib/screens/user/games/tap/tap_config.dart.
// If you change one, change the other in the same commit.
const LEVEL_COUNT = 50;
const BASE_TAPS = 100;
const GROWTH_FACTOR = 1.15;

function requiredTaps(level) {
  if (level < 1) return BASE_TAPS;
  return Math.round(BASE_TAPS * Math.pow(GROWTH_FACTOR, level - 1));
}

// ── plausibility limits ────────────────────────────────────────────────────
// The client caps itself at 12 taps/s. The server allows a little more to
// absorb clock jitter and batching edges, but not enough to matter: at 18/s a
// "player" would still need ~4 hours of unbroken tapping to finish level 50.
const MAX_TAPS_PER_SECOND = 18;
// Any batch is allowed this many taps regardless of its window, so a very
// short first batch is not rejected for arithmetic reasons.
const BURST_ALLOWANCE = 25;
// Hard ceiling per request — a client that batches longer than this is
// misbehaving; legitimate flushes are every 8s.
const MAX_BATCH_TAPS = 2000;
const MAX_BATCH_WINDOW_MS = 10 * 60 * 1000;
const NONCE_TTL_MS = 30 * 60 * 1000;
// Latency + scheduling slack allowed when comparing the client's self-reported
// window against the gap our own clock measured between batches.
const CLOCK_SLACK_MS = 5000;

/**
 * Canonical string that both sides sign. Field ORDER is part of the wire
 * contract — see TapSync.canonical in the Flutter client.
 */
function canonical(body, nonce) {
  return [
    body.taps,
    body.flagged,
    body.elapsedMs,
    body.level,
    body.levelTaps,
    body.seq,
    nonce,
  ].join('|');
}

/**
 * Per-session signing key, derived from the bearer token the caller just
 * authenticated with.
 *
 * Deliberately NOT a constant shared secret: a secret compiled into an APK is
 * extractable with `strings`, so it would prove nothing. Deriving from the
 * token means a valid signature proves the sender holds a live session for
 * THIS user, and a batch cannot be replayed across users or across logins.
 */
function signingKey(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest();
}

function sign(token, body, nonce) {
  return crypto
    .createHmac('sha256', signingKey(token))
    .update(canonical(body, nonce), 'utf8')
    .digest('hex');
}

/** Constant-time compare; a plain === leaks timing information. */
function signatureMatches(expected, received) {
  if (typeof received !== 'string' || received.length !== expected.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(received, 'hex')
    );
  } catch {
    return false;
  }
}

function asInt(value, fallback = NaN) {
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

/**
 * Validates the request body shape and bounds.
 * @returns {{ok: true, body: object} | {ok: false, message: string}}
 */
function validateShape(raw) {
  const body = {
    taps: asInt(raw?.taps),
    flagged: asInt(raw?.flagged, 0),
    elapsedMs: asInt(raw?.elapsedMs),
    level: asInt(raw?.level),
    levelTaps: asInt(raw?.levelTaps),
    seq: asInt(raw?.seq),
  };

  for (const [key, value] of Object.entries(body)) {
    if (!Number.isInteger(value)) {
      return { ok: false, message: `مقدار ${key} معتبر نیست` };
    }
  }
  if (body.taps < 0 || body.taps > MAX_BATCH_TAPS) {
    return { ok: false, message: 'تعداد ضربه‌های ارسالی خارج از محدوده است' };
  }
  if (body.flagged < 0 || body.flagged > MAX_BATCH_TAPS) {
    return { ok: false, message: 'مقدار flagged خارج از محدوده است' };
  }
  if (body.elapsedMs <= 0 || body.elapsedMs > MAX_BATCH_WINDOW_MS) {
    return { ok: false, message: 'بازهٔ زمانی ارسالی معتبر نیست' };
  }
  if (body.level < 1 || body.level > LEVEL_COUNT + 1) {
    return { ok: false, message: 'لول ارسالی معتبر نیست' };
  }
  if (body.levelTaps < 0 || body.levelTaps > requiredTaps(LEVEL_COUNT) * 2) {
    return { ok: false, message: 'مقدار levelTaps معتبر نیست' };
  }
  if (body.seq < 1) {
    return { ok: false, message: 'شمارهٔ ترتیب معتبر نیست' };
  }

  const nonce = String(raw?.nonce || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(nonce)) {
    return { ok: false, message: 'nonce معتبر نیست' };
  }

  return { ok: true, body, nonce, sig: String(raw?.sig || '') };
}

/**
 * How many taps are physically possible in the reported window.
 * A short window still gets BURST_ALLOWANCE so an 800ms first flush is fine.
 */
function plausibleCeiling(elapsedMs) {
  return Math.ceil((elapsedMs / 1000) * MAX_TAPS_PER_SECOND) + BURST_ALLOWANCE;
}

/**
 * Applies accepted taps to a progress row, walking the level curve exactly
 * the way the client does.
 */
function advance(level, levelTaps, taps) {
  let lv = level;
  let lt = levelTaps + taps;
  while (lv <= LEVEL_COUNT && lt >= requiredTaps(lv)) {
    lt -= requiredTaps(lv);
    lv += 1;
  }
  if (lv > LEVEL_COUNT) {
    lv = LEVEL_COUNT + 1;
    lt = 0;
  }
  return { level: lv, levelTaps: lt };
}

async function getProgress(userId) {
  const { rows } = await pool.query(
    'SELECT level, level_taps, total_taps, flagged_taps FROM tap_game_progress WHERE user_id=$1',
    [userId]
  );
  if (!rows[0]) {
    return {
      level: 1,
      levelTaps: 0,
      totalTaps: 0,
      flaggedTaps: 0,
      requiredTaps: requiredTaps(1),
      levelCount: LEVEL_COUNT,
    };
  }
  const r = rows[0];
  return {
    level: r.level,
    levelTaps: r.level_taps,
    totalTaps: Number(r.total_taps),
    flaggedTaps: Number(r.flagged_taps),
    requiredTaps: requiredTaps(r.level),
    levelCount: LEVEL_COUNT,
  };
}

/**
 * Ingests one signed batch.
 *
 * @param {string} userId
 * @param {string} token   raw bearer token, used to derive the signing key
 * @param {object} raw     request body
 * @returns {Promise<{status:number, payload:object}>}
 */
async function submitBatch(userId, token, raw) {
  // Gate 2 — shape.
  const parsed = validateShape(raw);
  if (!parsed.ok) {
    return { status: 400, payload: { ok: false, message: parsed.message } };
  }
  const { body, nonce, sig } = parsed;

  // Gate 3 — signature.
  if (!signatureMatches(sign(token, body, nonce), sig)) {
    return {
      status: 401,
      payload: { ok: false, message: 'امضای درخواست معتبر نیست' },
    };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create-or-lock the row. FOR UPDATE serialises two devices tapping at
    // once, which would otherwise interleave and lose taps.
    await client.query(
      `INSERT INTO tap_game_progress(user_id) VALUES($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
    const { rows } = await client.query(
      `SELECT level, level_taps, total_taps, flagged_taps, rejected_batches,
              last_sequence, last_batch_at
         FROM tap_game_progress WHERE user_id=$1 FOR UPDATE`,
      [userId]
    );
    const current = rows[0];

    // Gate 4a — sequence must strictly increase.
    if (body.seq <= Number(current.last_sequence)) {
      await client.query('COMMIT');
      return {
        status: 409,
        payload: {
          ok: false,
          rejected: true,
          message: 'این batch قبلاً ثبت شده است',
          level: current.level,
          levelTaps: current.level_taps,
          totalTaps: Number(current.total_taps),
        },
      };
    }

    // Gate 4b — nonce must be unseen. Prune expired ones in the same trip.
    await client.query(
      'DELETE FROM tap_game_nonces WHERE user_id=$1 AND seen_at < NOW() - ($2::text || \' milliseconds\')::interval',
      [userId, String(NONCE_TTL_MS)]
    );
    const nonceInsert = await client.query(
      `INSERT INTO tap_game_nonces(user_id, nonce) VALUES($1,$2)
       ON CONFLICT (user_id, nonce) DO NOTHING RETURNING nonce`,
      [userId, nonce]
    );
    if (nonceInsert.rowCount === 0) {
      await client.query('COMMIT');
      return {
        status: 409,
        payload: {
          ok: false,
          rejected: true,
          message: 'درخواست تکراری است',
          level: current.level,
          levelTaps: current.level_taps,
          totalTaps: Number(current.total_taps),
        },
      };
    }

    // Gate 5 — plausibility.
    const ceiling = plausibleCeiling(body.elapsedMs);
    let accepted = body.taps;
    let rejected = false;

    if (body.taps > ceiling) {
      // Not a lag artefact: this is more taps than a hand can produce in the
      // window the client itself reported. Drop the batch entirely rather
      // than clamping — clamping would still reward the attempt.
      accepted = 0;
      rejected = true;
    }

    // Wall-clock cross-check.
    //
    // `elapsedMs` is self-reported, so on its own it is worthless: a cheater
    // simply claims a huge window to raise their own ceiling. We therefore
    // cap the window by the gap OUR clock measured since the last accepted
    // batch, and judge the ceiling against whichever is smaller.
    //
    // Capping (rather than rejecting outright on any mismatch) is deliberate.
    // A legitimate client's elapsedMs can slightly exceed the server gap
    // because of network latency and because a level-up forces an early
    // flush; punishing that would burn honest taps. Inflating the number
    // still gains an attacker nothing, because the cap ignores the claim.
    if (!rejected && current.last_batch_at) {
      const gapMs = Date.now() - new Date(current.last_batch_at).getTime();
      // The gap may legitimately be much LARGER than elapsedMs (the player
      // was away), so only the upper bound matters.
      const effectiveWindow = Math.min(body.elapsedMs, gapMs + CLOCK_SLACK_MS);
      if (accepted > plausibleCeiling(effectiveWindow)) {
        accepted = 0;
        rejected = true;
      }
    }

    const next = rejected
      ? { level: current.level, levelTaps: current.level_taps }
      : advance(current.level, current.level_taps, accepted);

    const updated = await client.query(
      `UPDATE tap_game_progress
          SET level = $2,
              level_taps = $3,
              total_taps = total_taps + $4,
              flagged_taps = flagged_taps + $5,
              rejected_batches = rejected_batches + $6,
              last_sequence = $7,
              last_batch_at = NOW(),
              updated_at = NOW()
        WHERE user_id = $1
        RETURNING level, level_taps, total_taps, flagged_taps, rejected_batches`,
      [
        userId,
        next.level,
        next.levelTaps,
        accepted,
        Math.max(0, body.flagged) + (rejected ? body.taps : 0),
        rejected ? 1 : 0,
        body.seq,
      ]
    );

    await client.query('COMMIT');

    const row = updated.rows[0];
    return {
      status: 200,
      payload: {
        ok: !rejected,
        rejected,
        message: rejected
          ? 'ضربه‌های غیرعادی نادیده گرفته شد'
          : undefined,
        level: row.level,
        levelTaps: row.level_taps,
        totalTaps: Number(row.total_taps),
        requiredTaps: requiredTaps(row.level),
        levelCount: LEVEL_COUNT,
      },
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Top tappers — cheap to serve, useful for a future leaderboard tab. */
async function leaderboard(limit = 50) {
  const { rows } = await pool.query(
    `SELECT p.user_id, p.level, p.total_taps,
            u.nickname, u.first_name, u.profile_image_url, u.profile_avatar_key
       FROM tap_game_progress p
       JOIN users u ON u.id = p.user_id
      WHERE u.status = 'active'
      ORDER BY p.total_taps DESC
      LIMIT $1`,
    [Math.min(Math.max(Number(limit) || 50, 1), 100)]
  );
  return rows.map((r) => ({
    userId: r.user_id,
    level: r.level,
    totalTaps: Number(r.total_taps),
    nickname: r.nickname || r.first_name || 'بازیکن',
    profileImageUrl: r.profile_image_url,
    profileAvatarKey: r.profile_avatar_key,
  }));
}

module.exports = {
  getProgress,
  submitBatch,
  leaderboard,
  // exported for tests
  requiredTaps,
  canonical,
  sign,
  advance,
  plausibleCeiling,
  LEVEL_COUNT,
  BASE_TAPS,
  GROWTH_FACTOR,
  MAX_TAPS_PER_SECOND,
};
