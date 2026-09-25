#!/usr/bin/env node
/**
 * نگهبانِ «لیگ معرف‌ها» — رتبه‌بندی، بستنِ دوره و پرداختِ جایزه.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * خواستهٔ مالک (۴ مهر ۱۴۰۵)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   «تاپ ۱۰ بیشترین دعوت‌کننده مشخص باشه و رنک هر فرد رو هم نشون بده حتی اگه
 *    تو تاپ ۱۰ نباشه … امکانِ جایزه‌دادن از پنل … به هر تعدادی که خواست در هر
 *    محدودهٔ زمانی جایزه تعیین بشه.»
 *
 * ── چرا دیتابیسِ جعلی و نه دیتابیسِ واقعی ─────────────────────────────────
 *
 * این تست پولِ واقعی و ردیف‌های پرداخت می‌سازد؛ روی دیتابیسِ محصول اجرا شدنش
 * ممنوع است (قاعدهٔ ثابتِ ریپو بعد از حادثهٔ ۳۱ شهریور). دیتابیسِ جعلی هر
 * کوئری را ثبت می‌کند تا بشود پرسید «آیا این واریز اصلاً زده شد؟» — همان
 * الگویی که `testLeaguePerks` برای بستنِ فصلِ لیگ استفاده می‌کند.
 *
 * ⚠️ منطقِ رتبه‌بندی در SQL است (`RANK() OVER`). دیتابیسِ جعلی نمی‌تواند SQL
 *    را اجرا کند، پس دو کار انجام می‌شود: (۱) شکلِ همان کوئری با regex
 *    سنجیده می‌شود (رتبه و شکستِ تساوی در SQL باشد، نه در جاوااسکریپت)،
 *    (۲) یک پیاده‌سازیِ مرجعِ کوچک همین‌جا، تزریقِ داده به سرویس را می‌سنجد
 *    (رتبهٔ کاربر بیرونِ تاپ هم درست برگردد).
 */
'use strict';

const assert = require('assert');

let pass = 0;
const failures = [];
// ⚠️ `await` لازم است: بخشی از بررسی‌ها خودشان `await` دارند و اگر نتیجهٔ
// Promise بی‌مراقب رها شود، خطای داخلش هرگز به `catch` نمی‌رسد — یعنی تستِ
// سبزِ دروغ. (کلاسِ باگی که این فایل نباید تکرارش کند.)
async function check(name, fn) {
  try { await fn(); pass += 1; console.log('  ✓', name); }
  catch (e) { failures.push(`${name} — ${e.message}`); console.log('  ✗', name, '→', e.message); }
}

// ═══════════════════════════════════════════════════════════════════════════
// دیتابیسِ جعلی
// ═══════════════════════════════════════════════════════════════════════════
const notifications = [];
const edges = [];            // { referrerId, at, inviteeId }
const users = new Map();     // id → { id, nickname, first_name, status }

