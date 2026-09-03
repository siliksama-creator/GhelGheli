#!/usr/bin/env node
// پلِ بک‌اند به گاردِ «همسانیِ دو پنل». گاردِ اصلی در `userweb/tool/admin-copy-parity.mjs`
// است (هم‌خانواده با بقیهٔ گاردهایِ کلاینت‌ها)؛ این فایل فقط صدایش می‌زند تا
// `npm test` بک‌اند هم — مثلِ `testLiveWiring` — بدونِ شغلِ userweb بفهمد
// دو پنل از هم فاصله گرفته‌اند. یک گاردِ ثبت‌نشده بدتر از نبودنش است:
// اطمینانِ کاذب می‌دهد (تجربهٔ تلخِ `test:card-box`).
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const r = spawnSync(process.execPath, [path.join(root, 'userweb/tool/admin-copy-parity.mjs')],
  { encoding: 'utf8', cwd: root });
const out = `${r.stdout || ''}${r.stderr || ''}`;
if (r.status !== 0) {
  console.error(out);
  console.error('✗ همسانیِ پنلِ متن‌ها (وب ↔ اندروید) شکست');
  process.exit(1);
}
const m = out.match(/✅ (\d+) بررسی/);
if (!m || Number(m[1]) < 15) {
  console.error(out);
  console.error(`✗ گارد فقط ${m ? m[1] : 'هیچ'} بررسی کرد (کف: ۱۵) — گاردِ کور سبز نیست`);
  process.exit(1);
}
console.log(`✓ همسانیِ پنلِ متن‌ها: ${m[1]} بررسی موفق`);
