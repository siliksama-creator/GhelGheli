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
const YAML = require('yamljs');
const { Server } = require('socket.io');
const { pool } = require('./config/db');
const { audit } = require('./services/auditService');
const { createNotification } = require('./services/notificationService');
const { ensureActiveSeason, addLeaguePoints, getLeaderboard, closeActiveSeason } = require('./services/leagueService');
const { optimizeUpload, kb } = require('./services/imageService');
const { getGameRewardSettings, saveGameRewardSettings } = require('./services/gameRewardService');
const walletService = require('./services/walletService');
const referrals = require('./services/referralService');
const wheel = require('./services/wheelService');
const pass = require('./services/passService');
const wheelReminder = require('./services/wheelReminderService');
// Hoisted with the other services: /api/users/:id/public uses it and sits
// above the shop routes, so a require next to those would read as a
// temporal-dead-zone bug even though route handlers run after startup.
const shop = require('./services/shopService');
// لولِ دائمیِ بازیکن — کنارِ cosmetics در همان مسیرها پخش می‌شود.
const level = require('./services/levelService');
// Same reason: the profile endpoint checks club membership before letting
// someone wear a crest, and it is defined above the club routes.
const clubs = require('./services/clubService');
const withdrawalService = require('./services/withdrawalService');

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
app.use(morgan('dev'));
const uploadRoot = path.join(__dirname, '..', 'uploads');
const imageUploadDir = path.join(uploadRoot, 'images');
fs.mkdirSync(imageUploadDir, { recursive: true });
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
app.use('/uploads', express.static(uploadRoot, { setHeaders: publicAssetHeaders }));
app.use('/public', express.static(path.join(__dirname, '..', 'public'), { setHeaders: publicAssetHeaders }));
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
app.use('/docs', docsGuard, swaggerUi.serve, swaggerUi.setup(YAML.load(__dirname + '/../docs/openapi.yaml')));
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
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype)),
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
function normalizeCardCode(code) { return String(code || '').trim().toUpperCase(); }
function validateCodeFormat(code) { return /^[A-Z0-9_-]{8,128}$/.test(normalizeCardCode(code)); }
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
  return Number.isFinite(n) && n > 0 ? Math.min(100, Math.floor(n)) : 10;
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

// همهٔ limiterهای زیر روی مسیرهای احراز هویت‌شده‌اند، پس همه `perUserKey`
// می‌گیرند. (فهرست کامل در تستِ testRateLimit.js نگهبانی می‌شود.)
const cardRedeemLimiter = rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: true, legacyHeaders: false, keyGenerator: perUserKey, message: { message: 'تعداد تلاش زیاد است؛ کمی بعد دوباره امتحان کنید' } });
const chatLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false, keyGenerator: perUserKey });
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

app.get('/health', (req, res) => res.json({ ok: true, name: 'GhelGheli API' }));

// Catalogue of playable games, so the mobile/web clients can render the hub
// dynamically instead of shipping a hardcoded list that drifts out of sync.
app.get('/api/games', (req, res) => res.json(require('./games').CATALOG));

app.post('/api/auth/request-otp', otpLimiter, asyncHandler(async (req, res) => {
  const mobile = normalizeMobile(req.body.mobile);
  const purpose = req.body.purpose || 'register';
  if (!/^\+?\d{10,15}$/.test(mobile) || !['register','login','reset_password'].includes(purpose)) return res.status(400).json({ message: 'شماره یا نوع درخواست معتبر نیست' });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const hash = await bcrypt.hash(code, 10);
  const ttl = Number(process.env.OTP_TTL_MINUTES || 5);
  await pool.query('INSERT INTO otp_codes(mobile,code_hash,purpose,expires_at) VALUES($1,$2,$3,NOW()+($4::text||\' minutes\')::interval)', [mobile, hash, purpose, ttl]);
  // NOTE: no SMS gateway is wired up yet (see backend/src/services/smsService.js).
  // Until a real provider is configured in the admin settings panel, OTP codes
  // are generated and stored but not delivered to the user's phone. Keep
  // OTP_DEV_MODE=true in non-production environments to see the code in the
  // response/logs for manual testing.
  if (process.env.OTP_DEV_MODE === 'true') console.log(`DEV OTP for ${mobile}: ${code}`);
  res.json({ message: 'کد تایید ارسال شد', devCode: process.env.OTP_DEV_MODE === 'true' ? code : undefined });
}));

app.post('/api/auth/verify-otp', otpVerifyLimiter, asyncHandler(async (req, res) => {
  const mobile = normalizeMobile(req.body.mobile);
  const { code, purpose = 'register' } = req.body;
  const { rows } = await pool.query("SELECT * FROM otp_codes WHERE mobile=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1", [mobile, purpose]);
  if (!rows[0] || !(await bcrypt.compare(String(code || ''), rows[0].code_hash))) return res.status(400).json({ message: 'کد تایید نادرست یا منقضی است' });
  await pool.query('UPDATE otp_codes SET consumed_at=NOW() WHERE id=$1', [rows[0].id]);
  await pool.query("INSERT INTO users(mobile,mobile_verified) VALUES($1,true) ON CONFLICT(mobile) DO UPDATE SET mobile_verified=true", [mobile]);
  res.json({ message: 'شماره موبایل تایید شد' });
}));

app.post('/api/auth/register', asyncHandler(async (req, res) => {
  const mobile = normalizeMobile(req.body.mobile);
  const { password, firstName, lastName, nickname } = req.body;
  const { rows } = await pool.query('SELECT * FROM users WHERE mobile=$1 AND mobile_verified=true', [mobile]);
  if (!rows[0]) return res.status(400).json({ message: 'ابتدا شماره موبایل را با OTP تایید کنید' });
  if (!isValidPasswordLength(password)) return res.status(400).json({ message: 'رمز عبور باید بین ۶ تا ۷۲ کاراکتر باشد' });
  const hash = await bcrypt.hash(password, 12);
  const updated = await pool.query(
    'UPDATE users SET password_hash=$1, first_name=$2, last_name=$3, nickname=$4, updated_at=NOW() WHERE mobile=$5 RETURNING *',
    [hash, firstName, lastName, nickname, mobile]
  );

  // همان منطق مسیر ثبت‌نام مستقیم — این مسیر (OTP) وقتی درگاه پیامک وصل
  // شود مسیر اصلی می‌شود، پس نباید بدون سیستم معرفی بماند.
  const newUser = updated.rows[0];
  const myCode = await referrals.ensureCode(newUser.id).catch(() => null);

  let referral = null;
  const referralCode = req.body.referralCode || req.body.referral_code;
  if (referralCode) {
    const refClient = await pool.connect();
    try {
      await refClient.query('BEGIN');
      referral = await referrals.attachReferrer(refClient, newUser.id, referralCode);
      await refClient.query('COMMIT');
    } catch (e) {
      await refClient.query('ROLLBACK').catch(() => {});
      referral = { ok: false, reason: 'error' };
    } finally {
      refClient.release();
    }
    if (referral?.ok) {
      // اعلان فقط برای معرف. دعوت‌شونده جایزه‌اش را همان لحظه در پاسخ
      // ثبت‌نام می‌بیند، پس یک نوتیفیکیشن اضافه فقط تکرار است.
      let body = `${referrals.SPINS_PER_REFERRAL} چرخش گردونه گرفتی و از `
        + `این به بعد ${referrals.COMMISSION_PERCENT}٪ امتیازهای او از ثبت `
        + `کارت و بازی ضربه‌زن هم به تو می‌رسد.`;
      // اگر همین دعوت باعث شد سهمیهٔ روزانه بالا برود، بگو — این بزرگ‌ترین
      // پاداش سیستم است و بی‌صدا دادنش حیف است.
      if (referral.referrerInvites % referrals.INVITES_PER_DAILY_SPIN === 0
          && referral.referrerInvites <= referrals.MAX_INVITES_FOR_DAILY) {
        body += ` 🎉 با ${faDigits(referral.referrerInvites)} دعوت، از حالا `
          + `روزی ${faDigits(referral.referrerDailySpins)} چرخش رایگان داری!`;
      }
      createNotification(
        referral.referrerId, 'referral', 'یک دوست با کد تو عضو شد 🎉', body,
      ).catch(() => {});
    }
  }

  res.json({
    token: signUser(newUser),
    user: safeUser(newUser),
    referralCode: myCode,
    referralApplied: referral?.ok === true,
    // چند چرخش خودِ دعوت‌شونده گرفت — تا کلاینت بتواند بگوید «۳ چرخش
    // گردونه گرفتی» به‌جای یک «ثبت شد» بی‌معنا.
    referralSpins: referral?.ok ? referrals.SPINS_PER_REFERRAL : 0,
    referralReason: referral && !referral.ok ? referral.reason : undefined,
  });
}));

app.post('/api/auth/register-password', userLoginLimiter, asyncHandler(async (req, res) => {
  if (process.env.ALLOW_PASSWORD_REGISTRATION !== 'true') return res.status(403).json({ message: 'ثبت‌نام مستقیم فعلاً غیرفعال است' });
  const mobile = normalizeMobile(req.body.mobile);
  const { password, firstName, lastName, nickname, age, city, province, profileImageUrl, profileAvatarKey, bankAccount, currentPassword } = req.body;
  if (!/^\+?[0-9A-Za-z]{3,20}$/.test(mobile)) return res.status(400).json({ message: 'شماره/نام کاربری معتبر نیست' });
  if (!isValidPasswordLength(password)) return res.status(400).json({ message: 'رمز عبور باید بین ۶ تا ۷۲ کاراکتر باشد' });

  // SECURITY FIX: this endpoint used to run an unconditional
  // `ON CONFLICT(mobile) DO UPDATE ... password_hash=EXCLUDED.password_hash`,
  // which meant ANYONE who knew a victim's mobile number could silently
  // overwrite their password and take over the account — with no OTP, no
  // proof of ownership, and no old password required. It even reset
  // status back to 'active', bypassing an admin block. Verified end-to-end
  // against production before this fix.
  //
  // Because the SMS gateway is not wired up yet (see the comment on
  // /api/auth/request-otp), we cannot require a real OTP here without
  // locking every user out. Instead: registration only CREATES a brand new
  // account; if the mobile already has a password set, the caller must
  // prove ownership with the current password before anything is changed.
  const existing = await pool.query('SELECT * FROM users WHERE mobile=$1', [mobile]);
  if (existing.rows[0]?.password_hash) {
    const ok = currentPassword && (await bcrypt.compare(String(currentPassword), existing.rows[0].password_hash));
    if (!ok) return res.status(409).json({ message: 'این شماره قبلاً ثبت‌نام شده است. برای ورود از «ورود» استفاده کنید یا رمز فعلی را برای تغییر وارد کنید.' });
  }

  // Keep an already-set nickname when re-registering to change the password
  // (don't clobber it with a fresh random placeholder); only fall back to
  // an anonymous placeholder for a brand-new account with no nickname.
  const finalNickname = nickname || existing.rows[0]?.nickname || anonymousNickname();

  // AUDIT FIX: این مسیر همان فیلدهایی را می‌نویسد که PATCH /api/profile
  // می‌نویسد، ولی هیچ‌کدام از اعتبارسنجی‌های آن را نداشت. بازتولید روی
  // production:
  //   age:-5                              -> ۵۰۰ (نقض CHECK دیتابیس)
  //   firstName با ۵۰۰۰ کاراکتر            -> ۵۰۰ (سرریز varchar)
  //   profileAvatarKey:"../../etc/passwd"  -> ۲۰۰ و ذخیره شد
  //   profileImageUrl:"javascript:alert(1)"-> ۲۰۰ و ذخیره شد
  //
  // دو مورد آخر جدی‌ترند: هر دو بعداً به کلاینت‌ها برمی‌گردند و مستقیم در
  // مسیر فایل / تگ تصویر می‌نشینند. ممیزی قبلی این‌ها را در PATCH بست ولی
  // این در ثبت‌نام باز مانده بود — یعنی مهاجم فقط کافی بود موقع ثبت‌نام
  // مقدار را بفرستد، نه بعدش.
  let ageValue = null;
  if (age !== undefined && age !== null && age !== '') {
    const n = Number(age);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 5 || n > 120) {
      return res.status(400).json({ message: 'سن باید عددی بین ۵ تا ۱۲۰ باشد' });
    }
    ageValue = n;
  }
  if (profileAvatarKey !== undefined && profileAvatarKey !== null
      && profileAvatarKey !== '' && !safeAvatarKey(profileAvatarKey)) {
    return res.status(400).json({ message: 'آواتار انتخابی معتبر نیست' });
  }
  if (profileImageUrl !== undefined && profileImageUrl !== null
      && profileImageUrl !== '' && !safeImageUrl(profileImageUrl)) {
    return res.status(400).json({ message: 'آدرس عکس پروفایل معتبر نیست' });
  }

  const hash = await bcrypt.hash(String(password), 12);
  const { rows } = await pool.query(
    `INSERT INTO users(mobile,mobile_verified,password_hash,first_name,last_name,nickname,age,city,province,profile_image_url,profile_avatar_key,bank_account,status)
     VALUES($1,true,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active')
     ON CONFLICT(mobile) DO UPDATE SET password_hash=EXCLUDED.password_hash, first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name, nickname=EXCLUDED.nickname, age=EXCLUDED.age, city=EXCLUDED.city, province=EXCLUDED.province, profile_image_url=EXCLUDED.profile_image_url, profile_avatar_key=EXCLUDED.profile_avatar_key, bank_account=EXCLUDED.bank_account, mobile_verified=true, updated_at=NOW()
     RETURNING *`,

    // همان محدودیت طولی که PATCH /api/profile اعمال می‌کند، تا رشتهٔ بلند
    // به‌جای ۵۰۰، به‌آرامی کوتاه شود.
    [
      mobile, hash,
      boundedText(firstName, 60),
      boundedText(lastName, 60),
      boundedText(finalNickname, 40),
      ageValue,
      boundedText(city, 60),
      boundedText(province, 60),
      safeImageUrl(profileImageUrl),
      safeAvatarKey(profileAvatarKey),
      boundedText(bankAccount, 40),
    ]
  );

  // کد اختصاصی این کاربر. همیشه ساخته می‌شود، حتی اگر خودش با کد کسی
  // نیامده باشد — کد برای دعوت کردن *دیگران* است.
  const myCode = await referrals.ensureCode(rows[0].id).catch(() => null);

  // اگر با کد دوستی آمده، ثبتش کن.
  //
  // شکست اینجا **نباید** ثبت‌نام را خراب کند: کد اشتباه یعنی «معرفی ثبت
  // نشد»، نه «اکانت ساخته نشد». نتیجه به کلاینت برمی‌گردد تا پیام درست
  // بدهد به‌جای اینکه سکوت کند و کاربر فکر کند کد کار کرد.
  let referral = null;
  const referralCode = req.body.referralCode || req.body.referral_code;
  if (referralCode && !existing.rows[0]) {
    const refClient = await pool.connect();
    try {
      await refClient.query('BEGIN');
      referral = await referrals.attachReferrer(refClient, rows[0].id, referralCode);
      await refClient.query('COMMIT');
    } catch (e) {
      await refClient.query('ROLLBACK').catch(() => {});
      referral = { ok: false, reason: 'error' };
    } finally {
      refClient.release();
    }
    if (referral?.ok) {
      // اعلان فقط برای معرف. دعوت‌شونده جایزه‌اش را همان لحظه در پاسخ
      // ثبت‌نام می‌بیند، پس یک نوتیفیکیشن اضافه فقط تکرار است.
      let body = `${referrals.SPINS_PER_REFERRAL} چرخش گردونه گرفتی و از `
        + `این به بعد ${referrals.COMMISSION_PERCENT}٪ امتیازهای او از ثبت `
        + `کارت و بازی ضربه‌زن هم به تو می‌رسد.`;
      // اگر همین دعوت باعث شد سهمیهٔ روزانه بالا برود، بگو — این بزرگ‌ترین
      // پاداش سیستم است و بی‌صدا دادنش حیف است.
      if (referral.referrerInvites % referrals.INVITES_PER_DAILY_SPIN === 0
          && referral.referrerInvites <= referrals.MAX_INVITES_FOR_DAILY) {
        body += ` 🎉 با ${faDigits(referral.referrerInvites)} دعوت، از حالا `
          + `روزی ${faDigits(referral.referrerDailySpins)} چرخش رایگان داری!`;
      }
      createNotification(
        referral.referrerId, 'referral', 'یک دوست با کد تو عضو شد 🎉', body,
      ).catch(() => {});
    }
  }

  res.json({
    token: signUser(rows[0]),
    user: safeUser(rows[0]),
    referralCode: myCode,
    referralApplied: referral?.ok === true,
    // چند چرخش خودِ دعوت‌شونده گرفت — تا کلاینت بتواند بگوید «۳ چرخش
    // گردونه گرفتی» به‌جای یک «ثبت شد» بی‌معنا.
    referralSpins: referral?.ok ? referrals.SPINS_PER_REFERRAL : 0,
    referralReason: referral && !referral.ok ? referral.reason : undefined,
  });

}));

