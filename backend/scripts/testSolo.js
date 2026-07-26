#!/usr/bin/env node
// Regression tests for the two rules the user asked for:
//   1. جفت‌یاب must NEVER be played against a bot
//   2. it must be playable alone, scored on time/flips, worth ZERO points
//
// Runs an in-memory fake socket.io so the real engine + solo handlers are
// exercised end to end, with no database and no network.
//   node scripts/testSolo.js
const { RULES, CATALOG } = require('../src/games');
const attachGames = require('../src/games/engine');
const { attachSolo, runs } = require('../src/games/solo');

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
};

// ── Minimal socket.io double ──────────────────────────────────────────────
let seq = 0;
class FakeSocket {
  constructor(user) {
    this.id = `s${++seq}`;
    this.user = user;
    this.connected = true;
    this.sent = [];
    this.handlers = {};
    this.rooms = new Set();
  }
  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); }
  emit(ev, payload) { this.sent.push({ ev, payload }); }
  fire(ev, payload) { for (const fn of this.handlers[ev] || []) fn(payload); }
  join(r) { this.rooms.add(r); }
  leave(r) { this.rooms.delete(r); }
  last(ev) { return [...this.sent].reverse().find(m => m.ev === ev)?.payload; }
  count(ev) { return this.sent.filter(m => m.ev === ev).length; }
}

class FakeIo {
  constructor() { this.conn = []; }
  on(ev, fn) { if (ev === 'connection') this.conn.push(fn); }
  connect(user) {
    const s = new FakeSocket(user);
    for (const fn of this.conn) fn(s);
    return s;
  }
}

const io = new FakeIo();
attachGames(io, RULES);
attachSolo(io, RULES);

const sleep = ms => new Promise(r => setTimeout(r, ms));

// The engine's real wait window; the test must outlast it to prove no bot
// match ever appears. Kept in sync via the constant, not a magic number.
const WAIT_MS = 15_000;

