#!/usr/bin/env node
// ============================================================================
//  پروبِ سهمیهٔ سکه روی **پستگرسِ واقعی**
// ============================================================================
//
//   QUOTA_PROBE_DSN=postgres://postgres@/quota_probe node scripts/testCoinQuotaDb.js
//
// چرا این فایل لازم شد:
//
//   `testCoins.js` سهمیه را با یک دیتابیسِ **جعلی** می‌سنجد؛ همان تست، منطق
//   را خوب می‌پوشاند ولی سه چیزِ واقعی را نمی‌بیند که فقط خودِ پستگرس
//   می‌داند:
//
//     ۱. آیا `INSERT … ON CONFLICT … WHERE col < limit` واقعاً اتمیک است و
//        واقعاً در سقف رد می‌کند؟ (شبیه‌سازِ جعلی این را در JS تقلید
//        می‌کند، نه در SQL.)
//     ۲. آیا مقدارِ نهاییِ ستون در دیسک همان است که `getQuota` گزارش
//        می‌دهد؟
//     ۳. آیا «سهمیهٔ صفر» واقعاً پرداخت را می‌بندد؟ (باگِ واقعی: اولین
//        مسابقهٔ هر کاربر از مسیرِ INSERTِ بی‌قید رد می‌شد.)
//
// ── چرا روی دیتابیسِ اصلی اجرا نمی‌شود ──
//
// این پروب ردیف می‌سازد و پاک می‌کند. اگر اشتباهی روی `ghelgheli` اجرا شود،
// روی دادهٔ واقعیِ کاربران اثر می‌گذارد. پس:
//   • اگر نامِ دیتابیس `ghelgheli` باشد، **بدونِ** `ALLOW_PROD_PROBE=1`
//     بلافاصله با کدِ خروجِ ۲ رد می‌کند.
//   • کاربرِ آزمایشی با پیشوندِ `quotaprobe` ساخته می‌شود و در پایان حذف.
//
// این اسکریپت در `npm test` نیست (CI دیتابیس ندارد)؛ دستی و روی دیتابیسِ
// آزمون اجرا می‌شود. دستورِ ساختِ دیتابیسِ آزمون در
// `docs/تحویل-به-ایجنت-بعدی.md` آمده.

require('dotenv').config();

const { Pool } = require('pg');
const crypto = require('crypto');

const DSN = process.env.QUOTA_PROBE_DSN
  || 'postgres://postgres@/quota_probe?host=/var/run/postgresql';

const coinService = require('../src/services/coinService');
const economy = require('../src/services/gameEconomyService');

