// ============================================================================
//  نگه‌داریِ چت — فقط ۵۰ پیامِ آخر
// ============================================================================
//
// ── خواستهٔ مالک ──
//
//   «بیشتر از ۵۰ چتِ آخری که انجام شده ذخیره نشود — پیام‌ها آماده‌اند و
//    اصلاً مهم نیست.»
//
// یعنی سقف **سراسری** است، نه به‌ازای هر کاربر: کلِ جدول ۵۰ ردیف.
//
// ── چرا این جدول اصلاً محافظ لازم داشت ──
//
// `chat_messages` تنها جدولِ پررشدِ سیستم بود که هیچ سقفی نداشت. بقیه
// همه محافظ دارند (`tap_nonces` ساعتی، `card_duel_battles` دوهفته‌ای).
// چت جا مانده بود و برای همیشه رشد می‌کرد.
//
// ── چرا «تنبل» و نه کرون ──
//
// پاک‌سازی دقیقاً بعد از درجِ پیامِ جدید معنا دارد، چون تنها لحظه‌ای
// است که تعداد می‌تواند از ۲۰۰ رد شود. کرونِ ساعتی یعنی جدول تا یک
// ساعت می‌تواند متورم بماند و بی‌دلیل روی جدولِ بدونِ تغییر کار کند.
//
// ولی هر درج هم نباید یک DELETE بزند: با ۲۰۰ پیام در جدول، درجِ پیامِ
// ۲۰۱ ام یعنی حذفِ یک ردیف — کوئریِ اضافه روی هر پیام. پس یک شمارندهٔ
// درون‌حافظه‌ای نگه می‌داریم و فقط هر `PRUNE_EVERY` پیام یک‌بار پاک‌سازی
// می‌کنیم. سقف در عمل `200 + PRUNE_EVERY` می‌شود که کاملاً بی‌ضرر است.

const { pool } = require('../config/db');
const opsLimits = require('./opsLimits');

/** سقفِ سراسریِ پیام‌های نگه‌داشته‌شده — از پنل ادمین قابل تنظیم است
 *  (پیش‌فرض ۲۰۰، همان ثابتِ قبلی کد). */
function keepLimit() {
  return opsLimits.get().chatKeepLimit;
}

/**
 * هر چند پیام یک‌بار پاک‌سازی اجرا شود.
 *
 * ۱ یعنی دقیق ولی پرهزینه؛ ۲۵ یعنی جدول حداکثر ۲۲۵ ردیف می‌شود و
 * هزینهٔ DELETE روی ۴٪ از درج‌ها پخش می‌شود.
 */
const PRUNE_EVERY = 25;

let sinceLastPrune = 0;

/**
 * پیام‌های کهنه را حذف می‌کند و فقط `CHAT_KEEP_LIMIT` تای آخر را نگه می‌دارد.
 *
 * ── ایمنیِ حذفِ فیزیکی (بررسی‌شده روی اسکیمای واقعی، نه از حافظه) ──
 *
 *   • `chat_message_likes.message_id` → ON DELETE CASCADE
 *        لایک‌های پیامِ حذف‌شده هم می‌روند. درست است: پیامی نیست که
 *        لایکش معنا داشته باشد.
 *
 *   • `chat_messages.reply_to_message_id` → ON DELETE SET NULL
 *        پیامِ تازه‌ای که به پیامِ حذف‌شده ریپلای کرده بود **حذف
 *        نمی‌شود**؛ فقط نقلِ‌قولش خالی می‌شود. اگر این کلید CASCADE بود،
 *        حذفِ یک پیامِ قدیمی می‌توانست زنجیره‌ای پیام‌های جدید را هم
 *        ببرد — که فاجعه بود. بررسی شد و CASCADE نیست.
 *
 * @param {object} [client] کلاینت pg (برای تست یا تراکنش)
 * @returns {Promise<number>} تعداد ردیف‌های حذف‌شده
 */
async function pruneChatHistory(client = pool) {
  // حذف بر اساس «مرزِ» ۵۰امین پیامِ تازه، نه OFFSET روی کلِ مرتب‌شده.
  //
  // نسخهٔ قبلی `DELETE ... WHERE id IN (SELECT ... ORDER BY ... OFFSET $1)`
  // بود؛ OFFSET در Postgres ردیف‌های قبل را هم می‌خواند و روی جدولِ بزرگ
  // یک مرتب‌سازیِ کامل می‌سازد. اینجا اول مرزِ (sent_at,id) پیامِ پنجاهم را
  // پیدا می‌کنیم و فقط چیزهای کهنه‌تر را حذف می‌کنیم — هر دو شرط از
  // ایندکسِ (sent_at DESC) و کلید اولیه استفاده می‌کنند.
  //
  // ⚠️ مقایسهٔ ردیفی روی NULL درست کار می‌کند، ولی sent_at طبق اسکیما NOT
  //    NULL است و id هم UUID پر است؛ کوئری با NULL هم امن است.
  const { rowCount } = await client.query(
    `DELETE FROM chat_messages m
      WHERE (m.sent_at, m.id) < (
        SELECT c.sent_at, c.id
          FROM chat_messages c
         ORDER BY c.sent_at DESC, c.id DESC
         LIMIT 1 OFFSET $1
      )`,
    [keepLimit()],
  );
  return rowCount;
}

/**
 * بعد از هر درجِ پیام صدا زده می‌شود. خودش تصمیم می‌گیرد که آیا وقتِ
 * پاک‌سازی هست یا نه.
 *
 * ⚠️ هرگز throw نمی‌کند: شکستِ پاک‌سازی نباید باعث شود پیامی که با
 *    موفقیت ثبت شده به کاربر خطا برگرداند. پیام مهم‌تر از تمیزیِ جدول
 *    است و دفعهٔ بعد دوباره تلاش می‌شود.
 *
 * @param {object} [client]
 * @returns {Promise<number>} تعداد حذف‌شده (۰ اگر این بار نوبتش نبود)
 */
async function onMessageInserted(client = pool) {
  sinceLastPrune += 1;
  if (sinceLastPrune < PRUNE_EVERY) return 0;
  sinceLastPrune = 0;
  try {
    return await pruneChatHistory(client);
  } catch (e) {
    console.error('[chat] prune failed:', e.message);
    return 0;
  }
}

/** فقط برای تست — شمارنده را صفر می‌کند. */
function _resetCounter() {
  sinceLastPrune = 0;
}

/** فقط برای تست — شمارندهٔ فعلی. */
function _counter() {
  return sinceLastPrune;
}

module.exports = {
  keepLimit,
  PRUNE_EVERY,
  pruneChatHistory,
  onMessageInserted,
  _resetCounter,
  _counter,
};
