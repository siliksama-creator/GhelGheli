#!/usr/bin/env node
/**
 * نگهبانِ «کلاسِ کارت» — یک تعریف، چهار کلاینت.
 *
 * ── چرا این فایل نوشته شد ────────────────────────────────────────────
 *
 * خواستهٔ مالک (۳ مهر ۱۴۰۵): کلاسِ کارت باید یکدست شود —
 *
 *     common     کارت‌های ۵۰۰ امتیازی
 *     uncommon   کارت‌های ۱۰۰۰ امتیازی
 *     rare       کارت‌های ۳۰۰۰ امتیازی
 *     legendary  کارت‌های بالای ۳۰۰۰ امتیاز
 *
 * و صریح گفتند: «این تغییرات تأثیر مستقیم روی بازی‌ها هم دارد، پس بازی
 * نباید بشکند».
 *
 * خطرِ واقعی این مأموریت «نبودِ» تعدادِ کلاس‌ها نبود، **واگراییِ** آن‌ها
 * بود: سرور `rare` بگوید و اپِ اندروید `gold` بفهمد، یا یک صفحهٔ جاافتاده
 * کلاسِ نسلِ قبل را هنوز تولید کند. هیچ تستی این را نمی‌گرفت چون هر فایل
 * تنها با خودش سازگار بود.
 *
 * این گارد دقیقاً همان کاری را می‌کند که یک کاربر می‌کند: از سرور شروع
 * می‌کند و تا هر سه کلاینت را می‌پیماید. اگر روزی کسی در `userweb` آستانهٔ
 * ۳۰۰۰ را ۲۵۰۰ کند، CI قرمز می‌شود — نه کیفِ پولِ کاربر.
 *
 * ── چه چیزی را *نمی* سنجد ────────────────────────────────────────────
 *
 * محتوای دیتابیس. آن را مایگریشنِ ۱۰۰ (که خودش اینجا سنجیده می‌شود) و
 * `scripts/testCardBoxAdmin.js` پوشش می‌دهند. این فایل **بی‌دیتابیس** است
 * تا در CI هم که Postgres نیست سبز بماند.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const cardRarity = require('../src/lib/cardRarity');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

// ⚠️ برچسب‌ها با نیم‌فاصلهٔ واقعی (U+200C) نوشته می‌شوند، نه فاصلهٔ ساده.
//    «افسانه‌ای» با فاصلهٔ ساده یک غلطِ املایی است — همان چیزی که مالک
//    خواست درست شود.
const LABELS = { common: 'معمولی', uncommon: 'کمیاب', rare: 'نایاب', legendary: 'افسانه‌ای' };
const KEYS = ['common', 'uncommon', 'rare', 'legendary'];
// برچسب‌های نسلِ قبل که باید از همهٔ کلاینت‌ها پاک شده باشند.
// ⚠️ عمداً «معمولی» در این فهرست نیست: کلاسِ `common` هنوز همان را دارد.
const RETIRED_LABELS = ['نقره‌ای', 'طلایی', 'پرمیوم', 'لجند'];
const LEGACY = { normal: 'common', silver: 'uncommon', gold: 'uncommon', premium: 'rare', legend: 'legendary' };

/**
 * کامنت‌ها را برمی‌دارد تا سنجهٔ «برچسبِ بازنشسته» دربارهٔ **کد** قضاوت
 * کند، نه دربارهٔ نثر. وگرنه یک توضیحِ درست («کارتِ طلاییِ نسلِ قبل») گارد
 * را قرمز می‌کرد و آدم‌ها کم‌کم یاد می‌گرفتند توضیح ننویسند — که بدترین
 * نتیجهٔ ممکن برای همین پروژه است.
 */
const code = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');

console.log('\n== ۱. نردبانِ سرور (منبعِ حقیقت) ==');
ok(JSON.stringify(cardRarity.RARITIES) === JSON.stringify(KEYS),
  'دقیقاً چهار کلاس، به ترتیبِ ارزش');
ok(KEYS.every((k) => cardRarity.RARITY_LABELS[k] === LABELS[k]),
  'برچسبِ فارسیِ هر کلاس درست و بدونِ آوانویس است');
