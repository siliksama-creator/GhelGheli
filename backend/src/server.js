require('dotenv').config();
// رمزگذاریِ فیلدهای مالی (کارت/شبا/حساب قدیمی).
const v8 = require('v8');
const fieldCrypto = require('./lib/fieldCrypto');
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
// شمارنده‌های محدودیتِ نرخ در حالتِ چندپروسه باید مشترک باشند وگرنه هر
// پروسه سطلِ جدا دارد و سقف عملاً «سقف × تعدادِ پروسه» می‌شود (دورِ ردیس
// توضیح کاملش را در rateLimitStore.js داده). وقتی REDIS_URL نباشد، null
// برمی‌گردد و express-rate-limit به حافظهٔ خودش می‌افتد (رفتارِ تک‌پروسه).
const { makeRateStore } = require('./lib/rateLimitStore');
// هر limiterِ ثابت باید نمونهٔ Store اختصاصیِ خودش را بگیرد
// (express-rate-limit نسخهٔ ۷ اشتراکِ یک نمونه را با ERR_ERL_STORE_REUSE رد
// می‌کند). این کمکی یک Store می‌سازد و اگر Redis نبود {} می‌دهد تا limiter به
// storeِ حافظه‌ای پیش‌فرض برگردد.
// ⚠️ برای limiterهایِ دارای reload (opsRateLimit) این helper را استفاده نکنید؛
//    آن‌ها Store ثابت را یک‌بار بالاتر نگه می‌دارند تا بازسازیِ پنجره دوباره
//    Store نسازد.
const rlStore = prefix => { const s = makeRateStore(prefix); return s ? { store: s } : {}; };
// کشِ مشترک با TTL (ردیس اگر باشد، وگرنه حافظهٔ پروسه) برای مسیرهای داغ.
const { cacheGet, cacheSet } = require('./lib/cache');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const { Server } = require('socket.io');
const logger = require('./lib/logger');
const { pool } = require('./config/db');
const { normalizeMobile: _normalizeMobile, faDigits: _faDigits, anonymousNickname: _anonymousNickname, isValidPasswordLength: _isValidPasswordLength } = require('./lib/auth-helpers');
// تنها فهرستِ آواتارها — هم `safeAvatarKey` از آن می‌خواند و هم
// `GET /api/avatars` که «چند مدل آواتار داریم» را از متنِ APK بیرون می‌آورد
// (فاز ۲ نقشه‌راه یکپارچه‌سازی: هیچ عددِ بازاری در متن UI کلاینت نماند).
const avatarKeys = require('./lib/avatarKeys');
const { audit } = require('./services/auditService');
const opsConfig = require('./services/opsConfig');
const recommendedApps = require('./services/recommendedApps');
// شماره معکوسِ شروعِ لیگ — «هرچیزی که سکه می‌دهد بسته، بقیه باز».
const leagueCountdown = require('./services/leagueCountdown');
const opsLimits = require('./services/opsLimits');
const liveContent = require('./services/liveContent');
const {
  createNotification,
  sendSegmented,
  isFirebaseConfigured,
} = require('./services/notificationService');
const gameStakes = require('./services/gameStakeService');
const { ensureActiveSeason, addLeaguePoints, getLeaderboard, closeActiveSeason, closeExpiredSeasons, approvePayouts: leagueApprove, defaultPrizeTable, seedCarryoverFromLatestClosed } = require('./services/leagueService');
const { optimizeUpload, verifyUpload, kb, IMAGE_EXT_RE } = require('./services/imageService');
// ظرفیتِ سخت‌افزاری و سقفِ کارِ سنگین: هم برای نمایش در /health، هم برای اینکه
// هر پروسه بداند سهمش از CPU/رم چقدر است (توضیح کامل در src/lib/capacity.js).
const capacity = require('./lib/capacity');
const { heavyStats } = require('./lib/heavy');
const { getGameRewardSettings, saveGameRewardSettings } = require('./services/gameRewardService');
const walletService = require('./services/walletService');
const referrals = require('./services/referralService');
const wheel = require('./services/wheelService');
const pass = require('./services/passService');
const loginStreak = require('./services/loginStreakService');
const wheelReminder = require('./services/wheelReminderService');
const cardDuel = require('./services/cardDuelService');
// Hoisted with the other services: /api/users/:id/public uses it and sits
// above the shop routes, so a require next to those would read as a
// temporal-dead-zone bug even though route handlers run after startup.
const shop = require('./services/shopService');
const cardBox = require('./services/cardBoxService');
// لولِ دائمیِ بازیکن — کنارِ cosmetics در همان مسیرها پخش می‌شود.
const level = require('./services/levelService');
const chatRetention = require('./services/chatRetentionService');
// سکه — ارزِ مهارتِ لیگ. سهمیهٔ روزانه‌اش در bootstrap پخش می‌شود.
const coins = require('./services/coinService');
// دفترِ سکه — ثبتِ واریزهای بازی‌ها و پایانِ لیگ (خواستهٔ مالک).
const coinLedger = require('./services/coinLedger');
// تنظیماتِ اقتصادِ بازی‌ها (سکهٔ برد/مساوی/باخت، سهمیه، درصدِ انتقالِ
// سکه بین لیگ‌ها، سکهٔ هر لولِ ضربه‌زن) — قابل کنترل از پنل ادمین و
// قابل خواندن توسط کلاینت‌ها از `/api/config` بدونِ آپدیتِ اپ.
const gameEconomy = require('./services/gameEconomyService');
const grants = require('./services/grantService');
// Same reason: the profile endpoint checks club membership before letting
// someone wear a crest, and it is defined above the club routes.
const clubs = require('./services/clubService');
const withdrawalService = require('./services/withdrawalService');
// دفترِ ریزِ امتیازات — تنها نقطهٔ مجازِ تغییرِ امتیاز. توضیحِ کامل در
// `services/pointService.js` و مایگریشنِ ۰۴۵.
const points = require('./services/pointService');
// قانونِ نامِ مستعار (۸ نویسه + فیلترِ فحش) — یک‌جا برای ثبت‌نام و پروفایل.
const nicknamePolicy = require('./lib/nicknamePolicy');
const analytics = require('./services/analyticsService');
const { createPresenceService } = require('./services/presenceService');
// سیگنالِ «لیدربورد لیگ عوض شد»: کش را بی‌اعتبار و رویدادِ سوکت را پخش
// می‌کند تا جدولِ لیگ به‌جای poll ثابت، فقط هنگامِ تغییر تازه شود.
const leaderboardSignal = require('./services/leaderboardSignal');

// Fail fast in production if the JWT secret was never configured — running
// with the 'dev-secret' fallback would let anyone forge valid user/admin
// tokens offline. Local/dev runs still work without a .env file.
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret')) {
  throw new Error('JWT_SECRET باید در production تنظیم شود (backend/.env)');
}

