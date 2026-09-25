#!/usr/bin/env node
/**
 * «سیستم به‌جای بازیکنِ قطع‌شده بازی می‌کند» — از مسیرِ واقعیِ موتور.
 *
 * خواستهٔ مالک (۴ مهر ۱۴۰۵): «اگه وسط بازی دوعل کارت یا دوعل طوفان بازیکن
 * دیسکانکت شد و طی زمان مشخص شده برنگشت سیستم بهترین کارت هاشو برای اون
 * راند ها انتخاب کنه و در آخر بصورت پیام قسمت نوتیفکشن بره که چه اتفاقی
 * برای راند افتاده — فقط نیاز به پوش نوتیفیکیشن نیست.»
 *
 * چه چیزی این‌جا سنجیده می‌شود (هر کدام یک ادعای مستقل):
 *   ۱. قطعیِ بازیکن ⇒ بعد از پنجرهٔ زمان، **مسابقه بسته نمی‌شود** و
 *      حریف پیام `game:opponent_autoplay` می‌گیرد.
 *   ۲. سیستم برای هر راند **بهترین** کارتِ او را می‌گذارد — نه یک کارتِ
 *      تصادفی و نه کارتِ ضعیف: خروجی با `rules.bestMove` مو‌به‌مو یکی است.
 *   ۳. مسابقه تا پایان ادامه می‌یابد (نتیجهٔ واقعی، نه `DISCONNECT`).
 *   ۴. اعلانِ پایان: یک ردیف با `push:false` و متنی که می‌گوید چه اتفاقی
 *      افتاد (تعداد راندها + نام کارت‌ها + نتیجه).
 *   ۵. بازگشتِ کاربر: کنترل پس گرفته می‌شود و دیگر حرکتِ خودکار نمی‌گذارد.
 *   ۶. قواعدی که `bestMove` ندارند (مثل بقیهٔ بازی‌ها) همان رفتارِ قبلی
 *      را نگه می‌دارند: پنجره که تمام شود، باختِ قطعی.
 *
 * ⚠️ ثانیه‌ها واقعی نیستند: پنجرهٔ بازگشت به ۱ ثانیه و تأخیرِ حرکتِ خودکار
 *    به ۵۰ میلی‌ثانیه تنظیم می‌شود. هیچ اتصالی به دیتابیس هم وجود ندارد
 *    (اعلان از درّهٔ تست نوشته می‌شود، نه از سرویسِ واقعی).
 */
const assert = require('assert');
const duelService = require('../src/services/cardDuelService');

// ── ایونتوری جایگزین: هر بازیکن پنج کارتِ متفاوت، تا «بهترین» معنا داشته باشد
const makeCards = prefix =>
  [30, 55, 70, 85, 95].map((stat, index) => ({
    id: `${prefix}-${index + 1}`,
    cardTypeId: `${prefix}-${index + 1}`,
    name: `${prefix}-${index + 1}`,
    attack: stat, defense: stat, speed: stat, technique: stat, goalChance: stat,
    energy: 100, rarity: 'normal', effect: 'none', pointValue: 100,
  }));
duelService.deckCards = async userId => ({ deck: { user_id: userId }, cards: makeCards(String(userId)) });
duelService.botDeck = () => makeCards('bot');
duelService.recordEngineBattle = async () => ({});

// ── پنجرهٔ بازگشت: ۱ ثانیه به‌جای ۲۵ (تست نباید ثانیه‌ها منتظر بماند)
const liveContent = require('../src/services/liveContent');
const realRules = liveContent.rules.bind(liveContent);
liveContent.rules = () => ({ ...realRules(), reconnectSeconds: 1 });

const attach = require('../src/games/engine');
const rules = require('../src/games/rules/cardDuel');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

let pass = 0, fail = 0;
const ok = (cond, name, detail = '') => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
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
  async fire(event, data) { await Promise.all((this.handlers[event] || []).map(h => h(data))); }
  join() {}
  leave() {}
  last(event) { return [...this.events].reverse().find(e => e.event === event)?.data; }
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

const notifications = [];
attach.__setNotifier((userId, type, title, body, opts) => {
  notifications.push({ userId, type, title, body, opts });
  return Promise.resolve({ id: `n${notifications.length}` });
});
attach.__setAutopilotDelay(50);

