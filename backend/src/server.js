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

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CORS_ORIGIN?.split(',') || '*' } });
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') || '*', credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));
const uploadRoot = path.join(__dirname, '..', 'uploads');
const imageUploadDir = path.join(uploadRoot, 'images');
fs.mkdirSync(imageUploadDir, { recursive: true });
app.use('/uploads', express.static(uploadRoot));
app.use('/public', express.static(path.join(__dirname, '..', 'public')));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(YAML.load(__dirname + '/../docs/openapi.yaml')));
const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, imageUploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype)),
});

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const signUser = user => jwt.sign({ sub: user.id, type: 'user' }, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '30d' });
const signAdmin = admin => jwt.sign({ sub: admin.id, type: 'admin', role: admin.role }, JWT_SECRET, { expiresIn: '12h' });
function normalizeMobile(m) { return String(m || '').replace(/\s+/g, '').trim(); }
function normalizeCardCode(code) { return String(code || '').trim().toUpperCase(); }
function validateCodeFormat(code) { return /^[A-Z0-9_-]{8,128}$/.test(normalizeCardCode(code)); }
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
async function ensureChatCooldown(userId) {
  const cooldown = await getChatCooldownSeconds();
  if (!cooldown) return { cooldown, remaining: 0 };
  const { rows } = await pool.query('SELECT sent_at FROM chat_messages WHERE user_id=$1 ORDER BY sent_at DESC LIMIT 1', [userId]);
  if (!rows[0]) return { cooldown, remaining: 0 };
  const diff = (Date.now() - new Date(rows[0].sent_at).getTime()) / 1000;
  const remaining = Math.ceil(cooldown - diff);
  return { cooldown, remaining: remaining > 0 ? remaining : 0 };
}
function maskSecret(v) { if (!v) return ''; const s=String(v); return s.length <= 4 ? '****' : `${s.slice(0,2)}****${s.slice(-2)}`; }
function normalizeChatText(text) { return String(text || '').toLowerCase().replace(/[\s\u200c_\-.]+/g, ''); }
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

const cardRedeemLimiter = rateLimit({ windowMs: 60_000, limit: 12, standardHeaders: true, legacyHeaders: false, message: { message: 'تعداد تلاش زیاد است؛ کمی بعد دوباره امتحان کنید' } });
const chatLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
const otpLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false });

app.get('/health', (req, res) => res.json({ ok: true, name: 'GhelGheli API' }));

app.post('/api/auth/request-otp', otpLimiter, asyncHandler(async (req, res) => {
  const mobile = normalizeMobile(req.body.mobile);
  const purpose = req.body.purpose || 'register';
  if (!/^\+?\d{10,15}$/.test(mobile) || !['register','login','reset_password'].includes(purpose)) return res.status(400).json({ message: 'شماره یا نوع درخواست معتبر نیست' });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const hash = await bcrypt.hash(code, 10);
  const ttl = Number(process.env.OTP_TTL_MINUTES || 5);
  await pool.query('INSERT INTO otp_codes(mobile,code_hash,purpose,expires_at) VALUES($1,$2,$3,NOW()+($4::text||\' minutes\')::interval)', [mobile, hash, purpose, ttl]);
  if (process.env.OTP_DEV_MODE === 'true') console.log(`DEV OTP for ${mobile}: ${code}`);
  res.json({ message: 'کد تایید ارسال شد', devCode: process.env.OTP_DEV_MODE === 'true' ? code : undefined });
}));

app.post('/api/auth/verify-otp', asyncHandler(async (req, res) => {
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
  if (!password || password.length < 6) return res.status(400).json({ message: 'رمز عبور حداقل ۶ کاراکتر باشد' });
  const hash = await bcrypt.hash(password, 12);
  const updated = await pool.query(
    'UPDATE users SET password_hash=$1, first_name=$2, last_name=$3, nickname=$4, updated_at=NOW() WHERE mobile=$5 RETURNING *',
    [hash, firstName, lastName, nickname, mobile]
  );
  res.json({ token: signUser(updated.rows[0]), user: safeUser(updated.rows[0]) });
}));


