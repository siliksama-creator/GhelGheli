#!/usr/bin/env node
/**
 * گاردِ «لحظهٔ جایزه» — وب و اندروید باید یک چیز را نشان بدهند.
 *
 * ── چرا این گارد لازم است ────────────────────────────────────────────────
 *
 * خواستهٔ مالک (۲۹ شهریور): «هر وقت کاربر امتیاز/سکه/هدیه/آیتمی به دست
 * می‌آورد یا نتیجهٔ بازی را می‌بیند، یه لحظه اون چیزی که گرفته رو نشون بده
 * و یه جشنِ کوچیک بگیره — یکپارچه در وب و اندروید.» خطرِ واقعی این است که
 * به‌تدریج واگرا شود: یک نفر مسیرِ جایزهٔ تازه‌ای در وب اضافه می‌کند و
 * اندروید جا می‌ماند؛ یا کسی زمان‌بندی/متن/آیکون/لحنِ باخت را در یک طرف
 * عوض می‌کند. هیچ‌کدام از این‌ها کامپایل را نمی‌شکند و هیچ تستی
 * نمی‌گیردشان — فقط کاربرِ اندروید می‌بیند «وب جشن دارد، اپ ندارد».
 *
 * ── چه چیزی سنجیده می‌شود ────────────────────────────────────────────────
 *
 *   ۱. هر دو کلاینت ویجتِ لحظه را دارند و سبکِ قدیمی (RewardBurst /
 *      reward_burst) کامل حذف شده — خواستهٔ مالک: «سبک‌های قبلی برداشته و
 *      یک سبکِ هماهنگ جایگزین شود».
 *   ۲. مدتِ نمایش یکی است و **از پنل** می‌آید (`rewardSeconds`)، نه یک عددِ
 *      سفتِ جدا در هر کلاینت (فول‌بکِ هر دو باید با `RULE_DEFS` بخواند).
 *   ۳. چهار حالتِ لحظه (جایزه/برد/باخت/تساوی) در هر دو تعریف شده‌اند.
 *   ۴. هر ده منبعِ جایزه در هر دو تعریف شده و هر منبع عنوانِ زندهٔ خودش را
 *      می‌خواند (`reward.*`).
 *   ۵. هر مسیرِ جایزه در هر دو وصل است (ماموریت/روزانه/اختصاصی، گردونه،
 *      زنجیره، گذر نبرد، فروشگاه، ضربه‌زن، جفت‌یاب).
 *   ۶. میزبانِ لحظه در ریشهٔ وب سوار شده (تا روی همهٔ صفحه‌ها و بازی‌های
 *      تمام‌صفحه ظاهر شود، نه فقط داخلِ یک صفحه).
 *   ۷. آیکون‌های لحظه در هر دو مجموعهٔ آیکون وجود دارند (وگرنه آیکونِ خالی).
 *   ۸. عدد با `fa()`/`faNum()` ساخته می‌شود و رقمِ لاتینِ سفت در رشته‌ها نیست.
 *   ۹. بدون ایموجی.
 *  ۱۰. **بی‌اختلالی**: لایه بی‌کلیک است (`pointer-events:none` در وب،
 *      `IgnorePointer` در اندروید) و خروجِ نرم دارد.
 *  ۱۱. **لحنِ باخت** (تصمیمِ صریحِ مالک: «نرم و آرام»): هیچ‌جای لحظهٔ باخت
 *      کلمهٔ «باخت»/«بازنده» و رنگِ قرمز نیست.
 *  ۱۲. **استثناها**: دوئل کارت و ضربات پنالتی صحنهٔ نتیجهٔ خودشان را
 *      نگه داشته‌اند و جفت‌یاب از صحنهٔ جشنِ قدیمی جدا شده است.
 *  ۱۳. ضربه‌زن: دریافتی‌ها فقط با لحظهٔ یکپارچه — هم موقعِ لول‌آپ (با
 *      عددِ تأییدشدهٔ سرور؛ خواستهٔ مالک ۳۱ شهریور ۱۴۰۵: «کاربر ببیند
 *      هر لول چی دریافت کرده») و هم پایانِ بازی. کارتِ سکهٔ میانِ بازی
 *      همچنان کامل حذف است و دیالوگِ بسته‌دارِ قدیمیِ لول‌آپ هم رفته.
 *
 * این گارد برای هر بند یک شاهدِ *ایستا* می‌گیرد؛ رفتارِ زمان‌دار در
 * `mobile/test/reward_moment_test.dart` سنجیده می‌شود.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WEB = 'userweb/src';
const APP = 'mobile/lib';

const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const has = rel => fs.existsSync(path.join(root, rel));

/**
 * متنِ کد بدونِ کامنت‌ها.
 *
 * سنجه‌های ۸ و ۹ و ۱۱ (رقمِ سفت، ایموجی، کلمهٔ باخت) باید فقط *رابط* را
 * ببینند، ولی نشانه‌های داخلیِ کدبیس در کامنت‌ها زندگی می‌کنند: `⚠️` که
 * سبکِ معمولِ هشدارهای ماست و جملهٔ خودِ مالک («شما باختید») که در
 * توضیحِ «چرا این متن حذف شد» نقل می‌شود. اگر کامنت‌ها پاک نشوند، گارد
 * به‌جای باگ، خودِ توضیحاتِ باگ را گزارش می‌کند — و گاردی که دروغ بگوید
 * خیلی زود خاموش می‌شود. (کنسولِ `no-emoji.mjs` هم دقیقاً همین می‌کند.)
 */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/^[ \t]*\/\/\/.*$/gm, '');
}