app.post('/api/auth/login', userLoginLimiter, asyncHandler(async (req, res) => {
  const mobile = normalizeMobile(req.body.mobile);
  const { rows } = await pool.query('SELECT * FROM users WHERE mobile=$1', [mobile]);
  const user = rows[0];
  if (!user || !user.password_hash || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) return res.status(401).json({ message: 'شماره موبایل یا رمز عبور نادرست است' });
  if (user.status !== 'active') return res.status(403).json({ message: 'حساب شما مسدود شده است' });
  res.json({ token: signUser(user), user: safeUser(user) });
}));

app.post('/api/auth/forgot-password/reset', otpVerifyLimiter, asyncHandler(async (req, res) => {
  const mobile = normalizeMobile(req.body.mobile);
  const { code, newPassword } = req.body;
  if (!isValidPasswordLength(newPassword)) return res.status(400).json({ message: 'رمز عبور باید بین ۶ تا ۷۲ کاراکتر باشد' });
  const { rows } = await pool.query("SELECT * FROM otp_codes WHERE mobile=$1 AND purpose='reset_password' AND consumed_at IS NULL AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1", [mobile]);
  if (!rows[0] || !(await bcrypt.compare(String(code || ''), rows[0].code_hash))) return res.status(400).json({ message: 'کد بازیابی معتبر نیست' });
  await pool.query('UPDATE otp_codes SET consumed_at=NOW() WHERE id=$1', [rows[0].id]);
  await pool.query('UPDATE users SET password_hash=$1 WHERE mobile=$2', [await bcrypt.hash(newPassword, 12), mobile]);
  res.json({ message: 'رمز عبور تغییر کرد' });
}));

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
const AVATAR_KEYS = new Set([
  'avatar_1_football.png', 'avatar_2_trophy.png', 'avatar_3_star.png',
  'avatar_4_rocket.png', 'avatar_5_lion.png', 'avatar_6_tiger.png',
  'avatar_7_eagle.png', 'avatar_8_target.png', 'avatar_9_bolt.png',
  'avatar_10_crown.png',
]);
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

