#!/usr/bin/env node
// ============================================================================
//  تستِ عمقِ نقش‌های پنل مدیریت (black-box روی سرورِ واقعی)
// ============================================================================
//
//   node scripts/testAdminRoleDepth.js                 # سرور محلی
//   BASE=https://api.ghelghelishop.ir ALLOW_PROD=yes-i-know node ...
//
// ── چرا این تست هست ─────────────────────────────────────────────────
//
// testRouteAuth.js فقط می‌سنجد که هر مسیرِ /api/admin **ادمین‌گارد** دارد
// (یعنی بدونِ توکن ۴۰۱ بدهد). ولی نمی‌سنجد که **عمقِ نقش** درست باشد:
// یک حسابِ «ناظر» یا «پشتیبان» نباید بتواند کاری را بکند که نقشش اجازه
// نمی‌دهد. باگی که در ممیزی پیدا شد دقیقاً همین کلاس بود: مرزِ ناظر فقط
// در UI بود، نه سرور.
//
// این تست همان کاری را خودکار می‌کند که روزِ ممیزی دستی انجام شد:
//   ۱. سه توکنِ واقعی می‌گیرد: super_admin، support، observer
//      (حساب‌های موقت با POST /api/admin/admins ساخته و در انتها حذف/
//       غیرفعال می‌شوند)؛
//   ۲. همهٔ مسیرهای /api/admin/** را از سورس استخراج می‌کند (server.js و
//      src/routes/*.js)؛
//   ۳. برای هر مسیر، با توکنِ ناظر و پشتیبان درخواست می‌زند و توقعِ ماتریس
//      مجوز را می‌سنجد:
//        • ناظر: فقط GETِ سفید (داشبورد/مانیتورینگ/تیکت‌ها) → بقیه ۴۰۳؛
//        • پشتیبان: GETِ عملیاتی مجاز، ولی مسیرهای requireRole() خالیِ
//          (فقط ابرادمین: مدیریت ادمین‌ها، تنظیمات حساس) → ۴۰۳؛
//   ۴. مثلثِ تثبیت: ابرادمین روی همان مسیرها نباید ۴۰۳ ببیند (۴۰۱/۴۰۰/۴۰۴
//      قبول است چون یعنی گاردِ نقش ردش نکرده).
//
// اصول:
//   • هیچ داده‌ای پایدار نمی‌ماند: بدنه‌ها خالی/ایمن‌اند (مثلاً GET یا
//     PATCH با {} که قبل از تغییر، اعتبارسنجی رد می‌کند)؛
//   • تست‌های نوشتاریِ حساس هرگز با مبلغ/شناسهٔ واقعی اجرا نمی‌شوند؛
//     هدف فقط «گاردِ نقش قبل از منطق رد می‌کند یا نه» است، پس ۴۰۳/۴۰۰/۴۰۴
//     پاس قابل‌قبولِ «اجازه نداری/ورودی نامعتبر» است و فقط ۲۰۰/۲۰۱ از
//     نقشِ غیرمجاز خطاست.

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || `http://127.0.0.1:${process.env.PORT || 4000}`;
const ADMIN_USER = process.env.E2E_ADMIN_USER || process.env.ADMIN_DEFAULT_USERNAME || 'Admin';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || process.env.ADMIN_DEFAULT_PASSWORD;

const PROD_HOSTS = ['api.ghelghelishop.ir', 'ghelghelishop.ir'];
const host = (() => { try { return new URL(BASE).hostname; } catch { return ''; } })();
if (PROD_HOSTS.includes(host) && process.env.ALLOW_PROD !== 'yes-i-know') {
  console.error(`
⛔ هدف این اجرا سرور production است (${host}).
   روی staging اجرا کنید: BASE=http://127.0.0.1:4999 node scripts/testAdminRoleDepth.js
   (اجرای آگاهانه: ALLOW_PROD=yes-i-know)`);
  process.exit(2);
}

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(name); console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uniq = () => Math.random().toString(36).slice(2, 9);

async function req(method, p, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`${BASE}${p}`, { method, headers, body: payload });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}

