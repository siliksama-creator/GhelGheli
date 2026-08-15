const social = require('./socialService');
const analytics = require('./analyticsService');
const missions = require('./missionService');
const { createNotification } = require('./notificationService');
const { createPresenceStore } = require('../lib/presenceStore');

function createPresenceService(pool) {
  const socketsByUser = new Map();
  // دفترچهٔ مشترک بین پروسه‌ها. بدون REDIS_URL دقیقاً همان Map محلی است.
  const store = createPresenceStore();
  let ioRef = null;

  // ⚠️ این تابع عمداً **همگام** مانده است.
  //
  // socialService داخل map/حلقه صدایش می‌زند (overview و search). اگر
  // async شود، مقدار برگشتی یک Promise است و Promise همیشه truthy —
  // یعنی همهٔ کاربران «آنلاین» نمایش داده می‌شوند. یک باگ بی‌صدا و زشت.
  //
  // برای فهرست دوستان، خواندن از حافظهٔ همین پروسه جواب کافی و فوری است.
  // آنجا که پاسخِ غلط هزینه دارد (دعوت به بازی) از isOnlineAnywhere
  // استفاده می‌شود که کل خوشه را می‌بیند.
  const isOnline = userId => Boolean(socketsByUser.get(String(userId))?.size);

  // نسخهٔ ناهمگام و دقیق: همهٔ پروسه‌ها را می‌بیند.
  const isOnlineAnywhere = userId => store.isOnline(userId);

  async function emitPresence(userId, online, lastSeenAt = null) {
    if (!ioRef) return;
    const ids = await social.friendIds(userId).catch(() => []);
    for (const friendId of ids) {
      ioRef.to(`user:${friendId}`).emit('friends:presence', {
        userId, online, lastSeenAt,
      });
    }
  }

  function attach(io) {
    ioRef = io;
    store.startHeartbeat();
    io.on('connection', socket => {
      if (!socket.user?.id) return;
      const userId = String(socket.user.id);
      socket.join(`user:${userId}`);
      if (!socketsByUser.has(userId)) socketsByUser.set(userId, new Set());
      socketsByUser.get(userId).add(socket.id);
      // «اولین» را دفترچهٔ مشترک تعیین می‌کند: اگر کاربر از گوشی به
      // پروسهٔ ۱ و از وب به پروسهٔ ۲ وصل باشد، نباید دو بار «آنلاین شد»
      // پخش شود.
      store.add(userId, socket.id).then(({ first }) => {
        if (!first) return;
        pool.query('UPDATE users SET last_seen_at=NOW() WHERE id=$1', [userId]).catch(() => {});
        emitPresence(userId, true).catch(() => {});
      }).catch(() => {});

      socket.on('friend:challenge', async (payload, callback) => {
        try {
          const targetUserId = String(payload?.targetUserId || '');
          const roomCode = String(payload?.roomCode || '').trim().toUpperCase();
          const gameId = String(payload?.gameId || 'card_duel').slice(0, 32);
          if (!/^[A-Z0-9]{4}$/.test(roomCode)
              || socket.privateRoomCode !== roomCode
              || !await social.areFriends(userId, targetUserId)) {
            throw Object.assign(new Error('دعوت بازی معتبر نیست'), { status: 403 });
          }
          if (!await isOnlineAnywhere(targetUserId)) {
            throw Object.assign(new Error('دوستت الان آنلاین نیست'), { status: 409 });
          }
          const invitation = {
            from: {
              id: userId,
              nickname: socket.user.nickname || socket.user.first_name || 'دوستت',
            },
            roomCode,
            gameId,
            shareUrl: `https://user.ghelghelishop.ir/?game=${encodeURIComponent(gameId)}&room=${roomCode}`,
            expiresInSeconds: 120,
          };
          io.to(`user:${targetUserId}`).emit('friend:challenge', invitation);
          createNotification(
            targetUserId,
            'game_challenge',
            'دعوت به نبرد ',
            `${invitation.from.nickname} تو را به یک مسابقه مستقیم دعوت کرده است.`,
          ).catch(() => {});
          analytics.record(userId, 'friend_challenge', {
            platform: payload?.platform,
            gameId,
            metadata: { targetUserId },
          }).catch(() => {});
          missions.record(userId, 'friend_challenge').catch(() => {});
          callback?.({ ok: true });
        } catch (error) {
          callback?.({ ok: false, error: error.message });
          if (!callback) socket.emit('game:error', { message: error.message });
        }
      });

      socket.on('disconnect', () => {
        const current = socketsByUser.get(userId);
        current?.delete(socket.id);
        if (!current?.size) socketsByUser.delete(userId);
        // «آفلاین» فقط وقتی که روی هیچ پروسه‌ای سوکتی نمانده باشد.
        store.remove(userId, socket.id).then(({ last }) => {
          if (!last) return;
          const lastSeenAt = new Date().toISOString();
          pool.query('UPDATE users SET last_seen_at=$2 WHERE id=$1', [userId, lastSeenAt]).catch(() => {});
          emitPresence(userId, false, lastSeenAt).catch(() => {});
        }).catch(() => {});
      });
    });
  }

  return {
    attach,
    isOnline,
    isOnlineAnywhere,
    // شمارندهٔ پنل ادمین: در خوشه باید کل کاربران را بشمارد نه سهم یک پروسه.
    onlineUsers: () => store.onlineCount(),
    drain: () => store.drain(),
    recordChallengeMission: userId => missions.record(userId, 'friend_challenge'),
  };
}

module.exports = { createPresenceService };
