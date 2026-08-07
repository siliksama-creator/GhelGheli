#!/usr/bin/env node
// Dependency-free rules test: node scripts/testGames.js
// Covers win/draw detection, move legality, bot sanity and the Reversi
// skip-turn path, plus random self-play to shake out crashes.
const { RULES } = require('../src/games');

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
};

const play = (rules, state, moves, start = 'X') => {
  let turn = start;
  for (const m of moves) {
    rules.applyMove(state, m, turn);
    if (rules.result(state)) break;
    turn = rules.nextTurn(state, turn) || turn;
  }
  return state;
};

console.log('\n== memory (جفت‌یاب) ==');
{
  const r = RULES.memory;
  let s = r.create();
  ok(s.deck.length === 16, '16 cards');
  ok(new Set(s.deck).size === 8, '8 distinct faces');
  ok(s.deck.every(f => s.deck.filter(x => x === f).length === 2), 'every face appears exactly twice');
  ok(s.matched.every(m => m === null) && s.scores.X === 0, 'clean starting board');

  // SECURITY: the client must never receive the hidden deck.
  const view = r.decorate(s, 'X');
  ok(view.cards.every(c => c.face === null), 'face-down cards hide their value');
  ok(view.deck === undefined && view._seen === undefined, 'deck and bot memory are not serialised');
  ok(view.playable.length === 16, 'all cards playable at the start');

  // Flipping one card reveals only that card.
  s = r.create();
  r.applyMove(s, 0, 'X');
  ok(r.decorate(s, 'X').cards[0].face === s.deck[0], 'flipped card is revealed');
  ok(r.decorate(s, 'X').cards.filter(c => c.face).length === 1, 'only the flipped card is revealed');
  ok(r.nextTurn(s, 'X') === 'X', 'same player flips the second card');

  // A matching pair scores and keeps the turn.
  s = r.create();
  const face = s.deck[0];
  const twin = s.deck.findIndex((f, i) => i !== 0 && f === face);
  r.applyMove(s, 0, 'X');
  r.applyMove(s, twin, 'X');
  ok(s.scores.X === 1, 'match scores a point');
  ok(s.matched[0] === 'X' && s.matched[twin] === 'X', 'both cards are claimed');
  ok(s.lastResult === 'match', 'match reported');
  ok(r.nextTurn(s, 'X') === 'X', 'a match earns another turn');
  ok(!r.isValidMove(s, 0), 'a claimed card cannot be flipped again');

  // A miss hands the turn over and leaves the cards visible until next flip.
  s = r.create();
  const a0 = 0;
  const b0 = s.deck.findIndex(f => f !== s.deck[0]);
  r.applyMove(s, a0, 'X');
  r.applyMove(s, b0, 'X');
  ok(s.lastResult === 'miss', 'mismatch reported');
  ok(s.scores.X === 0, 'no point for a miss');
  ok(r.nextTurn(s, 'X') === 'O', 'a miss passes the turn');
  ok(r.decorate(s, 'O').cards.filter(c => c.up).length === 2, 'missed pair stays visible for the opponent');
  r.applyMove(s, 2, 'O');
  ok(s.flipped.length === 1, 'the stale pair clears on the next flip');

  // Winner is whoever holds more pairs.
  s = r.create();
  s.matched = Array(16).fill('X');
  s.scores = { X: 5, O: 3 };
  ok(r.result(s) === 'X', 'majority of pairs wins');
  s.scores = { X: 4, O: 4 };
  ok(r.result(s) === 'DRAW', 'equal pairs is a draw');
  s.matched[0] = null;
  ok(r.result(s) === null, 'game is not over while a card remains');

  // Bot: completes a pair it has just seen.
  s = r.create();
  const f0 = s.deck[0];
  const t0 = s.deck.findIndex((f, i) => i !== 0 && f === f0);
  s._seen = { 0: f0, [t0]: f0 };
  ok(r.botMove(s, 'O') === 0 || r.botMove(s, 'O') === t0, 'bot takes a remembered pair');
  // ...and finishes it on the second flip.
  r.applyMove(s, 0, 'O');
  ok(r.botMove(s, 'O') === t0, 'bot completes the pair it started');

  // Bot never picks an illegal card.
  {
    let bad = 0;
    for (let g = 0; g < 200; g++) {
      const st = r.create();
      let turn = 'X', guard = 0;
      while (!r.result(st) && guard++ < 400) {
        const mv = r.botMove(st, turn);
        if (mv === null) break;
        if (!r.isValidMove(st, mv, turn)) { bad++; break; }
        r.applyMove(st, mv, turn);
        if (r.result(st)) break;
        turn = r.nextTurn(st, turn);
      }
    }
    ok(bad === 0, 'bot always plays a legal card');
  }

  // Every self-play game terminates with all pairs claimed.
  {
    let done = 0;
    for (let g = 0; g < 120; g++) {
      const st = r.create();
      let turn = 'X', guard = 0;
      while (!r.result(st) && guard++ < 400) {
        const mv = r.botMove(st, turn);
        if (mv === null) break;
        r.applyMove(st, mv, turn);
        if (r.result(st)) break;
        turn = r.nextTurn(st, turn);
      }
      if (r.result(st) && st.matched.every(m => m !== null)) done++;
    }
    ok(done === 120, `all 120 self-play games completed (${done})`);
  }

  // REGRESSION: a client that always picks the FIRST legal card (the timeout
  // autoplay does exactly this) used to cycle the same few cards forever and
  // the match never ended — it looked like the game had frozen. A hard flip
  // ceiling now guarantees termination for any strategy.
  {
    const strategies = {
      'lowest index': pl => pl[0],
      'highest index': pl => pl[pl.length - 1],
      random: pl => pl[Math.floor(Math.random() * pl.length)],
    };
    for (const [name, pick] of Object.entries(strategies)) {
      let done = 0;
      for (let g = 0; g < 100; g++) {
        const st = r.create();
        let turn = 'X', guard = 0;
        while (!r.result(st) && guard++ < 3000) {
          const pl = [...Array(16).keys()].filter(k => r.isValidMove(st, k, turn));
          if (!pl.length) break;
          r.applyMove(st, pick(pl), turn);
          if (r.result(st)) break;
          turn = r.nextTurn(st, turn);
        }
        if (r.result(st)) done++;
      }
      ok(done === 100, `"${name}" strategy always terminates (${done}/100)`);
    }
  }

  // Every open card must stay reachable: hiding both halves of a pair would
  // make the board unwinnable (an earlier anti-stall attempt did exactly that).
  {
    const st = r.create();
    let turn = 'X', guard = 0, unreachable = 0;
    while (!r.result(st) && guard++ < 600) {
      const open = st.matched.map((m, i) => (m === null ? i : -1)).filter(i => i >= 0);
      const legal = open.filter(i => r.isValidMove(st, i, turn));
      // Allow the 1-2 cards currently face-up to be excluded, nothing more.
      if (legal.length < open.length - 2) unreachable++;
      r.applyMove(st, r.botMove(st, turn), turn);
      if (r.result(st)) break;
      turn = r.nextTurn(st, turn);
    }
    ok(unreachable === 0, 'open cards always remain reachable');
  }

  // The two scores must always add up to the 8 available pairs.
  {
    const st = r.create();
    let turn = 'X', guard = 0;
    while (!r.result(st) && guard++ < 400) {
      const mv = r.botMove(st, turn);
      if (mv === null) break;
      r.applyMove(st, mv, turn);
      if (r.result(st)) break;
      turn = r.nextTurn(st, turn);
    }
    ok(st.scores.X + st.scores.O === 8, 'scores always total 8 pairs');
    ok(st.totalFlips > 0 && st.totalFlips < 200, `flip count stays sane (${st.totalFlips})`);
  }
}

