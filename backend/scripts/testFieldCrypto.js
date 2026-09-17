#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  آزمونِ رمزگذاریِ فیلدهای مالی (شمارهٔ کارت / شبا / حسابِ قدیمی)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * خواستهٔ مالک: «رمزگذاریِ شماره کارت/شبا — اطلاعات مالی کاربران».
 *
 * چهار لایه:
 *
 *   ۱. **رفتارِ رمز**: رفت‌وبرگشت، تشخیصِ دست‌کاری، سازگاری با مقدارهای قدیمی
 *      (متنِ ساده)، بی‌خطر بودنِ اجرای دوباره، چرخشِ کلید، و اینکه کلیدِ
 *      نداشته هرگز دادهٔ غلط تولید نکند.
 *
 *   ۲. **مسیرهای واقعیِ نوشتن/خواندن**: با دیتابیسِ جعلی، همان توابعی که
 *      کاربر و ادمین صدا می‌زنند اجرا می‌شوند و سنجیده می‌شود که آنچه به
 *      ستون می‌رود رمزشده است و آنچه به کاربر/ادمین می‌رسد متنِ ساده است.
 *
 *   ۳. **قراردادِ کد**: هر جای پروژه که این ستون‌ها خوانده/نوشته می‌شوند باید
 *      از رمزگشا/رمزگذار بگذرند. اگر فردا مسیرِ تازه‌ای اضافه شود و کسی
 *      این کار را نکند، آزمون قرمز می‌شود.
 *
 *   ۴. **نشت**: هیچ متنِ رمزشده‌ای (`enc:v1:`) نباید در پاسخِ API دیده شود و
 *      هیچ شمارهٔ کارتی نباید بی‌رمز در ستون بنشیند.
 *
 * بدونِ دیتابیس و بدونِ شبکه اجرا می‌شود.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
};

