/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  رمزگذاریِ فیلدهای مالی (شمارهٔ کارت، شبا، حسابِ قدیمی)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── چرا این ماژول وجود دارد ───────────────────────────────────────────────
 *
 * این فیلدها تا امروز **متنِ ساده** در دیتابیس بودند: کسی که یک نسخهٔ
 * پشتیبان یا یک `pg_dump` قدیمی به دست می‌آورد، شمارهٔ کارت و شبای همهٔ
 * کاربران را یک‌جا داشت — و با آن می‌توان کارت به کارت کرد.
 *
 * ── الگوریتم ──────────────────────────────────────────────────────────────
 *
 * AES-256-GCM (رمزنگاریِ تأییدشده). GCM هم محرمانگی می‌دهد و هم یکپارچگی:
 * اگر کسی یک بایت از مقدارِ رمزشده را عوض کند، بازکردن **خطا می‌دهد** و
 * ما هیچ‌وقت یک شمارهٔ کارتِ دست‌کاری‌شده را به‌عنوان واقعی تحویل نمی‌دهیم.
 *
 * قالبِ ذخیره‌سازی (خودتوصیف، برای مهاجرت‌های آینده):
 *
 *     enc:v1:<base64( iv[12] | tag[16] | ciphertext )>
 *
 * ── کلید ──────────────────────────────────────────────────────────────────
 *
 *   FIELD_ENCRYPTION_KEY       کلیدِ اصلی (۳۲ بایت: ۶۴ رقم هگز یا base64)
 *   FIELD_ENCRYPTION_KEY_OLD   کلیدِ قدیمی، **فقط برای بازکردن** (چرخشِ کلید)
 *
 * کجا ذخیره شود: در `.env` سرور با دسترسی ۶۰۰ (فایلِ ریشه، مالک ghelgheli)
 * — نه در گیت. اگر کلید گم شود، مقدارهای رمزشده دیگر باز نمی‌شوند، پس
 * کلید باید در پشتیبانِ جداگانه هم باشد. این محدودیت ذاتیِ هر رمزگذاری است.
 *
 * ── سازگاریِ عقب‌رو (چرا این‌جا کدِ خرابکاری نمی‌کند) ─────────────────────
 *
 * مقدارهای قدیمیِ متنِ ساده **بدون پیشوند** ذخیره شده‌اند. پس:
 *   • `decrypt` هر مقداری که پیشوند ندارد را همان‌طور برمی‌گرداند
 *     ⇒ قبل از اجرای مایگریشنِ داده، خواندن‌ها سالم می‌مانند.
 *   • `encrypt` مقدارِ رمزشدهٔ قبلی را دوباره رمز نمی‌کند
 *     ⇒ اجرای دوبارهٔ ابزارِ مهاجرت بی‌خطر است.
 *
 * ── اگر کلید تنظیم نشده باشد ──────────────────────────────────────────────
 *
 * در محیطِ توسعه/آزمون (بدونِ کلید) مقدارها مثلِ قبل متنِ ساده ذخیره
 * می‌شوند تا تست‌ها و اجرای محلی نشکنند — ولی هر بار یک هشدارِ صریح در لاگ
 * می‌آید و `/health` وضعیت را `fieldCrypto.enabled=false` نشان می‌دهد.
 * روی سرورِ تولید کلید تنظیم شده است.
 */
const crypto = require('crypto');

const ENC_PREFIX = 'enc:v1:';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

