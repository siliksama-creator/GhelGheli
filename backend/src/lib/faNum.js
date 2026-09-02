/**
 * فارسی‌سازیِ عددها در متنِ رو به کاربر.
 *
 * چرا لازم شد: پیام‌هایی مثل «تیم باید دقیقاً 5 کارت داشته باشد» یا
 * «ورودی مسابقه 1000 امتیازی» با رقمِ لاتین ساخته می‌شدند و وسطِ رابطِ
 * تماماً فارسی می‌نشستند. وب برای دادهٔ عددی `fa()` خودش را دارد، ولی
 * این رشته‌ها در بک‌اند ساخته و همان‌طور نمایش داده می‌شوند، پس سمتِ
 * کلاینت قابلِ اصلاح نیستند.
 *
 * عمداً فقط رقم را ترجمه می‌کند: جداکنندهٔ هزارگان کارِ `faAmount` است،
 * چون همه‌جا مطلوب نیست (شناسهٔ سفارش و کدِ پیگیری نباید کاما بگیرند).
 */

const DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** رقم‌های لاتینِ داخلِ یک رشته را به فارسی برمی‌گرداند. */
function faDigits(input) {
  return String(input ?? '').replace(/[0-9]/g, d => DIGITS[Number(d)]);
}

/** عدد را با جداکنندهٔ هزارگانِ فارسی برمی‌گرداند: 12500 ⇒ «۱۲٬۵۰۰». */
function faAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return faDigits(value);
  return n.toLocaleString('fa-IR', { useGrouping: true, maximumFractionDigits: 0 });
}

/** رقم فارسی/عربی را لاتین می‌کند تا Number/parseInt روی ورودی ادمین کار کند. */
function toLatinDigits(input) {
  return String(input ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/**
 * پارس امن عدد از ورودی فرم (لاتین یا فارسی، با کاما/فاصله).
 * خالی → NaN (فراخوان با fallback خودش تصمیم می‌گیرد).
 */
function parseFaNumber(input) {
  if (input == null || input === '') return NaN;
  if (typeof input === 'number') return Number.isFinite(input) ? input : NaN;
  const cleaned = toLatinDigits(input)
    .replace(/[٬,\s]/g, '')
    .replace(/[^\d.eE+-]/g, '');
  if (!cleaned) return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

module.exports = { faDigits, faAmount, toLatinDigits, parseFaNumber };