const app = express();
const server = http.createServer(app);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// CORS_ORIGIN must be an explicit comma-separated allow-list in production.
// Previously this fell back to '*' (any origin) whenever the env var was
// missing/empty, which — combined with credentials:true — is an unsafe
// default. Now an unset/empty CORS_ORIGIN simply denies cross-origin
// requests instead of silently allowing everyone.
const corsOrigins = String(process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
const corsOriginOption = corsOrigins.length ? corsOrigins : false;
const io = new Server(server, { cors: { origin: corsOriginOption } });

// The API always runs behind the Nginx reverse proxy on the same host (see
// docs/deployment-fa.md) and the raw Node port is not exposed publicly
// (firewalled), so it is safe to trust only loopback as a proxy. Without
// this, Express falls back to the raw socket address for every request —
// which behind Nginx is always 127.0.0.1 — so express-rate-limit silently
// shares ONE global bucket across every user instead of limiting per-client
// IP, and req.ip / audit logs report the proxy's address instead of the
// real client. See ERR_ERL_UNEXPECTED_X_FORWARDED_FOR in the PM2 logs.
app.set('trust proxy', 'loopback');

app.use(helmet());
app.use(cors({ origin: corsOriginOption, credentials: true }));
app.use(express.json({ limit: '2mb' }));

// ── لاگِ درخواست‌ها: در تولید فقط خطاها ─────────────────────────────────
//
// `morgan('dev')` هر درخواست را با رنگ‌آمیزی ANSI روی stdout می‌نوشت.
// اندازه‌گیری شد (نه حدس): با morgan ۸۸۶ req/s، بدونش ۹۵۱ req/s —
// حدود ۷٪ از توانِ کل سرور صرفِ نوشتنِ لاگی می‌شد که هیچ‌کس نمی‌خواند،
// چون pm2 آن را در فایلی می‌ریزد که فقط موقعِ خرابی باز می‌شود.
//
// ⚠️ لاگ **حذف نشد**، فقط فیلتر شد: در تولید هر پاسخِ >=400 کماکان
//    کامل ثبت می‌شود، پس عیب‌یابیِ خطاها دقیقاً مثل قبل ممکن است.
//    آنچه حذف شد فقط انبوهِ خطوطِ ۲۰۰ است.
//
// در توسعه (`NODE_ENV !== 'production'`) رفتار دست‌نخورده می‌ماند تا
// موقعِ کد زدن همه‌چیز جلوی چشم باشد.
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined', {
    skip: (req, res) => res.statusCode < 400,
  }));
} else {
  app.use(morgan('dev'));
}
const uploadRoot = path.join(__dirname, '..', 'uploads');
const imageUploadDir = path.join(uploadRoot, 'images');
fs.mkdirSync(imageUploadDir, { recursive: true });
// ═══════════════════════════════════════════════════════════════════════════
// قرنطینهٔ فایل‌های غیرتصویریِ ممکن‌مانده از روزگارِ فیلترِ ضعیف‌تر
// ═══════════════════════════════════════════════════════════════════════════
//
// تا این کامیت، فیلترِ آپلود فقط به mimetype اعلامیِ فرستنده اعتماد می‌کرد
// و پسوندِ فایل را دست‌نخورده نگه می‌داشت؛ در نتیجه ممکن است فایل‌های
// .html/.svg/.js از قبل روی دیسک مانده باشند و express.static آن‌ها را با
// Content-Type اجرایی سرو کند. حذفِ آنی هم درست نیست (شاید بررسی‌اش لازم
// باشد) — به‌جایش به uploads/.quarantine منتقل می‌شوند که هیچ مسیری
// سروش نمی‌کند. idempotent است و بعد از این کامیت دیگر چیزی برای
// قرنطینه‌کردن ندارد.
try {
  const DANGEROUS_EXT = /\.(html?|xhtml|svg|js|mjs|xml|css)$/i;
  const quarantineDir = path.join(uploadRoot, '.quarantine');
  let quarantined = 0;
  for (const name of fs.readdirSync(imageUploadDir)) {
    if (!DANGEROUS_EXT.test(name)) continue;
    try {
      fs.mkdirSync(quarantineDir, { recursive: true });
      // پیشوندِ زمانی برای نامِ تکراری در قرنطینه.
      fs.renameSync(
        path.join(imageUploadDir, name),
        path.join(quarantineDir, `${Date.now()}-${name}`),
      );
      quarantined++;
    } catch { /* فایل سرِجایش ماند؛ بعد از فیلترِ تازه فایلِ تازه‌ای اضافه نمی‌شود */ }
  }
  if (quarantined > 0) {
    logger.warn(`[uploads] ${quarantined} فایلِ غیرتصویری به قرنطینه منتقل شد (uploads/.quarantine)`);
  }
} catch { /* پوشهٔ images هنوز وجود ندارد — بی‌خطر */ }
// CROSS-ORIGIN FIX: helmet() sets Cross-Origin-Resource-Policy: same-origin
// by default. The API is on api.ghelghelishop.ir but the web app runs on
// user.ghelghelishop.ir, so every uploaded card image / ticket attachment was
// BLOCKED by the browser (net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin) and
// silently failed to render. Static assets are public images, so mark them
// cross-origin readable. Caching is added here too: these files are content
// -addressed (timestamped filenames) and never change once written.
const publicAssetHeaders = (res) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
};
// ═══════════════════════════════════════════════════════════════════════════
// بندانگشتیِ درخواستی — رفعِ کندیِ بارگذاریِ تصویر
// ═══════════════════════════════════════════════════════════════════════════
//
// ── گزارشِ مالک ──
//   «بطور کلی سرعتی لود عکس و همه چیز توی اپلیکیشن هم پایینه»
//
// ── اندازه‌گیریِ واقعی روی سرور ──
//   ۱۳۱ فایل در `uploads/images`، جمعاً ۹٫۹MB، میانگین ۱۵۳KB.
//   بزرگ‌ترین‌ها: ۳٫۷MB · ۳٫۴MB · ۲٫۵MB (PNGهای خام).
//   نمونهٔ کارت: ۹۹۶×۱۵۷۸ پیکسل و ۱۳۷KB.
//
// ولی همان کارت در قفسهٔ انتخاب با عرضِ **۱۳۰px** نمایش داده می‌شود.
// یعنی کاربر ~۹۰٪ بایت‌ها را برای پیکسل‌هایی دانلود می‌کند که هرگز
// دیده نمی‌شوند. روی موبایلِ ایران با ۴G، صفحهٔ کلکسیون یعنی چند
// مگابایت ترافیک.
//
// ── راه‌حل: پارامترِ `?w=` ──
//   /uploads/images/x.webp        → فایلِ اصلی (دست‌نخورده)
//   /uploads/images/x.webp?w=320  → نسخهٔ ۳۲۰px، WebP کیفیت ۷۸
//
// نتیجه روی دیسک کش می‌شود، پس هزینهٔ تبدیل فقط یک‌بار است.
//
// ⚠️ عرض‌های مجاز محدودند تا کسی با `?w=1..4000` سرور را وادار به
//    تولیدِ هزاران فایل نکند (حملهٔ پرکردنِ دیسک).
const THUMB_WIDTHS = new Set([160, 240, 320, 480, 640]);
const thumbRoot = path.join(uploadRoot, '.thumbs');
try { fs.mkdirSync(thumbRoot, { recursive: true }); } catch { /* ignore */ }
// چند کلاینت که یک کارت تازه را هم‌زمان باز می‌کنند نباید چند sharp روی
// یک خروجی راه بیندازند. job بر اساس «عرض+نام» مشترک می‌شود.
const thumbnailJobs = new Map();
async function ensureThumbnail(src, out, width) {
  if (fs.existsSync(out) && fs.statSync(out).size > 0) return;
  const key = `${width}:${path.basename(src)}`;
  const running = thumbnailJobs.get(key);
  if (running) return running;
  const job = (async () => {
    const tmp = `${out}.${process.pid}-${Math.random().toString(36).slice(2)}.tmp`;
    try {
      const sharp = require('sharp');
      await sharp(src)
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(tmp);
      if (fs.existsSync(out)) fs.unlinkSync(tmp);
      else fs.renameSync(tmp, out);
    } finally {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {/* ignore */}
      thumbnailJobs.delete(key);
    }
  })();
  thumbnailJobs.set(key, job);
  return job;
}

app.get('/uploads/images/:file', async (req, res, next) => {
  const width = Number(req.query.w);
  if (!THUMB_WIDTHS.has(width)) return next();       // بدونِ ?w → فایلِ اصلی
  const name = String(req.params.file || '');
  // ⚠️ محافظِ پیمایشِ مسیر: بدونِ این، `?w=320` روی نامِ `../../etc/x`
  //    می‌توانست هر فایلی را بخواند.
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return next();
  const src = path.join(uploadRoot, 'images', name);
  if (!src.startsWith(path.join(uploadRoot, 'images'))) return next();
  if (!fs.existsSync(src)) return next();

  const out = path.join(thumbRoot, `${width}-${name}.webp`);
  try {
    await ensureThumbnail(src, out, width);
    publicAssetHeaders(res);
    res.type('image/webp');
    return fs.createReadStream(out).pipe(res);
  } catch (err) {
    // اگر sharp نبود یا فایل خراب بود، اصلِ تصویر سرو می‌شود — هرگز
    // خطای ۵۰۰ به کاربر نمی‌دهیم، فقط کندتر می‌شود.
    logger.error('[thumb] failed:', err.message);
    return next();
  }
});

app.use('/uploads', express.static(uploadRoot, { setHeaders: publicAssetHeaders }));
app.use('/public', express.static(path.join(__dirname, '..', 'public'), { setHeaders: publicAssetHeaders }));
// استیکرهای چت: جدول chat_stickers آدرس نسبیِ /stickers/… دارد و **هر دو
// کلاینت** آن را به دامنهٔ API می‌چسبانند (وب تابع asset() و اندروید
// _stickerUrl هر دو پایهٔ api. هستند). قبلاً فایل‌ها فقط روی هاستِ وب
// کاربری بودند، پس از سمتِ API چهار۰۴ می‌گرفتند و استیکر (هم در کشوی
// انتخاب، هم در حباب پیام) روی هر دو پلتفرم شکسته بود. این مانت همان
// فایل‌ها را از public/stickers سرور سرو می‌کند — مسیرِ دیتابیس دست
// نمی‌خورد و فایل‌ها با ریپو می‌آیند.
app.use('/stickers', express.static(path.join(__dirname, '..', 'public', 'stickers'), { setHeaders: publicAssetHeaders }));
// مستندات Swagger.
//
// AUDIT: این مسیر برای همه باز بود و کل سطح API (از جمله مسیرهای مدیریتی
// و کیف پول) را به هر بازدیدکننده‌ای نشان می‌داد. خودِ مستندات راز نیست،
// ولی نقشهٔ کاملِ آماده برای کسی که دنبال نقطهٔ ورود می‌گردد هم لازم نیست
// رایگان باشد. در production پشت یک هدر ساده می‌رود؛ در توسعه باز است.
//
// (آسیب‌پذیری yamljs که npm audit گزارش می‌کند اینجا قابل بهره‌برداری
// نیست: فقط همین فایل ثابتِ خودمان هنگام بوت پارس می‌شود و هیچ ورودی
// کاربری به آن نمی‌رسد.)
const docsGuard = (req, res, next) => {
  if (process.env.NODE_ENV !== 'production') return next();
  const key = process.env.DOCS_ACCESS_KEY;
  if (!key) return res.status(404).json({ message: 'یافت نشد' });
  const given = req.query.key || req.headers['x-docs-key'];
  if (given === key) return next();
  return res.status(404).json({ message: 'یافت نشد' });
};
app.use('/docs', docsGuard, swaggerUi.serve, swaggerUi.setup(YAML.parse(fs.readFileSync(path.join(__dirname, '..', 'docs/openapi.yaml'), 'utf8'))));
// ── فیلترِ پسوندِ آپلود ──────────────────────────────────────────────────
//
// SECURITY (ممیزی دورِ ۲۳): پسوندِ «فایلِ ذخیره‌شده» همان پسوندِ فرستنده
// است. فیلترِ قبلی فقط به mimetype اعلامیِ multipart اعتماد می‌کرد — که
// سمتِ کلاینت است و جعلش هزینه‌ای ندارد — پس فایلِ evil.html با اعلامِ
// دروغینِ image/png رد می‌شد، در optimizeUpload (که برای محتوای غیرتصویری
// شکست می‌خورد و به‌خاطر «عکسِ کند بهتر از عکسِ گم‌شده است» اصلِ فایل را
// نگه می‌دارد) دست‌نخورده می‌ماند و بعد express.static آن را با Content-Type
// بر اساسِ پسوند — یعنی text/html یا image/svg+xml — سرو می‌کرد: XSSِ
// ذخیره‌شده روی دامنهٔ API. حالا پسوندِ نامِ فایل هم باید تصویری باشد
// (IMAGE_EXT_RE از imageService — همان یک تعریف، همیشه هم‌خوان). فایلِ
// بی‌پسوند رد نمی‌شود؛ محتوایش را verifyUpload بعد از نوشتن با sharp
// راستی‌آزمایی می‌کند و در صورتِ خرابی همان‌جا حذف و ۴۰۰ می‌شود.
const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, imageUploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  // 12 MB: modern phone photos routinely exceed 5 MB. The server re-encodes
  // every upload straight away, so what actually gets stored stays small.
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const declaredImage = /^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype);
    const ext = path.extname(file.originalname || '').toLowerCase();
    // پسوندِ خالی = «نامشخص»؛ محتوا بعداً با sharp چک می‌شود.
    cb(null, declaredImage && (!ext || IMAGE_EXT_RE.test(ext)));
  },
});

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
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