app.post('/api/cards/redeem', auth, cardRedeemLimiter, asyncHandler(async (req, res) => {
  const code = normalizeCardCode(req.body.code);
  if (!validateCodeFormat(code)) return res.status(400).json({ message: 'فرمت کد کارت معتبر نیست' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q = await client.query(`SELECT c.*, t.point_value, t.cash_amount, t.name AS card_type_name, t.is_active
      FROM card_codes c JOIN card_types t ON t.id=c.card_type_id WHERE c.code=$1 FOR UPDATE`, [code]);
    const card = q.rows[0];
    if (!card) throw Object.assign(new Error('کد نامعتبر است'), { status: 404 });
    if (card.status === 'used') throw Object.assign(new Error('این کد قبلاً استفاده شده است'), { status: 409 });
    if (card.status !== 'unused') throw Object.assign(new Error('این کد دیگر معتبر نیست'), { status: 409 });
    if (!card.is_active) throw Object.assign(new Error('نوع این کارت غیرفعال است'), { status: 400 });
    await client.query("UPDATE card_codes SET status='used', used_by_user_id=$1, used_at=NOW(), updated_at=NOW() WHERE id=$2", [req.user.id, card.id]);
    await client.query('UPDATE users SET current_points=current_points+$1, lifetime_points=lifetime_points+$1, monthly_league_points=monthly_league_points+$1, updated_at=NOW() WHERE id=$2', [card.point_value, req.user.id]);
    // کمیسیون ۵٪ معرف. روی همان تراکنش، تا اگر ثبت کارت برگشت، کمیسیون
    // هم برگردد و امتیازی از هوا ساخته نشود.
    await referrals.payCommission(client, req.user.id, card.point_value, 'card');
    // ── طرحِ نمایشی: رو یا پشت، تصادفی ──
    //
    // ⚠️ چرا مسیرِ «فقط کد» هم این کار را می‌کند
    //
    // این مسیرِ قدیمی است (کاربر فقط کد را وارد می‌کند، بدونِ عکس) و
    // وسوسه‌کننده بود که دست‌نخورده بماند. ولی هر دو مسیر در **یک**
    // جدولِ اینونتوری می‌نویسند و کاربر همان یک صفحه را می‌بیند. اگر
    // فقط یکی از دو مسیر قرعه بیندازد، نصفِ کارت‌های کاربر تصادفی و
    // نصفِ دیگر همیشه تصویرِ پیش‌فرض می‌شوند — که بدتر از نداشتنِ
    // قابلیت است چون بی‌قاعده به نظر می‌رسد.
    //
    // اگر برای این نوعِ کارت هیچ طرحِ تصویری آپلود نشده باشد (که در
    // سیستمِ قدیمی عادی است) نتیجه NULL می‌ماند و همان
    // `card_types.image_url` نمایش داده می‌شود — رفتارِ قبلی، بدونِ
    // تغییر. توضیحِ کاملِ چراییِ این طراحی در `photoCardService.js`.
    const pickDesign = await client.query(
      `SELECT id FROM photo_card_designs
        WHERE card_type_id=$1 AND is_active=true ORDER BY random() LIMIT 1`,
      [card.card_type_id]);
    const displayDesignId = pickDesign.rows[0]?.id ?? null;

    // ── UPSERT اتمیک، نه SELECT-سپس-INSERT ──
    //
    // الگوی قبلی با دو درخواستِ هم‌زمان روی **اولین** نسخهٔ یک کارت
    // می‌شکست: هر دو SELECT خالی می‌دیدند، هر دو INSERT می‌زدند، و دومی
    // به `uq_inventory_active` می‌خورد. بازتولید شد، حدس نبود.
    //
    // شرطِ `WHERE consumed_in_reward = false` در ON CONFLICT لازم است تا
    // Postgres بداند کدام ایندکسِ **جزئی** را هدف بگیرد.
    //
    // COALESCE: نسخهٔ دوم طرحِ انتخاب‌شده را عوض نمی‌کند تا خانهٔ
    // اینونتوری جلوی چشمِ کاربر ورق نخورد و کشِ گوشی باطل نشود.
    //
    // توضیحِ کاملِ باگ در `photoCardService.creditSubmission`.
    await client.query(
      `INSERT INTO user_card_inventory
         (user_id, card_type_id, quantity, consumed_in_reward, display_design_id)
       VALUES($1,$2,1,false,$3)
       ON CONFLICT (user_id, card_type_id) WHERE consumed_in_reward = false
       DO UPDATE SET
         quantity = user_card_inventory.quantity + 1,
         display_design_id = COALESCE(
           user_card_inventory.display_design_id, EXCLUDED.display_design_id),
         updated_at = NOW()`,
      [req.user.id, card.card_type_id, displayDesignId]);
    await addLeaguePoints(client, req.user.id, card.point_value);

    // جایزهٔ نقدی کارت → کیف پول، در همان تراکنش مصرف کد.
    // مرجع = شناسهٔ خود کد کارت، پس حتی اگر این مسیر به هر دلیلی دوباره اجرا
    // شود، ایندکس یکتای دفتر کل مانع واریز دوم می‌شود.
    const cashAmount = Number(card.cash_amount || 0);
    if (cashAmount > 0) {
      await walletService.credit(client, {
        userId: req.user.id,
        amount: cashAmount,
        source: 'card_cash',
        referenceType: 'card_codes',
        referenceId: card.id,
        description: `جایزهٔ نقدی کارت «${card.card_type_name}»`,
      });
    }

    await client.query('COMMIT');
    if (cashAmount > 0) {
      createNotification(
        req.user.id,
        'wallet',
        'جایزهٔ نقدی به کیف پول اضافه شد 💰',
        `${cashAmount.toLocaleString('en-US')} تومان بابت کارت «${card.card_type_name}» به کیف پول شما واریز شد.`,
      ).catch(() => {});
    }
    // ── چرا اینجا XP گذر نبرد داده نمی‌شود ──
    //
    // خواستهٔ صریح مالک: «ثبت کارت در هیچ حالتی نباید بتل‌پس رو چه در
    // رایگان چه در پلاس باز کنه».
    //
    // قبلاً `pass.grantXp(req.user.id, 'card_redeem')` اینجا بود.
    // اکشنِ `card_redeem` هم از `passService.SOURCES` حذف شد، پس حتی
    // اگر کسی این خط را دوباره اضافه کند هیچ اثری ندارد و تستِ
    // «هیچ اکشنی برای ثبت کارت وجود ندارد» قرمز می‌شود.
    //
    // مسیرِ «ثبت کارت با عکس» هم همین قاعده را دارد.
    const userNow = await pool.query('SELECT current_points,lifetime_points,monthly_league_points,wallet_balance FROM users WHERE id=$1', [req.user.id]);
    const reward = await pool.query('SELECT * FROM reward_tiers WHERE is_active=true AND required_points <= $1 ORDER BY required_points DESC LIMIT 1', [userNow.rows[0].current_points]);
    if (reward.rows[0]) createNotification(req.user.id, 'reward_threshold', 'تبریک! به جایزه رسیدی', `شما به سطح ${reward.rows[0].name} رسیدید.`).catch(()=>{});
    io.emit('leaderboard:update', await getLeaderboard(20));
    res.json({
      message: 'کد با موفقیت ثبت شد',
      cardType: card.card_type_name,
      addedPoints: card.point_value,
      addedCash: cashAmount,
      walletBalance: Number(userNow.rows[0].wallet_balance || 0),
      points: userNow.rows[0],
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(e.status || 500).json({ message: (e.code && friendlyDbError(e)) || e.message || 'خطای ثبت کد' });
  } finally { client.release(); }
}));

// ── Tap game ───────────────────────────────────────────────────────────────
// Progress is reported in signed BATCHES, never one tap per request: a
// per-tap endpoint is both chatty and trivially replayable. All validation
// (signature, replay, plausibility) lives in tapGameService — see the header
// comment there for the full threat model.
const tapGame = require('./services/tapGameService');

// Rate limit sized against the client's 8s flush cadence: ~7 legitimate
// batches per minute, so 20 leaves room for level-up flushes and a retry
// after a dropped connection while still stopping a request flood.
const tapBatchLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // Key on the user, not the IP: a whole school behind one NAT must not
  // share a bucket, and a single cheater must not escape by changing IP.
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { message: 'تعداد درخواست‌ها زیاد است؛ کمی صبر کن' },
});

app.get('/api/games/tap/progress', auth, asyncHandler(async (req, res) => {
  res.json(await tapGame.getProgress(req.user.id));
}));

app.post('/api/games/tap/progress', auth, tapBatchLimiter, asyncHandler(async (req, res) => {
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
      await client.query(
        `UPDATE users SET
           current_points        = current_points + $2,
           lifetime_points       = lifetime_points + $2,
           monthly_league_points = monthly_league_points + $2,
           updated_at = NOW()
         WHERE id = $1`, [userId, points]);
      await addLeaguePoints(client, userId, points);
      // کمیسیون ۵٪ معرف. مالک صریح گفت این کمیسیون فقط از دو منبع می‌آید:
      // ثبت کد کارت، و بازی ضربه‌زن. این نقطهٔ دوم است.
      await referrals.payCommission(client, userId, points, 'tap');
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
  res.json({ entries: await tapGame.leaderboard(req.query.limit) });
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
  // COALESCE(d.image_url, t.image_url): طرحِ تصادفیِ انتخاب‌شده در لحظهٔ
  // ثبت، و اگر نبود تصویرِ پیش‌فرضِ نوعِ کارت. توضیح در مایگریشن ۰۴۴.
  const inv = await pool.query(
    `SELECT i.*, t.name, COALESCE(d.image_url, t.image_url) AS image_url,
            t.point_value, t.cash_amount
       FROM user_card_inventory i
       JOIN card_types t ON t.id = i.card_type_id
       LEFT JOIN photo_card_designs d ON d.id = i.display_design_id
      WHERE i.user_id=$1 AND i.consumed_in_reward=false ORDER BY t.name`,
    [req.user.id]);
  const leaguePayouts = await pool.query(`SELECT p.*, s.month_year FROM league_payouts p JOIN league_seasons s ON s.id=p.league_season_id WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 20`, [req.user.id]);
  res.json({ user: safeUser(req.user), inventory: inv.rows, leaguePayouts: leaguePayouts.rows });
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
  const [inv, payouts, rewards, wheelState] = await Promise.all([
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
    // COALESCE(d.image_url, …): طرحِ رو/پشتِ تصادفی که در لحظهٔ ثبت
    // قرعه خورده. LEFT JOIN چون کارتِ بدونِ طرح (سیستمِ قدیمی) باید
    // همچنان تصویرِ پیش‌فرضِ نوعِ کارت را بگیرد نه هیچ.
    pool.query(
      `SELECT i.*, t.name, COALESCE(d.image_url, t.image_url) AS image_url,
              t.point_value, t.cash_amount
         FROM user_card_inventory i
         JOIN card_types t ON t.id = i.card_type_id
         LEFT JOIN photo_card_designs d ON d.id = i.display_design_id
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
    pass: passBrief,
    cosmetics: myCosmetics,
    // لولِ خودِ کاربر — صفحهٔ بازی‌ها و هدرِ داشبورد از همین می‌خوانند،
    // پس هیچ درخواستِ اضافه‌ای لازم نیست.
    level: await level.statusFor(req.user.id),
  });
}));

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
  const { rows } = await pool.query('SELECT id,nickname,profile_image_url,profile_avatar_key,lifetime_points,current_points,monthly_league_points,joined_at FROM users WHERE id=$1', [req.params.id]);
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
            COALESCE(d.image_url, t.image_url) AS image_url, t.point_value,
            i.quantity::int AS registered_count,
            i.updated_at AS last_registered_at
       FROM user_card_inventory i
       JOIN card_types t ON t.id = i.card_type_id
       LEFT JOIN photo_card_designs d ON d.id = i.display_design_id
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

  res.json({
    ...rows[0],
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
  const { rows } = await pool.query('SELECT *, ($1 >= required_points) AS eligible FROM reward_tiers WHERE is_active=true ORDER BY display_order, required_points', [req.user.current_points]);
  res.json(rows);
}));
// Reward groups: the user-facing catalogue with per-group progress.
const rewardGroups = require('./services/rewardGroupService');

app.get('/api/reward-groups', auth, asyncHandler(async (req, res) => {
  res.json(await rewardGroups.userView(req.user.id));
}));

// ── Shop: cosmetics + GhelGheli Plus ───────────────────────────────────────
app.get('/api/shop', auth, asyncHandler(async (req, res) => {
  res.json(await shop.catalogue(req.user.id));
}));

// Buying spends from the wallet, so it is rate-limited like other money paths.
const shopLimiter = rateLimit({
  windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { message: 'تعداد درخواست‌ها زیاد است؛ کمی صبر کن' },
});

app.post('/api/shop/items/:id/buy', auth, validateUuid('id'), shopLimiter, asyncHandler(async (req, res) => {
  try {
    res.json(await shop.buyItem(req.user.id, req.params.id));
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'خطا در خرید' });
  }
}));

app.post('/api/shop/plus', auth, shopLimiter, asyncHandler(async (req, res) => {
  try {
    res.json(await shop.buyPlus(req.user.id));
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'خطا در خرید اشتراک' });
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

app.get('/api/rewards/claims/me', auth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT c.*, r.name, r.reward_type, r.reward_value FROM user_reward_claims c JOIN reward_tiers r ON r.id=c.reward_tier_id WHERE c.user_id=$1 ORDER BY c.claimed_at DESC', [req.user.id]);
  res.json(rows);
}));

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
const withdrawalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: perUserKey,
  message: { message: 'تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید' },
});
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
app.post('/api/wallet/withdrawals', auth, withdrawalLimiter, asyncHandler(async (req, res) => {
  const request = await withdrawalService.createRequest(req.user.id, req.body?.amount);
  res.json({ message: 'درخواست برداشت ثبت شد و در انتظار بررسی مدیریت است', request });
}));

app.get('/api/wallet/withdrawals', auth, asyncHandler(async (req, res) => {
  res.json(await withdrawalService.listForUser(req.user.id));
}));

// لغو توسط کاربر — فقط تا قبل از تأیید مدیر
app.post('/api/wallet/withdrawals/:id/cancel', auth, validateUuid('id'), withdrawalLimiter, asyncHandler(async (req, res) => {
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
      'برندهٔ گردونه شدی 🎡',
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
const wheelLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: perUserKey, // CGNAT — توضیح کامل کنار تعریفِ perUserKey
  message: { message: 'تعداد درخواست‌ها زیاد است، کمی صبر کن' },
});

app.post('/api/wheel/spin', auth, wheelLimiter, asyncHandler(async (req, res) => {
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
      await client.query(
        `UPDATE users SET
           current_points        = current_points + $2,
           lifetime_points       = lifetime_points + $2,
           monthly_league_points = monthly_league_points + $2,
           updated_at = NOW()
         WHERE id = $1`, [userId, amount]);
      await addLeaguePoints(client, userId, amount);
    },
  });

  // اعلان فقط برای جوایز نقدی: یک اعلان روزانه بابت ۱۰۰ امتیاز، نوتیفیکیشن
  // را به نویز تبدیل می‌کند و کاربر خاموشش می‌کند.
  if (result.prize.kind === 'cash') {
    createNotification(
      req.user.id, 'wallet', 'برندهٔ گردونه شدی 🎡',
      `${result.prize.label} به کیف پولت اضافه شد.`).catch(() => {});
  }
  pass.grantXp(req.user.id, 'wheel_spin').catch(() => {});
  res.json(result);
}));

// فقط شمارنده، برای نشانِ نوار بالا. سبک‌تر از /api/wheel که کل کاتالوگ
// جوایز را می‌فرستد.
app.get('/api/wheel/count', auth, asyncHandler(async (req, res) => {
  res.json(await wheel.spinCount(req.user.id));
}));

// ── گذر نبرد ─────────────────────────────────────────────────────────────
app.get('/api/pass', auth, asyncHandler(async (req, res) => {
  res.json(await pass.status(req.user.id));
}));

app.post('/api/pass/claim/:tierId', auth, validateUuid('tierId'),
  asyncHandler(async (req, res) => {
    const granted = await pass.claim(req.user.id, req.params.tierId);
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
  const data = await getLeaderboard(Number(req.query.limit || 100));

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
  res.json({
    minLifetimePoints,
    messageCooldownSeconds: await getChatCooldownSeconds(),
    eligible: Number(req.user.lifetime_points || 0) >= minLifetimePoints,
    userLifetimePoints: req.user.lifetime_points,
    pinned: await getChatPinnedMessage(),
  });
}));

const CANNED_MESSAGES = [
  "سلام بچه‌ها! 👋",
  "من اومدم! 😎",
  "بازی خیلی باحال بود! 🎮",
  "خوشبختم دوستان! 🤝",
  "کی پایه بازیه؟ 🙋‍♂️",
  "عالی بود! ✨",
  "خیلی خفن بود! 🔥",
  "موفق باشی! 🌟",
  "چه خبر بچه‌ها؟ 🎈",
  "خداحافظ تا بعد! 👋",
  "مواظب خودتون باشید! 🛡️",
  "کسی کد جدید داره؟ 🎁",
  "وای چقدر خنده‌دار بود! 😂",
  "تبریک میگم! 🎉",
  "میشه کمکم کنید؟ 🤔",
  "ممنون از شما! 🙏",
  "شما تو کدوم لیگ هستید؟ 🏅",
  "چقدر امتیازم بالا رفت! 📈",
  "کارت جدید پیدا کردم! 🃏",
  "امروز روز منه! 🎯",
  "ایول به همگی! ✌️",
  "دوباره امتحان می‌کنم! 💪",
  "شگفت‌انگیز بود! 😲",
  "کجا زندگی می‌کنید؟ 🌍",
  "امروز چیکار کردید؟ 🌞",
  "من عاشق این بازی‌ام! ❤️",
  "بریم برای برد! 🏆",
  "منم می‌خوام بازی کنم! 🕹️"
];

app.get('/api/chat/canned-messages', asyncHandler(async (req, res) => {
  res.json(CANNED_MESSAGES);
}));

app.get('/api/chat/messages', auth, asyncHandler(async (req, res) => {
  const minLifetimePoints = await getChatMinLifetimePoints();
  if (Number(req.user.lifetime_points || 0) < minLifetimePoints) return res.status(403).json({ message: `برای ورود به چت باید حداقل ${minLifetimePoints} امتیاز تاریخی داشته باشید`, minLifetimePoints });
  const { rows } = await pool.query(`SELECT m.*, u.nickname,u.first_name,u.last_name,u.profile_image_url,u.profile_avatar_key,
      s.title AS sticker_title, s.image_url AS sticker_url, s.sticker_type,
      rm.message_text AS reply_text, rm.message_type AS reply_type, ru.nickname AS reply_nickname,
      (SELECT count(*)::int FROM chat_message_likes l WHERE l.message_id=m.id) AS like_count,
      EXISTS(SELECT 1 FROM chat_message_likes l WHERE l.message_id=m.id AND l.user_id=$1) AS liked_by_me
    FROM chat_messages m
    JOIN users u ON u.id=m.user_id
    LEFT JOIN chat_stickers s ON s.id=m.sticker_id
    LEFT JOIN chat_messages rm ON rm.id=m.reply_to_message_id
    LEFT JOIN users ru ON ru.id=rm.user_id
    WHERE m.is_deleted=false ORDER BY m.sent_at DESC LIMIT 100`, [req.user.id]);
  // Attach cosmetics so the club badge and name colour render next to each
  // message. Resolved server-side because an equipped item stops applying the
  // moment Plus lapses unless the user actually bought it.
  const ids = [...new Set(rows.map(r => r.user_id))];
  const cos = await shop.cosmeticsFor(ids);
  // لولِ فرستندهٔ هر پیام — یک کوئریِ دسته‌ای برای کل صفحه، نه یکی
  // به‌ازای هر پیام.
  const lvl = await level.levelsFor(ids);
  res.json(rows.reverse().map(r => ({
    ...r,
    cosmetics: cos.get(r.user_id) || null,
    level: lvl[r.user_id]?.level ?? 0,
  })));
}));
app.post('/api/chat/messages', auth, chatLimiter, asyncHandler(async (req, res) => {
  const minLifetimePoints = await getChatMinLifetimePoints();
  if (Number(req.user.lifetime_points || 0) < minLifetimePoints) return res.status(403).json({ message: `برای ارسال پیام باید حداقل ${minLifetimePoints} امتیاز تاریخی داشته باشید` });
  if (req.user.chat_banned_until && new Date(req.user.chat_banned_until) > new Date()) return res.status(403).json({ message: 'شما موقتاً از چت محروم هستید' });
  const cd = await ensureChatCooldown(req.user.id);
  if (cd.remaining > 0) return res.status(429).json({ message: `برای جلوگیری از اسپم، ${cd.remaining} ثانیه دیگر پیام بدهید`, cooldownSeconds: cd.cooldown, remainingSeconds: cd.remaining });
  const stickerId = req.body.stickerId || req.body.sticker_id || null;
  const replyTo = req.body.replyTo || req.body.reply_to_message_id || null;
  let clean = String(req.body.message || req.body.text || '').trim();
  let messageType = 'text';
  if (stickerId) {
    const st = await pool.query('SELECT * FROM chat_stickers WHERE id=$1 AND is_active=true', [stickerId]);
    if (!st.rows[0]) return res.status(400).json({ message: 'استیکر معتبر نیست' });
    messageType = 'sticker';
    clean = clean || st.rows[0].title;
  }
  // Validate reply target up front instead of letting a bad/deleted id hit
  // the DB's foreign key constraint, which previously bubbled up as a raw
  // Postgres error message to the client (see friendlyDbError note above).
  if (replyTo) {
    const rm = await pool.query('SELECT id FROM chat_messages WHERE id=$1 AND is_deleted=false', [replyTo]);
    if (!rm.rows[0]) return res.status(400).json({ message: 'پیام موردنظر برای پاسخ پیدا نشد' });
  }
  if (messageType === 'text' && !CANNED_MESSAGES.includes(clean)) return res.status(400).json({ message: 'فقط پیام‌های آماده مجاز هستند.' });
  if (clean) await assertNoBadWords(clean);
  const { rows } = await pool.query('INSERT INTO chat_messages(user_id,message_text,reply_to_message_id,sticker_id,message_type) VALUES($1,$2,$3,$4,$5) RETURNING *', [req.user.id, clean, replyTo, stickerId, messageType]);
  // BUG: the message BROADCAST carried no cosmetics, while GET /api/chat
  // does. A paying user's club badge and name colour therefore appeared on
  // every old message but vanished from their own new one until the page was
  // reloaded — reading as "my badge stopped working".
  const cosNew = await shop.cosmeticsFor([req.user.id]);
  const msg = { ...rows[0], nickname: req.user.nickname, first_name: req.user.first_name, last_name: req.user.last_name, profile_image_url: req.user.profile_image_url, profile_avatar_key: req.user.profile_avatar_key, like_count: 0, liked_by_me: false, cosmetics: cosNew.get(req.user.id) || null };
  io.emit('chat:new', msg);
  res.json(msg);
}));

app.post('/api/chat/messages/:id/report', auth, validateUuid('id'), asyncHandler(async (req, res) => {
  await pool.query('UPDATE chat_messages SET is_reported=true, report_count=report_count+1 WHERE id=$1', [req.params.id]);
  res.json({ message: 'گزارش ثبت شد' });
}));

app.get('/api/chat/stickers', auth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT id,title,image_url,sticker_type FROM chat_stickers WHERE is_active=true ORDER BY created_at DESC');
  res.json(rows);
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
const TICKET_MAX_ATTACHMENTS = 5;

// Accepts an array of upload URLs previously returned by the upload route.
// Anything that isn't one of our own /uploads/ paths is rejected so a caller
// can't smuggle in an arbitrary external URL.
function sanitizeAttachments(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const raw of input) {
    const v = String(raw || '').trim();
    if (!v) continue;
    if (!/^\/uploads\/images\/[A-Za-z0-9._-]+$/.test(v)) {
      const err = new Error('یکی از پیوست‌ها معتبر نیست');
      err.status = 400;
      throw err;
    }
    out.push(v);
    if (out.length > TICKET_MAX_ATTACHMENTS) {
      const err = new Error(`حداکثر ${TICKET_MAX_ATTACHMENTS} عکس می‌توانید ارسال کنید`);
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
  if (today.rows[0].c >= 1) {
    return {
      canCreate: false,
      reason: 'daily_limit',
      message: 'در هر روز فقط یک تیکت می‌توانید ثبت کنید. فردا دوباره امتحان کنید.',
      openTicket: null,
    };
  }
  return { canCreate: true, reason: null, message: null, openTicket: null };
}

app.get('/api/support/quota', auth, asyncHandler(async (req, res) => {
  res.json({ ...(await ticketQuota(req.user.id)), maxAttachments: TICKET_MAX_ATTACHMENTS });
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
app.get('/api/admin/dashboard', adminAuth, asyncHandler(async (req, res) => {
  const q = await Promise.all([
    pool.query('SELECT count(*)::int AS count FROM users'),
    pool.query("SELECT count(*)::int AS count FROM card_codes WHERE status='used' AND used_at::date=CURRENT_DATE"),
    pool.query("SELECT count(*)::int AS count FROM card_codes WHERE status='used' AND used_at >= date_trunc('month', NOW())"),
    pool.query("SELECT count(*)::int AS count FROM user_reward_claims WHERE status='pending'"),
    getLeaderboard(10)
  ]);
  res.json({ users: q[0].rows[0].count, usedCodesToday: q[1].rows[0].count, usedCodesThisMonth: q[2].rows[0].count, pendingClaims: q[3].rows[0].count, league: q[4] });
}));

app.post('/api/admin/uploads/image', adminAuth, requireRole('support'), imageUpload.single('image'), asyncHandler(async (req, res) => {
  // fileFilter drops anything that isn't png/jpg/webp/gif without raising,
  // so a missing req.file here means "wrong type" rather than "no file".
  if (!req.file) return res.status(400).json({ message: 'فقط فایل تصویری (PNG/JPG/WEBP/GIF) مجاز است' });
  const r = await optimizeUpload(req.file);
  console.log(`[upload] admin ${kb(r.bytesBefore)} -> ${kb(r.bytesAfter)}`);
  res.json({ url: `/uploads/images/${r.filename}`, bytes: r.bytesAfter });
}));

app.get('/api/admin/chat/stickers', adminAuth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM chat_stickers ORDER BY created_at DESC');
  res.json(rows);
}));
app.post('/api/admin/chat/stickers', adminAuth, requireRole('support'), imageUpload.single('sticker'), asyncHandler(async (req, res) => {
  const title = req.body.title || 'استیکر';
  let imageUrl = req.body.imageUrl;
  if (req.file) imageUrl = `/uploads/images/${req.file.filename}`;
  if (!imageUrl) return res.status(400).json({ message: 'فایل یا آدرس استیکر لازم است' });
  const stickerType = req.body.stickerType || req.body.sticker_type || (/\.(gif|webp)$/i.test(imageUrl) ? 'animated' : 'static');
  const { rows } = await pool.query('INSERT INTO chat_stickers(title,image_url,sticker_type,is_active,created_by_admin_id) VALUES($1,$2,$3,$4,$5) RETURNING *', [title, imageUrl, stickerType, req.body.isActive !== 'false', req.admin.id]);
  await audit(req.admin.id,'create_chat_sticker','chat_stickers',rows[0].id,null,{ title, stickerType });
  res.json(rows[0]);
}));
app.patch('/api/admin/chat/stickers/:id', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const { title, stickerType, isActive } = req.body;
  const imageUrl = keepImage(req.body.imageUrl);
  const { rows } = await pool.query('UPDATE chat_stickers SET title=COALESCE($1,title), image_url=COALESCE($2,image_url), sticker_type=COALESCE($3,sticker_type), is_active=COALESCE($4,is_active), updated_at=NOW() WHERE id=$5 RETURNING *', [title,imageUrl,stickerType,isActive,req.params.id]);
  await audit(req.admin.id,'update_chat_sticker','chat_stickers',req.params.id,null,req.body);
  res.json(rows[0]);
}));

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

// فهرست نوع کارت‌ها همراه با شمار کدهای هر کدام.
// بدون این، مدیر هنگام ویرایش یک کارت نمی‌داند اصلاً چند کد برایش صادر
// شده و چندتا مصرف شده — و برای فهمیدنش باید به فهرست کدها می‌رفت و
// دستی می‌شمرد. LEFT JOIN تا کارت بدون کد هم با صفر برگردد، نه اینکه حذف شود.
app.get('/api/admin/card-types', adminAuth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT t.*,
           COUNT(c.id)::int                                        AS code_count,
           COUNT(c.id) FILTER (WHERE c.status='unused')::int        AS unused_count,
           COUNT(c.id) FILTER (WHERE c.status='used')::int          AS used_count,
           COUNT(c.id) FILTER (WHERE c.status='voided')::int        AS voided_count
      FROM card_types t
      LEFT JOIN card_codes c ON c.card_type_id = t.id
     GROUP BY t.id
     ORDER BY t.created_at DESC`);
  res.json(rows);
}));
app.post('/api/admin/card-types', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const { name, description, pointValue, isActive = true } = req.body;
  // Normalise '' to null so an image-less card is stored consistently
  // (and never as an empty string that later reads as "has an image").
  const imageUrl = req.body.imageUrl ? String(req.body.imageUrl).trim() || null : null;
  const cashAmount = cashAmountInput(req.body.cashAmount) ?? 0;
  // ── نامِ تکراری رد می‌شود ──
  //
  // باگی که این را لازم کرد: مالک برای «Achraf Hakimi» دو بار کارت
  // ساخت (بارِ دوم برای آپلودِ پشتِ کارت). دو ردیف با نامِ یکسان و دو
  // UUID متفاوت ساخته شد. کدها به اولی گره خوردند ولی موتورِ تطبیق
  // طرحِ دومی را می‌شناخت، پس **هر ثبت** با علتِ `type_mismatch` به صف
  // بررسی می‌رفت — با اینکه عکس و کد هر دو درست بودند.
  //
  // ایندکسِ یکتای `uq_card_types_name_ci` هم در مایگریشن ۰۴۲ اضافه شد،
  // ولی این بررسی می‌ماند تا پیامِ فارسیِ روشن بدهد به‌جای خطای خامِ
  // یکتاییِ پستگرس که مدیر معنی‌اش را نمی‌فهمد.
  const dupType = await pool.query(
    'SELECT id FROM card_types WHERE lower(trim(name)) = lower(trim($1))',
    [name]);
  if (dupType.rows[0]) {
    return res.status(409).json({
      message: `کارتی با نام «${name}» از قبل وجود دارد. برای افزودنِ `
        + 'عکسِ دیگر (مثلاً پشتِ کارت) از بخش «ثبت کارت» همان نام را '
        + 'دوباره وارد کنید — عکسِ تازه به همان کارت اضافه می‌شود.',
      cardTypeId: dupType.rows[0].id,
    });
  }
  const { rows } = await pool.query('INSERT INTO card_types(name,image_url,description,point_value,cash_amount,is_active) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [name,imageUrl,description,pointValue,cashAmount,isActive]);
  await audit(req.admin.id, 'create_card_type', 'card_types', rows[0].id, null, req.body); res.json(rows[0]);
}));
app.patch('/api/admin/card-types/:id', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const { name, description, pointValue, isActive } = req.body;
  const imageUrl = keepImage(req.body.imageUrl);
  const cashAmount = cashAmountInput(req.body.cashAmount);
  const { rows } = await pool.query('UPDATE card_types SET name=COALESCE($1,name), image_url=COALESCE($2,image_url), description=COALESCE($3,description), point_value=COALESCE($4,point_value), cash_amount=COALESCE($5,cash_amount), is_active=COALESCE($6,is_active), updated_at=NOW() WHERE id=$7 RETURNING *', [name,imageUrl,description,pointValue,cashAmount,isActive,req.params.id]);
  await audit(req.admin.id, 'update_card_type', 'card_types', req.params.id, null, req.body); res.json(rows[0]);
}));

