#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  گاردِ «شماره معکوسِ شروعِ لیگ» — خواستهٔ مالک (۲۷ شهریور)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * چرا این فایل لازم است: این قابلیت **پولِ بازی را قفل می‌کند**. سه کلاسِ
 * باگِ گران در همین یک جمله پنهان است:
 *
 *   ۱. **قفلِ ناقص.** اگر یک راهِ فرار بماند (مثلاً «نبردِ دوباره» روی
 *      مسابقهٔ سهم‌دار، یا لابیِ عمومی)، سکه‌ها همان‌طور تولید می‌شوند و
 *      خودِ قفل بی‌معنا می‌شود. پس هر معبرِ سکه‌ای باید بسته و هر مسیرِ
 *      غیرسکه‌ای باید باز باشد — دومی هم مهم است، وگرنه کاربرِ بی‌کار به
 *      ادمین پیام می‌دهد.
 *   ۲. **بازشدنِ دستی.** «سرِ ساعتِ صفر خودکار باز شود» یعنی تصمیم از
 *      **زمان** می‌آید، نه از یک ردیفِ وضعیت که کسی باید عوضش کند. اگر
 *      کسی این را به «تا وقتی ادمین خاموش نکند بماند» تغییر بدهد، هر لیگ
 *      با یک قفلِ فراموش‌شده گروگان می‌شود.
 *   ۳. **متنِ هاردکدشده در کلاینت.** مالک صریح گفت متن باید بدونِ آپدیتِ
 *      اندروید عوض شود. اگر همان جملهٔ پیش‌فرض داخلِ کدِ اپ یا وب بیاید،
 *      قابلیت روی کاغذ کار می‌کند و در عمل نه.
 *
 * قواعدِ خالص (اعتبارسنجی و محاسبهٔ وضعیت) این‌جا با ساعتِ تزریقی آزموده
 * می‌شوند؛ بقیه از روی خودِ فایل‌های سرور/کلاینت/پنل خوانده می‌شود تا روزی
 * که کسی یک طرف را عوض کرد، تست قرمز شود.
 */
const fs = require('fs');
const path = require('path');

const svc = require('../src/services/leagueCountdown');

let pass = 0; let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log('  ✓', name); }
  else { fail += 1; console.log('  ✗', name, detail ? `→ ${detail}` : ''); }
};
const throws = (fn, code) => {
  try { fn(); return false; } catch (e) { return code ? e.code === code : true; }
};

const ROOT = path.join(__dirname, '../..');
// ⚠️ فایلِ نبوده باید «بررسیِ ناموفق» بدهد، نه کرش: وگرنه یک فایلِ
//    ساخته‌نشده، ۳۰ نتیجهٔ دیگر را هم پنهان می‌کند.
const read = (rel) => {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return ''; }
};

/** کامنت‌ها را کنار می‌گذارد (درسِ `testMonitorAlerts`: توضیحِ باگ ≠ باگ). */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .split('\n')
  .filter((line) => {
    const t = line.trim();
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('///'));
  })
  .join('\n');

/** بدنهٔ یک هندلرِ سوکت را جدا می‌کند (تا «فلان هندلر دروازه دارد؟» پرسیدنی شود). */
function handlerBody(src, name) {
  const at = src.indexOf(`socket.on('${name}'`);
  if (at < 0) return '';
  // تا شروعِ هندلرِ بعدی
  const next = src.indexOf("socket.on('", at + 10);
  return src.slice(at, next < 0 ? src.length : next);
}

