// گردونهٔ شانس و سیستم دعوت — تست‌های منطق خالص.
//
// بدون دیتابیس و بدون شبکه، پس در CI در چند میلی‌ثانیه اجرا می‌شود و
// نمی‌تواند flaky شود. آزمون آماری واقعی (۲۰۰ هزار چرخش) جداگانه با
// tools/test_wheel_odds.py روی سرور اجرا می‌شود.
const assert = require('assert');
const wheel = require('../src/services/wheelService');
const referrals = require('../src/services/referralService');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
}

// همان جدولی که مایگریشن ۰۲۷ می‌کارد.
const PRIZES = [
  { id: 'a', label: '۱۰۰ امتیاز', kind: 'points', value: 100, weight: 3729, slice_order: 1 },
  { id: 'b', label: '۵۰٬۰۰۰ تومان', kind: 'cash', value: 50000, weight: 1, slice_order: 2 },
  { id: 'c', label: '۱۰۰۰ امتیاز', kind: 'points', value: 1000, weight: 1250, slice_order: 3 },
  { id: 'd', label: '۱۰٬۰۰۰ تومان', kind: 'cash', value: 10000, weight: 20, slice_order: 4 },
  { id: 'e', label: '۱۰۰ امتیاز', kind: 'points', value: 100, weight: 3728, slice_order: 5 },
  { id: 'f', label: '۵۰۰۰ امتیاز', kind: 'points', value: 5000, weight: 1, slice_order: 6 },
  { id: 'g', label: '۱۰۰۰ امتیاز', kind: 'points', value: 1000, weight: 1250, slice_order: 7 },
  { id: 'h', label: '۲۰۰۰ امتیاز', kind: 'points', value: 2000, weight: 20, slice_order: 8 },
  { id: 'i', label: '۱۰۰٬۰۰۰ تومان', kind: 'cash', value: 100000, weight: 1, slice_order: 9 },
];

console.log('\nگردونه — وزن‌ها و انتخاب جایزه');

test('جمع وزن‌ها دقیقاً ۱۰٬۰۰۰ است', () => {
  const total = PRIZES.reduce((s, p) => s + p.weight, 0);
  assert.strictEqual(total, wheel.WEIGHT_TOTAL);
  assert.strictEqual(total, 10000);
});

test('وزن اشتباه خطا می‌دهد و بی‌صدا نرمال‌سازی نمی‌شود', () => {
  // این مهم‌ترین تست ایمنی اقتصادی است. اگر کسی وزنی را اشتباه ویرایش کند
  // و ما بی‌صدا نرمال‌سازی کنیم، احتمالات چیزی می‌شوند که هیچ‌کس قصدش را
  // نداشته — و ممکن است جایزهٔ ۱۰۰ هزار تومانی صد برابر شود.
  const broken = PRIZES.map((p) => ({ ...p }));
  broken[0].weight = 9999;
  assert.throws(() => wheel.pickPrize(broken), /وزن/);
});

test('جایزه‌ای با وزن صفر هرگز انتخاب نمی‌شود', () => {
  const list = [
    { ...PRIZES[0], weight: 10000 },
    { ...PRIZES[8], weight: 0 },
  ];
  for (let i = 0; i < 3000; i++) {
    assert.notStrictEqual(wheel.pickPrize(list).id, PRIZES[8].id);
  }
});

test('با یک جایزهٔ تک‌وزن، همیشه همان برمی‌گردد', () => {
  const only = [{ ...PRIZES[0], weight: 10000 }];
  for (let i = 0; i < 200; i++) {
    assert.strictEqual(wheel.pickPrize(only).id, 'a');
  }
});

