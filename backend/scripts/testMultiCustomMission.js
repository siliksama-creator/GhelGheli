#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ماموریت‌های اختصاصیِ چندتایی — تستِ بک‌اند
// ═══════════════════════════════════════════════════════════════════════════
//
// خواستهٔ مالک (۲۹ شهریور): «باید یه کاری کنی که اگه ادمین خواست چند تا
// ماموریتِ اختصاصی بتونه قرار بده.»
//
// این فایل همان تغییر را می‌سنجد، و مهم‌تر از آن **چیزهایی را که نباید
// بشکنند**:
//
//   • کاربرِ اپِ نصب‌شده (کلاینتِ قدیمی) که فقط `custom` را می‌شناسد؛
//   • دریافتِ «یک‌بار برای هر ماموریت» (نه یک‌بار برای همه)؛
//   • حفظِ شناسه هنگام ویرایشِ متن، تا اصلاحِ غلطِ تایپی به همه امتیازِ
//     تازه ندهد؛
//   • «دورهٔ تازه» که همان کار را عمداً و صریح انجام می‌دهد؛
//   • سقفِ تعداد، اعتبارسنجی، و آمارِ دریافتِ هر ماموریت برای پنل.
//
// ⚠️ همه با دیتابیسِ جعلی و کشِ جعلی: در CI بدونِ Postgres اجرا می‌شود.
//
// ⚠️ درسِ دوره‌های قبل: هر گاردی که اینجا نوشته می‌شود باید یک‌بار
//    **fail-test** شده باشد — یعنی با خرابکاریِ عمدی قرمز شود.

const fs = require('fs');
const path = require('path');

const customMission = require('../src/services/customMission');
const opsConfig = require('../src/services/opsConfig');
const pointService = require('../src/services/pointService');
const db = require('../src/config/db');

let pass = 0, fail = 0;
const ok = (c, n) => (c ? (pass++, console.log(`  ✓ ${n}`))
  : (fail++, console.error(`  ✗ ${n}`)));
const src = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const uuid = () => require('crypto').randomUUID();