app.post('/api/auth/register-password', asyncHandler(async (req, res) => {
  if (process.env.ALLOW_PASSWORD_REGISTRATION !== 'true') return res.status(403).json({ message: 'ثبت‌نام مستقیم فعلاً غیرفعال است' });
  const mobile = normalizeMobile(req.body.mobile);
  const { password, firstName, lastName, nickname, age, city, province, profileImageUrl, profileAvatarKey, bankAccount } = req.body;
  if (!/^\+?[0-9A-Za-z]{3,20}$/.test(mobile)) return res.status(400).json({ message: 'شماره/نام کاربری معتبر نیست' });
  if (!password || String(password).length < 6) return res.status(400).json({ message: 'رمز عبور حداقل ۶ کاراکتر باشد' });
  const hash = await bcrypt.hash(String(password), 12);
  const { rows } = await pool.query(
    `INSERT INTO users(mobile,mobile_verified,password_hash,first_name,last_name,nickname,age,city,province,profile_image_url,profile_avatar_key,bank_account,status)
     VALUES($1,true,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active')
     ON CONFLICT(mobile) DO UPDATE SET password_hash=EXCLUDED.password_hash, first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name, nickname=EXCLUDED.nickname, age=EXCLUDED.age, city=EXCLUDED.city, province=EXCLUDED.province, profile_image_url=EXCLUDED.profile_image_url, profile_avatar_key=EXCLUDED.profile_avatar_key, bank_account=EXCLUDED.bank_account, mobile_verified=true, status='active', updated_at=NOW()
     RETURNING *`,
    [mobile, hash, firstName || null, lastName || null, nickname || mobile, age ? Number(age) : null, city || null, province || null, profileImageUrl || null, profileAvatarKey || null, bankAccount || null]
  );
  res.json({ token: signUser(rows[0]), user: safeUser(rows[0]) });
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const mobile = normalizeMobile(req.body.mobile);
  const { rows } = await pool.query('SELECT * FROM users WHERE mobile=$1', [mobile]);
  const user = rows[0];
  if (!user || !user.password_hash || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) return res.status(401).json({ message: 'شماره موبایل یا رمز عبور نادرست است' });
  if (user.status !== 'active') return res.status(403).json({ message: 'حساب شما مسدود شده است' });
  res.json({ token: signUser(user), user: safeUser(user) });
}));

app.post('/api/auth/forgot-password/reset', asyncHandler(async (req, res) => {
  const mobile = normalizeMobile(req.body.mobile);
  const { code, newPassword } = req.body;
  const { rows } = await pool.query("SELECT * FROM otp_codes WHERE mobile=$1 AND purpose='reset_password' AND consumed_at IS NULL AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1", [mobile]);
  if (!rows[0] || !(await bcrypt.compare(String(code || ''), rows[0].code_hash))) return res.status(400).json({ message: 'کد بازیابی معتبر نیست' });
  await pool.query('UPDATE otp_codes SET consumed_at=NOW() WHERE id=$1', [rows[0].id]);
  await pool.query('UPDATE users SET password_hash=$1 WHERE mobile=$2', [await bcrypt.hash(newPassword, 12), mobile]);
  res.json({ message: 'رمز عبور تغییر کرد' });
}));

function safeUser(u) { const { password_hash, ...rest } = u; return rest; }

