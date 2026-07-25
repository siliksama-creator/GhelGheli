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
// Per-turn time limit. Enforced HERE (not on the client) so a tampered or
// frozen client can't stall the game forever for its opponent.
const TURN_MS = 15_000;

const queues = new Map(); // gameId -> [socket]
const rooms = new Map();  // roomId -> room

const nameOf = u => u.nickname || u.first_name || 'کاربر';
// Enough for the client to render an avatar + open the public profile sheet.
const infoOf = u => ({
  id: u.id,
  nickname: nameOf(u),
  profileImageUrl: u.profile_image_url || null,
  profileAvatarKey: u.profile_avatar_key || null,
  lifetimePoints: Number(u.lifetime_points || 0),
});

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
      sock.emit(event, {
        state: snapshot(room, sym),
        turn: room.turn,
        turnMs: TURN_MS,
        deadline: room.deadline || null,
        ...extra,
      });
    }
  }
}

// (Re)start the countdown for whoever is on move. A human who runs out of
// time forfeits the turn: we play a move for them (via the bot brain) so the
// game keeps flowing instead of hanging until someone disconnects.
function armTurnClock(room) {
  clearTimeout(room.turnTimer);
  if (room.done) return;
  // The bot moves on its own schedule; no clock needed for its seat.
  const seat = room.seats[room.turn];
  if (!seat || seat === 'BOT') { room.deadline = null; return; }
  room.deadline = Date.now() + TURN_MS;
  room.turnTimer = setTimeout(() => {
    if (room.done) return;
    const sym = room.turn;
    let move = null;
    try {
      move = room.rules.botMove(room.state, sym);
    } catch (e) {
      console.error(`[games:${room.gameId}] timeout autoplay failed`, e);
    }
    // Remember WHO ran out of time. The bot may answer within a few hundred
    // ms and that follow-up 'game:update' would otherwise overwrite the flag
    // before the player ever saw it, leaving a piece that appeared "by
    // itself" with no explanation. Cleared on that player's next real move.
    room.timedOut = sym;
    if (move === null || move === undefined) {
      // Nothing legal to play — just pass the turn along.
      return advance(room, null);
    }
    room.rules.applyMove(room.state, move, sym);
    advance(room, move);
  }, TURN_MS);
}

function finish(room, winner) {
  if (room.done) return;
  room.done = true;
  clearTimeout(room.botTimer);
  clearTimeout(room.turnTimer);
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
function advance(room, lastMove, extra = {}) {
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
  armTurnClock(room);
  emitState(room, 'game:update', {
    lastMove,
    timedOut: room.timedOut || null,
    ...extra,
  });
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
    O: b ? infoOf(b.user) : { id: 'bot', nickname: 'ربات هوشمند 🤖', isBot: true },
  };
  armTurnClock(room);
  for (const sym of ['X', 'O']) {
    const sock = room.seats[sym];
    if (sock && sock.emit) {
      sock.emit('game:start', {
        roomId: id, gameId, players, turn: 'X',
        yourSymbol: sym, vsBot, state: snapshot(room, sym),
        turnMs: TURN_MS, deadline: room.deadline,
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
      // Abandon any room we're already in. Without this, tapping a different
      // game (or re-tapping "play") while a match is live left a GHOST ROOM:
      // the opponent kept staring at a board waiting for a player who had
      // already walked away, until they gave up or disconnected.
      const previous = rooms.get(roomOfSocket(socket));
      if (previous) finish(previous, 'DISCONNECT');

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

      // A real move from this player clears their stale timeout notice.
      if (room.timedOut === sym) room.timedOut = null;
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
