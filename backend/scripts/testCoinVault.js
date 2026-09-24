// ═══════════════════════════════════════════════════════════════════════
// گاردِ «صندوق سکه»
// ═══════════════════════════════════════════════════════════════════════
//
// صندوق پول جابه‌جا می‌کند، پس همان دقتی را می‌خواهد که کیف پول می‌خواهد.
// این تست با یک `client` جعلی، ترتیب و محتوای کوئری‌های `deposit` را
// می‌سنجد — بدونِ دیتابیسِ واقعی، مثل بقیهٔ گاردهای این پوشه.
//
// چهار خطرِ واقعی که اینجا بسته می‌شوند:
//   ۱. واریزِ بیش از موجودی (چاپِ سکه)
//   ۲. واریز به لیگی که در جریان نیست (سکه دور ریخته می‌شود)
//   ۳. نبودِ قفلِ ردیفِ کاربر (دو درخواستِ هم‌زمان)
//   ۴. فراموشیِ ROLLBACK در مسیرِ خطا

const assert = require('assert');
const path = require('path');
const fs = require('fs');

let pass = 0;
let fail = 0;
// امضا عمداً `(شرط, برچسب, جزئیات)` است — همان قراردادی که بقیهٔ
// اسکریپت‌های این پوشه دارند (مثل testGameEconomy.js).
function ok(cond, label, detail = '') {
  if (cond) { pass += 1; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); } else { fail += 1; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

// ── یک pool جعلی که قبل از require تزریق می‌شود ────────────────────────
const log = [];
let vaultBalance = 500;
let seasonActive = true;

const fakeClient = {
  async query(sql, params) {
    log.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
    if (/SELECT vault_coins FROM users/.test(sql)) {
      return { rows: [{ vault_coins: vaultBalance }] };
    }
    if (/FROM league_seasons/.test(sql) && /status='active'/.test(sql)) {
      return { rows: seasonActive ? [{ id: params[0], title: 'لیگ مهر', month_year: '1405-07' }] : [] };
    }
    if (/UPDATE users u SET/.test(sql)) return { rows: [{ coins: 1200 }] };
    return { rowCount: 1, rows: [] };
  },
  release() {},
};

require.cache[require.resolve('../src/config/db')] = {
  id: require.resolve('../src/config/db'),
  filename: require.resolve('../src/config/db'),
  loaded: true,
  exports: { pool: { connect: async () => fakeClient, query: async () => ({ rows: [] }) } },
};
require.cache[require.resolve('../src/lib/cache')] = {
  id: require.resolve('../src/lib/cache'),
  filename: require.resolve('../src/lib/cache'),
  loaded: true,
  exports: {
    cacheDelPrefix: async () => {}, cacheGet: async () => null,
    cacheSet: async () => {}, cacheDel: async () => {},
  },
};

const vault = require('../src/services/coinVaultService');

(async () => {
  console.log('\n══ ۱. واریزِ سالم ══');
  {
    log.length = 0;
    vaultBalance = 500;
    seasonActive = true;
    const r = await vault.deposit('u1', 'season-1', 200);
    ok(r.deposited === 200 && r.vaultCoins === 300,
      'موجودی درست کم شد (۵۰۰ → ۳۰۰)', JSON.stringify(r));

    const order = log.map(l => l.sql);
    ok(/^BEGIN/.test(order[0]), 'با BEGIN شروع می‌شود');
    ok(order.some(q => /SELECT vault_coins FROM users WHERE id=\$1 FOR UPDATE/.test(q)),
      'ردیفِ کاربر قفل می‌شود (FOR UPDATE) — جلوی دو واریزِ هم‌زمان');
    ok(order.some(q => /UPDATE users SET vault_coins=\$2/.test(q)),
      'موجودیِ صندوق نوشته می‌شود');
    ok(order.some(q => /INSERT INTO league_leaderboard_entries/.test(q)),
      'سکه واردِ ردیفِ همان لیگ می‌شود');
    ok(order.some(q => /INSERT INTO coin_vault_transactions/.test(q)),
      'در دفترِ صندوق ثبت می‌شود');
    ok(order.some(q => /INSERT INTO coin_transactions/.test(q)),
      'در دفترِ سکه هم ثبت می‌شود (users.coins بالا رفته)');
    ok(order[order.length - 1] === 'COMMIT', 'با COMMIT تمام می‌شود');

    // قفل باید **قبل** از خواندنِ موجودی و نوشتن باشد.
    const lockAt = order.findIndex(q => /FOR UPDATE/.test(q));
    const writeAt = order.findIndex(q => /UPDATE users SET vault_coins/.test(q));
    ok(lockAt >= 0 && lockAt < writeAt, 'قفل پیش از نوشتن گرفته می‌شود');

    const ledger = log.find(l => /INSERT INTO coin_vault_transactions/.test(l.sql));
    ok(ledger.params[1] === -200, 'دفترِ صندوق مقدارِ منفی ثبت می‌کند', String(ledger.params[1]));
    ok(ledger.params[2] === 300, 'موجودیِ بعد از حرکت درست است', String(ledger.params[2]));
  }

  console.log('\n══ ۲. واریزِ بیش از موجودی رد می‌شود ══');
  {
    log.length = 0;
    vaultBalance = 100;
    let err = null;
    try { await vault.deposit('u1', 'season-1', 500); } catch (e) { err = e; }
    ok(Boolean(err) && err.code === 'VAULT_INSUFFICIENT',
      'خطای «موجودی کافی نیست» با کدِ مشخص', err?.code);
    ok(!log.some(l => /INSERT INTO league_leaderboard_entries/.test(l.sql)),
      'هیچ سکه‌ای وارد لیگ نشد');
    ok(log.some(l => l.sql === 'ROLLBACK'), 'تراکنش برگشت خورد');
  }

  console.log('\n══ ۳. لیگِ غیرفعال رد می‌شود ══');
  {
    log.length = 0;
    vaultBalance = 500;
    seasonActive = false;
    let err = null;
    try { await vault.deposit('u1', 'season-dead', 100); } catch (e) { err = e; }
    ok(Boolean(err) && err.code === 'LEAGUE_NOT_ACTIVE',
      'واریز به لیگِ تمام‌شده ممکن نیست', err?.code);
    ok(!log.some(l => /UPDATE users SET vault_coins/.test(l.sql)),
      'موجودیِ صندوق دست‌نخورده ماند');
    ok(log.some(l => l.sql === 'ROLLBACK'), 'تراکنش برگشت خورد');
    seasonActive = true;
  }

  console.log('\n══ ۴. ورودیِ نامعتبر ══');
  {
    for (const bad of [0, -5, 'abc', null]) {
      let err = null;
      try { await vault.deposit('u1', 'season-1', bad); } catch (e) { err = e; }
      ok(Boolean(err), `مبلغ ${JSON.stringify(bad)} رد می‌شود`);
    }
    let err = null;
    try { await vault.deposit('u1', '', 10); } catch (e) { err = e; }
    ok(Boolean(err), 'بدونِ انتخابِ لیگ رد می‌شود');
  }

  console.log('\n══ ۵. قواعدِ ثابتِ کد ══');
  {
    const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    const league = src('src/services/leagueService.js');
    const mig = src('migrations/099_coin_vault.sql');

    // خواستهٔ صریحِ مالک: «دیگه به لیگ جدید منتقل نشه».
    ok(!/carryoverBetween/.test(league),
      'مسیرِ انتقالِ خودکار به لیگِ بعدی حذف شده');
    ok(/carryoverToVault/.test(league), 'واریزِ پایانِ لیگ به صندوق می‌رود');
    ok(/vault_coins = vault_coins \+/.test(league),
      'صندوق جمع می‌شود (نه بازمحاسبه) — هر لیگ یک واریزِ مستقل');

    // نشانِ ضدِ واریزِ دوباره باید بماند، وگرنه «چاپِ سکه» در ظرفِ تازه.
    ok(/carryoverMarkerKey/.test(league), 'نشانِ ضدِ واریزِ دوباره سرِ جایش است');

    ok(/vault_coins >= 0/.test(mig), 'دیتابیس موجودیِ منفی را نمی‌پذیرد');
    ok(/ON DELETE CASCADE/.test(mig), 'دفترِ صندوق با حذفِ کاربر پاک می‌شود');

    // `users.coins` با پایانِ لیگ صفر می‌شود؛ صندوق **نباید** صفر شود.
    const zeroing = league.slice(league.indexOf('UPDATE users SET coins=0'));
    ok(!/vault_coins\s*=\s*0/.test(zeroing),
      'صفر کردنِ سکهٔ پایانِ لیگ به صندوق دست نمی‌زند');
  }

  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} موفق، ${fail} ناموفق\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
