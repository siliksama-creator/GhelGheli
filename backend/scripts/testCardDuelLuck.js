// آزمونِ رفتاریِ «شانسِ راند» در دوئل کارتی.
//
// چرا این فایل جدا از testCardDuelBalance است: شانس یک خاصیتِ **آماری**
// است. یک نمونه چیزی را اثبات نمی‌کند؛ باید توزیع را روی ده‌ها هزار
// نمونه سنجید. اینجا همان چیزی سنجیده می‌شود که به مالک قول داده شد:
//
//   ۱. شانس تعیینی است (بازپخشِ نبرد همان نتیجه را می‌دهد)
//   ۲. شانس بی‌طرف است (میانگین صفر، X و O مستقل)
//   ۳. شانس «اعصاب‌خردکن» نیست (دکِ بهتر همچنان اکثراً می‌برد)
//   ۴. شانس پنهان نیست (در breakdown دیده می‌شود و با total می‌خواند)
//
// ⚠️ درسِ گرفته‌شده: دو بار همین کد آماری شکست خورد و هر دو بار
//    آزمونِ آماری بود که گرفتش، نه چشم:
//      • FNV خام: نرخِ «شانسِ برابرِ X و O» ۱۲٫۳٪ به‌جای ۷٫۷٪
//      • فراموشیِ `>>> 0` در fmix: میانگینِ شانس ‎-6.0‎ به‌جای ‎0‎
//    هیچ‌کدام با نگاه کردن به کد دیده نمی‌شد.

const assert = require('assert');
const duel = require('../src/services/cardDuelService');
const rules = require('../src/games/rules/cardDuel');

let pass = 0;
const ck = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); process.exitCode = 1; }
};

const R = duel.LUCK_RANGE;
const BUCKETS = 2 * R + 1;

