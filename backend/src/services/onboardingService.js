// ══════════════════════════════════════════════════════════════════════════
// آموزشِ صوتیِ قلقلی — منبعِ واحدِ متن و ترتیب (~۴ مهر ۱۴۰۵)
//
// ── چرا متن‌ها این‌جا (روی سرور) و نه در خودِ اپ ─────────────────────────
//
// خواستهٔ مالک: بعد از ورود، صدای خانمِ فارسی بخش‌های قلقلی را یکی‌یکی
// توضیح بدهد و هم‌زمان انگشتی روی همان بخش تاچ کند. اگر متن داخلِ اپ سخت
// کد می‌شد، هر اصلاحِ یک کلمه یعنی آپدیتِ اجباریِ APK — همان دامی که در
// قراردادِ `live-config-contract.md` نوشته شده: «کلاینت‌ها متن نمی‌سازند».
// پس:
//   • سرور: ترتیب + عنوان + متن + نامِ فایلِ صدا  (همین فایل)
//   • کلاینت: فقط «لنگر» و «مسیرِ رسیدن» (کدام تب/زیرتب) — لازمِ رابط
// این تفکیک باعث می‌شود وب و اندروید هرگز از هم جدا نشوند: هر دو یک
// ترتیب و یک متن را از یک جا می‌خوانند.
//
// ── چرا هر بخش یک `id` پایدار دارد ──────────────────────────────────────
//
// کلاینت لنگرها را با `id` نگه می‌دارد (`tour/steps.js`). اگر متن یا
// ترتیب از پنل عوض شود و `id` بماند، لنگرها سالم می‌مانند. گاردِ
// `scripts/testOnboarding.js` همین هویت را قفل می‌کند: هر `id` در سرور
// باید لنگرِ متناظر در کلاینت داشته باشد و برعکس.
// ══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const { pool } = require('../config/db');

// نسخهٔ تور. با هر تغییرِ محتوایی یکی زیاد می‌شود تا کاربری که نسخهٔ قبلی
// را دیده، تورِ تازه را هم ببیند (پرچم روی (کاربر، نسخه) ذخیره می‌شود).
const TOUR_VERSION = 1;

// مسیرِ فایل‌های صدا: استاتیکِ بک‌اند (`app.use('/public', ...)` در server.js)
// پس آدرسِ عمومی می‌شود `/public/onboarding/<file>`.
const AUDIO_DIR = path.join(__dirname, '..', '..', 'public', 'onboarding');
// ── چرا /api و نه /public ───────────────────────────────────────────────
// نسخهٔ اول اینجا `/public/onboarding` بود و صدا در وب هیچ‌وقت پخش نشد:
// nginx روی vhostِ کاربر فقط `/api/`، `/uploads/`، `/socket.io/`، `/assets/`
// و `/ml/` را پروکسی می‌کند و درخواستِ `/public/...` به ریشهٔ استاتیکِ خودِ
// وب می‌خورد → ۴۰۴ → عنصرِ صدا `error` می‌داد و تور بی‌صدا جلو می‌رفت.
// `/api/` روی **همهٔ** میزبان‌ها (وب، پنل، دامنهٔ api و اپِ موبایل) پروکسی
// است؛ پس صدا هم از همان‌جا سرو می‌شود و مسیرِ دومِ شکننده نمی‌سازیم.
const AUDIO_URL_BASE = '/api/onboarding/audio';

/**
 * ۱۸ بخشِ منتخبِ مالک (نسخهٔ کوتاه، بدونِ اسمِ تب‌ها).
 *
 * ترتیب = ترتیبِ پخش. متن‌ها عیناً همان چیزی است که ضبط شده؛ اگر کسی این
 * متن را عوض کند، صدای موجود دیگر نمی‌خواند — برای همین در پاسخِ `state`
 * پرچمِ `audioStale` را هم می‌فرستیم (کلاینت در آن حالت متن را نشان
 * می‌دهد و صدا را پخش نمی‌کند؛ هرگز صدای ناهم‌خوان پخش نمی‌شود).
 */