async function getChatMinLifetimePoints(client = pool) {
  const { rows } = await client.query("SELECT value FROM app_settings WHERE key='chat_min_lifetime_points' LIMIT 1");
  const raw = rows[0]?.value;
  const n = Number(typeof raw === 'object' && raw !== null ? raw.value : raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}
async function getChatCooldownSeconds(client = pool) {
  const { rows } = await client.query("SELECT value FROM app_settings WHERE key='chat_message_cooldown_seconds' LIMIT 1");
  const raw = rows[0]?.value;
  const n = Number(typeof raw === 'object' && raw !== null ? raw.value : raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 5;
}
async function getLeagueWinnerCount(client = pool) {
  const { rows } = await client.query("SELECT value FROM app_settings WHERE key='league_winner_count' LIMIT 1");
  const raw = rows[0]?.value;
  const n = Number(typeof raw === 'object' && raw !== null ? raw.value : raw);
  return Number.isFinite(n) && n > 0 ? Math.min(300, Math.floor(n)) : 10;
}
async function ensureChatCooldown(userId) {
  const cooldown = await getChatCooldownSeconds();
  if (!cooldown) return { cooldown, remaining: 0 };
  const { rows } = await pool.query('SELECT sent_at FROM chat_messages WHERE user_id=$1 ORDER BY sent_at DESC LIMIT 1', [userId]);
  if (!rows[0]) return { cooldown, remaining: 0 };
  const diff = (Date.now() - new Date(rows[0].sent_at).getTime()) / 1000;
  const remaining = Math.ceil(cooldown - diff);
  return { cooldown, remaining: remaining > 0 ? remaining : 0 };
}
// Treats an empty-string image field as "unchanged". Without this, any admin
// form that submits a blank picture input silently ERASES the stored image
// (COALESCE only guards against NULL/undefined, not ''). Pass null to clear
// an image on purpose.
function keepImage(v) { return v === '' ? undefined : v; }
// Parses a Toman amount coming from an admin form. Returns undefined when the
// field was simply not submitted (so COALESCE keeps the stored value), and
// throws on garbage rather than letting NaN reach a BIGINT column as a 500.
function cashAmountInput(v) {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) {
    throw Object.assign(new Error('مبلغ نقدی باید عددی صحیح و مثبت باشد'), { status: 400 });
  }
  if (n > 100000000000) {
    throw Object.assign(new Error('مبلغ نقدی خارج از محدودهٔ مجاز است'), { status: 400 });
  }
  return n;
}
function maskSecret(v) { if (!v) return ''; const s=String(v); return s.length <= 4 ? '****' : `${s.slice(0,2)}****${s.slice(-2)}`; }
// Strips whitespace, punctuation and invisible/zero-width Unicode
// characters before comparing against the bad-word list. Previously only
// \u200c (ZWNJ, used legitimately in Persian text) was stripped, so a
// message like "f\u200bu\u200bc\u200bk" (zero-width SPACE, \u200b, not
// ZWNJ) sailed straight through the filter untouched. \u200b/\u200d/\uFEFF
// are never meaningful in normal chat text, so it's safe to always strip
// them for the purposes of this check (the stored/displayed message is
// untouched — only this comparison copy is normalized).
function normalizeChatText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\u200b\u200c\u200d\uFEFF]/g, '')
    .replace(/[\s_\-.]+/g, '');
}
// Admin-pinned chat announcement. Kept in app_settings (not chat_messages)
// so it can't be replied to/liked/reported like a normal message.
const PIN_ACCENTS = ['gold', 'green', 'blue', 'red'];
async function getChatPinnedMessage(client = pool) {
  const { rows } = await client.query("SELECT value FROM app_settings WHERE key='chat_pinned_message' LIMIT 1");
  const v = rows[0]?.value;
  if (!v || typeof v !== 'object') return { text: '', accent: 'gold', active: false };
  return {
    text: String(v.text || ''),
    accent: PIN_ACCENTS.includes(v.accent) ? v.accent : 'gold',
    active: Boolean(v.active) && String(v.text || '').trim().length > 0,
    pinnedAt: v.pinnedAt || null,
    pinnedBy: v.pinnedBy || null,
  };
}

async function getChatBadWords(client = pool) {
  const { rows } = await client.query("SELECT value FROM app_settings WHERE key='chat_bad_words' LIMIT 1");
  const raw = rows[0]?.value;
  return Array.isArray(raw) ? raw.map(w => String(w).trim()).filter(Boolean) : [];
}
async function assertNoBadWords(text) {
  const words = await getChatBadWords();
  if (!words.length) return;
  const normalized = normalizeChatText(text);
  const hit = words.find(w => normalizeChatText(w) && normalized.includes(normalizeChatText(w)));
  if (hit) {
    const err = new Error('پیام شامل کلمات غیرمجاز است');
    err.status = 400;
    throw err;
  }
}

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

// ── /health ──────────────────────────────────────────────────────────────
//
// سلامتِ سرویس + «این پروسه چقدر از سخت‌افزار را می‌بیند و چقدر استفاده
// می‌کند». قبلاً فقط `{ok:true,name}` بود؛ یعنی هیچ‌جا نمی‌شد فهمید سرور
// با چند هسته بالا آمده و صفِ کارِ سنگین چقدر شلوغ است.
//
// نکتهٔ امنیتی: جزئیات (هسته، رم، صف) فقط برای درخواستِ مستقیمِ داخلی
// برگردانده می‌شود. درخواستِ بیرونی همیشه از nginx می‌آید و
// `X-Forwarded-For` دارد؛ برای آن فقط پاسخِ کمینه برمی‌گردد تا شمارِ هسته و
// بارِ سرور برای غریبه‌ها لو نرود. اسکریپت‌های مانیتورینگ سرور که
// `curl 127.0.0.1:PORT/health` می‌زنند، جزئیات را می‌بینند.
//
// `ok:true` همیشه فیلدِ **اولِ** پاسخ است چون دو اسکریپتِ مانیتورینگِ سرور
// خروجی را با `grep '"ok":true'` بررسی می‌کنند (health.sh و
// ghelgheli-healthcheck.sh). ترتیبِ کلیدها را عوض نکنید.
// سقفِ heap را از فلگِ اجرای همین پروسه می‌خواند (هم execArgv هم NODE_OPTIONS).
// null یعنی «هیچ سقفی پاس نشده» — همان باگی که ۱۷ شهریور روی تولید دیده شد.
function maxOldSpaceMb() {
  const fromEnv = String(process.env.NODE_OPTIONS || '').split(/\s+/);
  for (const a of [...process.execArgv, ...fromEnv]) {
    const m = /^--max-old-space-size=(\d+)$/.exec(String(a).trim());
    if (m) return Number(m[1]);
  }
  return null;
}

const healthIsInternal = (req) =>
  !req.headers['x-forwarded-for']
  && /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/.test(req.socket.remoteAddress || '');

app.get('/health', (req, res) => {
  const base = { ok: true, name: 'GhelGheli API' };
  if (!healthIsInternal(req)) return res.json(base);

  const cap = capacity.detect();
  const mem = process.memoryUsage();
  return res.json({
    ...base,
    role: process.env.PROCESS_ROLE || 'game',
    port: Number(process.env.PORT) || null,
    pid: process.pid,
    uptimeSec: Math.round(process.uptime()),
    // پروفایلِ سخت‌افزاری که این پروسه خودش تشخیص داده — همان چیزی که
    // تعداد پروسه‌ها و سقفِ کارِ سنگین از آن می‌آید.
    capacity: {
      cores: cap.cores,
      memTotalMB: cap.memTotalMB,
      procs: cap.procs,
      vision: cap.vision,
      uv: cap.uv,
      poolMax: cap.poolMax,
      // بودجهٔ رم: این سه عدد نشان می‌دهند پروسه «چقدر جا دارد». تا امروز
      // `heapMB` فقط داخلِ کد بود و کسی از بیرون نمی‌توانست ببیند واقعاً
      // اعمال شده یا نه — که نشده بود (پایین را ببینید).
      reserveMB: cap.reserveMB,
      memForAppMB: cap.memForAppMB,
      heapMB: cap.heapMB,
      memRestartMB: cap.memRestartMB,
      forced: cap.forced || undefined,
    },
    // ── اثباتِ سقفِ heap ────────────────────────────────────────────────
    // چرا این‌جاست: `ecosystem.config.cjs` مدتی `node_args:
    // --max-old-space-size=…` می‌داد و پنلِ PM2 هم همان را نشان می‌داد، ولی
    // پروسهٔ واقعی **بدونِ آن فلگ** بالا می‌آمد (PM2 7 در حالتِ fork آن را
    // پاس نمی‌داد). یعنی سقفِ حافظه فقط روی کاغذ وجود داشت و V8 تا سقفِ
    // پیش‌فرض (چند گیگ) رشد می‌کرد؛ در نتیجه به‌جای GCِ به‌موقع، پروسه به
    // سقفِ ری‌استارتِ PM2 می‌خورد و **وسطِ کار** ری‌استارت می‌شد.
    // حالا `NODE_OPTIONS` هم ست می‌شود و این دو عدد از داخلِ خودِ پروسه
    // خوانده می‌شوند؛ اگر روزی باز خراب شود، همین‌جا معلوم است.
    runtime: {
      node: process.version,
      execArgv: process.execArgv,
      // سقفِ *خواسته‌شده* — از فلگِ خودِ پروسه خوانده می‌شود (اگر روزی کسی
      // NODE_OPTIONS را بردارد، این null می‌شود و فوراً معلوم است).
      maxOldSpaceMB: maxOldSpaceMb(),
      // سقفِ *واقعیِ V8*. همیشه کمی بالاتر از maxOldSpaceMB است (V8 فضای
      // جوان/کد را روی آن اضافه می‌کند — روی این سرور ۹۲۳ → ~۱۱۱۵). پس این
      // دو عدد را نباید مساوی انتظار داشت؛ معنی‌دار این است که
      // maxOldSpaceMB == capacity.heapMB باشد و v8HeapLimitMB هم نزدیکش
      // بماند (نه چند گیگِ پیش‌فرض).
      v8HeapLimitMB: Math.round(v8.getHeapStatistics().heap_size_limit / 1048576),
    },
    // صفِ کارِ سنگین: اگر `queued` پیوسته بالا بماند یعنی سرور به سقف رسیده
    // و وقتِ ارتقا/افزودنِ هسته است (نقطهٔ تصمیمِ عینی، نه حدس).
    heavy: heavyStats(),
    // وضعیتِ رمزگذاریِ فیلدهای مالی. `enabled:false` روی سرورِ تولید یعنی
    // FIELD_ENCRYPTION_KEY تنظیم نشده و شمارهٔ کارت‌ها متنِ ساده ذخیره
    // می‌شوند — همان چیزی که باید بفهمیم، نه اینکه حدس بزنیم.
    // `failures` شمارندهٔ مقدارهایی است که با کلیدِ فعلی باز نشدند.
    fieldCrypto: fieldCrypto.status(),
    memMB: {
      rss: Math.round(mem.rss / 1048576),
      heapUsed: Math.round(mem.heapUsed / 1048576),
    },
  });
});

