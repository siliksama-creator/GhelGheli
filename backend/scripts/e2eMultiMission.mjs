#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// تستِ سرتاسریِ «چند ماموریتِ اختصاصی» — روی سرورِ واقعی
// ═══════════════════════════════════════════════════════════════════════════
//
// چرا این فایل جداست: `testMultiCustomMission.js` سرویس را با دیتابیسِ جعلی
// می‌سنجد و سریع است، ولی مسیرِ **پول** را نمی‌بیند. این تست همان کاری را
// می‌کند که ادمین و کاربر می‌کنند: ورودِ ادمین، ساختِ چند ماموریت از پنل،
// دیدنِ کارت‌ها توسط کاربرِ تازه، دریافتِ امتیازِ یک ماموریتِ مشخص، دفترِ
// امتیاز، ویرایشِ متن، و «دورهٔ تازه» — همه از روی HTTP.
//
// دو جا اجرا می‌شود:
//   ۱) در CI روی سرورِ همان job (`backend-e2e`) با دیتابیسِ دورریختنی؛
//   ۲) روی سرورِ زنده با دیتابیسِ دورریختنی:
//        bash backend/scripts/e2eMultiMission.sh
//
// ⚠️ در پایان، وضعیتِ پنل را به همان چیزی که اول بود برمی‌گرداند.
//
// متغیرها: BASE (پیش‌فرض 127.0.0.1:4999)، GG_ADMIN_USER، GG_ADMIN_PASS
const BASE = process.env.BASE || 'http://127.0.0.1:4999';
let pass = 0, fail = 0;
const ok = (c, n) => (c ? (pass++, console.log(`  ✓ ${n}`))
  : (fail++, console.error(`  ✗ ${n}`)));

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* بدنهٔ خالی */ }
  return { status: res.status, json };
}

