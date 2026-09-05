// ============================================================================
//  کشِ مشترک با TTL — Redis اگر باشد، وگرنه حافظهٔ همان پروسه
// ============================================================================
//
// ── چرا هست ──────────────────────────────────────────────────────────
// دو هدفِ مقیاس دارد:
//
//   ۱) مسیرهای داغ و پرتکرار (لیدربورد که وب هر ۱۲ ثانیه می‌کوبد) نباید در
//      هر درخواست یک DENSE_RANK + چند کوئری کمکی روی دیتابیس اجرا کنند؛
//   ۲) وقتی چند پروسهٔ Node بالا باشد، کش باید **بینشان مشترک** باشد وگرنه
//      هر پروسه کشِ جدا دارد و ۲ برابر باز هم به دیتابیس فشار می‌آید. پس
//      اگر REDIS_URL بود از Redis استفاده می‌شود (هم‌مقدار در همهٔ پروسه‌ها،
//      زنده‌تر)، وگرنه یک Map درون‌پروسه‌ای همان رفتار را با TTL می‌دهد.
//
// خرابی Redis هرگز نباید درخواست کاربر را بشکند: هر خطا بی‌صدا به مسیر
// بدونِکش می‌افتد (get → null، set → رد می‌شود).

const { redisEnabled, makeClient } = require('./redis');

let client = null;
function shared() {
  if (client === null) {
    // یک‌بار و فقط وقتی Redis فعال است ساخته می‌شود؛ در غیر این صورت
    // مقدار false می‌ماند تا دوباره تلاش بی‌فایده نکنیم.
    client = redisEnabled() ? makeClient('cache') : false;
  }
  return client || null;
}

// ── فال‌بک درون‌پروسه‌ای (درست همان رفتار، بدون Redis) ─────────────────
const mem = new Map(); // key -> { value, expiresAt }
function memGet(key) {
  const hit = mem.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) { mem.delete(key); return null; }
  return hit.value;
}
function memSet(key, value, ttlMs) {
  mem.set(key, { value, expiresAt: Date.now() + ttlMs });
  // جلوی رشد بی‌حد Map: نگه‌داریِ حداکثر ۲۰۰۰ کلید، حذفِ قدیمی‌ترین.
  if (mem.size > 2000) {
    const oldest = mem.keys().next().value;
    mem.delete(oldest);
  }
}
function memDel(key) { mem.delete(key); }

/**
 * خواندنِ کش. اگر JSON معتبر بود دادهٔ parse‌شده برمی‌گردد، وگرنه null
 * (مثل «نبودن»). روی خطا هم null — هیچ‌وقت throw نمی‌کند.
 */
async function cacheGet(key) {
  const c = shared();
  if (c) {
    try {
      const raw = await c.get(key);
      return raw == null ? null : JSON.parse(raw);
    } catch { return null; }
  }
  return memGet(key);
}

/** نوشتنِ کش با انقضای ttlMs میلی‌ثانیه. خطا بی‌صدا رد می‌شود. */
async function cacheSet(key, value, ttlMs) {
  let payload;
  try { payload = JSON.stringify(value); } catch { return; }
  const c = shared();
  if (c) {
    try { await c.set(key, payload, 'PX', Math.max(1, Math.floor(ttlMs))); } catch { /* بی‌کش */ }
    return;
  }
  memSet(key, value, ttlMs);
}

/** حذفِ عمدیِ یک کلید (مثلاً بعد از تغییری که تازه‌بودن را مهم می‌کند). */
async function cacheDel(key) {
  const c = shared();
  if (c) { try { await c.del(key); } catch { /* ignore */ } return; }
  memDel(key);
}

/**
 * حذفِ همهٔ کلیدهایی که با یک پیشوند شروع می‌شوند (مثلاً `lb:league:`).
 *
 * چرا لازم است: لیدربوردِ لیگ با کلیدهای متفاوت کش می‌شود
 * (`lb:league:current:100`، `lb:league:<seasonId>:...` و …). وقتی رتبه‌ها
 * عوض می‌شوند (پایان بازی، ثبت امتیاز) باید **همه‌شان** یک‌جا بی‌اعتبار
 * شوند تا بیننده دادهٔ کهنه نبیند؛ تازه‌بودنِ جدول برای کاربر مهم است و
 * TTLِ ۸ ثانیه اینجا کندیِ محسوس است.
 *
 * روی Redis از SCAN (نه KEYS) استفاده می‌شود که مسدودکننده نیست؛ روی
 * فال‌بکِ حافظه‌ای هم Map پیمایش می‌شود. هر خطا بی‌صدا رد می‌شود —
 * بدترین حالت، کلید تا انقضای TTL می‌ماند.
 */
async function cacheDelPrefix(prefix) {
  const c = shared();
  if (c) {
    try {
      let cursor = '0';
      const keys = [];
      do {
        const [next, batch] = await c.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200);
        cursor = next;
        for (const k of batch) keys.push(k);
      } while (cursor !== '0');
      if (keys.length) await c.del(...keys);
    } catch { /* بی‌کش — TTL خودش می‌گیرد */ }
    return;
  }
  for (const k of Array.from(mem.keys())) {
    if (k.startsWith(prefix)) mem.delete(k);
  }
}

module.exports = { cacheGet, cacheSet, cacheDel, cacheDelPrefix, _shared: shared };
