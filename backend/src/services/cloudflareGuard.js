/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  سپرِ سرور (کلادفلر) — مغزِ قابلیت، جدا از HTTP و جدا از دیتابیس
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * خواستهٔ مالک (۲۶ شهریور):
 *
 *   «نمیشه کلادفلر رو تنظیم کنی تو پنل ادمین که آدرس‌های سایت رو تایید کردم،
 *    تو پنل ادمین فعال بشه و تا وقتی که حمله نشده غیرفعال بمونه؟ هم برای
 *    اپلیکیشن و هم برای نسخه وب. یعنی تنظیماتش تو پنل ادمین باشه، بعداً
 *    نیاز بود با یک ثبت و تایید من کلادفلر رو فعال کنم.»
 *
 * ── چرا این سرویس «factory» است و نه یک ماژول ساده ───────────────────────
 *
 * این ماژول سه چیزِ بیرونی دارد: ذخیره‌گاهِ تنظیمات (دیتابیس)، اینترنت
 * (API کلادفلر)، و فایلِ حالتِ سمتِ سرور. اگر مستقیم به هر سه چسبیده بود،
 * هیچ تستی بدونِ دیتابیس و بدونِ حسابِ کلادفلر ممکن نبود — و قابلیتی که
 * تست نشود، روزِ حادثه کار نمی‌کند. پس هر سه تزریق‌شدنی‌اند و تست
 * (`scripts/testCloudflarePanel.js`) یک سرورِ جعلیِ کلادفلر بالا می‌آورد.
 *
 * ── دو حالتِ کاملاً جدا که نباید قاطی شوند ───────────────────────────────
 *
 *   ۱. **سمتِ کلادفلر:** رکوردهای DNS را «نارنجی» (proxied) می‌کنیم و
 *      اختیاری حالتِ «تحتِ حمله» را روشن می‌کنیم. بدونِ این، هیچ ترافیکی از
 *      کلادفلر نمی‌گذرد.
 *   ۲. **سمتِ سرور:** به nginx یاد می‌دهیم که آی‌پیِ واقعیِ کاربر را از هدرِ
 *      `CF-Connecting-IP` بخواند. اگر این کار نشود، همهٔ کاربران از دیدِ
 *      سرور *یک* آی‌پی (لبهٔ کلادفلر) دارند و سقفِ «۳۰ درخواست در ثانیه»
 *      که ساخته‌ایم، همهٔ کاربرانِ واقعی را پشتِ سر هم می‌بندد.
 *
 * حالتِ دوم دستِ root می‌خواهد (ویرایشِ کانفیگِ nginx)، ولی این سرویس با
 * کاربرِ معمولی اجرا می‌شود. راهِ حل: این سرویس فقط **درخواست** را در یک
 * فایل می‌نویسد و یک نگهبانِ root (`scripts/cloudflare-mode-apply.sh` با
 * systemd timer) آن را در ۳۰ ثانیه اعمال می‌کند. هیچ sudo و هیچ رمزی بینِ
 * این دو رد و بدل نمی‌شود؛ فقط یک فایلِ دو کلمه‌ای («on» یا «off»).
 *
 * ── قواعدِ امنیتی که در کد رعایت شده ─────────────────────────────────────
 *
 *   • توکنِ کلادفلر در دیتابیس **رمزنگاری‌شده** می‌نشیند (همان `fieldCrypto`
 *     که کارتِ بانکی و شبا با آن رمز می‌شوند) و هرگز در پاسخِ API برنمی‌گردد.
 *   • روشن‌کردن نیاز به تأییدِ صریح دارد (`confirm`)، و فقط پس از «تأییدِ
 *     دامنه‌ها» ممکن است — تا با یک کلیکِ اشتباهی سپر بالا نیاید.
 *   • آدرسِ API کلادفلر قابلِ تغییر است (`CF_API_BASE`) تا تست بتواند به یک
 *     سرورِ جعلی وصل شود و هیچ تستی به حسابِ واقعیِ مالک دست نزند.
 */
const path = require('path');

