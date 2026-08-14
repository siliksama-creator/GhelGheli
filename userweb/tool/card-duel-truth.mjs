import assert from 'node:assert/strict';
import { matchVerdictForViewer, resultMvp, roundEffectBonus, roundForViewer } from '../src/lib/cardDuelLogic.js';

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

console.log(`\n✅ ${pass} تست حقیقت دوئل Web موفق بود\n`);
