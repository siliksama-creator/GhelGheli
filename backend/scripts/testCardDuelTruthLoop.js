#!/usr/bin/env node
/**
 * نگهبان حقیقتِ لوپ پنج‌گانهٔ دوئل.
 *
 * این تست فقط «بازی تمام شد» را نمی‌سنجد. در تک‌تک راندها ثابت می‌کند:
 *   ۱) عدد بزرگ‌تر همان برنده است؛ مساوی فقط برای دو عدد برابر است.
 *   ۲) امتیاز از history حکم‌ها مشتق می‌شود و نمی‌تواند جداگانه منحرف شود.
 *   ۳) X و O، ربات و آنلاین، برای هر بیننده به صاحب درست نگاشت می‌شوند.
 *   ۴) هر کارت یک بار مصرف می‌شود و راند ششم وجود ندارد.
 */
const assert = require('assert');
const duel = require('../src/services/cardDuelService');
const rules = require('../src/games/rules/cardDuel');

let pass = 0;
function ok(condition, title, detail = '') {
  assert.ok(condition, `${title}${detail ? ` — ${detail}` : ''}`);
  pass += 1;
  console.log(`  ✓ ${title}`);
}

function card(id, values = {}) {
  return duel.publicCard({
    card_type_id: id,
    name: values.name || id,
    point_value: values.points ?? 5000,
    duel_speed: values.speed ?? 50,
    duel_technique: values.technique ?? 50,
    duel_attack: values.attack ?? 50,
    duel_defense: values.defense ?? 50,
    duel_goal_chance: values.goalChance ?? 50,
    duel_energy: values.energy ?? 100,
    duel_rarity: values.rarity || 'gold',
    duel_effect: values.effect || 'none',
  });
}

function expectedWinner(round) {
  if (round.powerX === round.powerO) return 'DRAW';
  return round.powerX > round.powerO ? 'X' : 'O';
}

function perspective(round, mine) {
  return mine === 'O'
    ? {
      myCard: round.cardO, opponentCard: round.cardX,
      myPower: round.powerO, opponentPower: round.powerX,
      iWon: round.winner === 'O',
    }
    : {
      myCard: round.cardX, opponentCard: round.cardO,
      myPower: round.powerX, opponentPower: round.powerO,
      iWon: round.winner === 'X',
    };
}

console.log('\n== بازسازی دقیق اسکرین‌شات Jude Bellingham ==');
{
  const jude = card('jude', { name: 'Jude Bellingham', technique: 95 });
  const robot = card('robot', { name: 'ربات وینگر', technique: 80 });
  const round = duel.resolveRound(jude, robot, 1, null, null, 'screenshot');
  // پایهٔ تصمیم همچنان همان تکنیکِ روی کارت است؛ شانس فقط جزءِ آشکارِ
  // کوچکی روی آن است. اختلافِ ۱۵ واحد از دامنهٔ شانس (±۶) بزرگ‌تر است،
  // پس نتیجه هنوز قطعی است — دقیقاً همان چیزی که به کاربر قول داده‌ایم.
  ok(round.breakdownX.focus === 95 && round.breakdownO.focus === 80,
    'دو عددِ پایهٔ تصمیم همان تکنیک‌های ۹۵ و ۸۰ هستند');
  ok(round.powerX === 95 + round.breakdownX.luck
    && round.powerO === 80 + round.breakdownO.luck,
    'عددِ نهایی = تکنیک + شانسِ آشکار');
  ok(round.winner === 'X' && round.winnerCardId === 'jude',
    'Jude چون ۹۵ > ۸۰ است برنده می‌شود، نه به‌خاطر جای کارت');
  ok(round.breakdownX.total
    === round.breakdownX.focus + round.breakdownX.effectBonus + round.breakdownX.luck,
    'فرمول Jude دقیقاً ویژگی + افکت آشکار + شانس آشکار است');

  // اختلافِ بزرگ‌تر از ۲×دامنهٔ شانس هرگز وارونه نمی‌شود — این را روی
  // seedهای زیاد می‌سنجیم، نه یک نمونه.
  let flips = 0;
  for (let i = 0; i < 5000; i += 1) {
    if (duel.resolveRound(jude, robot, 1, null, null, `gap-${i}`).winner !== 'X') flips += 1;
  }
  ok(flips === 0, `اختلافِ ۱۵ واحد در ۵۰۰۰ seed هرگز وارونه نشد (${flips} وارونگی)`);

  const reversed = duel.resolveRound(robot, jude, 1, null, null, 'screenshot-reversed');
  const seenByO = perspective(reversed, 'O');
  ok(reversed.winner === 'O' && seenByO.iWon && seenByO.myCard.name === 'Jude Bellingham',
    'اگر کاربر O باشد هم همان Jude به‌عنوان کارتِ خودِ کاربر برنده دیده می‌شود');
}

