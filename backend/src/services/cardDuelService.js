const crypto = require('crypto');
const { pool } = require('../config/db');

// پنج راند = حس یک مسابقه واقعی، نه یک برخورد سه‌ثانیه‌ای.
// هر راند یک ویژگی متفاوت را می‌سنجد تا قوی‌ترین کارت همیشه برنده نباشد.
const DECK_SIZE = 5;
// فقط پنج نبرد امتیازی اخیر به کلاینت می‌رود؛ بقیه بعد از دو هفته پاک می‌شوند.
const HISTORY_KEEP = 5;
const HISTORY_TTL_DAYS = 14;
const ONLINE_STAKES = Object.freeze([100, 1000]);
const RARITIES = Object.freeze(['normal', 'silver', 'gold', 'premium', 'legend']);
const EFFECTS = Object.freeze(['none', 'finisher', 'wall', 'speedster', 'playmaker', 'lucky_star']);
const RARITY_BONUS = Object.freeze({ normal: 0, silver: 5, gold: 10, premium: 16, legend: 24 });
// ── هندیکپِ ربات: چقدر عمداً ضعیف‌تر از کاربر باشد ──
//
// تمرین باید قابلِ برد باشد ولی بی‌رقیب نه. این عدد تنها اهرمِ تنظیمِ
// سختیِ رباتِ تمرینی است و در `botDeck` استفاده می‌شود.
//
// ⚠️ مقدارش تجربی تنظیم شده، نه حدسی: با شبیه‌سازیِ ۳۰۰۰ بازی برای
//    هر سطحِ مهارت. با ۴ بازیکنِ متوسط ~۷۳٪ می‌برد. اگر عوضش کردی،
//    `scripts/testCardDuelBalance.js` را دوباره اجرا کن — همان تست
//    بازه را نگه می‌دارد.
const BOT_HANDICAP = 4;
const RARITY_LABEL = Object.freeze({ normal: 'معمولی', silver: 'نقره‌ای', gold: 'طلایی', premium: 'پرمیوم', legend: 'لجند' });
const EFFECT_LABEL = Object.freeze({
  none: 'بدون افکت', finisher: 'فینیشر', wall: 'دیوار دفاعی', speedster: 'سرعتی',
  playmaker: 'بازی‌ساز', lucky_star: 'ستاره خوش‌شانس',
});
// ── چرا هر راند «شعار» و «راهنمای کودکانه» دارد ──
//
// خواستهٔ مالک: «بازی رو خیلی جذاب و قابل فهم برای کاربر های گروه سنی
// کمتر هم کن».
//
// `label` نامِ راند است، `userText` توضیحِ بعد از نتیجه، و دو فیلدِ تازه:
//   • `cry`  — شعارِ کوتاهِ وسطِ صفحه هنگامِ شروعِ راند (انیمیشنِ سینمایی)
//   • `hint` — یک جملهٔ خیلی ساده که می‌گوید «کدام کارت را بازی کن»
//
// عمداً کوتاه و بدونِ اصطلاحِ فنی‌اند تا بچهٔ ده‌ساله هم بفهمد کدام عدد
// روی کارت‌ها مهم است. `icon` نامِ آیکونِ مشترکِ وب/اندروید است (دورِ ۲۳:
// جای ایموجی را گرفت تا شکلش دستِ سیستم‌عاملِ کاربر نباشد).
const ROUND_FOCUS = Object.freeze([
  {
    key: 'duel_speed', stat: 'speed', label: 'ضدحمله سرعتی',
    userText: 'سرعت کارت ضدحمله را ساخت',
    cry: 'سریع‌ترین کارتت را بفرست!', hint: 'عدد نهایی = سرعت + افکت آشکار؛ عدد بالاتر برنده است',
    icon: 'bolt',
  },
  {
    key: 'duel_technique', stat: 'technique', label: 'نبرد تکنیکی',
    userText: 'تکنیک کارت خط میانی را شکست',
    cry: 'وقتِ هنرنمایی است!', hint: 'عدد نهایی = تکنیک + افکت آشکار؛ عدد بالاتر برنده است',
    icon: 'sparkle',
  },
  {
    key: 'duel_attack', stat: 'attack', label: 'فشار حمله',
    userText: 'قدرت حمله خط دفاع را شکافت',
    cry: 'حمله کن!', hint: 'عدد نهایی = حمله + افکت آشکار؛ عدد بالاتر برنده است',
    icon: 'flame',
  },
  {
    key: 'duel_defense', stat: 'defense', label: 'دیوار دفاعی',
    userText: 'دفاع کارت جلوی ضدحمله را گرفت',
    cry: 'دروازه را ببند!', hint: 'عدد نهایی = دفاع + افکت آشکار؛ عدد بالاتر برنده است',
    icon: 'shield',
  },
  {
    key: 'duel_goal_chance', stat: 'goalChance', label: 'ضربه نهایی',
    userText: 'شانس گل ضربه آخر را ساخت',
    cry: 'ضربهٔ آخر، گل بزن!', hint: 'عدد نهایی = شانس گل + افکت آشکار؛ عدد بالاتر برنده است',
    icon: 'football',
  },
]);

// ═══════════════════════════════════════════════════════════════════════════
// دو عبارتِ تصویر — و چرا یکی کردنشان یک باگ بود
// ═══════════════════════════════════════════════════════════════════════════
//
// در **آرنای دوئل** باید همیشه طرحِ روی کارت دیده شود: کاربر باید عکسِ
// واقعیِ بازیکن را ببیند، نه پشتِ کارت را. `FRONT_IMAGE_SQL` برای همین است.
//
// ولی در **اینونتوری** قاعده فرق می‌کند: خواستهٔ صریحِ مالک این است که
// در لحظهٔ ثبت قرعه بیفتد و رو یا پشتِ کارت انتخاب شود
// («اینطوری زیبایی اینونتوری بیشتر میشه»). آن قرعه در ستونِ
// `display_design_id` ثابت می‌شود.
//
// ⚠️ کامیت `4f67a5e` («بازسازی کامل دوئل کارت») به‌درستی آرنا را به
//    `FRONT_IMAGE_SQL` برد، ولی همان تغییر را روی `/api/profile`،
//    `/api/bootstrap` و پروفایلِ عمومی هم اعمال کرد — که اینونتوری‌اند،
//    نه آرنا. نتیجه: قرعه همچنان می‌افتاد و در دیتابیس ذخیره می‌شد ولی
//    **هیچ‌جا خوانده نمی‌شد**. قابلیت بی‌صدا مُرد.
//
//    نشانه‌اش این بود که کامنتِ بالای آن کوئری‌ها هنوز می‌گفت «قرعه
//    خورده» و «LEFT JOIN» در حالی که کوئریِ جدید نه قرعه می‌خواند نه
//    LEFT JOIN داشت. کامنتی که با کدش نمی‌خواند، نشانهٔ ویرایشِ عجولانه
//    است.
//
//    هیچ تستِ واحدی این را نگرفت چون `testInventoryImage.js` نگهبانِ
//    **ساختاری** است و بخشِ نوشتن هنوز درست بود. تنها چیزی که گرفت
//    `tools/e2e_invside.py` بود که روی سرورِ زنده اجرا می‌شود.
const FRONT_IMAGE_SQL = `COALESCE(
  (SELECT pd.image_url FROM photo_card_designs pd
    WHERE pd.card_type_id = t.id AND pd.is_active = true
      AND COALESCE(pd.side, 'front') = 'front'
    ORDER BY pd.created_at DESC LIMIT 1),
  t.image_url
)`;

/**
 * تصویرِ اینونتوری — طرحی که در لحظهٔ ثبت قرعه خورده.
 *
 * ترتیبِ سه‌مرحله‌ایِ COALESCE عمدی است:
 *   ۱. `display_design_id` — قرعهٔ ثابتِ همان ردیفِ اینونتوری
 *   ۲. طرحِ «رو» — برای ردیف‌های قدیمی که پیش از مایگریشنِ ۰۴۴ ثبت
 *      شده‌اند و ستونشان NULL است
 *   ۳. `t.image_url` — کارتِ سیستمِ قدیمی که اصلاً طرحِ عکسی ندارد
 *
 * ⚠️ این عبارت به نامِ مستعارِ `i` برای `user_card_inventory` و `t`
 *    برای `card_types` وابسته است. هر کوئریِ تازه‌ای که از آن استفاده
 *    می‌کند باید همین نام‌ها را داشته باشد.
 */
