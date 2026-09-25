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

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ به‌روزرسانیِ ۴ مهر ۱۴۰۵ — دستِ ربات عوض شد
// ═══════════════════════════════════════════════════════════════════════════
//
// خواستهٔ مالک: «بازی دوئل کارت و دوئل طوفان از این به بعد ربات بصورت کاملا
// تصادفی از کارت های ذخیره شده کل سیستم ۵ کارت رو انتخاب میکنه و باهاش بازی
// میکنه.» پس دستِ ربات دیگر ساختگی نیست؛ از `card_types` قرعه‌کشی می‌شود و
// یک «سقفِ همان ویژگی» دارد (سقفِ هر ویژگی در دستِ کاربر، منهای ۸).
//
// این فایل حالا سه خانواده را می‌سنجد:
//
//   ۰. **قرعه** — کارت‌های ربات واقعی‌اند، تکراری نیستند، کارتِ خودِ کاربر را
//      برنمی‌دارند، و روی کلِ استخر یکنواخت پخش می‌شوند.
//   ۰ب. **سقف** — هیچ ویژگیِ ربات از سقفِ همان ویژگیِ کاربر بالاتر نمی‌زند؛ و
//      اگر کارت‌های قرعه‌ای از قبل ضعیف‌تر بودند، دست‌نخورده می‌مانند.
//   ۱..۴. **تجربه** — توازنِ نتیجه (همان سنجه‌های قبلی، با اعدادِ تازه).
//
// ── چرا استخرِ تقلیدی داخلِ خودِ فایل است ──────────────────────────────────
//
// تستِ واحد نباید به دیتابیسِ محصول وصل شود. این استخر از همان توزیعِ
// کاتالوگِ واقعی ساخته شده (۲۹ کارت، استاتِ ۴۳..۹۱، امتیاز ۵۰۰/۱۰۰۰/۳۰۰۰،
// افکت‌های playmaker/wall/finisher/speedster) تا اعدادِ سنجش به واقعیت نزدیک
// بمانند. در محصول، `refreshBotPool()` همین استخر را از دیتابیس پر می‌کند.

/**
 * استخرِ تقلیدیِ کاتالوگ — ۱۲ کارت با همان شکل و پراکندگیِ کارت‌های واقعی.
 * (`points` و `effect` واقع‌اند؛ `duel_rarity` از امتیاز ساخته می‌شود.)
 */
function poolCard(i, opts = {}) {
  const stats = opts.stats || [70, 65, 70, 72, 68];
  return {
    id: `pool-${i}`,
    name: opts.name || `ستارهٔ ${i}`,
    image_url: `/cards/pool-${i}.webp`,
    point_value: opts.points || 1000,
    duel_attack: stats[0], duel_defense: stats[1], duel_speed: stats[2],
    duel_technique: stats[3], duel_goal_chance: stats[4],
    duel_energy: 100,
    duel_effect: opts.effect || 'none',
  };
}
const POOL = [
  poolCard(1, { name: 'لامین یامال', points: 3000, effect: 'playmaker', stats: [92, 44, 96, 98, 88] }),
  poolCard(2, { name: 'هری کین', points: 3000, effect: 'finisher', stats: [96, 58, 78, 93, 98] }),
  poolCard(3, { name: 'کیلیان امباپه', points: 3000, effect: 'speedster', stats: [98, 44, 100, 96, 99] }),
  poolCard(4, { name: 'امیلیانو مارتینس', points: 3000, effect: 'wall', stats: [30, 98, 58, 79, 10] }),
  poolCard(5, { name: 'محمد صلاح', points: 3000, effect: 'speedster', stats: [95, 54, 94, 92, 96] }),
  poolCard(6, { name: 'کوین دی بروینه', points: 3000, effect: 'playmaker', stats: [89, 65, 77, 99, 86] }),
  poolCard(7, { name: 'جود بلینگام', points: 1000, effect: 'playmaker', stats: [78, 74, 76, 82, 80] }),
  poolCard(8, { name: 'ارلینگ هالند', points: 1000, effect: 'finisher', stats: [84, 50, 78, 73, 90] }),
  poolCard(9, { name: 'رافینیا', points: 1000, effect: 'playmaker', stats: [76, 52, 80, 78, 72] }),
  poolCard(10, { name: 'تیبو کورتوا', points: 1000, effect: 'wall', stats: [25, 82, 45, 62, 7] }),
  poolCard(11, { name: 'منوی نویر', points: 500, effect: 'wall', stats: [28, 78, 58, 66, 8] }),
  poolCard(12, { name: 'بازیکنِ فرانسه', points: 500, effect: 'playmaker', stats: [66, 68, 70, 74, 64] }),
];