// Strips everything the client must never see. The bank card number is as
// sensitive as the password hash: /api/profile is fetched on every app start
// and ends up in HTTP caches, crash reports and debug logs, so the full PAN
// is replaced by a masked form. The only endpoint that returns the real
// number is the admin withdrawal list (behind adminAuth), because the admin
// physically has to make the transfer.
function safeUser(u) {
  // ستون‌های خام بیرون نمی‌روند (چون رمزشده‌اند و به‌کارِ کلاینت نمی‌آیند)؛
  // به‌جایشان نسخهٔ ماسک‌شدهٔ **بازشده** برگردانده می‌شود.
  const { password_hash, bank_card_number, bank_card_sheba, ...rest } = u;
  const cardNumber = fieldCrypto.decrypt(bank_card_number);
  const cardSheba = fieldCrypto.decrypt(bank_card_sheba);
  return {
    ...rest,
    // `bank_account` (ستون قدیمی و آزاد) هم رمز می‌شود؛ در پاسخ رمزشده
    // نمی‌فرستیمش، متنِ ساده‌اش می‌فرستیم (صاحبِ حساب خودِ کاربر است).
    bank_account: rest.bank_account ? fieldCrypto.decrypt(rest.bank_account) : rest.bank_account,
    wallet_balance: Number(rest.wallet_balance || 0),
    bank_card_masked: cardNumber ? walletService.maskCard(cardNumber) : null,
    bank_card_sheba_masked: cardSheba ? `${cardSheba.slice(0, 6)}••••${cardSheba.slice(-4)}` : null,
    has_bank_card: Boolean(cardNumber),
  };
}

// ── Input validation helpers ──────────────────────────────────────────────

/// Every `:id` in this API is a Postgres UUID. Passing a non-UUID straight to
/// a query makes Postgres raise 22P02, which surfaced as a **500 Server
/// Error** — telling the client "we broke" when the truth is "you sent
/// nonsense". Proven live: GET /api/support/tickets/abc/messages returned 500.
/// Worse, it burns a database round trip and a pool connection on garbage,
/// which is a cheap denial-of-service lever.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/// Express middleware factory: rejects malformed ids before any query runs.
const validateUuid = (...names) => (req, res, next) => {
  for (const n of names) {
    const v = req.params[n];
    if (v !== undefined && !UUID_RE.test(String(v))) {
      return res.status(400).json({ message: 'شناسه ارسالی معتبر نیست' });
    }
  }
  next();
};

