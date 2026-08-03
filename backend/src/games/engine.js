// Generic turn-based multiplayer engine (matchmaking + rooms + bot).
//
// Every board game shares the exact same lifecycle: queue up, pair with a
// human (or fall back to a bot), take turns, detect the end. Only the RULES
// differ. So that logic lives here once, and each game contributes a small
// pure-rules module (see ./rules/*.js) instead of duplicating socket
// plumbing — which is what keeps each game's file small and focused.
const crypto = require('crypto');

// Loaded lazily AND defensively: the pure game logic (and its dependency-free
// tests) must never fail just because the database layer isn't installed.
function rewardService() {
  try {
    return require('../services/gameRewardService');
  } catch {
    return null;
  }
}

// How long we hunt for a REAL opponent before falling back to the bot. The
// client shows this as a visible countdown so waiting feels intentional
// rather than broken.
const MATCH_WAIT_MS = 15_000;
const BOT_MOVE_MS = 650;    // small delay so the bot feels like it "thinks"
// Per-turn time limit, enforced HERE (not on the client) so a tampered or
// frozen client can't stall the game forever. Each game overrides this with
// its own `turnMs` — a Reversi board needs more thinking time than a 3x3
// grid, and one global value made the bigger games feel rushed.
const DEFAULT_TURN_MS = 20_000;
// How often we ping a player parked in an open-ended (bot-less) queue.
// Short enough to keep a carrier NAT mapping alive, long enough to be free.
const QUEUE_PING_MS = 25_000;
const turnMsFor = rules => Number(rules.turnMs) || DEFAULT_TURN_MS;

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
  // The open-ended queue keep-alive must die with the queue entry, otherwise
  // it fires forever against a socket that has left — a slow leak that only
  // shows up after days of uptime.
  if (socket.queuePing) {
    clearInterval(socket.queuePing);
    socket.queuePing = null;
  }
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

// Emitting to a socket that died without firing 'disconnect' throws. That
// exception used to escape through advance() — including from the turn-clock
// TIMER, where an uncaught throw takes the whole API process down and drops
// every other player's game. Each emit is now isolated.
function safeEmit(sock, event, payload, room) {
  try {
    sock.emit(event, payload);
    return true;
  } catch (e) {
    console.error(`[games:${room?.gameId}] emit '${event}' failed:`, e.message);
    return false;
  }
}

