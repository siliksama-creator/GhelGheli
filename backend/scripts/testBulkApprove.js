#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  آزمونِ «تأیید گروهی» — با دیتابیسِ جعلی، بدونِ مدل، بدونِ شبکه
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * خواستهٔ مالک: «صفحهٔ تأیید گروهی — تأیید چند کارت با یک کلیک».
 *
 * ── چه چیزی اینجا واقعاً سنجیده می‌شود ────────────────────────────────────
 *
 * ۱. **هم‌رفتاری**: تأییدِ تک‌نفره و تأییدِ گروهی باید از *همان* تابع بگذرند.
 *    آزمونِ کلیدی: خروجیِ اثرِ دیتابیس برای یک پرونده در هر دو مسیر باید
 *    یکی باشد. اگر فردا کسی منطقِ گروهی را کپی کند و یکی از دو نسخه را
 *    اصلاح کند، این آزمون قرمز می‌شود.
 *
 * ۲. **جداسازیِ خطا**: یک پروندهٔ خراب (مثلاً قبلاً بررسی‌شده) نباید کل گروه
 *    را بسوزاند؛ بقیه باید تأیید شوند و دلیلِ دقیقِ خطا برگردد.
 *
 * ۳. **نگهبان‌ها**: فهرستِ خالی، بیشتر از سقف، شناسهٔ نامعتبر، و ردِ بی‌دلیل.
 *
 * ۴. **یک اعلان برای هر کاربر** و **یک پخشِ سوکت برای کل گروه** (نه ۵۰ پخش).
 */
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
};

function stub(modulePath, exports) {
  const id = require.resolve(modulePath);
  const prev = require.cache[id];
  require.cache[id] = { id, filename: id, loaded: true, exports };
  return () => { if (prev) require.cache[id] = prev; else delete require.cache[id]; };
}

// ── جعلی‌ها ───────────────────────────────────────────────────────────────
const notifications = [];
const restoreNotify = stub('../src/services/notificationService', {
  createNotification: async (userId, type, title, body, opts) => {
    notifications.push({ userId, type, title, body, opts });
    return { id: notifications.length };
  },
});

let creditCalls = 0;
const restoreCredit = stub('../src/services/photoCardService', {
  creditSubmission: async (client, args) => {
    creditCalls++;
    return { cardTypeName: 'پسرک', points: 250, cash: 0, imageUrl: '/x.webp' };
  },
});

let signals = 0;
const restoreSignal = stub('../src/services/leaderboardSignal', {
  leaderboardChanged: () => { signals++; },
});

// ── دیتابیسِ جعلی ─────────────────────────────────────────────────────────
/// پرونده‌ها به‌صورتِ داده در حافظه — همان چیزی که route انتظار دارد.
const SUBS = new Map();
const makeSub = (id, status = 'pending') => {
  SUBS.set(id, {
    id, user_id: `user-${id}`, code_id: `code-${id}`, status,
    matched_design_id: `design-${id}`, identity_top_design_id: `design-${id}`,
    user_image_path: null, identity_top_score: 0.8, identity_margin: 0.2,
    img_embedding: null, embedding_version: 'v1',
  });
  return id;
};

/// هر تصمیمِ اتمیکِ دیتابیس برای مقایسهٔ «تک‌نفره در برابر گروهی».
const effects = [];
const effectFor = (id, approve) => ({
  id, approve,
  chosenDesign: approve ? `design-${id}` : null,
  status: approve ? 'approved' : 'rejected',
});

