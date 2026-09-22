// ─────────────────────────────────────────────────────────────────────
// محدودکننده‌های نرخ: opsRateLimit پویا و همهٔ limiterهای ثبت‌نام/ورود/چت/بازی/پول/آپلود —
// بیرون آمده از server.js (گامِ پایانیِ ماژولار شدن، مهر ۱۴۰۵). بدنهٔ تعریف‌ها
// مو به مو همان است؛ وابستگی‌ها تزریق می‌شوند و server.js همان نام‌ها را
// در همان جای قبلی destruct می‌کند تا هیچ ارجاعِ پایین‌دستی تغییر نکند.
// ─────────────────────────────────────────────────────────────────────
module.exports = ({
  makeRateStore, normalizeMobile, opsLimits, rateLimit,
  rlStore,
}) => {
// ═══════════════════════════════════════════════════════════════════════════
// کلیدِ محدودکنندهٔ نرخ برای مسیرهای «بعد از ورود»
// ═══════════════════════════════════════════════════════════════════════════
//
// چرا این تابع وجود دارد و چرا اینجا (بالای همهٔ limiterها) تعریف شده:
//
// پیش‌فرضِ express-rate-limit کلید را از `req.ip` می‌سازد. برای مسیرهای
// عمومی (ورود، OTP) درست است — آنجا هنوز نمی‌دانیم کاربر کیست.
//
// ولی برای مسیری که **پشتِ `auth` است** فاجعه است. در ایران بخش بزرگی از
// ترافیک موبایل پشت CGNAT است: صدها مشترکِ همراه‌اول از یک IP بیرون
// می‌آیند. یک IP یعنی یک سطل. پس:
//
//   • یک نفر که ۲۰ بار کارت ثبت می‌کند، سهمیهٔ صدها نفرِ دیگر را می‌سوزاند.
//   • همان نفر اگر بخواهد سوءاستفاده کند، با عوض کردن IP (روشن/خاموش کردن
//     دیتا) سطلِ تازه می‌گیرد — یعنی محدودیت او را نمی‌گیرد ولی
//     بی‌گناه‌ها را می‌گیرد. دقیقاً برعکسِ هدف.
//
// این باگ در تستِ واقعی دیده شد: سناریوی «۴ درخواست هم‌زمان» هر بار
// ۴۲۹ می‌گرفت و اصلاً به منطقِ برنامه نمی‌رسید، چون سطلِ IP از تست‌های
// قبلی پر مانده بود.
//
// `req.user?.id || req.ip` : اگر به هر دلیلی احراز هویت انجام نشده باشد
// (مثلاً limiter اشتباهاً قبل از `auth` سوار شود) به رفتار قبلی برمی‌گردیم
// نه به «بدون محدودیت».
const perUserKey = (req) => req.user?.id || req.ip;

// ── محدودکننده‌های قابل تنظیم از پنل ─────────────────────────────────────
// پنج سقفِ غیرامنیتی (چت، ضربه‌زن، دوئل، برداشت، گردونه) از ops_limits
// خوانده می‌شوند. هر ذخیره در پنل، instance تازه می‌سازد و از همان لحظه
// اعمال می‌شود. گاردهای امنیتی (OTP، ورودها) عمداً ثابت‌اند — بالای
// opsLimits.js توضیح داده شده چرا.
function opsRateLimit(name, defaults, extra = {}) {
  // ⚠️ Store یک‌بار و ثابت برای طول عمرِ این limiter ساخته می‌شود.
  // این limiterها «reloadِ زنده» دارند: وقتی ادمین تنظیماتِ عملیات را
  // ذخیره می‌کند، build() دوباره اجرا می‌شود تا windowMs/limit تازه اعمال
  // شود. اگر در هر reload یک Store تازه می‌ساختیم:
  //   • روی Redis: نمونهٔ دومِ RateLimit با prefix مشابه، با اعتبارسنجیِ
  //     unsharedStore express-rate-limit درمی‌افتاد و ذخیرهٔ تنظیماتِ
  //     پنل را ۵۰۰ می‌کرد (ERR_ERL_STORE_REUSE)؛
  //   • روی حافظه: هر reload شمارنده‌ها را صفر می‌کرد و سقف را دور می‌زد.
  // پس Store ثابت نگه داشته می‌شود و فقط پنجره/سقفِ میدل‌ور نوسازی می‌شود.
  const store = makeRateStore(`ops:${name}`);
  const build = () => {
    const rl = opsLimits.get().rateLimits[name] || defaults;
    return rateLimit({
      windowMs: rl.windowMs,
      limit: rl.limit,
      standardHeaders: true,
      legacyHeaders: false,
      // نمونهٔ Storeِ اختصاصی و ثابتِ همین limiter (شمارنده‌ها در Redis بینِ
      // دو پروسه مشترک‌اند، ولی یک‌بار ساخته می‌شوند تا reload سالم بماند).
      ...(store ? { store } : {}),
      // ⚠️ این یک limiterِ «بازسازنده» است: هر ذخیرهٔ تنظیماتِ پنل پنجره/سقف
      // را با build() نوسازی می‌کند و همان Storeِ ثابت را به نمونهٔ تازهٔ
      // میدل‌ور می‌دهد. اعتبارسنجیِ unsharedStore express-rate-limit این
      // «استفادهٔ مجددِ عمدی از همان Store برای همان limiter» را اشتباهاً با
      // ERR_ERL_STORE_REUSE می‌گیرد و ذخیره را ۵۰۰ می‌کند. اینجا بازسازی در
      // همین خط کنترل می‌شود (همان نمونه، همان prefix یکتا)، پس فقط همین یک
      // قاعده را خاموش می‌کنیم؛ بقیهٔ اعتبارسنجی‌ها فعال می‌مانند.
      validate: { unsharedStore: false },
      ...extra,
    });
  };
  const api = {
    mw: null,
    reload: () => { api.mw = build(); },
  };
  api.mw = build();
  return api;
}

// همهٔ limiterهای زیر روی مسیرهای احراز هویت‌شده‌اند، پس همه `perUserKey`
// می‌گیرند. (فهرست کامل در تستِ testRateLimit.js نگهبانی می‌شود.)
const chatLimiter = opsRateLimit('chat', { windowMs: 60_000, limit: 20 }, { keyGenerator: perUserKey });
// ── سقفِ درخواستِ کدِ پیامکی — دو لایه (خواستهٔ مالک، ۲۶ شهریور) ─────────
//
// مالک خواست: «سقفِ سختِ ورود/درخواستِ کد پیامکی، ولی با شمارش روی
// **شمارهٔ خودِ کاربر**، نه آی‌پی — مثلِ ۵ کد در ۱۰ دقیقه. جلوی حدس‌زدنِ رمز
// و اسپمِ پیامک را می‌گیرد و برای کاربرانِ اپراتوری (که یک آی‌پیِ مشترکِ
// CGNAT دارند) مزاحم نیست.»
//
// چرا دو لایه و نه یکی:
//
//   • **شماره** (`otpMobileLimiter`): سقفِ اصلیِ مالک — ۵ کد در ۱۰ دقیقه.
//     این همان چیزی است که «اسپمِ پیامک» و «تلاشِ پیاپی روی یک حساب» را
//     می‌بندد، و به آی‌پی کاری ندارد؛ پس هزار کاربرِ یک اپراتور که پشتِ یک
//     آی‌پی‌اند هم‌دیگر را قفل نمی‌کنند.
//   • **آی‌پی** (`otpLimiter`): از ۵ به ۳۰ در ۱۰ دقیقه **شل** شد. قبلاً خودِ
//     همین عددِ ۵ روی آی‌پی بود و کاربرانِ CGNAT را بی‌دلیل می‌بست (ششمین
//     نفر در یک شبکهٔ بزرگ باید ۱۰ دقیقه صبر می‌کرد). حالا نقشش فقط
//     «جلوگیری از پیمایشِ انبوهِ شماره‌ها از یک منبع» است — که ۳۰ کد در
//     ۱۰ دقیقه برایش کافی است و برای کاربرِ واقعی هرگز دیده نمی‌شود.
//   • **روزانه** (`otpDailyLimiter`): سقفِ ۲۰ کد در شبانه‌روز برای هر شماره —
//     بیمهٔ صورتحسابِ پیامک. بدونِ آن، سقفِ ۱۰دقیقه‌ای اجازهٔ ۷۲۰ پیامک در
//     روز به یک شماره می‌داد.
const otpLimiter = rateLimit({
  windowMs: 10 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, ...rlStore('otp'),
  message: { message: 'تعداد درخواست‌های کد از این اتصال زیاد بوده؛ چند دقیقه دیگر دوباره امتحان کنید' },
});
// کلیدِ این دو limiter **فقط شمارهٔ کاربر** است (به‌عمد بدونِ آی‌پی) — همان
// خواستهٔ مالک. `normalizeMobile` استفاده می‌شود تا «۰۹۱۲…» و «+۹۸۹۱۲…» یک
// کلید شوند وگرنه با تغییرِ قالبِ شماره، سقف دور زده می‌شد.
const otpMobileKey = (req) => `m:${normalizeMobile(req.body?.mobile) || 'none'}`;
const otpMobileLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  ...rlStore('otpmobile'),
  keyGenerator: otpMobileKey,
  message: { message: 'برای این شماره در ۱۰ دقیقهٔ گذشته چند کد درخواست شده؛ کمی بعد دوباره امتحان کنید' },
});
const otpDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  ...rlStore('otpdaily'),
  keyGenerator: otpMobileKey,
  message: { message: 'سقفِ پیامکِ امروزِ این شماره پر شده؛ فردا دوباره تلاش کنید' },
});
// Brute-force protection for the 6-digit OTP code itself. request-otp only
// throttled how many codes could be requested — verify-otp and the password
// reset endpoint (which also consumes an OTP) had NO limiter at all, so a
// 6-digit code (1,000,000 possibilities) could be brute-forced with plain
// unrestricted requests. Keyed by IP + mobile so one attacker can't lock out
// a victim's own number for legitimate attempts from other IPs.
const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  ...rlStore('otpverify'),
  keyGenerator: (req) => `${req.ip}:${normalizeMobile(req.body?.mobile)}`,
  message: { message: 'تعداد تلاش زیاد است؛ کمی بعد دوباره امتحان کنید' },
});
// Admin login had zero throttling; the panel has full access to user data,
// points and card codes, so brute-forcing the password had no cost at all.
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  ...rlStore('adminlogin'),
  keyGenerator: (req) => `${req.ip}:${String(req.body?.username || '').toLowerCase()}`,
  message: { message: 'تعداد تلاش ورود زیاد است؛ چند دقیقه دیگر دوباره امتحان کنید' },
});
// Same reasoning as adminLoginLimiter, but for regular user login.
const userLoginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  ...rlStore('userlogin'),
  keyGenerator: (req) => `${req.ip}:${normalizeMobile(req.body?.mobile)}`,
  message: { message: 'تعداد تلاش ورود زیاد است؛ چند دقیقه دیگر دوباره امتحان کنید' },
});
// ── سقفِ «خودِ حساب» برای حدسِ رمز (خواستهٔ مالک، ۲۶ شهریور) ─────────────
//
// `userLoginLimiter` بالا کلیدش «آی‌پی + شماره» است؛ یعنی مهاجمی که چند
// آی‌پی دارد می‌تواند روی **یک شماره** بی‌نهایت رمز امتحان کند. این یکی
// فقط به شماره نگاه می‌کند و سقفِ مستقلِ خودش را دارد: حتی با هزار آی‌پی،
// یک حساب در ۱۵ دقیقه بیش از ۱۵ تلاش نمی‌گیرد. کاربرِ واقعی که رمزش را
// اشتباه می‌زند هرگز به این سقف نمی‌رسد.
const userAccountLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  ...rlStore('useraccount'),
  keyGenerator: (req) => `m:${normalizeMobile(req.body?.mobile) || 'none'}`,
  message: { message: 'برای این شماره تلاش‌های ورود زیاد بوده؛ کمی بعد دوباره امتحان کنید' },
});
const loginStreakLimiter = rateLimit({
  windowMs: 60_000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  ...rlStore('loginstreak'),
  keyGenerator: perUserKey,
  message: { message: 'کمی صبر کن و دوباره تلاش کن' },
});