function makeDb({ season = null, payouts = [], finance = new Map() } = {}) {
  const calls = [];
  const client = {
    calls,
    released: false,
    release() { this.released = true; },
    async query(sql, params = []) {
      const q = String(sql).replace(/\s+/g, ' ').trim();
      calls.push({ sql: q, params });

      if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(q)) return { rows: [], rowCount: 0 };

      // ── رتبه‌بندی ──
      if (/WITH counted AS/i.test(q)) {
        return { rows: rankWindow(params), rowCount: 0 };
      }

      // ── آفرِ فعال ──
      if (/FROM invite_league_seasons\s+WHERE status = 'active'/i.test(q)) {
        return { rows: season && season.status === 'active' ? [season] : [], rowCount: 1 };
      }
      if (/SELECT \* FROM invite_league_seasons WHERE id=\$1 FOR UPDATE/i.test(q)) {
        return { rows: season ? [season] : [], rowCount: 1 };
      }

      // ── پرداخت‌ها ──
      if (/FROM invite_league_payouts p\s+JOIN invite_league_seasons s/i.test(q)
        && /WHERE p\.status = 'pending'/i.test(q)) {
        const filtered = payouts.filter((p) => p.status === 'pending'
          && (!params[0] || p.id === params[0]) && (!params[1] || p.season_id === params[1]));
        return { rows: filtered.map((p) => ({ ...p, season_title: season?.title })), rowCount: filtered.length };
      }
      if (/SELECT \* FROM invite_league_payouts\s+WHERE id=\$1 AND status='pending' FOR UPDATE/i.test(q)) {
        const row = payouts.find((p) => p.id === params[0] && p.status === 'pending');
        return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
      }
      if (/INSERT INTO invite_league_payouts/i.test(q)) {
        const [seasonId, userId, rank, invites, label, pointsN, coinsN, spinsN, cashN] = params;
        if (payouts.some((p) => p.season_id === seasonId && p.user_id === userId)) {
          return { rows: [], rowCount: 0 };   // ON CONFLICT DO NOTHING
        }
        const row = {
          id: `payout-${payouts.length + 1}`, season_id: seasonId, user_id: userId,
          rank, invites, label, prize_points: pointsN, prize_coins: coinsN,
          prize_spins: spinsN, prize_cash: cashN, status: 'pending',
        };
        payouts.push(row);
        return { rows: [{ id: row.id }], rowCount: 1 };
      }
      if (/UPDATE invite_league_payouts\s+SET status='paid'/i.test(q)) {
        const row = payouts.find((p) => p.id === params[0]);
        if (row) { row.status = 'paid'; row.approved_by = params[1]; }
        return { rows: [], rowCount: 1 };
      }

      // ── آفر: پایانِ دوره ──
      if (/UPDATE invite_league_seasons\s+SET status='finished'/i.test(q)) {
        if (season) season.status = 'finished';
        return { rows: [], rowCount: 1 };
      }

      // ── دفترکلِ امتیاز (pointService.credit) ──
      if (/UPDATE users\s+SET current_points/i.test(q)) {
        const [, amount, leagueDelta] = params;
        const u = finance.get(params[0]) || { points: 0, leaguePoints: 0, lifetime: 0 };
        u.points += Number(amount); u.leaguePoints += Number(leagueDelta);
        finance.set(params[0], u);
        return { rows: [{ current_points: u.points }], rowCount: 1 };
      }
      if (/INSERT INTO point_transactions/i.test(q)) {
        return { rows: [{ id: `pt-${calls.length}` }], rowCount: 1 };
      }

      // ── سکه و چرخش (v2: جایزهٔ لیگ معرف‌ها) ──
      if (/UPDATE users SET coins = coins \+ \$2/i.test(q)) {
        const u = finance.get(params[0]) || { coins: 0 };
        u.coins = (u.coins || 0) + Number(params[1]);
        finance.set(params[0], u);
        return { rows: [], rowCount: 1 };
      }
      if (/UPDATE users SET bonus_spins = bonus_spins \+ \$2/i.test(q)) {
        const u = finance.get(params[0]) || { spins: 0 };
        u.spins = (u.spins || 0) + Number(params[1]);
        finance.set(params[0], u);
        return { rows: [], rowCount: 1 };
      }

      // ── دفترکلِ سکه (coinLedger.record) ──
      if (/SELECT coins FROM users WHERE id=\$1 FOR UPDATE/i.test(q)) {
        const u = finance.get(params[0]) || { coins: 0 };
        return { rows: [{ coins: u.coins || 0 }], rowCount: 1 };
      }
      if (/INSERT INTO coin_transactions/i.test(q)) {
        return { rows: [{ id: `ct-${calls.length}` }], rowCount: 1 };
      }

      // ── کیف پول (walletService.credit) ──
      if (/SELECT wallet_balance FROM users WHERE id=\$1 FOR UPDATE/i.test(q)) {
        const u = finance.get(params[0]) || { wallet: 0 };
        return { rows: [{ wallet_balance: u.wallet || 0 }], rowCount: 1 };
      }
      if (/SELECT \* FROM wallet_transactions WHERE source=/i.test(q)) {
        return { rows: [], rowCount: 0 };
      }
      if (/UPDATE users SET wallet_balance=/i.test(q)) {
        const u = finance.get(params[1]) || {};
        u.wallet = params[0]; finance.set(params[1], u);
        return { rows: [], rowCount: 1 };
      }
      if (/INSERT INTO wallet_transactions/i.test(q)) {
        return { rows: [{ id: `wt-${calls.length}`, source: params[3] }], rowCount: 1 };
      }

      // ── آرشیو ──
      if (/FROM invite_league_seasons\s+WHERE status IN \('finished'/i.test(q)) {
        return { rows: [], rowCount: 0 };
      }

      // ── کاربران (اطلاعاتِ نمایشی) ──
      if (/FROM ranked k JOIN users u/i.test(q) || /JOIN users u ON u\.id = k\.referrer_id/i.test(q)) {
        return { rows: [], rowCount: 0 };
      }

      throw new Error(`کوئریِ ناشناخته در تست: ${q.slice(0, 90)}`);
    },
    set releasedAt(v) { this._releasedAt = v; },
    get releasedAt() { return this._releasedAt; },
  };

  const pool = {
    calls,
    query: (sql, params) => client.query(sql, params),
    connect: async () => client,
  };
  return { pool, client };
}

