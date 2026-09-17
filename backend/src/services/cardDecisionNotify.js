'use strict';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  اعلانِ نتیجهٔ کارت — یک‌جا، برای همهٔ مسیرهای تصمیم
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── باگی که این فایل می‌بندد ─────────────────────────────────────────────
 *
 * پیش از این، اعلانِ «کارت شما تأیید شد» **فقط** در مسیرِ دستیِ ادمین
 * فرستاده می‌شد (`routes/photoCards.js`). مسیرِ تأییدِ **خودکارِ سرور**
 * (`services/serverReviewQueue.js`) کارت را تأیید می‌کرد و امتیاز را
 * می‌داد، ولی هیچ اعلانی نمی‌فرستاد — نه نوتیفیکیشنِ گوشی، نه ردیفی در
 * زنگولهٔ اعلان‌ها.
 *
 * شاهدِ واقعی از دیتابیسِ تولید: کاربر `c668c1da`، ثبتِ ۰۹-۰۶ ساعت
 * ۱۹:۱۸:۳۹، تأییدِ خودکار ۱۹:۴۳:۳۵ (`decision_path='server_auto'`) و
 * **صفر** اعلانِ `card` برای او. همهٔ ۱۱ اعلانِ `card` موجود در دیتابیس
 * مربوط به ردشدن‌ها بودند (تنها مسیری که اعلان داشت).
 *
 * ── چرا یک فایلِ جدا و نه کپی‌کردنِ پیام ─────────────────────────────────
 *
 * سه مسیرِ تصمیم وجود دارد (درون‌درخواستی، تأییدِ خودکارِ سرور، دستیِ
 * ادمین) و پیامِ هر سه باید یکی باشد؛ وگرنه کاربر بسته به اینکه کدام
 * مسیر پرونده‌اش را برده، متنِ متفاوتی می‌بیند. این ماژول تنها جایی است
 * که متنِ اعلان در آن نوشته می‌شود.
 *
 * ── قاعدهٔ پوش ────────────────────────────────────────────────────────────
 *
 *   • مسیرِ **غیرِهم‌زمان** (سرورِ خودکار، ادمین): `push: true`
 *     کاربر آن لحظه پایِ برنامه نیست؛ اعلان باید سرِ وقت برود.
 *   • مسیرِ **درون‌درخواستی**: `push: false`
 *     نتیجه همان لحظه در پاسخِ همان درخواست به کاربر نشان داده می‌شود؛
 *     فرستادنِ پوش یعنی کاربر دو بار یک چیز را می‌بیند. ولی ردیفِ اعلان
 *     ثبت می‌شود تا تاریخچه/زنگوله ناقص نماند.
 *
 * هیچ‌کدام از توابع این ماژول خطا پرتاب نمی‌کنند: اعلان یک کارِ جانبی
 * است و نباید ثبتِ کارت یا تأییدِ آن را بشکند (اگر دیتابیس یا فایربیس
 * خطا داد، فقط لاگ می‌شود).
 */

const { createNotification } = require('./notificationService');

const fmtPoints = (n) => Number(n || 0).toLocaleString('en-US');

/**
 * متنِ اعلانِ تأیید — تابعِ **خالص** (بدون دیتابیس و بدون ارسال).
 *
 * جدا شده تا آزمونِ `scripts/testCardDecisionNotify.js` بتواند دقیقاً
 * همان متنی را بسنجد که کاربر می‌بیند؛ اگر کسی فردا متن را عوض کند،
 * آزمون می‌شکند و متوجه می‌شویم — نه اینکه کاربرِ اندروید یک چیز و
 * کاربرِ وب چیزِ دیگری ببیند.
 */
function buildApprovedText({ cardTypeName, points } = {}) {
  const name = String(cardTypeName || '').trim();
  const pts = Number(points || 0);
  const head = name
    ? `کارت «${name}» به مجموعهٔ شما اضافه شد`
    : 'کارت شما به مجموعه‌تان اضافه شد';
  return {
    title: 'کارت شما تأیید شد',
    // «امتیاز» و نه «XP»: کارتِ عکس عمداً XPِ گذرِ نبرد نمی‌دهد
    // (توضیحِ کامل در مسیرِ تأییدِ مدیر). پس اعلان هم نباید XP وعده بدهد.
    body: head + (pts > 0 ? ` و ${fmtPoints(pts)} امتیاز گرفتید.` : '.'),
  };
}

/** متنِ اعلانِ رد — خالص. دلیلِ رد اگر از ادمین آمده باشد، همان می‌رود. */
function buildRejectedText({ reason } = {}) {
  const why = String(reason || '').trim();
  return {
    title: 'کارت شما تأیید نشد',
    body: why || 'عکس ارسالی با هیچ کارتی مطابقت نداشت. لطفاً عکسِ واضح‌تری بگیرید.',
  };
}

/**
 * کارت تأیید شد.
 * @param {string} userId
 * @param {{cardTypeName?: string, points?: number, push?: boolean}} [opts]
 */
async function cardApproved(userId, opts = {}) {
  if (!userId) return null;
  const { title, body } = buildApprovedText(opts);
  return notify(userId, title, body, opts.push);
}

/**
 * کارت رد شد.
 * @param {string} userId
 * @param {{reason?: string, push?: boolean}} [opts]
 */
async function cardRejected(userId, opts = {}) {
  if (!userId) return null;
  const { title, body } = buildRejectedText(opts);
  return notify(userId, title, body, opts.push);
}

async function notify(userId, title, body, push) {
  try {
    return await createNotification(userId, 'card', title, body, { push: push !== false });
  } catch (e) {
    console.warn('[cardNotify] ارسالِ اعلان ناموفق بود (نادیده):', e.message);
    return null;
  }
}

module.exports = { cardApproved, cardRejected, buildApprovedText, buildRejectedText };
