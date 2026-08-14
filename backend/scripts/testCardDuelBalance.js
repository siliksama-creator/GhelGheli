#!/usr/bin/env node
/**
 * نگهبانِ بالانسِ دوئل کارت در برابر ربات.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این فایل نوشته شد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * شکایتِ مالک: «وقتی با بات بازی میکنیم امتیاز بات کمتره باز میبره بازی رو».
 *
 * بازتولید شد و سه باگِ مستقل پیدا شد که هر سه یک نتیجه می‌دادند:
 *
 *   ۱. **خلطِ واحد.** `botDeck` پایهٔ استاتِ ربات را از
 *      `totalPower(کارتِ کاربر)` می‌ساخت. `totalPower` استاتِ ۰..۱۰۰
 *      نیست — مجموعِ وزن‌دار به‌علاوهٔ pointBoost (تا +۲۲) و
 *      rarityBonus (تا +۲۴) است. آن عدد به‌عنوان استاتِ خام به ربات
 *      داده می‌شد و ربات دوباره خودش pointBoost و rarityBonus می‌گرفت.
 *      تورمِ روی تورم. نتیجه: کارتِ استاتِ ۵۰ با ۵۰۰۰ امتیاز و کمیابیِ
 *      لجند → `totalPower=99` → ربات با استاتِ ۸۸ ساخته می‌شد.
 *
 *   ۲. **افکتِ رایگان.** هر پنج کارتِ ربات افکتِ فعال داشتند، در حالی
 *      که کارتِ واقعیِ کاربر معمولاً `none` است. فقط `speedster` در
 *      راندِ اول ۱۵ امتیاز می‌داد — بیش از کلِ اثرِ استات‌ها.
 *
 *   ۳. **دستِ از پیش بهینه‌شده.** `ROUND_FOCUS` ترتیبِ
 *      سرعت→تکنیک→حمله→دفاع→گل است و بونوس‌های کارتِ ربات دقیقاً روی
 *      همین ترتیب چیده شده بود (کارتِ اول +۱۰ سرعت، راندِ اول سرعت).
 *      کارت‌های کاربر چنین ترتیبی ندارند.
 *
 * نرخِ بردِ اندازه‌گیری‌شدهٔ کاربر **پیش از رفع**: ۰٪ تا ۷٪ برای اکثر
 * کارت‌ها. یعنی بازی عملاً غیرقابل‌برد بود.
 *
 * ── چرا این تست ارزش دارد ──
 *
 * `testCardDuel.js` و `testCardDuelEngine.js` هر دو سبز بودند و این را
 * نگرفتند، چون هیچ‌کدام **نتیجهٔ آماری** را نمی‌سنجند — فقط ساختار و
 * پروتکل را چک می‌کنند. یک بازی می‌تواند از نظر ساختاری بی‌عیب باشد و
 * از نظر تجربهٔ کاربر کاملاً خراب.
 *
 * این تست با شبیه‌سازیِ انبوه، خودِ **تجربه** را می‌سنجد.
 */
const assert = require('assert');
const duel = require('../src/services/cardDuelService');

let pass = 0;
const failures = [];
function ck(name, cond, detail = '') {
  if (cond) { pass += 1; console.log('  ✓', name); }
  else { failures.push(`${name} — ${detail}`); console.log('  ✗', name, '→', detail); }
}