const SETTINGS_KEY = 'cloudflare_guard';
const DEFAULT_API_BASE = process.env.CF_API_BASE || 'https://api.cloudflare.com/client/v4';
// فایلی که نگهبانِ root می‌خواند، و فایلی که نگهبان بعد از اعمال می‌نویسد.
const DEFAULT_MODE_FILE = process.env.CF_MODE_FILE || '/var/lib/ghelgheli/cloudflare-mode';
const DEFAULT_APPLIED_FILE = process.env.CF_APPLIED_FILE || '/var/lib/ghelgheli/cloudflare-mode.applied';
const MAX_DOMAINS = 12;

// portability-ok-begin
// ⚠️ این فهرست **دادهٔ پیش‌فرض** است، نه منطقِ کار: فقط کادرِ
//    دامنه‌های پنل را پر می‌کند و مالک می‌تواند در پنل کامل عوضش
//    کند (برای انتقال به دامنهٔ `.com`). پس هاردکد بودنش این‌جا
//    اشکالی ندارد — گاردِ دامنه همین استثنا را می‌شناسد.
const DEFAULT_DOMAINS = [
  'api.ghelghelishop.ir',
  'ghelghelishop.ir',
  'admin.ghelghelishop.ir',
  'user.ghelghelishop.ir',
  'register.ghelghelishop.ir',
  'api.ghelghelishop.com',
  'ghelghelishop.com',
  'admin.ghelghelishop.com',
  'user.ghelghelishop.com',
];
// portability-ok-end

/** پیامِ خطا با ساختارِ یکسان، تا پنل بتواند مستقیم نشانش بدهد. */
function err(message, code = 'error') {
  const e = new Error(message);
  e.code = code;
  return e;
}

/**
 * نامِ دامنه را به شکلِ متعارف در می‌آورد و اعتبارسنجی می‌کند.
 *
 * عمداً سخت‌گیر است: اگر کسی «https://api.example.com/» یا فاصله یا کاراکترِ
 * فارسی بفرستد، همان‌جا رد می‌شود. اشتباهِ رایج اینجا خطرناک است — یک دامنهٔ
 * غلط یعنی رکوردِ DNS اشتباهی نارنجی می‌شود.
 */
function normalizeDomain(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return '';
  if (s.includes('/') || s.includes(' ') || s.startsWith('http')) {
    throw err(`دامنه باید فقط نام باشد (بدونِ http و بدونِ مسیر): ${raw}`, 'bad_domain');
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) || s.startsWith('.') || s.endsWith('.') || s.includes('..')) {
    throw err(`دامنهٔ نامعتبر: ${raw}`, 'bad_domain');
  }
  return s;
}

function normalizeDomains(list) {
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const d = normalizeDomain(item);
    if (d && !out.includes(d)) out.push(d);
  }
  if (!out.length) throw err('دست‌کم یک دامنه لازم است.', 'no_domains');
  if (out.length > MAX_DOMAINS) throw err(`حداکثر ${MAX_DOMAINS} دامنه.`, 'too_many_domains');
  return out;
}

/** نامِ ناحیهٔ (zone) نامزد برای یک دامنه: «a.b.ir» → «b.ir» و «a.b.com» → «b.com». */
function zoneCandidates(domain) {
  const parts = String(domain).split('.');
  if (parts.length < 2) return [domain];
  const out = [parts.slice(-2).join('.')];
  if (parts.length > 2) out.push(parts.join('.')); // مثلاً co.uk یا زیرِ ناحیه بودن
  return out;
}

