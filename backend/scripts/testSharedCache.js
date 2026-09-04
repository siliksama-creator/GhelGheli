#!/usr/bin/env node
// تستِ کشِ مشترک (فال‌بک حافظه‌ای) و فروشگاهِ rate-limit.
// این تست بدونِ Redis اجرا می‌شود تا در CI هم سبز باشد؛ مسیر Redis در
// استیجینگِ VPS دستی راستی‌آزمایی می‌شود.
const { cacheGet, cacheSet, cacheDel } = require('../src/lib/cache');

let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.error(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('== کش مشترک (فال‌بک حافظه‌ای) ==');
  ok(await cacheGet('missing') === null, 'کلید ناموجود null است');
  await cacheSet('k1', { a: 1, b: [2, 3] }, 1000);
  const v = await cacheGet('k1');
  ok(v && v.a === 1 && v.b[1] === 3, 'نوشتن/خواندن شیء سالم است', JSON.stringify(v));
  await cacheDel('k1');
  ok(await cacheGet('k1') === null, 'حذف کلید کار می‌کند');
  await cacheSet('expire', 'x', 50);
  ok((await cacheGet('expire')) === 'x', 'قبل از TTL موجود است');
  await sleep(90);
  ok(await cacheGet('expire') === null, 'بعد از TTL منقضی می‌شود');

  // مقدارِ غیرقابلِ JSON نباید بترکاند.
  const circular = {}; circular.self = circular;
  await cacheSet('bad', circular, 1000);
  ok((await cacheGet('bad')) === null, 'مقدار حلقوی با خطا خاموش می‌شود (نه throw)');

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} موفق، ${fail} ناموفق`);
  process.exit(fail ? 1 : 0);
})();
