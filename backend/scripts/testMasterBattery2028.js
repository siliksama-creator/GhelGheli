#!/usr/bin/env node
/**
 * باتریِ جامعِ فقط‌خواندنی.
 *
 * نسخهٔ قبلی روی هر دیتابیسی — حتی production — یک کاربر ثابت می‌ساخت و
 * `wallet_balance=50000` و `current_points=1000` می‌نوشت، بدون دفتر و بدون
 * پاکسازی. همین فایل علتِ مستقیم wallet drift سرور شد. این نسخه تحت هیچ
 * شرایطی INSERT/UPDATE/DELETE ندارد؛ تستِ تغییردهنده باید DB موقت خودش را
 * بسازد، نه محصول زنده را.
 */
const { pool } = require('../src/config/db');
const penalty = require('../src/games/rules/penalty');
const memory = require('../src/games/rules/memory');
const stake = require('../src/services/gameStakeService');

let passed = 0;
let failed = 0;
const ok = (condition, message) => {
  if (condition) { passed++; console.log(`  ✓ ${message}`); }
  else { failed++; console.error(`  ✗ ${message}`); }
};

(async () => {
  console.log('══ GhelGheli Master Battery — READ ONLY ══');

  console.log('\n[1] منطق بازی‌ها');
  const mem = memory.create();
  ok(mem.size === 16 && memory.FACES.length === 8,
    'جفت‌یاب ۱۶ کارت و ۸ جفت دارد');
  for (let z = 0; z < 9; z++) {
    ok(penalty.resolveKick(z, 0.6, z).outcome === 'save',
      `پنالتی ناحیه ${z}: شیرجه هم‌جهت مهار است`);
  }
  ok(penalty.resolveKick(0, 0.6, 8).outcome === 'goal',
    'پنالتی: جهت مخالف گل است');

  console.log('\n[2] قواعد stake');
  ok(stake.parsePublicStake(100) === 100 && stake.parsePublicStake(1000) === 1000,
    'stake عمومی فقط ۱۰۰/۱۰۰۰');
  ok(stake.parseLobbyStake(0) === 0 && stake.parseLobbyStake(5000) === 5000,
    'لابی رایگان/۱۰۰/۱۰۰۰/۵۰۰۰');
  let badRejected = false;
  try { stake.parsePublicStake(10000); } catch { badRejected = true; }
  ok(badRejected, 'stake دلخواه رد می‌شود');

  console.log('\n[3] سلامت دیتابیس (فقط SELECT)');
  try {
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_name IN (
         'users','point_transactions','wallet_transactions',
         'game_stake_matches','league_seasons','pass_seasons')`);
    ok(tables.rows.length === 6, 'شش جدول حیاتی موجودند');

    const walletDrift = await pool.query(`
      SELECT count(*)::int AS n FROM (
        SELECT u.id
          FROM users u LEFT JOIN wallet_transactions t ON t.user_id=u.id
         GROUP BY u.id,u.wallet_balance
        HAVING u.wallet_balance <> COALESCE(SUM(
          CASE WHEN t.direction='credit' THEN t.amount ELSE -t.amount END),0)
      ) q`);
    ok(walletDrift.rows[0].n === 0,
      `wallet drift صفر است (فعلی: ${walletDrift.rows[0].n})`);

    const pointDrift = await pool.query(`
      SELECT count(*)::int AS n FROM (
        SELECT u.id
          FROM users u LEFT JOIN point_transactions t ON t.user_id=u.id
         GROUP BY u.id,u.current_points
        HAVING count(t.id)>0
           AND u.current_points <> COALESCE(SUM(t.delta),0)
      ) q`);
    ok(pointDrift.rows[0].n === 0,
      `point ledger drift صفر است (فعلی: ${pointDrift.rows[0].n})`);

    const openEscrows = await pool.query(`
      SELECT count(*)::int AS n FROM game_stake_matches
       WHERE status='reserved' AND created_at < NOW() - INTERVAL '70 minutes'`);
    ok(openEscrows.rows[0].n === 0,
      `escrow کهنه صفر است (فعلی: ${openEscrows.rows[0].n})`);
  } catch (e) {
    console.log(`  ℹ️ دیتابیس در این محیط در دسترس نیست: ${e.message}`);
  } finally {
    await pool.end().catch(() => {});
  }

  console.log(`\n${failed ? '❌' : '✅'} ${passed} موفق، ${failed} ناموفق`);
  process.exit(failed ? 1 : 0);
})().catch(async e => {
  console.error(e);
  await pool.end().catch(() => {});
  process.exit(1);
});