const INVENTORY_IMAGE_SQL = `COALESCE(
  (SELECT pd.image_url FROM photo_card_designs pd
    WHERE pd.id = i.display_design_id AND pd.is_active = true),
  (SELECT pd.image_url FROM photo_card_designs pd
    WHERE pd.card_type_id = t.id AND pd.is_active = true
      AND COALESCE(pd.side, 'front') = 'front'
    ORDER BY pd.created_at DESC LIMIT 1),
  t.image_url
)`;

function int(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
function clamp(n, min, max) { return Math.min(max, Math.max(min, int(n))); }
function statInput(v, fallback = 50) { return clamp(v === undefined || v === null || v === '' ? fallback : v, 0, 100); }
function rarityInput(v) { const s = String(v || 'normal'); return RARITIES.includes(s) ? s : 'normal'; }
function effectInput(v) { const s = String(v || 'none'); return EFFECTS.includes(s) ? s : 'none'; }

/**
 * آیا مدیر این کارت را «کلکسیونی» علامت زده؟
 *
 * فرمِ HTML چک‌باکس را به‌صورت رشتهٔ `'true'`/`'on'` می‌فرستد، نه boolean —
 * و `multipart/form-data` (آپلودِ عکس) **همه چیز را** رشته می‌کند. یک
 * `=== true` ساده اینجا یعنی چک‌باکسِ تیک‌خورده بی‌صدا نادیده گرفته می‌شد.
 */
function collectibleInput(v, fallback = false) {
  if (v === undefined || v === null || v === '') return fallback === true;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'on' || s === 'yes';
}

function duelFieldsFromBody(body, fallback = {}) {
  // ── کارتِ کلکسیونی: استاتس ذخیره می‌شود ولی معنایی ندارد ──
  //
  // چرا استاتس را صفر نمی‌کنیم: اگر مدیر فردا همین کارت را به کارتِ بازی
  // تبدیل کند، مقادیرِ قبلی باید سرِ جایشان باشند. `is_collectible` تنها
  // چیزی است که تصمیم می‌گیرد، نه مقدارِ استاتس.
  const collectible = collectibleInput(
    body.isCollectible ?? body.collectible,
    fallback.is_collectible,
  );
  return {
    collectible,
    attack: statInput(body.duelAttack ?? body.attack, fallback.duel_attack ?? fallback.attack ?? 50),
    defense: statInput(body.duelDefense ?? body.defense, fallback.duel_defense ?? fallback.defense ?? 50),
    speed: statInput(body.duelSpeed ?? body.speed, fallback.duel_speed ?? fallback.speed ?? 50),
    technique: statInput(body.duelTechnique ?? body.technique, fallback.duel_technique ?? fallback.technique ?? 50),
    goalChance: statInput(body.duelGoalChance ?? body.goalChance, fallback.duel_goal_chance ?? fallback.goalChance ?? 50),
    energy: statInput(body.duelEnergy ?? body.energy, fallback.duel_energy ?? fallback.energy ?? 100),
    rarity: rarityInput(body.duelRarity ?? body.rarity ?? fallback.duel_rarity ?? fallback.rarity),
    effect: effectInput(body.duelEffect ?? body.effect ?? fallback.duel_effect ?? fallback.effect),
  };
}

/**
 * قدرتِ کلیِ کارت — برای نمایش و برای سهمِ `base` در امتیازِ راند.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا وزن‌ها برابر شدند
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * وزن‌های قبلی نامتقارن بودند:
 *
 *     حمله ۰٫۲۸ | دفاع ۰٫۱۸ | تکنیک ۰٫۱۸ | سرعت ۰٫۱۶ | شانس گل ۰٫۱۴
 *
 * ولی بازی **پنج راند** دارد و هر استات دقیقاً **یک** راند را تعیین
 * می‌کند. یعنی «حمله» دو برابرِ «شانس گل» به قدرتِ کل اضافه می‌کرد
 * بدونِ اینکه یک راندِ بیشتر ببرد.
 *
 * نتیجهٔ عملی: کارتی که ۲۵ واحد در حمله سرمایه‌گذاری کرده بود
 * totalPower=۹۹ می‌گرفت و همان کارت با سرمایه‌گذاری در شانسِ گل ۹۵.
 * پس برای بازیکنِ باهوش، **حمله همیشه انتخابِ برتر بود** — و این یعنی
 * چهار استاتِ دیگر تزئینی‌اند.
 *
 * حالا هر پنج استاتِ راندی وزنِ برابرِ ۰٫۱۹ دارند (جمعاً ۰٫۹۵).
 *
 * ── انرژی: از ۰٫۰۶ به ۰٫۰۵ ──
 *
 * ⚠️ انرژی **هیچ راندی ندارد** — یعنی استاتی است که به قدرت اضافه
 *    می‌کند ولی هرگز مستقیماً سنجیده نمی‌شود. حذفش نکردم چون در
 *    دیتابیس ستون دارد، مدیر تنظیمش می‌کند و روی کارت نمایش داده
 *    می‌شود؛ حذفِ ناگهانی یعنی کارت‌های موجود بی‌صدا ضعیف شوند.
 *    ولی سهمش کم نگه داشته شد تا استاتِ تعیین‌کننده نباشد.
 *
 * جمعِ کلِ وزن‌ها ۱٫۰۰ ماند تا دامنهٔ عددیِ قدرت عوض نشود و کارت‌های
 * موجود ناگهان قوی‌تر/ضعیف‌تر به نظر نرسند.
 */
// ── شانسِ راند ────────────────────────────────────────────────────────
//
// دامنهٔ عددِ صحیحِ شانس: [-LUCK_RANGE, +LUCK_RANGE] برای هر طرف.
//
// چرا اصلاً شانس؟ تا پیش از این، نتیجهٔ دوئل **کاملاً قطعی** بود: با دو
// دکِ معلوم، برندهٔ هر پنج راند از قبل معین بود. یعنی وقتی حریفِ قوی‌تری
// می‌دیدی، باختن حتمی بود و بازی کردن بی‌معنا. هیچ لحظهٔ «شاید ببرم»
// وجود نداشت.
//
// چرا دقیقاً ۶؟ اندازه‌گیری‌شده روی هر ۲۹ کارتِ فعالِ واقعی، ۴۰٬۰۰۰ مسابقه:
//
//     دامنه │ برد دک قوی‌تر │ راند وارونه │ راند مساوی
//     ──────┼───────────────┼─────────────┼────────────
//       ۰   │     ۸۰٪       │    ۰٪       │   ۴٫۸٪
//       ±۳  │     ۸۲٪       │    ۳٫۱٪     │   ۰٪
//     → ±۶  │     ۸۰٪       │    ۸٫۶٪     │   ۲٫۱٪
//       ±۱۲ │     ۸۰٪       │    ۱۳٫۴٪    │   ۰٪
//       ±۱۵ │     ۷۹٪       │    ۱۶٪      │   ۰٪
//
// ±۶ نقطهٔ تعادل است: حدود یک راند از هر دوازده وارونه می‌شود (کافی برای
// هیجان و کامبک)، ولی دکِ بهتر همچنان ۸۰٪ مسابقه‌ها را می‌برد — یعنی
// چیدنِ دک و جمع‌کردنِ کارتِ خوب هنوز کاملاً می‌ارزد.
//
// چرا بیشتر نه؟ خواستهٔ صریحِ مالک: «خیلی اعصاب‌خردکن نشود». از ±۱۲ به
// بالا کاربر شروع می‌کند به حس کردنِ اینکه استات‌ها بی‌معنی‌اند.
//
// نسبت به استات‌ها: انحراف معیارِ استات‌های راندی ۱۰ تا ۲۶ است، پس ±۶
// فقط اختلاف‌های تنگ را جابه‌جا می‌کند. اختلافِ بیش از ۱۲ واحد **هرگز**
// با شانس وارونه نمی‌شود — یعنی کارتِ آشکارا بهتر همیشه می‌برد.
const LUCK_RANGE = 6;

/**
 * شانسِ قطعی‌شده با seed.
 *
 * تصادفیِ واقعی (`Math.random`) اینجا سم است: بازپخشِ یک نبرد باید همان
 * نتیجه را بدهد، وگرنه نه تست تکرارپذیر است، نه می‌شود به کاربرِ معترض
 * نشان داد که «همین اتفاق افتاد». پس شانس از هشِ seedِ راند مشتق می‌شود
 * که خودش شاملِ شناسهٔ هر دو کارت و شمارهٔ راند است.
 *
 * FNV-1a + مرحلهٔ نهاییِ avalanche.
 *
 * ⚠️ چرا avalanche لازم بود (اندازه‌گیری‌شده، نه احتیاطِ نظری):
 *
 *   نسخهٔ اولِ این تابع فقط FNV-1a خام بود و `side` را به **انتهای**
 *   رشته می‌چسباند. چون دو ورودی فقط در آخرین بایت فرق داشتند، آخرین
 *   ضربِ FNV فرصتِ پخش کردنِ آن تفاوت را نداشت و بیت‌های پایین همبسته
 *   می‌ماندند. نتیجه: در ۲۰۰٬۰۰۰ نمونه، شانسِ X و O در **۱۲٫۳٪** موارد
 *   دقیقاً برابر می‌شد، در حالی که انتظارِ آماری ۱/۱۳ = ۷٫۷٪ است.
 *
 *   یعنی «هر دو طرف شانسِ یکسان گرفتند» ۶۰٪ بیشتر از حد طبیعی رخ می‌داد
 *   — کارِ شانس دقیقاً همان راندهای تنگ است و در آن‌ها بیش از انتظار
 *   خنثی می‌شد.
 *
 *   دو اصلاح: `side` به **ابتدا** منتقل شد تا از کلِ حلقه رد شود، و یک
 *   مرحلهٔ اختلاطِ نهایی (سبکِ murmur3 fmix32) اضافه شد.
 */
function seededLuck(seed, side) {
  if (!seed) return 0;
  let h = 0x811c9dc5;
  const str = `${side}|${seed}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // fmix32 — بیت‌های بالا را در پایین پخش می‌کند تا `%` سوگیری نگیرد.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  // `>>> 0` روی خطِ آخر حیاتی است: `^` نتیجهٔ **علامت‌دار** می‌دهد و اگر
  // بیتِ ۳۱ روشن باشد h منفی می‌شود. آن‌وقت `h % 13` در جاوااسکریپت
  // منفی برمی‌گردد و شانس تقریباً همیشه به ‎-6‎ می‌چسبد. یک بار همین
  // اتفاق افتاد و میانگینِ شانس به‌جای ۰ شد ‎-6.0‎.
  h = (h ^ (h >>> 16)) >>> 0;
  return (h % (2 * LUCK_RANGE + 1)) - LUCK_RANGE;
}

const STAT_WEIGHT = 0.19;   // هر پنج استاتِ راندی، برابر
const ENERGY_WEIGHT = 0.05; // استاتِ بدونِ راند

function totalPower(c) {
  const weighted =
    Number(c.duel_attack || c.attack || 0) * STAT_WEIGHT +
    Number(c.duel_defense || c.defense || 0) * STAT_WEIGHT +
    Number(c.duel_speed || c.speed || 0) * STAT_WEIGHT +
    Number(c.duel_technique || c.technique || 0) * STAT_WEIGHT +
    Number(c.duel_goal_chance || c.goalChance || 0) * STAT_WEIGHT +
    Number(c.duel_energy || c.energy || 0) * ENERGY_WEIGHT;
  const pointBoost = Math.min(22, Math.sqrt(Math.max(0, Number(c.point_value || c.pointValue || 0))) / 3.2);
  return Math.round(weighted + pointBoost + (RARITY_BONUS[c.duel_rarity || c.rarity] || 0));
}

function publicCard(row) {
  const c = {
    cardTypeId: row.card_type_id || row.cardTypeId || row.id,
    id: row.card_type_id || row.cardTypeId || row.id,
    name: row.name,
    imageUrl: row.image_url || row.imageUrl || null,
    pointValue: int(row.point_value ?? row.pointValue),
    quantity: int(row.quantity, 1),
    attack: int(row.duel_attack ?? row.attack, 50),
    defense: int(row.duel_defense ?? row.defense, 50),
    speed: int(row.duel_speed ?? row.speed, 50),
    technique: int(row.duel_technique ?? row.technique, 50),
    goalChance: int(row.duel_goal_chance ?? row.goalChance, 50),
    energy: int(row.duel_energy ?? row.energy, 100),
    rarity: rarityInput(row.duel_rarity ?? row.rarity),
    rarityLabel: RARITY_LABEL[rarityInput(row.duel_rarity ?? row.rarity)],
    effect: effectInput(row.duel_effect ?? row.effect),
    effectLabel: EFFECT_LABEL[effectInput(row.duel_effect ?? row.effect)],
    practiceOnly: row.practiceOnly === true,
  };
  c.duel_attack = c.attack;
  c.duel_defense = c.defense;
  c.duel_speed = c.speed;
  c.duel_technique = c.technique;
  c.duel_goal_chance = c.goalChance;
  c.duel_energy = c.energy;
  c.duel_rarity = c.rarity;
  c.duel_effect = c.effect;
  c.power = totalPower(c);
  return c;
}

/**
 * خواندنِ خامِ ویژگیِ راند از کارت.
 *
 * ⚠️ پیش‌فرضِ نهایی از `0` به `NaN` عوض شد. با `0`، تشخیصِ «کارت این
 *    ستون را ندارد» از «کارت این ستون را صفر دارد» ممکن نبود، و
 *    `focusValue` نمی‌توانست تصمیمِ درست بگیرد.
 *
 *    خودِ این تابع بیرون هم استفاده می‌شود (مثلاً در `analyzeDeck`)،
 *    پس مصرف‌کننده باید `Number.isFinite` را چک کند.
 */
function rawFocusStat(card, focus) {
  return card?.[focus.stat]
    ?? card?.[focus.key]
    ?? card?.[String(focus.key || '').replace('duel_', '')];
}

/**
 * خواندنِ ویژگیِ راند از کارت.
 *
 * ⚠️ این تابع عمداً `0` برمی‌گرداند (نه NaN) وقتی مقدار غایب است، چون
 *    هفت مصرف‌کنندهٔ دیگر دارد که با آن `Math.max`، مرتب‌سازی و مقایسه
 *    می‌کنند — و `NaN` همهٔ آن‌ها را بی‌صدا مسموم می‌کند
 *    (`NaN > 5` همیشه false، `Math.max(NaN, 9)` برابر NaN).
 *
 *    تشخیصِ «غایب» از «صفر» کارِ `focusValue` است که برای همین از
 *    `rawFocusStat` استفاده می‌کند.
 */
function focusStatOf(card, focus) {
  const raw = rawFocusStat(card, focus);
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function createSeededRandom(seed) {
  let turn = 0;
  return () => {
    const digest = crypto.createHash('sha256').update(`${seed}:${turn++}`).digest();
    return digest.readUInt32BE(0) / 0x100000000;
  };
}

function effectCurrentBonus(card, roundIndex, scoreDelta = 0) {
  switch (card.duel_effect || card.effect) {
    case 'speedster': return roundIndex === 0 ? 14 : roundIndex === 1 ? 4 : -2;
    case 'playmaker': return roundIndex === 1 ? 8 : roundIndex === 2 ? 6 : 2;
    case 'wall': return roundIndex === 3 ? 12 : scoreDelta > 0 ? 6 : 2;
    case 'finisher': return roundIndex === DECK_SIZE - 1 ? 20 : -10;
    case 'lucky_star': return roundIndex >= 2 ? 5 : 2;
    default: return 0;
  }
}

function effectFuturePenalty(card, roundIndex, focus) {
  const focusNow = focusStatOf(card, focus);
  const futureFocuses = ROUND_FOCUS.slice(roundIndex + 1);
  if (!futureFocuses.length) return 0;
  const futurePeak = Math.max(...futureFocuses.map(next => focusStatOf(card, next)));
  return futurePeak - focusNow >= 14 ? 8 : 0;
}

function recommendOrderForDeck(cards, score = { X: 0, O: 0 }) {
  const remaining = cards.map(publicCard);
  const picks = [];
  let delta = Number(score.X || 0) - Number(score.O || 0);
  for (let roundIndex = 0; roundIndex < ROUND_FOCUS.length && remaining.length; roundIndex++) {
    const focus = ROUND_FOCUS[roundIndex];
    let best = null;
    let bestScore = -Infinity;
    for (const card of remaining) {
      const focusNow = focusStatOf(card, focus);
      const urgent = delta < 0 && roundIndex >= 2 ? 6 : 0;
      const safe = delta > 0 && card.effect === 'wall' ? 4 : 0;
      const rating = focusNow * 3.1 + totalPower(card) * 0.72
        + effectCurrentBonus(card, roundIndex, delta)
        + urgent + safe - effectFuturePenalty(card, roundIndex, focus);
      if (rating > bestScore) {
        bestScore = rating;
        best = { card, rating, focusNow };
      }
    }
    if (!best) break;
    picks.push({
      round: roundIndex + 1,
      focus: focus.label,
      cardTypeId: best.card.cardTypeId,
      name: best.card.name,
      power: best.card.power,
      focusStat: best.focusNow,
      effect: best.card.effect,
      reason: `${best.card.name} برای «${focus.label}» با عدد ${best.focusNow} و افکت ${best.card.effectLabel} بهترین فشار را می‌دهد`,
    });
    delta += best.card.power >= 78 ? 1 : 0;
    const index = remaining.findIndex(item => String(item.cardTypeId) === String(best.card.cardTypeId));
    if (index > -1) remaining.splice(index, 1);
  }
  return picks;
}

function analyzeDeck(cards) {
  const deck = cards.map(publicCard);
  if (deck.length !== DECK_SIZE) {
    return { ready: false, warnings: ['ترکیب کامل نیست'], strengths: [], recommendedOrder: [] };
  }
  const byFocus = Object.fromEntries(ROUND_FOCUS.map(focus => {
    const values = deck.map(card => focusStatOf(card, focus));
    return [focus.stat, {
      label: focus.label,
      average: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
      min: Math.min(...values),
      max: Math.max(...values),
    }];
  }));
  const effects = new Set(deck.map(card => card.effect));
  const rarities = new Set(deck.map(card => card.rarity));
  const strengths = [];
  const warnings = [];
  if (Math.min(...Object.values(byFocus).map(entry => entry.average)) >= 61) {
    strengths.push('ترکیب متعادل است و هیچ راندی را عملاً خالی نمی‌گذارد');
  }
  if (byFocus.speed.max >= 82) strengths.push('شروع خیلی تیزی برای راند سرعت داری');
  if (effects.has('finisher')) strengths.push('فینیشر واقعی برای ضربهٔ نهایی داری');
  if (effects.has('wall') && byFocus.defense.average >= 62) strengths.push('در راند دفاع می‌توانی tempo بازی را خفه کنی');
  if (rarities.size >= 4) strengths.push('تنوع rarity بالاست و deck حس یکنواخت ندارد');
  if (byFocus.defense.average < 58 && !effects.has('wall')) warnings.push('میانگین دفاع پایین است؛ اگر راند چهارم عقب بیفتی سخت برمی‌گردی');
  if (byFocus.speed.average < 58) warnings.push('شروع deck کند است و احتمال از دست دادن راند اول بالاست');
  if (byFocus.goalChance.average < 60 && !effects.has('finisher')) warnings.push('برای ضربهٔ نهایی هم finish stat پایین است هم فینیشر نداری');
  if (!effects.has('playmaker') && byFocus.technique.average < 60) warnings.push('راند تکنیکی بدون playmaker می‌تواند سوراخ deck شود');
  const recommendedOrder = recommendOrderForDeck(deck);
  const lead = recommendedOrder[0] || null;
  return {
    ready: true,
    strengths,
    warnings,
    byFocus,
    raritySpread: [...rarities],
    effectSpread: [...effects],
    recommendedLeadCardId: lead?.cardTypeId || null,
    recommendedLeadReason: lead?.reason || '',
    recommendedOrder,
  };
}

function suggestDeckFromPool(cards) {
  const pool = cards.map(publicCard);
  if (pool.length < DECK_SIZE) return null;
  const picked = [];
  for (const focus of ROUND_FOCUS) {
    const candidate = pool
      .filter(card => !picked.find(item => String(item.cardTypeId) === String(card.cardTypeId)))
      .sort((a, b) => (focusStatOf(b, focus) + effectCurrentBonus(b, picked.length) + totalPower(b) * 0.45)
        - (focusStatOf(a, focus) + effectCurrentBonus(a, picked.length) + totalPower(a) * 0.45))[0];
    if (candidate) picked.push(candidate);
  }
  while (picked.length < DECK_SIZE) {
    const candidate = pool
      .filter(card => !picked.find(item => String(item.cardTypeId) === String(card.cardTypeId)))
      .sort((a, b) => totalPower(b) - totalPower(a))[0];
    if (!candidate) break;
    picked.push(candidate);
  }
  return {
    cardTypeIds: picked.map(card => card.cardTypeId),
    cards: picked,
    insights: analyzeDeck(picked),
  };
}

async function playableCards(userId, client = pool) {
  const { rows } = await client.query(
    `SELECT t.id AS card_type_id, t.name, ${FRONT_IMAGE_SQL} AS image_url,
            t.point_value, i.quantity,
            t.duel_attack, t.duel_defense, t.duel_speed, t.duel_technique,
            t.duel_goal_chance, t.duel_energy, t.duel_rarity, t.duel_effect
       FROM user_card_inventory i
       JOIN card_types t ON t.id = i.card_type_id
      WHERE i.user_id=$1 AND i.consumed_in_reward=false AND i.quantity > 0 AND t.is_active=true
        -- کارتِ کلکسیونی استاتس ندارد و نباید در آرنا دیده شود. این تنها
        -- دروازهٔ ورودِ کارت به دوئل است: هم فهرستِ انتخاب و هم
        -- validateDeck از همین تابع می‌گذرند، پس فیلتر کردن اینجا یعنی
        -- کاربر نه می‌تواند ببیندش نه می‌تواند با دستکاریِ درخواست
        -- واردِ ترکیبش کند.
        AND t.is_collectible = false
      ORDER BY t.point_value DESC, t.name`, [userId]);
  return rows.map(publicCard);
}

async function validateDeck(userId, ids, client = pool) {
  if (!Array.isArray(ids) || ids.length !== DECK_SIZE) {
    const e = new Error(`تیم باید دقیقاً ${DECK_SIZE} کارت داشته باشد`); e.status = 400; throw e;
  }
  const clean = ids.map(x => String(x || '').trim()).filter(Boolean);
  if (clean.length !== DECK_SIZE || new Set(clean).size !== DECK_SIZE) {
    const e = new Error('پنج کارت متفاوت انتخاب کنید'); e.status = 400; throw e;
  }
  const cards = await playableCards(userId, client);
  const byId = new Map(cards.map(c => [String(c.cardTypeId), c]));
  const picked = clean.map(id => byId.get(id));
  if (picked.some(c => !c)) {
    const e = new Error('یکی از کارت‌های انتخابی در کلکسیون شما نیست'); e.status = 400; throw e;
  }
  return picked;
}

async function getDeck(userId, client = pool) {
  const { rows } = await client.query(
    'SELECT user_id, card_type_ids, updated_at FROM card_duel_decks WHERE user_id=$1',
    [userId],
  );
  return rows[0] || null;
}

async function deckCards(userId, client = pool) {
  const deck = await getDeck(userId, client);
  if (!deck) return { deck: null, cards: [] };
  try {
    return { deck, cards: await validateDeck(userId, deck.card_type_ids, client) };
  } catch (_) {
    return { deck: { ...deck, invalid: true }, cards: [] };
  }
}

async function saveDeck(userId, ids) {
  const cards = await validateDeck(userId, ids);
  const clean = cards.map(c => c.cardTypeId);
  const { rows } = await pool.query(
    `INSERT INTO card_duel_decks(user_id, card_type_ids, ghost_enabled, updated_at)
     VALUES($1,$2,false,NOW())
     ON CONFLICT(user_id) DO UPDATE SET
       card_type_ids=EXCLUDED.card_type_ids,
       ghost_enabled=false,
       updated_at=NOW()
     RETURNING user_id, card_type_ids, updated_at`, [userId, clean]);
  return { deck: rows[0], cards, message: 'ترکیب پنج‌کارتی ذخیره شد' };
}

/**
 * بونوسِ افکتِ کارت در منطقِ شفاف نسخهٔ ۲.
 *
 * افکت‌ها دیگر قرعه، post-processing یا برگرداندنِ پنهانیِ نتیجه ندارند.
 * هر افکت در راندِ خودش یک عددِ کوچک و قطعی می‌دهد و همان عدد کنارِ
 * ویژگیِ کارت روی Android و Web نمایش داده می‌شود. بازیکنِ با استاتِ
 * بهتر می‌تواند با اختلافِ کافی افکت را شکست بدهد.
 */
function effectBonus(card, roundIndex, prevWon) {
  // نسخهٔ ۲ منطق دوئل عمداً هیچ شانس یا عدد پنهانی ندارد. افکت‌ها
  // قطعی، کوچک و فقط در راندِ مرتبط فعال‌اند؛ همان بونوسی که اینجا
  // برمی‌گردد عیناً در breakdown و UI دیده می‌شود.
  switch (card.duel_effect || card.effect) {
    case 'speedster': return roundIndex === 0 ? 6 : 0;
    case 'playmaker': return roundIndex > 0 && prevWon ? 4 : 0;
    case 'wall': return roundIndex === 3 ? 6 : 0;
    case 'finisher': return roundIndex === DECK_SIZE - 1 ? 6 : 0;
    case 'lucky_star': return roundIndex >= 2 ? 3 : 0;
    default: return 0;
  }
}

/**
 * مقدارِ ویژگیِ راند.
 *
 * ⚠️ باگِ `|| 50` که اینجا بود:
 *
 *   کارتی با استاتِ **صفر** به‌جای صفر، مقدارِ ۵۰ می‌گرفت — چون در
 *   جاوااسکریپت `0` مقدارِ falsy است. یعنی مدیر می‌توانست کارتی با
 *   سرعتِ صفر بسازد و آن کارت در راندِ سرعت مثلِ کارتی با سرعتِ متوسط
 *   رفتار می‌کرد.
 *
 *   اندازه‌گیری: کارتِ «سرعت ۰» در برابر «سرعت ۵۰» فقط ۵۷٪ می‌باخت،
 *   در حالی که باید تقریباً همیشه ببازد.
 *
 *   این هم به سودِ کاربر است هم به ضررش: کارتِ ضعیفِ او تقویت می‌شود
 *   ولی کارتِ ضعیفِ حریف هم همین‌طور. در هر صورت **عددی که روی کارت
 *   نوشته شده با عددی که در محاسبه می‌رود فرق دارد** — و این دقیقاً
 *   همان حسِ «منطقِ بازی درست نیست» را می‌سازد.
 *
 *   حالا فقط وقتی مقدار واقعاً غایب است (undefined/null/NaN) از ۵۰
 *   استفاده می‌شود، نه وقتی صفر است.
 */
function focusValue(card, focus) {
  const raw = rawFocusStat(card, focus);
  if (raw === undefined || raw === null || raw === '') return 50;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 50;
}

/**
 * تنها فرمولِ نتیجهٔ هر یک از پنج راند:
 *
 *     عدد نهایی = ویژگی اعلام‌شدهٔ همان راند + افکت آشکار
 *
 * نسخه‌های قبلی قدرت کلی، دفاعِ حریف، شانس و آستانهٔ مساوی را هم وارد
 * می‌کردند. در نتیجه متن می‌گفت «بالاترین تکنیک برنده است» ولی موتور
 * چیز دیگری را داوری می‌کرد. این قرارداد عمداً کوتاه است تا هم کودک،
 * هم تست و هم کلاینت دقیقاً یک حقیقت را ببینند.
 */
function roundScoreBreakdown(card, _opp, focus, roundIndex, prevWon, luck = 0) {
  // قراردادِ ساده و قابل‌اثباتِ منطق نسخهٔ ۲:
  //
  //   عدد نهایی راند = ویژگی اعلام‌شده + بونوس افکتِ آشکار + شانس
  //
  // قدرت کلی، rarity و دفاعِ نامرتبط همچنان دخالت ندارند. شانس هم
  // **پنهان نیست**: به‌عنوان جزء جداگانه در breakdown برمی‌گردد تا
  // کلاینت بتواند «۸۴ + افکت ۶ + شانس ۳− = ۸۷» را نشان دهد. اصل
  // تغییرناپذیر همان است: هر عددی که بازیکن می‌بیند همان عددی است که
  // برنده را تعیین می‌کند.
  const focusVal = focusValue(card, focus);
  const effect = effectBonus(card, roundIndex, prevWon);
  const total = focusVal + effect + luck;
  const sign = luck >= 0 ? '+' : '−';
  return {
    base: 0,
    focus: Number(focusVal.toFixed(2)),
    attackMix: 0,
    defensePenalty: 0,
    effectBonus: effect,
    luck,
    luckRange: LUCK_RANGE,
    wallAdjustment: 0,
    total,
    equation: `${focusVal}+${effect}${sign}${Math.abs(luck)}=${total}`,
  };
}

function winnerReason(winner, focus, cardX, cardO, breakdownX, breakdownO) {
  const focusX = focusValue(cardX, focus);
  const focusO = focusValue(cardO, focus);
  const effectX = Number(breakdownX.effectBonus || 0);
  const effectO = Number(breakdownO.effectBonus || 0);
  const powerX = Number(breakdownX.total || 0);
  const powerO = Number(breakdownO.total || 0);
  const luckX = Number(breakdownX.luck || 0);
  const luckO = Number(breakdownO.luck || 0);
  const part = (base, effect, luck, total) => {
    const bits = [`${base}`];
    if (effect) bits.push(`افکت ${effect}`);
    if (luck) bits.push(`شانس ${luck > 0 ? '+' : '−'}${Math.abs(luck)}`);
    return bits.length > 1 ? `${bits.join(' + ')} = ${total}` : `${total}`;
  };
  const formulaX = part(focusX, effectX, luckX, powerX);
  const formulaO = part(focusO, effectO, luckO, powerO);
  if (winner === 'DRAW') {
    return `راند «${focus.label}» مساوی شد: ${cardX.name} با ${formulaX} و ${cardO.name} با ${formulaO}؛ امتیازی اضافه نشد`;
  }
  const champ = winner === 'X' ? cardX : cardO;
  const other = winner === 'X' ? cardO : cardX;
  const champFormula = winner === 'X' ? formulaX : formulaO;
  const otherFormula = winner === 'X' ? formulaO : formulaX;
  return `${champ.name} در «${focus.label}» با عدد نهایی ${champFormula} در برابر ${otherFormula} از ${other.name} برد`;
}

function resolveRound(cardX, cardO, roundIndex, previousWinner = null, random = null, seed = '') {
  const x = publicCard(cardX);
  const o = publicCard(cardO);
  const focus = ROUND_FOCUS[roundIndex] || ROUND_FOCUS[ROUND_FOCUS.length - 1];
  // `random` در امضای عمومی برای سازگاری replayهای قدیمی می‌ماند، اما
  // مصرف نمی‌شود: شانس از seed مشتق می‌شود، نه از یک مولدِ حالت‌دار.
  // نتیجه همچنان تعیینی است — همان seed، همان حکم — ولی دیگر صرفاً
  // از روی استات‌ها قابل پیش‌بینی نیست.
  const luckX = seededLuck(seed, 'X');
  const luckO = seededLuck(seed, 'O');
  const breakdownX = roundScoreBreakdown(x, o, focus, roundIndex, previousWinner === 'X', luckX);
  const breakdownO = roundScoreBreakdown(o, x, focus, roundIndex, previousWinner === 'O', luckO);
  const powerX = breakdownX.total;
  const powerO = breakdownO.total;
  // هیچ post-processing پنهانی بعد از breakdown وجود ندارد. `powerX`
  // و `powerO` همان عددهای روی صفحه‌اند و علامت اختلاف، حکم را می‌سازد.
  const diff = powerX - powerO;
  const winner = diff > 0 ? 'X' : diff < 0 ? 'O' : 'DRAW';
  const focusStatX = focusValue(x, focus);
  const focusStatO = focusValue(o, focus);
  return {
    round: roundIndex + 1,
    seed,
    title: focus.label,
    text: focus.userText,
    focusKey: focus.stat,
    focusLabel: focus.label,
    focusStatX,
    focusStatO,
    focusGap: Math.abs(focusStatX - focusStatO),
    cardX: x,
    cardO: o,
    powerX,
    powerO,
    powerGap: Math.abs(powerX - powerO),
    luckX,
    luckO,
    luckRange: LUCK_RANGE,
    breakdownX,
    breakdownO,
    winner,
    logicVersion: 2,
    winnerCardId: winner === 'X' ? x.cardTypeId : winner === 'O' ? o.cardTypeId : null,
    reason: winnerReason(winner, focus, x, o, breakdownX, breakdownO),
    cinematic: winner === 'DRAW' ? 'برخورد برابر!' : 'ضربهٔ برنده ثبت شد!',
  };
}

function scoreFromHistory(history = []) {
  return history.reduce((score, round) => {
    if (round?.winner === 'X') score.X += 1;
    if (round?.winner === 'O') score.O += 1;
    return score;
  }, { X: 0, O: 0 });
}

function simulate(userCards, opponentCards, { opponentName = 'حریف', random = null, seed = '' } = {}) {
  let previousWinner = null;
  const rounds = [];
  for (let i = 0; i < DECK_SIZE; i++) {
    const roundSeed = seed ? `${seed}:round:${i + 1}` : '';
    const resolved = resolveRound(userCards[i], opponentCards[i], i, previousWinner, random, roundSeed);
    rounds.push({
      round: resolved.round, title: resolved.title, text: resolved.text,
      focusLabel: resolved.focusLabel,
      focusStatX: resolved.focusStatX,
      focusStatO: resolved.focusStatO,
      userCard: resolved.cardX, opponentCard: resolved.cardO,
      userPower: resolved.powerX, opponentPower: resolved.powerO,
      outcome: resolved.winner === 'X' ? 'user_goal' : resolved.winner === 'O' ? 'opponent_goal' : 'draw',
      winner: resolved.winner,
      winnerCardId: resolved.winnerCardId,
      logicVersion: resolved.logicVersion,
      cinematic: resolved.cinematic,
      reason: resolved.reason,
      seed: resolved.seed,
      breakdownX: resolved.breakdownX,
      breakdownO: resolved.breakdownO,
    });
    const scoreAfter = scoreFromHistory(rounds);
    rounds[rounds.length - 1].scoreAfter = { ...scoreAfter };
    previousWinner = resolved.winner;
  }
  const score = scoreFromHistory(rounds);
  const winnerSide = score.X > score.O ? 'user' : score.O > score.X ? 'opponent' : 'draw';
  const decisive = rounds
    .filter(round => round.winner !== 'DRAW')
    .map(round => ({
      side: round.winner === 'X' ? 'user' : 'opponent',
      card: round.winner === 'X' ? round.userCard : round.opponentCard,
      margin: Math.abs(round.userPower - round.opponentPower),
      roundPower: round.winner === 'X' ? round.userPower : round.opponentPower,
      round: round.round,
    }))
    .sort((a, b) => b.margin - a.margin || b.roundPower - a.roundPower);
  const fallback = {
    side: 'user', card: userCards[0], margin: 0,
    roundPower: rounds[0]?.userPower || 0, round: 1,
  };
  const mvp = decisive[0] || fallback;
  return {
    seed,
    logicVersion: 2,
    userScore: score.X, opponentScore: score.O, winnerSide, opponentName,
    mvp: {
      side: mvp.side, card: publicCard(mvp.card), round: mvp.round,
      margin: mvp.margin, roundPower: mvp.roundPower,
    },
    rounds,
  };
}

function starterDeck() {
  return [
    { id: '00000000-0000-4000-8000-000000000001', name: 'مهاجم تمرینی', stat: 62, rarity: 'normal', effect: 'speedster' },
    { id: '00000000-0000-4000-8000-000000000002', name: 'بازی‌ساز تمرینی', stat: 66, rarity: 'silver', effect: 'playmaker' },
    { id: '00000000-0000-4000-8000-000000000003', name: 'مدافع تمرینی', stat: 68, rarity: 'silver', effect: 'wall' },
    { id: '00000000-0000-4000-8000-000000000004', name: 'وینگر تمرینی', stat: 70, rarity: 'gold', effect: 'lucky_star' },
    { id: '00000000-0000-4000-8000-000000000005', name: 'فینیشر تمرینی', stat: 74, rarity: 'gold', effect: 'finisher' },
  ].map((item, index) => publicCard({
    card_type_id: item.id,
    name: item.name,
    image_url: null,
    point_value: 100 + index * 40,
    quantity: 1,
    duel_attack: item.stat + (index === 4 ? 8 : 0),
    duel_defense: item.stat + (index === 2 ? 8 : -4),
    duel_speed: item.stat + (index === 0 ? 10 : 0),
    duel_technique: item.stat + (index === 1 ? 10 : 0),
    duel_goal_chance: item.stat + (index === 4 ? 10 : 0),
    duel_energy: 100,
    duel_rarity: item.rarity,
    duel_effect: item.effect,
    practiceOnly: true,
  }));
}

/**
 * حریفِ تمرینی — هم‌تراز با کارت‌های کاربر، نه قوی‌تر.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * باگی که اینجا بود و چرا کاربر همیشه می‌باخت
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * نسخهٔ قبلی پایهٔ استاتِ بات را از `totalPower(کارتِ کاربر)` می‌ساخت.
 * این **خلطِ واحد** است و دو بار تورم می‌سازد:
 *
 *   ۱. `totalPower` یک استاتِ ۰..۱۰۰ نیست. مجموعِ وزن‌دارِ استات‌ها
 *      به‌علاوهٔ `pointBoost` (تا +۲۲ بابتِ امتیازِ کارت) و
 *      `RARITY_BONUS` (تا +۲۴ بابتِ لجند بودن) است. کارتی با استاتِ ۵۰
 *      ولی ۵۰۰۰ امتیاز و کمیابیِ لجند، `totalPower=99` می‌گیرد.
 *
 *   ۲. آن عددِ ۹۹ به‌عنوان **استاتِ خام** به بات داده می‌شد. بعد خودِ
 *      بات دوباره از مسیرِ `publicCard` و `totalPower` عبور می‌کرد و
 *      باز pointBoost و rarityBonus می‌گرفت — تورمِ روی تورم.
 *
 * نتیجهٔ اندازه‌گیری‌شده (۴۰۰۰ شبیه‌سازی برای هر ردیف):
 *
 *   | استاتِ کاربر | امتیاز | کمیابی  | نرخِ بردِ کاربر |
 *   |-------------|--------|---------|---------------|
 *   | ۵۰          | ۰      | معمولی  | **۰٫۱٪**      |
 *   | ۵۰          | ۵۰۰۰   | لجند    | **۰٫۰٪**      |
 *   | ۷۰          | ۱۰۰۰۰  | طلایی   | **۰٫۰٪**      |
 *   | ۸۰          | ۲۰۰۰۰  | لجند    | ۷٫۳٪          |
 *   | ۹۰          | ۵۰۰۰۰  | لجند    | ۹۵٫۸٪         |
 *
 * یعنی هرچه کارتِ کاربر **گران‌تر** بود، بات قوی‌تر می‌شد و کاربر
 * بیشتر می‌باخت — دقیقاً برعکسِ انتظار. و چون `clamp` روی ۸۸ می‌بست،
 * نرخِ برد بینِ استاتِ ۸۰ و ۹۰ از ۷٪ به ۹۵٪ می‌پرید: یک پرتگاه، نه یک
 * منحنی.
 *
 * ── چرا کاربر «امتیاز بات کمتر است ولی می‌برد» می‌دید ──
 *
 * چیپِ «ویژگی» روی صفحه `focusStat` را نشان می‌دهد که استاتِ خام است
 * (مثلاً ۵۰)، ولی برنده از روی `totalPower` تعیین می‌شد که عددِ دیگری
 * است. پس دو عددِ ناهم‌مقیاس به کاربر نشان داده می‌شد و تصمیم با
 * عددی گرفته می‌شد که او نمی‌دید.
 *
 * ── راهِ حل ──
 *
 * پایهٔ بات از **میانگینِ استاتِ خامِ** کارت‌های کاربر ساخته می‌شود، نه
 * از totalPower. سپس عمداً کمی **زیرِ** کاربر تنظیم می‌شود تا تمرین
 * حسِ پیشرفت بدهد. امتیاز و کمیابیِ بات هم با کاربر هم‌تراز می‌شود تا
 * pointBoost و rarityBonus یک‌طرفه نباشند.
 *
 * هدف: نرخِ بردِ کاربر در بازهٔ ۵۵٪ تا ۷۵٪ برای همهٔ سطوحِ کارت.
 * نگهبان: `scripts/testCardDuelBalance.js`.
 */
function botDeck(userCards) {
  const n = Math.max(1, userCards.length);
  // میانگینِ استاتِ خام — هم‌واحد با چیزی که بات دریافت می‌کند.
  const avgStat = userCards.reduce((sum, card) => {
    const c = publicCard(card);
    return sum + (c.attack + c.defense + c.speed + c.technique + c.goalChance) / 5;
  }, 0) / n;
  // ── چرا امتیاز و کمیابیِ بات **دقیقاً** برابرِ کاربر است ──
  //
  // `totalPower` سه جزء دارد: استاتِ وزن‌دار + `pointBoost` (تا +۲۲) +
  // `RARITY_BONUS` (تا +۲۴). اگر بات امتیاز/کمیابیِ کمتری بگیرد، آن دو
  // جزء به‌شکلِ **نامتناسب** به سودِ کاربر می‌شوند و مقدارِ برتری به
  // نوعِ کارتِ کاربر وابسته می‌ماند.
  //
  // این را اندازه گرفتم: با کمیابیِ یک‌پله‌کمتر و امتیازِ ۰٫۸ برابر،
  // نرخِ بردِ کاربر بین ۲٪ (کارتِ ضعیف) تا ۹۳٪ (کارتِ قوی) نوسان
  // می‌کرد — هیچ آفستی نمی‌توانست هم‌زمان هر دو سر را درست کند، چون
  // مشکل در آفست نبود بلکه در **شیبِ** متفاوتِ دو طرف بود.
  //
  // با برابر کردنِ این دو جزء، تفاوتِ `totalPower` دقیقاً برابرِ
  // تفاوتِ استاتِ خام می‌شود — یعنی یک عددِ قابلِ کنترل و مستقل از
  // اینکه کارتِ کاربر ارزان است یا گران.
  const points = userCards.map(c => Number(publicCard(c).pointValue) || 0).sort((a, b) => a - b);
  const medianPoint = points[Math.floor(points.length / 2)] || 0;
  const rarityRank = userCards.reduce((sum, card) => sum + RARITIES.indexOf(publicCard(card).rarity), 0) / n;

  const names = ['ربات سرعتی', 'ربات تاکتیکی', 'ربات دیوار', 'ربات وینگر', 'ربات فینیشر'];
  // ── چرا افکتِ بات محدود شد ──
  //
  // قبلاً هر پنج کارتِ بات یک افکتِ فعال داشتند (speedster، playmaker،
  // wall، lucky_star، finisher) در حالی که کارتِ واقعیِ کاربر معمولاً
  // `none` است. اندازه‌گیری: در راندِ اول بات ۱۵ امتیازِ رایگان از
  // `speedster` می‌گرفت — بیش از کلِ اثرِ استات‌ها. حتی وقتی استات‌ها را
  // برابر کردم، نرخِ بردِ کاربر ۱۵٪ ماند و تنها با خنثی کردنِ افکت‌ها
  // به بالای ۵۰٪ رسید.
  //
  // دو کارت افکت دارند تا مکانیزم به کاربر آموزش داده شود (تمرین باید
  // یاد بدهد)، سه کارتِ دیگر خنثی‌اند.
  const effects = ['none', 'playmaker', 'wall', 'none', 'none'];
  // ── چرا ترتیبِ تخصص‌ها به‌هم می‌ریزد ──
  //
  // `ROUND_FOCUS` به ترتیبِ speed→technique→attack→defense→goalChance
  // است. بونوس‌های قبلیِ بات دقیقاً روی همین ترتیب چیده شده بودند:
  // کارتِ اولش +۱۰ سرعت داشت و راندِ اول هم سرعت بود. یعنی دستِ بات
  // **از پیش برای ترتیبِ راندها بهینه** بود، در حالی که کارت‌های کاربر
  // به ترتیبی است که خودش چیده — معمولاً تصادفی.
  //
  // این تنهایی یک سوگیریِ ساختاری بود که هیچ‌کس عمداً طراحی‌اش نکرده
  // بود. حالا جای تخصص‌ها با seedِ تصادفی جابه‌جا می‌شود.
  const specialty = [0, 1, 2, 3, 4];
  for (let i = specialty.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [specialty[i], specialty[j]] = [specialty[j], specialty[i]];
  }
  return [0, 1, 2, 3, 4].map(i => {
    // ── چرا −۸ و شیبِ ۳ ──
    //
    // بات باید کمی ضعیف‌تر باشد (تمرین است، نه امتحان) ولی نه آن‌قدر که
    // بی‌معنی شود. شیبِ ملایمِ ۳ واحد بین کارتِ اول تا پنجم یعنی راندهای
    // آخر سخت‌تر می‌شوند و بازی قوسِ دراماتیک پیدا می‌کند.
    //
    // سقف ۹۶ به‌جای ۸۸: با استاتِ خام دیگر تورمی در کار نیست، پس بستنِ
    // زودهنگام فقط همان پرتگاهِ قبلی را می‌سازد.
    // ── چرا کفِ clamp تا ۵ پایین آمد ──
    //
    // کفِ قبلی ۳۰ بود. برای کاربری که کارت‌های استاتِ ۳۰ دارد، بات
    // نمی‌توانست زیرِ ۳۰ برود و عملاً هم‌قدرتِ او می‌شد: نرخِ برد ۱۲٪.
    // یعنی **ضعیف‌ترین کاربران بیشترین باخت را می‌خوردند** — بدترین
    // حالتِ ممکن برای بازیکنِ تازه‌وارد.
    //
    // ── چرا آفست از ۱۰ به ۴ کم شد ──
    //
    // آفستِ ۱۰ برای فرمولِ **قبلی** تنظیم شده بود که تمرکزِ راند در آن
    // وزنِ کمی داشت. با فرمولِ تازه (تمرکز غالب، شانسِ ±۳) همان آفست
    // بازی را بیش‌ازحد آسان می‌کرد: بازیکنِ متوسط ۸۵٪ می‌برد. با ۴،
    // نرخِ بردِ بازیکنِ متوسط ~۷۳٪ است — قابلِ برد ولی نه بی‌رقیب.
    // ── چرا `- 6` داخلِ پرانتز است: خنثی کردنِ خودِ نردبان ──
    //
    // `i * 3` برای i=0..4 میانگینِ +۶ دارد. بدونِ کم کردنِ آن، میانگینِ
    // استاتِ ربات از کاربر **بالاتر** می‌شد: با کاربرِ استاتِ ۵۰،
    // ربات میانگینِ ۵۲ تا ۵۴ می‌گرفت. این دقیقاً همان چیزی بود که
    // کاربرِ تازه‌وارد (که کارت‌هایش استاتِ یکسان دارند) را ۸۸٪
    // بازنده می‌کرد — چون وقتی همهٔ کارت‌ها یکسان‌اند، هیچ انتخابی
    // نمی‌تواند این کسری را جبران کند.
    //
    // حالا `i * 3 - 6` میانگینِ صفر دارد: نردبان فقط **توزیع** را
    // شیب‌دار می‌کند (راندهای آخر سخت‌تر) بدونِ اینکه کلِ حریف را
    // قوی‌تر کند. `RAMP` صریح نوشته شد تا اگر روزی شیب عوض شد، کسی
    // یادش نرود جبرانش را هم عوض کند.
    const RAMP = i * 3 - 6;
    const base = Math.max(5, Math.min(100,
      Math.round(avgStat - BOT_HANDICAP + RAMP + crypto.randomInt(-4, 5))));
    // کمیابی و امتیاز آینهٔ کاربرند (توضیحِ کامل بالاتر) تا تنها متغیرِ
    // تعیین‌کننده، استاتِ خام باشد.
    const rarity = RARITIES[clamp(Math.round(rarityRank), 0, RARITIES.length - 1)];
    const spec = specialty[i];
    return publicCard({
      card_type_id: `bot-${i + 1}`, name: names[i],
      image_url: null, point_value: medianPoint, quantity: 1,
      // ── چرا بونوسِ تخصص از ۵ به ۲ آمد ──
      //
      // وقتی کارت‌های کاربر همگی استاتِ یکسان دارند (حالتِ عادیِ
      // تازه‌وارد)، هیچ انتخابی نمی‌تواند برتری بسازد و تنها متغیرِ
      // باقی‌مانده همین بونوس است. با ۵، ربات تقریباً هر راند را
      // می‌برد: کاربر ۹۵٪ می‌باخت. با ۲، تخصص هنوز حس می‌شود ولی
      // سرنوشتِ راند را یک‌تنه تعیین نمی‌کند.
      duel_attack: clamp(base + (spec === 2 ? 2 : 0), 0, 100),
      duel_defense: clamp(base + (spec === 3 ? 2 : 0), 0, 100),
      duel_speed: clamp(base + (spec === 0 ? 2 : 0), 0, 100),
      duel_technique: clamp(base + (spec === 1 ? 2 : 0), 0, 100),
      duel_goal_chance: clamp(base + (spec === 4 ? 2 : 0), 0, 100),
      duel_energy: 100,
      duel_rarity: rarity, duel_effect: effects[i],
    });
  });
}

async function pruneBattleHistory(client = pool) {
  // تمرین با ربات لاگ نمی‌خواهد؛ ردیف‌های کهنه هم فقط جدول را سنگین می‌کنند.
  const bot = await client.query(`DELETE FROM card_duel_battles WHERE mode = 'bot'`);
  const old = await client.query(
    `DELETE FROM card_duel_battles WHERE created_at < NOW() - INTERVAL '14 days'`,
  );
  return (bot.rowCount || 0) + (old.rowCount || 0);
}

let lastHistoryPruneAt = 0;
async function maybePruneBattleHistory() {
  if (Date.now() - lastHistoryPruneAt < 30 * 60 * 1000) return;
  lastHistoryPruneAt = Date.now();
  try {
    const removed = await pruneBattleHistory();
    if (removed) console.log(`[card-duel] pruned ${removed} old battle log(s)`);
  } catch (err) {
    console.error('[card-duel] history prune failed:', err.message);
  }
}

async function recentBattles(userId, limit = HISTORY_KEEP, client = pool) {
  const { rows } = await client.query(
    `SELECT b.*, u.nickname AS user_nickname, o.nickname AS opponent_nickname,
            s.status AS stake_status
       FROM card_duel_battles b
       JOIN users u ON u.id=b.user_id
       LEFT JOIN users o ON o.id=b.opponent_user_id
       LEFT JOIN game_stake_matches s ON s.id=b.match_id
      WHERE (b.user_id=$1 OR b.opponent_user_id=$1)
        AND b.mode IN ('online','lobby')
      ORDER BY b.created_at DESC LIMIT $2`,
    [userId, Math.min(HISTORY_KEEP, Math.max(1, Number(limit) || HISTORY_KEEP))]);
  return rows.map(r => {
    const primary = String(r.user_id) === String(userId);
    return {
      id: r.id, mode: r.mode,
      userId, opponentUserId: primary ? r.opponent_user_id : r.user_id,
      userNickname: primary ? r.user_nickname : r.opponent_nickname,
      opponentNickname: primary ? r.opponent_nickname : r.user_nickname,
      userScore: primary ? r.user_score : r.opponent_score,
      opponentScore: primary ? r.opponent_score : r.user_score,
      winnerUserId: r.winner_user_id, stakePoints: r.stake_points,
      userDelta: primary ? r.user_delta : r.opponent_delta,
      opponentDelta: primary ? r.opponent_delta : r.user_delta,
      matchId: r.match_id,
      settlementStatus: Number(r.stake_points) === 0
        ? 'settled'
        : r.stake_status === 'reserved' ? 'pending'
          : r.stake_status === 'refunded' ? 'refunded' : 'settled',
      battleLog: r.battle_log, createdAt: r.created_at,
    };
  });
}

async function balanceSnapshot(limit = 200, client = pool) {
  const { rows } = await client.query(
    `SELECT battle_log, created_at
       FROM card_duel_battles
      WHERE mode IN ('online','lobby')
      ORDER BY created_at DESC
      LIMIT $1`,
    [Math.min(1000, Math.max(20, Number(limit) || 200))],
  );
  const focus = {};
  const rarityWins = {};
  const effectWins = {};
  let rounds = 0;
  for (const row of rows) {
    let log = row.battle_log;
    if (typeof log === 'string') {
      try { log = JSON.parse(log); } catch { log = null; }
    }
    for (const round of (log?.rounds || [])) {
      rounds += 1;
      const key = round.focusLabel || round.title || 'unknown';
      focus[key] ||= { rounds: 0, draws: 0, avgPowerGap: 0 };
      focus[key].rounds += 1;
      focus[key].avgPowerGap += Math.abs(Number(round.userPower || 0) - Number(round.opponentPower || 0));
      if (round.outcome === 'draw') focus[key].draws += 1;
      for (const side of ['userCard', 'opponentCard']) {
        const card = round[side] || {};
        const won = side === 'userCard'
          ? round.outcome === 'user_goal'
          : round.outcome === 'opponent_goal';
        if (!won) continue;
        const rarity = rarityInput(card.rarity || card.duel_rarity);
        const effect = effectInput(card.effect || card.duel_effect);
        rarityWins[rarity] = (rarityWins[rarity] || 0) + 1;
        effectWins[effect] = (effectWins[effect] || 0) + 1;
      }
    }
  }
  Object.values(focus).forEach((entry) => {
    entry.avgPowerGap = entry.rounds ? Number((entry.avgPowerGap / entry.rounds).toFixed(2)) : 0;
  });
  return {
    sampledBattles: rows.length,
    sampledRounds: rounds,
    focus,
    rarityWins,
    effectWins,
  };
}

async function status(userId) {
  await maybePruneBattleHistory();
  const [cards, dc, recent] = await Promise.all([
    playableCards(userId), deckCards(userId), recentBattles(userId, HISTORY_KEEP),
  ]);
  const activeInsights = dc.cards.length === DECK_SIZE ? analyzeDeck(dc.cards) : null;
  const suggestedDeck = suggestDeckFromPool(cards);
  return {
    deckSize: DECK_SIZE,
    totalRounds: DECK_SIZE,
    onlineStakes: ONLINE_STAKES,
    playableCards: cards,
    practiceCards: starterDeck(),
    activeDeck: dc.deck ? { ...dc.deck, cards: dc.cards } : null,
    deckInsights: activeInsights,
    suggestedDeck: suggestedDeck ? {
      cardTypeIds: suggestedDeck.cardTypeIds,
      cards: suggestedDeck.cards,
      insights: suggestedDeck.insights,
    } : null,
    recentBattles: recent,
    rarities: RARITIES.map(id => ({ id, label: RARITY_LABEL[id], bonus: RARITY_BONUS[id] })),
    effects: EFFECTS.map(id => ({ id, label: EFFECT_LABEL[id] })),
    focuses: ROUND_FOCUS,
  };
}

async function botBattle(userId, ids = null) {
  const userCards = ids ? await validateDeck(userId, ids) : (await deckCards(userId)).cards;
  if (userCards.length !== DECK_SIZE) { const e = new Error('اول ترکیب پنج‌کارتی را آماده کن'); e.status = 400; throw e; }
  const opponentCards = botDeck(userCards);
  const seed = `bot:${userId}:${Date.now()}`;
  const sim = simulate(userCards, opponentCards, { opponentName: 'ربات تمرینی', seed });
  // تمرین با ربات تاریخچه نمی‌سازد؛ جدول فقط نبرد امتیازی را نگه می‌دارد.
  return {
    battle: null,
    result: sim,
    deckInsights: analyzeDeck(userCards),
    message: 'تمرین با ربات رایگان است و در تاریخچه ثبت نمی‌شود',
  };
}

async function recordEngineBattle({ matchId = null, playerX, playerO, state, winner, stake = 0, netPot = 0, vsBot = false, matchMode = null }) {
  if (vsBot) return null;
  if (!playerX?.id || !state?.decks?.X?.length) return null;
  const draw = winner === 'DRAW';
  const winnerId = draw ? null : winner === 'X' ? playerX.id : (vsBot ? null : playerO?.id || null);
  const mode = vsBot ? 'bot' : (matchMode === 'lobby' ? 'lobby' : 'online');
  const xDelta = draw || !stake ? 0 : winner === 'X' ? Math.max(0, Number(netPot) - Number(stake)) : -Number(stake);
  const oDelta = draw || !stake || vsBot ? 0 : winner === 'O' ? Math.max(0, Number(netPot) - Number(stake)) : -Number(stake);
  const { rows } = await pool.query(
    `INSERT INTO card_duel_battles(match_id,mode,user_id,opponent_user_id,
       user_card_type_ids,opponent_card_type_ids,user_score,opponent_score,
       winner_user_id,stake_points,user_delta,opponent_delta,battle_log)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [matchId, mode, playerX.id, vsBot ? null : playerO?.id || null,
      state.decks.X.map(c => c.cardTypeId),
      vsBot ? null : state.decks.O.map(c => c.cardTypeId),
      Number(state.score?.X || 0), Number(state.score?.O || 0), winnerId,
      Number(stake || 0), xDelta, oDelta,
      JSON.stringify({ score: state.score, rounds: state.history || [] })],
  );
  return rows[0];
}

module.exports = {
  DECK_SIZE, ONLINE_STAKES, RARITIES, EFFECTS, ROUND_FOCUS,
  FRONT_IMAGE_SQL, INVENTORY_IMAGE_SQL,
  RARITY_LABEL, EFFECT_LABEL, duelFieldsFromBody, collectibleInput, publicCard, totalPower,
  playableCards, validateDeck, deckCards, status, saveDeck, botBattle,
  starterDeck, botDeck, resolveRound, simulate, scoreFromHistory, recentBattles, recordEngineBattle,
  LUCK_RANGE, seededLuck,
  analyzeDeck, suggestDeckFromPool, createSeededRandom, focusStatOf, balanceSnapshot,
  // ⚠️ این دو تا اینجا نبودند و کرونِ شبانهٔ server.js:2290 هر شب ساعت
  // ۴:۱۷ با «cardDuel.pruneBattleHistory is not a function» می‌شکست.
  // هر دو مسیرِ پاکسازی مرده بود، پس جدولِ نبردها هرگز هرس نمی‌شد.
  pruneBattleHistory, maybePruneBattleHistory,
};
