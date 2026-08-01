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

test('level 1 costs exactly the base', () => {
  assert.strictEqual(svc.requiredTaps(1), 100);
});

test('curve matches round(100 * 1.15^(n-1))', () => {
  for (let lv = 1; lv <= svc.LEVEL_COUNT; lv++) {
    const expected = Math.round(100 * Math.pow(1.15, lv - 1));
    assert.strictEqual(svc.requiredTaps(lv), expected, `level ${lv}`);
  }
});

test('known checkpoints', () => {
  assert.strictEqual(svc.requiredTaps(2), 115);
  assert.strictEqual(svc.requiredTaps(10), 352);
  assert.strictEqual(svc.requiredTaps(25), 2863);
  assert.strictEqual(svc.requiredTaps(50), 94231);
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
  assert.strictEqual(svc.requiredTaps(0), 100);
  assert.strictEqual(svc.requiredTaps(-5), 100);
});

console.log('\ntap game — level advancement');

test('taps below the threshold do not level up', () => {
  const r = svc.advance(1, 0, 99);
  assert.strictEqual(r.level, 1);
  assert.strictEqual(r.levelTaps, 99);
});

test('exactly the threshold levels up with no remainder', () => {
  const r = svc.advance(1, 0, 100);
  assert.strictEqual(r.level, 2);
  assert.strictEqual(r.levelTaps, 0);
});

test('overflow carries into the next level', () => {
  const r = svc.advance(1, 0, 105);
  assert.strictEqual(r.level, 2);
  assert.strictEqual(r.levelTaps, 5);
});

test('one huge batch can clear several levels', () => {
  // 100 + 115 + 132 = 347 clears levels 1..3 exactly.
  const r = svc.advance(1, 0, 347);
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

test('finishing the game takes a realistic amount of tapping', () => {
  let total = 0;
  for (let lv = 1; lv <= svc.LEVEL_COUNT; lv++) total += svc.requiredTaps(lv);
  // At the server's most generous rate this must still be hours of work,
  // otherwise the curve is too soft to be worth anything.
  const secondsAtMaxRate = total / svc.MAX_TAPS_PER_SECOND;
  assert.ok(secondsAtMaxRate > 3600, `only ${Math.round(secondsAtMaxRate)}s at max rate`);
  console.log(
    `    (total ${total.toLocaleString()} taps · ` +
      `${(secondsAtMaxRate / 3600).toFixed(1)}h at the ${svc.MAX_TAPS_PER_SECOND}/s ceiling)`
  );
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

console.log(`\n${passed} tap-game assertions passed\n`);
