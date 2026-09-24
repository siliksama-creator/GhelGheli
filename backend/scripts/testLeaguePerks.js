#!/usr/bin/env node
/**
 * نگهبانِ جوایزِ غیرنقدیِ لیگ (دورِ ۲۶).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چه چیزی را نگه می‌دارد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * خواستهٔ مالک: «جایزه نقدی بین ۵۰ نفر، ۲۰ نفر بعدی جوایز غیرنقدی
 * (پلاس، آیتم‌های شاپ)».
 *
 * این تست `closeActiveSeason` را با یک دیتابیسِ جعلی **واقعاً اجرا می‌کند**
 * و SQLهایی که زده می‌شود را می‌سنجد؛ تستِ متنی (grep روی سورس) اینجا کافی
 * نبود چون خطاهای این بخش همه از جنسِ «کوئری اصلاً زده نشد» هستند.
 *
 * ── سه باگی که حین ساخت پیدا و رفع شد، و اینجا قفل می‌شوند ──
 *
 *   ۱. `LIMIT` کوئریِ رتبه‌بندی روی `winnerCount` (=۵۰) بود. یعنی ردیفِ
 *      رتبهٔ ۵۱ اصلاً از دیتابیس خوانده نمی‌شد و کلِ ردهٔ غیرنقدی بی‌صدا
 *      هیچ‌وقت جایزه نمی‌گرفت. حالا `max(winnerCount, maxPerkRank)`.
 *   ۲. برندهٔ غیرنقدی پیامِ «جایزهٔ ۰ تومانی شما به کیف پول واریز شد»
 *      می‌گرفت، چون متنِ اعلان فقط دو حالتِ نقدی داشت.
 *   ۳. امتیازِ جایزه با `league: true` واریز می‌شد و مستقیم در رتبه‌بندیِ
 *      فصلِ **بعد** می‌نشست — یعنی برندهٔ این ماه ماهِ بعد را جلوتر شروع
 *      می‌کرد و جایزه به خودش برمی‌گشت. حلقهٔ بسته.
 */
const path = require('path');
const assert = require('assert');

let pass = 0;
const failures = [];
function check(name, fn) {
  try { fn(); pass += 1; console.log('  ✓', name); }
  catch (e) { failures.push(`${name} — ${e.message}`); console.log('  ✗', name, '→', e.message); }
}

const SEASON_ID = 'season-1';

/**
 * دیتابیسِ جعلی.
 *
 * هر کوئری ثبت می‌شود تا بشود پرسید «آیا اصلاً زده شد؟». پاسخ‌ها بر اساسِ
 * تطبیقِ متنِ SQL ساخته می‌شوند — نه ترتیبِ فراخوانی، چون ترتیب با هر
 * بازآراییِ کد می‌شکند و تست را شکننده می‌کند.
 */
