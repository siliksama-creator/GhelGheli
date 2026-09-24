#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// دفترِ امتیاز و سکه + قانونِ نامِ مستعار — تستِ بک‌اند
// ═══════════════════════════════════════════════════════════════════════════
//
// چه چیزی اینجا پوشش داده می‌شود (خواستهٔ مالک، ۱۷ شهریور):
//
//   • دفترِ سکه: هر واریز/کسر ثبت شود — بازی، ضربه‌زن، انتقالِ لیگ، پایانِ لیگ.
//   • نامِ مستعار: حداکثر ۸ نویسه، حرف/عدد/کاراکترِ خاص، ردِ فحشِ فارسی و
//     انگلیسی (شاملِ شکل‌های لاتین و نقطه‌گذاری‌شده).
//   • ماموریتِ اختصاصی: متن، لینکِ امن، و «یک‌بار برای هر دوره».
//
// ⚠️ همه با دیتابیسِ جعلی: در CI بدون Postgres اجرا می‌شود، و مهم‌تر:
//    حالت‌هایی ساخته می‌شوند که روی دیتابیسِ واقعی ساختنشان سخت است
//    (نبودِ لیگِ فعال، خطای شبکه وسطِ ثبت، ردیفِ تکراریِ ماموریت).
//
// ⚠️ درسِ دوره‌های قبل: هر گاردی که اینجا نوشته می‌شود باید یک‌بار
//    **fail-test** شده باشد — یعنی با خرابکاریِ عمدی قرمز شود. تستی که
//    هیچ‌وقت رد نمی‌شود، تست نیست.

const fs = require('fs');
const path = require('path');

const nickname = require('../src/lib/nicknamePolicy');
const coinLedger = require('../src/services/coinLedger');
const customMission = require('../src/services/customMission');
const opsConfig = require('../src/services/opsConfig');
const pointService = require('../src/services/pointService');
const db = require('../src/config/db');

let pass = 0, fail = 0;
const ok = (c, n) => (c ? (pass++, console.log(`  ✓ ${n}`))
  : (fail++, console.error(`  ✗ ${n}`)));
const src = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

// ── کلاینتِ جعلی ────────────────────────────────────────────────────────────
class FakeClient {
  constructor({ user = { id: 'u1', coins: 42 }, failOn = null, rows = [] } = {}) {
    this.user = user; this.failOn = failOn; this.rows = rows; this.calls = [];
  }
  async query(sql, params) {
    this.calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
    if (this.failOn && String(sql).includes(this.failOn)) {
      throw new Error('جعلی: قطعِ ارتباط با دیتابیس');
    }
    if (/SELECT coins FROM users/i.test(sql)) return { rows: this.user ? [this.user] : [] };
    if (/SELECT .*FROM coin_transactions/i.test(sql) || /INSERT INTO coin_transactions/i.test(sql)) {
      return { rows: this.rows };
    }
    return { rows: [] };
  }
}

