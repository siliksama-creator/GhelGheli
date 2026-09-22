#!/usr/bin/env node
/**
 *manifest خودکارِ endpointها — منبعِ حقیقت: خودِ routeها.
 *
 * چرا: ممیزیِ ۸ مهر ۱۴۰ نشان داد ۲۲۳ endpoint دستی شمارش می‌شدند و
 * هیچ فهرستِ رسمی‌ای نبود؛ ابزارها و ایجنت‌ها مجبور بودند grep کنند.
 * حالا این اسکریپت از خودِ کد (router.METHOD در routes/ + app.METHOD
 * اینلاین در server.js + پیشوندِ mount هر فایل از server.js) فهرست
 * می‌سازد و CI با `--check` جلوی drift را می‌گیرد: اگر کسی route اضافه
 * یا کم کند و manifest را نو نکند، CI قرمز می‌شود.
 *
 * مصرف:
 *   node scripts/genApiManifest.js            # نوشتنِ manifest
 *   node scripts/genApiManifest.js --check    # فقط مقایسه (exit 1 = drift)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const ROUTES = path.join(SRC, 'routes');
const SERVER = path.join(SRC, 'server.js');
const OUT = path.join(ROOT, 'docs', 'api-manifest.json');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const serverSrc = fs.readFileSync(SERVER, 'utf8');

// پیشوندِ mount هر فایلِ route از خودِ server.js خوانده می‌شود تا هیچ
// فرضِ سخت‌کدشده‌ای دربارهٔ سبکِ mount نباشد.
const mounts = {};
for (const m of serverSrc.matchAll(/app\.use\(\s*'([^']+)'\s*,\s*require\(\s*'\.\/routes\/([^']+)'\s*\)/g)) {
  mounts[m[2]] = m[1];
}

const endpoints = [];
for (const file of walk(ROUTES)) {
  const rel = path.relative(ROUTES, file).replace(/\\/g, '/').replace(/\.js$/, '');
  const prefix = mounts[rel] ?? mounts[rel.replace(/\/index$/, '')];
  if (prefix === undefined) continue; // فایلِ route باید در server.js mount شده باشد
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
    endpoints.push({ method: m[1].toUpperCase(), path: prefix + m[2], source: 'routes/' + rel + '.js' });
  }
}
for (const m of serverSrc.matchAll(/app\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
  endpoints.push({ method: m[1].toUpperCase(), path: m[2], source: 'server.js' });
}
endpoints.sort((a, b) => (a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)));

const manifest = {
  note: 'تولیدِ خودکار — دستی ویرایش نکنید؛ node scripts/genApiManifest.js',
  count: endpoints.length,
  endpoints,
};
const json = JSON.stringify(manifest, null, 1) + '\n';

if (process.argv.includes('--check')) {
  let cur = '';
  try { cur = fs.readFileSync(OUT, 'utf8'); } catch { cur = ''; }
  if (cur !== json) {
    console.error('✗ api-manifest.json با routeها هم‌خوان نیست — node scripts/genApiManifest.js را اجرا و کامیت کنید');
    process.exit(1);
  }
  console.log(`✓ manifest هم‌خوان است (${endpoints.length} endpoint)`);
  process.exit(0);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, json);
console.log(`✓ api-manifest.json نوشته شد (${endpoints.length} endpoint)`);
