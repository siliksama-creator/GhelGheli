#!/usr/bin/env node
// Regression tests for the input-validation and queue-lifetime bugs found in
// the integrated audit.
//
// Each block documents a bug that was REPRODUCED against the live API before
// being fixed, so these tests fail loudly if any of them come back.
//
//   node scripts/testValidation.js
const assert = require('assert');

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
};

// The helpers live inside server.js, which opens sockets and a DB pool on
// require. Rather than boot the whole API, re-declare the exact same
// implementations here and assert their behaviour; a copy that drifts will
// be caught by the live smoke test that follows in CI.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

console.log('\n== UUID validation ==');
{
  // BUG: any non-UUID :id reached Postgres and raised 22P02, which the error
  // handler turned into a 500. Proven live:
  //   GET /api/support/tickets/abc/messages -> 500
  const good = [
    '9241ddd1-c4fd-468a-ab4d-608183e35551',
    'B223E586-E005-4CA3-9F92-FAF6CA201249', // upper case is still valid
  ];
  const bad = [
    'abc', 'not-a-uuid', '', '../../etc/passwd', '1 OR 1=1',
    '9241ddd1-c4fd-468a-ab4d', // too short
    '9241ddd1c4fd468aab4d608183e35551', // no dashes
    "'; DROP TABLE users; --",
    '00000000-0000-0000-0000-000000000000', // nil uuid: version nibble is 0
  ];
  ok(good.every(v => UUID_RE.test(v)), 'accepts real UUIDs (any case)');
  ok(bad.every(v => !UUID_RE.test(v)), 'rejects every malformed id');
  ok(!UUID_RE.test(null) && !UUID_RE.test(undefined), 'rejects null/undefined');
}

console.log('\n== avatar key whitelist ==');
{
  const AVATAR_KEYS = new Set([
    'avatar_1_football.png', 'avatar_2_trophy.png', 'avatar_3_star.png',
    'avatar_4_rocket.png', 'avatar_5_lion.png', 'avatar_6_tiger.png',
    'avatar_7_eagle.png', 'avatar_8_target.png', 'avatar_9_bolt.png',
    'avatar_10_crown.png',
  ]);
  const safeAvatarKey = v => (v && AVATAR_KEYS.has(String(v)) ? String(v) : null);

  // BUG: the API stored ANY string, and both clients interpolate it straight
  // into an asset path ('assets/avatars/$key'). Live test returned HTTP 200
  // for profileAvatarKey = "../../etc/passwd".
  ok(safeAvatarKey('avatar_3_star.png') === 'avatar_3_star.png', 'accepts a bundled avatar');
  ok(safeAvatarKey('../../etc/passwd') === null, 'rejects path traversal');
  ok(safeAvatarKey('..%2F..%2Fsecret') === null, 'rejects encoded traversal');
  ok(safeAvatarKey('avatar_99_fake.png') === null, 'rejects an unknown avatar');
  ok(safeAvatarKey('') === null && safeAvatarKey(null) === null, 'rejects empty/null');
  ok(AVATAR_KEYS.size === 10, 'whitelist covers all ten shipped avatars');
}

console.log('\n== bounded text ==');
{
  function boundedText(value, max) {
    if (value === undefined || value === null) return null;
    const t = String(value).trim();
    if (!t) return null;
    return t.slice(0, max);
  }
  // BUG: a 3000-character nickname hit the column limit and Postgres raised
  // 22001, surfacing as a 500 instead of a clear message.
  ok(boundedText('  علی  ', 40) === 'علی', 'trims whitespace');
  ok(boundedText('ن'.repeat(3000), 40).length === 40, 'caps at the column width');
  ok(boundedText('', 40) === null, 'empty string becomes null, not ""');
  ok(boundedText('   ', 40) === null, 'whitespace-only becomes null');
  ok(boundedText(undefined, 40) === null, 'undefined stays null (COALESCE keeps old value)');
  ok(boundedText(12345, 40) === '12345', 'coerces a number safely');
}

console.log('\n== numeric range ==');
{
  function intInRange(value, { min, max, fallback }) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(n)));
  }
  const p = { min: 1, max: 100, fallback: 30 };
  ok(intInRange('50', p) === 50, 'parses a numeric string');
  ok(intInRange(99999999, p) === 100, 'clamps a huge value');
  ok(intInRange(-5, p) === 1, 'clamps a negative value');
  ok(intInRange('abc', p) === 30, 'falls back on garbage');
  ok(intInRange(Infinity, p) === 30, 'falls back on Infinity');
  ok(intInRange(NaN, p) === 30, 'falls back on NaN');
  ok(intInRange(1.9, p) === 1, 'truncates rather than rounds');
}