/** از این به بعد `botDeck` از این استخر قرعه می‌کشد. */
duel.setBotPool(POOL);

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ چرا از مسیرِ موتور سنجیده می‌شود و نه از `simulate()`
// ═══════════════════════════════════════════════════════════════════════════
//
// `simulate()` کارت‌ها را **به ترتیبِ آرایه** رو در روی هم می‌گذارد و هیچ
// انتخابی در کار نیست، ولی بازیِ واقعی از `rules/cardDuel` می‌گذرد که در آن
// ربات هر راند بهترین کارتش را برای همان تمرکز انتخاب می‌کند. تستی که مسیرِ
// واقعی را نمی‌سنجد، عدد می‌دهد ولی تضمین نه.

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


console.log('\n== ۰. دستِ ربات: ۵ کارتِ واقعیِ تصادفی از کلِ استخر ==');
{
  const deck = [0, 1, 2, 3, 4].map(() => mkCard(60, 1000, 'silver'));
  const poolIds = new Set(POOL.map(r => String(r.id)));
  const poolNames = new Set(POOL.map(r => r.name));
  const seen = new Map();
  let badId = 0, dup = 0, badName = 0, mine = 0, wrongSize = 0;
  const mineIds = new Set(deck.map(c => String(c.cardTypeId)));
  for (let i = 0; i < 400; i += 1) {
    const bot = duel.botDeck(deck);
    if (bot.length !== duel.DECK_SIZE) wrongSize += 1;
    const ids = bot.map(c => String(c.cardTypeId));
    if (ids.some(id => !poolIds.has(id))) badId += 1;
    if (new Set(ids).size !== duel.DECK_SIZE) dup += 1;
    if (bot.some(c => !poolNames.has(c.name))) badName += 1;
    if (ids.some(id => mineIds.has(id))) mine += 1;
    for (const id of ids) seen.set(id, (seen.get(id) || 0) + 1);
  }
  ck('هر پنج کارت از استخرِ واقعیِ سیستم‌اند', badId === 0, `${badId} دست کارتِ بیگانه داشت`);
  ck('اسم و عکس از خودِ کارتِ واقعی می‌آید', badName === 0, `${badName} دست اسمِ ناشناس داشت`);
  ck('در یک دست کارتِ تکراری نمی‌آید', dup === 0, `${dup} دست تکرار داشت`);
  ck('کارتِ خودِ کاربر در دستِ ربات نمی‌آید', mine === 0,
    `${mine} دست کارتِ کاربر را هم داشت (دو طرف یک عکس نشان می‌دهند)`);
  ck('همیشه دقیقاً پنج کارت', wrongSize === 0, `${wrongSize} دست اندازهٔ غلط داشت`);
  // یکنواختی: ۲۰۰۰ قرعه از ۱۲ کارت ⇒ امیدِ ریاضی ~۱۶۷ برای هر کارت.
  const counts = [...seen.values()];
  ck(`قرعه روی کلِ استخر پخش می‌شود (${seen.size} کارت از ${POOL.length} دیده شد)`,
    seen.size === POOL.length, `${POOL.length - seen.size} کارت هرگز نیامد`);
  ck('هیچ کارتی بختِ نامتناسب ندارد',
    Math.min(...counts) > 100 && Math.max(...counts) < 260,
    `کمینه ${Math.min(...counts)} بار، بیشینه ${Math.max(...counts)} بار (انتظار ~۱۶۷)`);
}