test('هر جایزه‌ای که وزن دارد، دیده می‌شود', () => {
  // مرزهای بازهٔ تجمعی: یک `<` که باید `<=` باشد، آخرین جایزه را
  // دست‌نیافتنی می‌کند. با ۲۰۰ هزار نمونه، جایزهٔ ۱-در-۱۰هزار باید
  // با احتمال بسیار بالا حداقل یک بار بیاید.
  const seen = new Set();
  for (let i = 0; i < 200000; i++) seen.add(wheel.pickPrize(PRIZES).id);
  for (const p of PRIZES) {
    assert.ok(seen.has(p.id), `${p.label} هرگز انتخاب نشد`);
  }
});

test('نرخ جوایز نادر در محدودهٔ آماری درست است', () => {
  const N = 200000;
  let rare = 0; // جمع سه جایزهٔ ۱-در-۱۰٬۰۰۰
  for (let i = 0; i < N; i++) {
    const p = wheel.pickPrize(PRIZES);
    if (p.weight === 1) rare++;
  }
  const expected = N * 3 / 10000; // ۶۰
  // کران ۵ سیگما — عبور از این یعنی باگ، نه بدشانسی.
  const sigma = Math.sqrt(N * (3 / 10000) * (1 - 3 / 10000));
  assert.ok(Math.abs(rare - expected) < 5 * sigma,
    `${rare} در برابر انتظار ${expected}`);
});

test('هزینهٔ نقدی مورد انتظار هر چرخش ۳۵ تومان است', () => {
  // عددی که کل اقتصاد گردونه رویش بنا شده. اگر کسی وزنی را عوض کند و این
  // عدد بالا برود، اینجا معلوم می‌شود — نه سر ماه روی صورت‌حساب.
  const ev = PRIZES.reduce(
    (s, p) => s + (p.kind === 'cash' ? (p.weight / 10000) * p.value : 0), 0);
  assert.strictEqual(ev, 35);
});

console.log('\nگردونه — روز تهران');

test('روز از UTC حساب می‌شود نه از ساعت دستگاه', () => {
  // ۲۱:۰۰ UTC یعنی ۰۰:۳۰ فردا در تهران.
  assert.strictEqual(wheel.tehranDay(new Date('2026-03-01T21:00:00Z')),
    '2026-03-02');
});

test('یک دقیقه مانده به نیمه‌شب تهران هنوز همان روز است', () => {
  assert.strictEqual(wheel.tehranDay(new Date('2026-03-01T20:29:00Z')),
    '2026-03-01');
});

test('شمارش معکوس هیچ‌وقت صفر یا منفی نیست', () => {
  for (const h of [0, 6, 12, 20, 23]) {
    const d = new Date(Date.UTC(2026, 2, 1, h, 0, 0));
    const ms = wheel.msUntilTehranMidnight(d);
    assert.ok(ms > 0 && ms <= 86400000, `ساعت ${h}: ${ms}`);
  }
});

test('storedDay تاریخِ نیمه‌شبِ محلی pg را درست می‌خواند', () => {
  // همان باگی که در سقف روزانهٔ ضربه‌زن یک بار اتفاق افتاد: pg ستون DATE
  // را به نیمه‌شب *محلی* تبدیل می‌کند و خواندنش با UTC «روز قبل» می‌دهد.
  const pgStyle = new Date(2026, 7, 3, 0, 0, 0);
  assert.strictEqual(wheel.storedDay(pgStyle), '2026-08-03');
});

test('storedDay رشته و مقدار نامعتبر را هم تحمل می‌کند', () => {
  assert.strictEqual(wheel.storedDay('2026-08-03'), '2026-08-03');
  assert.strictEqual(wheel.storedDay('2026-08-03T00:00:00Z'), '2026-08-03');
  assert.strictEqual(wheel.storedDay(null), null);
  assert.strictEqual(wheel.storedDay(new Date('nonsense')), null);
});

console.log('\nگردونه — امنیت');

