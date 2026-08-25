#!/usr/bin/env node
// بازتولید باگِ «کارتِ برندهٔ راند به راند بعدی منتقل می‌شود» — دو انسان،
// یکی به سبک اندروید و یکی به سبک وب، از مسیرِ واقعیِ موتور و قوانینِ
// واقعیِ دوئل کارت. فقط I/O اینونتوری جایگزین شده.
//
// سناریو: وسطِ راندِ ۲، بازیکنِ اول کارتش را قفل می‌کند. سرور نباید
// مهرهای مکثِ نتیجه/اعلان را از نو صادر کند (وگرنه کلاینت صحنهٔ برخوردِ
// راندِ قبل — با کارتِ برنده — را وسطِ راندِ جدید دوباره پخش می‌کند) و
// نباید ساعت را به عقب برگرداند.
const assert = require('assert');
const duelService = require('../src/services/cardDuelService');

const makeCards = prefix => [70, 74, 78, 76, 82].map((stat, index) => ({
  id: `${prefix}-${index + 1}`, cardTypeId: `${prefix}-${index + 1}`,
  name: `${prefix}-${index + 1}`, attack: stat, defense: stat,
  speed: stat, technique: stat, goalChance: stat, energy: 100,
  rarity: 'normal', effect: 'none', pointValue: 100,
}));
let historyWrites = 0;
duelService.deckCards = async userId => ({ deck: { user_id: userId }, cards: makeCards(String(userId)) });
duelService.botDeck = () => makeCards('bot');
duelService.recordEngineBattle = async () => { historyWrites += 1; return {}; };

const attach = require('../src/games/engine');
const rules = require('../src/games/rules/cardDuel');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

let pass = 0, fail = 0;
const ok = (c, n, d = '') => {
  if (c) { pass++; console.log(`  ✓ ${n}`); }
  else { fail++; console.error(`  ✗ ${n}${d ? ` — ${d}` : ''}`); }
};

class Socket {
  constructor(id) {
    this.id = id;
    this.user = { id, nickname: id, current_points: 5000 };
    this.connected = true;
    this.handlers = {};
    this.events = [];
  }
  on(event, handler) { (this.handlers[event] ||= []).push(handler); }
  emit(event, data) { this.events.push({ event, data }); }
  async fire(event, data) { await Promise.all((this.handlers[event] || []).map(handler => handler(data))); }
  join() {}
  leave() {}
  last(event) { return [...this.events].reverse().find(item => item.event === event)?.data; }
  updates() { return this.events.filter(e => e.event === 'game:update').map(e => e.data); }
}

function ioHarness() {
  const connections = [];
  return {
    sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
    on(event, handler) { if (event === 'connection') connections.push(handler); },
    emit() {},
    connect(socket) {
      this.sockets.sockets.set(socket.id, socket);
      connections.forEach(handler => handler(socket));
      return socket;
    },
  };
}