app.post('/api/cards/redeem', auth, cardRedeemLimiter, asyncHandler(async (req, res) => {
  const code = normalizeCardCode(req.body.code);
  if (!validateCodeFormat(code)) return res.status(400).json({ message: 'فرمت کد کارت معتبر نیست' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q = await client.query(`SELECT c.*, t.point_value, t.name AS card_type_name, t.is_active
      FROM card_codes c JOIN card_types t ON t.id=c.card_type_id WHERE c.code=$1 FOR UPDATE`, [code]);
    const card = q.rows[0];
    if (!card) throw Object.assign(new Error('کد نامعتبر است'), { status: 404 });
    if (card.status === 'used') throw Object.assign(new Error('این کد قبلاً استفاده شده است'), { status: 409 });
    if (!card.is_active) throw Object.assign(new Error('نوع این کارت غیرفعال است'), { status: 400 });
    await client.query("UPDATE card_codes SET status='used', used_by_user_id=$1, used_at=NOW(), updated_at=NOW() WHERE id=$2", [req.user.id, card.id]);
    await client.query('UPDATE users SET current_points=current_points+$1, lifetime_points=lifetime_points+$1, monthly_league_points=monthly_league_points+$1, updated_at=NOW() WHERE id=$2', [card.point_value, req.user.id]);
    const inv = await client.query('SELECT id FROM user_card_inventory WHERE user_id=$1 AND card_type_id=$2 AND consumed_in_reward=false', [req.user.id, card.card_type_id]);
    if (inv.rows[0]) await client.query('UPDATE user_card_inventory SET quantity=quantity+1, updated_at=NOW() WHERE id=$1', [inv.rows[0].id]);
    else await client.query('INSERT INTO user_card_inventory(user_id, card_type_id, quantity, consumed_in_reward) VALUES($1,$2,1,false)', [req.user.id, card.card_type_id]);
    await addLeaguePoints(client, req.user.id, card.point_value);
    await client.query('COMMIT');
    const userNow = await pool.query('SELECT current_points,lifetime_points,monthly_league_points FROM users WHERE id=$1', [req.user.id]);
    const reward = await pool.query('SELECT * FROM reward_tiers WHERE is_active=true AND required_points <= $1 ORDER BY required_points DESC LIMIT 1', [userNow.rows[0].current_points]);
    if (reward.rows[0]) createNotification(req.user.id, 'reward_threshold', 'تبریک! به جایزه رسیدی', `شما به سطح ${reward.rows[0].name} رسیدید.`).catch(()=>{});
    io.emit('leaderboard:update', await getLeaderboard(20));
    res.json({ message: 'کد با موفقیت ثبت شد', cardType: card.card_type_name, addedPoints: card.point_value, points: userNow.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(e.status || 500).json({ message: e.message || 'خطای ثبت کد' });
  } finally { client.release(); }
}));

app.get('/api/profile', auth, asyncHandler(async (req, res) => {
  const inv = await pool.query(`SELECT i.*, t.name, t.image_url, t.point_value FROM user_card_inventory i JOIN card_types t ON t.id=i.card_type_id WHERE i.user_id=$1 AND i.consumed_in_reward=false ORDER BY t.name`, [req.user.id]);
  res.json({ user: safeUser(req.user), inventory: inv.rows });
}));
app.patch('/api/profile', auth, asyncHandler(async (req, res) => {
  const { firstName, lastName, nickname, profileImageUrl, profileAvatarKey, bankAccount, age, city, province, fcmToken } = req.body;
  const { rows } = await pool.query(`UPDATE users SET first_name=COALESCE($1,first_name), last_name=COALESCE($2,last_name), nickname=COALESCE($3,nickname), profile_image_url=COALESCE($4,profile_image_url), profile_avatar_key=COALESCE($5,profile_avatar_key), bank_account=COALESCE($6,bank_account), age=COALESCE($7,age), city=COALESCE($8,city), province=COALESCE($9,province), fcm_token=COALESCE($10,fcm_token), updated_at=NOW() WHERE id=$11 RETURNING *`, [firstName,lastName,nickname,profileImageUrl,profileAvatarKey,bankAccount,age ? Number(age) : null,city,province,fcmToken,req.user.id]);
  res.json({ user: safeUser(rows[0]) });
}));
app.get('/api/users/:id/public', auth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT id,nickname,profile_image_url,profile_avatar_key,lifetime_points,current_points,monthly_league_points,joined_at FROM users WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ message: 'کاربر پیدا نشد' });
  const rewards = await pool.query(`SELECT c.claimed_at,c.status,r.name,r.image_url,r.reward_type,r.reward_value FROM user_reward_claims c JOIN reward_tiers r ON r.id=c.reward_tier_id WHERE c.user_id=$1 AND c.status IN ('approved','paid') ORDER BY c.claimed_at DESC LIMIT 50`, [req.params.id]);
  const cards = await pool.query(`SELECT t.id AS card_type_id,t.name,t.image_url,t.point_value,count(c.id)::int AS registered_count,max(c.used_at) AS last_registered_at FROM card_codes c JOIN card_types t ON t.id=c.card_type_id WHERE c.used_by_user_id=$1 GROUP BY t.id,t.name,t.image_url,t.point_value ORDER BY registered_count DESC,t.name LIMIT 50`, [req.params.id]);
  res.json({ ...rows[0], rewards: rewards.rows, cards: cards.rows });
}));