const EMOJI = /[\u{1F0A0}-\u{1F2FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/gu;

console.log('\n══ ۱) اعتبارسنجی و محاسبهٔ وضعیت (تابعِ خالص، بدونِ دیتابیس) ══');
{
  const now = Date.parse('2026-09-18T12:00:00Z');
  const iso = (ms) => new Date(ms).toISOString();

  const d = svc.computeState(svc.DEFAULTS, now);
  ok('پیش‌فرض: خاموش است و چیزی را نمی‌بندد', d.enabled === false && d.active === false
    && d.blocks.online === false && d.blocks.tap === false);
  ok('پیش‌فرض: «لیگِ خودکار» خاموش است (هیچ لیگی بدونِ ساختِ ادمین)',
    d.leagueAutostart === false, String(d.leagueAutostart));

  const on = svc.computeState({ ...svc.DEFAULTS, enabled: true, startsAt: iso(now + 3600_000) }, now);
  ok('روشن + آینده ⇒ فعال و هر دو مسیرِ سکه‌ای بسته',
    on.active === true && on.blocks.online === true && on.blocks.tap === true);
  ok('زمانِ باقی‌مانده درست حساب می‌شود', on.msLeft === 3600_000, String(on.msLeft));
  ok('وضعیت ساعتِ سرور را هم می‌دهد (کلاینت ساعتِ خودش را مبنا نگیرد)',
    on.serverNow === iso(now) && on.startsAt === iso(now + 3600_000));

  const past = svc.computeState({ ...svc.DEFAULTS, enabled: true, startsAt: iso(now - 1000) }, now);
  ok('رسیدن به صفر = آزادشدنِ خودکار (بدونِ کارِ دستی)', past.active === false
    && past.started === true && past.blocks.online === false && past.blocks.tap === false);
  ok('و کارتِ شمارش در آن حالت چیزی برای شمردن ندارد', past.msLeft === 0);

  const off = svc.computeState({ ...svc.DEFAULTS, enabled: false, startsAt: iso(now + 3600_000) }, now);
  ok('تیکِ خاموش، حتی با زمانِ آینده، چیزی را نمی‌بندد', off.active === false);

  ok('فعال‌کردن بدونِ زمان رد می‌شود',
    throws(() => svc.normalize({ enabled: true, startsAt: '' }), 'bad_input'));
  ok('زمانِ بی‌معنی رد می‌شود',
    throws(() => svc.normalize({ startsAt: 'فردا' }), 'bad_input'));
  ok('لیگِ نامعتبر (شناسهٔ غیرِ UUID) رد می‌شود — وگرنه کوئری ۵۰۰ می‌دهد',
    throws(() => svc.normalize({ seasonId: 'abc' }), 'bad_input'));
  ok('عنوانِ بلند بریده می‌شود (نه خطا)',
    svc.normalize({ title: 'ا'.repeat(200) }).title.length === svc.LIMITS.title);
  ok('عنوانِ خالی به پیش‌فرض برمی‌گردد',
    svc.normalize({ title: '   ' }).title === svc.DEFAULTS.title);
  ok('متنِ پیامِ قفل هم سقف دارد',
    svc.normalize({ message: 'ب'.repeat(500) }).message.length === svc.LIMITS.message);
  ok('ادمین می‌تواند «لیگِ خودکار» را روشن کند (رفتارِ قدیمی برگشت‌پذیر است)',
    svc.normalize({ leagueAutostart: true }).leagueAutostart === true);
  ok('عوض‌کردنِ لیگ، نشانهٔ «فعال شد» را پاک می‌کند (تا لیگِ نو هم فعال شود)',
    svc.normalize({ seasonId: '11111111-1111-1111-1111-111111111111' },
      { ...svc.DEFAULTS, seasonId: '22222222-2222-2222-2222-222222222222', seasonActivatedAt: 'x' })
      .seasonActivatedAt === null);
  ok('و اگر همان لیگ بماند، نشانه دست‌نخورده می‌ماند (فعال‌سازی دوباره نه)',
    svc.normalize({ startsAt: iso(now + 1000) },
      { ...svc.DEFAULTS, seasonId: '11111111-1111-1111-1111-111111111111', seasonActivatedAt: 'y' })
      .seasonActivatedAt === 'y');
}

console.log('\n══ ۲) معیارِ بستن: «هرچه سکه می‌دهد»، نه «هرچه آنلاین است» ══');
{
  // متغیرهای کش‌شده تا هندلرها از منبعِ واحد بخوانند (باگ: هر بار دو بار می‌خواند)
  const engine = stripComments(read('backend/src/games/engine.js'));

  const quick = handlerBody(engine, 'game:join');
  const mkLobby = handlerBody(engine, 'game:create_lobby');
  const joinLobby = handlerBody(engine, 'game:join_lobby');
  const mkRoom = handlerBody(engine, 'game:create_room');
  const joinRoom = handlerBody(engine, 'game:join_room');
  const bot = handlerBody(engine, 'game:play_bot');

  ok('بازیِ سریعِ آنلاین بسته است (سهم‌دار ⇒ سکه‌دار)',
    /rejectIfLeagueLocked\(socket\)/.test(quick));
  ok('ساختِ لابیِ عمومی بسته است', /rejectIfLeagueLocked\(socket\)/.test(mkLobby));
  ok('پیوستن به لابیِ عمومی هم بسته است', /rejectIfLeagueLocked\(socket\)/.test(joinLobby));
  ok('اتاقِ خصوصی **باز** است (سهمِ صفر ⇒ فقط امتیاز، بدونِ سکه)',
    mkRoom.length > 0 && !/rejectIfLeagueLocked/.test(mkRoom));
  ok('پیوستن به اتاقِ خصوصی هم باز است',
    joinRoom.length > 0 && !/rejectIfLeagueLocked/.test(joinRoom));
  ok('بازی با ربات باز است', bot.length > 0 && !/rejectIfLeagueLocked/.test(bot));

  // نبردِ دوباره: تنها راهِ فراری که اگر بسته نشود، سکه‌ها ادامه پیدا می‌کنند.
  const rematch = engine.slice(engine.indexOf('async function requestRematch'),
    engine.indexOf('function startRoomOrError') > 0 ? engine.indexOf('async function requestRematch') + 4000 : undefined);
  ok('نبردِ دوباره روی مسابقهٔ سهم‌دار بسته است (وگرنه راهِ فرارِ قفل)',
    /Number\(contract\.stake \|\| 0\) > 0/.test(rematch) && /league_countdown/.test(rematch));
  ok('و برای اتاق/ربات (سهمِ صفر) باز می‌ماند — شرط فقط روی سهم است',
    !/contract\.stake === undefined/.test(rematch));

  // چرا این معبر «سکه‌دار» است: سهم در سرویسِ امنِ مسابقه تسویه و سکه می‌شود.
  const stakeSvc = stripComments(read('backend/src/services/gameStakeService.js'));
  ok('سکه فقط از تسویهٔ سهم می‌آید (پس بستنِ مسیرهای سهم = بستنِ سکه)',
    /coins\.awardCoins/.test(stakeSvc) && /coin_reward_win/.test(stakeSvc));

  const server = stripComments(read('backend/src/server.js'))
    + stripComments(read('backend/src/routes/games.js'));
  ok('ضربه‌زن (منبعِ سکه) هم بسته است و کدِ ماشینی می‌دهد',
    /gate\.blocks\.tap/.test(server) && /code: 'league_countdown'/.test(server));
  ok('و ۴۲۳ (Locked) برمی‌گرداند، نه ۴۰۳ — کلاینت باید «بسته است» را از «اجازه نداری» جدا کند',
    /status\(423\)/.test(server));
  ok('صفحهٔ ضربه‌زن وضعیتِ قفل را با همان درخواستِ پیشرفت می‌گیرد (بدونِ رفت‌وبرگشتِ اضافه)',
    /leagueLocked/.test(server) && /countdown: gate/.test(server));

  // الگوی همگام: تصمیمِ سوکت نباید منتظرِ دیتابیس بماند.
  ok('تصمیمِ موتور همگام است (کشِ ۵ ثانیه‌ای)، وگرنه هندلرهای سوکت کند می‌شوند',
    /function cached\(/.test(stripComments(read('backend/src/services/leagueCountdown.js')))
    && /refresh\(\)/.test(stripComments(read('backend/src/services/leagueCountdown.js'))));
  ok('شکستِ خواندنِ دیتابیس = باز (محصول نباید قفل شود)',
    /بدونِ دیتابیس = پیش‌فرضِ «باز»/.test(read('backend/src/services/leagueCountdown.js')));
}

console.log('\n══ ۳) «هیچ لیگی بدونِ ساختِ ادمین» ══');
{
  const league = stripComments(read('backend/src/services/leagueService.js'));
  ok('ساختِ خودکارِ فصل با اجازهٔ ادمین شرطی شده است',
    /leagueCountdown\.cached\(\)\.leagueAutostart/.test(league));
  ok('و وقتی خاموش است، «هیچ فصلی» برمی‌گرداند (نه فصلِ ساختگی)',
    /if \(!leagueCountdown\.cached\(\)\.leagueAutostart\) return null;/.test(league));
  ok('جدولِ لیگ بدونِ فصل، پاسخِ خالی می‌دهد و کرش نمی‌کند',
    /season: null,\s*\n\s*activeLeagues: \[\],/.test(league));
  ok('فهرستِ لیگ‌های فعال هیچ‌وقت [null] نمی‌شود',
    /season \? \[season\] : \[\]/.test(league));

  const svcSrc = stripComments(read('backend/src/services/leagueCountdown.js'));
  ok('سرِ ساعتِ صفر، لیگِ انتخاب‌شده فعال می‌شود (خواستهٔ مالک)',
    /async function activateSeason/.test(svcSrc) && /status='active'/.test(svcSrc));
  ok('و این کار یک‌بار انجام می‌شود (نشانهٔ seasonActivatedAt)',
    /markSeasonActivated/.test(svcSrc) && /seasonActivatedAt/.test(svcSrc));
  ok('فعال‌سازی از مسیرِ خواندنِ عمومی راه می‌افتد (بدونِ نیاز به کرون)',
    /if \(state\.started && state\.seasonId && !state\.seasonActivatedAt\)/.test(svcSrc));
  ok('لیگِ بسته‌شده دوباره باز نمی‌شود (شرطِ status <>\'closed\')',
    /AND status <> 'closed'/.test(svcSrc));
  ok('پنل می‌تواند لیگ‌ها را برای انتخاب فهرست کند',
    /async function listSeasons/.test(svcSrc) && /FROM league_seasons/.test(svcSrc));
}

console.log('\n══ ۴) قراردادِ مشترک: سرور، وب، اندروید، پنل ══');
{
  const webCard = read('userweb/src/components/LeagueCountdown.jsx');
  const webPages = {
    league: read('userweb/src/screens/League.jsx'),
    games: read('userweb/src/games.jsx'),
    tap: read('userweb/src/tapGame.jsx'),
  };
  const mobCard = read('mobile/lib/widgets/league_countdown.dart');
  const mobPages = {
    league: read('mobile/lib/screens/user/league_page.dart'),
    // «بازیِ آنلاین» در اندروید همان هابِ بازی است (`social_page` فقط تب‌ها
    // را نگه می‌دارد و `GamesHubPage` را نشان می‌دهد).
    games: read('mobile/lib/screens/user/games_page.dart'),
    tap: read('mobile/lib/screens/user/games/tap/tap_screen.dart'),
  };
  const adminPage = read('admin/src/pages/league-countdown.jsx');

  ok('وب: کارتِ شماره معکوس از مسیرِ عمومی می‌خواند',
    /\/api\/league\/countdown/.test(webCard));
  ok('اندروید: همان مسیر را می‌خواند', /\/api\/league\/countdown/.test(mobCard));
  ok('هر سه صفحهٔ وب کارت را نشان می‌دهند',
    /LeagueCountdown/.test(webPages.league) && /LeagueCountdown/.test(webPages.games)
    && /LeagueCountdown/.test(webPages.tap));
  ok('هر سه صفحهٔ اندروید کارت را نشان می‌دهند',
    /LeagueCountdownCard/.test(mobPages.league) && /LeagueCountdownCard/.test(mobPages.games)
    && /LeagueCountdownCard/.test(mobPages.tap));
  ok('وب دکمه‌های مسیرِ بسته را غیرفعال می‌کند و دلیلش را از متنِ ادمین می‌گوید',
    /leagueCd\.active/.test(webPages.games) && /leagueCd\.message/.test(webPages.games)
    && /leagueLock\.active/.test(webPages.tap) && /leagueLock\.message/.test(webPages.tap));
  ok('اندروید هم همان دو مسیر را می‌بندد (و پیامش را از سرور می‌خواند)',
    /LeagueCountdownStore\.instance\.blocksOnline/.test(mobPages.games)
    && /LeagueCountdownStore\.instance\.blocksTap/.test(mobPages.tap));
  // ── چرا این دو بررسی مهم‌اند ──
  // حتی اگر کلاینت به هر دلیلی (نسخهٔ قدیمی، دکمهٔ فعال) اجازهٔ تلاش بدهد،
  // سرور «game:error» با متنِ ادمین می‌فرستد و هر دو کلاینت همان متن را
  // نشان می‌دهند. پس قفلِ نهایی به کلاینت وابسته نیست.
  ok('وب پیامِ سرور را در صحنهٔ بازی نشان می‌دهد (قفل به کلاینت وابسته نیست)',
    /setError\(d\?\.message/.test(read('userweb/src/gameSession.js')));
  ok('اندروید هم همان پیام را نشان می‌دهد',
    /_fail\(_msg\(d\)/.test(read('mobile/lib/screens/user/games/game_session.dart')));

  // ── متن نباید در کلاینت هاردکد شود (خواستهٔ صریحِ مالک) ──
  const texts = [svc.DEFAULTS.title, svc.DEFAULTS.subtitle, svc.DEFAULTS.note, svc.DEFAULTS.message];
  const baked = [
    ['وب', webCard], ['اندروید', mobCard],
  ].filter(([, src]) => texts.some((t) => t && src.includes(t))).map(([n]) => n);
  ok('متنِ پیش‌فرض در هیچ کلاینتی هاردکد نشده (بدونِ آپدیتِ اپ عوض می‌شود)',
    baked.length === 0, baked.join(', '));
  ok('و هر دو کلاینت متن را از پاسخ می‌خوانند',
    /\.title/.test(webCard) && /\.subtitle|\.note/.test(webCard)
    && /title/.test(mobCard) && /note|subtitle/.test(mobCard));
  ok('ساعتِ مرجع از سرور می‌آید (کلاینت ساعتِ گوشی را مبنا نمی‌گیرد)',
    /serverNow/.test(webCard) && /serverNow/.test(mobCard));

  ok('پنل: تیکِ فعال + زمان + متن‌ها + انتخابِ لیگ',
    /enabled/.test(adminPage) && /startsAt/.test(adminPage) && /title/.test(adminPage)
    && /note/.test(adminPage) && /seasonId/.test(adminPage));
  ok('پنل پیش‌نمایشِ همان کارتی را نشان می‌دهد که کاربر می‌بیند',
    /پیش‌نمایش/.test(adminPage) && /شماره معکوس|شمارش/.test(adminPage));
  const adminMain = read('admin/src/main.jsx');
  const combinedAdminPage = read('admin/src/pages/league.jsx');
  ok('شمارش مستقیماً داخل فرمِ کانفیگِ لیگ ادمین ترکیب شده است',
    /کانفیگ لیگ/.test(combinedAdminPage)
    && /countdownEnabled/.test(combinedAdminPage)
    && /api\/admin\/league-countdown/.test(combinedAdminPage)
    && !/league-countdown.*LeagueCountdownPage/.test(adminMain));
  ok('صفحهٔ پنل فقط برای مدیرکل است (قفلِ اقتصادِ بازی)',
    /league-countdown/.test(read('admin/src/lib/roles.js')));
  ok('پنل دربارهٔ «لیگِ خودکار» هم تصمیم می‌گیرد (خواستهٔ مالک)',
    /leagueAutostart/.test(adminPage));
}

console.log('\n══ ۵) دسترسی، ثبت و مستندات ══');
{
  const routeSrc = stripComments(read('backend/src/routes/leagueCountdown.js'));
  ok('مسیرِ عمومی هیچ محافظی ندارد و در فهرستِ سفید توضیح داده شده',
    /router\.get\('\/league\/countdown', asyncHandler/.test(routeSrc)
    && /GET \/api\/league\/countdown/.test(read('backend/scripts/testRouteAuth.js')));
  const adminRoutes = routeSrc.match(
    /router\.(?:get|put|post)\('[^']*admin[^']*',\s*adminAuth,\s*(?:validateUuid\('id'\),\s*)?requireRole\(\)/g) || [];
  ok('هر دو مسیرِ پنل هم adminAuth و هم requireRole دارند', adminRoutes.length === 2,
    `${adminRoutes.length} از ۲`);
  ok('ذخیرهٔ تنظیمات در کارنامهٔ ممیزی ثبت می‌شود', /await audit\(/.test(routeSrc));
  ok('مسیرها در server.js وصل شده‌اند',
    /routes\/leagueCountdown/.test(read('backend/src/server.js')));
  ok('و در openapi مستند شده‌اند',
    /league\/countdown/.test(read('backend/docs/openapi.yaml')));
  ok('گارد در زنجیرهٔ npm test هست',
    /testLeagueCountdown\.js/.test(read('backend/package.json')));
}

console.log('\n══ ۶) کپیِ فارسی، بدونِ ایموجی ══');
{
  // همان قاعدهٔ گاردِ سراسریِ محصول (`userweb/tool/no-emoji.mjs`): ایموجیِ
  // **رابطِ کاربری** ممنوع است، ولی ⚠️ داخلِ کامنت که کاربر نمی‌بیندش مجاز
  // است. پس کامنت‌ها پیش از بررسی کنار می‌روند — وگرنه این گارد روی توضیحاتِ
  // خودِ کد قرمز می‌شود (همان درسی که در `testMonitorAlerts` گرفته شد).
  const ALLOW = new Set(['→', '←', '↑', '↓', '↩', '⟶', '✓', '✗', '✕', '⌄', '·',
    '—', '–', '★', '✦', '♛', '♚', '◆', '◎', '⌛', '×']);
  const visibleOnly = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('///'));
    })
    .join('\n');
  const emojiIn = (src) => [...new Set((src.match(EMOJI) || []).filter((c) => !ALLOW.has(c)))];

  for (const [name, file] of [
    ['وب (کارت)', 'userweb/src/components/LeagueCountdown.jsx'],
    ['اندروید (کارت)', 'mobile/lib/widgets/league_countdown.dart'],
    ['اندروید (صفحهٔ ضربه‌زن)', 'mobile/lib/screens/user/games/tap/tap_screen.dart'],
    ['پنل', 'admin/src/pages/league-countdown.jsx'],
    // متن‌های پیش‌فرض هم در کدِ سرور زندگی می‌کنند و همان‌ها به کاربر می‌رسند.
    ['سرور (سرویس)', 'backend/src/services/leagueCountdown.js'],
  ]) {
    const src = read(file);
    ok(`${name}: بدونِ ایموجی`, emojiIn(visibleOnly(src)).length === 0,
      emojiIn(visibleOnly(src)).join(''));
    ok(`${name}: متنِ فارسی دارد`, /[\u0600-\u06FF]/.test(src));
  }
}

console.log('\n══ ۷) «هیچ لیگی بدونِ ساختِ ادمین»: پنل نباید ۵۰۰ بدهد ══');
{
  // ── چرا این بخش اضافه شد ──────────────────────────────────────────────
  //
  // خواستهٔ مالک: «از این به بعد بدونِ ساختِ تنظیماتِ لیگ توسطِ ادمین هیچ
  // لیگی نباید در جریان باشه.» تا آن روز `ensureActiveSeason()` بی‌قید یک
  // فصل می‌ساخت، پس هیچ مسیری به حالتِ «فصلِ `null`» نمی‌رسید.
  //
  // در CI همین شکست خورد (`backend-e2e`): `PATCH /admin/league/current/prizes`
  // با یک جدولِ جایزهٔ **سالم** کدِ ۵۰۰ برمی‌گرداند — یعنی «بدونِ لیگ، پنل
  // می‌ترکد». حالا هر مسیر یا ۲۰۰ با پرچم می‌دهد یا ۴۰۹ با کدِ روشن.
  const admin = stripComments(read('backend/src/routes/adminLeague.js'));
  ok('کدِ ماشینی و پیامِ فارسی برای «لیگی نیست» تعریف شده',
    /NO_ACTIVE_LEAGUE_CODE\s*=\s*'no_active_league'/.test(admin)
    && /NO_ACTIVE_LEAGUE_MESSAGE\s*=\s*\n?\s*'در حال حاضر هیچ لیگِ فعالی/.test(admin));
  ok('صفحهٔ «لیگ ماهانه» با پرچم باز می‌شود، نه با خطا',
    /if \(!season\) \{[\s\S]{0,300}data\.noActiveLeague = true/.test(admin));
  const guardHits = admin.match(/if \(!season\) return noActiveLeague\(res\);/g) || [];
  ok('ذخیرهٔ جوایز و تغییرِ تاریخ هر دو نگهبانِ فصل دارند', guardHits.length === 2,
    `${guardHits.length} از ۲`);
  ok('بستنِ «لیگِ جاری» هم بدونِ لیگ ۴۰۹ می‌دهد',
    /if \(!\(await ensureActiveSeason\(\)\)\) return noActiveLeague\(res\)/.test(admin));
  ok('سرویسِ بستنِ فصل با فصلِ `null` برنمی‌گردد (به‌جای `season.id`)',
    /if \(!season\) \{[\s\S]{0,200}skipped: 'no active season'/.test(
      stripComments(read('backend/src/services/leagueService.js'))));

  // ── گرم‌کردنِ کش در بوت ──
  //
  // گیت‌های سوکت **همگام** از کشِ شماره معکوس می‌خوانند؛ اگر کش در بوت سرد
  // بماند، بعد از هر دیپلوی یک پنجرهٔ کوتاه باز می‌شود. ترتیب هم مهم است:
  // اول کش، بعد تصمیمِ «شروعِ خودکارِ لیگ».
  const boot = read('backend/src/server.js');
  const iRef = boot.indexOf('leagueCountdown.refresh()');
  ok('کشِ شماره معکوس در بوت گرم می‌شود',
    iRef > 0 && boot.slice(iRef, iRef + 900).includes('await ensureActiveSeason();'),
    `index=${iRef}`);
  ok('و تستِ زنجیرهٔ CI این رفتار را می‌سنجد',
    /no_active_league/.test(read('backend/scripts/testE2E.js')));
  // ── مسیرِ داغِ امتیازِ لیگ ──
  //
  // دومین جایی که `season.id` روی `null` می‌ترکید: fallbackِ
  // `addLeaguePoints` وقتی هیچ لیگی نیست. این یکی روی **مسیرِ داغِ بازیِ
  // ضربه‌زن** بود، یعنی کاربر عادی با ۵۰۰ روبه‌رو می‌شد (روی سرور با
  // `testLeaderboardSocket.js` گرفته شد).
  ok('امتیازِ لیگ بدونِ فصلِ فعال بی‌صدا رد می‌شود (نه ۵۰۰ روی بازی)',
    /if \(!season\) return;[\s\S]{0,600}\[season\.id, userId, points\]/.test(
      stripComments(read('backend/src/services/leagueService.js'))));
  ok('تستِ سوکتِ لیدربورد خودش لیگِ آزمایشی می‌سازد (بدونِ لیگِ خودکار)',
    /admin\/league\/seasons/.test(read('backend/scripts/testLeaderboardSocket.js')));

  // ── واگراییِ اسکیما: ستونِ `league_seasons.month_year` ──
  //
  // `001_initial_schema.sql` آن را `VARCHAR(7)` می‌سازد، ولی «دو لیگِ
  // هم‌زمان» شناسهٔ بلندِ `monthly-2026-09-17` می‌سازد. روی تولید دستی به
  // ۳۲ پهن شده بود و همان ALTER هرگز به `migrations/` نرسید؛ یعنی هر
  // دیتابیسِ تازه‌ای (CI، بازیابی از بکاپ، نصبِ تازه) با ساختنِ لیگ از پنل
  // ۵۰۰ می‌داد: `value too long for type character varying(7)`.
  //
  // حالا که ساختنِ لیگ توسطِ ادمین **مسیرِ اصلی** است، این باید در
  // مایگریشن‌ها بسته شده باشد — نه با یک ALTER دستیِ دیگر روی سرور.
  const migDir = path.join(ROOT, 'backend/migrations');
  const widener = fs.readdirSync(migDir)
    .filter((f) => f.endsWith('.sql'))
    .find((f) => /ALTER TABLE league_seasons[\s\S]{0,120}ALTER COLUMN month_year TYPE VARCHAR\(32\)/
      .test(fs.readFileSync(path.join(migDir, f), 'utf8').replace(/--[^\n]*/g, ' ')));
  ok('مایگریشنی `month_year` را پهن می‌کند (دیتابیسِ تازه = تولید)',
    !!widener, 'بدونِ آن، ساختنِ لیگِ دوم روی دیتابیسِ تازه ۵۰۰ می‌دهد');
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} بررسی موفق، ${fail} ناموفق\n`);
process.exit(fail === 0 ? 0 : 1);
