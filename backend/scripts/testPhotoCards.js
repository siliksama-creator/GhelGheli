/**
 * تست‌های «ثبت کارت از طریق عکس».
 *
 * دو بخش:
 *   ۱. منطق خالص (نرمال‌سازی کد، تولید کد) — بدون دیتابیس و بدون تصویر
 *   ۲. موتور تطبیق تصویر — با تصاویر ساختگی که با sharp تولید می‌شوند
 *
 * چرا تصاویر ساختگی و نه فایل ثابت: تست باید در هر محیطی بدون دارایی
 * خارجی اجرا شود. تصاویر با seed ثابت ساخته می‌شوند تا نتیجه تکرارپذیر
 * بماند.
 */
const assert = require('assert');
const sharp = require('sharp');

const svc = require('../src/services/photoCardService');
const fp = require('../src/services/imageFingerprint');

let pass = 0; let fail = 0;
const results = [];

function t(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(
        () => { pass++; },
        (e) => { fail++; results.push(`✗ ${name}: ${e.message}`); },
      );
    }
    pass++;
    return Promise.resolve();
  } catch (e) {
    fail++;
    results.push(`✗ ${name}: ${e.message}`);
    return Promise.resolve();
  }
}

// ───────────────────────────────────────────────────────────────────────────
// ۱. نرمال‌سازی کد
// ───────────────────────────────────────────────────────────────────────────
async function testNormalize() {
  const n = svc.normalizePhotoCode;

  await t('حروف کوچک بزرگ می‌شوند', () => {
    assert.strictEqual(n('ghp-a2b3-c4d5'), 'GHP-A2B3-C4D5');
  });

  await t('فاصلهٔ اضافی حذف می‌شود', () => {
    assert.strictEqual(n('  GHP-A2B3-C4D5  '), 'GHP-A2B3-C4D5');
  });

  // ── باگ تاریخی که یک بار ورود با موبایل را شکست ──
  // کیبورد فارسی اندروید به‌طور پیش‌فرض ارقام فارسی تایپ می‌کند. کاربری
  // که کد را از روی کارت می‌خواند دقیقاً در همین دام می‌افتد.
  await t('ارقام فارسی به لاتین تبدیل می‌شوند', () => {
    assert.strictEqual(n('GHP-۲۳۴۵-۶۷۸۹'), 'GHP-2345-6789');
  });

  await t('ارقام عربی به لاتین تبدیل می‌شوند', () => {
    assert.strictEqual(n('GHP-٢٣٤٥-٦٧٨٩'), 'GHP-2345-6789');
  });

  await t('ترکیب ارقام فارسی و لاتین', () => {
    assert.strictEqual(n('GHP-۲3۴5-۶7۸9'), 'GHP-2345-6789');
  });

  // ── خطاهای رونویسی از روی کارت چاپی ──
  await t('O به صفر نگاشت می‌شود', () => {
    assert.strictEqual(n('GHP-O234-5678'), 'GHP-0234-5678');
  });

  await t('I و L به یک نگاشت می‌شوند', () => {
    assert.strictEqual(n('GHP-I234-L678'), 'GHP-1234-1678');
  });

  await t('فاصله و نقطه به خط تیره تبدیل می‌شوند', () => {
    assert.strictEqual(n('GHP 2345 6789'), 'GHP-2345-6789');
    assert.strictEqual(n('GHP.2345.6789'), 'GHP-2345-6789');
  });

  await t('خط تیرهٔ تکراری فشرده می‌شود', () => {
    assert.strictEqual(n('GHP--2345---6789'), 'GHP-2345-6789');
  });

  await t('خط تیرهٔ ابتدا و انتها حذف می‌شود', () => {
    assert.strictEqual(n('-GHP-2345-6789-'), 'GHP-2345-6789');
  });

  await t('ورودی خالی و null کرش نمی‌کند', () => {
    assert.strictEqual(n(null), '');
    assert.strictEqual(n(undefined), '');
    assert.strictEqual(n(''), '');
  });

  await t('نرمال‌سازی خودتوان است', () => {
    // اجرای دوباره روی خروجی نباید چیزی را عوض کند. اگر این بشکند،
    // یعنی جایی کد ذخیره‌شده با کد ورودی مطابقت نمی‌کند.
    const once = n('ghp o234 ۵۶۷۸');
    assert.strictEqual(n(once), once);
  });
}

