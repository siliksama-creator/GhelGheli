require('dotenv').config();
const express = require('express');
const http = require('http');
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
app.use('/docs', swaggerUi.serve, swaggerUi.setup(YAML.load(__dirname + '/../docs/openapi.yaml')));

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const signUser = user => jwt.sign({ sub: user.id, type: 'user' }, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '30d' });
const signAdmin = admin => jwt.sign({ sub: admin.id, type: 'admin', role: admin.role }, JWT_SECRET, { expiresIn: '12h' });
function normalizeMobile(m) { return String(m || '').replace(/\s+/g, '').trim(); }
function validateCodeFormat(code) { return /^[A-Za-z0-9_-]{8,128}$/.test(String(code || '').trim()); }
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
  const code = String(req.body.code || '').trim();
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
  const { firstName, lastName, nickname, profileImageUrl, bankAccount, fcmToken } = req.body;
  const { rows } = await pool.query(`UPDATE users SET first_name=COALESCE($1,first_name), last_name=COALESCE($2,last_name), nickname=COALESCE($3,nickname), profile_image_url=COALESCE($4,profile_image_url), bank_account=COALESCE($5,bank_account), fcm_token=COALESCE($6,fcm_token), updated_at=NOW() WHERE id=$7 RETURNING *`, [firstName,lastName,nickname,profileImageUrl,bankAccount,fcmToken,req.user.id]);
  res.json({ user: safeUser(rows[0]) });
}));
app.get('/api/users/:id/public', auth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT id,nickname,first_name,last_name,profile_image_url,lifetime_points,current_points,monthly_league_points,joined_at FROM users WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ message: 'کاربر پیدا نشد' });
  res.json(rows[0]);
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

app.get('/api/chat/messages', auth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(`SELECT m.*, u.nickname,u.first_name,u.last_name,u.profile_image_url FROM chat_messages m JOIN users u ON u.id=m.user_id WHERE m.is_deleted=false ORDER BY m.sent_at DESC LIMIT 100`);
  res.json(rows.reverse());
}));
app.post('/api/chat/messages/:id/report', auth, asyncHandler(async (req, res) => {
  await pool.query('UPDATE chat_messages SET is_reported=true, report_count=report_count+1 WHERE id=$1', [req.params.id]);
  res.json({ message: 'گزارش ثبت شد' });
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
  if (!validateCodeFormat(code)) return res.status(400).json({ message: 'فرمت کد معتبر نیست' });
  const { rows } = await pool.query('INSERT INTO card_codes(code,card_type_id) VALUES($1,$2) RETURNING *', [code.trim(), cardTypeId]);
  await audit(req.admin.id, 'create_card_code', 'card_codes', rows[0].id, null, { code: code.slice(0,4)+'...' }); res.json(rows[0]);
}));
app.post('/api/admin/card-codes/bulk', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
  const { cardTypeId, rawCodes = '' } = req.body;
  const input = String(rawCodes).split(/[\n,;\t ]+/).map(c => c.trim()).filter(Boolean);
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
  const { rows } = await pool.query('INSERT INTO reward_tiers(name,description,image_url,required_points,reward_type,reward_value,display_order,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *', [r.name,r.description,r.imageUrl,r.requiredPoints,r.rewardType,r.rewardValue,r.displayOrder||0,r.isActive!==false]);
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
  res.json((await pool.query('SELECT id,mobile,first_name,last_name,nickname,current_points,lifetime_points,monthly_league_points,status,joined_at FROM users WHERE mobile ILIKE $1 OR nickname ILIKE $1 ORDER BY joined_at DESC LIMIT 300', [search])).rows);
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
    const { rows } = await pool.query('SELECT id,nickname,first_name,last_name,profile_image_url,chat_banned_until,status FROM users WHERE id=$1', [payload.sub]);
    if (!rows[0] || rows[0].status !== 'active') throw new Error('inactive');
    socket.user = rows[0]; next();
  } catch(e){ next(new Error('unauthorized')); }
});
const socketMessageTimes = new Map();
io.on('connection', socket => {
  socket.on('chat:send', async (text, cb) => {
    try {
      const now = Date.now();
      const arr = (socketMessageTimes.get(socket.user.id) || []).filter(t => now - t < 60_000);
      if (arr.length >= 20) throw new Error('ضد اسپم: تعداد پیام زیاد است');
      if (socket.user.chat_banned_until && new Date(socket.user.chat_banned_until) > new Date()) throw new Error('شما موقتاً از چت محروم هستید');
      const clean = String(text || '').trim();
      if (!clean || clean.length > 1000) throw new Error('متن پیام معتبر نیست');
      arr.push(now); socketMessageTimes.set(socket.user.id, arr);
      const { rows } = await pool.query('INSERT INTO chat_messages(user_id,message_text) VALUES($1,$2) RETURNING *', [socket.user.id, clean]);
      const msg = { ...rows[0], nickname: socket.user.nickname, first_name: socket.user.first_name, last_name: socket.user.last_name, profile_image_url: socket.user.profile_image_url };
      io.emit('chat:new', msg); cb && cb({ ok: true, message: msg });
    } catch(e){ cb && cb({ ok: false, error: e.message }); }
  });
});

cron.schedule('5 0 1 * *', () => closeActiveSeason().catch(e => console.error('monthly close failed', e)));

app.use((err, req, res, next) => { console.error(err); res.status(err.status || 500).json({ message: err.message || 'خطای سرور' }); });

const port = process.env.PORT || 4000;
server.listen(port, async () => { await ensureActiveSeason(); console.log(`GhelGheli API on :${port}`); });
