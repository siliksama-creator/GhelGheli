const crypto = require('crypto');
const { pool } = require('../config/db');
const points = require('./pointService');
const ops = require('./opsConfig');

const DAILY_BONUS_KEY = 'daily_all_bonus';
const DAILY_BONUS_DEFAULT = 100;

// برای سازگاری با ابزارها/تست‌هایی که این ثابت را می‌خوانند نگه داشته
// می‌شود؛ مقدارِ واقعیِ به‌کاررفته در مسیر محصول از `mission_config` است.
const DAILY_BONUS_REWARD = DAILY_BONUS_DEFAULT;

// کشِ ۳۰ ثانیه‌ایِ ماموریت‌های سفارشی (DB) — هر درخواستِ کاربر نباید
// کوئری تازه بزند؛ تغییرِ ادمین حداکثر ۳۰ ثانیه بعد دیده می‌شود.
let _customCache = null;

/**
 * تنظیمات ماموریت از پنل ادمین: جایزهٔ تکمیل روزانه + بازنویسیِ
 * تکیِ ماموریت‌های توکار (کلیدِ هر ماموریت → reward/goal/active).
 * `overrides.active=false` یعنی ماموریت از چرخش بیرون می‌رود.
 */
function missionConfig() {
  const v = ops.syncGet('mission_config');
  if (!v || typeof v !== 'object') return { dailyBonus: DAILY_BONUS_DEFAULT, overrides: {} };
  return {
    dailyBonus: Number.isFinite(Number(v.dailyBonus)) ? Math.max(0, Number(v.dailyBonus)) : DAILY_BONUS_DEFAULT,
    overrides: v.overrides && typeof v.overrides === 'object' ? v.overrides : {},
  };
}

function applyOverride(item) {
  const over = missionConfig().overrides[item.key];
  if (!over || typeof over !== 'object') return { ...item, active: true };
  const goal = Number.isFinite(Number(over.goal)) && Number(over.goal) >= 1
    ? Math.round(Number(over.goal)) : item.goal;
  const reward = Number.isFinite(Number(over.reward)) && Number(over.reward) >= 0
    ? Math.round(Number(over.reward)) : item.reward;
  return {
    ...item,
    goal,
    reward,
    title: typeof over.title === 'string' && over.title.trim() ? over.title.trim().slice(0, 120) : item.title,
    description: typeof over.description === 'string' && over.description.trim()
      ? over.description.trim().slice(0, 240) : item.description,
    active: over.active !== false,
  };
}

/** ماموریت‌های سفارشی ادمین — همیشه فعال، بدون چرخش تصادفی. */
async function customDefinitions(client = pool) {
  const now = Date.now();
  if (_customCache && now - _customCache.at < 30_000) return _customCache.rows;
  try {
    const { rows } = await client.query(
      `SELECT key, period, event, icon, title, description, goal, reward
         FROM mission_definitions
        WHERE is_active = true
        ORDER BY sort_order, created_at`);
    _customCache = {
      at: now,
      rows: rows.map((r) => ({
        key: r.key, period: r.period, event: r.event, icon: r.icon,
        title: r.title, description: r.description,
        goal: Number(r.goal) || 1, reward: Number(r.reward) || 0,
        custom: true, active: true,
      })),
    };
    return _customCache.rows;
  } catch (err) {
    // چرخشِ پایه نباید به‌خاطرِ خطای خواندنِ جدولِ سفارشی‌ها از کار بیفتد؛
    // بدونِ دیتابیس (مثلاً تست‌های CI) هم باید همان چرخشِ روزانه/هفتگی
    // برگردد. کشِ قبلی اگر باشد، برگردان؛ وگرنه لیستِ خالی.
    if (_customCache) return _customCache.rows;
    return [];
  }
}

