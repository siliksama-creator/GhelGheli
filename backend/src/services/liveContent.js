/**
 * محتوا و اعداد زنده — «پنلِ متن‌ها و اعداد» کلِ محصول (نقشه‌راه یکپارچه‌سازی).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * چرا این ماژول جدا از ops_limits است
 * ═══════════════════════════════════════════════════════════════════════
 *
 * ops_limits اعدادِ عملیاتیِ سرور است (سقف‌ها، rate-limit، ورودی‌های
 * مجاز). این ماژول دو چیزِ دیگر را می‌سازد:
 *
 *   1. `live_rules` — اعدادِ ساختاریِ محصول که کلاینت‌ها یا سرور باید
 *      از همان لحظهٔ تغییر برایشان برسد: تعداد جفت‌های جفت‌یاب، ثانیهٔ
 *      فرصتِ اتصال دوباره، طول کد اتاق، سهمیهٔ تیکت/تصویر، ساعتِ وعدهٔ
 *      بررسیِ عکس و چرخشِ اضافهٔ هر آستانهٔ معرفی. هر عدد **بازهٔ امن**
 *      دارد: ادمین خارج از بازه بنویسد، به نزدیک‌ترین حد امن چسبانده
 *      می‌شود — هیچ ذخیره‌ای نمی‌تواند محصول را بشکند (جفت‌یاب با ۲۰ جفت
 *      که فقط ۸ شکل دارد، می‌شود صفحهٔ خراب).
 *
 *   2. `live_copy` — متن‌های کاربر با **قالب‌های جای‌نگهدار**
 *      (`{memoryPairs}`, `{reconnectSeconds}`…). عددِ داخل متن از
 *      live_rules / تنظیماتِ دیگر می‌آید تا یک عدد در دو جا دو رقم
 *      نشود. پیش‌فرضِ هر قالب **دقیقاً** متنِ فعلیِ محصول است، پس
 *      قبل از اولین ویرایشِ ادمین، خروجیِ سیستم با امروزِ محصول
 *      واژه‌به‌واژه یکسان است.
 *
 * هر ذخیره: (۱) نسخهٔ قبلی را در `live_content_history` می‌نویسد،
 * (۲) کشِ همگامِ opsConfig را تازه می‌کند، (۳) `config_version` را
 * بالا می‌برد تا کلاینت‌های چسبیده (long-lived) بدانند /api/config را
 * دوباره بکشند.
 *
 * ⚠️ عددی که **رفتار** سرور را عوض می‌کند ولی هنوز اینجا نیست:
 * «ساعتِ ریستِ روزانهٔ گردونه» — منطقِ ریست روی نیمه‌شبِ تهران است
 * (wheelService.tehranDay) و تغییرش نیاز به تغییر منطق دارد، نه فقط
 * عدد؛ تا آن فاز، متنِ راهنما متنِ ساده و قابل‌ویرایش است.
 */
const opsConfig = require('./opsConfig');
const { pool } = require('../config/db');

const COPY_KEY = 'live_copy';
const RULES_KEY = 'live_rules';
const VERSION_KEY = 'config_version';
const HISTORY_KEEP = 20;