/// آمارِ ساده برای `/health` — تا بشود بدونِ حدس گفت رمزگذاری کار می‌کند.
const stats = { encryptions: 0, decryptions: 0, failures: 0, passthroughWrites: 0 };
const warned = new Set();
function warnOnce(key, message) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[fieldCrypto] ${message}`);
}

/** کلید را از چند قالبِ رایج می‌خواند: هگز ۶۴، base64، یا متنِ خامِ ۳۲ بایتی. */
function parseKey(raw, envName) {
  const s = String(raw || '').trim();
  if (!s) return null;
  let buf = null;
  if (/^[0-9a-fA-F]{64}$/.test(s)) buf = Buffer.from(s, 'hex');
  else {
    try {
      const b = Buffer.from(s, 'base64');
      if (b.length === KEY_LEN) buf = b;
    } catch { /* قالبِ نامعتبر */ }
  }
  if (!buf && Buffer.byteLength(s, 'utf8') === KEY_LEN) buf = Buffer.from(s, 'utf8');
  if (!buf) {
    warnOnce(`bad-key:${envName}`,
      `مقدارِ ${envName} نامعتبر است (باید ۳۲ بایت باشد: ۶۴ رقم هگز یا base64). نادیده گرفته شد.`);
    return null;
  }
  if (buf.length !== KEY_LEN) {
    warnOnce(`bad-len:${envName}`, `${envName} باید دقیقاً ۳۲ بایت باشد؛ فعلاً ${buf.length} بایت است.`);
    return null;
  }
  return buf;
}

let cached = null;
/// کلیدها یک بار خوانده و کش می‌شوند (چرخشِ کلید یعنی ری‌استارتِ سرویس).
function keys() {
  if (cached) return cached;
  const primary = parseKey(process.env.FIELD_ENCRYPTION_KEY, 'FIELD_ENCRYPTION_KEY');
  const old = parseKey(process.env.FIELD_ENCRYPTION_KEY_OLD, 'FIELD_ENCRYPTION_KEY_OLD');
  cached = { primary, old };
  if (!primary) {
    warnOnce('no-key',
      'FIELD_ENCRYPTION_KEY تنظیم نشده — شمارهٔ کارت/شبا به‌صورت متنِ ساده ذخیره می‌شود. '
      + 'روی سرورِ تولید این کلید باید در .env باشد.');
  }
  return cached;
}

/** برای تست‌ها: کشِ کلید را پاک می‌کند تا تغییرِ env دیده شود. */
function resetKeyCache() { cached = null; warned.clear(); }

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

/** اثرِ انگشتِ کلید (۸ کاراکتر اول sha256) — برای لاگ و مقایسه، نه بازسازی. */
function keyFingerprint() {
  const { primary } = keys();
  if (!primary) return null;
  return crypto.createHash('sha256').update(primary).digest('hex').slice(0, 8);
}

/**
 * رمزگذاریِ یک مقدار.
 *
 * @param {string|null|undefined} plain
 * @returns {string|null|undefined} مقدارِ رمزشده، یا ورودیِ خالی/نامعتبر
 */
function encrypt(plain) {
  if (plain === null || plain === undefined) return plain;
  const s = String(plain);
  if (!s) return s;
  if (isEncrypted(s)) return s; // اجرای دوبارهٔ مهاجرت، بی‌خطر است
  const { primary } = keys();
  if (!primary) {
    stats.passthroughWrites++;
    return s;
  }
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', primary, iv);
  const ct = Buffer.concat([cipher.update(s, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  stats.encryptions++;
  return ENC_PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

/**
 * بازکردنِ یک مقدار.
 *
 * • مقدارِ بدونِ پیشوند = متنِ سادهٔ قدیمی ⇒ همان‌طور برگردانده می‌شود.
 * • بازکردنِ ناموفق (کلیدِ اشتباه یا دست‌کاریِ داده) ⇒ `null` + لاگ.
 *   عمداً `null` و نه متنِ رمزشده: نشان دادنِ رشتهٔ `enc:v1:...` در پنل
 *   مدیر یعنی مدیر فکر کند کارتِ کاربر خراب است؛ `null` صریح‌تر است و
 *   هیچ‌وقت دادهٔ نامعتبر به‌عنوان واقعی به جایی نمی‌رود.
 */
function decrypt(value) {
  if (value === null || value === undefined) return value;
  const s = String(value);
  if (!isEncrypted(s)) return s; // سازگاریِ عقب‌رو

  const payload = Buffer.from(s.slice(ENC_PREFIX.length), 'base64');
  if (payload.length < IV_LEN + TAG_LEN + 1) {
    stats.failures++;
    warnOnce('short', 'یک مقدارِ رمزشده کوتاه‌تر از حدِ ممکن بود؛ نادیده گرفته شد.');
    return null;
  }
  const iv = payload.subarray(0, IV_LEN);
  const tag = payload.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = payload.subarray(IV_LEN + TAG_LEN);

  const { primary, old } = keys();
  for (const [which, key] of [['primary', primary], ['old', old]]) {
    if (!key) continue;
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
      d.setAuthTag(tag);
      const out = Buffer.concat([d.update(ct), d.final()]).toString('utf8');
      stats.decryptions++;
      return out;
    } catch { /* با این کلید باز نشد؛ کلیدِ بعدی */ }
  }
  stats.failures++;
  warnOnce('decrypt-failed',
    'بازکردنِ یک مقدارِ رمزشده ناموفق بود (کلیدِ اشتباه یا دادهٔ دست‌کاری‌شده). '
    + `اثرِ انگشتِ کلیدِ فعلی: ${keyFingerprint() || '—'}`);
  return null;
}

/** وضعیت، برای لاگِ راه‌اندازی و `/health`. */
function status() {
  const { primary, old } = keys();
  return {
    enabled: Boolean(primary),
    keyFingerprint: keyFingerprint(),
    previousKeyAvailable: Boolean(old),
    ...stats,
  };
}

/** کلیدِ تازه برای گذاشتن در `.env` (۶۴ رقم هگز). */
function generateKey() {
  return crypto.randomBytes(KEY_LEN).toString('hex');
}

/** ماسکِ کارت — برای نمایش به کاربر. فقط ۴ رقم اول و آخر. */
function maskedCard(value) {
  const s = String(decrypt(value) || '').replace(/\D/g, '');
  if (s.length !== 16) return null;
  return `${s.slice(0, 4)}-••••-••••-${s.slice(-4)}`;
}

/** ماسکِ شبا: شش کاراکتر اول و چهار رقم آخر. */
function maskedSheba(value) {
  const s = String(decrypt(value) || '');
  if (s.length < 12) return null;
  return `${s.slice(0, 6)}••••${s.slice(-4)}`;
}

module.exports = {
  ENC_PREFIX,
  encrypt,
  decrypt,
  isEncrypted,
  status,
  stats,
  generateKey,
  keyFingerprint,
  maskedCard,
  maskedSheba,
  resetKeyCache,
};
