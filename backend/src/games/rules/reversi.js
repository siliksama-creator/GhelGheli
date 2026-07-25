// اتللو / ریورسی — Reversi (8x8). X = dark, O = light.
// Demonstrates why the engine delegates turn order: in Reversi a player with
// no legal move is SKIPPED, and the game only ends when neither can move.
const N = 8;
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const idx = (r, c) => r * N + c;
const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
const other = s => (s === 'X' ? 'O' : 'X');

function create() {
  const board = Array(N * N).fill(null);
  board[idx(3, 3)] = 'O'; board[idx(4, 4)] = 'O';
  board[idx(3, 4)] = 'X'; board[idx(4, 3)] = 'X';
  return { board, size: N };
}

// Discs that would flip if `sym` played at cell `i` (empty ⇒ illegal).
function flips(board, i, sym) {
  if (board[i] !== null) return [];
  const r0 = Math.floor(i / N), c0 = i % N;
  const out = [];
  for (const [dr, dc] of DIRS) {
    const run = [];
    let r = r0 + dr, c = c0 + dc;
    while (inside(r, c) && board[idx(r, c)] === other(sym)) {
      run.push(idx(r, c)); r += dr; c += dc;
    }
    if (run.length && inside(r, c) && board[idx(r, c)] === sym) out.push(...run);
  }
  return out;
}

const legalMoves = (board, sym) => {
  const out = [];
  for (let i = 0; i < N * N; i++) if (flips(board, i, sym).length) out.push(i);
  return out;
};

const isValidMove = (state, i, sym) =>
  i >= 0 && i < N * N && flips(state.board, i, sym).length > 0;

function applyMove(state, i, sym) {
  const f = flips(state.board, i, sym);
  if (!f.length) return;
  state.board[i] = sym;
  for (const j of f) state.board[j] = sym;
  state.lastCell = i;
}

const count = (board, s) => board.filter(v => v === s).length;

// No winner mid-game; the engine calls finalResult() once nobody can move.
function result(state) {
  const stuck = !legalMoves(state.board, 'X').length && !legalMoves(state.board, 'O').length;
  return stuck ? finalResult(state) : null;
}

function finalResult(state) {
  const x = count(state.board, 'X'), o = count(state.board, 'O');
  if (x === o) return 'DRAW';
  return x > o ? 'X' : 'O';
}

// Hand the turn to whoever can actually move; null ⇒ game over.
function nextTurn(state, turn) {
  const foe = other(turn);
  if (legalMoves(state.board, foe).length) return foe;
  if (legalMoves(state.board, turn).length) return turn;
  return null;
}

// Greedy + corner preference: corners can never be flipped back.
const WEIGHT = i => {
  const r = Math.floor(i / N), c = i % N;
  const corner = (r === 0 || r === N - 1) && (c === 0 || c === N - 1);
  const edge = r === 0 || r === N - 1 || c === 0 || c === N - 1;
  const nextToCorner = (r <= 1 || r >= N - 2) && (c <= 1 || c >= N - 2);
  if (corner) return 25;
  if (nextToCorner) return -6;
  return edge ? 4 : 1;
};

function botMove(state, me) {
  const moves = legalMoves(state.board, me);
  if (!moves.length) return null;
  let best = moves[0], bestScore = -Infinity;
  for (const m of moves) {
    const score = flips(state.board, m, me).length + WEIGHT(m) * 2;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

// Send each player their own legal squares so the UI can highlight them.
const decorate = (state, sym) => ({
  ...state,
  legal: sym ? legalMoves(state.board, sym) : [],
  scores: { X: count(state.board, 'X'), O: count(state.board, 'O') },
});

module.exports = {
  id: 'reversi',
  // Per-turn thinking time: 64 squares and flip chains need real thought.
  turnMs: 30000,
  title: 'اتللو',
  create, result, finalResult, isValidMove, applyMove, nextTurn, botMove, decorate,
};
