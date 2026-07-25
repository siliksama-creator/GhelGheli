const crypto = require('crypto');

const waitingQueue = [];
const activeGames = new Map();

const WIN_PATTERNS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6]             // diags
];

function checkWinner(board) {
  for (let p of WIN_PATTERNS) {
    if (board[p[0]] && board[p[0]] === board[p[1]] && board[p[0]] === board[p[2]]) {
      return board[p[0]]; // 'X' or 'O'
    }
  }
  if (!board.includes(null)) return 'DRAW';
  return null;
}

module.exports = function(io) {
  io.on('connection', (socket) => {
    if (!socket.user) return;

    socket.on('game:join', () => {
      const idx = waitingQueue.findIndex(s => s.user.id === socket.user.id);
      if (idx > -1) waitingQueue.splice(idx, 1);

      if (waitingQueue.length > 0) {
        const opponent = waitingQueue.shift();
        const roomId = crypto.randomUUID();
        
        const game = {
          roomId,
          players: { 'X': opponent, 'O': socket },
          board: Array(9).fill(null),
          turn: 'X'
        };
        activeGames.set(roomId, game);

        opponent.join(roomId);
        socket.join(roomId);

        const playersInfo = {
          'X': { id: opponent.user.id, nickname: opponent.user.nickname || opponent.user.first_name || 'کاربر' },
          'O': { id: socket.user.id, nickname: socket.user.nickname || socket.user.first_name || 'کاربر' }
        };

        opponent.emit('game:start', { roomId, players: playersInfo, turn: 'X', yourSymbol: 'X' });
        socket.emit('game:start', { roomId, players: playersInfo, turn: 'X', yourSymbol: 'O' });
      } else {
        waitingQueue.push(socket);
        socket.emit('game:waiting', { message: 'در حال جستجوی حریف...' });
      }
    });

    socket.on('game:move', ({ roomId, index }) => {
      const game = activeGames.get(roomId);
      if (!game) return;

      const mySymbol = game.players['X'].user.id === socket.user.id ? 'X' : (game.players['O'].user.id === socket.user.id ? 'O' : null);
      if (!mySymbol || game.turn !== mySymbol) return; // Not my turn
      if (game.board[index] !== null) return; // Cell taken

      game.board[index] = mySymbol;
      
      const winner = checkWinner(game.board);
      if (winner) {
        io.to(roomId).emit('game:update', { board: game.board, turn: game.turn });
        io.to(roomId).emit('game:over', { winner });
        activeGames.delete(roomId);
        game.players['X'].leave(roomId);
        game.players['O'].leave(roomId);
      } else {
        game.turn = game.turn === 'X' ? 'O' : 'X';
        io.to(roomId).emit('game:update', { board: game.board, turn: game.turn });
      }
    });

    socket.on('game:leave', ({ roomId }) => {
      const game = activeGames.get(roomId);
      if (game) {
        io.to(roomId).emit('game:over', { winner: 'DISCONNECT' });
        activeGames.delete(roomId);
        game.players['X'].leave(roomId);
        game.players['O'].leave(roomId);
      }
      const idx = waitingQueue.findIndex(s => s.user.id === socket.user.id);
      if (idx > -1) waitingQueue.splice(idx, 1);
    });

    socket.on('disconnect', () => {
      const idx = waitingQueue.findIndex(s => s.user.id === socket.user.id);
      if (idx > -1) waitingQueue.splice(idx, 1);

      for (let [roomId, game] of activeGames.entries()) {
        if (game.players['X'].user.id === socket.user.id || game.players['O'].user.id === socket.user.id) {
          io.to(roomId).emit('game:over', { winner: 'DISCONNECT' });
          activeGames.delete(roomId);
          game.players['X'].leave(roomId);
          game.players['O'].leave(roomId);
        }
      }
    });
  });
};
