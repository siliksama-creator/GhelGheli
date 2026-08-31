/**
 * سرویس پیامک واقعی — ارسال OTP از طریق درگاه پیکربندی‌شده در پنل ادمین.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این فایل تا امروز وجود نداشت
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * فرمِ تنظیمات پیامک در پنل ادمین (apiKey/sender/pattern) مقدارش را در
 * `app_settings` ذخیره می‌کرد ولی هیچ کدی آن را نمی‌خواند — یعنی حتی اگر
 * مالک کلید پیامک می‌خرید، OTP هرگز ارسال نمی‌شد. این سرویس همان حلقهٔ
 * گمشده است: `request-otp` بعد از ساختن کد، از اینجا می‌گذرد.
 *
 * حالت‌های کار:
 *   ۱. `enabled=false` → مثل امروز: کد ساخته و ذخیره می‌شود ولی ارسال
 *      نمی‌شود (OTP_DEV_MODE کد را در پاسخ/لاگ نشان می‌دهد).
 *   ۲. `enabled=true` و `testMode=true` → ارسال واقعی انجام می‌شود ولی
 *      خطای درگاه مسیر ورود را نمی‌شکند (برای تستِ شمارهٔ خودت).
 *   ۳. `enabled=true` و `testMode=false` → ارسالِ ناموفق یعنی ورود باید
 *      متوقف شود؛ کاربرِ واقعی بدون کد نمی‌تواند کاری بکند.
 *
 * درگاه‌ها:
 *   - `kavenegar`  → API تأیید پیامکی (verify lookup) با الگو (pattern).
 *   - `custom`     → هر سرویس REST دیگری؛ نشانی پایه + روش ارسال در config
 *                    می‌آید (پیش‌فرض POST با JSON به صورت «الگو»).
 */
const { pool } = require('../config/db');

function maskSecret(value) {
  const s = String(value || '');
  if (!s) return '';
  return s.length <= 6 ? '****' : `${s.slice(0, 2)}****${s.slice(-2)}`;
}

async function getConfig() {
  const { rows } = await pool.query(
    "SELECT value FROM app_settings WHERE key='sms_config' LIMIT 1");
  const v = rows[0]?.value || {};
  return {
    provider: v.provider || '',
    sender: v.sender || '',
    apiKey: v.apiKey || '',
    patternCode: v.patternCode || '',
    baseUrl: v.baseUrl || '',
    enabled: Boolean(v.enabled),
    testMode: v.testMode !== undefined ? Boolean(v.testMode) : true,
  };
}

async function postForm(url, form) {
  const body = new URLSearchParams(form).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text: String(text).slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

async function postJson(url, payload, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text: String(text).slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ارسال کد تایید.
 * @returns {{sent: boolean, reason?: string, provider?: string}}
 * `sent=false` با `reason='disabled'|'test'|'not_configured'` یعنی مسیر
 * عمداً/موقتاً خاموش است (طبیعی، نه خطا). `sent=false` با `reason='failed'`
 * یعنی درگاه واقعاً تلاش شد و ناموفق بود.
 */
async function sendOtp(mobile, code, purpose = 'register') {
  const cfg = await getConfig();
  if (!cfg.enabled) return { sent: false, reason: 'disabled' };
  if (!cfg.apiKey) return { sent: false, reason: 'not_configured' };

  const cleanMobile = String(mobile).replace(/^\+/, '');
  const provider = cfg.provider || 'kavenegar';

  try {
    let result;
    if (provider === 'kavenegar') {
      const url = `https://api.kavenegar.com/v1/${encodeURIComponent(cfg.apiKey)}/verify/lookup.json`;
      result = await postForm(url, {
        receptor: cleanMobile,
        token: code,
        template: cfg.patternCode || 'ghelgheli-otp',
        type: 'sms',
      });
    } else {
      const base = (cfg.baseUrl || '').replace(/\/+$/, '');
      if (!base) return { sent: false, reason: 'not_configured' };
      result = await postJson(`${base}/send`, {
        mobile: cleanMobile,
        code,
        purpose,
        sender: cfg.sender,
        patternCode: cfg.patternCode,
      }, cfg.sender ? { Authorization: cfg.sender } : {});
    }

    if (result.ok) {
      return { sent: true, provider };
    }
    console.error(`[sms] ارسال به ${cleanMobile} ناموفق بود (${provider} ${result.status}): ${result.text}`);
    if (cfg.testMode) return { sent: false, reason: 'test' };
    return { sent: false, reason: 'failed', provider, status: result.status };
  } catch (error) {
    console.error(`[sms] خطای درگاه ${provider}:`, error.message);
    if (cfg.testMode) return { sent: false, reason: 'test' };
    return { sent: false, reason: 'failed', provider, status: 'network' };
  }
}

module.exports = { sendOtp, getConfig, maskSecret };
