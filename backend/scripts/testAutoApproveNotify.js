#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  آزمونِ مسیرِ «تأییدِ خودکارِ سرور» — با دیتابیسِ جعلی
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── چرا این آزمون جدا از testCardDecisionNotify.js است ───────────────────
 *
 * آن یکی «اعلان‌فرست» را می‌سنجد؛ این یکی **خودِ مسیرِ تأییدِ خودکار** را:
 * همان ۱۰۰ خطی که کارت را تأیید می‌کند، امتیاز می‌دهد، پرونده را می‌بندد و
 * عکس را پاک می‌کند. باگی که کاربر گزارش داد همین‌جا بود: کارت تأیید می‌شد
 * ولی هیچ اعلانی نمی‌رفت.
 *
 * ── چرا دیتابیسِ جعلی و نه پستگرسِ واقعی ──────────────────────────────────
 *
 * برای اجرای مسیرِ واقعی به مدلِ بینایی (ONNX)، بردارهای مرجع و ۵۶ طرحِ
 * فعال نیاز است؛ چنین آزمونی نه در CI اجرا می‌شود و نه روی لپ‌تاپِ
 * توسعه‌دهنده. آن‌چه باید قفل شود **منطقِ مسیر** است، نه دقتِ مدل:
 *
 *   • خروجی برای پروندهٔ `pending` = تأیید + امتیاز + اعلان
 *   • اعلان **بعد از** COMMIT می‌رود (کارتِ ذخیره‌نشده پیام نمی‌دهد)
 *   • پروندهٔ در صف، **هیچ** اعلانِ تأییدی نمی‌گیرد
 *   • پروندهٔ قبلاً تصمیم‌گرفته‌شده، دوباره تأیید/اعلان نمی‌شود
 *   • خطای اعلان، تأییدِ کارت را نمی‌شکند
 *   • عکسِ پروندهٔ تأییدشده پاک می‌شود، عکسِ پروندهٔ درصف می‌ماند
 *
 * مدلِ بینایی و `creditSubmission` با جعلیِ کنترل‌شده جایگزین می‌شوند تا
 * آزمون به آن‌ها وابسته نباشد؛ بقیهٔ کد همان کدِ تولید است.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autonotify-'));
const imgFile = path.join(tmpDir, 'user-photo.jpg');
fs.writeFileSync(imgFile, Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00]));

// ═══════════════════════════════════════════════════════════════════════════
// تزریقِ جعلی‌ها در require.cache — پیش از بارکردنِ ماژولِ زیرِ آزمون
// ═══════════════════════════════════════════════════════════════════════════

/// جعلی‌سازِ ساده: ماژولِ واقعی را با یک شیءِ دلخواه جایگزین می‌کند.
function stub(modulePath, exports) {
  const id = require.resolve(modulePath);
  const prev = require.cache[id];
  require.cache[id] = { id, filename: id, loaded: true, exports };
  return () => { if (prev) require.cache[id] = prev; else delete require.cache[id]; };
}

const notifications = [];   // هر اعلانی که فرستاده می‌شود
let notifyMode = 'ok';      // 'ok' | 'throw'

const restoreNotify = stub('../src/services/notificationService', {
  createNotification: async (userId, type, title, body, opts) => {
    if (notifyMode === 'throw') throw new Error('دیتابیسِ اعلان خوابیده');
    notifications.push({ userId, type, title, body, opts, at: log.length });
    return { id: notifications.length };
  },
});

/// نظرِ مدلِ بینایی — هر آزمون عوضش می‌کند.
let verdict = {
  action: 'approve', reason: 'card+face', designId: 'd-1', cardTypeId: 't-1',
  topName: 'پسرک', cardScore: 0.91, cardMargin: 0.12,
  faceScore: 0.88, faceMargin: 0.20, faceCount: 1, crop: null,
};
const restoreVerify = stub('../src/services/serverVerify', {
  decide: async () => verdict,
});

/// تأییدِ اتمیکِ کارت — همان چیزی که ادمین هم استفاده می‌کند.
let creditCalls = [];
let creditImpl = async () => ({ cardTypeName: 'پسرک', points: 250, cash: 0 });
const restoreCredit = stub('../src/services/photoCardService', {
  creditSubmission: async (client, args) => {
    creditCalls.push(args);
    return creditImpl(client, args);
  },
});

const log = [];             // ترتیبِ رخدادهای SQL

// ماژولِ زیرِ آزمون **جعلی نمی‌شود** — همان کدِ تولید است؛ فقط همسایه‌هایش
// (مدل، تأییدِ اتمیک، اعلان‌فرست) جایگزین شده‌اند تا آزمون به مدلِ بینایی و
// پستگرس وابسته نباشد.
const queue = require('../src/services/serverReviewQueue');

