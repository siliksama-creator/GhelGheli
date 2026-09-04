// دسترسی‌ِ سمتِ کلاینت برای نقش‌های ادمین.
//
// ⚠️ این فقط برای **رابط کاربری** است (پنهان‌کردن صفحه/دکمه‌ای که سرور
// در هر صورت با ۴۰۳ رد می‌کند) — هرگز جایگزینِ `requireRole` بک‌اند نیست.
// منبعِ حقیقتِ دسترسی، بک‌اند است؛ اینجا فقط تجربهٔ کاربری است تا مدیرِ
// کم‌دسترش با دکمه‌هایی که «دسترسی کافی نیست» می‌دهند روبه‌رو نشود.
//
// نقش‌ها (هم‌تراز با backend/src/routes):
//   super_admin : همه‌چیز
//   support     : عملیات روزمره (کاربران، تیکت‌ها، محتوا، آمار)
//   observer    : فقط نگاه — داشبورد و تیکت‌ها

// صفحه‌هایی که نقشِ «ناظر» (observer) اجازهٔ دیدنشان دارد.
const OBSERVER_PAGES = new Set(['dashboard', 'support']);
// صفحه‌ای که فقط مدیرکل می‌بیند (مدیریت ادمین‌ها و کارنامهٔ ممیزی در
// بک‌اند تماماً super_admin-only است).
const SUPER_ONLY_PAGES = new Set(['admins']);

/** آیا این نقش اجازهٔ دیدنِ این صفحه (کلید NAV) را دارد؟ */
export function canSeePage(role, pageKey) {
  if (role === 'super_admin') return true;
  if (role === 'observer') return OBSERVER_PAGES.has(pageKey);
  // support: همهٔ صفحات به‌جز صفحه‌های مدیرکل.
  return !SUPER_ONLY_PAGES.has(pageKey);
}

/** آیا این نقش اجازهٔ کنش‌های «فقط مدیرکل» (واریز/کسر پول، امتیاز دستی) را دارد؟ */
export function isSuperAdmin(role) { return role === 'super_admin'; }
