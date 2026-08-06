/**
 * نگهبانِ برشِ خودکارِ کارت.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این تست‌ها
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * برش دو جور می‌تواند خراب شود و **جهتِ خرابی مهم‌تر از خودِ خرابی است**:
 *
 *   • نبریدن  → بی‌اثر است. سیستم دقیقاً مثل قبل کار می‌کند.
 *   • بدبریدن → فاجعه. اگر نصفِ کارت بریده شود، اثرانگشت کاملاً عوض
 *     می‌شود و کاربرِ درستکار رد می‌شود، بدونِ هیچ پیامِ خطایی.
 *
 * پس بیشترِ این تست‌ها دربارهٔ «کِی **نباید** ببُرد» است.
 *
 * دو باگِ واقعی که همین تست‌ها گرفتند و در کد مستند شده‌اند:
 *   ۱. طرحِ تمام‌کادر به نصف بریده می‌شد (حاشیه خودش کارت بود)
 *   ۲. معیارِ یکدستی `p75` بود که در صحنهٔ واقعی گوشه‌های کارت را
 *      می‌شمرد؛ باید `p50` می‌بود
 */
const sharp = require('sharp');

const crop = require('../src/services/cardCrop');
const fp = require('../src/services/imageFingerprint');

let pass = 0;
let fail = 0;

function ck(name, cond, detail = '') {
  if (cond) { pass += 1; console.log('  ✓', name); }
  else { fail += 1; console.log('  ✗', name, detail ? `→ ${detail}` : ''); }
}

