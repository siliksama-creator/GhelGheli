require('dotenv').config();
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
const cron = require('node-cron');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const { Server } = require('socket.io');
const { pool } = require('./config/db');
// تنها فهرستِ آواتارها — هم `safeAvatarKey` از آن می‌خواند و هم
// `GET /api/avatars` که «چند مدل آواتار داریم» را از متنِ APK بیرون می‌آورد
// (فاز ۲ نقشه‌راه یکپارچه‌سازی: هیچ عددِ بازاری در متن UI کلاینت نماند).
const avatarKeys = require('./lib/avatarKeys');
const { audit } = require('./services/auditService');
const opsConfig = require('./services/opsConfig');
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
const analytics = require('./services/analyticsService');
const { createPresenceService } = require('./services/presenceService');

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
    console.warn(`[uploads] ${quarantined} فایلِ غیرتصویری به قرنطینه منتقل شد (uploads/.quarantine)`);
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
    console.error('[thumb] failed:', err.message);
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
const signUser = user => jwt.sign({ sub: user.id, type: 'user' }, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '30d' });
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
function normalizeMobile(m) {
  let s = String(m || '').trim();
  // ارقام فارسی (U+06F0–U+06F9) و عربی-هندی (U+0660–U+0669) → لاتین.
  s = s.replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
  s = s.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  // فاصله‌های معمولی، نیم‌فاصله و فاصلهٔ باریک که از کپی‌پیست می‌آیند.
  s = s.replace(/[\s\u200c\u200f\u200e\u202a-\u202e]/g, '');

  // فقط وقتی شماره است دست به شکلش می‌زنیم؛ نام کاربری را رها می‌کنیم.
  if (/^[+0-9()\-.]+$/.test(s)) {
    s = s.replace(/[()\-.]/g, '');
    if (s.startsWith('+98')) s = '0' + s.slice(3);
    else if (s.startsWith('0098')) s = '0' + s.slice(4);
    else if (s.startsWith('98') && s.length === 12) s = '0' + s.slice(2);
    // «9123456789» بدون صفر ابتدایی — شکلی که خیلی‌ها تایپ می‌کنند.
    else if (/^9\d{9}$/.test(s)) s = '0' + s;
  }
  return s;
}

/**
 * ارقام لاتین را به فارسی تبدیل می‌کند، برای متن اعلان‌ها.
 *
 * اعلان‌ها تنها جای سرور هستند که متن فارسی مستقیم به کاربر نشان می‌دهند؛
 * «۳ چرخش» کنار «3 چرخش» در یک لیست، بد به‌نظر می‌رسد.
 */
const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
function faDigits(n) {
  return String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}
