#!/usr/bin/env node
// پلِ بک‌اند به گاردِ «همسانیِ راهنمایِ فیلدها» (فاز ۳.۴). گاردِ اصلی در
// `userweb/tool/admin-hint-parity.mjs` است؛ این فایل فقط صدایش می‌زند تا
// `npm test` بک‌اند هم — مثلِ `testAdminCopyParity` — بدونِ شغلِ userweb بفهمد
// یکی از دو پنل بی‌مستند شده. «گاردِ ثبت‌نشده بدتر از نبودنش است» را از
// تجربهٔ `test:card-box` یاد گرفته‌ایم، پس همان‌جا هم ثبت شده که CI اجرا می‌کند.
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const r = spawnSync(process.execPath, [path.join(root, 'userweb/tool/admin-hint-parity.mjs')],
  { encoding: 'utf8', cwd: root });
const out = `${r.stdout || ''}${r.stderr || ''}`;
if (r.status !== 0) {
  console.error(out);
  console.error('✗ همسانیِ «راهنمایِ فیلدها» (وب ↔ اندروید) شکست');
  process.exit(1);
}
const m = out.match(/✅ (\d+) بررسی/);
if (!m || Number(m[1]) < 100) {
  console.error(out);
  console.error(`✗ گارد فقط ${m ? m[1] : 'هیچ'} بررسی کرد (کف: ۱۰۰) — گاردِ کور سبز نیست`);
  process.exit(1);
}
console.log(`✓ همسانیِ راهنمایِ فیلدها: ${m[1]} بررسی موفق`);