(async () => {
  // ── کشِ جعلیِ تنظیمات (همان کاری که تستِ دفترِ امتیاز می‌کند) ───────────
  const realSyncGet = opsConfig.syncGet;
  const realSet = opsConfig.set;
  let stored = null;
  opsConfig.syncGet = () => stored;
  opsConfig.set = async (key, value) => { stored = value; return value; };

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== سازگاری: دادهٔ قدیمیِ تک‌ماموریتی ==');
  // ═══════════════════════════════════════════════════════════════════════
  // سروری که با کدِ تازه بالا می‌آید، روی `app_settings` همان شیءِ یگانهٔ
  // قدیمی را می‌بیند. اگر این را نفهمد، محصول بعد از دیپلوی بی‌صدا خالی
  // می‌شود — کارتی که ادمین ساخته بود، ناپدید.
  const legacyId = uuid();
  stored = {
    id: legacyId, enabled: true, title: 'کانال ما را ببین', body: 'یک دقیقه',
    points: 75, link: { url: 'https://t.me/example', text: '', color: 'green' },
    updatedAt: '2026-01-01T00:00:00.000Z', updatedBy: 'admin-old',
  };
  ok(customMission.list().length === 1, 'دادهٔ قدیمی مثلِ فهرستِ تک‌عضوی خوانده می‌شود');
  ok(customMission.publicView()?.id === legacyId, 'شناسهٔ همان ماموریت حفظ می‌شود');
  ok(customMission.publicView()?.link.text === 'اینجا کلیک کنید',
    'پیش‌فرضِ متنِ لینک هنوز «اینجا کلیک کنید» است');

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== چند ماموریت: ترتیب، فعال/خاموش، عنوانِ خالی ==');
  // ═══════════════════════════════════════════════════════════════════════
  await customMission.saveMany('admin-1', {
    items: [
      { enabled: true, title: 'اول', points: 10 },
      { enabled: true, title: 'دوم', points: 20, link: { url: 'https://t.me/b', text: 'برو', color: 'green' } },
      { enabled: false, title: 'خاموش', points: 30 },
      // عنوانِ خالی و خاموش ⇒ نه ذخیره‌اش رد می‌شود نه به کاربر می‌رود
      { enabled: false, title: '', points: 0 },
    ],
  });
  const all = customMission.list();
  ok(all.length === 4, 'هر چهار ماموریت ذخیره شدند (خاموش‌ها هم)');
  ok(all[0].title === 'اول' && all[1].title === 'دوم', 'ترتیبِ ادمین حفظ می‌شود');
  ok(customMission.activeItems().length === 2,
    'فقط روشن‌های دارای عنوان به کاربر می‌رسند');
  ok(customMission.publicView().title === 'اول',
    'پیش‌نمایش = اولین ماموریتِ فعال (نه اولین ردیفِ فهرست)');
  ok(customMission.current().title === 'اول' && customMission.current().enabled === true,
    'شکلِ قدیمیِ `current` روی اولین ماموریتِ فعال کار می‌کند');

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== شناسه‌ها: ویرایش = همان دوره، افزودن = دورهٔ تازه ==');
  // ═══════════════════════════════════════════════════════════════════════
  const beforeIds = customMission.list().map(m => m.id);
  ok(beforeIds.every(customMission.missionKey), 'هر ماموریت شناسهٔ خودش را دارد');
  ok(new Set(beforeIds).size === beforeIds.length, 'شناسه‌ها یکتا هستند');

  // ویرایشِ متنِ ماموریتِ اول (با همان شناسه) + ردیفِ تازه بدونِ شناسه
  const edited = customMission.list().map(m => ({ ...m }));
  edited[0].title = 'اول (اصلاحِ غلطِ تایپی)';
  await customMission.saveMany('admin-1', { items: [...edited, { enabled: true, title: 'سوم', points: 5 }] });
  const afterIds = customMission.list().map(m => m.id);
  ok(afterIds[0] === beforeIds[0],
    'ویرایشِ متن شناسه را عوض نمی‌کند (کاربرِ قبلی امتیازِ دوباره نمی‌گیرد)');
  ok(afterIds.slice(0, 4).every((id, i) => id === beforeIds[i]), 'شناسهٔ بقیه هم دست‌نخورده می‌ماند');
  ok(afterIds.length === 5 && !beforeIds.includes(afterIds[4]),
    'ماموریتِ تازه شناسهٔ تازه می‌گیرد (همه می‌توانند امتیازش را بگیرند)');

  // شناسهٔ تکراری/خراب ⇒ شناسهٔ تازه، نه ردیفِ دوتاییِ یکسان
  await customMission.saveMany('admin-1', {
    items: [
      { id: afterIds[0], enabled: true, title: 'الف', points: 1 },
      { id: afterIds[0], enabled: true, title: 'ب', points: 1 },
      { id: 'not-a-uuid', enabled: true, title: 'ج', points: 1 },
    ],
  });
  const dedup = customMission.list().map(m => m.id);
  ok(new Set(dedup).size === 3, 'شناسهٔ تکراری/نامعتبر با شناسهٔ تازه جای‌گزین می‌شود');

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== سقف و اعتبارسنجی ==');
  // ═══════════════════════════════════════════════════════════════════════
  const tooMany = await customMission.saveMany('admin-1', {
    items: Array.from({ length: customMission.MAX_ITEMS + 1 }, (_, i) => ({ enabled: true, title: `م${i}`, points: 1 })),
  }).then(() => null).catch(e => e);
  ok(tooMany && tooMany.status === 400 && /حداکثر/.test(tooMany.message),
    `بیش از ${customMission.MAX_ITEMS} ماموریت رد می‌شود`);

  const noTitle = await customMission.saveMany('admin-1', { items: [{ enabled: true, points: 5 }] })
    .then(() => null).catch(e => e);
  ok(noTitle && noTitle.status === 400, 'فعال‌کردنِ بدونِ عنوان خطای ۴۰۰ است');

  const badLink = await customMission.saveMany('admin-1', {
    items: [{ enabled: true, title: 'خطرناک', points: 5, link: { url: 'javascript:alert(1)' } }],
  }).then(() => null).catch(e => e);
  ok(badLink && badLink.status === 400, 'لینکِ javascript: رد می‌شود');

  ok(customMission.safeLinkUrl('data:text/html,x') === '', 'لینکِ data: رد می‌شود');
  ok(customMission.safeLinkUrl('https://ghelghelishop.ir') !== '', 'لینکِ https قبول است');

  const afterBad = customMission.list();
  ok(afterBad.length === 3 && afterBad.every(m => /^[0-9a-f-]{36}$/i.test(m.id)),
    'ذخیرهٔ نامعتبر چیزی را نصفه‌ونیمه عوض نکرد (فهرستِ قبلی سرِ جایش است)');

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== سقفِ ۱۰ و گاردِ «فهرستِ کهنه» (خواستهٔ مالک، ۲۹ شهریور) ==');
  // ═══════════════════════════════════════════════════════════════════════
  // مالک: «باید تا ۱۰ تا ماموریت هم اگه بخوام ادد کنم یا حذف کنم یا ویرایش
  // کنم و یا همون ماموریت رو دوباره به کاربرا بفرستم» + «حتی روی ۲ ماموریت
  // قرار نمی‌گیره و لیست دوباره برمی‌گرده روی یکی».
  ok(customMission.MAX_ITEMS === 10, 'سقفِ ماموریت‌های اختصاصی ۱۰ است');
  ok(/MAX_ITEMS = 10\b/.test(src('src/services/customMission.js')),
    'سقف یک‌جا تعریف شده (پنل آن را از پاسخِ API می‌خواند)');

  const ten = Array.from({ length: 10 }, (_, i) => ({ enabled: true, title: `م${i + 1}`, points: 1 }));
  const savedTen = await customMission.saveMany('admin-10', { items: ten });
  ok(savedTen.length === 10 && customMission.activeItems().length === 10,
    'ده ماموریت با هم ذخیره و فعال می‌شوند');

  // ── گاردِ فهرستِ کهنه ─────────────────────────────────────────────────
  const stampedId = uuid();
  const STAMP = '2026-09-20T09:00:00.000Z';
  stored = {
    items: [{ id: stampedId, enabled: true, title: 'روبیکا', points: 500 }],
    updatedAt: STAMP,
    updatedBy: 'admin-old',
  };
  const staleErr = await customMission.saveMany('admin-new', {
    items: [{ id: stampedId, enabled: true, title: 'روبیکا', points: 500 },
      { enabled: true, title: 'اینستاگرام', points: 500 }],
    ifUnchangedSince: '2026-09-19T00:00:00.000Z',   // تبِ قدیمی
  }).then(() => null).catch(e => e);
  ok(staleErr && staleErr.status === 409,
    'ذخیرهٔ تبِ قدیمی ۴۰۹ می‌گیرد (کارِ پنلِ دیگر پاک نمی‌شود)');
  ok(customMission.list().length === 1,
    'با ۴۰۹ هیچ‌چیز نوشته نمی‌شود — فهرست همان یکی می‌ماند');

  const okSave = await customMission.saveMany('admin-new', {
    items: [{ id: stampedId, enabled: true, title: 'روبیکا', points: 500 },
      { enabled: true, title: 'اینستاگرام', points: 500 }],
    ifUnchangedSince: STAMP,                        // همان مُهری که خوانده بود
  });
  ok(okSave.length === 2 && customMission.activeItems().length === 2,
    'با مُهرِ درست، هر دو ماموریت ذخیره می‌شوند (روبیکا + اینستاگرام)');

  const legacySave = await customMission.saveMany('admin-legacy', {
    items: [{ enabled: true, title: 'کلاینتِ قدیمی', points: 1 }],
  }).then(r => r).catch(e => e);
  ok(Array.isArray(legacySave) && legacySave.length === 1,
    'پنلِ قدیمی که مُهر نمی‌فرستد هم بی‌مشکل ذخیره می‌کند (سازگاری)');

  // ── شناسهٔ فهرست به پنل می‌رود و برمی‌گردد ────────────────────────────
  ok(typeof customMission.listStamp() === 'string' && customMission.listStamp().length > 10,
    'سرور مُهرِ زمانیِ فهرست را می‌دهد');
  ok(/updatedAt: customMission\.listStamp\(\)/.test(src('src/routes/adminCustomMission.js')),
    'مسیرِ ادمین مُهر را در پاسخ می‌فرستد');

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== وضعیتِ کاربر: هر ماموریت جداگانه یک‌بار ==');
  // ═══════════════════════════════════════════════════════════════════════
  const idA = uuid(), idB = uuid();
  await customMission.saveMany('admin-1', {
    items: [
      { id: idA, enabled: true, title: 'الف', points: 10 },
      { id: idB, enabled: true, title: 'ب', points: 20 },
    ],
  });

  const realQuery = db.pool.query;
  let claimedKeys = [];
  const seenSql = [];
  db.pool.query = async (sql, params) => {
    seenSql.push({ sql, params });
    if (/SELECT mission_key FROM user_mission_progress/i.test(sql)) {
      return { rows: claimedKeys.map(k => ({ mission_key: k })) };
    }
    if (/SELECT claimed_at FROM user_mission_progress/i.test(sql)) {
      return { rows: claimedKeys.includes(params?.[1]) ? [{ claimed_at: 'now' }] : [] };
    }
    return { rows: [] };
  };

  const st1 = await customMission.statuses('u1');
  ok(st1.length === 2 && st1[0].title === 'الف' && st1[1].title === 'ب',
    'قبل از دریافت، هر دو ماموریت به کاربر نشان داده می‌شوند');
  ok(st1.every(m => m.claimed === false && m.claimable === true), 'وضعیتِ هر کارت واضح است');

  claimedKeys = [customMission.missionKey(idA)];
  const st2 = await customMission.statuses('u1');
  ok(st2.length === 1 && st2[0].id === idB,
    'ماموریتِ گرفته‌شده از فهرستِ همان کاربر حذف می‌شود — و فقط همان یکی');
  ok((await customMission.status('u1')) === null,
    'شکلِ قدیمیِ `status` هم پس از دریافت، هیچ کارتی برنمی‌گرداند');

  const queryCount = seenSql.length;
  ok(queryCount <= 4, `افزودنِ ماموریت کوئریِ اضافه به هر بازدید اضافه نمی‌کند (${queryCount} کوئری)`);

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== دریافتِ امتیاز: ماموریتِ مشخص، یک‌بار ==');
  // ═══════════════════════════════════════════════════════════════════════
  const credited = [];
  const realCredit = pointService.credit;
  pointService.credit = async (client, o) => { credited.push(o); return { delta: o.points, balanceAfter: 220 }; };

  const realConnect = db.pool.connect;
  let already = false;
  db.pool.connect = async () => ({
    query: async (sql) => {
      if (/SELECT 1 FROM user_mission_progress/i.test(sql)) {
        return { rows: already ? [{ '?column?': 1 }] : [] };
      }
      return { rows: [] };
    },
    release: () => {},
  });

  const c1 = await customMission.claim('u1', idB);
  ok(c1.ok === true && c1.reward === 20 && c1.balance === 220,
    'امتیازِ همان ماموریتی که کلاینت خواست واریز می‌شود (نه اولیِ فهرست)');
  ok(credited[0].referenceId === idB, 'ردیفِ دفتر به شناسهٔ همان ماموریت وصل است');
  ok(credited[0].description.includes('ماموریت اختصاصی') && credited[0].source === 'mission',
    'توضیح و منبعِ دفتر مثلِ قبل است');

  already = true;
  const c2 = await customMission.claim('u1', idB);
  ok(c2.ok === false && /قبلاً/.test(c2.message), 'بارِ دوم امتیاز نمی‌دهد');
  ok(credited.length === 1, 'بارِ دوم هیچ اعتباری به دفتر اضافه نمی‌شود');

  already = false;
  const c3 = await customMission.claim('u1'); // کلاینتِ قدیمی: بدونِ شناسه
  ok(c3.ok === true && c3.reward === 10,
    'کلاینتِ قدیمی (بدونِ شناسه) امتیازِ اولین ماموریتِ فعال را می‌گیرد');

  const missing = await customMission.claim('u1', uuid()).then(() => null).catch(e => e);
  ok(missing && missing.status === 404, 'شناسهٔ ناشناخته ۴۰۴ می‌دهد');

  db.pool.connect = realConnect;
  pointService.credit = realCredit;

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== دورهٔ تازه ==');
  // ═══════════════════════════════════════════════════════════════════════
  const listBefore = customMission.list();
  const rotated = await customMission.resetPeriod('admin-1', idA);
  ok(rotated[0].id !== idA, 'شناسهٔ ماموریتِ انتخابی عوض می‌شود');
  ok(rotated[0].title === listBefore[0].title && rotated[0].points === listBefore[0].points,
    'متن و امتیاز دست‌نخورده می‌ماند (ادمین از نو نمی‌نویسد)');
  ok(rotated[1].id === idB, 'بقیهٔ ماموریت‌ها دست‌نخورده می‌مانند');
  ok(!customMission.missionKey(rotated[0].id).includes(idA),
    'کلیدِ دفترِ دورهٔ تازه با دورهٔ قبل یکی نیست (همه دوباره می‌توانند بگیرند)');

  const notFound = await customMission.resetPeriod('admin-1', uuid()).then(() => null).catch(e => e);
  ok(notFound && notFound.status === 404, 'دورهٔ تازه برای شناسهٔ ناشناخته ۴۰۴ است');

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== آمارِ دریافت برای پنل ==');
  // ═══════════════════════════════════════════════════════════════════════
  const statsId = customMission.list()[0].id;
  db.pool.query = async (sql) => {
    if (/FROM user_mission_progress/i.test(sql)) {
      return {
        rows: [
          { mission_key: `custom:${statsId}`, claims: 12, last_claim: '2026-09-20T10:00:00.000Z' },
          { mission_key: 'daily:invite', claims: 99, last_claim: '2026-09-20T09:00:00.000Z' },
        ],
      };
    }
    return { rows: [] };
  };
  const s = await customMission.stats();
  ok(s[statsId]?.claims === 12, 'شمارِ دریافت‌کنندگانِ هر ماموریت برمی‌گردد');
  ok(!Object.keys(s).some(k => k.startsWith('daily')), 'ردیف‌های ماموریت‌های روزانه در آمار نمی‌آیند');
  db.pool.query = async () => { throw new Error('db down'); };
  const s2 = await customMission.stats();
  ok(s2 && Object.keys(s2).length === 0, 'قطعِ دیتابیس آمار را خالی می‌کند، نه اینکه پنل را ۵۰۰ کند');
  db.pool.query = realQuery;

  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n== سیم‌کشیِ مسیرها و کلاینت‌ها (بدونِ اجرای سرور) ==');
  // ═══════════════════════════════════════════════════════════════════════
  const growth = src('src/routes/growth.js');
  ok(/missions\/custom\/:id\/claim/.test(growth), 'مسیرِ دریافتِ ماموریتِ مشخص هست');
  ok(growth.indexOf("'/missions/custom/claim'") < growth.indexOf("'/missions/:key/claim'"),
    '⚠️ مسیرِ custom قبل از :key تعریف شده (وگرنه خورده می‌شود)');

  const missionSvc = src('src/services/missionService.js');
  ok(/customMissions: await customMission\.statuses\(userId\)/.test(missionSvc),
    'فهرستِ ماموریت‌های اختصاصی در وضعیتِ ماموریت‌ها می‌آید');
  ok(/custom: await customMission\.status\(userId\)/.test(missionSvc),
    '⚠️ کلیدِ `custom` برای کلاینتِ قدیمی حفظ شده');

  const adminRoute = src('src/routes/adminCustomMission.js');
  ok(/customMission\.list\(\)/.test(adminRoute) && /max: customMission\.MAX_ITEMS/.test(adminRoute),
    'پنل، فهرست و سقف را از سرور می‌خواند (نه عددِ هاردکد در UI)');
  ok(/custom-mission\/:id\/reset/.test(adminRoute), 'مسیرِ «دورهٔ تازه» در پنل هست');
  ok(/customMission\.stats\(\)/.test(adminRoute), 'آمارِ دریافت به پنل می‌رود');

  const server = src('src/server.js');
  const mounts = (server.match(/routes\/adminCustomMission/g) || []).length;
  ok(mounts === 1, `مسیرهای ادمین یک‌بار ثبت می‌شوند (${mounts}) — نه دوبار`);

  // ── هر دو کلاینت باید فهرست را بکشند، وگرنه چند ماموریتی نیمه‌کاره است ──
  const web = fs.readFileSync(path.join(__dirname, '../../userweb/src/GrowthHub.jsx'), 'utf8');
  ok(/customMissions/.test(web), 'وب فهرستِ ماموریت‌های اختصاصی را می‌خواند');
  ok(/missions\/custom\/\$\{mission\.id\}\/claim/.test(web) || /missions\/custom\/\$\{/.test(web),
    'وب برای هر کارت، مسیرِ دریافتِ همان ماموریت را صدا می‌زند');

  const app = fs.readFileSync(path.join(__dirname, '../../mobile/lib/screens/user/games/growth_panel.dart'), 'utf8');
  ok(/customMissions/.test(app), 'اندروید فهرستِ ماموریت‌های اختصاصی را می‌خواند');
  ok(/missions\/custom\/\$\{/.test(app), 'اندروید هم برای هر کارت مسیرِ همان ماموریت را صدا می‌زند');

  const adminPage = fs.readFileSync(path.join(__dirname, '../../admin/src/pages/custom-mission.jsx'), 'utf8');
  ok(/missions/.test(adminPage) && /items:/.test(adminPage),
    'پنل ادمین فهرست را ویرایش و به شکلِ `items` ذخیره می‌کند');
  ok(/ifUnchangedSince: stamp/.test(adminPage),
    'پنل مُهرِ فهرست را همراهِ ذخیره می‌فرستد (گاردِ تبِ کهنه)');

  // ── گاردهای «کارتِ خاموش» (درسِ ۲۹ شهریور: مالک دو ماموریت ساخت و یکی
  //    را دید، چون کارتِ تازه پیش‌فرض خاموش ذخیره می‌شد) ──────────────────
  ok(/enabled: m\.id \? m\.enabled === true : true/.test(adminPage),
    '⚠️ کارتِ تازه در پنل پیش‌فرض فعال است (افزودن = نشان بده)');
  ok(/همه را فعال کن/.test(adminPage) && /function enableAll\(/.test(adminPage),
    'دکمهٔ «همه را فعال کن» هست (یک کلیک برای روشن‌کردن همهٔ کارت‌های نوشته‌شده)');
  ok(/خاموش — دیده نمی‌شود/.test(adminPage),
    'کارتِ خاموش که عنوان دارد، روی خودِ کارت هشدار می‌گیرد');
  ok(/const offTitled = items\.filter\(m => !m\.enabled && m\.title\.trim\(\)\)/.test(adminPage),
    'پنل کارت‌های خاموشِ دارای عنوان را می‌شمارد');
  ok(/عنوان ندارد؛ /.test(adminPage),
    'ذخیرهٔ کارتِ روشنِ بی‌عنوان، پیش از ارسال با پیامِ روشن گرفته می‌شود');

  const adminRouteSrc = src('src/routes/adminCustomMission.js');
  ok(/ماموریت خاموش است و دیده نمی‌شود/.test(adminRouteSrc),
    'پیامِ سرور هم کارت‌های خاموشِ دارای عنوان را نام می‌برد');
  ok(/custom-mission\/\$\{item\.id\}\/reset/.test(adminPage) && /ارسال دوباره به همه/.test(adminPage),
    'دکمهٔ «ارسال دوباره به همه» در پنل هست (همان ماموریت، برای همه از نو)');

  opsConfig.syncGet = realSyncGet;
  opsConfig.set = realSet;

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
