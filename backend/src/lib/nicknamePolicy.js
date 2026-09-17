'use strict';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  قانونِ نامِ مستعار — حداکثر ۸ نویسه، بدونِ فحش، بدونِ جعلِ هویت
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── خواستهٔ مالک (۱۷ شهریور) ──────────────────────────────────────────────
 *
 * «در قسمتِ نامِ مستعار که در پروفایل تنظیم می‌شود و در چت و بازی‌ها نشان
 * داده می‌شود باید تا ۸ حرف نهایت، شاملِ حرف و عدد و تمامی کاراکترهای
 * خاص باشد. باید یک لیست از کلماتِ فارسی و انگلیسیِ رکیک جمع‌آوری کنی که
 * اگر کاربر آن‌ها را انتخاب کرد، به کاربر بگوید انتخابِ این نام موردِ قبول
 * نیست.»
 *
 * ── چهار قاعده ───────────────────────────────────────────────────────────
 *
 *  ۱. **حداکثر ۸ نویسه.** بریدنِ خودکار غلط است (کاربر نمی‌فهمد چرا نامش
 *     نصف شد)؛ اگر بلندتر بود، خطا برمی‌گردانیم.
 *  ۲. **حرف و عدد و کاراکترهای خاصِ بی‌خطر.** فاصله و نویسه‌های کنترلی
 *     ممنوع‌اند (نامِ چندتکه در چت/جدول را خراب می‌کند) و همچنین
 *     نویسه‌های «کنترلِ جهت» (RLO/LRO/…): با آن‌ها می‌شود نامِ کسی را
 *     وارونه/جعل‌شده نشان داد — یک حملهٔ جعلِ هویت در چت، نه سلیقه.
 *  ۳. **بدونِ فحش.** فهرستِ فارسی + انگلیسی. مقایسه روی متنِ **نرمال‌شده**
 *     انجام می‌شود (حذفِ اعراب، یکسان‌سازیِ ی/ک عربی، حذفِ نقطه‌گذاری و
 *     فاصله، فشرده‌کردنِ حرفِ تکراری و ساده‌سازیِ لیت) تا
 *     «ک.ی.ر» یا «kiirrr» یا «K1R» از فیلتر رد نشوند.
 *  ۴. **بدونِ جعلِ هویتِ برند/مدیریت.** «admin»، «گلقلی»، «پشتیبانی»…
 *     رزرو شده‌اند تا کاربری خودش را مدیر جا نزند.
 *
 * خروجیِ همیشه یک شکل دارد: `{ ok, value, error }` — کلاینت‌ها (وب و
 * اندروید) همان `error` را نشان می‌دهند، پس پیام یک‌جا نوشته شده.
 */
const MAX_LEN = 8;