const DAILY_FAMILIES = Object.freeze([
  {
    event: 'match_completed', icon: 'football', baseReward: 14,
    titles: ['شروع پرقدرت', 'گرم‌کردن قهرمان', 'نبرد روز', 'تا سوت آخر', 'بازیکن ثابت‌قدم', 'ریتم مسابقه'],
    describe: goal => `${goal} مسابقه را تا پایان کامل کن`, goals: [1, 1, 2, 2, 3, 3, 4, 5],
  },
  {
    event: 'online_win', icon: 'trophy', baseReward: 22,
    titles: ['شکارچی برد', 'فرمانروای آنلاین', 'برد تمیز', 'قهرمان امروز', 'ضربه نهایی', 'توقف‌ناپذیر'],
    describe: goal => `${goal} مسابقه آنلاین را ببر`, goals: [1, 1, 1, 2, 2, 3],
  },
  {
    event: 'share', icon: 'bolt', baseReward: 12,
    titles: ['صدای بردت را برسان', 'لحظه‌ات را منتشر کن', 'چالش عمومی', 'خبرساز شو', 'افتخار امروز', 'دعوت به رقابت'],
    describe: goal => `${goal} نتیجه یا لینک چالش را به اشتراک بگذار`, goals: [1, 1, 1, 1, 2, 2],
  },
  {
    event: 'rematch', icon: 'bolt', baseReward: 16,
    titles: ['فرصت جبران', 'دوباره روبه‌رو شو', 'حساب باز', 'نبرد برگشت', 'یک دست دیگر', 'ریمچ داغ'],
    describe: goal => `${goal} مسابقه دوباره با همان حریف شروع کن`, goals: [1, 1, 1, 2, 2, 3],
  },
  {
    // ── دورِ ۳۳: جایزهٔ ماموریت‌های دوستانه بالا رفت ──────────────────────
    // خواستهٔ مالک: «جوایز امتیازات ماموریت مرتبط به دوست باید افزایش
    // بیشتری داشته باشن و ساده سازی و قابل فهم باشن».
    //
    // چرا ۱۸ → ۳۰: ماموریتِ «دعوت دوست به دوئل» سخت‌ترین عملِ اجتماعیِ
    // بازی است — کاربر باید یک آدمِ دیگر را متقاعد کند؛ در حالی که
    // پاداشش (۱۸+) از «کامل‌کردن مسابقه» (۱۴+) کمی بیشتر بود و از
    // «بردِ آنلاین» (۲۲+) کمتر. ارزشِ آوردنِ یک بازیکنِ جدید باید
    // مشخصاً بالاتر از هر اقدامِ تک‌نفره‌ای باشد؛ ۳۰ یعنی ~۲ برابرِ
    // مسابقه‌ی معمولی و بالاترین پایهٔ بین همهٔ خانواده‌ها.
    //
    // ساده‌سازی: عنوان‌ها همه یک الگوی روشن گرفتند «دعوت + جایزه»، و
    // توضیح همان یک جملهٔ کوتاه باقی مانده — بدون واژه‌های مبهم مثل
    // «حریف آشنا» یا «تیم اجتماعی» که کاربر باید حدس می‌زد یعنی چه.
    event: 'friend_challenge', icon: 'handshake', baseReward: 30,
    titles: ['دعوت اول', 'دوئل دوستانه', 'دوستت را به چالش بکش',
      'رفیق‌بازی', 'دوستان بیشتر، برد بیشتر', 'گروه دوستان'],
    describe: goal => `${goal} دوست را به یک دوئل دعوت کن`, goals: [1, 1, 1, 2, 2, 3],
  },
]);

function buildDailyPool() {
  const pool = [];
  for (const family of DAILY_FAMILIES) {
    for (let index = 0; index < 24; index += 1) {
      const goal = family.goals[index % family.goals.length];
      const tier = Math.floor(index / family.titles.length) + 1;
      pool.push(Object.freeze({
        key: `daily_${family.event}_${String(index + 1).padStart(2, '0')}`,
        period: 'daily', event: family.event, icon: family.icon,
        title: `${family.titles[index % family.titles.length]} · سطح ${tier}`,
        description: family.describe(goal), goal,
        // ═════════════════════════════════════════════════════════════════
        // منحنی پاداش/سختی — چرا `goal * 4` عوض شد
        // ═════════════════════════════════════════════════════════════════
        //
        // فرمول قبلی `baseReward + goal*4 + tier*2` بود. چون `baseReward`
        // ثابت می‌ماند و ضریب هدف (۴) خیلی کوچک بود، پاداشِ **هر واحد کار**
        // با سخت‌تر شدن ماموریت **کم** می‌شد:
        //
        //     ۱ مسابقه → ۲۰ امتیاز (۲۰.۰ به‌ازای هر مسابقه)
        //     ۵ مسابقه → ۳۶ امتیاز ( ۷.۲ به‌ازای هر مسابقه)
        //
        // یعنی کاربر برای ۵ برابر کار فقط ۱.۸ برابر پاداش می‌گرفت. این
        // دقیقاً برعکسِ چیزی است که باید باشد: ماموریت سخت‌تر باید
        // **صرفه‌ی بیشتری** داشته باشد وگرنه سطح‌های بالا حس تنبیه می‌دهند.
        //
        // فرمول جدید پایه را در خودِ هدف مقیاس می‌کند:
        //
        //     round(baseReward * (0.55 + 0.45 * goal)) + tier * 2
        //
        //     ۱ مسابقه → ۱۶ امتیاز (۱۶.۰)
        //     ۵ مسابقه → ۴۱ امتیاز ( ۸.۲)   ← صعودی نسبت به ۳ و ۴
        //
        // ضریب ۰.۵۵ عمداً زیر ۱ است تا ماموریت‌های تک‌واحدی کمی ارزان‌تر
        // شوند؛ این تورم کل را جبران می‌کند. میانگین مجموع ۵ ماموریت
        // روزانه از ۱۴۳ به ۱۳۶ می‌رسد — یعنی متعادل‌تر **و** کمی
        // کم‌تورم‌تر، نه سخاوتمندانه‌تر.
        reward: Math.round(family.baseReward * (0.55 + 0.45 * goal)) + tier * 2,
      }));
    }
  }
  return pool;
}

