// Tap-game logic tests. Pure functions only — no DB, no network, so this
// runs in CI in milliseconds and cannot flake.
const assert = require('assert');
const crypto = require('crypto');

const svc = require('../src/services/tapGameService');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
}

console.log('\ntap game — level curve');

test('the whole game is worth exactly 50,000 points', () => {
  // THE headline number, set by the owner. Fifty independently rounded
  // geometric terms do not sum to a round figure on their own, so the
  // construction folds the drift into the last level — if that ever breaks,
  // the game silently becomes worth 49,997 and the two ends of the system
  // disagree about when it is finished.
  assert.strictEqual(svc.TOTAL_POINTS, 50000);
  assert.strictEqual(svc.totalGamePoints(), 50000);
  let sum = 0;
  for (let lv = 1; lv <= svc.LEVEL_COUNT; lv++) sum += svc.requiredTaps(lv);
  assert.strictEqual(sum, 50000);
});

test('the curve is geometric at 1.05, give or take rounding', () => {
  // Checked as a RATIO rather than against hardcoded values: the exact
  // integers depend on the rounding, but the shape must not drift.
  for (let lv = 2; lv < svc.LEVEL_COUNT; lv++) {
    const ratio = svc.requiredTaps(lv) / svc.requiredTaps(lv - 1);
    assert.ok(ratio > 1.03 && ratio < 1.07,
      `level ${lv} ratio ${ratio.toFixed(3)} is off the 1.05 curve`);
  }
});

test('known checkpoints', () => {
  assert.strictEqual(svc.requiredTaps(1), 239);
  assert.strictEqual(svc.requiredTaps(2), 251);
  assert.strictEqual(svc.requiredTaps(25), 770);
  assert.strictEqual(svc.requiredTaps(50), 2611);
});

test('no level is free', () => {
  // A zero-cost level makes the engine's level-up loop spin forever. The
  // curve cannot produce one today, but a future tuning pass could.
  for (let lv = 1; lv <= svc.LEVEL_COUNT; lv++) {
    assert.ok(svc.requiredTaps(lv) >= 1, `level ${lv} is free`);
  }
});

test('curve is strictly increasing', () => {
  for (let lv = 2; lv <= svc.LEVEL_COUNT; lv++) {
    assert.ok(
      svc.requiredTaps(lv) > svc.requiredTaps(lv - 1),
      `level ${lv} must cost more than ${lv - 1}`
    );
  }
});

test('a level below 1 cannot underflow', () => {
  assert.strictEqual(svc.requiredTaps(0), svc.requiredTaps(1));
  assert.strictEqual(svc.requiredTaps(-5), svc.requiredTaps(1));
});

console.log('\ntap game — points');

test('cumulativePoints is zero at the very start', () => {
  assert.strictEqual(svc.cumulativePoints(1, 0), 0);
});

test('cumulativePoints counts cleared levels plus the current one', () => {
  const l1 = svc.requiredTaps(1);
  assert.strictEqual(svc.cumulativePoints(2, 0), l1);
  assert.strictEqual(svc.cumulativePoints(2, 7), l1 + 7);
});

test('a finished game is worth the full 50,000', () => {
  assert.strictEqual(svc.cumulativePoints(svc.LEVEL_COUNT + 1, 0), 50000);
});

test('cumulativePoints never exceeds the level it is inside', () => {
  // A corrupt levelTaps must not inflate the total: the difference between
  // two cumulative readings is what gets PAID, so an unclamped value here
  // would mint points.
  const l1 = svc.requiredTaps(1);
  assert.strictEqual(svc.cumulativePoints(1, 10 ** 9), l1);
  assert.strictEqual(svc.cumulativePoints(1, -50), 0);
});

test('walking the curve level by level sums to the total', () => {
  let prev = 0;
  for (let lv = 1; lv <= svc.LEVEL_COUNT; lv++) {
    const at = svc.cumulativePoints(lv + 1, 0);
    assert.strictEqual(at - prev, svc.requiredTaps(lv), `level ${lv}`);
    prev = at;
  }
  assert.strictEqual(prev, 50000);
});

console.log('\ntap game — level advancement');

test('taps below the threshold do not level up', () => {
  const r = svc.advance(1, 0, 99);
  assert.strictEqual(r.level, 1);
  assert.strictEqual(r.levelTaps, 99);
});