/** کاراکترهای مجاز: حروفِ فارسی/عربی/لاتین، ارقامِ هر دو، و نشانه‌های بی‌خطر. */
const ALLOWED = /^[\u0600-\u06FF\u0750-\u077Fa-zA-Z0-9_\-.!?#@$%&*+=~^|/\\()[\]{}<>:;,'"`\u200c]+$/;

/** نویسه‌های کنترلیِ جهت — جعلِ نمایشِ نام. */
const BIDI_CONTROL = /[\u202a-\u202e\u2066-\u2069\u200e\u200f]/;

/** نام‌هایی که کاربر نباید بگیرد (جعلِ هویتِ مدیریت/برند). */
const RESERVED = [
  'admin', 'administrator', 'moderator', 'mod', 'support', 'official',
  'ghelgheli', 'ghelghelishop', 'shop', 'owner', 'root', 'system',
  'مدیر', 'ادمین', 'پشتیبانی', 'قلقلی', 'گلقلی', 'مالک', 'رسمی',
];

/**
 * کلماتِ رکیک/فحش — فارسی و انگلیسی.
 *
 * نگه‌داری: هر کلمه در نرمال‌سازی به شکلِ پایه می‌رسد (`normalize()` را
 * ببینید). پس لازم نیست همهٔ املای جایگزین نوشته شود؛ «کصخل» و «ک س خ ل» و
 * «kosskhol» هر سه به یک ریسه می‌رسند. برای انگلیسی هم شکلِ لیت‌شده
 * (`@`، `0`، `1`) در نرمال‌سازی به حرف برمی‌گردد.
 *
 * ⚠️ این فهرست «کامل» نیست و نباید باشد: فحش بی‌پایان است. اینجا پرکاربردترین
 *    توهین‌ها و واژه‌های جنسیِ فارسی و انگلیسی جمع شده؛ ادمین می‌تواند از
 *    پنل، کلمهٔ تازه به فهرستِ فیلترِ چت اضافه کند (`chat_bad_words`).
 */
const BAD_WORDS = [
  // ── فارسی: واژه‌های جنسی و توهین‌های سنگین ──
  'کیر', 'کیرم', 'کیرمک', 'کیری', 'کص', 'کصم', 'کصکش', 'کصخل', 'کصلیس',
  'کسکش', 'کون', 'کونی', 'کونکش', 'کونلق', 'گاییدن', 'گاییدم', 'گایید',
  'گوز', 'گوزو', 'لاپایی', 'لاپاشیری', 'سکس', 'سکسی', 'پورن', 'پورنو',
  'جنده', 'جندهکش', 'جاکش', 'جاکشی', 'خرابه', 'قحبه', 'قحبهزاده',
  'مادرجنده', 'مادرقحبه', 'مادرسگ', 'خواهرجنده', 'ننهجنده', 'ننهکصه',
  'حرومی', 'حرومزاده', 'حروم', 'بیغیرت', 'بیقید', 'دیوث', 'دیوثی',
  'بیا اینجا', 'شهوت', 'شهوانی', 'لخت', 'لختی', 'برهنه',
  // ── فارسی: توهین و تحقیر ──
  'احمق', 'خرفت', 'خرف', 'کودن', 'نفهم', 'نادان', 'جاهل', 'دلقک',
  'لاشی', 'لاشخور', 'پفیوز', 'پفوز', 'کمقهبه', 'بیشعور', 'بیشرف',
  'پدرصگ', 'پدرصفت', 'پدرتو', 'آشغال', 'اشغال', 'کثافت', 'کسافت',
  'خوک', 'خوکی', 'سگمادر', 'سگپدر', 'سگبچه', 'سگی', 'الاغ', 'گاوان',
  'زباله', 'چرتی', 'اویز', 'مزخرف', 'پدرسوخته', 'کلهخر', 'کلهپوک',
  'مردار', 'کثیف', 'چلاق', 'کسشر', 'شرشر', 'تخمیت', 'تخمش',
  // ── انگلیسی‌نویسی (فینگلیش) همان واژه‌های فارسی ──
  // چرا لازم است: کاربر «k1r» یا «koskhol» می‌نویسد، نه «کیر». بدونِ این
  // خط‌ها، فیلترِ فارسی با یک تایپِ لاتین دور زده می‌شد.
  'kir', 'kiri', 'kirrr', 'kos', 'koss', 'koskhol', 'koskesh', 'koslis',
  'kon', 'koon', 'kooni', 'kuni', 'kuni', 'gaid', 'gaeid', 'gayid', 'gayeed',
  'gooz', 'goozo', 'jende', 'jendi', 'jakesh', 'jakeshi', 'qahbe', 'ghahbe',
  'madarjende', 'nanekos', 'nanekose', 'haroomi', 'haroom', 'haroomzade',
  'dayoos', 'dayus', 'lashkhor', 'pofia', 'lashi', 'kosekesh', 'seks', 'sexy',
  'porn', 'looty', 'looty', 'biar', 'naneh', 'pedar',
  // ── انگلیسی: رکیک ──
  'fuck', 'fucker', 'fucking', 'fuk', 'fck', 'shit', 'shitty', 'bullshit',
  'bitch', 'bitchy', 'bastard', 'asshole', 'arsehole', 'ass', 'arse',
  'cunt', 'dick', 'dickhead', 'cock', 'pussy', 'whore', 'slut', 'skank',
  'motherfucker', 'mf', 'nigga', 'nigger', 'faggot', 'fag', 'retard',
  'porn', 'porno', 'sex', 'sexy', 'nude', 'nudes', 'boobs', 'tits',
  'rape', 'rapist', 'wanker', 'prick', 'twat', 'damn', 'crap',
  'idiot', 'moron', 'stupid', 'dumbass', 'loser', 'scumbag', 'trash',
  // ── انگلیسی: دشنام‌های مذهبی/نژادیِ رایج که در چتِ عمومی آزار می‌دهند ──
  'kike', 'spic', 'chink', 'raghead', 'terrorist',
];

/**
 * نرمال‌سازی برای مقایسه:
 *   • اعراب و کشیده و نویسه‌های نامرئی حذف؛
 *   • ی/ک عربی و اعدادِ فارسی/عربی به شکلِ لاتین؛
 *   • لیت (`@4$01`) به حرف؛
 *   • فاصله/نقطه‌گذاری حذف (تا «ک.ی.ر» لو برود)؛
 *   • حرفِ تکراریِ پشتِ‌سر‌هم به یکی («kkkir» → «kir»).
 */
function normalize(input) {
  let s = String(input ?? '').toLowerCase();
  s = s.normalize('NFKC');
  s = s.replace(/[\u064b-\u0652\u0640\u200c\u200d\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');
  s = s.replace(/[ي]/g, 'ی').replace(/[ك]/g, 'ک').replace(/[أإآا]/g, 'ا')
    .replace(/[ؤو]/g, 'و').replace(/[ئى]/g, 'ی').replace(/[ةه]/g, 'ه');
  s = s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  // لیت: شکل‌های رایجِ دورزدنِ فیلتر
  s = s.replace(/[@4]/g, 'a').replace(/[3]/g, 'e')
    .replace(/[1!|]/g, 'i').replace(/[0]/g, 'o')
    .replace(/[5$]/g, 's').replace(/[7]/g, 't').replace(/[8]/g, 'b')
    .replace(/[9]/g, 'g').replace(/[+]/g, 't');
  // همه‌چیز جز حرف/عدد برود (فاصله، نقطه، زیرخط، ایموجی…)
  s = s.replace(/[^\p{L}\p{N}]/gu, '');
  // حرفِ تکراریِ پشتِ‌سر‌هم → یکی
  s = s.replace(/(.)\1+/g, '$1');
  return s;
}

/**
 * فهرستِ نرمال‌شده — یک‌بار در بوت، نه در هر درخواست.
 *
 * ── چرا دو فهرست ─────────────────────────────────────────────────────────
 *
 * بعد از نرمال‌سازی، فاصله و نقطه‌گذاری حذف می‌شوند؛ پس مرزِ کلمه از بین
 * می‌رود و «زیررشته» تنها راهِ گرفتنِ «ک.ی.ر» است. ولی برای واژه‌های
 * لاتینِ کوتاه، زیررشته خطرِ ردکردنِ نامِ سالم دارد (مثلاً «Kira»).
 *
 * قاعده:
 *   • **بلند (۵ نویسه و بیشتر)** → زیررشته. «koskholi» هم می‌افتد.
 *   • **کوتاه (۴ نویسه و کمتر)** → تساویِ کامل. پس «k1r» می‌افتد ولی
 *     «Kira» نه.
 */
const NORMALIZED_BAD = BAD_WORDS.map(normalize).filter(w => w.length >= 2);
const NORMALIZED_BAD_SHORT = NORMALIZED_BAD.filter(w => w.length <= 4);
const NORMALIZED_BAD_LONG = NORMALIZED_BAD.filter(w => w.length >= 5);
const NORMALIZED_RESERVED = RESERVED.map(normalize);

/** آیا متن (نرمال‌شده) کلمهٔ رکیک دارد؟ */
function containsBadWord(normalized) {
  if (!normalized) return false;
  if (NORMALIZED_BAD_SHORT.includes(normalized)) return true;
  return NORMALIZED_BAD_LONG.some(w => normalized.includes(w));
}

function isReserved(normalized) {
  if (!normalized) return false;
  return NORMALIZED_RESERVED.some(w => normalized === w || normalized.startsWith(w));
}

/**
 * سنجش و پاک‌سازیِ نامِ مستعار.
 *
 * @param {*} raw ورودیِ خامِ کاربر
 * @param {{allowEmpty?: boolean}} [opts] `allowEmpty` برای وقتی که فیلد
 *        اختیاری است (کاربر نامش را عوض نمی‌کند).
 * @returns {{ok: boolean, value: string|null, error: string|null, code: string|null}}
 */
function validate(raw, { allowEmpty = true } = {}) {
  const value = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();

  if (!value) {
    return allowEmpty
      ? { ok: true, value: null, error: null, code: null }
      : { ok: false, value: null, error: 'نامِ مستعار نمی‌تواند خالی باشد', code: 'empty' };
  }
  if (BIDI_CONTROL.test(value)) {
    return { ok: false, value: null, error: 'این نام نویسه‌های نامرئی دارد و پذیرفته نمی‌شود', code: 'invisible' };
  }
  // شمارشِ نویسه‌ها بر اساسِ «نویسه» است نه بایت: ۸ حرفِ فارسی = ۸، نه ۱۶.
  const chars = Array.from(value);
  if (chars.length > MAX_LEN) {
    return {
      ok: false, value: null, code: 'too_long',
      error: `نامِ مستعار حداکثر ${MAX_LEN} نویسه می‌تواند باشد (الان ${chars.length} نویسه)`,
    };
  }
  if (!ALLOWED.test(value)) {
    return {
      ok: false, value: null, code: 'charset',
      error: 'در نامِ مستعار فقط حرف، عدد و کاراکترهای ساده مجاز است (بدونِ فاصله)',
    };
  }
  const norm = normalize(value);
  if (containsBadWord(norm)) {
    return {
      ok: false, value: null, code: 'profanity',
      error: 'انتخابِ این نام موردِ قبول نیست — لطفاً نامِ دیگری انتخاب کنید',
    };
  }
  if (isReserved(norm)) {
    return {
      ok: false, value: null, code: 'reserved',
      error: 'این نام متعلق به مدیریتِ برنامه است؛ نامِ دیگری انتخاب کنید',
    };
  }
  return { ok: true, value, error: null, code: null };
}

module.exports = { MAX_LEN, validate, normalize, containsBadWord, isReserved, BAD_WORDS, RESERVED };
