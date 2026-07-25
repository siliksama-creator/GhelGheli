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

console.log('\n== snakes & ladders ==');
{
  const r = RULES.snakes;
  let s = r.create();
  ok(s.pos.X === 0 && s.pos.O === 0, 'both players start off-board');
  ok(s.size === 100, '100 squares');

  // Two dice are offered and only legal ones are playable.
  s.dice = [3, 5];
  ok(r.isValidMove(s, 0, 'X') && r.isValidMove(s, 1, 'X'), 'both dice playable early');
  ok(!r.isValidMove(s, 2, 'X') && !r.isValidMove(s, 9, 'X'), 'invalid die index rejected');

  // Exact finish required — overshooting is illegal.
  s = r.create(); s.pos.X = 97; s.dice = [3, 5];
  ok(r.isValidMove(s, 0, 'X'), 'exact roll to 100 allowed');
  ok(!r.isValidMove(s, 1, 'X'), 'overshooting 100 rejected');
  r.applyMove(s, 0, 'X');
  ok(s.pos.X === 100 && r.result(s) === 'X', 'landing exactly on 100 wins');

  // Ladder (4 -> 14).
  s = r.create(); s.pos.X = 1; s.dice = [3, 1];
  r.applyMove(s, 0, 'X');
  ok(s.pos.X === 14 && s.event === 'ladder', 'ladder at 4 lifts to 14');
  ok(s.safe.X === 14, 'ladder top becomes the fallback point');

  // Snake (17 -> 7).
  s = r.create(); s.pos.X = 14; s.dice = [3, 1];
  r.applyMove(s, 0, 'X');
  ok(s.pos.X === 7 && s.event === 'snake', 'snake at 17 drops to 7');

  // Bump: landing on the opponent sends them to their fallback.
  s = r.create(); s.pos.X = 10; s.pos.O = 12; s.safe.O = 8; s.dice = [2, 1];
  r.applyMove(s, 0, 'X');
  ok(s.pos.O === 8 && s.event === 'bump', 'opponent bumped back to their safe square');

  // Six grants another turn (capped).
  s = r.create(); s.dice = [6, 1];
  r.applyMove(s, 0, 'X');
  ok(r.nextTurn(s, 'X') === 'X', 'rolling a 6 keeps the turn');
  ok(s.dice !== null, 'fresh dice issued for the extra turn');

  // The cap prevents an endless chain of sixes.
  s = r.create();
  let sixes = 0;
  for (let i = 0; i < 10; i++) {
    s.dice = [6, 6];
    if (s.pos.X + 6 > 100) break;
    r.applyMove(s, 0, 'X');
    if (r.nextTurn(s, 'X') !== 'X') break;
    sixes++;
  }
  ok(sixes <= 3, `extra turns are capped (${sixes} chained)`);

  // Bot must pick the winning die when one exists.
  s = r.create(); s.pos.X = 96; s.dice = [4, 2];
  ok(r.botMove(s, 'X') === 0, 'bot takes the exact winning roll');

  // Bot prefers a ladder over a plain step (1 + 3 = 4 -> 14).
  s = r.create(); s.pos.X = 1; s.dice = [3, 2];
  ok(r.botMove(s, 'X') === 0, 'bot prefers the ladder');

  // Bot avoids a snake when it has a choice (14 + 3 = 17 -> 7).
  s = r.create(); s.pos.X = 14; s.dice = [3, 1];
  ok(r.botMove(s, 'X') === 1, 'bot avoids the snake');

  // Full self-play must always terminate with a winner.
  let finished = 0, crashed = 0;
  for (let g = 0; g < 60; g++) {
    const st = r.create();
    let turn = 'X', guard = 0;
    try {
      while (!r.result(st) && guard++ < 4000) {
        const mv = r.botMove(st, turn);
        if (mv === null) { st.dice = null; turn = r.nextTurn(st, turn); continue; }
        r.applyMove(st, mv, turn);
        if (r.result(st)) break;
        turn = r.nextTurn(st, turn);
      }
      if (r.result(st)) finished++;
    } catch { crashed++; }
  }
  ok(crashed === 0, `no crashes in 60 self-play games (${crashed})`);
  ok(finished === 60, `all 60 games reached a winner (${finished})`);

  // REGRESSION: the endgame used to deadlock. When both players sat near 100
  // and neither could use either die, nextTurn handed the turn back to the
  // same player with dice=null forever — the game froze in ~18% of matches
  // and users reported it as "the connection dropped".
  {
    let frozen = 0;
    for (let g = 0; g < 400; g++) {
      const st = r.create();
      let turn = 'X', guard = 0;
      while (!r.result(st) && guard++ < 3000) {
        const playable = [0, 1].filter(i => r.isValidMove(st, i, turn));
        if (playable.length === 0) { frozen++; break; }
        r.applyMove(st, r.botMove(st, turn), turn);
        if (r.result(st)) break;
        turn = r.nextTurn(st, turn);
      }
    }
    ok(frozen === 0, `no endgame deadlock in 400 games (${frozen} frozen)`);
  }

  // The player on move must ALWAYS have at least one playable die.
  {
    let bad = 0;
    for (let g = 0; g < 200; g++) {
      const st = r.create();
      let turn = 'X', guard = 0;
      while (!r.result(st) && guard++ < 2000) {
        if (![0, 1].some(i => r.isValidMove(st, i, turn))) { bad++; break; }
        r.applyMove(st, r.botMove(st, turn), turn);
        if (r.result(st)) break;
        turn = r.nextTurn(st, turn);
      }
    }
    ok(bad === 0, 'the player on move always has a legal die');
  }

  // Board sanity: no square is both a chute head and a ladder foot, and no
  // chute lands the player straight onto another one.
  {
    const heads = Object.keys(r.SNAKES).map(Number);
    const feet = Object.keys(r.LADDERS).map(Number);
    ok(!feet.some(f => heads.includes(f)), 'no square is both a snake and a ladder');
    const dests = [...Object.values(r.SNAKES), ...Object.values(r.LADDERS)];
    ok(!dests.some(d => r.SNAKES[d] || r.LADDERS[d]), 'no chained chutes');
    ok(!r.LADDERS[100] && !r.SNAKES[100] && !r.LADDERS[1] && !r.SNAKES[1],
      'start and finish squares are clear');
  }

  // decorate() must tell each client which dice it may actually play.
  s = r.create(); s.pos.X = 98; s.dice = [1, 5];
  const d = r.decorate(s, 'X');
  ok(Array.isArray(d.playable) && d.playable.length === 1 && d.playable[0] === 0,
    'decorate exposes only the legal die');
}