test('exactly the threshold levels up with no remainder', () => {
  const r = svc.advance(1, 0, svc.requiredTaps(1));
  assert.strictEqual(r.level, 2);
  assert.strictEqual(r.levelTaps, 0);
});

test('overflow carries into the next level', () => {
  const r = svc.advance(1, 0, svc.requiredTaps(1) + 5);
  assert.strictEqual(r.level, 2);
  assert.strictEqual(r.levelTaps, 5);
});

test('one huge batch can clear several levels', () => {
  const exact = svc.requiredTaps(1) + svc.requiredTaps(2) + svc.requiredTaps(3);
  const r = svc.advance(1, 0, exact);
  assert.strictEqual(r.level, 4);
  assert.strictEqual(r.levelTaps, 0);
});

test('progress past the last level clamps and does not run away', () => {
  const r = svc.advance(svc.LEVEL_COUNT, 0, 10 ** 9);
  assert.strictEqual(r.level, svc.LEVEL_COUNT + 1);
  assert.strictEqual(r.levelTaps, 0);
});

test('zero taps is a no-op', () => {
  const r = svc.advance(7, 42, 0);
  assert.strictEqual(r.level, 7);
  assert.strictEqual(r.levelTaps, 42);
});

console.log('\ntap game — signature');

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.fake.token';
const BODY = { taps: 80, flagged: 2, elapsedMs: 8000, level: 3, levelTaps: 40, seq: 5 };
const NONCE = 'abcd1234efgh';

test('a correct signature verifies', () => {
  const sig = svc.sign(TOKEN, BODY, NONCE);
  assert.strictEqual(sig, svc.sign(TOKEN, BODY, NONCE));
  assert.strictEqual(sig.length, 64);
});

test('changing any field breaks the signature', () => {
  const good = svc.sign(TOKEN, BODY, NONCE);
  for (const key of Object.keys(BODY)) {
    const tampered = { ...BODY, [key]: BODY[key] + 1 };
    assert.notStrictEqual(
      svc.sign(TOKEN, tampered, NONCE),
      good,
      `tampering with ${key} must change the signature`
    );
  }
});

test('a different nonce breaks the signature', () => {
  assert.notStrictEqual(
    svc.sign(TOKEN, BODY, 'zzzz9999zzzz'),
    svc.sign(TOKEN, BODY, NONCE)
  );
});

test("another user's token cannot sign for this one", () => {
  assert.notStrictEqual(
    svc.sign('a-completely-different-token', BODY, NONCE),
    svc.sign(TOKEN, BODY, NONCE)
  );
});

test('canonical form is order-stable', () => {
  // Same values, different key insertion order => identical canonical string.
  const reordered = { seq: 5, levelTaps: 40, level: 3, elapsedMs: 8000, flagged: 2, taps: 80 };
  assert.strictEqual(svc.canonical(BODY, NONCE), svc.canonical(reordered, NONCE));
});

test('the client HMAC construction is reproducible here', () => {
  // Mirrors exactly what TapSync does in Dart: key = sha256(token).
  const key = crypto.createHash('sha256').update(TOKEN, 'utf8').digest();
  const expected = crypto
    .createHmac('sha256', key)
    .update(svc.canonical(BODY, NONCE), 'utf8')
    .digest('hex');
  assert.strictEqual(svc.sign(TOKEN, BODY, NONCE), expected);
});

console.log('\ntap game — plausibility ceiling');

test('a human rate inside one flush window passes', () => {
  // 8 seconds at a brisk 9 taps/s.
  assert.ok(72 <= svc.plausibleCeiling(8000));
});

test('the stated 500-taps-in-5-seconds attack is refused', () => {
  assert.ok(500 > svc.plausibleCeiling(5000), '500 taps in 5s must exceed the ceiling');
});

test('an autoclicker at 50 taps/s is refused', () => {
  assert.ok(50 * 8 > svc.plausibleCeiling(8000));
});

test('a very short window still allows a small burst', () => {
  // Prevents an 800ms first flush from being rejected on arithmetic alone.
  assert.ok(svc.plausibleCeiling(200) >= 25);
});

test('the ceiling grows linearly with the window', () => {
  const a = svc.plausibleCeiling(1000);
  const b = svc.plausibleCeiling(2000);
  assert.ok(b > a);
  assert.ok(b - a <= svc.MAX_TAPS_PER_SECOND + 1);
});