// PRIVACY FIX: register-password used to fall back to the raw mobile
// number/username as the public nickname whenever the optional nickname
// field was left blank. Nickname is shown to every other user on the
// public leaderboard and in the chat room, so any user who skipped that
// one optional field had their phone number broadcast to the entire user
// base. Generate an anonymous placeholder instead; the user can still set
// a real nickname later from their profile.
function anonymousNickname() {
  return `کاربر-${Math.floor(1000 + Math.random() * 9000)}`;
}
// bcrypt silently truncates input at 72 BYTES — anything past that is
// ignored when hashing, so e.g. "AAAA...(72 x's)...AAAA-realsecret" and
// "AAAA...(72 x's)...AAAA-totallydifferent" hash identically and both
// "work" as the password. That's confusing/unsafe for a password field, so
// cap length explicitly instead of silently accepting (and discarding) the
// extra characters.
function isValidPasswordLength(pw) {
  const s = String(pw || '');
  return s.length >= 6 && Buffer.byteLength(s, 'utf8') <= 72;
}
async function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== 'user') throw new Error('bad token');
    const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [payload.sub]);
    if (!rows[0] || rows[0].status !== 'active') return res.status(401).json({ message: 'کاربر فعال نیست' });
    req.user = rows[0]; next();
  } catch { res.status(401).json({ message: 'نیاز به ورود مجدد دارید' }); }
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
  const build = () => {
    const rl = opsLimits.get().rateLimits[name] || defaults;
    return rateLimit({
      windowMs: rl.windowMs,
      limit: rl.limit,
      standardHeaders: true,
      legacyHeaders: false,
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
const otpLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false });
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
  keyGenerator: (req) => `${req.ip}:${String(req.body?.username || '').toLowerCase()}`,
  message: { message: 'تعداد تلاش ورود زیاد است؛ چند دقیقه دیگر دوباره امتحان کنید' },
});
// Same reasoning as adminLoginLimiter, but for regular user login.
const userLoginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${normalizeMobile(req.body?.mobile)}`,
  message: { message: 'تعداد تلاش ورود زیاد است؛ چند دقیقه دیگر دوباره امتحان کنید' },
});
const loginStreakLimiter = rateLimit({
  windowMs: 60_000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: perUserKey,
  message: { message: 'کمی صبر کن و دوباره تلاش کن' },
});

app.get('/health', (req, res) => res.json({ ok: true, name: 'GhelGheli API' }));

// Catalogue of playable games, so the mobile/web clients can render the hub
// dynamically instead of shipping a hardcoded list that drifts out of sync.
app.get('/api/games', (req, res) => res.json(require('./games').CATALOG));

// Strips everything the client must never see. The bank card number is as
// sensitive as the password hash: /api/profile is fetched on every app start
// and ends up in HTTP caches, crash reports and debug logs, so the full PAN
// is replaced by a masked form. The only endpoint that returns the real
// number is the admin withdrawal list (behind adminAuth), because the admin
// physically has to make the transfer.
function safeUser(u) {
  const { password_hash, bank_card_number, bank_card_sheba, ...rest } = u;
  return {
    ...rest,
    wallet_balance: Number(rest.wallet_balance || 0),
    bank_card_masked: bank_card_number ? walletService.maskCard(bank_card_number) : null,
    bank_card_sheba_masked: bank_card_sheba ? `${bank_card_sheba.slice(0, 6)}••••${bank_card_sheba.slice(-4)}` : null,
    has_bank_card: Boolean(bank_card_number),
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

app.get('/api/games/tap/progress', auth, asyncHandler(async (req, res) => {
  res.json(await tapGame.getProgress(req.user.id));
}));

app.post('/api/games/tap/progress', auth, tapBatchLimiter.mw, asyncHandler(async (req, res) => {
  const play = await require('./services/featureFlags').checkPlayable('tap', pool);
  if (!play.ok) return res.status(503).json({ message: play.message });
  // The raw token doubles as the HMAC key material, so the signature can only
  // be produced by whoever holds a live session for this user.
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  // لولِ قبل از ارسال، تا بعداً بفهمیم چند لول در همین بسته تمام شد.
  // payload فقط لولِ فعلی را می‌دهد نه اختلاف را.
  const lvlBefore = await tapGame.getProgress(req.user.id)
    .then(p => Number(p?.level || 0)).catch(() => 0);
  const { status, payload } = await tapGame.submitBatch(
    req.user.id, token, req.body || {},
    // ── امتیاز بازی ضربه‌زن ──────────────────────────────────────────────
    //
    // هر ضربه یک امتیاز. سرویس خودش حساب می‌کند چند ضربه واقعاً *شمرده*
    // شده (بعد از اعمال سقف روزانه) و همان عدد را اینجا می‌فرستد، نه
    // چیزی که کلاینت ادعا کرده.
    //
    // روی همان تراکنشِ ذخیرهٔ پیشرفت اجرا می‌شود: اگر یکی شکست بخورد هر
    // دو برمی‌گردند، وگرنه یک کرش وسط کار یا دوبار پول می‌دهد یا لول را
    // بالا می‌برد بدون پرداخت.
    async (client, userId, points) => {
      // نامِ پارامتر اینجا `points` است و ماژولِ دفتر را سایه می‌اندازد،
      // پس با مسیرِ کاملش صدا زده می‌شود. (تغییرِ نامِ پارامتر، امضای
      // callback را می‌شکست.)
      await require('./services/pointService').credit(client, {
        userId,
        points,
        source: 'game',
        referenceType: 'tap_game',
        description: 'بازی ضربه‌زن',
        // `league:false` چون `addLeaguePoints` پایین‌تر خودش این کار را
        // می‌کند؛ دوباره‌شمردن یعنی رتبهٔ لیگ دو برابر بالا می‌رود.
        league: false,
      });
      await addLeaguePoints(client, userId, points);
      // کمیسیونِ امتیازیِ ۵٪ به معرف — «بازی ضربه‌زنِ دوستان».
      //
      // بدونِ شرط، برخلافِ مسیرِ کارت: بازیِ ضربه‌زن هیچ‌وقت پولِ نقد
      // نمی‌دهد، فقط امتیاز. پس استثنای «کارتِ نقدی» اینجا موضوعیت ندارد.
      //
      // روی همین تراکنش است تا اگر ثبتِ امتیازِ کاربر برگردد، کمیسیونِ
      // معرف هم برگردد و دو دفتر از هم جدا نیفتند.
      await referrals.payCommission(client, userId, points, 'tap');
    },
    // ── سکهٔ لول‌های تمام‌شده (دورِ ۲۶) ───────────────────────────────────
    //
    // روی همان تراکنشِ پیشرفت. `levels` فهرستِ لول‌هایی است که در همین
    // بسته تمام شده‌اند و سرویس آن را بعد از سقفِ روزانه حساب کرده.
    //
    // ⚠️ `awardCoins` بدونِ لیگِ فعال صفر برمی‌گرداند و خطا نمی‌دهد — یعنی
    //    بینِ دو فصل، ضربه‌زن امتیازش را می‌دهد ولی سکه‌ای نمی‌سازد. این
    //    درست است: سکه فقط داخلِ یک فصل معنا دارد.
    async (client, userId, levels) => {
      const amount = coins.tapCoinsFor(levels);
      if (amount <= 0) return 0;
      // ⚠️ باید همان عددی برگردد که واقعاً در دفتر نشسته. اگر لیگِ
      //    فعالی نباشد `awardCoins` صفر می‌دهد؛ برگرداندنِ `amount`
      //    یعنی کلاینت «+۵ سکه» نشان می‌دهد در حالی که موجودی‌اش
      //    تکان نخورده.
      return coins.awardCoins(client, userId, amount);
    },
  );
  // XP گذر نبرد به ازای هر لولی که در همین بستهٔ ارسالی تمام شده.
  // سقف روزانهٔ منبع (۶۰) خودش جلوی سوءاستفاده را می‌گیرد.
  const lvlUp = Math.max(0, Number(payload?.level || 0) - lvlBefore);
  if (lvlUp > 0) {
    pass.grantXp(req.user.id, 'tap_level', { multiplier: lvlUp }).catch(() => {});
  }
  res.status(status).json(payload);
}));

app.get('/api/games/tap/leaderboard', auth, asyncHandler(async (req, res) => {
  // limit پیش‌فرض ۱۰ — UI کنار کاراکتر؛ me = رتبهٔ واقعی بیننده
  const data = await tapGame.leaderboard(req.query.limit || 10, req.user.id);
  res.json(data);
}));

// ── دوئل پنج‌کارتی زنده ──────────────────────────────────────────────────
// The REST surface prepares a user's authoritative deck and supports old
// clients' free bot practice. New bot/online/lobby matches all run through the
// shared Socket.IO engine and escrow used by the other competitive games.
const cardDuelLimiter = opsRateLimit('cardDuel',
  { windowMs: 60_000, limit: 24 },
  { keyGenerator: perUserKey, message: { message: 'تعداد دوئل زیاد است؛ کمی صبر کن' } });

app.get('/api/card-duel', auth, asyncHandler(async (req, res) => {
  res.json(await cardDuel.status(req.user.id));
}));

app.post('/api/card-duel/deck', auth, cardDuelLimiter.mw, asyncHandler(async (req, res) => {
  res.json(await cardDuel.saveDeck(
    req.user.id,
    req.body?.cardTypeIds || req.body?.cards || [],
  ));
}));

app.post('/api/card-duel/bot', auth, cardDuelLimiter.mw, asyncHandler(async (req, res) => {
  res.json(await cardDuel.botBattle(req.user.id,
    Array.isArray(req.body?.cardTypeIds) ? req.body.cardTypeIds : null));
}));

// Snapshot for balancing: which focus, rarity and effect actually win in the
// last real matches. Admin-only because it is a product-tuning view, not
// player-facing data.
app.get('/api/admin/card-duel/balance', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  res.json(await cardDuel.balanceSnapshot(req.query.limit));
}));

// Solo (time-attack) records: my personal best + the public leaderboard, in
// one round trip so the solo screen never has to fan out two requests.
// Solo awards NO points on purpose — the record IS the reward.
app.get('/api/games/:gameId/solo', auth, asyncHandler(async (req, res) => {
  const rules = require('./games').RULES[req.params.gameId];
  if (!rules || !rules.solo) return res.status(404).json({ message: 'این بازی حالت تک‌نفره ندارد' });
  res.json(await require('./services/soloRecordService').summary(req.user.id, req.params.gameId));
}));

app.get('/api/profile', auth, asyncHandler(async (req, res) => {
  // همان ستون‌های bootstrap تا دو مسیر هرگز از هم جدا نیفتند.
  // INVENTORY_IMAGE_SQL: طرحی که در لحظهٔ ثبت قرعه خورده (رو یا پشت).
  // ⚠️ اینجا عمداً FRONT_IMAGE_SQL نیست — آن مالِ آرنای دوئل است.
  // توضیحِ کاملِ تفاوت و باگی که از یکی‌کردنشان آمد در cardDuelService.
  const inv = await pool.query(
    `SELECT i.*, t.name, ${cardDuel.INVENTORY_IMAGE_SQL} AS image_url,
            t.point_value, t.cash_amount, t.description,
            t.duel_attack, t.duel_defense, t.duel_speed, t.duel_technique,
            t.duel_goal_chance, t.duel_energy, t.duel_rarity, t.duel_effect,
            t.is_collectible
       FROM user_card_inventory i
       JOIN card_types t ON t.id = i.card_type_id
      WHERE i.user_id=$1 AND i.consumed_in_reward=false ORDER BY t.name`,
    [req.user.id]);
  const leaguePayouts = await pool.query(`SELECT p.*, s.month_year FROM league_payouts p JOIN league_seasons s ON s.id=p.league_season_id WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 20`, [req.user.id]);
  const profileCosmetics = await shop.cosmeticsFor([req.user.id]);
  res.json({
    user: safeUser(req.user),
    inventory: inv.rows,
    leaguePayouts: leaguePayouts.rows,
    cosmetics: profileCosmetics.get(req.user.id) || null,
  });
}));
// ── بوت‌استرپ: هر چیزی که اپ بلافاصله بعد از ورود لازم دارد ──────────────
//
// چرا این endpoint وجود دارد
//
// اپ بعد از ورود سه درخواست جدا می‌زد: profile، rewards و wheel. هر سه
// روی سرور در مجموع کمتر از ۵ میلی‌ثانیه کار می‌برند — اندازه‌گیری شد —
// ولی هرکدام حدود ۵۰۰ میلی‌ثانیه طول می‌کشند چون تأخیر شبکه تا ایران
// همین‌قدر است. یعنی ۹۹٪ زمان انتظار کاربر، رفت‌وبرگشت است نه محاسبه.
//
// موازی کردنشان کمک کرد (۱۸۴۸ به ۸۲۱ میلی‌ثانیه)، ولی کف همچنان یک
// رفت‌وبرگشت کامل است. یکی کردنشان آن کف را به یک رفت‌وبرگشت می‌رساند و
// دو تای دیگر را کاملاً حذف می‌کند.
//
// حجم پاسخ‌ها ناچیز است (۰.۸ تا ۱.۸ کیلوبایت)، پس یکی کردنشان هیچ هزینهٔ
// پهنای باندی ندارد.
//
// Promise.all و نه await پشت سر هم: سه کوئری مستقل‌اند و سریالی کردنشان
// همان اشتباهی است که این endpoint قرار است حل کند.
app.get('/api/bootstrap', auth, asyncHandler(async (req, res) => {
  const [inv, payouts, rewards, wheelState, streakState] = await Promise.all([
    // ── چرا `cash_amount` و `created_at` هم برمی‌گردند ──
    //
    // اینونتوری بازطراحی شد: کاربر می‌تواند نزدیک به ۵۰ نوع کارت داشته
    // باشد و صفحهٔ جدید امکانِ مرتب‌سازی («تازه‌ترین»، «باارزش‌ترین») و
    // نمایشِ ارزشِ نقدی را می‌دهد.
    //
    // `i.created_at` لحظهٔ **اولین** ثبتِ آن نوع کارت است و
    // `i.updated_at` آخرین بار که تعدادش زیاد شده. برای «تازه‌ترین»
    // دومی درست است — کاربر می‌خواهد کارتی را ببیند که همین حالا ثبت
    // کرده، حتی اگر نسخهٔ اولش را ماه‌ها پیش گرفته باشد.
    // INVENTORY_IMAGE_SQL: طرحِ رو/پشتی که در لحظهٔ ثبت قرعه خورده و در
    // `display_design_id` ثابت شده. اگر کارت طرحی نداشته باشد (سیستمِ
    // قدیمی) به تصویرِ پیش‌فرضِ نوعِ کارت برمی‌گردد، نه هیچ.
    pool.query(
      `SELECT i.*, t.name, ${cardDuel.INVENTORY_IMAGE_SQL} AS image_url,
              t.point_value, t.cash_amount, t.description,
              t.duel_attack, t.duel_defense, t.duel_speed, t.duel_technique,
              t.duel_goal_chance, t.duel_energy, t.duel_rarity, t.duel_effect,
              t.is_collectible
         FROM user_card_inventory i
         JOIN card_types t ON t.id = i.card_type_id
        WHERE i.user_id = $1 AND i.consumed_in_reward = false
        ORDER BY t.name`, [req.user.id]),
    pool.query(
      `SELECT p.*, s.month_year FROM league_payouts p
         JOIN league_seasons s ON s.id = p.league_season_id
        WHERE p.user_id = $1 ORDER BY p.created_at DESC LIMIT 20`,
      [req.user.id]),
    pool.query(
      `SELECT * FROM reward_tiers WHERE is_active = true
        ORDER BY required_points`),
    // شکست گردونه نباید کل بوت‌استرپ را ببرد: نشانِ چرخش یک زینت است،
    // پروفایل نیست.
    wheel.status(req.user.id).catch(() => null),
    // استریک روزانه باید در اولین فریم داشبورد حاضر باشد. جدا خواندنش
    // باعث می‌شد کارت بعد از بقیهٔ صفحه بپرد و روی اینترنت موبایل حس
    // «وصله‌ای» بدهد؛ شکستش هم نباید بوت‌استرپ را خراب کند.
    loginStreak.status(req.user.id).catch(() => null),
  ]);

  // XP ورود روزانه. سقف منبع ۲۰ است، پس هر بار باز کردن اپ در یک روز
  // فقط یک بار حساب می‌شود — بقیه بی‌اثرند.
  pass.grantXp(req.user.id, 'daily_login').catch(() => {});

  // خلاصهٔ گذر نبرد برای نشانِ نوار بالا. کل وضعیت اینجا فرستاده
  // نمی‌شود (۵۰ پله × ۲ مسیر حجیم است)؛ فقط چیزی که برای نشان لازم
  // است. صفحهٔ گذر خودش /api/pass را می‌خواند.
  // ── ظاهرِ خودِ کاربر (ستارهٔ پلاس، قاب، رنگ اسم) ────────────────────
  //
  // درخواست مالک: «افرادی که اشتراک پلاس گرفتن در همه جای پلتفرم برای
  // خودشون و افراد دیگه ستارشون مشخص باشه».
  //
  // «برای خودشون» بخش فراموش‌شده بود: چت و لیگ ستارهٔ **بقیه** را نشان
  // می‌دادند، ولی داشبورد خودِ کاربر نام را خام چاپ می‌کرد. یعنی کسی که
  // پول داده بود، در اولین صفحه‌ای که بعد از ورود می‌بیند هیچ نشانی از
  // خریدش نداشت.
  let myCosmetics = null;
  try {
    const m = await shop.cosmeticsFor([req.user.id]);
    myCosmetics = m.get(req.user.id) || null;
  } catch { /* ظاهر یک زینت است؛ نباید بوت‌استرپ را بشکند */ }

  let passBrief = null;
  try {
    const st = await pass.status(req.user.id);
    if (st.active) {
      passBrief = {
        tier: st.tier, tierCount: st.tierCount, claimable: st.claimable,
        hasPlus: st.hasPlus, daysLeft: st.season.daysLeft,
        intoTier: st.intoTier, tierNeeds: st.tierNeeds,
        // نشانِ قرمز کنار آیکون: تعداد پله‌ای که **امروز** باز شده.
        // مالک: «وقتی بتل پس کاربر باز میشه کنار آیکون بتل پس ۱ قرمز
        // میاد اگه دوتا باز شده ۲ میاد ولی سقف باز شدن ۲ هستش».
        tiersToday: st.tiersToday,
        maxTiersPerDay: st.maxTiersPerDay,
        dayCapReached: st.dayCapReached,
      };
    }
  } catch { /* گذر نبرد نباید بوت‌استرپ را بشکند */ }

  res.json({
    user: safeUser(req.user),
    inventory: inv.rows,
    leaguePayouts: payouts.rows,
    rewards: rewards.rows,
    wheel: wheelState,
    loginStreak: streakState,
    pass: passBrief,
    cosmetics: myCosmetics,
    // لولِ خودِ کاربر — صفحهٔ بازی‌ها و هدرِ داشبورد از همین می‌خوانند،
    // پس هیچ درخواستِ اضافه‌ای لازم نیست.
    level: await level.statusFor(req.user.id),
    // سهمیهٔ سکهٔ امروز — سوار بر همان bootstrap تا صفحهٔ بازی‌ها بتواند
    // «۳۰ از ۳۰ بازی سکه‌دار» را بدونِ درخواستِ اضافه نشان بدهد.
    coinQuota: await coins.getQuota(req.user.id),
    // اقتصادِ بازی‌ها برای متن‌های راهنمای داخلِ اپ/وب — از تنظیماتِ
    // ادمین می‌آید، پس حتی اپ‌های قدیمی هم متنِ جدید می‌بینند.
    economy: await gameEconomy.publicView().catch(() => null),
    gamePoints: await getGameRewardSettings().catch(() => null),
    pendingGrants: await grants.pendingFor(req.user.id).catch(() => []),
  });
}));

// ═══════════════════════════════════════════════════════════════════════════
// `/api/coins/quota` حذف شد (چرخهٔ ۲۴): هیچ کلاینتی صدایش نمی‌زد —
// سهمیهٔ سکه در bootstrap هست و بعد از هر بازی هم کلاینت‌ها `/api/level`
// را می‌خوانند. یک کوئریِ بی‌مصرف فقط سطحِ حمله را زیاد می‌کرد.

// ═══════════════════════════════════════════════════════════════════════════
// وضعیتِ کاملِ لول — برای صفحهٔ بازی‌ها
// ═══════════════════════════════════════════════════════════════════════════
//
// bootstrap خلاصه را دارد، ولی صفحهٔ بازی‌ها بعد از هر بازی باید عددِ
// تازه را بگیرد بدون اینکه کلِ bootstrap (که سنگین است) دوباره خوانده
// شود.
app.get('/api/level', auth, asyncHandler(async (req, res) => {
  res.json(await level.statusFor(req.user.id));
}));

app.patch('/api/profile', auth, asyncHandler(async (req, res) => {
  const b = req.body || {};
  // EVERY field is validated here rather than trusted. Before this, three
  // separate inputs produced a 500 Server Error instead of a clear message:
  //   age:-5 / age:99999  -> CHECK constraint violation  (23514)
  //   age:"abc"           -> invalid integer syntax      (22P02)
  //   a 3000-char nickname-> value too long              (22001)
  // and `profileAvatarKey: "../../etc/passwd"` was accepted outright.
  let age = null;
  if (b.age !== undefined && b.age !== null && b.age !== '') {
    const n = Number(b.age);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 5 || n > 120) {
      return res.status(400).json({ message: 'سن باید عددی بین ۵ تا ۱۲۰ باشد' });
    }
    age = n;
  }
  if (b.profileAvatarKey !== undefined && b.profileAvatarKey !== null
      && b.profileAvatarKey !== '' && !safeAvatarKey(b.profileAvatarKey)) {
    return res.status(400).json({ message: 'آواتار انتخابی معتبر نیست' });
  }
  // Shape alone is not enough for a club crest: without this check any user
  // could PATCH `profileAvatarKey: "club:real_madrid"` and wear a badge they
  // never bought. The dedicated endpoint checks membership, so this generic
  // one has to as well.
  if (typeof b.profileAvatarKey === 'string'
      && b.profileAvatarKey.startsWith('club:')) {
    const slug = b.profileAvatarKey.slice(5);
    if (!await clubs.isMember(req.user.id, slug)) {
      return res.status(403).json({ message: 'عضو این باشگاه نیستی' });
    }
  }
  // BUG FIX: آواتار محافظ صریح داشت ولی آدرس عکس نداشت. safeImageUrl برای
  // ورودی خطرناک (javascript: / data: / http) مقدار null برمی‌گرداند، و
  // COALESCE در کوئری پایین آن را «تغییری نده» تفسیر می‌کرد — یعنی سرور
  // ۲۰۰ OK برمی‌گرداند و کاربر فکر می‌کرد عکسش ذخیره شده، در حالی که
  // بی‌صدا نادیده گرفته شده بود. حالا مثل آواتار، صریحاً ۴۰۰ می‌دهد.
  if (b.profileImageUrl !== undefined && b.profileImageUrl !== null
      && b.profileImageUrl !== '' && !safeImageUrl(b.profileImageUrl)) {
    return res.status(400).json({ message: 'آدرس عکس پروفایل معتبر نیست' });
  }

  const { rows } = await pool.query(
    `UPDATE users SET
       first_name=COALESCE($1,first_name), last_name=COALESCE($2,last_name),
       nickname=COALESCE($3,nickname), profile_image_url=COALESCE($4,profile_image_url),
       profile_avatar_key=COALESCE($5,profile_avatar_key),
       bank_account=COALESCE($6,bank_account), age=COALESCE($7,age),
       city=COALESCE($8,city), province=COALESCE($9,province),
       fcm_token=COALESCE($10,fcm_token), updated_at=NOW()
     WHERE id=$11 RETURNING *`,
    [
      boundedText(b.firstName, 60),
      boundedText(b.lastName, 60),
      boundedText(b.nickname, 40),
      safeImageUrl(b.profileImageUrl),
      safeAvatarKey(b.profileAvatarKey),
      boundedText(b.bankAccount, 40),
      age,
      boundedText(b.city, 60),
      boundedText(b.province, 60),
      boundedText(b.fcmToken, 500),
      req.user.id,
    ],
  );
  res.json({ user: safeUser(rows[0]) });
}));
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
  keyGenerator: perUserKey,
  message: { message: 'تعداد تلاش‌ها زیاد است؛ چند دقیقه دیگر دوباره امتحان کنید' },
});
app.post('/api/profile/change-password', auth, changePasswordLimiter, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!isValidPasswordLength(newPassword)) return res.status(400).json({ message: 'رمز جدید باید بین ۶ تا ۷۲ کاراکتر باشد' });
  if (!req.user.password_hash || !currentPassword || !(await bcrypt.compare(String(currentPassword), req.user.password_hash))) {
    return res.status(401).json({ message: 'رمز فعلی درست نیست' });
  }
  await pool.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [await bcrypt.hash(String(newPassword), 12), req.user.id]);
  res.json({ message: 'رمز عبور با موفقیت تغییر کرد' });
}));

app.get('/api/users/:id/public', auth, validateUuid('id'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT id,nickname,profile_image_url,profile_avatar_key,lifetime_points,current_points,monthly_league_points,coins,joined_at FROM users WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ message: 'کاربر پیدا نشد' });
  const rewards = await pool.query(`SELECT c.claimed_at,c.status,r.name,r.image_url,r.reward_type,r.reward_value FROM user_reward_claims c JOIN reward_tiers r ON r.id=c.reward_tier_id WHERE c.user_id=$1 AND c.status IN ('approved','paid') ORDER BY c.claimed_at DESC LIMIT 50`, [req.params.id]);
  // ═══════════════════════════════════════════════════════════════════════
  // کارت‌های عمومی: از **اینونتوری**، نه از جدولِ کدها
  // ═══════════════════════════════════════════════════════════════════════
  //
  // نسخهٔ قبلی فقط `card_codes` را می‌خواند — یعنی جدولِ سیستمِ قدیمی.
  // نتیجه: کارتی که کاربر با **عکس** ثبت کرده بود در پروفایلِ عمومی
  // اصلاً دیده نمی‌شد. کاربر کارت را در «کارت‌های من» می‌دید ولی
  // حریفش در چت یا لیگ چیزی نمی‌دید — انگار کارتی نخریده.
  //
  // `user_card_inventory` منبعِ واحدِ حقیقت است: هر دو مسیرِ ثبت
  // (کد تنها، و عکس+کد) در همان جدول می‌نویسند. پس این کوئری هر دو را
  // با هم نشان می‌دهد و فردا اگر مسیرِ سومی اضافه شود، خودبه‌خود
  // پوشش داده می‌شود.
  //
  // `consumed_in_reward=false`: کارتی که خرجِ جایزه شده دیگر در
  // مجموعهٔ کاربر نیست.
  // همان COALESCE مسیرهای دیگر: پروفایلِ عمومی باید **دقیقاً** همان
  // تصویری را نشان دهد که خودِ کاربر در «کارت‌های من» می‌بیند. اگر این
  // یکی به‌روز نمی‌شد، کارتی که کاربر «پشت» می‌بیند برای حریفش «رو»
  // دیده می‌شد — همان دسته ناهماهنگی که قبلاً باعث شد کارتِ عکسی اصلاً
  // در پروفایلِ عمومی دیده نشود.
  const cards = await pool.query(
    `SELECT t.id AS card_type_id, t.name,
            ${cardDuel.INVENTORY_IMAGE_SQL} AS image_url, t.point_value,
            t.description, t.duel_attack, t.duel_defense, t.duel_speed,
            t.duel_technique, t.duel_goal_chance, t.duel_energy,
            t.duel_rarity, t.duel_effect, t.is_collectible,
            i.quantity::int AS registered_count,
            i.updated_at AS last_registered_at
       FROM user_card_inventory i
       JOIN card_types t ON t.id = i.card_type_id
      WHERE i.user_id = $1 AND i.consumed_in_reward = false AND i.quantity > 0
      ORDER BY i.quantity DESC, t.name
      LIMIT 50`, [req.params.id]);
  const leaguePayouts = await pool.query(`SELECT p.rank,p.amount,p.payment_status,p.created_at,s.month_year FROM league_payouts p JOIN league_seasons s ON s.id=p.league_season_id WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 20`, [req.params.id]);

  // Everything a visitor should see when they tap someone in chat or the
  // league table: their finishes, their prizes, and their cosmetics.
  const leagueHistory = await pool.query(
    `SELECT month_year, rank, points, prize_amount
       FROM user_league_history WHERE user_id=$1
      ORDER BY created_at DESC LIMIT 24`, [req.params.id]);

  // Physical trophies keep their own snapshot, so they survive a tier being
  // edited or deleted — the JOIN above would lose them.
  const trophies = await pool.query(
    `SELECT reward_name AS name, reward_image AS image_url, status, claimed_at
       FROM user_reward_claims
      WHERE user_id=$1 AND reward_type='physical'
      ORDER BY claimed_at DESC LIMIT 50`, [req.params.id]);

  const cosmeticsMap = await shop.cosmeticsFor([req.params.id]);
  const cosmetics = cosmeticsMap.get(req.params.id) || {};
  // صفحهٔ پروفایلِ عمومی جزئیاتِ کاملِ لول را نشان می‌دهد (نوار
  // پیشرفت)، نه فقط عدد — پس `statusFor` و نه `levelsFor`.
  const levelInfo = await level.statusFor(req.params.id);

  // Best rank ever, for the headline medal.
  const best = leagueHistory.rows.reduce(
    (acc, r) => (acc === null || r.rank < acc ? r.rank : acc), null);

  // ⚠️ ترتیب باید **دقیقاً** همان getLeaderboard باشد: (coins, points).
  //    اگر اینجا فقط points می‌ماند، کاربر در جدولِ لیگ رتبهٔ ۱ می‌دید و
  //    در پروفایلِ خودش رتبهٔ ۴ — دو عددِ متناقض از یک حقیقت.
  const currentRankRow = await pool.query(
    `SELECT sub.rank, sub.coins FROM (
       SELECT user_id, coins,
              DENSE_RANK() OVER(ORDER BY coins DESC, points DESC) AS rank
         FROM league_leaderboard_entries
        WHERE league_season_id = (SELECT id FROM league_seasons WHERE status='active' ORDER BY starts_at DESC LIMIT 1)
     ) sub WHERE sub.user_id = $1`,
    [req.params.id]
  );
  const currentRank = currentRankRow.rows[0]?.rank ? Number(currentRankRow.rows[0].rank) : null;
  // سکهٔ فصلِ جاری از جدولِ رتبه‌بندی می‌آید (منبعِ حقیقت)، و اگر هیچ
  // لیگِ فعالی نبود از شمارندهٔ users خوانده می‌شود.
  const seasonCoins = currentRankRow.rows[0]?.coins != null
    ? Number(currentRankRow.rows[0].coins)
    : Number(rows[0].coins || 0);

  res.json({
    currentLeagueRank: currentRank,
    ...rows[0],
    coins: seasonCoins,
    rewards: rewards.rows,
    cards: cards.rows,
    leaguePayouts: leaguePayouts.rows,
    leagueHistory: leagueHistory.rows.map(r => ({
      monthYear: r.month_year, rank: r.rank,
      points: r.points, prizeAmount: Number(r.prize_amount),
    })),
    trophies: trophies.rows,
    bestRank: best,
    totalPrizeAmount: leagueHistory.rows
      .reduce((a, r) => a + Number(r.prize_amount || 0), 0),
    cosmetics,
    level: levelInfo,
  });
}));

app.get('/api/rewards', auth, asyncHandler(async (req, res) => {
  // ⚠️ این کوئری یک بار شکسته شد و هیچ‌کس نفهمید. کامیت 4f67a5e که دربارهٔ
  // دوئل کارت بود، بی‌ربط این خط را به
  //     ... FROM reward_tiers WHERErequired_points
  // تبدیل کرد (WHERE به required_points چسبید). پستگرس **خطا نداد**، چون
  // `WHERErequired_points` را نامِ مستعارِ جدول خواند. یعنی کوئری معتبر
  // ماند، ۲۰۰ برگرداند، و فقط بی‌صدا شرطِ فیلتر و ترتیب را انداخت: کاربر
  // هر ۶۳ جایزهٔ غیرفعال را می‌دید و روی هرکدام می‌زد ۴۰۴ می‌گرفت.
  //
  // درسِ ماندگار: خطای داخلِ رشتهٔ SQL نه از `node -c` رد می‌شود نه از
  // ESLint. تنها نگهبانش تستِ زنده است — `testE2E.js` که حالا به
  // `npm test` اضافه شده تا اگر دوباره شکست، جلوی deploy را بگیرد.
  const { rows } = await pool.query(
    'SELECT *, ($1 >= required_points) AS eligible FROM reward_tiers '
    + 'WHERE is_active = true ORDER BY display_order, required_points',
    [req.user.current_points],
  );
  res.json(rows);
}));
// Reward groups: the user-facing catalogue with per-group progress.
const rewardGroups = require('./services/rewardGroupService');

app.get('/api/reward-groups', auth, asyncHandler(async (req, res) => {
  res.json(await rewardGroups.userView(req.user.id));
}));

// ── Shop: cosmetics + GhelGheli Plus ───────────────────────────────────────
app.get('/api/shop', auth, asyncHandler(async (req, res) => {
  // `shape=groups|items` نصفِ پاسخ را حذف می‌کند؛ توضیح در shopService.
  // بدونِ پارامتر هر دو می‌آید تا APKهای منتشرشده نشکنند.
  res.json(await shop.catalogue(req.user.id, req.query.shape));
}));

app.get('/api/shop/history', auth, asyncHandler(async (req, res) => {
  res.json(await shop.purchaseHistory(req.user.id, {
    limit: req.query.limit,
    offset: req.query.offset,
  }));
}));

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

app.post('/api/shop/items/:id/buy', auth, validateUuid('id'), shopLimiter, asyncHandler(async (req, res) => {
  try {
    res.json(await shop.buyShopItem(req.user.id, req.params.id, {
      useWallet: req.body?.useWallet === true,
    }));
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'خطا در خرید' });
  }
}));

app.post('/api/shop/plus', auth, shopLimiter, asyncHandler(async (req, res) => {
  try {
    res.json(await shop.buyPlusSubscription(
      req.user.id,
      req.body?.billingCycle || req.body?.cycle || 'monthly',
    ));
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'خطا در خرید اشتراک' });
  }
}));

// ── صندوق کارت ─────────────────────────────────────────────────────────
//
// مسیرِ ورودِ کاربری که کارتِ فیزیکی ندارد. بدونِ کارت، دوئلِ کارت اصلاً
// باز نمی‌شود — نه نسخهٔ ضعیف‌تری از بازی، بلکه هیچ. صندوق همان در است.
//
// ⚠️ اینجا هیچ کارتی تحویل داده نمی‌شود. `buy` فقط سفارشِ pending
//    می‌سازد؛ قرعه‌کشی و تحویل داخلِ تراکنشِ `/api/purchase/verify`
//    انجام می‌شود، بعد از آنکه کافه‌بازار پرداخت را تأیید کرد.
app.get('/api/card-box/overview', auth, asyncHandler(async (req, res) => {
  res.json(await cardBox.overview(req.user.id));
}));

app.post('/api/card-box/buy', auth, shopLimiter, asyncHandler(async (req, res) => {
  try {
    res.json(await shop.buyCardBox(req.user.id, {
      useWallet: req.body?.useWallet === true,
    }));
  } catch (e) {
    res.status(e.status || 500)
      .json({ message: e.message || 'خطا در ساخت سفارش صندوق' });
  }
}));

app.get('/api/card-box/history', auth, asyncHandler(async (req, res) => {
  res.json(await cardBox.history(req.user.id, req.query.limit));
}));

// ── جایزه‌های بازنشده (صندوقِ گردونه/لیگ) ──────────────────────────────
app.get('/api/grants', auth, asyncHandler(async (req, res) => {
  res.json({ grants: await grants.pendingFor(req.user.id) });
}));

app.post('/api/grants/:id/open', auth, validateUuid('id'), shopLimiter,
  asyncHandler(async (req, res) => {
    try {
      const result = await grants.open(req.user.id, req.params.id);
      res.json({
        message: result.alreadyOpened ? 'این صندوق قبلاً باز شده' : 'صندوق باز شد',
        ...result,
      });
    } catch (e) {
      res.status(e.status || 500).json({ message: e.message || 'باز کردن صندوق ناموفق بود' });
    }
  }));

// ── خرید: مرحلهٔ ۳ (راستی‌آزمایی و تحویل) ─────────────────────────────
//
// یک روتِ واحد برای هر دو نوع خرید. نوعِ سفارش از دیتابیس خوانده می‌شود
// نه از بدنهٔ درخواست — کلاینت نمی‌تواند با فرستادن kind دلخواه، سفارشِ
// ۹٬۰۰۰ تومانی را به پلاس سالانه تبدیل کند.
app.post('/api/purchase/verify', auth, shopLimiter, asyncHandler(async (req, res) => {
  try {
    const result = await shop.verifyPurchase(
      req.user.id,
      String(req.body?.orderId || ''),
      String(req.body?.purchaseToken || ''),
    );
    res.json({
      ok: true,
      ...result,
      message: result.alreadyProcessed
        ? 'این خرید قبلاً ثبت شده بود'
        : 'خرید با موفقیت انجام شد',
    });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'خطا در تأیید خرید' });
  }
}));

app.post('/api/shop/equip', auth, asyncHandler(async (req, res) => {
  try {
    // `kind` scopes an unequip to one slot. Without it "برداشتن" under the
    // badges also wiped the user's frame and name colour.
    res.json(await shop.equip(
      req.user.id, req.body?.slug || null, req.body?.kind || null));
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'خطا در انتخاب' });
  }
}));

// Use a club crest as the profile picture. Membership is checked server-side.
app.post('/api/shop/club-avatar', auth, asyncHandler(async (req, res) => {
  try {
    res.json(await shop.useClubAvatar(
      req.user.id, String(req.body?.club || '').slice(0, 64)));
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'خطا در تغییر عکس' });
  }
}));

// ── Clubs ──────────────────────────────────────────────────────────────────
// The league page's club tab: who belongs where. (clubService is required at
// the top, next to the other services.)
app.get('/api/clubs', auth, asyncHandler(async (req, res) => {
  res.json({
    clubs: await clubs.rosterSummary(),
    mine: await clubs.myClubs(req.user.id),
  });
}));

app.get('/api/clubs/:slug/members', auth, asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').slice(0, 64);
  // Reject anything that is not a real club rather than returning an empty
  // roster, so a typo in the client shows up instead of looking like a club
  // nobody joined.
  const known = await clubs.clubCatalogue();
  const club = known.find(c => c.slug === slug);
  if (!club) return res.status(404).json({ message: 'باشگاه پیدا نشد' });
  res.json({ club, members: await clubs.members(slug, req.query.limit) });
}));

// Physical prizes won — rendered as a trophy shelf on the profile.
app.get('/api/profile/trophies', auth, asyncHandler(async (req, res) => {
  res.json({ trophies: await rewardGroups.trophies(req.user.id) });
}));

// Past league finishes. monthly_league_points is wiped when a season closes,
// so without this the user loses all evidence of "I came 3rd in Mordad".
app.get('/api/profile/league-history', auth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT month_year, rank, points, prize_amount, created_at
       FROM user_league_history
      WHERE user_id=$1
      ORDER BY created_at DESC
      LIMIT 24`,
    [req.user.id]);
  res.json({ seasons: rows.map(r => ({
    monthYear: r.month_year,
    rank: r.rank,
    points: r.points,
    prizeAmount: Number(r.prize_amount),
    at: r.created_at,
  })) });
}));

