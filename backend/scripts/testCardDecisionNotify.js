#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  آزمونِ اعلانِ نتیجهٔ کارتِ عکس (سه مسیرِ تصمیم)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── باگی که این آزمون باید همیشه بگیرد ────────────────────────────────────
 *
 * تا امروز هر کاربری که کارتش از راه **تأییدِ خودکارِ سرور** قبول می‌شد،
 * هیچ اعلانی نمی‌گرفت: نه نوتیفیکیشنِ گوشی، نه ردیفی در زنگولهٔ اعلان‌ها.
 * شاهدش در دیتابیسِ تولید بود — کاربر `c668c1da` کارتش ساعت ۱۹:۱۸ ثبت و
 * ۱۹:۴۳ خودکار تأیید شد و تعدادِ اعلان‌های `card` او **صفر** بود.
 *
 * این آزمون سه لایه دارد:
 *
 *   ۱. **متن**: کاربر باید دقیقاً همان جمله‌ای را ببیند که در مسیرِ دستیِ
 *      ادمین می‌دید (نه دو متنِ متفاوت بسته به اینکه کدام مسیر پرونده‌اش
 *      را برده). ضمناً متن نباید «XP» وعده بدهد — کارتِ عکس عمداً XPِ
 *      گذرِ نبرد نمی‌دهد.
 *
 *   ۲. **رفتار (با اعلان‌فرستِ جعلی)**: تابعِ اعلان واقعاً صدا زده می‌شود،
 *      با نوعِ درست و با تصمیمِ درستِ پوش:
 *        • مسیرِ غیرِهم‌زمانی (صف/ادمین) → پوش **بله**
 *        • مسیرِ درون‌درخواستی → پوش **خیر** (نتیجه همان لحظه در پاسخِ
 *          همان درخواست به کاربر نشان داده می‌شود؛ پوش = پیامِ تکراری)
 *      و خطای اعلان هرگز ثبتِ کارت را نمی‌شکند.
 *
 *   ۳. **قراردادِ کد (خواندنِ منبع)**: اگر فردا کسی در بازآرایی، خطِ اعلان
 *      را از مسیرِ خودکار بردارد، همین آزمون قرمز می‌شود — حتی اگر
 *      دیتابیس در دسترس نباشد. (روشِ همین کار در testNotifications.js.)
 *
 * بدونِ دیتابیس، بدونِ شبکه، بدونِ مدلِ بینایی اجرا می‌شود.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
};

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

/// کامنت‌ها را حذف می‌کند.
///
/// چرا لازم است: کامنت‌های این پروژه عمداً توضیحِ باگِ قبلی را با کلمهٔ
/// «اعلان» نگه می‌دارند؛ بدونِ حذفِ کامنت‌ها، آزمون به توضیح گیر می‌کند و
/// سبزِ بی‌معنا می‌دهد.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

// ── ۱. متن ────────────────────────────────────────────────────────────────
console.log('\n۱) متنِ اعلان');
{
  const { buildApprovedText, buildRejectedText } =
    require('../src/services/cardDecisionNotify');

  const withName = buildApprovedText({ cardTypeName: 'پسرک', points: 250 });
  ok(withName.title === 'کارت شما تأیید شد', 'عنوانِ تأیید دقیقاً «کارت شما تأیید شد» است');
  ok(withName.body.includes('پسرک') && withName.body.includes('250'),
    'نامِ کارت و امتیازِ گرفته‌شده در متن هست');
  ok(!/XP/i.test(withName.body),
    'متن «XP» وعده نمی‌دهد (کارتِ عکس XPِ گذرِ نبرد نمی‌دهد)');

  const noName = buildApprovedText({});
  ok(noName.title === 'کارت شما تأیید شد' && noName.body.length > 5,
    'بدونِ نامِ کارت هم متنِ کامل و بی‌خطا ساخته می‌شود');
  ok(!noName.body.includes('undefined') && !noName.body.includes('null'),
    'هیچ‌وقت «undefined/null» در متنِ کاربر نمی‌افتد');

  const zero = buildApprovedText({ cardTypeName: 'الف', points: 0 });
  ok(!zero.body.includes('0 امتیاز'), 'امتیازِ صفر به کاربر نمایش داده نمی‌شود');

  const rej = buildRejectedText({ reason: 'عکس تار بود' });
  ok(rej.title === 'کارت شما تأیید نشد' && rej.body === 'عکس تار بود',
    'دلیلِ ردِ ادمین عیناً به کاربر می‌رسد');
  ok(buildRejectedText({}).body.length > 10,
    'بدونِ دلیل هم متنِ پیش‌فرضِ رد وجود دارد');
}

