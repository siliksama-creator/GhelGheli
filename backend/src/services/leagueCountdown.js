/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  شماره معکوسِ شروعِ لیگ — «اهرمِ بدونِ آپدیت» برای بستنِ بازی‌های سکه‌ای
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── خواستهٔ مالک (۲۷ شهریور) ───────────────────────────────────────────────
 *
 *   «این قابلیت رو در پنل ادمین بساز که ادمین بتونه شماره معکوسِ استارتِ لیگ
 *    بسازه. اگر فعال کرد، کاربرها نمی‌تونن آنلاین بازی کنن یا ضربه‌زن بازی
 *    کنن — هم در وب هم اندروید. فقط می‌تونن اتاق بسازن و با ربات بازی کنن.
 *    شماره معکوس در قسمتِ لیگ یا بازیِ آنلاین یا بازی ضربه‌زن نمایش داده
 *    بشه. متنِ همراهش هم در پنل قابل تغییر باشه، بدونِ آپدیتِ اندروید.»
 *
 *   و در پاسخ به پرسشِ پیش از ساخت: «هدف اینه که هرچیزی که داره سکه می‌ده
 *    بسته بمونه» + «سرِ ساعتِ تعیین‌شده بازیِ آنلاین و ضربه‌زن خودکار آزاد
 *    می‌شن، کارتِ شمارش پنهان می‌شه و لیگی که ادمین از قبل مشخص کرده شروع
 *    می‌شه؛ از این به بعد بدونِ ساختِ تنظیماتِ لیگ توسط ادمین هیچ لیگی نباید
 *    در جریان باشه.»
 *
 * ── قاعده‌ای که از آن دو جمله بیرون می‌آید ─────────────────────────────────
 *
 * معیارِ بستن، «سکه» است نه «آنلاین‌بودن»:
 *
 *   بسته  ← هر مسیری که سکه می‌دهد: بازیِ سریعِ آنلاین (سهم‌دار)، لابی‌های
 *           عمومی (سهم‌دار) و بازیِ ضربه‌زن. دلیلِ سکه‌ای‌بودن: تسویهٔ
 *           سهم در `gameStakeService` سکه می‌دهد و ضربه‌زن هم منبعِ سکه است.
 *   باز    ← اتاقِ خصوصی (سهم صفر ⇒ فقط امتیاز) و بازی با ربات (بدونِ امتیاز).
 *
 * ⚠️ پس این سرویس عمداً «آنلاین = بسته» نمی‌گوید؛ اگر روزی اتاق‌های خصوصی
 *    سکه‌دار شوند، همین تعریف باید بازبینی شود (گاردِ
 *    `testLeagueCountdown.js` دلیل هرکدام را جدا می‌سنجد).
 *
 * ── چرا کشِ ۵ ثانیه‌ای، هم‌شکلِ featureFlags ────────────────────────────────
 *
 * موتورِ بازی داخلِ هندلرهای سوکت (`game:join`, `game:create_lobby`, …)
 * تصمیم می‌گیرد و آنجا `await` کردنِ یک کوئریِ دیتابیس، همهٔ آن مسیرها را
 * کند می‌کند. الگوی همین پروژه در `featureFlags.js` این است: تصمیم از کشِ
 * همگام خوانده می‌شود و تازه‌سازی در پشت‌زمینه می‌رود. اینجا هم همان:
 * `cached()` (همگام) + `refresh()` (بی‌صدا).
 *
 * ⚠️ شکستِ خواندنِ دیتابیس = «باز». محصول نباید به‌خاطرِ یک قطعیِ گذرا
 *    قفل شود؛ دقیقاً همان قاعده‌ای که در `featureFlags` هم اجرا می‌شود.
 */
const { pool: defaultPool } = require('../config/db');

const SETTINGS_KEY = 'league_countdown';

const LIMITS = Object.freeze({
  title: 60,
  subtitle: 160,
  note: 240,
  message: 200,
});

const DEFAULTS = Object.freeze({
  enabled: false,
  startsAt: null,
  title: 'لیگ به‌زودی شروع می‌شود',
  subtitle: 'تا شروعِ لیگ، بازیِ آنلاین و ضربه‌زن موقتاً بسته است',
  note: 'در این فاصله می‌توانی در اتاقِ خصوصی با دوستت یا مقابلِ ربات تمرین کنی — امتیاز می‌گیری، سکه نه.',
  // متنِ خطا وقتی کاربری مسیرِ بسته را صدا می‌زند.
  message: 'تا شروعِ لیگ، این بازی بسته است. اتاقِ خصوصی و بازی با ربات باز است.',
  /**
   * لیگ بدونِ ساختِ ادمین شروع نشود.
   *
   * پیش‌فرض **false** است — یعنی از این به بعد سرور خودش فصلِ تازه نمی‌سازد
   * (خواستهٔ مالک). تا امروز `ensureActiveSeason` هر ماه یک فصل می‌ساخت و
   * هیچ‌وقت «لیگی در جریان نبود» پیش نمی‌آمد.
   */
  leagueAutostart: false,
  /** فصلی که سرِ ساعتِ صفر باید فعال شود (انتخابِ ادمین، اختیاری). */
  seasonId: null,
  /** یک‌بار فعال شد، دیگر تکرار نشود. */
  seasonActivatedAt: null,
});