console.log('\n== ۰ب. سقفِ «همان ویژگی» درست کار می‌کند ==');
{
  // کاربرِ ضعیف: هر ویژگی ۴۰ ⇒ سقفِ هر ویژگیِ ربات ۳۲ (۴۰ منهای ۸).
  const weak = [0, 1, 2, 3, 4].map(() => mkCard(40, 500, 'common'));
  let above = 0, notAdjusted = 0;
  for (let i = 0; i < 200; i += 1) {
    const bot = duel.botDeck(weak);
    if (bot.some(c => c.attack > 32 || c.defense > 32 || c.speed > 32
      || c.technique > 32 || c.goalChance > 32)) above += 1;
    if (!bot.some(c => c.practiceAdjusted === true)) notAdjusted += 1;
  }
  ck('هیچ ویژگیِ ربات از سقفِ همان ویژگیِ کاربر بالاتر نمی‌زند', above === 0,
    `${above} دست بالای سقف بود`);
  ck('هم‌ترازی روی کارت‌ها علامت می‌خورد (شفافیتِ پنل/تست)', notAdjusted === 0,
    `${notAdjusted} دست بدونِ نشانِ practiceAdjusted`);

  // کاربرِ قوی (۱۰۰ در همهٔ ویژگی‌ها) در برابر استخری که قوی‌ترین ویژگی‌اش ۸۴
  // است ⇒ هیچ سقفی نمی‌بُرد (۹۲) ⇒ کارت‌ها باید **دست‌نخورده** بمانند.
  // ⚠️ استخرِ ضعیف عمداً انتخاب شد: استخرِ کامل کارتِ سرعتِ ۱۰۰ دارد و با
  //    کاربرِ ۱۰۰ هم سقف می‌خورد — آن حالت بالا سنجیده شده است.
  const weakPool = POOL.filter((_, idx) => idx >= 6);
  duel.setBotPool(weakPool);
  const strong = [0, 1, 2, 3, 4].map(() => mkCard(100, 3000, 'gold'));
  let touchedStrong = 0, sameStats = 0;
  for (let i = 0; i < 200; i += 1) {
    const bot = duel.botDeck(strong);
    if (bot.some(c => c.practiceAdjusted === true)) touchedStrong += 1;
    const real = weakPool.find(r => r.id === bot[0].cardTypeId);
    if (real && bot[0].attack === real.duel_attack && bot[0].speed === real.duel_speed) sameStats += 1;
  }
  ck('دستِ ضعیف‌تر از کاربر دست‌نخورده می‌ماند (شانسِ تصادفی به سودِ کاربر)', touchedStrong === 0,
    `${touchedStrong} دست بی‌دلیل کوتاه شد`);
  ck('کارتِ دست‌نخورده همان استاتِ واقعیِ خودش را دارد', sameStats === 200,
    `${200 - sameStats} کارت با استاتِ ناهم‌خوان`);
  duel.setBotPool(POOL);
}

console.log('\n== ۰ج. واحدِ سنجش، استاتِ خام است نه totalPower ==');
{
  // تلهٔ دیرینه: کاربری با استاتِ پایین ولی امتیاز و کلاسِ بالا. قدرتِ کل
  // (`totalPower`) او بالاست ولی در حکمِ راند هیچ نقشی ندارد؛ پس ربات
  // نباید از آن عدد باد کند.
  const trapDeck = [0, 1, 2, 3, 4].map(() => mkCard(50, 5000, 'legend'));
  const bot = duel.botDeck(trapDeck);
  const maxStat = Math.max(...bot.map(c => Math.max(c.attack, c.defense, c.speed, c.technique, c.goalChance)));
  ck('استاتِ ربات از امتیاز/کلاسِ کاربر باد نمی‌کند', maxStat <= 42,
    `استاتِ کاربر ۵۰ ولی بیشترین استاتِ ربات ${maxStat} شد (totalPower کاربر ${duel.totalPower(trapDeck[0])})`);

  // دو کاربرِ هم‌استات با امتیازِ خیلی متفاوت باید سقفِ یکسانی ببینند.
  const cheap = [0, 1, 2, 3, 4].map(() => mkCard(50, 0, 'normal'));
  const rich = [0, 1, 2, 3, 4].map(() => mkCard(50, 50000, 'legend'));
  const peakOf = deck => Math.max(...duel.botDeck(deck).map(c =>
    Math.max(c.attack, c.defense, c.speed, c.technique, c.goalChance)));
  const gap = Math.abs(peakOf(cheap) - peakOf(rich));
  ck('امتیاز و کمیابیِ کارت، سقفِ ربات را جابه‌جا نمی‌کند', gap <= 1,
    `اختلافِ سقف بین کارتِ ارزان و گران ${gap} واحد`);
}

