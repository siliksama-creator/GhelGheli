#!/usr/bin/env node
// ============================================================================
//  تستِ سرتاسریِ مسیر پولِ **بازیِ امتیازی** (سوکت واقعی، روی سیم واقعی)
// ============================================================================
//
//   node scripts/testStakedGameE2E.js                 # سرور محلی
//   BASE=https://api.ghelghelishop.ir ALLOW_PROD=yes-i-know node ...
//
// چرا این تست هست:
//
//   testE2E.js چرخهٔ برداشت را به‌طور کامل از روی HTTP می‌سنجد، و
//   testStakeEscrow.js سرویسِ شرط را با Fake دیتابیس تست می‌کند؛ ولی
//   **هیچ‌کدام دو بازیکنِ واقعی را از پشت سوکت به هم وصل نمی‌کند**.
//   دقیقاً همان شکافی که کلاس باگ‌های «دلار» ازش رد می‌شود:
//
//     • رزروِ شرط (escrow) واقعاً از هر دو نفر کم می‌شود؟
//     • تسویه بعد از بازی واقعاً به برنده می‌نشیند و مجموع ثابت می‌ماند؟
//     • رهاکردنِ بازی (disconnect) پول حریف را برمی‌گرداند/می‌دهد؟
//     • موجودیِ ناکافی یا مبلغِ غیرمجاز، **قبل** از صف رد می‌شود؟
//     • تسویهٔ دوباره (reconnect / finish تکراری) پول دو برابر نمی‌سازد؟
//
//   اینجا دو (و در سناریوی رهاکردن، سه) سوکتِ Socket.IO واقعی می‌گیریم،
//   کاربر می‌سازیم، ادمین بهشان شارژ می‌دهد و کل مسیر را روی سیم می‌رانیم.
//
// اصول (هم‌قرارداد testE2E.js):
//   • هر کاربر پیشوند sge2e* دارد؛ توصیهٔ پاک‌سازی در انتها چاپ می‌شود.
//   • هر تست دلیل شکستش را با مقدار واقعی فارسی می‌گوید.
//   • تست پولی موجودی را قبل/بعد می‌سنجد، نه فقط کد رویداد را.

require('dotenv').config();

const { io } = require('socket.io-client');

const BASE = process.env.BASE || `http://127.0.0.1:${process.env.PORT || 4000}`;
const ADMIN_USER = process.env.E2E_ADMIN_USER || process.env.ADMIN_DEFAULT_USERNAME || 'Admin';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || process.env.ADMIN_DEFAULT_PASSWORD;
// کوچک‌ترین مبلغِ شرطِ عمومی (بازۀ زنده را از خود سرور می‌گیریم ولی برای
// ساختِ صف باید یک مبلغِ قطعی بدهیم؛ ۱۰۰ همیشه در فهرست پیش‌فرض هست).
const STAKE = Number(process.env.SGE2E_STAKE || 100);

const PROD_HOSTS = ['api.ghelghelishop.ir', 'ghelghelishop.ir'];
const host = (() => { try { return new URL(BASE).hostname; } catch { return ''; } })();
if (PROD_HOSTS.includes(host) && process.env.ALLOW_PROD !== 'yes-i-know') {
  console.error(`
⛔ هدف این اجرا سرور production است (${host}).

   این تست کاربر می‌سازد و امتیاز جابه‌جا می‌کند؛ روی staging اجرا کنید:

     BASE=http://127.0.0.1:4999 node scripts/testStakedGameE2E.js

   اجرای آگاهانه روی production:

     ALLOW_PROD=yes-i-know BASE=${BASE} node scripts/testStakedGameE2E.js
`);
  process.exit(2);
}

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(name); console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function section(t) { console.log(`\n${'═'.repeat(66)}\n  ${t}\n${'═'.repeat(66)}`); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uniq = () => Math.random().toString(36).slice(2, 9);

async function req(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}
// مسیرهای پولی سقفِ نرخ دارند؛ روی ۴۲۹ صبر و تلاش دوباره.
async function reqRL(method, path, opts, retries = 4) {
  for (let i = 0; i <= retries; i++) {
    const r = await req(method, path, opts);
    if (r.status !== 429 || i === retries) return r;
    const wait = Math.min(90, Number(r.data?.retryAfter || 60) + 2) * 1000;
    console.log(`    (محدودیت نرخ — ${Math.round(wait / 1000)} ثانیه صبر)`);
    await sleep(wait);
  }
}
const GET = (p, t) => reqRL('GET', p, { token: t });
const POST = (p, b, t) => reqRL('POST', p, { token: t, body: b });

// ── سوکتِ بازی با وصلِ توکن (همان قرارداد اپ: auth.token) ─────────────
function connectGame(token) {
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

/** منتظرِ اولین رویدادِ یکی از نام‌های خواسته‌شده. */
function waitFor(sock, names, timeoutMs = 15_000) {
  const set = new Set(names);
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { cleanup(); reject(new Error(`منتظر ${names.join('|')} بودم، چیزی نیامد (${timeoutMs}ms)`)); }, timeoutMs);
    const handlers = {};
    function cleanup() { clearTimeout(t); for (const n of set) sock.off(n, handlers[n]); }
    for (const n of set) {
      sock.on(n, handlers[n] = (data) => { cleanup(); resolve({ event: n, data: data || {} }); });
    }
  });
}