// ═══════════════════════════════════════════════════════════════════════
// live_rules — اعدادِ ساختاری با بازهٔ امن
// ═══════════════════════════════════════════════════════════════════════
//
// بازه‌ها با خواندنِ واقعیِ کد تنظیم شده‌اند، نه حدس:
//   • memoryPairs: شکل‌های جفت‌یاب (memory.js FACES) فقط ۸ تا هستند و
//     تخته ۴×۴ است؛ ۴ تا ۸ = هر اندازه‌ای که تخته و شکل‌ها حمایت می‌کنند.
//   • roomCodeLength: ۴ تا ۸ رقم؛ کلاینت با input type=number بگیرد.
//   • reconnectSeconds: موتور engine.js همان ثانیه را ms می‌کند.
//   • spinsPerDailyThreshold: «هر X دعوت = Y چرخش» — Y اینجاست (X در
//     ops_limits.referralInvitesPerDailySpin است).
const RULE_DEFS = Object.freeze({
  memoryPairs: {
    value: 8, min: 4, max: 8,
    label: 'تعداد جفت‌های جفت‌یاب',
    hint: 'هر جفت = ۲ کارت روی تختهٔ ۴×۴. الان ۸ (تختهٔ کامل).',
  },
  reconnectSeconds: {
    value: 25, min: 10, max: 60,
    label: 'ثانیهٔ فرصتِ اتصال دوباره',
    hint: 'وقتی شبکه وسط بازی قطع می‌شود، این چند ثانیه فرصت داری برگردی.',
  },
  roomCodeLength: {
    value: 4, min: 4, max: 8,
    label: 'طول کدِ اتاقِ خصوصی',
    hint: 'کد اتاق عددی است؛ حالا ۴ رقم.',
  },
  ticketsPerDay: {
    value: 1, min: 1, max: 10,
    label: 'سهمیهٔ تیکتِ پشتیبانی در روز',
    hint: 'تیکتِ تازه‌ای که هر کاربر در یک روز می‌تواند باز کند.',
  },
  maxTicketAttachments: {
    value: 5, min: 1, max: 10,
    label: 'سقفِ تصاویرِ هر تیکت',
    hint: 'چند تصویر می‌تواند روی یک تیکت ضمیمه شود.',
  },
  reviewSlaHours: {
    value: 24, min: 4, max: 72,
    label: 'وعدهٔ بررسیِ عکسِ کارت (ساعت)',
    hint: 'وقتی کیفیت عکس کامل نیست، به کاربر می‌گوییم تا چند ساعت کارشناس بررسی می‌کند. فقط یک وعدهٔ نمایشی است؛ کدِ کارت همیشه محفوظ می‌ماند.',
  },
  spinsPerDailyThreshold: {
    value: 1, min: 1, max: 5,
    label: 'چرخشِ اضافهٔ هر آستانهٔ معرفی',
    hint: 'هر ۱۰ دعوت موفق (این «۱۰» در بخش «محدودیت‌های عملیاتی» است) این‌قدر چرخشِ روزانهٔ دائمی به گردونه اضافه می‌کند. الان ۱.',
  },
});