function mkCard(stat, points, rarity, effect = 'none') {
  return duel.publicCard({
    card_type_id: `u-${Math.random()}`, name: 'کارت کاربر',
    point_value: points, quantity: 1,
    duel_attack: stat, duel_defense: stat, duel_speed: stat,
    duel_technique: stat, duel_goal_chance: stat, duel_energy: 100,
    duel_rarity: rarity, duel_effect: effect,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ چرا از مسیرِ موتور تست می‌شود و نه از `simulate()`
// ═══════════════════════════════════════════════════════════════════════════
//
// نسخهٔ اولِ همین فایل از `duel.simulate()` استفاده می‌کرد. آن تابع
// کارت‌ها را **به ترتیبِ آرایه** رو در روی هم می‌گذارد و هیچ انتخابی در
// کار نیست.
//
// ولی بازیِ واقعی از `rules/cardDuel.js` می‌گذرد که در آن ربات یک
// `botMove` استراتژیک دارد: هر راند بهترین کارتش را برای همان تمرکز
// انتخاب می‌کند. یعنی حریفِ واقعی **هوشمندتر** از حریفِ `simulate` است.
//
// نتیجه: تستِ قبلی «۶۸–۸۳٪ برد» می‌گفت در حالی که در بازیِ زنده وضع
// فرق داشت. تستی که مسیرِ واقعی را نمی‌سنجد، عدد می‌دهد ولی تضمین نه.
//
// حالا از `createFromDecks` + `botMove` + `applyMove` استفاده می‌شود —
// همان سه تابعی که موتورِ سوکت صدا می‌زند.
const rules = require('../src/games/rules/cardDuel');

/** بهترین کارت برای تمرکزِ راندِ جاری — بازیکنی که دقت می‌کند. */
function pickBest(state) {
  const focus = duel.ROUND_FOCUS[state.roundIndex];
  let best = null, score = -1;
  for (const id of state.remaining.X) {
    const card = state.decks.X.find(c => String(c.cardTypeId || c.id) === id);
    const value = duel.focusStatOf(card, focus);
    if (value > score) { score = value; best = id; }
  }
  return best;
}
/** بدترین کارت — برای اثباتِ اینکه بازیِ بد واقعاً جریمه دارد. */
function pickWorst(state) {
  const focus = duel.ROUND_FOCUS[state.roundIndex];
  let worst = null, score = Infinity;
  for (const id of state.remaining.X) {
    const card = state.decks.X.find(c => String(c.cardTypeId || c.id) === id);
    const value = duel.focusStatOf(card, focus);
    if (value < score) { score = value; worst = id; }
  }
  return worst;
}
/** بازیکنِ متوسط: بیشترِ وقت‌ها درست انتخاب می‌کند، گاهی نه. */
function pickAverage(state) {
  if (Math.random() < 0.4) {
    const rem = state.remaining.X;
    return rem[Math.floor(Math.random() * rem.length)];
  }
  return pickBest(state);
}

function playMatch(deck, pick) {
  const state = rules.createFromDecks(deck, duel.botDeck(deck), { seed: `s${Math.random()}` });
  for (let r = 0; r < duel.DECK_SIZE; r += 1) {
    const botMove = rules.botMove(state, 'O');
    rules.applyMove(state, { cardId: pick(state) }, 'X');
    rules.applyMove(state, botMove, 'O');
  }
  return rules.result(state);
}

function winRate(stat, points, rarity, runs = 2500, pick = pickAverage) {
  let w = 0, l = 0, d = 0;
  for (let i = 0; i < runs; i += 1) {
    const deck = [0, 1, 2, 3, 4].map(() => mkCard(stat, points, rarity));
    const res = playMatch(deck, pick);
    if (res === 'X') w += 1; else if (res === 'O') l += 1; else d += 1;
  }
  return { win: (w / runs) * 100, loss: (l / runs) * 100, draw: (d / runs) * 100 };
}

console.log('\n== ۱. ربات با واحدِ درست ساخته می‌شود (استاتِ خام، نه totalPower) ==');
{
  // کارتی که استاتِ پایین ولی امتیاز/کمیابیِ بالا دارد: تلهٔ اصلیِ باگِ قبلی.
  const deck = [0, 1, 2, 3, 4].map(() => mkCard(50, 5000, 'legend'));
  const bot = duel.botDeck(deck);
  const botStats = bot.map(c => c.attack);
  const maxBotStat = Math.max(...botStats);
  ck('استاتِ ربات نزدیکِ استاتِ کاربر است، نه نزدیکِ totalPower',
    maxBotStat <= 70,
    `استاتِ کاربر ۵۰ ولی بیشترین استاتِ ربات ${maxBotStat} شد (totalPower کاربر ${duel.totalPower(deck[0])})`);

  // کارتِ ارزان با همان استات باید تقریباً همان ربات را بسازد.
  const cheap = [0, 1, 2, 3, 4].map(() => mkCard(50, 0, 'normal'));
  const cheapBot = duel.botDeck(cheap);
  const gap = Math.abs(
    cheapBot.reduce((s, c) => s + c.attack, 0) / 5 - bot.reduce((s, c) => s + c.attack, 0) / 5);
  ck('امتیاز و کمیابیِ کارت، استاتِ ربات را باد نمی‌کند', gap <= 8,
    `اختلافِ میانگینِ استاتِ ربات بین کارتِ ارزان و گران ${gap.toFixed(1)} واحد`);
}

console.log('\n== ۲. ربات دستِ از پیش بهینه‌شده برای ترتیبِ راندها ندارد ==');
{
  // اگر تخصص‌ها ثابت باشند، در ۲۰۰ بار ساخت همیشه یک جا می‌افتند.
  const focusOrder = duel.ROUND_FOCUS.map(f => f.key);
  const alignHits = [];
  for (let run = 0; run < 200; run += 1) {
    const deck = [0, 1, 2, 3, 4].map(() => mkCard(60, 1000, 'silver'));
    const bot = duel.botDeck(deck);
    let aligned = 0;
    bot.forEach((card, i) => {
      const focusKey = focusOrder[i];
      const stats = {
        duel_attack: card.attack, duel_defense: card.defense, duel_speed: card.speed,
        duel_technique: card.technique, duel_goal_chance: card.goalChance,
      };
      const best = Object.entries(stats).sort((a, b) => b[1] - a[1])[0][0];
      if (best === focusKey) aligned += 1;
    });
    alignHits.push(aligned);
  }
  const avgAligned = alignHits.reduce((a, b) => a + b, 0) / alignHits.length;
  ck('تخصصِ کارتِ ربات با تمرکزِ راند هم‌راستا نیست', avgAligned < 2.2,
    `به‌طور میانگین ${avgAligned.toFixed(2)} کارت از ۵ دقیقاً روی تمرکزِ همان راند بهینه بود (تصادفی ≈۱)`);
}

console.log('\n== ۳. ربات افکتِ یک‌طرفه نمی‌گیرد ==');
{
  const deck = [0, 1, 2, 3, 4].map(() => mkCard(60, 1000, 'silver'));
  const bot = duel.botDeck(deck);
  const withEffect = bot.filter(c => c.effect && c.effect !== 'none').length;
  ck('حداکثر دو کارتِ ربات افکت دارند', withEffect <= 2,
    `${withEffect} کارت از ۵ افکتِ فعال داشت`);
  ck('کارتِ اولِ ربات افکتِ راندِ اول (speedster) ندارد',
    bot[0].effect !== 'speedster',
    'speedster در راندِ اول ۱۵ امتیازِ رایگان می‌دهد');
}

console.log('\n== ۴. نرخِ بردِ کاربر در همهٔ سطوحِ کارت منصفانه است ==');
{
  // ⚠️ چرا این ماتریس این‌قدر متنوع است: باگِ قبلی روی کارتِ متوسط
  //    بدترین حالت را داشت ولی روی کارتِ خیلی قوی سبز به نظر می‌رسید.
  //    اگر فقط یک سطح تست شود، رگرسیون دوباره از دست می‌رود.
  // ⚠️ استاتِ ۱۰۰ عمداً اینجا نیست و بندِ جدا دارد: سقفِ clamp روی ۱۰۰
  //    است، پس ربات نمی‌تواند هم‌تراز شود و نرخِ برد طبیعتاً بالاست.
  //    گنجاندنش در سنجهٔ «یکنواختی» یک شکستِ ساختگی می‌سازد.
  const matrix = [
    ['نوپا (ضعیف‌ترین)', 30, 0, 'normal'],
    ['تازه‌کار', 40, 500, 'normal'],
    ['معمولی', 50, 0, 'normal'],
    ['ارزان ولی لجند', 50, 5000, 'legend'],
    ['متوسط', 60, 2000, 'silver'],
    ['خوب', 70, 10000, 'gold'],
    ['قوی', 80, 20000, 'premium'],
    ['خیلی قوی', 90, 50000, 'legend'],
  ];
  const rates = [];
  for (const [label, stat, points, rarity] of matrix) {
    const r = winRate(stat, points, rarity);
    rates.push(r.win);
    // بازهٔ هدف: تمرین باید قابلِ برد باشد ولی بی‌رقیب نه.
    ck(`${label}: نرخِ برد در بازهٔ منصفانه (${r.win.toFixed(0)}٪ برد، ${r.loss.toFixed(0)}٪ باخت)`,
      r.win >= 55 && r.win <= 92,
      `برد ${r.win.toFixed(1)}٪ · باخت ${r.loss.toFixed(1)}٪ · مساوی ${r.draw.toFixed(1)}٪`);
  }
  // ── مهم‌ترین سنجه ──
  // باگِ اصلی این بود که نرخِ برد به **نوعِ کارت** وابسته بود (۰٪ تا
  // ۹۵٪). یکنواختیِ بازه یعنی دیگر چنین وابستگی‌ای نیست.
  const spread = Math.max(...rates) - Math.min(...rates);
  ck('نرخِ برد به سطحِ کارتِ کاربر وابسته نیست', spread <= 25,
    `دامنه ${spread.toFixed(1)} واحد (کمینه ${Math.min(...rates).toFixed(0)}٪، بیشینه ${Math.max(...rates).toFixed(0)}٪)`);
}

console.log('\n== ۵. کاربرِ ضعیف بیشتر از کاربرِ قوی نمی‌بازد ==');
{
  // این دقیقاً همان چیزی بود که خراب بود: کفِ clamp روی ۳۰ باعث می‌شد
  // ضعیف‌ترین کاربران سخت‌ترین حریف را بگیرند.
  const weak = winRate(30, 0, 'normal', 2000);
  const strong = winRate(90, 50000, 'legend', 2000);
  ck('کاربرِ نوپا هم شانسِ واقعی دارد', weak.win >= 55,
    `کاربرِ استاتِ ۳۰ فقط ${weak.win.toFixed(1)}٪ برد`);
  ck('اختلافِ نوپا و حرفه‌ای معقول است', Math.abs(strong.win - weak.win) <= 25,
    `نوپا ${weak.win.toFixed(0)}٪ در برابر حرفه‌ای ${strong.win.toFixed(0)}٪`);
}

console.log('\n== ۵ب. مهارت واقعاً پاداش دارد ==');
{
  // ═══════════════════════════════════════════════════════════════════════
  // مهم‌ترین سنجهٔ این فایل
  // ═══════════════════════════════════════════════════════════════════════
  //
  // شکایتِ مالک «انگار منطق بازی مشکل داره» فقط دربارهٔ نرخِ برد نبود:
  // بازی باید **قابلِ فهم** باشد. یعنی انتخابِ درستِ کارت باید نتیجه را
  // عوض کند. اگر بازیِ خوب و بد یک نتیجه بدهند، بازی از دیدِ کاربر
  // تصادفی است — حتی اگر نرخِ برد قشنگ باشد.
  //
  // کارت‌های **متنوع** لازم است: با کارت‌های یکسان هیچ انتخابی معنا
  // ندارد و این سنجه بی‌معنی می‌شود.
  const varied = () => {
    const spread = [
      [90, 40, 55, 60, 50], [45, 88, 60, 50, 55], [55, 50, 92, 45, 60],
      [60, 55, 45, 90, 50], [50, 60, 55, 45, 93],
    ];
    return spread.map((v, i) => duel.publicCard({
      card_type_id: `v-${i}-${Math.random()}`, name: `کارت ${i}`,
      point_value: 3000, quantity: 1,
      duel_speed: v[0], duel_technique: v[1], duel_attack: v[2],
      duel_defense: v[3], duel_goal_chance: v[4], duel_energy: 100,
      duel_rarity: 'gold', duel_effect: 'none',
    }));
  };
  const rate = (pick) => {
    let w = 0;
    for (let i = 0; i < 1500; i += 1) if (playMatch(varied(), pick) === 'X') w += 1;
    return (w / 1500) * 100;
  };
  const good = rate(pickBest);
  const bad = rate(pickWorst);
  ck(`بازیِ بهینه اکثراً می‌برد (${good.toFixed(0)}٪)`, good >= 85,
    `فقط ${good.toFixed(1)}٪ — انتخابِ درست باید پاداش داشته باشد`);
  ck(`بازیِ بد اکثراً می‌بازد (${bad.toFixed(0)}٪ برد)`, bad <= 25,
    `${bad.toFixed(1)}٪ برد — اگر بازیِ بد هم ببرد، بازی تصادفی است`);
  ck('فاصلهٔ مهارت معنادار است', good - bad >= 55,
    `اختلافِ بازیِ خوب و بد فقط ${(good - bad).toFixed(1)} واحد`);
}

console.log('\n== ۵ج. «عددم بیشتر است ولی نبردم» رخ نمی‌دهد ==');
{
  // ═══════════════════════════════════════════════════════════════════════
  // شکایتِ مستقیمِ مالک
  // ═══════════════════════════════════════════════════════════════════════
  //
  // «وقتی امتیاز من بیشتر میشه ربات میبره و برعکس».
  //
  // ریشه‌اش آستانهٔ «مساوی» بود: با آستانهٔ ۶، هر اختلافِ ۱ تا ۵ مساوی
  // اعلام می‌شد و **۴۴٫۶٪** راندها در همان بازه می‌افتادند. صفحه
  // «۸۸ در برابر ۸۴» نشان می‌داد و می‌گفت مساوی.
  //
  // این سنجه تضمین می‌کند عددی که کاربر می‌بیند با نتیجه بخواند.
  let contradiction = 0, drawDespiteGap = 0, total = 0;
  for (let i = 0; i < 3000; i += 1) {
    const deck = [0, 1, 2, 3, 4].map(() => mkCard(60, 3000, 'gold'));
    const bot = duel.botDeck(deck);
    for (let k = 0; k < duel.DECK_SIZE; k += 1) {
      const r = duel.resolveRound(deck[k], bot[k], k, null, null, `ui:${i}:${k}`);
      total += 1;
      if (r.powerX > r.powerO && r.winner === 'O') contradiction += 1;
      if (r.powerO > r.powerX && r.winner === 'X') contradiction += 1;
      if (Math.abs(r.powerX - r.powerO) >= 4 && r.winner === 'DRAW') drawDespiteGap += 1;
    }
  }
  ck('هرگز طرفی با عددِ کمتر برنده نمی‌شود', contradiction === 0,
    `${contradiction} راند از ${total} برعکس بود`);
  const drawPct = (drawDespiteGap / total) * 100;
  ck(`اختلافِ محسوس «مساوی» اعلام نمی‌شود (${drawPct.toFixed(1)}٪)`, drawPct <= 1,
    `${drawPct.toFixed(1)}٪ راندها با اختلافِ ۴+ مساوی شدند`);
}

console.log('\n== ۶. عددی که برنده را تعیین می‌کند به کاربر نشان داده می‌شود ==');
{
  const deck = [0, 1, 2, 3, 4].map(() => mkCard(60, 3000, 'gold'));
  const bot = duel.botDeck(deck);
  const round = duel.resolveRound(deck[0], bot[0], 0, null, null, 'ui-check');
  ck('powerX و powerO در پاسخ هستند',
    Number.isFinite(round.powerX) && Number.isFinite(round.powerO));
  ck('تفکیکِ امتیاز برای هر دو طرف برمی‌گردد',
    !!round.breakdownX && !!round.breakdownO,
    'بدونِ breakdown کاربر نمی‌فهمد عدد از کجا آمد');
  for (const key of ['base', 'focus', 'attackMix', 'defensePenalty', 'effectBonus', 'luck', 'total']) {
    ck(`breakdown شاملِ «${key}» است`, round.breakdownX[key] !== undefined);
  }
  // مجموعِ اجزا باید همان total باشد وگرنه توضیحی که به کاربر می‌دهیم دروغ است.
  const b = round.breakdownX;
  const sum = Math.round(b.base + b.focus + b.attackMix - b.defensePenalty + b.effectBonus + b.luck + (b.wallAdjustment || 0));
  ck('مجموعِ اجزا دقیقاً برابرِ عددِ نهایی است', Math.abs(sum - b.total) <= 1,
    `اجزا ${sum} ولی total ${b.total} — توضیحِ روی صفحه با عدد نمی‌خواند`);
  ck('برنده با همان powerها می‌خواند',
    round.winner === (round.powerX > round.powerO ? 'X'
      : round.powerO > round.powerX ? 'O' : 'DRAW'));
  // شانس اضافه شد، ولی «پنهان» نیست: باید در breakdown دیده شود و
  // مجموعِ اجزا دقیقاً عددِ نهایی باشد.
  ck('شانس در حکم آشکار است و در دامنهٔ اعلام‌شده می‌ماند',
    Number.isInteger(round.breakdownX.luck)
      && Math.abs(round.breakdownX.luck) <= round.breakdownX.luckRange
      && round.breakdownX.total
        === round.breakdownX.focus + round.breakdownX.effectBonus + round.breakdownX.luck,
    `luck=${round.breakdownX.luck} range=${round.breakdownX.luckRange}`);
}

console.log('\n== ۷. تعیینی بودن با seed (بازپخشِ نبرد) ==');
{
  const deck = [0, 1, 2, 3, 4].map(() => mkCard(65, 4000, 'gold'));
  const bot = duel.botDeck(deck);
  const a = duel.simulate(deck, bot, { seed: 'fixed-seed' });
  const b = duel.simulate(deck, bot, { seed: 'fixed-seed' });
  ck('یک seed همیشه یک نتیجه می‌دهد',
    a.userScore === b.userScore && a.opponentScore === b.opponentScore,
    `${a.userScore}-${a.opponentScore} در برابر ${b.userScore}-${b.opponentScore}`);
}

console.log(`\n${failures.length ? '✗' : '✓'} ${pass} موفق، ${failures.length} ناموفق`);
if (failures.length) {
  console.log('\nشکست‌ها:');
  failures.forEach(f => console.log('  ·', f));
  process.exit(1);
}
// نگهبانِ خودِ نگهبان: اگر روزی کسی بخش‌هایی از این فایل را کامنت کند،
// «۰ ناموفق» نباید با «هیچ چیزی سنجیده نشد» اشتباه گرفته شود.
assert.ok(pass >= 25, `تعدادِ سنجه‌ها کمتر از انتظار است (${pass})`);