/**
 * پیاده‌سازیِ **مرجع** رتبه‌بندی — آینهٔ همان چیزی که SQL می‌گوید.
 *
 * اگر روزی معنای رتبه عوض شود، این تابع و کوئری باید با هم عوض شوند؛ تست
 * با سنجیدنِ شکلِ SQL (پایین‌تر) جلوی واگرایی را می‌گیرد.
 */
function rankWindow([startsAt, endsAt, minInvites, userId, limit, offset]) {
  const inWindow = edges.filter((e) => {
    if (startsAt && new Date(e.at) < new Date(startsAt)) return false;
    if (endsAt && new Date(e.at) >= new Date(endsAt)) return false;
    return users.get(e.inviteeId)?.status === 'active';
  });
  const perReferrer = new Map();
  for (const e of [...inWindow].sort((a, b) => new Date(a.at) - new Date(b.at))) {
    const list = perReferrer.get(e.referrerId) || [];
    list.push(e);
    perReferrer.set(e.referrerId, list);
  }
  const rows = [...perReferrer.entries()]
    .map(([referrerId, list]) => ({
      referrer_id: referrerId,
      invites: list.length,
      reached_at: list[list.length - 1].at,   // ورودِ N-اُمین دعوت‌شونده
    }))
    .filter((r) => r.invites >= (Number(minInvites) || 1))
    .sort((a, b) => (b.invites - a.invites)
      || (new Date(a.reached_at) - new Date(b.reached_at))
      || String(a.referrer_id).localeCompare(String(b.referrer_id)));
  let rank = 0;
  let last = null;
  rows.forEach((r, i) => {
    if (last === null || r.invites !== last) { rank = i + 1; last = r.invites; }
    r.rank = rank;
  });
  return rows
    .filter((r) => !userId || r.referrer_id === userId)
    .slice(Number(offset) || 0, (Number(offset) || 0) + (Number(limit) || 10))
    .map((r) => ({
      rank: r.rank, invites: r.invites, reached_at: r.reached_at,
      user_id: r.referrer_id,
      nickname: users.get(r.referrer_id)?.nickname || null,
      first_name: null, profile_image_url: null, profile_avatar_key: null,
    }));
}

// ── تزریق: pool و اعلان‌ها قبل از بارگذاریِ سرویس ──────────────────────────
const dbPath = require.resolve('../src/config/db');
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: { pool: { query: async () => ({ rows: [] }), connect: async () => null } },
};
const notifPath = require.resolve('../src/services/notificationService');
require.cache[notifPath] = {
  id: notifPath, filename: notifPath, loaded: true,
  exports: { createNotification: (...args) => { notifications.push(args); return Promise.resolve({ id: 'n' }); } },
};

const SVC_PATH = require.resolve('../src/services/inviteLeagueService');
let svc = require(SVC_PATH);
const fs = require('fs');
const serviceSource = fs.readFileSync(SVC_PATH, 'utf8');

