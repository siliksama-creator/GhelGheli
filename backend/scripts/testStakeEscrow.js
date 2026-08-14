#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  createGameStakeService,
  parsePublicStake,
  parseLobbyStake,
} = require('../src/services/gameStakeService');

let pass = 0, fail = 0;
const ok = (c, n) => c ? (pass++, console.log(`  ✓ ${n}`))
  : (fail++, console.error(`  ✗ ${n}`));

class FakeClient {
  constructor({ users = [], match = null } = {}) {
    this.users = users;
    this.match = match;
    this.queries = [];
  }
  async query(sql, params = []) {
    this.queries.push({ sql, params });
    if (/SELECT id, current_points, status[\s\S]*FROM users/.test(sql)) {
      return { rows: this.users };
    }
    if (/SELECT \* FROM game_stake_matches/.test(sql)) {
      return { rows: this.match ? [this.match] : [] };
    }
    return { rows: [], rowCount: 1 };
  }
  release() {}
}

function fakeDb(client) {
  return {
    connect: async () => client,
    query: async (sql) => {
      if (/SELECT current_points, status FROM users/.test(sql)) {
        return { rows: client.users.slice(0, 1) };
      }
      if (/SELECT id FROM game_stake_matches/.test(sql)) return { rows: [] };
      return { rows: [] };
    },
  };
}

function fakePoints() {
  const calls = [];
  return {
    calls,
    debit: async (_client, o) => {
      calls.push({ kind: 'debit', ...o });
      return { delta: -o.points, balanceAfter: 10_000 - o.points };
    },
    credit: async (_client, o) => {
      calls.push({ kind: 'credit', ...o });
      return { delta: o.points, balanceAfter: 10_000 + o.points };
    },
  };
}

(async () => {
  console.log('\n== whitelist سختِ stake ==');
  ok(parsePublicStake(100) === 100 && parsePublicStake(1000) === 1000,
    'مسابقه عمومی فقط ۱۰۰/۱۰۰۰ را می‌پذیرد');
  ok(parseLobbyStake(0) === 0 && parseLobbyStake(5000) === 5000,
    'لابی رایگان و ۵۰۰۰ مجاز است');
  for (const bad of [-1, 1, 99, 200, 500, 10000, 1.5, Infinity, 'abc']) {
    let threw = false;
    try { parsePublicStake(bad); } catch { threw = true; }
    ok(threw, `stake جعلی ${String(bad)} رد می‌شود`);
  }

  console.log('\n== رزرو اتمیک قبل از شروع ==');
  {
    const c = new FakeClient({ users: [
      { id: 'u1', current_points: 5000, status: 'active' },
      { id: 'u2', current_points: 5000, status: 'active' },
    ] });
    const points = fakePoints();
    const svc = createGameStakeService(fakeDb(c), points);
    const r = await svc.reserveMatch({
      matchId: 'm1', gameId: 'memory', stake: 1000,
      playerXId: 'u1', playerOId: 'u2',
    });
    ok(points.calls.filter(x => x.kind === 'debit').length === 2,
      'از هر دو بازیکن دقیقاً یک بار کسر می‌شود');
    ok(points.calls.every(x => x.referenceType === 'game_stake_entry'),
      'هر دو کسر در دفتر با شناسه مسابقه ثبت می‌شوند');
    ok(r.netPot === 1800 && r.commission === 200,
      'پات ۱۸۰۰ و کمیسیون ۲۰۰ برای stake هزار درست است');
    ok(c.queries.some(x => /FOR UPDATE/.test(x.sql)),
      'موجودی هر دو بازیکن پیش از کسر قفل می‌شود');
    ok(c.queries.some(x => x.sql === 'COMMIT'), 'رزرو commit می‌شود');
  }

  console.log('\n== موجودی ناکافی، بازی را قبل از کسر رد می‌کند ==');
  {
    const c = new FakeClient({ users: [
      { id: 'u1', current_points: 999, status: 'active' },
      { id: 'u2', current_points: 5000, status: 'active' },
    ] });
    const points = fakePoints();
    const svc = createGameStakeService(fakeDb(c), points);
    let code = null;
    try {
      await svc.reserveMatch({ matchId: 'm2', gameId: 'penalty', stake: 1000,
        playerXId: 'u1', playerOId: 'u2' });
    } catch (e) { code = e.code; }
    ok(code === 'INSUFFICIENT_POINTS', 'خطای صریحِ امتیاز ناکافی برمی‌گردد');
    ok(points.calls.length === 0, 'کسر جزئی از هیچ‌کس انجام نمی‌شود');
    ok(c.queries.some(x => x.sql === 'ROLLBACK'), 'کل رزرو rollback می‌شود');
  }

  console.log('\n== تسویه برد، تساوی و idempotency ==');
  const baseMatch = {
    id: 'm3', game_id: 'memory', player_x_id: 'u1', player_o_id: 'u2',
    stake_points: 1000, gross_pot: 2000, commission_points: 200,
    net_pot: 1800, status: 'reserved', outcome: null,
  };
  {
    const c = new FakeClient({ match: { ...baseMatch } });
    const points = fakePoints();
    const r = await createGameStakeService(fakeDb(c), points)
      .settleMatch({ matchId: 'm3', winnerUserId: 'u1' });
    const pay = points.calls.find(x => x.kind === 'credit');
    ok(r.netPot === 1800 && pay.points === 1800, 'فقط netPot به برنده می‌رسد');
    ok(r.winnerBalanceAfter === 11800,
      'موجودی نهایی authoritative برای انیمیشن واریز برمی‌گردد');
    ok(pay.lifetimeGain === 800, 'lifetime فقط سود خالص را می‌گیرد');
    ok(pay.league === false, 'پات رتبه لیگ را دستکاری نمی‌کند');
  }
  {
    const c = new FakeClient({ match: { ...baseMatch } });
    const points = fakePoints();
    await createGameStakeService(fakeDb(c), points)
      .settleMatch({ matchId: 'm3', draw: true });
    ok(points.calls.length === 2 && points.calls.every(x => x.points === 1000),
      'در تساوی اصل stake دقیقاً به هر دو برمی‌گردد');
    ok(points.calls.every(x => x.lifetimeGain === 0),
      'refund تساوی lifetime تازه نمی‌سازد');
  }
  {
    const c = new FakeClient({ match: { ...baseMatch, status: 'settled', outcome: 'winner' } });
    const points = fakePoints();
    const r = await createGameStakeService(fakeDb(c), points)
      .settleMatch({ matchId: 'm3', winnerUserId: 'u1' });
    ok(r.duplicate === true, 'تسویهٔ دوم no-op است');
    ok(points.calls.length === 0, 'تسویهٔ دوم هیچ امتیازی نمی‌سازد');
  }

  console.log('\n== wiring موتور ==');
  const engine = fs.readFileSync(path.join(__dirname, '..', 'src', 'games', 'engine.js'), 'utf8');
  ok(engine.includes('await stakes.reserveMatch') && engine.indexOf('await stakes.reserveMatch') < engine.indexOf("'game:start'"),
    'رزرو پیش از game:start انجام می‌شود');
  ok(!/UPDATE users SET current_points/.test(engine),
    'موتور دیگر مستقیم موجودی را UPDATE نمی‌کند');
  ok(!/INSERT INTO point_transactions/.test(engine),
    'موتور دیگر دفتر را دستی و پراکنده نمی‌نویسد');
  ok(engine.includes('parsePublicStake') && engine.includes('parseLobbyStake'),
    'payloadهای عمومی و لابی هر دو whitelist می‌شوند');

  console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
