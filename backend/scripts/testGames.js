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

console.log('\n== tictactoe ==');
{
  const r = RULES.tictactoe;
  let s = r.create();
  ok(s.board.length === 9 && s.board.every(v => v === null), 'starts empty');
  ok(r.isValidMove(s, 0) && !r.isValidMove(s, 99), 'move legality');
  r.applyMove(s, 0, 'X');
  ok(!r.isValidMove(s, 0), 'occupied cell rejected');

  s = r.create();
  [0, 3, 1, 4, 2].forEach((m, i) => r.applyMove(s, m, i % 2 ? 'O' : 'X'));
  ok(r.result(s) === 'X', 'detects row win');

  s = r.create();
  ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'].forEach((v, i) => { s.board[i] = v; });
  ok(r.result(s) === 'DRAW', 'detects draw');

  s = r.create();
  s.board[0] = 'O'; s.board[1] = 'O';
  ok(r.botMove(s, 'O') === 2, 'bot takes the win');

  s = r.create();
  s.board[0] = 'X'; s.board[1] = 'X';
  ok(r.botMove(s, 'O') === 2, 'bot blocks the loss');

  // A perfect bot must never lose to itself.
  let losses = 0;
  for (let g = 0; g < 200; g++) {
    const st = r.create();
    let t = 'X';
    while (!r.result(st)) { r.applyMove(st, r.botMove(st, t), t); t = r.nextTurn(st, t); }
    if (r.result(st) !== 'DRAW') losses++;
  }
  ok(losses === 0, `bot vs bot always draws (${losses} decisive)`);
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
