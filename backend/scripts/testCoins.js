#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// تست سیستم سکه — جدولِ پاداش، سهمیهٔ روزانه، و اتصال به escrow
// ═══════════════════════════════════════════════════════════════════════════
//
// این تست‌ها با دیتابیسِ جعلی کار می‌کنند تا در CI بدونِ Postgres اجرا شوند
// و — مهم‌تر — تا بشود حالت‌هایی را ساخت که روی دیتابیسِ واقعی ساختنشان
// سخت است: سهمیهٔ دقیقاً پرشده، عوض شدنِ روز وسطِ یک مسابقه، و نبودِ لیگِ
// فعال.
//
// ⚠️ درسِ دورهای قبل: هر گاردی که اینجا نوشته می‌شود باید **fail-test**
//    شده باشد — یعنی ثابت شود که با خرابکاریِ عمدی قرمز می‌شود. تستی که
//    هیچ‌وقت رد نمی‌شود، تست نیست.

const {
  createCoinService, coinRewardFor, hasCoinReward, quotaTracked, tehranDate,
  tapLevelCoin, tapCoinsFor, COIN_TABLE, DAILY_QUOTA,
} = require('../src/services/coinService');
const { createGameStakeService } = require('../src/services/gameStakeService');

let pass = 0, fail = 0;
const ok = (c, n) => (c ? (pass++, console.log(`  ✓ ${n}`))
  : (fail++, console.error(`  ✗ ${n}`)));

// ── دیتابیسِ جعلی با سهمیهٔ واقعی ──────────────────────────────────────────
//
// این کلاس رفتارِ `INSERT … ON CONFLICT … WHERE` را شبیه‌سازی می‌کند، چون
// دقیقاً همان جمله است که سقف را اعمال می‌کند. اگر شبیه‌سازی ساده‌تری
// می‌نوشتیم (مثلاً همیشه true)، تست سبز می‌ماند در حالی که سقف کار نمی‌کند.
class FakeDb {
  constructor({ users = [], seasonActive = true } = {}) {
    // بازیکنِ پیش‌فرض فعال و پول‌دار است — تستِ سکه نباید سرِ کمبودِ
    // امتیاز یا حسابِ مسدود شکست بخورد؛ آن‌ها را testStakeEscrow پوشش می‌دهد.
    this.users = new Map(users.map(u => [u.id, {
      status: 'active', current_points: 1e6, coins: 0, ...u,
    }]));
    this.quota = new Map();      // `${userId}|${date}` -> {used_100, used_1000}
    this.entries = new Map();    // userId -> coins
    this.matches = new Map();    // matchId -> row
    this.seasonActive = seasonActive;
    this.log = [];
  }

  _quotaRow(userId, date) {
    const key = `${userId}|${date}`;
    if (!this.quota.has(key)) this.quota.set(key, { used_100: 0, used_1000: 0 });
    return this.quota.get(key);
  }

