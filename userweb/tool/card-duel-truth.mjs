import assert from 'node:assert/strict';
import { matchTension, matchVerdictForViewer, resultMvp, roundEffectBonus, roundForViewer } from '../src/lib/cardDuelLogic.js';

let pass = 0;
const ok = (condition, label) => { assert.ok(condition, label); pass += 1; console.log(`  ✓ ${label}`); };

console.log('\n== حقیقت زاویهٔ دید Web برای X/O ==');
const screenshot = {
  round: 2,
  cardX: { cardTypeId: 'jude', name: 'Jude Bellingham' },
  cardO: { cardTypeId: 'robot', name: 'ربات وینگر' },
  powerX: 95, powerO: 80,
  focusStatX: 95, focusStatO: 80,
  breakdownX: { focus: 95, effectBonus: 0, total: 95 },
  breakdownO: { focus: 80, effectBonus: 0, total: 80 },
  powerGap: 15, winner: 'X',
};
const x = roundForViewer(screenshot, 'X');
ok(x.mine.name === 'Jude Bellingham' && x.myPower === 95 && x.mineWon,
  'کاربر X، Jude و عدد ۹۵ را مال خود و برنده می‌بیند');
const o = roundForViewer(screenshot, 'O');
ok(o.mine.name === 'ربات وینگر' && o.myPower === 80 && !o.mineWon,
  'کاربر O همان payload را از سمت مقابل و بدون جابه‌جایی می‌بیند');

const reversed = { ...screenshot, cardX: screenshot.cardO, cardO: screenshot.cardX,
  powerX: 80, powerO: 95, focusStatX: 80, focusStatO: 95,
  breakdownX: screenshot.breakdownO, breakdownO: screenshot.breakdownX, winner: 'O' };
const judeAsO = roundForViewer(reversed, 'O');
ok(judeAsO.mine.name === 'Jude Bellingham' && judeAsO.myPower === 95 && judeAsO.mineWon,
  'اگر Jude روی O باشد هم کارت/عدد/برنده هم‌جهت می‌مانند');

console.log('\n== ده‌هزار قرارداد عدد/برنده ==');
for (let i = 0; i < 10000; i += 1) {
  const powerX = i % 111;
  const powerO = (i * 37) % 111;
  const winner = powerX === powerO ? 'DRAW' : powerX > powerO ? 'X' : 'O';
  const round = {
    cardX: { name: `X${i}` }, cardO: { name: `O${i}` },
    powerX, powerO, focusStatX: powerX, focusStatO: powerO,
    breakdownX: { focus: powerX, effectBonus: 0, total: powerX },
    breakdownO: { focus: powerO, effectBonus: 0, total: powerO }, winner,
  };
  assert.equal(roundForViewer(round, i % 2 ? 'X' : 'O').contractValid, true);
}
ok(true, 'هر دو زاویهٔ دید در ۱۰٬۰۰۰ نتیجه، حکم را با عدد بزرگ‌تر تطبیق دادند');

console.log('\n== نتیجهٔ آنلاین با قطع اتصال ==');
const forfeitWin = matchVerdictForViewer({
  winner: 'X', me: 'X', finishReason: 'disconnect', opponentRole: 'حریف',
});
ok(forfeitWin.iWon && forfeitWin.label === 'برد فنی برای تو',
  'resolvedWinner حتی با score ناقص، برد فنی را به صاحب درست می‌دهد');
const forfeitLoss = matchVerdictForViewer({
  winner: 'X', me: 'O', finishReason: 'disconnect', opponentRole: 'حریف',
});
ok(!forfeitLoss.iWon && forfeitLoss.label === 'برد فنی برای حریف',
  'زاویهٔ دید بازندهٔ آنلاین هم نتیجهٔ قطع اتصال را برعکس نمی‌کند');

