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
// MUST stay identical to mobile/lib/screens/user/games/tap/tap_config.dart
// and userweb/src/tapGame.jsx. If you change one, change all three in the
// same commit.
//
// ONE TAP = ONE POINT, AND THE WHOLE GAME IS WORTH 50,000.
//
// The owner set the total: "کل بازی ۵۰ هزار امتیاز میدهد". Making a tap
// worth exactly one point is the simplest model that can satisfy it, and it
// buys something valuable: the number on screen IS the work done. There is
// no hidden multiplier that later makes a player ask "why did 100 taps give
// me 40 points?".
//
// WHY THE GROWTH FACTOR DROPPED FROM 1.15 TO 1.05
//
// The old curve summed to 721,772 taps. With a daily cap that is 25 hours of
// uninterrupted tapping, and the shape was far worse than the total suggests:
// the last three levels alone were 34% of the game, and day 14 demanded 2.8
// hours in one sitting. Nobody was ever going to finish it, which also meant
// the daily cap stopped mattering around day 12 — the curve was already
// harsher than the cap.
//
// 1.05 over 50 levels sums to 50,000 and gives a shape a person can actually
// live with: about a minute on day one, about ten minutes on the last day.
const LEVEL_COUNT = 50;
const TOTAL_POINTS = 50000;
const GROWTH_FACTOR = 1.05;

/**
 * Points needed to clear `level`, precomputed once.
 *
 * Built as a table rather than `round(base * g^(n-1))` per call because the
 * rounding has to be reconciled: fifty independently rounded terms do not sum
 * to exactly 50,000. The remainder is folded into the last level so the total
 * the owner specified is exact rather than approximately right.
 */
const LEVEL_COST = (() => {
  const geometric = [];
  let sum = 0;
  for (let i = 0; i < LEVEL_COUNT; i++) {
    const term = Math.pow(GROWTH_FACTOR, i);
    geometric.push(term);
    sum += term;
  }
  const base = TOTAL_POINTS / sum;
  const table = geometric.map((t) => Math.round(base * t));
  const drift = TOTAL_POINTS - table.reduce((a, b) => a + b, 0);
  table[table.length - 1] += drift;
  return table;
})();

function requiredTaps(level) {
  if (level < 1) return LEVEL_COST[0];
  const capped = level > LEVEL_COUNT ? LEVEL_COUNT : level;
  return LEVEL_COST[capped - 1];
}

/** Total points across every level — exactly TOTAL_POINTS by construction. */
function totalGamePoints() {
  return LEVEL_COST.reduce((a, b) => a + b, 0);
}

/**
 * Points a player has banked in total, given their position on the curve.
 *
 * Every level below the current one is fully paid for, plus whatever is
 * banked inside the current level. This is what lets the batch handler work
 * out how many points a batch is really worth: the difference between the
 * position before and after, which is automatically correct when the daily
 * cap trims the advance.
 *
 * A prefix-sum table rather than a loop: this is called on every batch, and
 * summing up to 50 terms each time is pointless when the answer never
 * changes.
 */
const CUMULATIVE = (() => {
  const out = [0];
  for (let i = 0; i < LEVEL_COST.length; i++) {
    out.push(out[i] + LEVEL_COST[i]);
  }
  return out;
})();

function cumulativePoints(level, levelTaps) {
  const lv = Math.max(1, Math.min(level, LEVEL_COUNT + 1));
  const cleared = CUMULATIVE[lv - 1];
  // Past the final level the game is complete; there is no "inside" left.
  if (lv > LEVEL_COUNT) return cleared;
  const inside = Math.max(0, Math.min(Number(levelTaps) || 0, LEVEL_COST[lv - 1]));
  return cleared + inside;
}

// Kept for the old wire contract: a few tests and the client still speak of
// "base taps". Level one's cost is that number.
const BASE_TAPS = LEVEL_COST[0];

