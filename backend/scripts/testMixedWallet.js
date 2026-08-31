// ============================================================================
//  تست رگرسیونِ باگِ مالیِ دورِ ۲۳ — کسرِ سهمِ کیف پول در خریدِ ترکیبی
// ============================================================================
//
// چرا این تست «اجرا» است و نه مثلِ بیشترِ تست‌های این پوشه regex روی سورس:
//
// باگِ اصلی دقیقاً از جنسِ چیزی بود که regex نمی‌تواند ببیند. کد در هر
// نقطه‌ای که نگاه می‌کردی درست به‌نظر می‌رسید: buyShopItem تراکنش باز
// می‌کرد، verifyPurchase wallet_amount را می‌خواند، deliverItem هم
// walletPaid را «استفاده» می‌کرد — فقط برای کمیسیون. هیچ‌کدام از این
// الگوها قرمز نبود؛ چیزی که نبود، یک `wallet.debit` در مسیرِ ترکیبی بود،
// و «نبودنِ» چیزی را فقط اجرا می‌تواند اثبات کند.
//
// پس این تست سرویس‌های واقعی (shopService / paymentService /
// walletService) را لود می‌کند و فقط لایهٔ pg را شبیه‌سازی می‌کند — همان
// تکنیکی که باگ را موقعِ ممیزی پیدا کرد. هر سناریو کلِ زنجیرهٔ واقعی را
// طی می‌کند و در پایان «دفتر کل» را ممیزی می‌کند: آیا debit واقعاً ثبت
// شد؟ آیا مبلغش درست بود؟ آیا موجودی آپدیت شد؟
//
// سناریوها:
//   ۱. خریدِ ترکیبی (کیف پول ۱۰هزار + بازار ۱۵هزار برای آیتمِ ۲۵هزاری):
//      بعد از verify باید دقیقاً یک debit=۱۰هزار با منبع 'shop' ثبت شود.
//   ۲. خریدِ تماماً-کیف‌پولی (موجودی ۲۵هزار): یک debit=۲۵هزار — و نه
//      دو تا (کسرِ قدیمیِ buyShopItem + کسرِ تازهٔ deliverItem هر دو
//      فعال می‌ماندند اگر کسی فقط کسرِ جدید را اضافه می‌کرد).
//   ۳. موجودیِ ناکافی هنگامِ تحویل: کلِ تحویل باید برگردد (ROLLBACK) و
//      سفارش paid نشود — پولِ کاربر در بازار محفوظ می‌ماند و با شارژِ
//      کیف پول و verify دوباره تحویل می‌گیرد.
//   ۴. bestWalletSplit: شکستِ ممکن وقتی باقیمانده باید روی نقطهٔ قیمتیِ
//      واقعی بازار بیفتد (رفعِ خطای مبهمِ NO_PRODUCT برای اکثرِ موجودی‌ها).
//
// BAZAAR_SANDBOX=true یعنی verifyWithBazaar توکن‌های SANDBOX- را بدون
// تماسِ واقعی با بازار تأیید می‌کند.
process.env.BAZAAR_SANDBOX = 'true';
process.env.NODE_ENV = 'test';

const path = require('path');
const db = require('../src/config/db');

