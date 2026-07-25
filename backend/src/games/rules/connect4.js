// چهار در یک ردیف — Connect Four (7 cols x 6 rows).
// A `move` is a COLUMN index (0..6); the disc falls to the lowest free cell.
const COLS = 7;
const ROWS = 6;
const idx = (r, c) => r * COLS + c;

const create = () => ({ board: Array(COLS * ROWS).fill(null), cols: COLS, rows: ROWS });

function landingRow(board, c) {
  for (let r = ROWS - 1; r >= 0; r--) if (!board[idx(r, c)]) return r;
  return -1;
}

function winnerFrom(board) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = board[idx(r, c)];
      if (!v) continue;
      for (const [dr, dc] of dirs) {
        const line = [[r, c]];
        for (let k = 1; k < 4; k++) {
          const nr = r + dr * k, nc = c + dc * k;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
          if (board[idx(nr, nc)] !== v) break;
          line.push([nr, nc]);
        }
        if (line.length === 4) return { player: v, line: line.map(([a, b]) => idx(a, b)) };
      }
    }
  }
  return null;
}

function result(state) {
  const w = winnerFrom(state.board);
  if (w) { state.winLine = w.line; return w.player; }
  return state.board.every(Boolean) ? 'DRAW' : null;
}

const isValidMove = (state, c) => c >= 0 && c < COLS && landingRow(state.board, c) !== -1;

function applyMove(state, c, sym) {
  const r = landingRow(state.board, c);
  if (r === -1) return;
  state.board[idx(r, c)] = sym;
  state.lastCell = idx(r, c);
}

const nextTurn = (_s, turn) => (turn === 'X' ? 'O' : 'X');

// One-ply search with a light positional bias (centre columns are stronger),
// plus a guard against handing the opponent an immediate win.
function botMove(state, me) {
  const foe = me === 'X' ? 'O' : 'X';
  const open = [];
  for (let c = 0; c < COLS; c++) if (isValidMove(state, c)) open.push(c);
  if (!open.length) return null;

  const tryWin = who => {
    for (const c of open) {
      const b = state.board.slice();
      b[idx(landingRow(b, c), c)] = who;
      const w = winnerFrom(b);
      if (w && w.player === who) return c;
    }
    return null;
  };

  const win = tryWin(me); if (win !== null) return win;
  const block = tryWin(foe); if (block !== null) return block;

  const safe = open.filter(c => {
    const b = state.board.slice();
    b[idx(landingRow(b, c), c)] = me;
    const r2 = landingRow(b, c);
    if (r2 === -1) return true;
    b[idx(r2, c)] = foe;
    const w = winnerFrom(b);
    return !(w && w.player === foe);
  });

  const pool = safe.length ? safe : open;
  pool.sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3));
  const best = pool.filter(c => Math.abs(c - 3) === Math.abs(pool[0] - 3));
  return best[Math.floor(Math.random() * best.length)];
}

module.exports = {
  id: 'connect4',
  title: 'چهار در یک ردیف',
  create, result, isValidMove, applyMove, nextTurn, botMove,
};
