// تست لایهٔ خرید مستقیم از کافه‌بازار
//
// این تست‌ها بدون دیتابیس اجرا می‌شوند: فقط قراردادها و ثابت‌هایی را
// می‌سنجند که اگر بشکنند، «کاربر پول می‌دهد و چیزی نمی‌گیرد» — یعنی
// بدترین نوع باگ در یک اپ پولی.
//
// معماری‌ای که این فایل نگهبانش است (تصمیم مالک، دور ۱۸):
//
//     کیف پول  = پولِ خودِ کاربر. ورودی: کارت نقدی/لیگ/گردونه/کمیسیون.
//                خروجی: فقط برداشت. ✗ هرگز خرج خرید نمی‌شود.
//     خرید     = ۱۰۰٪ از کافه‌بازار. ✗ هرگز از کیف پول.
//
// اگر روزی کسی دوباره `wallet.debit` را به مسیر خرید برگرداند، تست‌های
// «تفکیک کیف پول از خرید» قرمز می‌شوند.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(label, cond) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}
function section(t) { console.log(`\n== ${t} ==`); }

const root = path.join(__dirname, '..');
const R = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const svc      = R('src/services/paymentService.js');
const routes   = R('src/routes/payments.js');
const walletSvc= R('src/services/walletService.js');
const shopSvc  = R('src/services/shopService.js');
const referral = R('src/services/referralService.js');
const server   = R('src/server.js');
const mig067   = R('migrations/067_payment_orders.sql');
const mig068   = R('migrations/068_direct_purchase.sql');

// ───────────────────────────────────────────────────────────────────────
section('تفکیک کیف پول از خرید');
// مهم‌ترین بخش. مالک صریحاً خواست خرید هرگز از کیف پول کم نکند.
// ⚠️ بازنگری دور ۲۳: این دو تست قانونِ دورِ ۲۰ را رمزگذاری می‌کردند
// («خرید هرگز از کیف پول کم نکند»). دورِ ۲۲ آن قانون را عمداً نقض کرد:
// کاربری که از لیگ یا جایزهٔ نقدی پول گرفته باید بتواند همان را در شاپ
// خرج کند. پس شرط درست دیگر «کیف پول دست نخورد» نیست، بلکه:
//   ۱) کسر از کیف پول فقط با درخواستِ صریحِ کلاینت (`useWallet`)،
//   ۲) مسیرِ پیش‌فرض همچنان سفارشِ بازار باشد،
//   ۳) خریدِ کیف‌پولی کمیسیونِ معرف ندهد.
ok('کسر از کیف پول فقط با useWallet صریح انجام می‌شود',
  /useWallet\s*=\s*false/.test(shopSvc)
  && /if\s*\(!useWallet\)\s*return\s+payments\.createShopOrder/.test(shopSvc));