const STEPS = Object.freeze([
  {
    id: 'home',
    title: 'خانه',
    audio: '01-home.mp3',
    text: 'سلام! به قلقلی خوش اومدی. این‌جا خونه قلقلیه: بالا امتیاز و کیف پولت رو می‌بینی، پایین‌تر جایزه ورود پیوسته و میان‌بر بازی‌ها، گردونه و کلکسیون. با امتیاز می‌تونی بری تو بازی آنلاین و سکه بگیری؛ برداشت کیف پول هم از پنجاه هزار تومان شروع می‌شه.',
  },
  {
    id: 'daily',
    title: 'جایزه روزانه',
    audio: '02-daily-reward.mp3',
    text: 'هر روز که بیای، جایزه می‌گیری؛ هفت روز پشت سر هم، از صد تا پانصد امتیاز. فقط حواست باشه: یه روز نیای، شمارش از صفر شروع می‌شه.',
  },
  {
    id: 'tap',
    title: 'ضربه زن',
    audio: '03-tap-game.mp3',
    text: 'ضربه‌زن پنجاه لول داره؛ هر لول پنج سکه و امتیاز، و هر دو لول یه شخصیت تازه. روزی دو لول بیشتر نمی‌شه، پس هر روز یه سر بزن.',
  },
  {
    id: 'wheel',
    title: 'گردونه شانس',
    audio: '04-wheel.mp3',
    text: 'جایزه گردونه امتیازه. چرخش روزانه‌ات هم به تعداد دوستانی بستگی داره که با کد تو عضو شدن؛ سهمیه هر شب تازه می‌شه.',
  },
  {
    id: 'cards',
    title: 'ثبت کارت و کلکسیون',
    audio: '05-card-register-collection.mp3',
    text: 'کارت‌های پانصد امتیاز و بالاتر رو ازشون عکس بگیر و با کد پشت کارت ثبت کن؛ کارت‌های خاص مثل نقره‌ای، طلایی و غیره رو با پیام به پشتیبانی روبیکا ثبت کن. با کارت‌های کلکسیونت می‌تونی بازی کنی و خرید صندوق کارت از فروشگاه هم پنج کارت تصادفی بهت می‌ده.',
  },
  {
    id: 'league',
    title: 'لیگ',
    audio: '06-league.mp3',
    text: 'این‌جا رقابت اصلی قلقلیه؛ رتبه‌ات با سکه، از برد بازی آنلاین و ضربه‌زن حساب می‌شه. نفرات برتر جایزه نقدی یا امتیاز می‌گیرن.',
  },
  {
    id: 'club',
    title: 'چت و بازی',
    audio: '07-chat-games.mp3',
    text: 'این‌جا چهار بخش داری: چت با پیام‌های آماده، بازی‌ها، ماموریت‌ها و پله‌های جایزه.',
  },
  {
    id: 'invite',
    title: 'دعوت دوستان',
    audio: '08-invite.mp3',
    text: 'با کد اختصاصی خودت دعوت کن؛ هر دوتون سه چرخش هدیه می‌گیرید و پنج درصد امتیاز و خرید نقد دوستت به کیف پولت واریز می‌شه. جدول معرف‌ها هم آفر و جایزه داره.',
  },
  {
    id: 'duel',
    title: 'دوئل، پنالتی و حافظه',
    audio: '09-card-duel-games.mp3',
    text: 'دوئل کارت، پنج راند و هر نفر پنج کارت. با حریف واقعی یا ربات، با ورودی صد یا هزار امتیاز؛ بازی آنلاین به برنده و بازنده سکه می‌ده و از بازنده امتیاز کم می‌کنه. بقیه بازی‌ها هم همین‌طور.',
  },
  {
    id: 'cap',
    title: 'سقف امتیاز امروز',
    audio: '10-point-cap.mp3',
    text: 'حواست به سقف امتیاز روزانه از بازی آنلاین باشه؛ اگه سقف پر بشه، بازی‌ها فقط سکه می‌دن. سکه در لیگ از امتیاز مهم‌تره!',
  },
  {
    id: 'missions',
    title: 'ماموریت‌ها',
    audio: '11-missions.mp3',
    text: 'هر روز پنج ماموریت و هر هفته سه ماموریت داری و هر کدوم امتیاز داره. بالای فهرست هم ماموریت اختصاصی مدیره؛ مثلاً فالو کردن کانال قلقلی.',
  },
  {
    id: 'pass',
    title: 'گذر نبرد',
    audio: '12-battle-pass.mp3',
    text: 'پنجاه پله داری و تجربه از برد، بازی، دعوت، ضربه‌زن، گردونه و ورود روزانه به دست میاد. روزی دو پله باز می‌شه و پله‌های پلاس هم با اشتراک.',
  },
  {
    id: 'coins',
    title: 'سکهٔ قلقلی',
    audio: '13-coins.mp3',
    text: 'سکه فقط از بازی با حریف آنلاین میاد و تا پایان لیگ کم نمی‌شه؛ روزی سی بازی در ورودی صد و پانزده بازی در ورودی هزار سکه می‌ده. بعد پایان لیگ، ده درصدش به صندوق سکه می‌ره؛ از اون‌جا می‌تونی به هر لیگی ببری یا جوایز خاص قلقلی رو بگیری که این قسمت داره ساخته می‌شه.',
  },
  {
    id: 'shop',
    title: 'فروشگاه و پلاس',
    audio: '14-shop-plus.mp3',
    text: 'فروشگاه قاب، رنگ نام، نشان و صندوق کارت داره؛ اول از کیف پول کم می‌شه و اگه کیف پولت خالی بود، از درگاه بانکی. قلقلی پلاس ماهانه یا سالانه‌ست: قاب و افکت نام، ستاره پلاس، مسیر ویژه پله‌ها و یه باشگاه منتخب.',
  },
  {
    id: 'wallet',
    title: 'کیف پول و برداشت',
    audio: '15-wallet-withdraw.mp3',
    text: 'کیف پولت از کمیسیون، گردونه و لیگ پر می‌شه. برداشت از پنجاه هزار تومنه و تا دو روز کاری پرداخت می‌شه؛ فقط اول کارت بانکی خودت رو ذخیره کن.',
  },
  {
    id: 'profile',
    title: 'پروفایل',
    audio: '16-profile.mp3',
    text: 'پروفایل، شناسنامه‌ته: آواتار، نام، شهر و شماره کارت رو کامل کن.',
  },
  {
    id: 'support',
    title: 'پشتیبانی',
    audio: '17-support.mp3',
    text: 'برای هر سوال یا مشکلی، به پشتیبانی پیام بده. قلقلی سرگرمی مهارت‌محوره و تسویه با شماره کارت یا شماره شبا، به نام صاحب حساب انجام می‌شه.',
  },
  {
    id: 'outro',
    title: 'شروع کن',
    audio: '18-outro.mp3',
    text: 'همین بود! از خونه شروع کن؛ اگه خواستی دوباره آموزش رو ببینی، از قسمت پروفایل فعالش کن. خوش بگذره!',
  },
]);