// ⚠️ کلید باید **پیش از** بارکردنِ ماژول باشد (ماژول یک بار می‌خواند و کش
// می‌کند). این کلیدِ آزمون است و هیچ ربطی به کلیدِ سرور ندارد.
const TEST_KEY = 'a'.repeat(63) + 'f';
process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
}
function stub(modulePath, exports) {
  const id = require.resolve(modulePath);
  const prev = require.cache[id];
  require.cache[id] = { id, filename: id, loaded: true, exports };
  return () => { if (prev) require.cache[id] = prev; else delete require.cache[id]; };
}
const UUID = '11111111-1111-4111-8111-111111111111';
// کارت و شبای آزمایشیِ **معتبر** (چک‌سامِ Luhn و mod-97 درست) — با
// `bankCardService` تولید شدند تا اعتبارسنجیِ واقعی مسیر را رد نکند.
const CARD = '6037990000000006';          // بانک ملی
const CARD_MASK = '6037-••••-••••-0006';
const SHEBA = 'IR820540102680020817900013';
const SHEBA_MASK = 'IR8205••••0013';

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n۱) خودِ رمز (AES-256-GCM)');
const fc = require('../src/lib/fieldCrypto');
{
  const c = fc.encrypt(CARD);
  ok(c.startsWith('enc:v1:'), 'مقدارِ رمزشده پیشوندِ نسخه دارد');
  ok(c !== CARD && !c.includes(CARD), 'شمارهٔ کارت در متنِ رمزشده دیده نمی‌شود');
  ok(fc.decrypt(c) === CARD, 'رفت‌وبرگشت درست است');
  ok(fc.encrypt(c) === c, 'مقدارِ رمزشده دوباره رمز نمی‌شود (اجرای دوبارهٔ مهاجرت بی‌خطر)');
  ok(fc.decrypt(CARD) === CARD, 'مقدارِ قدیمیِ متنِ ساده همان‌طور برگردانده می‌شود');

  // دو بار رمز کردنِ یک مقدار ⇒ دو متنِ متفاوت (IV تصادفی) ولی هر دو درست
  const c2 = fc.encrypt(CARD);
  ok(c2 !== c, 'هر بار IV تصادفی است (دو کاربر با کارتِ یکسان، متنِ یکسان ندارند)');
  ok(fc.decrypt(c2) === CARD, 'متنِ دوم هم درست باز می‌شود');

  // دست‌کاریِ یک بایت ⇒ باید شکست بخورد، نه اینکه دادهٔ غلط بدهد
  const tampered = c.slice(0, -4) + (c.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  ok(fc.decrypt(tampered) === null, 'دادهٔ دست‌کاری‌شده باز نمی‌شود (null، نه دادهٔ غلط)');

  // کلیدِ اشتباه
  process.env.FIELD_ENCRYPTION_KEY = 'b'.repeat(64);
  fc.resetKeyCache();
  ok(fc.decrypt(c) === null, 'با کلیدِ اشتباه، مقدار باز نمی‌شود');
  process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
  fc.resetKeyCache();
  ok(fc.decrypt(c) === CARD, 'با کلیدِ درست دوباره باز می‌شود');

  // چرخشِ کلید: کلیدِ قبلی فقط برای بازکردن
  const oldKey = fc.generateKey();
  process.env.FIELD_ENCRYPTION_KEY = oldKey;
  fc.resetKeyCache();
  const withOld = fc.encrypt(CARD);
  process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
  process.env.FIELD_ENCRYPTION_KEY_OLD = oldKey;
  fc.resetKeyCache();
  ok(fc.decrypt(withOld) === CARD, 'با کلیدِ قبلی (چرخشِ کلید) مقدار باز می‌شود');
  ok(fc.encrypt(CARD) !== withOld, 'مقدارِ تازه با کلیدِ جدید رمز می‌شود');
  delete process.env.FIELD_ENCRYPTION_KEY_OLD;
  fc.resetKeyCache();

  // ماسک‌ها
  ok(fc.maskedCard(c) === CARD_MASK, 'ماسکِ کارت: فقط ۴ رقم اول و آخر');
  ok(fc.maskedSheba(fc.encrypt(SHEBA)) === SHEBA_MASK, 'ماسکِ شبا درست است');
  ok(fc.maskedCard(null) === null && fc.maskedCard('123') === null,
    'مقدارِ خالی/ناقص ماسک نمی‌شود (به‌جای رشتهٔ بی‌معنا، null)');

  // کلیدِ نامعتبر نباید برنامه را بشکند، فقط باید متنِ ساده بماند
  process.env.FIELD_ENCRYPTION_KEY = 'کوتاه';
  fc.resetKeyCache();
  const s = fc.status();
  ok(s.enabled === false, 'کلیدِ نامعتبر = رمزگذاری غیرفعال (و هشدار در لاگ)');
  ok(fc.encrypt(CARD) === CARD, 'بدونِ کلیدِ معتبر، مقدار همان‌طور می‌ماند (نه خرابیِ داده)');
  process.env.FIELD_ENCRYPTION_KEY = TEST_KEY;
  fc.resetKeyCache();
  ok(fc.status().enabled === true, 'با کلیدِ درست دوباره فعال می‌شود');
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n۲) مسیرهای واقعی (دیتابیسِ جعلی)');
async function behavior() {
  // ── دیتابیسِ جعلیِ کوچک: هر کوئری را می‌شناسد و پارامترها را ثبت می‌کند ──
  const written = {};           // ستون → مقداری که نوشته شد
  const userRow = {
    id: UUID, wallet_balance: 500000,
    bank_card_number: null, bank_card_holder: null, bank_card_sheba: null,
    bank_card_bank: null, bank_card_saved_at: null,
  };
  // ── یک دستگیرهٔ مشترک برای `pool.query` و `client.query` ──
  //
  // چرا مشترک: بعضی مسیرها با اتصالِ تراکنشی کار می‌کنند (ثبتِ درخواست) و
  // بعضی با pool (ذخیرهٔ کارت). اگر دو نسخهٔ جدا بنویسیم، تست می‌تواند سبز
  // شود در حالی که یکی از دو مسیر واقعاً رمز نمی‌کند.
  async function handleQuery(sql, params = []) {
    const q = String(sql).replace(/\s+/g, ' ').trim();
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(q)) return { rows: [] };
    if (q.startsWith('SELECT wallet_balance, bank_card_number')) {
      return { rows: [{ ...userRow }] };
    }
    if (q.startsWith('SELECT wallet_balance FROM users')) {
      return { rows: [{ wallet_balance: Number(userRow.wallet_balance || 0) }] };
    }
    if (q.startsWith('UPDATE users SET wallet_balance')) {
      userRow.wallet_balance = Number(params[0]);
      return { rows: [{ ...userRow }] };
    }
    if (q.startsWith('INSERT INTO wallet_transactions')) {
      return { rows: [{ id: 'tx-1' }] };
    }
    if (q.startsWith('SELECT COUNT(*)')) {
      // دو کوئریِ متفاوتِ شمارشی: «درخواست‌های در جریان» و «خلاصهٔ برداشت».
      return { rows: [{ c: 0, amount: 0 }] };
    }
    if (q.startsWith('UPDATE users SET bank_card_number')) {
      userRow.bank_card_number = params[0];
      userRow.bank_card_holder = params[1];
      userRow.bank_card_sheba = params[2];
      userRow.bank_card_bank = params[3];
      userRow.bank_card_saved_at = new Date();
      written.card = params[0]; written.sheba = params[2];
      return { rows: [{ ...userRow }] };
    }
    if (q.startsWith('INSERT INTO withdrawal_requests')) {
      written.snapshotCard = params[2]; written.snapshotSheba = params[4];
      return { rows: [{ id: 'w-1', amount: params[1], card_number: params[2],
        card_holder: params[3], card_sheba: params[4], card_bank: params[5],
        status: 'pending', timeline: [] }] };
    }
    if (q.startsWith('SELECT COALESCE(SUM(amount)')) {
      return { rows: [{ total_in: 0, total_out: 0, tx_count: 0 }] };
    }
    if (q.startsWith('SELECT key, value FROM app_settings')) return { rows: [] };
    if (q.includes('FROM withdrawal_requests w')) {
      return { rows: [{
        id: 'w-1', user_id: UUID, amount: 100000, status: 'pending',
        card_number: written.snapshotCard, card_holder: 'علی رضایی',
        card_sheba: written.snapshotSheba, card_bank: 'بانک ملی',
        mobile: '09120000000', nickname: 'x', first_name: 'علی', last_name: 'رضایی',
        wallet_balance: 0, timeline: [],
      }] };
    }
    if (q.startsWith('SELECT COUNT(*)::int AS c, COALESCE')) {
      return { rows: [{ c: 0, amount: 0 }] };
    }
    if (process.env.TEST_DEBUG_SQL) console.log('   [sql] ' + q.slice(0, 90));
    return { rows: [] };
  }

  const client = { query: handleQuery, release: () => {} };
  const poolStub = { query: handleQuery, connect: async () => client };

  const restoreDb = stub('../src/config/db', { pool: poolStub });

  const wallet = require('../src/services/walletService');
  const wd = require('../src/services/withdrawalService');

  // ── ذخیرهٔ کارت: آنچه به دیتابیس می‌رود باید رمزشده باشد ──
  const saved = await wd.saveBankCard(UUID, {
    cardNumber: CARD, cardHolder: 'علی رضایی', sheba: SHEBA,
  });
  ok(written.card?.startsWith('enc:v1:'), 'شمارهٔ کارتِ ذخیره‌شده در دیتابیس رمزشده است');
  ok(written.sheba?.startsWith('enc:v1:'), 'شبا رمزشده ذخیره می‌شود');
  ok(!JSON.stringify(written).includes(CARD), 'متنِ سادهٔ کارت هیچ‌جای نوشتن‌ها نیست');
  ok(saved.maskedNumber === CARD_MASK,
    'پاسخ وری‌برگشتی به کاربر ماسکِ درست دارد (بازکردن پیش از ماسک)');
  ok(saved.sheba === SHEBA_MASK, 'شبای ماسک‌شده درست برمی‌گردد');

  // ── خواندنِ کیف پول (کاربر باید ماسک ببیند، نه متنِ رمزشده) ──
  const summary = await wallet.summary(UUID);
  ok(summary.card?.maskedNumber === CARD_MASK,
    'خلاصهٔ کیف پول کارت را ماسک‌شده نشان می‌دهد');
  ok(summary.card?.sheba === SHEBA_MASK, 'شبا در خلاصهٔ کیف پول ماسک‌شده است');
  ok(!JSON.stringify(summary).includes('enc:v1:'),
    'هیچ متنِ رمزشده‌ای در پاسخِ کیف پول به کاربر نیست');
  ok(!JSON.stringify(summary).includes(CARD) && !JSON.stringify(summary).includes(SHEBA),
    'شمارهٔ کامل کارت/شبا هرگز به کاربر نمی‌رسد');

  // ── ثبتِ درخواستِ برداشت: اسنپ‌شات هم باید رمز باشد ──
  const req = await wd.createRequest(UUID, 100000);
  ok(written.snapshotCard?.startsWith('enc:v1:'),
    'اسنپ‌شاتِ کارت در درخواستِ برداشت هم رمزشده است');
  ok(written.snapshotSheba?.startsWith('enc:v1:'), 'شبای اسنپ‌شات رمزشده است');
  ok(req.cardMasked === CARD_MASK,
    'پاسخِ درخواست به کاربر کارت را ماسک‌شده نشان می‌دهد');

  // ── فهرستِ ادمین: متنِ ساده، چون مدیر باید واریز کند ──
  const adminList = await wd.listForAdmin({});
  ok(adminList[0]?.cardNumber === CARD,
    'ادمین شمارهٔ کامل را می‌بیند (فقط برای واریز، پشتِ adminAuth)');
  ok(adminList[0]?.cardSheba === SHEBA, 'ادمین شبا را کامل می‌بیند');
  ok(adminList[0]?.cardMasked === CARD_MASK,
    'نسخهٔ ماسک‌شده هم در همان ردیف درست است');
  ok(adminList[0]?.cardNumber?.startsWith('enc:v1:') === false,
    'ادمین هیچ‌وقت متنِ رمزشده نمی‌بیند');

  restoreDb();
}
const behaviorPromise = behavior();

