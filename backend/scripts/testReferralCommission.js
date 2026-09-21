#!/usr/bin/env node
// گاردِ کمیسیونِ خریدِ معرفی — «دعوت کن، دوستت خرید کند، پول به معرف برسد».
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این تست وجود ندارد… داشت؟ نه. دقیقاً همین مشکل بود: هیچ تستی برای
// زنجیرهٔ کمیسیونِ خرید وجود نداشت (مالک: «کلی قسمت‌های ریز که ممکنه اصلاً
// براشون تست نبوده باشه»). زنجیره چهار حلقه دارد:
//   ۱. ثبت‌نام با کد دعوت → referred_by (routes/auth.js → attachReferrer)
//   ۲. خریدِ تأییدشدهٔ درگاهی → payPurchaseCommission داخل همان تراکنش
//   ۳. سندِ یکتای کمیسیون (purchase_referral_commissions) جلوی پرداختِ دوباره
//   ۴. credit کیف پول معرف با source='purchase_referral'
// این گارد حلقه‌های ۲-۴ را ایستا و (در jobِ e2e که دیتابیس هست) پویا می‌سنجد.
//
// تصمیمِ مالک که عمداً حفظ شده: سهمِ پرداخت‌شده از کیف پول کمیسیون‌پذیر
// نیست؛ فقط بخشِ واقعاً پرداخت‌شده به درگاه مبناست (shopService).
const fs = require('fs');
const path = require('path');

let pass = 0; const fail = [];
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail.push(name); console.error(`  ✗ ${name}`); } };
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const shop = read('src/services/shopService.js');
const referral = read('src/services/referralService.js');
const auth = read('src/routes/auth.js');
const ops = read('src/services/opsLimits.js');

console.log('\n== ۱. زنجیرهٔ ایستا ==');
ok(/attachReferrer/.test(auth), 'ثبت‌نام کدِ دعوت را به referred_by وصل می‌کند');
ok(/const commissionable = Math\.max\(\s*0, \(Number\(amount\) \|\| Number\(item\.price\)\) - \(Number\(walletPaid\) \|\| 0\),?\s*\)/.test(shop),
  'مبنای کمیسیونِ آیتم = قیمت منهای سهمِ کیف پول');
ok(/payPurchaseCommission\(client, \{\s*buyerId: userId,\s*purchaseType: 'shop_item'/.test(shop),
  'خریدِ آیتم کمیسیون را داخل تراکنش صدا می‌زند');
ok(/payPurchaseCommission\(client, \{\s*buyerId: userId,\s*purchaseType: cycle === 'annual' \? 'plus_annual' : 'plus_monthly'/.test(shop),
  'خریدِ پلاس هم کمیسیون دارد');
ok(/ON CONFLICT\(purchase_type, purchase_reference_id\) DO NOTHING/.test(referral),
  'سندِ یکتای کمیسیون جلوی پرداختِ دوباره را می‌گیرد');
ok(/source: 'purchase_referral'/.test(referral), 'واریز به کیف پول معرف با source اختصاصی');
ok(/referralPurchaseCommissionPercent: 5,/.test(ops), 'نرخِ پیش‌فرض ۵٪ است (صفر نیست)');

async function runtime() {
  let db;
  try { db = require('../src/config/db'); } catch { return; }
  const canConnect = await db.pool.query('SELECT 1').then(() => true).catch(() => false);
  if (!canConnect) { console.log('\n(دیتابیس در دسترس نیست — بخشِ پویا رد شد)'); return; }
  const referrals = require('../src/services/referralService');
  const suffix = Math.floor(Math.random() * 90000 + 10000);
  // setupCommit: کاربرها باید برای اتصالِ تراکنشِ کمیسیون دیده شوند.
  const a = await db.pool.query(
    `INSERT INTO users(mobile, status) VALUES($1,'active') RETURNING id`, [`912998${suffix}`]);
  const b = await db.pool.query(
    `INSERT INTO users(mobile, status, referred_by) VALUES($1,'active',$2) RETURNING id`,
    [`912997${suffix}`, a.rows[0].id]);
  const referrerId = a.rows[0].id, buyerId = b.rows[0].id;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const ref = `guard-${suffix}`;
    const first = await referrals.payPurchaseCommission(client, {
      buyerId, purchaseType: 'shop_item', purchaseReferenceId: ref,
      purchaseAmount: 10000, gatewayProvider: 'guard',
    });
    ok(first && first.earned === 500, 'کمیسیونِ خریدِ ۱۰۰۰ = ۵۰ تومان (۵٪)');
    const tx = await client.query(
      `SELECT source FROM wallet_transactions WHERE user_id=$1 AND source='purchase_referral'`, [referrerId]);
    ok(tx.rows.length === 1, 'تراکنشِ کیف پولِ معرف داخل همان تراکنش ثبت شد');
    const second = await referrals.payPurchaseCommission(client, {
      buyerId, purchaseType: 'shop_item', purchaseReferenceId: ref,
      purchaseAmount: 10000, gatewayProvider: 'guard',
    });
    ok(second && second.duplicate === true && second.earned === 0,
      'تکرارِ همان خرید پولِ دوباره نمی‌سازد (ایدمپوتنسی)');
    const noRef = await referrals.payPurchaseCommission(client, {
      buyerId: referrerId, purchaseType: 'shop_item', purchaseReferenceId: `guard2-${suffix}`,
      purchaseAmount: 10000, gatewayProvider: 'guard',
    });
    ok(noRef === null, 'خریدِ بدونِ معرف کمیسیون نمی‌سازد');
  } finally {
    // همه‌چیز برگشت می‌خورد؛ فقط کاربرهای setup بیرونِ تراکنش ساخته شدند.
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    await db.pool.query(`DELETE FROM users WHERE id=ANY($1::uuid[])`, [[referrerId, buyerId]]).catch(() => {});
  }
}

runtime().then(() => {
  if (fail.length) { console.error(`\n✗ گاردِ کمیسیون شکست: ${fail.length} مورد`); process.exit(1); }
  console.log(`\n✅ ${pass} بررسیِ کمیسیونِ معرفی موفق`);
}).catch(e => { console.error('گاردِ کمیسیون خطا خورد:', e.message); process.exit(1); });
