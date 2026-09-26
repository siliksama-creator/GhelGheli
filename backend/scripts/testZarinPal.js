// ═════════════════════════════════════════════════════════════════════
// تست آفلاین درگاه زرین‌پال — واحدِ خالص + پین‌های امنیتی/یکپارچگی
// ═════════════════════════════════════════════════════════════════════
// این تست شبکه/خرید واقعی ندارد. قراردادهای حیاتی را قفل می‌کند: مبلغ از
// سفارش (نه پرس‌استرینگ)، تحویل فقط پس از verify و داخل تراکنش، ریدایرکت
// فقط به Origin مجاز، تنظیم زنده از پنل، و این‌که فعال‌سازی زرین‌پال به
// شناسهٔ محصول کافه‌بازار وابسته نماند.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
};

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const zp = require('../src/services/zarinpalService');

console.log('\n══ ۱. واحدهای خالص ══');
ok(zp.tomanToRial(5000) === 50000, 'تومان→ریال: ۵۰۰۰ → ۵۰۰۰۰');
ok(zp.tomanToRial(0) === 0 && zp.tomanToRial('x') === 0, 'ورودی بد → صفر (نه NaN)');
ok(zp.messageForCode(102).includes('انصراف'), 'کد ۱۰۲ = انصرافِ کاربر (فارسی)');
ok(zp.messageForCode(-53).includes('سقف'), 'کد -۵۳ = سقف مبلغ (فارسی)');
ok(zp.messageForCode(999).includes('999') || zp.messageForCode(999).includes('۹۹۹'),
  'کد ناشناخته هم پیام دارد و کد را نشان می‌دهد');
ok(zp.merchantLooksValid('11111111-2222-3333-4444-555555555555'), 'مرچنت UUID معتبر');
ok(!zp.merchantLooksValid('1234') && !zp.merchantLooksValid(''), 'مرچنت بد رد می‌شود');
ok(zp.startPayUrl('A1', false).startsWith('https://www.zarinpal.com/pg/StartPay/A1'),
  'آدرس پرداخت عادی');
ok(zp.startPayUrl('A1', true).startsWith('https://sandbox.zarinpal.com/'),
  'آدرس پرداخت سندباکس');

console.log('\n══ ۲. پین‌های امنیتیِ روت ══');
const route = read('src/routes/zarinpal.js');
const service = read('src/services/zarinpalService.js');
ok(/async function stats\(/.test(service), 'آمار سفارش‌های زرین‌پال برای پنل وجود دارد');
ok(/FROM payment_orders WHERE provider='zarinpal'/.test(service),
  'آمار فقط سفارش‌های زرین‌پال را می‌شمارد');
ok(/stats,/.test(route) && /recent/.test(service),
  'صفحهٔ ادمین فهرست سفارش‌های اخیر را می‌گیرد');
ok(/api\.zarinpal\.com|API_BASE/.test(service),
  'سرویس از API نسخهٔ ۴ زرین‌پال استفاده می‌کند');
ok(route.includes("status !== 'OK'") && route.includes("back('cancel')"),
  'انصرافِ کاربر در کال‌بک = سفارش failed و برگشتِ cancel');
ok(/verifyPayment\(\{ amountRial, authority \}\)/.test(route),
  'مبلغِ verify از سفارش خوانده می‌شود نه از پرس‌استرینگ');
ok(route.includes("WHERE id=$1 AND status='pending'"),
  'ادعای paid فقط روی pending (رقابتِ هم‌زمان برد ندارد)');
ok(route.includes('deliverForOrder(client'),
  'تحویل داخل همان تراکنشِ ادعا');
ok(route.includes('granted_reference_id'),
  'مرجعِ تحویل پس از کال‌بک روی سفارش ذخیره می‌شود');
ok(route.includes('CORS_ORIGIN') && route.includes('PUBLIC_WEB_URL') && route.includes('allowedOrigin'),
  'مقصدِ ریدایرکت فقط Origin مجاز یا دامنهٔ عمومیِ تاییدشده (ضد open-redirect)');
ok(route.includes("zp.merchantLooksValid(merchantId)"),
  'پنل: مرچنت‌کد باید UUID باشد وگرنه ۴۰۰');
ok(route.includes("ON CONFLICT (key) DO UPDATE"),
  'تنظیمِ زنده با upsert روی app_settings (بدون ری‌استارت)');
ok(route.includes('audit('), 'تغییر تنظیمات درگاه audit می‌شود');
ok(!/req\.query\.(amount|Amount)/.test(route),
  'هیچ مبلغی از پرس‌استرینگ خوانده نمی‌شود');
ok(route.includes("status = String(req.query.Status") && route.includes('.toUpperCase()'),
  'Status کال‌بک با حروف بزرگ نرمال می‌شود');

console.log('\n══ ۳. یکپارچگی با بقیهٔ سیستم ══');
const svc = read('src/services/paymentService.js');
ok((svc.match(/provider = 'cafebazaar'/g) || []).length >= 3,
  'سازنده‌های سفارش provider پیش‌فرض بازار را نگه داشته‌اند (سازگاری عقبي)');
ok(svc.includes("provider !== 'zarinpal' && !configured()"),
  'گذرگاه زرین‌پال از گیتِ بازار مستقل است');
ok(svc.includes("provider === 'zarinpal' ? null : productForPrice"),
  'زرین‌پال به productId کافه‌بازار وابسته نیست و مبلغ آزاد دارد');
ok(svc.includes("$6, $3::varchar, 'pending', 'shop_item'")
  && svc.includes("$4, $3::varchar, 'pending', 'card_box'")
  && svc.includes("$6, $3::varchar, 'pending', $4, $5"),
  'ستون‌های provider/product_id در سه سازنده جابه‌جا نشده‌اند و null بی‌نوع نیست');
ok(route.includes("jsonb_build_object('authority', $3::text, 'amount_rial', $4::bigint, 'web_origin', $5::text)"),
  'jsonb_build_object پارامتر بی‌نوع ندارد');
const shop = read('src/services/shopService.js');
ok(shop.includes('async function deliverForOrder(') && shop.includes('deliverForOrder,'),
  'تحویلِ مشترک بین verify بازار و کال‌بک زرین‌پال');
ok(shop.includes("provider = 'cafebazaar'"),
  'خرید آیتم امکان انتخاب provider دارد و پیش‌فرض قدیمی حفظ شده');
ok(shop.includes('createShopOrder(userId, slug, { provider })'),
  'موجودی صفر کیف پول، درگاه درخواستی (زرین‌پال) را دور نمی‌اندازد');
const cfg = read('src/routes/clientConfig.js');
ok(cfg.includes('zarinpalEnabled'),
  '/api/config پرچم زندهٔ درگاه را به وب و اندروید می‌دهد');
const server = read('src/server.js');
ok(server.includes("require('./routes/zarinpal')"), 'روت زرین‌پال در سرور mount شده');
const manifest = read('docs/api-manifest.json');
for (const ep of ['/api/payments/zarinpal/order', '/api/payments/zarinpal/callback',
  '/api/payments/zarinpal/order/:id', '/api/admin/payments/zarinpal']) {
  ok(manifest.includes(ep), `مانیفست: ${ep}`);
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} موفق، ${fail} ناموفق\n`);
process.exit(fail ? 1 : 0);
