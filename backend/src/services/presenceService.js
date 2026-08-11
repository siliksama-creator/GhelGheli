const social = require('./socialService');
const analytics = require('./analyticsService');
const missions = require('./missionService');
const { createNotification } = require('./notificationService');

function createPresenceService(pool) {
  const socketsByUser = new Map();
  let ioRef = null;

  const isOnline = userId => Boolean(socketsByUser.get(String(userId))?.size);

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
    io.on('connection', socket => {
      if (!socket.user?.id) return;
      const userId = String(socket.user.id);
      socket.join(`user:${userId}`);
      if (!socketsByUser.has(userId)) socketsByUser.set(userId, new Set());
      const set = socketsByUser.get(userId);
      const first = set.size === 0;
      set.add(socket.id);
      if (first) {
        pool.query('UPDATE users SET last_seen_at=NOW() WHERE id=$1', [userId]).catch(() => {});
        emitPresence(userId, true).catch(() => {});
      }

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
          if (!isOnline(targetUserId)) {
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
          callback?.({ ok: true });
        } catch (error) {
          callback?.({ ok: false, error: error.message });
          if (!callback) socket.emit('game:error', { message: error.message });
        }
      });

      socket.on('disconnect', () => {
        const current = socketsByUser.get(userId);
        current?.delete(socket.id);
        if (current?.size) return;
        socketsByUser.delete(userId);
        const lastSeenAt = new Date().toISOString();
        pool.query('UPDATE users SET last_seen_at=$2 WHERE id=$1', [userId, lastSeenAt]).catch(() => {});
        emitPresence(userId, false, lastSeenAt).catch(() => {});
      });
    });
  }

  return {
    attach,
    isOnline,
    onlineUsers: () => socketsByUser.size,
    recordChallengeMission: userId => missions.record(userId, 'friend_challenge'),
  };
}

module.exports = { createPresenceService };