app.post('/api/rewards/:id/claim', auth, validateUuid('id'), asyncHandler(async (req, res) => {
  // Delegated to rewardGroupService, which (unlike the previous inline
  // version) credits cash rewards to the wallet, consumes only the cards the
  // tier actually requires instead of the user's entire inventory, and
  // restarts that group's progress bar.
  try {
    res.json(await rewardGroups.claim(req.user.id, req.params.id));
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'خطا در ثبت جایزه' });
  }
}));

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
  keyGenerator: perUserKey,
  message: { message: 'تعداد تلاش برای ثبت کارت زیاد است؛ کمی بعد دوباره تلاش کنید' },
});

// خلاصهٔ کیف پول: موجودی، آمار، کارت ماسک‌شده، قوانین و دلیل مسدودی برداشت
app.get('/api/wallet', auth, asyncHandler(async (req, res) => {
  res.json(await walletService.summary(req.user.id));
}));

// دفتر تراکنش‌ها با صفحه‌بندی
app.get('/api/wallet/transactions', auth, asyncHandler(async (req, res) => {
  res.json(await walletService.transactions(req.user.id, {
    limit: req.query.limit,
    offset: req.query.offset,
  }));
}));

// ذخیره/به‌روزرسانی کارت بانکی (اعتبارسنجی Luhn + شبا + تشخیص بانک)
app.post('/api/wallet/bank-card', auth, bankCardLimiter, asyncHandler(async (req, res) => {
  const card = await withdrawalService.saveBankCard(req.user.id, req.body || {});
  res.json({ message: 'کارت بانکی ذخیره شد', card });
}));

