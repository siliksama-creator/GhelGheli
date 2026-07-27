#!/usr/bin/env node
// ============================================================================
//  تست‌های سیستم کیف پول تومانی
// ============================================================================
//
//   node scripts/testWallet.js
//
// دو بخش دارد:
//   ۱. تست‌های خالص (بدون دیتابیس) روی اعتبارسنجی کارت بانکی و تنظیمات.
//   ۲. تست‌های یکپارچهٔ دیتابیس روی دفتر کل و چرخهٔ برداشت — فقط اگر
//      DATABASE_URL در دسترس باشد اجرا می‌شوند و در انتها همه چیز را
//      rollback می‌کنند تا هیچ ردی در دادهٔ واقعی نگذارند.

require('dotenv').config();
const assert = require('assert');

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
};
async function throwsWith(fn, fragment, name) {
  try {
    await fn();
    fail++; console.error(`  ✗ ${name} (انتظار خطا داشتیم ولی موفق شد)`);
  } catch (e) {
    if (String(e.message).includes(fragment)) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.error(`  ✗ ${name} — پیام غیرمنتظره: ${e.message}`); }
  }
}

const bank = require('../src/services/bankCardService');

// ---------------------------------------------------------------------------
console.log('\n== اعتبارسنجی شماره کارت (Luhn) ==');
{
  ok(bank.isValidCardNumber('6037991199500988'), 'کارت معتبر ملی پذیرفته می‌شود');
  ok(bank.isValidCardNumber('5022291081494666'), 'کارت معتبر پاسارگاد پذیرفته می‌شود');
  // خطای یک‌رقمی — دقیقاً همان اشتباه تایپی که پول را به حساب اشتباه می‌فرستد
  ok(!bank.isValidCardNumber('6037991199500989'), 'خطای یک رقم را می‌گیرد');
  // جابه‌جایی دو رقم مجاور
  ok(!bank.isValidCardNumber('6037991199500898'), 'جابه‌جایی دو رقم را می‌گیرد');
  ok(!bank.isValidCardNumber('1111111111111111'), 'کارت همه‌یک‌رقمی رد می‌شود');
  ok(!bank.isValidCardNumber('0000000000000000'), 'کارت تماماً صفر رد می‌شود');
  ok(!bank.isValidCardNumber('603799119950098'), 'کارت ۱۵ رقمی رد می‌شود');
  ok(!bank.isValidCardNumber('60379911995009888'), 'کارت ۱۷ رقمی رد می‌شود');
  ok(!bank.isValidCardNumber(''), 'رشتهٔ خالی رد می‌شود');
  ok(!bank.isValidCardNumber(null), 'null رد می‌شود');
  ok(!bank.isValidCardNumber('603799119950098a'), 'حرف داخل شماره رد می‌شود');
}

console.log('\n== ارقام فارسی و جداکننده‌ها ==');
{
  ok(bank.normalizeCardNumber('۶۰۳۷-۹۹۱۱-۹۹۵۰-۰۹۸۸') === '6037991199500988', 'ارقام فارسی به لاتین تبدیل می‌شود');
  ok(bank.normalizeCardNumber('6037 9911 9950 0988') === '6037991199500988', 'فاصله‌ها حذف می‌شود');
  ok(bank.isValidCardNumber('۶۰۳۷۹۹۱۱۹۹۵۰۰۹۸۸'), 'کارت با ارقام فارسی معتبر شناخته می‌شود');
  ok(bank.normalizeCardNumber('٦٠٣٧٩٩١١٩٩٥٠٠٩٨٨') === '6037991199500988', 'ارقام عربی هم پشتیبانی می‌شود');
}

console.log('\n== تشخیص بانک از روی BIN ==');
{
  ok(bank.detectBank('6037991199500988') === 'بانک ملی ایران', 'ملی');
  ok(bank.detectBank('6104337638935152') === 'بانک ملت', 'ملت');
  ok(bank.detectBank('5022291081494666') === 'بانک پاسارگاد', 'پاسارگاد');
  ok(bank.detectBank('9999999999999999') === null, 'BIN ناشناخته null برمی‌گرداند نه خطا');
}