const clip = (value, max) => String(value ?? '').trim().slice(0, max);

function fail(message, code = 'bad_input') {
  const e = new Error(message);
  e.code = code;
  e.expected = true;
  return e;
}

/**
 * ورودیِ پنل → تنظیماتِ معتبر.
 *
 * `partial` برای ذخیرهٔ جزئی نیست؛ پنل همیشه کلِ فرم را می‌فرستد ولی
 * فیلدهای نیامده از مقدارِ فعلی می‌آیند تا یک PATCHِ کوچک هم بی‌خطر باشد.
 */
function normalize(raw, current = null) {
  const b = raw && typeof raw === 'object' ? raw : {};
  const base = current || DEFAULTS;

  const pick = (key) => (b[key] === undefined ? base[key] : b[key]);

  const enabled = pick('enabled') === true || pick('enabled') === 'true';
  const leagueAutostart = pick('leagueAutostart') === true || pick('leagueAutostart') === 'true';

  let startsAt = pick('startsAt');
  if (startsAt === undefined || startsAt === null || startsAt === '') startsAt = null;
  else {
    const ms = Date.parse(String(startsAt));
    if (!Number.isFinite(ms)) throw fail('زمانِ شروعِ لیگ قابلِ‌خواندن نیست');
    startsAt = new Date(ms).toISOString();
  }

  let seasonId = pick('seasonId');
  if (seasonId === undefined || seasonId === null || seasonId === '') seasonId = null;
  else {
    seasonId = String(seasonId).trim();
    // همان قالبِ UUID که بقیهٔ مسیرها می‌خواهند؛ بدونِ آن، کوئریِ فعال‌سازی
    // به دیتابیس می‌رسد و خطای ۵۰۰ می‌دهد به‌جای پیامِ تمیز.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seasonId)) {
      throw fail('لیگِ انتخابی معتبر نیست');
    }
  }

  if (enabled && !startsAt) {
    throw fail('برای فعال‌کردن، زمانِ شروعِ لیگ را هم تعیین کن');
  }

  const out = {
    enabled,
    startsAt,
    title: clip(b.title ?? base.title, LIMITS.title) || DEFAULTS.title,
    subtitle: clip(b.subtitle ?? base.subtitle, LIMITS.subtitle),
    note: clip(b.note ?? base.note, LIMITS.note),
    message: clip(b.message ?? base.message, LIMITS.message) || DEFAULTS.message,
    leagueAutostart,
    seasonId,
    // فعال‌شدنِ فصل، رکوردِ یک‌باره است: با هر ذخیرهٔ تازه از نو نوشته نمی‌شود
    // مگر خودِ ادمین فصل را عوض کند.
    seasonActivatedAt: seasonId && seasonId === base.seasonId
      ? (base.seasonActivatedAt || null)
      : null,
  };
  return out;
}

/** تنظیمات از دیتابیس (خام). */
async function readSettings(db = defaultPool) {
  try {
    const { rows } = await db.query(
      "SELECT value FROM app_settings WHERE key=$1 LIMIT 1", [SETTINGS_KEY]);
    const raw = rows[0]?.value;
    return normalize(raw && typeof raw === 'object' ? raw : {}, DEFAULTS);
  } catch {
    // بدونِ دیتابیس = پیش‌فرضِ «باز» تا محصول از کار نیفتد.
    return { ...DEFAULTS };
  }
}

/** ذخیرهٔ تنظیمات + کشِ همگامِ تازه. */
async function saveSettings(input, adminId = null, db = defaultPool) {
  const current = await readSettings(db);
  const next = normalize(input, current);
  await db.query(
    `INSERT INTO app_settings(key, value, updated_by_admin_id, updated_at)
     VALUES($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_by_admin_id = EXCLUDED.updated_by_admin_id,
           updated_at = NOW()`,
    [SETTINGS_KEY, JSON.stringify(next), adminId]);
  prime(next);
  return next;
}

/**
 * وضعیتِ محاسبه‌شده — تابعِ **خالص**، تا بدونِ دیتابیس و ساعتِ واقعی
 * آزمون‌شدنی باشد (گاردِ `testLeagueCountdown.js` روی همین می‌نشیند).
 */