app.get('/api/rewards', auth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT *, ($1 >= required_points) AS eligible FROM reward_tiers WHERE is_active=true ORDER BY display_order, required_points', [req.user.current_points]);
  res.json(rows);
}));
app.post('/api/rewards/:id/claim', auth, asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tier = await client.query('SELECT * FROM reward_tiers WHERE id=$1 AND is_active=true', [req.params.id]);
    if (!tier.rows[0]) throw Object.assign(new Error('جایزه یافت نشد'), { status: 404 });
    const user = await client.query('SELECT current_points FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
    if (user.rows[0].current_points < tier.rows[0].required_points) throw Object.assign(new Error('امتیاز کافی برای این جایزه ندارید'), { status: 400 });
    const claim = await client.query(`INSERT INTO user_reward_claims(user_id,reward_tier_id,points_at_claim,status) VALUES($1,$2,$3,'pending') RETURNING *`, [req.user.id, tier.rows[0].id, user.rows[0].current_points]);
    await client.query('UPDATE users SET current_points=0, updated_at=NOW() WHERE id=$1', [req.user.id]);
    await client.query('UPDATE user_card_inventory SET consumed_in_reward=true, updated_at=NOW() WHERE user_id=$1 AND consumed_in_reward=false', [req.user.id]);
    await client.query('COMMIT');
    res.json({ message: 'درخواست جایزه ثبت شد', claim: claim.rows[0] });
  } catch (e) { await client.query('ROLLBACK'); res.status(e.status || 500).json({ message: e.message }); }
  finally { client.release(); }
}));
app.get('/api/rewards/claims/me', auth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT c.*, r.name, r.reward_type, r.reward_value FROM user_reward_claims c JOIN reward_tiers r ON r.id=c.reward_tier_id WHERE c.user_id=$1 ORDER BY c.claimed_at DESC', [req.user.id]);
  res.json(rows);
}));

app.get('/api/league/current', auth, asyncHandler(async (req, res) => res.json(await getLeaderboard(Number(req.query.limit || 100)))));

app.get('/api/chat/config', auth, asyncHandler(async (req, res) => {
  const minLifetimePoints = await getChatMinLifetimePoints();
  res.json({ minLifetimePoints, messageCooldownSeconds: await getChatCooldownSeconds(), eligible: Number(req.user.lifetime_points || 0) >= minLifetimePoints, userLifetimePoints: req.user.lifetime_points });
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
  res.json(rows.reverse());
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
  if (messageType === 'text' && (!clean || clean.length > 1000)) return res.status(400).json({ message: 'متن پیام معتبر نیست' });
  if (clean) await assertNoBadWords(clean);
  const { rows } = await pool.query('INSERT INTO chat_messages(user_id,message_text,reply_to_message_id,sticker_id,message_type) VALUES($1,$2,$3,$4,$5) RETURNING *', [req.user.id, clean, replyTo, stickerId, messageType]);
  const msg = { ...rows[0], nickname: req.user.nickname, first_name: req.user.first_name, last_name: req.user.last_name, profile_image_url: req.user.profile_image_url, profile_avatar_key: req.user.profile_avatar_key, like_count: 0, liked_by_me: false };
  io.emit('chat:new', msg);
  res.json(msg);
}));
app.post('/api/chat/messages/:id/report', auth, asyncHandler(async (req, res) => {
  await pool.query('UPDATE chat_messages SET is_reported=true, report_count=report_count+1 WHERE id=$1', [req.params.id]);
  res.json({ message: 'گزارش ثبت شد' });
}));

app.get('/api/chat/stickers', auth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT id,title,image_url,sticker_type FROM chat_stickers WHERE is_active=true ORDER BY created_at DESC');
  res.json(rows);
}));
app.post('/api/chat/messages/:id/like', auth, asyncHandler(async (req, res) => {
  await pool.query('INSERT INTO chat_message_likes(message_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.params.id, req.user.id]);
  const c = await pool.query('SELECT count(*)::int AS count FROM chat_message_likes WHERE message_id=$1', [req.params.id]);
  io.emit('chat:liked', { messageId: req.params.id, likeCount: c.rows[0].count });
  res.json({ liked: true, likeCount: c.rows[0].count });
}));
app.delete('/api/chat/messages/:id/like', auth, asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM chat_message_likes WHERE message_id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  const c = await pool.query('SELECT count(*)::int AS count FROM chat_message_likes WHERE message_id=$1', [req.params.id]);
  io.emit('chat:liked', { messageId: req.params.id, likeCount: c.rows[0].count });
  res.json({ liked: false, likeCount: c.rows[0].count });
}));

