const { pool } = require('../config/db');
const { levelFromXp } = require('./levelService');

function publicUser(row, online = false) {
  return {
    id: row.id,
    nickname: row.nickname || row.first_name || 'کاربر',
    firstName: row.first_name || null,
    lastName: row.last_name || null,
    profileImageUrl: row.profile_image_url || null,
    profileAvatarKey: row.profile_avatar_key || null,
    level: levelFromXp(row.game_xp).level,
    online: Boolean(online),
    lastSeenAt: online ? null : row.last_seen_at,
  };
}

async function areFriends(userA, userB, client = pool) {
  if (!userA || !userB || userA === userB) return false;
  const { rows } = await client.query(
    `SELECT 1 FROM friendships
      WHERE status='accepted'
        AND ((requester_id=$1 AND addressee_id=$2)
          OR (requester_id=$2 AND addressee_id=$1))`, [userA, userB]);
  return Boolean(rows[0]);
}

async function friendIds(userId, client = pool) {
  const { rows } = await client.query(
    `SELECT CASE WHEN requester_id=$1 THEN addressee_id ELSE requester_id END AS id
       FROM friendships
      WHERE status='accepted' AND (requester_id=$1 OR addressee_id=$1)`, [userId]);
  return rows.map(r => r.id);
}

async function overview(userId, isOnline = () => false) {
  const { rows } = await pool.query(
    `SELECT f.id AS friendship_id,f.status,f.requester_id,f.addressee_id,f.created_at,
            u.id,u.nickname,u.first_name,u.last_name,u.profile_image_url,
            u.profile_avatar_key,u.last_seen_at,u.game_xp
       FROM friendships f
       JOIN users u ON u.id=CASE WHEN f.requester_id=$1 THEN f.addressee_id ELSE f.requester_id END
      WHERE (f.requester_id=$1 OR f.addressee_id=$1)
      ORDER BY CASE f.status WHEN 'accepted' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
               f.updated_at DESC`, [userId]);
  const friends = [];
  const incoming = [];
  const outgoing = [];
  for (const row of rows) {
    const item = {
      friendshipId: row.friendship_id,
      ...publicUser(row, isOnline(row.id)),
      requestedAt: row.created_at,
    };
    if (row.status === 'accepted') friends.push(item);
    else if (row.status === 'pending' && String(row.addressee_id) === String(userId)) incoming.push(item);
    else if (row.status === 'pending') outgoing.push(item);
  }
  friends.sort((a, b) => Number(b.online) - Number(a.online)
    || String(a.nickname).localeCompare(String(b.nickname), 'fa'));
  return { friends, incoming, outgoing };
}

async function search(userId, query, isOnline = () => false) {
  const q = String(query || '').trim().slice(0, 60);
  if (q.length < 2) return [];
  const { rows } = await pool.query(
    `SELECT u.id,u.nickname,u.first_name,u.last_name,u.profile_image_url,
            u.profile_avatar_key,u.last_seen_at,u.game_xp,
            f.id AS friendship_id,f.status,
            CASE WHEN f.requester_id=$1 THEN 'outgoing'
                 WHEN f.addressee_id=$1 THEN 'incoming' END AS direction
       FROM users u
       LEFT JOIN friendships f ON
         (f.requester_id=$1 AND f.addressee_id=u.id)
         OR (f.addressee_id=$1 AND f.requester_id=u.id)
      WHERE u.id<>$1 AND u.status='active'
        AND (u.nickname ILIKE $2 OR u.first_name ILIKE $2 OR u.last_name ILIKE $2)
      ORDER BY CASE WHEN u.nickname ILIKE $3 THEN 0 ELSE 1 END,u.nickname
      LIMIT 20`, [userId, `%${q}%`, `${q}%`]);
  return rows.map(row => ({
    ...publicUser(row, isOnline(row.id)),
    friendshipId: row.friendship_id,
    relation: row.status || 'none',
    direction: row.direction || null,
  }));
}

async function request(userId, targetId) {
  if (!targetId || userId === targetId) {
    throw Object.assign(new Error('نمی‌توانی خودت را به دوستان اضافه کنی'), { status: 400 });
  }
  const target = await pool.query("SELECT id FROM users WHERE id=$1 AND status='active'", [targetId]);
  if (!target.rows[0]) throw Object.assign(new Error('کاربر پیدا نشد'), { status: 404 });
  const existing = await pool.query(
    `SELECT * FROM friendships WHERE
      (requester_id=$1 AND addressee_id=$2) OR (requester_id=$2 AND addressee_id=$1)`,
    [userId, targetId]);
  const row = existing.rows[0];
  if (row?.status === 'accepted') throw Object.assign(new Error('این کاربر همین حالا دوست شماست'), { status: 409 });
  if (row?.status === 'blocked') throw Object.assign(new Error('درخواست دوستی برای این کاربر در دسترس نیست'), { status: 403 });
  if (row?.status === 'pending') {
    if (String(row.addressee_id) === String(userId)) return accept(userId, row.id);
    throw Object.assign(new Error('درخواست دوستی قبلاً ارسال شده است'), { status: 409 });
  }
  const { rows } = await pool.query(
    `INSERT INTO friendships(requester_id,addressee_id,status)
     VALUES($1,$2,'pending') RETURNING id,status,created_at`, [userId, targetId]);
  return { message: 'درخواست دوستی ارسال شد', ...rows[0] };
}

async function accept(userId, friendshipId) {
  const { rows } = await pool.query(
    `UPDATE friendships SET status='accepted',responded_at=NOW(),updated_at=NOW()
      WHERE id=$1 AND addressee_id=$2 AND status='pending'
      RETURNING id,status,requester_id,addressee_id`, [friendshipId, userId]);
  if (!rows[0]) throw Object.assign(new Error('درخواست دوستی فعال پیدا نشد'), { status: 404 });
  return { message: 'حالا دوست هستید', ...rows[0] };
}

async function remove(userId, friendshipId) {
  const { rowCount } = await pool.query(
    `DELETE FROM friendships WHERE id=$1 AND (requester_id=$2 OR addressee_id=$2)`,
    [friendshipId, userId]);
  if (!rowCount) throw Object.assign(new Error('رابطه دوستی پیدا نشد'), { status: 404 });
  return { message: 'از فهرست دوستان حذف شد' };
}

async function block(userId, targetId) {
  if (!targetId || targetId === userId) throw Object.assign(new Error('کاربر نامعتبر است'), { status: 400 });
  const { rows } = await pool.query(
    `INSERT INTO friendships(requester_id,addressee_id,status,responded_at)
     VALUES($1,$2,'blocked',NOW())
     ON CONFLICT ((LEAST(requester_id,addressee_id)),(GREATEST(requester_id,addressee_id)))
     DO UPDATE SET requester_id=$1,addressee_id=$2,status='blocked',responded_at=NOW(),updated_at=NOW()
     RETURNING id,status`, [userId, targetId]);
  return { message: 'کاربر مسدود شد', ...rows[0] };
}

module.exports = { publicUser, areFriends, friendIds, overview, search, request, accept, remove, block };