/// Clamp a user-supplied integer into a safe range.
/// `?limit=99999999` used to be accepted verbatim by anything that trusted
/// it, which is how one request can ask the database for the whole table.
function intInRange(value, { min, max, fallback }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/// Trim and hard-cap a free-text field. Postgres raises 22001 on overflow,
/// which reached the user as a 500 instead of a clear "too long" message.
function boundedText(value, max) {
  if (value === undefined || value === null) return null;
  const t = String(value).trim();
  if (!t) return null;
  return t.slice(0, max);
}

/// Whitelist of bundled avatar keys. The API previously stored ANY string,
/// so `profileAvatarKey: "../../etc/passwd"` was accepted with a 200 and then
/// interpolated straight into an asset path by the clients
/// (mobile/lib/core/assets.dart: 'assets/avatars/$key'). That is a path
/// traversal waiting for a client that resolves it.
// The list itself moved to `src/lib/avatarKeys.js` (فاز ۲) so the *count* can
// be served to the clients — `GET /api/avatars` and `avatars` in /api/config —
// instead of being frozen inside the APK text («۱۰ مدل اختصاصی»). The Set
// stays bound here because `safeAvatarKey` runs on every profile write.
const AVATAR_KEYS = avatarKeys.AVATAR_KEYS;
/// A club crest may also be a profile picture, stored as `club:<slug>`. The
/// slug is bounded to the same characters the shop generates, so this stays a
/// whitelist — it can never resolve to a path segment.
const CLUB_AVATAR_RE = /^club:[a-z0-9_]{1,40}$/;

const safeAvatarKey = (v) => {
  if (!v) return null;
  const s = String(v);
  if (AVATAR_KEYS.has(s)) return s;
  // NOTE: this only validates the SHAPE. Whether the user is actually a
  // member of that club is enforced in shopService.useClubAvatar and swept
  // by clubService.clearOrphanedCosmetics; the generic profile endpoint must
  // not become a way to wear a crest you never joined.
  return CLUB_AVATAR_RE.test(s) ? s : null;
};

/// Only accept an image URL we ourselves produced, or a plain https URL.
/// Blocks `javascript:` and `data:` payloads from reaching a webview.
function safeImageUrl(v) {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  if (!t) return null;
  if (t.startsWith('/uploads/') || t.startsWith('/public/')) return t.slice(0, 400);
  if (/^https:\/\//i.test(t)) return t.slice(0, 400);
  return null;
}

// Authentication and account registration.
app.use('/api', require('./routes/auth')({
  pool, asyncHandler, otpLimiter, otpVerifyLimiter, userLoginLimiter,
  otpMobileLimiter, otpDailyLimiter, userAccountLimiter,
  bcrypt, normalizeMobile, referrals, createNotification, faDigits,
  signUser, safeUser, safeAvatarKey, safeImageUrl, boundedText, intInRange,
  anonymousNickname, isValidPasswordLength,
}));

// ═══════════════════════════════════════════════════════════════════════════
// «ثبت کد کارت» قدیمی حذف شد (مایگریشن ۰۸۰ جدولِ card_codes را برداشت).
// ثبتِ کارتِ واقعی فقط از مسیرِ «کارت با عکس» (photoCards.js) می‌گذرد.
// ═══════════════════════════════════════════════════════════════════════════

// ── Tap game ───────────────────────────────────────────────────────────────
// Progress is reported in signed BATCHES, never one tap per request: a
// per-tap endpoint is both chatty and trivially replayable. All validation
// (signature, replay, plausibility) lives in tapGameService — see the header
// comment there for the full threat model.
const tapGame = require('./services/tapGameService');

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

// ═══════════════════════════════════════════════════════════════════════════
// `/api/coins/quota` حذف شد (چرخهٔ ۲۴): هیچ کلاینتی صدایش نمی‌زد —
// سهمیهٔ سکه در bootstrap هست و بعد از هر بازی هم کلاینت‌ها `/api/level`
// را می‌خوانند. یک کوئریِ بی‌مصرف فقط سطحِ حمله را زیاد می‌کرد.

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
// Reward groups: the user-facing catalogue with per-group progress.
const rewardGroups = require('./services/rewardGroupService');

// Buying spends from the wallet, so it is rate-limited like other money paths.
const shopLimiter = rateLimit({
  windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { message: 'تعداد درخواست‌ها زیاد است؛ کمی صبر کن' },
});

// ── خرید: مرحلهٔ ۱ (ساخت سفارش) ───────────────────────────────────────
//
// این روت‌ها دیگر چیزی نمی‌فروشند؛ فقط سفارشِ pending می‌سازند و شناسهٔ
// محصولِ کافه‌بازار را برمی‌گردانند تا کلاینت پنجرهٔ پرداخت را باز کند.
// تحویلِ واقعی فقط در `/api/purchase/verify` و پس از تأیید بازار.
//
// ── کیف پول (دورِ ۲۲) ──
//
// اگر کلاینت `useWallet: true` بفرستد، موجودیِ کیف پول اول خرج می‌شود:
// کافی باشد کالا همان‌جا تحویل می‌شود (پاسخ `settled: true` و بدونِ
// `productId`)، و اگر کافی نباشد سهمش کسر و باقی از بازار گرفته
// می‌شود. بدونِ این پرچم، رفتار دقیقاً مثل قبل و ۱۰۰٪ بازاری است.
//
// کلاینت باید `settled` را ببیند: اگر true بود نباید پنجرهٔ پرداخت را
// باز کند.

// `/api/rewards/claims/me` حذف شد (چرخهٔ ۲۴): بدون مصرف‌کننده در هر سه
// کلاینت؛ وضعیتِ ادعاها (claimed/status) از /api/reward-groups می‌آید و
// ادعای تکراری هم با قفلِ تراکنشیِ rewardGroupService بسته شده است.

// ===========================================================================
//  کیف پول تومانی — مسیرهای کاربر
// ===========================================================================

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

// نقطهٔ اتصال گردونهٔ شانس (طراحی UI بعداً انجام می‌شود).
//
// عمداً به‌صورت یک تابع سرویس و نه یک endpoint عمومی نوشته شده: اگر مسیری
// مثل POST /api/wheel/spin وجود داشته باشد که مبلغ را از بدنهٔ درخواست
// بگیرد، هر کاربری می‌تواند با curl هر مبلغی برای خودش واریز کند. وقتی
// منطق گردونه ساخته شد، باید مبلغ را **سمت سرور** از روی جدول جوایز گردونه
// تعیین کند و بعد این تابع را صدا بزند:
//
//   await creditWheelPrize(userId, amount, spinId)
//
// spinId مرجع یکتاست و تضمین می‌کند یک چرخش دو بار پول ندهد.
async function creditWheelPrize(userId, amount, spinId, label = 'جایزهٔ گردونهٔ شانس') {
  const result = await walletService.creditStandalone({
    userId,
    amount,
    source: 'wheel',
    referenceType: 'wheel_spins',
    referenceId: spinId,
    description: label,
  });
  if (!result.duplicate) {
    createNotification(
      userId,
      'wallet',
      'برندهٔ گردونه شدی',
      `${Number(amount).toLocaleString('en-US')} تومان به کیف پول شما اضافه شد.`,
    ).catch(() => {});
  }
  return result;
}
module.exports.creditWheelPrize = creditWheelPrize;

// ── گردونهٔ شانس ──────────────────────────────────────────────────────────
//
// دقیقاً همان هشداری که بالای creditWheelPrize نوشته شده بود رعایت می‌شود:
// هیچ مبلغی از بدنهٔ درخواست خوانده نمی‌شود. کلاینت فقط می‌گوید «چرخاندم»؛
// جایزه را wheelService از روی جدول وزن‌دار سرور انتخاب می‌کند.

// محدودکنندهٔ نرخ: سهمیهٔ روزانه و قید یکتای دیتابیس کار اصلی را می‌کنند،
// ولی این جلوی کوبیدن endpoint را می‌گیرد — هر تلاش یک تراکنش با قفل ردیف
// باز می‌کند و بدون این، یک اسکریپت می‌تواند ردیف کاربر را قفل نگه دارد.
const wheelLimiter = opsRateLimit('wheel',
  { windowMs: 60_000, limit: 20 },
  { keyGenerator: perUserKey, message: { message: 'تعداد درخواست‌ها زیاد است، کمی صبر کن' } });

// اعمالِ بی‌درنگِ تغییرِ سقف‌ها از پنل: با هر ذخیره، instanceهای تازه
// ساخته می‌شوند (سطل‌های قدیمی صفر می‌شوند — برای تغییرِ نادرِ ادمین
// بی‌ضرر و از رفتارِ نیمه‌اعمال‌شده بهتر است).
opsLimits.onChange(() => {
  for (const l of [chatLimiter, tapBatchLimiter, cardDuelLimiter,
    withdrawalLimiter, wheelLimiter]) {
    l.reload();
  }
});

// `/api/wheel/count` حذف شد (چرخهٔ ۲۴): هر دو کلاینت نوارِ گردونه را از
// GET /api/wheel (که spinsLeft دارد) می‌سازند؛ شمارندهٔ جدا فقط یک مسیرِ
// تکراریِ احراز‌شده بود.

async function isAllowedChatMessage(text, userId) {
  if (!text || !String(text).trim()) return false;
  const clean = String(text).trim();
  if (cannedMessages().includes(clean)) return true;
  // Allow single emoji or emoji sequences (up to 16 emoji chars)
  const emojiRegex = /^[\p{Extended_Pictographic}\p{Emoji}\p{Emoji_Component}\p{Emoji_Modifier}\p{Emoji_Modifier_Base}\p{Emoji_Presentation}\u2600-\u27BF\u2B50\u2764\uFE0F\u200D\s]+$/u;
  if (emojiRegex.test(clean) && clean.length <= 20) return true;
  // Paid packs remain controlled: only exact server-seeded phrases owned by
  // this user are accepted. Purchasing never enables arbitrary free text.
  return Boolean(userId && await shop.isEmoteAllowed(userId, clean));
}

const DEFAULT_CANNED_MESSAGES = Object.freeze([
  "سلام بچه‌ها!",
  "من اومدم!",
  "بازی خیلی باحال بود!",
  "خوشبختم دوستان!",
  "کی پایه بازیه؟",
  "عالی بود!",
  "خیلی خفن بود!",
  "موفق باشی!",
  "چه خبر بچه‌ها؟",
  "خداحافظ تا بعد!",
  "مواظب خودتون باشید!",
  "کسی کد جدید داره؟",
  "وای چقدر خنده‌دار بود!",
  "تبریک میگم!",
  "میشه کمکم کنید؟",
  "ممنون از شما!",
  "شما تو کدوم لیگ هستید؟",
  "چقدر امتیازم بالا رفت!",
  "کارت جدید پیدا کردم!",
  "امروز روز منه!",
  "ایول به همگی!",
  "دوباره امتحان می‌کنم!",
  "شگفت‌انگیز بود!",
  "کجا زندگی می‌کنید؟",
  "امروز چیکار کردید؟",
  "من عاشق این بازی‌ام!",
  "بریم برای برد!",
  "منم می‌خوام بازی کنم!",
  "بزن بریم بازی!",
  "آماده‌ای برای مسابقه؟",
  "این دست من می‌برم!",
  "بازی عالی بود!",
  "دوباره بازی کنیم؟",
  "کارت خفن گرفتم!",
  "حریف قوی می‌خوام!",
  "پنالتی رو دریبل کردم!",
]);

// پیام‌های آمادهٔ چت از پنل ادمین قابل ویرایش‌اند (chat_canned_messages)؛
// آرایهٔ بالا فقط پیش‌فرض است تا رفتار بدونِ تنظیم مثل قبل بماند.
// ── استیکرهای چت ─────────────────────────────────────────────────────────
// فهرست و اعتبارسنجی از جدولِ chat_stickers. image_url نسبی است:
// وب همان دامنه را می‌گیرد و اندروید baseUrl خودش را پیشوند می‌کند —
// پس افزودن/حذفِ استیکر فقط یک ردیفِ دیتابیس می‌خواهد و هیچ کلاینتی
// آپدیت نمی‌شود.
async function activeStickers() {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, image_url, sticker_type
         FROM chat_stickers WHERE is_active = TRUE
        ORDER BY created_at, title`);
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      url: r.image_url,
      type: r.sticker_type,
    }));
  } catch {
    // استیکر هرگز نباید چت را بشکند؛ در بدترین حالت فهرست خالی است.
    return [];
  }
}

async function activeStickerById(id) {
  if (!id || !UUID_RE.test(String(id))) return null;
  try {
    const { rows } = await pool.query(
      `SELECT id, title, image_url, sticker_type
         FROM chat_stickers WHERE id=$1 AND is_active = TRUE`, [id]);
    return rows[0] || null;
  } catch {
    return null;
  }
}

function cannedMessages() {
  const v = opsConfig.syncGet('chat_canned_messages');
  if (!Array.isArray(v) || v.length === 0) return DEFAULT_CANNED_MESSAGES;
  return v
    .map((x) => String(x).trim())
    .filter((x) => x.length > 0 && x.length <= 80)
    .slice(0, 60);
}

// ── Support tickets ───────────────────────────────────────────────────────
// Rules:
//   * one OPEN ticket at a time, and at most one NEW ticket per calendar day
//   * while a ticket is open the user replies inside that thread instead
//   * only an admin can close it, which frees the user to open a new one
//   * every message may carry 1..5 image attachments
// سقفِ ضمیمهٔ هر تیکت و سهمیهٔ تیکتِ روزانه حالا **زنده**اند
// (live_rules.maxTicketAttachments / ticketsPerDay). تابع برمی‌گردانیم نه
// ثابت، تا اگر ادمین از پنل سقف را عوض کند، همان درخواستِ بعدی سقفِ
// تازه را ببیند.
const ticketMaxAttachments = () => liveContent.rules().maxTicketAttachments;
const ticketsPerDay = () => liveContent.rules().ticketsPerDay;

// Accepts an array of upload URLs previously returned by the upload route.
// Anything that isn't one of our own /uploads/ paths is rejected so a caller
// can't smuggle in an arbitrary external URL.
function sanitizeAttachments(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const raw of input) {
    const v = String(raw || '').trim();
    if (!v) continue;
    // SECURITY (ممیزی دورِ ۲۳): پسوندِ فایل هم باید تصویری باشد. قبلاً هر
    // مسیری زیر /uploads/images/ با هر پسوندی پذیرفته می‌شد — از جمله
    // .html/.svg که (قبل از سخت‌گیریِ فیلترِ آپلود) می‌شد فایلِ حمله را
    // به‌عنوان پیوستِ تیکت به کاربر/ادمین نشان داد. حالا فقط همان
    // پسوندهایی که فیلترِ multer می‌پذیرد.
    if (!/^\/uploads\/images\/[A-Za-z0-9._-]+\.(png|jpe?g|webp|gif)$/i.test(v)) {
      const err = new Error('یکی از پیوست‌ها معتبر نیست');
      err.status = 400;
      throw err;
    }
    out.push(v);
    const maxAtt = ticketMaxAttachments();
    if (out.length > maxAtt) {
      const err = new Error(`حداکثر ${maxAtt} عکس می‌توانید ارسال کنید`);
      err.status = 400;
      throw err;
    }
  }
  return out;
}

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

// Tells the client whether the "new ticket" form should be enabled, and why
// not — so the app can explain the rule instead of just failing on submit.
async function ticketQuota(userId) {
  const open = await pool.query(
    "SELECT id, subject, status FROM support_tickets WHERE user_id=$1 AND status <> 'closed' ORDER BY created_at DESC LIMIT 1",
    [userId]
  );
  if (open.rows[0]) {
    return {
      canCreate: false,
      reason: 'open_ticket',
      message: 'یک تیکت باز دارید؛ تا بسته شدن آن، پاسخ خود را در همان تیکت بفرستید.',
      openTicket: open.rows[0],
    };
  }
  const today = await pool.query(
    "SELECT count(*)::int AS c FROM support_tickets WHERE user_id=$1 AND created_at >= date_trunc('day', NOW())",
    [userId]
  );
  // سهمیهٔ روزانه از اعدادِ زنده — متنِ راهنما هم از همان قالبِ زنده
  // (live_copy.support.ticketRule) می‌آید تا عددِ متن با عددِ منطقِ
  // سرور هرگز در دو رقم نباشد.
  const limit = ticketsPerDay();
  if (today.rows[0].c >= limit) {
    return {
      canCreate: false,
      reason: 'daily_limit',
      message: liveContent.fillTemplate(
        liveContent.copy().support.ticketRule,
        { ticketsPerDay: limit },
      ),
      openTicket: null,
    };
  }
  return { canCreate: true, reason: null, message: null, openTicket: null };
}

// ── مسیرهای کاربری — ماژول‌های routes/ (بیرون آمده از این فایل؛ بندِ ۱ نقشهٔ
// راه، مهر ۱۴۰۵). mount عمداً این‌جاست: بعدِ همهٔ کمک‌تابع‌ها و محدودکننده‌ها
// تا هیچ وابستگیِ const در TDZ نباشد؛ مسیرها با هم تداخل ندارند و ترتیبِ
// ثبت بینِ گروه‌ها معنایی تغییر نمی‌دهد.
app.use('/api', require('./routes/games')({
  pool, auth, asyncHandler, referrals,
  leagueCountdown, tapGame, addLeaguePoints, coinLedger,
  coins, leaderboardSignal, pass, points,
  tapBatchLimiter, cacheGet, cacheSet, cardDuel,
  cardDuelLimiter,
}));
app.use('/api', require('./routes/profile')({
  pool, auth, asyncHandler, validateUuid,
  boundedText, safeUser, safeAvatarKey, safeImageUrl,
  isValidPasswordLength, cardDuel, shop, coins,
  gameEconomy, getGameRewardSettings, grants, level,
  loginStreak, pass, wheel, clubs,
  fieldCrypto, nicknamePolicy, bcrypt, changePasswordLimiter,
  signUser, points, rewardGroups,
}));
app.use('/api', require('./routes/rewardsUser')({
  pool, auth, asyncHandler, validateUuid,
  rewardGroups,
}));
app.use('/api', require('./routes/commerce')({
  auth, asyncHandler, validateUuid, shop,
  shopLimiter, cardBox, grants, clubs,
}));
app.use('/api', require('./routes/wallet')({
  auth, asyncHandler, validateUuid, walletService,
  bankCardLimiter, withdrawalService, withdrawalLimiter,
}));
app.use('/api', require('./routes/wheel')({
  pool, auth, asyncHandler, createNotification,
  wheel, addLeaguePoints, leaderboardSignal, pass,
  points, walletService, wheelLimiter,
}));
app.use('/api', require('./routes/progression')({
  pool, auth, asyncHandler, referrals,
  pass, loginStreak, loginStreakLimiter, UUID_RE,
  cacheGet, cacheSet, getLeaderboard, level,
  points, shop,
}));
app.use('/api', require('./routes/chat')({
  pool, auth, asyncHandler, validateUuid,
  io, ensureChatCooldown, assertNoBadWords, getChatPinnedMessage,
  getChatCooldownSeconds, getChatMinLifetimePoints, shop, activeStickers,
  cannedMessages, level, activeStickerById, chatLimiter,
  chatRetention, isAllowedChatMessage,
}));
app.use('/api', require('./routes/support')({
  pool, logger, auth, asyncHandler,
  validateUuid, kb, imageUpload, optimizeUpload,
  uploadLimiter, verifyUpload, ticketMaxAttachments, ticketQuota,
  sanitizeAttachments,
}));
app.use('/api', require('./routes/notifications')({
  pool, auth, asyncHandler, validateUuid,
}));

// ورودِ مدیر — ماژولِ routes/adminAuth.js (بیرون آمده از این فایل؛ بندِ ۱ ممیزی ۸ مهر).
app.use('/api', require('./routes/adminAuth')({
  pool, bcrypt, signAdmin, adminLoginLimiter, asyncHandler,
}));
// ── مرزِ سرور برای نقشِ «ناظر» (observer) ──────────────────────────────
//
// چرا این میدل‌ویر لازم است: پنهان‌کاریِ صفحه‌ها فقط سمتِ هر دو کلاینت
// (roles.js وب و admin_shell.dart اندروید) بود؛ کسی که توکنِ ناظر را
// داشت و مستقیم API را صدا می‌زد (نسخهٔ قدیمی APK، اسکریپت، یا curl)،
// تقریباً به همهٔ مسیرهای *خواندنیِ* پنل — پاس، فروشگاه، جوایز، تنظیمات
// موتور، متن‌های زنده، کارت‌بانک عکس، آمار کیف‌پول — می‌رسید. هرچند
// مسیرهای نوشتنیِ حساس با requireRole() جدا ۴۰۳ می‌دادند، خواندنی‌های
// زیادی باز بودند.
//
// قانون، دقیقاً همان چیزی است که UI هر دو پنل می‌گوید: ناظر فقط
// «داشبورد» و «پشتیبانی (تیکت‌ها)» را می‌بیند و هیچ تغییری نمی‌دهد.
// فهرست سفید فقط GET است؛ هر نوشتاری (POST/PATCH/PUT/DELETE) برای ناظر
// ۴۰۳ است. بعد از adminAuth اجرا می‌شود تا req.admin پر شده باشد؛ این
// نقطه تنها جایی است که مرز باید سِفت شود و بقیهٔ مسیرها از همین‌جا
// رد می‌شوند.
const observerReadGuard = (req, res, next) => {
  if (req.admin?.role !== 'observer') return next();
  if (req.method !== 'GET') return res.status(403).json({ message: 'دسترسی کافی نیست' });
  const p = req.path.replace(/\/+$/, '');
  const observerAllowed =
    p === '/dashboard' ||
    p === '/metrics' ||
    p === '/support/tickets' ||
    /^\/support\/tickets\/[^/]+\/messages$/.test(p);
  if (observerAllowed) return next();
  return res.status(403).json({ message: 'دسترسی کافی نیست' });
};
app.use('/api/admin', adminAuth, observerReadGuard);
// ساخت/آپلود استیکر تصویری عمداً حذف شد. چت محصول فقط پیام آماده و emoji
// است؛ endpointهای مدیریتی قبلی asset خراب می‌ساختند و قابلیتی را نشان
// می‌دادند که هیچ کلاینت کاربری مصرف نمی‌کرد. جدول تاریخی برای پیام‌های
// قدیمی می‌ماند، اما دیگر APIای برای تولید تصویر استیکر وجود ندارد.

// تنظیماتِ پنل — ماژولِ routes/adminSettings.js (بیرون آمده از این فایل؛ بندِ ۱ ممیزی).
app.use('/api', require('./routes/adminSettings')({
  pool, adminAuth, requireRole, asyncHandler, audit, io,
  getChatBadWords, getChatCooldownSeconds, getChatMinLifetimePoints, getChatPinnedMessage,
  getGameRewardSettings, saveGameRewardSettings, maskSecret, PIN_ACCENTS,
}));
// فقط فهرستِ کارت‌های کلکسیونی برای انتخابگرهای پنل (جوایز).
// مدیریتِ کدِ کارت قدیمی حذف شد؛ ساختِ کارت از مسیرِ «کارت با عکس» می‌گذرد.
app.use('/api', require('./routes/adminCardCatalog')({
  pool, adminAuth, asyncHandler,
}));

// ── «ثبت کارت از طریق عکس» ────────────────────────────────────────────────
//
// قابلیت جدید و مستقل، در ماژول جدا (src/routes/photoCards.js).
//
// چرا ماژول جدا و نه اینجا: مسیر «ثبت کد کارت» قدیمی روی پول واقعی
// کار می‌کند و چرخهٔ جدا دارد. روتر عکس و زیرماژول‌های آپلود/بانک کد
// مستقل mount می‌شوند تا این دو دامنه با هم مخلوط نشوند.
//
// وابستگی‌ها تزریق می‌شوند چون pool/auth/adminAuth و بقیه اینجا ساخته
// می‌شوند؛ جابه‌جا کردنشان یعنی دست زدن به چیزی که کار می‌کند.
app.use('/api', require('./routes/photoCards')({
  pool, auth, adminAuth, requireRole, asyncHandler, imageUpload, audit,
  validateUuid, createNotification, addLeaguePoints, pass, io, getLeaderboard,
  optimizeUpload, verifyUpload, UUID_RE,
}));

// Wallet balances, settings, and withdrawal administration.
app.use('/api', require('./routes/adminWallet')({
  pool, adminAuth, requireRole, asyncHandler, audit, validateUuid,
  withdrawalService, walletService, createNotification,
}));

// League seasons, prizes, and payout administration.
app.use('/api', require('./routes/adminLeague')({
  pool, adminAuth, requireRole, asyncHandler, audit, validateUuid,
  getLeaderboard, getLeagueWinnerCount, ensureActiveSeason,
  closeActiveSeason, leagueApprove, walletService, createNotification,
  defaultPrizeTable, seedCarryoverFromLatestClosed,
}));

// User administration and point-ledger inspection.
app.use('/api', require('./routes/adminUsers')({
  pool, auth, adminAuth, requireRole, asyncHandler, audit, validateUuid,
  level, safeUser, points, createNotification, bcrypt, isValidPasswordLength,
  grants,
}));

// Chat moderation, support inbox, and outbound notifications.
app.use('/api', require('./routes/adminCommunications')({
  pool, adminAuth, requireRole, asyncHandler, audit, validateUuid,
  sanitizeAttachments, createNotification, rateLimit,
  sendSegmented, isFirebaseConfigured,
}));

// Administrator account lifecycle and audit log.
app.use('/api', require('./routes/adminSecurity')({
  pool, adminAuth, requireRole, asyncHandler, audit, validateUuid, bcrypt,
}));

// Client runtime config (min version + announcement + اقتصاد بازی) —
// «اهرمِ بدون-آپدیت»: کلاینت‌ها این را از /api/config می‌خوانند.
app.use('/api', require('./routes/clientConfig')({
  pool, adminAuth, requireRole, asyncHandler, audit, rateLimit, gameEconomy,
  // فهرستِ آواتارها از همان یک منبع — تا «۱۰ مدل» در متنِ اپ نمرد و
  // افزودن آواتارِ تازه فقط یک ردیف در lib/avatarKeys.js بخواهد.
  avatars: avatarKeys,
  // بدون این، GET /api/config همیشه gamePoints=null می‌فرستد و نوار
  // راهنمای بازی فقط از bootstrap پر می‌شود. کلاینتی که فقط config
  // می‌خواند (یا bootstrap شکست خورده) امتیاز پنل را نمی‌دید.
  gameRewards: { getGameRewardSettings, saveGameRewardSettings },
  // اعدادِ دعوت/گذر/پلاس/شرط — تا متن‌های راهنما بدون آپدیت اپ زنده بمانند.
  opsLimits, referrals, pass, shop, gameStakes,
  // محتوا و اعداد زنده (فاز ۱ نقشه‌راه): /api/config حالا `copy`, `rules`
  // و `configVersion` می‌دهد و پنل‌ها متن/اعداد کل محصول را می‌بینند.
  liveContent,
}));

// ویرایشگر گردونه — ظاهر (برچسب/رنگ) و درون (نوع/وزن). بدون این mount
// پنل ادمین روی /admin/wheel/prizes چهار۰۴ می‌گرفت و کل قابلیت مرده بود.
app.use('/api', require('./routes/adminWheel')({
  pool, adminAuth, requireRole, asyncHandler, audit, wheel,
}));

// شانس و قیمت صندوق کارت — بدون این mount پنل روی /admin/card-box
// چهار۰۴ می‌گرفت و «قابل تنظیم بودنِ شانس» فقط روی کاغذ بود.
app.use('/api', require('./routes/adminCardBox')({
  pool, adminAuth, requireRole, asyncHandler, audit, cardBox,
}));

// تنظیماتِ اقتصادِ بازی‌ها (سکه، سهمیه، درصدِ انتقال بین لیگ‌ها،
// سکهٔ ضربه‌زن و امتیازِ برد/باخت) — پنل ادمین وب و اندروید.
app.use('/api', require('./routes/adminGameEconomy')({
  adminAuth, requireRole, asyncHandler, audit, gameEconomy,
  gameRewards: { getGameRewardSettings, saveGameRewardSettings },
  // دورِ ۳۳: مدیریتِ کامل بازی ضربه‌زن (آمار، ریست) در همان صفحهٔ اقتصاد.
  tapGame,
}));

// ── مدیریت کامل فروشگاه (دورِ عملیات) ───────────────────────────────────
// تا امروز کاتالوگ فقط با مایگریشن SQL عوض می‌شد؛ از این پس آیتم، قیمت،
// ترتیب، پلن‌های پلاس و آمار فروش از پنل ادمین — بدون دپلوی.
app.use('/api', require('./routes/adminShop')({
  pool, adminAuth, requireRole, asyncHandler, audit, validateUuid, shop, opsConfig,
}));

// ── مدیریت گذر نبرد ─────────────────────────────────────────────────────
app.use('/api', require('./routes/adminPass')({
  pool, adminAuth, requireRole, asyncHandler, audit, validateUuid, pass, opsConfig,
}));

// ── مدیریت ماموریت‌های روزانه/هفتگی ─────────────────────────────────────
app.use('/api', require('./routes/adminMissions')({
  pool, adminAuth, requireRole, asyncHandler, audit,
  missions: require('./services/missionService'), opsConfig,
}));

// ── ماموریت‌های اختصاصی (همگانی) — فهرستی که ادمین می‌نویسد ────────────
// بالای «ماموریت‌های امروز» به همهٔ کاربران نشان داده می‌شود و لینکِ رنگی
// پشتِ «اینجا کلیک کنید» می‌گیرد. بدونِ آپدیتِ اپ.
//
// ⚠️ این رجیستر یک‌بار است. قبلاً دو بار پشتِ سرِ هم آمده بود (نسخهٔ
//    یگانه + نسخهٔ چندتایی)؛ Express مسیرِ تکراری را دوباره اجرا نمی‌کرد
//    پس باگی نمی‌ساخت، ولی هر کسی که بعداً فقط یکی را ویرایش می‌کرد،
//    فکر می‌کرد تغییرش اثر کرده در حالی که نسخهٔ اول پاسخ می‌داد.
app.use('/api', require('./routes/adminCustomMission')({
  adminAuth, requireRole, asyncHandler, audit, validateUuid,
  customMission: require('./services/customMission'),
}));

// ═══════════════════════════════════════════════════════════════════════════
// سپرِ سرور (کلادفلر) — خواستهٔ مالک، ۲۶ شهریور: «تو پنل ادمین آماده باشد و
// تا وقتی حمله نشده خاموش بماند؛ با یک ثبت و تأیید روشنش کنم.»
// ═══════════════════════════════════════════════════════════════════════════
//
// سرویس به‌شکلِ factory ساخته می‌شود تا سه چیزِ بیرونی‌اش تزریق‌شدنی باشد:
// ذخیره‌گاه (تنظیماتِ پنل)، اینترنت (API کلادفلر) و فایلِ حالتِ سمتِ سرور.
// نتیجه‌اش این است که تست بتواند یک کلادفلرِ جعلی بالا بیاورد و هیچ تستی به
// حسابِ واقعیِ مالک دست نزند.
const cloudflareGuard = require('./services/cloudflareGuard').createCloudflareGuard({
  store: opsConfig,
  crypto: fieldCrypto,
  logger,
});
app.use('/api', require('./routes/adminCloudflare')({
  adminAuth, requireRole, asyncHandler, audit, cloudflareGuard,
}));

// ═══════════════════════════════════════════════════════════════════════════
// برنامه‌های پیشنهادی — خواستهٔ مالک (۲۶ شهریور): «یک قسمت برنامهٔ پیشنهادی
// در قسمت (بیشتر) وب و اندروید که از پنل ادمین مدیریت بشه.»
// ═══════════════════════════════════════════════════════════════════════════
//
// یک مسیرِ عمومی (ورودیِ صفحهٔ «بیشتر») و پنج مسیرِ مدیریتی. سرویس جدا
// تزریق می‌شود تا قواعدِ اعتبارسنجی و صفحه‌بندی، بدونِ دیتابیس هم
// آزمایش‌شدنی باشند.
// شماره معکوسِ شروعِ لیگ: یک مسیرِ عمومی + دو مسیرِ پنل. سرویس جدا تزریق
// می‌شود تا موتورِ بازی هم بتواند همان تصمیم را (از همان کش) بخواند.
app.use('/api', require('./routes/leagueCountdown')({
  adminAuth, requireRole, asyncHandler, audit, service: leagueCountdown,
}));

app.use('/api', require('./routes/recommendedApps')({
  pool, adminAuth, requireRole, asyncHandler, audit, validateUuid,
  service: recommendedApps,
  // `featureFlags` را همان‌جا require می‌کنیم: در این فایل جاهای دیگر هم
  // همین الگو هست (require تنبل) و متغیرِ سراسریِ تازه نمی‌سازیم.
  featureFlags: require('./services/featureFlags'),
}));

// ── اهرم‌های موتور (آستانه‌های تشخیص، سطح، استریک، پیام‌های آماده) ──────
app.use('/api', require('./routes/adminOps')({
  adminAuth, requireRole, asyncHandler, audit, opsConfig,
  matchSettings: require('./services/matchSettings'),
}));

const presence = createPresenceService(pool);

// داشبورد/سنجه‌ها و بقیهٔ مسیرهای مدیری باقی‌مانده — ماژولِ routes/adminDashboard.js.
// mount عمداً **بعدِ** تعریفِ presence است: سنجه‌ها از آن استفاده می‌کنند و
// جلوتر بودن یعنی ReferenceError (TDZ) در لحظهٔ بالا آمدن.
app.use('/api', require('./routes/adminDashboard')({
  pool, adminAuth, requireRole, asyncHandler, validateUuid, audit, io, logger,
  imageUpload, optimizeUpload, verifyUpload, kb, cardDuel, referrals, wheel,
  getLeaderboard, presence,
}));
app.use('/api', require('./routes/growth')({
  auth, authOptional, adminAuth, requireRole, asyncHandler, validateUuid, presence, rateLimit,
}));

app.use('/api', require('./routes/payments')({ auth, asyncHandler }));

// لایهٔ سوکت به src/sockets.js رفت (بندِ ۱ نقشهٔ راه، مهر ۱۴۰۵) — همان
// میان‌افزارِ احرازِ هویت و هندلرها، فقط وابستگی‌ها تزریق می‌شوند.
require('./sockets')({
  io, pool, jwt, JWT_SECRET,
  presence, activeStickerById, assertNoBadWords, chatRetention,
  ensureChatCooldown, getChatMinLifetimePoints, isAllowedChatMessage, leaderboardSignal,
  sessionEpochMatches, shop,
});

const PROCESS_ROLE = String(process.env.PROCESS_ROLE || 'game');
if (PROCESS_ROLE !== 'http') {
  const games = require('./games');
  games.attach(io);
}

// ── کارهای زمان‌بندی‌شده — همه در src/cron.js (بندِ ۱ ممیزیِ ۸ مهر). ──
// همان scheduleها با همان ترتیب و timezone ثبت می‌شوند؛ جزئیات و دلیلِ
// هر job در همان ماژول آمده است.
require('./cron')({
  pool, logger, gameStakes, closeExpiredSeasons, addLeaguePoints,
  wheelReminder, tapGame, cardDuel, coins, analytics,
  imageUploadDir, thumbRoot, THUMB_WIDTHS, IMAGE_EXT_RE,
});
// Centralized error handler. Previously this forwarded err.message straight
// to the client, which meant raw PostgreSQL errors (unique/foreign-key
// constraint names, column/table names, data types) leaked verbatim to
// end users whenever a route didn't pre-validate input — e.g. replying to a
// deleted/invalid message id, creating a card code with a bogus card type,
// or a duplicate admin username. That's an information-disclosure issue
// (reveals internal schema) and a bad user experience (raw English/SQL
// text mixed into a Persian UI). Postgres errors are now mapped to safe,
// Persian, user-facing messages; everything else still uses err.message
// (which for validation errors thrown deliberately in route handlers is
// already a safe Persian string).
function friendlyDbError(err) {
  switch (err.code) {
    case '23505': return 'این مقدار تکراری است';
    case '23503': return 'مقدار انتخاب‌شده معتبر نیست یا حذف شده است';
    case '23502': return 'اطلاعات لازم کامل نیست';
    case '23514':
      if (String(err.constraint || err.message || '').includes('card_duel_decks_card_type_ids')) {
        return 'ترکیب باید دقیقاً پنج کارت متفاوت باشد';
      }
      return 'مقدار واردشده با قوانین سیستم سازگار نیست';
    case '22P02': return 'فرمت اطلاعات ارسالی معتبر نیست';
    case '22001': return 'یکی از مقادیر ارسالی خیلی طولانی است';
    default: return null;
  }
}
// A request to a path that does not exist used to fall through to Express'
// default handler, which replies with an HTML error page. Every client here
// expects JSON, so a typo'd URL produced "Unexpected token '<'" in the app
// instead of a readable message.
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'این آدرس در سرور وجود ندارد' });
});

app.use((err, req, res, next) => {
  // ═══════════════════════════════════════════════════════════════════════
  // چرا خطاهای ۴xx فقط یک خط لاگ می‌شوند و نه کلِ stack
  // ═══════════════════════════════════════════════════════════════════════
  //
  // قبلاً هر خطایی — حتی «این کد قبلاً استفاده شده است» که یک وضعیتِ
  // کاملاً عادی و پیش‌بینی‌شده است — با stack trace کامل در لاگ می‌نشست:
  //
  //     Error: این پرونده قبلاً بررسی شده است
  //         at /var/www/.../photoCards.js:862:31
  //         at process.processTicksAndRejections (...)
  //       { status: 409 }
  //
  // چهار خط لاگ برای اتفاقی که روزی صدها بار می‌افتد و هیچ اقدامی
  // نمی‌طلبد. نتیجه‌اش این است که وقتی یک باگِ **واقعی** رخ می‌دهد،
  // بین انبوهِ این خطوط گم می‌شود.
  //
  // این دقیقاً همان چیزی بود که باعث شد باگِ `releaseGuard is not
  // defined` مدت‌ها در لاگ باشد و دیده نشود.
  //
  // قاعده: خطای ۴xx یعنی «کاربر کارِ نادرستی کرد» → یک خط، بدون stack.
  //        خطای ۵xx یعنی «ما خراب کردیم» → کلِ stack، چون باید رفع شود.
  const status = err.status || 500;
  // ۵۰۳ + کدِ صریح = «سرویس عمداً خاموش است»، نه «ما خراب کردیم».
  //
  // درگاهِ پرداخت هنوز فعال نشده و `paymentService` برای آن ۵۰۳ با کدِ
  // GATEWAY_OFF می‌دهد. چون ۵۰۳ در بازهٔ ۵xx است، هر بار که کاربری روی
  // «افزایش موجودی» می‌زد یک کرشِ جعلی در صندوقِ ادمین ثبت می‌شد — در
  // تولید همین حالا دو تا از این ردیف‌ها هست.
  //
  // خطرش نویز نیست، گم‌شدنِ سیگنال است: بعد از عرضه روی کافه‌بازار این
  // ردیف‌ها صندوق را پر می‌کنند و کرشِ واقعی لای آن‌ها دیده نمی‌شود.
  //
  // فقط خطایی که کدِ شناخته‌شدهٔ «عمداً خاموش» دارد استثنا می‌شود؛ هر ۵۰۳
  // دیگری (مثلاً قطعیِ واقعیِ یک سرویس) کماکان کرش حساب می‌شود.
  const intentionallyOff = status === 503 && err.code === 'GATEWAY_OFF';
  if (status >= 500 && !intentionallyOff) {
    logger.error(err);
    analytics.reportCrash({
      platform: 'backend',
      source: `${req.method} ${req.route?.path || req.path}`,
      release: process.env.APP_RELEASE || process.env.GIT_SHA || null,
      message: err.message,
      stack: err.stack,
      context: { requestId: req.headers['x-request-id'] || null },
    }).catch(reportError => logger.error('[crash-report] failed:', reportError.message));
  } else {
    // فقط خطاهای واقعی (۵xx/کرش) باید در فایلِ error باشند. خطاهای ۴xx و
    // پیام‌هایِ کسب‌وکارِ عادی (مثلاً «چرخش امروزت تمام شده» با 429) یک
    // وضعیتِ پیش‌بینی‌شده‌اند، نه خرابیِ ما. `console.warn` به stderr می‌رود و
    // چون PM2 stderr را در فایلِ `*-error-*.log` می‌ریزد، این خطوط فایلِ error
    // را پر می‌کردند و سیگنالِ خطای واقعی را می‌پوشاندند. `console.log` به
    // stdout می‌رود؛ اگر `merge_logs` خاموش باشد در فایلِ `*-out-*.log` می‌نشیند
    // و فایلِ error فقط دنبالِ خرابیِ واقعی می‌ماند.
    logger.info(`[${status}] ${req.method} ${req.originalUrl} — ${err.message}`);
  }
  // Malformed JSON reached the user as the raw parser message in English
  // ("Unexpected token 'n'..."), inside an otherwise Persian UI.
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ message: 'ساختار داده ارسالی معتبر نیست' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'حجم اطلاعات ارسالی بیش از حد مجاز است' });
  }
  // Multer (file uploads) throws its own error class with English messages
  // like "File too large". Those used to fall through to the generic 500
  // handler, so an admin uploading a big photo got a raw English string in
  // the middle of a Persian panel with no hint about the real limit.
  if (err.name === 'MulterError') {
    const map = {
      LIMIT_FILE_SIZE: 'حجم عکس بیش از ۱۲ مگابایت است',
      LIMIT_FILE_COUNT: 'تعداد فایل‌ها بیش از حد مجاز است',
      LIMIT_UNEXPECTED_FILE: 'فیلد فایل ارسالی معتبر نیست',
    };
    return res.status(400).json({ message: map[err.code] || 'آپلود فایل ناموفق بود' });
  }
  const friendly = err.code ? friendlyDbError(err) : null;
  res.status(err.status || 500).json({ message: friendly || err.message || 'خطای سرور' });
});

