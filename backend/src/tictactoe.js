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
      if (idx > -1) {
        clearTimeout(socket.botTimeout);
        waitingQueue.splice(idx, 1);
      }

      if (waitingQueue.length > 0) {
        const opponent = waitingQueue.shift();
        clearTimeout(opponent.botTimeout);
        
        const roomId = crypto.randomUUID();
        const game = {
          roomId,
          players: { 'X': opponent, 'O': socket },
          board: Array(9).fill(null),
          turn: 'X',
          isBot: false
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

        // شروع بازی با ربات در صورت نیافتن حریف تا 10 ثانیه
        socket.botTimeout = setTimeout(() => {
          const qIdx = waitingQueue.findIndex(s => s.user.id === socket.user.id);
          if (qIdx > -1) {
            waitingQueue.splice(qIdx, 1); // خروج از صف
            
            const roomId = crypto.randomUUID();
            const game = {
              roomId,
              players: { 'X': socket, 'O': 'BOT' },
              board: Array(9).fill(null),
              turn: 'X',
              isBot: true
            };
            activeGames.set(roomId, game);
            socket.join(roomId);

            socket.emit('game:start', {
              roomId,
              players: {
                'X': { id: socket.user.id, nickname: socket.user.nickname || socket.user.first_name || 'کاربر' },
                'O': { id: 'bot', nickname: 'ربات هوشمند 🤖' }
              },
              turn: 'X',
              yourSymbol: 'X'
            });
          }
        }, 10000);
      }
    });

    function makeBotMove(roomId) {
      const game = activeGames.get(roomId);
      if (!game || !game.isBot || game.turn !== 'O') return;

      // منطق ساده ربات: اگه می‌تونه ببره، ببره. اگه کاربر می‌تونه ببره، راهشو ببنده. وگرنه رندوم
      let move = -1;
      const empty = [];
      game.board.forEach((c, i) => { if (!c) empty.push(i); });
      
      if (empty.length > 0) {
        // تلاش برای برد
        for(let i of empty) {
          game.board[i] = 'O';
          if(checkWinner(game.board) === 'O') { move = i; break; }
          game.board[i] = null;
        }
        // تلاش برای دفاع
        if(move === -1) {
          for(let i of empty) {
            game.board[i] = 'X';
            if(checkWinner(game.board) === 'X') { move = i; game.board[i] = null; break; }
            game.board[i] = null;
          }
        }
        // گرفتن مرکز در صورت خالی بودن
        if(move === -1 && game.board[4] === null) move = 4;
        // حرکت رندوم
        if(move === -1) move = empty[Math.floor(Math.random() * empty.length)];

        game.board[move] = 'O';
        const winner = checkWinner(game.board);
        if (winner) {
          io.to(roomId).emit('game:update', { board: game.board, turn: 'O' });
          io.to(roomId).emit('game:over', { winner });
          activeGames.delete(roomId);
          if (game.players['X'] && game.players['X'].leave) game.players['X'].leave(roomId);
        } else {
          game.turn = 'X';
          io.to(roomId).emit('game:update', { board: game.board, turn: 'X' });
        }
      }
    }

    socket.on('game:move', ({ roomId, index }) => {
      const game = activeGames.get(roomId);
      if (!game) return;

      const mySymbol = game.players['X'] === socket ? 'X' : (game.players['O'] === socket ? 'O' : null);
      if (!mySymbol || game.turn !== mySymbol) return; // نوبت این بازیکن نیست
      if (game.board[index] !== null) return; // خانه پر است

      game.board[index] = mySymbol;
      
      const winner = checkWinner(game.board);
      if (winner) {
        io.to(roomId).emit('game:update', { board: game.board, turn: game.turn });
        io.to(roomId).emit('game:over', { winner });
        activeGames.delete(roomId);
        if(game.players['X'] && game.players['X'].leave) game.players['X'].leave(roomId);
        if(!game.isBot && game.players['O'] && game.players['O'].leave) game.players['O'].leave(roomId);
      } else {
        game.turn = game.turn === 'X' ? 'O' : 'X';
        io.to(roomId).emit('game:update', { board: game.board, turn: game.turn });
        
        // حرکت ربات
        if (game.isBot && game.turn === 'O') {
          setTimeout(() => makeBotMove(roomId), 700);
        }
      }
    });

    socket.on('game:leave', ({ roomId }) => {
      const game = activeGames.get(roomId);
      if (game) {
        io.to(roomId).emit('game:over', { winner: 'DISCONNECT' });
        activeGames.delete(roomId);
        if(game.players['X'] && game.players['X'].leave) game.players['X'].leave(roomId);
        if(!game.isBot && game.players['O'] && game.players['O'].leave) game.players['O'].leave(roomId);
      }
      const idx = waitingQueue.findIndex(s => s.user.id === socket.user.id);
      if (idx > -1) {
        clearTimeout(socket.botTimeout);
        waitingQueue.splice(idx, 1);
      }
    });

    socket.on('disconnect', () => {
      const idx = waitingQueue.findIndex(s => s.user.id === socket.user.id);
      if (idx > -1) {
        clearTimeout(socket.botTimeout);
        waitingQueue.splice(idx, 1);
      }

      for (let [roomId, game] of activeGames.entries()) {
        if (game.players['X'] === socket || game.players['O'] === socket) {
          io.to(roomId).emit('game:over', { winner: 'DISCONNECT' });
          activeGames.delete(roomId);
          if(game.players['X'] && game.players['X'].leave) game.players['X'].leave(roomId);
          if(!game.isBot && game.players['O'] && game.players['O'].leave) game.players['O'].leave(roomId);
        }
      }
    });
  });
};