test('server ceiling is above the client cap but still strict', () => {
  // The client self-limits to 12/s; the server must allow a little slack for
  // jitter, yet stay far below what a script would produce.
  assert.ok(svc.MAX_TAPS_PER_SECOND >= 12);
  assert.ok(svc.MAX_TAPS_PER_SECOND <= 25);
});

console.log('\ntap game — grind sanity');

test('the grind is humane, not endless', () => {
  // The OLD curve summed to 721,772 taps — 25 hours, with day 14 alone
  // demanding 2.8 hours in one sitting. Nobody finished it, and the daily
  // cap stopped mattering because the curve was harsher than the cap.
  //
  // The bound is now two-sided: long enough to be worth something, short
  // enough that a real person can reach the end.
  const total = svc.totalGamePoints();
  const hoursAtMax = total / svc.MAX_TAPS_PER_SECOND / 3600;
  assert.ok(hoursAtMax > 0.5, `only ${(hoursAtMax * 60).toFixed(0)} minutes`);
  assert.ok(hoursAtMax < 4, `${hoursAtMax.toFixed(1)}h is a second job`);

  // And no single DAY may be brutal, which is the failure the old curve had.
  // Worst day is the last two levels.
  const worstDay = svc.requiredTaps(svc.LEVEL_COUNT)
    + svc.requiredTaps(svc.LEVEL_COUNT - 1);
  const worstMinutes = worstDay / 8 / 60; // 8/s is a comfortable human rate
  assert.ok(worstMinutes < 20,
    `worst day is ${worstMinutes.toFixed(0)} minutes of solid tapping`);

  const days = Math.ceil(svc.LEVEL_COUNT / svc.MAX_LEVELS_PER_DAY);
  console.log(
    `    (total ${total.toLocaleString()} points · ` +
    `${days} days · worst day ${worstMinutes.toFixed(1)} min)`);
});


console.log('\ntap game — offline batch must survive the ceiling');

test('a burst split across two flushes is affordable in each', () => {
  // Reproduces the bug: 400 taps flushed with a ~50ms window looked
  // impossible and the whole batch was burned. The client now caps each
  // batch to what its own window supports, so every batch it sends must fit
  // inside the SERVER's ceiling too.
  const clientRate = 12;      // TapGameConfig.maxTapsPerSecond
  const clientBurst = 20;     // _affordableTaps burst allowance
  for (const windowMs of [50, 200, 800, 1000, 5000, 8000, 60000]) {
    const clientWouldSend = Math.ceil((windowMs / 1000) * clientRate) + clientBurst;
    const serverAllows = svc.plausibleCeiling(windowMs);
    assert.ok(
      clientWouldSend <= serverAllows,
      `window ${windowMs}ms: client sends ${clientWouldSend} but server allows ${serverAllows}`
    );
  }
});

test('the client cap stays strictly under the server ceiling', () => {
  // A margin is what absorbs latency jitter; without it a borderline batch
  // gets burned on a slow network.
  const windowMs = 8000;
  const clientWouldSend = Math.ceil((windowMs / 1000) * 12) + 20;
  assert.ok(clientWouldSend < svc.plausibleCeiling(windowMs));
});

console.log('\ntap game — skin boundary parity');

test('the server never needs skin knowledge', () => {
  // Skins are purely cosmetic and must stay client-side; a server that
  // encoded the boundary would be a second place to keep in sync.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/services/tapGameService.js'), 'utf8');
  assert.ok(!/skin/i.test(src), 'server must not reference skins');
});


console.log('\ntap game — catalogue integration');

test('tap is listed in the public catalogue', () => {
  const { CATALOG } = require('../src/games');
  const tap = CATALOG.find(g => g.id === 'tap');
  assert.ok(tap, 'tap must appear in /api/games');
  assert.strictEqual(tap.singlePlayer, true);
});

test('tap has no multiplayer rules module', () => {
  // It is client-side plus a signed endpoint; a rules entry would make the
  // socket engine try to open lobbies for a game that has none.
  const { RULES } = require('../src/games');
  assert.strictEqual(RULES.tap, undefined);
});

