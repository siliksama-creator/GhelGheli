#!/usr/bin/env node
// گاردِ فاز ۲: سیم‌کشیِ «متن و عددِ زنده» در هر سه لایه.
//
// ── چرا یک تستِ بک‌اند، وقتی گارد اصلی در userweb/tool است؟ ─────────────
//
// گاردِ `live-copy-parity.mjs` منطقِ سنگینِ پارس را دارد (سرور، وب، اندروید
// همه در یک‌جا). اما `npm test` بک‌اند هیچ‌وقت آن را صدا نمی‌زد و CI ما دو
// شغلِ جداست: یک job برای بک‌اند، یک job برای userweb. نتیجه؟ اگر کسی فقط
// بک‌اند را اجرا کند (که مسیرِ همیشگیِ «سرعة بازگشت» است)، اتصالِ متن‌ها
// اصلاً بررسی نمی‌شود. این اسکریپت همان گارد را از این‌جا هم اجرا می‌کند و
// سه چیزِ *ساختاری* را اضافه می‌سنجد که از داخلِ بک‌اند قابل دیدن‌اند:
//
//   ۱. هر دو `package.json` واقعاً گارد را در `npm test` دارند — یک گاردِ
//      نوشته‌شده اما فراخوانی‌نشده، بدتر از نبودنش است: به ما اطمینانِ
//      کاذب می‌دهد. (دقیقاً همین سرِ `test:card-box` آمد؛ ماه‌ها نوشته
//      بودیم و در CI نبود.)
//   ۲. اندروید *هم* از همان منبعِ خواندن استفاده می‌کند، نه `fetch`
//      دستیِ هر رشته: در فازهای اول، هفت نقطهٔ پراکنده `/api/config`
//      می‌زدند و هر کدام فقط تکه‌ای از آن را مصرف می‌کرد.
//   ۳. پاسخِ `/api/config` همان چیزی است که هر دو کلاینت فرض می‌کنند:
//      `copy`، `rules`، `avatars`، `configVersion` و شاخه‌هایِ عددی که
//      جای‌نگهدارها از آن‌ها پر می‌شوند (`economy.dailyCoinQuota`،
//      `stakes.public`، `referral.spinsPerDailyThreshold`…). اگر یکِشان
//      حذف شود، کلاینت **بی‌صدا** به فول‌بک می‌افتد و ادمین فکر می‌کند
//      پنل کار نمی‌کند.
//
// هیچ‌کدام از این‌ها دیتابیس یا شبکه لازم ندارند؛ فقط فایل‌خوانی.

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, name, detail) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); return; }
  fail++;
  console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`);
};

// ── ۱) اجراشدنِ گارد ────────────────────────────────────────────────────
console.log('\n== گاردِ همسانیِ متنِ زنده ==');
{
  const { spawnSync } = require('child_process');
  const r = spawnSync(process.execPath,
    [path.join(root, 'userweb/tool/live-copy-parity.mjs')],
    { encoding: 'utf8', cwd: path.join(root, 'userweb') });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const m = out.match(/✅ (\d+) بررسی/);
  ok(r.status === 0, '`live-copy-parity` بدون خطا تمام شد', out.slice(-800));
  // «سبز» کافی نیست: گاردی که هیچ کلیدی پیدا نکند هم صفر خارج می‌شود.
  ok(m && Number(m[1]) >= 30, `گارد ${m ? m[1] : 'هیچ'} بررسی انجام داد (کف: ۳۰)`,
    out.slice(-400));
}

// ── ۲) ثبت‌شدن در هر دو npm test ────────────────────────────────────────
console.log('\n== گارد در CI فهرست شده ==');
{
  const web = JSON.parse(read('userweb/package.json'));
  ok(!!web.scripts['test:live-copy-parity'],
    'userweb: اسکریپت `test:live-copy-parity` وجود دارد');
  const be = JSON.parse(read('backend/package.json'));
  ok(be.scripts.test.includes('testLiveWiring.js'),
    'backend: `npm test` این گارد را صدا می‌زند');
  ok(be.scripts.test.includes('testAdminCopyParity.js'),
    'backend: همسانیِ دو پنل (`testAdminCopyParity`) هم در `npm test` است');
  ok(!!web.scripts['test:admin-copy-parity'],
    'userweb: اسکریپتِ `test:admin-copy-parity` ثبت شده');
  ok(web.scripts['test:live-copy-parity'] === 'node tool/live-copy-parity.mjs'
    && web.scripts['test:admin-copy-parity'] === 'node tool/admin-copy-parity.mjs',
    'هر دو گارد به فایلِ درست اشاره می‌کنند');
  ok(be.scripts.test.includes('testLiveContent.js'),
    'backend: گاردِ محتوای زنده (`testLiveContent`) هم در `npm test` است',
    'بی‌این خط، افزودنِ قالبِ جدید به پنل بدونِ تستِ قرارداد ممکن می‌شد');
  // یک گاردِ ثبت‌شده اما با مسیرِ غلط، در CI با «MODULE_NOT_FOUND» قرمز
  // می‌شود و کسی فکر می‌کد کد بد است؛ پس بودِن فایل را چک می‌کنیم.
  const target = (web.scripts['test:live-copy-parity'] || '')
    .replace(/^node\s+/, '').trim();
  ok(target && fs.existsSync(path.join(root, 'userweb', target)),
    `مسیرِ اسکریپت درست است (${target || '—'})`);
}

// ── ۳) منبعِ یکتای خواندن در اندروید ────────────────────────────────────
console.log('\n== اندروید از منبعِ یکتا می‌خواند ==');
{
  const appConfig = read('mobile/lib/core/app_config.dart');
  ok(/class AppConfig extends ChangeNotifier/.test(appConfig),
    'AppConfig به‌عنوان ChangeNotifier وجود دارد (صفحه‌ها با رسیدنِ config بازسازی می‌شوند)');
  ok(/notifyListeners\(\)/.test(appConfig),
    'AppConfig شنونده‌ها را باخبر می‌کند');
  ok(/didChangeAppLifecycleState\(AppLifecycleState state\)[\s\S]{0,240}resumed/.test(appConfig),
    'بازگشت از پس‌زمینه یک refresh می‌زند («تغییرِ پنل بدونِ نصبِ آپدیت» برای اپِ باز)');
  ok(/liveText\(/.test(appConfig) && /liveRule\(/.test(appConfig),
    'دو helper عمومی (متن و عددِ ساختاری) صادر می‌شوند');

  // رشته‌های کاربرِ اندروید نباید `await api.get('/api/config')` مستقل
  // داشته باشند مگر در نقطه‌هایی که از قبل داشته‌اند. فهرستِ مجاز، صریح
  // و با دلیلی است که در نقشه‌راه آمده — و تستِ `home_shell` هم سقفِ
  // «حداکثر دو درخواست به هر مسیر» را دارد، پس نمی‌توانیم fetch تازه
  // اضافه کنیم.
  const ALLOWED_CONFIG_FETCH_SITES = [
    'mobile/lib/screens/auth/auth_screen.dart',
    'mobile/lib/screens/user/games_page.dart',
    'mobile/lib/screens/user/games/private_match_dialog.dart',
    'mobile/lib/screens/user/league_page.dart',
    'mobile/lib/screens/user/games/tap/tap_screen.dart',
    'mobile/lib/screens/user/wheel_page.dart',
    'mobile/lib/screens/user/home_shell.dart',
  ];
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const full = path.join(d, e.name);
    if (e.isDirectory()) return walk(full);
    return e.name.endsWith('.dart') ? [full] : [];
  });
  const sites = walk(path.join(root, 'mobile/lib'))
    .map(f => path.relative(root, f))
    .filter(f => /get\(\s*['"]\/api\/config['"]/.test(read(f)));
  const extra = sites.filter(f => !ALLOWED_CONFIG_FETCH_SITES.includes(f));
  ok(extra.length === 0, 'هیچ نقطهٔ تازه‌ای `/api/config` را مستقل نمی‌زند',
    `${extra.join(', ')} → باید از AppConfig.instance بخواند، نه fetchِ جدید`);
  console.log(`      (${sites.length} نقطهٔ مجاز، همان‌هایی که از قبل بود)`);

  // و برعکس: اگر روزی یکی از این نقطه‌ها fetch را حذف کرد، ردیفِ سفید
  // باید پاک شود؛ وگرنه روزی کسی fetchِ اضافه‌ای را «مجاز» می‌بیند.
  const dead = ALLOWED_CONFIG_FETCH_SITES.filter(f =>
    !/get\(\s*['"]\/api\/config['"]/.test(read(f)));
  ok(dead.length === 0, 'فهرستِ مجاز کهنه نشده', dead.join(', '));

  // و *اتمامِ* حلقه: هر نقطه‌ای که `/api/config` را خودش می‌گیرد باید
  // همان بدنه را به `AppConfig` بدهد. بیِ این سنجه، «منبعِ یکتا» فقط یک
  // شعارِ معماری است: صفحه‌ای config را می‌گیرد، تکه‌ای از آن را برای
  // خودش برمی‌دارد و بقیهٔ رشته‌هایش تا باری که home_shell آن را می‌گیرد
  // (یا تا بازگشتِ اپ از پس‌زمینه) کهنه می‌ماند — یعنی عددِ امروز در
  // جدول و جملهٔ دیروز در توضیح. این را چهار صفحه داشت (گردونه،
  // بازی‌ها، لیگ، ضربه‌زن) و با همین خط قرمز شد.
  const unfed = ALLOWED_CONFIG_FETCH_SITES.filter(f =>
    !/AppConfig\.instance\.apply\(/.test(read(f)));
  ok(unfed.length === 0,
    'هر نقطهٔ برداشتِ config، همان بدنه را به منبع می‌دهد',
    unfed.join(', ') + ' → `AppConfig.instance.apply(...)` لازم دارد');
}

// ── ۴) پاسخِ /api/config همان چیزی است که کلاینت‌ها فرض می‌کنند ─────────
console.log('\n== بدنهٔ /api/config کامل است ==');
{
  const src = read('backend/src/routes/clientConfig.js');
  // هر کلیدی که *کلاینت‌ها* از آن تغذیه می‌شوند باید در پاسخ باشد.
  const required = [
    ['کپیِ متن‌ها', /copy:\s*liveContent\.copy\(\)/],
    ['اعدادِ ساختاری', /rules:\s*liveContent\.rules\(\)/],
    ['شمارهٔ نسل', /configVersion:\s*liveContent\.configVersion\(\)/],
    ['لایه‌های ورودی', /stakes\s*[:=]/],
    // `economy` همان چیزی است که سهمیهٔ سکه (`dailyCoinQuota`) و
    // سکهٔ هر لول (`tapCoinsPerLevel`) از آن خوانده می‌شود؛ در پاسخ،
    // خروجِ `gameEconomy.publicView()` است نه یک فیلدِ هم‌نام — پس
    // این‌طور لنگر می‌زنیم. (نسخهٔ اولِ همین خط `dailyCoinQuota` را در
    // فایلِ مسیرِ config می‌جست و قرمز می‌شد، در حالی که کد درست بود:
    // خودِ گارد هم باید درستِ محصول را بفهمد.)
    ['اقتصادِ بازی (سهمیهٔ سکه و ضربه‌زن)', /economy:\s*await gameEconomy\.publicView\(\)/],
    ['فهرستِ آواتار', /avatars/],
    ['ضریبِ آستانهٔ معرفی', /spinsPerDailyThreshold/],
  ];
  for (const [label, re] of required) ok(re.test(src), `${label} در پاسخ هست`);

  // قراردادِ مهم: اگر `liveContent` در دسترس نباشد (بوتِ ناقص)، پاسخ نباید
  // `copy: undefined` بدهد — کلاینت در آن حالت *بدونِ هیچ نشانه‌ای* به
  // فول‌بک می‌افتد و ادمین فکر می‌کند پنل خراب است.
  ok(/liveContent\s*\?/.test(src),
    'نبودِ liveContent با ساختارِ کاملِ خالی پاسخ داده می‌شود، نه undefined');

  // اعدادی که در متن‌ها جای‌گذاری می‌شوند، باید از *همان* منبعِ سرور بیایند.
  const svc = require('../src/services/liveContent.js');
  const rules = svc.RULE_DEFS;
  for (const [name, def] of Object.entries(rules)) {
    ok(Number.isFinite(def.value) && def.value >= def.min && def.value <= def.max,
      `قاعدهٔ «${name}» داخل بازهٔ خودش است (${def.value} ∈ [${def.min}, ${def.max}])`);
  }
  // و مهم‌ترینِ‌شان برای UI: همان‌ها که در متن نوشته می‌شوند.
  for (const name of ['memoryPairs', 'roomCodeLength', 'reconnectSeconds', 'reviewSlaHours']) {
    ok(!!rules[name], `«${name}» در RULE_DEFS ثبت است (متن‌ها به آن تکیه می‌کنند)`);
  }
}

// ── ۵) هیچ رقمِ بی‌فهرستِ سفیدی در متن‌های وصل‌شده نمانده ───────────────
console.log('\n== رقم‌های باقی‌مانده ==');
{
  const digits = /[\u06f0-\u06f9]/; // ۰..۹
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const full = path.join(d, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.(js|jsx|dart)$/.test(e.name) ? [full] : [];
  });
  // فقط فایل‌هایی که در فاز ۲ سیم‌کشی شده‌اند — وگرنه این سنجه به یک
  // جست‌وجویِ سراسریِ پر از نتایجِ بی‌ربط تبدیل می‌شد (و دقیقاً به همین
  // دلیل، نسخهٔ اولِ گاردِ رقم، در `test:no-emoji` تکراری و بی‌اثر بود).
  const wired = [
    'userweb/src/components/CoinGuide.jsx',
    'userweb/src/components/CoinRateStrip.jsx',
    'userweb/src/components/LoginStreak.jsx',
    'userweb/src/screens/Referral.jsx',
    'userweb/src/screens/Wheel.jsx',
    'userweb/src/games.jsx',
    'mobile/lib/widgets/coin_guide.dart',
    'mobile/lib/widgets/coin_rate_strip.dart',
    'mobile/lib/screens/user/login_streak_card.dart',
    'mobile/lib/screens/user/referral_page.dart',
    'mobile/lib/screens/user/wheel_page.dart',
    'mobile/lib/screens/user/games_page.dart',
  ];
  const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/\/?.*$/gm, '').replace(/([^:])\/\/.*$/gm, '$1');
  let leftovers = 0;
  for (const f of wired) {
    const src = strip(read(f));
    // رقمِ فارسی داخلِ **رشته** بدونِ `${…}`، بیرون از فول‌بک‌هایی که
    // خودِ گاردِ اصلی (تطبیقِ رقم با قالبِ سرور) می‌سنجد — اینجا فقط
    // شمارش می‌کنیم تا «صفر شدن» را ببینیم و به آدم نشان بدهیم کجاست.
    const bad = [...src.matchAll(/(['"`])([^'"`\n]*)\1/g)]
      .filter(m => digits.test(m[2]) && !m[2].includes('${'))
      .map(m => m[2].slice(0, 40));
    if (bad.length) {
      leftovers += bad.length;
      console.log(`      ${f}: ${bad.length} رشته با رقمِ سفت‌شده — ${bad[0]}…`);
    }
  }
  // قاعدهٔ نقشه‌راه: رقمِ فارسی در UI فقط وقتی مجاز است که **همان رقم** در
  // قالبِ سرور هم باشد (یعنی ادمین می‌تواند عوضش کند) — و آن را
  // `live-copy-parity` می‌سنجد. اینجا سنجه‌ای مستقل نداریم که با «صفرِ
  // واقعی» اشتباه گرفته شود، پس فقط اگر تعداد *بیش از حدِ مجاز* رفت،
  // قرمز می‌شویم و لیست را چاپ می‌کنیم.
  const cap = 14;
  ok(leftovers <= cap, `رقمِ سفت‌شدهٔ باقی‌مانده از سقفِ ${cap} بیشتر نشد (${leftovers})`,
    'هر رقمِ تازه یعنی یک «عددِ بی‌فهرستِ سفید» — بند ۱ نقشه‌راه');
}

console.log(`\n${fail ? '✗' : '✅'} ${pass} موفق، ${fail} ناموفق\n`);
process.exit(fail ? 1 : 0);