function fakePool() {
  const client = {
    query: async (sql, params) => {
      const q = String(sql).replace(/\s+/g, ' ').trim();
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(q)) return { rows: [] };
      if (q.startsWith('SELECT * FROM photo_card_submissions')) {
        const sub = SUBS.get(params[0]);
        return { rows: sub ? [{ ...sub }] : [] };
      }
      if (q.startsWith('SELECT expected_card_type_id FROM photo_card_codes')) {
        return { rows: [{ expected_card_type_id: 'type-1' }] };
      }
      if (q.startsWith('SELECT d.id, d.card_type_id, d.image_url')) {
        const id = String(params[0]).replace('design-', '');
        return { rows: [{ id: `design-${id}`, card_type_id: 'type-1', image_url: '/d.webp' }] };
      }
      if (q.startsWith('UPDATE photo_card_submissions SET chosen_design_id')) {
        const sub = SUBS.get(params[1]);
        if (sub) sub.chosen = params[0];
        return { rows: [] };
      }
      if (q.startsWith("UPDATE photo_card_submissions SET status=$1")) {
        // params: [status, reason, adminId, id]
        const sub = SUBS.get(params[3]);
        if (sub) sub.status = params[0];
        effects.push(effectFor(params[3], params[0] === 'approved'));
        return { rows: [] };
      }
      if (q.startsWith("UPDATE photo_card_codes SET status='unused'")) return { rows: [] };
      if (q.startsWith('INSERT INTO photo_card_embedding_agreement')) return { rows: [] };
      if (q.startsWith('SELECT card_type_id FROM photo_card_designs')) {
        return { rows: [{ card_type_id: 'type-1' }] };
      }
      if (q.startsWith('SELECT face_embedding')) return { rows: [{}] };
      return { rows: [] };
    },
    release: () => {},
  };
  return { connect: async () => client, query: async () => ({ rows: [] }) };
}

// ── ساختِ اپ ──────────────────────────────────────────────────────────────
const createRoutes = require('../src/routes/photoCards');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const auditCalls = [];
const leagueCalls = [];
const passThrough = (req, res, next) => next();

