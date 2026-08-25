// ═══════════════════════════════════════════════════════════════════════════
// پرچم‌های اجرایی کلاینت — «اهرم بدون آپدیت»
// ═══════════════════════════════════════════════════════════════════════════
//
// چرا این سرویس جدا از `clientConfig.js` است
//
// پنل ادمین پرچم‌ها را داخل همان JSONِ `client_config` ذخیره می‌کند تا
// مایگریشن تازه‌ای لازم نباشد (نگهبان `testClientConfig.js` آخرین فایل
// مایگریشن را قفل کرده). ولی موتور بازی و مسیر گردونه نباید به روت
// Express وابسته شوند — وگرنه تست واحدِ قوانین بازی به دیتابیس و
// Express گره می‌خورد.
//
// پس خواندن/نرمال‌سازی اینجاست، نوشتن همان PATCHِ client-config می‌ماند.
//
// ── چه چیزی این پرچم‌ها حل می‌کنند ──
//
// روز عرضه اگر یک بازی خراب شود، تا امروز باید یا کل API را خاموش
// می‌کردیم یا نسخهٔ جدید اپ منتشر می‌کردیم. با این پرچم‌ها مدیر از پنل
// یک بازی را خاموش می‌کند؛ سرور join را رد می‌کند و کلاینت‌های تازه
// کاشی را نشان نمی‌دهند. حالت تعمیر هم کل بازی/گردونه را با یک پیام
// فارسی می‌بندد.
//
// ⚠️ شکست خواندن دیتابیس = همه چیز روشن. اگر تنظیمات در دسترس نبود،
//    محصول نباید از کار بیفتد. خاموشی فقط وقتی است که ادمین صریحاً
//    نوشته باشد.

const GAME_IDS = Object.freeze(['memory', 'tap', 'penalty', 'card_duel']);

const DEFAULTS = Object.freeze({
  maintenance: Object.freeze({ active: false, message: '' }),
  games: Object.freeze({
    memory: true,
    tap: true,
    penalty: true,
    card_duel: true,
  }),
  wheel: true,
});

function normalizeFeatures(raw) {
  const v = raw && typeof raw === 'object' ? raw : {};
  const m = v.maintenance && typeof v.maintenance === 'object' ? v.maintenance : {};
  const g = v.games && typeof v.games === 'object' ? v.games : {};
  const games = {};
  for (const id of GAME_IDS) {
    games[id] = g[id] !== false;
  }
  const message = String(m.message || '').trim().slice(0, 300);
  return {
    maintenance: {
      active: m.active === true,
      message,
    },
    games,
    wheel: v.wheel !== false,
  };
}

let snapshot = null; // { at, value }

function cachedFeatures() {
  return snapshot?.value || DEFAULTS;
}

function primeFeatures(value) {
  snapshot = { at: Date.now(), value: normalizeFeatures(value) };
}

async function loadFeatures(pool) {
  if (!pool) {
    // بدون DATABASE_URL اصلاً به pg دست نزن — تست موتور بازی و محیط
    // واحد نباید برای پرچمِ اختیاری منتظر اتصالِ ردشده بمانند.
    if (!process.env.DATABASE_URL && !process.env.PGHOST) {
      return snapshot?.value || DEFAULTS;
    }
    try {
      pool = require('../config/db').pool;
    } catch {
      return DEFAULTS;
    }
  }
  const now = Date.now();
  if (snapshot && now - snapshot.at < 5000) return snapshot.value;
  const previous = snapshot?.value || DEFAULTS;
  try {
    const { rows } = await pool.query(
      "SELECT value FROM app_settings WHERE key='client_config' LIMIT 1",
    );
    const next = normalizeFeatures(rows[0]?.value?.features);
    snapshot = { at: Date.now(), value: next };
    return next;
  } catch {
    snapshot = { at: Date.now(), value: previous };
    return previous;
  }
}

/**
 * آیا این بازی همین حالا قابل شروع است؟
 * هرگز throw نمی‌کند — فراخواننده پیام را به سوکت/HTTP می‌دهد.
 */
async function checkPlayable(gameId, pool) {
  const f = await loadFeatures(pool);
  if (f.maintenance.active) {
    return {
      ok: false,
      message: f.maintenance.message || 'سرویس موقتاً در دسترس نیست. کمی بعد دوباره سر بزن.',
    };
  }
  if (gameId && f.games[gameId] === false) {
    return { ok: false, message: 'این بازی موقتاً غیرفعال است' };
  }
  return { ok: true };
}

async function checkWheel(pool) {
  const f = await loadFeatures(pool);
  if (f.maintenance.active) {
    return {
      ok: false,
      message: f.maintenance.message || 'سرویس موقتاً در دسترس نیست. کمی بعد دوباره سر بزن.',
    };
  }
  if (f.wheel === false) {
    return { ok: false, message: 'گردونه موقتاً غیرفعال است' };
  }
  return { ok: true };
}

module.exports = {
  GAME_IDS,
  DEFAULTS,
  normalizeFeatures,
  loadFeatures,
  cachedFeatures,
  primeFeatures,
  checkPlayable,
  checkWheel,
};