/** تنظیماتِ زندهٔ تور — از `app_settings.onboarding_config` (پیش‌فرض روشن). */
const DEFAULTS = Object.freeze({ enabled: true, version: TOUR_VERSION });

async function config() {
  try {
    const { rows } = await pool.query(
      "SELECT value FROM app_settings WHERE key='onboarding_config' LIMIT 1");
    const v = rows[0]?.value;
    if (!v || typeof v !== 'object') return { ...DEFAULTS };
    return {
      // «۰» یا false یعنی خاموش — قراردادِ همیشگیِ پنل: صفر = بی‌اثر.
      enabled: v.enabled === false ? false : true,
      version: Number.isFinite(Number(v.version)) && Number(v.version) > 0
        ? Math.floor(Number(v.version)) : TOUR_VERSION,
    };
  } catch {
    // نبودِ جدول/کلید نباید تور را بشکند: پیش‌فرض روشن است. دلیلِ انتخاب:
    // خاموشیِ ناخواسته یعنی کاربرِ تازه هیچ آموزشی نمی‌بیند و کسی هم
    // نمی‌فهمد چرا.
    return { ...DEFAULTS };
  }
}

/** فایل‌های صدا واقعاً روی دیسک هستند؟ (گاردِ «صدا آماده نیست») */
function audioReady(file) {
  try {
    return fs.existsSync(path.join(AUDIO_DIR, file));
  } catch {
    return false;
  }
}