(async () => {
  console.log('\n══ بازتولید: دو انسانِ واقعی (اندروید ↔ وب) ══');
  const io = ioHarness();
  attach(io, { card_duel: rules });
  const x = io.connect(new Socket('android-user'));
  const o = io.connect(new Socket('web-user'));
  await x.fire('game:join', { gameId: 'card_duel', stake: 0 });
  await o.fire('game:join', { gameId: 'card_duel', stake: 0 });
  const startX = x.last('game:start');
  ok(Boolean(startX), 'اتاق بین دو انسان ساخته شد');

  const playedX = [];
  const playedO = [];

  // ── راند ۱ ──
  let availX = startX.state.myRemainingCardIds;
  let availO = o.last('game:start').state.myRemainingCardIds;
  await x.fire('game:move', { roomId: startX.roomId, move: { cardId: availX[0] } });
  playedX.push(availX[0]);
  ok(x.last('game:update').state.iChose === true, 'راند ۱: قفلِ اندروید ثبت شد');
  await o.fire('game:move', { roomId: startX.roomId, move: { cardId: availO[0] } });
  playedO.push(availO[0]);
  const afterR1 = x.last('game:update');
  ok(afterR1.state.lastRound != null, 'راند ۱: نتیجه صادر شد');
  ok(Number(afterR1.resultHoldMs) === Number(rules.resultHoldMs),
    'راند ۱→۲: مکثِ نتیجه اعلام شد', `resultHoldMs=${afterR1.resultHoldMs}`);
  ok(!afterR1.state.myRemainingCardIds.includes(playedX[0]),
    'راند ۲: کارتِ راند ۱ در دستِ اندروید نیست (بدون انتقال)');
  ok(!o.last('game:update').state.myRemainingCardIds.includes(playedO[0]),
    'راند ۲: کارتِ راند ۱ در دستِ وب نیست (بدون انتقال)');

  // ══ قلبِ باگ: وسطِ راندِ ۲، اندروید کارتش را قفل می‌کند ══
  // سرور نباید مهرِ مکثِ نتیجهٔ راندِ ۱ را دوباره صادر کند و نباید
  // ساعتِ راندِ ۲ را ریست کند.
  const transitionRemaining = Number(afterR1.remainingMs || 0);
  ok(transitionRemaining > 20000, 'راند ۲: ساعتِ انتقال در حدود ۲۶ ثانیه است',
    `remainingMs=${transitionRemaining}`);
  // صبر می‌کنیم تا پنجرهٔ مکثِ نتیجه (۳.۲s) و اعلانِ راند (۳s) کاملاً تمام
  // شود — دقیقاً وقتی که کاربرِ واقعی می‌تواند کارتش را قفل کند.
  await wait(7000);
  availX = x.last('game:update').state.myRemainingCardIds;
  await x.fire('game:move', { roomId: startX.roomId, move: { cardId: availX[0] } });
  playedX.push(availX[0]);
  const midLock = x.last('game:update');
  ok(Number(midLock.resultHoldMs) === 0,
    'قفلِ وسطِ راند: مکثِ نتیجهٔ راندِ قبل دوباره صادر نشد (باگِ اصلی)',
    `resultHoldMs=${midLock.resultHoldMs}`);
  ok(Number(midLock.remainingMs) < transitionRemaining - 6000,
    'قفلِ وسطِ راند: ساعت ریست نشد',
    `remainingMs=${midLock.remainingMs} (انتقال ${transitionRemaining})`);
  const midLockWeb = o.last('game:update');
  ok(Number(midLockWeb.resultHoldMs) === 0,
    'سمتِ وب هم مکثِ نتیجهٔ راندِ قبل را دوباره نگرفت',
    `resultHoldMs=${midLockWeb.resultHoldMs}`);

  // ── ادامه تا پایان: هر راند باید با کارتِ جدیدِ هر دو طرف انجام شود ──
  const coR2 = o.last('game:update').state.myRemainingCardIds[0];
  await o.fire('game:move', { roomId: startX.roomId, move: { cardId: coR2 } });
  playedO.push(coR2);
  // راند ۳ تا ۵
  for (let round = 3; round <= 5; round++) {
    const sx = x.last('game:update');
    const so = o.last('game:update');
    const cx = sx.state.myRemainingCardIds[0];
    const co = so.state.myRemainingCardIds[0];
    ok(!playedX.includes(cx) && !playedO.includes(co),
      `راند ${round}: هر دو کارتِ کاملاً نو دارند (بدون انتقال از راندهای قبل)`);
    await x.fire('game:move', { roomId: startX.roomId, move: { cardId: cx } });
    await o.fire('game:move', { roomId: startX.roomId, move: { cardId: co } });
    playedX.push(cx); playedO.push(co);
  }
  ok(new Set(playedX).size === 5, 'اندروید در ۵ راند ۵ کارتِ متفاوت بازی کرد');
  ok(new Set(playedO).size === 5, 'وب در ۵ راند ۵ کارتِ متفاوت بازی کرد');
  const over = x.last('game:over');
  ok(Boolean(over), 'پنج راند تمام شد و game:over صادر شد');
  ok(['X', 'O', 'DRAW'].includes(over.winner), 'برنده معتبر است', String(over.winner));
  ok(historyWrites === 1, 'نبردِ امتیازی دقیقاً یک بار در تاریخچه ثبت شد', String(historyWrites));

  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} موفق، ${fail} ناموفق\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(err => { console.error(err); process.exit(1); });
