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

// ── daily level cap ────────────────────────────────────────────────────────
// A player may clear at most this many levels per calendar day.
//
// The cap exists so the game is a daily habit rather than a single evening's
// grind, and so the 50-level curve lasts. It is enforced HERE because the
// phone is treated as hostile and because two clients sharing an account must
// share one allowance.
const MAX_LEVELS_PER_DAY = 3;

/**
 * Today's date in Asia/Tehran as YYYY-MM-DD.
 *
 * Fixed to Tehran for every player, never the device's zone: otherwise a
 * player unlocks a fresh allowance by changing their time zone. Never UTC
 * either — that rolls over at 03:30 local, which is nobody's "tomorrow".
 *
 * Derived from `sv-SE` because that locale's short date IS the ISO form, so
 * this needs no padding arithmetic and cannot drift on a DST boundary.
 */
function tehranDay(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * Milliseconds until the Tehran day rolls over, so the client can show an
 * honest countdown instead of "come back tomorrow" with no idea when that is.
 */
function msUntilTehranMidnight(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tehran',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
  // `hour` can come back as 24 for midnight itself in some ICU builds.
  const h = get('hour') % 24;
  const elapsed = (h * 3600 + get('minute') * 60 + get('second')) * 1000;
  return 86400000 - elapsed;
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
 *
 * @param {number} levelsLeftToday how many more levels this player may clear
 *   today. Pass Infinity for the uncapped behaviour.
 *
 * WHAT HAPPENS AT THE CAP. The surplus is DISCARDED, not banked. Banking
 * would mean a player who kept tapping after the cap instantly clears
 * tomorrow's three levels at 00:00 without touching the screen, which turns
 * the cap into a queue rather than a limit.
 *
 * The leftover is CLAMPED to one below the requirement rather than SET to it.
 * The difference matters: the honest clients refuse taps outright once capped,
 * so their leftover is whatever it happened to be — usually near zero. Setting
 * it to required-1 here would make the next sync push a nearly-full progress
 * bar back to the client, which reads as "one tap away" all evening and is a
 * lie. Clamping leaves an honest client's number untouched and only bites a
 * batch that carried more taps than the allowance could spend — a hostile
 * client, or a large offline batch from before the cap shipped.
 */
function advance(level, levelTaps, taps, levelsLeftToday = Infinity) {
  let lv = level;
  let lt = levelTaps + taps;
  let gained = 0;
  while (lv <= LEVEL_COUNT && lt >= requiredTaps(lv)) {
    if (gained >= levelsLeftToday) {
      lt = Math.min(lt, requiredTaps(lv) - 1);
      return { level: lv, levelTaps: lt, gained, capped: true };
    }
    lt -= requiredTaps(lv);
    lv += 1;
    gained += 1;
  }
  if (lv > LEVEL_COUNT) {
    lv = LEVEL_COUNT + 1;
    lt = 0;
  }
  return { level: lv, levelTaps: lt, gained, capped: false };
}

/**
 * How many levels this row has left today.
 *
 * A stored day that is not today means the counter belongs to a previous
 * session and is worth zero — the reset happens on READ as well as on write
 * so `getProgress` never reports a stale allowance to a client that opens the
 * game at 00:01 and taps before the first batch lands.
 */
function levelsLeftToday(row, today = tehranDay()) {
  if (!row) return MAX_LEVELS_PER_DAY;
  const used = storedDay(row.levels_day) === today
    ? Number(row.levels_today) || 0
    : 0;
  return Math.max(0, MAX_LEVELS_PER_DAY - used);
}

/**
 * Normalises whatever `pg` hands back for a DATE column into 'YYYY-MM-DD'.
 *
 * THE BUG THIS EXISTS TO PREVENT — caught by the live end-to-end test, not
 * by any unit test, because it only appears with a real driver and a real
 * database.
 *
 * node-postgres parses DATE into a JS Date at LOCAL midnight. The server's
 * clock is Asia/Tehran, so the date 2026-08-03 comes back as the instant
 * 2026-08-02T20:30:00Z. Formatting that in UTC — which the first version did
 * — yields "2026-08-02": the day BEFORE the one stored. The comparison
 * against tehranDay() therefore always failed, every read looked like a new
 * day, and the cap silently reset on every request. The unit tests passed
 * because they hand-built rows with UTC-midnight Dates.
 *
 * Reading the LOCAL components is correct precisely because the driver built
 * the value from local ones. A string (some drivers/configs return one) is
 * already in the right form and is passed through.
 */
function storedDay(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

async function getProgress(userId) {
  const { rows } = await pool.query(
    `SELECT level, level_taps, total_taps, flagged_taps,
            levels_today, levels_day
       FROM tap_game_progress WHERE user_id=$1`,
    [userId]
  );
  const r = rows[0];
  const left = levelsLeftToday(r);
  if (!r) {
    return {
      level: 1,
      levelTaps: 0,
      totalTaps: 0,
      flaggedTaps: 0,
      requiredTaps: requiredTaps(1),
      levelCount: LEVEL_COUNT,
      levelsPerDay: MAX_LEVELS_PER_DAY,
      levelsLeftToday: left,
      resetInMs: msUntilTehranMidnight(),
    };
  }
  return {
    level: r.level,
    levelTaps: r.level_taps,
    totalTaps: Number(r.total_taps),
    flaggedTaps: Number(r.flagged_taps),
    requiredTaps: requiredTaps(r.level),
    levelCount: LEVEL_COUNT,
    levelsPerDay: MAX_LEVELS_PER_DAY,
    levelsLeftToday: left,
    resetInMs: msUntilTehranMidnight(),
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
              last_sequence, last_batch_at, levels_today, levels_day
         FROM tap_game_progress WHERE user_id=$1 FOR UPDATE`,
      [userId]
    );
    const current = rows[0];

    // Gate 4a — REPLAY PROTECTION IS THE NONCE'S JOB, NOT THE SEQUENCE'S.
    //
    // This used to refuse any batch whose `seq` was not strictly greater than
    // the last one stored. That is wrong the moment a user plays on two
    // devices, which is the whole point of a shared account:
    //
    //   phone   sends seq 1  -> accepted, last_sequence = 1
    //   browser sends seq 1  -> refused (1 <= 1)
    //   browser sends seq 2  -> refused, its counter is behind the phone's
    //   ...the second device stays locked out, and because a refusal BURNS
    //      the batch the player silently loses those taps.
    //
    // `seq` is a per-CLIENT counter (each client starts at 1) that was being
    // compared against per-USER state, so two honest sessions collide. The
    // nonce below already makes every batch single-use and is genuinely
    // per-user, so dropping the ordering requirement loses no protection.
    //
    // The value is still recorded — it is useful telemetry for spotting a
    // client that never increments — but it no longer gates acceptance.

    // Gate 4b — nonce must be unseen.
    //
    // Prune this user's expired rows on every write (cheap, index-backed).
    // Note the scope: user-scoped pruning alone LEAKS, because a player who
    // stops playing never runs this again and their rows sit there forever.
    // The periodic sweep in `pruneNonces()` handles those; this inline delete
    // just keeps the common case tidy without waiting for the sweep.
    await client.query(
      'DELETE FROM tap_game_nonces WHERE user_id=$1 AND seen_at < NOW() - ($2::text || \' milliseconds\')::interval',
      [userId, String(NONCE_TTL_MS)]
    );
    const nonceInsert = await client.query(
      `INSERT INTO tap_game_nonces(user_id, nonce) VALUES($1,$2)
       ON CONFLICT (user_id, nonce) DO NOTHING RETURNING nonce`,
      [userId, nonce]
    );
    const today = tehranDay();
    const left = levelsLeftToday(current, today);

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
          levelsPerDay: MAX_LEVELS_PER_DAY,
          levelsLeftToday: left,
          resetInMs: msUntilTehranMidnight(),
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

    // Gate 6 — the daily level cap.
    //
    // Applied to the ADVANCE, not to the taps: the taps themselves are real
    // and still count toward the lifetime total and the leaderboard. Only the
    // level-ups are limited. A player who has run out simply sits one tap
    // below the next level until Tehran midnight.
    const next = rejected
      ? { level: current.level, levelTaps: current.level_taps,
          gained: 0, capped: left <= 0 }
      : advance(current.level, current.level_taps, accepted, left);

    // Spent before this batch, plus whatever it just gained.
    //
    // Clamped because a corrupt stored counter above the cap would otherwise
    // be written straight back, and bounded below because `left` is already
    // clamped to [0, MAX] by levelsLeftToday().
    const usedToday = Math.min(
      MAX_LEVELS_PER_DAY,
      (MAX_LEVELS_PER_DAY - left) + next.gained,
    );

    const updated = await client.query(
      `UPDATE tap_game_progress
          SET level = $2,
              level_taps = $3,
              total_taps = total_taps + $4,
              flagged_taps = flagged_taps + $5,
              rejected_batches = rejected_batches + $6,
              -- Highest seen, not last written: with two devices the value
              -- would otherwise bounce up and down between their independent
              -- counters and mean nothing.
              last_sequence = GREATEST(last_sequence, $7),
              -- Written unconditionally, including the day, so the row is
              -- self-consistent even on a batch that gained nothing. Storing
              -- the count without the day it belongs to is what would make a
              -- stale counter look current.
              levels_today = $8,
              levels_day = $9::date,
              last_batch_at = NOW(),
              updated_at = NOW()
        WHERE user_id = $1
        RETURNING level, level_taps, total_taps, flagged_taps,
                  rejected_batches, levels_today`,
      [
        userId,
        next.level,
        next.levelTaps,
        accepted,
        Math.max(0, body.flagged) + (rejected ? body.taps : 0),
        rejected ? 1 : 0,
        body.seq,
        usedToday,
        today,
      ]
    );

    await client.query('COMMIT');

    const row = updated.rows[0];
    const remaining = Math.max(0, MAX_LEVELS_PER_DAY - row.levels_today);
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
        // The client needs all three: the limit to explain the rule, what is
        // left to decide whether to keep counting, and when it resets so the
        // countdown is real rather than "tomorrow".
        levelsPerDay: MAX_LEVELS_PER_DAY,
        levelsLeftToday: remaining,
        resetInMs: msUntilTehranMidnight(),
        // True when THIS batch hit the wall — the moment to show the message,
        // as opposed to `levelsLeftToday === 0` which stays true all evening.
        cappedNow: next.capped === true,
      },
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Deletes every expired nonce, for every user.
 *
 * The inline prune inside submitBatch() is scoped to the caller, so rows
 * belonging to players who stopped playing are never reached and the table
 * grows without bound. Observed on production: 54 expired rows still present
 * from users who had finished their session. Runs on an interval from
 * server.js.
 *
 * @returns {Promise<number>} rows removed
 */
async function pruneNonces() {
  const { rowCount } = await pool.query(
    "DELETE FROM tap_game_nonces WHERE seen_at < NOW() - ($1::text || ' milliseconds')::interval",
    [String(NONCE_TTL_MS)]
  );
  return rowCount;
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
  pruneNonces,
  // exported for tests
  requiredTaps,
  canonical,
  sign,
  advance,
  plausibleCeiling,
  tehranDay,
  msUntilTehranMidnight,
  levelsLeftToday,
  LEVEL_COUNT,
  BASE_TAPS,
  GROWTH_FACTOR,
  MAX_TAPS_PER_SECOND,
  MAX_LEVELS_PER_DAY,
};
