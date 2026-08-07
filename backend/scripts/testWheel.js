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

// همان جدولی که مایگریشن ۰۲۹ می‌کارد. مخرج ده میلیون است.
const PRIZES = [
  { id: 'a', label: '۱۰۰ امتیاز', kind: 'points', value: 100, weight: 2069816, slice_order: 1 },
  { id: 'b', label: '۵۰٬۰۰۰ تومان', kind: 'cash', value: 50000, weight: 40, slice_order: 2 },
  { id: 'c', label: '۵۰۰ امتیاز', kind: 'points', value: 500, weight: 1400000, slice_order: 3 },
  { id: 'd', label: '۱۰۰ امتیاز', kind: 'points', value: 100, weight: 2069817, slice_order: 4 },
  { id: 'e', label: '۲۰۰۰ امتیاز', kind: 'points', value: 2000, weight: 80000, slice_order: 5 },
  { id: 'f', label: '۱۰۰۰ امتیاز', kind: 'points', value: 1000, weight: 450000, slice_order: 6 },
  { id: 'g', label: '۱۰۰ امتیاز', kind: 'points', value: 100, weight: 2069817, slice_order: 7 },
  { id: 'h', label: '۱۰٬۰۰۰ تومان', kind: 'cash', value: 10000, weight: 500, slice_order: 8 },
  { id: 'i', label: '۵۰۰ امتیاز', kind: 'points', value: 500, weight: 1400000, slice_order: 9 },
  { id: 'j', label: '۵۰۰۰ امتیاز', kind: 'points', value: 5000, weight: 10000, slice_order: 10 },
  { id: 'k', label: '۱۰۰۰ امتیاز', kind: 'points', value: 1000, weight: 450000, slice_order: 11 },
  { id: 'l', label: '۱۰۰٬۰۰۰ تومان', kind: 'cash', value: 100000, weight: 10, slice_order: 12 },
];

console.log('\nگردونه — وزن‌ها و انتخاب جایزه');

test('جمع وزن‌ها دقیقاً ده میلیون است', () => {
  const total = PRIZES.reduce((s, p) => s + p.weight, 0);
  assert.strictEqual(total, wheel.WEIGHT_TOTAL);
  assert.strictEqual(total, 10000000);
});

test('جوایز بزرگ واقعاً «خیلی خیلی کم» هستند', () => {
  // خواستهٔ صریح مالک. با ۲ چرخش در روز، هر کدام از این‌ها یعنی چند دهه
  // انتظار برای یک کاربر — که همان چیزی است که خواسته شد.
  const rate = (id) => {
    const p = PRIZES.find((x) => x.id === id);
    return wheel.WEIGHT_TOTAL / p.weight;
  };
  // نسخهٔ سوم: چون گردونه رایگان است و درآمدی ندارد، جوایز نقدی باید
  // بسیار نادرتر از یک گردونهٔ پولی باشند.
  assert.ok(rate('l') >= 1000000, `۱۰۰ هزار تومان: ۱ در ${rate('l')}`);
  assert.ok(rate('b') >= 250000, `۵۰ هزار تومان: ۱ در ${rate('b')}`);
  assert.ok(rate('h') >= 20000, `۱۰ هزار تومان: ۱ در ${rate('h')}`);
  assert.ok(rate('j') >= 1000, `۵۰۰۰ امتیاز: ۱ در ${rate('j')}`);
});

test('حتی فعال‌ترین کاربر هم در یک سال شانس ناچیزی دارد', () => {
  // این تستِ اصلیِ «قمار نساختیم» است. سقفِ چرخش یک کاربر:
  //   ۶ در روز (با ۵۰ دعوت) + ۳ به ازای هر دعوت = ۲٬۳۴۰ در سال.
  // با آن سقف، شانس دیدن جایزهٔ ۱۰۰ هزاری باید زیر یک درصد بماند.
  const spinsPerYear = 365 * 6 + 50 * 3;
  const p = PRIZES.find((x) => x.id === 'l').weight / wheel.WEIGHT_TOTAL;
  const atLeastOnce = 1 - Math.pow(1 - p, spinsPerYear);
  assert.ok(atLeastOnce < 0.01,
    `${(atLeastOnce * 100).toFixed(2)}% در سال — خیلی زیاد است`);
  console.log(`    (فعال‌ترین کاربر: ${(atLeastOnce * 100).toFixed(2)}% در سال)`);
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
    { ...PRIZES[0], weight: wheel.WEIGHT_TOTAL },
    { ...PRIZES[8], weight: 0 },
  ];
  for (let i = 0; i < 3000; i++) {
    assert.notStrictEqual(wheel.pickPrize(list).id, PRIZES[8].id);
  }
});