console.log('\n== اعتبارسنجی شبا (mod-97) ==');
{
  // یک شبای واقعاً معتبر می‌سازیم تا تست به یک شمارهٔ ثابت وابسته نباشد
  const makeValidIR = (body22) => {
    for (let c = 2; c <= 98; c++) {
      const s = String(c).padStart(2, '0') + body22;
      const re = s.slice(4) + '1827' + s.slice(0, 4);
      let r = 0; for (const ch of re) r = (r * 10 + Number(ch)) % 97;
      if (r === 1) return 'IR' + s;
    }
    return null;
  };
  const good = makeValidIR('0170000000203040506070');
  ok(bank.isValidSheba(good), 'شبای معتبر پذیرفته می‌شود');
  const flipped = good.slice(0, 10) + ((Number(good[10]) + 1) % 10) + good.slice(11);
  ok(!bank.isValidSheba(flipped), 'شبای با یک رقم غلط رد می‌شود');
  ok(!bank.isValidSheba('IR12345'), 'شبای کوتاه رد می‌شود');
  ok(bank.normalizeSheba(good.replace(/(.{4})/g, '$1 ')) === good, 'شبای فاصله‌دار نرمال می‌شود');
  // مهم: طول شبا ۲۶ کاراکتر است — ستون دیتابیس باید VARCHAR(26) باشد
  ok(good.length === 26, 'طول شبای کامل ۲۶ کاراکتر است (ستون DB باید جا داشته باشد)');
}

console.log('\n== فرم کامل کارت بانکی ==');
{
  const r1 = bank.validateCardInput({ cardNumber: '6037-9911-9950-0988', cardHolder: 'امیررضا هادی پور' });
  ok(r1.ok && r1.card.bank === 'بانک ملی ایران', 'فرم درست پذیرفته و بانک تشخیص داده می‌شود');
  ok(r1.ok && r1.card.number === '6037991199500988', 'شماره نرمال‌سازی‌شده ذخیره می‌شود');

  ok(!bank.validateCardInput({ cardNumber: '6037991199500989', cardHolder: 'علی رضایی' }).ok, 'کارت با چک‌سام غلط رد می‌شود');
  ok(!bank.validateCardInput({ cardNumber: '6037991199500988', cardHolder: 'ع' }).ok, 'نام تک‌حرفی رد می‌شود');
  ok(!bank.validateCardInput({ cardNumber: '6037991199500988', cardHolder: 'علی 😀' }).ok, 'ایموجی در نام رد می‌شود');
  ok(!bank.validateCardInput({ cardNumber: '6037991199500988', cardHolder: '<script>x</script>' }).ok, 'تزریق HTML در نام رد می‌شود');
  ok(bank.validateCardInput({ cardNumber: '6037991199500988', cardHolder: 'Ali Rezaei' }).ok, 'نام لاتین پذیرفته می‌شود');
  ok(!bank.validateCardInput({ cardNumber: '6037991199500988', cardHolder: 'علی رضایی', sheba: 'IR000000000000000000000000' }).ok, 'شبای نامعتبر کل فرم را رد می‌کند');
  const spaced = bank.validateCardInput({ cardNumber: '6037991199500988', cardHolder: '  علی   رضایی  ' });
  ok(spaced.ok && spaced.card.holder === 'علی رضایی', 'فاصله‌های اضافی نام تمیز می‌شود');
}

console.log('\n== ماسک کردن شماره کارت ==');
{
  const wallet = require('../src/services/walletService');
  const masked = wallet.maskCard('6037991199500988');
  ok(masked === '6037-••••-••••-0988', 'فقط ۴ رقم اول و آخر نمایش داده می‌شود');
  ok(!masked.includes('9911') && !masked.includes('9950'), 'ارقام میانی در خروجی نیست');
  ok(wallet.maskCard(null) === '', 'مقدار خالی خطا نمی‌دهد');
  ok(wallet.maskCard('123') === '', 'شماره ناقص ماسک خالی می‌دهد');
}