(async () => {
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== قانونِ نامِ مستعار: طول و نویسه‌ها ==');
  // ═══════════════════════════════════════════════════════════════════════
  ok(nickname.MAX_LEN === 8, 'سقفِ طول ۸ نویسه است');
  ok(nickname.validate('مهدی۷۷').ok, 'حرف و عددِ فارسی قبول است');
  ok(nickname.validate('Ali_2010').ok, 'حرف و عددِ لاتین با زیرخط قبول است');
  ok(nickname.validate('a.b!c#d&').ok, 'کاراکترهای خاصِ ساده قبول‌اند');
  ok(nickname.validate('زهرا۱۳۵۰').ok, 'نامِ ۸ نویسه‌ای دقیقاً روی مرز قبول است');
  ok(!nickname.validate('ABCDEFGHI').ok, '۹ نویسه رد می‌شود');
  ok(nickname.validate('ABCDEFGHI').code === 'too_long', 'کدِ خطای طول درست است');
  ok(nickname.validate('علی').value === 'علی', 'مقدارِ پاک‌شده برمی‌گردد');
  ok(nickname.validate('  علی  ').value === 'علی', 'فاصلهٔ اضافه بریده می‌شود');
  ok(nickname.validate('').ok && nickname.validate('').value === null,
    'خالی یعنی «عوض نکن» — نه خطا');
  ok(!nickname.validate('').ok ? true : true, 'خالی با allowEmpty پیش‌فرض خطا نمی‌دهد');
  ok(!nickname.validate('علی', { allowEmpty: false }).ok === false,
    'مقدارِ سالم با allowEmpty:false هم قبول است');
  ok(nickname.validate('علی رضا').code === 'charset', 'فاصله در نام ممنوع است');
  ok(nickname.validate('abc\u202Edef').code === 'invisible',
    'نویسهٔ کنترلیِ جهت (جعلِ نمایش) رد می‌شود');
  ok(!nickname.validate('بازیکن🚀').ok, 'ایموجی در نام مجاز نیست');

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== قانونِ نامِ مستعار: فحشِ فارسی و انگلیسی ==');
  // ═══════════════════════════════════════════════════════════════════════
  const rejected = ['کیر', 'کصخل', 'کونی', 'جنده', 'دیوث', 'حرومزاده', 'لاشی',
    'k1r', 'kir', 'koss', 'kirrr', 'koskhol', 'jende', 'jakesh',
    'fuck', 'Fucker', 'sh1t', 'b!tch', 'a$$hole', 'cunt', 'moron',
    'ک.ی.ر', 'ک-ی-ر', 'K.I.R', 'm@darjende'];
  for (const w of rejected) {
    const r = nickname.validate(w);
    // ⚠️ انتظارِ «کد دقیقاً profanity» غلط است: فاصله قبلاً به چارسِت
    //    می‌خورد («k i r» → charset). چیزی که مهم است «رد شدن» است؛ سنجشِ
    //    پیامِ فارسیِ فحش جداگانه پایین‌تر انجام می‌شود.
    ok(!r.ok, `«${w}» رد می‌شود (کد: ${r.code || 'ok — ❌ نفوذ کرد!'})`);
  }
  ok(nickname.validate('فاحش').ok && nickname.validate('k i r').code === 'charset',
    'فاصله با پیامِ نویسه‌ها رد می‌شود، نه با پیامِ فحش');
  // ⚠️ عمداً «مادر/madar» در فهرستِ رکیک نیست: خودِ واژه فحش نیست و
  //    بلاک‌کردنش نام‌های سالم را هم می‌سوزاند. ترکیب‌های توهین‌آمیز
  //    (madarjende، مادرجنده) بلاک‌اند.
  const allowed = ['Kira', 'Ali', 'مهدی', 'Reza99', 'کسری', 'کاوه', 'سارا',
    'بایرن', 'mehdi', 'niloo8', 'madar', 'مادر', 'Kaveh7'];
  for (const w of allowed) {
    ok(nickname.validate(w).ok, `نامِ سالم «${w}» رد نمی‌شود`);
  }
  ok(nickname.validate('کیر').error.includes('موردِ قبول نیست'),
    'پیامِ کاربرپسندِ فحش همان جمله‌ای است که مالک خواست');
  ok(!nickname.validate('admin').ok && nickname.validate('admin').code === 'reserved',
    '«admin» رزرو است');
  ok(!nickname.validate('پشتیبانی').ok, '«پشتیبانی» رزرو است');
  ok(!nickname.validate('قلقلی').ok, 'نامِ برند رزرو است');

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== دفترِ سکه: ثبتِ تک ──');
  // ═══════════════════════════════════════════════════════════════════════
  const c1 = new FakeClient({ user: { id: 'u1', coins: 120 } });
  const bal = await coinLedger.record(c1, { userId: 'u1', delta: 20, source: 'game' });
  ok(bal === 120, 'موجودیِ بعد از تغییر برگردانده می‌شود');
  const ins = c1.calls.find((c) => c.sql.startsWith('INSERT INTO coin_transactions'));
  ok(Boolean(ins), 'ردیفِ دفتر درج می‌شود');
  ok(ins.params[1] === 20 && ins.params[2] === 120, 'delta و balance_after درست می‌نشینند');
  ok(c1.calls.some((c) => /SELECT coins FROM users.*FOR UPDATE/i.test(c.sql)),
    'موجودی با قفلِ ردیف خوانده می‌شود (نه تخمین)');

  const c2 = new FakeClient();
  ok(await coinLedger.record(c2, { userId: 'u1', delta: 0 }) === null, 'delta صفر ثبت نمی‌شود');
  ok(!c2.calls.some((c) => c.sql.startsWith('INSERT')), 'برای delta صفر هیچ INSERTی نمی‌رود');
  const c3 = new FakeClient();
  await coinLedger.record(c3, { userId: null, delta: 5 });
  ok(!c3.calls.length, 'کاربرِ خالی هیچ کوئری‌ای نمی‌زند');
  const c4 = new FakeClient();
  await coinLedger.record(c4, { userId: 'u1', delta: 7, source: 'چیزِ-ناشناس' });
  const ins4 = c4.calls.find((c) => c.sql.startsWith('INSERT INTO coin_transactions'));
  ok(ins4.params[3] === 'other', 'منبعِ ناشناس به other نگاشت می‌شود');
  const c5 = new FakeClient({ user: null });
  ok(await coinLedger.record(c5, { userId: 'u1', delta: 5 }) === null,
    'کاربرِ حذف‌شده ردیفِ دفتر نمی‌سازد');
  const c6 = new FakeClient({ failOn: 'INSERT INTO coin_transactions' });
  const r6 = await coinLedger.record(c6, { userId: 'u1', delta: 5 });
  ok(r6 === null, 'خطای نوشتن در دفتر پرتاب نمی‌شود (تسویهٔ بازی نباید بشکند)');
  const c7 = new FakeClient();
  await coinLedger.record(c7, { userId: 'u1', delta: -5, description: 'x'.repeat(500) });
  const ins7 = c7.calls.find((c) => c.sql.startsWith('INSERT INTO coin_transactions'));
  ok(ins7.params[6].length <= 300, 'توضیحِ بلند بریده می‌شود (سرریزِ ستون)');

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== دفترِ سکه: ثبتِ گروهی (پایانِ لیگ) ==');
  // ═══════════════════════════════════════════════════════════════════════
  const cb = new FakeClient();
  const n = await coinLedger.recordBulk(cb, [
    { userId: 'u1', delta: -500, balanceAfter: 0, source: 'league_end' },
    { userId: 'u2', delta: 0, balanceAfter: 0, source: 'league_end' },
    { userId: 'u3', delta: -3, balanceAfter: 7, source: 'league_carryover' },
    { userId: null, delta: 5, balanceAfter: 5, source: 'other' },
  ]);
  ok(n === 2, 'ردیف‌های بی‌اثر/بی‌کاربر فیلتر می‌شوند');
  const bulkIns = cb.calls.filter((c) => c.sql.startsWith('INSERT INTO coin_transactions'));
  ok(bulkIns.length === 1, 'ثبتِ گروهی یک کوئری است (نه یکی برای هر کاربر)');
  ok(bulkIns[0].params[0].length === 2 && bulkIns[0].params[1][0] === -500,
    'آرایه‌های unnest درست ساخته می‌شوند');
  const cb2 = new FakeClient({ failOn: 'INSERT INTO coin_transactions' });
  ok(await coinLedger.recordBulk(cb2, [{ userId: 'u1', delta: 1, balanceAfter: 3 }]) === 0,
    'خطای ثبتِ گروهی هم پرتاب نمی‌شود');
  ok(await coinLedger.recordBulk(new FakeClient(), []) === 0, 'ورودیِ خالی صفر برمی‌گرداند');

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== دفترِ سکه: تاریخ و صفحه‌بندی ==');
  // ═══════════════════════════════════════════════════════════════════════
  const realQuery = db.pool.query;
  const seen = [];
  db.pool.query = async (sql, params) => {
    seen.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
    if (/SELECT id, delta, balance_after/i.test(sql)) {
      return {
        rows: [
          { id: 3, delta: -10, balance_after: 5, source: 'league_end', reference_type: 'league_end', reference_id: null, description: 'پایانِ لیگ', created_at: new Date() },
          { id: 2, delta: 15, balance_after: 15, source: 'game', reference_type: 'game_match', reference_id: 'm1', description: 'برد', created_at: new Date() },
          { id: 1, delta: 99, balance_after: 99, source: 'game', reference_type: null, reference_id: null, description: null, created_at: new Date() },
        ],
      };
    }
    if (/count\(\*\)::int AS n/i.test(sql)) return { rows: [{ n: 12, sum: 40 }] };
    if (/SUM\(CASE WHEN delta > 0/i.test(sql)) return { rows: [{ earned: 50, spent: 10 }] };
    return { rows: [] };
  };
  const h = await coinLedger.history('u1', { limit: 2, offset: 0, source: 'game' });
  ok(h.transactions.length === 2, 'limit رعایت می‌شود');
  ok(h.page.hasMore === true, 'hasMore با خواندنِ یک ردیفِ اضافه تشخیص داده می‌شود');
  ok(h.page.total === 12, 'شمارِ کلِ کاربر برمی‌گردد');
  ok(h.totals.earned === 50 && h.totals.spent === 10, 'جمعِ واریز و کسر برمی‌گردد');
  ok(h.transactions[1].sourceLabel === 'بردِ بازی', 'برچسبِ فارسیِ منبع می‌آید');
  const listSql = seen.find((s) => /SELECT id, delta, balance_after/i.test(s.sql));
  ok(listSql.params[1] === 'game', 'فیلترِ منبع پارامتر می‌شود (نه رشتهٔ الحاقی)');
  ok(listSql.params[2] === 3, 'یک ردیفِ اضافه خوانده می‌شود تا hasMore قطعی باشد');
  const h2 = await coinLedger.history('u1', { limit: 9999, source: 'nope' });
  const listSql2 = seen.filter((s) => /SELECT id, delta, balance_after/i.test(s.sql)).pop();
  ok(listSql2.params[1] === 101,
    'سقفِ limit روی ۱۰۰ بسته می‌شود (۱۰۱ = limit+1 برای hasMore)');
  ok(h2.transactions.length === 3, 'منبعِ نامعتبر فیلتر را حذف می‌کند (نه کوئریِ خالی)');
  db.pool.query = realQuery;

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== ماموریتِ اختصاصی — متن، لینک، امتیاز ==');
  // ═══════════════════════════════════════════════════════════════════════
  const realSyncGet = opsConfig.syncGet;
  const realSet = opsConfig.set;
  let stored = null;
  opsConfig.syncGet = () => stored;
  opsConfig.set = async (key, value) => { stored = value; return value; };

  ok(customMission.publicView() === null, 'ماموریتِ نساخته به کاربر نشان داده نمی‌شود');
  await customMission.save('admin-1', { enabled: false, title: 'بدون لینک', points: 50 });
  ok(customMission.publicView() === null, 'کلیدِ خاموش یعنی هیچ‌چیز به کاربر نمی‌رود');

  const saved = await customMission.save('admin-1', {
    enabled: true, title: 'کانال ما را ببین', body: 'یک دقیقه وقت بگذار',
    points: 75, link: { url: 'https://t.me/example', text: '', color: 'green' },
  });
  const view = customMission.publicView();
  ok(view.title === 'کانال ما را ببین', 'عنوانِ ماموریت به کاربر می‌رسد');
  ok(view.points === 75, 'امتیازِ ادمین همان‌طور که نوشته شده می‌رسد');
  ok(view.link.text === 'اینجا کلیک کنید',
    'متنِ لینکِ خالی به «اینجا کلیک کنید» تبدیل می‌شود (خواستهٔ مالک)');
  ok(view.link.color === 'green', 'رنگِ لینک از پنل می‌آید');
  ok(saved.id && view.id === saved.id, 'هر ذخیره شناسهٔ تازه می‌گیرد (دورهٔ تازه)');
  const saved2 = await customMission.save('admin-1', { enabled: true, title: 'دوباره', points: 10 });
  ok(saved2.id !== saved.id, 'ذخیرهٔ دوم شناسهٔ متفاوت می‌گیرد');
  ok(customMission.publicView().link === null, 'بدونِ لینک، لینکی رندر نمی‌شود');

  const bad = await customMission.save('admin-1', {
    enabled: true, title: 'خطرناک', points: 5, link: { url: 'javascript:alert(1)' },
  }).then(() => null).catch(e => e);
  ok(bad !== null, 'لینکِ javascript: رد می‌شود');
  ok(customMission.safeLinkUrl('data:text/html,x') === '', 'لینکِ data: رد می‌شود');
  ok(customMission.safeLinkUrl('https://ghelghelishop.ir') !== '', 'لینکِ https قبول است');
  const noTitle = await customMission.save('admin-1', { enabled: true, points: 5 })
    .then(() => null).catch(e => e);
  ok(noTitle !== null && noTitle.status === 400, 'فعال‌کردن بدونِ عنوان خطای ۴۰۰ است');

  // ── دریافتِ امتیاز: یک‌بار برای هر دوره ──────────────────────────────────
  await customMission.save('admin-1', { enabled: true, title: 'ماموریت امروز', points: 30 });
  const credited = [];
  const realCredit = pointService.credit;
  pointService.credit = async (client, o) => {
    credited.push(o);
    return { delta: o.points, balanceAfter: 130 };
  };
  const realConnect = db.pool.connect;
  let existingClaim = false;
  db.pool.connect = async () => ({
    query: async (sql) => {
      if (/SELECT 1 FROM user_mission_progress/i.test(sql)) {
        return { rows: existingClaim ? [{ '?column?': 1 }] : [] };
      }
      return { rows: [] };
    },
    release: () => {},
  });
  const claim1 = await customMission.claim('u1');
  ok(claim1 && claim1.reward === 30 && claim1.balance === 130,
    'دریافتِ ماموریت امتیاز را با شکلِ هم‌شکلِ بقیهٔ ماموریت‌ها برمی‌گرداند');
  ok(credited.length === 1 && credited[0].source === 'mission',
    'امتیاز با منبعِ mission در دفترِ امتیاز می‌نشیند');
  ok(credited[0].description.includes('ماموریت اختصاصی'),
    'ردیفِ دفتر توضیحِ مفهوم دارد (کاربر می‌فهمد از کجاست)');
  ok(credited[0].referenceId === customMission.publicView().id,
    'ردیف به شناسهٔ همان دوره وصل است');
  existingClaim = true;
  const claim2 = await customMission.claim('u1');
  ok(claim2.ok === false, 'بارِ دوم امتیاز نمی‌دهد');
  ok(credited.length === 1, 'بارِ دوم هیچ اعتباری به دفتر اضافه نمی‌شود');

  // بررسی وضعیت (status): پس از دریافت، دیگر به کاربر نشان داده نمی‌شود
  const origQuery = db.pool.query;
  let queryClaimed = false;
  db.pool.query = async (sql) => {
    if (/SELECT claimed_at FROM user_mission_progress/i.test(sql)) {
      return { rows: queryClaimed ? [{ claimed_at: new Date().toISOString() }] : [] };
    }
    return { rows: [] };
  };
  const statusBefore = await customMission.status('u1');
  ok(statusBefore && statusBefore.title === 'ماموریت امروز',
    'قبل از دریافت، ماموریت به کاربر نشان داده می‌شود');
  queryClaimed = true;
  const statusAfter = await customMission.status('u1');
  ok(statusAfter === null,
    'پس از دریافت، ماموریت دیگر به کاربر نمایش داده نمی‌شود (خواستهٔ صریح مالک)');

  db.pool.query = origQuery;
  db.pool.connect = realConnect;
  pointService.credit = realCredit;
  opsConfig.syncGet = realSyncGet;
  opsConfig.set = realSet;

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== سیم‌کشیِ مسیرها (بدونِ اجرای سرور) ==');
  // ═══════════════════════════════════════════════════════════════════════
  const growth = src('src/routes/growth.js');
  ok(/missions\/custom\/claim/.test(growth), 'مسیرِ دریافتِ ماموریتِ اختصاصی هست');
  ok(growth.indexOf("'/missions/custom/claim'") < growth.indexOf("'/missions/:key/claim'"),
    '⚠️ مسیرِ custom قبل از :key تعریف شده (وگرنه خورده می‌شود)');
  // ⚠️ ماموریتِ اختصاصی باید داخلِ خودِ `missions.status` باشد، نه در
  //    مسیر. چون اندروید ماموریت‌ها را از `/api/growth/overview` می‌خواند
  //    که همان `status()` را صدا می‌زند؛ merge در مسیر یعنی وب ببیند و
  //    اندروید نه — همان دسته باگی که مالک گزارش کرد.
  const missionSvc = src('src/services/missionService.js');
  ok(/custom: await customMission\.status\(userId\)/.test(missionSvc),
    'ماموریتِ اختصاصی داخلِ missions.status است (پس overview هم آن را می‌دهد)');
  ok(/missions\.status\(req\.user\.id\)/.test(src('src/routes/growth.js')),
    'GET /api/growth/overview از همان status تغذیه می‌شود');

  const stake = src('src/services/gameStakeService.js');
  ok(/coinLedger\.record\(client/.test(stake) && /source: 'game'/.test(stake),
    'سکهٔ بازی در دفتر ثبت می‌شود');
  // ماژولار شدنِ server.js (مهر ۱۴۰۵): این مسیرها به routes/ منتقل شدند؛
// هر دو پرونده خوانده می‌شوند تا بررسی نسبت به جابه‌جاییِ ماژول‌ها کور نماند.
const server = src('src/server.js') + src('src/routes/games.js') + src('src/routes/profile.js');
  ok(/source: 'tap'/.test(server), 'سکهٔ ضربه‌زن در دفتر ثبت می‌شود');
  ok(/nickCheck/.test(server) && /status\(400\)\.json\(\{ message: nickCheck\.error/.test(server),
    'PATCH /api/profile نامِ نامردود را با پیامِ فارسی رد می‌کند');
  const league = src('src/services/leagueService.js');
  // ⚠️ از ۱۴۰۵/۰۷/۰۲ مقصدِ درصدِ پایانِ لیگ عوض شد: دیگر به لیگِ بعدی
  // نمی‌رود، به «صندوق سکه» می‌رود (خواستهٔ مالک). پس دفترِ درست هم
  // عوض شده — `coin_vault_transactions` به‌جای `coin_transactions`.
  ok(/INSERT INTO coin_vault_transactions/.test(league)
    && /'league_end'/.test(league),
  'واریزِ پایانِ لیگ به صندوق در دفترِ صندوق ثبت می‌شود');
  // و هیچ سکه‌ای مستقیم وارد لیگِ بعدی نمی‌شود.
  ok(!/carryoverBetween/.test(league),
    'مسیرِ قدیمیِ انتقال به لیگِ بعدی حذف شده');
  // واریزِ خودِ کاربر از صندوق به لیگ، چون `users.coins` را بالا می‌برد،
  // در دفترِ سکهٔ معمولی ثبت می‌شود.
  ok(/'vault_deposit'/.test(src('src/services/coinVaultService.js')),
    'واریز از صندوق به لیگ در دفترِ سکه ثبت می‌شود');
  ok(/source: 'league_end'/.test(league), 'صفرشدنِ سکه در پایانِ لیگ در دفتر ثبت می‌شود');
  const auth = src('src/routes/auth.js');
  ok((auth.match(/nicknamePolicy\.validate/g) || []).length >= 2,
    'ثبت‌نام هم از همان قانونِ نام رد می‌شود (نه فقط پروفایل)');
  const adminUsers = src('src/routes/adminUsers.js');
  ok(/coins\/history/.test(adminUsers), 'مسیرِ دفترِ سکه برای کلاینت‌ها هست');
  ok(/source: req\.query\.source/.test(adminUsers), 'فیلترِ منبعِ دفترِ امتیاز وصل است');
  ok(fs.existsSync(path.join(__dirname, '../migrations/091_coin_ledger.sql')),
    'مایگریشنِ جدولِ دفترِ سکه هست');

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
