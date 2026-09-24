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
// UUID_RE عمداً این‌جا (بالای فایل) می‌ماند: چند ماژولِ lib/ آن را تزریق
// می‌گیرند و تعریفش باید پیش از همهٔ destructureها باشد (TDZ).
/// Every `:id` in this API is a Postgres UUID. Passing a non-UUID straight to
/// a query makes Postgres raise 22P02, which surfaced as a **500 Server
/// Error** — telling the client "we broke" when the truth is "you sent
/// nonsense". Proven live: GET /api/support/tickets/abc/messages returned 500.
/// Worse, it burns a database round trip and a pool connection on garbage,
/// which is a cheap denial-of-service lever.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
// احرازِ هویت و توکن‌ها → lib/auth.js (همان کد، وابستگی‌های تزریقی؛ گامِ پایانیِ ماژولار شدن).
const {
  signUser, sessionEpochMatches, signAdmin, normalizeMobile,
  faDigits, anonymousNickname, isValidPasswordLength, auth,
  authOptional, adminAuth, requireRole,
} = require('./lib/auth')({
  JWT_SECRET, _anonymousNickname, _faDigits, _isValidPasswordLength,
  _normalizeMobile, jwt, pool,
});

// تنظیمات و محتوای چت → lib/chatConfig.js (همان کد، وابستگی‌های تزریقی؛ گامِ پایانیِ ماژولار شدن).
const {
  getChatMinLifetimePoints, getChatCooldownSeconds, getLeagueWinnerCount, ensureChatCooldown,
  maskSecret, PIN_ACCENTS, getChatPinnedMessage, getChatBadWords,
  assertNoBadWords, isAllowedChatMessage, activeStickers, activeStickerById,
  cannedMessages,
} = require('./lib/chatConfig')({
  UUID_RE, opsConfig, pool, shop,
});