app.post('/api/support/tickets', auth, asyncHandler(async (req, res) => {
  const { subject, message } = req.body;
  const client = await pool.connect();
  try { await client.query('BEGIN');
    const ticket = await client.query('INSERT INTO support_tickets(user_id,subject) VALUES($1,$2) RETURNING *', [req.user.id, subject]);
    await client.query("INSERT INTO support_ticket_messages(ticket_id,sender_type,sender_user_id,message_text) VALUES($1,'user',$2,$3)", [ticket.rows[0].id, req.user.id, message]);
    await client.query('COMMIT'); res.json(ticket.rows[0]);
  } catch(e){ await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}));
app.get('/api/support/tickets', auth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM support_tickets WHERE user_id=$1 ORDER BY updated_at DESC', [req.user.id]); res.json(rows);
}));
app.get('/api/support/tickets/:id/messages', auth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT m.* FROM support_ticket_messages m JOIN support_tickets t ON t.id=m.ticket_id WHERE t.id=$1 AND t.user_id=$2 ORDER BY m.created_at', [req.params.id, req.user.id]); res.json(rows);
}));
app.post('/api/support/tickets/:id/messages', auth, asyncHandler(async (req, res) => {
  await pool.query("INSERT INTO support_ticket_messages(ticket_id,sender_type,sender_user_id,message_text) VALUES($1,'user',$2,$3)", [req.params.id, req.user.id, req.body.message]);
  await pool.query("UPDATE support_tickets SET status='open', updated_at=NOW() WHERE id=$1 AND user_id=$2", [req.params.id, req.user.id]);
  res.json({ message: 'پیام ارسال شد' });
}));

app.get('/api/notifications', auth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM notifications WHERE user_id=$1 OR user_id IS NULL ORDER BY created_at DESC LIMIT 100', [req.user.id]); res.json(rows);
}));
app.patch('/api/notifications/:id/read', auth, asyncHandler(async (req, res) => {
  await pool.query('UPDATE notifications SET is_read=true WHERE id=$1 AND (user_id=$2 OR user_id IS NULL)', [req.params.id, req.user.id]); res.json({ message: 'خوانده شد' });
}));