console.log('\n== parity افکت و MVP ==');
ok(roundEffectBonus({ effect: 'speedster' }, 0, false) === 6
  && roundEffectBonus({ effect: 'playmaker' }, 2, true) === 4
  && roundEffectBonus({ effect: 'wall' }, 3, false) === 6
  && roundEffectBonus({ effect: 'finisher' }, 4, false) === 6
  && roundEffectBonus({ effect: 'lucky_star' }, 2, false) === 3,
'جدول افکت وب دقیقاً اعداد شفاف موتور را نشان می‌دهد');
const mvp = resultMvp({ history: [
  { round: 1, winner: 'X', cardX: { name: 'برد کم' }, powerX: 71, powerO: 70, powerGap: 1 },
  { round: 2, winner: 'O', cardO: { name: 'برد بزرگ' }, powerX: 50, powerO: 90, powerGap: 40 },
] });
ok(mvp?.name === 'برد بزرگ' && mvp.mvpRoundPower === 90,
  'MVP از بزرگ‌ترین برد واقعی انتخاب می‌شود');

// ═══════════════════════════════════════════════════════════════════════════
//  حرارتِ نبرد — باید با قواعدِ واقعیِ بردن هم‌خوان باشد
// ═══════════════════════════════════════════════════════════════════════════
//
// اگر این اشتباه باشد، صحنه در لحظهٔ عادی شعله می‌کشد و در لحظهٔ سرنوشت‌ساز
// خاموش می‌ماند — بدتر از نداشتنِ افکت، چون کاربر را گمراه می‌کند.
console.log('\n== حرارتِ نبرد ==');
const heat = (X, O, roundIndex = X + O, me = 'X') =>
  matchTension({ score: { X, O }, roundIndex, totalRounds: 5, me });

ok(heat(0, 0).level === 'calm', 'شروعِ نبرد آرام است');
ok(heat(2, 2).level === 'decider' && heat(2, 2).decider,
  'راند پنجم با امتیاز ۲-۲ سطحِ decider می‌گیرد');
ok(heat(2, 1).level === 'critical' && heat(2, 1).matchPoint === 'mine',
  'در ۲-۱ توپِ مسابقه دستِ من است (بردِ این راند = ۳ از ۵)');
ok(heat(1, 2).matchPoint === 'theirs',
  'در ۱-۲ توپِ مسابقه دستِ حریف است');
ok(heat(2, 1, 3, 'O').matchPoint === 'theirs',
  'همان نبرد از دیدِ حریف آینه می‌شود، نه اینکه جابه‌جا بماند');
ok(heat(3, 0).level === 'calm' && heat(3, 0).matchPoint === null,
  'وقتی نتیجه ریاضی‌وار قفل شده دیگر حرارتی نیست');
ok(heat(1, 1, 4).decider === true,
  'نبردِ پرمساوی هم اگر راندِ آخر با امتیازِ برابر برسد decider است');
ok(heat(1, 1, 2).level === 'heated' && !heat(1, 1, 2).decider,
  'همان امتیاز در راندِ سوم فقط heated است، نه decider');

// هیچ حالتِ ممکنی نباید سطحِ ناشناخته یا matchPoint متناقض بدهد.
const LEVELS = new Set(['calm', 'heated', 'critical', 'decider']);
let sane = true;
for (let X = 0; X <= 5; X += 1) {
  for (let O = 0; O + X <= 5; O += 1) {
    const t = heat(X, O);
    if (!LEVELS.has(t.level)) sane = false;
    // توپِ مسابقه فقط برای کسی که جلوتر است معنا دارد.
    if (t.matchPoint === 'mine' && X <= O) sane = false;
    if (t.matchPoint === 'theirs' && O <= X) sane = false;
    // decider یعنی برابری در راندِ آخر.
    if (t.decider && X !== O) sane = false;
  }
}
ok(sane, 'هیچ‌کدام از ۲۱ حالتِ ممکنِ امتیاز، سطح یا توپِ مسابقهٔ متناقض نمی‌دهد');

console.log(`\n✅ ${pass} تست حقیقت دوئل Web موفق بود\n`);
