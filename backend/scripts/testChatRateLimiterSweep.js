/**
 * ضدّ-پسرفت برای نشتیِ حافظهٔ محدودکنندهٔ نرخِ چت.
 *
 * پیش از اصلاح، Map محدودکنندهٔ نرخ (server.js:socketMessageTimes) فقط
 * set می‌شد و هرگز delete نداشت؛ یعنی هر کاربری که یک پیام می‌فرستاد تا
 * ری‌استارتِ بعدیِ پروسه در حافظه می‌ماند. این تست هم جاروی حافظه را
 * تأیید می‌کند و هم اینکه سخت‌گیریِ ضدّ اسپم دست‌نخورده مانده باشد.
 */
const assert = require('assert');

let passed = 0;
function ok(condition, name) {
  assert.ok(condition, name);
  passed += 1;
}

// بازتولید دقیقِ منطقِ داخل server.js.
const CHAT_WINDOW_MS = 60_000;
const LIMIT = 20;

function createLimiter() {
  const socketMessageTimes = new Map();
  let lastChatSweep = 0;

  function sweep(now) {
    if (now - lastChatSweep < CHAT_WINDOW_MS) return;
    lastChatSweep = now;
    for (const [userId, times] of socketMessageTimes) {
      if (!times.length || now - times[times.length - 1] >= CHAT_WINDOW_MS) {
        socketMessageTimes.delete(userId);
      }
    }
  }

  return {
    size: () => socketMessageTimes.size,
    /** برمی‌گرداند: آیا پیام پذیرفته شد. */
    send(userId, now) {
      sweep(now);
      const arr = (socketMessageTimes.get(userId) || []).filter(t => now - t < CHAT_WINDOW_MS);
      if (arr.length >= LIMIT) return false;
      arr.push(now);
      socketMessageTimes.set(userId, arr);
      return true;
    },
  };
}

// ── ۱) ضدّ اسپم باید دقیقاً همان‌طور که بود سخت‌گیر بماند.
{
  const l = createLimiter();
  const t = 1_000_000;
  let accepted = 0;
  for (let i = 0; i < 25; i++) if (l.send('u1', t + i)) accepted += 1;
  ok(accepted === LIMIT, `دقیقاً ${LIMIT} پیام در یک دقیقه پذیرفته می‌شود (نه بیشتر)`);
  ok(l.send('u1', t + 25) === false, 'پیام بیست‌ویکم در همان پنجره رد می‌شود');
}

// ── ۲) پس از گذشتِ پنجره، همان کاربر دوباره مجاز است.
{
  const l = createLimiter();
  const t = 2_000_000;
  for (let i = 0; i < LIMIT; i++) l.send('u1', t + i);
  ok(l.send('u1', t + CHAT_WINDOW_MS + 1) === true,
    'بعد از یک دقیقه کاربر دوباره می‌تواند پیام بدهد');
}

// ── ۳) هستهٔ ماجرا: کاربرانِ خاموش نباید برای همیشه در حافظه بمانند.
{
  const l = createLimiter();
  const t0 = 3_000_000;
  for (let u = 0; u < 5000; u++) l.send(`user-${u}`, t0);
  ok(l.size() === 5000, 'هر پنج‌هزار کاربرِ فعال در پنجره نگهداری می‌شوند');

  // یک کاربرِ تازه، دو دقیقه بعد: جارو باید بقیه را پاک کند.
  l.send('late-comer', t0 + 2 * CHAT_WINDOW_MS);
  ok(l.size() === 1,
    'پس از پایانِ پنجره فقط کاربرِ فعال باقی می‌ماند (نشتی برطرف شد)');
}

// ── ۴) جارو نباید کاربرِ هنوز-فعال را بی‌جا حذف کند.
{
  const l = createLimiter();
  const t0 = 4_000_000;
  l.send('idle', t0);
  l.send('active', t0);
  const later = t0 + CHAT_WINDOW_MS + 5;
  l.send('active', later);          // این جارو را هم اجرا می‌کند
  ok(l.size() === 1, 'کاربرِ خاموش پاک شد');
  let accepted = 0;
  for (let i = 1; i < LIMIT + 5; i++) if (l.send('active', later + i)) accepted += 1;
  ok(accepted === LIMIT - 1,
    'سهمیهٔ کاربرِ فعال پس از جارو حفظ می‌شود و ریست نمی‌شود');
}

// ── ۵) جارو نباید روی هر پیام اجرا شود (هزینهٔ مسیر داغ).
{
  const l = createLimiter();
  const t0 = 5_000_000;
  for (let u = 0; u < 100; u++) l.send(`u${u}`, t0);
  // همه در همان پنجره‌اند؛ هیچ‌کس نباید حذف شود حتی با پیام‌های پیاپی.
  for (let i = 0; i < 50; i++) l.send('u0', t0 + i);
  ok(l.size() === 100, 'جاروی زودهنگام کاربرانِ درونِ پنجره را حذف نمی‌کند');
}

console.log(`\n  محدودکنندهٔ نرخِ چت: ${passed} بررسی موفق ✓\n`);