app.delete('/api/wallet/bank-card', auth, asyncHandler(async (req, res) => {
  res.json(await withdrawalService.deleteBankCard(req.user.id));
}));

// ثبت درخواست برداشت (مبلغ همان لحظه بلوکه می‌شود)
app.post('/api/wallet/withdrawals', auth, withdrawalLimiter.mw, asyncHandler(async (req, res) => {
  const request = await withdrawalService.createRequest(req.user.id, req.body?.amount);
  res.json({ message: 'درخواست برداشت ثبت شد و در انتظار بررسی مدیریت است', request });
}));

app.get('/api/wallet/withdrawals', auth, asyncHandler(async (req, res) => {
  res.json(await withdrawalService.listForUser(req.user.id));
}));

// لغو توسط کاربر — فقط تا قبل از تأیید مدیر
app.post('/api/wallet/withdrawals/:id/cancel', auth, validateUuid('id'), withdrawalLimiter.mw, asyncHandler(async (req, res) => {
  res.json(await withdrawalService.cancelRequest(req.user.id, req.params.id));
}));

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

app.get('/api/wheel', auth, asyncHandler(async (req, res) => {
  res.json(await wheel.status(req.user.id));
}));

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

app.post('/api/wheel/spin', auth, wheelLimiter.mw, asyncHandler(async (req, res) => {
  const wheelOk = await require('./services/featureFlags').checkWheel(pool);
  if (!wheelOk.ok) return res.status(503).json({ message: wheelOk.message });
  const result = await wheel.spin(req.user.id, {
    // پرداخت نقدی از همان مسیر امن کیف پول می‌رود: spinId مرجع یکتاست، پس
    // حتی اگر این تابع دو بار صدا زده شود، واریز دوم duplicate تشخیص داده
    // می‌شود و پول دو بار داده نمی‌شود.
    creditCash: async (client, userId, amount, spinId, label) => {
      await walletService.credit(client, {
        userId,
        amount,
        source: 'wheel',
        referenceType: 'wheel_spins',
        referenceId: spinId,
        description: `گردونهٔ شانس — ${label}`,
      });
    },
    // امتیاز گردونه کمیسیون معرف **نمی‌سازد**.
    //
    // مالک دامنه را محدود کرد به «ثبت کارت» و «بازی ضربه‌زن». گردونه
    // هیچ‌کدام نیست — و اگر بود، هر چرخش رایگانِ دعوت‌شونده برای معرف هم
    // پول می‌ساخت، یعنی دقیقاً همان حلقهٔ خودتغذیه‌ای که باید بسته بماند.
    addPoints: async (client, userId, amount, source) => {
      await points.credit(client, {
        userId,
        points: amount,
        source: 'wheel',
        referenceType: 'wheel_spins',
        description: source ? `گردونهٔ شانس — ${source}` : 'گردونهٔ شانس',
        // `addLeaguePoints` پایین خودش امتیازِ لیگ را اضافه می‌کند.
        league: false,
      });
      await addLeaguePoints(client, userId, amount);
    },
  });

  // اعلان فقط برای جوایز نقدی: یک اعلان روزانه بابت ۱۰۰ امتیاز، نوتیفیکیشن
  // را به نویز تبدیل می‌کند و کاربر خاموشش می‌کند.
  if (result.prize.kind === 'cash') {
    createNotification(
      req.user.id, 'wallet', 'برندهٔ گردونه شدی',
      `${result.prize.label} به کیف پولت اضافه شد.`).catch(() => {});
  } else if (result.prize.kind === 'card_box') {
    createNotification(
      req.user.id, 'reward', 'صندوق کارت بردی',
      'صندوق کارت برنده‌ای — از کلکسیون بازش کن.').catch(() => {});
  } else if (result.prize.kind === 'shop_item' || result.prize.kind === 'plus_days') {
    createNotification(
      req.user.id, 'reward', 'جایزهٔ گردونه',
      `${result.prize.label} به حسابت اضافه شد.`).catch(() => {});
  }
  pass.grantXp(req.user.id, 'wheel_spin').catch(() => {});
  res.json(result);
}));

// `/api/wheel/count` حذف شد (چرخهٔ ۲۴): هر دو کلاینت نوارِ گردونه را از
// GET /api/wheel (که spinsLeft دارد) می‌سازند؛ شمارندهٔ جدا فقط یک مسیرِ
// تکراریِ احراز‌شده بود.

// ── گذر نبرد ─────────────────────────────────────────────────────────────
app.get('/api/pass', auth, asyncHandler(async (req, res) => {
  res.json(await pass.status(req.user.id));
}));

// Login streak is a separate, explicit claim from Battle Pass XP. Opening
// the app only reads the status; points are awarded exactly once after the
// user taps the button, inside a row-locked transaction.
app.get('/api/login-streak', auth, asyncHandler(async (req, res) => {
  res.json(await loginStreak.status(req.user.id));
}));
app.post('/api/login-streak/claim', auth, loginStreakLimiter,
  asyncHandler(async (req, res) => {
    res.json(await loginStreak.claim(req.user.id));
  }));

app.post('/api/pass/claim/:tierId?', auth,
  asyncHandler(async (req, res) => {
    const tierId = req.params.tierId || req.body.tierId;
    if (!tierId || !UUID_RE.test(String(tierId))) {
      return res.status(400).json({ message: 'شناسه پله نامعتبر است' });
    }
    const granted = await pass.claim(req.user.id, tierId);
    res.json({ message: 'جایزه دریافت شد', granted });
  }));

app.post('/api/pass/claim-all', auth, asyncHandler(async (req, res) => {
  const r = await pass.claimAll(req.user.id);
  res.json({ message: `${r.claimed} جایزه دریافت شد`, ...r });
}));

app.get('/api/wheel/history', auth, asyncHandler(async (req, res) => {
  res.json({ spins: await wheel.history(req.user.id, req.query.limit) });
}));