test('با یک جایزهٔ تک‌وزن، همیشه همان برمی‌گردد', () => {
  const only = [{ ...PRIZES[0], weight: wheel.WEIGHT_TOTAL }];
  for (let i = 0; i < 200; i++) {
    assert.strictEqual(wheel.pickPrize(only).id, 'a');
  }
});

test('هر جایزه‌ای که وزن دارد، دیده می‌شود', () => {
  // مرزهای بازهٔ تجمعی: یک `<` که باید `<=` باشد، آخرین جایزه را
  // دست‌نیافتنی می‌کند.
  //
  // نادرترین جایزه ۱ در ۲۰۰٬۰۰۰ است، پس با ۲۰۰ هزار نمونه احتمال ندیدنش
  // ۳۷٪ می‌شود و تست flaky. به‌جای بالا بردن N تا میلیون‌ها (کُند)،
  // جوایز نادر با یک جدول کوچک‌ترِ هم‌ارز بررسی می‌شوند: همان کد انتخاب،
  // ولی مرزها با تعداد نمونهٔ معقول قابل آزمون‌اند.
  const seen = new Set();
  for (let i = 0; i < 200000; i++) seen.add(wheel.pickPrize(PRIZES).id);
  for (const p of PRIZES) {
    if (p.weight >= 400000) {
      assert.ok(seen.has(p.id), `${p.label} هرگز انتخاب نشد`);
    }
  }

  // آخرین جایزهٔ جدول — همان که یک `<` اشتباه دست‌نیافتنی‌اش می‌کند.
  //
  // وزنش ۱-در-۱۰۰۰ گرفته شده نه ۱-در-یک‌میلیون: هدف اثبات *قابل انتخاب
  // بودنِ* عنصر آخر است، نه سنجش یک نرخ نادر. با ۱-در-یک‌میلیون، خودِ تست
  // با احتمال ۳۷٪ الکی قرمز می‌شد.
  // وزن نسبی ثابت نگه داشته می‌شود (۱ در ۱۰۰۰) تا تست به مخرج وابسته
  // نباشد — با تغییر WEIGHT_TOTAL از یک میلیون به ده میلیون، نسخهٔ قبلی
  // این تست الکی قرمز شد چون نسبت هزار برابر کوچک‌تر شده بود.
  const boundary = [
    { id: 'x', kind: 'points', value: 1,
      weight: wheel.WEIGHT_TOTAL - wheel.WEIGHT_TOTAL / 1000 },
    { id: 'last', kind: 'points', value: 2,
      weight: wheel.WEIGHT_TOTAL / 1000 },
  ];
  let lastHits = 0;
  for (let i = 0; i < 200000; i++) {
    if (wheel.pickPrize(boundary).id === 'last') lastHits++;
  }
  // انتظار ~۲۰۰. صفر یعنی باگ مرز بازه.
  assert.ok(lastHits > 50,
    `آخرین جایزهٔ جدول فقط ${lastHits} بار آمد — باگ مرز بازه`);
});

test('نرخ جوایز نادر در محدودهٔ آماری درست است', () => {
  const N = 300000;
  const rareWeight = PRIZES
    .filter((p) => p.weight <= 80000)
    .reduce((s, p) => s + p.weight, 0);
  let rare = 0;
  for (let i = 0; i < N; i++) {
    if (wheel.pickPrize(PRIZES).weight <= 80000) rare++;
  }
  const pr = rareWeight / wheel.WEIGHT_TOTAL;
  const expected = N * pr;
  // کران ۵ سیگما — عبور از این یعنی باگ، نه بدشانسی.
  const sigma = Math.sqrt(N * pr * (1 - pr));
  assert.ok(Math.abs(rare - expected) < 5 * sigma,
    `${rare} در برابر انتظار ${expected.toFixed(0)}`);
});