// ── ۲. رفتار، با اعلان‌فرستِ جعلی ─────────────────────────────────────────
console.log('\n۲) رفتار (اعلان‌فرستِ جعلی؛ نه دیتابیس، نه فایربیس)');
async function behavior() {
  const svcPath = require.resolve('../src/services/notificationService');
  const real = require.cache[svcPath];
  const calls = [];
  let mode = 'ok';

  const stub = {
    id: svcPath,
    filename: svcPath,
    loaded: true,
    exports: {
      createNotification: async (userId, type, title, body, opts) => {
        if (mode === 'throw') throw new Error('دیتابیس خوابیده');
        calls.push({ userId, type, title, body, opts });
        return { id: calls.length };
      },
    },
  };
  require.cache[svcPath] = stub;
  delete require.cache[require.resolve('../src/services/cardDecisionNotify')];
  const notify = require('../src/services/cardDecisionNotify');

  // مسیرِ صف (غیرِهم‌زمان): کاربر پایِ برنامه نیست → پوش باید برود.
  await notify.cardApproved('u-1', { cardTypeName: 'پسرک', points: 250, push: true });
  ok(calls.length === 1, 'تأییدِ خودکار یک اعلان می‌فرستد');
  ok(calls[0]?.userId === 'u-1' && calls[0]?.type === 'card',
    'اعلان برای همان کاربر و با نوعِ «card» ثبت می‌شود');
  ok(calls[0]?.opts?.push === true,
    'مسیرِ صف پوش می‌فرستد (کاربر منتظرِ صفحه نبوده)');

  // مسیرِ درون‌درخواستی: نتیجه همان لحظه در پاسخ می‌آید → پوش نباید برود.
  await notify.cardApproved('u-2', { cardTypeName: 'الف', points: 10, push: false });
  ok(calls[1]?.opts?.push === false,
    'مسیرِ درون‌درخواستی پوش نمی‌فرستد (پیامِ تکراری نشود)');

  await notify.cardRejected('u-3', { reason: 'تار', push: true });
  ok(calls[2]?.title === 'کارت شما تأیید نشد' && calls[2]?.type === 'card',
    'رد شدن هم با نوعِ «card» و عنوانِ درست اعلان می‌شود');

  // بدونِ کاربر نباید هیچ صدا زده شود (اعلانِ یتیم).
  await notify.cardApproved(null, {});
  await notify.cardRejected(undefined, {});
  ok(calls.length === 3, 'کاربرِ خالی هیچ اعلانی نمی‌سازد (اعلانِ یتیم نداریم)');

  // خطای اعلان نباید بالا برود: تأییدِ کارت تمام شده، اعلان کارِ جانبی است.
  mode = 'throw';
  let threw = false;
  let ret = 'unset';
  try { ret = await notify.cardApproved('u-4', {}); } catch { threw = true; }
  ok(!threw && ret === null,
    'خطای اعلان ثبتِ کارت را نمی‌شکند (فقط لاگ می‌شود)');

  require.cache[svcPath] = real;
  delete require.cache[require.resolve('../src/services/cardDecisionNotify')];
}
behavior()
  .then(() => {
    // ── ۳. قراردادِ کد ──────────────────────────────────────────────────
    console.log('\n۳) قراردادِ کد (بدون دیتابیس هم اجرا می‌شود)');
    {
      const queue = stripComments(read('src', 'services', 'serverReviewQueue.js'));
      // مسیرِ صف اعلان را از یک متغیرِ محلی صدا می‌زند (می‌تواند قلابِ آزمون
      // باشد)، پس فقط وجودِ ارجاع به اعلان‌فرست سنجیده می‌شود.
      ok(/cardNotify\.cardApproved/.test(queue),
        'مسیرِ تأییدِ خودکارِ سرور اعلان می‌فرستد (همان باگ)');
      ok(/notifyApproved\(/.test(queue),
        'همان اعلان‌فرست در بدنهٔ مسیرِ خودکار هم صدا زده می‌شود');

      const routes = stripComments(read('src', 'routes', 'photoCards.js'));
      ok(/cardNotify\.cardApproved\(/.test(routes), 'مسیرِ تأییدِ ادمین اعلان می‌فرستد');
      ok(/cardNotify\.cardRejected\(/.test(routes), 'مسیرِ ردِ ادمین اعلان می‌فرستد');
      // مسیرِ درون‌درخواستی باید صریحاً push:false بدهد؛ وگرنه پیام تکراری می‌شود.
      ok(/push:\s*false/.test(routes) || /push:\s*false/.test(read('src','routes','photoCards.js')),
        'مسیرِ درون‌درخواستی صریحاً پوش را خاموش می‌کند');

      // قراردادِ لایهٔ اعلان: دروازهٔ `push:false` باید **پیش از** ارسال باشد.
      const svc = stripComments(read('src', 'services', 'notificationService.js'));
      const guardAt = svc.indexOf('opts.push === false');
      // از ۲۰۲۶-۰۹-۲۲ ارسال دو لایهٔ موازی است (FCM موبایل + Web Push
      // مرورگر، هر دو در Promise.allSettled)؛ پین روی خودِ فراخوانی‌هاست
      // و قراردادِ اصلی — تقدمِ دروازهٔ push:false بر هر دو ارسال —
      // دست‌نخورده می‌ماند.
      const pushAt = svc.indexOf('sendPushToUser(userId');
      const webPushAt = svc.indexOf('sendWebPushToUser(userId');
      ok(guardAt !== -1 && pushAt !== -1 && guardAt < pushAt,
        'createNotification پیش از فرستادنِ پوش، درخواستِ «بدونِ پوش» را می‌پذیرد');
      ok(webPushAt !== -1 && guardAt < webPushAt,
        'دروازهٔ «بدونِ پوش» پیش از لایهٔ وب هم هست');

      // اعلان در مسیرِ صف باید *بعد* از COMMIT باشد (وگرنه ممکن است
      // تراکنش برگردد و کاربر برای کارتی که ثبت نشده پیام بگیرد).
      const commitAt = queue.indexOf("await client.query('COMMIT')");
      const notifyAt = Math.max(queue.indexOf('cardNotify.cardApproved'),
        queue.indexOf('notifyApproved('));
      ok(commitAt !== -1 && notifyAt > commitAt,
        'اعلانِ صف بعد از COMMIT می‌رود (کارتِ ذخیره‌نشده پیام نمی‌دهد)');
    }

    console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} تست موفق، ${fail} ناموفق`);
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error('\n✗ خطای غیرمنتظره در آزمون:', e);
    process.exit(1);
  });