function createCloudflareGuard(deps = {}) {
  const store = deps.store;
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const crypto = deps.crypto;
  const logger = deps.logger || console;
  const fs = deps.fs || require('fs');
  const apiBase = (deps.apiBase || DEFAULT_API_BASE).replace(/\/+$/, '');
  const modeFile = deps.modeFile || DEFAULT_MODE_FILE;
  const appliedFile = deps.appliedFile || DEFAULT_APPLIED_FILE;

  if (!store) throw new Error('cloudflareGuard: store لازم است');
  if (!crypto) throw new Error('cloudflareGuard: crypto لازم است');

  // ═════════════════════════════════════════════════════════════════════════
  //  حالت (state) — خواندن/نوشتنِ تنظیمات
  // ═════════════════════════════════════════════════════════════════════════
  function defaults() {
    return {
      enabled: false,
      underAttack: false,
      domains: [...DEFAULT_DOMAINS],
      apiTokenEnc: '',
      verified: null,          // { at, zone, zoneId, domains: [{ name, recordId, type, proxied }] }
      lastAction: null,        // { at, action, adminId, underAttack }
    };
  }

  async function load() {
    const raw = await store.get(SETTINGS_KEY);
    const saved = (raw && typeof raw === 'object') ? raw : {};
    const state = { ...defaults(), ...saved };
    if (!Array.isArray(state.domains) || !state.domains.length) state.domains = [...DEFAULT_DOMAINS];
    return state;
  }

  async function save(state, adminId = null) {
    await store.set(SETTINGS_KEY, state, adminId);
    return state;
  }

  /** آنچه به پنل داده می‌شود — توکن هرگز، حتی به شکلِ ماسک‌شدهٔ کامل. */
  function publicState(state, extra = {}) {
    return {
      enabled: !!state.enabled,
      underAttack: !!state.underAttack,
      domains: state.domains,
      tokenSet: !!state.apiTokenEnc,
      verified: state.verified || null,
      lastAction: state.lastAction || null,
      maxDomains: MAX_DOMAINS,
      ...extra,
    };
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  گفت‌وگو با کلادفلر
  // ═════════════════════════════════════════════════════════════════════════
  function tokenOf(state) {
    if (!state.apiTokenEnc) throw err('اول توکنِ کلادفلر را ذخیره کن.', 'no_token');
    const token = crypto.decrypt(state.apiTokenEnc);
    if (!token) throw err('توکنِ کلادفلر قابلِ خواندن نیست (کلیدِ رمزنگاری عوض شده؟).', 'bad_token');
    return token;
  }

  async function cf(state, path_, { method = 'GET', body } = {}) {
    const token = tokenOf(state);
    let res;
    try {
      res = await fetchImpl(`${apiBase}${path_}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      // خطای شبکه جدا از خطای کلادفلر پیام می‌گیرد: مالک باید بداند مشکل
      // اینترنت/فیلترینگ است یا تنظیماتِ خودِ حساب.
      throw err(`ارتباط با کلادفلر برقرار نشد: ${e.message}`, 'network');
    }
    let json = null;
    try { json = await res.json(); } catch { /* پاسخِ غیرِ JSON */ }
    if (!res.ok || !json || json.success === false) {
      const detail = (json && Array.isArray(json.errors) && json.errors[0] && json.errors[0].message) || `HTTP ${res.status}`;
      throw err(`کلادفلر درخواست را رد کرد: ${detail}`, 'cf_error');
    }
    return json.result;
  }

  /** ناحیهٔ دامنه را پیدا می‌کند (اول کوتاه‌ترین نامزد). */
  async function findZone(state) {
    const tried = new Set();
    for (const domain of state.domains) {
      for (const cand of zoneCandidates(domain)) {
        if (tried.has(cand)) continue;
        tried.add(cand);
        const zones = await cf(state, `/zones?name=${encodeURIComponent(cand)}`);
        if (Array.isArray(zones) && zones[0]) return zones[0];
      }
    }
    return null;
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  عملیات‌ها
  // ═════════════════════════════════════════════════════════════════════════

  /** ذخیرهٔ توکن و فهرستِ دامنه‌ها. خالی‌گذاشتنِ توکن یعنی «همان قبلی بمان». */
  async function saveConfig({ apiToken, domains }, adminId = null) {
    const state = await load();
    if (domains !== undefined) {
      state.domains = normalizeDomains(domains);
      // تغییرِ دامنه‌ها یعنی تأییدِ قبلی دیگر معتبر نیست — وگرنه ممکن بود
      // با دامنه‌های نو، رکوردهای قدیمی روشن شوند.
      state.verified = null;
    }
    if (apiToken !== undefined && String(apiToken).trim()) {
      const clean = String(apiToken).trim();
      if (clean.length < 20) throw err('این توکن خیلی کوتاه است؛ توکنِ درست حدودِ ۴۰ نویسه است.', 'short_token');
      state.apiTokenEnc = crypto.encrypt(clean);
      state.verified = null; // توکنِ تازه ⇒ تأییدِ تازه لازم است
    }
    await save(state, adminId);
    logger.info?.('[cloudflare] تنظیمات ذخیره شد؛ دامنه‌ها:', state.domains.join(', '));
    return publicState(state);
  }

  /**
   * «تأییدِ دامنه‌ها» — بدونِ این، دکمهٔ روشن‌کردن کار نمی‌کند.
   *
   * چه چیزی تأیید می‌شود: خودِ ناحیه در کلادفلر وجود دارد و فعال است، و برای
   * هر دامنه‌ای که در پنل ثبت شده یک رکوردِ DNS هست. اگر ناحیه «pending»
   * باشد یعنی نیم‌سرورها هنوز نرسیده‌اند — و روشن‌کردن در آن حالت بی‌فایده
   * است (هیچ ترافیکی از کلادفلر نمی‌گذرد) ولی بدتر: مالک فکر می‌کند سپر
   * بالاست.
   */
  async function verify(adminId = null) {
    const state = await load();
    const zone = await findZone(state);
    if (!zone) {
      throw err('این دامنه در حسابِ کلادفلر پیدا نشد. اول دامنه را در کلادفلر اضافه کن.', 'no_zone');
    }
    if (zone.status !== 'active') {
      throw err(
        `دامنهٔ ${zone.name} در کلادفلر فعال نشده (وضعیت: ${zone.status}). نیم‌سرورها را در ایرنیک به مقادیرِ کلادفلر تغییر بده و تا نشستنش صبر کن.`,
        'zone_pending',
      );
    }
    const records = await cf(state, `/zones/${zone.id}/dns_records?per_page=100`);
    const found = [];
    const missing = [];
    for (const name of state.domains) {
      const rec = (records || []).find(
        r => String(r.name).toLowerCase() === name && ['A', 'AAAA', 'CNAME'].includes(r.type),
      );
      if (rec) found.push({ name, recordId: rec.id, type: rec.type, proxied: !!rec.proxied, content: rec.content });
      else missing.push(name);
    }
    state.verified = {
      at: new Date().toISOString(),
      zone: zone.name,
      zoneId: zone.id,
      domains: found,
    };
    await save(state, adminId);
    return {
      zone: zone.name,
      zoneStatus: zone.status,
      verified: found.length,
      total: state.domains.length,
      domains: found.map(f => ({ name: f.name, type: f.type, proxied: f.proxied })),
      missing,
    };
  }

  // ── سمتِ سرور: نوشتنِ درخواست برای نگهبانِ root ─────────────────────────
  function writeMode(desired) {
    try {
      fs.mkdirSync(path.dirname(modeFile), { recursive: true });
      fs.writeFileSync(modeFile, `${desired}\n`, 'utf8');
      return true;
    } catch (e) {
      logger.warn?.('[cloudflare] نوشتنِ فایلِ حالت ناموفق:', e.message);
      return false;
    }
  }

  function serverMode() {
    const read = (file) => {
      try { return String(fs.readFileSync(file, 'utf8')).trim() || null; } catch { return null; }
    };
    const desired = read(modeFile);
    const appliedRaw = read(appliedFile);
    // قالبِ فایلِ اعمال: «on 2026-09-17T17:20:00+03:30» یا فقط «off»
    const applied = appliedRaw ? appliedRaw.split(/\s+/)[0] : null;
    return { desired, applied, inSync: !!desired && desired === applied, file: modeFile };
  }

  /**
   * روشن‌کردنِ سپر.
   *
   * دو شرط: تأییدِ دامنه‌ها انجام شده باشد، و کاربر صریحاً «تأیید» را فرستاده
   * باشد. تأییدِ متنی عمداً گذاشته شد: این دکمه ترافیکِ همهٔ کاربران را از
   * یک مسیرِ تازه می‌برد و نباید با یک کلیکِ اشتباهی زده شود.
   */
  async function enable({ confirm, underAttack = false } = {}, adminId = null) {
    if (String(confirm || '').trim() !== 'تأیید') {
      throw err('برای روشن‌کردن باید کلمهٔ «تأیید» را در کادر بنویسی.', 'need_confirm');
    }
    const state = await load();
    if (!state.verified || !state.verified.domains?.length) {
      throw err('اول دکمهٔ «بررسی و تأیید دامنه‌ها» را بزن.', 'not_verified');
    }
    if (underAttack) await cf(state, `/zones/${state.verified.zoneId}/settings/security_level`, {
      method: 'PATCH', body: { value: 'under_attack' },
    });
    const results = [];
    for (const d of state.verified.domains) {
      await cf(state, `/zones/${state.verified.zoneId}/dns_records/${d.recordId}`, {
        method: 'PATCH', body: { proxied: true },
      });
      results.push(d.name);
    }
    const modeWritten = writeMode('on');
    state.enabled = true;
    state.underAttack = !!underAttack;
    state.lastAction = { at: new Date().toISOString(), action: 'enable', adminId, underAttack: !!underAttack, domains: results };
    await save(state, adminId);
    logger.warn?.(`[cloudflare] سپر روشن شد — ${results.length} دامنه، تحتِ حمله: ${!!underAttack}`);
    return publicState(state, {
      applied: results,
      serverMode: serverMode(),
      // نگهبانِ root تا ۳۰ ثانیهٔ دیگر سمتِ سرور را اعمال می‌کند.
      serverNote: modeWritten
        ? 'سمتِ سرور تا ۳۰ ثانیهٔ دیگر خودکار اعمال می‌شود (خواندنِ آی‌پیِ واقعیِ کاربر).'
        : 'فایلِ حالتِ سرور نوشته نشد؛ نگهبانِ root را نصب کن تا آی‌پیِ واقعی خوانده شود.',
    });
  }

  /** خاموش‌کردن — همیشه ممکن، حتی اگر وسطِ حمله حالِ آدم بد شود. */
  async function disable(adminId = null) {
    const state = await load();
    const zoneId = state.verified?.zoneId;
    const results = [];
    if (zoneId) {
      for (const d of state.verified.domains || []) {
        try {
          await cf(state, `/zones/${zoneId}/dns_records/${d.recordId}`, { method: 'PATCH', body: { proxied: false } });
          results.push(d.name);
        } catch (e) {
          // خاموش‌کردنِ اضطراری نباید نصفه بماند چون یک رکورد خطا داد.
          logger.warn?.(`[cloudflare] خاموش‌کردنِ ${d.name} ناموفق: ${e.message}`);
        }
      }
      try {
        await cf(state, `/zones/${zoneId}/settings/security_level`, { method: 'PATCH', body: { value: 'medium' } });
      } catch { /* حالتِ حمله اگر نماند هم مهم نیست؛ رکوردها خاکستری شدند */ }
    }
    writeMode('off');
    state.enabled = false;
    state.underAttack = false;
    state.lastAction = { at: new Date().toISOString(), action: 'disable', adminId, domains: results };
    await save(state, adminId);
    logger.warn?.('[cloudflare] سپر خاموش شد — ترافیک مستقیم به سرور برگشت.');
    return publicState(state, { applied: results, serverMode: serverMode() });
  }

  return {
    SETTINGS_KEY,
    MAX_DOMAINS,
    load,
    publicState,
    saveConfig,
    verify,
    enable,
    disable,
    serverMode,
    /** فقط برای تست: بررسیِ صحتِ دامنه‌ها بدونِ دست‌زدن به چیزی. */
    _normalizeDomains: normalizeDomains,
  };
}

module.exports = { createCloudflareGuard, normalizeDomain, normalizeDomains, zoneCandidates, SETTINGS_KEY, DEFAULT_DOMAINS, MAX_DOMAINS };