// ═══════════════════════════════════════════════════════════════════════
// live_copy — قالب‌های متنِ کاربر
// ═══════════════════════════════════════════════════════════════════════
//
// قرارداد جای‌نگهدارها: {name} با اعدادِ موجود در پاسخِ /api/config پر
// می‌شود. کلاینت‌ها فقط جای‌نگهدارِ شناخته‌شده می‌پرند؛ اگر ادمین
// جای‌نگهدار را از متن حذف کند، متن بدونِ آن عدد نمایش داده می‌شود
// (خطایی نمی‌افتد). اگر جای‌نگهدارِ ناشناخته بنویسد، پیش‌نمایشِ پنل
// (فاز ۳) هشدار می‌دهد.
//
// ساختار زیر — گروه‌بندیِ صفحهٔ «متن‌ها و اعداد» — را هم می‌سازد:
// هر گروه یک دسته در پنل است.
const DEFAULT_COPY = Object.freeze({
  referral: {
    dailySpinRule: 'هر {invitesPerDailySpin} دعوت موفق = {spinsPerDailyThreshold} چرخش روزانه دائمی به گردونه شانس (تا سقف {maxInvitesForDaily} نفر).',
  },
  coinGuide: {
    heading: 'سکه چطور به دست می‌آید؟',
    lead: 'رتبهٔ لیگ با سکه تعیین می‌شود، نه امتیاز — و سکه فقط با بازی مقابل حریف واقعی به دست می‌آید.',
    allEqual: 'هر سه بازی یکسان سکه می‌دهند — دوئل کارت، پنالتی و جفت‌یاب.',
    noCoin: 'بازی با ربات، تمرین رایگان و لابی خصوصی سکه ندارند.',
    neverLost: 'سکه هرگز از شما کم نمی‌شود؛ حتی وقتی ببازید.',
    // «ورودی» دیگر در این قالب نوشته نشده: خودِ برچسبِ لایه از
    // `coinGuide.stakeLabel` ساخته می‌شود تا جدولِ راهنما و همین جمله هرگز
    // دو واژهٔ مختلف برای یک چیز نشان ندهند. خروجی با نسخهٔ قبلی
    // **واژه‌به‌واژه یکی** است («… بازی در ورودی ۱۰۰ و …»)، فقط رقم‌ها از
    // جای‌نگهدارِ تازه (`*Text`) می‌آیند، چون هر دو کلاینت عدد را با
    // رقمِ فارسی و از همان `stakeLabel` می‌سازند.
    quota: 'هر روز تا {qLow} بازی در {stakeLowText} و {qHigh} بازی در {stakeHighText} سکه می‌دهد. بعد از آن، بازی امتیاز دارد ولی سکه نه.',
    tapCoins: 'بازی ضربه‌زن هم سکه دارد: هر لول {tapCoins} سکه — همان لحظهٔ لول‌آپ به موجودی‌ات اضافه می‌شود.',
    league: 'مبنای دریافتِ جایزهٔ لیگ، رتبه بر اساسِ سکه است و با سکه‌ها در استخرِ جایزه شرکت می‌کنی. در پایانِ فصل جوایز بر اساسِ سکه پرداخت و سکه‌ها صفر می‌شوند؛ {carryover}.',
    carryoverZero: 'انتقالِ سکه به لیگِ بعدی صفر است',
    carryoverPercent: '{percent}٪ از سکه به لیگِ بعدی منتقل می‌شود',
    stakeLabel: 'ورودی {stake}',
    botNote: 'تمرین با ربات سکه ندارد — برای سکه، {stakeLowText} یا {stakeHighText} را انتخاب کن.',
    privateNote: 'اتاق خصوصی سکه ندارد — برای سکه، {stakeLowText} یا {stakeHighText} را انتخاب کن.',
  },
  plus: {
    monthlyBadge: '{days} روز',
    annualBadge: 'حدود {savingPercent}٪ تخفیف',
    benefitsNote: 'دسترسی قاب‌ها و افکت نام، ستاره پلاس، Premium Pass و حذف تبلیغات برای {days} روز فعال می‌شود.',
  },
  streak: {
    cycleDone: 'چرخه {days} روزه · امروز روز {day} تکمیل شد',
    cycleNext: 'چرخه {days} روزه · روز {day} · {reward} امتیاز هدیه',
    webDone: 'روز {day} از {days} تکمیل شد؛ زنجیره‌ات امن است.',
  },
  support: {
    ticketRule: 'در هر روز می‌توانید {ticketsPerDay} تیکت جدید ثبت کنید.',
    attachmentsFull: 'تکمیل سقف {maxAttachments} تصویر',
    privacyTitle: 'حریم خصوصی و شفافیت بازی',
    // سه بندِ منشورِ حریم خصوصی. متنِ وب و اندروید کمی از هم فرق داشت
    // (یکی «شاپرک و پایا» و دیگری «بانک مرکزی و شبا» می‌گفت)؛ از این‌جا
    // به بعد **یک** متنِ واحد برای هر دو کلاینت است — همان چیزی که
    // «یک محصول، یک بافت» یعنی.
    privacySections: [
      {
        title: '۱. ماهیت پلتفرم سرگرمی و بازی مهارت‌محور:',
        body: 'اپلیکیشن قلقلی یک محیط سرگرمی، مسابقات مهارتی و کلکسیون فوتوکارت است. این پلتفرم هیچ‌گونه فعالیت شرط‌بندی، بخت‌آزمایی یا قمار نداشته و تمامی پاداش‌ها و امتیازات بر مبنای فعالیت، هوش و مهارت بازیکنان در بازی‌ها محاسبه می‌شود.',
      },
      {
        title: '۲. حفظ اطلاعات کاربری:',
        body: 'شماره تماس و اطلاعات هویتی شما کاملاً محفوظ بوده و به هیچ شخص ثالثی واگذار نمی‌شود. در محیط‌های عمومی (چت و لیگ) صرفاً نام مستعار و عکس انتخابی شما نمایش داده می‌شود.',
      },
      {
        title: '۳. شفافیت مالی و تسویه‌حساب:',
        body: 'جوایز و موجودی کیف پول کاربران طبق قوانین رسمی بانک مرکزی و از طریق شماره شبا به نام صاحب حساب تاییدشده تسویه می‌گردد.',
      },
    ],
  },
  photoReview: {
    pendingNote: 'کیفیت عکس کامل نبود؛ کارشناس بررسی می‌کند و ممکن است تا {slaHours} ساعت طول بکشد. کد شما محفوظ است و می‌توانید کارت‌های دیگرتان را ثبت کنید.',
  },
  wheel: {
    // بدون جای‌نگهدار: ساعتِ ریست (نیمه‌شب تهران) منطقِ سرور است نه
    // عددِ قابل‌تنظیم؛ ادمین فقط می‌تواند **لحنِ** جمله را عوض کند.
    resetNote: 'سهمیهٔ روزانه هر شب ساعت ۱۲ به وقت تهران تازه می‌شود.',
  },
  games: {
    tapSubtitle: '{levelCount} لول ضربه بزن و شخصیت‌ها را باز کن',
    duelSubtitle: 'نبرد پنج‌راندی و کارت‌های کلکسیونی',
    memorySubtitle: 'جفت‌های فوتبالی را به خاطر بسپار',
    memoryRule: 'همه‌ی {memoryPairs} جفت را در کمترین زمان و کمترین برگرداندن پیدا کن.',
    roomCodeLabel: 'کد {codeLength} رقمی',
  },
  reconnect: {
    offlineNote: 'شبکه قطع شد؛ {reconnectSeconds} ثانیه برای بازگشت فرصت داری…',
  },
  avatars: {
    countLabel: 'انتخاب آواتار پروفایل ({count} مدل اختصاصی):',
  },
  // ── دیالوگِ «نسخهٔ تازه آماده است» (فاز ۴) ─────────────────────────
  //
  // چرا این گروه اصلاً لازم است: دیالوگِ آپدیت، تنها متنِ *مهمِ* محصول بود
  // که سفت نوشته شده بود — یعنی همان صفحه‌ای که به کاربر می‌گوید «اپت
  // قدیمی است و باید نصبِ مجدد کند»، جمله‌بندی‌اش در کد قفل بود و تنها
  // اهرمِ قابل‌تنظیمش (minVersion) در پنل بود. اگر روزی نسخه‌ای را مجبور
  // به ترک کنیم، لحنِ این جمله فرقِ «کاربر می‌ماند» و «کاربر می‌پرد» است.
  //
  // یک نکتهٔ ظریف که عمداً رعایت شده: هر دو کلاینت **یک رشته** را از یک
  // کلید می‌خوانند، فقط جایش فرق دارد — وب آن را به‌عنوانِ <p> نشان می‌دهد
  // و اندروید آن را با تیتر و بدنهٔ خودش *ادغام* می‌کند. چرا؟ چون متنِ
  // اندروید «… تا همه‌چیز درست کار کند» بود و متنِ وب «برای ادامه، صفحه را
  // تازه‌سازی کن…» — دو جملهٔ متفاوت برای یک اتفاق. اگر هر کلاینت کلیدِ
  // خودش را داشت، گاردِ «فول‌بکِ مشترک‌ها یکی است» را دور می‌زدیم و همان
  // اختلافِ دو پلتفرمی که فازِ ۲ برای بستنش ساخته شد، اینجا زاده می‌شد.
  //
  // ارقامِ نسخه از `{current}`/`{min}` می‌آیند (نه سفت در رشته)، پس اگر
  // ادمین قالب را با عددِ ثابت پر کند، گاردِ رقمِ سفت قرمز می‌شود.
  update: {
    title: 'نسخهٔ تازه قلقلی آماده است',
    notice: 'نسخهٔ فعلی شما {current} است و حداقلِ لازم {min}.',
    body: 'برای اینکه همه‌چیز درست کار کند، لطفاً به تازه‌ترین نسخه به‌روزرسانی کنید.',
    action: 'به‌روزرسانی',
    reload: 'تازه‌سازی',
    later: 'بعداً',
  },
});