// ── daily level cap ────────────────────────────────────────────────────────
// A player may clear at most this many levels per calendar day.
//
// The cap exists so the game is a daily habit rather than a single evening's
// grind, and so the 50-level curve lasts. It is enforced HERE because the
// phone is treated as hostile and because two clients sharing an account must
// share one allowance.
//
// Two per day, over 50 levels, is 25 days to finish.
//
// PARTIAL PROGRESS IS KEPT. The owner was explicit: "یه روزایی بعد گرفتن نصف
// لول یا کمی از لول خسته شدن اشکالی نداره میتونن ادامشو برن". So a player who
// stops mid-level keeps those points and resumes tomorrow — `advance()` only
// refuses to cross a level BOUNDARY once the allowance is spent, it never
// discards banked progress inside the current level.
const MAX_LEVELS_PER_DAY = 2;

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
 * WHAT HAPPENS AT THE CAP — and why partial progress survives.
 *
 * The owner's rule: "یه روزایی بعد گرفتن نصف لول یا کمی از لول خسته شدن
 * اشکالی نداره میتونن ادامشو برن". Progress *inside* a level is never thrown
 * away; only crossing a level BOUNDARY is refused once the allowance is gone.
 *
 * So the leftover is clamped to `required - 1`: the player sits just short of
 * the next level, keeps every point banked toward it, and tomorrow one more
 * tap carries them over. That is the whole point of the owner's rule — a
 * half-finished level is a legitimate place to stop.
 *
 * The surplus BEYOND that boundary is still discarded. Without it, someone
 * who kept hammering after the cap would bank enough to clear tomorrow's two
 * levels at 00:00 without touching the screen, and the cap becomes a queue
 * rather than a limit. `Math.min` means an honest client — which stops
 * sending taps once capped — never loses anything, because its leftover is
 * already below the boundary. Only a batch that genuinely overshot is
 * trimmed.
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
            levels_today, levels_day, points_awarded
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
      pointsAwarded: 0,
      pointsToNextLevel: requiredTaps(1),
      totalGamePoints: totalGamePoints(),
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
    // نمایش بر حسب امتیاز است نه ضربه — خواستهٔ مالک.
    pointsAwarded: Number(r.points_awarded || 0),
    pointsToNextLevel: Math.max(0, requiredTaps(r.level) - r.level_taps),
    totalGamePoints: totalGamePoints(),
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
async function submitBatch(
  userId, token, raw, onPointsEarned = null, onLevelsGained = null,
) {
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

    // ── how many of the accepted taps actually COUNTED ───────────────────
    //
    // One tap is one point, but only taps that landed inside the player's
    // remaining allowance are worth anything. When `advance()` hits the cap
    // it clamps the leftover, so the difference between "points the player
    // had before" and "points they have now" is the real, post-cap figure.
    //
    // Deriving it instead of using `accepted` matters: a batch that arrives
    // after the cap is spent still reports its taps honestly, and paying for
    // those would hand out points the cap was supposed to withhold — and,
    // through the referral commission, pay the referrer for them too.
    const pointsBefore = cumulativePoints(current.level, current.level_taps);
    const pointsAfter = cumulativePoints(next.level, next.levelTaps);
    const earnedPoints = rejected ? 0 : Math.max(0, pointsAfter - pointsBefore);

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
              points_awarded = points_awarded + $10,
              last_batch_at = NOW(),
              updated_at = NOW()
        WHERE user_id = $1
        RETURNING level, level_taps, total_taps, flagged_taps,
                  rejected_batches, levels_today, points_awarded`,
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
        earnedPoints,
      ]
    );

    // ── credit the points ────────────────────────────────────────────────
    //
    // Inside the same transaction as the progress write. If either fails,
    // both roll back — otherwise a crash between them either pays twice or
    // advances the level without paying.
    if (earnedPoints > 0 && typeof onPointsEarned === 'function') {
      await onPointsEarned(client, userId, earnedPoints);
    }

    // ── سکهٔ لول‌های همین بسته (دورِ ۲۶) ──────────────────────────────────
    //
    // ضربه‌زن تا امروز فقط امتیاز می‌داد. سکه — که ارزِ رتبه‌بندیِ لیگ و
    // جایزهٔ نقدی است — فقط از بازی‌های رقابتی می‌آمد، پس کاربری که ضربه‌زن
    // بازی می‌کرد ساعت‌ها وقت می‌گذاشت و در جدولِ لیگ صفر می‌ماند.
    //
    // `next.gained` تعدادِ لول‌هایی است که **در همین بسته** تمام شده‌اند —
    // بعد از اعمالِ سقفِ روزانه و بعد از ردِ ضربه‌های مشکوک. لول‌های
    // تمام‌شده `current.level` تا `current.level + gained - 1` هستند:
    // تمام‌کردنِ لولِ L یعنی رفتن از L به L+1، پس پاداش به L تعلق دارد نه
    // به لولِ جدید.
    //
    // ⚠️ بیرونِ شرطِ `earnedPoints > 0` نیست و نباید باشد: هر لولِ
    //    تمام‌شده لزوماً امتیازِ مثبت دارد، ولی وابسته‌کردنِ سکه به امتیاز
    //    دو منطق را به هم گره می‌زند. اینجا فقط به `gained` نگاه می‌کنیم.
    // ⚠️ callback حالا **مقدارِ سکهٔ واقعاً اعطاشده** را برمی‌گرداند تا
    //    کلاینت همان لحظه «+۵ سکه» را جلوی چشمِ کاربر نشان دهد — بدون
    //    هیچ درخواستِ جداگانه.
    let coinsEarned = 0;
    if (!rejected && next.gained > 0 && typeof onLevelsGained === 'function') {
      const levels = [];
      for (let i = 0; i < next.gained; i++) levels.push(current.level + i);
      const awarded = await onLevelsGained(client, userId, levels);
      coinsEarned = Math.max(0, Math.trunc(Number(awarded) || 0));
    }

    // جمعِ سکهٔ کاربر بعد از همین بسته — برای به‌روزرسانیِ نشانِ سکه
    // بدونِ نیاز به refresh.
    const coinRow = await client.query(
      'SELECT coins FROM users WHERE id=$1', [userId]);
    const coinsTotal = Number(coinRow.rows[0]?.coins || 0);

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
        // ── points ────────────────────────────────────────────────────────
        // The owner wants the UI to show POINTS, not tap counts. Since a tap
        // is worth exactly one point these are the same number today, but
        // sending them explicitly means the client never has to know that —
        // if the rate ever changes, only this file does.
        pointsEarned: earnedPoints,
        pointsAwarded: Number(row.points_awarded),
        // ── coins ─────────────────────────────────────────────────────────
        // سکهٔ لول‌های همین بسته + جمعِ کل — تا کلاینت «+۵ سکه» را همان
        // لحظهٔ لول‌آپ نشان دهد (خواستهٔ مالک: «سکه بعد هر لول جلوی
        // چشماشون اضافه بشه»).
        coinsEarned,
        coinsTotal,
        pointsToNextLevel: Math.max(0, requiredTaps(row.level) - row.level_taps),
        totalGamePoints: totalGamePoints(),
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
  totalGamePoints,
  cumulativePoints,
  canonical,
  sign,
  advance,
  plausibleCeiling,
  tehranDay,
  msUntilTehranMidnight,
  levelsLeftToday,
  LEVEL_COUNT,
  BASE_TAPS,
  TOTAL_POINTS,
  GROWTH_FACTOR,
  MAX_TAPS_PER_SECOND,
  MAX_LEVELS_PER_DAY,
};