/**
 * حذفِ کاملِ یک نوع کارت.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا لازم شد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * تا امروز فقط `is_active=false` ممکن بود. ولی کارتِ غیرفعال از کاتالوگ
 * پاک نمی‌شود و در منویِ «این کدها روی کدام کارت چاپ می‌شوند؟» ظاهر
 * می‌ماند. مالک با اسکرین‌شات نشان داد که آن منو با ۹۱ کارتِ آزمایشی
 * عملاً غیرقابل‌استفاده شده بود.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا حذف فقط وقتی هیچ ردِ پایی نمانده باشد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * اگر کارتی در اینونتوریِ کسی نشسته یا کدی برایش مصرف شده، حذفش یعنی
 * پاک کردنِ چیزی که کاربر واقعاً دارد. `ON DELETE RESTRICT` روی
 * `expected_card_type_id` هم همین را می‌گوید.
 *
 * پس شرط‌ها صریح بررسی می‌شوند و پیامِ فارسیِ روشن می‌دهند — نه اینکه
 * خطای خامِ Postgres به مدیر برسد و او نفهمد چرا نشد.
 */
app.delete('/api/admin/card-types/:id', adminAuth, validateUuid('id'),
  requireRole('support'), asyncHandler(async (req, res) => {
    const id = req.params.id;
    const t = await pool.query('SELECT name FROM card_types WHERE id=$1', [id]);
    if (!t.rows[0]) return res.status(404).json({ message: 'نوع کارت پیدا نشد' });

    // هر وابستگی جداگانه شمرده می‌شود تا پیام بگوید **کدام** مانع است.
    const [inv, codes, photoCodes, designs] = await Promise.all([
      pool.query('SELECT count(*)::int n FROM user_card_inventory WHERE card_type_id=$1', [id]),
      pool.query('SELECT count(*)::int n FROM card_codes WHERE card_type_id=$1', [id]),
      pool.query('SELECT count(*)::int n FROM photo_card_codes WHERE expected_card_type_id=$1', [id]),
      pool.query('SELECT count(*)::int n FROM photo_card_designs WHERE card_type_id=$1', [id]),
    ]);
    const blockers = [];
    if (inv.rows[0].n) blockers.push(`${inv.rows[0].n} کارت در مجموعهٔ کاربران`);
    if (codes.rows[0].n) blockers.push(`${codes.rows[0].n} کد در سیستم قدیمی`);
    if (photoCodes.rows[0].n) blockers.push(`${photoCodes.rows[0].n} کد گره‌خورده`);
    if (designs.rows[0].n) blockers.push(`${designs.rows[0].n} طرح تصویری`);

    if (blockers.length) {
      return res.status(409).json({
        message: `«${t.rows[0].name}» قابل حذف نیست چون ${blockers.join(' و ')} `
          + 'به آن وابسته است. اول آن‌ها را پاک کنید، یا کارت را فقط '
          + 'غیرفعال کنید.',
        blockers,
      });
    }

    await pool.query('DELETE FROM card_types WHERE id=$1', [id]);
    await audit(req.admin.id, 'delete_card_type', 'card_types', id, null,
      { name: t.rows[0].name });
    res.json({ message: `«${t.rows[0].name}» حذف شد` });
  }));