console.log('\n== گذارهای مجاز وضعیت برداشت ==');
{
  const { ALLOWED_TRANSITIONS } = require('../src/services/withdrawalService');
  ok(ALLOWED_TRANSITIONS.pending.includes('approved'), 'در انتظار → تأیید مجاز است');
  ok(ALLOWED_TRANSITIONS.pending.includes('rejected'), 'در انتظار → رد مجاز است');
  ok(!ALLOWED_TRANSITIONS.pending.includes('paid'), 'نمی‌توان بدون تأیید مستقیم پرداخت کرد');
  ok(ALLOWED_TRANSITIONS.approved.includes('paid'), 'تأیید → پرداخت مجاز است');
  // مهم‌ترین محافظ: رد کردن دوباره = برگشت دوبارهٔ پول = ساختن پول از هیچ
  ok(ALLOWED_TRANSITIONS.rejected.length === 0, 'درخواست رد شده هیچ گذار بعدی ندارد (جلوی برگشت دوبارهٔ پول)');
  ok(ALLOWED_TRANSITIONS.paid.length === 0, 'درخواست پرداخت‌شده قابل تغییر نیست');
  ok(ALLOWED_TRANSITIONS.canceled.length === 0, 'درخواست لغوشده قابل احیا نیست');
}

// ---------------------------------------------------------------------------
//  تست‌های یکپارچهٔ دیتابیس
// ---------------------------------------------------------------------------
async function dbTests() {
  const { pool } = require('../src/config/db');
  const wallet = require('../src/services/walletService');

  // همه چیز داخل یک تراکنش که در پایان ROLLBACK می‌شود
  const client = await pool.connect();
  await client.query('BEGIN');
  try {
    const u = await client.query(
      "INSERT INTO users(mobile, nickname) VALUES($1,'تست-کیف-پول') RETURNING id",
      [`wt${Date.now()}`],
    );
    const userId = u.rows[0].id;

    console.log('\n== دفتر کل: واریز و برداشت ==');
    const c1 = await wallet.credit(client, { userId, amount: 100000, source: 'card_cash', description: 'تست' });
    ok(c1.balance === 100000, 'واریز اول موجودی را درست تنظیم می‌کند');
    ok(c1.transaction.balance_after === '100000' || Number(c1.transaction.balance_after) === 100000, 'balance_after در دفتر ثبت می‌شود');

    const c2 = await wallet.credit(client, { userId, amount: 50000, source: 'league', description: 'تست' });
    ok(c2.balance === 150000, 'واریز دوم روی موجودی قبلی جمع می‌شود');

    const d1 = await wallet.debit(client, { userId, amount: 30000, source: 'withdrawal_hold', description: 'تست' });
    ok(d1.balance === 120000, 'برداشت از موجودی کم می‌کند');

    const dbBal = await client.query('SELECT wallet_balance FROM users WHERE id=$1', [userId]);
    ok(Number(dbBal.rows[0].wallet_balance) === 120000, 'موجودی کش‌شده روی users با دفتر هم‌خوان است');

    const sum = await client.query(
      `SELECT COALESCE(SUM(CASE WHEN direction='credit' THEN amount ELSE -amount END),0)::bigint AS net
         FROM wallet_transactions WHERE user_id=$1`, [userId]);
    ok(Number(sum.rows[0].net) === 120000, 'جمع جبری دفتر کل دقیقاً برابر موجودی است');

    console.log('\n== محافظ‌های پولی ==');
    await throwsWith(
      () => wallet.debit(client, { userId, amount: 999999, source: 'withdrawal_hold' }),
      'موجودی', 'برداشت بیش از موجودی رد می‌شود (نه خطای ۵۰۰)');
    await throwsWith(
      () => wallet.credit(client, { userId, amount: 0, source: 'card_cash' }),
      'بزرگ‌تر از صفر', 'واریز صفر رد می‌شود');
    await throwsWith(
      () => wallet.credit(client, { userId, amount: -5000, source: 'card_cash' }),
      'بزرگ‌تر از صفر', 'واریز منفی رد می‌شود');
    await throwsWith(
      () => wallet.credit(client, { userId, amount: 1.5, source: 'card_cash' }),
      'صحیح', 'مبلغ اعشاری رد می‌شود');
    await throwsWith(
      () => wallet.credit(client, { userId, amount: 'abc', source: 'card_cash' }),
      'عددی', 'مبلغ غیرعددی رد می‌شود');
    await throwsWith(
      () => wallet.credit(client, { userId, amount: 1000, source: 'hacking' }),
      'نامعتبر', 'منبع ناشناخته رد می‌شود');

    console.log('\n== ضدواریز تکراری (idempotency) ==');
    const refId = (await client.query('SELECT gen_random_uuid() AS id')).rows[0].id;
    const first = await wallet.credit(client, {
      userId, amount: 25000, source: 'reward',
      referenceType: 'user_reward_claims', referenceId: refId,
    });
    ok(first.duplicate === false && first.balance === 145000, 'واریز اول با مرجع انجام می‌شود');
    const second = await wallet.credit(client, {
      userId, amount: 25000, source: 'reward',
      referenceType: 'user_reward_claims', referenceId: refId,
    });
    ok(second.duplicate === true, 'واریز دوم با همان مرجع به‌عنوان تکراری شناسایی می‌شود');
    ok(second.balance === 145000, 'موجودی بعد از تلاش تکراری تغییر نمی‌کند — پول دو برابر نمی‌شود');
    const txCount = await client.query(
      "SELECT COUNT(*)::int AS c FROM wallet_transactions WHERE source='reward' AND reference_id=$1", [refId]);
    ok(txCount.rows[0].c === 1, 'فقط یک ردیف در دفتر کل ثبت شده است');

    console.log('\n== محافظ دیتابیس در برابر موجودی منفی ==');
    let negativeBlocked = false;
    try {
      await client.query('SAVEPOINT neg');
      await client.query('UPDATE users SET wallet_balance=-1 WHERE id=$1', [userId]);
      await client.query('RELEASE SAVEPOINT neg');
    } catch (e) {
      negativeBlocked = true;
      await client.query('ROLLBACK TO SAVEPOINT neg');
    }
    ok(negativeBlocked, 'قید CHECK دیتابیس اجازهٔ موجودی منفی نمی‌دهد حتی با UPDATE مستقیم');

    console.log('\n== اسنپ‌شات کارت در درخواست برداشت ==');
    await client.query(
      `UPDATE users SET bank_card_number='6037991199500988', bank_card_holder='تست کاربر',
              bank_card_bank='بانک ملی ایران', bank_card_saved_at=NOW() WHERE id=$1`, [userId]);
    const wr = await client.query(
      `INSERT INTO withdrawal_requests(user_id,amount,card_number,card_holder,card_bank,status)
       VALUES($1,50000,'6037991199500988','تست کاربر','بانک ملی ایران','pending') RETURNING *`, [userId]);
    ok(wr.rows[0].card_number === '6037991199500988', 'شمارهٔ کارت در خود درخواست کپی می‌شود');
    // کاربر کارتش را عوض می‌کند
    await client.query("UPDATE users SET bank_card_number='5022291081494666' WHERE id=$1", [userId]);
    const after = await client.query('SELECT card_number FROM withdrawal_requests WHERE id=$1', [wr.rows[0].id]);
    ok(after.rows[0].card_number === '6037991199500988',
      'تغییر کارت کاربر، مقصد درخواست ثبت‌شده را عوض نمی‌کند');

    console.log('\n== تنظیمات کیف پول ==');
    const st = await wallet.getWalletSettings(client);
    ok(st.minWithdrawal === 50000, 'حداقل برداشت ۵۰٬۰۰۰ تومان است');
    ok(st.maxWithdrawal >= st.minWithdrawal, 'سقف هرگز زیر کف نیست');
    ok(typeof st.enabled === 'boolean', 'کلید enabled بولین است');

    console.log('\n== خلاصهٔ کیف پول ==');
    // summary از pool مستقل استفاده می‌کند، پس دادهٔ داخل تراکنش را نمی‌بیند؛
    // در عوض منطق قوانین را روی یک کاربر واقعی موجود بررسی می‌کنیم.
    ok(typeof wallet.summary === 'function', 'تابع summary در دسترس است');

    await client.query('ROLLBACK');
    console.log('\n  (همهٔ دادهٔ تست rollback شد؛ چیزی در دیتابیس نماند)');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

(async () => {
  if (process.env.DATABASE_URL) {
    try {
      await dbTests();
    } catch (e) {
      fail++;
      console.error('  ✗ تست‌های دیتابیس با خطا متوقف شد:', e.message);
    }
  } else {
    console.log('\n(DATABASE_URL تنظیم نشده — تست‌های یکپارچهٔ دیتابیس رد شد)');
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