ok(KEYS.every((k) => typeof cardRarity.RARITY_ACCENT[k] === 'string' && /^#[0-9A-F]{6}$/i.test(cardRarity.RARITY_ACCENT[k])),
  'هر کلاس رنگِ نشانهٔ معتبر دارد');
ok(cardRarity.RARITY_BONUS.common === 0
  && cardRarity.RARITY_BONUS.uncommon > cardRarity.RARITY_BONUS.common
  && cardRarity.RARITY_BONUS.rare > cardRarity.RARITY_BONUS.uncommon
  && cardRarity.RARITY_BONUS.legendary > cardRarity.RARITY_BONUS.rare,
  'پاداشِ قدرتِ دوئل با ارزش صعودی است');
ok(cardRarity.RARITY_MAX_POINTS.common === 500
  && cardRarity.RARITY_MAX_POINTS.uncommon === 1000
  && cardRarity.RARITY_MAX_POINTS.rare === 3000,
  'آستانه‌ها همان ۵۰۰ / ۱۰۰۰ / ۳۰۰۰ خواسته‌شده است');

console.log('\n== ۲. کلاس = تابعی از امتیاز (و نه چیزِ دیگر) ==');
const ladder = [
  [0, 'common'], [1, 'common'], [499, 'common'], [500, 'common'],
  [501, 'uncommon'], [800, 'uncommon'], [1000, 'uncommon'],
  [1001, 'rare'], [2000, 'rare'], [3000, 'rare'],
  [3001, 'legendary'], [9999, 'legendary'], [100000, 'legendary'],
];
ok(ladder.every(([points, expected]) => cardRarity.rarityForPoints(points) === expected),
  'مرزهای ۵۰۰/۱۰۰۰/۳۰۰۰ دقیقاً روی لبه درست کار می‌کنند');
ok(cardRarity.rarityForPoints(-5) === 'common'
  && cardRarity.rarityForPoints(null) === 'common'
  && cardRarity.rarityForPoints(undefined) === 'common'
  && cardRarity.rarityForPoints('نامعتبر') === 'common'
  && cardRarity.rarityForPoints(1499.9) === 'rare',
  'ورودیِ منفی/خالی/نامعتبر به کلاسِ پایین می‌افتد و رشتهٔ عددی خوانده می‌شود');
{
  // صعودی بودنِ نردبان: هیچ دو امتیازی نباید ترتیب را برگرداند.
  let prev = -1;
  let monotonic = true;
  for (let p = 0; p <= 8000; p += 25) {
    const rank = cardRarity.rarityRank(cardRarity.rarityForPoints(p));
    if (rank < prev) monotonic = false;
    prev = rank;
  }
  ok(monotonic, 'نردبان روی کلِ بازهٔ ۰..۸۰۰۰ صعودی است');
}

console.log('\n== ۳. سازگاریِ کلیدهای نسلِ قبل ==');
ok(Object.entries(LEGACY).every(([oldKey, newKey]) => cardRarity.LEGACY_RARITY[oldKey] === newKey),
  'هر پنج کلیدِ قدیمی به کلاسِ درست نگاشته می‌شوند');
ok(Object.keys(LEGACY).every((oldKey) => !cardRarity.RARITIES.includes(oldKey)),
  'کلیدِ نسلِ قبل هیچ‌وقت کلاسِ معتبر شمرده نمی‌شود');
ok(cardRarity.rarityInput('legend') === 'legendary'
  && cardRarity.rarityInput('gold') === 'uncommon'
  && cardRarity.rarityInput('rare') === 'rare'
  && cardRarity.rarityInput('') === 'common',
  'ورودیِ نسلِ قبل در همان ورودیِ API هم نگاشته می‌شود');
ok(Object.values(LEGACY).every((k) => KEYS.includes(k)),
  'نگاشتِ نسلِ قبل هیچ کلیدِ ناشناسی نمی‌سازد');

console.log('\n== ۴. کلاس به نامِ بازیکن کاری ندارد ==');
{
  // خواستهٔ صریحِ مالک: «کار به اسم بازیکن‌ها نداشته باش.»
  // تنها منبعِ کلاس نباید هیچ نامی از بازیکن/کارتِ خاصی بشناسد.
  const source = read('backend/src/lib/cardRarity.js');
  const playerNames = ['Messi', 'Ronaldo', 'Mbappé', 'Mbappe', 'Haaland', 'Neymar',
    'Salah', 'Maradona', 'Pelé', 'Pele', 'Bellingham', 'Yamal', 'مسی', 'رونالدو'];
  ok(!playerNames.some((n) => source.includes(n)),
    'ماژولِ کلاس هیچ نامِ بازیکنی نمی‌شناسد');
  ok(!/if\s*\([^)]*name/i.test(source),
    'هیچ شاخه‌ای بر اساسِ نام تصمیم نمی‌گیرد');
}

console.log('\n== ۵. مایگریشنِ ۱۰۰ (همهٔ کارت‌های ثبت‌شده) ==');
{
  const mig = read('backend/migrations/100_card_rarity_tiers.sql');
  ok(/card_types/.test(mig) && /duel_rarity/.test(mig),
    'ستونِ کلاسِ کارت‌های ثبت‌شده را بازنویسی می‌کند');
  ok(/point_value\s*<=\s*500[\s\S]{0,24}THEN\s*'common'/i.test(mig)
    && /point_value\s*<=\s*1000[\s\S]{0,24}THEN\s*'uncommon'/i.test(mig)
    && /point_value\s*<=\s*3000[\s\S]{0,24}THEN\s*'rare'/i.test(mig)
    && /ELSE\s*'legendary'/i.test(mig),
    'نگاشت دقیقاً بر اساسِ همان چهار بازهٔ امتیاز است');
  ok(/normal|silver|gold|premium|legend/.test(mig),
    'ردیف‌های نسلِ قبل را با نامِ قدیمی‌شان می‌شناسد');
  for (const key of KEYS) {
    ok(mig.includes(`'${key}'`), `کلیدِ «${key}» در مایگریشن هست`);
  }
  ok((mig.match(/DROP CONSTRAINT IF EXISTS/g) || []).length >= 2
    && (mig.match(/ADD CONSTRAINT/g) || []).length >= 2,
    'هر دو قیدِ CHECK بازساخته می‌شوند (نه اینکه دور زده شوند)');
  ok(/409/.test(mig) && /459/.test(mig) && /122/.test(mig),
    'شانسِ صندوق با حفظِ ارزشِ امروز بازپخش می‌شود');
  ok((mig.match(/DELETE FROM card_box_odds/g) || []).length === 1
    && !/\bUPDATE card_box_odds\b/.test(mig),
    'ردیف‌های شانس پاک و از نو نوشته می‌شوند (اجرای دوباره بی‌خطر)');

  // ⚠️ ترتیبِ قیدها یک تلهٔ واقعی بود: اگر ADD CONSTRAINT پیش از
  //    DELETE+INSERT بیاید، ردیف‌های نسلِ قبل قیدِ تازه را نقض می‌کنند و
  //    کلِ تراکنش بی‌صدا برمی‌گردد (مایگریشن «موفق» ولی بی‌اثر).
  const dropAt = mig.indexOf('DROP CONSTRAINT IF EXISTS card_box_odds_rarity_check');
  const deleteAt = mig.indexOf('DELETE FROM card_box_odds');
  const addAt = mig.indexOf('ADD CONSTRAINT card_box_odds_rarity_check');
  ok(dropAt >= 0 && deleteAt > dropAt && addAt > deleteAt,
    'ترتیبِ قیدِ شانس درست است: DROP ← DELETE ← ADD (تلهٔ رول‌بکِ بی‌صدا)');
}

console.log('\n== ۶. سرویس‌ها ==');
{
  const duel = require('../src/services/cardDuelService');
  const derived = duel.publicCard({
    card_type_id: 'x', name: 'کارت آزمایشی', point_value: 4200,
    duel_attack: 60, duel_defense: 60, duel_speed: 60, duel_technique: 60,
    duel_goal_chance: 60, duel_energy: 100,
    // کلیدِ نسلِ قبل عمداً اینجاست: باید **دور ریخته شود**، چون منبعِ
    // کلاس امتیاز است. اگر روزی کسی دوباره ستونِ خام را مقدم کند، این
    // سنجه قرمز می‌شود.
    duel_rarity: 'normal', duel_effect: 'none',
  });
  ok(derived.rarity === 'legendary' && derived.duel_rarity === 'legendary',
    'publicCard کلاس را از امتیاز می‌سازد، نه از ستونِ خام');
  ok(derived.rarityLabel === LABELS.legendary,
    'برچسبِ فارسی هم همراهِ کلاس می‌آید');
  ok(Object.keys(duel.RARITY_BONUS).length === 4,
    'دوئل هم همان چهار کلاس را می‌شناسد');

  const box = require('../src/services/cardBoxService');
  ok(JSON.stringify(box.RARITIES) === JSON.stringify(KEYS),
    'صندوق هم همان چهار کلاس را می‌شناسد');
  const sum = box.RARITIES.reduce((s, r) => s + box.DEFAULT_ODDS[r], 0);
  ok(sum === box.WEIGHT_TOTAL && Object.keys(box.DEFAULT_ODDS).length === 4,
    'شانسِ پیش‌فرض روی همان چهار کلاس جمعاً ۱۰۰٪ می‌شود');
  ok(box.parseOddsInput(box.DEFAULT_ODDS).legendary === box.DEFAULT_ODDS.legendary,
    'ورودیِ نقشه‌ایِ پنل با کلیدهای تازه پذیرفته می‌شود');
  ok(box.parseOddsInput({ normal: 409, silver: 306, gold: 153, premium: 122, legend: 10 }).uncommon === 459,
    'پنلِ کش‌شده با کلیدهای نسلِ قبل هم همان شانس را ذخیره می‌کند');
}

console.log('\n== ۷. کلاینتِ وب ==');
{
  const lib = read('userweb/src/lib/cards.js');
  ok(KEYS.every((k) => new RegExp(`\\b${k}:\\s*\\{`).test(lib)), 'چهار کلاس در `lib/cards.js` هست');
  ok(KEYS.every((k) => lib.includes(LABELS[k])), 'برچسب‌های فارسیِ تازه در وب هست');
  ok(/CARD_RARITY_MAX_POINTS\s*=\s*\{\s*common:\s*500,\s*uncommon:\s*1000,\s*rare:\s*3000/.test(lib),
    'آستانه‌های وب همان ۵۰۰/۱۰۰۰/۳۰۰۰ است');
  ok(/export function cardRarityForPoints/.test(lib) && /export function normalizeCardRarity/.test(lib),
    'وب هم کلاس را از امتیاز می‌سازد و کلیدِ قدیمی را نگاشت می‌کند');
  ok(/cardRarityOf\(item\)/.test(lib) && /normalizeCardRarity\(raw\)/.test(lib),
    'کارتِ با کلیدِ نسلِ قبل در وب بی‌قاب نمی‌ماند');

  const frame = read('userweb/src/components/CardRarityFrame.jsx');
  ok(KEYS.every((k) => new RegExp(`\\b${k}:\\s*0`).test(frame) || frame.includes(`${k}: `)),
    'تعدادِ ذراتِ هر کلاس در قابِ وب تعریف شده');
  ok(/rarity-\$\{key\}/.test(frame) && /normalizeCardRarity\(rarity\)/.test(frame),
    'قابِ وب کلاس را نرمال می‌کند');
  ok(/rarityCardAura/.test(frame) && /aria-hidden/.test(frame),
    'لایهٔ ذراتِ وب تزئینی و از دیدِ صفحه‌خوان پنهان است');
  ok(RETIRED_LABELS.every((label) => !code(frame).includes(label)),
    'قابِ وب هیچ برچسبِ بازنشسته‌ای ندارد');

  const css = read('userweb/src/styles/brand-mark.css');
  ok(KEYS.every((k) => css.includes(`.rarityCardFrame.rarity-${k}`)),
    'وب برای هر چهار کلاس قابِ مستقل دارد');
  ok(/@keyframes rarAurora/.test(css) && /@keyframes rarSpark/.test(css)
    && /@keyframes rarEmber/.test(css) && /@keyframes rarUncommonBreath/.test(css),
    'هر کلاس انیمیشنِ خودش را دارد (نه یک قابِ رنگی‌شده)');
  // ⚠️ «ساکن بودن» کلاسِ معمولی با **نبودِ** قاعدهٔ انیمیشن بیان می‌شود،
  //    نه با `animation:none`. چرا: این قاعده روی کارتِ دوئل با
  //    `duelEquippedFrame` (قابِ اهدایی) ترکیب می‌شود و `animation:none`
  //    قابِ اهدایی را هم روی کارت‌های معمولی خاموش می‌کرد — یعنی یک
  //    جایزهٔ خریداری‌شده بی‌صدا از کار می‌افتاد.
  const commonRule = (css.match(/\.rarityCardFrame\.rarity-common\{[^}]*\}/) || [''])[0];
  ok(commonRule.includes('rarity-common') && !/animation/.test(commonRule),
    'کلاسِ معمولی عمداً ساکن است (بدونِ قاعدهٔ انیمیشن)');
  ok(/prefers-reduced-motion/.test(css) && /rarityCardAura/.test(css),
    'وب «کاهشِ حرکت» را رعایت می‌کند و ذراتش را دارد');
  ok(/\.rarity-common\{--rar-a:#8FA3B8/.test(css), 'پالتِ معمولی همان فولادِ خاکستری است');
}

console.log('\n== ۸. پنلِ ادمین ==');
{
  const rar = read('admin/src/lib/rarity.js');
  ok(KEYS.every((k) => rar.includes(LABELS[k])), 'برچسب‌های تازه در پنل هست');
  ok(/RARITY_MAX_POINTS\s*=\s*\{\s*common:\s*500,\s*uncommon:\s*1000,\s*rare:\s*3000/.test(rar),
    'آستانه‌های پنل با سرور یکی است');
  ok(/export function rarityForPoints/.test(rar) && /export function normalizeRarity/.test(rar),
    'پنل کلاس را از امتیاز می‌سازد');

  const page = read('admin/src/pages/photo-cards.jsx');
  ok(/adminRarity\.rarityForPoints\(points/.test(page),
    'صفحهٔ ثبت کارت کلاس را از امتیازِ تایپ‌شده می‌سازد');
  ok(!/<select value=\{duel\.rarity\}/.test(page) && !/duelRarity:\s*duel\.rarity/.test(page),
    'کلاس دیگر در فرمِ ثبت قابلِ انتخاب نیست');
  ok(!/option value="(premium|legend|gold|silver|normal)"/.test(page),
    'هیچ گزینهٔ کلاسِ نسلِ قبل در فرم نمانده');
  ok(/adminClassChip/.test(page), 'کلاسِ محاسبه‌شده به مدیر نشان داده می‌شود');

  const adminCss = read('admin/src/styles.css');
  ok(KEYS.every((k) => adminCss.includes(`.adminRarityFrame.rarity-${k}`)),
    'پنل برای هر چهار کلاس پیش‌نمایشِ مستقل دارد');
  ok(/adminClassBreath/.test(adminCss) && /adminRaritySpin/.test(adminCss),
    'پیش‌نمایشِ پنل هم انیمیشنِ کلاس‌محور دارد');
}

console.log('\n== ۹. اندروید ==');
{
  const dart = read('mobile/lib/widgets/rarity_card_frame.dart');
  ok(KEYS.every((k) => dart.includes(`'${k}':`)), 'چهار کلاس در قابِ اندروید هست');
  ok(KEYS.every((k) => dart.includes(LABELS[k])), 'برچسب‌های فارسیِ تازه در اندروید هست');
  ok(/String normalizeRarity\(Object\? value\)/.test(dart)
    && /String rarityForPoints\(Object\? points\)/.test(dart),
    'اندروید کلاس را از امتیاز می‌سازد و کلیدِ قدیمی را نگاشت می‌کند');
  ok(/case 'common'/.test(dart) && /case 'uncommon'/.test(dart)
    && /case 'rare'/.test(dart) && !/case 'normal'/.test(dart) && !/case 'premium'/.test(dart),
    'موادِ چهار کلاس در اندروید نوشته شده و کلیدِ قدیمی تولید نمی‌شود');
  ok(/SweepGradient/.test(dart) && /_sparks\(/.test(dart) && /_shine\(/.test(dart),
    'نایاب و افسانه‌ای پرتو/جرقه/لغزشِ نور دارند');
  ok(/_paint\(\.25\)/.test(dart) && /disableAnimations/.test(dart),
    'اندروید کلاسِ معمولی را ساکن نگه می‌دارد و «کاهشِ حرکت» را رعایت می‌کند');
  ok(RETIRED_LABELS.every((label) => !code(dart).includes(label)),
    'قابِ اندروید هیچ برچسبِ بازنشسته‌ای ندارد');

  const player = read('mobile/lib/widgets/player_card.dart');
  ok(/normalizeRarity\(/.test(player) && !/rarityColors\['normal'\]/.test(player),
    'کارتِ بازیکن کلاس را نرمال می‌کند و فالبکِ نسلِ قبل ندارد');

  const boxDart = read('mobile/lib/widgets/card_box.dart');
  ok(/'common': Sfx\.cardNormal/.test(boxDart) && /'legendary': Sfx\.cardLegend/.test(boxDart),
    'صدای رونماییِ صندوق به چهار کلاسِ تازه نگاشته شده');
  ok(!/'premium': Sfx/.test(boxDart) && !/'legend': Sfx/.test(boxDart),
    'هیچ صدایی روی کلیدِ بازنشسته نمانده');
}

console.log('\n== ۱۰. هیچ برچسبِ بازنشسته‌ای در منابعِ زنده نمانده ==');
{
  const sources = [
    'backend/src/lib/cardRarity.js',
    'userweb/src/lib/cards.js',
    'userweb/src/components/CardRarityFrame.jsx',
    'admin/src/lib/rarity.js',
    'mobile/lib/widgets/rarity_card_frame.dart',
  ];
  for (const rel of sources) {
    const text = code(read(rel));
    ok(RETIRED_LABELS.every((label) => !text.includes(label)),
      `${rel}: بدونِ «نقره‌ای/طلایی/پرمیوم/لجند»`);
  }
}

console.log(`\n✅ ${passed} بررسیِ کلاسِ کارت موفق\n`);