// LAST-RESORT SAFETY NET.
// Node kills the process on an unhandled rejection (default since v15) and on
// an uncaught exception. A single stray error in any async path would take
// the whole API down and disconnect every player mid-game. Log loudly and
// keep serving; PM2 still restarts us if the process genuinely dies.
process.on('unhandledRejection', (reason) => {
  logger.error('[fatal] unhandled promise rejection:', reason);
  // fail-fast: به‌جای اینکه پروسه در وضعیتِ نامعتبر به کار ادامه دهد (و
  // state را بی‌صدا خراب کند)، خارج می‌شویم تا PM2 تمیز ری‌استارت کند.
  // کمی مکث تا لاگِ stderr قبل از خروج لاک شود.
  setTimeout(() => process.exit(1), 10);
});
process.on('uncaughtException', (err) => {
  logger.error('[fatal] uncaught exception:', err);
  // استانداردِ صنعت: uncaughtException بازگشت‌ناپذیر است؛ پروسه را سریع
  // خارج و PM2 را وادار به ری‌استارتِ تمیز می‌کنیم، نه سرویس‌دهیِ ادامه‌دار
  // در حالتِ کور. (توصیهٔ رسمیِ Node)
  setTimeout(() => process.exit(1), 10);
});

const port = process.env.PORT || 4000;
// ── آمادگی خوشه‌ای ────────────────────────────────────────────────────
//
// اگر REDIS_URL تنظیم باشد، آداپتور ردیس وصل می‌شود تا رویدادهای
// socket.io بین چند پروسه پخش شوند. اگر نباشد، هیچ اتفاقی نمی‌افتد و اپ
// دقیقاً مثل همیشه تک‌پروسه بالا می‌آید.
//
// ⚠️ توجه: وصل شدن آداپتور به‌تنهایی اجازهٔ cluster نمی‌دهد. مسابقه‌های
//    زنده هنوز در حافظهٔ یک پروسه‌اند (games/engine.js). شرح کامل در
//    docs/scaling-fa.md — بخش «چه چیزی هنوز مانع است».
const { attachRedisAdapter } = require('./lib/socketCluster');