test('the solo endpoint refuses tap instead of crashing', () => {
  // GET /api/games/tap/solo looks up RULES[id]; a missing entry must produce
  // a clean 404, not a TypeError on `rules.solo`.
  const { RULES } = require('../src/games');
  const rules = RULES.tap;
  assert.ok(!rules || !rules.solo, 'must fall into the 404 branch');
});


console.log('\ntap game — nonce housekeeping');

test('a global prune function exists and is exported', () => {
  // The inline prune inside submitBatch is user-scoped, so rows belonging to
  // players who stopped playing are never reached. Observed on production:
  // 54 expired rows lingering. A global sweep is the only thing that clears
  // them.
  assert.strictEqual(typeof svc.pruneNonces, 'function');
});

test('the server schedules the sweep', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/server.js'), 'utf8');
  assert.ok(/pruneNonces\(\)/.test(src), 'server must call pruneNonces');
  assert.ok(/cron\.schedule\('[^']*'[^)]*\)/.test(src), 'must be on a schedule');
});


console.log('\ntap game — two devices, one account');

test('the sequence number no longer gates acceptance', () => {
  // REGRESSION: `seq` is a per-CLIENT counter (every client starts at 1) but
  // was compared against per-USER state. Playing on a phone and a browser
  // meant the second device was refused forever — and a refusal BURNS the
  // batch, so the player silently lost those taps. Replay protection is the
  // nonce's job; it is genuinely per-user.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/services/tapGameService.js'), 'utf8');
  assert.ok(
    !/if\s*\(body\.seq\s*<=\s*Number\(current\.last_sequence\)\)/.test(src),
    'submitBatch must not reject on a non-increasing sequence'
  );
});

test('last_sequence records the highest seen', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/services/tapGameService.js'), 'utf8');
  assert.ok(/GREATEST\(last_sequence/.test(src),
    'with two devices a plain overwrite would bounce between their counters');
});

test('the nonce is still single-use', () => {
  // Dropping the sequence gate must not weaken replay protection.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/services/tapGameService.js'), 'utf8');
  assert.ok(/ON CONFLICT \(user_id, nonce\) DO NOTHING RETURNING nonce/.test(src));
  assert.ok(/nonceInsert\.rowCount === 0/.test(src), 'a repeat nonce must be refused');
});

test('a level-up carries over correctly mid-session', () => {
  const need = svc.requiredTaps(1);
  const r = svc.advance(1, need - 40, 50);
  assert.strictEqual(r.level, 2);
  assert.strictEqual(r.levelTaps, 10);
});

// ── the daily level cap ────────────────────────────────────────────────────
console.log('\ntap game — daily level cap');

test('the cap is two levels', () => {
  assert.strictEqual(svc.MAX_LEVELS_PER_DAY, 2);
});

test('PARTIAL PROGRESS SURVIVES THE CAP', () => {
  // The owner was explicit: "یه روزایی بعد گرفتن نصف لول یا کمی از لول خسته
  // شدن اشکالی نداره میتونن ادامشو برن". Stopping mid-level must keep the
  // points banked toward it.
  const r = svc.advance(3, 100, 50, 2);
  assert.strictEqual(r.level, 3, 'still on the same level');
  assert.strictEqual(r.levelTaps, 150, 'the 150 banked points are KEPT');
  assert.ok(!r.capped, 'nothing hit the wall — no boundary was crossed');
});

test('a half-finished level resumes tomorrow', () => {
  // Yesterday: banked 150 into level 3 and ran out of allowance.
  // Today: the remainder finishes the level.
  const need = svc.requiredTaps(3);
  const r = svc.advance(3, 150, need - 150, 2);
  assert.strictEqual(r.level, 4);
  assert.strictEqual(r.gained, 1);
});

test('a batch big enough for ten levels still only gains two', () => {
  const r = svc.advance(1, 0, 1_000_000, 2);
  assert.strictEqual(r.gained, 2);
  assert.strictEqual(r.level, 3);
  assert.ok(r.capped, 'the batch hit the wall');
});

test('the surplus is DISCARDED, not banked for tomorrow', () => {
  // This is the rule that stops the cap being a queue: a player who keeps
  // hammering after the third level must not wake up tomorrow with the next
  // three already cleared.
  const r = svc.advance(1, 0, 1_000_000, 3);
  assert.ok(r.levelTaps < svc.requiredTaps(4),
    'must not be sitting on a completed level');
  assert.strictEqual(r.levelTaps, svc.requiredTaps(4) - 1,
    'a million taps is genuinely over the line, so the clamp bites here');
});