// Rate limit sized against the client's 8s flush cadence: ~7 legitimate
// batches per minute, so 20 leaves room for level-up flushes and a retry
// after a dropped connection while still stopping a request flood.
const tapBatchLimiter = opsRateLimit('tapBatch',
  { windowMs: 60_000, limit: 20 },
  {
    // Key on the user, not the IP: a whole school behind one NAT must not
    // share a bucket, and a single cheater must not escape by changing IP.
    keyGenerator: (req) => req.user?.id || req.ip,
    message: { message: 'تعداد درخواست‌ها زیاد است؛ کمی صبر کن' },
  });

// ── دوئل پنج‌کارتی زنده ──────────────────────────────────────────────────
// The REST surface prepares a user's authoritative deck and supports old
// clients' free bot practice. New bot/online/lobby matches all run through the
// shared Socket.IO engine and escrow used by the other competitive games.
const cardDuelLimiter = opsRateLimit('cardDuel',
  { windowMs: 60_000, limit: 24 },
  { keyGenerator: perUserKey, message: { message: 'تعداد دوئل زیاد است؛ کمی صبر کن' } });

// Self-service password change while logged in. Added alongside the
// register-password account-takeover fix: since real "forgot password" via
// SMS OTP isn't available yet, a logged-in user still needs *some* safe way
// to change their password — this requires proof of the current password,
// unlike the old register-password bug.
// ── چرا این مسیر limiterِ خودش را دارد ──
//
// قبلاً `userLoginLimiter` را قرض می‌گرفت. آن limiter کلیدش
// `${req.ip}:${normalizeMobile(req.body?.mobile)}` است — منطقی برای
// مسیرِ ورود، چون آنجا `mobile` در بدنه هست.
//
// ولی بدنهٔ «تغییر رمز» اصلاً فیلدِ `mobile` ندارد. پس
// `normalizeMobile(undefined)` رشتهٔ خالی می‌داد و کلید عملاً می‌شد
// «فقط IP». نتیجه: با CGNAT اپراتورهای موبایل، **همهٔ** کاربرانِ پشتِ
// یک IP در یک سطلِ ۲۰تایی به ازای ۱۵ دقیقه شریک می‌شدند. بیست نفر که
// رمزشان را عوض می‌کردند، نفرِ بیست‌ویکم پیامِ «تعداد تلاش ورود زیاد
// است» می‌گرفت — پیامی که هیچ ربطی به کاری که کرده نداشت.
//
// اینجا کاربر قطعاً وارد شده و شناسه داریم، پس کلید روی خودش می‌رود.
// سقف پایین‌تر (۱۰) چون تغییر رمزِ مکرر رفتار عادی نیست و این مسیر
// `bcrypt.compare` دارد که عمداً کند است (~۱۰۰ms CPU).
const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  ...rlStore('changepw'),
  keyGenerator: perUserKey,
  message: { message: 'تعداد تلاش‌ها زیاد است؛ چند دقیقه دیگر دوباره امتحان کنید' },
});