/**
 * وضعیتِ تور برای یک کاربر.
 *
 * `audioStale` یعنی متنِ زندهٔ سرور با فایلِ ضبط‌شده یکی نیست (ادمین متن
 * را عوض کرده و صدا بازسازی نشده). کلاینت در آن حالت متن را نشان می‌دهد
 * و صدا پخش نمی‌کند.
 */
async function state(userId) {
  const cfg = await config();
  const { rows } = await pool.query(
    `SELECT tour_version, skipped, seen_at FROM user_onboarding_tour WHERE user_id=$1`,
    [userId]).catch(() => ({ rows: [] }));
  const row = rows[0] || null;
  const seen = Boolean(row) && Number(row.tour_version || 0) >= cfg.version;
  return {
    enabled: cfg.enabled,
    version: cfg.version,
    seen,
    skipped: Boolean(row?.skipped),
    seenAt: row?.seen_at || null,
    audioUrlBase: AUDIO_URL_BASE,
    steps: STEPS.map(s => ({
      id: s.id,
      title: s.title,
      text: s.text,
      audio: s.audio,
      // آدرسِ نسبی؛ کلاینت خودش با میزبانِ API جمع می‌کند (وب و اندروید
      // دامنهٔ متفاوتی دارند و آدرسِ مطلق در اپ می‌شکند).
      audioUrl: `${AUDIO_URL_BASE}/${s.audio}`,
      audioReady: audioReady(s.audio),
      audioStale: false,
    })),
  };
}

/** ثبتِ «دیده شد» — با upsert، چون کاربر می‌تواند تور را چند بار ببیند. */
async function markSeen(userId, { version, skipped } = {}) {
  const cfg = await config();
  const v = Number.isFinite(Number(version)) && Number(version) > 0
    ? Math.floor(Number(version)) : cfg.version;
  await pool.query(
    `INSERT INTO user_onboarding_tour (user_id, tour_version, skipped, seen_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET tour_version = GREATEST(user_onboarding_tour.tour_version, EXCLUDED.tour_version),
           skipped = EXCLUDED.skipped,
           seen_at = NOW(),
           updated_at = NOW()`,
    [userId, v, skipped === true]);
  return { ok: true, version: v, seen: true };
}

/** برای «دوباره ببین» از پروفایل: پرچمِ نسخه صفر می‌شود تا تور بازگردد. */
async function reset(userId) {
  await pool.query(
    `INSERT INTO user_onboarding_tour (user_id, tour_version, skipped, seen_at, updated_at)
     VALUES ($1, 0, FALSE, NULL, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET tour_version = 0, skipped = FALSE, seen_at = NULL, updated_at = NOW()`,
    [userId]);
  return { ok: true, seen: false };
}

// فهرستِ سفیدِ نامِ فایل‌ها برای مسیرِ پخشِ صدا: نام از همین فهرست می‌آید،
// نه از ورودیِ کاربر — پس پیمایشِ مسیر (`../`) اصلاً ممکن نیست.
const AUDIO_FILES = Object.freeze(STEPS.map(s => s.audio));

module.exports = {
  TOUR_VERSION,
  STEPS,
  AUDIO_FILES,
  AUDIO_DIR,
  AUDIO_URL_BASE,
  state,
  markSeen,
  reset,
  config,
};