test('the leftover is CLAMPED, not inflated to required-1', () => {
  // The honest clients refuse taps once capped, so they arrive at the wall
  // with a small leftover. Setting it to required-1 instead of clamping
  // would push a 99%-full progress bar back at them on the next sync — a
  // bar that then sits there all evening claiming one tap remains.
  const r = svc.advance(4, 5, 0, 0);
  assert.strictEqual(r.levelTaps, 5, 'an honest small leftover is untouched');
});

test('the parked position cannot itself trigger a level-up tomorrow', () => {
  // Sitting one short means ONE tap tomorrow gains ONE level. Parking AT the
  // requirement would hand out a level the player earned on neither day.
  const parked = svc.advance(1, 0, 1_000_000, 3);
  const next = svc.advance(parked.level, parked.levelTaps, 1, 3);
  assert.strictEqual(next.gained, 1);
  assert.strictEqual(next.level, 5);
});

test('an allowance of zero gains nothing at all', () => {
  const r = svc.advance(5, 0, 1_000_000, 0);
  assert.strictEqual(r.gained, 0);
  assert.strictEqual(r.level, 5);
  assert.ok(r.capped);
});

test('a partial allowance is honoured exactly', () => {
  const r = svc.advance(1, 0, 1_000_000, 2);
  assert.strictEqual(r.gained, 2);
  assert.strictEqual(r.level, 3);
});

test('taps below the next level are unaffected by the cap', () => {
  // The cap limits LEVEL-UPS, not taps. A player with no allowance left who
  // is mid-level must still see their bar move... which is why `capped` is
  // false here: nothing hit the wall.
  const r = svc.advance(1, 0, 50, 0);
  assert.strictEqual(r.levelTaps, 50);
  assert.strictEqual(r.gained, 0);
  assert.ok(!r.capped);
});

test('an uncapped call behaves exactly as before', () => {
  // Default parameter = Infinity, so every pre-existing caller and every
  // test above the cap section keeps its old meaning.
  const capped = svc.advance(1, 0, 1_000_000, Infinity);
  const legacy = svc.advance(1, 0, 1_000_000);
  assert.deepStrictEqual(legacy, capped);
  assert.strictEqual(legacy.level, svc.LEVEL_COUNT + 1, 'runs to completion');
});

test('finishing the game is not blocked by the cap', () => {
  // Reaching levelCount+1 from levelCount is one level-up; with allowance
  // left it must complete rather than parking one tap short forever.
  const r = svc.advance(svc.LEVEL_COUNT, 0, 10 ** 9, 3);
  assert.strictEqual(r.level, svc.LEVEL_COUNT + 1);
  assert.strictEqual(r.levelTaps, 0);
});

console.log('\ntap game — the Tehran day');

test('the day is ISO and matches Asia/Tehran, not UTC', () => {
  // 2026-03-01T21:00Z is already 2026-03-02 in Tehran (+03:30).
  const d = new Date('2026-03-01T21:00:00Z');
  assert.strictEqual(svc.tehranDay(d), '2026-03-02');
});

test('just before Tehran midnight it is still the old day', () => {
  // 20:29Z = 23:59 Tehran.
  const d = new Date('2026-03-01T20:29:00Z');
  assert.strictEqual(svc.tehranDay(d), '2026-03-01');
});

test('the countdown reaches zero exactly at Tehran midnight', () => {
  const oneMinuteBefore = new Date('2026-03-01T20:29:00Z');
  const ms = svc.msUntilTehranMidnight(oneMinuteBefore);
  assert.ok(ms > 0 && ms <= 61000, `expected ~60s, got ${ms}`);
});

test('the countdown is a full day just after midnight', () => {
  const justAfter = new Date('2026-03-01T20:30:30Z');
  const ms = svc.msUntilTehranMidnight(justAfter);
  assert.ok(ms > 86_000_000, `expected ~24h, got ${ms}`);
});

test('a counter from a previous day is worth zero', () => {
  const row = { levels_today: 3, levels_day: new Date('2026-03-01T00:00:00Z') };
  assert.strictEqual(svc.levelsLeftToday(row, '2026-03-02'),
    svc.MAX_LEVELS_PER_DAY);
});

