#!/usr/bin/env node
// تنظیماتِ اقتصادِ بازی‌ها — بدون نیاز به دیتابیس (فقط بخش‌های خالص + شبیه‌سازی).
//
//   • merge/isCustom: ادمین می‌تواند هر عددی را بگذارد؛ مقادیر نامعتبر clamp
//     می‌شوند و ۰٪ هم مجاز است.
//   • carryoverAmount: floor(سکه × درصد / ۱۰۰)؛ ۰٪ ⇒ هیچ انتقالی.
//   • carryoverBetween: با یک client جعلی — ردیفِ هر کاربر در لیگِ هدف
//     دقیقاً با سهمِ انتقالی جمع می‌شود و شمارندهٔ نمایشی از لیگ‌های فعال
//     بازسازی می‌شود.
//   • coinService: بدونِ تنظیمِ سفارشی، جدولِ پیش‌فرض برقرار است و
//     ضربه‌زن هر لول ۵ سکه می‌دهد.
const economy = require('../src/services/gameEconomyService');
const league = require('../src/services/leagueService');
const coins = require('../src/services/coinService');

let pass = 0, fail = 0;
const ok = (c, n, d = '') => {
  if (c) { pass++; console.log(`  ✓ ${n}`); }
  else { fail++; console.error(`  ✗ ${n}${d ? ` — ${d}` : ''}`); }
};

console.log('\n══ ۱. merge و اعتبارسنجی ══');
{
  const m = economy.merge({});
  ok(m.coinCarryoverPercent === 10, 'پیش‌فرضِ درصدِ انتقال ۱۰ است', String(m.coinCarryoverPercent));
  ok(m.tapCoinsPerLevel === 5, 'پیش‌فرضِ سکهٔ هر لولِ ضربه‌زن ۵ است');
  ok(m.coinRewards.card_duel[1000].win === 30, 'پیش‌فرضِ سکهٔ بردِ دوئلِ ۱۰۰۰ همان ۳۰ است');

  const zero = economy.merge({ coinCarryoverPercent: 0 });
  ok(zero.coinCarryoverPercent === 0, 'ادمین می‌تواند ۰ بگذارد (انتقال صفر)');
  ok(!economy.isCustom(economy.merge(economy.DEFAULTS)), 'تنظیمِ پیش‌فرض «سفارشی» نیست');
  ok(economy.isCustom(zero), 'تغییرِ درصد به ۰ «سفارشی» محسوب می‌شود');

  const bad = economy.merge({
    coinCarryoverPercent: 250,
    tapCoinsPerLevel: -3,
    coinRewards: { card_duel: { 100: { win: 'هزار', loss: -5 } } },
    dailyCoinQuota: { 100: 'x', 1000: 99999 },
  });
  ok(bad.coinCarryoverPercent === 100, 'درصد بالای ۱۰۰ به ۱۰۰ می‌چسبد', String(bad.coinCarryoverPercent));
  ok(bad.tapCoinsPerLevel === 1, 'سکهٔ منفی لول به کفِ ۱ می‌چسبد');
  ok(bad.coinRewards.card_duel[100].win === 10, 'رشتهٔ نامعتبر به پیش‌فرض می‌افتد');
  ok(bad.coinRewards.card_duel[100].loss === 0, 'سکهٔ منفیِ باخت به ۰ می‌چسبد');
  ok(bad.dailyCoinQuota[100] === 30, 'سهمیهٔ نامعتبر به پیش‌فرض می‌افتد');
}

console.log('\n══ ۲. محاسبهٔ سهمِ انتقالی ══');
{
  ok(league.carryoverAmount(1000, 10) === 100, '۱۰۰۰ سکه × ۱۰٪ = ۱۰۰');
  ok(league.carryoverAmount(999, 10) === 99, 'floor: ۹۹۹ × ۱۰٪ = ۹۹');
  ok(league.carryoverAmount(9, 10) === 0, 'سهمِ کمتر از یک سکه = ۰');
  ok(league.carryoverAmount(1000, 0) === 0, 'درصدِ ۰ ⇒ انتقال صفر (خواستهٔ مالک)');
  ok(league.carryoverAmount(1000, 100) === 1000, '۱۰۰٪ یعنی کلِ سکه منتقل می‌شود');
  ok(league.carryoverAmount(0, 10) === 0 && league.carryoverAmount(NaN, 10) === 0,
    'سکهٔ صفر/نامعتبر انتقالی ندارد');
}

console.log('\n══ ۳. carryoverBetween با client جعلی ══');
{
  const log = [];
  const client = {
    async query(sql, params) {
      log.push({ sql, params });
      if (/FROM league_leaderboard_entries/.test(sql) && /coins > 0/.test(sql)) {
        return { rows: [{ user_id: 'u1', coins: 1000 }, { user_id: 'u2', coins: 999 }] };
      }
      return { rowCount: 1, rows: [] };
    },
  };
  economy.setCachedForTest({ coinCarryoverPercent: 10 });
  (async () => {
    const r = await league.carryoverBetween(client, 'season-old', 'season-new');
    ok(r.pct === 10 && r.carriedUsers === 2, 'دو کاربر سکه داشتند و هر دو سهم گرفتند', JSON.stringify(r));
    const inserts = log.filter(l => /INSERT INTO league_leaderboard_entries/.test(l.sql));
    ok(inserts.length === 2, 'دو ردیف در لیگِ هدف ساخته شد');
    ok(inserts[0].params[0] === 'season-new' && inserts[0].params[2] === 100,
      'کاربر اول: ۱۰۰۰ × ۱۰٪ = ۱۰۰ → لیگ جدید', JSON.stringify(inserts[0].params));
    ok(inserts[1].params[2] === 99, 'کاربر دوم: ۹۹۹ × ۱۰٪ = ۹۹ (floor)');
    const display = log.find(l => /UPDATE users u SET/.test(l.sql) && /coins = COALESCE/.test(l.sql));
    ok(Boolean(display) && display.params[0].length === 2,
      'شمارندهٔ نمایشی از لیگ‌های فعال بازسازی شد');
  })().then(() => finish()).catch(e => { console.error(e); process.exit(1); });
}

function finish() {
  console.log('\n══ ۴. fallback سرویس سکه ══');
  {
    economy.setCachedForTest(economy.DEFAULTS);
    const r = coins.coinRewardFor('card_duel', 1000);
    ok(r.win === 30 && r.draw === 9 && r.loss === 3, 'جدولِ پیش‌فرضِ سکه سالم است');
    ok(coins.coinRewardFor('unknown_game', 100).win === 0, 'بازیِ ناشناخته صفر سکه');
    ok(coins.tapLevelCoin(1) === 5 && coins.tapLevelCoin(50) === 5,
      'هر لولِ ضربه‌زن ۵ سکه (پیش‌فرض)');
    ok(coins.tapCoinsFor([1, 2, 3]) === 15, 'سه لول = ۱۵ سکه');
  }
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} موفق، ${fail} ناموفق\n`);
  process.exit(fail === 0 ? 0 : 1);
}
