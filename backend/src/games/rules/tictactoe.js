// دوز — Tic-Tac-Toe (3x3). Pure rules; the engine owns all networking.
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

const create = () => ({ board: Array(9).fill(null) });

function winner(board) {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return null;
}

function result(state) {
  const w = winner(state.board);
  if (w) return w;
  return state.board.every(Boolean) ? 'DRAW' : null;
}

const isValidMove = (state, i) => i >= 0 && i < 9 && state.board[i] === null;
const applyMove = (state, i, sym) => { state.board[i] = sym; };
const nextTurn = (_state, turn) => (turn === 'X' ? 'O' : 'X');

// Perfect-play bot: win > block > center > corner > random.
function botMove(state, me) {
  const b = state.board;
  const foe = me === 'X' ? 'O' : 'X';
  const empty = b.map((v, i) => (v ? null : i)).filter(i => i !== null);

  for (const test of [me, foe]) {
    for (const i of empty) {
      b[i] = test;
      const win = winner(b) === test;
      b[i] = null;
      if (win) return i;
    }
  }
  if (b[4] === null) return 4;
  const corners = [0, 2, 6, 8].filter(i => b[i] === null);
  const pool = corners.length ? corners : empty;
  return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = {
  id: 'tictactoe',
  title: 'دوز',
  create, result, isValidMove, applyMove, nextTurn, botMove,
};