/**
 * دیتابیسِ جعلیِ کوچک — فقط همان کوئری‌هایی که reviewOne می‌زند.
 * @param {object} sub پرونده‌ای که `SELECT ... FOR UPDATE` برمی‌گرداند
 * @param {{design?: object|null}} [opts]
 */
function fakePool(sub, opts = {}) {
  const state = { committed: 0, rolledBack: 0 };
  const client = {
    query: async (sql, params) => {
      const s = String(sql).replace(/\s+/g, ' ').trim();
      if (s === 'BEGIN' || s === 'COMMIT' || s === 'ROLLBACK') {
        log.push(s);
        if (s === 'COMMIT') state.committed++;
        if (s === 'ROLLBACK') state.rolledBack++;
        return { rows: [] };
      }
      if (s.startsWith('SELECT * FROM photo_card_submissions')) {
        log.push('SELECT-submission');
        return { rows: sub ? [sub] : [] };
      }
      if (s.startsWith('SELECT d.id, d.card_type_id, d.image_url')) {
        log.push('SELECT-design');
        return { rows: opts.design === undefined ? [{ id: 'd-1' }] : (opts.design ? [opts.design] : []) };
      }
      if (s.startsWith('UPDATE photo_card_submissions SET server_verify')) {
        log.push('UPDATE-verify');
        return { rows: [] };
      }
      if (s.startsWith("UPDATE photo_card_submissions SET status='approved'")) {
        log.push('UPDATE-approved');
        return { rows: [] };
      }
      log.push('OTHER');
      return { rows: [] };
    },
    release: () => { log.push('RELEASE'); },
  };
  return { connect: async () => client, state };
}

const pendingSub = () => ({
  id: 'sub-1', user_id: 'user-c668c1da', status: 'pending',
  code_id: 'code-1', user_image_path: imgFile, matched_design_id: null,
});