test('هزینهٔ نقدی مورد انتظار هر چرخش زیر ۲ تومان است', () => {
  // عددی که کل اقتصاد گردونه رویش بنا شده. اگر کسی وزنی را عوض کند و این
  // عدد بالا برود، اینجا معلوم می‌شود — نه سر ماه روی صورت‌حساب.
  //
  // کران بالا و نه یک عدد دقیق: وزن‌ها ممکن است کمی تنظیم شوند، ولی سقف
  // هزینه نباید جابه‌جا شود. با ۱۰٬۰۰۰ کاربر و ۲ چرخش در روز، ۲ تومان
  // یعنی حداکثر ۱.۲ میلیون تومان در ماه.
  const ev = PRIZES.reduce(
    (s, p) => s + (p.kind === 'cash'
      ? (p.weight / wheel.WEIGHT_TOTAL) * p.value : 0), 0);
  assert.ok(ev < 2, `EV نقدی ${ev} تومان است`);
  assert.ok(ev > 0, 'گردونه باید جایزهٔ نقدی داشته باشد');
  console.log(`    (EV نقدی: ${ev.toFixed(2)} تومان هر چرخش)`);
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

test('کد دقیقاً ۴ رقم است', () => {
  for (let i = 0; i < 500; i++) {
    const c = referrals.generateCode();
    assert.strictEqual(c.length, 4, `کد ${c}`);
  }
});

test('کد فقط رقم است — هیچ حرف انگلیسی‌ای ندارد', () => {
  // خواستهٔ مالک: «بدون حروف انگلیسی که ممکنه اشتباه کنن». وقتی حرفی در
  // کار نباشد، مسئلهٔ بزرگی/کوچکی حروف هم اصلاً وجود ندارد — که بهترین
  // شکلِ برآورده کردن «بزرگ کوچیکی حروف مهم نباشه» است.
  for (let i = 0; i < 2000; i++) {
    assert.ok(/^[0-9]{4}$/.test(referrals.generateCode()));
  }
});

test('کد هرگز با صفر شروع نمی‌شود', () => {
  // «۰۴۲۷» و «۴۲۷» نباید دو چیز متفاوت به‌نظر برسند؛ کاربر صفر ابتدایی را
  // موقع گفتن یا تایپ کردن جا می‌اندازد.
  for (let i = 0; i < 3000; i++) {
    assert.notStrictEqual(referrals.generateCode()[0], '0');
  }
});

test('کد در بازهٔ ۱۰۰۰ تا ۹۹۹۹ است', () => {
  for (let i = 0; i < 3000; i++) {
    const n = Number(referrals.generateCode());
    assert.ok(n >= 1000 && n <= 9999, `کد ${n} خارج از بازه`);
  }
});

test('توزیع کدها یکنواخت است', () => {
  // اگر تولید سوگیری داشته باشد، بعضی کدها هرگز صادر نمی‌شوند و فضای
  // ۹٬۰۰۰تایی عملاً کوچک‌تر می‌شود.
  const seen = new Set();
  for (let i = 0; i < 40000; i++) seen.add(referrals.generateCode());
  assert.ok(seen.size > 8500, `فقط ${seen.size} کد یکتا از ۹٬۰۰۰ ممکن`);
});

console.log('\nدعوت — ارقام فارسی و نرمال‌سازی');

test('ارقام فارسی به لاتین تبدیل می‌شوند', () => {
  // کاربر ایرانی با کیبورد فارسی «۱۲۳۴» تایپ می‌کند نه «1234». بدون این
  // نرمال‌سازی، کدِ درست هرگز پیدا نمی‌شد و کاربر فکر می‌کرد کد دوستش
  // اشتباه است.
  assert.strictEqual(referrals.normalizeDigits('۱۲۳۴'), '1234');
  assert.strictEqual(referrals.normalizeDigits('۰۹۸۷'), '0987');
});

test('ارقام عربی هم تبدیل می‌شوند', () => {
  assert.strictEqual(referrals.normalizeDigits('١٢٣٤'), '1234');
});

test('فاصله و خط تیره و حروف دور ریخته می‌شوند', () => {
  assert.strictEqual(referrals.normalizeDigits(' 12-34 '), '1234');
  assert.strictEqual(referrals.normalizeDigits('کد: ۱۲۳۴'), '1234');
  assert.strictEqual(referrals.normalizeDigits('abc'), '');
});

test('ورودی نامعتبر خطا نمی‌دهد', () => {
  for (const bad of [null, undefined, '', 0, {}, []]) {
    assert.strictEqual(typeof referrals.normalizeDigits(bad), 'string');
  }
});

console.log('\nدعوت — چرخش روزانه بر اساس تعداد دعوت');

test('بدون دعوت، روزی یک چرخش', () => {
  assert.strictEqual(referrals.dailySpinsFor(0), 1);
  assert.strictEqual(referrals.dailySpinsFor(9), 1);
});

test('هر ۱۰ دعوت یک چرخش روزانه اضافه می‌کند', () => {
  // خواستهٔ مالک: «به ازای هر ۱۰ نفری که دعوت کنه ۱ شانس روزانه اضافه بشه
  // و ازون به بعد ۲ شانس در روز».
  assert.strictEqual(referrals.dailySpinsFor(10), 2);
  assert.strictEqual(referrals.dailySpinsFor(19), 2);
  assert.strictEqual(referrals.dailySpinsFor(20), 3);
  assert.strictEqual(referrals.dailySpinsFor(30), 4);
  assert.strictEqual(referrals.dailySpinsFor(40), 5);
  assert.strictEqual(referrals.dailySpinsFor(50), 6);
});

test('بعد از ۵۰ دعوت دیگر اضافه نمی‌شود', () => {
  // «و این تا ۵۰ نفر ادامه پیدا میکنه» — دعوت همچنان نامحدود است، فقط
  // این پاداشِ خاص سقف دارد.
  assert.strictEqual(referrals.dailySpinsFor(60), 6);
  assert.strictEqual(referrals.dailySpinsFor(500), 6);
  assert.strictEqual(referrals.dailySpinsFor(100000), 6);
});

test('ورودی خراب سهمیه را منفی یا NaN نمی‌کند', () => {
  for (const bad of [null, undefined, -5, NaN, 'x']) {
    const v = referrals.dailySpinsFor(bad);
    assert.ok(Number.isInteger(v) && v >= 1, `ورودی ${bad} داد ${v}`);
  }
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

test('هر معرفی ۳ چرخش می‌دهد — به هر دو طرف', () => {
  assert.strictEqual(referrals.SPINS_PER_REFERRAL, 3);
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/services/referralService.js'),
    'utf8');
  // خواستهٔ مالک: «هر دو کاربر یعنی هم کسی که دعوت شده هم کسی که دعوت
  // کرده هر دو ۳ شانس گردونه بگیرند». یک UPDATE روی آرایه‌ای از دو id.
  assert.ok(/id = ANY\(\$1::uuid\[\]\)/.test(src),
    'باید هر دو طرف در یک UPDATE جایزه بگیرند');
  assert.ok(/\[\[referrerId, newUserId\], SPINS_PER_REFERRAL\]/.test(src));
});

test('دعوت نامحدود است', () => {
  // مالک: «هر کاربر هر چقدر میخواد میتونه دعوت کنه». هیچ سقفی روی تعداد
  // دعوت نیست — فقط پاداشِ چرخش روزانه سقف دارد.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/services/referralService.js'),
    'utf8');
  assert.ok(!/MAX_REFERRALS|maxInvites\s*=/.test(src),
    'نباید سقفی روی تعداد دعوت باشد');
  assert.strictEqual(referrals.MAX_INVITES_FOR_DAILY, 50,
    'سقف فقط روی پاداش چرخش روزانه است');
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

test('کمیسیون فقط از دو منبع می‌آید: کارت و ضربه‌زن', () => {
  // مالک دامنه را محدود کرد: «این ۵ درصد فقط از امتیازهایی بدست میاد که
  // کاربر خودش کارت ثبت کرده و یا امتیاز رو از بازی ضربه زن بدست آورده».
  assert.deepStrictEqual([...referrals.COMMISSIONABLE].sort(),
    ['card', 'tap']);
});

test('منبع ناشناخته کمیسیون نمی‌سازد — لیست سفید است نه سیاه', () => {
  // پیش‌فرضِ امن: قابلیت جدید باید آگاهانه اضافه شود، نه اینکه بی‌سروصدا
  // هزینه بسازد.
  for (const s of ['game', 'admin', 'wheel', 'league', 'reward', 'unknown']) {
    assert.ok(!referrals.COMMISSIONABLE.has(s), `${s} نباید کمیسیون بسازد`);
  }
});

test('کمیسیون در کد فقط از همان دو نقطه صدا زده می‌شود', () => {
  const path = require('path');
  const fs = require('fs');
  const server = fs.readFileSync(
    path.join(__dirname, '../src/server.js'), 'utf8');
  const games = fs.readFileSync(
    path.join(__dirname, '../src/services/gameRewardService.js'), 'utf8');

  assert.ok(/payCommission\(client, req\.user\.id, card\.point_value, 'card'\)/
    .test(server), 'ثبت کد کارت');
  assert.ok(/payCommission\(client, userId, points, 'tap'\)/
    .test(server), 'بازی ضربه‌زن');
  // و از جاهایی که مالک حذف کرد، صدا زده **نمی‌شود**.
  assert.ok(!/payCommission/.test(games),
    'بازی‌های آنلاین نباید کمیسیون بسازند');
  const calls = server.match(/payCommission\(/g) || [];
  assert.strictEqual(calls.length, 2,
    `انتظار ۲ فراخوانی، ${calls.length} تا پیدا شد`);
});

console.log('\nدعوت — یکپارچگی با لیگ');

test('کمیسیون به جدول لیگ هم اضافه می‌شود', () => {
  // باگ واقعی که در بازبینی سخت‌گیرانه پیدا شد: کمیسیون فقط
  // users.monthly_league_points را بالا می‌برد، ولی جدول رتبه‌بندی که لیگ
  // از آن می‌خواند (league_leaderboard_entries) دست‌نخورده می‌ماند.
  //
  // یعنی معرف کمیسیونش را روی پروفایل می‌دید ولی در جدول لیگ بالا
  // نمی‌رفت — و دو عدد تمام ماه دقیقاً به اندازهٔ کمیسیون از هم فاصله
  // می‌گرفتند. جایزهٔ ماهانه هم به نفر اشتباه می‌رسید.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/services/referralService.js'),
    'utf8');
  assert.ok(/addLeaguePoints\(client, referrerId, earned\)/.test(src),
    'کمیسیون باید به league_leaderboard_entries هم برود');

  // ── چرا این بررسی بازنویسی شد ──
  //
  // نسخهٔ قبلی دنبالِ رشتهٔ خامِ
  // `monthly_league_points = monthly_league_points + $2` می‌گشت. با
  // انتقالِ همهٔ مسیرهای امتیاز به دفترِ `pointService` (مایگریشن ۰۴۵)
  // آن SQL از این فایل رفت و داخلِ سرویس نشست — پس تست قرمز شد در
  // حالی که **رفتار دقیقاً همان بود**.
  //
  // ⚠️ درسِ این مورد: تستی که به شکلِ ظاهریِ کد گره بخورد، با هر
  //    بازآراییِ بی‌خطر می‌شکند و کم‌کم آدم یاد می‌گیرد نادیده‌اش
  //    بگیرد. معیارِ درست «چه اتفاقی می‌افتد» است نه «چطور نوشته شده».
  //
  // دو چیزی که واقعاً اهمیت دارند:
  //   ۱. امتیازِ ماهانهٔ کاربر زیاد شود (حالا از راهِ `credit`، که
  //      پیش‌فرضِ `league` در آن `true` است).
  //   ۲. جدولِ رتبه‌بندی هم جدا به‌روز شود، **بعد** از آن و روی همان
  //      تراکنش.
  const iCredit = src.indexOf('pointLedger.credit(client');
  const iLeague = src.indexOf('addLeaguePoints(client, referrerId, earned)');
  assert.ok(iCredit > 0,
    'کمیسیون باید از دفترِ امتیاز عبور کند تا در «ریز امتیازات» دیده شود');
  assert.ok(iLeague > iCredit,
    'به‌روزرسانیِ جدولِ لیگ باید بعد از ثبتِ امتیاز و روی همان تراکنش باشد');

  // و مطمئن شو `league:false` پاس داده نشده — وگرنه امتیازِ ماهانهٔ
  // کاربر بالا نمی‌رود و پروفایل با جدولِ لیگ اختلاف پیدا می‌کند.
  const creditBlock = src.slice(iCredit, iLeague);
  assert.ok(!/league:\s*false/.test(creditBlock),
    'کمیسیون باید monthly_league_points را هم زیاد کند');
});

test('همهٔ مسیرهای امتیاز از دفتر عبور می‌کنند', () => {
  // ── نگهبانِ «امتیازِ بی‌رد» ──
  //
  // دفترِ ریزِ امتیازات فقط وقتی معنی دارد که **هیچ** مسیری دورش نزند.
  // اگر کسی مسیرِ تازه‌ای اضافه کند و مستقیم `UPDATE users SET
  // current_points` بنویسد، دفتر بی‌صدا ناقص می‌شود و
  // `SUM(delta) == current_points` می‌شکند — بدونِ هیچ خطایی.
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '../src');
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) files.push(p);
    }
  }(dir));

  const offenders = [];
  for (const f of files) {
    if (f.endsWith('pointService.js')) continue;   // خودِ دفتر
    const src = fs.readFileSync(f, 'utf8');
    // هر UPDATE که current_points را زیاد یا کم کند.
    const re = /current_points\s*=\s*(?:GREATEST\()?\s*(?:0\s*,\s*)?current_points\s*[+-]/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      // اگر در همان ناحیه ردیفِ دفتر هم نوشته می‌شود، مجاز است:
      // چند مسیر عمداً مستقیم می‌نویسند (برگشتِ امتیاز، جریمهٔ بازی)
      // چون `credit`/`debit` رفتارِ `lifetime` را جور دیگری مدیریت
      // می‌کنند — ولی همه‌شان `point_transactions` را پر می‌کنند.
      const around = src.slice(Math.max(0, m.index - 200), m.index + 1400);
      if (!/point_transactions/.test(around)) {
        offenders.push(`${path.basename(f)} @${m.index}`);
      }
    }
  }
  assert.deepStrictEqual(offenders, [],
    'این مسیرها امتیاز را بدونِ ثبت در دفتر عوض می‌کنند: '
    + offenders.join(', '));
});