console.log('\n== ۱. مسیرِ پشتیبان (استخرِ خالی) همان رفتارِ دیرین را دارد ==');
{
  // ⚠️ چرا این بخش مانده: مسیرِ پشتیبان روزِ سردیِ کش یا سیستمِ خالی اجرا
  //    می‌شود. اگر آن‌جا هم باگِ «خلطِ واحد» برگردد، تمرین همان روز خراب
  //    می‌شود و هیچ گاردی نمی‌بیندش.
  duel.setBotPool(null);
  const deck = [0, 1, 2, 3, 4].map(() => mkCard(50, 5000, 'legend'));
  const bot = duel.botDeck(deck);
  const maxBotStat = Math.max(...bot.map(c => c.attack));
  ck('استاتِ ربات نزدیکِ استاتِ کاربر است، نه نزدیکِ totalPower',
    maxBotStat <= 70,
    `استاتِ کاربر ۵۰ ولی بیشترین استاتِ ربات ${maxBotStat} شد (totalPower کاربر ${duel.totalPower(deck[0])})`);

  const withEffect = bot.filter(c => c.effect && c.effect !== 'none').length;
  ck('حداکثر دو کارتِ دستِ ساختگی افکت دارند', withEffect <= 2,
    `${withEffect} کارت از ۵ افکتِ فعال داشت`);
  ck('کارتِ اولِ دستِ ساختگی افکتِ راندِ اول (speedster) ندارد',
    bot[0].effect !== 'speedster',
    'speedster در راندِ اول ۱۵ امتیازِ رایگان می‌دهد');

  // تخصص‌ها نباید از پیش روی ترتیبِ راندها چیده شده باشند.
  const focusOrder = duel.ROUND_FOCUS.map(f => f.key);
  const alignHits = [];
  for (let run = 0; run < 200; run += 1) {
    const d = [0, 1, 2, 3, 4].map(() => mkCard(60, 1000, 'silver'));
    let aligned = 0;
    duel.botDeck(d).forEach((card, i) => {
      const focusKey = focusOrder[i];
      const stats = {
        duel_attack: card.attack, duel_defense: card.defense, duel_speed: card.speed,
        duel_technique: card.technique, duel_goal_chance: card.goalChance,
      };
      const best = Object.entries(stats).sort((x, y) => y[1] - x[1])[0][0];
      if (best === focusKey) aligned += 1;
    });
    alignHits.push(aligned);
  }
  const avgAligned = alignHits.reduce((x, y) => x + y, 0) / alignHits.length;
  ck('تخصصِ کارتِ ساختگی با تمرکزِ راند هم‌راستا نیست', avgAligned < 2.2,
    `به‌طور میانگین ${avgAligned.toFixed(2)} کارت از ۵ روی تمرکزِ همان راند بهینه بود (تصادفی ≈۱)`);
  duel.setBotPool(POOL);
}

console.log('\n== ۲. با کارت‌های واقعی هم نرخِ برد منصفانه است ==');
{
  // ⚠️ چرا این ماتریس این‌قدر متنوع است: باگ‌های توازن همیشه روی یک سطحِ
  //    خاص بدترین حالت را دارند. اگر فقط یک سطح تست شود، رگرسیون از دست
  //    می‌رود. برچسب‌ها همان ردیف‌های دیرین‌اند تا مقایسه با گذشته ممکن باشد.
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
    const r = winRate(stat, points, rarity, 1200);
    rates.push(r.win);
    ck(`${label}: تمرین قابلِ برد است (${r.win.toFixed(0)}٪ برد، ${r.loss.toFixed(0)}٪ باخت)`,
      r.win >= 55 && r.win <= 99,
      `برد ${r.win.toFixed(1)}٪ · باخت ${r.loss.toFixed(1)}٪ · مساوی ${r.draw.toFixed(1)}٪`);
  }
  const spread = Math.max(...rates) - Math.min(...rates);
  ck('نرخِ برد به سطحِ کارتِ کاربر وابسته نیست', spread <= 25,
    `دامنه ${spread.toFixed(1)} واحد (کمینه ${Math.min(...rates).toFixed(0)}٪، بیشینه ${Math.max(...rates).toFixed(0)}٪)`);
}