// ═══════════════════════════════════════════════════════════════════════════
behaviorPromise.then(() => {
  console.log('\n۳) قراردادِ کد: هیچ مسیرِ خواندن/نوشتنی بدونِ رمز نماند');
  {
    // ستون‌های مالی و فایل‌هایی که مسئولِ آن‌ها هستند.
    const FILES = [
      ['src/services/walletService.js', 'خواندنِ کارت برای نمایش'],
      ['src/services/withdrawalService.js', 'ذخیره/خواندنِ کارت و اسنپ‌شات'],
      ['src/routes/adminUsers.js', 'فهرستِ ادمین'],
      ['src/routes/adminLeague.js', 'جوایزِ لیگ'],
      ['src/routes/auth.js', 'ثبت‌نام'],
      ['src/server.js', 'پروفایل و اعلانِ کیف پول'],
    ];
    for (const [file, why] of FILES) {
      const src = stripComments(read(...file.split('/')));
      ok(src.includes("require('../lib/fieldCrypto')") || src.includes("require('./lib/fieldCrypto')"),
        `${file} رمزگذار/رمزگشا را می‌شناسد (${why})`);
    }

    // هر خطی که این ستون‌ها را می‌خواند و به کاربر می‌دهد، باید رمزگشا بزند.
    // (سه فایلی که ستون را بی‌واسطه دست می‌زنند.)
    const wd = stripComments(read('src', 'services', 'withdrawalService.js'));
    ok(wd.includes('fieldCrypto.encrypt(v.card.number)'), 'شمارهٔ کارت پیش از ذخیره رمز می‌شود');
    ok(wd.includes('fieldCrypto.encrypt(cardSheba)'), 'شبای اسنپ‌شات رمز می‌شود');
    ok(wd.includes('wallet.maskCard(fieldCrypto.decrypt(row.card_number))'),
      'ماسکِ کارت روی مقدارِ بازشده حساب می‌شود (باگی که باگ می‌شد)');
    ok(wd.includes('fieldCrypto.decrypt(r.card_number)'),
      'فهرستِ ادمین مقدار را باز می‌کند');

    const walletSrc = stripComments(read('src', 'services', 'walletService.js'));
    ok(walletSrc.includes('fieldCrypto.decrypt(user.bank_card_number)'),
      'خلاصهٔ کیف پول مقدار را باز می‌کند');

    const serverSrc = stripComments(read('src', 'server.js'));
    ok(serverSrc.includes("fieldCrypto.encrypt(boundedText(b.bankAccount, 40))"),
      'ذخیرهٔ حسابِ قدیمی رمز می‌شود');
    ok(serverSrc.includes('bank_account: rest.bank_account ? fieldCrypto.decrypt'),
      'پاسخِ پروفایل، حسابِ قدیمی را باز می‌کند');

    // مایگریشن: ستون باید به‌قدرِ کافی بلند باشد (متنِ رمزشده ~۶۷ کاراکتر)
    const mig = read('migrations', '090_encrypt_financial_fields.sql');
    ok(/bank_card_number TYPE VARCHAR\(160\)/.test(mig), 'ستونِ کارت برای مقدارِ رمزشده پهن شد');
    ok(/bank_card_sheba\s+TYPE VARCHAR\(200\)/.test(mig), 'ستونِ شبا پهن شد');
    ok(/DROP CONSTRAINT IF EXISTS users_bank_card_number_digits/.test(mig),
      'قیدِ «فقط ۱۶ رقم» برداشته شد (وگرنه نوشتنِ رمزشده خطا می‌داد)');
    ok(/DROP CONSTRAINT IF EXISTS users_bank_card_sheba_format/.test(mig),
      'قیدِ قالبِ شبا برداشته شد');

    // ابزارِ مهاجرتِ داده‌ها
    const tool = read('scripts', 'encrypt-existing-fields.js');
    ok(/--apply/.test(tool) && /const APPLY = args.has\('--apply'\)/.test(tool),
      'ابزارِ مهاجرت پیش‌فرض چیزی نمی‌نویسد (--apply لازم است)');
    ok(/NOT LIKE 'enc:v1:%'/.test(tool),
      'ابزارِ مهاجرت مقدارهای رمزشدهٔ قبلی را دست نمی‌زند');
    ok(/withdrawal_requests/.test(tool) && /users/.test(tool),
      'هر دو جدولِ مالی در ابزارِ مهاجرت پوشش داده شده‌اند');
  }

  console.log('\n۴) نشت: متنِ رمزشده نباید بیرون بیاید');
  {
    // هر جا رمزگشایی فراموش شده باشد، کاربر «enc:v1:…» می‌بیند. این جست‌وجو
    // فایل‌های رابط را می‌گردد؛ پیدا شدنِ پیشوند در جایِ دیگری جز ماژولِ رمز
    // یعنی جایی مقدارِ خام به خروجی راه پیدا کرده.
    const candidates = [
      'src/services/walletService.js', 'src/services/withdrawalService.js',
      'src/routes/adminUsers.js', 'src/routes/adminLeague.js', 'src/server.js',
    ];
    let leaked = 0;
    for (const f of candidates) {
      const src = stripComments(read(...f.split('/')));
      // `enc:v1:` فقط در ماژولِ رمز به‌عنوان *ساخت* استفاده می‌شود؛ در این
      // فایل‌ها نباید هیچ جا به کلاینت برگردد. تنها کاربردِ مجاز، مقایسه در
      // `isEncrypted` است که ماژولِ خودش انجام می‌دهد.
      if (/['"`]enc:v1:/.test(src)) leaked++;
    }
    ok(leaked === 0, 'هیچ فایلی رشتهٔ رمزشده را دستی نمی‌سازد یا بیرون نمی‌دهد');
  }

  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} تست موفق، ${fail} ناموفق`);
  process.exit(fail === 0 ? 0 : 1);
}).catch((e) => {
  console.error('\n✗ خطای غیرمنتظره در آزمون:', e);
  process.exit(1);
});