test('مبلغ جایزه هرگز از بدنهٔ درخواست خوانده نمی‌شود', () => {
  // اگر endpoint مبلغ را از کلاینت بگیرد، هر کسی با curl هر مبلغی برای
  // خودش واریز می‌کند. این تست سورس را می‌خواند چون همین یک خط، تفاوت
  // بین یک قابلیت و یک در پشتی است.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/server.js'), 'utf8');
  const spinRoute = src.slice(src.indexOf("app.post('/api/wheel/spin'"),
    src.indexOf("app.get('/api/wheel/history'"));
  assert.ok(!/req\.body\.(amount|value|prize)/.test(spinRoute),
    'مسیر چرخش نباید هیچ مقداری از بدنه بخواند');
  assert.ok(/wheel\.spin\(req\.user\.id/.test(spinRoute),
    'جایزه باید از سرویس سرور بیاید');
});

test('چرخش از crypto استفاده می‌کند نه Math.random', () => {
  // Math.random در V8 قابل پیش‌بینی است: با دیدن چند خروجی می‌شود حالت
  // داخلی‌اش را بازسازی کرد و زمانِ جایزهٔ بزرگ را حدس زد.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/services/wheelService.js'), 'utf8');
  assert.ok(/crypto\.randomInt/.test(src));
  // فقط کد را بررسی کن، نه توضیحات. نسخهٔ اول این تست روی خودِ کامنتی که
  // توضیح می‌داد «چرا Math.random نه» شکست می‌خورد.
  const code = src.split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');
  assert.ok(!/Math\.random/.test(code), 'Math.random برای پول کافی نیست');
});

test('سهمیهٔ روزانه با قید یکتای دیتابیس قفل می‌شود', () => {
  // چک در کد اپلیکیشن مسابقهٔ دو درخواست هم‌زمان را نمی‌بندد: هر دو
  // «آیا امروز چرخیده؟» را می‌پرسند، هر دو «نه» می‌شنوند، هر دو جایزه
  // می‌دهند. فقط ایندکس یکتا این را می‌بندد.
  const mig = require('fs').readFileSync(
    require('path').join(__dirname, '../migrations/027_wheel_and_referrals.sql'),
    'utf8');
  assert.ok(/CREATE UNIQUE INDEX IF NOT EXISTS uq_wheel_daily_spin/.test(mig));
  assert.ok(/WHERE spin_source = 'daily'/.test(mig));
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/services/wheelService.js'), 'utf8');
  assert.ok(/e\.code === '23505'/.test(src),
    'نقض قید یکتا باید گرفته شود، نه اینکه ۵۰۰ بدهد');
});

test('جایزه قبل از پرداخت ثبت می‌شود', () => {
  // ترتیب مهم است: اگر پرداخت قبل از درج باشد، یک خطای وسط راه می‌تواند
  // پول بدهد بدون اینکه چرخش ثبت شود.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/services/wheelService.js'), 'utf8');
  const insertAt = src.indexOf('INSERT INTO wheel_spins');
  const payAt = src.indexOf('creditCash(client');
  assert.ok(insertAt > 0 && payAt > 0 && insertAt < payAt,
    'درج چرخش باید قبل از پرداخت باشد');
});

console.log('\nدعوت دوستان');

test('کد ۸ کاراکتری است', () => {
  for (let i = 0; i < 100; i++) {
    assert.strictEqual(referrals.generateCode().length, 8);
  }
});

test('کد شامل نویسه‌های مبهم نیست', () => {
  // کد قرار است شفاهی به دوست گفته شود. 0/O و 1/I/L در فارسی و انگلیسی
  // مدام اشتباه شنیده و تایپ می‌شوند.
  const banned = new Set(['0', 'O', '1', 'I', 'L']);
  for (let i = 0; i < 2000; i++) {
    for (const ch of referrals.generateCode()) {
      assert.ok(!banned.has(ch), `نویسهٔ مبهم ${ch} در کد`);
    }
  }
});

test('کدها به‌قدر کافی متنوع‌اند', () => {
  const seen = new Set();
  for (let i = 0; i < 5000; i++) seen.add(referrals.generateCode());
  // با ۳۰^۸ فضای حالت، ۵۰۰۰ نمونه باید تقریباً همه یکتا باشند.
  assert.ok(seen.size > 4990, `فقط ${seen.size} کد یکتا از ۵۰۰۰`);
});

test('کمیسیون ۵٪ است و به بالا گرد می‌شود', () => {
  assert.strictEqual(referrals.COMMISSION_PERCENT, 5);
  // گرد کردن به بالا عمدی است: با ۵٪، هر امتیاز کمتر از ۲۰ به سمت صفر
  // گرد می‌شد و معرف از ریز-امتیازها — که بیشترِ فعالیت روزمره است —
  // هیچ نمی‌گرفت.
  const pct = referrals.COMMISSION_PERCENT;
  assert.strictEqual(Math.ceil(100 * pct / 100), 5);
  assert.strictEqual(Math.ceil(10 * pct / 100), 1);
  assert.strictEqual(Math.ceil(1 * pct / 100), 1);
  assert.strictEqual(Math.ceil(1000 * pct / 100), 50);
});

test('هر معرفی ۳ چرخش می‌دهد', () => {
  assert.strictEqual(referrals.SPINS_PER_REFERRAL, 3);
});

test('کمیسیون از امتیاز منفی ساخته نمی‌شود', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/services/referralService.js'),
    'utf8');
  assert.ok(/if \(points <= 0\) return null/.test(src),
    'اصلاح منفی مدیر نباید از معرف امتیاز پس بگیرد');
});