// قرارداد: کدام جای‌نگهدارها در کدام قالب مجازند (برای پیش‌نمایشِ پنل
// و تستِ قراردادِ CI در فاز ۳/۵).
const COPY_CONTRACT = Object.freeze({
  referral: {
    // جملهٔ «هر ۱۰ دعوت = … چرخش» در **سه** جا خوانده می‌شود: صفحهٔ دعوت و
    // کارتِ قوانینِ گردونه در وب، و همان دو در اندروید. پس هر سه جای‌نگهدار
    // باید در قرارداد باشند؛ اگر این کلید اینجا نبود، پیش‌نمایشِ پنل (فاز ۳)
    // نمی‌توانست بگوید «این متن عددِ لازم را ندارد» و اشتباهِ ادمین فقط روی
    // گوشیِ کاربر دیده می‌شد.
    dailySpinRule: ['invitesPerDailySpin', 'spinsPerDailyThreshold', 'maxInvitesForDaily'],
  },
  coinGuide: {
    // تیترِ کارت — وب و اندروید هر دو همین را می‌خوانند.
    heading: [],
    lead: [],
    allEqual: [],
    noCoin: [],
    neverLost: [],
    // نام‌های این فهرست **همان چیزی است که هر دو کلاینت پاس می‌دهند**؛
    // گاردِ `test:live-copy-parity` همین برابری را می‌سنجد.
    quota: ['qLow', 'stakeLowText', 'qHigh', 'stakeHighText'],
    tapCoins: ['tapCoins'],
    league: ['carryover'],
    carryoverZero: [],
    carryoverPercent: ['percent'],
    stakeLabel: ['stake'],
    botNote: ['stakeLowText', 'stakeHighText'],
    privateNote: ['stakeLowText', 'stakeHighText'],
  },
  plus: {
    monthlyBadge: ['days'],
    annualBadge: ['savingPercent'],
    benefitsNote: ['days'],
  },
  streak: {
    cycleDone: ['days', 'day'],
    cycleNext: ['days', 'day', 'reward'],
    webDone: ['day', 'days'],
  },
  support: {
    ticketRule: ['ticketsPerDay'],
    attachmentsFull: ['maxAttachments'],
    // تیترِ منشورِ حریم خصوصی — بی‌جای‌نگهدار و بی‌عدد؛ ردیفش در قرارداد
    // فقط برای این است که «هر قالبِ پیش‌فرض، ردیفِ قرارداد هم داشته باشد»
    // (گاردِ `test:live-copy-parity`). بدونِ آن، پنل دربارهٔ این کلید هیچ
    // هشدارِ پیش‌نمایشی نمی‌داد و ما هم تفاوتِ «فراموش‌شده» با «عمداً تهی»
    // را نمی‌توانستیم تشخیص بدهیم.
    // دونقطهٔ انتهایِ تیترها عمداً **درونِ خودِ رشته** است، نه در چیدمانِ
  // کلاینت: نسخهٔ وب `<b>{title}:</b>` می‌ساخت و اندروید تیترِ خالی را
  // نشان می‌داد — یعنی یک واژه‌نشانه که ادمین نمی‌توانست عوضش کند و
  // دو کلاینت هم یکی نبودند. هر چیزی که در صفحه دیده می‌شود باید در
  // قالب باشد (همان قانونِ «ورودی {stakeLow}» در coinGuide.quota).
  //
  // `coinGuide.lead` در هیچ کلاینتی خوانده نمی‌شود و این عمداً *نساختن*
  // است، نه جاافتادن: همان جمله در وب با <b> روی «سکه» و «بازی مقابل
  // حریف واقعی» و در اندروید با RichText/TextSpanِ رنگی رندر می‌شود.
  // وصل‌کردنش یعنی از‌دست‌رفتنِ آن برجسته‌سازی — یعنی تغییرِ طرح، که
  // خطِ قرمزِ نقشه‌راه است. تا وقتی پنل راهِ «فیلدِ فقط‌نمایشی» را ندارد،
  // این ردیف با همین توضیح در فهرستِ بدهیِ گاردِ parity می‌ماند.
  //
  // `privacySections` ردیفِ قرارداد **ندارد**، چون آرایهٔ بندهاست نه
    // قالبِ رشته‌ای: هیچ `{placeholder}`‌ی قابل‌تعویضی ندارد و پیش‌نمایشِ
    // پنل برایش چیزی نشان نمی‌دهد. (تستِ `testLiveContent` عمداً
    // می‌گوید «هر ردیفِ قرارداد باید به یک رشتهٔ پیش‌فرض برسد» — و
    // درست هم می‌گوید: ردیفِ بی‌مصرف، گاردِ جعلی می‌سازد.)
    privacyTitle: [],
  },
  photoReview: {
    pendingNote: ['slaHours'],
  },
  wheel: {
    resetNote: [],
  },
  games: {
    // سه کلیدی که *وب* می‌خواند ولی در قرارداد نبودند: با حذف‌شدنِ
    // {levelCount} از متن، پیش‌نمایشِ پنل سکوت می‌کرد. (دور ۳۳: این
    // ردیف‌ها موقع افزودنِ کلید جا افتادند، نه موقع ویرایشِ ادمین.)
    duelSubtitle: [],
    memorySubtitle: [],
    tapSubtitle: ['levelCount'],
    memoryRule: ['memoryPairs'],
    roomCodeLabel: ['codeLength'],
  },
  reconnect: {
    offlineNote: ['reconnectSeconds'],
  },
  avatars: {
    countLabel: ['count'],
  },
  update: {
    // این دو جای‌نگهدار را *خودِ* هر دو کلاینت از `app.minVersion` و
    // نسخهٔ بیلدِ خودش می‌دهد؛ پس اگر ادمین جمله‌ای بدونِ `{min}` بسازد،
    // عددِ نسخه از پیش‌نمایش و از UI می‌پرد — همان چیزی که قفلِ ذخیره
    // در پنل برایش وجود دارد.
    notice: ['current', 'min'],
    title: [],
    body: [],
    action: [],
    reload: [],
    later: [],
  },
});