console.log('\n== ۳. دست‌های واقعی (کارت‌های خودِ سیستم) هم منصفانه‌اند ==');
{
  // این ردیف‌ها نزدیک‌ترین چیز به بازیِ واقعی‌اند: کاربری که کارت‌های واقعیِ
  // سیستم را دارد و با آن‌ها بازی می‌کند. `duelDeck` از خودِ استخر ساخته
  // می‌شود تا استات/افکت/امتیاز همه واقعی باشند.
  const byStat = [...POOL].map(r => duel.publicCard({ ...r, quantity: 1 }))
    .sort((a, b) => (a.attack + a.defense + a.speed + a.technique + a.goalChance)
      - (b.attack + b.defense + b.speed + b.technique + b.goalChance));
  const decks = [
    ['کارت‌های ضعیفِ سیستم', byStat.slice(0, 5)],
    ['یک دستِ میانه', byStat.slice(3, 8)],
    ['کارت‌های قویِ سیستم', byStat.slice(-5)],
  ];
  // ⚠️ بدترین حالتِ *اعلام‌شده*: کاربری که هنوز هیچ کارتی ندارد و با کارت‌های
  //    تمرینیِ بی‌افکت (استاتِ ۶۲..۷۴) بازی می‌کند. این ردیف عمداً سخت‌ترین
  //    دست را می‌سنجد و کفِ آن ۴۵٪ است — یعنی حتی این کاربر هم تقریباً
  //    پرتابِ سکه دارد، ولی «غلبهٔ تضمینی» ندارد. عددِ این ردیف باید در
  //    گزارش به مالک بیاید؛ اگر پایین‌تر رفت، یعنی توازن شکسته.
  const starter = [62, 66, 68, 70, 74].map((st, i) => duel.publicCard({
    card_type_id: `st-${i}`, name: `کارتِ تمرینی ${i + 1}`, point_value: 100 + i * 40,
    quantity: 1, duel_attack: st, duel_defense: st, duel_speed: st,
    duel_technique: st, duel_goal_chance: st, duel_energy: 100, duel_effect: 'none',
  }));
  decks.unshift(['دستِ تمرینیِ بی‌افکت (بدترین حالتِ اعلام‌شده)', starter]);

  // کف‌ها بر پایهٔ سنجشِ واقعی روی کاتالوگِ محصول انتخاب شده‌اند؛ این استخرِ
  // ۱۲ کارتی از محصول **سخت‌تر** است (عمقِ کمتر = ربات بی‌رحم‌تر).
  const FLOOR = {
    'دستِ تمرینیِ بی‌افکت (بدترین حالتِ اعلام‌شده)': 45,
    'کارت‌های ضعیفِ سیستم': 55,
    'یک دستِ میانه': 65,
    'کارت‌های قویِ سیستم': 80,
  };
  for (const [label, deck] of decks) {
    let w = 0;
    const runs = 1200;
    for (let i = 0; i < runs; i += 1) if (playMatch(deck, pickAverage) === 'X') w += 1;
    const win = (w / runs) * 100;
    const floor = FLOOR[label] || 55;
    ck(`${label}: قابلِ برد (${win.toFixed(0)}٪ ≥ ${floor}٪)`, win >= floor,
      `فقط ${win.toFixed(1)}٪ برد — تمرین نباید به بازیِ نابرابر تبدیل شود`);
  }
}

console.log('\n== ۵. کاربرِ ضعیف بیشتر از کاربرِ قوی نمی‌بازد ==');
{
  // این دقیقاً همان چیزی بود که خراب بود: کفِ clamp روی ۳۰ باعث می‌شد
  // ضعیف‌ترین کاربران سخت‌ترین حریف را بگیرند.
  const weak = winRate(30, 0, 'normal', 2000);
  const strong = winRate(90, 50000, 'legend', 2000);
  ck('کاربرِ نوپا هم شانسِ واقعی دارد', weak.win >= 55,
    `کاربرِ استاتِ ۳۰ فقط ${weak.win.toFixed(1)}٪ برد`);
  // ⚠️ سقفِ ویژگی باعث می‌شود نوپا **بیشتر** ببرد تا حرفه‌ای (نوپا سقفِ
  //    پایین‌تری به ربات می‌دهد). این عمدی است: تمرینِ تازه‌وارد باید
  //    دلگرم‌کننده باشد؛ سختیِ واقعی در بازیِ آنلاین است.
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