// Admin
app.post('/api/admin/auth/login', asyncHandler(async (req, res) => {
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
  if (!req.file) return res.status(400).json({ message: 'فایل عکس معتبر نیست' });
  res.json({ url: `/uploads/images/${req.file.filename}` });
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
app.patch('/api/admin/chat/stickers/:id', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const { title, imageUrl, stickerType, isActive } = req.body;
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

app.get('/api/admin/card-types', adminAuth, asyncHandler(async (req, res) => res.json((await pool.query('SELECT * FROM card_types ORDER BY created_at DESC')).rows)));
app.post('/api/admin/card-types', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const { name, imageUrl, description, pointValue, isActive = true } = req.body;
  const { rows } = await pool.query('INSERT INTO card_types(name,image_url,description,point_value,is_active) VALUES($1,$2,$3,$4,$5) RETURNING *', [name,imageUrl,description,pointValue,isActive]);
  await audit(req.admin.id, 'create_card_type', 'card_types', rows[0].id, null, req.body); res.json(rows[0]);
}));
app.patch('/api/admin/card-types/:id', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const { name, imageUrl, description, pointValue, isActive } = req.body;
  const { rows } = await pool.query('UPDATE card_types SET name=COALESCE($1,name), image_url=COALESCE($2,image_url), description=COALESCE($3,description), point_value=COALESCE($4,point_value), is_active=COALESCE($5,is_active), updated_at=NOW() WHERE id=$6 RETURNING *', [name,imageUrl,description,pointValue,isActive,req.params.id]);
  await audit(req.admin.id, 'update_card_type', 'card_types', req.params.id, null, req.body); res.json(rows[0]);
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
app.post('/api/admin/card-codes/bulk', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const { cardTypeId, rawCodes = '' } = req.body;
  const input = String(rawCodes).split(/[\n,;\t ]+/).map(c => normalizeCardCode(c)).filter(Boolean);
  const seen = new Set(), duplicateInFile = [], invalid = [], candidates = [];
  for (const c of input) {
    if (!validateCodeFormat(c)) { invalid.push(c); continue; }
    if (seen.has(c)) { duplicateInFile.push(c); continue; }
    seen.add(c); candidates.push(c);
  }
  let duplicateInDb = [], inserted = [];
  if (candidates.length) {
    const existing = await pool.query('SELECT code FROM card_codes WHERE code = ANY($1)', [candidates]);
    duplicateInDb = existing.rows.map(r => r.code);
    const dbSet = new Set(duplicateInDb);
    const finalCodes = candidates.filter(c => !dbSet.has(c));
    const client = await pool.connect();
    try { await client.query('BEGIN');
      for (const c of finalCodes) {
        const row = await client.query('INSERT INTO card_codes(code,card_type_id) VALUES($1,$2) RETURNING code', [c, cardTypeId]);
        inserted.push(row.rows[0].code);
      }
      await client.query('COMMIT');
    } catch(e){ await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  }
  await audit(req.admin.id, 'bulk_import_card_codes', 'card_types', cardTypeId, null, { inserted: inserted.length, duplicateInFile, duplicateInDb, invalid });
  res.json({ insertedCount: inserted.length, duplicateInFileCount: duplicateInFile.length, duplicateInDbCount: duplicateInDb.length, invalidCount: invalid.length, inserted, duplicateInFile, duplicateInDb, invalid });
}));

app.get('/api/admin/rewards', adminAuth, asyncHandler(async (req, res) => res.json((await pool.query('SELECT * FROM reward_tiers ORDER BY display_order, required_points')).rows)));
app.post('/api/admin/rewards', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const r = req.body;
  const count = await pool.query('SELECT count(*)::int AS count FROM reward_tiers');
  if (count.rows[0].count >= 30) return res.status(400).json({ message: 'حداکثر ۳۰ جایزه قابل تعریف است' });
  const requiredPoints = Number(r.requiredPoints);
  if (!r.name || !Number.isFinite(requiredPoints) || requiredPoints <= 0) return res.status(400).json({ message: 'نام جایزه و امتیاز معتبر الزامی است' });
  const { rows } = await pool.query('INSERT INTO reward_tiers(name,description,image_url,required_points,reward_type,reward_value,display_order,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', [r.name,r.description,r.imageUrl,requiredPoints,r.rewardType,r.rewardValue,r.displayOrder||0,r.isActive!==false]);
  await audit(req.admin.id,'create_reward','reward_tiers',rows[0].id,null,r); res.json(rows[0]);
}));
app.patch('/api/admin/rewards/:id', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const r = req.body;
  const { rows } = await pool.query('UPDATE reward_tiers SET name=COALESCE($1,name),description=COALESCE($2,description),image_url=COALESCE($3,image_url),required_points=COALESCE($4,required_points),reward_type=COALESCE($5,reward_type),reward_value=COALESCE($6,reward_value),display_order=COALESCE($7,display_order),is_active=COALESCE($8,is_active),updated_at=NOW() WHERE id=$9 RETURNING *', [r.name,r.description,r.imageUrl,r.requiredPoints,r.rewardType,r.rewardValue,r.displayOrder,r.isActive,req.params.id]);
  await audit(req.admin.id,'update_reward','reward_tiers',req.params.id,null,r); res.json(rows[0]);
}));
app.get('/api/admin/reward-claims', adminAuth, asyncHandler(async (req, res) => res.json((await pool.query('SELECT c.*, u.mobile, r.name AS reward_name FROM user_reward_claims c JOIN users u ON u.id=c.user_id JOIN reward_tiers r ON r.id=c.reward_tier_id ORDER BY c.claimed_at DESC')).rows)));
app.patch('/api/admin/reward-claims/:id', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const { status, adminNote } = req.body;
  await pool.query('UPDATE user_reward_claims SET status=$1, admin_note=$2, updated_at=NOW() WHERE id=$3', [status, adminNote, req.params.id]);
  await audit(req.admin.id,'update_reward_claim','user_reward_claims',req.params.id,adminNote,{status}); res.json({ message: 'به‌روزرسانی شد' });
}));