// ── ابزارهای داخلی ─────────────────────────────────────────────────────

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * عمیق-مرجِ «سفید‌نام»: فقط مسیرهایی که در پیش‌فرض وجود دارند پذیرفته
 * می‌شوند. کلیدِ غرابه (املا اشتباه ادمین در API خام) را در دیتابیس
 * نمی‌ریزیم و ساختارِ قالب‌ها را خراب نمی‌کنیم.
 */
function whiteMerge(defaults, stored) {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return clone(defaults);
  const out = Array.isArray(defaults) ? [] : {};
  for (const key of Object.keys(defaults)) {
    const d = defaults[key];
    const s = stored[key];
    if (s === undefined) {
      out[key] = clone(d);
    } else if (typeof d === 'string') {
      out[key] = typeof s === 'string' ? s : d;
    } else if (Array.isArray(d)) {
      // آرایهٔ اشیاء (privacySections): طول و جایگاهِ ردیف‌ها ثابت می‌ماند
      // (بندِ شماره‌دار «۱/۲/۳» — جابه‌جایی جایگاه تودرو نمی‌کند ولی
      // **حذف** یک بند از محصول نباید با یک PATCH ناقص ممکن باشد).
      // هر ردیف با ساختارِ پیش‌فرضِ همان جایگاه تطبیق می‌شود؛ آیتمِ
      // نرسیده همان پیش‌فرضِ خود را برمی‌گرداند.
      out[key] = d.map((defItem, i) => {
        const sItem = Array.isArray(s) ? s[i] : undefined;
        return whiteMerge(
          defItem,
          sItem && typeof sItem === 'object' ? sItem : {},
        );
      });
    } else {
      out[key] = whiteMerge(d, s && typeof s === 'object' ? s : {});
    }
  }
  return out;
}