app.get('/api/admin/card-codes', adminAuth, asyncHandler(async (req, res) => {
  const { status, cardTypeId, userId, search } = req.query;
  const params = []; const where = [];
  if (status) { params.push(status); where.push(`c.status=$${params.length}`); }
  if (cardTypeId) { params.push(cardTypeId); where.push(`c.card_type_id=$${params.length}`); }
  if (userId) { params.push(userId); where.push(`c.used_by_user_id=$${params.length}`); }
  if (search) { params.push(`%${search}%`); where.push(`c.code ILIKE $${params.length}`); }
  const sql = `SELECT c.*, t.name AS card_type_name, u.mobile AS used_by_mobile FROM card_codes c JOIN card_types t ON t.id=c.card_type_id LEFT JOIN users u ON u.id=c.used_by_user_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY c.created_at DESC LIMIT 500`;
  res.json((await pool.query(sql, params)).rows);
}));
app.post('/api/admin/card-codes', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const { code, cardTypeId } = req.body;
  const normalizedCode = normalizeCardCode(code);
  if (!validateCodeFormat(normalizedCode)) return res.status(400).json({ message: 'فرمت کد معتبر نیست' });
  const { rows } = await pool.query('INSERT INTO card_codes(code,card_type_id) VALUES($1,$2) RETURNING *', [normalizedCode, cardTypeId]);
  await audit(req.admin.id, 'create_card_code', 'card_codes', rows[0].id, null, { code: code.slice(0,4)+'...' }); res.json(rows[0]);
}));
// Void a leaked/mistaken card code before anyone redeems it. There was
// previously no way to disable a code once created — only 'unused'/'used'
// existed, and there is deliberately no DELETE endpoint (codes are kept
// forever for audit purposes). 'voided' behaves like a dead-end status: the
// redeem endpoint below already only accepts codes with status='unused' via
// its explicit check, so a voided code simply can never be redeemed.
app.patch('/api/admin/card-codes/:id/void', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query("UPDATE card_codes SET status='voided', updated_at=NOW() WHERE id=$1 AND status='unused' RETURNING id,code", [req.params.id]);
  if (!rows[0]) return res.status(400).json({ message: 'فقط کدهای استفاده‌نشده قابل ابطال هستند' });
  await audit(req.admin.id, 'void_card_code', 'card_codes', rows[0].id, req.body.reason || 'ابطال دستی', {});
  res.json({ message: 'کد باطل شد' });
}));
// حداکثر تعداد کد در **یک درخواست**.
//
// این سقفِ کل کارت نیست: هیچ محدودیتی برای مجموع کدهای یک نوع کارت وجود
// ندارد و مدیر می‌تواند این عملیات را هر چند بار که خواست تکرار کند.
// (آزموده‌شده روی سرور: سه بار ۱۰۰۰تایی روی یک کارت = ۳۰۰۰ کد، هر بار
// حدود نیم ثانیه.)
//
// چرا اصلاً سقفِ هر-درخواست لازم است: بدون آن، یک چسباندن اشتباهی (مثلاً
// کل یک فایل CSV) می‌تواند صدها هزار ردیف بسازد، تراکنش را دقیقه‌ها باز
// نگه دارد — و همان تراکنش روی جدولی قفل می‌گیرد که مسیر «ثبت کد»
// کاربران هم به آن نیاز دارد.
const BULK_CODE_LIMIT = 1000;

app.post('/api/admin/card-codes/bulk', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const { rawCodes = '' } = req.body;
  const cardTypeId = req.body.cardTypeId;

  // پیش از هر کاری: شناسهٔ نوع کارت باید معتبر و موجود باشد.
  // قبلاً هیچ بررسی‌ای نبود؛ یک شناسهٔ نامعتبر تا خود Postgres می‌رفت و
  // به‌صورت خطای ۵۰۰ برمی‌گشت، و یک UUID معتبرِ ناموجود هم با نقض کلید
  // خارجی همان ۵۰۰ را می‌داد — هر دو بدون پیام قابل فهم برای مدیر.
  if (!UUID_RE.test(String(cardTypeId || ''))) {
    return res.status(400).json({ message: 'نوع کارت انتخاب نشده یا معتبر نیست' });
  }
  const typeRow = await pool.query('SELECT id, name FROM card_types WHERE id=$1', [cardTypeId]);
  if (!typeRow.rows[0]) return res.status(404).json({ message: 'نوع کارت پیدا نشد' });

  const input = String(rawCodes).split(/[\n,;\t ]+/).map(c => normalizeCardCode(c)).filter(Boolean);
  if (!input.length) return res.status(400).json({ message: 'هیچ کدی وارد نشده است' });
  if (input.length > BULK_CODE_LIMIT) {
    return res.status(400).json({
      message: `در هر نوبت حداکثر ${BULK_CODE_LIMIT} کد قابل ثبت است؛ شما ${input.length} کد فرستادید. `
        + `بقیه را در نوبت بعد اضافه کنید — برای مجموع کدهای یک کارت هیچ سقفی وجود ندارد.`,
    });
  }

  const seen = new Set(), duplicateInFile = [], invalid = [], candidates = [];
  for (const c of input) {
    if (!validateCodeFormat(c)) { invalid.push(c); continue; }
    if (seen.has(c)) { duplicateInFile.push(c); continue; }
    seen.add(c); candidates.push(c);
  }

  let duplicateInDb = [], inserted = [];
  if (candidates.length) {
    // یک درج دسته‌ای به‌جای حلقه. اندازه‌گیری شده روی همین سرور:
    // ۱۰۰۰ کد تک‌به‌تک ۵۰۷ میلی‌ثانیه، دسته‌ای ۴۱ میلی‌ثانیه (~۱۲ برابر).
    // مهم‌تر از سرعت: تراکنش کوتاه‌تر یعنی قفل کمتر روی جدولی که مسیر
    // «ثبت کد» کاربران هم به آن نیاز دارد.
    //
    // ON CONFLICT DO NOTHING تکراری‌های دیتابیس را اتمیک رد می‌کند. بررسی
    // جداگانهٔ قبلی یک مسابقهٔ زمانی داشت: بین SELECT و INSERT، ادمین دوم
    // می‌توانست همان کد را درج کند و درج اول با خطای ۵۰۰ می‌افتاد و کل
    // دستهٔ سالم را برمی‌گرداند.
    const result = await pool.query(
      `INSERT INTO card_codes(code, card_type_id)
       SELECT unnest($1::citext[]), $2
       ON CONFLICT (code) DO NOTHING
       RETURNING code`,
      [candidates, cardTypeId],
    );
    inserted = result.rows.map(r => String(r.code));
    const insertedSet = new Set(inserted.map(c => c.toUpperCase()));
    duplicateInDb = candidates.filter(c => !insertedSet.has(c.toUpperCase()));
  }

  await audit(req.admin.id, 'bulk_import_card_codes', 'card_types', cardTypeId, null, {
    cardTypeName: typeRow.rows[0].name,
    inserted: inserted.length,
    duplicateInFile: duplicateInFile.length,
    duplicateInDb: duplicateInDb.length,
    invalid: invalid.length,
  });

  // فقط نمونه‌ای از هر دسته برمی‌گردد. با ۱۰۰۰ کد، برگرداندن همهٔ آرایه‌ها
  // پاسخ را بی‌جهت سنگین می‌کرد و رابط کاربری هم آن را نشان نمی‌دهد؛
  // شمارش‌ها همان چیزی است که مدیر می‌بیند.
  const sample = (arr) => arr.slice(0, 20);
  res.json({
    cardTypeName: typeRow.rows[0].name,
    insertedCount: inserted.length,
    duplicateInFileCount: duplicateInFile.length,
    duplicateInDbCount: duplicateInDb.length,
    invalidCount: invalid.length,
    inserted: sample(inserted),
    duplicateInFile: sample(duplicateInFile),
    duplicateInDb: sample(duplicateInDb),
    invalid: sample(invalid),
    truncatedSamples: inserted.length > 20 || duplicateInDb.length > 20 || invalid.length > 20,
  });
}));

// ── «ثبت کارت از طریق عکس» ────────────────────────────────────────────────
//
// قابلیت جدید و مستقل، در ماژول جدا (src/routes/photoCards.js).
//
// چرا ماژول جدا و نه اینجا: این فایل ۲۸۰۰ خط است و مسیر «ثبت کد کارت»
// داخلش روی پول واقعی کار می‌کند. خواستهٔ مالک «بدون هیچ تغییری در
// بخش‌های قبلی» بود، پس تنها ردِ پای این قابلیت در server.js همین یک
// خط است — هیچ کد موجودی جابه‌جا یا بازنویسی نشده.
//
// وابستگی‌ها تزریق می‌شوند چون pool/auth/adminAuth و بقیه اینجا ساخته
// می‌شوند؛ جابه‌جا کردنشان یعنی دست زدن به چیزی که کار می‌کند.
app.use('/api', require('./routes/photoCards')({
  pool, auth, adminAuth, requireRole, asyncHandler, imageUpload, audit,
  createNotification, addLeaguePoints, pass, io, getLeaderboard,
  optimizeUpload, UUID_RE,
}));

app.get('/api/admin/rewards', adminAuth, asyncHandler(async (req, res) => res.json((await pool.query('SELECT * FROM reward_tiers ORDER BY display_order, required_points')).rows)));
// ── Admin: reward groups ───────────────────────────────────────────────────
// Both the web panel and the Flutter admin app drive these, so the two stay
// in lockstep by construction rather than by discipline.

app.get('/api/admin/reward-groups', adminAuth, asyncHandler(async (req, res) => {
  res.json({ groups: await rewardGroups.listGroups({ includeInactive: true }) });
}));