console.log('\n== افکت‌ها آشکارند و شانس پنهان نیست ==');
{
  const speedy = card('speedy', { speed: 70, effect: 'speedster' });
  const plain = card('plain', { speed: 75 });
  const round = duel.resolveRound(speedy, plain, 0, null, null, 'effect');
  ok(round.breakdownX.focus === 70 && round.breakdownX.effectBonus === 6,
    'افکت سرعت به‌صورت ۷۰ + ۶ آشکار است');
  ok(round.powerX === 70 + 6 + round.breakdownX.luck,
    'عددِ نهایی دقیقاً ویژگی + افکت + شانسِ اعلام‌شده است');

  // ⚠️ این ادعا عوض شد. قبلاً می‌گفت «seed نتیجه را عوض نمی‌کند» چون
  // منطق کاملاً قطعی بود. حالا شانسِ seed-محور اضافه شده، پس ادعای
  // درست این است: **همان** seed همان نتیجه را می‌دهد (بازپخش‌پذیری)،
  // ولی seedِ دیگر می‌تواند نتیجهٔ دیگری بدهد.
  const same = duel.resolveRound(speedy, plain, 0, null, null, 'effect');
  ok(same.powerX === round.powerX && same.winner === round.winner,
    'همان seed ⇒ همان نتیجه (نبرد بازپخش‌پذیر است)');

  // اختلافِ پایه اینجا فقط ۱ واحد است (۷۶ در برابر ۷۵)، پس شانس باید
  // گاهی آن را وارونه کند — همان «شاید ببرم» که هدفِ افزودنِ شانس بود.
  let xWins = 0;
  for (let i = 0; i < 3000; i += 1) {
    if (duel.resolveRound(speedy, plain, 0, null, null, `tight-${i}`).winner === 'X') xWins += 1;
  }
  const rate = xWins / 3000;
  ok(rate > 0.5 && rate < 0.65,
    `در راندِ تنگ، برتریِ ۱ واحدی به ${(rate * 100).toFixed(1)}٪ برد تبدیل می‌شود، نه ۱۰۰٪`);
}

