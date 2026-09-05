/* تستِ واحدِ تصحیحِ پرسپکتیو (فاز ۱) — بدون دیتابیس/تصویر:
   هوموگرافی و مرتب‌سازی چهارگوشه را می‌سنجد.
   node scripts/testCardPerspective.js
*/
const assert = require('assert');
const { _internals } = require('../src/services/cardPerspective');
const { findHomography, orderQuad } = _internals;

let pass = 0;
const ok = (n, c) => { assert.ok(c, n); pass++; };

// ── ۱. هوموگرافیِ همانی روی مستطیل ──
const rect = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 200 }, { x: 0, y: 200 }];
const H = findHomography(rect, rect);
// اعمال روی گوشه‌ها باید همان نقاط را بدهد.
const apply = (m, x, y) => {
  const w0 = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w0, (m[3] * x + m[4] * y + m[5]) / w0];
};
for (const p of rect) {
  const [u, v] = apply(H, p.x, p.y);
  ok(`همانی روی (${p.x},${p.y})`, Math.abs(u - p.x) < 1e-6 && Math.abs(v - p.y) < 1e-6);
}

// ── ۲. ترجمه ──
const shifted = rect.map(p => ({ x: p.x + 30, y: p.y + 12 }));
const H2 = findHomography(rect, shifted);
const [u2, v2] = apply(H2, 50, 80);
ok('ترجمهٔ هوموگرافی', Math.abs(u2 - 80) < 1e-5 && Math.abs(v2 - 92) < 1e-5);

// ── ۳. مرتب‌سازی چهار گوشه (TL,TR,BR,BL) ──
const shuffled = [rect[2], rect[0], rect[3], rect[1]]; // BR, TL, BL, TR
const o = orderQuad(shuffled);
ok('TL شناسایی شد', o[0].x === 0 && o[0].y === 0);
ok('TR شناسایی شد', o[1].x === 100 && o[1].y === 0);
ok('BR شناسایی شد', o[2].x === 100 && o[2].y === 200);
ok('BL شناسایی شد', o[3].x === 0 && o[3].y === 200);

console.log(`\n✅ همهٔ ${pass} تستِ پرسپکتیو سبز شد.`);