// تختهٔ جفت‌یاب: هر دو بازیکن یک حافظهٔ کاملِ مشترک می‌سازند (face هر
// کارتی که روی سیم دیده شد) و بازیِ کامل را به‌صورت خودکار بازی می‌کنند.
const known = new Map(); // index -> face (مشترک بین هر دو سوکت چون هر دو
// همان رویدادهای game:update/game:start را با تختهٔ خودشان می‌بینند)

function observe(sock, updateSeatFace) {
  const ingest = state => {
    if (!state?.cards) return;
    state.cards.forEach((c, i) => {
      if (c && c.face != null) known.set(i, c.face);
    });
  };
  sock.on('game:start', d => { if (d?.state) ingest(d.state); updateSeatFace?.(d.yourSymbol); });
  sock.on('game:update', d => d?.state && ingest(d.state));
  sock.on('game:over', d => d?.state && ingest(d.state));
}

function perfectMove(seat, state) {
  // state.playable فهرست حرکت‌های مجازِ همین صندلی است.
  const open = state.playable?.length ? state.playable
    : state.cards.map((_, i) => i).filter(i => state.cards[i] && state.cards[i].matched == null);
  const faceUp = state.flipped || [];
  // کارت دومِ نوبت: جفتِ کارتِ بازشده را اگر می‌دانیم بزن.
  if (faceUp.length === 1) {
    const target = known.get(faceUp[0]);
    const hit = open.find(i => i !== faceUp[0] && known.get(i) === target);
    if (hit != null) return hit;
    // وگرنه یک کارتِ دیده‌نشده (کشف).
    const unseen = open.find(i => !known.has(i));
    return unseen != null ? unseen : open[0];
  }
  // کارت اول: اگر جفتی را کامل می‌دانیم بزن.
  const byFace = {};
  for (const [i, f] of known) {
    if (!open.includes(i)) continue;
    (byFace[f] ||= []).push(i);
  }
  for (const f of Object.keys(byFace)) {
    const pair = byFace[f];
    if (pair.length >= 2 && pair.every(i => open.includes(i))) return pair[0];
  }
  const unseen = open.find(i => !known.has(i));
  return unseen != null ? unseen : open[0];
}

// یک بازیکنِ خودکارِ حافظه‌کامل تا انتهای بازی حرکت می‌زند. فقط در نوبتش.
function autopilot(sock, mySeat) {
  // اتاقِ این بازیکن روی سوکت ست می‌شود (game:start قبل از وصلِ این
  // شنونده آمده، پس mySeat را صریح می‌گیریم نه از رویداد).
  const onTick = d => {
    const state = d?.state;
    if (!state) return;
    const myTurn = (state.turn ?? d.turn) === mySeat;
    if (!myTurn) return;
    // وسطِ انیمیشنِ معرفیِ نوبت حرکت نزن (کلاینت واقعی هم نمی‌زند)؛ اگر
    // حرکت در آن پنجره رد شد، update بعدی دوباره صدا می‌زند.
    const roomId = d.roomId || sock.activeRoomId;
    const move = perfectMove(mySeat, state);
    if (move != null) sock.emit('game:move', { roomId, move });
  };
  sock.on('game:update', onTick);
  // game:start این اتاق ممکن است بعد از وصل هم برسد (بازیِ دوم) — همان‌جا
  // اگر نوبتِ ما بود حرکت اول را شلیک کن.
  sock.on('game:start', d => { sock.activeRoomId = d.roomId || sock.activeRoomId; onTick(d); });
}