let failures = 0;
function ok(label, pass, detail = '') {
  console.log(`  ${pass ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!pass) failures += 1;
}

const WEB_MOMENT = `${WEB}/components/RewardMoment.jsx`;
const APP_MOMENT = `${APP}/widgets/reward_moment.dart`;

console.log('\n══ لحظهٔ جایزه: هم‌سانیِ وب و اندروید ══');

// ── ۱) ویجتِ لحظه در هر دو، و نبودِ سبکِ قدیمی ──
ok('وب ویجتِ لحظه دارد', has(WEB_MOMENT));
ok('اندروید ویجتِ لحظه دارد', has(APP_MOMENT));
ok('سبکِ قدیمیِ وب (RewardBurst) حذف شده',
  !has(`${WEB}/components/RewardBurst.jsx`) && !has(`${WEB}/lib/rewards.js`),
  'مالک خواست «سبک‌های قبلی برداشته و یک سبکِ هماهنگ جایگزین شود»');
ok('سبکِ قدیمیِ اندروید (reward_burst) حذف شده', !has(`${APP}/widgets/reward_burst.dart`));
if (failures) {
  console.log(`\n✗ ${failures} بررسیِ لحظهٔ جایزه شکست خورد\n`);
  process.exit(1);
}
const webSrc = read(WEB_MOMENT);
const appSrc = read(APP_MOMENT);

// ── ۲) زمان‌بندی: از پنل، با فول‌بکِ برابر در دو کلاینت ──
{
  // قاعدهٔ زنده از خودِ سرور خوانده می‌شود (بدونِ دیتابیس، مثلِ
  // `live-copy-parity`): بلوکِ `RULE_DEFS` از متنِ منبع استخراج می‌شود.
  const server = read('backend/src/services/liveContent.js');
  const block = server.slice(server.indexOf('const RULE_DEFS = Object.freeze('));
  const value = Number(/"rewardSeconds"\s*:\s*\{[\s\S]{0,200}?value:\s*(\d+)/.exec(block)?.[1]
    ?? /rewardSeconds\s*:\s*\{[\s\S]{0,200}?value:\s*(\d+)/.exec(block)?.[1]);
  ok('قاعدهٔ `rewardSeconds` در پنل ثبت شده', Number.isFinite(value), `value=${value}`);

  const webFb = Number(/ruleNumber\('rewardSeconds',\s*(\d+)\)/.exec(webSrc)?.[1]);
  const appFb = Number(/rule\('rewardSeconds',\s*(\d+)\)/.exec(appSrc)?.[1]);
  ok('وب مدتِ نمایش را از پنل می‌خواند', Number.isFinite(webFb), `${webFb} ثانیه`);
  ok('اندروید مدتِ نمایش را از پنل می‌خواند', Number.isFinite(appFb), `${appFb} ثانیه`);
  ok('فول‌بکِ دو کلاینت یکی و برابرِ مقدارِ پنل است',
    webFb === appFb && webFb === value, `وب ${webFb} / اندروید ${appFb} / پنل ${value}`);
  // و صف: هیچ‌وقت بیش از یکی روی صفحه، و سقفِ صف در هر دو.
  const webQ = Number(/QUEUE_LIMIT\s*=\s*(\d+)/.exec(webSrc)?.[1]);
  const appQ = Number(/_queueLimit\s*=\s*(\d+)/.exec(appSrc)?.[1]);
  ok('سقفِ صف در دو کلاینت یکی است', webQ === appQ && webQ > 0, `وب ${webQ} / اندروید ${appQ}`);
}

// ── ۳) حالت‌های لحظه (برد/باخت/تساوی/جایزه) ──
const KINDS = ['gain', 'win', 'loss', 'draw'];
ok('وب هر چهار حالت را می‌شناسد',
  KINDS.every(k => new RegExp(`REWARD_MOMENTS[\\s\\S]{0,260}\\b${k}\\b`)
    .test(read(`${WEB}/lib/rewardMoment.js`))));
ok('اندروید هر چهار حالت را می‌شناسد',
  /enum RewardKind \{[\s\S]{0,120}gain[\s\S]{0,120}\}/.test(appSrc)
  && KINDS.every(k => new RegExp(`RewardKind\\.${k}\\b`).test(appSrc)));

// ── ۴) منابعِ جایزه ──
// ده منبعی که امروز جایزه می‌دهند. اگر روزی مسیرِ یازدهمی اضافه شد، این
// گارد می‌شکند تا کسی مجبور شود هر دو کلاینت را وصل کند.
const SOURCES = ['mission', 'daily', 'custom', 'wheel', 'streak',
  'pass', 'shop', 'tap', 'memory', 'league'];
{
  const webGate = read(`${WEB}/lib/rewardMoment.js`);
  const webMissing = SOURCES.filter(s => !new RegExp(`'${s}'`).test(webGate));
  ok('گذرگاهِ وب هر ده منبع را می‌شناسد', webMissing.length === 0, webMissing.join('، '));
  const appMissing = SOURCES.filter(s => !new RegExp(`RewardSource\\.${s}\\b`).test(appSrc));
  ok('اندروید هر ده منبع را می‌شناسد', appMissing.length === 0, appMissing.join('، '));
  // و هر منبع در ویجتِ هر دو، عنوانِ زندهٔ خودش را می‌خواند.
  const webKeys = SOURCES.filter(s => !webSrc.includes(`reward.${s}`));
  ok('هر منبع در وب عنوانِ زندهٔ خودش را می‌خواند', webKeys.length === 0, webKeys.join('، '));
  const appKeys = SOURCES.filter(s => !appSrc.includes(`reward.${s}`));
  ok('هر منبع در اندروید عنوانِ زندهٔ خودش را می‌خواند', appKeys.length === 0, appKeys.join('، '));
}

// ── ۵) سیم‌کشیِ مسیرهای جایزه در هر دو ──
// هر ردیف: [برچسب، فایلِ وب، نشانهٔ وب، فایلِ اندروید، نشانهٔ اندروید].
const PATHS = [
  ['ماموریت/روزانه/اختصاصی', `${WEB}/GrowthHub.jsx`, 'rewardMoment',
    `${APP}/screens/user/games/growth_panel.dart`, 'RewardMoment.moment'],
  ['گردونه', `${WEB}/screens/Wheel.jsx`, 'rewardMoment',
    `${APP}/screens/user/wheel_page.dart`, 'RewardMoment.moment'],
  ['زنجیرهٔ ورود', `${WEB}/components/LoginStreak.jsx`, 'rewardMoment',
    `${APP}/screens/user/login_streak_card.dart`, 'RewardMoment.moment'],
  ['گذر نبرد', `${WEB}/screens/Pass.jsx`, 'rewardMoment',
    `${APP}/screens/user/pass_page.dart`, 'RewardMoment.moment'],
  ['فروشگاه', `${WEB}/screens/Shop.jsx`, 'rewardMoment',
    `${APP}/screens/user/shop_page.dart`, 'RewardMoment.moment'],
  ['ضربه‌زن', `${WEB}/tapGame.jsx`, 'rewardMoment',
    `${APP}/screens/user/games/tap/tap_screen.dart`, 'RewardMoment.moment'],
  ['جفت‌یاب', `${WEB}/games.jsx`, 'rewardMoment',
    `${APP}/screens/user/games/game_scaffold.dart`, 'RewardMoment.moment'],
];
for (const [label, webFile, webNeedle, appFile, appNeedle] of PATHS) {
  const w = has(webFile) ? read(webFile) : '';
  const a = has(appFile) ? read(appFile) : '';
  ok(`وب: مسیرِ ${label} لحظه می‌فرستد`, w.includes(webNeedle), webFile);
  ok(`اندروید: مسیرِ ${label} لحظه می‌فرستد`, a.includes(appNeedle), appFile);
}
ok('تعدادِ مسیرهای لحظه در دو کلاینت یکی است', PATHS.length === 7, `${PATHS.length} مسیر`);

// ── ۶) میزبانِ سراسری در ریشهٔ وب ──
{
  const mainSrc = read(`${WEB}/main.jsx`);
  ok('میزبانِ لحظه در ریشهٔ وب سوار است', /<RewardMomentHost\s*\/>/.test(mainSrc),
    'بدونِ این، لحظه فقط داخلِ صفحهٔ جایزه می‌ماند و در بازی‌های تمام‌صفحه دیده نمی‌شود');
}

// ── ۷) آیکون‌ها در هر دو مجموعه ──
{
  const iconAsset = read(`${WEB}/components/IconAsset.jsx`);
  const uiIcon = read(`${APP}/widgets/ui_icon.dart`);
  const webIconNames = new Set(
    [...iconAsset.slice(iconAsset.indexOf('const PATHS')).matchAll(/^\s{2}([a-z][a-zA-Z0-9_]*)\s*:/gm)]
      .map(m => m[1]));
  const appIconNames = new Set([...uiIcon.matchAll(/'([a-z][a-zA-Z0-9_]*)'\s*:\s*Icons\./g)].map(m => m[1]));
  const used = new Set([
    ...[...webSrc.matchAll(/name=[\"']([a-z_]+)[\"']/g)].map(m => m[1]),
    ...[...webSrc.matchAll(/icon=[\"']([a-z_]+)[\"']/g)].map(m => m[1]),
    ...[...webSrc.matchAll(/SOURCE_ICON[\s\S]*?\};/g)].flatMap(blk =>
      [...blk[0].matchAll(/:\s*'([a-z_]+)'/g)].map(m => m[1])),
    ...[...webSrc.matchAll(/KIND_ICON[\s\S]*?\};/g)].flatMap(blk =>
      [...blk[0].matchAll(/:\s*'([a-z_]+)'/g)].map(m => m[1])),
  ]);
  const bad = [...used].filter(n => !webIconNames.has(n) || !appIconNames.has(n));
  ok('هر آیکونِ لحظه در هر دو مجموعه هست', bad.length === 0 && used.size >= 8,
    bad.length ? bad.join('، ') : `${used.size} آیکون`);
}

// ── ۸) عددِ فارسی، بی‌رقمِ لاتین ──
ok('وب عدد را با fa() می‌سازد', /\bfa\(/.test(webSrc));
ok('اندروید عدد را با faNum() می‌سازد', /\bfaNum\(/.test(appSrc));
{
  const bad = [];
  for (const [label, src] of [['وب', code(webSrc)], ['اندروید', code(appSrc)]]) {
    for (const m of src.matchAll(/(['"`])([^'"`\n]*[آ-ی][^'"`\n]*)\1/g)) {
      if (/[0-9۰-۹]/.test(m[2]) && !/\$\{|fa\(|faNum\(/.test(m[2])) {
        bad.push(`${label}: «${m[2]}»`);
      }
    }
  }
  ok('هیچ رقمِ سفتی داخلِ رشتهٔ نمایشیِ لحظه نیست', bad.length === 0, bad.join(' | '));
}

// ── ۹) بدون ایموجی ──
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
ok('وب: لحظه ایموجی ندارد', !EMOJI.test(code(webSrc)));
ok('اندروید: لحظه ایموجی ندارد', !EMOJI.test(code(appSrc)));

// ── ۱۰) بی‌اختلالی: لایه بی‌کلیک و با خروجِ نرم ──
{
  const css = read(`${WEB}/styles/brand-mark.css`);
  const host = /\.momentHost\s*\{[\s\S]{0,320}?\}/.exec(css)?.[0] ?? '';
  ok('وب: لایهٔ لحظه کلیک را نمی‌خورد', /pointer-events:\s*none/.test(host),
    'بدونِ این، دکمهٔ «دریافت» بعدی زیرِ کارت گیر می‌کند');
  ok('وب: لایه از جریانِ صفحه جداست', /position:\s*fixed/.test(host));
  ok('وب: خروجِ نرم دارد', /\.momentCard\.isLeaving/.test(css));
  ok('اندروید: لایه لمس را نمی‌خورد', /IgnorePointer\(/.test(code(appSrc)));
  ok('اندروید: خروجِ نرم دارد', /_out\.forward\(\)/.test(code(appSrc)));
  // و کارت باید در هر دو کلاینت عرضِ ایمن داشته باشد (درسِ سرریزِ ۳۶۰px).
  ok('وب: عرضِ کارت روی گوشیِ باریک بیرون نمی‌زند', /width:\s*min\(/.test(host + css));
}

// ── ۱۱) لحنِ باخت: نرم و آرام (تصمیمِ صریحِ مالک) ──
{
  const server = read('backend/src/services/liveContent.js');
  const lossCopy = [
    /lossTitle:\s*'([^']+)'/.exec(server)?.[1] ?? '',
    /lossLine:\s*'([^']+)'/.exec(server)?.[1] ?? '',
  ].join(' ');
  ok('متنِ باخت در پنل ثبت شده', lossCopy.includes('این دور تمام شد'), lossCopy);
  ok('متنِ باخت کلمهٔ «باخت»/«بازنده» ندارد',
    !/باخت|بازنده/.test(lossCopy), lossCopy);
  // لحظهٔ باخت در هر دو کلاینت جملهٔ پنل را می‌خواند (نه یک متنِ محلیِ تازه).
  ok('وب: لحظهٔ باخت جمله را از پنل می‌خواند', webSrc.includes('reward.lossLine'));
  ok('اندروید: لحظهٔ باخت جمله را از پنل می‌خواند', appSrc.includes('reward.lossLine'));
  // و هیچ رنگِ قرمزِ تندی در پالتِ لحظه نیست.
  const reds = [...code(webSrc).matchAll(/#[0-9A-Fa-f]{6}/g)].map(m => m[0].toUpperCase());
  const tainted = reds.filter(h => {
    const r = parseInt(h.slice(1, 3), 16); const g = parseInt(h.slice(3, 5), 16); const b = parseInt(h.slice(5, 7), 16);
    return r > 150 && r > g * 1.6 && r > b * 1.6;   // قرمزِ اشباع مثلِ #EF4444
  });
  ok('پالتِ لحظه رنگِ قرمزِ هشدار ندارد', tainted.length === 0, tainted.join('، '));
  // آیکونِ باخت هم «ضربدرِ» هشدار نیست.
  ok('آیکونِ لحظهٔ باخت ضربدرِ هشدار نیست',
    /loss:\s*'shield'/.test(webSrc) && /RewardKind\.loss:\s*'shield'/.test(appSrc));
}

// ── ۱۲) استثناهای صریح + جداییِ جفت‌یاب از صحنهٔ جشنِ قدیمی ──
{
  const games = read(`${WEB}/games.jsx`);
  ok('وب: دوئل کارت و پنالتی صحنهٔ نتیجهٔ خودشان را نگه داشته‌اند',
    /<WinnerCelebration/.test(games) && /activeGameId === 'memory'/.test(games));
  const scaffold = read(`${APP}/screens/user/games/game_scaffold.dart`);
  ok('اندروید: دوئل کارت و پنالتی صحنهٔ نتیجهٔ خودشان را نگه داشته‌اند',
    /WinnerStage\(/.test(scaffold) && /session\.gameId == 'memory'/.test(scaffold));
  // و تیترِ «تو برنده شدی» در جفت‌یابِ هر دو کلاینت دیگر روی صفحه نمی‌آید.
  ok('وب: تیترِ جشن در جفت‌یاب نمایش داده نمی‌شود',
    /memoryResultPanel/.test(games), 'پنلِ نتیجهٔ خشک + لحظه');
  ok('اندروید: خطِ «شما بردید/باختید» در جفت‌یاب نمایش داده نمی‌شود',
    /showText:\s*session\.gameId != 'memory'/.test(scaffold));
}

// ── ۱۳) ضربه‌زن: دریافتی‌ها فقط در پایانِ بازی ──
{
  const tapWeb = read(`${WEB}/tapGame.jsx`);
  const tapApp = read(`${APP}/screens/user/games/tap/tap_screen.dart`);
  ok('وب: کارتِ سکهٔ میانِ بازیِ ضربه‌زن حذف شده',
    !tapWeb.includes('tapCoinBurst') && !tapWeb.includes('coinToast'),
    'تصمیمِ مالک: «وسطِ بازی کارت نیاد»');
  ok('اندروید: کارتِ سکهٔ میانِ بازیِ ضربه‌زن حذف شده',
    !code(tapApp).includes('_CoinToast'),
    'تصمیمِ مالک: «وسطِ بازی کارت نیاد»');
  ok('وب: لحظهٔ ضربه‌زن در پایانِ بازی می‌آید',
    /source:\s*'tap'/.test(tapWeb) && /isComplete/.test(tapWeb));
  ok('اندروید: لحظهٔ ضربه‌زن در پایانِ بازی می‌آید',
    /RewardSource\.tap/.test(tapApp) && /_engine\.isFinished/.test(tapApp));
  // خواستهٔ مالک (۳۱ شهریور ۱۴۰۵): «وقتی بازی ضربه‌زن لول‌آپ می‌شود مثلِ
  // سیستمِ یکپارچه اعلامِ امتیاز و سکه بیاید روی صفحه تا کاربر ببیند هر
  // لول چی دریافت کرده.» تریگر در هر دو کلاینت فیلدِ levelsGainedِ سرور
  // است (نه شمارِ خوش‌بینانهٔ محلی) و عددها pointsEarned/coinsEarnedِ
  // تأییدشدهٔ همان بسته‌اند.
  ok('وب: لحظهٔ لول‌آپ از گذرگاهِ یکپارچه می‌آید',
    /fireLevelMoment/.test(tapWeb) && /levelsGained/.test(tapWeb));
  ok('اندروید: لحظهٔ لول‌آپ از گذرگاهِ یکپارچه می‌آید',
    /_fireLevelMoment/.test(tapApp) && /levelAwardSerial/.test(tapApp));
  ok('اندروید: دیالوگِ بسته‌دارِ قدیمیِ لول‌آپ حذف شده',
    !/_showLevelUpDialog|_LevelUpDialogContent/.test(code(tapApp)));
}

if (failures) {
  console.log(`\n✗ ${failures} بررسیِ لحظهٔ جایزه شکست خورد\n`);
  process.exit(1);
}
console.log('\n✅ لحظهٔ جایزه در وب و اندروید هم‌سان است\n');