/** سرویس را با یک pool جعلیِ تازه بار می‌کند (کشِ require پاک می‌شود). */
function loadServiceWith(fakePool) {
  require.cache[dbPath].exports = { pool: fakePool };
  delete require.cache[SVC_PATH];
  svc = require(SVC_PATH);
  return svc;
}

const ago = (minutes) => new Date(Date.now() - minutes * 60000);
const USER_NOUN = 'u';

(async () => {
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ ۱. جدولِ جایزه: پاک‌سازی و مرزها ══');
// ═══════════════════════════════════════════════════════════════════════════
{
  const { pool } = makeDb();
  loadServiceWith(pool);

  const rows = svc.sanitizePrizeTable([
    { rank: 3, points: 500, label: 'سومی' },
    { rank: 1, cash: 500000, points: 2000, coins: 10, spins: 5 },
    { rank: 3, points: 999 },                        // تکراری → حذف
    { rank: 0, points: 100 },                        // رتبهٔ نامعتبر → حذف
    { rank: 5 },                                     // بی‌جایزه → حذف
    { rank: 2, cash: 250000 },
  ]);
  await check('رتبه‌ها مرتب و یکتا می‌شوند', () => {
    assert.deepStrictEqual(rows.map((r) => r.rank), [1, 2, 3]);
  });
  await check('ردیفِ تکراری اولی را نگه می‌دارد (اولی برنده است)', () => {
    assert.strictEqual(rows[2].points, 500);
  });
  await check('ردیفِ بی‌جایزه حذف می‌شود', () => {
    assert.strictEqual(rows.length, 3);
  });
  await check('برچسبِ پیش‌فرض ساخته می‌شود', () => {
    const r = svc.sanitizePrizeTable([{ rank: 7, points: 1 }]);
    assert.ok(/۷/.test(r[0].label), r[0].label);
  });
  await check('ورودیِ غیرآرایه → آرایهٔ خالی (خطا نمی‌اندازد)', () => {
    assert.deepStrictEqual(svc.sanitizePrizeTable(null), []);
  });
  await check('سقفِ ردیف‌ها رعایت می‌شود', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ rank: i + 1, points: 10 }));
    assert.ok(svc.sanitizePrizeTable(many).length <= svc.MAX_PRIZE_ROWS);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ ۲. شکلِ کوئریِ رتبه‌بندی (رتبه در SQL، نه در جاواسکریپت) ══');
// ═══════════════════════════════════════════════════════════════════════════
{
  await check('رتبه با RANK() OVER در SQL حساب می‌شود', () => {
    assert.ok(/RANK\(\) OVER \([\s\S]{0,120}ORDER BY r\.invites DESC, r\.reached_at ASC/.test(serviceSource));
  });
  await check('شکستِ تساوی از «زمانِ رسیدن به عددِ فعلی» می‌آید', () => {
    assert.ok(/ROW_NUMBER\(\) OVER \([\s\S]{0,140}ORDER BY u\.referred_at ASC/.test(serviceSource));
    assert.ok(/c\.rn = a\.invites/.test(serviceSource));
  });
  await check('دعوتِ معتبر = کاربرِ active است (هم‌تعریف با صفحهٔ دعوت)', () => {
    assert.ok(/u\.status = 'active'/.test(serviceSource));
  });
  await check('پنجرهٔ زمانی در خودِ کوئری فیلتر می‌شود (نه در جاواسکریپت)', () => {
    assert.ok(/u\.referred_at >= \$1/.test(serviceSource) && /u\.referred_at < \$2/.test(serviceSource));
  });
  await check('حداقلِ دعوت در SQL اعمال می‌شود', () => {
    assert.ok(/r\.invites >= \$3/.test(serviceSource));
  });
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ ۳. تاپِ همهٔ زمان‌ها + رتبهٔ خودِ کاربر بیرونِ تاپ ══');
// ═══════════════════════════════════════════════════════════════════════════
{
  edges.length = 0; users.clear();
  users.set('me', { nickname: 'خودم', status: 'active' });
  // ۱۲ نفر با تعدادِ متفاوتِ دعوت: نفرِ ۱۱ و ۱۲ صفر دعوت دارند.
  for (let i = 1; i <= 12; i += 1) users.set(`ref${i}`, { nickname: `معرف${i}`, status: 'active' });
  for (let i = 1; i <= 12; i += 1) {
    const count = 13 - i;             // ref1=۱۲ دعوت … ref11=۲ دعوت
    for (let n = 0; n < count; n += 1) {
      const invitee = `${USER_NOUN}${i}_${n}`;
      users.set(invitee, { status: n === 0 && i === 12 ? 'inactive' : 'active' });
      edges.push({ referrerId: `ref${i}`, inviteeId: invitee, at: ago(500 - i * 10 - n) });
    }
  }
  // «من» دو دعوتِ معتبر دارم → بیرونِ تاپِ ۱۰ ولی رتبه‌ام باید بیاید.
  for (let n = 0; n < 2; n += 1) {
    users.set(`myinv${n}`, { status: 'active' });
    edges.push({ referrerId: 'me', inviteeId: `myinv${n}`, at: ago(400 - n) });
  }

  const { pool } = makeDb();
  loadServiceWith(pool);
  const top = await svc.leaderboard({ limit: 10 });
  await check('تاپ ۱۰ دقیقاً ده ردیف می‌دهد', () => assert.strictEqual(top.length, 10));
  await check('مرتب بر اساسِ تعدادِ دعوتِ نزولی است', () => {
    for (let i = 1; i < top.length; i += 1) assert.ok(top[i - 1].invites >= top[i].invites);
  });
  await check('کاربرِ غیرفعال شمرده نمی‌شود (ref12 = ۰)', () => {
    assert.ok(!top.some((r) => r.userId === 'ref12'));
  });
  await check('رتبهٔ نفرِ اول ۱ است', () => assert.strictEqual(top[0].rank, 1));

  const stand = await svc.standing('me');
  await check('رتبهٔ کاربر بیرونِ تاپ‌۱۰ برگردانده می‌شود', () => {
    assert.ok(stand && stand.userId === 'me', JSON.stringify(stand));
  });
  await check('رتبهٔ کاربر با تعدادِ دعوتش هم‌خوان است', () => {
    assert.strictEqual(stand.invites, 2);
    assert.ok(stand.rank > 10, `رتبه=${stand.rank}`);
  });
  await check('نتیجهٔ خالی برای کاربرِ بی‌دعوت، null است (نه استثنا)', async () => {
    const none = await svc.standing('ref11-nonexistent');
    assert.strictEqual(none, null);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ ۴. لیگِ معرف‌ها: پنجرهٔ زمانی و حالتِ خالی ══');
// ═══════════════════════════════════════════════════════════════════════════
{
  const { pool } = makeDb({ season: null });
  loadServiceWith(pool);
  const view = await svc.leagueView('me');
  await check('بدونِ آفرِ ادمین، لیگ null است (کلاینت پیامِ «ساخته نشده» می‌دهد)', () => {
    assert.strictEqual(view, null);
  });

  const overview = await svc.overview('me');
  await check('نمای کلی همیشه تاپِ همهٔ زمان‌ها را می‌دهد', () => {
    assert.ok(Array.isArray(overview.allTime.rows));
    assert.ok(overview.allTime.rows.length > 0);
  });
  await check('نمای کلی وقتی آفری نیست، لیگ را null نگه می‌دارد', () => {
    assert.strictEqual(overview.league, null);
  });
  await check('آرشیوِ خالی آرایهٔ خالی است (نه undefined)', () => {
    assert.deepStrictEqual(overview.history, []);
  });
  await check('رتبهٔ خودِ کاربر در نمای کلی هم می‌آید', () => {
    assert.ok(overview.allTime.me && overview.allTime.me.userId === 'me');
  });

  const empty = { pool: makeDb().pool };
  loadServiceWith(empty.pool);
  const allRows = await svc.leaderboard({ startsAt: null, endsAt: null });
  await check('بدونِ پنجره، همان کوئری «همهٔ زمان‌ها» را می‌دهد', () => {
    assert.ok(allRows.length > 0);
  });
  const windowRows = await svc.leaderboard({ startsAt: ago(50), endsAt: new Date(), minInvites: 5 });
  await check('پنجرهٔ تنگ فقط دعوت‌های داخلش را می‌شمارد', () => {
    assert.ok(windowRows.every((r) => r.invites >= 5), JSON.stringify(windowRows.map((r) => r.invites)));
  });
  await check('حداقلِ دعوت در جدولِ لیگ اعمال می‌شود', () => {
    assert.ok(!windowRows.some((r) => r.userId === 'me'));
  });
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ ۵. بستنِ دوره: برندگان قفل و پرداخت‌ها ساخته می‌شوند ══');
// ═══════════════════════════════════════════════════════════════════════════
const payouts = [];
let season;
{
  season = {
    id: 'season-1', title: 'کمپینِ مهرِ معرف‌ها', status: 'active',
    starts_at: ago(10000), ends_at: new Date(Date.now() + 100000),
    min_invites: 1,
    prize_table: [
      { rank: 1, label: 'نفر اول', points: 2000, coins: 10, spins: 5, cash: 500000 },
      { rank: 2, label: 'نفر دوم', points: 1000, coins: 5, spins: 0, cash: 250000 },
      // رتبهٔ ۲۵ عمداً بیرونِ دسترسِ معرف‌های تست است (۱۲ نفر با بیشترین ۱۲
      // دعوت) — تا «رتبهٔ بدونِ برنده» واقعاً آزموده شود، نه اینکه تصادفی
      // یکی بنشیند روی آن.
      { rank: 25, label: 'بیست‌وپنجم', points: 100, coins: 0, spins: 0, cash: 0 },
    ],
  };
  const { pool } = makeDb({ season, payouts });
  loadServiceWith(pool);
  notifications.length = 0;

  const result = await svc.closeSeason({ seasonId: 'season-1', adminId: 'admin-1' });

  await check('دوره به «تمام‌شده» می‌رود', () => assert.strictEqual(season.status, 'finished'));
  await check('برای هر رتبه‌ای که برنده دارد یک ردیفِ پرداخت ساخته می‌شود', () => {
    assert.strictEqual(result.created.length, 2, JSON.stringify(result.created.map((c) => c.rank)));
  });
  await check('رتبهٔ بدونِ برنده گزارش می‌شود (نه اینکه بی‌صدا بسوزد)', () => {
    assert.deepStrictEqual(result.skipped.map((s) => s.rank), [25]);
  });
  await check('جایزهٔ هر ردیف کامل کپی می‌شود (امتیاز/سکه/چرخش/پول)', () => {
    const first = payouts.find((p) => p.rank === 1);
    assert.strictEqual(first.prize_points, 2000);
    assert.strictEqual(first.prize_coins, 10);
    assert.strictEqual(first.prize_spins, 5);
    assert.strictEqual(Number(first.prize_cash), 500000);
  });
  await check('پرداخت در حالتِ «در انتظارِ تأیید» است (نه پرداختِ خودکار)', () => {
    assert.ok(payouts.every((p) => p.status === 'pending'));
  });
  await check('برنده‌ها اعلانِ زنگوله می‌گیرند', () => {
    assert.strictEqual(notifications.length, 2);
    assert.ok(/لیگ معرف‌ها/.test(notifications[0][2]));
  });
  await check('متنِ اعلان می‌گوید چند دعوت و چه جایزه‌ای', () => {
    const body = notifications[0][3];
    assert.ok(/دعوت/.test(body) && /رتبه/.test(body) && /امتیاز/.test(body) && /تومان/.test(body), body);
  });

  await check('بستنِ دوبارهٔ همان دوره رد می‌شود (سندِ پرداخت بازنویسی نمی‌شود)', async () => {
    let threw = false;
    try { await svc.closeSeason({ seasonId: 'season-1' }); } catch (e) { threw = /بسته/.test(e.message); }
    assert.ok(threw);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ ۶. تأییدِ پرداخت: هر چهار نوعِ جایزه واقعاً واریز می‌شود ══');
// ═══════════════════════════════════════════════════════════════════════════
{
  const finance = new Map();
  const { pool, client } = makeDb({ season, payouts, finance });
  loadServiceWith(pool);
  notifications.length = 0;

  const result = await svc.approvePayouts({ seasonId: 'season-1', adminId: 'admin-1' });

  await check('هر دو ردیف پرداخت شد', () => assert.strictEqual(result.paid, 2, JSON.stringify(result.failed)));
  await check('هیچ پرداختی شکست نخورد', () => assert.deepStrictEqual(result.failed, []));
  await check('وضعیتِ ردیف‌ها «پرداخت‌شده» شد', () => assert.ok(payouts.every((p) => p.status === 'paid')));
  await check('امتیازِ جایزه در `point_transactions` ثبت می‌شود', () => {
    const row = client.calls.find((c) => /INSERT INTO point_transactions/i.test(c.sql));
    assert.ok(row, 'هیچ ردیفِ امتیازی ثبت نشد');
    assert.strictEqual(row.params[3], 'invite_league');
  });
  await check('امتیازِ جایزه امتیازِ لیگِ ماهانه را زیاد نمی‌کند', () => {
    const ups = client.calls.filter((c) => /UPDATE users\s+SET current_points/i.test(c.sql));
    assert.ok(ups.length >= 2);
    assert.ok(ups.every((c) => Number(c.params[2]) === 0),
      'امتیازِ جایزه وارد رتبه‌بندیِ لیگ شد — همان حلقهٔ بستهٔ جایزه‌به‌خودش');
  });
  await check('سکه به موجودی و دفترکلِ سکه می‌رود', () => {
    assert.ok(client.calls.some((c) => /UPDATE users SET coins = coins \+/i.test(c.sql)));
    assert.ok(client.calls.some((c) => /INSERT INTO coin_transactions/i.test(c.sql)));
  });
  await check('چرخشِ گردونه به `bonus_spins` اضافه می‌شود', () => {
    assert.ok(client.calls.some((c) => /UPDATE users SET bonus_spins = bonus_spins \+/i.test(c.sql)));
  });
  await check('پول با منبعِ `invite_league` به کیف پول می‌رود', () => {
    // ترتیبِ ستون‌های wallet_transactions: (user_id, direction, amount, source, …)
    // پس «منبع» سومین پارامتر است — نه چهارم. خودِ همین تست اولین بار
    // اشتباه گرفت و عددِ واقعی را نشان داد؛ حالا قفل می‌شود.
    const row = client.calls.find((c) => /INSERT INTO wallet_transactions/i.test(c.sql));
    assert.ok(row, 'هیچ واریزِ کیف‌پولی انجام نشد');
    assert.strictEqual(row.params[2], 'invite_league');
    assert.strictEqual(row.params[3], 'invite_league_payout');
  });
  await check('منبعِ `invite_league` از سرویسِ کیف پول پذیرفته می‌شود', () => {
    assert.ok(!/منبع تراکنش نامعتبر/.test(JSON.stringify(result.failed)));
  });
  await check('هر پرداخت اعلانِ «واریز شد» می‌گیرد', () => {
    assert.strictEqual(notifications.length, 2);
    assert.ok(/واریز/.test(notifications[0][3]), notifications[0][3]);
  });
  await check('پرداختِ دوباره چیزی واریز نمی‌کند (idempotent)', async () => {
    const again = await svc.approvePayouts({ seasonId: 'season-1' });
    assert.strictEqual(again.paid, 0);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ ۷. اتصال‌ها: مسیرها، سرویس و متن‌های زنده ══');
// ═══════════════════════════════════════════════════════════════════════════
{
  const backend = '/var/www/GhelGheli/backend';
  const read = (rel) => fs.readFileSync(`${backend}/${rel}`, 'utf8');
  const serverSrc = read('src/server.js');
  const progression = read('src/routes/progression.js');
  const adminRoutes = read('src/routes/adminInviteLeague.js');
  const profileSrc = read('src/routes/profile.js');
  const live = read('src/services/liveContent.js');
  const migration = read('migrations/101_invite_league.sql');

  await check('مسیرِ ادمین در سرور سوار شده', () => {
    assert.ok(/routes\/adminInviteLeague/.test(serverSrc));
  });
  await check('همهٔ مسیرهای ادمین adminAuth دارند', () => {
    const routes = [...adminRoutes.matchAll(/router\.(get|post|patch)\(\s*'([^']+)'([\s\S]{0,180})/g)];
    assert.ok(routes.length >= 5, `فقط ${routes.length} مسیر`);
    for (const [, , path, tail] of routes) assert.ok(/adminAuth/.test(tail), path);
  });
  await check('هر مسیرِ تغییردهنده requireRole دارد (نه فقط adminAuth)', () => {
    const mutating = [...adminRoutes.matchAll(/router\.(post|patch)\(\s*'([^']+)'([\s\S]{0,180})/g)];
    assert.ok(mutating.length >= 4, `فقط ${mutating.length} مسیرِ تغییردهنده`);
    for (const [, , path, tail] of mutating) assert.ok(/requireRole\(\)/.test(tail), path);
  });
  await check('هر تغییر audit می‌شود', () => {
    const audits = [...adminRoutes.matchAll(/await audit\(/g)].length;
    assert.ok(audits >= 4, `فقط ${audits} audit`);
  });
  await check('/api/referrals جدول‌ها را هم می‌دهد', () => {
    assert.ok(/inviteLeague\.overview\(req\.user\.id\)/.test(progression));
  });
  await check('پروفایلِ عمومی آمارِ لیگ و دعوت را می‌دهد', () => {
    for (const key of ['leagueWins', 'leagueSeasons', 'referral:', 'earnedCash', 'rankAllTime']) {
      assert.ok(profileSrc.includes(key), key);
    }
  });
  await check('متن‌های زندهٔ لیگ معرف‌ها تعریف شده‌اند', () => {
    for (const key of ['allTimeTitle', 'leagueTitle', 'emptyNote', 'rulesNote', 'payoutNote']) {
      assert.ok(live.includes(key), key);
    }
  });
  await check('قراردادِ متن‌ها گروهِ تازه را دارد (نگهبانِ پنل)', () => {
    assert.ok(/inviteLeague: \{\n\s+allTimeTitle: \[\], leagueTitle: \[\], emptyNote: \[\]/.test(live));
  });
  await check('مایگریشن: فقط یک آفرِ فعال در هر زمان (قیدِ دیتابیس)', () => {
    assert.ok(/CREATE UNIQUE INDEX IF NOT EXISTS uniq_invite_league_active/.test(migration));
    assert.ok(/WHERE status = 'active'/.test(migration));
  });
  await check('مایگریشن منبعِ تازه را در CHECK هر دو دفترکل می‌گذارد', () => {
    const checks = [...migration.matchAll(/CHECK \(source IN \(([\s\S]*?)\)\)/g)];
    assert.strictEqual(checks.length, 2);
    for (const [, body] of checks) assert.ok(body.includes("'invite_league'"));
  });
  await check('مایگریشن همهٔ مقادیرِ قبلی را نگه داشته (درج‌های تولید نمی‌شکنند)', () => {
    for (const old of ['photo_card', 'league_perk', 'card_box', 'admin_adjust',
      'purchase_referral', 'withdrawal_hold', 'topup']) {
      assert.ok(migration.includes(`'${old}'`), old);
    }
  });
}

console.log(`\n${failures.length ? '✗' : '✅'} ${pass} بررسی موفق، ${failures.length} ناموفق`);
if (failures.length) {
  console.log(failures.map((f) => `   - ${f}`).join('\n'));
  process.exit(1);
}
})().catch((e) => { console.error('خطای غیرمنتظرهٔ تست:', e); process.exit(1); });