  async query(sql, params = []) {
    this.log.push(sql.replace(/\s+/g, ' ').trim().slice(0, 70));

    if (/INSERT INTO user_coin_quota/.test(sql)) {
      const col = /used_1000 = user_coin_quota|\(user_id, quota_date, used_1000/.test(sql)
        ? 'used_1000' : 'used_100';
      const [userId, date, limit] = params;
      const row = this._quotaRow(userId, date);
      if (row[col] >= limit) return { rowCount: 0, rows: [] };
      row[col] += 1;
      return { rowCount: 1, rows: [] };
    }
    if (/UPDATE user_coin_quota/.test(sql)) {
      const col = /used_1000 = GREATEST/.test(sql) ? 'used_1000' : 'used_100';
      const [userId, date] = params;
      const key = `${userId}|${date}`;
      if (!this.quota.has(key)) return { rowCount: 0, rows: [] };
      const row = this.quota.get(key);
      row[col] = Math.max(0, row[col] - 1);
      return { rowCount: 1, rows: [] };
    }
    if (/SELECT used_100, used_1000 FROM user_coin_quota/.test(sql)) {
      const [userId, date] = params;
      const key = `${userId}|${date}`;
      return { rows: this.quota.has(key) ? [this.quota.get(key)] : [] };
    }
    if (/INSERT INTO league_leaderboard_entries/.test(sql)) {
      if (!this.seasonActive) return { rowCount: 0, rows: [] };
      const [userId, coins] = params;
      this.entries.set(userId, (this.entries.get(userId) || 0) + Number(coins));
      return { rowCount: 1, rows: [] };
    }
    if (/UPDATE users SET coins = coins \+/.test(sql)) {
      const [userId, coins] = params;
      const u = this.users.get(userId);
      if (u) u.coins = Number(u.coins || 0) + Number(coins);
      return { rowCount: 1, rows: [] };
    }
    if (/SELECT id, current_points, status/.test(sql) && /ANY/.test(sql)) {
      const ids = params[0];
      return { rows: ids.map(id => this.users.get(id)).filter(Boolean)
        .sort((a, b) => (a.id < b.id ? -1 : 1)) };
    }
    if (/INSERT INTO game_stake_matches/.test(sql)) {
      const [id, gameId, x, o, stake, gross, comm, net,
        coinReward, cWin, cDraw, cLoss, qx, qo, qDate] = params;
      this.matches.set(id, {
        id, game_id: gameId, player_x_id: x, player_o_id: o,
        stake_points: stake, gross_pot: gross, commission_points: comm,
        net_pot: net, status: 'reserved', coin_reward: coinReward,
        coin_reward_win: cWin, coin_reward_draw: cDraw, coin_reward_loss: cLoss,
        coin_quota_x: qx, coin_quota_o: qo, coin_quota_date: qDate,
      });
      return { rowCount: 1, rows: [] };
    }
    if (/SELECT \* FROM game_stake_matches/.test(sql)) {
      const row = this.matches.get(params[0]);
      return { rows: row ? [row] : [] };
    }
    if (/UPDATE game_stake_matches/.test(sql)) {
      const row = this.matches.get(params[0]);
      // status فقط از 'reserved' عوض می‌شود — همان شرطی که در SQL واقعی
      // idempotency را تضمین می‌کند.
      if (row && row.status === 'reserved') {
        row.status = /status='refunded'/.test(sql) ? 'refunded' : 'settled';
        row.outcome = params[1] || null;
      }
      return { rowCount: row ? 1 : 0, rows: [] };
    }
    return { rows: [], rowCount: 1 };
  }

  async connect() {
    const self = this;
    return { query: (s, p) => self.query(s, p), release() {} };
  }
}

const fakePoints = () => ({
  debit: async (_c, o) => ({ delta: -o.points, balanceAfter: 9999 }),
  credit: async (_c, o) => ({ delta: o.points, balanceAfter: 9999 }),
});

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const mk = n => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;

(async () => {
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== جدول پاداش سکه ==');
  // ═══════════════════════════════════════════════════════════════════════
  // ── جدولِ سه‌حالته (دورِ ۲۶) ────────────────────────────────────────────
  //
  // تا پیش از این فقط برنده سکه می‌گرفت و مبلغش به بازی وابسته بود
  // (دوئل دو برابرِ پنالتی). هر دو تصمیم عوض شد:
  //
  //   ۱. **هر سه بازی یکسان‌اند.** وقتی دوئل دو برابر می‌داد، بازیکن
  //      مجبور بود برای رتبه، بازی‌ای را انتخاب کند که دوستش ندارد.
  //      انتخابِ بازی باید سلیقه باشد نه بهینه‌سازی.
  //   ۲. **هر سه نتیجه پول دارند.** باختِ صفرسکه یعنی کسی که تازه شروع
  //      کرده و هنوز می‌بازد، ساعت‌ها بازی می‌کند و در جدول تکان نمی‌خورد.
  //      حالا باخت هم چیزی می‌دهد — کم، ولی نه هیچ.
  const t100 = coinRewardFor('card_duel', 100);
  ok(t100.win === 10, 'شرط ۱۰۰: بردِ ۱۰ سکه');
  ok(t100.draw === 3, 'شرط ۱۰۰: تساویِ ۳ سکه');
  ok(t100.loss === 1, 'شرط ۱۰۰: باختِ ۱ سکه');

  const t1000 = coinRewardFor('card_duel', 1000);
  ok(t1000.win === 30, 'شرط ۱۰۰۰: بردِ ۳۰ سکه');
  ok(t1000.draw === 9, 'شرط ۱۰۰۰: تساویِ ۹ سکه');
  ok(t1000.loss === 3, 'شرط ۱۰۰۰: باختِ ۳ سکه');

  // هر سه بازی دقیقاً یک جدول دارند.
  for (const game of ['card_duel', 'penalty', 'memory']) {
    for (const stake of [100, 1000]) {
      const r = coinRewardFor(game, stake);
      const ref = coinRewardFor('card_duel', stake);
      ok(r.win === ref.win && r.draw === ref.draw && r.loss === ref.loss,
        `${game} در شرطِ ${stake} همان جدولِ مشترک را دارد`);
    }
  }

  // ⚠️ برد باید همیشه به‌روشنی از تساوی بهتر باشد و تساوی از باخت،
  //    وگرنه انگیزهٔ بردن از بین می‌رود و بازیکن یاد می‌گیرد که مساوی
  //    کردن «به‌صرفه‌تر» است.
  for (const stake of [100, 1000]) {
    const r = coinRewardFor('card_duel', stake);
    ok(r.win > r.draw && r.draw > r.loss,
      `شرطِ ${stake}: نردبانِ برد > تساوی > باخت برقرار است`);
    ok(r.win >= r.loss * 5,
      `شرطِ ${stake}: بردن دستِ‌کم ۵ برابرِ باختن می‌ارزد`);
  }

  // نسبتِ ۱:۳ بینِ دو سطحِ شرط، در هر سه نتیجه.
  //
  // شرطِ ۱۰۰۰ ده برابرِ ۱۰۰ امتیاز خرج دارد ولی فقط سه برابر سکه می‌دهد.
  // این عمدی است: اگر ۱:۱۰ بود، سکه عملاً با امتیاز خریدنی می‌شد و
  // کاربرِ پرپول رتبه را می‌خرید. ۱:۳ ریسکِ بیشتر را پاداش می‌دهد بدون
  // آنکه جدول را به مزایدهٔ امتیاز تبدیل کند.
  for (const [game, row] of Object.entries(COIN_TABLE)) {
    for (const key of ['win', 'draw', 'loss']) {
      ok(row[1000][key] === row[100][key] * 3,
        `نسبت ۱:۳ در ${game} برای ${key} برقرار است`);
    }
  }

  // بازی رایگان و شرطِ لابیِ ۵۰۰۰ عمداً سکه ندارند — در هر سه نتیجه.
  const zero = r => r.win === 0 && r.draw === 0 && r.loss === 0;
  ok(zero(coinRewardFor('card_duel', 0)), 'بازی رایگان سکه ندارد');
  ok(zero(coinRewardFor('card_duel', 5000)), 'شرط ۵۰۰۰ لابی سکه ندارد');
  ok(zero(coinRewardFor('tap', 100)), 'بازی تک‌نفرهٔ تپ سکه ندارد');
  ok(zero(coinRewardFor('unknown_game', 100)), 'بازی ناشناخته سکه ندارد');

  ok(hasCoinReward('card_duel', 100) === true, 'شرطِ ۱۰۰ سکه‌دار است');
  ok(hasCoinReward('card_duel', 0) === false, 'رایگان سکه‌دار نیست');
  ok(hasCoinReward('card_duel', 5000) === false, 'لابیِ ۵۰۰۰ سکه‌دار نیست');
  ok(hasCoinReward('tap', 1000) === false, 'تپ سکه‌دارِ شرطی نیست');

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== سکهٔ بازی ضربه‌زن ==');
  // ═══════════════════════════════════════════════════════════════════════
  //
  // `ceil(level/5)`: هر پنج لول یک پله بالاتر. لولِ ۱ تا ۵ یک سکه،
  // ۴۶ تا ۵۰ ده سکه.
  ok(tapLevelCoin(1) === 1, 'لول ۱ → ۱ سکه');
  ok(tapLevelCoin(5) === 1, 'لول ۵ → ۱ سکه (پایانِ پلهٔ اول)');
  ok(tapLevelCoin(6) === 2, 'لول ۶ → ۲ سکه (شروعِ پلهٔ دوم)');
  ok(tapLevelCoin(46) === 10, 'لول ۴۶ → ۱۰ سکه');
  ok(tapLevelCoin(50) === 10, 'لول ۵۰ → ۱۰ سکه');

  // ورودیِ خراب نباید سکه بسازد.
  for (const bad of [0, -1, -50, null, undefined, NaN, 'abc']) {
    ok(tapLevelCoin(bad) === 0, `لولِ نامعتبر ${bad} صفر سکه می‌دهد`);
  }

  {
    // جمعِ کلِ مسیر باید دقیقاً ۲۷۵ باشد — عددی که کلِ بودجهٔ اقتصادی
    // رویش بسته شده. اگر کسی روزی فرمول را عوض کند، اینجا می‌شکند.
    let total = 0;
    for (let lv = 1; lv <= 50; lv++) total += tapLevelCoin(lv);
    ok(total === 275, `جمعِ کلِ ۵۰ لول ۲۷۵ سکه است (${total})`);

    // پاداش هرگز نباید نزولی شود.
    let monotonic = true;
    for (let lv = 2; lv <= 50; lv++) {
      if (tapLevelCoin(lv) < tapLevelCoin(lv - 1)) monotonic = false;
    }
    ok(monotonic, 'پاداش با بالا رفتنِ لول هیچ‌وقت کم نمی‌شود');
  }

  // جمعِ یک بسته: سرویس فهرستِ لول‌های تمام‌شده را می‌دهد، نه اختلافِ ساده.
  ok(tapCoinsFor([9, 10, 11]) === 7, 'بستهٔ لول ۹ و ۱۰ و ۱۱ → ۷ سکه');
  ok(tapCoinsFor([]) === 0, 'بستهٔ خالی صفر سکه');
  ok(tapCoinsFor(null) === 0, 'ورودیِ غیرآرایه صفر سکه');
  ok(tapCoinsFor([50, 50]) === 20, 'تکرارِ لول جمع می‌شود (منطقِ خالصِ جمع)');

  // ⚠️ ضربه‌زن نباید از یک بازیِ رقابتیِ شرطِ ۱۰۰۰ سودآورتر باشد،
  //    وگرنه بازیکن به‌جای رقابت، تنها می‌نشیند و تپ می‌کند.
  ok(tapLevelCoin(50) < coinRewardFor('card_duel', 1000).win,
    'گران‌ترین لولِ ضربه‌زن از بردِ یک دوئلِ ۱۰۰۰ کمتر است');

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== روزِ تقویمی به وقت تهران ==');
  // ═══════════════════════════════════════════════════════════════════════
  ok(/^\d{4}-\d{2}-\d{2}$/.test(tehranDate()), 'قالب تاریخ YYYY-MM-DD است');
  {
    // ۲۰۲۶-۰۳-۲۰ ساعت ۲۱:۰۰ UTC = ۲۰۲۶-۰۳-۲۱ ساعت ۰۰:۳۰ تهران → روزِ بعد.
    const late = new Date('2026-03-20T21:00:00Z');
    ok(tehranDate(late) === '2026-03-21',
      'ساعت ۲۱ UTC از نظر تهران روزِ بعد است');
    // ۲۰۲۶-۰۳-۲۰ ساعت ۲۰:۰۰ UTC = ۲۳:۳۰ همان روز در تهران.
    const early = new Date('2026-03-20T20:00:00Z');
    ok(tehranDate(early) === '2026-03-20',
      'ساعت ۲۰ UTC هنوز همان روزِ تهران است');
    // ⚠️ همین دو تست بودند که ثابت کردند toISOString کافی نیست:
    //    برای `late` مقدارِ UTC می‌داد ۲۰۲۶-۰۳-۲۰ — یعنی یک روز عقب.
    ok(late.toISOString().slice(0, 10) !== tehranDate(late),
      'UTC و تهران در این لحظه واقعاً فرق دارند (تست معنادار است)');
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== سهمیهٔ روزانه: سقف واقعاً اعمال می‌شود ==');
  // ═══════════════════════════════════════════════════════════════════════
  {
    const db = new FakeDb({ users: [{ id: U1 }] });
    const coins = createCoinService(db);
    const client = await db.connect();

    let granted = 0;
    for (let i = 0; i < DAILY_QUOTA[100] + 5; i++) {
      if (await coins.consumeQuota(client, U1, 100)) granted++;
    }
    ok(granted === DAILY_QUOTA[100],
      `دقیقاً ${DAILY_QUOTA[100]} بار سهمیهٔ ۱۰۰ داده شد، نه بیشتر`);

    // سقفِ ۱۰۰۰ مستقل است: پر شدنِ یکی نباید دیگری را ببندد.
    let granted1000 = 0;
    for (let i = 0; i < DAILY_QUOTA[1000] + 3; i++) {
      if (await coins.consumeQuota(client, U1, 1000)) granted1000++;
    }
    ok(granted1000 === DAILY_QUOTA[1000],
      `سقف ۱۰۰۰ مستقل است و ${DAILY_QUOTA[1000]} بار داد`);

    const q = await coins.getQuota(U1);
    ok(q.remaining[100] === 0 && q.remaining[1000] === 0,
      'باقی‌ماندهٔ هر دو سطح صفر گزارش می‌شود');
    ok(q.used[100] === DAILY_QUOTA[100] && q.used[1000] === DAILY_QUOTA[1000],
      'مصرف‌شده درست گزارش می‌شود');
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== سهمیه بینِ سه بازی مشترک است ==');
  // ═══════════════════════════════════════════════════════════════════════
  //
  // این مهم‌ترین تستِ ضدِ سوءاستفاده است: اگر سهمیه per-game بود، بازیکن با
  // چرخیدن بینِ سه بازی سه برابر سکه می‌گرفت.
  {
    const db = new FakeDb({ users: [{ id: U1 }, { id: U2 }] });
    const stakes = createGameStakeService(db, fakePoints(), createCoinService(db));
    const games = ['card_duel', 'penalty', 'memory'];
    let reserved = 0;
    for (let i = 0; i < DAILY_QUOTA[100] + 6; i++) {
      const r = await stakes.reserveMatch({
        matchId: mk(i), gameId: games[i % 3], stake: 100,
        playerXId: U1, playerOId: U2,
      });
      if (r.coinEligible[U1]) reserved++;
    }
    ok(reserved === DAILY_QUOTA[100],
      `چرخیدن بین سه بازی سقف را نمی‌شکند (${reserved} = ${DAILY_QUOTA[100]})`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== تسویه: برنده، بازنده و تساوی ==');
  // ═══════════════════════════════════════════════════════════════════════
  {
    const db = new FakeDb({ users: [{ id: U1 }, { id: U2 }] });
    const coinSvc = createCoinService(db);
    const stakes = createGameStakeService(db, fakePoints(), coinSvc);

    await stakes.reserveMatch({
      matchId: mk(1), gameId: 'card_duel', stake: 1000,
      playerXId: U1, playerOId: U2,
    });
    const res = await stakes.settleMatch({ matchId: mk(1), winnerUserId: U1 });

    // ⚠️ `coinsAwarded` فقط سکهٔ **برنده** است — نه جمعِ پرداختی.
    //    موتور آن را مستقیم به کلاینتِ برنده می‌فرستد، پس اگر روزی جمع
    //    شود، بازنده عددِ برنده را روی صفحه‌اش می‌بیند.
    ok(res.coinsAwarded === 30, 'برندهٔ دوئل ۱۰۰۰ سی سکه گرفت');
    ok(res.loserCoins === 3, 'بازنده سه سکهٔ دلجویی گرفت');
    ok(db.users.get(U1).coins === 30, 'شمارندهٔ users.coins برنده به‌روز شد');
    ok(db.users.get(U2).coins === 3, 'شمارندهٔ users.coins بازنده هم به‌روز شد');
    ok(db.entries.get(U1) === 30, 'جدولِ رتبه‌بندیِ فصل برای برنده به‌روز شد');
    ok(db.entries.get(U2) === 3, 'جدولِ فصل برای بازنده هم به‌روز شد');

    // ⚠️ سکهٔ باخت باید واقعاً کوچک بماند. اگر روزی کسی آن را بالا ببرد،
    //    باختنِ سریعِ پشتِ‌سرهم به یک استراتژیِ کشتِ سکه تبدیل می‌شود:
    //    بازیکن عمداً می‌بازد تا سهمیه‌اش را سریع خرج کند.
    ok(res.loserCoins * 5 <= res.coinsAwarded,
      'سکهٔ باخت حداکثر یک‌پنجمِ سکهٔ برد است (ضدِ کشتِ باخت)');
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== مساوی به هر دو بازیکن سکه می‌دهد ==');
  // ═══════════════════════════════════════════════════════════════════════
  {
    const db = new FakeDb({ users: [{ id: U1 }, { id: U2 }] });
    const stakes = createGameStakeService(db, fakePoints(), createCoinService(db));
    await stakes.reserveMatch({
      matchId: mk(2), gameId: 'card_duel', stake: 1000,
      playerXId: U1, playerOId: U2,
    });
    const res = await stakes.settleMatch({ matchId: mk(2), draw: true });

    // تساوی تا دورِ ۲۶ هیچ نمی‌داد. با نرخِ تساویِ ۴.۵٪ در دوئل، آن
    // صفر یعنی تقریباً یکی از هر بیست بازیِ کامل بی‌مزد بود — و بدتر،
    // بازیکن انگیزه پیدا می‌کرد در وضعیتِ مساوی بازی را رها کند.
    ok(res.drawCoins === 9, 'تساویِ شرطِ ۱۰۰۰ نُه سکه می‌دهد');
    ok(res.coinsAwarded === 0, 'در تساوی برنده‌ای وجود ندارد');
    ok(db.users.get(U1).coins === 9 && db.users.get(U2).coins === 9,
      'هر دو بازیکن سکهٔ تساوی را گرفتند');
    ok(db.entries.get(U1) === 9 && db.entries.get(U2) === 9,
      'جدولِ فصل برای هر دو به‌روز شد');

    // ⚠️ تساوی نباید از برد به‌صرفه‌تر باشد — نه برای یک نفر، نه در جمع.
    //    اگر ۲×draw از win بیشتر شود، دو بازیکنِ هماهنگ می‌توانند با
    //    تساویِ عمدی بیشتر از یک بازیِ واقعی سکه بسازند.
    const row = coinRewardFor('card_duel', 1000);
    ok(row.draw * 2 <= row.win + row.loss,
      'تساویِ تبانی‌شده از یک بازیِ واقعی سودآورتر نیست');
    // سهمیه در تساوی برنمی‌گردد — تصمیمِ عمدی، مستند در settleMatch.
    const q = await createCoinService(db).getQuota(U1);
    ok(q.used[1000] === 1, 'سهمیهٔ تساوی سوخته می‌ماند (عمدی)');
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== سقفِ پر: بازی ادامه دارد ولی سکه نمی‌دهد ==');
  // ═══════════════════════════════════════════════════════════════════════
  {
    const db = new FakeDb({ users: [{ id: U1 }, { id: U2 }] });
    const coinSvc = createCoinService(db);
    const stakes = createGameStakeService(db, fakePoints(), coinSvc);
    const client = await db.connect();
    // سهمیهٔ ۱۰۰۰ کاربر U1 را دستی پر می‌کنیم.
    for (let i = 0; i < DAILY_QUOTA[1000]; i++) {
      await coinSvc.consumeQuota(client, U1, 1000);
    }
    const r = await stakes.reserveMatch({
      matchId: mk(3), gameId: 'card_duel', stake: 1000,
      playerXId: U1, playerOId: U2,
    });
    ok(r.matchId === mk(3), 'مسابقه با سهمیهٔ پر هم رزرو می‌شود (بازی بسته نمی‌شود)');
    ok(r.coinEligible[U1] === false, 'کاربرِ سقف‌پر واجدِ سکه نیست');
    ok(r.coinEligible[U2] === true, 'حریفش که سهمیه دارد واجد است');

    const res = await stakes.settleMatch({ matchId: mk(3), winnerUserId: U1 });
    ok(res.coinsAwarded === 0, 'بردِ کاربرِ سقف‌پر سکه نمی‌دهد');
    ok(!db.users.get(U1).coins, 'شمارندهٔ سکه‌اش دست‌نخورده ماند');
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== برگشتِ سهمیه در مسابقهٔ ناتمام ==');
  // ═══════════════════════════════════════════════════════════════════════
  {
    const db = new FakeDb({ users: [{ id: U1 }, { id: U2 }] });
    const coinSvc = createCoinService(db);
    const stakes = createGameStakeService(db, fakePoints(), coinSvc);

    await stakes.reserveMatch({
      matchId: mk(4), gameId: 'penalty', stake: 100,
      playerXId: U1, playerOId: U2,
    });
    const before = await coinSvc.getQuota(U1);
    ok(before.used[100] === 1, 'سهمیه موقعِ شروع سوخت');

    await stakes.refundMatch(mk(4));
    const after = await coinSvc.getQuota(U1);
    ok(after.used[100] === 0, 'سهمیه بعد از برگشتِ مسابقه پس داده شد');
    const afterO = await coinSvc.getQuota(U2);
    ok(afterO.used[100] === 0, 'سهمیهٔ هر دو بازیکن برگشت');
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== برگشت به سهمیهٔ کاربرِ سقف‌پر هدیه نمی‌دهد ==');
  // ═══════════════════════════════════════════════════════════════════════
  //
  // اگر refund کورکورانه هر دو را برگرداند، کاربری که موقعِ شروع سهمیه
  // نداشت یک سهمیهٔ رایگان می‌گرفت — یعنی می‌شد با شروع و رها کردنِ
  // مسابقه، سقف را دور زد.
  {
    const db = new FakeDb({ users: [{ id: U1 }, { id: U2 }] });
    const coinSvc = createCoinService(db);
    const stakes = createGameStakeService(db, fakePoints(), coinSvc);
    const client = await db.connect();
    for (let i = 0; i < DAILY_QUOTA[100]; i++) {
      await coinSvc.consumeQuota(client, U1, 100);
    }
    await stakes.reserveMatch({
      matchId: mk(5), gameId: 'memory', stake: 100,
      playerXId: U1, playerOId: U2,
    });
    await stakes.refundMatch(mk(5));
    const q = await coinSvc.getQuota(U1);
    ok(q.used[100] === DAILY_QUOTA[100],
      'سهمیهٔ کاربرِ سقف‌پر بعد از برگشت هم پر مانده (هدیه نگرفت)');
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== نبودِ لیگِ فعال: سکه گم نمی‌شود، ساخته هم نمی‌شود ==');
  // ═══════════════════════════════════════════════════════════════════════
  {
    const db = new FakeDb({
      users: [{ id: U1 }, { id: U2 }], seasonActive: false });
    const stakes = createGameStakeService(db, fakePoints(), createCoinService(db));
    await stakes.reserveMatch({
      matchId: mk(6), gameId: 'card_duel', stake: 100,
      playerXId: U1, playerOId: U2,
    });
    const res = await stakes.settleMatch({ matchId: mk(6), winnerUserId: U1 });
    ok(res.coinsAwarded === 0, 'بدونِ لیگِ فعال سکه‌ای داده نمی‌شود');
    ok(!db.users.get(U1).coins,
      'شمارندهٔ users.coins هم دست‌نخورده ماند (با حقیقت می‌خواند)');
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== لابیِ خصوصی: نه سکه، نه سوختنِ سهمیه ==');
  // ═══════════════════════════════════════════════════════════════════════
  //
  // 🔴 باگی که تا دورِ ۲۶ زنده بود: موتور `matchMode` را به `reserveMatch`
  //    پاس نمی‌داد، پس مسابقهٔ لابیِ خصوصی هم مثل مسابقهٔ عمومی حساب
  //    می‌شد. نتیجه: دو دوستِ هماهنگ می‌توانستند در اتاقِ خصوصی، دور از
  //    هر حریفِ واقعی، سکهٔ لیگ بسازند — و بدتر، سهمیهٔ روزانه‌شان هم
  //    سر بازی‌های خصوصی می‌سوخت.
  {
    const db = new FakeDb({ users: [{ id: U1 }, { id: U2 }] });
    const coinSvc = createCoinService(db);
    const stakes = createGameStakeService(db, fakePoints(), coinSvc);

    const r = await stakes.reserveMatch({
      matchId: mk(8), gameId: 'card_duel', stake: 1000,
      playerXId: U1, playerOId: U2, matchMode: 'lobby',
    });
    ok(r.coinEligible[U1] === false && r.coinEligible[U2] === false,
      'در لابیِ خصوصی هیچ‌کس واجدِ سکه نیست');

    const q = await coinSvc.getQuota(U1);
    ok(q.used[1000] === 0, 'سهمیهٔ روزانه در لابیِ خصوصی نمی‌سوزد');

    const res = await stakes.settleMatch({ matchId: mk(8), winnerUserId: U1 });
    ok(res.coinsAwarded === 0, 'بردِ لابیِ خصوصی سکه نمی‌دهد');
    ok(res.loserCoins === 0, 'باختِ لابیِ خصوصی هم سکه نمی‌دهد');
    ok(!db.users.get(U1).coins && !db.users.get(U2).coins,
      'شمارندهٔ سکهٔ هیچ‌کدام تکان نخورد');
    ok(!db.entries.get(U1), 'جدولِ لیگ از بازیِ خصوصی اثر نگرفت');

    // ⚠️ ولی امتیاز واقعاً جابه‌جا می‌شود — لابی «بازیِ الکی» نیست،
    //    فقط از اقتصادِ لیگ جدا است.
    ok(res.netPot > 0, 'پاتِ امتیازی در لابی همچنان پرداخت می‌شود');
  }

  // مسابقهٔ عمومی برای مقایسه: همان شرط، ولی این‌بار سکه دارد.
  {
    const db = new FakeDb({ users: [{ id: U1 }, { id: U2 }] });
    const stakes = createGameStakeService(db, fakePoints(), createCoinService(db));
    await stakes.reserveMatch({
      matchId: mk(9), gameId: 'card_duel', stake: 1000,
      playerXId: U1, playerOId: U2, matchMode: 'online',
    });
    const res = await stakes.settleMatch({ matchId: mk(9), winnerUserId: U1 });
    ok(res.coinsAwarded === 30, 'همان شرط در حالتِ عمومی ۳۰ سکه می‌دهد');
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== نقشهٔ coinsByUser با پرداختِ واقعی می‌خواند ==');
  // ═══════════════════════════════════════════════════════════════════════
  //
  // موتور برای هر سوکت از این نقشه می‌خواند، نه از عددِ جدول. اگر سهمیهٔ
  // یک بازیکن پر باشد باید صفرِ صادقانه ببیند نه «+۳۰»ی که نگرفته.
  {
    const db = new FakeDb({ users: [{ id: U1 }, { id: U2 }] });
    const coinSvc = createCoinService(db);
    const stakes = createGameStakeService(db, fakePoints(), coinSvc);
    const client = await db.connect();
    for (let i = 0; i < DAILY_QUOTA[1000]; i++) {
      await coinSvc.consumeQuota(client, U1, 1000);
    }
    await stakes.reserveMatch({
      matchId: mk(10), gameId: 'memory', stake: 1000,
      playerXId: U1, playerOId: U2,
    });
    const res = await stakes.settleMatch({ matchId: mk(10), winnerUserId: U1 });
    ok(res.coinsByUser[U1] === 0, 'برندهٔ سقف‌پر در نقشه صفر دارد');
    ok(res.coinsByUser[U2] === 3, 'بازندهٔ سهمیه‌دار سکهٔ باختش را دارد');
    ok(res.coinsAwarded === 0, 'coinsAwarded هم صفرِ واقعی است');
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== تسویهٔ تکراری دو بار سکه نمی‌دهد ==');
  // ═══════════════════════════════════════════════════════════════════════
  {
    const db = new FakeDb({ users: [{ id: U1 }, { id: U2 }] });
    const stakes = createGameStakeService(db, fakePoints(), createCoinService(db));
    await stakes.reserveMatch({
      matchId: mk(7), gameId: 'card_duel', stake: 100,
      playerXId: U1, playerOId: U2,
    });
    await stakes.settleMatch({ matchId: mk(7), winnerUserId: U1 });
    const again = await stakes.settleMatch({ matchId: mk(7), winnerUserId: U1 });
    ok(again.duplicate === true, 'تسویهٔ دوم duplicate تشخیص داده شد');
    // شرطِ ۱۰۰: برنده ۱۰، بازنده ۱ — هر کدام دقیقاً یک بار.
    ok(db.users.get(U1).coins === 10, 'سکهٔ برنده فقط یک بار داده شد (۱۰ نه ۲۰)');
    ok(db.users.get(U2).coins === 1, 'سکهٔ بازنده هم فقط یک بار داده شد');
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== سکهٔ منفی و ورودیِ خراب ==');
  // ═══════════════════════════════════════════════════════════════════════
  {
    const db = new FakeDb({ users: [{ id: U1, coins: 5 }] });
    const coinSvc = createCoinService(db);
    const client = await db.connect();
    for (const bad of [-5, 0, NaN, null, undefined, 'abc', Infinity]) {
      const n = await coinSvc.awardCoins(client, U1, bad);
      ok(n === 0, `مقدارِ نامعتبر ${String(bad)} صفر سکه می‌دهد`);
    }
    ok(db.users.get(U1).coins === 5, 'موجودی بعد از ورودی‌های خراب دست‌نخورده ماند');
    // اعشار باید بریده شود نه گرد — سکه واحدِ صحیح است.
    await coinSvc.awardCoins(client, U1, 2.9);
    ok(db.users.get(U1).coins === 7, 'مقدارِ اعشاری بریده می‌شود (۲.۹ → ۲)');
  }

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== quotaTracked ==');
  // ═══════════════════════════════════════════════════════════════════════
  ok(quotaTracked(100) && quotaTracked(1000), 'دو سطحِ آنلاین سهمیه دارند');
  ok(!quotaTracked(0) && !quotaTracked(5000),
    'رایگان و ۵۰۰۰ سهمیه مصرف نمی‌کنند');

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