console.log('\nگردونه — چرخش نامحدود (ابزار تست مالک)');

test('پرچم روی کاربر است نه لیست سخت‌کدشدهٔ شماره‌ها', () => {
  // شمارهٔ ادمین عوض می‌شود و یک ثابت در کد از قلم می‌افتد؛ پرچم در
  // دیتابیس یعنی در ممیزی هم می‌شود دید چه کسی نامحدود است.
  const mig = require('fs').readFileSync(
    require('path').join(__dirname,
      '../migrations/029_wheel_odds_v3_and_admin.sql'), 'utf8');
  assert.ok(/ADD COLUMN IF NOT EXISTS unlimited_spins BOOLEAN/.test(mig));
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/services/wheelService.js'), 'utf8');
  assert.ok(!/'09\d{9}'|MAIN_ADMIN|process\.env\.ADMIN/.test(src),
    'نباید شماره یا نام ادمین در سرویس سخت‌کد شود');
});

test('حساب نامحدود چرخش خرج نمی‌کند', () => {
  // وگرنه تست کردنِ مالک، جایزه‌های واقعی خودش را می‌سوزاند.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/services/wheelService.js'), 'utf8');
  assert.ok(/if \(!useDaily && !unlimited\)/.test(src),
    'کسر bonus_spins باید برای حساب نامحدود رد شود');
});

