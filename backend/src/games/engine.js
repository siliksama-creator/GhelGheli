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

// جدا نگه داشتنِ سرویس مالی از قوانین خالص بازی باعث می‌شود testهای منطق
// بدون PostgreSQL اجرا شوند. در production، هر بازی stakeدار بدون این سرویس
// fail-closed است: اتاقی ساخته نمی‌شود و هیچ راهِ fallback به «بازی کن، بعداً
// حساب می‌کنیم» وجود ندارد.
function stakeService() {
  try {
    return require('../services/gameStakeService');
  } catch (e) {
    console.error('[games:stake] service unavailable:', e.message);
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
const lobbies = new Map(); // lobbyId -> {host, gameId, stake, createdAt}

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
    finish(room, 'DISCONNECT', lost);
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

function finish(room, winner, disconnectedSym = null) {
  if (room.done) return;
  room.done = true;
  clearTimeout(room.botTimer);
  clearTimeout(room.turnTimer);

  const resolvedWinner = winner === 'DISCONNECT'
    ? (disconnectedSym === 'X' ? 'O'
      : disconnectedSym === 'O' ? 'X'
        : (room.seats.X && room.seats.X.connected ? 'X' : 'O'))
    : winner;

  // Game-specific history is non-financial and must never block settlement
  // or game:over. Card duel uses this hook to persist the three revealed
  // rounds while the generic engine remains unaware of card rules.
  if (room.rules.onFinish) {
    Promise.resolve(room.rules.onFinish({
      players: room.players,
      state: room.state,
      winner: resolvedWinner,
      stake: room.stake,
      netPot: room.netPot,
      commission: room.commission,
      vsBot: room.vsBot,
      matchMode: room.matchMode,
    })).catch(e => console.error(`[games:${room.gameId}] history failed:`, e.message));
  }

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

  // ── تسویهٔ escrow مسابقهٔ امتیازی ────────────────────────────────
  // stake هر دو بازیکن پیش از game:start و داخل یک transaction کم شده است.
  // اینجا فقط سند reserved همان room تسویه می‌شود؛ قفل دیتابیس و قیدهای
  // یکتا اجازه نمی‌دهند finish تکراری یا reconnect دوباره پرداخت کند.
  if (room.stake > 0 && !room.vsBot) {
    const stakes = stakeService();
    if (!stakes) {
      console.error(`[games:${room.gameId}] stake settlement unavailable for ${room.id}`);
    } else {
      const winnerSym = resolvedWinner;
      const draw = resolvedWinner === 'DRAW';
      const winnerUserId = draw ? null : room.players?.[winnerSym]?.id;
      stakes.settleMatch({ matchId: room.id, winnerUserId, draw })
        .then(result => {
          if (result.duplicate) return;
          if (draw) {
            for (const sym of ['X', 'O']) {
              const sock = room.seats[sym];
              if (sock?.emit) safeEmit(sock, 'game:stake_refund', {
                stake: room.stake,
                message: 'مسابقه مساوی شد؛ ورودی کامل برگشت.',
              }, room);
            }
          } else {
            const winSock = room.seats[winnerSym];
            if (winSock?.emit) safeEmit(winSock, 'game:stake_win', {
              netPot: result.netPot,
              stake: result.stake,
              commission: result.commission,
            }, room);
          }
        })
        .catch(e => {
          // امتیازها در escrow می‌مانند و recovery ساعتی آن‌ها را برمی‌گرداند؛
          // هرگز با UPDATE دستی از این catch پول/امتیاز ساخته نمی‌شود.
          console.error(`[games:${room.gameId}] stake settlement failed:`, e.message);
          for (const sym of ['X', 'O']) {
            const sock = room.seats[sym];
            if (sock?.emit) safeEmit(sock, 'game:stake_pending', {
              message: 'تسویه در حال بررسی است؛ امتیاز ورودی محفوظ می‌ماند.',
            }, room);
          }
        });
    }
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
    if (!room.vsBot && room.stake > 0) {
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

async function startRoom(io, rules, gameId, a, b, stake, matchMode = null) {
  const s = Number(stake) || 0;
  const id = crypto.randomUUID();
  const vsBot = !b;

  // Personalized games (currently card duel) validate and snapshot both
  // decks BEFORE reserving stake. If a deck is invalid, no points have moved.
  // Existing pure board rules continue to use their zero-argument create().
  const initialState = rules.createWithContext
    ? await rules.createWithContext({
      playerX: a.user,
      playerO: b?.user || null,
      vsBot,
      stake: s,
      matchMode,
    })
    : rules.create();

  // بازی با ربات همیشه رایگان است. برای بازی انسان‌باانسانِ امتیازی،
  // game:start فقط بعد از COMMIT رزرو هر دو ورودی صادر می‌شود.
  let reservation = null;
  if (s > 0) {
    if (vsBot) throw new Error('بازی با ربات ورودی امتیازی ندارد');
    const stakes = stakeService();
    if (!stakes) throw new Error('سرویس امن مسابقه موقتاً در دسترس نیست');
    reservation = await stakes.reserveMatch({
      matchId: id,
      gameId,
      stake: s,
      playerXId: a.user.id,
      playerOId: b.user.id,
    });
    // snapshot اتصال باید موجودیِ بعد از رزرو را بداند؛ وگرنه هدر کلاینت
    // تا refresh عدد قدیمی نشان می‌دهد.
    if (reservation.balances[a.user.id] !== undefined) {
      a.user.current_points = reservation.balances[a.user.id];
    }
    if (reservation.balances[b.user.id] !== undefined) {
      b.user.current_points = reservation.balances[b.user.id];
    }
  }

  const room = {
    id, gameId, rules, vsBot, done: false,
    state: initialState,
    matchMode: matchMode || (vsBot ? 'bot' : 'online'),
    turn: 'X',
    turnMs: turnMsFor(rules),
    seats: { X: a, O: b || 'BOT' },
    stake: s,
    netPot: reservation?.netPot || 0,
    commission: reservation?.commission || 0,
  };
  rooms.set(id, room);
  a.join(id);
  if (b) b.join(id);

  const players = {
    X: infoOf(a.user),
    O: b ? infoOf(b.user) : { id: 'bot', nickname: 'ربات هوشمند', isBot: true },
  };
  room.players = players;
  armTurnClock(room);
  for (const sym of ['X', 'O']) {
    const sock = room.seats[sym];
    if (sock && sock.emit) {
      safeEmit(sock, 'game:start', {
        roomId: id, gameId, players, turn: 'X',
        yourSymbol: sym, vsBot, matchMode: room.matchMode,
        state: snapshot(room, sym),
        turnMs: room.turnMs, deadline: room.deadline,
        remainingMs: room.deadline ? Math.max(0, room.deadline - Date.now()) : null,
        stake: room.stake,
        netPot: room.netPot,
        commission: room.commission,
      }, room);
    }
  }
  return room;
}

async function ensurePlayerReady(rules, socket, context = {}) {
  if (!rules?.validatePlayer) return true;
  await rules.validatePlayer(socket?.user, context);
  return true;
}

async function startRoomOrError(io, rules, gameId, a, b, stake, matchMode = null) {
  try {
    return await startRoom(io, rules, gameId, a, b, stake, matchMode);
  } catch (e) {
    const message = e?.message || 'شروع مسابقه ناموفق بود';
    safeEmit(a, 'game:error', { message });
    if (b?.emit) safeEmit(b, 'game:error', { message });
    return null;
  }
}

const attachGames = function attachGames(io, rulesById) {
  io.on('connection', socket => {
    if (!socket.user) return;

    
    // ── چالش ۱ به ۱ مستقیم با لینک / کد اتاق ──
    socket.on('game:create_room', async payload => {
      const gameId = (payload && typeof payload === 'object' && payload.gameId) || Object.keys(rulesById)[0];
      const rules = rulesById[gameId];
      if (!rules) return safeEmit(socket, 'game:error', { message: 'بازی یافت نشد' });
      try {
        if (rules.validatePlayer) await ensurePlayerReady(rules, socket);
      } catch (e) {
        return safeEmit(socket, 'game:error', { message: e.message || 'ترکیب بازی آماده نیست' });
      }
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

    socket.on('game:join_room', async payload => {
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
      try {
        if (rules.validatePlayer) await ensurePlayerReady(rules, socket);
      } catch (e) {
        return safeEmit(socket, 'game:error', { message: e.message || 'ترکیب بازی آماده نیست' });
      }
      dropFromQueue(hostSocket);
      dropFromQueue(socket);
      await startRoomOrError(io, rules, gameId, hostSocket, socket, 0, 'lobby');
    });



    // -- LOBBY SYSTEM (WITH PASSWORD & STAKE UP TO 10,000) --
    socket.on('game:create_lobby', async payload => {
      const gameId = String(payload?.gameId || Object.keys(rulesById)[0]);
      const rules = rulesById[gameId];
      if (!rules) return safeEmit(socket, 'game:error', { message: 'بازی مورد نظر یافت نشد' });
      try {
        if (rules.validatePlayer) await ensurePlayerReady(rules, socket);
      } catch (e) {
        return safeEmit(socket, 'game:error', { message: e.message || 'ترکیب بازی آماده نیست' });
      }
      const stakes = stakeService();
      if (!stakes) return safeEmit(socket, 'game:error', { message: 'سرویس امن مسابقه در دسترس نیست' });
      let stake;
      try {
        stake = stakes.parseLobbyStake(payload?.stake);
        if (stake > 0) {
          const afford = await stakes.canAfford(socket.user.id, stake);
          if (!afford.ok) {
            return safeEmit(socket, 'game:error', {
              message: `برای ساخت این لابی حداقل ${stake} امتیاز لازم داری`,
              required: stake,
              balance: afford.balance,
            });
          }
        }
      } catch (e) {
        return safeEmit(socket, 'game:error', { message: e.message || 'امتیاز مسابقه معتبر نیست' });
      }
      const password = String(payload?.password || '').trim().slice(0, 32);
      dropFromQueue(socket);
      const lobbyId = 'lobby-' + Math.random().toString(36).substring(2, 8);
      lobbies.set(lobbyId, {
        host: socket,
        gameId,
        stake,
        hasPassword: password.length > 0,
        password: password,
        hostName: nameOf(socket.user),
        createdAt: Date.now(),
      });
      safeEmit(socket, 'game:lobby_created', {
        lobbyId,
        gameId,
        stake,
        hasPassword: password.length > 0,
        message: 'اتاق اختصاصی ساخته شد — در انتظار حریف',
      });
      io.emit('game:lobby_updated', {
        action: 'created',
        lobby: {
          lobbyId,
          gameId,
          stake,
          hostName: nameOf(socket.user),
          hasPassword: password.length > 0,
          createdAt: Date.now(),
        },
      });
    });

    socket.on('game:lobby_list', () => {
      const list = [];
      for (const [id, l] of lobbies.entries()) {
        if (l.host && l.host.connected) {
          list.push({
            lobbyId: id,
            gameId: l.gameId,
            stake: l.stake,
            hostName: l.hostName,
            hasPassword: Boolean(l.hasPassword),
            createdAt: l.createdAt,
          });
        } else {
          lobbies.delete(id);
        }
      }
      safeEmit(socket, 'game:lobby_list', list);
    });

    socket.on('game:join_lobby', async payload => {
      const lobbyId = String(payload?.lobbyId || '');
      const pass = String(payload?.password || '').trim();
      const lobby = lobbies.get(lobbyId);
      if (!lobby || !lobby.host || !lobby.host.connected) {
        lobbies.delete(lobbyId);
        return safeEmit(socket, 'game:error', { message: 'اتاق دیگر در دسترس نیست یا منقضی شده است' });
      }
      if (lobby.host.user.id === socket.user.id) {
        return safeEmit(socket, 'game:error', { message: 'نمی‌توانی به اتاق خودت متصل شوی' });
      }
      if (lobby.hasPassword && lobby.password && lobby.password !== pass) {
        return safeEmit(socket, 'game:error', { message: 'رمز عبور اتاق اشتباه است' });
      }
      const rules = rulesById[lobby.gameId];
      try {
        if (rules.validatePlayer) await ensurePlayerReady(rules, socket);
      } catch (e) {
        return safeEmit(socket, 'game:error', { message: e.message || 'ترکیب بازی آماده نیست' });
      }
      dropFromQueue(lobby.host);
      dropFromQueue(socket);
      const started = await startRoomOrError(
        io, rules, lobby.gameId, lobby.host, socket, lobby.stake, 'lobby');
      if (!started) return;
      lobbies.delete(lobbyId);
      io.emit('game:lobby_updated', { action: 'joined', lobbyId });
    });

    socket.on('game:cancel_lobby', () => {
      for (const [id, l] of lobbies.entries()) {
        if (l.host && l.host.user && l.host.user.id === socket.user.id) {
          lobbies.delete(id);
          io.emit('game:lobby_updated', { action: 'removed', lobbyId: id });
          safeEmit(socket, 'game:lobby_cancelled', { message: 'room cancelled' });
          return;
        }
      }
    });

    socket.on('game:join', async payload => {
      try {
        const gameId = (payload && typeof payload === 'object' && payload.gameId)
          || Object.keys(rulesById)[0];
        const rules = rulesById[gameId];
        if (!rules) return safeEmit(socket, 'game:error', { message: 'این بازی در دسترس نیست' });
        try {
          if (rules.validatePlayer) await ensurePlayerReady(rules, socket);
        } catch (e) {
          return safeEmit(socket, 'game:error', { message: e.message || 'ترکیب بازی آماده نیست' });
        }

        const stakes = stakeService();
        if (!stakes) return safeEmit(socket, 'game:error', { message: 'سرویس امن مسابقه در دسترس نیست' });
        let stake;
        try {
          stake = stakes.parsePublicStake(payload?.stake);
        } catch (e) {
          return safeEmit(socket, 'game:error', { message: e.message });
        }

        dropFromQueue(socket);
        const previous = rooms.get(roomOfSocket(socket));
        if (previous) {
          const loser = previous.seats.X === socket ? 'X' : 'O';
          finish(previous, 'DISCONNECT', loser);
        }

        const wantBot = (payload && typeof payload === 'object'
          && (payload.vsBot === true || stake === 0 && payload.mode === 'bot'));
        if (wantBot) {
          await startRoomOrError(io, rules, gameId, socket, null, 0, 'bot');
          return;
        }

        // بررسی سریع پیش از صف برای تجربهٔ درست؛ بررسی قطعی دوباره در
        // reserveMatch و زیر FOR UPDATE انجام می‌شود تا خرج هم‌زمان نتواند
        // موجودی را بین انتظار و شروع بازی کم کند.
        if (stake > 0) {
          const afford = await stakes.canAfford(socket.user.id, stake);
          if (!afford.ok) {
            return safeEmit(socket, 'game:error', {
              message: `برای این مسابقه حداقل ${stake} امتیاز لازم داری`,
              required: stake,
              balance: afford.balance,
            });
          }
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
          await startRoomOrError(io, rules, gameId, opponent, socket, stake, 'online');
          return;
        }

        q.push(socket);
        const isStaked = stake > 0;
        const waitTime = isStaked ? 30_000 : 15_000;
        const botAllowed = !isStaked && !rules.noBot;

        safeEmit(socket, 'game:waiting', {
          gameId,
          stake,
          message: isStaked
            ? `در حال جستجوی حریف آنلاین برای مسابقه ${stake} امتیازی (۳۰ ثانیه)...`
            : 'در حال جستجوی حریف واقعی...',
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
              safeEmit(socket, 'game:still-waiting', {
                gameId,
                soloAvailable: Boolean(rules.solo),
                message: 'هنوز حریفی پیدا نشده — می‌توانی منتظر بمانی یا تنها بازی کنی',
              });
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
                  q.splice(stillQueued, 1);
                  clearInterval(socket.queuePing);
                  socket.queuePing = null;
                }
              }, QUEUE_PING_MS);
              return;
            }
            q.splice(i, 1);
            void startRoomOrError(io, rules, gameId, socket, null, 0, 'bot');
          } catch (e) {
            console.error(`[games:${gameId}] bot fallback failed:`, e.message);
          }
        }, waitTime);
      } catch (e) {
        console.error('[games] join failed:', e.message);
        safeEmit(socket, 'game:error', { message: e.message || 'ورود به مسابقه ناموفق بود' });
      }
    });

    socket.on('game:play_bot', async payload => {
      const gameId = (payload && typeof payload === 'object' && payload.gameId)
        || (typeof payload === 'string' ? payload : null)
        || Object.keys(rulesById)[0];
      const rules = rulesById[gameId];
      if (!rules) return safeEmit(socket, 'game:error', { message: 'این بازی در دسترس نیست' });
      try {
        if (rules.validatePlayer) await ensurePlayerReady(rules, socket, { vsBot: true });
      } catch (e) {
        return safeEmit(socket, 'game:error', { message: e.message || 'ترکیب بازی آماده نیست' });
      }
      dropFromQueue(socket);
      const previous = rooms.get(roomOfSocket(socket));
      if (previous) {
        const loser = previous.seats.X === socket ? 'X' : 'O';
        finish(previous, 'DISCONNECT', loser);
      }
      await startRoomOrError(io, rules, gameId, socket, null, 0, 'bot');
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
      if (room) {
        const loser = room.seats.X === socket ? 'X' : room.seats.O === socket ? 'O' : null;
        finish(room, 'DISCONNECT', loser);
      }
      dropFromQueue(socket);
    });

    socket.on('disconnect', () => {
      dropFromQueue(socket);
      const room = rooms.get(roomOfSocket(socket));
      if (room) {
        const loser = room.seats.X === socket ? 'X' : room.seats.O === socket ? 'O' : null;
        finish(room, 'DISCONNECT', loser);
      }
    });
  });
};

attachGames.rooms = rooms;
module.exports = attachGames;