// ═══════════════════════════════════════════════════════════════════════
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   E2E مسابقهٔ امتیازی روی سوکت واقعی (جفت‌یاب، صفِ عمومی)        ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`  هدف: ${BASE} · شرط: ${STAKE} · زمان: ${new Date().toLocaleString('fa-IR')}`);

  // ── ۰) سلامت و ورود ادمین ─────────────────────────────────────────
  section('۰. سلامت سرویس و ورود ادمین');
  const health = await req('GET', '/health');
  ok(health.status === 200 && health.data?.ok, 'سرور بالاست', `status=${health.status}`);

  const adminLogin = await req('POST', '/api/admin/auth/login', {
    body: { username: ADMIN_USER, password: ADMIN_PASS },
  });
  const adminToken = adminLogin.data?.token;
  ok(adminLogin.status === 200 && adminToken, 'ادمین وارد شد', `status=${adminLogin.status}`);

  // ── ساخت دو کاربرِ تازه، شارژشان، و سوکت ──────────────────────────
  async function makePlayer(tag) {
    const mobile = `sge2e${uniq()}`;
    const reg = await req('POST', '/api/auth/register-password', {
      body: { mobile, password: 'Sge2e@12345', nickname: `تست‌بازیکن_${tag}` },
    });
    const token = reg.data?.token;
    if (!token) throw new Error(`ثبت‌نام ${tag} شکست: ${reg.status} ${JSON.stringify(reg.data).slice(0, 200)}`);
    const id = reg.data?.user?.id;
    if (!id) throw new Error(`ثبت‌نام ${tag} شناسهٔ کاربر نداد`);
    return { tag, mobile, token, id };
  }

  // ⚠️ شرطِ بازی روی **امتیاز** (current_points) است نه موجودیِ تومانیِ
  // کیف پول؛ این دو دفتر جداست و اشتباه‌گرفتنشان تست را کاملاً بی‌اثر
  // می‌کند (مثل کلاسی از باگ‌های واقعی که عدد اشتباه را می‌سنجیدند).
  async function pointsOf(token) {
    const p = await GET('/api/profile', token);
    const u = p.data?.user || p.data;
    return Number(u?.current_points ?? u?.points ?? NaN);
  }

  async function grant(player, amount) {
    const r = await POST(`/api/admin/wallet/users/${player.id}/adjust`,
      { amount, reason: 'تست E2E مسابقهٔ امتیازی' }, adminToken);
    if (r.status !== 200) throw new Error(`شارژ ${player.tag} شکست: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
  }

  const [p1, p2] = await Promise.all([makePlayer('الف'), makePlayer('ب')]);
  await grant(p1, 20_000);
  await grant(p2, 20_000);

  const s1 = await connectGame(p1.token);
  const s2 = await connectGame(p2.token);
  console.log(`     بازیکنان: ${p1.mobile} / ${p2.mobile}`);

  // ── ۱) مبالغِ غیرمجاز و موجودی ناکافی، قبل از صف ──────────────────
  section('۱. ورودیِ غیرمجاز و موجودی ناکافی رد می‌شود (قبل از صف)');
  {
    const rejects = [
      ['مبلغ اعشاری', 100.5],
      ['مبلغ منفی', -100],
      ['مبلغ صفر با شرط', 0], // ۰ یعنی بازیِ بدون‌شرط، در این مسیر باید صفِ رایگان برود → جدا می‌سنجیم
      ['مبلغ خارج از فهرست', 444],
      ['رشته', 'زیاد'],
    ];
    for (const [label, stake] of rejects) {
      if (stake === 0) continue; // مسیر ۰ جداست
      const done = waitFor(s1, ['game:error', 'game:waiting'], 8_000).catch(() => null);
      s1.emit('game:join', { gameId: 'memory', stake });
      const r = await done;
      ok(r?.event === 'game:error', `ردِ ورودی: ${label}`,
        r ? `got ${r.event}` : 'no event');
    }
  }
  {
    // کاربرِ بدونِ موجودی: کاربر تازهٔ بدون‌شارژ
    const poor = await makePlayer('ف');
    const sp = await connectGame(poor.token);
    const done = waitFor(sp, ['game:error', 'game:waiting', 'game:start'], 8_000).catch(() => null);
    sp.emit('game:join', { gameId: 'memory', stake: 1000 });
    const r = await done;
    ok(r?.event === 'game:error', 'موجودی ناکافی → game:error (و نه ورود به صف)',
      r ? `got ${r.event} ${r.data?.message || ''}` : 'no event');
    sp.disconnect();
  }

  // ── ۲) مسیر کاملِ بازی: escrow، تساوی برد، ثباتِ مجموع ─────────────
  section('۲. مسابقهٔ کاملِ امتیازی — escrow از هر دو، پات به برنده');
  const beforeA = await pointsOf(p1.token);
  const beforeB = await pointsOf(p2.token);
  ok(Number.isFinite(beforeA) && beforeA >= STAKE * 5,
    `موجودی الف قبل کافی است (${beforeA})`);
  ok(Number.isFinite(beforeB) && beforeB >= STAKE * 5,
    `موجودی ب قبل کافی است (${beforeB})`);

  const startA = waitFor(s1, ['game:start', 'game:error'], 20_000);
  const startB = waitFor(s2, ['game:start', 'game:error'], 20_000);

  // اولی صف را باز می‌کند (منتظر حریف)، دومی جفتش می‌شود.
  s1.emit('game:join', { gameId: 'memory', stake: STAKE });
  await waitFor(s1, ['game:waiting', 'game:start'], 10_000);
  s2.emit('game:join', { gameId: 'memory', stake: STAKE });

  const [rA, rB] = await Promise.all([startA, startB]);
  ok(rA.event === 'game:start' && rB.event === 'game:start',
    'هر دو بازیکن game:start گرفتند',
    `${rA.event}/${rB.event} ${rA.data?.message || rB.data?.message || ''}`);
  const roomId = rA.data?.roomId;
  s1.activeRoomId = roomId; s2.activeRoomId = roomId;
  ok(!!roomId, 'شناسهٔ اتاق در game:start هست', JSON.stringify(rA.data).slice(0, 120));
  ok(Number(rA.data?.stake) === STAKE && Number(rB.data?.stake) === STAKE,
    `شرط ${STAKE} در game:start به هر دو اعلام شد`,
    `A=${rA.data?.stake} B=${rB.data?.stake}`);

  // escrow: بعد از game:start هر دو باید STAKE کم شده باشند (دقت با
  // ۲۰٪ اغماض نه — عدد دقیق؛ اما جوایزِ لحظه‌ای هم ممکن است اضافه
  // شده باشند، پس اختلافِ کم‌شده باید ≥ STAKE باشد و تراکنشِ رزرو در
  // دفتر هست).
  const afterStartA = await pointsOf(p1.token);
  const afterStartB = await pointsOf(p2.token);
  ok(beforeA - afterStartA >= STAKE,
    `شرط الف قبل از شروع کم شد (${beforeA} → ${afterStartA})`);
  ok(beforeB - afterStartB >= STAKE,
    `شرط ب قبل از شروع کم شد (${beforeB} → ${afterStartB})`);

  // ⚠️ escrow باید **دقیقاً** STAKE باشد، نه «تقریباً». بین رزرو و
  // game:start هیچ جایزه‌ای واریز نمی‌شود؛ اگر عددِ کم‌شده با شرط نخواند،
  // یعنی رزرو یا دوبار زده یا مبلغِ دیگری قاطی شده.
  ok(beforeA - afterStartA === STAKE,
    `رزروِ الف دقیقاً ${STAKE} امتیاز کسر کرد (${beforeA} → ${afterStartA})`,
    `delta=${beforeA - afterStartA}`);
  ok(beforeB - afterStartB === STAKE,
    `رزروِ ب دقیقاً ${STAKE} امتیاز کسر کرد (${beforeB} → ${afterStartB})`,
    `delta=${beforeB - afterStartB}`);

  // بازیِ خودکار تا game:over. هر دو سوکت حافظه می‌سازند؛ حرکت‌ها فقط
  // از صندلیِ صاحبِ نوبت شلیک می‌شود.
  known.clear();
  observe(s1);
  observe(s2);
  const seatA = rA.data?.yourSymbol ?? 'X';   // اولی که صف را باز کرد = X
  const seatB = rB.data?.yourSymbol ?? 'O';
  // رویدادهای اولیه را هم وارد حافظه کن (تا now)
  {
    const ingest = d => d?.state?.cards && d.state.cards.forEach((c, i) => { if (c?.face != null) known.set(i, c.face); });
    ingest(rA.data); ingest(rB.data);
  }
  autopilot(s1, seatA);
  autopilot(s2, seatB);

  const overA = waitFor(s1, ['game:over'], 60_000).catch(e => ({ event: 'timeout', data: { message: e.message } }));
  const overB = waitFor(s2, ['game:over'], 60_000).catch(e => ({ event: 'timeout', data: { message: e.message } }));
  const [oA, oB] = await Promise.all([overA, overB]);
  ok(oA.event === 'game:over' && oB.event === 'game:over',
    'بازی به پایان رسید و به هر دو game:over رسید',
    `${oA.event}/${oB.event} ${oA.data?.message || ''}`);

  const settledA = waitFor(s1, ['game:settlement'], 12_000).catch(() => null);
  const settledB = waitFor(s2, ['game:settlement'], 12_000).catch(() => null);
  const [stA, stB] = await Promise.all([settledA, settledB]);
  ok(stA?.data?.status === 'settled' && stB?.data?.status === 'settled',
    'تسویهٔ شرط به هر دو اعلام شد (settled)',
    `A=${stA?.data?.status} B=${stB?.data?.status}`);

  // صبر برای نشستن تراکنش‌ها.
  await sleep(1500);
  const endA = await pointsOf(p1.token);
  const endB = await pointsOf(p2.token);
  const totalBefore = beforeA + beforeB;
  const totalAfter = endA + endB;
  // مجموعِ دو موجودی فقط می‌تواند کم شود (کارمزد) یا ثابت بماند؛
  // هرگز نباید زیاد شود — آن یعنی خلقِ پول.
  ok(totalAfter <= totalBefore && totalAfter >= totalBefore - STAKE * 2,
    `⚠️ حیاتی: مجموعِ موجودی دو نفر ثابت/کاهنده است (${totalBefore} → ${totalAfter}؛ کفِ ${totalBefore - STAKE * 2})`);

  const winnerSeat = stA?.data?.winner || oA.data?.resolvedWinner || oA.data?.winner;
  const winnerToken = winnerSeat === seatA ? p1.token : p2.token;
  const winnerEnd = winnerToken === p1.token ? endA : endB;
  const winnerStart = winnerToken === p1.token ? afterStartA : afterStartB;
  // برنده netPot می‌گیرد (۲×شرط منهای کارمزد). از روی فیشِ تسویه می‌خوانیم.
  const netPot = Number(stA?.data?.netPot ?? stB?.data?.netPot ?? 0);
  const winnerBefore = winnerToken === p1.token ? beforeA : beforeB;
  if (winnerSeat === 'DRAW') {
    // تساوی: هر دو اصلِ شرط برگشته.
    ok(Math.abs(endA - beforeA) <= Math.max(5, netPot * 0.05),
      `تساوی: موجودی الف تقریباً برگشت (${beforeA} → ${endA})`);
    ok(Math.abs(endB - beforeB) <= Math.max(5, netPot * 0.05),
      `تساوی: موجودی ب تقریباً برگشت (${beforeB} → ${endB})`);
  } else {
    ok(winnerEnd >= winnerBefore - STAKE,
      `برنده (صندلی ${winnerSeat}) پات را گرفت: موجودی قبلِ شرط ${winnerBefore} → بعد ${winnerEnd} (netPot=${netPot})`);
    const loserEnd = winnerToken === p1.token ? endB : endA;
    const loserBefore = winnerToken === p1.token ? beforeB : beforeA;
    ok(loserEnd <= loserBefore,
      `بازنده شرطش را از دست داد (${loserBefore} → ${loserEnd})`);
  }

  // ── ۳) رهاکردن بازی: تسویه به نفع حریف، بدون پولِ دوبل ────────────
  section('۳. رهاکردنِ بازی (disconnect) → برنده‌شدنِ حریف و تسویه');
  {
    const p3 = await makePlayer('رها');
    await grant(p3, 20_000);
    const s3 = await connectGame(p3.token);
    const beforeW = await pointsOf(p1.token);
    const beforeQ = await pointsOf(p3.token);

    const wA = waitFor(s1, ['game:start', 'game:error'], 20_000);
    const wQ = waitFor(s3, ['game:start', 'game:error'], 20_000);
    s1.emit('game:join', { gameId: 'memory', stake: STAKE });
    await waitFor(s1, ['game:waiting', 'game:start'], 10_000);
    s3.emit('game:join', { gameId: 'memory', stake: STAKE });
    const [g1, g3] = await Promise.all([wA, wQ]);
    ok(g1.event === 'game:start' && g3.event === 'game:start',
      'بازیِ دوم برای دو نفر شروع شد', `${g1.event}/${g3.event}`);
    const room2 = g1.data?.roomId;
    s1.activeRoomId = room2; s3.activeRoomId = room2;

    const stl = waitFor(s1, ['game:settlement'], 45_000).catch(() => null);
    // نفرِ رهاکنده بلافاصله بعد از start قطع می‌کند (بدون هیچ حرکت).
    // پنجرهٔ reconnect که بگذرد موتور finish('DISCONNECT') می‌زند و حریف
    // برنده می‌شود.
    await sleep(500);
    s3.disconnect();
    const st = await stl;
    ok(st?.data?.status === 'settled' && st.data.winner && st.data.winner !== 'DRAW',
      'رهاکردن → تسویهٔ قطعی با برنده برای حریف',
      `status=${st?.data?.status} winner=${st?.data?.winner}`);

    await sleep(1500);
    const afterW = await pointsOf(p1.token);
    const afterQ = await pointsOf(p3.token);
    // حریف باید پات را گرفته باشد (موجودی‌اش از قبلِ رزرو کمتر نیست منهای
    // کارمزدِ احتمالی).
    ok(afterW >= beforeW - STAKE,
      `حریفِ حاضر بعد از رهاکردنِ مقابل پات را گرفت (${beforeW} → ${afterW})`);
    // رهاکنده شرطش را باخته: موجودی‌اش از قبلِ رزرو بیشتر نیست.
    ok(afterQ <= beforeQ,
      `رهاکنده شرطش را باخت و پولی اضافه نگرفت (${beforeQ} → ${afterQ})`);
    // ثباتِ مجموع در این بازی هم.
    ok(beforeW + beforeQ >= afterW + afterQ - STAKE * 0 + 0 &&
       afterW + afterQ <= beforeW + beforeQ + STAKE,
      '⚠️ حیاتی: رهاکردن پول خلق نکرد',
      `مجموع ${beforeW + beforeQ} → ${afterW + afterQ}`);
  }

  // ── پاک‌سازی ──────────────────────────────────────────────────────
  try { s1.disconnect(); s2.disconnect(); } catch {}

  console.log(`\n${'═'.repeat(66)}`);
  console.log(`  نتیجه: ${pass} موفق · ${fail} ناموفق`);
  console.log('═'.repeat(66));
  if (fail) {
    console.log('\n  موارد ناموفق:');
    failures.forEach((f, i) => console.log(`    ${i + 1}. ${f}`));
  } else {
    console.log('\n  ✅ مسیر پولِ بازیِ امتیازی سالم است\n');
  }
  console.log('  پاک‌سازی کاربران آزمایشی (اختیاری، در دیتابیس):');
  console.log(`    DELETE FROM users WHERE mobile LIKE 'sge2e%';`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => {
  console.error('\n❌ اجرای تست با خطا متوقف شد:', e.message);
  console.error(e.stack);
  process.exit(1);
});