let passed = 0;
let failed = 0;
function ok(cond, label, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${label}`); } else {
    failed++; console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

async function main() {
  const dbName = (DSN.match(/\/([^/?]+)(\?|$)/) || [])[1] || '';
  if (dbName === 'ghelgheli' && process.env.ALLOW_PROD_PROBE !== '1') {
    console.error('✗ این دیتابیس، دیتابیسِ اصلیِ محصول است. پروب فقط روی '
      + 'دیتابیسِ آزمون اجرا می‌شود (ساختِ آن در سندِ تحویل).');
    process.exit(2);
  }

  const pool = new Pool({ connectionString: DSN, max: 4 });
  const coins = coinService.createCoinService(pool);
  const stamp = Date.now().toString().slice(-8);
  const mkUser = async (tag) => {
    const id = crypto.randomUUID();
    await pool.query(
      'INSERT INTO users (id, mobile, nickname) VALUES ($1, $2, $3)',
      [id, `0${stamp}${tag}`.slice(0, 11), `quotaprobe${tag}`],
    );
    return id;
  };

  const U = await mkUser('a');
  const V = await mkUser('b');
  const client = await pool.connect();
  const cleanup = async () => {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[U, V]])
      .catch(() => {});
  };

  try {
    console.log(`\n== سهمیهٔ روزانه روی پستگرسِ واقعی (${dbName}) ==`);
    const q0 = await coins.getQuota(U);
    const L100 = q0.limit[100];
    const L1000 = q0.limit[1000];
    ok(L100 > 0 && L1000 > 0, `سقفِ امروز از تنظیمات خوانده شد (۱۰۰:${L100} · ۱۰۰۰:${L1000})`);

    // ── ۱) سقفِ ۱۰۰ ──
    let granted = 0;
    let lastTrue = 0;
    for (let i = 1; i <= L100 + 5; i++) {
      if (await coins.consumeQuota(client, U, 100)) { granted++; lastTrue = i; }
    }
    ok(granted === L100, `دقیقاً ${L100} بار سهمیه داده شد (شده: ${granted})`);
    ok(lastTrue === L100, `آخرین مصرفِ موفق همان ${L100}اُم است (شده: ${lastTrue})`);

    const row = await pool.query(
      'SELECT used_100, used_1000 FROM user_coin_quota WHERE user_id=$1 AND quota_date=$2',
      [U, q0.date],
    );
    ok(Number(row.rows[0]?.used_100) === L100,
      `ستونِ used_100 در دیسک همان ${L100} است`, String(row.rows[0]?.used_100));
    ok(Number(row.rows[0]?.used_1000) === 0, 'سطحِ ۱۰۰۰ دست‌نخورده مانده (دو شمارندهٔ مستقل)');

    const qFull = await coins.getQuota(U);
    ok(qFull.remaining[100] === 0, 'باقی‌ماندهٔ ۱۰۰ صفر گزارش می‌شود');

    // ── ۲) برگشتِ سهمیه (مسابقهٔ ناتمام) ──
    await coins.releaseQuota(client, U, 100, q0.date);
    const qAfter = await coins.getQuota(U);
    ok(qAfter.remaining[100] === 1, 'برگشتِ یک واحد، یک بازیِ دیگر باز می‌کند');
    const again = await coins.consumeQuota(client, U, 100);
    ok(again === true, 'بعد از برگشت، مصرفِ دوباره موفق است');
    const denied = await coins.consumeQuota(client, U, 100);
    ok(denied === false, 'و بلافاصله بعدش دوباره رد می‌شود (سقف دوباره پر است)');

    // ── ۳) سقفِ ۱۰۰۰ مستقل از ۱۰۰ ──
    let g1000 = 0;
    for (let i = 0; i < L1000 + 3; i++) {
      if (await coins.consumeQuota(client, U, 1000)) g1000++;
    }
    ok(g1000 === L1000, `سقفِ ۱۰۰۰ مستقل است (${g1000} از ${L1000})`);

    // ── ۴) سهمیهٔ صفر یعنی «خاموش» ──
    //
    // باگِ واقعیِ همین دور: ادمین سهمیه را صفر می‌کرد تا پرداختِ سکه
    // بخوابد، ولی اولین مسابقهٔ هر کاربر از مسیرِ INSERTِ بی‌قید رد می‌شد و
    // سکه می‌گرفت. `setCachedForTest` تنظیمات را بدونِ دست‌زدن به
    // دیتابیس به سرویس می‌دهد.
    economy.setCachedForTest?.({ dailyCoinQuota: { 100: 0, 1000: 0 } });
    const zeroOff = await coins.consumeQuota(client, V, 100);
    ok(zeroOff === false, 'سهمیهٔ صفر ⇒ اولین بازی هم سکه نمی‌گیرد');
    const vRow = await pool.query(
      'SELECT used_100 FROM user_coin_quota WHERE user_id=$1', [V],
    );
    ok(!vRow.rows.length, 'برای کاربرِ سقف‌صفر حتی یک ردیفِ سهمیه ساخته نشد');
    economy.invalidateCache?.();

    console.log(`\n${failed ? '✗' : '✅'} ${passed} موفق، ${failed} ناموفق\n`);
  } finally {
    client.release();
    await cleanup();
    await pool.end();
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('✗ خطای اجرای پروب:', e.message);
  process.exit(1);
});
