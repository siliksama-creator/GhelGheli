#!/usr/bin/env node
// پلِ بک‌اند به گاردِ «راهنمایِ فیلدها» پنل وب ادمین. گاردِ اصلی در
// `userweb/tool/admin-hint-parity.mjs` است؛ این فایل فقط صدایش می‌زند تا
// `npm test` بک‌اند هم — مثلِ `testAdminCopyParity` — بدونِ شغلِ userweb بفهمد
// پنل وب بی‌راهنما مانده. پنل ادمین اندروید حذف شده
// (docs/ADMIN_PANEL_MOBILE_RETIREMENT.md) پس گارد روی پنل وب است و حجمِ
// راهنماها (۱۱۵+ hint یکتا) را داخل خودِ گارد می‌سنجد؛ این پل فقط حداقلِ
// «گارد کور نباشد» را چک می‌کند.
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const r = spawnSync(process.execPath, [path.join(root, 'userweb/tool/admin-hint-parity.mjs')],
  { encoding: 'utf8', cwd: root });
const out = `${r.stdout || ''}${r.stderr || ''}`;
if (r.status !== 0) {
  console.error(out);
  console.error('✗ راهنماهای پنل وب ادمین شکست');
  process.exit(1);
}
const m = out.match(/✅ (\d+) بررسی/);
if (!m || Number(m[1]) < 5) {
  console.error(out);
  console.error(`✗ گارد فقط ${m ? m[1] : 'هیچ'} بررسی کرد (کف: ۵) — گاردِ کور سبز نیست`);
  process.exit(1);
}
console.log(`✓ راهنماهای پنل وب ادمین: ${m[1]} بررسی موفق`);
