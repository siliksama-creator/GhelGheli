/* گاردِ هدرهای کش — علیه «کاربر کدِ جدید را نمی‌بیند».
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این گارد وجود دارد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * nginx برای userweb هیچ `Cache-Control` روی `index.html` نمی‌گذاشت. طبق
 * قاعدهٔ اکتشافیِ RFC 9111، مرورگر برای پاسخِ بدونِ هدرِ کش خودش عمری
 * می‌سازد: حدودِ ۱۰٪ فاصلهٔ `Last-Modified` تا حالا. برای فایلی که هفته‌ها
 * پیش ساخته شده یعنی روزها کشِ سکوت‌آمیز.
 *
 * پیامدش مرگبار است چون Vite نامِ باندل را hash می‌کند: `index.html` کهنه
 * تا ابد به `index-OLD.js` اشاره می‌کند و آن فایل هم `max-age=1y` دارد و
 * واقعاً روی دیسک هست. یعنی هر دو درخواست ۲۰۰ می‌گیرند، هیچ خطایی در
 * کنسول نیست، `/health` سبز است، دیپلوی موفق گزارش می‌شود — و کاربرِ
 * قدیمی ماه‌ها اپِ قدیمی را می‌بیند.
 *
 * این دقیقاً همان چیزی است که صندوقِ کارت را «ناموجود» کرد: کد درست بود،
 * روی سرور بود، تستِ مرورگرِ تازه سبز بود؛ فقط گوشیِ کاربر هیچ‌وقت
 * index.html جدید را نخواست.
 *
 * قاعده: هر چیزی که نامش ثابت است باید revalidate شود؛ هر چیزی که نامش
 * hash دارد می‌تواند برای همیشه کش شود.
 *
 * اجرا:  node tool/cache-headers.mjs [origin]
 */

const ORIGIN = process.argv[2] || 'https://user.ghelghelishop.ir';

// نامِ ثابت ⇒ نباید کشِ ماندگار داشته باشد.
const MUST_REVALIDATE = ['/', '/index.html', '/image-cache-sw.js'];

const fails = [];
const pass = (m) => console.log('  ✅', m);
const fail = (m) => { console.log('  ❌', m); fails.push(m); };

async function head(path) {
  const res = await fetch(ORIGIN + path, { redirect: 'manual' });
  await res.arrayBuffer().catch(() => {});
  return {
    status: res.status,
    cc: (res.headers.get('cache-control') || '').toLowerCase(),
    expires: res.headers.get('expires'),
    type: (res.headers.get('content-type') || '').toLowerCase(),
  };
}

console.log(`\nگاردِ هدرهای کش — ${ORIGIN}\n`);

console.log('۱) نقاطِ ورودیِ نام‌ثابت باید revalidate شوند:');
for (const p of MUST_REVALIDATE) {
  const r = await head(p);
  if (r.status >= 400) { fail(`${p} → HTTP ${r.status}`); continue; }

  // خالی‌بودن هدر بدترین حالت است: مرورگر خودش عمر اختراع می‌کند.
  if (!r.cc) {
    fail(`${p} هیچ Cache-Control ندارد ⇒ کشِ اکتشافیِ مرورگر (باگِ صندوق)`);
    continue;
  }
  const ok = r.cc.includes('no-cache') || r.cc.includes('no-store')
    || r.cc.includes('must-revalidate') || /max-age=0(\D|$)/.test(r.cc);
  ok ? pass(`${p} → ${r.cc}`) : fail(`${p} کشِ ماندگار دارد: ${r.cc}`);
}

console.log('\n۲) باندلِ hashدار باید ماندگار کش شود (سرعت):');
const html = await (await fetch(ORIGIN + '/')).text();
const assets = [...html.matchAll(/\/assets\/[A-Za-z0-9._-]+\.(?:js|css)/g)].map(m => m[0]);
if (!assets.length) fail('هیچ /assets/ در index.html پیدا نشد');
for (const a of [...new Set(assets)]) {
  const r = await head(a);
  if (r.status !== 200) { fail(`${a} → HTTP ${r.status}`); continue; }
  const m = /max-age=(\d+)/.exec(r.cc);
  (m && Number(m[1]) >= 86400)
    ? pass(`${a} → max-age=${m[1]}`)
    : fail(`${a} کشِ ماندگار ندارد (${r.cc || 'خالی'}) ⇒ دانلودِ تکراری`);
}

console.log('\n۳) index.html سرو‌شده باید به باندلِ موجود اشاره کند:');
for (const a of [...new Set(assets)]) {
  const r = await head(a);
  r.status === 200 ? pass(`${a} موجود است`)
    : fail(`${a} → HTTP ${r.status} (index.html به فایلِ نبود اشاره می‌کند)`);
}

console.log('\n۴) SPA fallback نباید جای فایلِ واقعی را بگیرد:');
const sw = await head('/image-cache-sw.js');
sw.type.includes('javascript')
  ? pass(`image-cache-sw.js → ${sw.type}`)
  : fail(`image-cache-sw.js نوعش ${sw.type} است ⇒ nginx به‌جایش index.html می‌دهد`);

console.log(fails.length ? `\n❌ ${fails.length} ایراد\n` : '\n✅ همهٔ هدرهای کش سالم‌اند\n');
process.exit(fails.length ? 1 : 0);
