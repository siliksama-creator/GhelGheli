// ============================================================================
//  ثبت حضور کاربران — مشترک بین پروسه‌ها
// ============================================================================
//
// presenceService یک Map محلی نگه می‌دارد: userId -> مجموعهٔ socket.id.
// در حالت تک‌پروسه بی‌نقص است. اما با چند پروسه، `isOnline(x)` فقط
// سوکت‌های همین پروسه را می‌بیند، پس:
//
//   · «دوستت الان آنلاین نیست» به کاربری گفته می‌شود که آنلاین است
//   · شمارندهٔ کاربران آنلاین در پنل ادمین کسری از واقعیت را نشان می‌دهد
//   · رویداد friends:presence وقتی کاربر واقعاً هنوز از پروسهٔ دیگر وصل
//     است، «آفلاین شد» اعلام می‌شود
//
// این ماژول همان دفترچه را در ردیس نگه می‌دارد. طراحی عمداً ساده است:
//
//   کلید:  presence:<userId>  →  SET از socket.id
//   TTL:   روی هر کلید ست می‌شود تا اگر پروسه‌ای ناگهانی بمیرد (kill -9)،
//          سوکت‌های یتیمش خودبه‌خود پاک شوند و کاربر برای همیشه «آنلاین»
//          نماند. با هر ضربان یا اتصال تازه TTL نو می‌شود.
//
// بدون REDIS_URL همه‌چیز به همان Map محلی برمی‌گردد — رفتار مو‌به‌مو مثل
// امروز، بدون هیچ سربار.

const { redisEnabled, makeClient } = require('./redis');

const TTL_SECONDS = 120;      // بیشتر از فاصلهٔ ضربان، کمتر از حوصلهٔ کاربر
const HEARTBEAT_MS = 45_000;  // باید راحت زیر TTL باشد

function createPresenceStore() {
  const local = new Map();          // userId -> Set<socketId>  (همیشه نگه داشته می‌شود)
  const client = redisEnabled() ? makeClient('presence') : null;
  const shared = Boolean(client);
  let heartbeat = null;

  const key = userId => `presence:${userId}`;

  async function add(userId, socketId) {
    const id = String(userId);
    if (!local.has(id)) local.set(id, new Set());
    const set = local.get(id);
    const firstLocally = set.size === 0;
    set.add(socketId);

    if (!shared) return { first: firstLocally };

    try {
      // آیا پیش از این هیچ سوکتی (روی هیچ پروسه‌ای) نداشت؟
      const before = await client.scard(key(id));
      await client.sadd(key(id), socketId);
      await client.expire(key(id), TTL_SECONDS);
      return { first: before === 0 };
    } catch {
      // ردیس در دسترس نیست: به تصمیم محلی برمی‌گردیم. بدترین حالت یک
      // رویداد حضور اضافه است، نه خرابی.
      return { first: firstLocally };
    }
  }

  async function remove(userId, socketId) {
    const id = String(userId);
    const set = local.get(id);
    set?.delete(socketId);
    const emptyLocally = !set || set.size === 0;
    if (emptyLocally) local.delete(id);

    if (!shared) return { last: emptyLocally };

    try {
      await client.srem(key(id), socketId);
      const left = await client.scard(key(id));
      if (left === 0) await client.del(key(id));
      // «آخرین» یعنی روی هیچ پروسه‌ای سوکتی نمانده باشد.
      return { last: left === 0 };
    } catch {
      return { last: emptyLocally };
    }
  }

  async function isOnline(userId) {
    const id = String(userId);
    if (local.get(id)?.size) return true;   // جواب فوری بدون رفت‌وبرگشت
    if (!shared) return false;
    try {
      return (await client.scard(key(id))) > 0;
    } catch {
      return false;
    }
  }

  async function onlineCount() {
    if (!shared) return local.size;
    try {
      // SCAN چون KEYS روی دیتابیس بزرگ کل ردیس را قفل می‌کند.
      let cursor = '0';
      let n = 0;
      do {
        const [next, batch] = await client.scan(
          cursor, 'MATCH', 'presence:*', 'COUNT', 500);
        cursor = next;
        n += batch.length;
      } while (cursor !== '0');
      return n;
    } catch {
      return local.size;
    }
  }

  /** TTL کلیدهای این پروسه را زنده نگه می‌دارد. */
  function startHeartbeat() {
    if (!shared || heartbeat) return;
    heartbeat = setInterval(() => {
      const ids = [...local.keys()];
      if (!ids.length) return;
      const p = client.pipeline();
      for (const id of ids) p.expire(key(id), TTL_SECONDS);
      p.exec().catch(() => {});
    }, HEARTBEAT_MS);
    heartbeat.unref?.();   // نباید مانع خروج تمیز پروسه شود
  }

  /** هنگام خاموشی تمیز، ردپای این پروسه را پاک می‌کند. */
  async function drain() {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    if (!shared) return;
    try {
      const p = client.pipeline();
      for (const [id, socks] of local.entries()) {
        for (const s of socks) p.srem(key(id), s);
      }
      await p.exec();
    } catch { /* خاموشی نباید به خاطر ردیس گیر کند */ }
  }

  return {
    add, remove, isOnline, onlineCount, startHeartbeat, drain,
    get shared() { return shared; },
    localUserCount: () => local.size,
  };
}

module.exports = { createPresenceStore };
