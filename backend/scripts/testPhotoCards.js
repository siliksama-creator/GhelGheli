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
  // ── نرمال‌سازی دیگر حروف مبهم را عوض نمی‌کند ──
  //
  // این عمدی تغییر کرد. وقتی سیستم خودش کد می‌ساخت، الفبا O/I/L نداشت
  // پس نگاشتشان بی‌خطر بود. حالا مدیر کدهای چاپ‌شده را وارد می‌کند و
  // `QL-2026-0001` یک کدِ کاملاً معتبر است — نگاشت آن را به
  // `Q1-2026-0001` خراب می‌کرد. تحملِ خطای خواندن حالا کارِ
  // `foldPhotoCode` است که فقط برای جست‌وجو استفاده می‌شود.
  await t('کدِ حاوی L دست‌نخورده می‌ماند', () => {
    assert.strictEqual(n('QL-2026-0001'), 'QL-2026-0001');
  });

  await t('کدِ حاوی O و I دست‌نخورده می‌ماند', () => {
    assert.strictEqual(n('GHP-O234-I678'), 'GHP-O234-I678');
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
// ۳. کدهایی که مدیر وارد می‌کند
// ───────────────────────────────────────────────────────────────────────────
//
// مالک کدها را خودش وارد می‌کند (دانه‌ای یا انبوه) چون روی کارتِ فیزیکی
// از قبل چاپ شده‌اند. پس تست‌ها باید قالب‌های واقعیِ متنوع را بپذیرند،
// نه فقط قالبی که خودمان می‌ساختیم.
async function testAdminEnteredCodes() {
  const n = svc.normalizePhotoCode;
  const v = svc.isValidPhotoCode;

  await t('قالب‌های واقعیِ چاپخانه پذیرفته می‌شوند', () => {
    // هیچ‌کدام قالبِ «ما» نیستند؛ همه باید کار کنند چون مالک ممکن است
    // هرکدام را روی کارت‌هایش چاپ کرده باشد.
    for (const c of ['GHP-A2B3-C4D5', 'ABCD1234', 'QL-2026-0001',
      'X7K9', '1234567890', 'GHELGHELI-2026-SERIES-A-000001']) {
      assert.ok(v(n(c)), `${c} باید معتبر باشد`);
    }
  });

  await t('کد خیلی کوتاه رد می‌شود', () => {
    // کمتر از ۴ کاراکتر یعنی فضای حالت کوچک و قابل حدس زدن.
    assert.ok(!v(n('AB')));
    assert.ok(!v(n('1')));
  });

  await t('کد فقط خط تیره رد می‌شود', () => {
    // بدون این بررسی، '----' معتبر شمرده می‌شد.
    assert.ok(!v(n('----')));
    assert.ok(!v(n('-')));
  });

  await t('کاراکتر غیرمجاز رد می‌شود', () => {
    assert.ok(!v(n('CODE!@#')));
    assert.ok(!v(n('کد-فارسی')));
  });

  await t('رشتهٔ خیلی بلند رد می‌شود', () => {
    assert.ok(!v(n('G'.repeat(65))));
  });

  // ── نکتهٔ حیاتیِ ورودِ دستی ──
  //
  // مدیر کد را وارد می‌کند و کاربر همان کد را تایپ می‌کند. اگر این دو
  // مسیر یکسان نرمال نشوند، کدی که مدیر ثبت کرده هرگز پیدا نمی‌شود.
  await t('کدِ مدیر و کدِ کاربر یکسان نرمال می‌شوند', () => {
    const pairs = [
      ['ghp-o234-5678', 'GHP-O234-5678'],   // حروف کوچک (O دست‌نخورده)
      ['GHP ۲۳۴۵ ۶۷۸۹', 'GHP-2345-6789'],   // فاصله + ارقام فارسی
      ['ghp.i234.l678', 'GHP-I234-L678'],   // نقطه (I/L دست‌نخورده)
      ['  GHP--A2B3  ', 'GHP-A2B3'],        // فاصلهٔ اضافی + تیرهٔ تکراری
    ];
    for (const [typed, expected] of pairs) {
      assert.strictEqual(n(typed), expected, `«${typed}» غلط نرمال شد`);
    }
  });

  await t('نرمال‌سازی خودتوان است', () => {
    // اگر این بشکند، کدِ ذخیره‌شده با کدِ تایپ‌شده مطابقت نمی‌کند.
    for (const c of ['ghp o234 ۵۶۷۸', 'QL--2026..0001', 'x7k9']) {
      const once = n(c);
      assert.strictEqual(n(once), once, `«${c}» خودتوان نیست`);
    }
  });

  await t('fold حروف مبهم را یکی می‌کند ولی کد را خراب نمی‌کند', () => {
    const f = svc.foldPhotoCode;
    // کدِ اصلی سالم می‌ماند...
    assert.strictEqual(n('QL-2026-O001'), 'QL-2026-O001');
    // ...ولی برای پیدا کردن، هر دو شکل به یک کلید می‌رسند. کاربری که
    // روی کارت O می‌بیند و 0 تایپ می‌کند باید کدش پیدا شود.
    assert.strictEqual(f('QL-2026-O001'), f('QL-2026-0001'));
    assert.strictEqual(f('GHPI123'), f('GHP1123'));
    assert.strictEqual(f('GHPL123'), f('GHP1123'));
  });

  await t('fold با ستونِ تولیدشدهٔ دیتابیس یکی است', () => {
    // معادلِ translate(upper(code),'OIL','011') در مایگریشن ۰۳۵.
    // اگر این دو واگرا شوند، درج و جست‌وجو دو کلید متفاوت می‌سازند و
    // هیچ کدی پیدا نمی‌شود.
    const f = svc.foldPhotoCode;
    const sqlEquivalent = c => c.toUpperCase()
      .split('').map(ch => ({ O: '0', I: '1', L: '1' }[ch] || ch)).join('');
    for (const c of ['QL-2026-O001', 'HELLO-WORLD', 'X7K9', 'OIL-OIL-OIL', 'abc-def']) {
      assert.strictEqual(f(c), sqlEquivalent(c), `fold برای ${c} ناهماهنگ است`);
    }
  });

  await t('کد پیشنهادی معتبر و خودتوان است', () => {
    // suggestCode فقط راهنمای طراحیِ چاپ است، ولی اگر مالک از آن
    // استفاده کند نباید زیر نرمال‌سازی عوض شود.
    for (let i = 0; i < 300; i++) {
      const c = svc.suggestCode();
      assert.ok(v(c), `${c} نامعتبر است`);
      assert.strictEqual(n(c), c, `${c} زیر نرمال‌سازی عوض شد`);
    }
  });

  await t('الفبای پیشنهادی کاراکتر مبهم ندارد', () => {
    for (const ch of 'OIL01U') {
      assert.ok(!svc.CODE_ALPHABET.includes(ch),
        `الفبا نباید ${ch} داشته باشد`);
    }
  });

  await t('جداکننده‌های مختلف در ورودِ انبوه', () => {
    // مدیر ممکن است از اکسل، فایل متنی یا دستی کپی کند. این همان
    // تفکیکی است که مسیر ورودِ انبوه انجام می‌دهد.
    const raw = 'GHP-0001\nGHP-0002,GHP-0003;GHP-0004\tGHP-0005 GHP-0006،GHP-0007';
    const parsed = raw.split(/[\n,;\t، ]+/).map(n).filter(Boolean);
    assert.strictEqual(parsed.length, 7, `${parsed.length} کد تفکیک شد`);
    for (const c of parsed) assert.ok(v(c), `${c} نامعتبر`);
  });

  await t('تکراری در همان ورودی تشخیص داده می‌شود', () => {
    // «ghp-0001» و «GHP-0001» یک کدند؛ اگر هر دو درج شوند، دومی با
    // خطای یکتایی می‌افتد و گزارش برای مدیر گیج‌کننده می‌شود.
    const raw = 'GHP-0001\nghp-0001\nGHP-0002';
    const seen = new Set();
    const dupes = [];
    const uniq = [];
    for (const c of raw.split(/[\n,;\t، ]+/).map(n).filter(Boolean)) {
      if (seen.has(c)) { dupes.push(c); continue; }
      seen.add(c); uniq.push(c);
    }
    assert.strictEqual(uniq.length, 2);
    assert.strictEqual(dupes.length, 1);
  });
}

// ───────────────────────────────────────────────────────────────────────────
// ۴. موتور تطبیق تصویر
// ───────────────────────────────────────────────────────────────────────────

/**
 * یک «کارت» ساختگی با پالت و ترکیب‌بندی مشخص می‌سازد.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این‌قدر شلوغ است و نه چند شکلِ ساده
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * نسخهٔ اول فقط یک مستطیل، یک دایره و دو نوار داشت. اندازه‌گیری نشان
 * داد آن تصویر فقط **۵۱ بیت از ۲۵۶** بیتِ dHash را روشن می‌کند، در
 * حالی که یک کارتِ فوتبالیِ واقعی ۱۳۳ بیت روشن می‌کند.
 *
 * یعنی کارتِ ساختگی تقریباً بی‌بافت بود و رفتارش هیچ ربطی به کارتِ
 * واقعی نداشت. تستی که روی آن سبز یا قرمز شود، دربارهٔ محصولِ واقعی
 * چیزی نمی‌گوید — بدترین نوعِ تست.
 *
 * حالا نویزِ ریز، خطوطِ مورب، شکل‌های هم‌پوشان و یک شمارهٔ بزرگ اضافه
 * شده تا چگالیِ لبه به کارتِ واقعی نزدیک شود.
 */
async function makeCard({ hue, seed = 1, w = 400, h = 620 }) {
  const band = Math.floor(h * 0.22);
  const lines = [];
  // خطوطِ مورب: بافتِ پس‌زمینه، مثل الگوی پارچه یا نورِ استادیوم.
  for (let i = -h; i < w + h; i += 11) {
    lines.push(`<line x1="${i}" y1="0" x2="${i + h}" y2="${h}" `
      + `stroke="hsl(${(hue + i) % 360},60%,${35 + (i % 25)}%)" stroke-width="3"/>`);
  }
  // نقاطِ پراکنده: جزئیاتِ ریز که در عکسِ واقعی فراوان‌اند.
  const dots = [];
  let r = seed * 7919;
  const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 140; i++) {
    dots.push(`<circle cx="${(rnd() * w).toFixed(0)}" cy="${(rnd() * h).toFixed(0)}" `
      + `r="${(1 + rnd() * 3).toFixed(1)}" fill="hsl(${((hue + i * 13) % 360)},`
      + `${(50 + rnd() * 40).toFixed(0)}%,${(30 + rnd() * 55).toFixed(0)}%)"/>`);
  }
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${w}" height="${h}" fill="hsl(${hue},70%,28%)"/>
    ${lines.join('')}
    <rect y="0" width="${w}" height="${band}" fill="hsl(${(hue + 40) % 360},80%,55%)"/>
    <circle cx="${w * 0.5}" cy="${h * 0.45}" r="${w * 0.26}"
            fill="hsl(${(hue + 180) % 360},75%,${45 + (seed % 20)}%)"/>
    <polygon points="${w * 0.2},${h * 0.3} ${w * 0.8},${h * 0.25} ${w * 0.6},${h * 0.7}"
             fill="hsl(${(hue + 120) % 360},65%,50%)" opacity="0.55"/>
    ${dots.join('')}
    <rect y="${h - band}" width="${w}" height="${band}"
          fill="hsl(${(hue + 90) % 360},65%,${30 + (seed % 25)}%)"/>
    <text x="${w * 0.5}" y="${h * 0.52}" font-size="${w * 0.3}" font-weight="bold"
          text-anchor="middle" fill="#ffffff" opacity="0.9">${seed}</text>
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

  // ═══════════════════════════════════════════════════════════════════════
  // نگهبانِ «رفت‌وبرگشتِ دیتابیس»
  // ═══════════════════════════════════════════════════════════════════════
  //
  // باگی که این تست جلویش را می‌گیرد در تولید رخ داد و **هیچ تستی**
  // نگرفتش: سیگنالِ `texSig` به موتور اضافه شد ولی ستونِ دیتابیس نه.
  //
  // چرا تست‌های موجود کور بودند: همه‌شان هر دو اثرانگشت را در حافظه
  // می‌سازند، پس هر دو `texSig` دارند و `hasTex` همیشه true است.
  // فقط مسیرِ واقعی — «ذخیره کن، بخوان، مقایسه کن» — تفاوت را نشان
  // می‌دهد.
  //
  // اینجا آن مسیر شبیه‌سازی می‌شود: هر فیلدی که موتور تولید می‌کند
  // باید در فهرستِ ستون‌های ذخیره‌شده باشد.
  await t('هر فیلدِ اثرانگشت مسیرِ ماندگاری دارد', async () => {
    const f = await fp.fingerprint(await makeCard({ hue: 40, seed: 3 }));

    // ══════════════════════════════════════════════════════════════════
    // فهرست از **مایگریشن‌های واقعی** خوانده می‌شود، نه دستی
    // ══════════════════════════════════════════════════════════════════
    //
    // ── چرا عوض شد ──
    //
    // نسخهٔ قبلی یک `Set` دستی داشت. وقتی `rgbSig` و `textTokens` به
    // اثرانگشت اضافه شدند، کسی این فهرست را به‌روز نکرد و تست قرمز شد
    // با پیامِ «ستونِ دیتابیس ندارد» — در حالی که ستون **وجود داشت**
    // (مایگریشن‌های ۰۴۲ و ۰۴۳).
    //
    // یعنی نگهبانی که برای گرفتنِ باگ ساخته شده بود، خودش هشدارِ
    // دروغین می‌داد. و چون این تست در `npm test` نبود، ماه‌ها کسی
    // ندیدش.
    //
    // حالا نامِ ستون‌ها از خودِ فایل‌های SQL خوانده می‌شود: افزودنِ
    // سیگنالِ تازه بدونِ مایگریشن همچنان قرمز می‌شود، ولی افزودنِ
    // سیگنال **با** مایگریشن خودبه‌خود سبز است.
    const fsx = require('fs');
    const pathx = require('path');
    const migDir = pathx.join(__dirname, '..', 'migrations');
    const sql = fsx.readdirSync(migDir)
      .filter(x => x.endsWith('.sql'))
      .map(x => fsx.readFileSync(pathx.join(migDir, x), 'utf8'))
      .join('\n');

    // نگاشتِ نامِ کلیدِ اثرانگشت → نامِ ستون (camelCase → snake_case).
    const columnFor = (key) => key
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toLowerCase()
      .replace(/_sig$/, '_sig');

    // فیلدهایی که عمداً ذخیره نمی‌شوند.
    const transient = new Set(['version']);

    for (const key of Object.keys(f)) {
      if (transient.has(key)) continue;
      const col = columnFor(key);
      assert.ok(sql.includes(col),
        `فیلدِ «${key}» در اثرانگشت هست ولی ستونِ «${col}» در هیچ `
        + 'مایگریشنی نیست — همان باگی که texSig داشت. یا مایگریشن '
        + 'بنویس یا فیلد را به transient ببر.');
    }
  });

  await t('اثرانگشتِ بدونِ بافت امتیازِ متفاوت نمی‌دهد', async () => {
    // این همان علامتِ باگ بود: طرحِ ذخیره‌شده بافت نداشت و همان تصویر
    // با خودش امتیازی غیر از ۱.۰ می‌گرفت.
    const buf = await makeCard({ hue: 88, seed: 4 });
    const full = await fp.fingerprint(buf);
    const withTex = fp.similarity(full, full);
    assert.ok(withTex > 0.999, `تصویر با خودش باید ۱ باشد، شد ${withTex}`);

    // حالا یک طرف را از بافت محروم کن — مثل خواندن از ستونِ خالی.
    const noTex = { ...full, texSig: [] };
    const mixed = fp.similarity(full, noTex);
    // نباید کرش کند و نباید صفر شود؛ فقط فرمولِ جایگزین به کار می‌رود.
    assert.ok(mixed > 0.9,
      `افتِ ناگهانی وقتی یک طرف بافت ندارد: ${mixed.toFixed(3)}`);
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
  await testAdminEnteredCodes();
  await testMatching();

  for (const r of results) console.log(r);
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} تست موفق، ${fail} ناموفق`);
  process.exit(fail === 0 ? 0 : 1);
})();