(async () => {
  console.log('\n== catalogue flags ==');
  {
    const mem = CATALOG.find(g => g.id === 'memory');
    ok(mem.noBot === true, 'memory is advertised as noBot');
    ok(mem.solo === true, 'memory is advertised as solo-capable');
    ok(RULES.memory.noBot === true, 'memory rules carry noBot');
    ok(RULES.memory.solo === true, 'memory rules carry solo');
    ok(!RULES.connect4.noBot && !RULES.reversi.noBot,
      'the other games keep their bot');
  }

  console.log('\n== assets instead of emoji ==');
  {
    const faces = RULES.memory.FACES;
    ok(faces.length === 8, '8 distinct faces');
    ok(faces.every(f => /^[a-z]+$/.test(f)),
      'faces are asset keys, not emoji (no font-dependent glyphs)');
    ok(new Set(faces).size === 8, 'no duplicate asset key');
    const fs = require('fs');
    const path = require('path');
    for (const dir of [
      '../../mobile/assets/games/memory',
      '../../userweb/public/games/memory',
    ]) {
      const base = path.join(__dirname, dir);
      const missing = faces.filter(f => !fs.existsSync(path.join(base, `${f}.webp`)));
      ok(missing.length === 0,
        `every face has an icon in ${dir.split('/').slice(-3).join('/')}${missing.length ? ` (missing ${missing})` : ''}`);
    }
  }

  console.log('\n== no bot fallback for جفت‌یاب ==');
  {
    const a = io.connect({ id: 'u1', nickname: 'علی' });
    a.fire('game:join', { gameId: 'memory' });
    const waiting = a.last('game:waiting');
    ok(!!waiting, 'player is told we are hunting for an opponent');
    ok(waiting.botFallback === false, 'waiting payload says there is NO bot fallback');
    ok(waiting.soloAvailable === true, 'waiting payload offers solo mode');

    // Outlast the matchmaking window: a bot game must never materialise.
    await sleep(WAIT_MS + 700);
    ok(a.count('game:start') === 0, `no bot match after ${WAIT_MS / 1000}s`);
    const still = a.last('game:still-waiting');
    ok(!!still && still.soloAvailable === true,
      'player stays queued and is offered solo instead');

    // Crucially, they must still be matchable by a human who arrives late.
    const b = io.connect({ id: 'u2', nickname: 'رضا' });
    b.fire('game:join', { gameId: 'memory' });
    const startA = a.last('game:start');
    const startB = b.last('game:start');
    ok(!!startA && !!startB, 'a late human opponent still gets matched');
    ok(startA.vsBot === false, 'the match is flagged human-vs-human');
    ok(startA.yourSymbol !== startB.yourSymbol, 'players get different seats');
    ok(startA.players.O.isBot !== true && startA.players.X.isBot !== true,
      'neither seat is a bot');
    a.fire('game:leave', {});
    b.fire('game:leave', {});
  }

  console.log('\n== other games keep their bot ==');
  {
    const c = io.connect({ id: 'u3', nickname: 'حسن' });
    c.fire('game:join', { gameId: 'connect4' });
    ok(c.last('game:waiting').botFallback === true, 'connect4 still advertises the bot');
    await sleep(WAIT_MS + 700);
    const st = c.last('game:start');
    ok(!!st && st.vsBot === true, 'connect4 falls back to the bot as before');
    c.fire('game:leave', {});
  }

  console.log('\n== solo time-attack ==');
  {
    const s = io.connect({ id: 'u4', nickname: 'سارا' });
    s.fire('solo:start', { gameId: 'memory' });
    const started = s.last('solo:start');
    ok(!!started, 'solo run starts');
    ok(started.state.cards.length === 16, 'solo board has 16 cards');
    ok(started.state.cards.every(c => c.face === null),
      'solo deck is hidden from the client too');
    ok(started.state.flips === 0, 'flip counter starts at zero');

    // A non-solo game must be refused.
    const s2 = io.connect({ id: 'u5' });
    s2.fire('solo:start', { gameId: 'connect4' });
    ok(!!s2.last('solo:error'), 'solo is refused for a game that does not support it');
    s2.fire('solo:start', { gameId: 'nope' });
    ok(s2.count('solo:error') === 2, 'unknown game id is refused');

    // Play the run out. We cheat by reading the private deck from the run
    // registry — the CLIENT can't do this, which is the whole point.
    const run = runs.get(s.id);
    ok(!!run, 'run is tracked server-side');
    const deck = run.state.deck;
    const byFace = {};
    deck.forEach((f, i) => (byFace[f] ||= []).push(i));
    const pairs = Object.values(byFace);
    // Flip the first 7 pairs, checking updates arrive.
    for (const [x, y] of pairs.slice(0, 7)) {
      s.fire('solo:move', { move: x });
      s.fire('solo:move', { move: y });
    }
    const mid = s.last('solo:update');
    ok(mid.state.flips === 14, 'flip counter tracks every reveal');
    ok(mid.state.elapsedMs >= 0, 'elapsed time is reported by the server');
    ok(s.count('solo:over') === 0, 'run is not over with one pair left');

    // Illegal moves must be ignored, not crash and not count.
    const before = mid.state.flips;
    for (const junk of [null, undefined, -1, 999, '2', {}, NaN, 1.5]) {
      s.fire('solo:move', { move: junk });
    }
    s.fire('solo:move', 'not-an-object');
    s.fire('solo:move', null);
    ok(s.last('solo:update').state.flips === before,
      'malformed / illegal moves are ignored and never counted');

    const [lx, ly] = pairs[7];
    s.fire('solo:move', { move: lx });
    s.fire('solo:move', { move: ly });
    await sleep(50);
    const over = s.last('solo:over');
    ok(!!over, 'run finishes when the board is cleared');
    ok(over.flips === 16, 'perfect run counts 16 flips');
    ok(over.perfect === true, 'a 16-flip run is flagged perfect');
    ok(typeof over.durationMs === 'number' && over.durationMs > 0,
      'duration is measured server-side');
    ok(over.points === undefined && over.delta === undefined,
      'solo awards NO points (no points field in the payload)');
    ok(!runs.has(s.id), 'finished run is removed from memory');

    // Abandoning must not leak the run.
    const s3 = io.connect({ id: 'u6' });
    s3.fire('solo:start', { gameId: 'memory' });
    ok(runs.has(s3.id), 'abandoned run is tracked...');
    s3.fire('disconnect');
    ok(!runs.has(s3.id), '...and cleaned up on disconnect');

    const s4 = io.connect({ id: 'u7' });
    s4.fire('solo:start', { gameId: 'memory' });
    s4.fire('solo:leave');
    ok(!runs.has(s4.id), 'solo:leave cleans up the run');

    // Restarting replaces rather than stacking.
    const s5 = io.connect({ id: 'u8' });
    s5.fire('solo:start', { gameId: 'memory' });
    const first = runs.get(s5.id).id;
    s5.fire('solo:start', { gameId: 'memory' });
    ok(runs.get(s5.id).id !== first, 'restarting replaces the previous run');
    ok([...runs.values()].filter(r => r.id === first).length === 0,
      'the replaced run is not left behind');
    s5.fire('solo:leave');
  }

  console.log('\n== solo reward isolation ==');
  {
    // The reward service must refuse to score anything that came from solo:
    // there is no opponent, so recordMatch can never be reached with one
    // player. Proven by contract rather than by a live DB.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../src/games/solo.js'), 'utf8');
    ok(!/gameRewardService|recordMatch/.test(src),
      'solo.js never touches the point-awarding service');
    ok(/soloRecordService/.test(src), 'solo.js records to solo_records only');
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