function computeState(settings, now = Date.now()) {
  const s = settings && typeof settings === 'object' ? settings : DEFAULTS;
  const startsMs = s.startsAt ? Date.parse(s.startsAt) : NaN;
  const hasTime = Number.isFinite(startsMs);
  // «فعال» = ادمین تیک زده **و** زمانِ شروع هنوز نرسیده. رسیدنِ به صفر
  // یعنی آزادشدنِ خودکار؛ پس دیگر هیچ لِنگِ دستی‌ای لازم نیست.
  const active = Boolean(s.enabled) && hasTime && now < startsMs;
  const started = Boolean(s.enabled) && hasTime && now >= startsMs;
  return {
    enabled: Boolean(s.enabled),
    active,
    started,
    startsAt: hasTime ? new Date(startsMs).toISOString() : null,
    serverNow: new Date(now).toISOString(),
    msLeft: active ? startsMs - now : 0,
    totalMs: hasTime && active ? Math.max(startsMs - now, 0) : 0,
    title: s.title || DEFAULTS.title,
    subtitle: s.subtitle || '',
    note: s.note || '',
    message: s.message || DEFAULTS.message,
    // کلیدهای بسته‌شده برای کلاینت‌ها (تا دکمه‌ها را غیرفعال کنند و دلیلش را
    // بنویسند، به‌جای اینکه کاربر با کلیک به خطا بخورد).
    blocks: { online: active, tap: active },
    leagueAutostart: Boolean(s.leagueAutostart),
    seasonId: s.seasonId || null,
    seasonActivatedAt: s.seasonActivatedAt || null,
  };
}

// ── کشِ همگام (الگویِ featureFlags) ────────────────────────────────────────
let snapshot = null; // { at, settings }
const TTL_MS = 5000;

function prime(settings) {
  snapshot = { at: Date.now(), settings };
}

function cachedSettings() {
  return snapshot?.settings || DEFAULTS;
}

/**
 * تصمیمِ همگام برای هندلرهای سوکت.
 * تازه‌سازی در پشت‌زمینه شروع می‌شود (بدونِ await) و مقدارِ همین حالا
 * برگردانده می‌شود — حداکثر ۵ ثانیه کهنگی، به‌ازای هر رویداد کند نشدن.
 */
function cached(now = Date.now()) {
  refresh();
  return computeState(cachedSettings(), now);
}

/** آیا همین حالا مسیرهای سکه‌ای بسته‌اند؟ */
function blockingNow(now = Date.now()) {
  return cached(now).active;
}

async function refresh(db = defaultPool) {
  if (snapshot && Date.now() - snapshot.at < TTL_MS) return snapshot.settings;
  const next = await readSettings(db);
  prime(next);
  return next;
}

/** وضعیتِ کامل برای کلاینت (با تازه‌سازیِ زمان‌بندِ لیگ). */
async function publicState(db = defaultPool, now = Date.now()) {
  const settings = await readSettings(db);
  prime(settings);
  const state = computeState(settings, now);
  // سرِ ساعتِ صفر، لیگِ انتخاب‌شده فعال می‌شود؛ این کار **یک‌بار** انجام
  // می‌شود و خطاهایش مسیرِ خواندن را نمی‌شکند.
  if (state.started && state.seasonId && !state.seasonActivatedAt) {
    activateSeason(state.seasonId).then(async (done) => {
      if (done) await markSeasonActivated(state.seasonId, db);
    }).catch(() => {});
  }
  return state;
}

/**
 * فعال‌کردنِ لیگِ انتخاب‌شده.
 *
 * ⚠️ چرا مستقیم SQL و نه `leagueService`: `leagueService` خودش این سرویس را
 *    برای «لیگِ خودکار» صدا می‌زند و requireِ متقابل یعنی حلقهٔ وابستگی.
 */
async function activateSeason(seasonId, db = defaultPool) {
  if (!seasonId) return false;
  const { rowCount } = await db.query(
    `UPDATE league_seasons
        SET status='active',
            starts_at='now',
            ends_at=GREATEST(ends_at, NOW() + INTERVAL '1 day')
      WHERE id=$1 AND status <> 'closed'`,
    [seasonId]);
  return rowCount > 0;
}

async function markSeasonActivated(seasonId, db = defaultPool) {
  const current = await readSettings(db);
  const next = { ...current, seasonActivatedAt: new Date().toISOString() };
  await db.query(
    `INSERT INTO app_settings(key, value, updated_by_admin_id, updated_at)
     VALUES($1,$2,NULL,NOW())
     ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
    [SETTINGS_KEY, JSON.stringify(next)]);
  prime(next);
}

/** فهرستِ لیگ‌ها برای فهرستِ انتخابیِ پنل. */
async function listSeasons(db = defaultPool) {
  const { rows } = await db.query(
    `SELECT id, title, month_year, league_type, status, starts_at, ends_at
       FROM league_seasons
      WHERE status <> 'closed'
      ORDER BY starts_at DESC NULLS LAST, created_at DESC
      LIMIT 50`);
  return rows;
}

module.exports = {
  SETTINGS_KEY,
  DEFAULTS,
  LIMITS,
  normalize,
  readSettings,
  saveSettings,
  computeState,
  publicState,
  listSeasons,
  activateSeason,
  cached,
  blockingNow,
  refresh,
  prime,
  fail,
};