app.get('/api/admin/league', adminAuth, asyncHandler(async (req, res) => res.json(await getLeaderboard(100))));
app.patch('/api/admin/league/current/prizes', adminAuth, requireRole(), asyncHandler(async (req, res) => {
  const season = await ensureActiveSeason();
  await pool.query('UPDATE league_seasons SET prize_table=$1, updated_at=NOW() WHERE id=$2', [JSON.stringify(req.body.prizeTable || []), season.id]);
  await audit(req.admin.id,'update_league_prizes','league_seasons',season.id,null,req.body); res.json({ message: 'جدول جوایز لیگ ذخیره شد' });
}));
app.post('/api/admin/league/close', adminAuth, requireRole(), asyncHandler(async (req, res) => res.json(await closeActiveSeason())));
app.get('/api/admin/league/payouts', adminAuth, asyncHandler(async (req, res) => res.json((await pool.query('SELECT p.*, u.mobile FROM league_payouts p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC')).rows)));
app.patch('/api/admin/league/payouts/:id', adminAuth, requireRole('support'), asyncHandler(async (req, res) => { await pool.query('UPDATE league_payouts SET payment_status=$1, paid_at=CASE WHEN $1=\'paid\' THEN NOW() ELSE paid_at END WHERE id=$2', [req.body.status, req.params.id]); res.json({message:'ثبت شد'}); }));

app.get('/api/admin/users', adminAuth, asyncHandler(async (req, res) => {
  const search = `%${req.query.search || ''}%`;
  res.json((await pool.query('SELECT id,mobile,first_name,last_name,nickname,age,city,province,bank_account,profile_image_url,profile_avatar_key,current_points,lifetime_points,monthly_league_points,status,joined_at FROM users WHERE mobile ILIKE $1 OR nickname ILIKE $1 ORDER BY joined_at DESC LIMIT 300', [search])).rows);
}));
app.get('/api/admin/users/:id', adminAuth, asyncHandler(async (req, res) => {
  const user = await pool.query('SELECT * FROM users WHERE id=$1', [req.params.id]);
  const codes = await pool.query('SELECT c.code,c.used_at,t.name,t.point_value FROM card_codes c JOIN card_types t ON t.id=c.card_type_id WHERE c.used_by_user_id=$1 ORDER BY c.used_at DESC LIMIT 100', [req.params.id]);
  res.json({ user: safeUser(user.rows[0]), codes: codes.rows });
}));
app.patch('/api/admin/users/:id/status', adminAuth, requireRole('support'), asyncHandler(async (req, res) => { await pool.query('UPDATE users SET status=$1 WHERE id=$2', [req.body.status, req.params.id]); await audit(req.admin.id,'update_user_status','users',req.params.id,req.body.reason,{status:req.body.status}); res.json({message:'ثبت شد'}); }));
app.post('/api/admin/users/:id/points', adminAuth, requireRole(), asyncHandler(async (req, res) => { const p=Number(req.body.points||0); await pool.query('UPDATE users SET current_points=GREATEST(0,current_points+$1), lifetime_points=GREATEST(0,lifetime_points+$1), monthly_league_points=GREATEST(0,monthly_league_points+$1) WHERE id=$2', [p, req.params.id]); await audit(req.admin.id,'manual_points','users',req.params.id,req.body.reason,{points:p}); res.json({message:'امتیاز تغییر کرد'}); }));

app.get('/api/admin/chat/messages', adminAuth, asyncHandler(async (req, res) => res.json((await pool.query('SELECT m.*, u.mobile,u.nickname FROM chat_messages m JOIN users u ON u.id=m.user_id ORDER BY m.sent_at DESC LIMIT 300')).rows)));
app.patch('/api/admin/chat/messages/:id/delete', adminAuth, requireRole('support'), asyncHandler(async (req, res) => { await pool.query('UPDATE chat_messages SET is_deleted=true WHERE id=$1', [req.params.id]); await audit(req.admin.id,'delete_chat_message','chat_messages',req.params.id,req.body.reason); res.json({message:'حذف شد'}); }));
app.patch('/api/admin/chat/users/:id/ban', adminAuth, requireRole('support'), asyncHandler(async (req, res) => { await pool.query("UPDATE users SET chat_banned_until=NOW()+($1::text||' minutes')::interval WHERE id=$2", [req.body.minutes||1440, req.params.id]); await audit(req.admin.id,'ban_chat_user','users',req.params.id,req.body.reason,{minutes:req.body.minutes}); res.json({message:'کاربر از چت محروم شد'}); }));

