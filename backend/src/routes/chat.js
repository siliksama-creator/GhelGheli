// ─────────────────────────────────────────────────────────────────────
// چتِ عمومی: پیکربندی، بوت‌استرپ، پیام‌ها، گزارش و پسند —
// بیرون آمده از server.js (بندِ ۱ نقشهٔ راه). بدنه‌ها مو به مو منتقل شده‌اند.
// ─────────────────────────────────────────────────────────────────────
const express = require('express');

module.exports = ({
  pool, auth, asyncHandler, validateUuid,
  io, ensureChatCooldown, assertNoBadWords, getChatPinnedMessage,
  getChatCooldownSeconds, getChatMinLifetimePoints, shop, activeStickers,
  cannedMessages, level, activeStickerById, chatLimiter,
  chatRetention, isAllowedChatMessage,
}) => {
  const router = express.Router();

router.get('/chat/config', auth, asyncHandler(async (req, res) => {
  const minLifetimePoints = await getChatMinLifetimePoints();
  const [cooldown, pinned, emotePacks] = await Promise.all([
    getChatCooldownSeconds(),
    getChatPinnedMessage(),
    shop.emotePacksFor(req.user.id),
  ]);
  res.json({
    minLifetimePoints,
    messageCooldownSeconds: cooldown,
    eligible: Number(req.user.lifetime_points || 0) >= minLifetimePoints,
    userLifetimePoints: req.user.lifetime_points,
    pinned,
    emotePacks,
  });
}));

router.get('/chat/bootstrap', auth, asyncHandler(async (req, res) => {
  const minLifetimePoints = await getChatMinLifetimePoints();
  const eligible = Number(req.user.lifetime_points || 0) >= minLifetimePoints;
  const [cooldownSec, pinned, emotePacks, stickers] = await Promise.all([
    getChatCooldownSeconds(),
    getChatPinnedMessage(),
    shop.emotePacksFor(req.user.id),
    activeStickers(),
  ]);

  const config = {
    minLifetimePoints,
    messageCooldownSeconds: cooldownSec,
    eligible,
    userLifetimePoints: req.user.lifetime_points,
    pinned,
    emotePacks,
  };

  if (!eligible) {
    return res.json({
      config,
      messages: [],
      stickers,
      cannedMessages: cannedMessages(),
    });
  }

  const { rows } = await pool.query(`SELECT m.*, u.nickname,u.first_name,u.last_name,u.profile_image_url,u.profile_avatar_key,
      rm.message_text AS reply_text, rm.message_type AS reply_type, ru.nickname AS reply_nickname,
      s.image_url AS sticker_url, s.title AS sticker_title,
      (SELECT count(*)::int FROM chat_message_likes l WHERE l.message_id=m.id) AS like_count,
      EXISTS(SELECT 1 FROM chat_message_likes l WHERE l.message_id=m.id AND l.user_id=$1) AS liked_by_me,
      (m.user_id=$1) AS is_mine
    FROM chat_messages m
    JOIN users u ON u.id=m.user_id
    LEFT JOIN chat_messages rm ON rm.id=m.reply_to_message_id
    LEFT JOIN users ru ON ru.id=rm.user_id
    LEFT JOIN chat_stickers s ON s.id=m.sticker_id
    WHERE m.is_deleted=false ORDER BY m.sent_at DESC LIMIT 60`, [req.user.id]);

  const ids = [...new Set(rows.map(r => r.user_id))];
  const [cos, lvl] = await Promise.all([
    shop.cosmeticsFor(ids),
    level.levelsFor(ids),
  ]);

  const messages = rows.reverse().map(r => ({
    ...r,
    cosmetics: cos.get(r.user_id) || null,
    level: lvl[r.user_id]?.level ?? 0,
  }));

  res.json({
    config,
    messages,
    stickers,
    cannedMessages: cannedMessages(),
  });
}));

router.get('/chat/canned-messages', asyncHandler(async (req, res) => {
  res.json(cannedMessages());
}));

router.get('/chat/messages', auth, asyncHandler(async (req, res) => {
  const minLifetimePoints = await getChatMinLifetimePoints();
  if (Number(req.user.lifetime_points || 0) < minLifetimePoints) return res.status(403).json({ message: `برای ورود به چت باید حداقل ${minLifetimePoints} امتیاز تاریخی داشته باشید`, minLifetimePoints });
  const { rows } = await pool.query(`SELECT m.*, u.nickname,u.first_name,u.last_name,u.profile_image_url,u.profile_avatar_key,
      rm.message_text AS reply_text, rm.message_type AS reply_type, ru.nickname AS reply_nickname,
      s.image_url AS sticker_url, s.title AS sticker_title,
      (SELECT count(*)::int FROM chat_message_likes l WHERE l.message_id=m.id) AS like_count,
      EXISTS(SELECT 1 FROM chat_message_likes l WHERE l.message_id=m.id AND l.user_id=$1) AS liked_by_me,
      (m.user_id=$1) AS is_mine
    FROM chat_messages m
    JOIN users u ON u.id=m.user_id
    LEFT JOIN chat_messages rm ON rm.id=m.reply_to_message_id
    LEFT JOIN users ru ON ru.id=rm.user_id
    LEFT JOIN chat_stickers s ON s.id=m.sticker_id
    WHERE m.is_deleted=false ORDER BY m.sent_at DESC LIMIT 100`, [req.user.id]);
  // Attach cosmetics so the club badge and name colour render next to each
  // message. Resolved server-side because an equipped item stops applying the
  // moment Plus lapses unless the user actually bought it.
  const ids = [...new Set(rows.map(r => r.user_id))];
  const [cos, lvl] = await Promise.all([
    shop.cosmeticsFor(ids),
    level.levelsFor(ids),
  ]);
  res.json(rows.reverse().map(r => ({
    ...r,
    cosmetics: cos.get(r.user_id) || null,
    level: lvl[r.user_id]?.level ?? 0,
  })));
}));

router.post('/chat/messages', auth, chatLimiter.mw, asyncHandler(async (req, res) => {
  const minLifetimePoints = await getChatMinLifetimePoints();
  if (Number(req.user.lifetime_points || 0) < minLifetimePoints) return res.status(403).json({ message: `برای ارسال پیام باید حداقل ${minLifetimePoints} امتیاز تاریخی داشته باشید` });
  const cd = await ensureChatCooldown(req.user.id);
  if (cd.remaining > 0) return res.status(429).json({ message: `برای جلوگیری از اسپم، ${cd.remaining} ثانیه دیگر پیام بدهید`, cooldownSeconds: cd.cooldown, remainingSeconds: cd.remaining });
  const stickerId = req.body.stickerId || req.body.sticker_id || null;
  const replyTo = req.body.replyTo || req.body.reply_to_message_id || null;
  const clean = String(req.body.message || req.body.text || '').trim();
  // استیکر متنِ آزاد ندارد؛ اعتبارش فقط عضویت در فهرستِ فعالِ
  // chat_stickers است. کولدون و سقف امتیاز همچنان یکسان اعمال می‌شوند.
  const sticker = stickerId ? await activeStickerById(stickerId) : null;
  if (stickerId && !sticker) {
    return res.status(400).json({ message: 'استیکر معتبر نیست' });
  }
  const messageType = sticker ? 'sticker' : 'text';
  // Validate reply target up front instead of letting a bad/deleted id hit
  // the DB's foreign key constraint, which previously bubbled up as a raw
  // Postgres error message to the client (see friendlyDbError note above).
  if (replyTo) {
    const rm = await pool.query('SELECT id FROM chat_messages WHERE id=$1 AND is_deleted=false', [replyTo]);
    if (!rm.rows[0]) return res.status(400).json({ message: 'پیام موردنظر برای پاسخ پیدا نشد' });
  }
  if (messageType === 'text') {
    if (!clean) return res.status(400).json({ message: 'متن پیام خالی است' });
    if (!await isAllowedChatMessage(clean, req.user.id)) {
      return res.status(400).json({ message: 'فقط پیام‌های آماده و ایموجی‌ها مجاز هستند.' });
    }
    await assertNoBadWords(clean);
  }
  // CHECK constraint: length(trim(message_text)) BETWEEN 1 AND 1000
  // برای استیکر متن آزاد نیست — یک placeholder غیرخالی می‌گذاریم
  // تا constraint نشکند (قبلاً '' باعث crash بک‌اند می‌شد).
  const storedText = messageType === 'sticker'
    ? (sticker.title ? String(sticker.title).slice(0, 80) : 'استیکر')
    : clean.slice(0, 1000);
  const { rows } = await pool.query(
    'INSERT INTO chat_messages(user_id,message_text,reply_to_message_id,sticker_id,message_type) VALUES($1,$2,$3,$4,$5) RETURNING *',
    [req.user.id, storedText, replyTo, sticker ? sticker.id : null, messageType]);
  // سقفِ ۲۰۰ پیامِ سراسری — هر دو مسیرِ درج (REST و سوکت) باید صدایش
  // بزنند، وگرنه کاربرِ وب که از REST می‌فرستد از سقف فرار می‌کند.
  chatRetention.onMessageInserted().catch(() => {});
  // BUG: the message BROADCAST carried no cosmetics, while GET /api/chat
  // does. A paying user's club badge and name colour therefore appeared on
  // every old message but vanished from their own new one until the page was
  // reloaded — reading as "my badge stopped working".
  const cosNew = await shop.cosmeticsFor([req.user.id]);
  const msg = { ...rows[0], nickname: req.user.nickname, first_name: req.user.first_name, last_name: req.user.last_name, profile_image_url: req.user.profile_image_url, profile_avatar_key: req.user.profile_avatar_key, like_count: 0, liked_by_me: false, is_mine: true, cosmetics: cosNew.get(req.user.id) || null };
  if (sticker) {
    msg.sticker_url = sticker.image_url;
    msg.sticker_title = sticker.title;
  }
  // `is_mine` مخصوصِ گیرنده است. اگر همین شیء broadcast شود، همهٔ کاربران
  // پیام را «مالِ خودم» می‌بینند و در سمتِ چپ با رنگِ آبی رندر می‌کنند.
  // پس نسخهٔ عمومی بدون این پرچم می‌رود و فقط پاسخِ HTTP آن را دارد.
  const { is_mine: _mine, ...publicMsg } = msg;
  io.to('chat:public').emit('chat:new', publicMsg);
  res.json(msg);
}));

router.post('/chat/messages/:id/report', auth, validateUuid('id'), asyncHandler(async (req, res) => {
  await pool.query('UPDATE chat_messages SET is_reported=true, report_count=report_count+1 WHERE id=$1', [req.params.id]);
  res.json({ message: 'گزارش ثبت شد' });
}));

router.post('/chat/messages/:id/like', auth, validateUuid('id'), asyncHandler(async (req, res) => {
  await pool.query('INSERT INTO chat_message_likes(message_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.params.id, req.user.id]);
  const c = await pool.query('SELECT count(*)::int AS count FROM chat_message_likes WHERE message_id=$1', [req.params.id]);
  io.to('chat:public').emit('chat:liked', { messageId: req.params.id, likeCount: c.rows[0].count });
  res.json({ liked: true, likeCount: c.rows[0].count });
}));

router.delete('/chat/messages/:id/like', auth, validateUuid('id'), asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM chat_message_likes WHERE message_id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  const c = await pool.query('SELECT count(*)::int AS count FROM chat_message_likes WHERE message_id=$1', [req.params.id]);
  io.to('chat:public').emit('chat:liked', { messageId: req.params.id, likeCount: c.rows[0].count });
  res.json({ liked: false, likeCount: c.rows[0].count });
}));

  return router;
};