// ───────────────────────────────────────────────────────────────────────────
// ۲. اعتبارسنجی فرمت
// ───────────────────────────────────────────────────────────────────────────
async function testValidate() {
  const v = svc.isValidPhotoCode;

  await t('کد معتبر پذیرفته می‌شود', () => {
    assert.ok(v('GHP-A2B3-C4D5'));
  });

  await t('کد کوتاه رد می‌شود', () => {
    assert.ok(!v('GHP-1'));
  });

  await t('کاراکتر غیرمجاز رد می‌شود', () => {
    assert.ok(!v('GHP-A2B3-C4D5!'));
    assert.ok(!v('GHP_A2B3'));         // زیرخط بعد از نرمال‌سازی نباید بماند
    assert.ok(!v('کد-فارسی-۱۲۳'));
  });

  await t('رشتهٔ خیلی بلند رد می‌شود', () => {
    assert.ok(!v('G'.repeat(65)));
  });
}

// ───────────────────────────────────────────────────────────────────────────
// ۳. تولید کد
// ───────────────────────────────────────────────────────────────────────────
async function testGenerate() {
  await t('قالب تولیدشده درست است', () => {
    for (let i = 0; i < 200; i++) {
      const c = svc.generateCode();
      assert.ok(/^GHP-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c), `قالب غلط: ${c}`);
    }
  });

  // ── مهم‌ترین تست این بخش ──
  // اگر الفبا کاراکتر مبهم داشته باشد، `normalizePhotoCode` دو کد متفاوت
  // را به یک رشته نگاشت می‌کند و یکتایی دیتابیس می‌شکند.
  await t('کد تولیدشده تحت نرمال‌سازی تغییر نمی‌کند', () => {
    for (let i = 0; i < 500; i++) {
      const c = svc.generateCode();
      assert.strictEqual(svc.normalizePhotoCode(c), c,
        `کد ${c} بعد از نرمال‌سازی عوض شد`);
    }
  });

  await t('الفبا هیچ کاراکتر مبهمی ندارد', () => {
    for (const ch of 'OIL01U') {
      assert.ok(!svc.CODE_ALPHABET.includes(ch),
        `الفبا نباید ${ch} داشته باشد`);
    }
  });

  await t('کد تولیدشده معتبر است', () => {
    for (let i = 0; i < 100; i++) {
      assert.ok(svc.isValidPhotoCode(svc.generateCode()));
    }
  });

  await t('نرخ برخورد در ۲۰ هزار کد قابل قبول است', () => {
    // ۱۵ هزار خواستهٔ مالک است؛ ۲۰ هزار حاشیهٔ اطمینان.
    const seen = new Set();
    let collisions = 0;
    for (let i = 0; i < 20000; i++) {
      const c = svc.generateCode();
      if (seen.has(c)) collisions++;
      seen.add(c);
    }
    // با فضای ۶.۶×۱۰¹¹ انتظار تقریباً صفر است؛ ۵ سقف بسیار سخاوتمندانه.
    assert.ok(collisions <= 5, `${collisions} برخورد — فضای کد کوچک است`);
  });

  await t('فضای کد برای حدس زدن بزرگ است', () => {
    // شانس یافتن یک کد معتبر از ۱۵۰۰۰ تا با حدس تصادفی
    const chance = 15000 / svc.CODE_SPACE;
    assert.ok(chance < 1e-6, `شانس حدس ${chance} خیلی زیاد است`);
  });
}

// ───────────────────────────────────────────────────────────────────────────
// ۴. موتور تطبیق تصویر
// ───────────────────────────────────────────────────────────────────────────

