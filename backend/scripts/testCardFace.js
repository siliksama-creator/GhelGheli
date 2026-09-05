/* تستِ سرویس بردار چهره (فاز ۳): sanitize + نرمال + بُعد.
   بدون دیتابیس: node scripts/testCardFace.js */
const assert = require('assert');
const face = require('../src/services/cardFace');

let pass = 0;
const ok = (name, cond) => { assert.ok(cond, name); pass++; };

const raw = Array.from({ length: face.FACE_DIM }, (_, i) => Math.cos(i) * 2);
const s = face.sanitizeFaceEmbedding(raw);
ok('بردار چهرهٔ معتبر پذیرفته شد', s && Array.isArray(s.v) && s.version === face.FACE_VERSION);
let nrm = 0; for (const x of s.v) nrm += x * x;
ok('بردار چهره L2 نرمال شد', Math.abs(nrm - 1) < 1e-6);

ok('رشتهٔ خراب → null', face.sanitizeFaceEmbedding('nope') === null);
ok('بُعد غلط (۱۲۸۰ بردار کارت) → null', face.sanitizeFaceEmbedding(new Array(1280).fill(0.1)) === null);
ok('بردار چهرهٔ صفر → null', face.sanitizeFaceEmbedding(new Array(face.FACE_DIM).fill(0)) === null);
ok('المان غیرعددی → null', face.sanitizeFaceEmbedding(new Array(face.FACE_DIM).fill('x')) === null);
ok('JSON رشته‌ای معتبر پذیرفته شد', face.sanitizeFaceEmbedding(JSON.stringify(raw)) !== null);

console.log(`\n✅ همهٔ ${pass} تستِ سرویس چهره سبز شد.`);
