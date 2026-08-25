#!/usr/bin/env node
/**
 * نگهبان پیکربندی کلاینت («اهرمِ بدون-آپدیت»).
 *
 * ایستا: فایل روت، مایگریشن و پیش‌فرض‌ها را بررسی می‌کند تا کسی ناخواسته
 * قرارداد «GET /api/config + PATCH ادمین» را نشکند. (بدون دیتابیس/سرور.)
 */
'use strict';

const fs = require('fs');
const path = require('path');

let failed = 0;
const ok = (name, cond) => {
  if (!cond) failed += 1;
  console.log(`${cond ? '✓' : '✗'} ${name}`);
};

const root = path.join(__dirname, '..');
const routePath = path.join(root, 'src', 'routes', 'clientConfig.js');
const routeSrc = fs.readFileSync(routePath, 'utf8');

// ── روت عمومی باید باشد و rate-limit داشته باشد ─────────────────────────
ok('GET /config عمومی وجود دارد', /router\.get\('\/config'/.test(routeSrc));
ok('GET /config محدودکنندهٔ نرخ دارد', /router\.get\('\/config', configLimiter/.test(routeSrc));

// ── روت ادمین باید احراز هویت + نقش داشته باشد ─────────────────────────
ok('PATCH ادمین adminAuth دارد', /router\.patch\('\/admin\/settings\/client-config', adminAuth/.test(routeSrc));
ok('PATCH ادمین requireRole دارد', /requireRole\(\)/.test(routeSrc));
ok('PATCH ادمین audit دارد', /audit\(req\.admin\.id, 'update_client_config'/.test(routeSrc));
ok('GET ادمین وجود دارد', /router\.get\('\/admin\/settings\/client-config'/.test(routeSrc));

// ── پیش‌فرض‌ها: minVersion برای هر دو پلتفرم ────────────────────────────
ok('پیش‌فرض minVersion اندروید', /minVersion:\s*\{\s*android:\s*'[0-9.]+'/.test(routeSrc));
ok('پیش‌فرض minVersion آی‌او‌اس', /ios:\s*'[0-9.]+'/.test(routeSrc));
ok('forceUpdate پیش‌فرض خاموش', /forceUpdate:\s*\{\s*android:\s*false/.test(routeSrc));
ok('بنر اطلاعیه پیش‌فرض خاموش', /announcement:\s*\{\s*active:\s*false/.test(routeSrc));
ok('پرچم features در merge هست', /features/.test(routeSrc));
ok('سرویس featureFlags وجود دارد',
  fs.existsSync(path.join(root, 'src', 'services', 'featureFlags.js')));

// ── mount در server.js ──────────────────────────────────────────────────
const serverSrc = fs.readFileSync(path.join(root, 'src', 'server.js'), 'utf8');
ok('روت در server.js mount شده', /require\('\.\/routes\/clientConfig'\)/.test(serverSrc));

// ── مایگریشن seed ───────────────────────────────────────────────────────
const mig = fs.readdirSync(path.join(root, 'migrations'))
  .filter(f => f.endsWith('.sql')).sort();
const last = mig[mig.length - 1] || '';
ok(`آخرین مایگریشن، seed پیکربندی است (${last})`, /client_config/.test(last));
const migSrc = fs.readFileSync(path.join(root, 'migrations', last), 'utf8');
ok('seed مقدار client_config دارد', /'client_config'/.test(migSrc));
ok('seed ON CONFLICT DO NOTHING دارد (قابل اجرای دوباره)', /ON CONFLICT \(key\) DO NOTHING/.test(migSrc));

// ── در فهرست npm test هست؟ ──────────────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
ok('testClientConfig در npm test فهرست شده',
  /testClientConfig\.js/.test(pkg.scripts.test));

if (failed > 0) {
  console.error(`\n✗ ${failed} بررسی ناموفق`);
  process.exit(1);
}
console.log('\n✓ همهٔ بررسی‌ها موفق');
