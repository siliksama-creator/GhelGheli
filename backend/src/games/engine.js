// Generic turn-based multiplayer engine (matchmaking + rooms + bot).
//
// Every board game shares the exact same lifecycle: queue up, pair with a
// human (or fall back to a bot), take turns, detect the end. Only the RULES
// differ. So that logic lives here once, and each game contributes a small
// pure-rules module (see ./rules/*.js) instead of duplicating socket
// plumbing — which is what kept tictactoe.js from growing into a monolith.
const crypto = require('crypto');

const BOT_WAIT_MS = 10_000; // how long to look for a human before using a bot
const BOT_MOVE_MS = 650;    // small delay so the bot feels like it "thinks"

const queues = new Map(); // gameId -> [socket]
const rooms = new Map();  // roomId -> room

const nameOf = u => u.nickname || u.first_name || 'کاربر';
const infoOf = u => ({ id: u.id, nickname: nameOf(u) });

function queueFor(gameId) {
  if (!queues.has(gameId)) queues.set(gameId, []);
  return queues.get(gameId);
}

function dropFromQueue(socket, gameId) {
  for (const [gid, q] of queues.entries()) {
    if (gameId && gid !== gameId) continue;
    const i = q.findIndex(s => s.user?.id === socket.user?.id);
    if (i > -1) q.splice(i, 1);
  }
  clearTimeout(socket.botTimeout);
}

function roomOfSocket(socket) {
  for (const [id, r] of rooms.entries()) {
    if (r.seats.X === socket || r.seats.O === socket) return id;
  }
  return null;
}

// Snapshot sent to the client. `decorate` lets a game expose per-player hints
// (e.g. Reversi's legal squares) without the engine knowing the rules.
function snapshot(room, symbol) {
  const s = room.rules.decorate
    ? room.rules.decorate(room.state, symbol)
    : room.state;
  return { ...s, turn: room.turn };
}

function emitState(room, event, extra = {}) {
  for (const sym of ['X', 'O']) {
    const sock = room.seats[sym];
    if (sock && sock.emit) {
      sock.emit(event, { state: snapshot(room, sym), turn: room.turn, ...extra });
    }
  }
}

function finish(room, winner) {
  if (room.done) return;
  room.done = true;
  clearTimeout(room.botTimer);
  emitState(room, 'game:over', { winner });
  for (const sym of ['X', 'O']) {
    const s = room.seats[sym];
    if (s && s.leave) s.leave(room.id);
  }
  rooms.delete(room.id);
}

function scheduleBot(room) {
  if (!room.vsBot || room.done || room.turn !== 'O') return;
  clearTimeout(room.botTimer);
  room.botTimer = setTimeout(() => {
    if (room.done || room.turn !== 'O') return;
    try {
      const move = room.rules.botMove(room.state, 'O');
      if (move === null || move === undefined) return advance(room, null);
      room.rules.applyMove(room.state, move, 'O');
      advance(room, move);
    } catch (e) {
      console.error(`[games:${room.gameId}] bot failed`, e);
    }
  }, BOT_MOVE_MS);
}

// Shared post-move step: check for a result, hand over the turn (games like
// Reversi may skip a blocked player), then let the bot reply.
function advance(room, lastMove) {
  const decided = room.rules.result(room.state);
  if (decided) return finish(room, decided);

  const next = room.rules.nextTurn(room.state, room.turn);
  if (!next) {
    const final = room.rules.finalResult
      ? room.rules.finalResult(room.state)
      : 'DRAW';
    return finish(room, final);
  }

  room.turn = next;
  emitState(room, 'game:update', { lastMove });
  scheduleBot(room);
}

function startRoom(io, rules, gameId, a, b) {
  const id = crypto.randomUUID();
  const vsBot = !b;
  const room = {
    id, gameId, rules, vsBot, done: false,
    state: rules.create(),
    turn: 'X',
    seats: { X: a, O: b || 'BOT' },
  };
  rooms.set(id, room);
  a.join(id);
  if (b) b.join(id);

  const players = {
    X: infoOf(a.user),
    O: b ? infoOf(b.user) : { id: 'bot', nickname: 'ربات هوشمند 🤖' },
  };
  for (const sym of ['X', 'O']) {
    const sock = room.seats[sym];
    if (sock && sock.emit) {
      sock.emit('game:start', {
        roomId: id, gameId, players, turn: 'X',
        yourSymbol: sym, vsBot, state: snapshot(room, sym),
      });
    }
  }
  return room;
}

module.exports = function attachGames(io, rulesById) {
  io.on('connection', socket => {
    if (!socket.user) return;

    socket.on('game:join', payload => {
      const gameId = (payload && typeof payload === 'object' && payload.gameId) || 'tictactoe';
      const rules = rulesById[gameId];
      if (!rules) return socket.emit('game:error', { message: 'این بازی در دسترس نیست' });

      dropFromQueue(socket); // never sit in two queues at once
      const q = queueFor(gameId);
      const opponent = q.shift();

      if (opponent && opponent.connected && opponent.user.id !== socket.user.id) {
        clearTimeout(opponent.botTimeout);
        startRoom(io, rules, gameId, opponent, socket);
        return;
      }

      q.push(socket);
      socket.emit('game:waiting', { gameId, message: 'در حال جستجوی حریف...' });
      socket.botTimeout = setTimeout(() => {
        const i = q.findIndex(s => s.user?.id === socket.user?.id);
        if (i === -1) return;
        q.splice(i, 1);
        startRoom(io, rules, gameId, socket, null);
      }, BOT_WAIT_MS);
    });

    socket.on('game:move', payload => {
      // Defensive: a malformed payload must never throw inside a socket
      // handler — an uncaught throw here takes the whole API process down.
      if (!payload || typeof payload !== 'object') return;
      const room = rooms.get(payload.roomId) || rooms.get(roomOfSocket(socket));
      if (!room || room.done) return;

      const sym = room.seats.X === socket ? 'X' : (room.seats.O === socket ? 'O' : null);
      if (!sym || room.turn !== sym) return;

      const move = Number(payload.move);
      if (!Number.isInteger(move)) return;
      if (!room.rules.isValidMove(room.state, move, sym)) return;

      room.rules.applyMove(room.state, move, sym);
      advance(room, move);
    });

    socket.on('game:leave', payload => {
      const roomId = (payload && typeof payload === 'object' && payload.roomId) || roomOfSocket(socket);
      const room = rooms.get(roomId);
      if (room) finish(room, 'DISCONNECT');
      dropFromQueue(socket);
    });

    socket.on('disconnect', () => {
      dropFromQueue(socket);
      const room = rooms.get(roomOfSocket(socket));
      if (room) finish(room, 'DISCONNECT');
    });
  });
};