(async () => {
  const mobile = `0999${String(Date.now()).slice(-7)}`;
  const password = 'TestOnly@1404x';

  // ── ادمین ────────────────────────────────────────────────────────────────
  const login = await call('/api/admin/auth/login', {
    method: 'POST',
    body: { username: process.env.GG_ADMIN_USER, password: process.env.GG_ADMIN_PASS },
  });
  ok(login.status === 200 && login.json?.token, 'ورودِ ادمین');
  const admin = login.json?.token;
  if (!admin) { console.log(`\n${pass} passed, ${fail} failed\n`); process.exit(1); }

  const before = await call('/api/admin/custom-mission', { token: admin });
  ok(before.status === 200 && Array.isArray(before.json?.missions),
    'پنل فهرستِ ماموریت‌ها را می‌خواند (شکلِ تازه)');
  // سقفِ ۱۰ خواستهٔ صریحِ مالک است (۲۹ شهریور): «تا ۱۰ تا ماموریت هم اگه
  // بخوام ادد کنم یا حذف کنم یا ویرایش کنم». عدد از سرور خوانده می‌شود نه
  // از UI، پس همین‌جا هم قراردادِ سرور سنجیده می‌شود.
  ok(before.json?.max === 10, `سقفِ تعداد از سرور می‌آید (${before.json?.max})`);
  const CAP = Number(before.json?.max) || 10;
  ok(typeof before.json?.updatedAt === 'string' && before.json.updatedAt.length > 10,
    'سرور مُهرِ زمانیِ فهرست را می‌دهد (گاردِ تبِ کهنه)');
  const original = before.json?.missions || [];

  // ── سه ماموریت: دو فعال، یکی خاموش ───────────────────────────────────────
  const save = await call('/api/admin/custom-mission', {
    method: 'PUT', token: admin,
    body: { items: [
      { enabled: true, title: 'کانال را دنبال کن', body: 'وارد کانال شو', points: 30,
        link: { url: 'https://t.me/example', text: '', color: 'green' } },
      { enabled: true, title: 'نظرت را بگو', points: 20 },
      { enabled: false, title: 'خاموش', points: 90 },
    ] },
  });
  ok(save.status === 200 && save.json?.missions?.length === 3, 'سه ماموریت ذخیره شد');
  ok(save.json?.preview?.title === 'کانال را دنبال کن'
    && save.json?.preview?.link?.text === 'اینجا کلیک کنید'
    && save.json?.preview?.link?.color === 'green',
    'پیش‌نمایش = اولین ماموریتِ فعال، با متنِ پیش‌فرضِ لینک و رنگِ پنل');
  const items = save.json.missions;
  const idA = items[0].id, idB = items[1].id, idOff = items[2].id;

  // ── کاربرِ تازه ──────────────────────────────────────────────────────────
  const reg = await call('/api/auth/register-password', {
    method: 'POST',
    body: { mobile, password, nickname: 'TstMM', firstName: 'تست', lastName: 'ماموریت' },
  });
  ok(reg.status === 200 || reg.status === 201, `ثبت‌نامِ کاربرِ تستی (${reg.status})`);
  // قراردادِ مهر ۱۴۰۵: ورود با رمز فقط برای مدیر است؛ کاربرِ عادی دیگر با
  // رمز وارد نمی‌شود. خودِ ثبت‌نام توکن می‌دهد (مثل مسیرِ OTP) پس همان کافی است.
  ok(reg.status === 200 && reg.json?.token, 'ورودِ کاربر');
  const user = reg.json?.token;

  // ── چیزی که کاربر می‌بیند ────────────────────────────────────────────────
  const m1 = await call('/api/missions', { token: user });
  ok(m1.status === 200, 'مسیرِ ماموریت‌ها جواب می‌دهد');
  ok(Array.isArray(m1.json?.customMissions) && m1.json.customMissions.length === 2,
    `کاربر دو ماموریتِ فعال را می‌بیند (${m1.json?.customMissions?.length})`);
  ok(m1.json?.custom?.title === 'کانال را دنبال کن',
    'کلیدِ قدیمیِ custom همچنان اولین ماموریتِ فعال را می‌دهد (سازگاری با اپِ نصب‌شده)');
  ok(!JSON.stringify(m1.json?.customMissions || []).includes('خاموش'),
    'ماموریتِ خاموش به کاربر نمی‌رود');
  const overview = await call('/api/growth/overview', { token: user });
  ok((overview.json?.customMissions || []).length === 2,
    'اندروید همان فهرست را از growth/overview می‌گیرد');

  // ── دریافتِ امتیازِ ماموریتِ دوم (نه اولی) ───────────────────────────────
  const claimB = await call(`/api/missions/custom/${idB}/claim`, { method: 'POST', token: user });
  ok(claimB.status === 200 && claimB.json?.ok === true && claimB.json?.reward === 20,
    `امتیازِ همان ماموریتی که خواستیم واریز شد (${claimB.json?.reward})`);
  const claimB2 = await call(`/api/missions/custom/${idB}/claim`, { method: 'POST', token: user });
  ok(claimB2.json?.ok === false, 'بارِ دوم برای همان ماموریت امتیاز نمی‌دهد');

  const m2 = await call('/api/missions', { token: user });
  const remain = m2.json?.customMissions || [];
  ok(remain.length === 1 && remain[0].id === idA,
    'فقط کارتِ گرفته‌شده پنهان شد؛ کارتِ دیگر سرِ جایش است');

  // ── مسیرِ قدیمی (کلاینتِ بدونِ شناسه) ────────────────────────────────────
  const legacy = await call('/api/missions/custom/claim', { method: 'POST', token: user });
  ok(legacy.json?.ok === true && legacy.json?.reward === 30,
    'کلاینتِ قدیمی (بدونِ شناسه) امتیازِ ماموریتِ باقی‌مانده را می‌گیرد');
  const m3 = await call('/api/missions', { token: user });
  ok((m3.json?.customMissions || []).length === 0 && m3.json?.custom === null,
    'بعد از گرفتنِ همه، دیگر هیچ کارتی به کاربر نشان داده نمی‌شود');

  // ── دفترِ امتیاز: هر دو ردیف ثبت شده؟ ───────────────────────────────────
  const ledger = await call('/api/points/history', { token: user });
  const rows = Array.isArray(ledger.json) ? ledger.json
    : (ledger.json?.transactions || ledger.json?.rows || []);
  const customRows = rows.filter(r => String(r.description || '').includes('ماموریت اختصاصی'));
  ok(customRows.length === 2, `هر دو دریافت در دفترِ امتیاز ثبت شده (${customRows.length})`);

  // ── ویرایشِ متن: شناسه نباید عوض شود ────────────────────────────────────
  const edited = items.map(m => ({ ...m }));
  edited[0].title = 'کانال را دنبال کن (اصلاحِ متن)';
  const save2 = await call('/api/admin/custom-mission', { method: 'PUT', token: admin, body: { items: edited } });
  ok(save2.json?.missions?.[0]?.id === idA,
    'ویرایشِ متن شناسه را عوض نمی‌کند (کاربرِ قبلی امتیازِ دوباره نمی‌گیرد)');
  const m4 = await call('/api/missions', { token: user });
  ok((m4.json?.customMissions || []).length === 0,
    'کاربری که قبلاً گرفته، بعد از ویرایش هم چیزی نمی‌بیند');

  // ── دورهٔ تازه: همه دوباره می‌بینند ──────────────────────────────────────
  const rotate = await call(`/api/admin/custom-mission/${idA}/reset`, { method: 'POST', token: admin });
  const newIdA = rotate.json?.missions?.find(m => m.title.startsWith('کانال را'))?.id;
  ok(rotate.status === 200 && newIdA && newIdA !== idA, 'دورهٔ تازه شناسه را نو کرد');
  const m5 = await call('/api/missions', { token: user });
  ok((m5.json?.customMissions || []).length === 1
    && m5.json.customMissions[0].title.startsWith('کانال را'),
    'بعد از دورهٔ تازه، همان کاربر دوباره کارت را می‌بیند');
  const claimAgain = await call(`/api/missions/custom/${newIdA}/claim`, { method: 'POST', token: user });
  ok(claimAgain.json?.ok === true && claimAgain.json?.reward === 30, 'و امتیازِ دورهٔ تازه را می‌گیرد');

  // ── سقف: دقیقاً ۱۰ تا قبول، ۱۱ تا رد ───────────────────────────────────
  const fill = n => Array.from({ length: n }, (_, i) => ({ enabled: true, title: `م${i}`, points: 1 }));
  const atCap = await call('/api/admin/custom-mission', {
    method: 'PUT', token: admin, body: { items: fill(CAP) },
  });
  ok(atCap.status === 200 && (atCap.json?.missions || []).length === CAP,
    `${CAP} ماموریت با هم ذخیره می‌شود (سقفِ کامل)`);

  const tooMany = await call('/api/admin/custom-mission', {
    method: 'PUT', token: admin, body: { items: fill(CAP + 1) },
  });
  ok(tooMany.status === 400, `بیش از سقف رد می‌شود (${tooMany.status})`);

  // ── گاردِ «فهرستِ کهنه»: ذخیرهٔ یک تبِ قدیمی نباید کارِ پنلِ دیگر را پاک کند
  const fresh = await call('/api/admin/custom-mission', { token: admin });
  const staleSave = await call('/api/admin/custom-mission', {
    method: 'PUT', token: admin,
    body: { items: [{ enabled: true, title: 'تبِ قدیمی', points: 1 }],
      ifUnchangedSince: '2020-01-01T00:00:00.000Z' },
  });
  ok(staleSave.status === 409, `ذخیره با مُهرِ قدیمی ۴۰۹ می‌گیرد (${staleSave.status})`);
  const stillTen = await call('/api/admin/custom-mission', { token: admin });
  ok((stillTen.json?.missions || []).length === CAP,
    'فهرستِ سرور دست‌نخورده ماند (کارِ پنلِ دیگر پاک نشد)');
  ok(stillTen.json?.updatedAt === fresh.json?.updatedAt, 'مُهرِ فهرست هم عوض نشد');

  // ── آمارِ پنل ───────────────────────────────────────────────────────────
  const after = await call('/api/admin/custom-mission', { token: admin });
  ok(after.status === 200 && after.json?.stats && typeof after.json.stats === 'object',
    'آمارِ دریافت برای پنل می‌آید');

  // ── بازگرداندنِ حالتِ اول (هیچ چیزی در پنلِ مالک عوض نماند) ──────────────
  const restore = await call('/api/admin/custom-mission', {
    method: 'PUT', token: admin,
    body: { items: original.map(m => ({
      enabled: m.enabled, title: m.title, body: m.body, points: m.points,
      link: { url: m.link?.url || '', text: m.link?.text || '', color: m.link?.color || 'blue' },
    })) },
  });
  ok(restore.status === 200, 'وضعیتِ پنل به حالتِ قبل برگشت');

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