app.post('/api/admin/reward-groups', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const b = req.body || {};
  if (!b.name || !String(b.name).trim()) {
    return res.status(400).json({ message: 'نام گروه الزامی است' });
  }
  const type = rewardGroups.GROUP_TYPES.includes(b.groupType) ? b.groupType : 'mixed';
  const { rows } = await pool.query(
    `INSERT INTO reward_groups(name, description, image_url, group_type, accent, display_order, is_active)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [String(b.name).trim(), b.description || null, safeImageUrl(b.imageUrl),
     type, b.accent || 'emerald', Number(b.displayOrder) || 0, b.isActive !== false]);
  await audit(req.admin.id, 'create_reward_group', 'reward_groups', rows[0].id, null, b);
  res.json(rows[0]);
}));

app.patch('/api/admin/reward-groups/:id', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const b = req.body || {};
  const before = await pool.query('SELECT * FROM reward_groups WHERE id=$1', [req.params.id]);
  if (!before.rows[0]) return res.status(404).json({ message: 'گروه پیدا نشد' });
  const type = rewardGroups.GROUP_TYPES.includes(b.groupType)
    ? b.groupType : before.rows[0].group_type;
  const { rows } = await pool.query(
    `UPDATE reward_groups SET
       name=COALESCE($2,name), description=COALESCE($3,description),
       image_url=COALESCE($4,image_url), group_type=$5,
       accent=COALESCE($6,accent), display_order=COALESCE($7,display_order),
       is_active=COALESCE($8,is_active), updated_at=NOW()
     WHERE id=$1 RETURNING *`,
    [req.params.id, b.name ?? null, b.description ?? null,
     b.imageUrl !== undefined ? safeImageUrl(b.imageUrl) : null, type,
     b.accent ?? null,
     b.displayOrder !== undefined ? Number(b.displayOrder) : null,
     b.isActive !== undefined ? !!b.isActive : null]);
  await audit(req.admin.id, 'update_reward_group', 'reward_groups', req.params.id, before.rows[0], b);
  res.json(rows[0]);
}));

app.delete('/api/admin/reward-groups/:id', adminAuth, validateUuid('id'), requireRole('super_admin'), asyncHandler(async (req, res) => {
  // Tiers keep existing and fall back to the "بدون گروه" bucket (the FK is
  // ON DELETE SET NULL) — deleting a group must never delete prizes.
  const before = await pool.query('SELECT * FROM reward_groups WHERE id=$1', [req.params.id]);
  if (!before.rows[0]) return res.status(404).json({ message: 'گروه پیدا نشد' });
  await pool.query('DELETE FROM reward_groups WHERE id=$1', [req.params.id]);
  await audit(req.admin.id, 'delete_reward_group', 'reward_groups', req.params.id, before.rows[0], null);
  res.json({ message: 'گروه حذف شد؛ جوایزش بدون گروه ماندند' });
}));

// Card requirements for a tier.
app.put('/api/admin/rewards/:id/cards', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const list = Array.isArray(req.body?.cards) ? req.body.cards : [];
  if (list.length > 20) {
    return res.status(400).json({ message: 'حداکثر ۲۰ نوع کارت برای هر جایزه' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM reward_tier_cards WHERE reward_tier_id=$1', [req.params.id]);
    for (const c of list) {
      const qty = Number(c?.quantity);
      if (!c?.cardTypeId || !Number.isInteger(qty) || qty < 1 || qty > 999) {
        throw Object.assign(new Error('تعداد کارت باید عددی بین ۱ تا ۹۹۹ باشد'), { status: 400 });
      }
      await client.query(
        'INSERT INTO reward_tier_cards(reward_tier_id, card_type_id, quantity) VALUES($1,$2,$3)',
        [req.params.id, c.cardTypeId, qty]);
    }
    await client.query('COMMIT');
    await audit(req.admin.id, 'set_reward_cards', 'reward_tiers', req.params.id, null, { cards: list });
    res.json({ message: 'کارت‌های موردنیاز ذخیره شد' });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(e.status || 500).json({ message: e.message });
  } finally { client.release(); }
}));

app.post('/api/admin/rewards', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const r = req.body;
  // No practical cap: the admin owns the catalogue. A sanity ceiling stays
  // only to catch a runaway script, not to constrain real use.
  const count = await pool.query(
    'SELECT count(*)::int AS count FROM reward_tiers WHERE is_active = true');
  if (count.rows[0].count >= 500) {
    return res.status(400).json({
      message: 'تعداد جوایز فعال بیش از حد است (۵۰۰)؛ چند مورد را غیرفعال کنید',
    });
  }
  const requiredPoints = Number(r.requiredPoints);
  if (!r.name || !Number.isFinite(requiredPoints) || requiredPoints <= 0) return res.status(400).json({ message: 'نام جایزه و امتیاز معتبر الزامی است' });
  // reward_value is NOT NULL in the schema but was never validated here, so
  // omitting it produced a 500 with the generic 'اطلاعات لازم کامل نیست' —
  // which named no field and looked like a server fault rather than a form
  // mistake. Reproduced against production.
  if (!r.rewardValue || !String(r.rewardValue).trim()) {
    return res.status(400).json({ message: 'شرح جایزه (مثلاً نام کالا یا مبلغ) الزامی است' });
  }
  if (!['cash', 'physical'].includes(r.rewardType)) {
    return res.status(400).json({ message: 'نوع جایزه باید «cash» یا «physical» باشد' });
  }
  const cashAmount = cashAmountInput(r.cashAmount) ?? 0;
  // A cash reward with no amount would silently pay nothing on claim.
  if (r.rewardType === 'cash' && cashAmount <= 0) {
    return res.status(400).json({ message: 'برای جایزهٔ نقدی، مبلغ باید بیشتر از صفر باشد' });
  }
  // ═══════════════════════════════════════════════════════════════════════
  // جایزهٔ نقدی بدون سقف دریافت = بدهی نامحدود
  // ═══════════════════════════════════════════════════════════════════════
  //
  // `max_claims_per_user = 0` یعنی «نامحدود» (rewardGroupService خط ۲۵۵).
  // این پیش‌فرض برای جایزهٔ فیزیکی منطقی است، ولی برای جایزهٔ نقدی یک
  // تلهٔ واقعی است که یک بار روی همین سرور فعال بود:
  //
  //   «کارت هدیه ۱۰۰ هزار تومانی» با required_points=100 و بدون سقف.
  //   کاربری با ۱۶٬۱۲۲ امتیاز می‌توانست ۱۶۱ بار پشت سر هم بگیرد
  //   → ۱۶٬۱۰۰٬۰۰۰ تومان از یک ردیفِ جامانده از تست.
  //
  // هر claim به‌تنهایی معتبر بود؛ فقط جمعشان فاجعه بود. حالا برای
  // جایزهٔ نقدی، سقف اجباری است تا چنین ردیفی اصلاً ساخته نشود.
  const maxClaims = Math.max(0, Number(r.maxClaimsPerUser) || 0);
  if (r.rewardType === 'cash' && maxClaims <= 0) {
    return res.status(400).json({
      message: 'برای جایزهٔ نقدی، سقف دریافت هر کاربر باید مشخص و بیشتر از صفر باشد',
    });
  }
  const { rows } = await pool.query('INSERT INTO reward_tiers(name,description,image_url,required_points,reward_type,reward_value,cash_amount,display_order,is_active,group_id,max_claims_per_user) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *', [r.name,r.description,safeImageUrl(r.imageUrl),requiredPoints,r.rewardType,r.rewardValue,cashAmount,r.displayOrder||0,r.isActive!==false,r.groupId||null,maxClaims]);
  await audit(req.admin.id,'create_reward','reward_tiers',rows[0].id,null,r); res.json(rows[0]);
}));
app.patch('/api/admin/rewards/:id', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const r = req.body;
  const cashAmount = cashAmountInput(r.cashAmount);
  // حالت قبلی را نگه می‌داریم تا اگر محافظِ پایین رد کرد، دقیقاً به همین
  // حالت برگردانده شود.
  const prev = await pool.query('SELECT * FROM reward_tiers WHERE id=$1', [req.params.id]);
  if (!prev.rows[0]) return res.status(404).json({ message: 'جایزه پیدا نشد' });
  const before0 = prev.rows[0];
  // groupId is deliberately settable to NULL (move a tier out of a group), so
  // it uses an explicit sentinel rather than COALESCE.
  const moveGroup = r.groupId !== undefined;
  const { rows } = await pool.query(
    `UPDATE reward_tiers SET
       name=COALESCE($1,name), description=COALESCE($2,description),
       image_url=COALESCE($3,image_url), required_points=COALESCE($4,required_points),
       reward_type=COALESCE($5,reward_type), reward_value=COALESCE($6,reward_value),
       cash_amount=COALESCE($7,cash_amount), display_order=COALESCE($8,display_order),
       is_active=COALESCE($9,is_active),
       group_id = CASE WHEN $11::boolean THEN $12::uuid ELSE group_id END,
       max_claims_per_user = COALESCE($13, max_claims_per_user),
       updated_at=NOW()
     WHERE id=$10 RETURNING *`,
    [r.name,r.description,keepImage(r.imageUrl),r.requiredPoints,r.rewardType,
     r.rewardValue,cashAmount,r.displayOrder,r.isActive,req.params.id,
     moveGroup, moveGroup ? (r.groupId || null) : null,
     r.maxClaimsPerUser !== undefined
       ? Math.max(0, Number(r.maxClaimsPerUser) || 0) : null]);
  if (!rows[0]) return res.status(404).json({ message: 'جایزه پیدا نشد' });
  // همان محافظِ ساخت، ولی روی نتیجهٔ نهایی.
  //
  // اینجا COALESCE است، پس نمی‌شود فقط ورودی را چک کرد: ادمین می‌تواند
  // تیرِ نقدیِ غیرفعالی که سقفش صفر است را با یک PATCHِ
  // `{isActive:true}` دوباره زنده کند و هیچ فیلدِ خطرناکی هم نفرستد.
  // پس ردیفِ بعد از به‌روزرسانی سنجیده می‌شود و در صورت خطا تراکنش
  // برگردانده می‌شود. (جزئیات در محافظِ POST بالا.)
  const after = rows[0];
  if (after.is_active && after.reward_type === 'cash'
      && Number(after.max_claims_per_user || 0) <= 0) {
    await pool.query(
      'UPDATE reward_tiers SET max_claims_per_user=$2, is_active=$3 WHERE id=$1',
      [req.params.id, before0.max_claims_per_user, before0.is_active]);
    return res.status(400).json({
      message: 'برای جایزهٔ نقدی فعال، سقف دریافت هر کاربر باید بیشتر از صفر باشد',
    });
  }
  await audit(req.admin.id,'update_reward','reward_tiers',req.params.id,null,r); res.json(rows[0]);
}));
app.delete('/api/admin/rewards/:id', adminAuth, validateUuid('id'), requireRole('super_admin'), asyncHandler(async (req, res) => {
  // Full control for the admin. Past claims survive because each one stores
  // its own snapshot of the prize (name/image/type/amount) — see migration
  // 021, which also relaxed the FK from RESTRICT to SET NULL.
  const before = await pool.query('SELECT * FROM reward_tiers WHERE id=$1', [req.params.id]);
  if (!before.rows[0]) return res.status(404).json({ message: 'جایزه پیدا نشد' });
  await pool.query('DELETE FROM reward_tiers WHERE id=$1', [req.params.id]);
  await audit(req.admin.id, 'delete_reward', 'reward_tiers', req.params.id, before.rows[0], null);
  res.json({ message: 'جایزه حذف شد؛ سابقهٔ دریافت‌های قبلی حفظ شد' });
}));
app.get('/api/admin/reward-claims', adminAuth, asyncHandler(async (req, res) => res.json((await pool.query('SELECT c.*, u.mobile, r.name AS reward_name FROM user_reward_claims c JOIN users u ON u.id=c.user_id JOIN reward_tiers r ON r.id=c.reward_tier_id ORDER BY c.claimed_at DESC')).rows)));
app.patch('/api/admin/reward-claims/:id', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const { status, adminNote } = req.body;
  if (!['pending', 'approved', 'rejected', 'paid'].includes(status)) {
    return res.status(400).json({ message: 'وضعیت نامعتبر است' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q = await client.query(
      `SELECT c.*, r.cash_amount, r.reward_type, r.name AS reward_name,
              r.required_points
         FROM user_reward_claims c JOIN reward_tiers r ON r.id=c.reward_tier_id
        WHERE c.id=$1 FOR UPDATE OF c`,
      [req.params.id],
    );
    const claim = q.rows[0];
    if (!claim) throw Object.assign(new Error('درخواست جایزه پیدا نشد'), { status: 404 });

    await client.query(
      'UPDATE user_reward_claims SET status=$1, admin_note=$2, updated_at=NOW() WHERE id=$3',
      [status, adminNote, req.params.id],
    );

    // جایزهٔ نقدی وقتی «پرداخت شده» علامت می‌خورد به کیف پول واریز می‌شود،
    // نه هنگام تأیید — تا مدیر بتواند اول تأیید کند و بعد در زمان مناسب
    // پول را آزاد کند. مرجع = شناسهٔ claim، پس کلیک دوباره روی «پرداخت شد»
    // مبلغ را دو بار واریز نمی‌کند (ایندکس یکتای دفتر کل).
    const cash = Number(claim.cash_amount || 0);
    let credited = 0;
    if (status === 'paid' && claim.reward_type === 'cash' && cash > 0) {
      const r = await walletService.credit(client, {
        userId: claim.user_id,
        amount: cash,
        source: 'reward',
        referenceType: 'user_reward_claims',
        referenceId: claim.id,
        description: `جایزهٔ نقدی «${claim.reward_name}»`,
        adminId: req.admin.id,
      });
      if (!r.duplicate) credited = cash;
    }
    // REFUND ON REJECTION.
    //
    // Points are spent the moment a user claims, but a physical prize stays
    // pending until an admin posts it. If the admin then REJECTS it, the user
    // had paid for nothing and had no way to get those points back.
    //
    // The refund goes to current_points (the spendable balance) only:
    // lifetime_points was never reduced by the claim, and monthly league
    // points were never touched, so restoring either would invent points the
    // user did not earn.
    let refunded = 0;
    if (status === 'rejected' && !claim.refunded_at) {
      const { rows: tierRows } = await client.query(
        'SELECT required_points FROM reward_tiers WHERE id=$1',
        [claim.reward_tier_id]);
      const cost = Number(tierRows[0]?.required_points || 0);
      if (cost > 0) {
        await client.query(
          'UPDATE users SET current_points = current_points + $2, updated_at=NOW() WHERE id=$1',
          [claim.user_id, cost]);
        // Stamped so a second rejection (or a re-save) cannot refund twice.
        await client.query(
          'UPDATE user_reward_claims SET refunded_at=NOW() WHERE id=$1',
          [claim.id]);
        refunded = cost;
      }
    }

    await client.query('COMMIT');

    if (refunded > 0) {
      createNotification(
        claim.user_id,
        'reward',
        'درخواست جایزه رد شد — امتیازت برگشت',
        `درخواست «${claim.reward_name}» تایید نشد و ${refunded} امتیاز به حسابت برگردانده شد.`,
      ).catch(() => {});
    }

    if (credited > 0) {
      createNotification(
        claim.user_id,
        'wallet',
        'جایزهٔ نقدی به کیف پول اضافه شد 🎁',
        `${credited.toLocaleString('en-US')} تومان بابت جایزهٔ «${claim.reward_name}» به کیف پول شما واریز شد.`,
      ).catch(() => {});
    }
    await audit(req.admin.id, 'update_reward_claim', 'user_reward_claims', req.params.id, adminNote, { status, credited });
    res.json({
      message: credited > 0
        ? `به‌روزرسانی شد و ${credited.toLocaleString('en-US')} تومان به کیف پول کاربر واریز شد`
        : refunded > 0
          ? `درخواست رد شد و ${refunded} امتیاز به کاربر برگشت`
          : 'به‌روزرسانی شد',
      refunded,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(e.status || 500).json({ message: e.message || 'خطا در به‌روزرسانی' });
  } finally { client.release(); }
}));

// ===========================================================================
//  کیف پول — مسیرهای مدیر
// ===========================================================================

// آمار سرصفحه: چند درخواست در انتظار، چه مبلغی، و کل بدهی کیف پول‌ها
app.get('/api/admin/wallet/stats', adminAuth, asyncHandler(async (req, res) => {
  res.json(await withdrawalService.adminStats());
}));

// فهرست درخواست‌های برداشت. تنها نقطه‌ای که شمارهٔ کامل کارت برمی‌گردد،
// چون مدیر باید واریز را واقعاً انجام دهد.
app.get('/api/admin/wallet/withdrawals', adminAuth, asyncHandler(async (req, res) => {
  res.json(await withdrawalService.listForAdmin({
    status: req.query.status,
    search: req.query.search,
    limit: req.query.limit,
  }));
}));

// تأیید / پرداخت / رد یک درخواست
app.patch('/api/admin/wallet/withdrawals/:id', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const request = await withdrawalService.decide(req.admin.id, req.params.id, {
    status: req.body?.status,
    adminNote: req.body?.adminNote,
    trackingCode: req.body?.trackingCode,
  });
  await audit(req.admin.id, `withdrawal_${req.body?.status}`, 'withdrawal_requests', req.params.id, req.body?.adminNote, {
    status: req.body?.status,
    amount: request.amount,
    trackingCode: request.trackingCode,
  });

  // ═══════════════════════════════════════════════════════════════════════
  // خبر دادن به کاربر — این مرحله وجود نداشت
  // ═══════════════════════════════════════════════════════════════════════
  //
  // درخواست مالک: «اگر ... برداشت کسی انجام بشه ... زنگوله نوتیفیکیشن
  // قرمز بشه».
  //
  // برداشتِ پول مهم‌ترین رخدادِ مالیِ کاربر است و تا امروز **بی‌صدا**
  // انجام می‌شد: مدیر تأیید می‌کرد، پول می‌رفت، و کاربر باید خودش
  // حدس می‌زد که کِی. رد شدن هم همین‌طور — کاربر فقط می‌دید پولش
  // برگشته بدون اینکه بداند چرا.
  //
  // متن‌ها عمداً کدِ پیگیری و دلیلِ رد را در خودشان دارند: کاربر
  // نباید برای دیدنِ آن‌ها جای دیگری برود.
  {
    const amount = Number(request.amount || 0).toLocaleString('en-US');
    const st = String(req.body?.status || '');
    if (st === 'paid') {
      const code = request.trackingCode
        ? ` کد پیگیری: ${request.trackingCode}`
        : '';
      createNotification(request.userId || request.user_id, 'wallet',
        '✅ برداشت شما پرداخت شد',
        `مبلغ ${amount} تومان به حساب شما واریز شد.${code}`,
      ).catch(() => {});
    } else if (st === 'rejected') {
      const why = req.body?.adminNote ? ` دلیل: ${req.body.adminNote}` : '';
      createNotification(request.userId || request.user_id, 'wallet',
        'درخواست برداشت رد شد',
        `مبلغ ${amount} تومان به کیف پول شما برگشت.${why}`,
      ).catch(() => {});
    } else if (st === 'approved') {
      createNotification(request.userId || request.user_id, 'wallet',
        'درخواست برداشت تأیید شد',
        `درخواست ${amount} تومانی شما تأیید شد و به‌زودی پرداخت می‌شود.`,
      ).catch(() => {});
    }
  }

  res.json({ message: 'وضعیت درخواست به‌روزرسانی شد', request });
}));

// دفتر تراکنش‌های یک کاربر خاص (برای بررسی اختلاف حساب)
app.get('/api/admin/wallet/users/:id/transactions', adminAuth, validateUuid('id'), asyncHandler(async (req, res) => {
  res.json(await walletService.transactions(req.params.id, { limit: req.query.limit || 100 }));
}));

// واریز/کسر دستی توسط مدیر ارشد. عمداً محدود به super_admin است: این
// endpoint عملاً «چاپ پول» می‌کند و نباید در اختیار نقش پشتیبانی باشد.
app.post('/api/admin/wallet/users/:id/adjust', adminAuth, validateUuid('id'), requireRole(), asyncHandler(async (req, res) => {
  const amount = Math.floor(Number(req.body?.amount || 0));
  const reason = String(req.body?.reason || '').trim();
  if (!Number.isFinite(amount) || amount === 0) {
    return res.status(400).json({ message: 'مبلغ باید عددی مخالف صفر باشد' });
  }
  // دلیل اجباری است: بدون آن، دفتر کل پر از تراکنش‌های بی‌توضیح می‌شود و
  // ممیزی مالی بعدی غیرممکن است.
  if (reason.length < 3) {
    return res.status(400).json({ message: 'ثبت دلیل برای تغییر دستی موجودی الزامی است' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const fn = amount > 0 ? walletService.credit : walletService.debit;
    const result = await fn(client, {
      userId: req.params.id,
      amount: Math.abs(amount),
      source: amount > 0 ? 'admin_credit' : 'admin_debit',
      referenceType: 'admin_adjustment',
      description: reason,
      adminId: req.admin.id,
    });
    await client.query('COMMIT');
    await audit(req.admin.id, 'wallet_adjust', 'users', req.params.id, reason, { amount });
    createNotification(
      req.params.id,
      'wallet',
      amount > 0 ? 'افزایش موجودی کیف پول' : 'کسر از کیف پول',
      `${Math.abs(amount).toLocaleString('en-US')} تومان ${amount > 0 ? 'به' : 'از'} کیف پول شما ${amount > 0 ? 'اضافه شد' : 'کسر شد'}. ${reason}`,
    ).catch(() => {});
    res.json({ message: 'موجودی کیف پول تغییر کرد', balance: result.balance });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(e.status || 500).json({ message: e.message || 'خطا در تغییر موجودی' });
  } finally { client.release(); }
}));

app.get('/api/admin/wallet/settings', adminAuth, asyncHandler(async (req, res) => {
  res.json(await walletService.getWalletSettings());
}));
app.patch('/api/admin/wallet/settings', adminAuth, requireRole(), asyncHandler(async (req, res) => {
  const saved = await walletService.saveWalletSettings(req.body || {}, req.admin.id);
  await audit(req.admin.id, 'update_wallet_settings', 'app_settings', null, null, saved);
  res.json({ message: 'تنظیمات کیف پول ذخیره شد', settings: saved });
}));

app.get('/api/admin/league', adminAuth, asyncHandler(async (req, res) => { const data = await getLeaderboard(100); data.winnerCount = await getLeagueWinnerCount(); res.json(data); }));
app.patch('/api/admin/league/current/prizes', adminAuth, requireRole(), asyncHandler(async (req, res) => {
  const season = await ensureActiveSeason();

  // AUDIT FIX: prizeTable هرچه بود خام ذخیره می‌شد. یک مبلغ منفی (یا متنی
  // که به NaN تبدیل می‌شود) بعداً در closeActiveSeason به league_payouts
  // می‌رفت و قید CHECK (amount >= 0) را می‌شکست.
  //
  // بازتولید شد: با رتبهٔ ۱ = منفی ۵۰۰٬۰۰۰ و دو کاربر واجد شرایط،
  //   [league] close failed: violates check constraint league_payouts_amount_check
  // فصل «active» می‌ماند، هیچ‌کس پول نمی‌گیرد، و cron شبانه **هر شب**
  // بی‌صدا شکست می‌خورد. یعنی یک تایپو در پنل، پرداخت کل لیگ را می‌خواباند.
  //
  // حالا همین‌جا اعتبارسنجی می‌شود، جایی که مدیر بازخورد می‌گیرد.
  const rawTable = Array.isArray(req.body.prizeTable) ? req.body.prizeTable : [];
  if (rawTable.length > 100) {
    return res.status(400).json({ message: 'جدول جوایز حداکثر ۱۰۰ رتبه می‌تواند داشته باشد' });
  }
  const prizeTable = [];
  const seenRanks = new Set();
  for (const row of rawTable) {
    const rank = Number(row?.rank);
    const amount = Number(row?.amount ?? 0);
    if (!Number.isInteger(rank) || rank < 1 || rank > 100) {
      return res.status(400).json({ message: `رتبه باید عددی صحیح بین ۱ تا ۱۰۰ باشد (دریافت شد: ${row?.rank})` });
    }
    if (seenRanks.has(rank)) {
      return res.status(400).json({ message: `رتبهٔ ${rank} تکراری است` });
    }
    seenRanks.add(rank);
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
      return res.status(400).json({ message: `مبلغ جایزهٔ رتبهٔ ${rank} باید عددی صحیح و صفر یا بیشتر باشد` });
    }
    if (amount > 100000000000) {
      return res.status(400).json({ message: `مبلغ جایزهٔ رتبهٔ ${rank} خارج از محدودهٔ مجاز است` });
    }
    prizeTable.push({ rank, amount });
  }
  const winnerCount = Math.max(1, Math.min(100, Number(req.body.winnerCount || prizeTable.length || 10)));
  await pool.query('UPDATE league_seasons SET prize_table=$1, updated_at=NOW() WHERE id=$2', [JSON.stringify(prizeTable), season.id]);
  await pool.query(`INSERT INTO app_settings(key,value,updated_by_admin_id,updated_at) VALUES('league_winner_count',$1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_by_admin_id=EXCLUDED.updated_by_admin_id, updated_at=NOW()`, [JSON.stringify(winnerCount), req.admin.id]);
  await audit(req.admin.id,'update_league_prizes','league_seasons',season.id,null,{...req.body,winnerCount}); res.json({ message: 'جدول جوایز لیگ ذخیره شد', winnerCount });
}));
app.post('/api/admin/league/close', adminAuth, requireRole(), asyncHandler(async (req, res) => res.json(await closeActiveSeason())));
app.get('/api/admin/league/payouts', adminAuth, asyncHandler(async (req, res) => res.json((await pool.query('SELECT p.*, u.mobile,u.first_name,u.last_name,u.nickname,u.bank_account FROM league_payouts p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC')).rows)));
app.patch('/api/admin/league/payouts/:id', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const status = req.body.status;
  if (!['pending', 'approved', 'paid'].includes(status)) {
    return res.status(400).json({ message: 'وضعیت نامعتبر است' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q = await client.query('SELECT * FROM league_payouts WHERE id=$1 FOR UPDATE', [req.params.id]);
    const payout = q.rows[0];
    if (!payout) throw Object.assign(new Error('پرداخت پیدا نشد'), { status: 404 });

    await client.query(
      // همان باگ 42P08: $1 هم varchar و هم text استنتاج می‌شد و کوئری با
      // ۵۰۰ می‌افتاد، یعنی جایزهٔ لیگ هرگز «پرداخت‌شده» نمی‌شد. cast صریح.
      "UPDATE league_payouts SET payment_status=$1::text, paid_at=CASE WHEN $1::text='paid' THEN NOW() ELSE paid_at END WHERE id=$2",
      [status, req.params.id],
    );

    // جایزهٔ لیگ هنگام «پرداخت شده» به کیف پول واریز می‌شود. مرجع =
    // شناسهٔ payout، پس تکرار عملیات پول اضافه تولید نمی‌کند.
    const amount = Number(payout.amount || 0);
    let credited = 0;
    if (status === 'paid' && amount > 0) {
      const r = await walletService.credit(client, {
        userId: payout.user_id,
        amount,
        source: 'league',
        referenceType: 'league_payouts',
        referenceId: payout.id,
        description: `جایزهٔ لیگ — رتبهٔ ${payout.rank}`,
        adminId: req.admin.id,
      });
      if (!r.duplicate) credited = amount;
    }
    await client.query('COMMIT');

    if (credited > 0) {
      createNotification(
        payout.user_id,
        'wallet',
        'جایزهٔ لیگ به کیف پول اضافه شد 🏆',
        `${credited.toLocaleString('en-US')} تومان بابت رتبهٔ ${payout.rank} لیگ به کیف پول شما واریز شد.`,
      ).catch(() => {});
    }
    await audit(req.admin.id, 'update_league_payout', 'league_payouts', req.params.id, null, { status, credited });
    res.json({ message: credited > 0 ? `ثبت شد و ${credited.toLocaleString('en-US')} تومان به کیف پول واریز شد` : 'ثبت شد' });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(e.status || 500).json({ message: e.message || 'خطا در ثبت' });
  } finally { client.release(); }
}));

app.get('/api/admin/users', adminAuth, asyncHandler(async (req, res) => {
  const search = `%${req.query.search || ''}%`;
  // ═══════════════════════════════════════════════════════════════════════
  // چرا game_xp اینجا خوانده و به لول تبدیل می‌شود
  // ═══════════════════════════════════════════════════════════════════════
  //
  // مدیر باید همان چیزی را ببیند که کاربر می‌بیند. بدون لول در این
  // فهرست، پشتیبانی نمی‌تواند به سؤالِ «چرا لولم بالا نرفت» جواب دهد
  // و هیچ راهی برای تشخیصِ حسابِ مشکوک (لولِ خیلی بالا در چند روز)
  // ندارد.
  //
  // تبدیل سمتِ سرور انجام می‌شود نه در پنل: منحنی یک منبعِ حقیقت
  // دارد و تغییرش نباید نیازمندِ انتشارِ نسخهٔ تازهٔ پنل باشد.
  const rows = (await pool.query('SELECT id,mobile,first_name,last_name,nickname,age,city,province,bank_account,profile_image_url,profile_avatar_key,current_points,lifetime_points,monthly_league_points,status,joined_at,game_xp FROM users WHERE mobile ILIKE $1 OR nickname ILIKE $1 ORDER BY joined_at DESC LIMIT 300', [search])).rows;
  res.json(rows.map((u) => ({
    ...u,
    level: level.levelFromXp(u.game_xp).level,
  })));
}));
app.get('/api/admin/users/:id', adminAuth, validateUuid('id'), asyncHandler(async (req, res) => {
  const user = await pool.query('SELECT * FROM users WHERE id=$1', [req.params.id]);
  const codes = await pool.query('SELECT c.code,c.used_at,t.name,t.point_value FROM card_codes c JOIN card_types t ON t.id=c.card_type_id WHERE c.used_by_user_id=$1 ORDER BY c.used_at DESC LIMIT 100', [req.params.id]);
  res.json({ user: safeUser(user.rows[0]), codes: codes.rows });
}));
app.patch('/api/admin/users/:id/status', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => { await pool.query('UPDATE users SET status=$1 WHERE id=$2', [req.body.status, req.params.id]); await audit(req.admin.id,'update_user_status','users',req.params.id,req.body.reason,{status:req.body.status}); res.json({message:'ثبت شد'}); }));
app.post('/api/admin/users/:id/points', adminAuth, validateUuid('id'), requireRole(), asyncHandler(async (req, res) => {
  const p = Number(req.body.points || 0);
  // lifetime_points is a permanent record of everything a user has ever
  // earned, so a deduction must not rewrite it — only additions count.
  // Otherwise correcting a mistake with -100 would erase history the user
  // legitimately built up, and the profile would under-report their total.
  // در یک تراکنش، چون کمیسیون معرف هم باید همراهش برود یا اصلاً نرود.
  const pointsClient = await pool.connect();
  try {
    await pointsClient.query('BEGIN');
    await pointsClient.query(
      `UPDATE users SET
         current_points        = GREATEST(0, current_points + $1),
         lifetime_points       = lifetime_points + GREATEST($1, 0),
         monthly_league_points = GREATEST(0, monthly_league_points + $1),
         updated_at = NOW()
       WHERE id = $2`,
      [p, req.params.id]);
    // بدون کمیسیون معرف — عمدی.
    //
    // مالک دامنه را محدود کرد: کمیسیون فقط از «ثبت کارت» و «بازی ضربه‌زن».
    // امتیاز دستی مدیر هیچ‌کدام نیست، و منطقی هم هست: یک اصلاح دستی
    // نباید به شخص سومی پول بدهد.
    await pointsClient.query('COMMIT');
  } catch (e) {
    await pointsClient.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    pointsClient.release();
  }
  await audit(req.admin.id,'manual_points','users',req.params.id,req.body.reason,{points:p}); await createNotification(req.params.id, 'admin_points', 'تغییر امتیاز توسط مدیریت', `امتیاز شما به مقدار ${p} تغییر کرد. ${req.body.reason||''}`); res.json({message:'امتیاز تغییر کرد'}); }));
app.post('/api/admin/users/:id/notify', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => { await createNotification(req.params.id, 'admin_private', req.body.title || 'پیام اختصاصی مدیریت', req.body.body || req.body.message || ''); await audit(req.admin.id,'private_message_user','users',req.params.id,null,{title:req.body.title}); res.json({message:'پیام اختصاصی ارسال شد'}); }));
// SMS OTP is not wired up yet, so the self-service "forgot password" flow
// cannot deliver a reset code to the user. Until a real SMS provider is
// configured, this lets a support/super admin set a temporary password for
// a locked-out user after verifying their identity manually (phone call,
// in-person, etc.). Every use is written to the audit log.
app.post('/api/admin/users/:id/reset-password', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const newPassword = String(req.body.newPassword || '');
  if (!isValidPasswordLength(newPassword)) return res.status(400).json({ message: 'رمز جدید باید بین ۶ تا ۷۲ کاراکتر باشد' });
  const hash = await bcrypt.hash(newPassword, 12);
  const { rows } = await pool.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2 RETURNING id,mobile', [hash, req.params.id]);
  if (!rows[0]) return res.status(404).json({ message: 'کاربر پیدا نشد' });
  await audit(req.admin.id, 'admin_reset_user_password', 'users', req.params.id, req.body.reason || 'بازیابی رمز توسط پشتیبانی (SMS هنوز فعال نیست)', {});
  res.json({ message: 'رمز عبور کاربر تغییر کرد' });
}));

app.get('/api/admin/chat/messages', adminAuth, asyncHandler(async (req, res) => res.json((await pool.query('SELECT m.*, u.mobile,u.nickname FROM chat_messages m JOIN users u ON u.id=m.user_id ORDER BY m.sent_at DESC LIMIT 300')).rows)));
app.patch('/api/admin/chat/messages/:id/delete', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => { await pool.query('UPDATE chat_messages SET is_deleted=true WHERE id=$1', [req.params.id]); await audit(req.admin.id,'delete_chat_message','chat_messages',req.params.id,req.body.reason); res.json({message:'حذف شد'}); }));
app.patch('/api/admin/chat/users/:id/ban', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => { await pool.query("UPDATE users SET chat_banned_until=NOW()+($1::text||' minutes')::interval WHERE id=$2", [req.body.minutes||1440, req.params.id]); await audit(req.admin.id,'ban_chat_user','users',req.params.id,req.body.reason,{minutes:req.body.minutes}); await createNotification(req.params.id,'chat_penalty','محدودیت چت',`شما به مدت ${req.body.minutes||1440} دقیقه از چت محروم شدید. ${req.body.reason||''}`); res.json({message:'کاربر از چت محروم شد'}); }));

app.get('/api/admin/support/tickets', adminAuth, requireRole('support','observer'), asyncHandler(async (req, res) => res.json((await pool.query('SELECT t.*, u.mobile FROM support_tickets t JOIN users u ON u.id=t.user_id ORDER BY t.updated_at DESC')).rows)));
app.get('/api/admin/support/tickets/:id/messages', adminAuth, validateUuid('id'), requireRole('support','observer'), asyncHandler(async (req, res) => res.json((await pool.query('SELECT * FROM support_ticket_messages WHERE ticket_id=$1 ORDER BY created_at', [req.params.id])).rows)));
app.post('/api/admin/support/tickets/:id/messages', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const attachments = sanitizeAttachments(req.body.attachments);
  const text = String(req.body.message || '').trim();
  if (!text && !attachments.length) return res.status(400).json({ message: 'متن پاسخ یا حداقل یک عکس لازم است' });
  const cur = await pool.query('SELECT status FROM support_tickets WHERE id=$1', [req.params.id]);
  if (!cur.rows[0]) return res.status(404).json({ message: 'تیکت پیدا نشد' });
  if (cur.rows[0].status === 'closed') return res.status(409).json({ message: 'این تیکت بسته شده است' });
  await pool.query("INSERT INTO support_ticket_messages(ticket_id,sender_type,sender_admin_id,message_text,attachments) VALUES($1,'admin',$2,$3,$4)", [req.params.id, req.admin.id, text, JSON.stringify(attachments)]);
  const ticket = await pool.query("UPDATE support_tickets SET status='answered', updated_at=NOW() WHERE id=$1 RETURNING user_id", [req.params.id]);
  if (ticket.rows[0]) await createNotification(ticket.rows[0].user_id, 'support_answer', 'پاسخ پشتیبانی', 'تیکت شما پاسخ داده شد. می‌توانید در همان تیکت پاسخ دهید.');
  res.json({ message: 'پاسخ ارسال شد' });
}));

// Closing is the ONLY way a user becomes eligible to open a new ticket, so
// it is an explicit admin action rather than a side effect of replying.
app.patch('/api/admin/support/tickets/:id/close', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    "UPDATE support_tickets SET status='closed', closed_at=NOW(), closed_by_admin_id=$2, updated_at=NOW() WHERE id=$1 AND status <> 'closed' RETURNING user_id, subject",
    [req.params.id, req.admin.id]
  );
  if (!rows[0]) return res.status(400).json({ message: 'این تیکت از قبل بسته شده است' });
  await audit(req.admin.id, 'close_support_ticket', 'support_tickets', req.params.id, req.body.reason || null, {});
  await createNotification(rows[0].user_id, 'support_closed', 'تیکت بسته شد', `تیکت «${rows[0].subject}» توسط پشتیبانی بسته شد.`);
  res.json({ message: 'تیکت بسته شد' });
}));

app.patch('/api/admin/support/tickets/:id/reopen', adminAuth, validateUuid('id'), requireRole('support'), asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    "UPDATE support_tickets SET status='open', closed_at=NULL, closed_by_admin_id=NULL, updated_at=NOW() WHERE id=$1 AND status='closed' RETURNING user_id",
    [req.params.id]
  );
  if (!rows[0]) return res.status(400).json({ message: 'این تیکت باز است' });
  await audit(req.admin.id, 'reopen_support_ticket', 'support_tickets', req.params.id, null, {});
  res.json({ message: 'تیکت دوباره باز شد' });
}));

app.post('/api/admin/notifications/broadcast', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const { title, body } = req.body;
  await createNotification(null, 'broadcast', title, body);
  await audit(req.admin.id,'broadcast_notification','notifications',null,null,{title});
  res.json({ message: 'اطلاعیه همگانی ثبت شد' });
}));
app.get('/api/admin/admins', adminAuth, requireRole(), asyncHandler(async (req, res) => res.json((await pool.query('SELECT id,username,role,is_active,created_at FROM admin_users ORDER BY created_at DESC')).rows)));
app.post('/api/admin/admins', adminAuth, requireRole(), asyncHandler(async (req, res) => { const hash=await bcrypt.hash(req.body.password,12); const r=await pool.query('INSERT INTO admin_users(username,password_hash,role) VALUES($1,$2,$3) RETURNING id,username,role,is_active,created_at',[req.body.username,hash,req.body.role]); await audit(req.admin.id,'create_admin','admin_users',r.rows[0].id,null,{username:req.body.username,role:req.body.role}); res.json(r.rows[0]); }));
// There was previously no way to revoke an admin/support account once
// created — only DB access could set is_active=false. A departing
// support/support-with-a-compromised-password account could keep a fully
// working session/token until natural JWT expiry (12h) with no way for a
// super_admin to cut it off sooner or prevent future logins.
app.patch('/api/admin/admins/:id/status', adminAuth, validateUuid('id'), requireRole(), asyncHandler(async (req, res) => {
  if (req.params.id === req.admin.id) return res.status(400).json({ message: 'نمی‌توانید حساب خودتان را غیرفعال کنید' });
  const isActive = req.body.isActive !== false;
  const { rows } = await pool.query('UPDATE admin_users SET is_active=$1, updated_at=NOW() WHERE id=$2 RETURNING id,username,role,is_active', [isActive, req.params.id]);
  if (!rows[0]) return res.status(404).json({ message: 'ادمین پیدا نشد' });
  await audit(req.admin.id, isActive ? 'activate_admin' : 'deactivate_admin', 'admin_users', req.params.id, req.body.reason || null, { username: rows[0].username });
  res.json(rows[0]);
}));
// ── دفتر رخدادها ──────────────────────────────────────────────────────────
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا صفحه‌بندی شد و چرا ستون‌ها محدود شدند
// ═══════════════════════════════════════════════════════════════════════════
//
// نسخهٔ قبلی `SELECT a.*` با `LIMIT 500` بود. اندازه‌گیری روی سرور زنده:
//
//     ۱۹۳٬۷۹۸ بایت JSON خام (۲۹ کیلوبایت فشرده)
//
// یعنی هشت برابرِ سنگین‌ترین endpoint بعدی. `a.*` شامل ستون JSONB
// `metadata` است که برای هر ویرایش کل بدنهٔ درخواست را نگه می‌دارد —
// چیزی که فهرست هرگز نشان نمی‌دهد و فقط در جزئیات یک رخداد به‌کار
// می‌آید.
//
// روی گوشی، آن ۱۹۳ کیلوبایت باید کامل پارس شود و به‌صورت Map های دارت در
// حافظه بماند؛ با سربارِ آبجکت‌های دارت، چند برابرِ خودِ متن رم می‌گیرد.
// این دقیقاً همان «مصرف رم» است که باید پایین بیاید، بدون کم شدن امکانات.
//
// حالا:
//   • فقط ستون‌های موردنیازِ فهرست انتخاب می‌شوند.
//   • به‌جای دو ستون سنگین، فقط یک پرچم بولین می‌گوید آیا جزئیاتی هست.
//   • صفحه‌بندی با limit/offset، پیش‌فرض ۵۰ به‌جای ۵۰۰.
//
// امکانات کم نشد: هر رخدادی که قبلاً دیده می‌شد هنوز دیده می‌شود، فقط
// صفحه‌به‌صفحه — و جزئیات کامل از endpoint تک‌رخداد در دسترس است.
app.get('/api/admin/audit-log', adminAuth, requireRole(), asyncHandler(async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const { rows } = await pool.query(
    `SELECT a.id, a.admin_user_id, a.action, a.target_type, a.target_id,
            a.reason, a.created_at, ad.username,
            (a.metadata IS NOT NULL AND a.metadata::text <> '{}') AS has_detail
       FROM audit_log a
       LEFT JOIN admin_users ad ON ad.id = a.admin_user_id
      ORDER BY a.created_at DESC
      LIMIT $1 OFFSET $2`, [limit, offset]);
  const { rows: cnt } = await pool.query('SELECT count(*)::int AS n FROM audit_log');
  res.json({ entries: rows, total: cnt[0].n, limit, offset });
}));

/// جزئیات کاملِ یک رخداد — شامل metadata.
///
/// جدا از فهرست است تا آن ستون سنگین فقط وقتی منتقل شود که ادمین واقعاً
/// روی یک ردیف زده باشد.
app.get('/api/admin/audit-log/:id', adminAuth, requireRole(), validateUuid('id'),
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT a.*, ad.username FROM audit_log a
         LEFT JOIN admin_users ad ON ad.id = a.admin_user_id
        WHERE a.id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'رخداد پیدا نشد' });
    res.json(rows[0]);
  }));


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
    const { rows } = await pool.query('SELECT id,nickname,first_name,last_name,profile_image_url,profile_avatar_key,chat_banned_until,status,lifetime_points,current_points,game_xp FROM users WHERE id=$1', [payload.sub]);
    if (!rows[0] || rows[0].status !== 'active') throw new Error('inactive');
    socket.user = rows[0]; next();
  } catch(e){ next(new Error('unauthorized')); }
});
const socketMessageTimes = new Map();
io.on('connection', socket => {
  socket.on('chat:send', async (payload, cb) => {
    try {
      const now = Date.now();
      const arr = (socketMessageTimes.get(socket.user.id) || []).filter(t => now - t < 60_000);
      if (arr.length >= 20) throw new Error('ضد اسپم: تعداد پیام زیاد است');
      const minLifetimePoints = await getChatMinLifetimePoints();
      if (Number(socket.user.lifetime_points || 0) < minLifetimePoints) throw new Error(`برای ارسال پیام باید حداقل ${minLifetimePoints} امتیاز تاریخی داشته باشید`);
      const cd = await ensureChatCooldown(socket.user.id);
      if (cd.remaining > 0) throw new Error(`برای جلوگیری از اسپم، ${cd.remaining} ثانیه دیگر پیام بدهید`);
      if (socket.user.chat_banned_until && new Date(socket.user.chat_banned_until) > new Date()) throw new Error('شما موقتاً از چت محروم هستید');
      const body = typeof payload === 'object' && payload ? payload : { text: payload };
      const stickerId = body.stickerId || null;
      const replyTo = body.replyTo || null;
      let clean = String(body.text || '').trim();
      let messageType = stickerId ? 'sticker' : 'text';
      if (stickerId) {
        const st = await pool.query('SELECT * FROM chat_stickers WHERE id=$1 AND is_active=true', [stickerId]);
        if (!st.rows[0]) throw new Error('استیکر معتبر نیست');
        clean = clean || st.rows[0].title;
      }
      if (replyTo) {
        const rm = await pool.query('SELECT id FROM chat_messages WHERE id=$1 AND is_deleted=false', [replyTo]);
        if (!rm.rows[0]) throw new Error('پیام موردنظر برای پاسخ پیدا نشد');
      }
      if (messageType === 'text' && !CANNED_MESSAGES.includes(clean)) throw new Error('فقط پیام‌های آماده مجاز هستند.');
      if (clean) await assertNoBadWords(clean);
      arr.push(now); socketMessageTimes.set(socket.user.id, arr);
      const { rows } = await pool.query('INSERT INTO chat_messages(user_id,message_text,reply_to_message_id,sticker_id,message_type) VALUES($1,$2,$3,$4,$5) RETURNING *', [socket.user.id, clean, replyTo, stickerId, messageType]);
      // Same fix as the REST path: without cosmetics here, a badge bought
      // seconds earlier does not show on the sender's own new message.
      const cosWs = await shop.cosmeticsFor([socket.user.id]);
      const msg = { ...rows[0], nickname: socket.user.nickname, first_name: socket.user.first_name, last_name: socket.user.last_name, profile_image_url: socket.user.profile_image_url, profile_avatar_key: socket.user.profile_avatar_key, like_count: 0, cosmetics: cosWs.get(socket.user.id) || null };
      io.emit('chat:new', msg); cb && cb({ ok: true, message: msg });
    } catch(e){ cb && cb({ ok: false, error: e.message }); }
  });

});

// Multiplayer games: a shared engine + one small rules file per game
// (backend/src/games/), so adding a game never touches this file.
const games = require('./games');
games.attach(io);

cron.schedule('5 0 1 * *', () => closeActiveSeason().catch(e => console.error('monthly close failed', e)));

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
  if (status >= 500) {
    console.error(err);
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
server.listen(port, async () => { await ensureActiveSeason(); console.log(`GhelGheli API on :${port}`); });
