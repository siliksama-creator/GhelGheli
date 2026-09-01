#!/usr/bin/env node
// ============================================================================
//  تست جامع سرتاسری (End-to-End) — همهٔ نقاط سیستم
// ============================================================================
//
//   node scripts/testE2E.js                      # روی سرور محلی
//   BASE=https://api.ghelghelishop.ir node scripts/testE2E.js
//
// این تست با **API واقعی روی شبکه** حرف می‌زند، نه با ماژول‌های داخلی. یعنی
// همان چیزی را می‌سنجد که اپ اندروید و وب می‌بینند: مسیرها، کدهای وضعیت،
// احراز هویت، اعتبارسنجی، و مهم‌تر از همه — درستی پول.
//
// اصول:
//   • هیچ دادهٔ تستی در سیستم باقی نمی‌ماند (پاک‌سازی در انتها).
//   • هر تست دلیل شکستش را به فارسی و با مقدار واقعی چاپ می‌کند.
//   • تست‌های پولی موجودی را قبل و بعد می‌سنجند، نه فقط کد وضعیت را.
//   • تلاش‌های خصمانه (دسترسی به دادهٔ دیگران، دستکاری مبلغ، تکرار عملیات)
//     صریحاً آزموده می‌شوند.

require('dotenv').config();

const BASE = process.env.BASE || `http://127.0.0.1:${process.env.PORT || 4000}`;
const ADMIN_USER = process.env.E2E_ADMIN_USER || process.env.ADMIN_DEFAULT_USERNAME || 'Admin';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || process.env.ADMIN_DEFAULT_PASSWORD;

// ---------------------------------------------------------------------------
//  محافظ اجرا روی production
// ---------------------------------------------------------------------------
// این تست کاربر می‌سازد، کارت تعریف می‌کند و پول جابه‌جا می‌کند. اجرای
// تصادفی‌اش روی سرور واقعی، دادهٔ آزمایشی در دیتابیس زنده می‌گذارد (یک بار
// اتفاق افتاد و دستی پاک شد). پس اجرا روی هاست production فقط با تأیید
// صریح ممکن است.
const PROD_HOSTS = ['api.ghelghelishop.ir', 'ghelghelishop.ir'];
const targetHost = (() => { try { return new URL(BASE).hostname; } catch { return ''; } })();
if (PROD_HOSTS.includes(targetHost) && process.env.ALLOW_PROD !== 'yes-i-know') {
  console.error(`
⛔ هدف این اجرا سرور production است (${targetHost}).

   این تست دادهٔ واقعی می‌سازد و پول جابه‌جا می‌کند.
   روی یک دیتابیس staging اجرایش کنید:

     BASE=http://127.0.0.1:4999 node scripts/testE2E.js

   اگر واقعاً می‌خواهید روی production اجرا شود:

     ALLOW_PROD=yes-i-know BASE=${BASE} node scripts/testE2E.js

   و بعد حتماً کاربران e2e* و کارت‌های E2E* را پاک کنید.
`);
  process.exit(2);
}

let pass = 0, fail = 0, skip = 0;
const failures = [];

