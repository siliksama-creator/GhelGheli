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
  // ═══════════════════════════════════════════════════════════════════════
  // چرا لول همین‌جا و نه با یک درخواستِ جدا
  // ═══════════════════════════════════════════════════════════════════════
  //
  // درخواست مالک: «در حین بازی هم لول بقیه رو بشه دید».
  //
  // `u` همان ردیفِ کاربر است که موقع اتصالِ سوکت خوانده شده و
  // `game_xp` را دارد. محاسبهٔ لول یک جست‌وجوی دودویی روی یک آرایهٔ
  // ۱۰۱تایی است — ارزان‌تر از هر رفت‌وبرگشتِ شبکه.
  //
  // اگر کلاینت می‌خواست خودش لول را حساب کند، منحنی در دو جا تکرار
  // می‌شد و هر تنظیمی نیازمندِ انتشارِ نسخهٔ جدیدِ اپ بود.
  level: require('../services/levelService').levelFromXp(u.game_xp).level,
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
  // publicState اولویت دارد چون یک محافظ امنیتی است، نه یک زینت.
  //
  // در بازی‌های هم‌زمان (پنالتی) وضعیت شامل انتخابِ قفل‌نشدهٔ حریف است.
  // اگر خامش برود، دروازه‌بان می‌بیند زننده کجا شوت می‌کند و بازی برای
  // همیشه شکسته است. حذفش یک بار اینجا انجام می‌شود نه در چند نقطه.
  let s = room.rules.publicState
    ? room.rules.publicState(room.state, symbol)
    : room.state;
  if (room.rules.decorate) s = room.rules.decorate(s, symbol);
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
  const sim = !!room.rules.simultaneous;
  // The bot moves on its own schedule; no clock needed for its seat.
  // در حالت هم‌زمان، ساعت برای هر دو صندلی است چون هر دو باید انتخاب
  // کنند — پس فقط وقتی صرف‌نظر می‌کنیم که هر دو صندلی ربات باشند.
  const seat = room.seats[room.turn];
  if (!sim && (!seat || seat === 'BOT')) { room.deadline = null; return; }
  room.deadline = Date.now() + room.turnMs;
  room.turnTimer = setTimeout(() => {
    try {
    if (room.done) return;
    // در حالت هم‌زمان، هر بازیکن انسانی که هنوز انتخاب نکرده، خودکار
    // برایش انتخاب می‌شود — وگرنه یک نفر که گوشی‌اش را زمین گذاشته،
    // بازی را برای حریف قفل می‌کند.
    if (sim) {
      for (const s2 of ['X', 'O']) {
        const sk = room.seats[s2];
        if (!sk || sk === 'BOT') continue;
        let m = null;
        try { m = room.rules.botMove(room.state, s2); } catch { /* ignore */ }
        if (m && room.rules.isValidMove(room.state, m, s2)) {
          room.timedOut = s2;
          room.rules.applyMove(room.state, m, s2);
        }
      }
      return advance(room, null);
    }
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

  // ── پرداخت پات مسابقه استیک‌دار (۱۰۰ و ۱۰۰۰ امتیاز با کسر ۱۰٪ کارمزد) ──
  if (room.stake > 0 && !room.vsBot) {
    try {
      const { pool } = require('../config/db');
      if (winner === 'X' || winner === 'O' || winner === 'DISCONNECT') {
        const winningSym = (winner === 'DISCONNECT')
          ? (room.seats.X && room.seats.X.connected ? 'X' : 'O')
          : winner;
        const winnerUid = room.players?.[winningSym]?.id;
        if (winnerUid && winnerUid !== 'bot') {
          pool.query('UPDATE users SET current_points = current_points + $2, lifetime_points = lifetime_points + $2 WHERE id=$1', [winnerUid, room.netPot]).catch(() => {});
          const winSock = room.seats[winningSym];
          if (winSock) safeEmit(winSock, 'game:stake_win', { netPot: room.netPot, stake: room.stake });
        }
      } else if (winner === 'DRAW') {
        // بازگشت ۱۰۰٪ امتیاز ورودی به هر دو بازیکن در تساوی
        for (const s of ['X', 'O']) {
          const uid = room.players?.[s]?.id;
          if (uid && uid !== 'bot') {
            pool.query('UPDATE users SET current_points = current_points + $2 WHERE id=$1', [uid, room.stake]).catch(() => {});
          }
        }
      }
    } catch (_) {}
  }

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
    // همان الگوی تنبلِ بالا: بارگذاری داخل تابع، تا صرفِ import کردنِ
    // موتورِ بازی به دیتابیس وصل نشود.
    const level = require('../services/levelService');
    // ═══════════════════════════════════════════════════════════════════
    // بازی مقابل کامپیوتر هیچ XPای نمی‌دهد
    // ═══════════════════════════════════════════════════════════════════
    //
    // درخواست مالک: «بازی ها زمانی که آفلاین برگزار میشن نباید exp بدن
    // برای بتل پس».
    //
    // این فقط یک قانون دلبخواهی نیست، یک سوراخِ واقعی را می‌بندد: بازی
    // مقابل ربات فوری شروع می‌شود، حریف واقعی لازم ندارد، و می‌شود در
    // چند ثانیه تمامش کرد. بدون این شرط، کاربر می‌توانست ده‌ها بازیِ
    // بی‌معنی مقابل ربات را پشت سر هم ببازد و سقفِ روزانهٔ XP را پر کند
    // — بدون اینکه حتی یک بازیِ واقعی انجام دهد. گذر نبرد باید پاداشِ
    // **بازی کردن با آدم‌ها** باشد.
    //
    // `room.vsBot` را خودِ موتور موقع ساختن اتاق تعیین می‌کند (وقتی
    // حریف دوم پیدا نشود)، پس قابل جعل از سمت کلاینت نیست.
    if (!room.vsBot) {
      for (const sym of ['X', 'O']) {
        const info = room.players?.[sym];
        if (!info?.id || info.isBot) continue;
        pass.grantXp(info.id, 'game_play').catch(() => {});
        if (winner === sym) pass.grantXp(info.id, 'game_win').catch(() => {});

        // ═══════════════════════════════════════════════════════════════
        // XP لولِ دائمی — جدا از گذر نبرد
        // ═══════════════════════════════════════════════════════════════
        //
        // چرا دو سیستم و نه یکی: گذر نبرد فصلی است، سقفِ روزانه دارد،
        // و از منابعِ غیربازی هم تغذیه می‌شود. لول باید «مجموعِ همهٔ
        // بازی‌های آنلاین» را نشان دهد — دائمی و بدون سقف. توضیح کامل
        // در services/levelService.js.
        //
        // داخل همین شرطِ `!room.vsBot` است، پس همان قانون را به ارث
        // می‌برد: بازی مقابل ربات هیچ XPی نمی‌دهد.
        const other = room.players?.[sym === 'X' ? 'O' : 'X'];
        level
          .grantGameXp(info.id, {
            gameId: room.gameId,
            won: winner === sym,
            opponentId: other?.isBot ? null : other?.id,
          })
          .catch(() => {});
      }
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
  // در بازی هم‌زمان، ربات همیشه باید انتخاب کند — چه زننده باشد چه
  // دروازه‌بان. شرط `turn !== 'O'` آن را در نیمی از ضربه‌ها خاموش
  // می‌کرد و بازی مقابل کامپیوتر برای همیشه منتظر می‌ماند.
  const sim = !!room.rules.simultaneous;
  if (!room.vsBot || room.done || (!sim && room.turn !== 'O')) return;
  clearTimeout(room.botTimer);
  room.botTimer = setTimeout(() => {
    try {
      if (room.done || (!sim && room.turn !== 'O')) return;
      const move = room.rules.botMove(room.state, 'O');
      if (move === null || move === undefined) return advance(room, null);
      // اگر ربات قبلاً در همین ضربه انتخاب کرده، دوباره نفرست.
      if (!room.rules.isValidMove(room.state, move, 'O')) return;
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
    // ═══════════════════════════════════════════════════════════════════
    // چرا lastMove در بازی هم‌زمان حذف می‌شود
    // ═══════════════════════════════════════════════════════════════════
    //
    // publicState انتخابِ قفل‌نشدهٔ حریف را از `state` پاک می‌کند، ولی
    // موتور همان حرکت را جداگانه در `lastMove` هم برای **هر دو** بازیکن
    // می‌فرستاد. یعنی در پنالتی، لحظه‌ای که زننده شوتش را ثبت می‌کرد،
    // دروازه‌بان دقیقاً می‌دید `{zone: 7, power: 0.9}` — و همیشه مهار
    // می‌کرد. بازی از پایه شکسته بود.
    //
    // با تست یکپارچگی روی موتور واقعی پیدا شد، نه با تست واحد: فایل
    // قوانین کاملاً درست بود و تنها این مسیرِ جانبی نشت داشت.
    //
    // در بازی‌های نوبتی lastMove لازم است (حریف باید حرکت را ببیند) و
    // نشتی هم ندارد چون نوبت قبلاً تمام شده.
    lastMove: room.rules.simultaneous ? null : lastMove,
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
    O: b ? infoOf(b.user) : { id: 'bot', nickname: 'ربات هوشمند', isBot: true },
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

const attachGames = function attachGames(io, rulesById) {
  io.on('connection', socket => {
    if (!socket.user) return;

    
    // ── چالش ۱ به ۱ مستقیم با لینک / کد اتاق ──
    socket.on('game:create_room', payload => {
      const gameId = (payload && typeof payload === 'object' && payload.gameId) || Object.keys(rulesById)[0];
      const rules = rulesById[gameId];
      if (!rules) return safeEmit(socket, 'game:error', { message: 'بازی یافت نشد' });
      dropFromQueue(socket);
      const code = Math.random().toString(36).substring(2, 6).toUpperCase();
      const roomId = `room-${code}`;
      socket.privateRoomCode = code;
      socket.privateGameId = gameId;
      socket.join(roomId);
      safeEmit(socket, 'game:room_created', {
        roomCode: code,
        gameId,
        shareUrl: `https://user.ghelghelishop.ir/?game=${gameId}&room=${code}`,
        message: 'اتاق ساخته شد — کد یا لینک را برای دوستت بفرست',
      });
    });

    socket.on('game:join_room', payload => {
      const code = String(payload?.roomCode || '').trim().toUpperCase();
      if (!code) return safeEmit(socket, 'game:error', { message: 'کد اتاق را وارد کنید' });
      const roomId = `room-${code}`;
      const roomSockets = io.sockets.adapter.rooms.get(roomId);
      if (!roomSockets || roomSockets.size === 0) {
        return safeEmit(socket, 'game:error', { message: 'اتاقی با این کد یافت نشد یا منقضی شده است' });
      }
      const hostSocketId = Array.from(roomSockets)[0];
      const hostSocket = io.sockets.sockets.get(hostSocketId);
      if (!hostSocket || hostSocket.id === socket.id) {
        return safeEmit(socket, 'game:error', { message: 'نمی‌توانی به اتاق خودت متصل شوی' });
      }
      const gameId = hostSocket.privateGameId || Object.keys(rulesById)[0];
      const rules = rulesById[gameId];
      dropFromQueue(hostSocket);
      dropFromQueue(socket);
      startRoom(io, rules, gameId, hostSocket, socket);
    });

    socket.on('game:join', payload => {
      const gameId = (payload && typeof payload === 'object' && payload.gameId)
        || Object.keys(rulesById)[0];
      const rules = rulesById[gameId];
      if (!rules) return safeEmit(socket, 'game:error', { message: 'این بازی در دسترس نیست' });

      dropFromQueue(socket);
      const previous = rooms.get(roomOfSocket(socket));
      if (previous) finish(previous, 'DISCONNECT');

      const stake = Number(payload?.stake || 0);
      const wantBot = (payload && typeof payload === 'object' && (payload.vsBot === true || stake === 0 && payload.mode === 'bot'));
      if (wantBot) {
        startRoom(io, rules, gameId, socket, null, 0);
        return;
      }

      const qKey = stake > 0 ? `${gameId}:${stake}` : gameId;
      const q = queueFor(qKey);
      while (q.length && q[0] && q[0].connected === false) q.shift();
      const opponent = q.shift();

      if (opponent && opponent.connected && opponent.user.id !== socket.user.id) {
        clearTimeout(opponent.botTimeout);
        if (opponent.queuePing) {
          clearInterval(opponent.queuePing);
          opponent.queuePing = null;
        }
        startRoom(io, rules, gameId, opponent, socket, stake);
        return;
      }

      q.push(socket);
      const isStaked = stake > 0;
      const waitTime = isStaked ? 30_000 : 15_000;
      const botAllowed = !isStaked && !rules.noBot;

      safeEmit(socket, 'game:waiting', {
        gameId,
        stake,
        message: isStaked ? `در حال جستجوی حریف آنلاین برای مسابقه ${stake} امتیازی (۳۰ ثانیه)...` : 'در حال جستجوی حریف واقعی...',
        waitMs: waitTime,
        deadline: Date.now() + waitTime,
        remainingMs: waitTime,
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
      }, waitTime);
    });

    socket.on('game:play_bot', payload => {
      const gameId = (payload && typeof payload === 'object' && payload.gameId)
        || (typeof payload === 'string' ? payload : null)
        || Object.keys(rulesById)[0];
      const rules = rulesById[gameId];
      if (!rules) return safeEmit(socket, 'game:error', { message: 'این بازی در دسترس نیست' });
      dropFromQueue(socket);
      const previous = rooms.get(roomOfSocket(socket));
      if (previous) finish(previous, 'DISCONNECT');
      startRoom(io, rules, gameId, socket, null);
    });

    socket.on('game:move', payload => {
      // Defensive: a malformed payload must never throw inside a socket
      // handler — an uncaught throw here takes the whole API process down.
      if (!payload || typeof payload !== 'object') return;
      const room = rooms.get(payload.roomId) || rooms.get(roomOfSocket(socket));
      if (!room || room.done) return;

      const sym = room.seats.X === socket ? 'X' : (room.seats.O === socket ? 'O' : null);
      // بازی هم‌زمان: هر دو بازیکن در یک لحظه انتخاب می‌کنند، پس شرطِ
      // «نوبت تو نیست» آن را کاملاً قفل می‌کرد. خودِ فایل قوانین با
      // isValidMove جلوی انتخاب دوباره را می‌گیرد.
      if (!sym) return;
      if (!room.rules.simultaneous && room.turn !== sym) return;

      // حرکت می‌تواند عدد باشد (تخته‌ای) یا شیء (پنالتی: ناحیه + قدرت).
      // Number() روی شیء NaN می‌دهد و حرکت را بی‌صدا می‌انداخت.
      const raw = payload.move;
      let move;
      if (raw !== null && typeof raw === 'object') {
        move = raw;
      } else {
        move = Number(raw);
        if (!Number.isInteger(move)) return;
      }
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

attachGames.rooms = rooms;
module.exports = attachGames;
