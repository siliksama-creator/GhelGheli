// ─────────────────────────────────────────────────────────────────────
// لایهٔ سوکت: میان‌افزارِ احرازِ هویتِ اتصال و همهٔ هندلرهای socket.io —
// بیرون آمده از server.js (بندِ ۱ نقشهٔ راه، مهر ۱۴۰۵). بدنهٔ هندلرها مو
// به مو همان است؛ فقط وابستگی‌ها تزریق می‌شوند. attachRedisAdapter و
// friendlyDbError عمداً در server.js ماندند: یکی در بوتِ server.listen صدا
// می‌شود و دیگری سهمِ لایهٔ HTTP است.
// ─────────────────────────────────────────────────────────────────────
module.exports = function attachSockets({
  io, pool, jwt, JWT_SECRET,
  presence, activeStickerById, assertNoBadWords, chatRetention,
  ensureChatCooldown, getChatMinLifetimePoints, isAllowedChatMessage, leaderboardSignal,
  sessionEpochMatches, shop,
}) {
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== 'user') throw new Error('bad token');
    // `game_xp` اینجا خوانده می‌شود تا موتور بازی بتواند لولِ هر دو
    // بازیکن را در `game:start` بفرستد — درخواست مالک: «در حین بازی هم
    // لول بقیه رو بشه دید».
    //
    // چرا در همین کوئری و نه یک درخواستِ جدا: این تنها جایی است که
    // کاربرِ سوکت بارگذاری می‌شود و یک ستونِ اضافه هزینه‌ای ندارد؛
    // یک کوئریِ دوم در مسیرِ اتصال، تأخیرِ شروعِ بازی را زیاد می‌کرد.
    const { rows } = await pool.query(`SELECT id,nickname,first_name,last_name,
      profile_image_url,profile_avatar_key,chat_banned_until,status,
      lifetime_points,current_points,game_xp,coins, equipped_club,equipped_frame,
      equipped_color,equipped_profile_background,equipped_emote_pack,profile_title,
      session_epoch
      FROM users WHERE id=$1`, [payload.sub]);
    if (!rows[0] || rows[0].status !== 'active') throw new Error('inactive');
    // همان بررسیِ REST برای سوکت: تغییرِ رمز یعنی سوکت‌های قدیمی هم بمیرند.
    if (!sessionEpochMatches(payload, rows[0])) throw new Error('stale-session');
    const socketCosmetics = await shop.cosmeticsFor([rows[0].id]);
    socket.user = {
      ...rows[0],
      cosmetics: socketCosmetics.get(rows[0].id) || null,
    };
    next();
  } catch(e){ next(new Error('unauthorized')); }
});
presence.attach(io);
// همان io به سیگنالِ لیدربورد تزریق می‌شود تا سرویس‌های دامنه (که پایین‌تر
// از io ساخته می‌شوند) بتوانند بدونِ وابستگیِ مستقیم پخش کنند.
leaderboardSignal.attach(io);
// کلید = شناسهٔ کاربر، مقدار = زمانِ ۲۰ پیامِ آخر در پنجرهٔ یک‌دقیقه‌ای.
// این Map قبلاً فقط set می‌شد و هرگز پاک نمی‌شد: هر کاربری که یک‌بار در طول
// عمرِ پروسه چت می‌کرد، برای همیشه یک ورودی نگه می‌داشت. با انتشار روی
// کافه‌بازار و ده‌ها هزار کاربر این یک نشتیِ آهسته اما دائمی است
// (اندازه‌گیری‌شده: ۵۰هزار کاربر ≈ ۱۳ مگابایت heap که هرگز آزاد نمی‌شود).
// حالا ورودی‌های منقضی به‌صورت تنبل و کران‌دار جارو می‌شوند.
const socketMessageTimes = new Map();
const CHAT_WINDOW_MS = 60_000;
let lastChatSweep = 0;

function sweepChatRateLimiter(now) {
  // حداکثر یک‌بار در دقیقه، تا روی مسیرِ داغِ چت هزینه‌ای اضافه نکند.
  if (now - lastChatSweep < CHAT_WINDOW_MS) return;
  lastChatSweep = now;
  for (const [userId, times] of socketMessageTimes) {
    if (!times.length || now - times[times.length - 1] >= CHAT_WINDOW_MS) {
      socketMessageTimes.delete(userId);
    }
  }
}