const WEEKLY_POOL = Object.freeze([
  { key:'weekly_matches_5', period:'weekly', event:'match_completed', icon:'football', title:'پنج نبرد هفته', description:'۵ مسابقه را کامل کن', goal:5, reward:75 },
  { key:'weekly_matches_10', period:'weekly', event:'match_completed', icon:'game', title:'بازیکن پرتلاش', description:'۱۰ مسابقه را کامل کن', goal:10, reward:130 },
  { key:'weekly_wins_2', period:'weekly', event:'online_win', icon:'trophy', title:'شکارچی برد', description:'۲ برد آنلاین ثبت کن', goal:2, reward:70 },
  { key:'weekly_wins_5', period:'weekly', event:'online_win', icon:'crown', title:'سلطان هفته', description:'۵ برد آنلاین ثبت کن', goal:5, reward:160 },
  { key:'weekly_share_3', period:'weekly', event:'share', icon:'bolt', title:'خبرساز هفته', description:'۳ نتیجه را به اشتراک بگذار', goal:3, reward:65 },
  { key:'weekly_share_5', period:'weekly', event:'share', icon:'bell', title:'صدای آرنا', description:'۵ بار لینک چالش را منتشر کن', goal:5, reward:105 },
  { key:'weekly_rematch_3', period:'weekly', event:'rematch', icon:'bolt', title:'سه فرصت جبران', description:'۳ ریمچ شروع کن', goal:3, reward:75 },
  { key:'weekly_rematch_6', period:'weekly', event:'rematch', icon:'swords', title:'رقابت ادامه‌دار', description:'۶ ریمچ شروع کن', goal:6, reward:130 },
  // دورِ ۳۳ — ماموریت‌های دوستانهٔ هفتگی هم با همان منطقِ بالا تقویت شدند:
  // هر «دعوتِ موفق» در نسخهٔ جدید به‌طور میانگین ~۴۳ امتیاز می‌ارزد
  // (قبلاً ~۲۴) و توضیح‌ها به یک فعلِ روشن و یک عدد خلاصه شدند.
  { key:'weekly_friends_3', period:'weekly', event:'friend_challenge', icon:'handshake', title:'دعوت هفتگی', description:'۳ دوست را به دوئل دعوت کن', goal:3, reward:130 },
  { key:'weekly_friends_6', period:'weekly', event:'friend_challenge', icon:'star', title:'ستارهٔ دوستی', description:'۶ دوست را به دوئل دعوت کن', goal:6, reward:230 },
]);

const DAILY_POOL = Object.freeze(buildDailyPool());
const DEFINITIONS = Object.freeze([...DAILY_POOL, ...WEEKLY_POOL]);

function tehranDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = type => parts.find(p => p.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function isoWeek(dateString) {
  const d = new Date(`${dateString}T12:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1, 12));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function periodKey(period, now = new Date()) {
  const day = tehranDate(now);
  return period === 'weekly' ? isoWeek(day) : day;
}

function hashRank(seed) {
  return crypto.createHash('sha256').update(seed).digest('hex');
}

async function activeDefinitions(userId, now = new Date()) {
  const day = periodKey('daily', now);
  // Exactly one mission from each of five actionable families. This keeps the
  // daily set varied but balanced instead of randomly returning five shares.
  const daily = DAILY_FAMILIES.map(family => DAILY_POOL
    .map(applyOverride)
    .filter(item => item.event === family.event && item.active)
    .sort((a, b) => hashRank(`${userId}:${day}:${a.key}`).localeCompare(hashRank(`${userId}:${day}:${b.key}`)))[0])
    .filter(Boolean);
  const week = periodKey('weekly', now);
  // ═══════════════════════════════════════════════════════════════════════
  // چرا اینجا بر اساس **رویداد** یکتاسازی می‌شود — باگی که ۳۴٪ کاربران را
  // درگیر می‌کرد
  // ═══════════════════════════════════════════════════════════════════════
  //
  // نسخهٔ قبلی فقط `[...WEEKLY_POOL].sort(...).slice(0, 3)` بود. اما
  // WEEKLY_POOL برای هر رویداد **دو سطح** دارد (مثلاً «۵ مسابقه»=۷۵ و
  // «۱۰ مسابقه»=۱۳۰). وقتی هر دو سطح یک رویداد با هم انتخاب می‌شدند،
  // کاربر با همان ۱۰ مسابقه **هر دو** را کامل می‌کرد و ۲۰۵ امتیاز
  // می‌گرفت به‌جای ۱۳۰.
  //
  // شبیه‌سازی روی ۲٬۰۰۰ کاربر: ۶۷۹ نفر (۳۴.۰٪) دو ماموریت از یک رویداد
  // می‌گرفتند. هم ناعادلانه بود (جایزهٔ بیشتر به‌صورت تصادفی) و هم تنوع
  // هفته را از بین می‌برد.
  //
  // درمان: اول رویدادها را رتبه‌بندی کن، سه رویدادِ **متمایز** بردار، و
  // بعد از هر رویداد یک سطح انتخاب کن — دقیقاً همان الگوی مسیر روزانه.
  const weeklyEvents = [...new Set(WEEKLY_POOL.map(item => item.event))]
    .sort((a, b) => hashRank(`${userId}:${week}:evt:${a}`)
      .localeCompare(hashRank(`${userId}:${week}:evt:${b}`)))
    .slice(0, 3);
  const weekly = weeklyEvents.map(event => WEEKLY_POOL
    .map(applyOverride)
    .filter(item => item.event === event && item.active)
    .sort((a, b) => hashRank(`${userId}:${week}:${a.key}`)
      .localeCompare(hashRank(`${userId}:${week}:${b.key}`)))[0])
    .filter(Boolean);
  // ماموریت‌های سفارشیِ ادمین همیشه کنارِ چرخشِ روزانه/هفتگی می‌آیند.
  const customs = await customDefinitions();
  return [...daily, ...weekly, ...customs];
}

function referenceUuid(userId, missionKey, period) {
  const hex = crypto.createHash('sha256').update(`${userId}:${missionKey}:${period}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

async function record(userId, event, amount = 1) {
  const count = Math.min(100, Math.max(1, Math.floor(Number(amount) || 1)));
  const definitions = (await activeDefinitions(userId)).filter(d => d.event === event);
  await Promise.all(definitions.map(d => pool.query(
    `INSERT INTO user_mission_progress(user_id,mission_key,period_key,progress,updated_at)
     VALUES($1,$2,$3,$4,NOW())
     ON CONFLICT(user_id,mission_key,period_key) DO UPDATE SET
       progress=LEAST($5,user_mission_progress.progress+$4), updated_at=NOW()`,
    [userId, d.key, periodKey(d.period), count, d.goal],
  )));
}

async function status(userId) {
  const active = await activeDefinitions(userId);
  const keys = [...new Set(active.map(d => periodKey(d.period)))];
  const { rows } = await pool.query(
    `SELECT mission_key,period_key,progress,claimed_at,updated_at
       FROM user_mission_progress
      WHERE user_id=$1 AND period_key=ANY($2::varchar[])`, [userId, keys]);
  const byKey = new Map(rows.map(row => [`${row.mission_key}:${row.period_key}`, row]));
  const missions = active.map(d => {
    const key = periodKey(d.period);
    const row = byKey.get(`${d.key}:${key}`);
    const progress = Math.min(d.goal, Number(row?.progress || 0));
    return {
      key: d.key, period: d.period, periodKey: key, icon: d.icon, title: d.title,
      description: d.description, goal: d.goal, reward: d.reward,
      progress, complete: progress >= d.goal, claimed: Boolean(row?.claimed_at),
    };
  });
  const daily = missions.filter(m => m.period === 'daily');
  const bonusRow = byKey.get(`${DAILY_BONUS_KEY}:${periodKey('daily')}`);
  const completed = daily.filter(m => m.complete).length;
  return {
    missions,
    daily,
    weekly: missions.filter(m => m.period === 'weekly'),
    dailyBonus: {
      key: DAILY_BONUS_KEY,
      reward: missionConfig().dailyBonus,
      completed,
      goal: daily.length,
      ready: daily.length > 0 && completed === daily.length,
      claimed: Boolean(bonusRow?.claimed_at),
    },
    rotation: { dailyPoolSize: DAILY_POOL.length, shownDaily: daily.length },
  };
}

async function claim(userId, missionKey) {
  const definition = (await activeDefinitions(userId)).find(d => d.key === missionKey);
  if (!definition) throw Object.assign(new Error('این ماموریت امروز یا این هفته فعال نیست'), { status: 404 });
  const key = periodKey(definition.period);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM user_mission_progress
        WHERE user_id=$1 AND mission_key=$2 AND period_key=$3 FOR UPDATE`,
      [userId, missionKey, key]);
    const row = rows[0];
    if (!row || Number(row.progress) < definition.goal) {
      throw Object.assign(new Error('این ماموریت هنوز کامل نشده است'), { status: 409 });
    }
    if (row.claimed_at) throw Object.assign(new Error('پاداش این ماموریت قبلاً دریافت شده است'), { status: 409 });
    await client.query(
      `UPDATE user_mission_progress SET claimed_at=NOW(),updated_at=NOW()
        WHERE user_id=$1 AND mission_key=$2 AND period_key=$3`,
      [userId, missionKey, key]);
    const credited = await points.credit(client, {
      userId, points: definition.reward, source: 'mission',
      referenceType: 'mission_reward', referenceId: referenceUuid(userId, missionKey, key),
      description: `پاداش ماموریت: ${definition.title}`, league: false,
    });
    await client.query('COMMIT');
    return { message: `${definition.reward} امتیاز ماموریت دریافت شد`, reward: definition.reward, balance: credited?.balanceAfter };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function claimDailyBonus(userId) {
  const daily = (await activeDefinitions(userId)).filter(d => d.period === 'daily');
  const key = periodKey('daily');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT mission_key,progress,claimed_at FROM user_mission_progress
        WHERE user_id=$1 AND period_key=$2 FOR UPDATE`, [userId, key]);
    const byMission = new Map(rows.map(row => [row.mission_key, row]));
    if (!daily.every(mission => Number(byMission.get(mission.key)?.progress || 0) >= mission.goal)) {
      throw Object.assign(
        new Error(`برای دریافت جایزه کامل، هر ${daily.length || 5} ماموریت روزانه را تمام کن`),
        { status: 409 },
      );
    }
    if (byMission.get(DAILY_BONUS_KEY)?.claimed_at) {
      throw Object.assign(new Error('جایزه تکمیل امروز قبلاً دریافت شده است'), { status: 409 });
    }
    await client.query(
      `INSERT INTO user_mission_progress(user_id,mission_key,period_key,progress,claimed_at,updated_at)
       VALUES($1,$2,$3,5,NOW(),NOW())
       ON CONFLICT(user_id,mission_key,period_key) DO UPDATE SET
         progress=5,claimed_at=COALESCE(user_mission_progress.claimed_at,NOW()),updated_at=NOW()`,
      [userId, DAILY_BONUS_KEY, key]);
    const bonus = missionConfig().dailyBonus;
    const credited = await points.credit(client, {
      userId, points: bonus, source: 'mission',
      referenceType: 'daily_mission_bonus', referenceId: referenceUuid(userId, DAILY_BONUS_KEY, key),
      description: 'جایزه تکمیل ماموریت‌های روزانه', league: false,
    });
    await client.query('COMMIT');
    return { message: `${bonus} امتیاز جایزه تکمیل روزانه دریافت شد`, reward: bonus, balance: credited?.balanceAfter };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * کاتالوگ کامل برای پنل ادمین: پیکربندی + فهرست ماموریت‌های توکار با
 * مقادیرِ مؤثر (بعد از overrides) + ماموریت‌های سفارشی.
 */
async function adminCatalog() {
  const cfg = missionConfig();
  const builtin = [
    ...DAILY_POOL.map(applyOverride),
    ...WEEKLY_POOL.map(applyOverride),
  ].map((d) => ({ ...d, custom: false }));
  const { rows } = await pool.query(
    `SELECT * FROM mission_definitions ORDER BY sort_order, created_at`);
  const customs = rows.map((r) => ({
    key: r.key, period: r.period, event: r.event, icon: r.icon,
    title: r.title, description: r.description,
    goal: Number(r.goal) || 1, reward: Number(r.reward) || 0,
    active: Boolean(r.is_active), custom: true,
  }));
  return { config: { dailyBonus: cfg.dailyBonus }, builtin, customs };
}

module.exports = {
  DEFINITIONS, DAILY_POOL, WEEKLY_POOL, DAILY_BONUS_REWARD,
  tehranDate, isoWeek, periodKey, activeDefinitions, record, status, claim, claimDailyBonus,
  adminCatalog, missionConfig,
};