console.log('\n== connect4 ==');
{
  const r = RULES.connect4;
  let s = r.create();
  ok(s.board.length === 42, 'board is 7x6');
  r.applyMove(s, 0, 'X');
  ok(s.board[35] === 'X', 'disc falls to the bottom');
  r.applyMove(s, 0, 'O');
  ok(s.board[28] === 'O', 'stacks on top');

  s = r.create();
  play(r, s, [0, 1, 0, 1, 0, 1, 0]);
  ok(r.result(s) === 'X', 'detects vertical win');

  s = r.create();
  play(r, s, [0, 0, 1, 1, 2, 2, 3]);
  ok(r.result(s) === 'X', 'detects horizontal win');

  s = r.create();
  for (let i = 0; i < 6; i++) r.applyMove(s, 0, 'X');
  ok(!r.isValidMove(s, 0), 'full column rejected');

  s = r.create();
  [0, 1, 2].forEach(c => r.applyMove(s, c, 'O'));
  ok(r.botMove(s, 'O') === 3, 'bot completes four');

  s = r.create();
  [0, 1, 2].forEach(c => r.applyMove(s, c, 'X'));
  ok(r.botMove(s, 'O') === 3, 'bot blocks four');

  ok(r.botMove(r.create(), 'X') === 3, 'bot opens in the centre');
}

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