app.get('/api/admin/support/tickets', adminAuth, requireRole('support','observer'), asyncHandler(async (req, res) => res.json((await pool.query('SELECT t.*, u.mobile FROM support_tickets t JOIN users u ON u.id=t.user_id ORDER BY t.updated_at DESC')).rows)));
app.get('/api/admin/support/tickets/:id/messages', adminAuth, requireRole('support','observer'), asyncHandler(async (req, res) => res.json((await pool.query('SELECT * FROM support_ticket_messages WHERE ticket_id=$1 ORDER BY created_at', [req.params.id])).rows)));
app.post('/api/admin/support/tickets/:id/messages', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  await pool.query("INSERT INTO support_ticket_messages(ticket_id,sender_type,sender_admin_id,message_text) VALUES($1,'admin',$2,$3)", [req.params.id, req.admin.id, req.body.message]);
  const ticket = await pool.query("UPDATE support_tickets SET status='answered', updated_at=NOW() WHERE id=$1 RETURNING user_id", [req.params.id]);
  if (ticket.rows[0]) await createNotification(ticket.rows[0].user_id, 'support_answer', 'پاسخ پشتیبانی', 'تیکت شما پاسخ داده شد.');
  res.json({ message: 'پاسخ ارسال شد' });
}));

app.post('/api/admin/notifications/broadcast', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const { title, body } = req.body;
  await createNotification(null, 'broadcast', title, body);
  await audit(req.admin.id,'broadcast_notification','notifications',null,null,{title});
  res.json({ message: 'اطلاعیه همگانی ثبت شد' });
}));
app.get('/api/admin/admins', adminAuth, requireRole(), asyncHandler(async (req, res) => res.json((await pool.query('SELECT id,username,role,is_active,created_at FROM admin_users ORDER BY created_at DESC')).rows)));
app.post('/api/admin/admins', adminAuth, requireRole(), asyncHandler(async (req, res) => { const hash=await bcrypt.hash(req.body.password,12); const r=await pool.query('INSERT INTO admin_users(username,password_hash,role) VALUES($1,$2,$3) RETURNING id,username,role,is_active,created_at',[req.body.username,hash,req.body.role]); await audit(req.admin.id,'create_admin','admin_users',r.rows[0].id,null,{username:req.body.username,role:req.body.role}); res.json(r.rows[0]); }));
app.get('/api/admin/audit-log', adminAuth, requireRole(), asyncHandler(async (req, res) => res.json((await pool.query('SELECT a.*, ad.username FROM audit_log a LEFT JOIN admin_users ad ON ad.id=a.admin_user_id ORDER BY a.created_at DESC LIMIT 500')).rows)));

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== 'user') throw new Error('bad token');
    const { rows } = await pool.query('SELECT id,nickname,first_name,last_name,profile_image_url,profile_avatar_key,chat_banned_until,status,lifetime_points,current_points FROM users WHERE id=$1', [payload.sub]);
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
      if (messageType === 'text' && (!clean || clean.length > 1000)) throw new Error('متن پیام معتبر نیست');
      if (clean) await assertNoBadWords(clean);
      arr.push(now); socketMessageTimes.set(socket.user.id, arr);
      const { rows } = await pool.query('INSERT INTO chat_messages(user_id,message_text,reply_to_message_id,sticker_id,message_type) VALUES($1,$2,$3,$4,$5) RETURNING *', [socket.user.id, clean, replyTo, stickerId, messageType]);
      const msg = { ...rows[0], nickname: socket.user.nickname, first_name: socket.user.first_name, last_name: socket.user.last_name, profile_image_url: socket.user.profile_image_url, profile_avatar_key: socket.user.profile_avatar_key, like_count: 0 };
      io.emit('chat:new', msg); cb && cb({ ok: true, message: msg });
    } catch(e){ cb && cb({ ok: false, error: e.message }); }
  });
});

cron.schedule('5 0 1 * *', () => closeActiveSeason().catch(e => console.error('monthly close failed', e)));

app.use((err, req, res, next) => { console.error(err); res.status(err.status || 500).json({ message: err.message || 'خطای سرور' }); });

const port = process.env.PORT || 4000;
server.listen(port, async () => { await ensureActiveSeason(); console.log(`GhelGheli API on :${port}`); });