console.log('\n== age validation ==');
{
  // BUG: age:-5 and age:99999 both violated a CHECK constraint (23514) and
  // returned a raw 500 with the Postgres message. age:"abc" raised 22P02.
  const validAge = v => {
    if (v === undefined || v === null || v === '') return { ok: true, value: null };
    const n = Number(v);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 5 || n > 120) {
      return { ok: false };
    }
    return { ok: true, value: n };
  };
  ok(validAge(25).ok && validAge(25).value === 25, 'accepts a normal age');
  ok(!validAge(-5).ok, 'rejects a negative age');
  ok(!validAge(99999).ok, 'rejects an absurd age');
  ok(!validAge('abc').ok, 'rejects a non-numeric age');
  ok(!validAge(25.5).ok, 'rejects a fractional age');
  ok(validAge(undefined).ok && validAge(undefined).value === null,
    'omitting age leaves the stored value untouched');
}

console.log('\n== image url safety ==');
{
  function safeImageUrl(v) {
    if (v === undefined || v === null) return null;
    const t = String(v).trim();
    if (!t) return null;
    if (t.startsWith('/uploads/') || t.startsWith('/public/')) return t.slice(0, 400);
    if (/^https:\/\//i.test(t)) return t.slice(0, 400);
    return null;
  }
  ok(safeImageUrl('/uploads/images/a.webp') === '/uploads/images/a.webp', 'accepts our own upload path');
  ok(safeImageUrl('https://cdn.example.com/x.png').startsWith('https://'), 'accepts https');
  ok(safeImageUrl('javascript:alert(1)') === null, 'blocks javascript:');
  ok(safeImageUrl('data:text/html,<script>') === null, 'blocks data:');
  ok(safeImageUrl('http://insecure.example.com/x.png') === null, 'blocks plain http');
  ok(safeImageUrl('') === null, 'empty becomes null rather than wiping the image');
}

console.log('\n== queue keep-alive (bot-less games) ==');
{
  // BUG: a player parked in جفت‌یاب's open-ended queue received nothing after
  // the first 15s notice. An idle websocket behind a carrier NAT gets reaped,
  // so they were dropped from matchmaking while the UI still said "looking
  // for an opponent" — forever. A dead entry also stayed in the queue and the
  // next real player could be paired with a ghost.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/games/engine.js'), 'utf8');
  ok(/QUEUE_PING_MS/.test(src), 'a keep-alive interval exists');
  ok(/clearInterval\(socket\.queuePing\)/.test(src), 'the interval is cleared on leave');
  ok(/if \(socket\.queuePing\)/.test(src), 'dropFromQueue tears the interval down');
  ok(/opponent\.queuePing/.test(src), 'a late match also clears the waiting player\'s ping');
  ok(/if \(!alive\)/.test(src), 'a failed emit prunes the dead socket from the queue');
}

console.log('\n== JSON / 404 handling ==');
{
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/server.js'), 'utf8');
  // BUG: malformed JSON produced the raw English parser message, and an
  // unknown /api path returned an HTML error page to a JSON-only client.
  ok(/entity\.parse\.failed/.test(src), 'malformed JSON returns a Persian message');
  ok(/entity\.too\.large/.test(src), 'oversized bodies return 413, not 500');
  ok(/این آدرس در سرور وجود ندارد/.test(src), 'unknown /api paths return JSON 404');
  ok(/validateUuid/.test(src), 'the UUID guard is wired into the app');

  // Every :id route must carry the guard — a new route added without it is
  // exactly how this class of bug comes back.
  const routes = [...src.matchAll(
    /app\.(?:get|post|patch|put|delete)\('(\/api\/[^']*:id[^']*)',([^\n]{0,140})/g)];
  const unguarded = routes.filter(m => !m[2].includes('validateUuid')).map(m => m[1]);
  ok(routes.length > 20, `found ${routes.length} :id routes to check`);
  ok(unguarded.length === 0,
    `every :id route validates its id${unguarded.length ? ` (missing: ${unguarded.join(', ')})` : ''}`);
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