let passed = 0;
let failed = 0;
function ok(cond, label, extra) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.error(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`); }
}

// ── شبیه‌سازِ pg ─────────────────────────────────────────────────────────────
// هر کوئری بر اساسِ متنِ SQL پاسخ می‌دهد و همهٔ نوشتارها در `ledger`
// ثبت می‌شوند تا آخرِ هر سناریو ممیزی شوند.
function makeFakeDb() {
  const state = { walletBalance: 0 };
  const ledger = {
    debits: [],           // {amount, source, referenceType, referenceId}
    credits: [],
    balanceUpdates: [],   // {newBalance}
    orders: [],
    pendingClaimId: null,
    orderClaims: 0,
    rollbacks: 0,
    commits: 0,
    shopItemInserts: 0,
  };
  const ITEM = {
    id: '11111111-1111-1111-1111-111111111111',
    slug: 'test-item',
    name: 'آیتم تست',
    price: 25000,
    access_tier: 'free',
    is_purchasable: true,
    is_active: true,
    kind: 'frame',
  };
  let orderIdCounter = 0;
  function newOrder(over) {
    orderIdCounter++;
    return {
      id: `22222222-2222-2222-2222-2222222200${String(orderIdCounter).padStart(2, '0')}`,
      user_id: 'u1',
      amount: 15000,
      provider: 'cafebazaar',
      product_id: 'ghelgheli_item_15000',
      status: 'pending',
      purchase_kind: 'shop_item',
      shop_item_id: ITEM.id,
      wallet_amount: 10000,
      plus_cycle: null,
      ...over,
    };
  }
  function query(text, values) {
    const t = String(text);
    if (/^BEGIN/i.test(t)) return Promise.resolve({ rows: [], rowCount: 0 });
    if (/^COMMIT/i.test(t)) {
      ledger.commits++;
      // ادعایِ «paid» فقط با COMMIT قطعی می‌شود — مثلِ دیتابیسِ واقعی،
      // ROLLBACK آن را بی‌اثر می‌کند.
      if (ledger.pendingClaimId) {
        const claimed = ledger.orders.find(o => o.id === ledger.pendingClaimId);
        if (claimed) claimed.status = 'paid';
        ledger.pendingClaimId = null;
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
    if (/^ROLLBACK/i.test(t)) {
      ledger.rollbacks++;
      ledger.pendingClaimId = null;
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
    if (/SELECT wallet_balance FROM users WHERE id=\$1 FOR UPDATE/.test(t)) {
      return Promise.resolve({ rows: [{ wallet_balance: state.walletBalance }], rowCount: 1 });
    }
    if (/UPDATE users SET wallet_balance=\$1/.test(t)) {
      // walletService.credit/debit همیشه همین شکل را می‌نویسد.
      ledger.balanceUpdates.push({ newBalance: Number(values[0]) });
      state.walletBalance = Number(values[0]);
      return Promise.resolve({ rows: [], rowCount: 1 });
    }
    if (/INSERT INTO wallet_transactions/.test(t)) {
      // `direction` در خودِ SQL literal است ('debit'/'credit') نه در params:
      //   VALUES ($1,'debit',$2,$3,$4,$5,$6,$7,$8)
      // [userId, amount, source, referenceType, referenceId, balanceAfter, description, adminId]
      const direction = /'debit'/.test(t) ? 'debit' : 'credit';
      const row = {
        userId: values[0],
        direction,
        amount: Number(values[1]),
        source: values[2],
        referenceType: values[3],
        referenceId: values[4],
      };
      (direction === 'debit' ? ledger.debits : ledger.credits).push(row);
      return Promise.resolve({ rows: [{ id: `wtx-${ledger.debits.length + ledger.credits.length}` }], rowCount: 1 });
    }
    if (/SELECT \* FROM wallet_transactions WHERE source=\$1 AND reference_id=\$2/.test(t)) {
      return Promise.resolve({ rows: [], rowCount: 0 });
    }
    if (/FROM shop_items/.test(t)) return Promise.resolve({ rows: [ITEM], rowCount: 1 });
    if (/FROM user_shop_items/.test(t)) return Promise.resolve({ rows: [], rowCount: 0 });
    if (/INSERT INTO user_shop_items/.test(t)) {
      ledger.shopItemInserts++;
      return Promise.resolve({ rows: [{ purchase_id: `33333333-3333-3333-3333-3333333300${ledger.shopItemInserts}`.slice(0, 36), bought_at: new Date() }], rowCount: 1 });
    }
    if (/INSERT INTO payment_orders/.test(t) && /RETURNING id, amount, created_at/.test(t)) {
      const amount = Number(values[1]);
      const order = newOrder({ amount, wallet_amount: Number(values[4] || 0) });
      ledger.orders.push(order);
      return Promise.resolve({ rows: [order], rowCount: 1 });
    }
    if (/SELECT \* FROM payment_orders WHERE id=\$1 AND user_id=\$2/.test(t)) {
      const found = ledger.orders.find(o => o.id === values[0]) || null;
      return Promise.resolve({ rows: found ? [found] : [], rowCount: found ? 1 : 0 });
    }
    if (/UPDATE payment_orders\s+SET purchase_token/.test(t)) {
      ledger.orderClaims++;
      // status را همین‌جا عوض نمی‌کنیم — تا COMMIT معلق می‌ماند (بالا).
      ledger.pendingClaimId = values[0];
      const order = ledger.orders.find(o => o.id === values[0]);
      return Promise.resolve({ rows: order ? [{ id: order.id, amount: order.amount }] : [], rowCount: order ? 1 : 0 });
    }
    if (/UPDATE payment_orders\s+SET granted_reference_id/.test(t)) {
      return Promise.resolve({ rows: [], rowCount: 1 });
    }
    if (/SELECT u\.referred_by/.test(t)) return Promise.resolve({ rows: [], rowCount: 0 });
    return Promise.resolve({ rows: [], rowCount: 0 });
  }
  const client = { query, release: () => {} };
  return {
    state, ledger, ITEM,
    pool: {
      query,
      connect: () => Promise.resolve(client),
    },
  };
}

// لودِ سرویس‌های واقعی با pool شبیه‌سازی‌شده.
// shopService و paymentService و walletService همگی همان شیءِ pool را از
// config/db می‌گیرند، پس جایگزینیِ متدهایش کافی است.
const shop = require('../src/services/shopService');
const payments = require('../src/services/paymentService');

async function reset() {
  const fake = makeFakeDb();
  db.pool.query = fake.pool.query;
  db.pool.connect = fake.pool.connect;
  return fake;
}

(async () => {
  console.log('== ۱. خرید ترکیبی: کیف پول ۱۰هزار + بازار ۱۵هزار ==');
  {
    const fake = await reset();
    fake.state.walletBalance = 10000;
    const order = await shop.buyShopItem('u1', 'test-item', { useWallet: true });
    ok(order.settled === false, 'سفارشِ pending ساخته شد (settled=false)');
    ok(order.paidFromWallet === 10000, `سهم کیف پول = ۱۰هزار (got ${order.paidFromWallet})`);
    ok(order.productId === 'ghelgheli_item_15000', 'باقیمانده روی محصول واقعی بازار افتاد');
    ok(fake.ledger.debits.length === 0, 'در لحظهٔ سفارش چیزی کسر نشد (رزرو نیست — کسر در تحویل)');

    const result = await shop.verifyPurchase('u1', order.orderId, 'SANDBOX-TOKEN-1');
    ok(result.item && result.item.owned === true, 'آیتم بعد از verify تحویل شد');
    ok(fake.ledger.debits.length === 1,
      `دقیقاً یک debit ثبت شد (got ${fake.ledger.debits.length})`);
    const d = fake.ledger.debits[0] || {};
    ok(d.amount === 10000, `مبلغِ debit درست است: ۱۰هزار (got ${d.amount})`);
    ok(d.source === 'shop', `منبعِ debit 'shop' است (got ${d.source})`);
    ok(d.referenceType === 'shop_item', `مرجعِ debit 'shop_item' است (got ${d.referenceType})`);
    ok(fake.ledger.balanceUpdates.some(u => u.newBalance === 0),
      'موجودی کیف پول به صفر رسید');
    ok(fake.ledger.shopItemInserts === 1, 'مالکیت آیتم یک‌بار ثبت شد');
  }

  console.log('\n== ۲. خرید تماماً-کیف‌پولی: موجودی ۲۵هزار ==');
  {
    const fake = await reset();
    fake.state.walletBalance = 25000;
    const r = await shop.buyShopItem('u1', 'test-item', { useWallet: true });
    ok(r.settled === true, 'بدون بازار تسویه شد (settled=true)');
    ok(r.paidFromWallet === 25000, 'کل قیمت از کیف پول');
    ok(fake.ledger.debits.length === 1,
      `دقیقاً یک debit (نه دو تا!) — got ${fake.ledger.debits.length}`);
    ok((fake.ledger.debits[0] || {}).amount === 25000, 'مبلغ debit = کل قیمت');
    ok(fake.state.walletBalance === 0, 'موجودی صفر شد');
  }

  console.log('\n== ۳. موجودی ناکافی هنگام تحویل ==');
  {
    const fake = await reset();
    fake.state.walletBalance = 10000;
    const order = await shop.buyShopItem('u1', 'test-item', { useWallet: true });
    // کاربر بین پرداختِ بازار و verify، موجودی را جای دیگر خرج کرده است.
    fake.state.walletBalance = 3000;
    let threw = null;
    try {
      await shop.verifyPurchase('u1', order.orderId, 'SANDBOX-TOKEN-2');
    } catch (e) { threw = e; }
    ok(threw && /موجودی کیف پول کافی نیست/.test(threw.message),
      'خطای روشنِ «موجودی کافی نیست» داده شد');
    ok(fake.ledger.shopItemInserts === 1 && fake.ledger.debits.length === 0,
      'تحویل کامل برگشت: آیتم ثبت شد ولی debit نشد → کل تراکنش rollback');
    ok(fake.ledger.rollbacks >= 1, 'ROLLBACK انجام شد');
    const saved = fake.ledger.orders.find(o => o.id === order.orderId);
    ok(saved && saved.status === 'pending',
      'سفارش pending ماند — کاربر با شارژِ کیف پول همان توکن را دوباره verify می‌کند');
  }

  console.log('\n== ۴. bestWalletSplit — شکست روی نقطهٔ قیمتیِ واقعی ==');
  {
    const cases = [
      // [قیمت، موجودی] → [سهم کیف پول، پرداخت بازار]
      [25000, 10000, 10000, 15000], // دقیقاً نقطهٔ ۱۵هزار می‌افتد
      [25000, 5000, 1000, 24000],   // نقطهٔ ۲۴هزار: بیشترین استفادهٔ ممکنِ کیف پول
      [25000, 300, 0, 25000],       // موجودی از هیچ شکستِ کیف‌پول‌داری نمی‌رسد → تماماً بازار
      [9000, 9000, 0, 9000],        // موجودیِ کافی برای کل — caller باید قبلش تسویهٔ کامل کند
      [10000, 5000, 1000, 9000],    // قیمتْ نقطهٔ قیمتی نیست ولی شکستِ ۹هزار + ۱هزارِ کیف پول ممکن است
    ];
    for (const [price, balance, w, payable] of cases) {
      const s = payments.bestWalletSplit(price, balance);
      ok(s && s.walletAmount === w && s.payable === payable,
        `bestWalletSplit(${price},${balance}) → {${w}, ${payable}} (got ${s ? `${s.walletAmount}, ${s.payable}` : 'null'})`);
    }
    // خودِ قیمت و هیچ نقطهٔ کوچک‌تری هم با این موجودی ممکن نیست → null:
    ok(payments.bestWalletSplit(10000, 500) === null,
      'bestWalletSplit(10000,500) → null (هیچ شکستی ممکن نیست)');
    // خریدِ ترکیبی با موجودیِ ۵هزار — قبلاً NO_PRODUCT می‌شد، حالا نقطهٔ ۲۴هزار:
    const fake = await reset();
    fake.state.walletBalance = 5000;
    const order = await shop.buyShopItem('u1', 'test-item', { useWallet: true });
    ok(order.settled === false && order.productId === 'ghelgheli_item_24000',
      `موجودیِ ۵هزار: سفارشِ ترکیبی روی محصولِ ۲۴هزار ساخته شد (got ${order.productId})`);
    ok(order.paidFromWallet === 1000, `سهم کیف پول = ۱هزار (got ${order.paidFromWallet})`);
  }

  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} موفق، ${failed} ناموفق`);
  process.exit(failed === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR:', e); process.exit(1); });
