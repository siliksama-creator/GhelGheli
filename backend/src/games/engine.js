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

function growthServices() {
  try {
    return {
      analytics: require('../services/analyticsService'),
      missions: require('../services/missionService'),
    };
  } catch (e) {
    console.error('[games:growth] service unavailable:', e.message);
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
// A short carrier/Wi-Fi handoff must not decide a real match. The room is
// paused and the same authenticated user can claim the seat on a new socket.
const RECONNECT_WINDOW_MS = 25_000;
const REMATCH_WINDOW_MS = 90_000;
const turnMsFor = rules => Number(rules.turnMs) || DEFAULT_TURN_MS;

const queues = new Map(); // gameId -> [socket]
const rooms = new Map();  // roomId -> room
const lobbies = new Map(); // lobbyId -> {host, gameId, stake, createdAt}
const completedMatches = new Map(); // roomId -> short-lived rematch contract

const nameOf = u => u.nickname || u.first_name || 'کاربر';
// Enough for the client to render an avatar + open the public profile sheet.
const infoOf = u => ({
  id: u.id,
  nickname: nameOf(u),
  profileImageUrl: u.profile_image_url || null,
  profileAvatarKey: u.profile_avatar_key || null,
  lifetimePoints: Number(u.lifetime_points || 0),
  // سکهٔ فصلِ جاری — تا حریف با یک تاچ روی نوارِ بالای بازی ببیند طرفِ
  // مقابلش چقدر سکه دارد. مثل level از همان ردیفِ کاربرِ سوکت می‌آید و
  // هیچ کوئریِ اضافه‌ای نمی‌سازد.
  coins: Number(u.coins || 0),
  // Server-resolved entitlements: clients may animate these slugs but cannot
  // claim an unowned effect by mutating their local payload.
  cosmetics: u.cosmetics || null,
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

function roomSeatForUser(userId) {
  for (const room of rooms.values()) {
    for (const symbol of ['X', 'O']) {
      if (String(room.players?.[symbol]?.id || '') === String(userId || '')) {
        return { room, symbol };
      }
    }
  }
  return null;
}

function startPayload(room, symbol) {
  return {
    roomId: room.id,
    gameId: room.gameId,
    players: room.players,
    turn: room.turn,
    yourSymbol: symbol,
    vsBot: room.vsBot,
    matchMode: room.matchMode,
    state: snapshot(room, symbol),
    turnMs: room.turnMs,
    deadline: room.deadline || null,
    remainingMs: room.deadline ? Math.max(0, room.deadline - Date.now()) : null,
    // مهلتِ خواندنِ اعلانِ راند: تا این لحظه ساعت هنوز شروع نشده.
    // کلاینت با همین عدد شمارش را نگه می‌دارد تا انیمیشن تمام شود.
    introUntil: room.introUntil || null,
    resultUntil: room.resultUntil || null,
    introMs: Number(room.rules.introMs) || 0,
    // مکث فقط وقتی اعلام می‌شود که پنجره‌اش هنوز زنده باشد. مهرِ کهنهٔ
    // راندِ قبل (مثلاً در update وسطِ راند) نباید کلاینت را وادار کند
    // صحنهٔ برخوردِ راندِ قبلی را دوباره پخش کند.
    resultHoldMs: room.resultUntil && room.resultUntil > Date.now() ? Number(room.rules.resultHoldMs) || 0 : 0,
    stake: room.stake,
    netPot: room.netPot,
    commission: room.commission,
  };
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
  for (const sym of ['X', 'O']) {
    const sock = room.seats[sym];
    // The missing seat is inside its explicit reconnect window. Emitting to
    // the dead Socket.IO object can buffer stale snapshots and must not be
    // interpreted as a forfeit; the disconnect handler owns that lifecycle.
    if (room.reconnecting?.[sym] || !sock || sock === 'BOT' || !sock.emit) continue;
    const delivered = safeEmit(sock, event, {
      state: snapshot(room, sym),
      turn: room.turn,
      turnMs: room.turnMs,
      deadline: room.deadline || null,
      // CLOCK-SKEW FIX: never make the client subtract our timestamp from
      // its own Date.now(). Phones with a wrong clock produced a garbage
      // difference that clamped to the max, freezing the countdown. This
      // is a plain "you have N ms left from the moment you receive this".
      remainingMs: room.deadline ? Math.max(0, room.deadline - Date.now()) : null,
    // مهلتِ خواندنِ اعلانِ راند: تا این لحظه ساعت هنوز شروع نشده.
    // کلاینت با همین عدد شمارش را نگه می‌دارد تا انیمیشن تمام شود.
    introUntil: room.introUntil || null,
    resultUntil: room.resultUntil || null,
    introMs: Number(room.rules.introMs) || 0,
    // مکث فقط وقتی اعلام می‌شود که پنجره‌اش هنوز زنده باشد. مهرِ کهنهٔ
    // راندِ قبل (مثلاً در update وسطِ راند) نباید کلاینت را وادار کند
    // صحنهٔ برخوردِ راندِ قبلی را دوباره پخش کند.
    resultHoldMs: room.resultUntil && room.resultUntil > Date.now() ? Number(room.rules.resultHoldMs) || 0 : 0,
      ...extra,
    }, room);
    if (!delivered && !room.done) suspendForReconnect(room, sym);
  }
}

// (Re)start the countdown for whoever is on move. A human who runs out of
// time forfeits the turn: we play a move for them (via the bot brain) so the
// game keeps flowing instead of hanging until someone disconnects.
function armTurnClock(room) {
  if (room.done) return;
  if (room.reconnecting && (room.reconnecting.X || room.reconnecting.O)) {
    room.deadline = null;
    return;
  }
  const sim = !!room.rules.simultaneous;
  // The bot moves on its own schedule; no clock needed for its seat.
  // در حالت هم‌زمان، ساعت برای هر دو صندلی است چون هر دو باید انتخاب
  // کنند — پس فقط وقتی صرف‌نظر می‌کنیم که هر دو صندلی ربات باشند.
  const seat = room.seats[room.turn];
  if (!sim && (!seat || seat === 'BOT')) { room.deadline = null; return; }

  // ═══════════════════════════════════════════════════════════════════════
  // رفعِ باگ: «کارتِ برندهٔ راند به راندِ بعدی منتقل می‌شود»
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ── گزارشِ مالک ──
  //   مسابقهٔ آنلاینِ امتیازیِ اندروید در برابر وب: بعد از راندِ اول،
  //   وقتی هر بازیکنی کارتش را قفل می‌کرد، صحنهٔ برخوردِ راندِ قبل — با
  //   کارتِ برنده — دوباره وسطِ راندِ جدید پخش می‌شد و دست دوباره قفل
  //   می‌شد؛ انگار کارتِ برنده به راندِ بعد منتقل شده است.
  //
  // ── علت ──
  //   در بازی هم‌زمان، هر قفلِ کارت `advance` را صدا می‌زند و `advance`
  //   همیشه `armTurnClock` را دوباره مسلح می‌کرد. و چون `state.lastRound`
  //   تا پایانِ راندِ جاری همان نتیجهٔ راندِ قبلی است، `holdMs` دوباره
  //   ۳۲۰۰ms می‌شد: مهرهای `resultUntil`/`introUntil` از نو صادر می‌شدند
  //   (کلاینت صحنهٔ برخوردِ راندِ قبل را دوباره پخش می‌کرد) و `deadline`
  //   از نو ۲۶.۲ ثانیه می‌شد (ساعتِ هر دو بازیکن به عقب می‌پرید).
  //
  //   بازتولید شد، نه حدس: تستِ `scripts/testCardDuelMidRoundLock.js`
  //   روی کدِ قبلی دقیقاً `resultHoldMs=3200` وسطِ راند نشان می‌دهد.
  //
  // ── رفع ──
  //   هر بازیِ هم‌زمان یک `clockKey` معرفی می‌کند که فقط در *انتقالِ
  //   راند* عوض می‌شود (دوئل کارت: طولِ history؛ پنالتی: شمارهٔ راند +
  //   ضرباتِ گرفته‌شده). اگر کلید همان راندِ مسلح‌شده باشد و ساعت هنوز
  //   فعال است، مسلح‌سازیِ تکراری بی‌اثر برمی‌گردد: نه مهرِ مکث تازه
  //   صادر می‌شود، نه deadline ریست می‌شود، نه تایمرِ موجود پاک می‌شود.
  //
  //   بازی‌های بدونِ `clockKey` (مثل جفت‌یابِ نوبتی) دقیقاً رفتارِ
  //   قبلی را دارند — هیچ تغییری نکرده‌اند.
  const roundKey = room.rules.clockKey ? room.rules.clockKey(room.state) : null;
  if (roundKey !== null && room.deadline && roundKey === room.armedRoundKey) {
    return;
  }
  room.armedRoundKey = roundKey;

  clearTimeout(room.turnTimer);
  // ═══════════════════════════════════════════════════════════════════════
  // مهلتِ خواندنِ اعلانِ راند — تایمر بعد از انیمیشن شروع می‌شود
  // ═══════════════════════════════════════════════════════════════════════
  //
  // خواستهٔ مالک: «انیمیشن مییاد رو چند ثانیه بدون اینکه تایمر بره نگه
  // دار که کاربر بتونه بخونه».
  //
  // قبلاً اعلانِ «این راند سرِ سرعت است» دو ثانیه روی صفحه بود ولی ساعتِ
  // ۲۰ ثانیه‌ای هم‌زمان می‌رفت. یعنی کاربر یا اعلان را می‌خواند و وقت از
  // دست می‌داد، یا ردش می‌کرد. عملاً جریمهٔ خواندن.
  //
  // `introMs` را خودِ قواعدِ بازی اعلام می‌کند (در `rules/cardDuel.js`)
  // چون فقط آن می‌داند انیمیشنش چقدر طول می‌کشد. بازی‌های دیگر مقدارش
  // را ندارند و رفتارشان دست‌نخورده می‌ماند.
  //
  // ⚠️ فقط برای راندهای بعد از اولی نیست — راندِ اول هم اعلان دارد.
  //    ولی وقتی بازی تمام شده یا کسی در حالِ اتصالِ دوباره است، اضافه
  //    نمی‌شود.
  const introMs = Number(room.rules.introMs) || 0;
  // ═══════════════════════════════════════════════════════════════════════
  // مکثِ تماشای نتیجهٔ راند
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ── گزارشِ مالک ──
  //   «اون لحظه‌ای که مبارزه تو راندو میگه برای راند ها سریع میاد بدون
  //    اینکه لود بشه میره»
  //
  // ── اندازه‌گیریِ زنده (مرورگر واقعی، ۳۰ ثانیه ضبط) ──
  //   راند ۱: ۲۳٫۳ ثانیه   (منتظرِ انتخابِ کاربر)
  //   راند ۲:  ۵٫۲ ثانیه   ← اینجا مشکل است
  //   فازِ «verdict» (نمایشِ برنده): فقط ۴ ثانیه، بعد اوورلیِ راندِ
  //   بعدی رویش می‌افتد.
  //
  // علت: به‌محضِ اینکه هر دو طرف کارت را قفل می‌کنند، `applyMove`
  // راند را حل می‌کند و `advance` **بلافاصله** ساعتِ راندِ بعد را
  // مسلح می‌کند. یعنی انیمیشنِ نتیجه (برخورد، شمارشِ اعداد، اعلامِ
  // برنده) هنوز تمام نشده که صحنه عوض می‌شود.
  //
  // در نبردِ انسان‌به‌انسان بدتر است: اگر هر دو سریع انتخاب کنند،
  // کاربر عملاً هیچ‌وقت نمی‌فهمد چرا برد یا باخت.
  //
  // ── راه‌حل ──
  // `resultHoldMs` از قواعدِ بازی خوانده می‌شود و **فقط وقتی راندِ
  // قبلی نتیجه داشته** اضافه می‌شود (نه در راندِ اول). کلاینت با
  // `resultUntil` می‌فهمد که باید نتیجه را نگه دارد و ساعت را نبَرد.
  //
  // ⚠️ به `turnMs` اضافه می‌شود نه اینکه از آن کم شود — وگرنه فرصتِ
  //    فکرکردنِ کاربر کوتاه‌تر می‌شد و یک باگ را با باگِ دیگر عوض
  //    می‌کردیم.
  const holdMs = room.state && room.state.lastRound
    ? Number(room.rules.resultHoldMs) || 0
    : 0;
  // ═══════════════════════════════════════════════════════════════════════
  // یک عدد، یک منبعِ حقیقت — `deadline` و تایمر باید دقیقاً یکی باشند
  // ═══════════════════════════════════════════════════════════════════════
  //
  // باگِ رفع‌شده: `deadline` (که کلاینت شمارشِ معکوس را از رویش می‌سازد)
  // شاملِ `holdMs` بود، ولی آرگومانِ `setTimeout` نبود:
  //
  //     deadline   = now + holdMs + introMs + turnMs     ← ۲۶۲۰۰ms
  //     setTimeout(..., turnMs + introMs)                ← ۲۳۰۰۰ms
  //
  // یعنی از راندِ دوم به بعد (جایی که holdMs غیرِ صفر می‌شود) کارتِ
  // کاربر ۳۲۰۰ms **زودتر** از چیزی که ساعتِ رویِ صفحه‌اش نشان می‌داد
  // خودکار بازی می‌شد. کاربر فکر می‌کرد ۳٫۲ ثانیه وقت دارد ولی نداشت.
  //
  // حالا هر دو از همین یک متغیر می‌آیند، پس نمی‌توانند از هم جدا بیفتند.
  // هر تغییری در فرمول باید فقط اینجا انجام شود.
  const waitMs = holdMs + introMs + room.turnMs;
  room.resultUntil = holdMs ? Date.now() + holdMs : null;
  room.introUntil = introMs ? Date.now() + holdMs + introMs : null;
  room.deadline = Date.now() + waitMs;
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
          // شمارندهٔ تجمعی: `room.timedOut` با اولین حرکتِ واقعیِ همان
          // بازیکن پاک می‌شود، پس در پایانِ مسابقه چیزی از راندهای قبل
          // در آن نمانده. برای آنالیتیکس به آمارِ کلِ مسابقه نیاز داریم.
          room.timeoutCounts = room.timeoutCounts || { X: 0, O: 0 };
          room.timeoutCounts[s2] += 1;
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
    room.timeoutCounts = room.timeoutCounts || { X: 0, O: 0 };
    room.timeoutCounts[sym] += 1;
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
  }, waitMs);
}

function finish(room, winner, disconnectedSym = null) {
  if (room.done) return;
  room.done = true;
  clearTimeout(room.botTimer);
  clearTimeout(room.turnTimer);
  for (const symbol of ['X', 'O']) clearTimeout(room.reconnectTimers?.[symbol]);

  const resolvedWinner = winner === 'DISCONNECT'
    ? (disconnectedSym === 'X' ? 'O'
      : disconnectedSym === 'O' ? 'X'
        : (room.seats.X && room.seats.X.connected ? 'X' : 'O'))
    : winner;

  // Game-specific history is non-financial and must never block settlement
  // or game:over. Card duel uses this hook to persist the five revealed
  // rounds while the generic engine remains unaware of card rules.
  if (room.rules.onFinish) {
    Promise.resolve(room.rules.onFinish({
      matchId: room.id,
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

  // Authoritative funnel + mission progress. Clients cannot forge starts,
  // completions or wins; only the engine writes these events.
  const growth = growthServices();
  if (growth) {
    for (const symbol of ['X', 'O']) {
      const player = room.players?.[symbol];
      if (!player?.id || player.isBot) continue;
      growth.analytics.record(player.id, 'match_completed', {
        platform: 'server', gameId: room.gameId, matchId: room.id,
        metadata: {
          vsBot: room.vsBot, stake: room.stake, mode: room.matchMode,
          outcome: resolvedWinner === 'DRAW' ? 'draw' : resolvedWinner === symbol ? 'win' : 'loss',
          disconnected: Boolean(disconnectedSym),
          // چند بار نوبتِ این بازیکن سوخت و موتور جای او بازی کرد.
          // بدون این عدد نمی‌شود «رهاکردنِ بازی» را از «کند بودن/گیج
          // بودنِ رابط» تفکیک کرد: هر دو به‌صورت باخت ثبت می‌شوند.
          timedOutRounds: (room.timeoutCounts && room.timeoutCounts[symbol]) || 0,
        },
      }).catch(() => {});
      growth.missions.record(player.id, 'match_completed').catch(() => {});
      if (!room.vsBot && resolvedWinner === symbol) {
        growth.missions.record(player.id, 'online_win').catch(() => {});
      }
    }
  }

  // Award points for a completed ONLINE match, then tell both players what
  // they earned. Fire-and-forget with its own catch: a scoring hiccup must
  // never stop the game from ending cleanly.
  const rewards = rewardService();
  const scoring = rewards
    ? rewards.recordMatch({
        gameId: room.gameId,
        vsBot: room.vsBot,
        winner: resolvedWinner,
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
          // سکهٔ واقعاً واریزشده به هر بازیکن، کلیدخورده به شناسهٔ کاربر.
          // سرویس آن را بعد از اعمالِ سهمیه و وضعیتِ لیگ می‌سازد، پس
          // همیشه بر اعدادِ جدول ارجح است.
          const paidCoins = result.coinsByUser || {};
          const coinsForSeat = (sym) => {
            const uid = room.players?.[sym]?.id;
            // ⚠️ `??` نه `||` — صفرِ واقعی («سهمیه‌ات پر بود») باید صفر
            //    بماند و به عددِ جدول برنگردد.
            const paid = uid ? paidCoins[uid] : undefined;
            if (paid !== undefined) return Number(paid) || 0;
            // مسیرِ پشتیبان: تسویهٔ تکراری نقشه ندارد.
            if (draw) return Number(result.drawCoins || 0);
            return sym === winnerSym
              ? Number(result.coinsAwarded || 0)
              : Number(result.loserCoins || 0);
          };

          for (const sym of ['X', 'O']) {
            const sock = room.seats[sym];
            if (sock?.emit) safeEmit(sock, 'game:settlement', {
              matchId: room.id,
              status: result.status === 'refunded' ? 'refunded' : 'settled',
              // هر دو کلاینت همان واریز authoritative را انیمیت می‌کنند؛
              // مبلغ از نتیجهٔ transaction می‌آید، نه محاسبهٔ UI.
              winner: draw ? 'DRAW' : winnerSym,
              netPot: result.netPot || room.netPot || 0,
              stake: result.stake || room.stake || 0,
              commission: result.commission || room.commission || 0,
              payout: !result.duplicate && !draw,
              balanceAfter: sym === winnerSym ? result.winnerBalanceAfter : null,
              // ── سکهٔ **همین** بازیکن ────────────────────────────────
              //
              // تا دورِ ۲۵ اینجا سکهٔ برنده به هر دو سوکت می‌رفت، چون
              // بازنده صفر می‌گرفت و عدد فقط برای انیمیشنِ «پروازِ سکه به
              // سمتِ برنده» بود. حالا بازنده هم واقعاً سکه می‌گیرد، پس
              // فرستادنِ عددِ برنده به بازنده یعنی به او «+۱۰» نشان دهیم
              // در حالی که ۱ گرفته — یعنی دروغ در صفحهٔ نتیجه.
              //
              // صفر یعنی سکه‌ای در کار نبود (سهمیه پر بود، لیگِ فعالی
              // نبود، یا مسابقهٔ لابیِ خصوصی بود) و کلاینت انیمیشن را
              // رد می‌کند.
              coins: coinsForSeat(sym),
            }, room);
          }
          if (result.duplicate) return;
          if (draw) {
            for (const sym of ['X', 'O']) {
              const sock = room.seats[sym];
              if (sock?.emit) safeEmit(sock, 'game:stake_refund', {
                stake: room.stake,
                message: 'مسابقه مساوی شد؛ ورودی کامل برگشت.',
                coins: coinsForSeat(sym),
              }, room);
            }
          } else {
            const winSock = room.seats[winnerSym];
            if (winSock?.emit) safeEmit(winSock, 'game:stake_win', {
              netPot: result.netPot,
              stake: result.stake,
              commission: result.commission,
              coins: coinsForSeat(winnerSym),
            }, room);
            // بازنده هم رویدادِ خودش را می‌گیرد. بدونِ این، تنها نشانهٔ
            // سکه‌اش عددِ داخلِ settlement بود که کلاینتِ فعلی برای
            // بازنده انیمیت نمی‌کند — سکه واریز می‌شد و کاربر هرگز
            // نمی‌فهمید.
            const loserSym = winnerSym === 'X' ? 'O' : 'X';
            const loseSock = room.seats[loserSym];
            const loseCoins = coinsForSeat(loserSym);
            if (loseSock?.emit && loseCoins > 0) {
              safeEmit(loseSock, 'game:stake_consolation', {
                coins: loseCoins,
                stake: result.stake,
              }, room);
            }
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

  const rematchAvailable = !disconnectedSym;
  if (rematchAvailable) {
    const contract = {
      roomId: room.id,
      gameId: room.gameId,
      rules: room.rules,
      seats: { ...room.seats },
      players: room.players,
      stake: room.stake,
      vsBot: room.vsBot,
      matchMode: room.matchMode,
      votes: new Set(),
      expiresAt: Date.now() + REMATCH_WINDOW_MS,
    };
    contract.timer = setTimeout(() => completedMatches.delete(room.id), REMATCH_WINDOW_MS);
    completedMatches.set(room.id, contract);
  }

  emitState(room, 'game:over', {
    winner,
    resolvedWinner,
    roomId: room.id,
    matchId: room.id,
    settlementStatus: room.stake > 0 && !room.vsBot ? 'pending' : 'settled',
    rematchAvailable,
    rematchWindowMs: rematchAvailable ? REMATCH_WINDOW_MS : 0,
  });
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
      // 🔴 رفعِ باگ (دورِ ۲۶): این آرگومان وجود نداشت.
      //
      // `matchMode` ساخته می‌شد و در `room` می‌نشست، ولی هرگز به سرویسِ
      // شرط نمی‌رسید — پس سرویس نمی‌دانست مسابقه عمومی است یا لابیِ
      // خصوصی، و به هر دو یکسان سکه می‌داد. جزئیات در `reserveMatch`.
      matchMode: matchMode || (vsBot ? 'bot' : 'online'),
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
    reconnecting: { X: false, O: false },
    reconnectTimers: { X: null, O: null },
    // کلیدِ راندِ مسلح‌شده برای guard داخلِ armTurnClock — قفلِ وسطِ
    // راند نباید ساعت را ریست کند (توضیح کامل بالای armTurnClock).
    armedRoundKey: null,
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
      safeEmit(sock, 'game:start', startPayload(room, sym), room);
    }
  }
  const growth = growthServices();
  if (growth) {
    for (const symbol of ['X', 'O']) {
      const player = room.players?.[symbol];
      if (!player?.id || player.isBot) continue;
      growth.analytics.record(player.id, 'match_started', {
        platform: 'server', gameId, matchId: id,
        metadata: { vsBot, stake: s, mode: room.matchMode },
      }).catch(() => {});
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

function suspendForReconnect(room, symbol) {
  if (!room || room.done || room.vsBot && symbol === 'O' || room.reconnecting[symbol]) return;
  room.reconnecting[symbol] = true;
  clearTimeout(room.turnTimer);
  clearTimeout(room.botTimer);
  room.deadline = null;
  const opponent = symbol === 'X' ? 'O' : 'X';
  const opponentSocket = room.seats[opponent];
  if (opponentSocket?.emit) safeEmit(opponentSocket, 'game:opponent_reconnecting', {
    roomId: room.id,
    userId: room.players?.[symbol]?.id,
    reconnectWindowMs: RECONNECT_WINDOW_MS,
    message: 'اتصال حریف ناپایدار شده؛ تا ۲۵ ثانیه منتظر بازگشتش می‌مانیم.',
  }, room);
  room.reconnectTimers[symbol] = setTimeout(() => {
    if (!room.done && room.reconnecting[symbol]) finish(room, 'DISCONNECT', symbol);
  }, RECONNECT_WINDOW_MS);
}

function resumeSeat(socket) {
  const found = roomSeatForUser(socket.user?.id);
  if (!found || !found.room.reconnecting?.[found.symbol]) return false;
  const { room, symbol } = found;
  clearTimeout(room.reconnectTimers[symbol]);
  room.reconnectTimers[symbol] = null;
  room.reconnecting[symbol] = false;
  room.seats[symbol] = socket;
  socket.join(room.id);
  armTurnClock(room);
  safeEmit(socket, 'game:resume', startPayload(room, symbol), room);
  const opponent = symbol === 'X' ? 'O' : 'X';
  const opponentSocket = room.seats[opponent];
  if (opponentSocket?.emit && !room.reconnecting[opponent]) {
    safeEmit(opponentSocket, 'game:opponent_reconnected', {
      roomId: room.id,
      message: 'حریف برگشت؛ مسابقه ادامه دارد.',
    }, room);
    safeEmit(opponentSocket, 'game:update', {
      state: snapshot(room, opponent), turn: room.turn, turnMs: room.turnMs,
      deadline: room.deadline,
      remainingMs: room.deadline ? Math.max(0, room.deadline - Date.now()) : null,
    // مهلتِ خواندنِ اعلانِ راند: تا این لحظه ساعت هنوز شروع نشده.
    // کلاینت با همین عدد شمارش را نگه می‌دارد تا انیمیشن تمام شود.
    introUntil: room.introUntil || null,
    resultUntil: room.resultUntil || null,
    introMs: Number(room.rules.introMs) || 0,
    // مکث فقط وقتی اعلام می‌شود که پنجره‌اش هنوز زنده باشد. مهرِ کهنهٔ
    // راندِ قبل (مثلاً در update وسطِ راند) نباید کلاینت را وادار کند
    // صحنهٔ برخوردِ راندِ قبلی را دوباره پخش کند.
    resultHoldMs: room.resultUntil && room.resultUntil > Date.now() ? Number(room.rules.resultHoldMs) || 0 : 0,
      resumed: true,
    }, room);
  }
  scheduleBot(room);
  return true;
}

async function requestRematch(io, socket, roomId) {
  const contract = completedMatches.get(String(roomId || ''));
  if (!contract || contract.expiresAt <= Date.now()) {
    throw Object.assign(new Error('زمان نبرد دوباره تمام شده است'), { status: 410 });
  }
  let symbol = null;
  for (const candidate of ['X', 'O']) {
    if (String(contract.players?.[candidate]?.id || '') === String(socket.user?.id || '')) symbol = candidate;
  }
  if (!symbol) throw Object.assign(new Error('این مسابقه متعلق به شما نیست'), { status: 403 });
  contract.seats[symbol] = socket;
  contract.votes.add(symbol);

  if (!contract.vsBot) {
    for (const candidate of ['X', 'O']) {
      const target = contract.seats[candidate];
      if (target?.emit) safeEmit(target, 'game:rematch_status', {
        roomId: contract.roomId,
        accepted: [...contract.votes],
        waitingForOpponent: contract.votes.size < 2,
        expiresAt: contract.expiresAt,
      });
    }
    if (contract.votes.size < 2) return null;
    if (!contract.seats.X?.connected || !contract.seats.O?.connected) {
      contract.votes.clear();
      throw Object.assign(new Error('حریف دیگر آنلاین نیست'), { status: 409 });
    }
  }

  const started = await startRoomOrError(
    io, contract.rules, contract.gameId, contract.seats.X,
    contract.vsBot ? null : contract.seats.O, contract.stake, contract.matchMode,
  );
  if (!started) {
    contract.votes.clear();
    return null;
  }
  clearTimeout(contract.timer);
  completedMatches.delete(contract.roomId);
  const growth = growthServices();
  if (growth) {
    for (const player of Object.values(contract.players || {})) {
      if (!player?.id || player.isBot) continue;
      growth.analytics.record(player.id, 'rematch', {
        platform: 'server', gameId: contract.gameId, matchId: started.id,
        metadata: { previousMatchId: contract.roomId, stake: contract.stake },
      }).catch(() => {});
      growth.missions.record(player.id, 'rematch').catch(() => {});
    }
  }
  return started;
}

const attachGames = function attachGames(io, rulesById) {
  io.on('connection', socket => {
    if (!socket.user) return;
    // If this authenticated user owns a suspended seat, reclaim it before
    // accepting queue/lobby actions on the fresh Socket.IO connection.
    resumeSeat(socket);

    // ── چالش ۱ به ۱ مستقیم با لینک / کد اتاق ──
    socket.on('game:create_room', async (payload, callback) => {
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
      const response = {
        roomCode: code,
        gameId,
        shareUrl: `https://user.ghelghelishop.ir/?game=${gameId}&room=${code}`,
        message: 'اتاق ساخته شد — کد یا لینک را برای دوستت بفرست',
      };
      safeEmit(socket, 'game:room_created', response);
      callback?.({ ok: true, ...response });
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

    socket.on('game:rematch', async (payload, callback) => {
      try {
        const started = await requestRematch(io, socket, payload?.roomId);
        callback?.({ ok: true, started: Boolean(started) });
      } catch (error) {
        const response = { ok: false, error: error.message || 'نبرد دوباره ناموفق بود' };
        callback?.(response);
        if (!callback) safeEmit(socket, 'game:error', { message: response.error });
      }
    });

    socket.on('game:leave', payload => {
      const roomId = (payload && typeof payload === 'object' && payload.roomId) || roomOfSocket(socket);
      const room = rooms.get(roomId);
      if (room) {
        const loser = room.seats.X === socket ? 'X' : room.seats.O === socket ? 'O' : null;
        finish(room, 'DISCONNECT', loser);
      } else {
        for (const [completedId, contract] of completedMatches.entries()) {
          const mine = Object.values(contract.players || {})
            .some(player => String(player?.id || '') === String(socket.user.id));
          if (!mine) continue;
          clearTimeout(contract.timer);
          completedMatches.delete(completedId);
          for (const target of Object.values(contract.seats || {})) {
            if (target?.emit && target !== socket) safeEmit(target, 'game:rematch_unavailable', {
              roomId: completedId, message: 'حریف از صفحه مسابقه خارج شد.',
            });
          }
        }
      }
      dropFromQueue(socket);
    });

    socket.on('disconnect', () => {
      dropFromQueue(socket);
      const room = rooms.get(roomOfSocket(socket));
      if (room) {
        const loser = room.seats.X === socket ? 'X' : room.seats.O === socket ? 'O' : null;
        suspendForReconnect(room, loser);
      }
    });
  });
};

attachGames.rooms = rooms;
attachGames.completedMatches = completedMatches;
attachGames.RECONNECT_WINDOW_MS = RECONNECT_WINDOW_MS;
attachGames.REMATCH_WINDOW_MS = REMATCH_WINDOW_MS;
module.exports = attachGames;