/** کارتِ آزمایشی — طرحِ تمیز بدونِ پس‌زمینه. */
function cardSvg(name = 'DEMBELE', num = '7') {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="620" height="930">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stop-color="#1e3a8a"/><stop offset="100%" stop-color="#0a1a3d"/></linearGradient></defs>
<rect width="620" height="930" fill="url(#g)"/>
<circle cx="310" cy="300" r="150" fill="#c89a72"/>
<rect x="180" y="470" width="260" height="230" rx="18" fill="#1e40af" stroke="#fff" stroke-width="3"/>
<text x="310" y="640" font-size="150" font-weight="bold" fill="#ffd700" text-anchor="middle">${num}</text>
<text x="310" y="800" font-size="72" font-weight="bold" fill="#ffd700" text-anchor="middle">${name}</text>
</svg>`);
}

/** کارت را روی پس‌زمینه‌ای می‌گذارد، اختیاراً کج. */
async function onBackground(cardBuf, bgColor, rotate = 0, scale = 0.62) {
  const card = rotate
    ? await sharp(cardBuf).rotate(rotate,
      { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    : cardBuf;
  const m = await sharp(card).metadata();
  const W = Math.round(m.width / scale);
  const H = Math.round(m.height / scale);
  const bg = await sharp({
    create: { width: W, height: H, channels: 3, background: bgColor },
  }).png().toBuffer();
  return sharp(bg).composite([{
    input: card,
    top: Math.round((H - m.height) / 2),
    left: Math.round((W - m.width) / 2),
  }]).jpeg({ quality: 75 }).toBuffer();
}

(async () => {
  const clean = await sharp(cardSvg()).png().toBuffer();

  console.log('\n══ ۱. کِی باید ببُرد ══');
  for (const [label, color] of [
    ['میزِ روشن', '#f0f0ee'],
    ['میزِ تیره', '#2a2118'],
    ['کاغذِ خاکستری', '#9a9a96'],
    ['چوبی', '#6b4423'],
  ]) {
    const scene = await onBackground(clean, color);
    const r = await crop.cropCard(scene);
    ck(`پس‌زمینهٔ ${label}`, r.cropped,
      r.cropped ? '' : 'نبرید — کارت در پس‌زمینه گم می‌ماند');
  }

  const tilted = await onBackground(clean, '#6b4423', 9);
  const rt = await crop.cropCard(tilted);
  ck('کارتِ کج روی میزِ چوبی', rt.cropped,
    rt.cropped ? `مساحت ${rt.box.ratio}` : 'نبرید');

  console.log('\n══ ۲. کِی **نباید** ببُرد ══');
  // ── باگی که این تست گرفت ──
  //
  // نسخهٔ اول طرحِ تمام‌کادرِ ۶۲۰×۹۳۰ را به ۲۹۱×۹۳۰ برید — نصفِ کارت
  // دور ریخته شد. علتش این بود که وقتی کلِ کادر خودِ کارت است، نوارِ
  // حاشیه هم بخشی از کارت است و «رنگِ پس‌زمینه» می‌شود رنگِ گوشهٔ کارت.
  const rc = await crop.cropCard(clean);
  ck('طرحِ تمام‌کادر دست‌نخورده می‌ماند', !rc.cropped,
    rc.cropped ? `بریده شد ${rc.box.width}×${rc.box.height} — نصفِ کارت رفت` : '');

  const tiny = await sharp({
    create: { width: 50, height: 50, channels: 3, background: '#888' },
  }).png().toBuffer();
  const rtiny = await crop.cropCard(tiny);
  ck('تصویرِ خیلی کوچک دست‌نخورده می‌ماند', !rtiny.cropped);

  const flat = await sharp({
    create: { width: 400, height: 600, channels: 3, background: '#7a7a7a' },
  }).jpeg().toBuffer();
  const rflat = await crop.cropCard(flat);
  ck('تصویرِ کاملاً یکدست دست‌نخورده می‌ماند', !rflat.cropped,
    rflat.cropped ? JSON.stringify(rflat.box) : '');

  console.log('\n══ ۳. هرگز کرش نمی‌کند ══');
  for (const [label, bad] of [
    ['بافرِ خالی', Buffer.alloc(0)],
    ['بایتِ تصادفی', Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])],
    ['متنِ ساده', Buffer.from('این تصویر نیست')],
  ]) {
    let threw = false;
    let out = null;
    try { out = await crop.cropCard(bad); } catch { threw = true; }
    ck(`${label} استثنا نمی‌دهد`, !threw && out && out.cropped === false);
  }

  console.log('\n══ ۴. برش واقعاً تشخیص را بهتر می‌کند ══');
  // ── معیارِ نهایی ──
  //
  // برش فقط وقتی ارزش دارد که نمرهٔ شباهت با طرحِ مرجع را بالا ببرد.
  // اگر این تست قرمز شود، یعنی برش دارد چیزی را خراب می‌کند حتی اگر
  // بقیهٔ تست‌ها سبز باشند.
  const ref = await fp.fingerprint(clean);
  const scene = await onBackground(clean, '#6b4423', 9);
  const before = fp.combinedSimilarity(await fp.fingerprint(scene), ref);
  const cropped = await crop.cropCard(scene);
  const after = fp.combinedSimilarity(
    await fp.fingerprint(cropped.buffer), ref);
  ck(`شباهت بالا رفت (${before.toFixed(3)} → ${after.toFixed(3)})`,
    after > before + 0.05,
    'برش باید تشخیص را بهبود دهد، وگرنه فقط ریسک است');

  console.log('\n══ ۵. برش کارتِ اشتباه نمی‌سازد ══');
  // اگر برش دو کارتِ متفاوت را به هم شبیه کند، بدتر از نبریدنش است.
  const other = await sharp(cardSvg('HAKIMI', '2')).png().toBuffer();
  const otherRef = await fp.fingerprint(other);
  const crossBefore = fp.combinedSimilarity(await fp.fingerprint(scene), otherRef);
  const crossAfter = fp.combinedSimilarity(
    await fp.fingerprint(cropped.buffer), otherRef);
  ck('کارتِ بی‌ربط بعد از برش هم پایین می‌ماند',
    crossAfter < after,
    `خودی=${after.toFixed(3)} بی‌ربط=${crossAfter.toFixed(3)} `
    + `(قبل از برش ${crossBefore.toFixed(3)})`);

  console.log(`\n${fail ? '✗' : '✓'} ${pass} موفق، ${fail} ناموفق\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('✗ استثنا:', e);
  process.exit(1);
});