test('عدد نمایشی متناهی است، نه Infinity', () => {
  // Infinity در JSON به null تبدیل می‌شود و کلاینت با آن حساب می‌کند.
  assert.strictEqual(typeof wheel.UNLIMITED_DISPLAY, 'number');
  assert.ok(Number.isFinite(wheel.UNLIMITED_DISPLAY));
  assert.ok(wheel.UNLIMITED_DISPLAY > 1000);
});

test('endpoint فقط برای سوپرادمین است', () => {
  // این پرچم عملاً جایزهٔ نامحدود می‌دهد؛ نقش پشتیبانی نباید بتواند
  // روشنش کند.
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/server.js'), 'utf8');
  const i = src.indexOf("'/api/admin/users/:id/unlimited-spins'");
  assert.ok(i > 0, 'endpoint وجود ندارد');
  const route = src.slice(i, i + 700);
  assert.ok(/requireRole\(\)/.test(route),
    'باید requireRole() بدون آرگومان باشد (فقط سوپرادمین)');
  assert.ok(/audit\(/.test(route), 'باید در audit ثبت شود');
});

test('سرویس سبکِ شمارنده وجود دارد', () => {
  // /api/wheel کل کاتالوگ ۱۲ جایزه را می‌فرستد؛ نشانِ نوار بالا فقط یک
  // عدد می‌خواهد و روی هر بار باز شدن اپ صدا زده می‌شود.
  assert.strictEqual(typeof wheel.spinCount, 'function');
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '../src/server.js'), 'utf8');
  assert.ok(/app\.get\('\/api\/wheel\/count'/.test(src));
});

console.log(`\n${passed} ادعای گردونه و دعوت موفق بود\n`);