server.listen(port, async () => {
  await attachRedisAdapter(io).catch(e => {
    logger.error('[cluster] اتصال آداپتور ناموفق بود، تک‌پروسه ادامه می‌دهیم:', e.message);
  });
  // پیش‌بارگذاری اهرم‌های عملیاتی پنل: بعد از ری‌استارت، تنظیمِ ادمین
  // از دیتابیس برگردانده می‌شود نه اینکه به پیش‌فرض کد برگردد.
  await opsConfig.preload([
    'pass_config', 'mission_config', 'level_settings', 'streak_settings',
    'photo_match_settings', 'chat_canned_messages', 'shop_plus_plans',
    'ops_limits',
    'sms_config', 'game_economy_settings', 'game_reward_settings',
    // محتوا و اعداد زنده — بدون این، تا اولین PATCH، کشِ همگامِ
    // liveContent خالی بود و همهٔ مسیرهای داغ (ساختِ تختهٔ جفت‌یاب،
    // پنجرهٔ اتصال) از پیش‌فرض کد می‌خواندند نه از دیتابیس.
    'live_copy', 'live_rules', 'config_version',
    'custom_mission',
    // تنظیماتِ سپرِ سرور: بدونِ این، بعد از هر ری‌استارت توکنِ کلادفلر و
    // فهرستِ دامنه‌ها از کش می‌رفتند و پنل «تنظیم نشده» نشان می‌داد.
    'cloudflare_guard',
  ]).catch(e => logger.error('[ops] پیش‌بارگذاری تنظیمات ناموفق بود:', e.message));
  // کشِ «شماره معکوسِ لیگ» را در بوت گرم می‌کنیم.
  //
  // گیت‌های سوکت (`rejectIfLeagueLocked`) و مسیرِ ضربه‌زن **همگام** از این
  // کش می‌خوانند و تازه‌سازی در پشت‌زمینه انجام می‌شود؛ یعنی بعد از هر
  // ری‌استارت/دیپلوی تا اولین درخواست، کش سرد است و پنجرهٔ قفل **باز**
  // دیده می‌شود. حالا که قفل بخشی از کارِ روزمره است، این چند ثانیه
  // ارزشِ گرم‌کردن را دارد.
  //
  // ⚠️ ترتیب مهم است: اول کش گرم، بعد `ensureActiveSeason` — وگرنه
  //    تصمیمِ «شروعِ خودکارِ لیگ» با پیش‌فرضِ کد (خاموش) گرفته می‌شود.
  await leagueCountdown.refresh().catch((e) =>
    logger.error('[league] گرم‌کردنِ کشِ شماره معکوس ناموفق بود:', e.message));
  await ensureActiveSeason();
  logger.info(`GhelGheli API on :${port}`);
  // خطِ «ظرفیت» در بوت: تنها جایی که بعد از ارتقای سرور (بدون گشتن در
  // کانفیگ‌ها) می‌شود فهمید پروسه سخت‌افزار را درست دیده یا نه.
  logger.info(`${capacity.summary()} | نقش=${process.env.PROCESS_ROLE || 'game'}`);
  logger.info(`[heavy] سقفِ هم‌زمانیِ پردازش عکس/مدل=${heavyStats().max}`);
});

// خاموشی تمیز: ردپای حضور این پروسه از ردیس پاک شود تا کاربران برای
// دو دقیقه «آنلاینِ روح» نمانند.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    presence.drain().catch(() => {}).finally(() => process.exit(0));
  });
}