test("today's counter is respected", () => {
  const row = { levels_today: 1, levels_day: new Date('2026-03-02T00:00:00Z') };
  assert.strictEqual(svc.levelsLeftToday(row, '2026-03-02'), 1);
});

// ── the shape node-postgres actually returns ───────────────────────────────
//
// REGRESSION GUARD. These tests exist because the first version of the cap
// passed every unit test above and was still completely broken in
// production: it reset the allowance on every single request.
//
// The cause was that the tests hand-built rows with UTC-midnight Dates,
// while node-postgres parses a DATE column into LOCAL midnight. On a server
// set to Asia/Tehran the date 2026-08-03 arrives as 2026-08-02T20:30:00Z,
// and reading that back in UTC gives the PREVIOUS day. The comparison always
// failed. Only the live end-to-end test caught it.
console.log('\ntap game — the shape pg actually returns');

test('a local-midnight Date (what pg gives us) reads as the right day', () => {
  // Exactly what came back from the live database for 2026-08-03 on a
  // Tehran-clocked server.
  const pgStyle = new Date(2026, 7, 3, 0, 0, 0); // local midnight, Aug 3
  const row = { levels_today: 3, levels_day: pgStyle };
  assert.strictEqual(svc.levelsLeftToday(row, '2026-08-03'), 0,
    'the stored day must compare equal to today, not to yesterday');
});

test('the local-midnight Date is NOT mistaken for the previous day', () => {
  const pgStyle = new Date(2026, 7, 3, 0, 0, 0);
  const row = { levels_today: 3, levels_day: pgStyle };
  assert.strictEqual(svc.levelsLeftToday(row, '2026-08-02'),
    svc.MAX_LEVELS_PER_DAY,
    'yesterday must still read as a different day');
});

test('a plain ISO string is handled too', () => {
  // Some pg configurations return DATE as a string.
  const row = { levels_today: 1, levels_day: '2026-08-03' };
  assert.strictEqual(svc.levelsLeftToday(row, '2026-08-03'), 1);
});

test('a timestamp string is truncated to its date part', () => {
  const row = { levels_today: 1, levels_day: '2026-08-03T00:00:00.000Z' };
  assert.strictEqual(svc.levelsLeftToday(row, '2026-08-03'), 1);
});

test('a null or invalid day grants a full allowance', () => {
  // Rows written before the migration have NULL here.
  for (const bad of [null, undefined, '', new Date('nonsense')]) {
    assert.strictEqual(
      svc.levelsLeftToday({ levels_today: 3, levels_day: bad }, '2026-08-03'),
      svc.MAX_LEVELS_PER_DAY, `levels_day = ${bad}`);
  }
});

test('a rejected batch does not wipe the counter', () => {
  // The live test surfaced this too: on a rejected batch `gained` is 0, so
  // the written value is entirely (cap - left). If `left` were wrong, a
  // rejected batch would silently hand the allowance back.
  //
  // دورِ ۳۳: سقفِ روزانه از ثابتِ MAX_LEVELS_PER_DAY به curve.levelsPerDay
  // (تنظیمِ زندهٔ ادمین) منتقل شد؛ نگهبان همان رابطه را با نامِ جدید
  // چک می‌کند تا کسی در بازنویسی‌ها «هزینه‌شدهٔ امروز» را از «ریست»
  // اشتباه نگیرد.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/services/tapGameService.js'), 'utf8');
  assert.ok(/\(curve\.levelsPerDay - left\) \+ next\.gained/.test(src),
    'usedToday must be derived from what was already spent, not reset');
});

test('a missing row grants a full allowance', () => {
  assert.strictEqual(svc.levelsLeftToday(null), svc.MAX_LEVELS_PER_DAY);
});

test('a corrupt counter above the cap cannot go negative', () => {
  const row = { levels_today: 99, levels_day: new Date('2026-03-02T00:00:00Z') };
  assert.strictEqual(svc.levelsLeftToday(row, '2026-03-02'), 0);
});

test('the cap is enforced in submitBatch, not only in advance()', () => {
  // A cap applied in the pure helper but never wired into the write path
  // would pass every test above and do nothing in production.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/services/tapGameService.js'), 'utf8');
  assert.ok(/advance\(current\.level, current\.level_taps, accepted, left, curve\)/
    .test(src), 'submitBatch must pass the remaining allowance to advance()');
  assert.ok(/levels_today = \$8/.test(src), 'the counter must be persisted');
  assert.ok(/levels_day = \$9::date/.test(src),
    'the day must be persisted alongside the count, or it goes stale');
});

