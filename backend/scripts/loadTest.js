#!/usr/bin/env node
// ============================================================================
//  تستِ بارِ HTTP (load test) — کشفِ پرتگاهِ ظرفیت در CI
// ============================================================================
//
//   node scripts/loadTest.js                 # روی http://127.0.0.1:${PORT}
//   BASE=http://127.0.0.1:4999 ...
//   CONCURRENCY=80 DURATION=15 node ...      # فشار و طولِ موج را تنظیم کن
//
// ── چرا هست ──────────────────────────────────────────────────────────
// پرتگاهِ واقعیِ این سرور در تستِ دستیِ گذشته دیده شد: نه در میانگین، بلکه
// در دُمی که یک‌شبه از ~۳۰۰ms به ~۸.۵ ثانیه پرید. این اسکریپت همان را
// خودکار می‌کند:
//
//   • موجی از درخواست روی مسیرهای عمومی و داغ می‌فرستد؛
//   • توانِ عملی (ops/sec)، میانگین و p95/p99 پاسخ را اندازه می‌گیرد؛
//   • اگر سهمِ خطا (شاملِ تایم‌اوت و ۵xx) از آستانه بگذرد یا p95 از حدِ
//     توافق‌شده بیشتر شود، **با کد ۱ می‌ایستد** تا CI قرمز شود؛
//   • خروجی برای جدولِ CI خلاصه و فارسی است.
//
// عمداً بدون وابستگی است (فقط fetch) تا درست داخلِ CI هم اجرا شود.
const BASE = process.env.BASE || `http://127.0.0.1:${process.env.PORT || 4000}`;
const CONC = Math.max(1, Number(process.env.CONCURRENCY || 40));
const DURATION = Math.max(3, Number(process.env.DURATION || 15)); // ثانیه
// آستانه‌های توافقِ حداقلی. روی اکشن‌رانر کوچک عددِ توان مهم نیست؛ هدف
// این است که اگر یک تغییر، p95 را فاجعه‌بار کند یا ۵xx تولید کند، قرمز شود.
const MAX_ERROR_RATE = Number(process.env.LT_MAX_ERROR_RATE || 0.05); // ۵٪
const MAX_P95_MS = Number(process.env.LT_MAX_P95_MS || 2000);

// مسیرهای عمومی (بدون نیاز به توکن). health و کاتالوگ، همان چیزی که
// اپ بعد از هر اتصال می‌زند؛ سهمِ سنگین به /health (که پشت پراکسی هم
// مدام صدا زده می‌شود) ندهد تا واقع‌بینانه بماند.
const PATHS = ['/health', '/health', '/health', '/api/games'];

async function one() {
  const path = PATHS[Math.floor(Math.random() * PATHS.length)];
  const t0 = process.hrtime.bigint();
  let status = 0;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 10_000);
    const r = await fetch(`${BASE}${path}`, { signal: ctrl.signal });
    clearTimeout(to);
    status = r.status;
    await r.text();
  } catch {
    status = 0; // تایم‌اوت/قطعی
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { status, ms };
}

async function worker(results, until) {
  while (Date.now() < until) {
    results.push(await one());
  }
}

(async () => {
  // گرم‌کردنِ کوتاه تا JIT و اتصال‌ها آماده شوند.
  await Promise.all(Array.from({ length: 8 }, () => one().catch(() => {})));

  const results = [];
  const until = Date.now() + DURATION * 1000;
  const wall = process.hrtime.bigint();
  const workers = Array.from({ length: CONC }, () => worker(results, until));
  await Promise.all(workers);
  const wallS = Number(process.hrtime.bigint() - wall) / 1e9;

  results.sort((a, b) => a.ms - b.ms);
  const n = results.length || 1;
  const avg = results.reduce((s, r) => s + r.ms, 0) / n;
  const pct = (p) => results[Math.min(results.length - 1, Math.floor((p / 100) * results.length))].ms;
  const p95 = pct(95), p99 = pct(99);
  const errors = results.filter(r => r.status === 0 || r.status >= 500).length;
  const errorRate = errors / n;
  const ops = results.length / wallS;

  console.log('╔══════════════════════════════════════════╗');
  console.log('║   تست بار HTTP                            ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`  هدف         : ${BASE}`);
  console.log(`  هم‌زمان      : ${CONC}  ·  طول موج: ${DURATION}s`);
  console.log(`  درخواست‌ها  : ${results.length}`);
  console.log(`  توان عملی   : ${ops.toFixed(0)} req/s`);
  console.log(`  میانگین      : ${avg.toFixed(1)} ms`);
  console.log(`  p95 / p99    : ${p95.toFixed(0)} / ${p99.toFixed(0)} ms`);
  console.log(`  خطا (۵xx/تایم‌اوت): ${errors} (${(errorRate * 100).toFixed(2)}٪)`);

  const problems = [];
  if (errorRate > MAX_ERROR_RATE) problems.push(`نرخ خطا ${(errorRate * 100).toFixed(1)}٪ بیش از ${MAX_ERROR_RATE * 100}٪ است`);
  if (p95 > MAX_P95_MS) problems.push(`p95 با ${p95.toFixed(0)}ms بیش از ${MAX_P95_MS}ms است`);
  if (results.length === 0) problems.push('هیچ پاسخی دریافت نشد');

  if (problems.length) {
    console.log('\n❌ تست بار رد شد:');
    problems.forEach(p => console.log('   • ' + p));
    process.exit(1);
  }
  console.log('\n✅ ظرفیت HTTP در محدودهٔ توافق‌شده است');
  process.exit(0);
})().catch(e => { console.error('load test fatal:', e); process.exit(1); });