const app = express();
app.use(express.json());
// مثلِ server.js دقیقاً زیر `/api` سوار می‌شود تا مسیرها همان مسیرِ واقعی
// باشند (اگر اینجا اشتباه باشد، آزمون مسیرِ دیگری را می‌سنجد که در تولید
// وجود ندارد و سبزِ بی‌معنا می‌دهد).
app.use('/api', createRoutes({
  pool: fakePool(),
  auth: passThrough,
  // میدل‌ورِ مدیر: همان کاری که `adminAuth` واقعی می‌کند — گذاشتنِ req.admin.
  adminAuth: (req, res, next) => { req.admin = { id: 'admin-1' }; next(); },
  requireRole: () => passThrough,
  asyncHandler: (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
  // multer جعلی — روتر در زمانِ ساخت، فیلدهای آپلود را می‌سازد؛ این آزمون
  // هرگز چیزی آپلود نمی‌کند، پس فقط شکلِ موردِ انتظار را می‌دهیم.
  imageUpload: {
    fields: () => (req, res, next) => next(),
    single: () => (req, res, next) => next(),
    array: () => (req, res, next) => next(),
    none: () => (req, res, next) => next(),
  },
  audit: async (adminId, action, table, id, note) => { auditCalls.push({ adminId, action, id }); },
  createNotification: async (userId, type, title, body) => {
    notifications.push({ userId, type, title, body, opts: { viaDep: true } });
  },
  addLeaguePoints: async (client, userId, points) => { leagueCalls.push({ userId, points }); },
  validateUuid: () => passThrough,
  pass: {},
  io: {},
  getLeaderboard: async () => ({}),
  optimizeUpload: async (b) => b,
  verifyUpload: async () => ({}),
  UUID_RE,
}));
// خطاها را به پاسخِ JSON تبدیل می‌کند تا آزمون علت را ببیند.
app.use((err, req, res, _next) => {
  res.status(err.status || 500).json({ message: err.message || 'خطا' });
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-'));
const server = app.listen(0);
const BASE = `http://127.0.0.1:${server.address().port}`;

const post = async (url, body) => {
  const r = await fetch(BASE + url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await r.json(); } catch { /* پاسخِ خالی */ }
  return { status: r.status, json };
};

// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('\n۱) نگهبان‌های ورودی');
  {
    let r = await post('/api/admin/photo-cards/submissions/bulk-decide', { ids: [] });
    ok(r.status === 400, 'فهرستِ خالی رد می‌شود');

    r = await post('/api/admin/photo-cards/submissions/bulk-decide',
      { ids: Array.from({ length: 51 }, (_, i) => uuid(i)) });
    ok(r.status === 400, 'بیشتر از ۵۰ مورد در یک درخواست رد می‌شود');

    r = await post('/api/admin/photo-cards/submissions/bulk-decide', { ids: ['not-a-uuid'] });
    ok(r.status === 400, 'شناسهٔ نامعتبر رد می‌شود');

    r = await post('/api/admin/photo-cards/submissions/bulk-decide',
      { ids: [uuid(1)], approve: false });
    ok(r.status === 400, 'ردِ گروهی بدونِ دلیل رد می‌شود');
  }

  console.log('\n۲) تأیید گروهیِ سه پرونده');
  let effectsAfterBulk = null;
  {
    const ids = [makeSub(uuid(1)), makeSub(uuid(2)), makeSub(uuid(3))];
    notifications.length = 0; signals = 0; creditCalls = 0; auditCalls.length = 0;
    const r = await post('/api/admin/photo-cards/submissions/bulk-decide',
      { ids, approve: true });

    ok(r.status === 200, 'درخواست موفق بود');
    ok(r.json?.summary?.approved === 3, 'هر سه پرونده تأیید شد');
    ok(r.json?.summary?.failed === 0, 'هیچ شکستی نبود');
    ok(SUBS.get(uuid(1)).status === 'approved' && SUBS.get(uuid(3)).status === 'approved',
      'وضعیتِ پرونده‌ها در دیتابیس به approved تغییر کرد');
    ok(creditCalls === 3, 'برای هر کارت، همان تابعِ اتمیکِ امتیاز صدا زده شد');
    ok(notifications.length === 3, 'هر کاربر یک اعلان گرفت (۳ اعلان)');
    ok(new Set(notifications.map(n => n.userId)).size === 3,
      'اعلان‌ها به سه کاربرِ متفاوت رفت');
    ok(notifications.every(n => n.title === 'کارت شما تأیید شد'),
      'متنِ اعلان همان متنِ تأییدِ تک‌نفره است');
    ok(signals === 1, 'سوکتِ لیدربورد **یک بار** برای کل گروه پخش شد (نه سه بار)');
    ok(auditCalls.length === 3, 'برای هر کارت یک ردیفِ حسابرسی نوشته شد');
    ok(auditCalls.every(a => a.adminId === 'admin-1'),
      'حسابرسی نامِ مدیرِ تصمیم‌گیرنده را دارد');
    effectsAfterBulk = JSON.parse(JSON.stringify(effects));
  }

  console.log('\n۳) هم‌رفتاریِ تأییدِ تک‌نفره و گروهی (مهم‌ترین سنجه)');
  {
    // همان پرونده، این بار از مسیرِ تک‌نفره
    const id = makeSub(uuid(4));
    effects.length = 0; creditCalls = 0; signals = 0; notifications.length = 0;
    const r = await post(`/api/admin/photo-cards/submissions/${id}/decide`,
      { approve: true });
    ok(r.status === 200, 'تأییدِ تک‌نفره هنوز کار می‌کند (رگرسیون نشده)');
    const single = JSON.parse(JSON.stringify(effects));

    // و یک پروندهٔ نو، این بار از مسیرِ گروهی
    const id2 = makeSub(uuid(5));
    effects.length = 0;
    await post('/api/admin/photo-cards/submissions/bulk-decide',
      { ids: [id2], approve: true });
    const bulk = JSON.parse(JSON.stringify(effects));

    ok(single.length === 1 && bulk.length === 1,
      'هر دو مسیر دقیقاً یک اثرِ دیتابیس دارند');
    // شناسه‌ها متفاوت‌اند؛ فقط شکلِ اثر مقایسه می‌شود.
    const shape = (e) => ({ approve: e.approve, chosenDesign: !!e.chosenDesign, status: e.status });
    ok(JSON.stringify(shape(single[0])) === JSON.stringify(shape(bulk[0])),
      'شکلِ اثرِ هر دو مسیر یکسان است (یک منطق، نه دو نسخه)');
    // یک بار برای تأییدِ تک‌نفره + یک بار برای گروهِ یک‌نفره‌ای که بعدش
    // زدیم. یعنی مسیرِ گروهی هم — مثلِ تک‌نفره — سوکت را پخش می‌کند.
    ok(signals === 2, 'تأییدِ تک‌نفره یک سوکت و گروهی یک سوکت پخش کرد');
    ok(effectsAfterBulk.length === 3, 'خروجیِ مرحلهٔ قبل دست‌نخورده ماند');
  }

  console.log('\n۴) جداسازیِ خطا: یک پروندهٔ خراب کل گروه را نمی‌سوزاند');
  {
    const good1 = makeSub(uuid(6));
    const already = makeSub(uuid(7), 'approved'); // قبلاً بررسی‌شده
    const missing = uuid(8);                       // اصلاً وجود ندارد
    const good2 = makeSub(uuid(9));
    notifications.length = 0; creditCalls = 0;
    const r = await post('/api/admin/photo-cards/submissions/bulk-decide',
      { ids: [good1, already, missing, good2], approve: true });

    ok(r.status === 200, 'درخواست با وجودِ خطاها ۲۰۰ برمی‌گردد');
    ok(r.json.summary.approved === 2 && r.json.summary.failed === 2,
      'دقیقاً ۲ تأیید و ۲ شکست گزارش شد');
    ok(SUBS.get(good1).status === 'approved' && SUBS.get(good2).status === 'approved',
      'پرونده‌های سالم حتی بعد از خطا هم تأیید شدند');
    const fails = r.json.results.filter(x => !x.ok);
    ok(fails.every(f => typeof f.message === 'string' && f.message.length > 3),
      'برای هر شکست، دلیلِ خوانا برگشت');
    ok(notifications.length === 2,
      'فقط برای تأییدشده‌ها اعلان رفت (کاربرِ پروندهٔ خطادار بی‌دلیل پیام نگرفت)');
  }

  console.log('\n۵) شناسهٔ تکراری در فهرست');
  {
    const id = makeSub(uuid(10));
    creditCalls = 0;
    const r = await post('/api/admin/photo-cards/submissions/bulk-decide',
      { ids: [id, id, id], approve: true });
    ok(r.json.summary.total === 1, 'شناسهٔ تکراری یک بار پردازش می‌شود');
    ok(creditCalls === 1, 'امتیاز فقط یک بار داده شد (ضدِ تکرار)');
  }

  console.log('\n۶) شکلِ پاسخ برای پنل ادمین');
  {
    const id = makeSub(uuid(11));
    const r = await post('/api/admin/photo-cards/submissions/bulk-decide',
      { ids: [id], approve: true });
    const row = r.json.results[0];
    ok(row.id === id && row.ok === true && row.approved === true,
      'هر ردیف شناسه و نتیجهٔ خودش را دارد');
    ok(row.cardTypeName === 'پسرک' && row.points === 250,
      'نامِ کارت و امتیاز برای نمایش در گزارشِ پنل برمی‌گردد');
  }
}

main()
  .then(() => {
    restoreNotify(); restoreCredit(); restoreSignal();
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} تست موفق، ${fail} ناموفق`);
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch((e) => {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    console.error('\n✗ خطای غیرمنتظره در آزمون:', e);
    process.exit(1);
  });