// ── معرفی دوستان ─────────────────────────────────────────────────────────
app.get('/api/referrals', auth, asyncHandler(async (req, res) => {
  res.json(await referrals.summary(req.user.id));
}));

app.get('/api/admin/referrals/purchase-commissions', adminAuth,
  requireRole('support'), asyncHandler(async (req, res) => {
    res.json(await referrals.purchaseCommissionAudit({
      limit: req.query.limit,
      offset: req.query.offset,
    }));
  }));

// آمار گردونه برای مدیر — بدون این هیچ راهی نیست بفهمیم نرخ واقعی جوایز با
// نرخ طراحی‌شده می‌خواند یا نه.
app.get('/api/admin/wheel/stats', adminAuth, requireRole('support'),
  asyncHandler(async (req, res) => {
    res.json(await wheel.stats());
  }));

// چرخش نامحدود برای یک حساب — ابزار تست مالک.
//
// requireRole() بدون آرگومان یعنی فقط سوپرادمین: این پرچم عملاً جوایز
// نامحدود می‌دهد، پس نباید در دسترس نقش پشتیبانی باشد.
app.post('/api/admin/users/:id/unlimited-spins', adminAuth, validateUuid('id'),
  requireRole(), asyncHandler(async (req, res) => {
    const on = req.body.enabled !== false;
    const { rowCount } = await pool.query(
      'UPDATE users SET unlimited_spins = $2, updated_at = NOW() WHERE id = $1',
      [req.params.id, on]);
    if (!rowCount) return res.status(404).json({ message: 'کاربر پیدا نشد' });
    await audit(req.admin.id, 'unlimited_spins', 'users', req.params.id,
      req.body.reason, { enabled: on });
    res.json({
      message: on ? 'چرخش نامحدود فعال شد' : 'چرخش نامحدود غیرفعال شد',
      unlimitedSpins: on,
    });
  }));

app.get('/api/league/current', auth, asyncHandler(async (req, res) => {
  const data = await getLeaderboard(Number(req.query.limit || 100), req.query.seasonId || null, req.user?.id);

  // Cosmetics for the standings (club badge, name colour).
  const cos = await shop.cosmeticsFor(data.entries.map(e => e.user_id));
  // ═══════════════════════════════════════════════════════════════════════
  // چرا لول کنارِ cosmetics پخش می‌شود
  // ═══════════════════════════════════════════════════════════════════════
  //
  // درخواست مالک: «این لول رو پروفایل افراد در تمامی قسمت ها دیده بشه».
  //
  // `cosmeticsFor` از قبل دقیقاً همین کار را می‌کند: یک کوئریِ دسته‌ای
  // برای همهٔ کاربرانِ یک صفحه. سوار شدن روی همان الگو یعنی صفرِ
  // درخواستِ اضافه — به‌جای N+1 که یک صفحهٔ لیگِ ۵۰ ردیفی را به ۵۰
  // رفت‌وبرگشتِ دیتابیس تبدیل می‌کرد.
  const lvl = await level.levelsFor(data.entries.map(e => e.user_id));

  // Last month's podium, shown alongside the live table so the previous
  // season's winners stay visible instead of vanishing at the reset.
  const { rows: prev } = await pool.query(
    `SELECT h.user_id, h.month_year, h.rank, h.points, h.prize_amount,
            u.nickname, u.first_name, u.profile_image_url, u.profile_avatar_key
       FROM user_league_history h
       JOIN users u ON u.id = h.user_id
      WHERE h.season_id = (
              SELECT id FROM league_seasons
               WHERE status='closed' ORDER BY ends_at DESC LIMIT 1)
        AND h.rank <= 3
      ORDER BY h.rank`);

  res.json({
    ...data,
    entries: data.entries.map(e => ({
      ...e,
      cosmetics: cos.get(e.user_id) || null,
      level: lvl[e.user_id]?.level ?? 0,
    })),
    previousSeason: prev.length ? {
      monthYear: prev[0].month_year,
      winners: prev.map(p => ({
        userId: p.user_id, rank: p.rank, points: p.points,
        prizeAmount: Number(p.prize_amount),
        nickname: p.nickname || p.first_name || 'کاربر',
        profileImageUrl: p.profile_image_url,
        profileAvatarKey: p.profile_avatar_key,
      })),
    } : null,
  });
}));

app.get('/api/chat/config', auth, asyncHandler(async (req, res) => {
  const minLifetimePoints = await getChatMinLifetimePoints();
  const [cooldown, pinned, emotePacks] = await Promise.all([
    getChatCooldownSeconds(),
    getChatPinnedMessage(),
    shop.emotePacksFor(req.user.id),
  ]);
  res.json({
    minLifetimePoints,
    messageCooldownSeconds: cooldown,
    eligible: Number(req.user.lifetime_points || 0) >= minLifetimePoints,
    userLifetimePoints: req.user.lifetime_points,
    pinned,
    emotePacks,
  });
}));

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

app.get('/api/chat/bootstrap', auth, asyncHandler(async (req, res) => {
  const minLifetimePoints = await getChatMinLifetimePoints();
  const eligible = Number(req.user.lifetime_points || 0) >= minLifetimePoints;
  const [cooldownSec, pinned, emotePacks, stickers] = await Promise.all([
    getChatCooldownSeconds(),
    getChatPinnedMessage(),
    shop.emotePacksFor(req.user.id),
    activeStickers(),
  ]);

  const config = {
    minLifetimePoints,
    messageCooldownSeconds: cooldownSec,
    eligible,
    userLifetimePoints: req.user.lifetime_points,
    pinned,
    emotePacks,
  };

  if (!eligible) {
    return res.json({
      config,
      messages: [],
      stickers,
      cannedMessages: cannedMessages(),
    });
  }

  const { rows } = await pool.query(`SELECT m.*, u.nickname,u.first_name,u.last_name,u.profile_image_url,u.profile_avatar_key,
      rm.message_text AS reply_text, rm.message_type AS reply_type, ru.nickname AS reply_nickname,
      s.image_url AS sticker_url, s.title AS sticker_title,
      (SELECT count(*)::int FROM chat_message_likes l WHERE l.message_id=m.id) AS like_count,
      EXISTS(SELECT 1 FROM chat_message_likes l WHERE l.message_id=m.id AND l.user_id=$1) AS liked_by_me,
      (m.user_id=$1) AS is_mine
    FROM chat_messages m
    JOIN users u ON u.id=m.user_id
    LEFT JOIN chat_messages rm ON rm.id=m.reply_to_message_id
    LEFT JOIN users ru ON ru.id=rm.user_id
    LEFT JOIN chat_stickers s ON s.id=m.sticker_id
    WHERE m.is_deleted=false ORDER BY m.sent_at DESC LIMIT 60`, [req.user.id]);

  const ids = [...new Set(rows.map(r => r.user_id))];
  const [cos, lvl] = await Promise.all([
    shop.cosmeticsFor(ids),
    level.levelsFor(ids),
  ]);

  const messages = rows.reverse().map(r => ({
    ...r,
    cosmetics: cos.get(r.user_id) || null,
    level: lvl[r.user_id]?.level ?? 0,
  }));

  res.json({
    config,
    messages,
    stickers,
    cannedMessages: cannedMessages(),
  });
}));

app.get('/api/chat/canned-messages', asyncHandler(async (req, res) => {
  res.json(cannedMessages());
}));

app.get('/api/chat/messages', auth, asyncHandler(async (req, res) => {
  const minLifetimePoints = await getChatMinLifetimePoints();
  if (Number(req.user.lifetime_points || 0) < minLifetimePoints) return res.status(403).json({ message: `برای ورود به چت باید حداقل ${minLifetimePoints} امتیاز تاریخی داشته باشید`, minLifetimePoints });
  const { rows } = await pool.query(`SELECT m.*, u.nickname,u.first_name,u.last_name,u.profile_image_url,u.profile_avatar_key,
      rm.message_text AS reply_text, rm.message_type AS reply_type, ru.nickname AS reply_nickname,
      s.image_url AS sticker_url, s.title AS sticker_title,
      (SELECT count(*)::int FROM chat_message_likes l WHERE l.message_id=m.id) AS like_count,
      EXISTS(SELECT 1 FROM chat_message_likes l WHERE l.message_id=m.id AND l.user_id=$1) AS liked_by_me,
      (m.user_id=$1) AS is_mine
    FROM chat_messages m
    JOIN users u ON u.id=m.user_id
    LEFT JOIN chat_messages rm ON rm.id=m.reply_to_message_id
    LEFT JOIN users ru ON ru.id=rm.user_id
    LEFT JOIN chat_stickers s ON s.id=m.sticker_id
    WHERE m.is_deleted=false ORDER BY m.sent_at DESC LIMIT 100`, [req.user.id]);
  // Attach cosmetics so the club badge and name colour render next to each
  // message. Resolved server-side because an equipped item stops applying the
  // moment Plus lapses unless the user actually bought it.
  const ids = [...new Set(rows.map(r => r.user_id))];
  const [cos, lvl] = await Promise.all([
    shop.cosmeticsFor(ids),
    level.levelsFor(ids),
  ]);
  res.json(rows.reverse().map(r => ({
    ...r,
    cosmetics: cos.get(r.user_id) || null,
    level: lvl[r.user_id]?.level ?? 0,
  })));
}));
app.post('/api/chat/messages', auth, chatLimiter.mw, asyncHandler(async (req, res) => {
  const minLifetimePoints = await getChatMinLifetimePoints();
  if (Number(req.user.lifetime_points || 0) < minLifetimePoints) return res.status(403).json({ message: `برای ارسال پیام باید حداقل ${minLifetimePoints} امتیاز تاریخی داشته باشید` });
  if (req.user.chat_banned_until && new Date(req.user.chat_banned_until) > new Date()) return res.status(403).json({ message: 'شما موقتاً از چت محروم هستید' });
  const cd = await ensureChatCooldown(req.user.id);
  if (cd.remaining > 0) return res.status(429).json({ message: `برای جلوگیری از اسپم، ${cd.remaining} ثانیه دیگر پیام بدهید`, cooldownSeconds: cd.cooldown, remainingSeconds: cd.remaining });
  const stickerId = req.body.stickerId || req.body.sticker_id || null;
  const replyTo = req.body.replyTo || req.body.reply_to_message_id || null;
  const clean = String(req.body.message || req.body.text || '').trim();
  // استیکر متنِ آزاد ندارد؛ اعتبارش فقط عضویت در فهرستِ فعالِ
  // chat_stickers است. کولدون و بن و سقف امتیاز همچنان یکسان اعمال می‌شوند.
  const sticker = stickerId ? await activeStickerById(stickerId) : null;
  if (stickerId && !sticker) {
    return res.status(400).json({ message: 'استیکر معتبر نیست' });
  }
  const messageType = sticker ? 'sticker' : 'text';
  // Validate reply target up front instead of letting a bad/deleted id hit
  // the DB's foreign key constraint, which previously bubbled up as a raw
  // Postgres error message to the client (see friendlyDbError note above).
  if (replyTo) {
    const rm = await pool.query('SELECT id FROM chat_messages WHERE id=$1 AND is_deleted=false', [replyTo]);
    if (!rm.rows[0]) return res.status(400).json({ message: 'پیام موردنظر برای پاسخ پیدا نشد' });
  }
  if (messageType === 'text') {
    if (!clean) return res.status(400).json({ message: 'متن پیام خالی است' });
    if (!await isAllowedChatMessage(clean, req.user.id)) {
      return res.status(400).json({ message: 'فقط پیام‌های آماده و ایموجی‌ها مجاز هستند.' });
    }
    await assertNoBadWords(clean);
  }
  // CHECK constraint: length(trim(message_text)) BETWEEN 1 AND 1000
  // برای استیکر متن آزاد نیست — یک placeholder غیرخالی می‌گذاریم
  // تا constraint نشکند (قبلاً '' باعث crash بک‌اند می‌شد).
  const storedText = messageType === 'sticker'
    ? (sticker.title ? String(sticker.title).slice(0, 80) : 'استیکر')
    : clean.slice(0, 1000);
  const { rows } = await pool.query(
    'INSERT INTO chat_messages(user_id,message_text,reply_to_message_id,sticker_id,message_type) VALUES($1,$2,$3,$4,$5) RETURNING *',
    [req.user.id, storedText, replyTo, sticker ? sticker.id : null, messageType]);
  // سقفِ ۲۰۰ پیامِ سراسری — هر دو مسیرِ درج (REST و سوکت) باید صدایش
  // بزنند، وگرنه کاربرِ وب که از REST می‌فرستد از سقف فرار می‌کند.
  chatRetention.onMessageInserted().catch(() => {});
  // BUG: the message BROADCAST carried no cosmetics, while GET /api/chat
  // does. A paying user's club badge and name colour therefore appeared on
  // every old message but vanished from their own new one until the page was
  // reloaded — reading as "my badge stopped working".
  const cosNew = await shop.cosmeticsFor([req.user.id]);
  const msg = { ...rows[0], nickname: req.user.nickname, first_name: req.user.first_name, last_name: req.user.last_name, profile_image_url: req.user.profile_image_url, profile_avatar_key: req.user.profile_avatar_key, like_count: 0, liked_by_me: false, is_mine: true, cosmetics: cosNew.get(req.user.id) || null };
  if (sticker) {
    msg.sticker_url = sticker.image_url;
    msg.sticker_title = sticker.title;
  }
  // `is_mine` مخصوصِ گیرنده است. اگر همین شیء broadcast شود، همهٔ کاربران
  // پیام را «مالِ خودم» می‌بینند و در سمتِ چپ با رنگِ آبی رندر می‌کنند.
  // پس نسخهٔ عمومی بدون این پرچم می‌رود و فقط پاسخِ HTTP آن را دارد.
  const { is_mine: _mine, ...publicMsg } = msg;
  io.emit('chat:new', publicMsg);
  res.json(msg);
}));