function makeDb({ leaders, prizeTable = [], perkTable = [], winnerCount = 50,
  shopSlugs = ['golden_frame'] } = {}) {
  const calls = [];
  const client = {
    calls,
    async query(sql, params = []) {
      calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
      const q = String(sql);

      if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(q)) return { rows: [], rowCount: 0 };

      if (/FROM league_seasons WHERE id=\$1 FOR UPDATE/i.test(q)
        || /SELECT status, ends_at FROM league_seasons/i.test(q)) {
        return { rows: [{ status: 'active', ends_at: new Date(Date.now() - 1000) }], rowCount: 1 };
      }
      if (/SELECT \* FROM league_seasons WHERE id=\$1/i.test(q)) {
        return {
          rows: [{
            id: SEASON_ID, month_year: '1404-05', status: 'active',
            prize_table: prizeTable, perk_table: perkTable,
            ends_at: new Date(Date.now() - 1000),
          }],
          rowCount: 1,
        };
      }
      if (/league_winner_count/i.test(q)) {
        return { rows: [{ value: winnerCount }], rowCount: 1 };
      }
      if (/DENSE_RANK\(\)/i.test(q)) {
        // LIMIT واقعی اعمال می‌شود — دقیقاً همان چیزی که باگِ ۱ را ساخت.
        const limit = Number(params[1]);
        return { rows: leaders.slice(0, limit), rowCount: Math.min(limit, leaders.length) };
      }
      if (/INSERT INTO league_payouts/i.test(q)) {
        return { rows: [{ id: `payout-${params[1]}`, paid_at: null }], rowCount: 1 };
      }
      if (/FROM shop_items WHERE slug=\$1/i.test(q)) {
        return shopSlugs.includes(params[0])
          ? { rows: [{ id: `item-${params[0]}` }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (/FROM user_subscriptions/i.test(q)) {
        return { rows: [{ expires_at: null }], rowCount: 1 };
      }
      if (/SELECT .*FROM league_seasons WHERE status='active'/i.test(q)) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  return { client, calls, connect: async () => client, query: (...a) => client.query(...a) };
}

function stub(relPath, exports) {
  const full = require.resolve(path.join(__dirname, '..', relPath));
  require.cache[full] = { id: full, filename: full, loaded: true, exports };
  return full;
}

async function main() {
  console.log('\nجوایزِ غیرنقدیِ لیگ:');

  const pointCalls = [];
  const notifications = [];

  const db = makeDb({
    // چهار بازیکن: رتبهٔ ۱ و ۲ نقدی، رتبهٔ ۳ و ۴ غیرنقدی.
    leaders: [
      { user_id: 'u1', points: 900, coins: 90, rank: 1 },
      { user_id: 'u2', points: 800, coins: 80, rank: 2 },
      { user_id: 'u3', points: 700, coins: 70, rank: 3 },
      { user_id: 'u4', points: 600, coins: 60, rank: 4 },
    ],
    winnerCount: 2,
    prizeTable: [{ rank: 1, amount: 500000 }, { rank: 2, amount: 300000 }],
    perkTable: [
      { rank: 3, kind: 'plus_days', value: 30, label: null },
      { rank: 4, kind: 'points', value: 5000, label: null },
    ],
  });

  stub('src/config/db.js', { pool: db });
  stub('src/services/walletService.js', {
    credit: async () => ({ balanceAfter: 0 }),
  });
  stub('src/services/notificationService.js', {
    createNotification: async (userId, kind, title, body) => {
      notifications.push({ userId, kind, title, body });
    },
  });
  stub('src/services/pointService.js', {
    credit: async (client, o) => { pointCalls.push(o); return { delta: o.points }; },
    SOURCES: [],
  });

  const svcPath = path.join(__dirname, '..', 'src', 'services', 'leagueService.js');
  delete require.cache[require.resolve(svcPath)];
  const league = require(svcPath);

  const result = await league.closeActiveSeason({ force: true, seasonId: SEASON_ID });

  const sqlOf = re => db.calls.filter(c => re.test(c.sql));

  // ── ۱. ردیفِ جایزهٔ غیرنقدی واقعاً درج می‌شود ──
  const perkInserts = sqlOf(/INSERT INTO league_perk_awards/);
  check('برای هر رتبهٔ غیرنقدی یک ردیف درج می‌شود', () => {
    assert.strictEqual(perkInserts.length, 2,
      `انتظار ۲ درج، دیده شد ${perkInserts.length}`);
  });

  check('درج با ON CONFLICT روی (فصل، کاربر) است', () => {
    assert.ok(/ON CONFLICT \(league_season_id, user_id\)/.test(perkInserts[0].sql),
      'کلیدِ تعارض باید کاربر باشد نه رتبه — وگرنه دو نفرِ هم‌رتبه یکی‌شان بی‌جایزه می‌ماند');
  });

  check('رتبه و نوعِ درست ثبت می‌شود', () => {
    assert.deepStrictEqual(
      perkInserts.map(c => [c.params[2], c.params[3], c.params[4]]),
      [[3, 'plus_days', 30], [4, 'points', 5000]]);
  });

  // ── ۲. باگِ LIMIT ──
  check('کوئریِ رتبه‌بندی تا پایین‌ترین رتبهٔ غیرنقدی می‌خواند', () => {
    const rank = sqlOf(/DENSE_RANK/)[0];
    assert.ok(rank, 'کوئریِ رتبه‌بندی زده نشد');
    assert.strictEqual(Number(rank.params[1]), 4,
      'LIMIT باید max(winnerCount=2, maxPerkRank=4) باشد؛ با ۲ ردیفِ رتبهٔ ۳ و ۴ اصلاً خوانده نمی‌شد');
  });

  // ── ۳. تحویل دیگر در لحظهٔ بستن نیست؛ باید در صفِ تأیید بنشیند ────────
  //
  // خواستهٔ مالک: «یه قسمت پایین‌ترش باید این باشه: جوایز منتظرِ تأیید —
  // که افرادی که جوایز گرفتن به کیف پولشون واریز شه و یا امتیازشو بگیرن
  // و یا پلاسشون فعال شه.»
  //
  // یعنی حتی جایزهٔ غیرنقدی هم دیگر بی‌صدا و بی‌نگهبان تحویل نمی‌شود:
  // بستنِ فصل فقط «صف» می‌سازد، تحویل با تأییدِ مدیر است. این تصمیم
  // برگشت‌ناپذیریِ اشتباه را کم می‌کند — اگر جدولِ رتبه‌بندی خراب باشد،
  // پول و پلاس هر دو هنوز قابلِ توقف‌اند.
  check('هیچ اشتراکی در لحظهٔ بستنِ فصل ساخته نمی‌شود', () => {
    assert.strictEqual(sqlOf(/INSERT INTO user_subscriptions/).length, 0,
      'پلاس باید منتظرِ تأییدِ مدیر بماند، نه اینکه همان لحظه فعال شود');
  });

  check('هیچ امتیازی در لحظهٔ بستنِ فصل واریز نمی‌شود', () => {
    assert.strictEqual(pointCalls.length, 0,
      'امتیازِ جایزه هم باید منتظرِ تأییدِ مدیر بماند');
  });

  check('delivered_at در لحظهٔ بستن ست نمی‌شود', () => {
    assert.strictEqual(sqlOf(/UPDATE league_perk_awards SET delivered_at/).length, 0,
      'این ستون فقط بعد از تأییدِ مدیر پر می‌شود وگرنه مدیر نمی‌فهمد چه مانده');
  });

  check('جوایزِ غیرنقدی هم در صفِ تأیید می‌نشینند', () => {
    const payouts = sqlOf(/INSERT INTO league_payouts/);
    assert.strictEqual(payouts.length, 4,
      'هر چهار برنده — نقدی و غیرنقدی — باید ردیفِ منتظرِ تأیید داشته باشند');
    const byUser = new Map(payouts.map((p) => [p.params[1], p]));
    assert.strictEqual(Number(byUser.get('u1').params[3]), 500000);
    assert.strictEqual(byUser.get('u1').params[4], null,
      'برندهٔ نقدی بخشِ غیرنقدی ندارد');
    assert.strictEqual(Number(byUser.get('u3').params[3]), 0, 'رتبهٔ ۳ نقدی ندارد');
    assert.strictEqual(byUser.get('u3').params[4], 'plus_days');
    assert.strictEqual(Number(byUser.get('u3').params[5]), 30);
    assert.strictEqual(byUser.get('u4').params[4], 'points');
    assert.strictEqual(Number(byUser.get('u4').params[5]), 5000);
  });

  // ── ۴. مرزِ نقدی/غیرنقدی ──
  check('برندهٔ غیرنقدی هم در بایگانیِ پروفایل ثبت می‌شود', () => {
    const hist = sqlOf(/INSERT INTO user_league_history/);
    const users = hist.map(h => h.params[0]);
    assert.ok(users.includes('u3') && users.includes('u4'),
      'کاربرِ رتبهٔ ۵۵ باید در تاریخچهٔ پروفایلش ردی از این فصل ببیند');
  });

  // ── ۵. اعلان ──
  check('برندهٔ غیرنقدی پیامِ «۰ تومان» نمی‌گیرد', () => {
    const perkNotes = notifications.filter(n => ['u3', 'u4'].includes(n.userId));
    assert.strictEqual(perkNotes.length, 2, 'هر دو باید خبردار شوند');
    for (const n of perkNotes) {
      assert.ok(!/۰ تومان|0 تومان/.test(n.body), `پیامِ خراب: ${n.body}`);
      assert.ok(!/کیف پول/.test(n.body), `جایزهٔ غیرنقدی به کیف پول نمی‌رود: ${n.body}`);
    }
  });

  check('متنِ اعلان جایزه را توصیف می‌کند', () => {
    const u3 = notifications.find(n => n.userId === 'u3');
    assert.ok(/پلاس/.test(u3.body), `متن باید بگوید چه گرفته: ${u3.body}`);
    const u4 = notifications.find(n => n.userId === 'u4');
    assert.ok(/امتیاز/.test(u4.body), `متن باید بگوید چه گرفته: ${u4.body}`);
  });

  // ── ۶. خروجی ──
  check('خروجی شمارندهٔ غیرنقدی دارد', () => {
    assert.strictEqual(result.perksAwarded, 2);
  });

  check('شمارندهٔ نقدی شاملِ ردهٔ غیرنقدی نمی‌شود', () => {
    assert.strictEqual(result.winners, 2,
      '`leaders` حالا رتبه‌های غیرنقدی را هم دارد؛ عددِ نقدی باید جدا شمرده شود');
    assert.strictEqual(result.pendingApproval, 4,
      'حالا **همهٔ** جوایز — نقدی و غیرنقدی — منتظرِ تأییدِ مدیرند');
  });

  // ══ سناریوی دوم: ردیف‌های خراب کلِ بستنِ فصل را نمی‌خوابانند ══
  console.log('\nمقاومت در برابرِ جدولِ خراب:');
  {
    const notes2 = [];
    const pts2 = [];
    const db2 = makeDb({
      leaders: [
        { user_id: 'v1', points: 100, coins: 10, rank: 1 },
        { user_id: 'v2', points: 90, coins: 9, rank: 2 },
        { user_id: 'v3', points: 80, coins: 8, rank: 3 },
      ],
      winnerCount: 1,
      prizeTable: [{ rank: 1, amount: 100000 }],
      perkTable: [
        { rank: 2, kind: 'plus_days', value: 0 },          // توخالی
        { rank: 3, kind: 'shop_item', value: 1, itemSlug: 'ghost_item' }, // ناموجود
        { rank: 9, kind: 'teleport', value: 5 },            // نوعِ ناشناخته
      ],
    });
    stub('src/config/db.js', { pool: db2 });
    stub('src/services/notificationService.js', {
      createNotification: async (userId, kind, title, body) => {
        notes2.push({ userId, body });
      },
    });
    stub('src/services/pointService.js', {
      credit: async (c, o) => { pts2.push(o); return null; }, SOURCES: [],
    });
    delete require.cache[require.resolve(svcPath)];
    const league2 = require(svcPath);

    const silence = console.error;
    console.error = () => {};
    let r2;
    try { r2 = await league2.closeActiveSeason({ force: true, seasonId: SEASON_ID }); }
    finally { console.error = silence; }

    check('جایزهٔ صفرمقدار اصلاً ثبت نمی‌شود', () => {
      const ins = db2.calls.filter(c => /INSERT INTO league_perk_awards/.test(c.sql));
      assert.ok(!ins.some(c => c.params[2] === 2),
        '«۰ روز پلاس» چیزی نمی‌دهد ولی اعلانِ برنده‌شدن می‌فرستد');
    });

    check('نوعِ ناشناخته رد می‌شود و فصل بسته می‌شود', () => {
      assert.ok(r2 && !r2.skipped, 'بستنِ فصل نباید شکست بخورد');
    });

    check('آیتمِ ناموجود ردیف می‌گیرد ولی delivered_at نمی‌گیرد', () => {
      const ins = db2.calls.filter(c => /INSERT INTO league_perk_awards/.test(c.sql));
      assert.strictEqual(ins.length, 1, 'فقط رتبهٔ ۳ باید ثبت شود');
      assert.strictEqual(ins[0].params[2], 3);
      assert.strictEqual(
        db2.calls.filter(c => /SET delivered_at/.test(c.sql)).length, 0,
        'تحویل نشده پس نباید تحویل‌شده علامت بخورد — مدیر باید در پنل ببیند');
    });
  }

  // ══ سناریوی سوم: تأییدِ مدیر، هر نوع جایزه را متناسب با خودش تحویل می‌دهد ══
  //
  // بستنِ فصل فقط صف می‌سازد؛ اینجا ثابت می‌شود که تأیید واقعاً «پلاس» را
  // فعال می‌کند و «امتیاز» را به دفترِ امتیاز می‌برد. بدونِ این سناریو،
  // یک اشتباه در `approvePayouts` می‌تواند ردیف را «پرداخت‌شده» علامت
  // بزند در حالی که کاربر هیچ چیزی نگرفته — بدترین نوعِ باگ، چون در
  // گزارشِ مدیر همه‌چیز سبز است.
  console.log('\nتحویل پس از تأیید:');
  {
    const calls = [];
    const notes3 = [];
    const pts3 = [];
    const payout = {
      id: 'payout-1', user_id: 'u3', league_season_id: SEASON_ID,
      rank: 3, amount: 0, perk_kind: 'plus_days', perk_value: 30,
      perk_item_slug: null, perk_label: null, paid_at: null,
      month_year: '1404-05',
    };
    const client = {
      async query(sql, params = []) {
        const q = String(sql).replace(/\s+/g, ' ').trim();
        calls.push({ sql: q, params });
        // ⚠️ کوئری‌های چندسطره را پیش از تطبیق یک‌خط می‌کنیم؛ وگرنه
        //    «FROM league_payouts p\n  JOIN league_seasons» با الگوی
        //    تک‌فاصله‌ای هیچ‌وقت جور نمی‌شود و تست به‌جای شکستِ واقعی،
        //    ساکت می‌ماند.
        if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(q)) return { rows: [], rowCount: 0 };
        if (/FROM league_payouts p JOIN league_seasons/i.test(q)) return { rows: [payout], rowCount: 1 };
        if (/FROM league_perk_awards/i.test(q)) return { rows: [{ delivered_at: null }], rowCount: 1 };
        if (/MAX\(expires_at\)/i.test(q)) return { rows: [{ expires_at: null }], rowCount: 1 };
        if (/INSERT INTO user_subscriptions/i.test(q)) return { rows: [], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
      release() {},
    };
    const db3 = { client, calls, connect: async () => client, query: (...a) => client.query(...a) };

    stub('src/config/db.js', { pool: db3 });
    stub('src/services/walletService.js', { credit: async () => ({ balanceAfter: 0 }) });
    stub('src/services/notificationService.js', {
      createNotification: async (userId, kind, title, body) => notes3.push({ userId, body }),
    });
    stub('src/services/pointService.js', {
      credit: async (c, o) => { pts3.push(o); return { delta: o.points }; }, SOURCES: [],
    });
    delete require.cache[require.resolve(svcPath)];
    const league3 = require(svcPath);

    const r3 = await league3.approvePayouts('payout-1', 'admin-1');

    check('تأیید، اشتراکِ پلاس را واقعاً می‌سازد', () => {
      assert.strictEqual(calls.filter((c) => /INSERT INTO user_subscriptions/.test(c.sql)).length, 1,
        'بدونِ این، ردیف «پرداخت‌شده» می‌شود ولی کاربر پلاس نمی‌گیرد');
    });

    check('تأیید، delivered_at را ست می‌کند', () => {
      assert.strictEqual(
        calls.filter((c) => /UPDATE league_perk_awards SET delivered_at/.test(c.sql)).length, 1);
    });

    check('تأیید دقیقاً یک‌بار می‌پردازد', () => {
      assert.strictEqual(r3.paid, 1);
    });

    check('برنده بعد از تأیید خبردار می‌شود', () => {
      assert.strictEqual(notes3.length, 1);
      assert.ok(/پلاس/.test(notes3[0].body), `متن باید بگوید چه تحویل شد: ${notes3[0].body}`);
    });
  }

  console.log(`\n${failures.length ? '✗' : '✓'} ${pass} موفق، ${failures.length} ناموفق`);
  if (failures.length) { failures.forEach(f => console.error('  -', f)); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
