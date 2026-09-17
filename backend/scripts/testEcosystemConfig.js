#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  آزمونِ قراردادِ ecosystem.config.cjs — پروفایلِ ظرفیت باید واقعاً پاس شود
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── باگی که این آزمون باید همیشه بگیرد ────────────────────────────────────
 *
 * `ecosystem.config.cjs` سقفِ حافظهٔ هر گره را این‌طور می‌داد:
 *
 *     node_args: `--max-old-space-size=${cap.heapMB}`
 *
 * پنلِ PM2 هم همان عدد را نشان می‌داد (`pm2 jlist` ⇒
 * `node_args=['--max-old-space-size=923']`)، ولی پروسهٔ واقعی روی سرور
 * **بدونِ آن فلگ** بالا آمده بود: `/proc/<pid>/cmdline` فقط
 * `node /var/www/GhelGheli/backend/src/server.js` بود و
 * `/proc/<pid>/environ` هم `NODE_OPTIONS` نداشت. یعنی:
 *
 *   • V8 با سقفِ پیش‌فرضِ خودش (چند گیگابایت) اجرا می‌شد؛
 *   • به‌جای GCِ به‌موقع، heap تا سقفِ ری‌استارتِ PM2 رشد می‌کرد و پروسه
 *     **وسطِ کار** ری‌استارت می‌شد (مسابقهٔ در جریان می‌مرد)؛
 *   • روی سرورِ ۳.۹ گیگی، سقفِ «۹۲۳ مگ» فقط عددی روی کاغذ بود.
 *
 * درمان (این آزمون نگهبانش است): `NODE_OPTIONS` هم ست می‌شود، چون Node خودش
 * همیشه آن را می‌خواند و به نسخهٔ PM2 و حالتِ fork/cluster وابسته نیست.
 *
 * آزمون بدونِ دیتابیس/شبکه اجرا می‌شود: فقط کانفیگ را می‌خواند و با پروفایلِ
 * ظرفیتی که خودِ اپ تشخیص می‌دهد مقایسه می‌کند.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
};

const eco = require('../ecosystem.config.cjs');
const cap = require('../src/lib/capacity').detect();
const src = fs.readFileSync(path.join(__dirname, '..', 'ecosystem.config.cjs'), 'utf8');
const apps = eco.apps || [];

console.log('\n۱) تعداد و نام و پورتِ گره‌ها');
{
  ok(apps.length === 1 + cap.httpProcs, `تعدادِ گره‌ها = ۱ گرهٔ بازی + ${cap.httpProcs} گرهٔ HTTP`);
  ok(apps[0].name === 'ghelgheli-api', 'گرهٔ بازی نامش ghelgheli-api است (deploy.sh به آن تکیه دارد)');
  ok(apps[0].env.PORT === '4000', 'گرهٔ بازی روی پورت ۴۰۰۰');
  const httpPorts = apps.slice(1).map((a) => Number(a.env.PORT));
  const expected = Array.from({ length: cap.httpProcs }, (_, i) => 4001 + i);
  ok(JSON.stringify(httpPorts) === JSON.stringify(expected), `پورت‌های HTTP پیوسته: ${expected.join(', ')}`);
  ok(new Set(apps.map((a) => a.name)).size === apps.length, 'هیچ نامی تکرار نشده');
  ok(new Set(apps.map((a) => a.env.PORT)).size === apps.length, 'هیچ پورتی تکرار نشده (وگرنه EADDRINUSE)');
}

console.log('\n۲) سقفِ حافظه — همان باگی که روی تولید دیده شد');
{
  for (const a of apps) {
    ok(
      String(a.env.NODE_OPTIONS || '').includes(`--max-old-space-size=${cap.heapMB}`),
      `${a.name}: NODE_OPTIONS سقفِ heap را می‌دهد (${cap.heapMB}M) — PM2 در fork آن را پاس نمی‌داد`
    );
  }
  ok(/NODE_OPTIONS\s*:/.test(src), 'در خودِ فایلِ کانفیگ هم NODE_OPTIONS نوشته شده (نگهبانِ حذفِ تصادفی)');
  for (const a of apps) {
    ok(String(a.node_args || '').includes(`--max-old-space-size=${cap.heapMB}`),
      `${a.name}: node_args هم می‌مانَد (برای PM2هایی که پاس می‌دهند)`);
  }
  ok(cap.heapMB > cap.memRestartMB, `سقفِ heap (${cap.heapMB}M) بالای سقفِ ری‌استارت (${cap.memRestartMB}M) است ⇒ PM2 قبل از OOM ری‌استارت می‌کند`);
}

console.log('\n۳) سقفِ ری‌استارت و پروفایلِ منابع');
{
  for (const a of apps) {
    ok(a.max_memory_restart === `${cap.memRestartMB}M`, `${a.name}: max_memory_restart=${cap.memRestartMB}M`);
    ok(Number(a.env.UV_THREADPOOL_SIZE) === cap.uv, `${a.name}: UV_THREADPOOL_SIZE=${cap.uv}`);
    ok(Number(a.env.VISION_CONCURRENCY) === cap.vision, `${a.name}: VISION_CONCURRENCY=${cap.vision}`);
    ok(Number(a.env.PG_POOL_MAX) === cap.poolMax, `${a.name}: PG_POOL_MAX=${cap.poolMax}`);
    ok(a.env.NODE_ENV === 'production', `${a.name}: NODE_ENV=production`);
    ok(a.max_restarts >= 5 && a.exp_backoff_restart_delay, `${a.name}: محافظِ ری‌استارت (max_restarts + backoff)`);
  }
  // جمعِ استخرِ اتصال‌ها باید زیرِ max_connections=100 بماند (وگرنه سرِ بارِ
  // شلوغی، «too many clients already» می‌گیریم).
  const totalPool = apps.reduce((s, a) => s + Number(a.env.PG_POOL_MAX), 0);
  ok(totalPool <= 100, `جمعِ استخرِ دیتابیس = ${totalPool} ≤ ۱۰۰`);
}

console.log('\n۴) نقش‌ها و لاگ‌های جدا');
{
  ok(apps.filter((a) => a.env.PROCESS_ROLE === 'game').length === 1, 'دقیقاً یک گره نقشِ game دارد');
  ok(apps.filter((a) => a.env.PROCESS_ROLE === 'http').length === cap.httpProcs, `${cap.httpProcs} گره نقشِ http`);
  for (const a of apps) {
    ok(a.out_file !== a.error_file && a.out_file && a.error_file, `${a.name}: لاگِ out و error جدا هستند`);
    ok(a.merge_logs === false, `${a.name}: merge_logs=false (خطای واقعی در فایلِ error بماند)`);
  }
}

console.log('\n۵) رزروِ رم (هم‌ترازیِ بودجه)');
{
  ok(cap.reserveMB >= 512, `reserveMB=${cap.reserveMB} منطقی است`);
  ok(cap.memForAppMB >= 1024, `memForAppMB=${cap.memForAppMB} کفِ بودجهٔ اپ`);
  ok(cap.memTotalMB === Math.round(require('os').totalmem() / 1048576), 'memTotalMB از رمِ واقعیِ همین ماشین آمده');
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} موفق، ${fail} ناموفق\n`);
process.exit(fail === 0 ? 0 : 1);