app.post('/api/chat/messages/:id/report', auth, validateUuid('id'), asyncHandler(async (req, res) => {
  await pool.query('UPDATE chat_messages SET is_reported=true, report_count=report_count+1 WHERE id=$1', [req.params.id]);
  res.json({ message: 'گزارش ثبت شد' });
}));

app.post('/api/chat/messages/:id/like', auth, validateUuid('id'), asyncHandler(async (req, res) => {
  await pool.query('INSERT INTO chat_message_likes(message_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.params.id, req.user.id]);
  const c = await pool.query('SELECT count(*)::int AS count FROM chat_message_likes WHERE message_id=$1', [req.params.id]);
  io.emit('chat:liked', { messageId: req.params.id, likeCount: c.rows[0].count });
  res.json({ liked: true, likeCount: c.rows[0].count });
}));
app.delete('/api/chat/messages/:id/like', auth, validateUuid('id'), asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM chat_message_likes WHERE message_id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  const c = await pool.query('SELECT count(*)::int AS count FROM chat_message_likes WHERE message_id=$1', [req.params.id]);
  io.emit('chat:liked', { messageId: req.params.id, likeCount: c.rows[0].count });
  res.json({ liked: false, likeCount: c.rows[0].count });
}));

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
  keyGenerator: perUserKey, // CGNAT — توضیح کامل کنار تعریفِ perUserKey
  message: { message: 'تعداد آپلود زیاد است؛ کمی بعد دوباره تلاش کنید' },
});

app.post('/api/support/uploads/image', auth, uploadLimiter, imageUpload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'فقط فایل تصویری (PNG/JPG/WEBP/GIF) مجاز است' });
  // محتوای واقعیِ فایل راستی‌آزمایی شود، نه فقط اعلامِ فرستنده — چراییِ کامل
  // روی خودِ verifyUpload در imageService نوشته شده است. خطایش status:400
  // دارد و از همان error handlerِ عمومی پاسِ درست می‌گیرد.
  await verifyUpload(req.file);
  // Phone photos are multi-megabyte; shrink before anyone has to download it.
  const r = await optimizeUpload(req.file);
  console.log(`[upload] support ${kb(r.bytesBefore)} -> ${kb(r.bytesAfter)}`);
  res.json({ url: `/uploads/images/${r.filename}`, bytes: r.bytesAfter });
}));

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

app.get('/api/support/quota', auth, asyncHandler(async (req, res) => {
  res.json({ ...(await ticketQuota(req.user.id)), maxAttachments: ticketMaxAttachments() });
}));

app.post('/api/support/tickets', auth, asyncHandler(async (req, res) => {
  const { subject, message } = req.body;
  const attachments = sanitizeAttachments(req.body.attachments);
  if (!String(subject || '').trim()) return res.status(400).json({ message: 'موضوع تیکت را وارد کنید' });
  if (!String(message || '').trim() && !attachments.length) {
    return res.status(400).json({ message: 'متن پیام یا حداقل یک عکس لازم است' });
  }
  const quota = await ticketQuota(req.user.id);
  if (!quota.canCreate) return res.status(429).json({ ...quota });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ticket = await client.query('INSERT INTO support_tickets(user_id,subject) VALUES($1,$2) RETURNING *', [req.user.id, String(subject).trim().slice(0, 180)]);
    await client.query(
      "INSERT INTO support_ticket_messages(ticket_id,sender_type,sender_user_id,message_text,attachments) VALUES($1,'user',$2,$3,$4)",
      [ticket.rows[0].id, req.user.id, String(message || '').trim(), JSON.stringify(attachments)]
    );
    await client.query('COMMIT');
    res.json(ticket.rows[0]);
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}));

app.get('/api/support/tickets', auth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM support_tickets WHERE user_id=$1 ORDER BY updated_at DESC', [req.user.id]);
  res.json(rows);
}));

app.get('/api/support/tickets/:id/messages', auth, validateUuid('id'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT m.* FROM support_ticket_messages m JOIN support_tickets t ON t.id=m.ticket_id WHERE t.id=$1 AND t.user_id=$2 ORDER BY m.created_at', [req.params.id, req.user.id]);
  res.json(rows);
}));

app.post('/api/support/tickets/:id/messages', auth, validateUuid('id'), asyncHandler(async (req, res) => {
  const attachments = sanitizeAttachments(req.body.attachments);
  const text = String(req.body.message || '').trim();
  if (!text && !attachments.length) return res.status(400).json({ message: 'متن پیام یا حداقل یک عکس لازم است' });

  // A closed ticket is final: replying would silently reopen a conversation
  // support considers finished (and would bypass the one-ticket-a-day rule).
  const t = await pool.query('SELECT status FROM support_tickets WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  if (!t.rows[0]) return res.status(404).json({ message: 'تیکت پیدا نشد' });
  if (t.rows[0].status === 'closed') {
    return res.status(409).json({ message: 'این تیکت بسته شده است. در صورت نیاز تیکت جدیدی ثبت کنید.' });
  }

  await pool.query(
    "INSERT INTO support_ticket_messages(ticket_id,sender_type,sender_user_id,message_text,attachments) VALUES($1,'user',$2,$3,$4)",
    [req.params.id, req.user.id, text, JSON.stringify(attachments)]
  );
  await pool.query("UPDATE support_tickets SET status='open', updated_at=NOW() WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  res.json({ message: 'پیام ارسال شد' });
}));

app.get('/api/notifications', auth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM notifications WHERE user_id=$1 OR user_id IS NULL ORDER BY created_at DESC LIMIT 100', [req.user.id]); res.json(rows);
}));
app.patch('/api/notifications/:id/read', auth, validateUuid('id'), asyncHandler(async (req, res) => {
  await pool.query('UPDATE notifications SET is_read=true WHERE id=$1 AND (user_id=$2 OR user_id IS NULL)', [req.params.id, req.user.id]); res.json({ message: 'خوانده شد' });
}));