// ── خواندن (مسیرهای داغ — همه همگام روی کشِ opsConfig) ────────────────

/** اعدادِ ساختاریِ فعلی — همیشه یک آبجکتِ کامل، هرگز مقدارِ بی‌باز. */
function rules() {
  const stored = opsConfig.syncGet(RULES_KEY);
  const s = stored && typeof stored === 'object' ? stored : {};
  const out = {};
  for (const [key, def] of Object.entries(RULE_DEFS)) {
    const n = Number(s[key]);
    out[key] = (Number.isFinite(n) && n >= def.min && n <= def.max)
      ? Math.round(n)
      : def.value;
  }
  return out;
}

/** قالب‌های فعلی با پیش‌فرض‌ها — همیشه ساختارِ کاملِ DEFAULT_COPY. */
function copy() {
  const stored = opsConfig.syncGet(COPY_KEY);
  return whiteMerge(DEFAULT_COPY, stored);
}

/** نسخهٔ کنفِرایگ — هر ذخیرهٔ متن/عدد بالا می‌برد. */
function configVersion() {
  const n = Number(opsConfig.syncGet(VERSION_KEY));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 1;
}

/**
 * پرکردنِ جای‌نگهدارها — همان کاری که کلاینت‌ها می‌کنند؛ اینجا تا
 * پیش‌نمایشِ پنل و تست‌ها یک مرجعِ واحد داشته باشند.
 * اعدادِ غیرعددی (null/undefined) جای‌نگهدار را دست‌نخورده نگه می‌دارند؟
 * نه — خالی می‌کنند تا هیچ «{x}» خام در خروجی نهایی نماند؛ ولی پنلِ
 * ادمین نسخهٔ خامِ قالب را هم نشان می‌دهد.
 */
function fillTemplate(template, vars = {}) {
  const t = typeof template === 'string' ? template : '';
  return t.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (m, name) => {
    const v = vars[name];
    if (v === null || v === undefined || v === '') return '';
    return String(v);
  });
}

// ── تاریخچه و بازگردانی ───────────────────────────────────────────────

async function recordHistory(key, prevValue, adminId) {
  await pool.query(
    'INSERT INTO live_content_history(key, value, admin_id) VALUES($1, $2::jsonb, $3)',
    [key, JSON.stringify(prevValue), adminId || null]);
  // حلقهٔ محدود: فقط ۲۰ نسخهٔ آخرِ هر کلید.
  await pool.query(
    `DELETE FROM live_content_history
     WHERE key = $1 AND id NOT IN (
       SELECT id FROM live_content_history WHERE key = $1
       ORDER BY id DESC LIMIT $2)`,
    [key, HISTORY_KEEP]);
}