// محدودکننده‌های نرخ → lib/limiters.js (همان کد، وابستگی‌های تزریقی؛ گامِ پایانیِ ماژولار شدن).
const {
  opsRateLimit, chatLimiter, otpLimiter, otpMobileLimiter,
  otpDailyLimiter, otpVerifyLimiter, adminLoginLimiter, userLoginLimiter,
  userAccountLimiter, loginStreakLimiter, tapBatchLimiter, cardDuelLimiter,
  changePasswordLimiter, shopLimiter, withdrawalLimiter, bankCardLimiter,
  wheelLimiter, uploadLimiter,
} = require('./lib/limiters')({
  makeRateStore, normalizeMobile, opsLimits, rateLimit,
  rlStore,
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

// اعتبارسنجی و سریال‌سازی → lib/validators.js (همان کد، وابستگی‌های تزریقی؛ گامِ پایانیِ ماژولار شدن).
const {
  safeUser, validateUuid, intInRange, boundedText,
  safeAvatarKey, safeImageUrl,
} = require('./lib/validators')({
  UUID_RE, avatarKeys, fieldCrypto, walletService,
});

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



// ═══════════════════════════════════════════════════════════════════════════
// `/api/coins/quota` حذف شد (چرخهٔ ۲۴): هیچ کلاینتی صدایش نمی‌زد —
// سهمیهٔ سکه در bootstrap هست و بعد از هر بازی هم کلاینت‌ها `/api/level`
// را می‌خوانند. یک کوئریِ بی‌مصرف فقط سطحِ حمله را زیاد می‌کرد.

// Reward groups: the user-facing catalogue with per-group progress.
const rewardGroups = require('./services/rewardGroupService');


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






// پیکربندیِ پشتیبانی → lib/supportConfig.js (همان کد، وابستگی‌های تزریقی؛ گامِ پایانیِ ماژولار شدن).
const {
  ticketMaxAttachments, sanitizeAttachments, ticketQuota,
} = require('./lib/supportConfig')({
  liveContent, pool,
});





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
// درگاه زرین‌پال (خواستهٔ مالک ۲۰۶-۰-۲۳): خرید مستقیم وب/اندروید با
// تنظیمِ زنده از پنل ادمین؛ کال‌بک و تحویلِ تراکنشی داخل همان ماژول.
app.use('/api', require('./routes/zarinpal')({
  pool, auth, adminAuth, requireRole, asyncHandler, audit, validateUuid,
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
  points, shop, coinVault: require('./services/coinVaultService'),
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
// ── انتشارِ اپ (APK) — پنلِ «انتشار اپ» ────────────────────────────────────
//
// با کنارگذاشتنِ کافه‌بازار (تصمیم مالک، ۱ مهر ۱۴۰۵) فایلِ اپ از خودِ سرور
// سرو می‌شود؛ این روتر آپلود/فهرست/حذف را می‌دهد و لینکِ به‌روزرسانی را
// زنده در client_config می‌نشاند. وابستگی‌ها مثل بقیهٔ روترها تزریق می‌شوند
// چون pool/adminAuth/requireRole همین‌جا ساخته شده‌اند.
app.use('/api', require('./routes/adminApk')({
  pool, adminAuth, requireRole, asyncHandler, audit,
}));

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
  leagueCountdown,
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
// فقط گرهٔ game کرون را ثبت می‌کند — ریشهٔ حادثهٔ ۲۰۲۶-۰۹-۲۲: با
// افزایشِ ظرفیت، تعدادِ گره‌ها از ۳ به ۵ رسید و چون هر گره همهٔ jobهای
// زمان‌بندی‌شده را ثبت می‌کرد، یادآورِ روزانهٔ چرخش (۱۸:۳۰) برای هر کاربر
// ۵ بارِ هم‌زمان رفت — همان «چند نوتیفیکیشن هم‌زمان روی گوشی» که مالک
// گزارش داد (روزهای سه‌گره‌ای: ۳ نوتیفیکیشن). PROCESS_ROLE را
// ecosystem.config.cjs برای هر برنامه ست می‌کند و گرهٔ game همیشه
// دقیقاً یکی است. در توسعه/استیجینگ این متغیر تنظیم نیست → پیش‌فرض
// «game» → کرون فعال می‌ماند (یک پروسه، بدونِ تکرار).
if ((process.env.PROCESS_ROLE || 'game') === 'game') {
  require('./cron')({
    pool, logger, gameStakes, closeExpiredSeasons, addLeaguePoints,
    wheelReminder, tapGame, cardDuel, coins, analytics,
    imageUploadDir, thumbRoot, THUMB_WIDTHS, IMAGE_EXT_RE,
  });
  logger.info('[cron] jobهای زمان‌بندی‌شده فقط روی گرهٔ game ثبت شدند');
}
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
// nginx فقط به 127.0.0.1 وصل می‌شود (snippets/ghelgheli-upstream.conf).
// گوش‌دادن روی همهٔ اینترفیس‌ها سطح حمله را زیاد می‌کند بدون اینکه
// فایده‌ای برای کاربر داشته باشد — فایروال پورت را می‌بندد، ولی BIND
// پیش‌فرض باید همان لوکال باشد. استیجینگ روی ۴۹۹۹ هم لوکال است.
// BIND_HOST=0.0.0.0 فقط برای تست روی شبکهٔ دیگر.
const bindHost = process.env.BIND_HOST || '127.0.0.1';
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

server.listen(port, bindHost, async () => {
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
  logger.info(`GhelGheli API on ${bindHost}:${port}`);
  // خطِ «ظرفیت» در بوت: تنها جایی که بعد از ارتقای سرور (بدون گشتن در
  // کانفیگ‌ها) می‌شود فهمید پروسه سخت‌افزار را درست دیده یا نه.
  logger.info(`${capacity.summary()} | نقش=${process.env.PROCESS_ROLE || 'game'}`);
  logger.info(`[heavy] سقفِ هم‌زمانیِ پردازش عکس/مدل=${heavyStats().max}`);
});

// خاموشی تمیز: ردپای حضور این پروسه از ردیس پاک شود تا کاربران برای
// دو دقیقه «آنلاینِ روح» نمانند.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    // خروجِ آرام (سخت‌سازیِ مقیاس، مهر ۱۴۰۵): در ری‌استارت/دیپلوی هیچ درخواستِ
    // در جریانی نباید قطع شود. ترتیب: کلاینت‌های سوکت قطع می‌شوند (خودکار به
    // گرهِ دیگر وصلِ مجدد می‌شوند)، پذیرشِ اتصالِ نو می‌ایستد و اتصال‌های
    // keep-aliveِ بی‌کار بسته می‌شوند؛ وقتی درخواست‌های در جریان تمام شدند
    // استخرِ DB آزاد و خارج می‌شویم. اگر بیش از ۴ ثانیه طول کشید، اتصال‌های
    // باقی‌مانده بستهٔ اجباری می‌شوند و در ۸ ثانیه خروجِ بی‌قیدِ شرط —
    // pm2 با kill_timeout: 9000 تا آن لحظه صبر می‌کند و SIGKILL نمی‌فرستد.
    logger.info(`[shutdown] دریافتِ ${sig} — خروجِ آرام (حداکثر ۸ ثانیه)`);
    let exited = false;
    const finish = () => { if (!exited) { exited = true; process.exit(0); } };
    setTimeout(finish, 8000).unref();
    try { io.disconnectSockets(true); } catch (e) { logger.warn('[shutdown] io.disconnectSockets ناموفق', e.message); }
    presence.drain().catch(() => {});
    server.close(() => {
      pool.end().catch(() => {}).then(finish, finish);
    });
    try { server.closeIdleConnections(); } catch (e) { /* node قدیمی */ }
    setTimeout(() => { try { server.closeAllConnections(); } catch (e) { /* node قدیمی */ } }, 4000).unref();
  });
}