// Admin
app.post('/api/admin/auth/login', adminLoginLimiter, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM admin_users WHERE username=$1 AND is_active=true', [req.body.username]);
  const admin = rows[0];
  if (!admin || !(await bcrypt.compare(String(req.body.password || ''), admin.password_hash))) return res.status(401).json({ message: 'ورود نامعتبر' });
  res.json({ token: signAdmin(admin), admin: { id: admin.id, username: admin.username, role: admin.role } });
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
app.get('/api/admin/dashboard', adminAuth, asyncHandler(async (req, res) => {
  const q = await Promise.all([
    pool.query('SELECT count(*)::int AS count FROM users'),
    // ═══════════════════════════════════════════════════════════════════
    // کارت‌های ثبت‌شده = photo_card_codes (مسیرِ فعلیِ عکس+کد)
    // ═══════════════════════════════════════════════════════════════════
    //
    // قبلاً این دو کاشی مجموعِ دو نسلِ جدول کد را می‌شمردند (card_codes
    // قدیمی + photo_card_codes). سیستمِ قدیمی با مایگریشن ۰۸۰ حذف شد و
    // فقط جدولِ فعلی مانده — هر ثبتِ واقعی از مسیرِ «کارت با عکس» در
    // photo_card_codes می‌نویسد.
    //
    // ⚠️ عمداً از `user_card_inventory` شمرده نمی‌شود: آن جدول کارتِ
    // صندوق و اعطای دستی را هم نگه می‌دارد، و ردیفش با `quantity` جمع
    // می‌شود نه یک ردیف به‌ازای هر ثبت — یعنی عددی می‌داد که «کارتِ
    // ثبت‌شده» نیست.
    pool.query(`SELECT count(*)::int AS count FROM photo_card_codes
                 WHERE status='used' AND used_at::date=CURRENT_DATE`),
    pool.query(`SELECT count(*)::int AS count FROM photo_card_codes
                 WHERE status='used' AND used_at >= date_trunc('month', NOW())`),
    pool.query("SELECT count(*)::int AS count FROM user_reward_claims WHERE status='pending'"),
    getLeaderboard(10),
    // صف‌های عملیاتی — داشبورد قبلی فقط چهار عدد کلی داشت و مدیر برای
    // «کار امروز» باید چهار صفحه را جدا باز می‌کرد. این‌ها COUNT ارزان‌اند.
    pool.query("SELECT count(*)::int AS count FROM support_tickets WHERE status <> 'closed'"),
    pool.query("SELECT count(*)::int AS count, COALESCE(SUM(amount),0)::bigint AS amount FROM withdrawal_requests WHERE status='pending'"),
    pool.query("SELECT count(*)::int AS count FROM photo_card_submissions WHERE status='pending'"),
    pool.query("SELECT count(DISTINCT user_id)::int AS count FROM user_subscriptions WHERE expires_at > NOW()"),
    pool.query('SELECT COALESCE(SUM(coins),0)::bigint AS total FROM users'),
    pool.query("SELECT count(*)::int AS count FROM app_crash_reports WHERE status='open'"),
    pool.query("SELECT count(*)::int AS count FROM users WHERE joined_at::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tehran')::date"),
    pool.query("SELECT count(*)::int AS count FROM wheel_spins WHERE spun_day = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tehran')::date"),
  ]);
  res.json({
    users: q[0].rows[0].count,
    usedCodesToday: q[1].rows[0].count,
    usedCodesThisMonth: q[2].rows[0].count,
    pendingClaims: q[3].rows[0].count,
    league: q[4],
    pendingTickets: q[5].rows[0].count,
    pendingWithdrawals: q[6].rows[0].count,
    pendingWithdrawalAmount: Number(q[6].rows[0].amount || 0),
    pendingPhotoReviews: q[7].rows[0].count,
    plusActive: q[8].rows[0].count,
    coinsInCirculation: Number(q[9].rows[0].total || 0),
    openCrashes: q[10].rows[0].count,
    usersJoinedToday: q[11].rows[0].count,
    wheelSpinsToday: q[12].rows[0].count,
  });
}));

// ── حافظهٔ کشِ مانیتورینگ سرور ───────────────────────────────────────────
// صفحهٔ «مانیتورینگ سرور» هر ۴ ثانیه این اندپوینت را صدا می‌زند. قبلاً هر
// فراخوانی سه پروسهٔ زیرسیستمی را **هم‌زمان** (`execSync`) اجرا می‌کرد:
// `redis-cli`، `pm2 jlist` و `tail`. در Node تک‌رشته‌ای هر `execSync` کلِ
// حلقهٔ رویداد را می‌بندد؛ یعنی وقتی یک مدیر صفحهٔ مانیتورینگ را باز
// می‌گذاشت، هر ۴ ثانیه حلقهٔ رویداد صدها میلی‌ثانیه قفل می‌شد و بازی‌های
// زنده و درخواست‌های بقیهٔ کاربران تأخیر می‌گرفتند.
//
// دو اصلاح:
//   1. `execSync` → `exec` (غیرهم‌زمان، پشتِ Promise) تا انسدادِ حلقهٔ
//      رویداد از بین برود.
//   2. نتیجه هر دو فراخوانیِ گران (redis + pm2 log) **کش** می‌شود و هر
//      ~۱۰ ثانیه یک‌بار تازه می‌شود. داده‌های پرتابی (تعداد سوکت، اتاق،
//      کانکشنِ پستگرس) همیشه تازه‌اند؛ فقط آن‌چه واقعاً هر ۴ ثانیه لازم
//      نیست، کش می‌گیرد. (۱۰ ثانیه برای نوارِ مانیتورینگ بیش از اندازه
//      کافی است.)
const { exec } = require('child_process');
const { promisify } = require('util');
const execP = promisify(exec);
let _metricsCache = null;
let _metricsCachedAt = 0;
const METRICS_CACHE_TTL_MS = 10_000;

async function readRedisMemory() {
  try {
    const { stdout } = await execP('redis-cli info memory', { timeout: 3000 });
    const match = stdout.match(/used_memory_human:([^\r\n]+)/);
    const matchRss = stdout.match(/used_memory_rss_human:([^\r\n]+)/);
    if (match) return `${match[1]} (RSS: ${matchRss ? matchRss[1] : '—'})`;
    return '—';
  } catch (_) {
    return 'در دسترس نیست';
  }
}

async function readPm2Logs() {
  try {
    let logPath = '/root/.pm2/logs/ghelgheli-api-error-3.log';
    try {
      const { stdout } = await execP('pm2 jlist', { timeout: 3000 });
      const jlist = JSON.parse(stdout);
      const app = jlist.find(x => x.name === 'ghelgheli-api');
      if (app?.pm2_env?.pm_err_log_path) logPath = app.pm2_env.pm_err_log_path;
    } catch (_) { /* keep default path */ }

    if (!fs.existsSync(logPath)) return 'فایل لاگ پیدا نشد';
    const { stdout } = await execP(`tail -n 100 ${logPath}`, { timeout: 3000 });
    return stdout;
  } catch (e) {
    return `خطا در خواندن لاگ: ${e.message}`;
  }
}

app.get('/api/admin/metrics', adminAuth, asyncHandler(async (req, res) => {
  const attachGames = require('./games/engine');

  // TTL check — skip the expensive subprocess reads when recently cached.
  let redisMemory;
  let pm2Logs;
  if (_metricsCache && Date.now() - _metricsCachedAt < METRICS_CACHE_TTL_MS) {
    ({ redisMemory, pm2Logs } = _metricsCache);
  } else {
    [redisMemory, pm2Logs] = await Promise.all([readRedisMemory(), readPm2Logs()]);
    _metricsCache = { redisMemory, pm2Logs };
    _metricsCachedAt = Date.now();
  }

  res.json({
    socketCount: io.engine.clientsCount || 0,
    // onlineUsers ناهمگام است چون در حالت خوشه‌ای باید از ردیس بخواند.
    // بدون await یک Promise به JSON می‌رفت و در پنل «{}» دیده می‌شد.
    onlineUsers: await presence.onlineUsers(),
    activeRooms: attachGames.rooms ? attachGames.rooms.size : 0,
    postgresConnections: {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    },
    redisMemory,
    pm2Logs
  });
}));

app.post('/api/admin/uploads/image', adminAuth, requireRole('support'), imageUpload.single('image'), asyncHandler(async (req, res) => {
  // fileFilter drops anything that isn't png/jpg/webp/gif without raising,
  // so a missing req.file here means "wrong type" rather than "no file".
  if (!req.file) return res.status(400).json({ message: 'فقط فایل تصویری (PNG/JPG/WEBP/GIF) مجاز است' });
  // همانِ مسیر کاربر: محتوای واقعی با sharp راستی‌آزمایی می‌شود — mimetype
  // و پسوندِ اعلامیِ فرستنده هر دو جعل‌شدنی‌اند (توضیح کامل در imageService).
  await verifyUpload(req.file);
  const r = await optimizeUpload(req.file);
  console.log(`[upload] admin ${kb(r.bytesBefore)} -> ${kb(r.bytesAfter)}`);
  res.json({ url: `/uploads/images/${r.filename}`, bytes: r.bytesAfter });
}));

// ساخت/آپلود استیکر تصویری عمداً حذف شد. چت محصول فقط پیام آماده و emoji
// است؛ endpointهای مدیریتی قبلی asset خراب می‌ساختند و قابلیتی را نشان
// می‌دادند که هیچ کلاینت کاربری مصرف نمی‌کرد. جدول تاریخی برای پیام‌های
// قدیمی می‌ماند، اما دیگر APIای برای تولید تصویر استیکر وجود ندارد.

app.get('/api/admin/settings/chat', adminAuth, asyncHandler(async (req, res) => {
  const minLifetimePoints = await getChatMinLifetimePoints();
  const messageCooldownSeconds = await getChatCooldownSeconds();
  const badWords = await getChatBadWords();
  res.json({ minLifetimePoints, messageCooldownSeconds, badWords });
}));
app.patch('/api/admin/settings/chat', adminAuth, requireRole(), asyncHandler(async (req, res) => {
  const minLifetimePoints = Math.max(0, Math.floor(Number(req.body.minLifetimePoints || 0)));
  const messageCooldownSeconds = Math.max(0, Math.floor(Number(req.body.messageCooldownSeconds ?? req.body.cooldownSeconds ?? 5)));
  const badWords = Array.isArray(req.body.badWords) ? req.body.badWords.map(w => String(w).trim()).filter(Boolean) : String(req.body.badWordsText || '').split(/[\n,،]+/).map(w => w.trim()).filter(Boolean);
  await pool.query(
    `INSERT INTO app_settings(key,value,updated_by_admin_id,updated_at)
     VALUES('chat_min_lifetime_points',$1,$2,NOW())
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_by_admin_id=EXCLUDED.updated_by_admin_id, updated_at=NOW()`,
    [JSON.stringify(minLifetimePoints), req.admin.id]
  );
  await pool.query(
    `INSERT INTO app_settings(key,value,updated_by_admin_id,updated_at)
     VALUES('chat_message_cooldown_seconds',$1,$2,NOW())
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_by_admin_id=EXCLUDED.updated_by_admin_id, updated_at=NOW()`,
    [JSON.stringify(messageCooldownSeconds), req.admin.id]
  );
  await pool.query(
    `INSERT INTO app_settings(key,value,updated_by_admin_id,updated_at)
     VALUES('chat_bad_words',$1,$2,NOW())
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_by_admin_id=EXCLUDED.updated_by_admin_id, updated_at=NOW()`,
    [JSON.stringify(badWords), req.admin.id]
  );
  await audit(req.admin.id, 'update_chat_settings', 'app_settings', null, req.body.reason || 'تنظیم از پنل مدیریت', { minLifetimePoints, messageCooldownSeconds, badWordsCount: badWords.length });
  res.json({ message: 'تنظیمات چت ذخیره شد', minLifetimePoints, messageCooldownSeconds, badWords });
}));
app.get('/api/admin/chat/pinned', adminAuth, asyncHandler(async (req, res) => {
  res.json(await getChatPinnedMessage());
}));
app.patch('/api/admin/chat/pinned', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const text = String(req.body.text ?? '').trim().slice(0, 300);
  const accent = PIN_ACCENTS.includes(req.body.accent) ? req.body.accent : 'gold';
  // Unpinning keeps the text around so the admin can toggle it back on
  // without retyping; `active` is what the clients actually check.
  const active = Boolean(req.body.active) && text.length > 0;
  const value = {
    text, accent, active,
    pinnedAt: active ? new Date().toISOString() : null,
    pinnedBy: active ? (req.admin.username || null) : null,
  };
  await pool.query(
    `INSERT INTO app_settings(key,value,updated_by_admin_id,updated_at)
     VALUES('chat_pinned_message',$1,$2,NOW())
     ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_by_admin_id=EXCLUDED.updated_by_admin_id, updated_at=NOW()`,
    [JSON.stringify(value), req.admin.id]
  );
  await audit(req.admin.id, active ? 'pin_chat_message' : 'unpin_chat_message', 'app_settings', null, req.body.reason || null, { accent, length: text.length });
  // Live-update everyone who currently has the chat room open.
  io.emit('chat:pinned', value);
  res.json({ message: active ? 'پیام سنجاق شد' : 'سنجاق برداشته شد', ...value });
}));

// ── Game reward settings (online human-vs-human matches only) ──
app.get('/api/admin/settings/games', adminAuth, asyncHandler(async (req, res) => {
  res.json(await getGameRewardSettings());
}));
app.patch('/api/admin/settings/games', adminAuth, requireRole(), asyncHandler(async (req, res) => {
  const value = await saveGameRewardSettings(req.body || {}, req.admin.id);
  await audit(req.admin.id, 'update_game_rewards', 'app_settings', null, req.body.reason || null, value);
  res.json({ message: 'تنظیمات امتیاز بازی‌ها ذخیره شد', ...value });
}));

