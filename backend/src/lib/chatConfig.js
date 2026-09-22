// ─────────────────────────────────────────────────────────────────────
// تنظیمات و محتوای چت: cooldown، پیامِ سنجاق‌شده، پالایهٔ بدکلامی، استیکرها، پاسخ‌های آماده —
// بیرون آمده از server.js (گامِ پایانیِ ماژولار شدن، مهر ۱۴۰۵). بدنهٔ تعریف‌ها
// مو به مو همان است؛ وابستگی‌ها تزریق می‌شوند و server.js همان نام‌ها را
// در همان جای قبلی destruct می‌کند تا هیچ ارجاعِ پایین‌دستی تغییر نکند.
// ─────────────────────────────────────────────────────────────────────
const url = require('url');

module.exports = ({
  UUID_RE, opsConfig, pool, shop,
}) => {
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

  return {
  getChatMinLifetimePoints, getChatCooldownSeconds, getLeagueWinnerCount, ensureChatCooldown,
  keepImage, cashAmountInput, maskSecret, normalizeChatText,
  PIN_ACCENTS, getChatPinnedMessage, getChatBadWords, assertNoBadWords,
  isAllowedChatMessage, DEFAULT_CANNED_MESSAGES, activeStickers, activeStickerById,
  cannedMessages,
  };
};