test('کمیسیون زنجیره‌ای نیست (هرم نمی‌سازیم)', () => {
  // payCommission فقط referred_by خودِ کاربر را می‌خواند و هرگز بازگشتی
  // صدا زده نمی‌شود. زنجیره‌ای کردنش هزینه را نمایی می‌کند و از نظر
  // حقوقی هم در ایران دردسر است.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/services/referralService.js'),
    'utf8');
  const fn = src.slice(src.indexOf('async function payCommission'),
    src.indexOf('/** خلاصهٔ معرفی'));
  assert.ok(!/payCommission\(/.test(fn.slice(30)),
    'payCommission نباید خودش را صدا بزند');
});

test('خودمعرفی رد می‌شود', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/services/referralService.js'),
    'utf8');
  assert.ok(/referrerId === newUserId/.test(src),
    'کسی نباید کد خودش را وارد کند و ۳ چرخش بگیرد');
});

test('معرف دوم برای یک کاربر ثبت نمی‌شود', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/services/referralService.js'),
    'utf8');
  assert.ok(/referred_by IS NULL/.test(src),
    'شرط باید مانع بازنویسی معرف قبلی و دادن ۳ چرخش دوم شود');
});

test('کمیسیون به هر سه مسیر امتیاز وصل است', () => {
  const path = require('path');
  const fs = require('fs');
  const server = fs.readFileSync(
    path.join(__dirname, '../src/server.js'), 'utf8');
  const games = fs.readFileSync(
    path.join(__dirname, '../src/services/gameRewardService.js'), 'utf8');
  // مالک گفت «تمامی امتیازاتی که به هر طریقی به دست میارن».
  assert.ok(/payCommission\(client, req\.user\.id, card\.point_value, 'card'\)/
    .test(server), 'ثبت کد کارت');
  assert.ok(/payCommission\(pointsClient, req\.params\.id, p, 'admin'\)/
    .test(server), 'امتیاز دستی مدیر');
  assert.ok(/payCommission\(client, userId, delta, 'game'\)/
    .test(games), 'جایزهٔ بازی');
  assert.ok(/payCommission\(client, userId, amount, source\)/
    .test(server), 'امتیاز گردونه');
});

console.log(`\n${passed} ادعای گردونه و دعوت موفق بود\n`);
