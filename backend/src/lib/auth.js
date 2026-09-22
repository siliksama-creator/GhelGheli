// ─────────────────────────────────────────────────────────────────────
// احرازِ هویت و توکن‌ها: signUser/signAdmin، epoch جلسه، auth/authOptional/adminAuth/requireRole —
// بیرون آمده از server.js (گامِ پایانیِ ماژولار شدن، مهر ۱۴۰۵). بدنهٔ تعریف‌ها
// مو به مو همان است؛ وابستگی‌ها تزریق می‌شوند و server.js همان نام‌ها را
// در همان جای قبلی destruct می‌کند تا هیچ ارجاعِ پایین‌دستی تغییر نکند.
// ─────────────────────────────────────────────────────────────────────
module.exports = ({
  JWT_SECRET, _anonymousNickname, _faDigits, _isValidPasswordLength,
  _normalizeMobile, jwt, pool,
}) => {
// ═══════════════════════════════════════════════════════════════════════════
// جلسهٔ کاربر «تمام نمی‌شود» (خواستهٔ مالک، ۲۶ شهریور)
// ═══════════════════════════════════════════════════════════════════════════
//
// قبلاً: توکنِ کاربر ۳۰ روزه بود و بعد از آن کاربر باید دوباره شماره و کد
// را وارد می‌کرد. مالک گفت: «وقتی ورودِ موفق داشتند، جلسه‌شان برای همیشه
// فعال بماند» — پس عمرِ توکن به ۱۰ سال رفت که عملاً «همیشه» است (هر اپِ
// زنده‌ای بیش از ۱۰ سال بدونِ آپدیت نمی‌ماند) و با JWT_EXPIRES_IN قابلِ
// تنظیم است.
//
// ⚠️ توکنِ طولانی بدونِ «کلیدِ خاموش‌کردن» یک قرضِ امنیتی است. آن کلید
//    ستونِ `users.session_epoch` است (migration 092) که به‌شکلِ claimِ `tv`
//    داخلِ توکن می‌رود و در auth/authOptional/سوکت بررسی می‌شود. هر تغییرِ
//    رمز عدد را بالا می‌برد ⇒ همهٔ توکن‌های قبلی همان لحظه بی‌اعتبار.
//
// توکنِ **ادمین** عمداً ۱۲ ساعته ماند: پنلِ مدیریت دسترسیِ پول و کاربران را
// دارد و اگر گوشیِ یک ادمین گم شود، جلسهٔ همیشه‌به‌همراهش فاجعه است.
const USER_TOKEN_TTL = process.env.JWT_EXPIRES_IN || '3650d';
// ⚠️ هشدارِ راه‌اندازی — این یکی از تله‌های واقعیِ همین تغییر بود: کدِ پیش‌فرض
// ۱۰ سال است، ولی `.env` سرور `JWT_EXPIRES_IN=30d` داشت و بی‌صدا خواستهٔ مالک
// («همیشگی») را بی‌اثر می‌کرد؛ فقط چون هنگامِ تست، عمرِ توکن را از خودِ پاسخِ
// ورود اندازه گرفتیم معلوم شد. پس اگر مقدارِ env کوتاه باشد، همین اولِ کار
// در لاگ اعلام می‌شود تا دوباره پنهان نماند.
(() => {
  const ttl = String(process.env.JWT_EXPIRES_IN || '').trim();
  if (!ttl) return; // خالی ⇒ پیش‌فرضِ خودمان ۱۰ سال است، حرفی نیست
  const asYears = /^(\d+)\s*y$/i.exec(ttl);
  const asDays = /^(\d+)\s*d$/i.exec(ttl);
  const longEnough = (!!asYears && Number(asYears[1]) >= 1) || (!!asDays && Number(asDays[1]) >= 365);
  if (!longEnough) {
    console.warn(`[auth] هشدار: JWT_EXPIRES_IN=${ttl} → جلسهٔ کاربران کوتاه است (خواستهٔ مالک: همیشگی). مقدارِ درست: 3650d`);
  }
})();
const signUser = user => jwt.sign(
  { sub: user.id, type: 'user', tv: Number(user.session_epoch || 0) },
  JWT_SECRET,
  { expiresIn: USER_TOKEN_TTL },
);
/**
 * توکنی که همین حالا در دستِ کاربر است با نسخهٔ جلسهٔ فعلیِ حسابش می‌خواند؟
 *
 * چرا تابعِ جدا: این بررسی در چهار جا لازم است (auth، authOptional، سوکت و
 * تست). چهار کپیِ دستی یعنی روزی یکی‌شان جا می‌ماند و «خاموش‌کردنِ جلسه»
 * بی‌صدا از کار می‌افتد.
 *
 * توکنِ بدونِ `tv` (صادرشده قبل از این تغییر) عمداً ۰ حساب می‌شود تا
 * کاربرانِ واردشدهٔ فعلی یک‌باره از حسابشان پرت نشوند.
 */
function sessionEpochMatches(payload, userRow) {
  return Number(payload?.tv || 0) === Number(userRow?.session_epoch || 0);
}
const signAdmin = admin => jwt.sign({ sub: admin.id, type: 'admin', role: admin.role }, JWT_SECRET, { expiresIn: '12h' });
/**
 * شمارهٔ موبایل / نام کاربری را به شکل متعارف در می‌آورد.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * چرا این تابع فراتر از «حذف فاصله» است — باگ واقعیِ «نمی‌توانم وارد شوم»
 * ═══════════════════════════════════════════════════════════════════════
 *
 * نسخهٔ قبلی فقط این بود:
 *
 *     String(m || '').replace(/\s+/g, '').trim()
 *
 * یعنی ارقام **فارسی** دست‌نخورده می‌ماندند. صفحه‌کلید فارسی اندروید
 * (و کیبورد گوگل در حالت فارسی) به‌طور پیش‌فرض «۰۹۱۲…» تایپ می‌کند، نه
 * «0912…». آن رشته با ردیفِ دیتابیس — که با ارقام لاتین ذخیره شده —
 * برابر نمی‌شد، پس کوئری هیچ کاربری پیدا نمی‌کرد و سرور جواب می‌داد:
 *
 *     ۴۰۱ «شماره موبایل یا رمز عبور نادرست است»
 *
 * پیامی که دروغ است: رمز درست بود. کاربر رمزش را عوض می‌کرد، دوباره
 * تلاش می‌کرد، و باز همان پیام — چون مشکل هیچ ربطی به رمز نداشت.
 * روی سرور زنده ثابت شد: ثبت‌نام با ارقام لاتین ✅ ۲۰۰، ورود با همان
 * شماره به ارقام فارسی ❌ ۴۰۱.
 *
 * سه شکلِ دیگر هم که کاربر واقعی تایپ می‌کند و قبلاً رد می‌شد:
 *   • «+۹۸912…» یا «0098912…» → به «0912…»
 *   • «0912-345-6789» و «(0912) 345» → جداکننده‌ها حذف می‌شوند
 *   • «۰۹۱۲…» با ارقام عربیِ هندی (U+0660) که برخی کیبوردها می‌فرستند
 *
 * امنیت: این تابع در هر دو سمتِ ثبت‌نام و ورود صدا زده می‌شود، پس یک
 * شماره همیشه به یک ردیف می‌رسد و «حساب سایه» (دو کاربر با یک شماره در
 * دو شکلِ نگارشی) ساخته نمی‌شود.
 *
 * سازگاری با گذشته: نام‌های کاربری غیرعددی (مثل `Admin` یا حساب‌های
 * تستِ `cl…`) هیچ رقمی ندارند، پس دست‌نخورده عبور می‌کنند. هر ۳۹ ردیف
 * موجودِ دیتابیس پیش از این تغییر بررسی شد: همه لاتین‌اند، پس هیچ‌کس
 * قفل نمی‌شود.
 */
// ── pure helpers extracted → backend/src/lib/auth-helpers.js (single source) ──
// wrapperها برای سازگاریِ فراخوانی‌های موجود در همین فایل
function normalizeMobile(m) { return _normalizeMobile(m); }
function faDigits(n) { return _faDigits(n); }
function anonymousNickname() { return _anonymousNickname(); }
function isValidPasswordLength(pw) { return _isValidPasswordLength(pw); }
async function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== 'user') throw new Error('bad token');
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [payload.sub]);
    if (!rows[0] || rows[0].status !== 'active') return res.status(401).json({ message: 'کاربر فعال نیست' });
    // توکنِ صادرشدهٔ قبل از آخرین تغییرِ رمز، مرده است.
    if (!sessionEpochMatches(payload, rows[0])) return res.status(401).json({ message: 'نیاز به ورود مجدد دارید' });
    req.user = rows[0]; next();
  } catch { res.status(401).json({ message: 'نیاز به ورود مجدد دارید' }); }
}
// احرازِ اختیاری: توکنِ معتبر → req.user پر می‌شود؛ بدون توکن یا توکنِ
// نامعتبر → خطا نمی‌دهد و req.user خالی می‌ماند (مهمان). فقط برای مسیرهای
// عمومی‌ای استفاده می‌شود که هم کاربرِ واردشده و هم مهمان صدا می‌زنند —
// فعلاً تنها مصرف: گزارشِ کرش، تا خطای قبل‌ازورود هم گم نشود.
async function authOptional(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return next();
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== 'user') return next();
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [payload.sub]);
    if (rows[0] && rows[0].status === 'active' && sessionEpochMatches(payload, rows[0])) req.user = rows[0];
  } catch { /* مهمان فرض می‌کنیم */ }
  return next();
}
async function adminAuth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== 'admin') throw new Error('bad token');
    const { rows } = await pool.query('SELECT * FROM admin_users WHERE id=$1 AND is_active=true', [payload.sub]);
    if (!rows[0]) return res.status(401).json({ message: 'ادمین معتبر نیست' });
    req.admin = rows[0]; next();
  } catch { res.status(401).json({ message: 'ورود ادمین لازم است' }); }
}
function requireRole(...roles) { return (req, res, next) => req.admin?.role === 'super_admin' || roles.includes(req.admin?.role) ? next() : res.status(403).json({ message: 'دسترسی کافی نیست' }); }

  return {
  USER_TOKEN_TTL, signUser, sessionEpochMatches, signAdmin,
  normalizeMobile, faDigits, anonymousNickname, isValidPasswordLength,
  auth, authOptional, adminAuth, requireRole,
  };
};