console.log('\n== ۵۰۰ مسابقه × ۵ راند؛ invariant در هر گام ==');
for (let match = 0; match < 500; match += 1) {
  const deckX = [];
  const deckO = [];
  for (let i = 0; i < 5; i += 1) {
    const baseX = 20 + ((match * 17 + i * 23) % 81);
    const baseO = 20 + ((match * 31 + i * 19) % 81);
    deckX.push(card(`x-${match}-${i}`, {
      speed: baseX, technique: 20 + ((baseX + 11) % 81),
      attack: 20 + ((baseX + 27) % 81), defense: 20 + ((baseX + 43) % 81),
      goalChance: 20 + ((baseX + 59) % 81),
      effect: ['none', 'speedster', 'playmaker', 'wall', 'finisher'][i],
    }));
    deckO.push(card(`o-${match}-${i}`, {
      speed: baseO, technique: 20 + ((baseO + 7) % 81),
      attack: 20 + ((baseO + 29) % 81), defense: 20 + ((baseO + 47) % 81),
      goalChance: 20 + ((baseO + 61) % 81),
      effect: ['none', 'lucky_star', 'playmaker', 'wall', 'finisher'][i],
    }));
  }

  const state = rules.createFromDecks(deckX, deckO, { seed: `loop-${match}` });
  const usedX = new Set();
  const usedO = new Set();
  for (let roundNo = 0; roundNo < 5; roundNo += 1) {
    const xId = state.remaining.X[(match + roundNo) % state.remaining.X.length];
    const oId = state.remaining.O[(match * 2 + roundNo) % state.remaining.O.length];
    const before = duel.scoreFromHistory(state.history);
    usedX.add(xId); usedO.add(oId);
    rules.applyMove(state, { cardId: xId }, 'X');
    rules.applyMove(state, { cardId: oId }, 'O');

    const round = state.lastRound;
    assert.equal(round.winner, expectedWinner(round), `match=${match}, round=${roundNo + 1}`);
    assert.deepEqual(state.score, duel.scoreFromHistory(state.history));
    assert.deepEqual(round.scoreAfter, state.score);
    assert.equal(state.roundIndex, state.history.length);
    assert.equal(round.logicVersion, 2);
    // شانس جزئی **آشکار** از فرمول است، نه یک عددِ پنهان: total باید
    // دقیقاً focus + effect + luck باشد، وگرنه عددی که کاربر می‌بیند با
    // عددی که برنده را تعیین کرده فرق دارد.
    assert.equal(round.breakdownX.total,
      round.breakdownX.focus + round.breakdownX.effectBonus + round.breakdownX.luck);
    assert.equal(round.breakdownO.total,
      round.breakdownO.focus + round.breakdownO.effectBonus + round.breakdownO.luck);
    for (const b of [round.breakdownX, round.breakdownO]) {
      assert.ok(Number.isInteger(b.luck), 'شانس باید عدد صحیح باشد');
      assert.ok(Math.abs(b.luck) <= b.luckRange,
        `شانس ${b.luck} از دامنهٔ مجاز ±${b.luckRange} بیرون زد`);
    }

    const dx = state.score.X - before.X;
    const dO = state.score.O - before.O;
    assert.equal(dx, round.winner === 'X' ? 1 : 0);
    assert.equal(dO, round.winner === 'O' ? 1 : 0);
    assert.equal(round.pointAwardedTo, round.winner === 'DRAW' ? null : round.winner);

    const xView = perspective(round, 'X');
    const oView = perspective(round, 'O');
    assert.equal(xView.myCard.cardTypeId, round.cardX.cardTypeId);
    assert.equal(oView.myCard.cardTypeId, round.cardO.cardTypeId);
    assert.equal(xView.myPower, round.powerX);
    assert.equal(oView.myPower, round.powerO);

    // حتی اگر شمارندهٔ mutable عمداً خراب شود، راند بعد آن را از history
    // بازسازی می‌کند. این کار فقط وسط مسابقه انجام می‌شود تا نتیجه سنجیده شود.
    if (roundNo === 1) state.score = { X: 99, O: 77 };
  }

  assert.equal(usedX.size, 5);
  assert.equal(usedO.size, 5);
  assert.equal(state.remaining.X.length, 0);
  assert.equal(state.remaining.O.length, 0);
  assert.equal(rules.isValidMove(state, { cardId: deckX[0].cardTypeId }, 'X'), false);
  const score = duel.scoreFromHistory(state.history);
  const final = score.X === score.O ? 'DRAW' : score.X > score.O ? 'X' : 'O';
  assert.equal(rules.result(state), final);
  assert.deepEqual(state.score, score);

  const publicX = rules.publicState(state, 'X');
  const publicO = rules.publicState(state, 'O');
  assert.equal(publicX.myDeck[0].cardTypeId, deckX[0].cardTypeId);
  assert.equal(publicO.myDeck[0].cardTypeId, deckO[0].cardTypeId);
  assert.deepEqual(publicX.score, publicO.score);
}
ok(true, '۲۵۰۰ راند بدون تناقضِ عدد/برنده/امتیاز اجرا شد');
ok(true, 'هر مسابقه دقیقاً پنج کارت یکتا مصرف کرد و راند ششم نداشت');
ok(true, 'زاویهٔ دید X و O در تمام مسابقه‌ها به کارت و عدد صاحب درست وصل بود');

console.log('\n== شبیه‌ساز، نتیجه و MVP ==');
{
  const x = [0, 1, 2, 3, 4].map(i => card(`sx${i}`, { speed: 60 + i, technique: 62 + i,
    attack: 64 + i, defense: 66 + i, goalChance: 68 + i }));
  const o = [0, 1, 2, 3, 4].map(i => card(`so${i}`, { speed: 40 + i, technique: 42 + i,
    attack: 44 + i, defense: 46 + i, goalChance: 48 + i }));
  const sim = duel.simulate(x, o, { seed: 'mvp' });
  ok(sim.userScore === 5 && sim.opponentScore === 0 && sim.winnerSide === 'user',
    'نتیجهٔ نهایی از پنج حکم راند ساخته می‌شود');
  ok(sim.rounds.every((round, i) => round.scoreAfter.X === i + 1 && round.scoreAfter.O === 0),
    'هر راند snapshot امتیاز دقیق بعد از خودش را دارد');
  ok(sim.mvp.side === 'user' && sim.mvp.margin > 0 && sim.mvp.roundPower > 0,
    'MVP از بهترین عملکردِ برنده انتخاب می‌شود، نه قدرت تزئینی کارت');
}

console.log(`\n✅ ${pass} نگهبانِ حقیقتِ لوپ پنج‌گانه موفق بود\n`);
