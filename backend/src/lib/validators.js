// ─────────────────────────────────────────────────────────────────────
// اعتبارسنجی و سریال‌سازی: safeUser، validateUuid، boundedText، intInRange، آواتار و تصویر —
// بیرون آمده از server.js (گامِ پایانیِ ماژولار شدن، مهر ۱۴۰۵). بدنهٔ تعریف‌ها
// مو به مو همان است؛ وابستگی‌ها تزریق می‌شوند و server.js همان نام‌ها را
// در همان جای قبلی destruct می‌کند تا هیچ ارجاعِ پایین‌دستی تغییر نکند.
// ─────────────────────────────────────────────────────────────────────
module.exports = ({
  UUID_RE, avatarKeys, fieldCrypto, walletService,
}) => {
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

  return {
  safeUser, validateUuid, intInRange, boundedText,
  AVATAR_KEYS, CLUB_AVATAR_RE, safeAvatarKey, safeImageUrl,
  };
};