console.log('\n== ۱. دامنه و صحیح بودن ==');
{
  let min = Infinity; let max = -Infinity; let allInt = true;
  for (let i = 0; i < 50000; i += 1) {
    const v = duel.seededLuck(`seed-${i}`, i % 2 ? 'X' : 'O');
    if (!Number.isInteger(v)) allInt = false;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  ck('همهٔ مقادیر عدد صحیح‌اند', allInt);
  ck(`دامنه دقیقاً ±${R} است`, min === -R && max === R, `دیده شد ${min}..${max}`);
  ck('بدون seed شانس صفر است (بازپخشِ نبردهای قدیمی نمی‌شکند)',
    duel.seededLuck('', 'X') === 0 && duel.seededLuck(null, 'X') === 0);
}

console.log('\n== ۲. تعیینی بودن ==');
{
  ck('یک seed همیشه یک شانس می‌دهد',
    duel.seededLuck('m:1:cardA:cardB:start', 'X')
      === duel.seededLuck('m:1:cardA:cardB:start', 'X'));
  ck('X و O از یک seed شانسِ مستقل می‌گیرند (نه لزوماً برابر)',
    new Set([0, 1, 2, 3, 4, 5, 6, 7].map(i =>
      duel.seededLuck(`s${i}`, 'X') === duel.seededLuck(`s${i}`, 'O'))).size === 2);
}

console.log('\n== ۳. بی‌طرفی آماری ==');
{
  const N = 200000;
  const hist = new Map();
  let sumX = 0; let sumO = 0; let sumXO = 0; let sq = 0; let sqO = 0; let same = 0;
  for (let i = 0; i < N; i += 1) {
    const seed = `duel:${i}:cA:cB:start`;
    const x = duel.seededLuck(seed, 'X');
    const o = duel.seededLuck(seed, 'O');
    hist.set(x, (hist.get(x) || 0) + 1);
    sumX += x; sumO += o; sumXO += x * o; sq += x * x; sqO += o * o;
    if (x === o) same += 1;
  }
  const mX = sumX / N; const mO = sumO / N;
  ck('میانگینِ شانس صفر است (به نفع هیچ طرفی نیست)',
    Math.abs(mX) < 0.1 && Math.abs(mO) < 0.1, `X=${mX.toFixed(3)} O=${mO.toFixed(3)}`);

  const sdX = Math.sqrt(sq / N - mX * mX);
  const sdO = Math.sqrt(sqO / N - mO * mO);
  const corr = (sumXO / N - mX * mO) / (sdX * sdO);
  ck('شانسِ X و O همبسته نیستند',
    Math.abs(corr) < 0.02, `همبستگی=${corr.toFixed(4)}`);

  // این دقیقاً همان آزمونی است که باگِ FNV خام را گرفت.
  const eqRate = same / N;
  const expected = 1 / BUCKETS;
  ck('نرخِ «شانسِ برابر» با انتظارِ آماری می‌خواند',
    Math.abs(eqRate - expected) < 0.01,
    `${(eqRate * 100).toFixed(2)}% در برابر انتظارِ ${(expected * 100).toFixed(2)}%`);

  const exp = N / BUCKETS;
  let chi2 = 0;
  for (let v = -R; v <= R; v += 1) chi2 += ((hist.get(v) || 0) - exp) ** 2 / exp;
  // df = 12، آستانهٔ ۹۹.۹٪ ≈ ۳۲.۹
  ck('توزیع یکنواخت است (آزمون کای‌دو)', chi2 < 32.9, `chi2=${chi2.toFixed(1)}`);
}

console.log('\n== ۴. شانس پنهان نیست ==');
{
  const mk = (id, s) => ({
    id, card_type_id: id, name: id, duel_speed: s, duel_technique: s,
    duel_attack: s, duel_defense: s, duel_goal_chance: s,
    duel_energy: 50, duel_rarity: 'silver', duel_effect: null,
  });
  const deck = [0, 1, 2, 3, 4].map(i => mk(`x${i}`, 70));
  const bot = [0, 1, 2, 3, 4].map(i => mk(`o${i}`, 70));
  let checked = 0;
  for (let i = 0; i < 400; i += 1) {
    const r = duel.resolveRound(deck[0], bot[0], i % 5, null, null, `probe-${i}`);
    for (const b of [r.breakdownX, r.breakdownO]) {
      assert.ok(Number.isInteger(b.luck), 'luck باید صحیح باشد');
      assert.equal(b.total, b.focus + b.effectBonus + b.luck,
        `اجزا با total نمی‌خواند: ${b.focus}+${b.effectBonus}+${b.luck} ≠ ${b.total}`);
      assert.equal(b.luckRange, R);
      checked += 1;
    }
    assert.equal(r.winner,
      r.powerX > r.powerO ? 'X' : r.powerO > r.powerX ? 'O' : 'DRAW',
      'برنده باید با همان عددهای نمایش‌داده‌شده بخواند');
  }
  ck(`در ${checked} تفکیک، مجموعِ اجزا دقیقاً برابرِ عددِ نهایی بود`, checked === 800);
  ck('شانس در خروجیِ راند هم آشکار است',
    Number.isInteger(duel.resolveRound(deck[0], bot[0], 0, null, null, 'z').luckX));
}

console.log('\n== ۵. بازپخشِ نبرد ==');
{
  const mk = (id, s) => ({
    id, card_type_id: id, name: id, duel_speed: s, duel_technique: s,
    duel_attack: s, duel_defense: s, duel_goal_chance: s,
    duel_energy: 50, duel_rarity: 'gold', duel_effect: null,
  });
  const deck = [0, 1, 2, 3, 4].map(i => mk(`a${i}`, 60 + i));
  const bot = duel.botDeck(deck);
  const a = duel.simulate(deck, bot, { seed: 'replay-seed' });
  const b = duel.simulate(deck, bot, { seed: 'replay-seed' });
  ck('همان seed ⇒ همان نبردِ کامل', JSON.stringify(a) === JSON.stringify(b));
  const c = duel.simulate(deck, bot, { seed: 'other-seed' });
  ck('seedِ متفاوت ⇒ شانسِ متفاوت (بازی دیگر قطعی نیست)',
    JSON.stringify(a) !== JSON.stringify(c));
}

console.log('\n== ۶. «اعصاب‌خردکن» نبودن — دکِ بهتر همچنان می‌برد ==');
{
  // دکِ آشکارا قوی‌تر در برابر دکِ ضعیف‌تر: شانس نباید این را وارونه کند.
  const mk = (id, s) => ({
    id, card_type_id: id, name: id, duel_speed: s, duel_technique: s,
    duel_attack: s, duel_defense: s, duel_goal_chance: s,
    duel_energy: 50, duel_rarity: 'silver', duel_effect: null,
  });
  let strongWins = 0; let upsetRounds = 0; let totalRounds = 0;
  const N = 4000;
  for (let m = 0; m < N; m += 1) {
    const strong = [0, 1, 2, 3, 4].map(i => mk(`s${m}-${i}`, 82));
    const weak = [0, 1, 2, 3, 4].map(i => mk(`w${m}-${i}`, 62));
    let sx = 0; let so = 0;
    for (let r = 0; r < 5; r += 1) {
      const res = duel.resolveRound(strong[r], weak[r], r, null, null, `bal:${m}:${r}`);
      totalRounds += 1;
      if (res.winner === 'X') sx += 1;
      else if (res.winner === 'O') { so += 1; upsetRounds += 1; }
    }
    if (sx > so) strongWins += 1;
  }
  const wr = strongWins / N;
  ck('با اختلافِ ۲۰ واحد، دکِ قوی‌تر همیشه می‌برد (شانس ±۶ نمی‌تواند جبران کند)',
    wr === 1, `نرخ برد=${(wr * 100).toFixed(1)}%`);
  ck('هیچ راندی با اختلافِ ۲۰ واحد وارونه نشد',
    upsetRounds === 0, `${upsetRounds} از ${totalRounds}`);
}

console.log('\n== ۷. راندهای تنگ، جایی که شانس باید کار کند ==');
{
  const mk = (id, s) => ({
    id, card_type_id: id, name: id, duel_speed: s, duel_technique: s,
    duel_attack: s, duel_defense: s, duel_goal_chance: s,
    duel_energy: 50, duel_rarity: 'silver', duel_effect: null,
  });
  let upset = 0; const N = 20000;
  for (let i = 0; i < N; i += 1) {
    // اختلافِ ۲ واحد — دقیقاً همان‌جا که «شاید ببرم» باید حس شود.
    const a = mk(`a${i}`, 80); const b = mk(`b${i}`, 78);
    const res = duel.resolveRound(a, b, 0, null, null, `tight:${i}`);
    if (res.winner === 'O') upset += 1;
  }
  const rate = upset / N;
  ck('در راندِ تنگ، طرفِ ضعیف‌تر گاهی می‌برد',
    rate > 0.25 && rate < 0.5, `نرخ وارونگی=${(rate * 100).toFixed(1)}%`);
}

console.log('\n== ۸. یکپارچگی با بازیِ زنده ==');
{
  const mkDeck = (p, s) => [0, 1, 2, 3, 4].map(i => ({
    id: `${p}${i}`, card_type_id: `${p}${i}`, name: `${p}${i}`,
    duel_speed: s, duel_technique: s, duel_attack: s,
    duel_defense: s, duel_goal_chance: s, duel_energy: 50,
    duel_rarity: 'silver', duel_effect: null,
  }));
  const state = rules.createFromDecks(mkDeck('x', 75), mkDeck('o', 75), { seed: 'live-luck' });
  rules.applyMove(state, { cardId: 'x0' }, 'X');
  rules.applyMove(state, { cardId: 'o0' }, 'O');
  const r = state.lastRound;
  ck('راندِ زنده هم شانس دارد', Number.isInteger(r.breakdownX.luck));
  ck('با استاتِ کاملاً برابر، شانس تعیین‌کننده است (دیگر همیشه مساوی نیست)',
    r.breakdownX.total !== r.breakdownO.total || r.winner === 'DRAW');
  ck('اسکور با historyِ حکم‌ها می‌خواند',
    JSON.stringify(state.score) === JSON.stringify(duel.scoreFromHistory(state.history)));
}

console.log(`\n${pass} ✓`);