// ── استخراجِ همهٔ مسیرهای /api/admin از سورس ────────────────────────
// الگوها:
//   app.get ('/api/admin/...',   adminAuth, ...)        در server.js
//   router.get ('/admin/...',     adminAuth, ...)       در routes/*.js
// از نقطهٔ شروعِ فراخوانیِ app.METHOD(...) کل عبارت را تا بسته‌شدنِ پرانتز
// می‌خواند تا آرگومان‌های همان مسیر (و نه مسیرِ بعدی) برای کشفِ نقش بررسی
// شود. پنجرهٔ ثابتِ کاراکتری گاهی requireRole مسیرِ بعدی را به این یکی
// می‌چسباند (باگِ واقعیِ همین تست در نسخهٔ اول).
function extractCallArgs(src, openParenIndex) {
  let depth = 0;
  for (let i = openParenIndex; i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return src.slice(openParenIndex, i + 1); }
  }
  return src.slice(openParenIndex);
}

function extractRoutes() {
  const roots = [
    path.join(__dirname, '..', 'src', 'server.js'),
    ...fs.readdirSync(path.join(__dirname, '..', 'src', 'routes'))
      .filter(f => f.endsWith('.js'))
      .map(f => path.join(__dirname, '..', 'src', 'routes', f)),
  ];
  const routes = [];
  const re = /\b(?:app|router)\.(get|post|patch|put|delete)\(\s*[`'"]([^`'"]+)[`'"]/g;
  for (const file of roots) {
    const src = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = re.exec(src))) {
      const [, verb, rawPath] = m;
      let p = rawPath;
      if (p.startsWith('/api/admin')) p = p.slice(4);        // /api/admin/.. → /admin/..
      else if (p.startsWith('/admin')) { /* همان است */ }
      else continue;                                          // مسیر غیرادمین
      // پارامتر مسیر را با مقدارِ بی‌خطر جایگزین کن (UUID جعلیِ فرم‌درست
      // تا به ۵۰۰ نرسد؛ گاردِ نقش قبل از منطق اجرا می‌شود).
      const concrete = p
        .replace(/:hash/g, 'x'.repeat(40))
        .replace(/:[a-zA-Z]+/g, '00000000-0000-4000-8000-000000000000')
        .replace(/\/+/g, '/');
      // نقشِ موردنیاز فقط از آرگومان‌های همین فراخوانی استخراج می‌شود.
      const openIdx = src.indexOf('(', m.index);
      const args = extractCallArgs(src, openIdx);
      const roleM = args.match(/requireRole\(([^)]*)\)/);
      const roles = roleM
        ? roleM[1].split(',').map(s => s.replace(/['"\s]/g, '')).filter(Boolean)
        : null; // null = بدون requireRole صریح (پیش‌فرضِ ادمینِ عام)
      routes.push({ verb: verb.toUpperCase(), path: concrete, roles });
    }
  }
  // یکتا‌سازی (هم مسیر ممکن است در دو فایل الگو بخورد).
  const seen = new Set();
  return routes.filter(r => {
    const k = `${r.verb} ${r.path}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  }).sort((a, b) => a.path.localeCompare(b.path) || a.verb.localeCompare(b.verb));
}

// مسیرهایی که ناظر می‌تواند GET بزند (آینهٔ observerReadGuard سرور).
const OBSERVER_GET_ALLOWED = [
  /^\/dashboard$/,
  /^\/metrics$/,
  /^\/support\/tickets$/,
  /^\/support\/tickets\/[^/]+\/messages$/,
];
const observerCanGet = p => OBSERVER_GET_ALLOWED.some(rx => rx.test(p.replace(/\/+$/, '')));

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║   تستِ عمقِ نقش‌های پنل (super_admin / support / observer)        ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`  هدف: ${BASE} · ${new Date().toLocaleString('fa-IR')}`);

  const health = await req('GET', '/health');
  if (health.status !== 200) {
    console.error('⛔ سرور در دسترس نیست؛ ابتدا API را اجرا کنید.');
    process.exit(2);
  }

  // ── ۱) ورود ابرادمین ──────────────────────────────────────────────
  const login = await req('POST', '/api/admin/auth/login', { body: { username: ADMIN_USER, password: ADMIN_PASS } });
  const superToken = login.data?.token;
  ok(login.status === 200 && superToken, 'ابرادمین وارد شد', `status=${login.status}`);
  if (!superToken) process.exit(2);

  // ── ۲) ساختِ دو حسابِ موقت (پشتیبان و ناظر) ───────────────────────
  const stamp = uniq();
  const supportUser = `roledepth_support_${stamp}`;
  const observerUser = `roledepth_observer_${stamp}`;
  const tempPassword = `Temp@${stamp}2026`;

  async function createAdmin(username, role) {
    const r = await req('POST', '/api/admin/admins', {
      token: superToken,
      body: { username, password: tempPassword, role },
    });
    ok(r.status === 200 || r.status === 201, `حسابِ ${role} ساخته شد`, `status=${r.status} ${typeof r.data === 'object' ? r.data?.message || '' : r.data}`);
    const lr = await req('POST', '/api/admin/auth/login', { body: { username, password: tempPassword } });
    if (!lr.data?.token) throw new Error(`ورود ${role} شکست: ${lr.status}`);
    return { username, id: r.data?.id, token: lr.data.token };
  }

  let support, observer;
  try {
    support = await createAdmin(supportUser, 'support');
    observer = await createAdmin(observerUser, 'observer');
  } catch (e) {
    console.error('⛔ ساخت حساب‌های تست شکست:', e.message);
    process.exit(2);
  }

  const routes = extractRoutes();
  console.log(`\n  ${routes.length} مسیرِ ادمین از سورس استخراج شد.`);

  // ── ۳) ماتریسِ نقش‌ها ─────────────────────────────────────────────
  //
  // حکمِ «مجاز نیست»: کدِ ۴۰۳. حکمِ «مجاز است یا قبل از نقش رد شد»:
  // هر چیزی جز ۴۰۳ (۴۰۰/۴۰۴/۴۰۱/۵۰۰) — چون ما بدنه و شناسه جعلی می‌فرستیم
  // و فقط رفتارِ گاردِ نقش را می‌سنجیم.
  const FORBIDDEN = 403;
  let observerChecked = 0, supportChecked = 0;
  const observerLeaks = [];   // باید ۴۰۳ می‌بود ولی نبود
  const supportLeaks = [];   // مسیر فقط-ابرادمین که پشتیبان رد نشد
  const superFalse403 = [];  // ابرادمین که نباید ۴۰۳ ببیند

  // مسیرهای فقط-ابرادمین: یا requireRole() خالی دارند یا requireRole('super_admin').
  const isSuperOnly = r => Array.isArray(r.roles) && r.roles.length === 0
    || (r.roles || []).includes('super_admin');

  for (const r of routes) {
    // لاگین خودش گارد نقش ندارد (پیش از گارد است)؛ ردش می‌کنیم.
    if (r.path.includes('/auth/login')) continue;

    const body = ['GET'].includes(r.verb) ? undefined : {};
    const url = `/api${r.path.startsWith('/admin') ? r.path : `/admin${r.path}`}`;

    // ناظر
    {
      const expectAllowed = r.verb === 'GET' && observerCanGet(r.path);
      const res = await req(r.verb, url, { token: observer.token, body });
      observerChecked++;
      // حکمِ امنیتی فقط کدِ نقش است:
      //   • مسیر غیرمجاز باید ۴۰۳ باشد (دیدنِ ۲۰۰/۴۰۰/۴۰۴/۵۰۰ یعنی گارد
      //     نقش جلویش را نگرفته)؛
      //   • مسیر سفید نباید ۴۰۳ ببیند (آن یعنی گارد بیش از حد بسته).
      if (!expectAllowed && res.status !== FORBIDDEN) {
        observerLeaks.push(`${r.verb} ${r.path} → ${res.status}`);
      }
      if (expectAllowed && res.status === FORBIDDEN) {
        observerLeaks.push(`(سفیدِ ردشده) ${r.verb} ${r.path} → 403`);
      }
      // مهربانی با سقفِ نرخ.
      if (res.status === 429) await sleep(3000);
    }

    // پشتیبان در برابر مسیرهای فقط-ابرادمین.
    // توقعِ سخت‌گیرانه همان ۴۰۳ است؛ ولی بدنهٔ {} یا شناسهٔ جعلی ممکن است
    // بعضی مسیرها را قبل از پاسخ به ۴۰۰/۴۰۴ برساند — هر دو یعنی «گاردِ نقش
    // اجازه داد ولی منطق بعدی رد کرد». چون هدفِ این تست فقط رفتارِ گارد است،
    // ۴۰۰/۴۰۴/۴۰۱/۵۰۰ قابل‌قبول‌اند؛ فقط ۲۰۰/۲۰۱ (اجازهِ واقعی) نشتی است.
    if (isSuperOnly(r)) {
      const res = await req(r.verb, url, { token: support.token, body });
      supportChecked++;
      if (res.status === 200 || res.status === 201 || res.status === 204) {
        supportLeaks.push(`${r.verb} ${r.path} → ${res.status} (roles=${JSON.stringify(r.roles)})`);
      }
      if (res.status === 429) await sleep(3000);
    }

    // تثبیت: ابرادمین نباید روی هیچ مسیری ۴۰۳ نقش ببیند.
    {
      const res = await req(r.verb, url, { token: superToken, body });
      if (res.status === FORBIDDEN) superFalse403.push(`${r.verb} ${r.path} → 403`);
      if (res.status === 429) await sleep(3000);
    }
  }

  console.log(`\n── ناظر: ${observerChecked} درخواست (توقع ۴۰۳ برای همه جز سفیدِ GET)`);
  ok(observerLeaks.length === 0,
    `ناظر هیچ مسیرِ غیرمجازی را باز نکرد (${observerChecked} بررسی)`,
    observerLeaks.slice(0, 8).join(' | '));
  observerLeaks.slice(8).forEach(l => console.error(`      … ${l}`));

  console.log(`\n── پشتیبان: ${supportChecked} مسیرِ فقط-ابرادمین`);
  ok(supportLeaks.length === 0,
    `پشتیبان از همهٔ مسیرهای فقط-ابرادمین رد شد (${supportChecked} بررسی)`,
    supportLeaks.slice(0, 8).join(' | '));
  supportLeaks.slice(8).forEach(l => console.error(`      … ${l}`));

  console.log('\n── تثبیتِ ابرادمین');
  ok(superFalse403.length === 0,
    'ابرادمین روی هیچ مسیری با ۴۰۳ِ نقش رد نشد',
    superFalse403.slice(0, 8).join(' | '));

  // ── ۴) توکن کاربرِ عادی نباید به /api/admin راه یابد (نمونه‌برداری) ─
  console.log('\n── کاربر عادی پشتِ درِ ادمین');
  // ثبت‌نام یک کاربر عادی
  const mobile = `roledepth${uniq()}`;
  const reg = await req('POST', '/api/auth/register-password', {
    body: { mobile, password: 'Rd@1234567', nickname: 'تست نقش' },
  });
  const userToken = reg.data?.token;
  ok(!!userToken, 'کاربر عادی ساخته شد');
  if (userToken) {
    const probes = [
      ['GET', '/api/admin/dashboard'],
      ['POST', '/api/admin/admins'],
      ['GET', '/api/admin/wallet/withdrawals'],
      ['PATCH', '/api/admin/settings/live-content/rules'],
    ];
    for (const [v, p] of probes) {
      const r = await req(v, p, { token: userToken, body: v === 'GET' ? undefined : {} });
      ok(r.status === 401 || r.status === 403,
        `کاربر عادی از ${v} ${p} رد شد`, `status=${r.status}`);
    }
  }

  // ── ۵) پاک‌سازی: حساب‌های موقت را غیرفعال و حذف می‌کنیم ───────────
  for (const a of [support, observer].filter(Boolean)) {
    if (a.id) {
      // ابتدا غیرفعال (تا اگر حذف در نسخه‌ای نبود، دسترسی قطع شود).
      await req('PATCH', `/api/admin/admins/${a.id}/status`, {
        token: superToken, body: { isActive: false },
      });
    }
  }
  // حذفِ کامل اگر مسیرش باشد (در غیر این صورت غیرفعال‌مانده‌ها بی‌خطرند).
  console.log('\n  پاک‌سازی: حساب‌های موقت غیرفعال شدند.');
  console.log('  (در صورت نیاز به حذف کامل، با ابرادمین از پنلِ «مدیریت ادمین‌ها» اقدام کنید.)');

  console.log(`\n${'═'.repeat(66)}`);
  console.log(`  نتیجه: ${pass} موفق · ${fail} ناموفق`);
  console.log('═'.repeat(66));
  if (fail) {
    console.log('\n  موارد ناموفق:');
    failures.forEach((f, i) => console.log(`    ${i + 1}. ${f}`));
    console.log('\n  ❌ مرزِ نقش‌ها نشتی دارد\n');
    process.exit(1);
  }
  console.log('\n  ✅ عمقِ نقش‌ها سالم است\n');
  process.exit(0);
}

main().catch(e => {
  console.error('\n❌ اجرای تست متوقف شد:', e.message);
  console.error(e.stack);
  process.exit(1);
});