async function history(key, limit = HISTORY_KEEP) {
  const { rows } = await pool.query(
    `SELECT h.id, h.key, h.value, h.admin_id, h.created_at, a.username AS admin_username
       FROM live_content_history h
       LEFT JOIN admin_users a ON a.id = h.admin_id
      WHERE h.key = $1 ORDER BY h.id DESC LIMIT $2`,
    [key, limit]);
  return rows;
}

/**
 * همان تاریخچه، فقط با ستون‌هایی که UI واقعاً می‌خواند.
 *
 * چرا لازم شد: «تستِ ۲۰ تغییر» که همین دور روی سرورِ زنده اجرا شد، دو چیز را
 * نشان داد. (۱) بدونِ این لایه، `history/copy` بیست ردیف × اسنپ‌شاتِ کاملِ
 * copy را به پنل و به اندروید می‌فرستاد — چیزی در حد ۸۰KB که هیچ‌کدام از
 * مصرف‌کننده‌ها (کارتِ تاریخچه در وب، کارتِ اندروید، `history()` داخلی) حتی
 * به آن نگاه نمی‌کردند. روی سرورِ واقعی این یعنی پهنای‌باندِ مفت در هر باز
 * شدنِ صفحه. (۲) کارتِ تاریخچه «(ادمین 3)» چاپ می‌کرد؛ یعنی همان چیزِ فنی
 * که پنل قول داده بود حرفِ آدمی بزند، در مهم‌ترین سؤالش: «چه کسی این را
 * عوض کرد؟» نام از همان joinِ لاگِ حسابِ کاربری (`admin_users.username`)
 * می‌آید و نبودنش به «تیم پشتیبانی» ترجمه می‌شود، نه به عدد.
 */
async function historyView(key, limit = HISTORY_KEEP) {
  const rows = await history(key, limit);
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    adminId: r.admin_id,
    adminUsername: r.admin_username || null,
    createdAt: r.created_at,
  }));
}

async function bumpConfigVersion(adminId) {
  const next = configVersion() + 1;
  // opsConfig.set خودش کشِ همگام را تازه می‌کند — بلافاصله پس از ذخیره،
  // /api/config نسخهٔ تازه را نشان می‌دهد.
  await opsConfig.set(VERSION_KEY, next, adminId);
  return next;
}

// ── ذخیره: live_rules ──────────────────────────────────────────────────

/**
 * مقادیرِ تازه را در بازه‌های امن می‌بندد و برمی‌گرداند — بدون نوشتن.
 * ورودیِ نامعتبر (غیرعدد) همان مقدارِ فعلی را نگه می‌دارد؛ ورودیِ
 * خارجِ بازه به نزدیک‌ترین حد امن چسبانده می‌شود.
 */
function sanitizeRules(patch) {
  const cur = rules();
  const b = patch && typeof patch === 'object' ? patch : {};
  const out = { ...cur };
  for (const [key, def] of Object.entries(RULE_DEFS)) {
    if (b[key] === undefined || b[key] === null || b[key] === '') continue;
    const n = Number(b[key]);
    if (!Number.isFinite(n)) continue;
    out[key] = Math.min(def.max, Math.max(def.min, Math.round(n)));
  }
  return out;
}

async function saveRules(patch, adminId) {
  const cur = rules();
  const next = sanitizeRules(patch);
  const changed = JSON.stringify(cur) !== JSON.stringify(next);
  if (changed) {
    await recordHistory(RULES_KEY, cur, adminId);
  }
  await opsConfig.set(RULES_KEY, next, adminId);
  if (changed) await bumpConfigVersion(adminId);
  return next;
}

// ── ذخیره: live_copy ───────────────────────────────────────────────────

function sanitizeCopy(patch) {
  const stored = patch && typeof patch === 'object' ? patch : {};
  return whiteMerge(DEFAULT_COPY, stored);
}

async function saveCopy(patch, adminId) {
  const cur = copy();
  const next = sanitizeCopy(patch);
  const changed = JSON.stringify(cur) !== JSON.stringify(next);
  if (changed) {
    await recordHistory(COPY_KEY, cur, adminId);
  }
  await opsConfig.set(COPY_KEY, next, adminId);
  if (changed) await bumpConfigVersion(adminId);
  return next;
}

/**
 * بازگردانیِ آخرین تغییرِ یک کلید. «آخرین تغییر» یعنی آخرین ردیفِ
 * history که دقیقاً **قبل** از وضعیتِ فعلی ذخیره شده — یعنی همان
 * نسخهٔ قبلی. از همان مسیرِ ذخیره (با اعتبارسنجیِ دوباره) عبور
 * می‌کند تا هیچ روزی نسخهٔ خراب به محصول نرسد.
 */