console.log('\ntap game — admin-driven curve (دورِ ۳۳)');

test('a custom curve sums to exactly its own total', () => {
  // ادمین از پنل جمعِ امتیاز و تعداد لول را عوض می‌کند؛ جدولِ ساخته‌شده
  // باید دقیقاً همان جمع را بدهد، وگرنه دو سرِ سیستم بر سرِ «کی بازی
  // تمام شد» اختلاف پیدا می‌کنند — همان باگی که برای منحنیِ ۵۰ لولی
  // قبلاً دیده شده بود.
  for (const spec of [
    { levelCount: 10, totalPoints: 3000, growthFactor: 1.08, levelsPerDay: 3 },
    { levelCount: 60, totalPoints: 80000, growthFactor: 1.04, levelsPerDay: 1 },
    { levelCount: 5, totalPoints: 1000, growthFactor: 1, levelsPerDay: 5 },
  ]) {
    const curve = svc.buildCurve(spec);
    assert.strictEqual(svc.totalGamePointsOn(curve), spec.totalPoints,
      JSON.stringify(spec));
    let sum = 0;
    for (let lv = 1; lv <= spec.levelCount; lv++) {
      sum += svc.requiredTapsOn(curve, lv);
    }
    assert.strictEqual(sum, spec.totalPoints, JSON.stringify(spec));
  }
});

test('advance() honours a custom curve and its daily cap', () => {
  const curve = svc.buildCurve(
    { levelCount: 3, totalPoints: 300, growthFactor: 1, levelsPerDay: 1 });
  // لول‌های ۱۰۰ تایی؛ سه لول. سقفِ روزانه: ۱ لول.
  const a = svc.advance(1, 0, 150, 1, curve);
  assert.strictEqual(a.level, 2);
  assert.strictEqual(a.gained, 1);
  assert.strictEqual(a.capped, false);
  // سقفِ ۱ لول در روز: لولِ اول گرفته می‌شود، لولِ دوم تمام نمی‌شود و
  // بازیکن با پیشرفتِ جزئیِ ۹۹ ضربه‌ای همان مرز می‌نشیند (خواستهٔ مالک:
  // «نصفِ لول بماند اشکالی ندارد»)؛ مازادِ آن‌طرفِ مرز دور ریخته می‌شود.
  const b = svc.advance(1, 0, 1000, 1, curve);
  assert.strictEqual(b.capped, true);
  assert.strictEqual(b.level, 2);
  assert.strictEqual(b.gained, 1);
  assert.strictEqual(b.levelTaps, svc.requiredTapsOn(curve, 2) - 1);
  // بدون سقف: عبور از لولِ آخر یعنی sentinelِ levelCount+1.
  const c = svc.advance(3, 99, 500, Infinity, curve);
  assert.strictEqual(c.level, 4);
  assert.strictEqual(c.levelTaps, 0);
});

test('cumulativePointsOn() banked points match the custom curve', () => {
  const curve = svc.buildCurve(
    { levelCount: 4, totalPoints: 400, growthFactor: 1, levelsPerDay: 2 });
  // چهار لولِ ۱۰۰ تایی.
  assert.strictEqual(svc.cumulativePointsOn(curve, 1, 40), 40);
  assert.strictEqual(svc.cumulativePointsOn(curve, 3, 30), 230);
  // گذشته از لولِ آخر، کلِ بازی.
  assert.strictEqual(svc.cumulativePointsOn(curve, 5, 0), 400);
});

test('the live curve and the default agree while nothing is customised', () => {
  // تنظیماتِ اقتصاد در تستِ بدون-DB خوانده نمی‌شود؛ currentCurve باید
  // بی‌صدا روی پیش‌فرض بیفتد (خروجیِ سطحِ سرویس همیشه یک منحنیِ کامل است).
  return svc.currentCurve().then(curve => {
    assert.strictEqual(curve.levelCount, svc.LEVEL_COUNT);
    assert.strictEqual(curve.totalPoints, svc.TOTAL_POINTS);
    assert.strictEqual(curve.levelsPerDay, svc.MAX_LEVELS_PER_DAY);
  });
});

console.log(`\n${passed} tap-game assertions passed\n`);
