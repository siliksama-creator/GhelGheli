// ─────────────────────────────────────────────────────────────────────
// تنظیماتِ پنل: چت، پیامِ سنجاق‌شده، بازی‌ها، پیامک، پالایهٔ نام — بیرون آمده از server.js (بندِ ۱ ممیزی).
// ─────────────────────────────────────────────────────────────────────
const express = require('express');

module.exports = ({
  pool, adminAuth, requireRole, asyncHandler,
  audit, io, getChatBadWords, getChatCooldownSeconds,
  getChatMinLifetimePoints, getChatPinnedMessage, getGameRewardSettings, saveGameRewardSettings,
  maskSecret, PIN_ACCENTS,
}) => {
  const router = express.Router();

router.get('/admin/settings/chat', adminAuth, asyncHandler(async (req, res) => {
  const minLifetimePoints = await getChatMinLifetimePoints();
  const messageCooldownSeconds = await getChatCooldownSeconds();
  const badWords = await getChatBadWords();
  res.json({ minLifetimePoints, messageCooldownSeconds, badWords });
}));

router.patch('/admin/settings/chat', adminAuth, requireRole(), asyncHandler(async (req, res) => {
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

router.get('/admin/chat/pinned', adminAuth, asyncHandler(async (req, res) => {
  res.json(await getChatPinnedMessage());
}));

router.patch('/admin/chat/pinned', adminAuth, requireRole('support'), asyncHandler(async (req, res) => {
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
  io.to('chat:public').emit('chat:pinned', value);
  res.json({ message: active ? 'پیام سنجاق شد' : 'سنجاق برداشته شد', ...value });
}));

// ── Game reward settings (online human-vs-human matches only) ──
router.get('/admin/settings/games', adminAuth, asyncHandler(async (req, res) => {
  res.json(await getGameRewardSettings());
}));

router.patch('/admin/settings/games', adminAuth, requireRole(), asyncHandler(async (req, res) => {
  const value = await saveGameRewardSettings(req.body || {}, req.admin.id);
  await audit(req.admin.id, 'update_game_rewards', 'app_settings', null, req.body.reason || null, value);
  res.json({ message: 'تنظیمات امتیاز بازی‌ها ذخیره شد', ...value });
}));

router.get('/admin/settings/sms', adminAuth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query("SELECT value FROM app_settings WHERE key='sms_config' LIMIT 1");
  const cfg = rows[0]?.value || {};
  res.json({ ...cfg, apiKey: undefined, apiKeyMasked: maskSecret(cfg.apiKey) });
}));

router.patch('/admin/settings/sms', adminAuth, requireRole(), asyncHandler(async (req, res) => {
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

// ── فیلترِ نامِ مستعار (فهرستِ رکیکِ پنل) ──────────────────────────────────
// دو فیلدِ جدا (فارسی / انگلیسی) که کلمات با فاصله (Space) جدا می‌شوند +
// کلیدِ روشن/خاموش. کلمات اینجا «اضافه» می‌شوند به فهرستِ داخلیِ
// nicknamePolicy؛ کشِ هر پروسه ۶۰ ثانیه است.
router.get('/admin/settings/nickname-filter', adminAuth, asyncHandler(async (req, res) => {
  const { rows } = await pool.query("SELECT value FROM app_settings WHERE key='nickname_filter' LIMIT 1");
  const v = rows[0]?.value || {};
  res.json({ enabled: v.enabled !== false, fa: v.fa || '', en: v.en || '' });
}));

router.patch('/admin/settings/nickname-filter', adminAuth, requireRole(), asyncHandler(async (req, res) => {
  const body = req.body || {};
  const clean = v => String(v || '').split(/\s+/).filter(Boolean).join(' ');
  const cfg = {
    enabled: body.enabled !== false,
    fa: clean(body.fa),
    en: clean(body.en),
  };
  await pool.query(`INSERT INTO app_settings(key,value,updated_by_admin_id,updated_at) VALUES('nickname_filter',$1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value, updated_by_admin_id=EXCLUDED.updated_by_admin_id, updated_at=NOW()`, [JSON.stringify(cfg), req.admin.id]);
  await audit(req.admin.id, 'update_nickname_filter', 'app_settings', null, null, cfg);
  require('../lib/nicknamePolicy').loadFilter(true).catch(() => {});
  res.json({ message: 'فیلتر نام مستعار ذخیره شد', ...cfg });
}));

  return router;
};