(async () => {
  console.log('\n══ ۱. قطعیِ بازیکن ⇒ امانت‌گیری، نه باخت ══');
  const io = ioHarness();
  attach(io, { card_duel: rules });
  const x = io.connect(new Socket('player-x'));
  const o = io.connect(new Socket('player-o'));
  await x.fire('game:join', { gameId: 'card_duel', stake: 0 });
  await o.fire('game:join', { gameId: 'card_duel', stake: 0 });
  const start = x.last('game:start');
  ok(Boolean(start), 'اتاقِ دو انسان ساخته شد');

  // ── راند ۱ را کامل بازی کن تا راند ۲ شروع شود
  let handX = x.last('game:update')?.state?.myRemainingCardIds || start.state.myRemainingCardIds;
  let handO = o.last('game:start').state.myRemainingCardIds;
  await x.fire('game:move', { roomId: start.roomId, move: { cardId: handX[0] } });
  await o.fire('game:move', { roomId: start.roomId, move: { cardId: handO[0] } });
  await wait(200);
  ok(Boolean(x.last('game:update')?.state?.lastRound), 'راند ۱ حل شد');

  // ── X وسطِ مسابقه قطع می‌شود
  x.connected = false;
  await x.fire('disconnect', {});
  ok(Boolean(o.last('game:opponent_reconnecting')), 'حریف پیامِ «اتصال ناپایدار» گرفت');

  await wait(1300);   // پنجرهٔ ۱ ثانیه‌ای تمام می‌شود

  const autoplayMsg = o.last('game:opponent_autoplay');
  ok(Boolean(autoplayMsg), 'پیامِ «سیستم جای حریف بازی می‌کند» رسید');
  ok(!o.last('game:over'), 'مسابقه بسته نشد (رفتارِ قبلی: باختِ قطعی)');

  console.log('\n══ ۲. حرکتِ خودکار = بهترین کارتِ همان راند ══');
  await wait(300);
  const roomId = start.roomId;
  const room = attach.rooms.get(roomId);
  ok(Boolean(room), 'اتاق هنوز زنده است');
  const myHand = room.state.remaining.X;
  const expected = rules.bestMove(room.state, 'X');
  const playedAuto = room.state.pending.X;
  ok(Boolean(playedAuto), 'سیستم برای X کارت گذاشت', `pending=${playedAuto}`);
  ok(String(playedAuto) === String(expected?.cardId),
    'همان کارتی که bestMove انتخاب می‌کند', `انتظار=${expected?.cardId} شد=${playedAuto}`);
  const bestStat = Math.max(...myHand.map(id => {
    const c = room.state.decks.X.find(card => String(card.cardTypeId || card.id) === String(id));
    return duelService.focusStatOf(c, duelService.ROUND_FOCUS[room.state.roundIndex]);
  }));
  const playedStat = (() => {
    const c = room.state.decks.X.find(card => String(card.cardTypeId || card.id) === String(playedAuto));
    return duelService.focusStatOf(c, duelService.ROUND_FOCUS[room.state.roundIndex]);
  })();
  ok(playedStat === bestStat, 'عددِ ویژگیِ کارتِ انتخابی بیشینهٔ دست است',
    `انتخابی=${playedStat} بیشینه=${bestStat}`);

  console.log('\n══ ۳. مسابقه تا پایان ادامه می‌یابد ══');
  // راندِ آخر با مکثِ نمایشِ نتیجه بسته می‌شود (`resultHoldMs` ۳.۲ ثانیه)
  // — همان چیزی که کاربر روی صفحه می‌بیند. پس تا آن‌جا صبر می‌کنیم.
  for (let i = 0; i < 60 && !room.done; i += 1) {
    if (room.finalizing || room.state.pending.O || !room.state.remaining.O.length) {
      await wait(300);
      continue;
    }
    const hand = room.state.remaining.O;
    await o.fire('game:move', { roomId, move: { cardId: hand[i % hand.length] } });
    await wait(300);
  }
  await wait(400);
  const over = o.last('game:over');
  ok(Boolean(over), 'مسابقه تمام شد');
  ok(over && over.winner !== 'DISCONNECT',
    'نتیجه از نوعِ قطعی نیست (بازی واقعاً تمام شد)', `winner=${over && over.winner}`);
  ok(room.done, 'اتاق بسته شد');

  console.log('\n══ ۴. اعلانِ پایانِ مسابقه (بدونِ پوش) ══');
  const note = notifications.find(n => n.userId === 'player-x');
  const playedRounds = (room.autopilot?.X?.rounds || []).length;
  ok(Boolean(note), 'اعلان برای بازیکنِ غایب ثبت شد');
  ok(note?.opts?.push === false, 'اعلان پوش نمی‌شود (push:false)');
  ok(playedRounds >= 3, 'سیستم چند راند بازی کرده (نه فقط یکی)', `راندها=${playedRounds}`);
  ok(note?.type === 'duel_autoplay', 'نوعِ اعلان درست است');
  ok(/راند/.test(note?.body || ''), 'متن می‌گوید چه اتفاقی برای راندها افتاد', note?.body);
  ok(/player-o|حریف/.test(note?.body || ''), 'نامِ حریف در متن هست');
  ok(!notifications.some(n => n.userId === 'player-o'),
    'برای حریفی که خودش بازی کرد اعلانی ساخته نشد');

  console.log('\n══ ۵. بازگشتِ کاربر: کنترل پس گرفته می‌شود ══');
  const notificationsBefore = notifications.length;
  const io2 = ioHarness();
  attach(io2, { card_duel: rules });
  const a = io2.connect(new Socket('back-a'));
  const b = io2.connect(new Socket('back-b'));
  await a.fire('game:join', { gameId: 'card_duel', stake: 0 });
  await b.fire('game:join', { gameId: 'card_duel', stake: 0 });
  const s2 = a.last('game:start');
  a.connected = false;
  await a.fire('disconnect', {});
  await wait(1300);
  const slot = attach.rooms.get(s2.roomId)?.autopilot?.X;
  ok(Boolean(slot && !slot.released), 'صندلیِ X در حالتِ امانت است');

  const back = io2.connect(new Socket('back-a'));
  back.user = a.user;
  await wait(120);
  const room2 = attach.rooms.get(s2.roomId);
  ok(room2?.autopilot?.X?.released === true, 'با برگشتِ کاربر، امانت آزاد شد');
  ok((room2?.autopilot?.X?.rounds || []).length > 0,
    'سابقهٔ راندهای خودکار برای پیامِ پایان حفظ شد',
    `راندها=${(room2?.autopilot?.X?.rounds || []).length}`);
  ok(Boolean(back.last('game:resume')), 'کاربر بستهٔ ازسرگیری گرفت');
  const pendingAfterReturn = room2?.state.pending.X;
  await wait(400);
  ok(!room2?.state.pending.X || room2.state.pending.X === pendingAfterReturn,
    'سیستم بعد از بازگشت حرکتِ خودکار نمی‌گذارد');
  ok(notifications.length === notificationsBefore, 'مسابقهٔ نیمه‌کاره اعلان نساخت');

  console.log('\n══ ۶. بازی‌های بدونِ bestMove ⇒ همان رفتارِ قبلی ══');
  const noBest = { ...rules };
  delete noBest.bestMove;
  const io3 = ioHarness();
  attach(io3, { card_duel: noBest });
  const c = io3.connect(new Socket('old-c'));
  const d = io3.connect(new Socket('old-d'));
  await c.fire('game:join', { gameId: 'card_duel', stake: 0 });
  await d.fire('game:join', { gameId: 'card_duel', stake: 0 });
  await wait(100);
  c.connected = false;
  await c.fire('disconnect', {});
  await wait(1400);
  const over3 = d.last('game:over');
  ok(Boolean(over3), 'مسابقه بعد از پنجره بسته شد');
  ok(over3?.winner === 'DISCONNECT' || over3?.resolvedWinner === 'O',
    'همان حکمِ قبلی: باختِ بازیکنِ قطع‌شده', JSON.stringify(over3));

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} موفق، ${fail} ناموفق\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('خطای غیرمنتظره:', e); process.exit(1); });