io.on('connection', socket => {
  // هر سوکتِ احرازشده عضو «اتاق چت» می‌شود تا پخش چت به‌جای io.emitِ
  // سراسری (همهٔ سوکت‌ها، از جمله اتصال‌هایی که چت را نمی‌بینند) فقط به
  // مشترکینِ چت برود. در حالتِ چندپروسه‌ای این اتاق با آداپتور Redis بین
  // پروسه‌ها همگام است.
  socket.join('chat:public');
  // ── اتاقِ لیدربورد ────────────────────────────────────────────────
  // برخلافِ چت، این اتاق را همه خودکار نمی‌گیرند: فقط کلاینتی که صفحهٔ
  // لیگ را باز کرده مشترک می‌شود. هدف این است که رویدادِ
  // `leaderboard:update` (که هر پایان بازی می‌تواند صادرش کند) فقط به
  // کسانی برسد که جدول را می‌بینند، نه به هر سوکتِ بیکار.
  socket.on('leaderboard:subscribe', () => {
    try { socket.join(leaderboardSignal.ROOM); } catch { /* noop */ }
  });
  socket.on('leaderboard:unsubscribe', () => {
    try { socket.leave(leaderboardSignal.ROOM); } catch { /* noop */ }
  });
  socket.on('chat:send', async (payload, cb) => {
    try {
      const now = Date.now();
      sweepChatRateLimiter(now);
      const arr = (socketMessageTimes.get(socket.user.id) || []).filter(t => now - t < CHAT_WINDOW_MS);
      if (arr.length >= 20) throw new Error('ضد اسپم: تعداد پیام زیاد است');
      const minLifetimePoints = await getChatMinLifetimePoints();
      if (Number(socket.user.lifetime_points || 0) < minLifetimePoints) throw new Error(`برای ارسال پیام باید حداقل ${minLifetimePoints} امتیاز تاریخی داشته باشید`);
      const cd = await ensureChatCooldown(socket.user.id);
      if (cd.remaining > 0) throw new Error(`برای جلوگیری از اسپم، ${cd.remaining} ثانیه دیگر پیام بدهید`);
      if (socket.user.chat_banned_until && new Date(socket.user.chat_banned_until) > new Date()) throw new Error('شما موقتاً از چت محروم هستید');
      const body = typeof payload === 'object' && payload ? payload : { text: payload };
      const stickerId = body.stickerId || null;
      const sticker = stickerId ? await activeStickerById(stickerId) : null;
      if (stickerId && !sticker) throw new Error('استیکر معتبر نیست');
      const replyTo = body.replyTo || null;
      const clean = String(body.text || '').trim();
      const messageType = sticker ? 'sticker' : 'text';
      if (replyTo) {
        const rm = await pool.query('SELECT id FROM chat_messages WHERE id=$1 AND is_deleted=false', [replyTo]);
        if (!rm.rows[0]) throw new Error('پیام موردنظر برای پاسخ پیدا نشد');
      }
      if (messageType === 'text') {
        if (!clean) throw new Error('متن پیام خالی است');
        if (!await isAllowedChatMessage(clean, socket.user.id)) {
          throw new Error('فقط پیام‌های آماده و ایموجی‌ها مجاز هستند.');
        }
        await assertNoBadWords(clean);
      }
      const storedText = messageType === 'sticker'
        ? (sticker.title ? String(sticker.title).slice(0, 80) : 'استیکر')
        : clean.slice(0, 1000);
      arr.push(now); socketMessageTimes.set(socket.user.id, arr);
      const { rows } = await pool.query(
        'INSERT INTO chat_messages(user_id,message_text,reply_to_message_id,sticker_id,message_type) VALUES($1,$2,$3,$4,$5) RETURNING *',
        [socket.user.id, storedText, replyTo, sticker ? sticker.id : null, messageType]);
      // سقفِ ۲۰۰ پیامِ سراسری. خودش throw نمی‌کند، پس ثبتِ پیام هرگز
      // به‌خاطر پاک‌سازی شکست نمی‌خورد.
      chatRetention.onMessageInserted().catch(() => {});
      // Same fix as the REST path: without cosmetics here, a badge bought
      // seconds earlier does not show on the sender's own new message.
      const cosWs = await shop.cosmeticsFor([socket.user.id]);
      const msg = { ...rows[0], nickname: socket.user.nickname, first_name: socket.user.first_name, last_name: socket.user.last_name, profile_image_url: socket.user.profile_image_url, profile_avatar_key: socket.user.profile_avatar_key, like_count: 0, cosmetics: cosWs.get(socket.user.id) || null };
      if (sticker) {
        msg.sticker_url = sticker.image_url;
        msg.sticker_title = sticker.title;
      }
      // مثل مسیرِ REST: نسخهٔ عمومی بدونِ `is_mine` broadcast می‌شود و فقط
      // خودِ فرستنده آن را در callback با پرچمِ true می‌گیرد.
      io.to('chat:public').emit('chat:new', msg);
      cb && cb({ ok: true, message: { ...msg, is_mine: true } });
    } catch(e){ cb && cb({ ok: false, error: e.message }); }
  });

});

// Multiplayer games: a shared engine + one small rules file per game
// (backend/src/games/), so adding a game never touches this file.
//
// تفکیکِ نقش (ecosystem.config.cjs): فقط گرهِ «game» موتور زنده را
// وصل می‌کند و اتاق‌ها/صف‌ها/تایمرها را در حافظهٔ خودش نگه می‌دارد.
// گرهِ «http» سوکتِ بازی نمی‌پذیرد (nginx ترافیک Upgrade را فقط به
// گره بازی می‌فرستد)، پس state زنده فقط در یک پروسه می‌ماند و
// matchmaking و reconnect نمی‌شکند.
};