function emitState(room, event, extra = {}) {
  // A seat whose socket is gone means the match cannot continue; end it once
  // rather than retrying every turn forever (which spammed the logs and left
  // the surviving player staring at a board nobody was answering).
  let lost = null;
  for (const sym of ['X', 'O']) {
    const sock = room.seats[sym];
    if (sock && sock.emit) {
      const ok = safeEmit(sock, event, {
        state: snapshot(room, sym),
        turn: room.turn,
        turnMs: room.turnMs,
        deadline: room.deadline || null,
        // CLOCK-SKEW FIX: never make the client subtract our timestamp from
        // its own Date.now(). Phones with a wrong clock produced a garbage
        // difference that clamped to the max, freezing the countdown. This
        // is a plain "you have N ms left from the moment you receive this".
        remainingMs: room.deadline ? Math.max(0, room.deadline - Date.now()) : null,
        ...extra,
      }, room);
      if (!ok) lost = sym;
    }
  }
  if (lost && !room.done && event !== 'game:over') {
    // Tell whoever is still there, then close the room.
    finish(room, 'DISCONNECT');
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
  room.deadline = Date.now() + room.turnMs;
  room.turnTimer = setTimeout(() => {
    try {
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
    } catch (e) {
      // Never let a timer callback throw: it would be an uncaught exception
      // and would take the whole API process down.
      console.error(`[games:${room.gameId}] turn timer failed:`, e.message);
    }
  }, room.turnMs);
}

function finish(room, winner) {
  if (room.done) return;
  room.done = true;
  clearTimeout(room.botTimer);
  clearTimeout(room.turnTimer);

  // Award points for a completed ONLINE match, then tell both players what
  // they earned. Fire-and-forget with its own catch: a scoring hiccup must
  // never stop the game from ending cleanly.
  const rewards = rewardService();
  const scoring = rewards
    ? rewards.recordMatch({
        gameId: room.gameId,
        vsBot: room.vsBot,
        winner,
        players: room.players,
      })
    : Promise.resolve([]);
  scoring
    .then(applied => {
      if (!applied.length) return;
      for (const sym of ['X', 'O']) {
        const sock = room.seats[sym];
        const info = room.players?.[sym];
        if (!sock || !sock.emit || !info) continue;
        const mine = applied.find(a => a.userId === info.id);
        if (mine) safeEmit(sock, 'game:points', mine, room);
      }
    })
    .catch(e => console.error(`[games:${room.gameId}] reward failed:`, e.message));

  // ── XP گذر نبرد ────────────────────────────────────────────────────
  //
  // هر بازیکنِ واقعی (نه ربات) بابت انجام بازی XP می‌گیرد، و برنده
  // اضافه‌تر. سقف روزانهٔ هر منبع در passService جلوی «فارم کردن» با
  // بازیِ پشت‌سرهم مقابل ربات را می‌گیرد.
  //
  // require داخل تابع، نه بالای فایل: موتور بازی‌ها عمداً از سرویس‌های
  // اپ مستقل نگه داشته شده و یک import بالادستی این استقلال را
  // می‌شکند. خطا هم بلعیده می‌شود — گذر نبرد نباید پایان بازی را خراب
  // کند.
  try {
    const pass = require('../services/passService');
    for (const sym of ['X', 'O']) {
      const info = room.players?.[sym];
      if (!info?.id || info.isBot) continue;
      pass.grantXp(info.id, 'game_play').catch(() => {});
      if (winner === sym) pass.grantXp(info.id, 'game_win').catch(() => {});
    }
  } catch (e) {
    console.error('[games] pass xp failed:', e.message);
  }

  emitState(room, 'game:over', { winner });
  for (const sym of ['X', 'O']) {
    const s = room.seats[sym];
    if (s && s.leave) {
      try { s.leave(room.id); } catch { /* socket already gone */ }
    }
  }
  rooms.delete(room.id);
}

function scheduleBot(room) {
  if (!room.vsBot || room.done || room.turn !== 'O') return;
  clearTimeout(room.botTimer);
  room.botTimer = setTimeout(() => {
    try {
      if (room.done || room.turn !== 'O') return;
      const move = room.rules.botMove(room.state, 'O');
      if (move === null || move === undefined) return advance(room, null);
      room.rules.applyMove(room.state, move, 'O');
      advance(room, move);
    } catch (e) {
      // Same reasoning as the turn timer: an escape here kills the process.
      console.error(`[games:${room.gameId}] bot move failed:`, e.message);
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
    turnMs: turnMsFor(rules),
    seats: { X: a, O: b || 'BOT' },
  };
  rooms.set(id, room);
  a.join(id);
  if (b) b.join(id);

  const players = {
    X: infoOf(a.user),
    O: b ? infoOf(b.user) : { id: 'bot', nickname: 'ربات هوشمند 🤖', isBot: true },
  };
  // Kept on the room so finish() can attribute points to the right accounts.
  room.players = players;
  armTurnClock(room);
  for (const sym of ['X', 'O']) {
    const sock = room.seats[sym];
    if (sock && sock.emit) {
      safeEmit(sock, 'game:start', {
        roomId: id, gameId, players, turn: 'X',
        yourSymbol: sym, vsBot, state: snapshot(room, sym),
        turnMs: room.turnMs, deadline: room.deadline,
        remainingMs: room.deadline ? Math.max(0, room.deadline - Date.now()) : null,
      }, room);
    }
  }
  return room;
}

module.exports = function attachGames(io, rulesById) {
  io.on('connection', socket => {
    if (!socket.user) return;

    socket.on('game:join', payload => {
      // Default to the first registered game. This used to say 'tictactoe',
      // which no longer exists — an older client that omitted gameId got a
      // silent "game unavailable" instead of a playable match.
      const gameId = (payload && typeof payload === 'object' && payload.gameId)
        || Object.keys(rulesById)[0];
      const rules = rulesById[gameId];
      if (!rules) return safeEmit(socket, 'game:error', { message: 'این بازی در دسترس نیست' });

      dropFromQueue(socket); // never sit in two queues at once
      // Abandon any room we're already in. Without this, tapping a different
      // game (or re-tapping "play") while a match is live left a GHOST ROOM:
      // the opponent kept staring at a board waiting for a player who had
      // already walked away, until they gave up or disconnected.
      const previous = rooms.get(roomOfSocket(socket));
      if (previous) finish(previous, 'DISCONNECT');

      const q = queueFor(gameId);
      // Discard queued sockets that have since gone away, otherwise a player
      // gets matched against a ghost and the game never starts.
      while (q.length && q[0] && q[0].connected === false) q.shift();
      const opponent = q.shift();

      if (opponent && opponent.connected && opponent.user.id !== socket.user.id) {
        clearTimeout(opponent.botTimeout);
        // The waiting player may have been parked in the open-ended queue.
        if (opponent.queuePing) {
          clearInterval(opponent.queuePing);
          opponent.queuePing = null;
        }
        startRoom(io, rules, gameId, opponent, socket);
        return;
      }

      q.push(socket);
      // Games flagged `noBot` (جفت‌یاب) never fall back to a computer
      // opponent. The player simply STAYS in the queue until a human shows
      // up — the client turns the countdown into an open invitation and
      // offers the solo time-attack mode instead. Silently starting a bot
      // match there made the whole "play a real person" promise a lie.
      const botAllowed = !rules.noBot;
      // Tell the client exactly how long the hunt lasts so it can render a
      // real countdown instead of an open-ended spinner.
      safeEmit(socket, 'game:waiting', {
        gameId,
        message: 'در حال جستجوی حریف واقعی...',
        waitMs: MATCH_WAIT_MS,
        deadline: Date.now() + MATCH_WAIT_MS,
        remainingMs: MATCH_WAIT_MS,
        // Drives the UI: with a bot the countdown means "then we start with
        // the bot", without one it means "then we suggest solo mode".
        botFallback: botAllowed,
        soloAvailable: Boolean(rules.solo),
      });
      socket.botTimeout = setTimeout(() => {
        try {
          const i = q.findIndex(s => s.user?.id === socket.user?.id);
          if (i === -1) return;
          if (!botAllowed) {
            // Stay queued; just let the client know the first window closed
            // so it can surface the solo option.
            safeEmit(socket, 'game:still-waiting', {
              gameId,
              soloAvailable: Boolean(rules.solo),
              message: 'هنوز حریفی پیدا نشده — می‌توانی منتظر بمانی یا تنها بازی کنی',
            });
            // KEEP-ALIVE FOR AN OPEN-ENDED QUEUE.
            // Without this the player sat in the queue in total silence.
            // Two things went wrong in practice:
            //   1. an idle websocket behind a mobile carrier NAT gets
            //      reaped after a few minutes, so the player was silently
            //      dropped from matchmaking while their screen still said
            //      "looking for an opponent" — forever;
            //   2. if the socket died without firing 'disconnect', the dead
            //      entry stayed in the queue and the next real player was
            //      paired with a ghost.
            // A periodic ping both keeps the connection warm and prunes the
            // queue when the emit fails.
            clearInterval(socket.queuePing);
            socket.queuePing = setInterval(() => {
              const stillQueued = q.findIndex(x => x.user?.id === socket.user?.id);
              if (stillQueued === -1 || socket.connected === false) {
                clearInterval(socket.queuePing);
                socket.queuePing = null;
                if (stillQueued > -1) q.splice(stillQueued, 1);
                return;
              }
              const alive = safeEmit(socket, 'game:still-waiting', {
                gameId,
                soloAvailable: Boolean(rules.solo),
                queued: q.length,
                message: 'هنوز در صف حریف واقعی هستی',
              });
              if (!alive) {
                // Emit failed => the socket is gone. Remove it so nobody is
                // matched against a corpse.
                q.splice(stillQueued, 1);
                clearInterval(socket.queuePing);
                socket.queuePing = null;
              }
            }, QUEUE_PING_MS);
            return;
          }
          q.splice(i, 1);
          startRoom(io, rules, gameId, socket, null);
        } catch (e) {
          console.error(`[games:${gameId}] bot fallback failed:`, e.message);
        }
      }, MATCH_WAIT_MS);
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