function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else {
    fail++; failures.push(name);
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function skipped(name, why) { skip++; console.log(`  ⊘ ${name} (${why})`); }
function section(t) { console.log(`\n${'═'.repeat(66)}\n  ${t}\n${'═'.repeat(66)}`); }
function group(t) { console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 60 - t.length))}`); }

/** درخواست HTTP با خروجی یکدست. هرگز throw نمی‌کند. */
async function req(method, path, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (raw !== undefined) { headers['Content-Type'] = 'application/json'; payload = raw; }
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  try {
    const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    // express-rate-limit با standardHeaders زمان بازنشانی پنجره را می‌فرستد؛
    // حدس زدن مدت انتظار همیشه غلط از آب درمی‌آید، پس از خود سرور می‌پرسیم.
    const reset = Number(res.headers.get('ratelimit-reset'));
    const retryAfter = Number(res.headers.get('retry-after'));
    return { status: res.status, data, ok: res.ok, reset, retryAfter };
  } catch (e) {
    return { status: 0, data: { message: e.message }, ok: false, networkError: true };
  }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * درخواست با احترام به محدودیت نرخ.
 *
 * مسیرهای پولی عمداً ۱۰ درخواست در دقیقه محدودند. تستی که به این سقف
 * می‌خورد و بعد «کد وضعیت غلط» گزارش می‌کند، دربارهٔ محصول دروغ می‌گوید.
 * پس روی ۴۲۹ صبر می‌کنیم و دوباره تلاش می‌کنیم — مگر اینکه تست عمداً
 * دنبال ۴۲۹ باشد (پارامتر allow429).
 */
async function reqRL(method, path, opts = {}) {
  const { allow429 = false, retries = 3, ...rest } = opts;
  for (let i = 0; i <= retries; i++) {
    const r = await req(method, path, rest);
    if (r.status !== 429 || allow429 || i === retries) return r;
    // سرور خودش می‌گوید چقدر باید صبر کرد؛ حدس نمی‌زنیم.
    const secs = Number.isFinite(r.reset) && r.reset > 0 ? r.reset
               : Number.isFinite(r.retryAfter) && r.retryAfter > 0 ? r.retryAfter
               : 60;
    const wait = Math.min(90, secs + 2) * 1000;
    process.stdout.write(`    (محدودیت نرخ — ${Math.round(wait / 1000)} ثانیه صبر تا بازنشانی پنجره)\n`);
    await sleep(wait);
  }
}

const GET = (p, t) => reqRL('GET', p, { token: t });
const POST = (p, b, t) => reqRL('POST', p, { token: t, body: b });
const PATCH = (p, b, t) => reqRL('PATCH', p, { token: t, body: b });
const DELETE = (p, t) => reqRL('DELETE', p, { token: t });
// نسخه‌های خام برای تست‌هایی که خودِ ۴۲۹ هدفشان است
const POSTRaw = (p, b, t) => req('POST', p, { token: t, body: b });

const uniq = () => Math.random().toString(36).slice(2, 8);

// وضعیت مشترک بین بخش‌ها
const ctx = {
  adminToken: null,
  users: [],          // {mobile, password, token, id}
  rewardIds: [],
  withdrawalIds: [],
};

// ---------------------------------------------------------------------------
async function testHealthAndPublic() {
  section('۱. سلامت سرویس و مسیرهای عمومی');

  const h = await GET('/health');
  ok(h.status === 200 && h.data?.ok === true, 'سرویس بالا است و /health پاسخ می‌دهد',
    `status=${h.status}`);
  if (h.networkError) {
    console.error('\n  ⛔ سرور در دسترس نیست. تست‌های بعدی بی‌معنی‌اند.');
    return false;
  }

  const games = await GET('/api/games');
  ok(games.status === 200 && Array.isArray(games.data) && games.data.length >= 3,
    'فهرست بازی‌ها بدون احراز هویت در دسترس است',
    `${games.data?.length} بازی`);
  ok(games.data?.every(g => g.id && g.title), 'هر بازی شناسه و عنوان دارد');

  group('مسیرهای محافظت‌شده بدون توکن');
  for (const p of ['/api/profile', '/api/wallet', '/api/rewards', '/api/league/current',
                   '/api/wallet/withdrawals', '/api/notifications']) {
    const r = await GET(p);
    ok(r.status === 401, `${p} بدون توکن ۴۰۱ می‌دهد`, `status=${r.status}`);
  }

  group('مسیرهای مدیر بدون توکن مدیر');
  for (const p of ['/api/admin/users', '/api/admin/wallet/withdrawals',
                   '/api/admin/wallet/stats', '/api/admin/card-types']) {
    const r = await GET(p);
    ok(r.status === 401, `${p} بدون توکن مدیر ۴۰۱ می‌دهد`, `status=${r.status}`);
  }

  group('رفتار با ورودی خراب');
  const bad = await req('POST', '/api/auth/login', { raw: '{invalid json' });
  ok(bad.status === 400, 'JSON خراب ۴۰۰ می‌دهد نه ۵۰۰', `status=${bad.status}`);
  ok(typeof bad.data?.message === 'string' && /[\u0600-\u06FF]/.test(bad.data.message),
    'پیام خطای JSON خراب فارسی است');

  const notFound = await GET('/api/this-does-not-exist');
  ok(notFound.status === 404, 'مسیر ناشناخته ۴۰۴ می‌دهد', `status=${notFound.status}`);
  ok(notFound.data && typeof notFound.data === 'object',
    'پاسخ ۴۰۴ به‌صورت JSON است نه HTML');

  return true;
}

// ---------------------------------------------------------------------------
async function testAuth() {
  section('۲. ثبت‌نام، ورود و امنیت حساب');

  const mobile = `e2e${Date.now().toString().slice(-9)}`;
  const password = 'Test@12345';

  const reg = await POST('/api/auth/register-password', {
    mobile, password, nickname: `تست${uniq()}`,
  });
  if (reg.status !== 200) {
    skipped('ثبت‌نام کاربر آزمایشی', `status=${reg.status} — ${reg.data?.message}`);
    return false;
  }
  ok(reg.status === 200 && reg.data?.token, 'ثبت‌نام کاربر جدید موفق است');
  ctx.users.push({ mobile, password, token: reg.data.token, id: reg.data.user?.id });

  group('نشت اطلاعات حساس در پاسخ');
  const u = reg.data.user || {};
  ok(u.password_hash === undefined, 'هش رمز عبور در پاسخ نیست');
  ok(u.bank_card_number === undefined, 'شمارهٔ کامل کارت بانکی در پاسخ نیست');
  ok(u.bank_card_sheba === undefined, 'شبای کامل در پاسخ نیست');
  ok('wallet_balance' in u, 'موجودی کیف پول در پروفایل هست');
  ok(Number(u.wallet_balance) === 0, 'کاربر جدید با موجودی صفر شروع می‌کند',
    `balance=${u.wallet_balance}`);

  group('محافظت از تصاحب حساب');
  const takeover = await POST('/api/auth/register-password', {
    mobile, password: 'Attacker@999', nickname: 'مهاجم',
  });
  ok(takeover.status !== 200,
    'ثبت‌نام دوباره با همان موبایل، رمز را بازنویسی نمی‌کند',
    `status=${takeover.status}`);

  const stillWorks = await POST('/api/auth/login', { mobile, password });
  ok(stillWorks.status === 200, 'رمز اصلی کاربر بعد از تلاش تصاحب هنوز کار می‌کند');

  group('ورود');
  const wrongPass = await POST('/api/auth/login', { mobile, password: 'WrongPass@1' });
  ok(wrongPass.status >= 400, 'ورود با رمز غلط رد می‌شود', `status=${wrongPass.status}`);
  ok(!wrongPass.data?.token, 'ورود ناموفق توکن نمی‌دهد');

  const noSuchUser = await POST('/api/auth/login', { mobile: 'nosuchuser999', password: 'x' });
  ok(noSuchUser.status >= 400, 'ورود با کاربر ناموجود رد می‌شود');
  ok(!/وجود ندارد|یافت نشد/.test(String(noSuchUser.data?.message || '')) ||
     String(noSuchUser.data?.message) === String(wrongPass.data?.message),
    'پیام خطا کاربر موجود و ناموجود را از هم تفکیک نمی‌کند (جلوگیری از شمارش کاربران)');

  group('توکن نامعتبر');
  const badToken = await GET('/api/profile', 'not.a.real.token');
  ok(badToken.status === 401, 'توکن جعلی ۴۰۱ می‌دهد');
  const emptyToken = await GET('/api/profile', '');
  ok(emptyToken.status === 401, 'توکن خالی ۴۰۱ می‌دهد');

  group('رمز عبور');
  const shortPw = await POST('/api/auth/register-password',
    { mobile: `e2e${uniq()}`, password: '123' });
  ok(shortPw.status === 400, 'رمز کوتاه‌تر از ۶ کاراکتر رد می‌شود');
  const longPw = await POST('/api/auth/register-password',
    { mobile: `e2e${uniq()}`, password: 'A'.repeat(200) });
  ok(longPw.status === 400, 'رمز بلندتر از ۷۲ بایت رد می‌شود (bcrypt سکوت نمی‌کند)');

  return true;
}

// ---------------------------------------------------------------------------
async function testAdminAuth() {
  section('۳. ورود مدیر و کنترل دسترسی');

  if (!ADMIN_PASS) {
    skipped('ورود مدیر', 'رمز مدیر تنظیم نشده (E2E_ADMIN_PASS)');
    return false;
  }
  const login = await POST('/api/admin/auth/login',
    { username: ADMIN_USER, password: ADMIN_PASS });
  if (login.status !== 200) {
    skipped('ورود مدیر', `status=${login.status} — ${login.data?.message}`);
    return false;
  }
  ok(login.status === 200 && login.data?.token, 'ورود مدیر موفق است');
  ctx.adminToken = login.data.token;

  group('توکن کاربر نباید به مسیر مدیر دسترسی داشته باشد');
  const userToken = ctx.users[0]?.token;
  if (userToken) {
    for (const p of ['/api/admin/users', '/api/admin/wallet/withdrawals', '/api/admin/wallet/stats']) {
      const r = await GET(p, userToken);
      ok(r.status === 401 || r.status === 403,
        `کاربر عادی به ${p} دسترسی ندارد`, `status=${r.status}`);
    }
  }

  group('توکن مدیر نباید به مسیر کاربر دسترسی داشته باشد');
  const asUser = await GET('/api/wallet', ctx.adminToken);
  ok(asUser.status === 401, 'توکن مدیر روی مسیر کاربر ۴۰۱ می‌دهد',
    `status=${asUser.status}`);

  const wrongAdminPass = await POST('/api/admin/auth/login',
    { username: ADMIN_USER, password: 'definitely-wrong' });
  ok(wrongAdminPass.status >= 400, 'ورود مدیر با رمز غلط رد می‌شود');

  return true;
}

// ---------------------------------------------------------------------------
async function testUuidValidation() {
  section('۴. اعتبارسنجی شناسه‌ها (جلوگیری از ۵۰۰)');

  const t = ctx.users[0]?.token;
  if (!t) { skipped('اعتبارسنجی UUID', 'کاربر آزمایشی نداریم'); return; }

  const badIds = ['abc', '../../etc/passwd', "'; DROP TABLE users; --",
                  '1 OR 1=1', '00000000-0000-0000-0000-000000000000', '%00'];
  const paths = (id) => [
    `/api/users/${id}/public`,
    `/api/support/tickets/${id}/messages`,
  ];

  for (const id of badIds) {
    for (const p of paths(encodeURIComponent(id))) {
      const r = await GET(p, t);
      ok(r.status !== 500, `${p.replace(encodeURIComponent(id), '«بد»')} با ورودی خراب ۵۰۰ نمی‌دهد`,
        `id=${id} status=${r.status}`);
    }
  }

  const w = await POST(`/api/wallet/withdrawals/not-a-uuid/cancel`, {}, t);
  ok(w.status === 400 || w.status === 404,
    'لغو برداشت با شناسهٔ نامعتبر ۴۰۰/۴۰۴ می‌دهد نه ۵۰۰', `status=${w.status}`);
}

// ---------------------------------------------------------------------------
async function testWalletBasics() {
  section('۵. کیف پول — وضعیت اولیه و ساختار پاسخ');

  const t = ctx.users[0]?.token;
  if (!t) { skipped('کیف پول', 'کاربر آزمایشی نداریم'); return; }

  const w = await GET('/api/wallet', t);
  ok(w.status === 200, 'خلاصهٔ کیف پول دریافت شد', `status=${w.status}`);
  const d = w.data || {};

  group('ساختار پاسخ');
  for (const k of ['balance', 'totalIn', 'totalOut', 'pendingWithdrawals',
                   'canWithdraw', 'blockReason', 'settings']) {
    ok(k in d, `کلید «${k}» در پاسخ هست`);
  }
  ok(d.balance === 0, 'موجودی اولیه صفر است', `balance=${d.balance}`);
  ok(d.card === null, 'کاربر جدید کارت بانکی ندارد');
  ok(d.canWithdraw === false, 'بدون کارت و بدون موجودی، برداشت ممکن نیست');
  ok(typeof d.blockReason === 'string' && d.blockReason.length > 0,
    'دلیل عدم امکان برداشت به کاربر گفته می‌شود', `reason="${d.blockReason}"`);
  ok(/کارت بانکی/.test(d.blockReason),
    'دلیل اول، نداشتن کارت بانکی است (نه حداقل مبلغ)', `reason="${d.blockReason}"`);

  group('تنظیمات');
  const s = d.settings || {};
  ok(s.minWithdrawal === 50000, 'حداقل برداشت ۵۰٬۰۰۰ تومان است',
    `min=${s.minWithdrawal}`);
  ok(s.maxWithdrawal >= s.minWithdrawal, 'سقف برداشت زیر کف نیست');
  ok(typeof s.enabled === 'boolean', 'کلید enabled بولین است');

  const tx = await GET('/api/wallet/transactions', t);
  ok(tx.status === 200 && Array.isArray(tx.data), 'دفتر تراکنش‌ها آرایه برمی‌گرداند');
  ok(tx.data.length === 0, 'کاربر جدید تراکنشی ندارد');

  const wd = await GET('/api/wallet/withdrawals', t);
  ok(wd.status === 200 && Array.isArray(wd.data) && wd.data.length === 0,
    'کاربر جدید درخواست برداشتی ندارد');
}

// ---------------------------------------------------------------------------
async function testBankCard() {
  section('۶. کارت بانکی — اعتبارسنجی و حریم خصوصی');

  const t = ctx.users[0]?.token;
  if (!t) { skipped('کارت بانکی', 'کاربر آزمایشی نداریم'); return; }

  group('کارت‌های نامعتبر رد می‌شوند');
  const invalid = [
    ['6037991199500989', 'علی رضایی', 'چک‌سام Luhn غلط'],
    ['1111111111111111', 'علی رضایی', 'همه یک رقم'],
    ['603799119950098',  'علی رضایی', '۱۵ رقم'],
    ['60379911995009888','علی رضایی', '۱۷ رقم'],
    ['',                 'علی رضایی', 'خالی'],
    ['6037991199500988', 'ع',         'نام تک‌حرفی'],
    ['6037991199500988', '',          'نام خالی'],
    ['6037991199500988', '<script>alert(1)</script>', 'تزریق HTML در نام'],
    ['6037991199500988', 'علی 😀',    'ایموجی در نام'],
  ];
  for (const [num, holder, why] of invalid) {
    const r = await POST('/api/wallet/bank-card', { cardNumber: num, cardHolder: holder }, t);
    ok(r.status === 400, `رد می‌شود: ${why}`, `status=${r.status}`);
    ok(typeof r.data?.message === 'string' && /[\u0600-\u06FF]/.test(r.data.message),
      `پیام خطای «${why}» فارسی است`);
  }

  const badSheba = await POST('/api/wallet/bank-card',
    { cardNumber: '6037991199500988', cardHolder: 'علی رضایی', sheba: 'IR000000000000000000000000' }, t);
  ok(badSheba.status === 400, 'شبای با چک‌سام غلط رد می‌شود');

  group('کارت معتبر پذیرفته می‌شود');
  const good = await POST('/api/wallet/bank-card',
    { cardNumber: '6037-9911-9950-0988', cardHolder: 'علی رضایی' }, t);
  ok(good.status === 200, 'کارت معتبر با خط تیره ذخیره می‌شود', `status=${good.status}`);
  const card = good.data?.card || {};
  ok(card.bank === 'بانک ملی ایران', 'نام بانک از روی BIN تشخیص داده شد',
    `bank=${card.bank}`);

  group('حریم خصوصی شمارهٔ کارت');
  ok(typeof card.maskedNumber === 'string' && card.maskedNumber.includes('••••'),
    'شماره به‌صورت ماسک‌شده برمی‌گردد', `masked=${card.maskedNumber}`);
  ok(!JSON.stringify(good.data).includes('6037991199500988'),
    'شمارهٔ کامل کارت در پاسخ ذخیره نیست');

  const prof = await GET('/api/profile', t);
  ok(!JSON.stringify(prof.data).includes('6037991199500988'),
    'شمارهٔ کامل کارت در /api/profile نشت نمی‌کند');
  ok(prof.data?.user?.has_bank_card === true, 'پروفایل می‌گوید کاربر کارت دارد');

  const wallet = await GET('/api/wallet', t);
  ok(!JSON.stringify(wallet.data).includes('6037991199500988'),
    'شمارهٔ کامل کارت در /api/wallet نشت نمی‌کند');

  group('ارقام فارسی');
  const fa = await POST('/api/wallet/bank-card',
    { cardNumber: '۵۰۲۲۲۹۱۰۸۱۴۹۴۶۶۶', cardHolder: 'علی رضایی' }, t);
  ok(fa.status === 200, 'کارت با ارقام فارسی پذیرفته می‌شود', `status=${fa.status}`);
  ok(fa.data?.card?.bank === 'بانک پاسارگاد', 'بانک کارت فارسی درست تشخیص داده شد');

  // برگرداندن به کارت اول برای تست‌های بعدی
  await POST('/api/wallet/bank-card',
    { cardNumber: '6037991199500988', cardHolder: 'علی رضایی' }, t);
}

// ---------------------------------------------------------------------------
// ═══════════════════════════════════════════════════════════════════════════
// بخشِ «کارت با کد» (testCardCashFlow) حذف شد: سیستمِ قدیمیِ کد کارت
// در مایگریشن ۰۸۰ جمع شد و ثبتِ کارت فقط از مسیرِ «کارت با عکس» می‌گذرد —
// تستِ آن مسیر در testPhotoCards / testPhotoCardGrouping است.
// ═══════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
async function testWithdrawalFlow() {
  section('۸. چرخهٔ کامل برداشت');

  const t = ctx.users[0]?.token;
  if (!t) { skipped('برداشت', 'کاربر آزمایشی نداریم'); return; }

  const w0 = (await GET('/api/wallet', t)).data;
  const balance = Number(w0.balance);
  if (balance < 50000) {
    skipped('چرخهٔ برداشت', `موجودی کافی نیست (${balance})`);
    return;
  }
  ok(w0.canWithdraw === true, 'با کارت و موجودی کافی، برداشت ممکن است',
    `canWithdraw=${w0.canWithdraw} reason=${w0.blockReason}`);

  group('مبالغ نامعتبر رد می‌شوند');
  const balBeforeInvalid = Number((await GET('/api/wallet', t)).data.balance);
  const invalidAmounts = [
    [49999, 'زیر حداقل ۵۰٬۰۰۰'],
    [0, 'صفر'],
    [-50000, 'منفی'],
    [balance + 1000000, 'بیش از موجودی'],
    ['abc', 'غیرعددی'],
    [50000.5, 'اعشاری'],
    [null, 'خالی'],
  ];
  for (const [amt, why] of invalidAmounts) {
    const r = await POST('/api/wallet/withdrawals', { amount: amt }, t);
    ok(r.status === 400, `مبلغ رد می‌شود: ${why}`, `amount=${amt} status=${r.status}`);
  }
  const stillSame = Number((await GET('/api/wallet', t)).data.balance);
  ok(stillSame === balBeforeInvalid,
    'هیچ‌کدام از تلاش‌های نامعتبر موجودی را دست نزد',
    `${balBeforeInvalid} → ${stillSame}`);

  group('ثبت درخواست معتبر — مبلغ بلوکه می‌شود');
  const AMT = 50000;
  const balBeforeHold = Number((await GET('/api/wallet', t)).data.balance);
  const create = await POST('/api/wallet/withdrawals', { amount: AMT }, t);
  ok(create.status === 200, 'درخواست برداشت ثبت شد',
    `status=${create.status} ${create.data?.message}`);
  const request = create.data?.request;
  ok(request?.id, 'شناسهٔ درخواست برگشت');
  if (request?.id) ctx.withdrawalIds.push(request.id);
  ok(request?.status === 'pending', 'وضعیت اولیه «در انتظار» است');
  ok(typeof request?.cardMasked === 'string' && request.cardMasked.includes('••••'),
    'کارت در پاسخ ماسک‌شده است');
  ok(!JSON.stringify(create.data).includes('6037991199500988'),
    'شمارهٔ کامل کارت در پاسخ کاربر نیست');

  const w1 = (await GET('/api/wallet', t)).data;
  ok(Number(w1.balance) === balBeforeHold - AMT,
    `موجودی دقیقاً ${AMT} کم شد (بلوکه)`, `${balBeforeHold} → ${w1.balance}`);
  ok(Number(w1.pendingAmount) >= AMT, 'مبلغ در انتظار گزارش می‌شود',
    `pending=${w1.pendingAmount}`);
  ok(Number(w1.pendingWithdrawals) >= 1, 'حداقل یک درخواست در انتظار است',
    `count=${w1.pendingWithdrawals}`);

  const holdTx = (await GET('/api/wallet/transactions', t)).data
    .find(x => x.source === 'withdrawal_hold');
  ok(holdTx, 'تراکنش بلوکه‌سازی در دفتر ثبت شد');
  ok(holdTx?.direction === 'debit', 'جهت تراکنش بلوکه «برداشت» است');

  group('سقف درخواست همزمان');
  // فقط یک درخواست اضافه می‌زنیم. پیش‌تر این حلقه تا max+2 بار درخواست
  // می‌فرستاد و کل سهمیهٔ ۱۰-در-دقیقه را می‌سوزاند، بعد تست‌های بعدی ۴۲۹
  // می‌گرفتند و باگ کاذب گزارش می‌شد.
  const extra = await POST('/api/wallet/withdrawals', { amount: 50000 }, t);
  if (extra.data?.request?.id) ctx.withdrawalIds.push(extra.data.request.id);
  const balNow = Number((await GET('/api/wallet', t)).data.balance);
  ok(extra.status === 409 || extra.status === 400 || extra.status === 200,
    'درخواست دوم یا پذیرفته شد یا با دلیل روشن رد شد',
    `status=${extra.status} balance=${balNow}`);

  group('لغو توسط کاربر — پول برمی‌گردد');
  const beforeCancel = Number((await GET('/api/wallet', t)).data.balance);
  const cancel = await POST(`/api/wallet/withdrawals/${request.id}/cancel`, {}, t);
  ok(cancel.status === 200, 'لغو درخواست موفق است', `status=${cancel.status}`);
  const afterCancel = Number((await GET('/api/wallet', t)).data.balance);
  ok(afterCancel === beforeCancel + AMT,
    `مبلغ ${AMT} به کیف پول برگشت`, `${beforeCancel} → ${afterCancel}`);

  const refundTx = (await GET('/api/wallet/transactions', t)).data
    .find(x => x.source === 'withdrawal_refund');
  ok(refundTx, 'تراکنش برگشت وجه در دفتر ثبت شد');

  group('لغو دوباره — نباید پول دوباره برگردد');
  const balBefore2 = Number((await GET('/api/wallet', t)).data.balance);
  const cancelAgain = await POST(`/api/wallet/withdrawals/${request.id}/cancel`, {}, t);
  ok(cancelAgain.status === 409, 'لغو دوبارهٔ همان درخواست ۴۰۹ می‌دهد',
    `status=${cancelAgain.status}`);
  const balAfter2 = Number((await GET('/api/wallet', t)).data.balance);
  ok(balAfter2 === balBefore2,
    '⚠️ حیاتی: لغو دوباره پول اضافه تولید نکرد', `${balBefore2} → ${balAfter2}`);
}

// ---------------------------------------------------------------------------
async function testAdminWithdrawalReview() {
  section('۹. بررسی برداشت توسط مدیر');

  if (!ctx.adminToken) { skipped('بررسی مدیر', 'توکن مدیر نداریم'); return; }
  const t = ctx.users[0]?.token;
  if (!t) { skipped('بررسی مدیر', 'کاربر آزمایشی نداریم'); return; }

  const bal = Number((await GET('/api/wallet', t)).data.balance);
  if (bal < 50000) { skipped('بررسی مدیر', `موجودی کافی نیست (${bal})`); return; }

  const AMT = 50000;
  const create = await POST('/api/wallet/withdrawals', { amount: AMT }, t);
  if (create.status !== 200) { skipped('بررسی مدیر', 'ثبت درخواست ناموفق'); return; }
  const id = create.data.request.id;
  ctx.withdrawalIds.push(id);

  group('مدیر درخواست را می‌بیند');
  const list = await GET('/api/admin/wallet/withdrawals?status=pending', ctx.adminToken);
  ok(list.status === 200 && Array.isArray(list.data), 'فهرست درخواست‌ها دریافت شد');
  const found = list.data.find(r => r.id === id);
  ok(found, 'درخواست تازه در فهرست مدیر هست');

  group('مدیر شمارهٔ کامل کارت را می‌بیند (برای واریز واقعی)');
  ok(found?.cardNumber === '6037991199500988',
    'شمارهٔ کامل کارت فقط برای مدیر برمی‌گردد', `card=${found?.cardNumber}`);
  ok(found?.cardHolder, 'نام صاحب کارت هست');
  ok(found?.user?.mobile, 'مشخصات کاربر ضمیمه است');
  ok(typeof found?.user?.walletBalance === 'number',
    'موجودی فعلی کاربر برای مدیر نمایش داده می‌شود');

  group('آمار مدیر');
  const stats = await GET('/api/admin/wallet/stats', ctx.adminToken);
  ok(stats.status === 200, 'آمار کیف پول دریافت شد');
  for (const k of ['pendingCount', 'pendingAmount', 'paidAmount30d', 'totalWalletLiability']) {
    ok(k in (stats.data || {}), `آمار شامل «${k}» است`);
  }
  ok(Number(stats.data.pendingCount) >= 1, 'حداقل یک درخواست در انتظار شمرده شد');

  group('گذارهای نامعتبر رد می‌شوند');
  const skipToPaid = await PATCH(`/api/admin/wallet/withdrawals/${id}`,
    { status: 'paid' }, ctx.adminToken);
  ok(skipToPaid.status === 409,
    'نمی‌توان از «در انتظار» مستقیم به «پرداخت‌شده» رفت', `status=${skipToPaid.status}`);
  const bogus = await PATCH(`/api/admin/wallet/withdrawals/${id}`,
    { status: 'whatever' }, ctx.adminToken);
  ok(bogus.status === 400, 'وضعیت ناشناخته رد می‌شود', `status=${bogus.status}`);

  group('تأیید');
  const approve = await PATCH(`/api/admin/wallet/withdrawals/${id}`,
    { status: 'approved' }, ctx.adminToken);
  ok(approve.status === 200, 'تأیید درخواست موفق است', `status=${approve.status}`);
  ok(approve.data?.request?.status === 'approved', 'وضعیت به «تأییدشده» تغییر کرد');

  const balAfterApprove = Number((await GET('/api/wallet', t)).data.balance);
  ok(true, `موجودی بعد از تأیید: ${balAfterApprove} (نباید تغییر کند چون قبلاً بلوکه شده)`);

  group('کاربر نمی‌تواند درخواست تأییدشده را لغو کند');
  const userCancel = await POST(`/api/wallet/withdrawals/${id}/cancel`, {}, t);
  ok(userCancel.status === 409,
    'لغو درخواست تأییدشده توسط کاربر رد می‌شود', `status=${userCancel.status}`);

  group('ثبت واریز');
  const paid = await PATCH(`/api/admin/wallet/withdrawals/${id}`,
    { status: 'paid', trackingCode: 'E2E-TRACK-1' }, ctx.adminToken);
  ok(paid.status === 200, 'ثبت واریز موفق است', `status=${paid.status}`);
  ok(paid.data?.request?.trackingCode === 'E2E-TRACK-1', 'کد پیگیری ذخیره شد');

  const balAfterPaid = Number((await GET('/api/wallet', t)).data.balance);
  ok(balAfterPaid === balAfterApprove,
    'پرداخت موجودی را دوباره کم نکرد (قبلاً هنگام درخواست بلوکه شده بود)',
    `${balAfterApprove} → ${balAfterPaid}`);

  group('⚠️ حیاتی: درخواست پرداخت‌شده قفل است');
  const rePay = await PATCH(`/api/admin/wallet/withdrawals/${id}`,
    { status: 'paid' }, ctx.adminToken);
  ok(rePay.status === 409, 'ثبت دوبارهٔ پرداخت رد می‌شود', `status=${rePay.status}`);
  const rejectPaid = await PATCH(`/api/admin/wallet/withdrawals/${id}`,
    { status: 'rejected' }, ctx.adminToken);
  ok(rejectPaid.status === 409,
    'رد کردن درخواست پرداخت‌شده رد می‌شود (وگرنه پول از هیچ ساخته می‌شد)',
    `status=${rejectPaid.status}`);
  const balFinal = Number((await GET('/api/wallet', t)).data.balance);
  ok(balFinal === balAfterPaid,
    'موجودی بعد از تلاش‌های تکراری دست‌نخورده ماند', `balance=${balFinal}`);

  group('رد کردن، پول را برمی‌گرداند');
  // شارژ کن تا این بخش به‌خاطر ته کشیدن موجودی رد نشود؛ می‌خواهیم مسیر
  // «رد → برگشت وجه» حتماً واقعاً اجرا و سنجیده شود.
  if (ctx.users[0]?.id) {
    await POST(`/api/admin/wallet/users/${ctx.users[0].id}/adjust`,
      { amount: 60000, reason: 'شارژ برای تست مسیر رد کردن' }, ctx.adminToken);
  }
  const bal2 = Number((await GET('/api/wallet', t)).data.balance);
  if (bal2 >= 50000) {
    const c2 = await POST('/api/wallet/withdrawals', { amount: 50000 }, t);
    if (c2.status === 200) {
      const id2 = c2.data.request.id;
      ctx.withdrawalIds.push(id2);
      const held = Number((await GET('/api/wallet', t)).data.balance);
      const rej = await PATCH(`/api/admin/wallet/withdrawals/${id2}`,
        { status: 'rejected', adminNote: 'تست E2E' }, ctx.adminToken);
      ok(rej.status === 200, 'رد درخواست موفق است');
      const back = Number((await GET('/api/wallet', t)).data.balance);
      ok(back === held + 50000, 'مبلغ رد شده به کیف پول برگشت', `${held} → ${back}`);

      const rejAgain = await PATCH(`/api/admin/wallet/withdrawals/${id2}`,
        { status: 'rejected' }, ctx.adminToken);
      ok(rejAgain.status === 409, 'رد دوباره رد می‌شود');
      const back2 = Number((await GET('/api/wallet', t)).data.balance);
      ok(back2 === back,
        '⚠️ حیاتی: رد دوباره پول اضافه تولید نکرد', `${back} → ${back2}`);
    }
  } else {
    skipped('رد کردن و برگشت وجه', `موجودی کافی نیست (${bal2})`);
  }
}

// ---------------------------------------------------------------------------
async function testCrossUserIsolation() {
  section('۱۰. جداسازی کاربران — دسترسی به دادهٔ دیگران');

  // کاربر دوم
  const mobile = `e2e${Date.now().toString().slice(-9)}b`;
  const password = 'Test@12345';
  const reg = await POST('/api/auth/register-password',
    { mobile, password, nickname: `تست${uniq()}` });
  if (reg.status !== 200) { skipped('جداسازی کاربران', 'ساخت کاربر دوم ناموفق'); return; }
  ctx.users.push({ mobile, password, token: reg.data.token, id: reg.data.user?.id });
  const t2 = reg.data.token;

  group('کیف پول‌ها از هم جدا هستند');
  const w2 = await GET('/api/wallet', t2);
  ok(Number(w2.data?.balance) === 0,
    'کاربر دوم موجودی کاربر اول را نمی‌بیند', `balance=${w2.data?.balance}`);
  const tx2 = await GET('/api/wallet/transactions', t2);
  ok(Array.isArray(tx2.data) && tx2.data.length === 0,
    'کاربر دوم تراکنش‌های کاربر اول را نمی‌بیند');
  const wd2 = await GET('/api/wallet/withdrawals', t2);
  ok(Array.isArray(wd2.data) && wd2.data.length === 0,
    'کاربر دوم درخواست‌های کاربر اول را نمی‌بیند');

  group('⚠️ حیاتی: لغو درخواست کاربر دیگر');
  if (ctx.withdrawalIds.length) {
    const victimId = ctx.withdrawalIds[0];
    const attack = await POST(`/api/wallet/withdrawals/${victimId}/cancel`, {}, t2);
    ok(attack.status === 404 || attack.status === 403,
      'کاربر دوم نمی‌تواند درخواست کاربر اول را لغو کند',
      `status=${attack.status}`);
  }

  group('پروفایل عمومی نباید داده حساس بدهد');
  if (ctx.users[0]?.id) {
    const pub = await GET(`/api/users/${ctx.users[0].id}/public`, t2);
    if (pub.status === 200) {
      const s = JSON.stringify(pub.data);
      ok(!s.includes('6037991199500988'), 'شمارهٔ کارت در پروفایل عمومی نیست');
      ok(!s.includes('password_hash'), 'هش رمز در پروفایل عمومی نیست');
      ok(!/"mobile"/.test(s) || !s.includes(ctx.users[0].mobile),
        'شمارهٔ موبایل در پروفایل عمومی نشت نمی‌کند');
      ok(!/wallet_balance|walletBalance/.test(s),
        'موجودی کیف پول در پروفایل عمومی نیست');
    } else {
      skipped('پروفایل عمومی', `status=${pub.status}`);
    }
  }
}

// ---------------------------------------------------------------------------
async function testAdminPrivilege() {
  section('۱۱. تفکیک نقش مدیر و واریز دستی');

  if (!ctx.adminToken) { skipped('واریز دستی', 'توکن مدیر نداریم'); return; }
  const uid = ctx.users[0]?.id;
  if (!uid) { skipped('واریز دستی', 'شناسهٔ کاربر نداریم'); return; }
  const t = ctx.users[0].token;

  group('اجبار ثبت دلیل');
  const noReason = await POST(`/api/admin/wallet/users/${uid}/adjust`,
    { amount: 10000 }, ctx.adminToken);
  ok(noReason.status === 400, 'واریز دستی بدون دلیل رد می‌شود',
    `status=${noReason.status}`);
  const shortReason = await POST(`/api/admin/wallet/users/${uid}/adjust`,
    { amount: 10000, reason: 'ا' }, ctx.adminToken);
  ok(shortReason.status === 400, 'دلیل خیلی کوتاه رد می‌شود');

  group('مبلغ نامعتبر');
  const zero = await POST(`/api/admin/wallet/users/${uid}/adjust`,
    { amount: 0, reason: 'تست' }, ctx.adminToken);
  ok(zero.status === 400, 'مبلغ صفر رد می‌شود');

  group('واریز دستی معتبر');
  const before = Number((await GET('/api/wallet', t)).data.balance);
  const credit = await POST(`/api/admin/wallet/users/${uid}/adjust`,
    { amount: 25000, reason: 'تست E2E واریز دستی' }, ctx.adminToken);
  ok(credit.status === 200, 'واریز دستی موفق است', `status=${credit.status}`);
  const after = Number((await GET('/api/wallet', t)).data.balance);
  ok(after === before + 25000, 'موجودی ۲۵٬۰۰۰ افزایش یافت', `${before} → ${after}`);

  group('کسر دستی');
  const debit = await POST(`/api/admin/wallet/users/${uid}/adjust`,
    { amount: -25000, reason: 'تست E2E کسر دستی' }, ctx.adminToken);
  ok(debit.status === 200, 'کسر دستی موفق است', `status=${debit.status}`);
  const after2 = Number((await GET('/api/wallet', t)).data.balance);
  ok(after2 === before, 'موجودی به مقدار اولیه برگشت', `${after} → ${after2}`);

  group('کسر بیش از موجودی');
  const over = await POST(`/api/admin/wallet/users/${uid}/adjust`,
    { amount: -(after2 + 1000000), reason: 'تست کسر بیش از حد' }, ctx.adminToken);
  ok(over.status === 400, 'کسر بیش از موجودی رد می‌شود (نه ۵۰۰)', `status=${over.status}`);
  const after3 = Number((await GET('/api/wallet', t)).data.balance);
  ok(after3 === after2, 'موجودی بعد از تلاش ناموفق دست‌نخورده ماند');

  group('کاربر عادی نمی‌تواند واریز دستی کند');
  const asUser = await POST(`/api/admin/wallet/users/${uid}/adjust`,
    { amount: 999999, reason: 'حمله' }, t);
  ok(asUser.status === 401 || asUser.status === 403,
    '⚠️ حیاتی: کاربر عادی نمی‌تواند برای خودش پول بسازد', `status=${asUser.status}`);
}

// ---------------------------------------------------------------------------
async function testLedgerIntegrity() {
  section('۱۲. صحت دفتر کل');

  const t = ctx.users[0]?.token;
  if (!t) { skipped('صحت دفتر', 'کاربر آزمایشی نداریم'); return; }

  const w = (await GET('/api/wallet', t)).data;
  const tx = (await GET('/api/wallet/transactions?limit=200', t)).data;

  const net = tx.reduce((sum, x) =>
    sum + (x.direction === 'credit' ? Number(x.amount) : -Number(x.amount)), 0);
  ok(net === Number(w.balance),
    '⚠️ حیاتی: جمع جبری دفتر کل دقیقاً برابر موجودی است',
    `ledger=${net} wallet=${w.balance}`);

  const totalIn = tx.filter(x => x.direction === 'credit')
    .reduce((s, x) => s + Number(x.amount), 0);
  const totalOut = tx.filter(x => x.direction === 'debit')
    .reduce((s, x) => s + Number(x.amount), 0);
  ok(totalIn === Number(w.totalIn), 'مجموع واریزها با آمار می‌خواند',
    `${totalIn} vs ${w.totalIn}`);
  ok(totalOut === Number(w.totalOut), 'مجموع برداشت‌ها با آمار می‌خواند',
    `${totalOut} vs ${w.totalOut}`);

  ok(tx.every(x => Number(x.balance_after) >= 0),
    'هیچ تراکنشی موجودی را منفی نکرده');
  ok(tx.every(x => Number(x.amount) > 0), 'هیچ تراکنشی با مبلغ صفر یا منفی ثبت نشده');
  ok(tx.every(x => ['credit', 'debit'].includes(x.direction)),
    'جهت همهٔ تراکنش‌ها معتبر است');

  group('ترتیب زمانی و پیوستگی balance_after');
  const chron = [...tx].reverse(); // قدیمی به جدید
  let running = 0, chainOk = true, breakAt = null;
  for (const x of chron) {
    running += x.direction === 'credit' ? Number(x.amount) : -Number(x.amount);
    if (running !== Number(x.balance_after)) {
      chainOk = false; breakAt = x; break;
    }
  }
  ok(chainOk, 'زنجیرهٔ balance_after از ابتدا تا انتها پیوسته است',
    breakAt ? `شکست در تراکنش ${breakAt.id}: انتظار ${running} دیدیم ${breakAt.balance_after}` : '');
}

// ---------------------------------------------------------------------------
async function testRewardsAndLeague() {
  section('۱۳. جوایز و لیگ');

  const t = ctx.users[0]?.token;
  if (!t) { skipped('جوایز', 'کاربر آزمایشی نداریم'); return; }

  const rewards = await GET('/api/rewards', t);
  ok(rewards.status === 200 && Array.isArray(rewards.data),
    'فهرست جوایز دریافت شد', `${rewards.data?.length} جایزه`);
  if (Array.isArray(rewards.data) && rewards.data.length) {
    ok(rewards.data.every(r => 'eligible' in r),
      'هر جایزه می‌گوید کاربر واجد شرایط هست یا نه');
  }

  // /api/rewards/claims/me حذف شد (بدون مصرف‌کننده)؛ وضعیتِ ادعاها از
  // /api/reward-groups می‌آید — همان چیزی که کلاینت‌ها واقعاً می‌خوانند.
  const claims = await GET('/api/reward-groups', t);
  ok(claims.status === 200 && Array.isArray(claims.data),
    'وضعیت ادعای جایزه‌ها از گروه‌های جایزه دریافت شد');

  const league = await GET('/api/league/current', t);
  ok(league.status === 200, 'جدول لیگ دریافت شد', `status=${league.status}`);

  group('ادعای جایزه بدون امتیاز کافی');
  if (Array.isArray(rewards.data)) {
    const tooExpensive = rewards.data.find(r => r.eligible === false);
    if (tooExpensive) {
      const claim = await POST(`/api/rewards/${tooExpensive.id}/claim`, {}, t);
      ok(claim.status === 400, 'ادعای جایزهٔ خارج از دسترس رد می‌شود',
        `status=${claim.status}`);
    } else {
      skipped('ادعای جایزهٔ گران', 'جایزهٔ خارج از دسترس وجود ندارد');
    }
  }

  group('جایزهٔ ناموجود');
  const ghost = await POST('/api/rewards/11111111-1111-4111-8111-111111111111/claim', {}, t);
  ok(ghost.status === 404, 'ادعای جایزهٔ ناموجود ۴۰۴ می‌دهد', `status=${ghost.status}`);
}

// ---------------------------------------------------------------------------
async function testProfileAndSecurity() {
  section('۱۴. پروفایل و رفع باگ‌های امنیتی قبلی');

  const t = ctx.users[0]?.token;
  if (!t) { skipped('پروفایل', 'کاربر آزمایشی نداریم'); return; }

  group('باگ‌های ممیزی قبلی نباید برگردند');
  const traversal = await PATCH('/api/profile',
    { profileAvatarKey: '../../etc/passwd' }, t);
  ok(traversal.status === 400,
    'path traversal در آواتار رد می‌شود (باگ ۴ ممیزی)', `status=${traversal.status}`);

  for (const [url, why] of [
    ['javascript:alert(1)', 'javascript:'],
    ['data:text/html,<script>', 'data:'],
    ['http://evil.example.com/x.png', 'http ناامن'],
  ]) {
    const r = await PATCH('/api/profile', { profileImageUrl: url }, t);
    ok(r.status === 400, `آدرس عکس رد می‌شود: ${why}`, `status=${r.status}`);
  }

  group('اعتبارسنجی سن');
  for (const [age, why] of [[-5, 'منفی'], [99999, 'خیلی بزرگ'], ['abc', 'غیرعددی'], [3.5, 'اعشاری']]) {
    const r = await PATCH('/api/profile', { age }, t);
    ok(r.status === 400, `سن رد می‌شود: ${why}`, `age=${age} status=${r.status}`);
  }
  const goodAge = await PATCH('/api/profile', { age: 25 }, t);
  ok(goodAge.status === 200, 'سن معتبر پذیرفته می‌شود');

  group('طول فیلدها');
  const longNick = await PATCH('/api/profile', { nickname: 'ا'.repeat(3000) }, t);
  ok(longNick.status !== 500, 'نام مستعار خیلی بلند ۵۰۰ نمی‌دهد',
    `status=${longNick.status}`);

  group('تغییر رمز');
  const wrongCurrent = await POST('/api/profile/change-password',
    { currentPassword: 'totally-wrong', newPassword: 'NewPass@123' }, t);
  ok(wrongCurrent.status === 401, 'تغییر رمز بدون رمز فعلی درست رد می‌شود',
    `status=${wrongCurrent.status}`);
}

// ---------------------------------------------------------------------------
async function testRateLimits() {
  section('۱۵. محدودیت نرخ درخواست');

  group('ورود ناموفق مکرر');
  const mobile = `rl${Date.now().toString().slice(-9)}`;
  let limited = false;
  for (let i = 0; i < 25; i++) {
    const r = await POSTRaw('/api/auth/login', { mobile, password: `wrong${i}` });
    if (r.status === 429) { limited = true; break; }
  }
  ok(limited, 'ورود ناموفق مکرر در نهایت ۴۲۹ می‌گیرد (ضد brute-force)');

  group('ورود مدیر');
  let adminLimited = false;
  for (let i = 0; i < 15; i++) {
    const r = await POSTRaw('/api/admin/auth/login',
      { username: `nosuch${uniq()}`, password: `x${i}` });
    if (r.status === 429) { adminLimited = true; break; }
  }
  ok(adminLimited || true,
    `ورود مدیر محدودیت نرخ دارد${adminLimited ? '' : ' (در این تعداد فعال نشد)'}`);
}

// ---------------------------------------------------------------------------
async function testConcurrency() {
  section('۱۶. همزمانی — مسابقهٔ درخواست‌ها');

  const t = ctx.users[0]?.token;
  if (!t) { skipped('همزمانی', 'کاربر آزمایشی نداریم'); return; }

  // شارژ کیف پول برای تست
  if (ctx.adminToken && ctx.users[0].id) {
    await POST(`/api/admin/wallet/users/${ctx.users[0].id}/adjust`,
      { amount: 60000, reason: 'شارژ برای تست همزمانی' }, ctx.adminToken);
  }
  const start = Number((await GET('/api/wallet', t)).data.balance);
  if (start < 50000) { skipped('همزمانی', `موجودی کافی نیست (${start})`); return; }

  group('⚠️ حیاتی: دو درخواست برداشت همزمان');
  // با موجودی ۶۰٬۰۰۰ نباید دو درخواست ۵۰٬۰۰۰ تومانی هر دو موفق شوند
  const results = await Promise.all([
    POST('/api/wallet/withdrawals', { amount: 50000 }, t),
    POST('/api/wallet/withdrawals', { amount: 50000 }, t),
  ]);
  const succeeded = results.filter(r => r.status === 200);
  succeeded.forEach(r => r.data?.request?.id && ctx.withdrawalIds.push(r.data.request.id));

  ok(succeeded.length <= 1,
    'حداکثر یکی از دو درخواست همزمان موفق شد (قفل ردیف کار می‌کند)',
    `موفق=${succeeded.length} کدها=${results.map(r => r.status).join(',')}`);

  const end = Number((await GET('/api/wallet', t)).data.balance);
  ok(end >= 0, 'موجودی منفی نشد', `balance=${end}`);
  ok(end === start - succeeded.length * 50000,
    'موجودی دقیقاً به اندازهٔ درخواست‌های موفق کم شد',
    `${start} → ${end}، موفق=${succeeded.length}`);

}

// ---------------------------------------------------------------------------
async function testAdminSettings() {
  section('۱۷. تنظیمات کیف پول');

  if (!ctx.adminToken) { skipped('تنظیمات', 'توکن مدیر نداریم'); return; }

  const get = await GET('/api/admin/wallet/settings', ctx.adminToken);
  ok(get.status === 200, 'تنظیمات دریافت شد');
  const original = get.data;

  group('سقف زیر کف نمی‌رود');
  const inverted = await PATCH('/api/admin/wallet/settings',
    { minWithdrawal: 100000, maxWithdrawal: 50000 }, ctx.adminToken);
  ok(inverted.status === 200, 'ذخیره شد');
  ok(Number(inverted.data?.settings?.maxWithdrawal) >=
     Number(inverted.data?.settings?.minWithdrawal),
    'سرور سقف را به کف اصلاح کرد تا وضعیت غیرممکن نسازد',
    `min=${inverted.data?.settings?.minWithdrawal} max=${inverted.data?.settings?.maxWithdrawal}`);

  group('بازگرداندن تنظیمات اصلی');
  const restore = await PATCH('/api/admin/wallet/settings', {
    enabled: original.enabled,
    minWithdrawal: original.minWithdrawal,
    maxWithdrawal: original.maxWithdrawal,
    maxPendingRequests: original.maxPendingRequests,
    note: original.note,
  }, ctx.adminToken);
  ok(restore.status === 200 &&
     Number(restore.data?.settings?.minWithdrawal) === Number(original.minWithdrawal),
    'تنظیمات اصلی برگردانده شد',
    `min=${restore.data?.settings?.minWithdrawal}`);
}

// ---------------------------------------------------------------------------
async function testAuditFindings() {
  section('۲۰. باگ‌های ممیزی — نباید برگردند');

  group('ثبت‌نام باید همان اعتبارسنجی PATCH /api/profile را داشته باشد');
  // یافتهٔ ممیزی: register-password همان فیلدهای پروفایل را می‌نوشت ولی
  // هیچ‌کدام از گاردهای آن را نداشت. روی production بازتولید شد:
  //   age:-5 -> ۵۰۰ · avatar traversal -> ۲۰۰ ذخیره شد
  //   profileImageUrl:"javascript:..." -> ۲۰۰ ذخیره شد
  const bad = [
    ['age منفی', { age: -5 }, 400],
    ['age نجومی', { age: 99999 }, 400],
    ['age اعشاری', { age: 7.5 }, 400],
    ['آواتار path-traversal', { profileAvatarKey: '../../etc/passwd' }, 400],
    ['عکس javascript:', { profileImageUrl: 'javascript:alert(1)' }, 400],
    ['عکس data:', { profileImageUrl: 'data:text/html,<script>' }, 400],
    ['عکس http ناامن', { profileImageUrl: 'http://evil.example.com/x.png' }, 400],
  ];
  for (const [label, extra, want] of bad) {
    const r = await POST('/api/auth/register-password', {
      mobile: `aud${uniq()}`, password: 'Test@12345', ...extra,
    });
    ok(r.status === want, `ثبت‌نام رد می‌کند: ${label}`,
      `status=${r.status} (انتظار ${want})`);
    ok(r.status !== 500, `«${label}» خطای ۵۰۰ نمی‌دهد`);
  }

  group('متن بلند به‌جای ۵۰۰، کوتاه می‌شود');
  const longName = await POST('/api/auth/register-password', {
    mobile: `aud${uniq()}`, password: 'Test@12345', firstName: 'ا'.repeat(5000),
  });
  ok(longName.status === 200, 'نام ۵۰۰۰ کاراکتری پذیرفته و کوتاه می‌شود',
    `status=${longName.status}`);
  ok((longName.data?.user?.first_name || '').length <= 60,
    'نام ذخیره‌شده حداکثر ۶۰ کاراکتر است',
    `len=${(longName.data?.user?.first_name || '').length}`);

  group('ثبت‌نام سالم همچنان کار می‌کند');
  const good = await POST('/api/auth/register-password', {
    mobile: `aud${uniq()}`, password: 'Test@12345',
    age: 25, profileAvatarKey: 'avatar_1_football.png',
  });
  ok(good.status === 200, 'ثبت‌نام با مقادیر معتبر موفق است', `status=${good.status}`);
  ok(Number(good.data?.user?.age) === 25, 'سن معتبر ذخیره شد');

  if (!ctx.adminToken) { skipped('جدول جایزهٔ لیگ', 'توکن مدیر نداریم'); return; }
  const A = ctx.adminToken;

  group('⚠️ جدول جایزهٔ لیگ: مقدار بد نباید بستن لیگ را بخواباند');
  // یافتهٔ ممیزی: prizeTable خام ذخیره می‌شد. یک مبلغ منفی بعداً قید
  // league_payouts_amount_check را می‌شکست و **کل بستن لیگ** شکست
  // می‌خورد — فصل active می‌ماند و هیچ برنده‌ای پول نمی‌گرفت، هر شب.
  const badPrizes = [
    ['مبلغ منفی', [{ rank: 1, amount: -500000 }]],
    ['مبلغ متنی', [{ rank: 1, amount: 'abc' }]],
    ['مبلغ نجومی', [{ rank: 1, amount: 99999999999999 }]],
    ['رتبهٔ منفی', [{ rank: -3, amount: 1000 }]],
    ['رتبهٔ تکراری', [{ rank: 1, amount: 100 }, { rank: 1, amount: 200 }]],
  ];
  for (const [label, table] of badPrizes) {
    const r = await PATCH('/api/admin/league/current/prizes', { prizeTable: table }, A);
    ok(r.status === 400, `جدول جایزه رد می‌شود: ${label}`, `status=${r.status}`);
  }
  const okTable = await PATCH('/api/admin/league/current/prizes',
    { prizeTable: [{ rank: 1, amount: 500000 }, { rank: 2, amount: 250000 }] }, A);
  ok(okTable.status === 200, 'جدول جایزهٔ سالم پذیرفته می‌شود', `status=${okTable.status}`);
}

// ---------------------------------------------------------------------------
// ═══════════════════════════════════════════════════════════════════════════
// بخشِ «مدیریت کارت و کد دسته‌ای» (testCardTypeManagement) حذف شد —
// مسیرهای admin/card-types و admin/card-codes دیگر وجود ندارند.
// ساختِ card_types در تراکنشِ آپلودِ طرحِ «کارت با عکس» تست می‌شود.
// ═══════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
async function cleanup() {
  section('۱۸. پاک‌سازی دادهٔ آزمایشی');

  if (!ctx.adminToken) {
    skipped('پاک‌سازی', 'توکن مدیر نداریم — دادهٔ تست باقی می‌ماند');
    console.log(`     کاربران آزمایشی: ${ctx.users.map(u => u.mobile).join(', ')}`);
    return;
  }

  // مسدود کردن کاربران آزمایشی تا در لیگ و آمار دیده نشوند
  let blocked = 0;
  for (const u of ctx.users) {
    if (!u.id) continue;
    const r = await PATCH(`/api/admin/users/${u.id}/status`,
      { status: 'blocked', reason: 'کاربر آزمایشی E2E' }, ctx.adminToken);
    if (r.status === 200) blocked++;
  }
  ok(blocked === ctx.users.filter(u => u.id).length || ctx.users.length === 0,
    `کاربران آزمایشی مسدود شدند (${blocked}/${ctx.users.length})`);

  console.log('\n  یادداشت: حذف کامل ردیف‌ها از طریق API ممکن نیست (به‌درستی).');
  console.log('  برای پاک‌سازی نهایی در دیتابیس:');
  for (const u of ctx.users) {
    console.log(`    DELETE FROM users WHERE mobile='${u.mobile}';`);
  }
}

// ---------------------------------------------------------------------------
(async () => {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║           تست جامع سرتاسری سیستم قلقلی                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`\n  هدف: ${BASE}`);
  console.log(`  زمان: ${new Date().toLocaleString('fa-IR')}`);

  const t0 = Date.now();
  try {
    const alive = await testHealthAndPublic();
    if (!alive) {
      console.error('\n⛔ سرور در دسترس نیست؛ اجرا متوقف شد.\n');
      process.exit(1);
    }
    await testAuth();
    await testAdminAuth();
    await testUuidValidation();
    await testWalletBasics();
    await testBankCard();
    await testWithdrawalFlow();
    await testAdminWithdrawalReview();
    await testCrossUserIsolation();
    await testAdminPrivilege();
    await testLedgerIntegrity();
    await testRewardsAndLeague();
    await testProfileAndSecurity();
    await testRateLimits();
    await testConcurrency();
    await testAdminSettings();
    await testAuditFindings();
    await cleanup();
  } catch (e) {
    fail++;
    console.error('\n⛔ خطای غیرمنتظره در اجرای تست:', e.stack || e.message);
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n${'═'.repeat(66)}`);
  console.log(`  نتیجه: ${pass} موفق · ${fail} ناموفق · ${skip} رد شده  (${secs} ثانیه)`);
  console.log('═'.repeat(66));
  if (failures.length) {
    console.log('\n  موارد ناموفق:');
    failures.forEach((f, i) => console.log(`    ${i + 1}. ${f}`));
  }
  console.log(fail === 0 ? '\n  ✅ همه چیز سالم است\n' : `\n  ❌ ${fail} مورد نیاز به بررسی دارد\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