// Connect Four (چهار در یک ردیف) was retired — see src/games/index.js.

console.log('\n== reversi ==');
{
  const r = RULES.reversi;
  const s = r.create();
  ok(s.board.filter(Boolean).length === 4, 'four starting discs');
  ok(r.decorate(s, 'X').legal.sort().join() === [19, 26, 37, 44].join(), 'opening legal moves');
  ok(!r.isValidMove(s, 0, 'X'), 'non-flipping move rejected');

  r.applyMove(s, 19, 'X');
  ok(s.board[19] === 'X' && s.board[27] === 'X', 'flips the captured disc');
  ok(r.decorate(s, 'X').scores.X === 4, 'score tracks flips');

  // Board where O has no legal reply: the turn must pass BACK to X rather
  // than ending the game. All-X except one empty cell means O can never
  // bracket anything, while X can still play.
  const t = { board: Array(64).fill('X'), size: 8 };
  t.board[1] = 'O'; t.board[2] = null;
  ok(r.decorate(t, 'O').legal.length === 0, 'blocked player has no legal move');
  ok(r.decorate(t, 'X').legal.length > 0, 'the other player still can move');
  ok(r.nextTurn(t, 'X') === 'X', 'skips a blocked opponent');

  // Neither side can move -> nextTurn returns null so the engine ends it.
  const dead = { board: Array(64).fill('X'), size: 8 };
  ok(r.nextTurn(dead, 'X') === null, 'ends when nobody can move');

  const full = { board: Array(64).fill('X'), size: 8 };
  full.board[0] = 'O';
  ok(r.result(full) === 'X', 'majority wins when board is full');

  // Full random self-play: must always terminate cleanly.
  let crashed = 0, finished = 0;
  for (let g = 0; g < 40; g++) {
    const st = r.create();
    let turn = 'X', guard = 0;
    try {
      while (guard++ < 200) {
        const mv = r.botMove(st, turn);
        if (mv === null) break;
        st.lastValid = r.isValidMove(st, mv, turn);
        if (!st.lastValid) throw new Error('bot produced an illegal move');
        r.applyMove(st, mv, turn);
        if (r.result(st)) break;
        const nx = r.nextTurn(st, turn);
        if (!nx) break;
        turn = nx;
      }
      finished++;
    } catch { crashed++; }
  }
  ok(crashed === 0 && finished === 40, `40 self-play games completed (${crashed} crashes)`);
}

console.log('\n== engine contract ==');
for (const [id, r] of Object.entries(RULES)) {
  const required = ['create', 'result', 'isValidMove', 'applyMove', 'nextTurn', 'botMove'];
  ok(required.every(fn => typeof r[fn] === 'function'), `${id} implements the full contract`);
}

// Fuzz: malformed input must never throw (a throw inside a socket handler
// would take the whole API process down).
console.log('\n== fuzz (malformed input) ==');
for (const [id, r] of Object.entries(RULES)) {
  let threw = false;
  const junk = [null, undefined, NaN, -1, 9999, '3', {}, [], 1.5, Infinity];
  for (const bad of junk) {
    try {
      const s = r.create();
      if (r.isValidMove(s, bad, 'X')) r.applyMove(s, bad, 'X');
      r.result(s); r.nextTurn(s, 'X');
    } catch { threw = true; }
  }
  ok(!threw, `${id} survives malformed moves`);
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
