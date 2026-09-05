/**
 * تستِ سرتاسریِ زندهٔ «به‌روزرسانیِ رویدادمحورِ جدول لیگ».
 *
 * ═══════════════════════════════════════════════════════════════════════
 * این تست برای چه نوشته شد
 * ═══════════════════════════════════════════════════════════════════════
 * صفحهٔ لیگ از pollِ ثابتِ ۱۲ ثانیه‌ای به سوکت تغییر کرد: سرور فقط وقتی
 * رتبه‌ها واقعاً عوض می‌شوند (ثبت امتیاز/پایان بازی) رویدادِ
 * `leaderboard:update` را **فقط به اتاقِ `leaderboard`** پخش می‌کند، و
 * کلاینتی که صفحه را باز کرده عضو این اتاق است.
 *
 * تستِ واحد نمی‌توانست این زنجیرهٔ کامل را ببیند؛ پس این تست با سوکت و
 * HTTPِ واقعی همان سناریوی کاربر را اجرا می‌کند:
 *
 *   ۱) یک «بیننده» وصل می‌شود و عضو اتاقِ leaderboard می‌شود؛
 *   ۲) یک «بازیکن» امتیازِ لیگ ثبت می‌کند (بازی ضربه‌زن، با امضای معتبر)؛
 *   ۳) بیننده باید در چند ثانیه رویدادِ leaderboard:update را بگیرد؛
 *   ۴) یک سوکتِ «عضوِ اتاق‌نشده» (که subscribe نفرستاده) نباید رویداد را
 *      بگیرد — این ثابت می‌کند پخش فقط به مشترکینِ اتاق می‌رود، نه به
 *      همهٔ سوکت‌ها.
 *
 * اجرا (روی استیجینگ یا لوکال؛ روی تولید با ALLOW_PROD):
 *   BASE=http://127.0.0.1:4100 node scripts/testLeaderboardSocket.js
 *   ALLOW_PROD=yes-i-know BASE=https://api.ghelghelishop.ir node ...
 *
 * به‌عمد از همان ابزارِ تست‌های E2E دیگر (fetch + socket.io-client) و
 * مسیرهای عمومیِ اپ استفاده می‌کند.
 */
const crypto = require('crypto');
const { io } = require('socket.io-client');

const BASE = process.env.BASE || `http://127.0.0.1:${process.env.PORT || 4000}`;
const ALLOW_PROD = process.env.ALLOW_PROD === 'yes-i-know';

let pass = 0; let fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass += 1; console.log('  ✓', name); }
  else { fail += 1; console.log('  ✗', name, detail ? `→ ${detail}` : ''); }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function req(method, pathname, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const payload = body !== undefined ? JSON.stringify(body) : undefined;
  const res = await fetch(`${BASE}${pathname}`, { method, headers, body: payload });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}

function connect(token) {
  const s = io(BASE, {
    auth: { token },
    transports: ['websocket', 'polling'],
    forceNew: true,
  });
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('اتصال سوکت برقرار نشد (۱۰ ثانیه)')), 10_000);
    s.on('connect', () => { clearTimeout(t); resolve(s); });
    s.on('connect_error', e => { clearTimeout(t); reject(new Error(`connect_error: ${e.message}`)); });
  });
}

// ── امضای HMAC بازی ضربه‌زن (دقیقاً قرارداد tapGameService) ────────────
function signingKey(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest();
}
function signBatch(token, body, nonce) {
  const canonical = [
    body.taps, body.flagged, body.elapsedMs,
    body.level, body.levelTaps, body.seq, nonce,
  ].join('|');
  return crypto.createHmac('sha256', signingKey(token)).update(canonical, 'utf8').digest('hex');
}