/** یک «کارت» ساختگی با پالت و ترکیب‌بندی مشخص می‌سازد. */
async function makeCard({ hue, seed = 1, w = 400, h = 620 }) {
  // شبیه‌سازی ساختار کارت: نوار بالا، بدنهٔ رنگی، نوار پایین.
  const band = Math.floor(h * 0.22);
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${w}" height="${h}" fill="hsl(${hue},70%,28%)"/>
    <rect y="0" width="${w}" height="${band}" fill="hsl(${(hue + 40) % 360},80%,55%)"/>
    <circle cx="${w * 0.5}" cy="${h * 0.45}" r="${w * 0.26}"
            fill="hsl(${(hue + 180) % 360},75%,${45 + (seed % 20)}%)"/>
    <rect y="${h - band}" width="${w}" height="${band}"
          fill="hsl(${(hue + 90) % 360},65%,${30 + (seed % 25)}%)"/>
    <text x="${w * 0.5}" y="${h * 0.5}" font-size="${w * 0.2}"
          text-anchor="middle" fill="#ffffff">${seed}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** عکس بی‌کیفیتِ کاربر را شبیه‌سازی می‌کند. */
async function degrade(buf, { rotate = 0, blur = 0, scale = 1, bright = 1 }) {
  const meta = await sharp(buf).metadata();
  let p = sharp(buf);
  if (rotate) p = p.rotate(rotate, { background: { r: 25, g: 25, b: 30 } });
  const nw = Math.max(48, Math.round(meta.width * scale));
  p = p.resize(nw);
  if (blur > 0.3) p = p.blur(blur);
  if (bright !== 1) p = p.modulate({ brightness: bright });
  // فشرده‌سازی JPEG با کیفیت پایین — همان چیزی که گوشی می‌فرستد.
  return p.jpeg({ quality: 45 }).toBuffer();
}

async function testMatching() {
  // کاتالوگ: ۱۲ طرح با پالت‌های متمایز، مثل کارت تیم‌های مختلف.
  const designs = [];
  for (let i = 0; i < 12; i++) {
    const buf = await makeCard({ hue: i * 30, seed: i + 1 });
    const f = await fp.fingerprint(buf);
    designs.push({ id: `d${i}`, ...f, _buf: buf });
  }

  await t('اثر انگشت ابعاد درست دارد', () => {
    const d = designs[0];
    assert.strictEqual(d.dhash.length, 32, 'dhash باید ۳۲ بایت باشد');
    assert.strictEqual(d.phash.length, 8, 'phash باید ۸ بایت باشد');
    assert.strictEqual(d.colorSig.length, 192, "امضای رنگ باید ۱۹۲ عدد باشد");
  });

  await t('تصویر با خودش شباهت کامل دارد', () => {
    assert.ok(fp.similarity(designs[0], designs[0]) > 0.999);
  });

  await t('دو طرح متفاوت شباهت پایین دارند', () => {
    const s = fp.similarity(designs[0], designs[6]);
    assert.ok(s < fp.ACCEPT_SCORE,
      `دو طرح متفاوت نباید ${s.toFixed(3)} شباهت داشته باشند`);
  });

  // ── تست اصلی: عکس بی‌کیفیت باید طرح درست را پیدا کند ──
  const conditions = [
    { name: 'کیفیت خوب', rotate: 0, blur: 0, scale: 0.5, bright: 1 },
    { name: 'کج و تار', rotate: 7, blur: 1.5, scale: 0.35, bright: 1 },
    { name: 'تاریک', rotate: -3, blur: 0.8, scale: 0.4, bright: 0.55 },
    { name: 'پرنور', rotate: 4, blur: 1.0, scale: 0.4, bright: 1.5 },
    { name: 'خیلی کوچک', rotate: -6, blur: 1.2, scale: 0.22, bright: 0.9 },
  ];

  for (const cond of conditions) {
    for (const idx of [0, 5, 11]) {
      await t(`تطبیق «${cond.name}» روی طرح ${idx}`, async () => {
        const bad = await degrade(designs[idx]._buf, cond);
        const q = await fp.fingerprint(bad);
        const m = fp.matchAgainst(q, designs);
        assert.strictEqual(m.design.id, `d${idx}`,
          `انتظار d${idx} ولی ${m.design.id} با امتیاز ${m.score.toFixed(3)}`);
        assert.notStrictEqual(m.verdict, 'reject',
          `نباید رد شود (امتیاز ${m.score.toFixed(3)})`);
      });
    }
  }

  // ── نباید چیزی را قبول کند که نباید ──
  await t('تصویر یکنواخت رد می‌شود', async () => {
    const flat = await sharp({
      create: { width: 300, height: 400, channels: 3,
        background: { r: 240, g: 240, b: 240 } },
    }).png().toBuffer();
    const m = fp.matchAgainst(await fp.fingerprint(flat), designs);
    assert.strictEqual(m.verdict, 'reject',
      `تصویر سفید نباید ${m.verdict} شود (${m.score.toFixed(3)})`);
  });

  await t('نویز محض قبول نمی‌شود', async () => {
    const noise = await sharp({
      create: { width: 300, height: 400, channels: 3,
        noise: { type: 'gaussian', mean: 128, sigma: 70 } },
    }).png().toBuffer();
    const m = fp.matchAgainst(await fp.fingerprint(noise), designs);
    assert.notStrictEqual(m.verdict, 'accept',
      `نویز نباید accept شود (${m.score.toFixed(3)})`);
  });

  await t('کاتالوگ خالی رد می‌دهد نه کرش', async () => {
    const m = fp.matchAgainst(await fp.fingerprint(designs[0]._buf), []);
    assert.strictEqual(m.verdict, 'reject');
    assert.strictEqual(m.design, null);
  });

  // ── حاشیهٔ اطمینان ──
  await t('حاشیه وقتی دو طرح یکسان‌اند کم است', () => {
    // دو نسخهٔ یکسان از یک طرح در کاتالوگ: حاشیه باید صفر شود و
    // حکم نباید accept باشد، چون معلوم نیست کدام‌یک درست است.
    const twin = { ...designs[3], id: 'twin' };
    const m = fp.matchAgainst(designs[3], [designs[3], twin]);
    assert.ok(m.margin < fp.MIN_MARGIN,
      `حاشیهٔ ${m.margin} باید کمتر از ${fp.MIN_MARGIN} باشد`);
    assert.notStrictEqual(m.verdict, 'accept',
      'با دو طرح یکسان نباید خودکار قبول شود');
  });

  await t('فشرده‌سازی webp تطبیق را نمی‌شکند', async () => {
    const webp = await sharp(designs[2]._buf).webp({ quality: 30 }).toBuffer();
    const m = fp.matchAgainst(await fp.fingerprint(webp), designs);
    assert.strictEqual(m.design.id, 'd2');
    assert.strictEqual(m.verdict, 'accept');
  });

  await t('چرخش EXIF باعث خطا نمی‌شود', async () => {
    const rotated = await sharp(designs[4]._buf).rotate(90).jpeg().toBuffer();
    const q = await fp.fingerprint(rotated);
    // چرخش ۹۰ درجه تطبیق را می‌شکند (انتظار داریم) ولی نباید کرش کند.
    const m = fp.matchAgainst(q, designs);
    assert.ok(m.verdict, 'باید حکمی برگرداند');
  });

  await t('آستانه‌ها منطقی مرتب‌اند', () => {
    assert.ok(fp.ACCEPT_SCORE > fp.REVIEW_SCORE,
      'آستانهٔ قبول باید بالاتر از آستانهٔ بررسی باشد');
    assert.ok(fp.REVIEW_SCORE > 0 && fp.ACCEPT_SCORE < 1);
  });

  await t('سرعت تطبیق برای کاتالوگ بزرگ قابل قبول است', () => {
    const many = [];
    for (let i = 0; i < 500; i++) many.push(designs[i % designs.length]);
    const t0 = Date.now();
    for (let r = 0; r < 10; r++) fp.matchAgainst(designs[0], many);
    const per = (Date.now() - t0) / 10;
    assert.ok(per < 60, `${per}ms برای ۵۰۰ طرح خیلی کند است`);
  });
}

// ───────────────────────────────────────────────────────────────────────────
(async () => {
  await testNormalize();
  await testValidate();
  await testGenerate();
  await testMatching();

  for (const r of results) console.log(r);
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} تست موفق، ${fail} ناموفق`);
  process.exit(fail === 0 ? 0 : 1);
})();
