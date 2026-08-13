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

function winRate(stat, points, rarity, runs = 3000) {
  let w = 0, l = 0, d = 0;
  for (let i = 0; i < runs; i += 1) {
    const deck = [0, 1, 2, 3, 4].map(() => mkCard(stat, points, rarity));
    const side = duel.simulate(deck, duel.botDeck(deck), { seed: `bal:${stat}:${i}` }).winnerSide;
    if (side === 'user') w += 1; else if (side === 'opponent') l += 1; else d += 1;
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
  const matrix = [
    ['نوپا (ضعیف‌ترین)', 30, 0, 'normal'],
    ['تازه‌کار', 40, 500, 'normal'],
    ['معمولی', 50, 0, 'normal'],
    ['ارزان ولی لجند', 50, 5000, 'legend'],
    ['متوسط', 60, 2000, 'silver'],
    ['خوب', 70, 10000, 'gold'],
    ['قوی', 80, 20000, 'premium'],
    ['خیلی قوی', 90, 50000, 'legend'],
    ['حداکثری', 100, 100000, 'legend'],
  ];
  const rates = [];
  for (const [label, stat, points, rarity] of matrix) {
    const r = winRate(stat, points, rarity);
    rates.push(r.win);
    // بازهٔ هدف: تمرین باید قابلِ برد باشد ولی بی‌رقیب نه.
    ck(`${label}: نرخِ برد در بازهٔ منصفانه (${r.win.toFixed(0)}٪ برد، ${r.loss.toFixed(0)}٪ باخت)`,
      r.win >= 55 && r.win <= 88,
      `برد ${r.win.toFixed(1)}٪ · باخت ${r.loss.toFixed(1)}٪ · مساوی ${r.draw.toFixed(1)}٪`);
  }
  // ── مهم‌ترین سنجه ──
  // باگِ اصلی این بود که نرخِ برد به **نوعِ کارت** وابسته بود (۰٪ تا
  // ۹۵٪). یکنواختیِ بازه یعنی دیگر چنین وابستگی‌ای نیست.
  const spread = Math.max(...rates) - Math.min(...rates);
  ck('نرخِ برد به سطحِ کارتِ کاربر وابسته نیست', spread <= 22,
    `دامنه ${spread.toFixed(1)} واحد (کمینه ${Math.min(...rates).toFixed(0)}٪، بیشینه ${Math.max(...rates).toFixed(0)}٪)`);
}

console.log('\n== ۵. کاربرِ ضعیف بیشتر از کاربرِ قوی نمی‌بازد ==');
{
  // این دقیقاً همان چیزی بود که خراب بود: کفِ clamp روی ۳۰ باعث می‌شد
  // ضعیف‌ترین کاربران سخت‌ترین حریف را بگیرند.
  const weak = winRate(30, 0, 'normal', 2500);
  const strong = winRate(90, 50000, 'legend', 2500);
  ck('کاربرِ نوپا هم شانسِ واقعی دارد', weak.win >= 55,
    `کاربرِ استاتِ ۳۰ فقط ${weak.win.toFixed(1)}٪ برد`);
  ck('اختلافِ نوپا و حرفه‌ای معقول است', Math.abs(strong.win - weak.win) <= 22,
    `نوپا ${weak.win.toFixed(0)}٪ در برابر حرفه‌ای ${strong.win.toFixed(0)}٪`);
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
    round.winner === (round.powerX - round.powerO >= 6 ? 'X'
      : round.powerO - round.powerX >= 6 ? 'O' : 'DRAW'));
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