async function main() {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  تست زندهٔ سوکتِ لیدربورد                ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log(`  هدف: ${BASE} · ${new Date().toLocaleString('fa-IR')}`);

  if (/^https:\/\/(api\.)?ghelghelishop\.ir/.test(BASE) && !ALLOW_PROD) {
    throw new Error('این تست روی تولید داده می‌سازد؛ اگر عمدی است ALLOW_PROD=yes-i-know بده.');
  }

  const health = await req('GET', '/health');
  ok('سرور بالاست', health.status === 200 && health.data?.ok, `status=${health.status}`);

  // ── دو کاربرِ تازه: بیننده و بازیکن ─────────────────────────────────
  const uniq = () => Math.random().toString(36).slice(2, 8);
  async function makeUser(tag) {
    const mobile = `lbs${uniq()}`;
    const reg = await req('POST', '/api/auth/register-password', {
      body: { mobile, password: 'Lbs@123456', nickname: `تست‌لیگ_${tag}` },
    });
    const token = reg.data?.token;
    if (!token) throw new Error(`ثبت‌نام ${tag} شکست: ${reg.status} ${JSON.stringify(reg.data).slice(0, 180)}`);
    return { tag, token, id: reg.data?.user?.id };
  }

  const viewer = await makeUser('بیننده');
  const player = await makeUser('بازیکن');
  ok('بیننده و بازیکن ساخته شدند', !!(viewer.token && player.token));

  // ── بیننده وصل و عضو اتاق می‌شود ────────────────────────────────────
  const viewerSock = await connect(viewer.token);
  ok('سوکتِ بیننده وصل شد', viewerSock.connected);
  viewerSock.emit('leaderboard:subscribe');

  // یک سوکتِ دوم که عمداً subscribe نمی‌فرستد (عضو اتاق نیست).
  const outsiderSock = await connect(player.token);
  ok('سوکتِ خارج از اتاق هم وصل شد', outsiderSock.connected);

  let viewerGot = 0;
  let outsiderGot = 0;
  viewerSock.on('leaderboard:update', () => { viewerGot += 1; });
  outsiderSock.on('leaderboard:update', () => { outsiderGot += 1; });

  // مهلت کوتاه تا عضویتِ اتاق روی آداپتور (و در حالتِ چندپروسه روی Redis)
  // مستقر شود.
  await sleep(800);

  // ── بازیکن یک بستهٔ معتبرِ بازی ضربه‌زن می‌فرستد (امتیاز لیگ) ────────
  // لولِ ۱، فقط یک ضربه؛ سقفِ روزانهٔ یک کاربرِ تازه اجازه می‌دهد.
  const nonce = `n${uniq()}${uniq()}`;
  const batch = { taps: 1, flagged: 0, elapsedMs: 2000, level: 1, levelTaps: 1, seq: 1 };
  const sig = signBatch(player.token, batch, nonce);
  const submit = await req('POST', '/api/games/tap/progress', {
    token: player.token,
    body: { ...batch, nonce, sig },
  });
  ok('بازی ضربه‌زن بسته را پذیرفت (امتیاز/سیگنال مسیر زنده است)',
    submit.status === 200, `status=${submit.status} body=${JSON.stringify(submit.data).slice(0, 160)}`);

  // ── انتظار برای رسیدنِ رویداد به بیننده ─────────────────────────────
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && viewerGot === 0) await sleep(150);

  ok('بینندهٔ عضوِ اتاق رویدادِ leaderboard:update گرفت',
    viewerGot >= 1, `رویدادها=${viewerGot}`);

  // به سوکتِ خارج از اتاق مهلتِ اضافه می‌دهیم تا اگر قرار بود چیزی برسد
  // برسد؛ بعد ثابت می‌کنیم نرسیده.
  await sleep(1500);
  ok('سوکتِ خارج از اتاق رویداد را نگرفت (پخش فقط به مشترکین)',
    outsiderGot === 0, `رویدادهای ناخواسته=${outsiderGot}`);

  // ── بیننده بعد از unsubscribe دیگر نباید بگیرد ───────────────────────
  viewerSock.emit('leaderboard:unsubscribe');
  await sleep(500);
  const before = viewerGot;
  // یک بستهٔ دوم از بازیکن.
  const nonce2 = `n${uniq()}${uniq()}`;
  const batch2 = { taps: 1, flagged: 0, elapsedMs: 2000, level: 1, levelTaps: 2, seq: 2 };
  const sig2 = signBatch(player.token, batch2, nonce2);
  await req('POST', '/api/games/tap/progress', {
    token: player.token,
    body: { ...batch2, nonce: nonce2, sig: sig2 },
  }).catch(() => {});
  await sleep(2000);
  ok('بعد از unsubscribe دیگر رویداد به بیننده نمی‌رسد',
    viewerGot === before, `قبل=${before} بعد=${viewerGot}`);

  // ── فازِ دوم: بستنِ فصل توسط ادمین هم باید سیگنال بدهد ──────────────
  // این فاز فقط روی استیجینگ/تست اجرا می‌شود (فصلِ واقعیِ تولید نباید بسته
  // شود). متغیر TEST_SEASON_CLOSE=1 آن را فعال می‌کند و نیازمند توکن ادمین
  // (E2E_ADMIN_USER/E2E_ADMIN_PASS) است.
  if (process.env.TEST_SEASON_CLOSE === '1') {
    console.log('\n── فازِ بستنِ فصل (سیگنالِ رویدادهای نادر) ──');
    const adminUser = process.env.E2E_ADMIN_USER || 'Admin';
    const adminPass = process.env.E2E_ADMIN_PASS;
    if (!adminPass) throw new Error('TEST_SEASON_CLOSE=1 ولی E2E_ADMIN_PASS نداده‌ای');

    const adminLogin = await req('POST', '/api/admin/auth/login', {
      body: { username: adminUser, password: adminPass },
    });
    const adminToken = adminLogin.data?.token;
    ok('ادمین وارد شد (برای بستنِ فصل)', adminLogin.status === 200 && !!adminToken,
      `status=${adminLogin.status}`);

    // یک بینندهٔ تازه که عضو اتاق است.
    const closerViewer = await connect(viewer.token);
    let closeEvents = 0;
    closerViewer.emit('leaderboard:subscribe');
    closerViewer.on('leaderboard:update', () => { closeEvents += 1; });
    await sleep(700);

    // ── آماده‌سازیِ یک جایزهٔ نقدیِ واقعی برای فازِ پرداخت ────────────
    // جدولِ جوایز فصلِ جاری را طوری می‌گذاریم که رتبهٔ ۱ مبلغِ کوچکی
    // (۱۰۰۰ تومان) ببرد؛ بازیکن در بالا امتیاز/سکه ثبت کرده و برندهٔ
    // نقدی می‌شود. بعد از بستن، یک ردیفِ league_payouts منتظرِ تأیید
    // داریم تا approve-all واقعاً پول بدهد و سیگنال بفرستد.
    const prizeRes = await req('PATCH', '/api/admin/league/current/prizes', {
      token: adminToken,
      body: { prizeTable: [{ rank: 1, amount: 1000 }], winnerCount: 1 },
    });
    ok('جدولِ جوایز نقدی برای تست ذخیره شد',
      prizeRes.status === 200,
      `status=${prizeRes.status} body=${JSON.stringify(prizeRes.data).slice(0, 160)}`);

    const closeRes = await req('POST', '/api/admin/league/close', {
      token: adminToken, body: { force: true },
    });
    // بستن ممکن است «هنوز در حال اجراست» یا موفق باشد؛ در حالت force باید
    // ببندد یا فصلی برای بستن نماند. هر دو یعنی مسیر اجرا شد.
    ok('بستنِ فصل از مسیر ادمین اجرا شد',
      closeRes.status === 200,
      `status=${closeRes.status} body=${JSON.stringify(closeRes.data).slice(0, 160)}`);

    const dl = Date.now() + 8000;
    while (Date.now() < dl && closeEvents === 0) await sleep(150);
    ok('بعد از بستنِ فصل، بیننده رویدادِ leaderboard:update گرفت',
      closeEvents >= 1, `رویدادها=${closeEvents}`);

    // ── فازِ تأییدِ واریزِ جوایز (approvePayouts) ─────────────────────
    // تأیید، جایزهٔ نقدیِ برنده را به کیف‌پول واریز می‌کند و (اگر سکه
    // ریست شود/پرداختی انجام شود) سیگنالِ لیدربورد می‌دهد. بیننده را پیش
    // از تأیید با یک سوکتِ تازه آماده می‌کنیم تا رویدادِ پس از پرداخت را
    // قطعی بگیریم (نه رویدادِ بستنِ فصل را).
    const payViewer = await connect(viewer.token);
    let payEvents = 0;
    payViewer.emit('leaderboard:subscribe');
    payViewer.on('leaderboard:update', () => { payEvents += 1; });
    await sleep(700);

    const payRes = await req('POST', '/api/admin/league/payouts/approve-all', {
      token: adminToken, body: { reason: 'تست E2E تأیید واریز' },
    });
    ok('تأییدِ واریزِ جوایز از مسیر ادمین اجرا شد',
      payRes.status === 200,
      `status=${payRes.status} body=${JSON.stringify(payRes.data).slice(0, 160)}`);

    // اگر پرداختی واقعی انجام شد، سیگنال باید آمده باشد.
    const paid = Number(payRes.data?.paid || 0);
    if (paid > 0) {
      const pl = Date.now() + 8000;
      while (Date.now() < pl && payEvents === 0) await sleep(150);
      ok(`تأییدِ واریز (${paid} جایزه) سیگنالِ leaderboard:update داد`,
        payEvents >= 1, `رویدادها=${payEvents}`);
    } else {
      // پرداختی نبود (مثلاً برندهٔ نقدی در این اجرا ساخته نشد) — خودِ
      // پاسخ موفق است ولی قاعدهٔ «پرداخت ⇒ سیگنال» قابل‌سنجش نیست؛ این را
      // به‌صرافت گزارش می‌دهیم نه اینکه بی‌صدا سبز شویم.
      ok('تأییدِ واریز حداقل یک پرداخت واقعی داشت (برای سنجش سیگنال)',
        false, `paid=${paid} — جایزهٔ نقدیِ قابل‌پرداخت ساخته نشد؟`);
    }

    try { payViewer.disconnect(); } catch { /* noop */ }
    try { closerViewer.disconnect(); } catch { /* noop */ }
  }

  try { viewerSock.disconnect(); } catch { /* noop */ }
  try { outsiderSock.disconnect(); } catch { /* noop */ }

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} بررسی موفق، ${fail} ناموفق`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => {
  console.error('\n💥 تست به خطا خورد:', e.message);
  process.exit(1);
});