ok('هر debit کیف پولی در shopService با منبع shop و مرجع آیتم است',
  !/wallet\.debit\s*\(/.test(shopSvc)
  || /wallet\.debit\([\s\S]{0,200}?source:\s*'shop'[\s\S]{0,200}?referenceType:\s*'shop_item'/.test(shopSvc));
ok('سهمِ پرداخت‌شده از کیف پول از پایهٔ کمیسیون کسر می‌شود',
  /-\s*\(Number\(walletPaid\)\s*\|\|\s*0\)/.test(shopSvc));
// فهرست را یک‌بار پارس می‌کنیم. regexِ سرراست («'shop' جایی بعد از
// VALID_SOURCES هست؟») اشتباه است، چون LEGACY_SOURCES پایین‌ترش همین
// نام‌ها را عمداً دارد و تست را همیشه سبز/قرمز نشان می‌داد.
const jsSources = (walletSvc.match(/const VALID_SOURCES = new Set\(\[([\s\S]*?)\]\);/)[1]
  .match(/'([a-z_]+)'/g) || []).map(x => x.replace(/'/g, ''));
// 'shop' از دور ۲۲ دوباره زنده است (خرید با موجودی کیف پول) و باید در
// VALID_SOURCES باشد؛ بقیه همچنان مرده‌اند.
for (const dead of ['subscription', 'topup', 'topup_refund']) {
  ok(`منبع ${dead} دیگر تولید نمی‌شود`, !jsSources.includes(dead));
}
ok("منبع shop برای خریدِ کیف‌پولیِ دور ۲۲ مجاز است",
  jsSources.includes('shop'));
ok('منابع قدیمی در LEGACY_SOURCES مستند شده‌اند',
  /LEGACY_SOURCES/.test(walletSvc)
  && /LEGACY_SOURCES[\s\S]*?'shop'[\s\S]*?'subscription'/.test(walletSvc)
  && /LEGACY_SOURCES[\s\S]*?'topup'/.test(walletSvc));

// CHECK دیتابیس باید مقادیر قدیمی را نگه دارد وگرنه ردیف‌های تاریخی
// نامعتبر می‌شوند و مایگریشن روی دیتابیس واقعی می‌ترکد.
ok('CHECK دیتابیس مقادیر تاریخی را نگه داشته',
  /'shop'/.test(mig067) && /'subscription'/.test(mig067) && /'topup'/.test(mig067));
ok('مایگریشن ۰۶۸ منبع جدیدی به دفترکل اضافه نمی‌کند',
  !/ADD CONSTRAINT wallet_transactions_source_check/.test(mig068));

// هر منبعی که کد می‌سازد باید در CHECK دیتابیس باشد. این همان باگی است
// که در دور ۱۷ گرفته شد و می‌توانست پولِ پرداخت‌شده را ببلعد.
const sqlSources = (mig067.match(/CHECK \(source IN \(([\s\S]*?)\)\)/)[1]
  .match(/'([a-z_]+)'/g) || []).map(s => s.replace(/'/g, ''));
const orphans = jsSources.filter(s => !sqlSources.includes(s));
ok(`همهٔ ${jsSources.length} منبع فعال در CHECK دیتابیس هستند`
  + (orphans.length ? ` — یتیم: ${orphans.join(',')}` : ''), orphans.length === 0);
ok('purchase_referral هنوز فعال است (تنها ورودیِ خرید به کیف پول)',
  jsSources.includes('purchase_referral'));
ok('کارت نقدی و لیگ هنوز می‌توانند کیف پول را پر کنند',
  jsSources.includes('card_cash') && jsSources.includes('league'));

// ───────────────────────────────────────────────────────────────────────
section('قیمت هرگز از کلاینت گرفته نمی‌شود');
ok('createShopOrder قیمت را از جدول shop_items می‌خواند',
  /createShopOrder[\s\S]*?SELECT[\s\S]*?price[\s\S]*?FROM shop_items/.test(svc));
ok('createPlusOrder قیمت را از PLUS_PRODUCTS سمت سرور می‌خواند',
  /createPlusOrder[\s\S]*?plan\.price/.test(svc));
ok('verifyAndDeliver مبلغ را از سفارشِ ذخیره‌شده می‌خواند',
  /verifyAndDeliver[\s\S]*?SELECT \* FROM payment_orders WHERE id=\$1 AND user_id=\$2/.test(svc));
// مبلغِ برداشت را کاربر تعیین می‌کند و درست است؛ فقط مسیرهای *خرید*
// نباید قیمت را از کلاینت بگیرند.
const buyRoutes = (server.match(
  /app\.post\('\/api\/(?:shop\/items\/:id\/buy|shop\/plus|purchase\/verify)'[\s\S]*?\n\}\)\);/g
) || []).join('\n');
ok('هر سه مسیر خرید پیدا شدند', (buyRoutes.match(/app\.post/g) || []).length === 3);
ok('هیچ مبلغی در مسیرهای خرید از req.body خوانده نمی‌شود',
  !/req\.body[^\n]*\b(amount|price|مبلغ)\b/.test(buyRoutes));
ok('نوع خرید از سفارش خوانده می‌شود نه از بدنهٔ درخواست',
  /order\.purchase_kind/.test(shopSvc)
  && !/req\.body[^\n]*\bkind\b/.test(buyRoutes));
ok('verify فقط orderId و purchaseToken می‌گیرد',
  /purchase\/verify[\s\S]*?req\.body\?\.orderId[\s\S]*?req\.body\?\.purchaseToken/.test(server));

// ───────────────────────────────────────────────────────────────────────
section('ایدمپوتنسی — پرداخت دوبار تحویل نمی‌گیرد');
ok('claim فقط روی سفارش pending اثر می‌کند',
  /WHERE id=\$1 AND status='pending'/.test(svc));
ok('توکن تکراری با کد 23505 گرفته می‌شود',
  /e\.code === '23505'/.test(svc));
ok('UNIQUE روی (provider, purchase_token) در مایگریشن هست',
  /CREATE UNIQUE INDEX[\s\S]*?payment_orders \(provider, purchase_token\)/.test(mig067));
ok('سفارشِ paid بدون تحویل دوباره برمی‌گردد',
  /status === 'paid'[\s\S]*?alreadyProcessed: true/.test(svc));
ok('تحویل داخل همان تراکنشِ claim انجام می‌شود',
  /claimed\.rowCount[\s\S]*?deliver\(client/.test(svc));
ok('مالکیت قبل از تحویل دوباره بررسی می‌شود',
  /deliverItem[\s\S]*?SELECT purchase_id FROM user_shop_items/.test(shopSvc));

// ───────────────────────────────────────────────────────────────────────
section('تأیید سمت سرور — به کلاینت اعتماد نمی‌شود');
ok('purchaseState از پاسخ بازار بررسی می‌شود',
  /Number\(json\.purchaseState\) === 0/.test(svc));
ok('آدرس API بازار هاردکد است نه از ورودی',
  /const BAZAAR_API = 'https:\/\/pardakht\.cafebazaar\.ir'/.test(svc));
ok('حالت sandbox پیش‌فرض خاموش است',
  /process\.env\.BAZAAR_SANDBOX === 'true'/.test(svc));
ok('sandbox فقط توکن با پیشوند SANDBOX- را می‌پذیرد',
  /startsWith\('SANDBOX-'\)/.test(svc));
ok('بدون اعتبارنامه، سفارش ساخته نمی‌شود',
  (svc.match(/GATEWAY_OFF/g) || []).length >= 2);

// ───────────────────────────────────────────────────────────────────────
section('کمیسیون ۵٪ معرف');
ok('کمیسیون در تحویلِ آیتم پرداخت می‌شود',
  /deliverItem[\s\S]*?payPurchaseCommission/.test(shopSvc));
ok('کمیسیون در تحویلِ پلاس پرداخت می‌شود',
  /deliverPlus[\s\S]*?payPurchaseCommission/.test(shopSvc));
ok('کمیسیون روی قیمت کاملِ پرداختی حساب می‌شود',
  /purchaseAmount: Number\(amount\)/.test(shopSvc));
ok('درگاه در سند کمیسیون ثبت می‌شود',
  /gatewayProvider: 'cafebazaar'/.test(shopSvc)
  && /gateway_provider/.test(referral));
ok('نرخ کمیسیون ۵٪ است',
  /PURCHASE_COMMISSION_PERCENT\s*=\s*(?:Number\([^)]*\)\s*\|\|\s*)?5/.test(referral)
  || /0\.0500/.test(referral));
ok('کمیسیون به کیف پول واریز می‌شود (source=purchase_referral)',
  /source: 'purchase_referral'/.test(referral));
ok('سند کمیسیون یکتاست (ON CONFLICT DO NOTHING)',
  /ON CONFLICT\(purchase_type, purchase_reference_id\) DO NOTHING/.test(referral));

// ───────────────────────────────────────────────────────────────────────
section('کمیسیون امتیازی از دوستان');
ok('فقط از منابع card و tap',
  /COMMISSIONABLE = new Set\(\['card', 'tap'\]\)/.test(referral));
// سیستمِ قدیمیِ «ثبت کد کارت» حذف شد (مایگریشن ۰۸۰) — مسیرِ کدِ ساده
// دیگر وجود ندارد و کمیسیونِ ثبتِ کارت فقط از مسیرِ عکس می‌آید.
ok('مسیرِ قدیمیِ ثبت کد در server.js نیست',
  !/\/api\/cards\/redeem/.test(server));
ok('بازی ضربه‌زن کمیسیون می‌دهد',
  /payCommission\(client, userId, points, 'tap'\)/.test(server));
ok('کارت نقدی کمیسیون نمی‌دهد (مسیر عکسی)',
  /cash === 0[\s\S]{0,200}?payCommission/.test(R('src/services/photoCardService.js')));

// ───────────────────────────────────────────────────────────────────────
section('نگاشت قیمت → محصول بازار');
const prices = [...svc.matchAll(/^\s{2}(\d+):\s+'ghelgheli_item_(\d+)'/gm)]
  .map(m => [Number(m[1]), Number(m[2])]);
ok('حداقل ۱۳ نقطهٔ قیمتی تعریف شده', prices.length >= 13);
ok('کلید و شناسهٔ محصول هم‌خوانی دارند',
  prices.every(([k, v]) => k === v));
ok('قیمت‌ها صعودی‌اند',
  prices.every(([k], i) => i === 0 || k > prices[i - 1][0]));
ok('پلاس ماهانه و سالانه محصول جدا دارند',
  /ghelgheli_plus_monthly/.test(svc) && /ghelgheli_plus_annual/.test(svc));
ok('قیمت پلاس با shopService یکی است',
  /monthly:[^\n]*price: 59000/.test(svc)
  && /annual:[^\n]*price: 499000/.test(svc)
  && /PLUS_PRICE = 59000/.test(shopSvc)
  && /ANNUAL_PLUS_PRICE = 499000/.test(shopSvc));
ok('قیمتِ بدونِ محصول با خطای روشن رد می‌شود',
  /NO_PRODUCT/.test(svc));

// ───────────────────────────────────────────────────────────────────────
section('مسیرهای شارژِ حذف‌شده');
ok('createOrder قدیمی (شارژ کیف پول) دیگر وجود ندارد',
  !/async function createOrder\s*\(/.test(svc));
ok('verifyAndCredit قدیمی دیگر وجود ندارد',
  !/verifyAndCredit/.test(svc));
ok('محصولات شارژ کیف پول حذف شده‌اند',
  !/ghelgheli_wallet_/.test(svc));
ok('روت شارژ ۴۱۰ می‌دهد نه ۴۰۴',
  /TOPUP_REMOVED/.test(routes) && /status\(410\)/.test(routes));
ok('catalog می‌گوید شارژ کیف پول غیرفعال است',
  /walletTopupEnabled: false/.test(svc));

// ───────────────────────────────────────────────────────────────────────
section('محافظت مسیرها');
for (const r of ['/purchase/catalog', '/purchase/history']) {
  ok(`${r} احراز هویت دارد`,
    new RegExp(`'${r.replace(/\//g, '\\/')}',\\s*auth`).test(routes));
}
ok('/api/purchase/verify احراز هویت و محدودکنندهٔ نرخ دارد',
  /'\/api\/purchase\/verify', auth, shopLimiter/.test(server));
ok('روت‌های خرید محدودکنندهٔ نرخ دارند',
  /'\/api\/shop\/items\/:id\/buy', auth, validateUuid\('id'\), shopLimiter/.test(server)
  && /'\/api\/shop\/plus', auth, shopLimiter/.test(server));

console.log(`\n${fail ? '✗' : '✓'} ${pass} تست موفق، ${fail} ناموفق`);
process.exit(fail ? 1 : 0);