async function revert(key, adminId) {
  if (key !== COPY_KEY && key !== RULES_KEY) {
    const e = new Error('کلید ناشناخته');
    e.status = 400;
    throw e;
  }
  const prev = await history(key, 1);
  if (!prev.length) {
    const e = new Error('تغییری برای بازگردانی وجود ندارد');
    e.status = 404;
    throw e;
  }
  if (key === RULES_KEY) return saveRules(prev[0].value, adminId);
  return saveCopy(prev[0].value, adminId);
}

// ── نمای پنل ───────────────────────────────────────────────────────────

/**
 * خروجیِ صفحهٔ «متن‌ها و اعداد»: اعدادِ فعلی + بازه‌های امن + تعریفِ
 * هر عدد، و قالب‌های فعلی + قراردادِ جای‌نگهدارها. پنلِ وب و اندروید
 * هر دو با همین یک پاسخ ساخته می‌شوند.
 */
/**
 * پیش‌فرض‌هایِ کد، در شکلِ «patchِ خالی». `sanitizeCopy({})` عمداً همان
 * `DEFAULT_COPY` را برمی‌گرداند، پس «بازگشت به پیش‌فرض» یک مسیرِ تازه و
 * تازه‌نویسی‌شده لازم ندارد — همان ذخیره است با بدنهٔ خالی. این مهم است
 * چون مسیرِ ذخیره تنها جایی است که اعتبارسنجی، تاریخچه و `configVersion++`
 * روی آن سوار است؛ اگر «reset» مسیرِ جدا می‌رفت، روزی یکی از این سه را
 * فراموش می‌کردیم (و «متن‌ها ریست شدند ولی اپ کهنه ماند» باگی است که هیچ
 * گاردی نمی‌بیندش).
 */
function defaultsView() {
  return JSON.parse(JSON.stringify(DEFAULT_COPY));
}

function panelView() {
  return {
    rules: {
      defs: RULE_DEFS,
      values: rules(),
    },
    copy: {
      template: copy(),
      contract: COPY_CONTRACT,
    },
    configVersion: configVersion(),
  };
}

/** پیش‌نمایشِ زنده: قالب‌های فعلی با اعدادِ فعلیِ config پرشده. */
function preview(vars = {}) {
  // اعدادی که درخواست می‌فرستد اولویت دارند؛ هرچه نباشد از `live_rules`ی
  // امروز پر می‌شود. بیِ این دوم، پیش‌نمایشِ پنل برای «تعدادِ جفت‌های
  // جفت‌یاب» یا «طولِ کد اتاق» جای‌نگهدارِ خالی می‌گذاشت و مدیر فکر می‌کرد
  // قالب خراب است — فیلدِ خالی در پیش‌نمایش بدترین بازخورد ممکن است،
  // چون کاربرِ واقعی هرگز چنین چیزی نمی‌بیند.
  const withDefaults = { ...rules(), ...(vars || {}) };
  const fill = (obj) => {
    if (typeof obj === 'string') return fillTemplate(obj, withDefaults);
    if (Array.isArray(obj)) return obj.map(fill);
    if (obj && typeof obj === 'object') {
      const r = {};
      for (const [k, v] of Object.entries(obj)) r[k] = fill(v);
      return r;
    }
    return obj;
  };
  const raw = (obj) => {
    if (Array.isArray(obj)) return obj.map(raw);
    if (obj && typeof obj === 'object') {
      const r = {};
      for (const [k, v] of Object.entries(obj)) r[k] = raw(v);
      return r;
    }
    return obj;
  };
  const current = copy();
  return {
    // `template` پرشده است و همین را تستِ `testLiveContent` و هر
    // کلاینتِ فعلی می‌خواند (تغییرِ معنا ندادیم تا چیزی بشکند).
    template: fill(current),
    // `raw` همان قالبِ خامِ لحظه است: پنل برای «جای‌نگهدارِ گم‌شده» به
    // این نگاه می‌کند، نه به نسخهٔ پرشده (در پرشده هیچ `{…}` نمی‌ماند).
    raw: raw(current),
  };
}

module.exports = {
  COPY_KEY, RULES_KEY, VERSION_KEY, HISTORY_KEEP,
  RULE_DEFS, DEFAULT_COPY, COPY_CONTRACT,
  rules, copy, configVersion, fillTemplate,
  sanitizeRules, saveRules, sanitizeCopy, saveCopy,
  history, historyView, revert, bumpConfigVersion, defaultsView,
  panelView, preview,
};