// Buying spends from the wallet, so it is rate-limited like other money paths.
const shopLimiter = rateLimit({
  windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { message: 'تعداد درخواست‌ها زیاد است؛ کمی صبر کن' },
});

// Withdrawal is the one place where a bug costs real money, so it gets its
// own throttle on top of the global one: a script hammering this endpoint
// would otherwise be able to probe balance/state transitions rapidly.
//
// CGNAT: `perUserKey` بالای فایل (کنار بقیهٔ limiterها) تعریف شده و حالا
// **همهٔ** مسیرهای احراز هویت‌شده از آن استفاده می‌کنند، نه فقط این دو.
// تعریفِ دومی که قبلاً اینجا بود حذف شد.
const withdrawalLimiter = opsRateLimit('withdrawal',
  { windowMs: 60_000, limit: 10 },
  { keyGenerator: perUserKey, message: { message: 'تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید' } });

const bankCardLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  ...rlStore('bankcard'),
  keyGenerator: perUserKey,
  message: { message: 'تعداد تلاش برای ثبت کارت زیاد است؛ کمی بعد دوباره تلاش کنید' },
});

// محدودکنندهٔ نرخ: سهمیهٔ روزانه و قید یکتای دیتابیس کار اصلی را می‌کنند،
// ولی این جلوی کوبیدن endpoint را می‌گیرد — هر تلاش یک تراکنش با قفل ردیف
// باز می‌کند و بدون این، یک اسکریپت می‌تواند ردیف کاربر را قفل نگه دارد.
const wheelLimiter = opsRateLimit('wheel',
  { windowMs: 60_000, limit: 20 },
  { keyGenerator: perUserKey, message: { message: 'تعداد درخواست‌ها زیاد است، کمی صبر کن' } });

// Users upload ticket images through their own route (the admin upload
// endpoint requires an admin token). Rate-limited because this is the only
// endpoint where an ordinary user can write files to the VPS disk — without
// a cap one account could fill the volume and take the whole service down.
const uploadLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  ...rlStore('upload'),
  keyGenerator: perUserKey, // CGNAT — توضیح کامل کنار تعریفِ perUserKey
  message: { message: 'تعداد آپلود زیاد است؛ کمی بعد دوباره تلاش کنید' },
});

  return {
  perUserKey, opsRateLimit, chatLimiter, otpLimiter,
  otpMobileKey, otpMobileLimiter, otpDailyLimiter, otpVerifyLimiter,
  adminLoginLimiter, userLoginLimiter, userAccountLimiter, loginStreakLimiter,
  tapBatchLimiter, cardDuelLimiter, changePasswordLimiter, shopLimiter,
  withdrawalLimiter, bankCardLimiter, wheelLimiter, uploadLimiter,
  };
};