// Recent scoring history, so support can answer "why did my points change?".
app.get('/api/admin/games/results', adminAuth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.*, u.nickname, u.mobile, o.nickname AS opponent_nickname
     FROM game_results r
     JOIN users u ON u.id = r.user_id
     LEFT JOIN users o ON o.id = r.opponent_user_id
     ORDER BY r.created_at DESC LIMIT 100`,
  );
  res.json(rows);
}));

app.get('/api/admin/settings/sms', adminAuth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query("SELECT value FROM app_settings WHERE key='sms_config' LIMIT 1");
  const cfg = rows[0]?.value || {};
  res.json({ ...cfg, apiKey: undefined, apiKeyMasked: maskSecret(cfg.apiKey) });
}));
app.patch('/api/admin/settings/sms', adminAuth, requireRole(), asyncHandler(async (req, res) => {
  const current = await pool.query("SELECT value FROM app_settings WHERE key='sms_config' LIMIT 1");
  const oldCfg = current.rows[0]?.value || {};
  const body = req.body || {};
  const cfg = {
    provider: body.provider ?? oldCfg.provider ?? '',
    sender: body.sender ?? oldCfg.sender ?? '',
    apiKey: body.apiKey && !String(body.apiKey).includes('****') ? body.apiKey : (oldCfg.apiKey || ''),
    patternCode: body.patternCode ?? oldCfg.patternCode ?? '',
    enabled: Boolean(body.enabled),
    testMode: body.testMode !== undefined ? Boolean(body.testMode) : Boolean(oldCfg.testMode ?? true),
  };
  await pool.query(`INSERT INTO app_settings(key,value,updated_by_admin_id,updated_at) VALUES('sms_config',$1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_by_admin_id=EXCLUDED.updated_by_admin_id, updated_at=NOW()`, [JSON.stringify(cfg), req.admin.id]);
  await audit(req.admin.id, 'update_sms_settings', 'app_settings', null, null, { ...cfg, apiKey: maskSecret(cfg.apiKey) });
  res.json({ message: 'تنظیمات پیامک ذخیره شد', ...cfg, apiKey: undefined, apiKeyMasked: maskSecret(cfg.apiKey) });
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

// Reward catalogue, grouping, and claim administration.
app.use('/api', require('./routes/adminRewards')({
  pool, adminAuth, requireRole, asyncHandler, audit, validateUuid,
  rewardGroups, safeImageUrl, cashAmountInput, keepImage, createNotification,
  walletService,
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

// ── اهرم‌های موتور (آستانه‌های تشخیص، سطح، استریک، پیام‌های آماده) ──────
app.use('/api', require('./routes/adminOps')({
  adminAuth, requireRole, asyncHandler, audit, opsConfig,
  matchSettings: require('./services/matchSettings'),
}));

const presence = createPresenceService(pool);
app.use('/api', require('./routes/growth')({
  auth, adminAuth, requireRole, asyncHandler, validateUuid, presence, rateLimit,
}));

app.use('/api', require('./routes/payments')({ auth, asyncHandler }));

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== 'user') throw new Error('bad token');
    // `game_xp` اینجا خوانده می‌شود تا موتور بازی بتواند لولِ هر دو
    // بازیکن را در `game:start` بفرستد — درخواست مالک: «در حین بازی هم
    // لول بقیه رو بشه دید».
    //
    // چرا در همین کوئری و نه یک درخواستِ جدا: این تنها جایی است که
    // کاربرِ سوکت بارگذاری می‌شود و یک ستونِ اضافه هزینه‌ای ندارد؛
    // یک کوئریِ دوم در مسیرِ اتصال، تأخیرِ شروعِ بازی را زیاد می‌کرد.
    const { rows } = await pool.query(`SELECT id,nickname,first_name,last_name,
      profile_image_url,profile_avatar_key,chat_banned_until,status,
      lifetime_points,current_points,game_xp,coins, equipped_club,equipped_frame,
      equipped_color,equipped_profile_background,equipped_emote_pack,profile_title
      FROM users WHERE id=$1`, [payload.sub]);
    if (!rows[0] || rows[0].status !== 'active') throw new Error('inactive');
    const socketCosmetics = await shop.cosmeticsFor([rows[0].id]);
    socket.user = {
      ...rows[0],
      cosmetics: socketCosmetics.get(rows[0].id) || null,
    };
    next();
  } catch(e){ next(new Error('unauthorized')); }
});
presence.attach(io);
// کلید = شناسهٔ کاربر، مقدار = زمانِ ۲۰ پیامِ آخر در پنجرهٔ یک‌دقیقه‌ای.
// این Map قبلاً فقط set می‌شد و هرگز پاک نمی‌شد: هر کاربری که یک‌بار در طول
// عمرِ پروسه چت می‌کرد، برای همیشه یک ورودی نگه می‌داشت. با انتشار روی
// کافه‌بازار و ده‌ها هزار کاربر این یک نشتیِ آهسته اما دائمی است
// (اندازه‌گیری‌شده: ۵۰هزار کاربر ≈ ۱۳ مگابایت heap که هرگز آزاد نمی‌شود).
// حالا ورودی‌های منقضی به‌صورت تنبل و کران‌دار جارو می‌شوند.
const socketMessageTimes = new Map();
const CHAT_WINDOW_MS = 60_000;
let lastChatSweep = 0;

function sweepChatRateLimiter(now) {
  // حداکثر یک‌بار در دقیقه، تا روی مسیرِ داغِ چت هزینه‌ای اضافه نکند.
  if (now - lastChatSweep < CHAT_WINDOW_MS) return;
  lastChatSweep = now;
  for (const [userId, times] of socketMessageTimes) {
    if (!times.length || now - times[times.length - 1] >= CHAT_WINDOW_MS) {
      socketMessageTimes.delete(userId);
    }
  }
}

io.on('connection', socket => {
  socket.on('chat:send', async (payload, cb) => {
    try {
      const now = Date.now();
      sweepChatRateLimiter(now);
      const arr = (socketMessageTimes.get(socket.user.id) || []).filter(t => now - t < CHAT_WINDOW_MS);
      if (arr.length >= 20) throw new Error('ضد اسپم: تعداد پیام زیاد است');
      const minLifetimePoints = await getChatMinLifetimePoints();
      if (Number(socket.user.lifetime_points || 0) < minLifetimePoints) throw new Error(`برای ارسال پیام باید حداقل ${minLifetimePoints} امتیاز تاریخی داشته باشید`);
      const cd = await ensureChatCooldown(socket.user.id);
      if (cd.remaining > 0) throw new Error(`برای جلوگیری از اسپم، ${cd.remaining} ثانیه دیگر پیام بدهید`);
      if (socket.user.chat_banned_until && new Date(socket.user.chat_banned_until) > new Date()) throw new Error('شما موقتاً از چت محروم هستید');
      const body = typeof payload === 'object' && payload ? payload : { text: payload };
      const stickerId = body.stickerId || null;
      const sticker = stickerId ? await activeStickerById(stickerId) : null;
      if (stickerId && !sticker) throw new Error('استیکر معتبر نیست');
      const replyTo = body.replyTo || null;
      const clean = String(body.text || '').trim();
      const messageType = sticker ? 'sticker' : 'text';
      if (replyTo) {
        const rm = await pool.query('SELECT id FROM chat_messages WHERE id=$1 AND is_deleted=false', [replyTo]);
        if (!rm.rows[0]) throw new Error('پیام موردنظر برای پاسخ پیدا نشد');
      }
      if (messageType === 'text') {
        if (!clean) throw new Error('متن پیام خالی است');
        if (!await isAllowedChatMessage(clean, socket.user.id)) {
          throw new Error('فقط پیام‌های آماده و ایموجی‌ها مجاز هستند.');
        }
        await assertNoBadWords(clean);
      }
      const storedText = messageType === 'sticker'
        ? (sticker.title ? String(sticker.title).slice(0, 80) : 'استیکر')
        : clean.slice(0, 1000);
      arr.push(now); socketMessageTimes.set(socket.user.id, arr);
      const { rows } = await pool.query(
        'INSERT INTO chat_messages(user_id,message_text,reply_to_message_id,sticker_id,message_type) VALUES($1,$2,$3,$4,$5) RETURNING *',
        [socket.user.id, storedText, replyTo, sticker ? sticker.id : null, messageType]);
      // سقفِ ۲۰۰ پیامِ سراسری. خودش throw نمی‌کند، پس ثبتِ پیام هرگز
      // به‌خاطر پاک‌سازی شکست نمی‌خورد.
      chatRetention.onMessageInserted().catch(() => {});
      // Same fix as the REST path: without cosmetics here, a badge bought
      // seconds earlier does not show on the sender's own new message.
      const cosWs = await shop.cosmeticsFor([socket.user.id]);
      const msg = { ...rows[0], nickname: socket.user.nickname, first_name: socket.user.first_name, last_name: socket.user.last_name, profile_image_url: socket.user.profile_image_url, profile_avatar_key: socket.user.profile_avatar_key, like_count: 0, cosmetics: cosWs.get(socket.user.id) || null };
      if (sticker) {
        msg.sticker_url = sticker.image_url;
        msg.sticker_title = sticker.title;
      }
      // مثل مسیرِ REST: نسخهٔ عمومی بدونِ `is_mine` broadcast می‌شود و فقط
      // خودِ فرستنده آن را در callback با پرچمِ true می‌گیرد.
      io.emit('chat:new', msg);
      cb && cb({ ok: true, message: { ...msg, is_mine: true } });
    } catch(e){ cb && cb({ ok: false, error: e.message }); }
  });

});

// Multiplayer games: a shared engine + one small rules file per game
// (backend/src/games/), so adding a game never touches this file.
const games = require('./games');
games.attach(io);

// اگر process بعد از کسر stake و قبل از تسویه خاموش شود، سند reserved در
// دیتابیس می‌ماند. startup و sweep ساعتی اصل امتیاز را برمی‌گردانند؛ در
// نتیجه crash/reboot هرگز ورودی کاربر را برای همیشه قفل نمی‌کند.
gameStakes.refundStaleMatches(60)
  .then(n => { if (n) console.log(`[games:stake] startup refunded ${n} stale match(es)`); })
  .catch(e => console.error('[games:stake] startup recovery failed:', e.message));
cron.schedule('29 * * * *', () => {
  gameStakes.refundStaleMatches(60)
    .then(n => { if (n) console.log(`[games:stake] refunded ${n} stale match(es)`); })
    .catch(e => console.error('[games:stake] recovery failed:', e.message));
});

// ── بستنِ لیگ‌های تمام‌شده — ساعتی، نه «اولِ ماه» ────────────────────────
//
// قبلاً `cron.schedule('5 0 1 * *', closeActiveSeason)` بود: فقط اولِ هر
// ماهِ میلادی و فقط روی **یک** لیگ.
//
// مالک تصریح کرد: «تعداد روز لیگ فقط توسط ادمین مشخص میشه و اصلا ربطی
// به ماهانه و هفتگی نداره، ساعت اتمامش هم ادمین به تاریخ ایران مشخص
// میکنه». پنلِ مدیر هم تا سه لیگِ هم‌زمان با تاریخِ دلخواه می‌سازد.
//
// با زمان‌بندِ قبلی، لیگی که مثلاً چهارشنبه ۲۰:۰۰ تمام می‌شد تا اولِ ماهِ
// بعد باز می‌ماند و هیچ‌کس جایزه‌اش را نمی‌گرفت.
//
// حالا هر ساعت سرِ دقیقهٔ ۵ اجرا می‌شود و هر لیگی که `ends_at`اش گذشته
// را می‌بندد. حداکثر تأخیر یک ساعت است — که برای واریزِ جایزه (که
// به‌هرحال منتظرِ تأییدِ مدیر می‌ماند) کاملاً قابل قبول است.
//
// timezone صریح داده شده تا اگر سرور مهاجرت کرد، تفسیرِ تاریخ‌هایی که
// مدیر به وقتِ ایران وارد کرده جابه‌جا نشود.
cron.schedule('5 * * * *', () => {
  closeExpiredSeasons()
    .then(r => { if (r.closed) console.log(`[league] ${r.closed} فصل بسته شد`); })
    .catch(e => console.error('[league] بستنِ خودکارِ فصل شکست خورد:', e.message));
}, { timezone: 'Asia/Tehran' });

// Sweep expired tap-game nonces hourly.
//
// submitBatch() prunes only the CALLING user's rows, so a player who stops
// playing leaves theirs behind forever — the table grew unbounded with
// replay-protection records that were long past their 30-minute TTL.
// ── یادآور چرخش رایگان ───────────────────────────────────────────────────
//
// ۱۸:۳۰ به وقت تهران. سرور روی Asia/Tehran است، ولی timezone صریح داده
// شده تا اگر روزی سرور مهاجرت کرد، ساعتِ اعلان جابه‌جا نشود و نیمه‌شب
// به گوشی مردم نرود.
//
// سرویس **خودش هم** ساعات استراحت (۲۲:۰۰–۰۹:۰۰) را بررسی می‌کند؛ این
// دو لایه عمدی است. جزئیات در wheelReminderService.
cron.schedule('30 18 * * *', () => {
  wheelReminder.sendDailyReminder()
    .catch(e => console.error('[wheel-reminder] failed:', e.message));
}, { timezone: 'Asia/Tehran' });

cron.schedule('17 * * * *', () => {
  tapGame.pruneNonces()
    .then(n => { if (n > 0) console.log(`[tap] pruned ${n} expired nonces`); })
    .catch(e => console.error('[tap] nonce prune failed:', e.message));
});

// تاریخچهٔ دوئل فقط پنج بازی امتیازی اخیر را نشان می‌دهد؛ ربات و ردیف‌های
// کهنه‌تر از دو هفته اینجا پاک می‌شوند تا جدول سبک بماند.
cron.schedule('17 4 * * *', () => {
  cardDuel.pruneBattleHistory()
    .then(n => { if (n) console.log(`[card-duel] pruned ${n} old battle log(s)`); })
    .catch(e => console.error('[card-duel] history prune failed:', e.message));
}, { timezone: 'Asia/Tehran' });

// جدولِ سهمیهٔ سکه به ازای هر کاربرِ فعال روزی یک ردیف می‌سازد. بدونِ
// هرس، بعد از یک سال با ۱۰٬۰۰۰ کاربرِ فعال حدود ۳.۶ میلیون ردیفِ مرده
// می‌ماند. هفت روز نگه می‌داریم تا اگر لازم شد بشود دیروز را بررسی کرد.
cron.schedule('23 4 * * *', () => {
  coins.pruneQuota(7)
    .then(n => { if (n) console.log(`[coins] pruned ${n} old quota row(s)`); })
    .catch(e => console.error('[coins] quota prune failed:', e.message));
}, { timezone: 'Asia/Tehran' });

// هرسِ رویدادهای تحلیلیِ کهنه — بند ۶بِ ممیزیِ مستقلِ دوم: این جدول
// تنها جدولِ رویدادی بود که بدون سقف رشد می‌کرد. رویدادها فقط به‌دردِ
// نمودارهای پنل می‌خورند که حداکثر ۹۰ روز عقب را نشان می‌دهند؛ کهنه‌تر
// از آن نه کاربردی دارد نه ارزش نگهداری.
cron.schedule('41 4 * * *', () => {
  analytics.pruneOld(90)
    .then(n => { if (n) console.log(`[analytics] pruned ${n} old event(s)`); })
    .catch(e => console.error('[analytics] event prune failed:', e.message));
}, { timezone: 'Asia/Tehran' });

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
    console.error(err);
    analytics.reportCrash({
      platform: 'backend',
      source: `${req.method} ${req.route?.path || req.path}`,
      release: process.env.APP_RELEASE || process.env.GIT_SHA || null,
      message: err.message,
      stack: err.stack,
      context: { requestId: req.headers['x-request-id'] || null },
    }).catch(reportError => console.error('[crash-report] failed:', reportError.message));
  } else {
    console.warn(`[${status}] ${req.method} ${req.originalUrl} — ${err.message}`);
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
  console.error('[fatal] unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaught exception:', err);
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
    console.error('[cluster] اتصال آداپتور ناموفق بود، تک‌پروسه ادامه می‌دهیم:', e.message);
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
  ]).catch(e => console.error('[ops] پیش‌بارگذاری تنظیمات ناموفق بود:', e.message));
  await ensureActiveSeason();
  console.log(`GhelGheli API on :${port}`);
});

// خاموشی تمیز: ردپای حضور این پروسه از ردیس پاک شود تا کاربران برای
// دو دقیقه «آنلاینِ روح» نمانند.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    presence.drain().catch(() => {}).finally(() => process.exit(0));
  });
}
