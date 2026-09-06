/* تستِ لایهٔ بردارِ عصبی: sanitize + نرمال + فیوژنِ متن/بردار.
   بدون دیتابیس اجرا می‌شود: node scripts/testCardEmbedding.js
*/
const assert = require('assert');
const emb = require('../src/services/cardEmbedding');
const ci = require('../src/services/cardIdentity');

let pass = 0;
const ok = (name, cond) => { assert.ok(cond, name); pass++; };

// ── ۱. sanitize: بردار معتبر نرمال می‌شود ──
const raw = Array.from({ length: emb.EMBED_DIM }, (_, i) => Math.sin(i) * 3);
const s = emb.sanitizeEmbedding(raw);
ok('بردار معتبر پذیرفته شد', s && Array.isArray(s.v) && s.version === emb.EMBEDDING_VERSION);
let nrm = 0; for (const x of s.v) nrm += x * x;
ok('بردار L2 نرمال شد', Math.abs(nrm - 1) < 1e-6);

// ── ۲. ورودیِ بد رد می‌شود ──
ok('رشتهٔ خراب → null', emb.sanitizeEmbedding('not json') === null);
ok('بُعد غلط → null', emb.sanitizeEmbedding([1, 2, 3]) === null);
ok('آبجکت → null', emb.sanitizeEmbedding({ a: 1 }) === null);
ok('بردار صفر → null', emb.sanitizeEmbedding(new Array(emb.EMBED_DIM).fill(0)) === null);
ok('المان غیرعددی → null', emb.sanitizeEmbedding(new Array(emb.EMBED_DIM).fill('x')) === null);
ok('رشتهٔ JSON معتبر پذیرفته شد', emb.sanitizeEmbedding(JSON.stringify(raw)) !== null);

// ── ۳. فیوژن: بردارِ نزدیک و متنِ نامطمئن → قاطع؛ بردارِ دور → قاطع غلط نمی‌دهد ──
// دو طرح با بردارهای متعامد؛ کوئری فقط بردار دارد.
const v1 = new Array(emb.EMBED_DIM).fill(0); v1[0] = 1;
const v2 = new Array(emb.EMBED_DIM).fill(0); v2[1] = 1;
const V = emb.EMBEDDING_VERSION;
const designs = [
  { id: 'd1', card_type_id: 'c1', embedding: v1, embeddingVersion: V, playerLexemes: ['Ronaldo'] },
  { id: 'd2', card_type_id: 'c2', embedding: v2, embeddingVersion: V, playerLexemes: ['Messi'] },
];
// کوئری کاملاً شبیه d1
const r1 = ci.rankIdentity({ textTokens: [], embedding: v1, embeddingVersion: V }, designs);
ok('بردارِ منطبق رتبهٔ اول است', r1.design && r1.design.id === 'd1');
ok('بردارِ متعامدِ دوم با حاشیه قاطع است', r1.found === true);
// کوئریِ بدون بردار و بدون متن → هیچ هویتی
const r0 = ci.rankIdentity({ textTokens: [], embedding: null }, designs);
ok('بدون سیگنال → found=false', r0.found === false);
// نسخهٔ متفاوت → بردار نادیده گرفته می‌شود
const rV = ci.rankIdentity({ textTokens: [], embedding: v1, embeddingVersion: V - 1 }, designs);
ok('نسخهٔ بردارِ متفاوت → هویت با بردار قاطع نیست', rV.found === false);
// بردارِ نیمه‌بینابین (حاشیهٔ بسیار کم، دو بازیکن هم‌فاصله) → قاطع نمی‌شود
const vmid = new Array(emb.EMBED_DIM).fill(0); vmid[0] = 1; vmid[1] = 0.97;
const rm = ci.rankIdentity({ textTokens: [], embedding: vmid, embeddingVersion: V }, designs);
ok('بردارِ بینابین حاشیهٔ کم دارد (< 0.05)', rm.margin < 0.05);
ok('بردارِ بینابین قاطع نمی‌شود', rm.found === false);

console.log(`\n✅ همهٔ ${pass} تستِ لایهٔ بردار سبز شد.`);

// ── حاشیه نسبت به بازیکنِ دیگر است، نه واریانتِ همان بازیکن ──
{
  const v3 = new Array(emb.EMBED_DIM).fill(0); v3[0] = 0.99; v3[1] = 0.1; // شبیه d1
  const designs2 = [
    { id: 'd1', card_type_id: 'c1', embedding: v1, embeddingVersion: V, playerLexemes: ['Ronaldo'], playerNumber: '7' },
    // واریانتِ نقره‌ایِ همان بازیکن: برداری به‌شدت نزدیک به d1
    { id: 'd1-silver', card_type_id: 'c1s', embedding: v3, embeddingVersion: V, playerLexemes: ['Ronaldo'], playerNumber: '7' },
    { id: 'd2', card_type_id: 'c2', embedding: v2, embeddingVersion: V, playerLexemes: ['Messi'], playerNumber: '10' },
  ];
  const r = ci.rankIdentity({ textTokens: [], embedding: v1, embeddingVersion: V }, designs2);
  ok('واریانتِ همان بازیکن رقیب حساب نمی‌شود (حاشیه تا بازیکن دیگر)', r.found === true && r.margin > 0.3,
    `found=${r.found} margin=${r.margin.toFixed(3)}`);
}