// ═══════════════════════════════════════════════════════════════════════════
// سناریوها
// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('\n۱) پروندهٔ پراطمینان → تأییدِ خودکار + اعلان');

  const fileForRun = path.join(tmpDir, 'run1.jpg');
  fs.copyFileSync(imgFile, fileForRun);
  {
    const sub = { ...pendingSub(), user_image_path: fileForRun };
    const pool = fakePool(sub);
    const signals = [];
    const audits = [];
    const r = await queue.reviewOne(pool, 'sub-1', {
      leaderboardSignal: () => signals.push('l'),
      audit: async () => audits.push('a'),
    });

    ok(r.action === 'approved' && r.approved === true,
      'پروندهٔ پراطمینان تأیید شد (action=approved)');
    ok(r.points === 250 && r.cardTypeName === 'پسرک',
      'امتیاز و نامِ کارت به صداکننده برگشت داده می‌شود');
    ok(creditCalls.length === 1 && creditCalls[0].adminId === null,
      'تأیید از همان تابعِ اتمیکِ ادمین انجام شد، ولی با adminId=null (سیستم، نه ادمین)');

    // ── اصلِ موضوعِ این تغییر ──
    ok(notifications.length === 1,
      'کاربر **یک** اعلان گرفت (پیش از این: صفر)');
    const n = notifications[0] || {};
    ok(n.userId === 'user-c668c1da', 'اعلان به خودِ صاحبِ کارت رفت');
    ok(n.title === 'کارت شما تأیید شد', 'عنوانِ اعلان همان متنِ مسیرِ ادمین است');
    ok(n.body.includes('پسرک') && n.body.includes('250'),
      'متنِ اعلان نامِ کارت و امتیازِ گرفته‌شده را دارد');
    ok(n.type === 'card', 'نوعِ اعلان «card» است (زنگوله همان دسته‌بندی را می‌شناسد)');
    ok(n.opts?.push === true,
      'پوشِ گوشی فرستاده می‌شود (کاربر پایِ برنامه نبوده)');

    ok(pool.state.committed === 1 && pool.state.rolledBack === 0,
      'تراکنش با COMMIT بسته شد');
    const order = log.indexOf('COMMIT');
    ok(n.at > order,
      'اعلان **بعد از** COMMIT رفت (کارتِ ذخیره‌نشده پیام نمی‌دهد)');
    ok(log.indexOf('UPDATE-approved') < order,
      'وضعیتِ پرونده پیش از COMMIT به approved تغییر کرد');

    ok(!fs.existsSync(fileForRun),
      'عکسِ خامِ کاربر بعد از تأییدِ خودکار از دیسک پاک شد');
    ok(signals.length === 1, 'سیگنالِ لیدربورد بعد از تأیید پخش شد');
    ok(audits.length === 1, 'ثبتِ حسابرسیِ مدیر اجرا شد');
  }

  console.log('\n۲) پروندهٔ مشکوک → در صف می‌ماند و اعلانِ تأیید نمی‌گیرد');

  {
    // نظرِ مدل: تصویرِ ضعیف → صف (نه تأیید)
    verdict = { action: 'queue', reason: 'low-margin', topName: 'پسرک', cardScore: 0.51, cardMargin: 0.01 };
    notifications.length = 0; log.length = 0; creditCalls.length = 0;
    const fileForRun2 = path.join(tmpDir, 'run2.jpg');
    fs.copyFileSync(imgFile, fileForRun2);
    const sub = { ...pendingSub(), user_image_path: fileForRun2 };
    const pool = fakePool(sub);
    const r = await queue.reviewOne(pool, 'sub-2', {});

    ok(r.action === 'queue' && r.approved === false,
      'پروندهٔ مشکوک در صف ماند (هیچ تأییدِ خودکاری)');
    ok(notifications.length === 0,
      'برای پروندهٔ در صف هیچ اعلانِ تأییدی نرفت (کاربر بی‌خبر نمی‌ماند بابت چیزی که نشده)');
    ok(creditCalls.length === 0, 'هیچ امتیازی داده نشد');
    ok(fs.existsSync(fileForRun2),
      'عکسِ پروندهٔ در صف نگه داشته شد (ادمین باید ببیند)');
    verdict = { action: 'approve', reason: 'card+face', designId: 'd-1', topName: 'پسرک' };
  }

  console.log('\n۳) پروندهٔ قبلاً تصمیم‌گرفته‌شده → نه تأییدِ دوباره، نه اعلانِ دوباره');

  {
    notifications.length = 0; log.length = 0; creditCalls.length = 0;
    const sub = { ...pendingSub(), status: 'approved' };
    const pool = fakePool(sub);
    const r = await queue.reviewOne(pool, 'sub-3', {});

    ok(r.checked === false && r.action === 'approved',
      'پروندهٔ بسته‌شده دوباره پردازش نشد');
    ok(pool.state.rolledBack === 1 && pool.state.committed === 0,
      'تراکنش با ROLLBACK برگشت (بدونِ تغییرِ وضعیت)');
    ok(notifications.length === 0 && creditCalls.length === 0,
      'امتیاز و اعلانِ دوباره صادر نشد (ضدِ تکرار)');
  }

  console.log('\n۴) خطای اعلان نباید تأییدِ کارت را بشکند');

  {
    notifications.length = 0; log.length = 0; creditCalls.length = 0;
    notifyMode = 'throw';
    const fileForRun4 = path.join(tmpDir, 'run4.jpg');
    fs.copyFileSync(imgFile, fileForRun4);
    const sub = { ...pendingSub(), user_image_path: fileForRun4 };
    const pool = fakePool(sub);
    let threw = false;
    let r = null;
    try { r = await queue.reviewOne(pool, 'sub-4', {}); } catch { threw = true; }

    ok(!threw && r?.action === 'approved',
      'با خوابیدنِ دیتابیسِ اعلان، کارت همچنان تأیید شد');
    ok(pool.state.committed === 1,
      'تراکنشِ کارت COMMIT شد (اعلان کارِ جانبی است، نه بخشی از ثبت)');
    ok(!fs.existsSync(fileForRun4), 'عکس پاک شد');
    notifyMode = 'ok';
  }

  console.log('\n۵) بدونِ قالبِ کارت (code) → صف، بدونِ اعلان');

  {
    notifications.length = 0; creditCalls.length = 0;
    const sub = { ...pendingSub(), code_id: null, user_image_path: imgFile };
    const pool = fakePool(sub);
    const r = await queue.reviewOne(pool, 'sub-5', {});
    ok(r.action === 'queue' && r.reason === 'no-code',
      'پروندهٔ بی‌قالب در صف می‌ماند');
    ok(notifications.length === 0 && creditCalls.length === 0,
      'هیچ اعلان/امتیازی صادر نشد');
  }

  console.log('\n۶) خروجیِ جاروبِ کامل هم اعلان را حمل می‌کند');

  {
    // sweepPending: پرونده‌های pending را می‌گیرد و برای هرکدام reviewOne را
    // صدا می‌زند. اینجا فقط قراردادِ «اعلان در مسیرِ جاروب هم هست» سنجیده
    // می‌شود، چون خودِ جاروب قفلِ مشورتیِ پستگرس می‌خواهد.
    notifications.length = 0;
    const fileForRun6 = path.join(tmpDir, 'run6.jpg');
    fs.copyFileSync(imgFile, fileForRun6);
    const sub = { ...pendingSub(), id: 'sub-6', user_image_path: fileForRun6 };
    const pool = fakePool(sub);
    const r = await queue.reviewOne(pool, 'sub-6', {});
    ok(r.action === 'approved' && notifications.length === 1,
      'همان اعلان که مسیرِ درخواستی (reviewWithRetry) می‌داد، در جاروب هم می‌رود');
  }

}

main()
  .then(() => {
    restoreNotify(); restoreVerify(); restoreCredit();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} تست موفق، ${fail} ناموفق`);
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch((e) => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.error('\n✗ خطای غیرمنتظره در آزمون:', e);
    process.exit(1);
  });
