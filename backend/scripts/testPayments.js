// تست لایهٔ شارژ کیف پول (کافه‌بازار)
//
// این تست‌ها بدون دیتابیس اجرا می‌شوند: فقط قراردادها و ثابت‌هایی را
// می‌سنجند که اگر بشکنند، «پولِ پرداخت‌شده شارژ نمی‌شود» — یعنی بدترین
// نوع باگ در یک اپ پولی، چون کاربر پول داده و چیزی نگرفته.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(label, cond) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}
function section(t) { console.log(`\n== ${t} ==`); }

const root = path.join(__dirname, '..');
const svc = fs.readFileSync(path.join(root, 'src/services/paymentService.js'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'src/routes/payments.js'), 'utf8');
const walletSvc = fs.readFileSync(path.join(root, 'src/services/walletService.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations/067_payment_orders.sql'), 'utf8');
const server = fs.readFileSync(path.join(root, 'src/server.js'), 'utf8');

// ───────────────────────────────────────────────────────────────────────
section('همسانی منبع تراکنش بین کد و دیتابیس');
// این دقیقاً همان باگی است که در بازبینی گرفته شد: `topup` به مایگریشن
// اضافه شده بود ولی به VALID_SOURCES نه — نتیجه: هر شارژ با خطای
// «منبع تراکنش نامعتبر» رد می‌شد، بعد از اینکه کاربر پول داده بود.
const jsSources = (walletSvc.match(/const VALID_SOURCES = new Set\(\[([\s\S]*?)\]\);/)[1]
  .match(/'([a-z_]+)'/g) || []).map(s => s.replace(/'/g, ''));
const chkBlock = migration.match(/source\s+IN\s*\(([\s\S]*?)\)/i);
const sqlSources = ((chkBlock ? chkBlock[1] : '').match(/'([a-z_]+)'/g) || [])
  .map(s => s.replace(/'/g, ''));

ok('topup در VALID_SOURCES هست', jsSources.includes('topup'));
ok('topup_refund در VALID_SOURCES هست', jsSources.includes('topup_refund'));
ok('topup در CHECK مایگریشن هست', sqlSources.includes('topup'));
ok('فهرست JS و CHECK دقیقاً یکی است',
  jsSources.length === sqlSources.length &&
  jsSources.every(s => sqlSources.includes(s)));

// ───────────────────────────────────────────────────────────────────────
section('ضدتقلب — مبلغ هرگز از کلاینت خوانده نمی‌شود');
ok('روت‌ها amount را از body نمی‌خوانند', !/body\??\.\s*amount/.test(routes));
ok('createOrder مبلغ را از جدول محصولات می‌گیرد',
  /PRODUCTS\[[^\]]+\]/.test(svc) && /product\.amount/.test(svc));
ok('verifyAndCredit مبلغ را از سفارشِ ذخیره‌شده می‌خواند',
  /Number\(order\.amount\)/.test(svc));

// ───────────────────────────────────────────────────────────────────────
section('ایدمپوتنسی — یک پرداخت دو بار شارژ نمی‌شود');
ok('سفارشِ paid دوباره شارژ نمی‌شود',
  /status === 'paid'/.test(svc) && /alreadyProcessed: true/.test(svc));
ok('UPDATE فقط روی سفارشِ pending اثر دارد',
  /WHERE id=\$1 AND status='pending'/.test(svc));
ok('برخورد UNIQUE توکن (23505) گرفته می‌شود', /'23505'/.test(svc));
ok('مایگریشن UNIQUE روی توکن دارد',
  /UNIQUE/i.test(migration) && /purchase_token/.test(migration));
ok('شارژ داخل تراکنش است', /BEGIN/.test(svc) && /COMMIT/.test(svc));
ok('در خطا ROLLBACK می‌شود', /ROLLBACK/.test(svc));

// ───────────────────────────────────────────────────────────────────────
section('راستی‌آزمایی سمت سرور');
ok('توکن با API کافه‌بازار چک می‌شود', /verifyWithBazaar/.test(svc));
ok('فقط purchaseState صفر موفق است', /purchaseState/.test(svc));
ok('دامنهٔ رسمی پرداخت بازار', /pardakht\.cafebazaar\.ir/.test(svc));
ok('پرداخت تأییدنشده سفارش را failed می‌کند', /status='failed'/.test(svc));

// ───────────────────────────────────────────────────────────────────────
section('دسترسی و محدودیت نرخ');
const routeLines = routes.split('\n').filter(l => /router\.(get|post)\(/.test(l));
ok('هر چهار روت تعریف شده‌اند', routeLines.length === 4);
ok('همهٔ روت‌ها auth دارند', routeLines.every(l => /auth/.test(l)));
ok('order و verify محدودکنندهٔ نرخ دارند',
  (routes.match(/payLimiter/g) || []).length >= 3);
ok('روت‌ها در server.js ثبت شده‌اند', /require\('\.\/routes\/payments'\)/.test(server));

// ───────────────────────────────────────────────────────────────────────
section('بسته‌های شارژ');
const amounts = [...svc.matchAll(/amount:\s*(\d+)/g)].map(m => Number(m[1]));
ok('پنج بسته تعریف شده', amounts.length === 5);
ok('بسته‌ها صعودی‌اند', amounts.every((v, i) => i === 0 || v > amounts[i - 1]));
ok('بسته‌ای هست که پلاس ماهانه (۵۹٬۰۰۰) را پوشش دهد', amounts.some(a => a >= 59000));
ok('بسته‌ای هست که پلاس سالانه (۴۹۹٬۰۰۰) را پوشش دهد', amounts.some(a => a >= 499000));
ok('شناسهٔ محصول‌ها با پیشوند یکسان', (svc.match(/ghelgheli_wallet_/g) || []).length >= 5);

console.log(`\n${fail ? '✗' : '✓'} ${pass} تست موفق، ${fail} ناموفق`);
process.exit(fail ? 1 : 0);
