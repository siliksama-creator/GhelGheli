/**
 * نگهبانِ کلیدِ محدودکنندهٔ نرخ.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * این تست برای چه باگی نوشته شد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `express-rate-limit` وقتی `keyGenerator` ندهی، کلید را از `req.ip`
 * می‌سازد. برای مسیرهای عمومی (ورود، درخواست OTP) درست است — آنجا هنوز
 * نمی‌دانیم کاربر کیست و IP تنها چیزی است که داریم.
 *
 * ولی برای مسیری که **پشتِ `auth`** است، کلیدِ IP یک باگِ تمام‌عیار است:
 *
 *   ۱. اپراتورهای موبایل ایران CGNAT دارند. صدها مشترکِ واقعی از یک IP
 *      عمومی بیرون می‌روند. یک IP یعنی یک سطل. پس اولین کاربری که
 *      سهمیه‌اش را تمام می‌کند، بقیه را هم قفل می‌کند — بدون اینکه آن‌ها
 *      حتی یک درخواست فرستاده باشند.
 *
 *   ۲. کسی که واقعاً می‌خواهد سوءاستفاده کند، با خاموش/روشن کردنِ دیتای
 *      موبایل IP تازه می‌گیرد و سطلش خالی می‌شود. یعنی محدودیت **او** را
 *      نمی‌گیرد و فقط کاربرِ درستکار را می‌گیرد. دقیقاً برعکسِ هدف.
 *
 * این باگ روی `submitLimiter` («ثبت کارت با عکس») واقعاً اتفاق افتاد و
 * حتی تست‌های سرتاسری را کور کرده بود: هر اجرا ۴۲۹ می‌گرفت و هرگز به
 * منطقی که قرار بود آزمایش شود نمی‌رسید.
 *
 * چرا تستِ ایستا (خواندنِ سورس) و نه تستِ رفتاری:
 * ساختنِ ۲۰ درخواستِ واقعی از دو IP جعلی برای هر limiter، هم کند است و
 * هم شکننده. چیزی که واقعاً می‌خواهیم تضمین کنیم یک قاعدهٔ ساختاری است:
 * «هر limiter که روی مسیرِ auth-شده سوار می‌شود باید keyGenerator داشته
 * باشد». این را می‌شود مستقیم و قطعی از سورس خواند.
 */
const fs = require('fs');
const path = require('path');

let pass = 0; let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log('  ✓', name); } else { fail += 1; console.log('  ✗', name, detail ? `→ ${detail}` : ''); }
};

const SRC = path.join(__dirname, '..', 'src');
const serverSrc = fs.readFileSync(path.join(SRC, 'server.js'), 'utf8');

/** همهٔ فایل‌هایی که ممکن است limiter تعریف کنند. */
const files = [['server.js', serverSrc]];
const routesDir = path.join(SRC, 'routes');
if (fs.existsSync(routesDir)) {
  for (const f of fs.readdirSync(routesDir).filter(x => x.endsWith('.js'))) {
    files.push([`routes/${f}`, fs.readFileSync(path.join(routesDir, f), 'utf8')]);
  }
}

/**
 * بدنهٔ `rateLimit({...})` را با شمردنِ آکولاد بیرون می‌کشد.
 *
 * چرا با شمارش و نه regex: بدنه خودش آکولادِ تودرتو دارد
 * (`message: { message: '...' }`) و یک regexِ حریص یا تنبل هر دو
 * اشتباه می‌برند.
 */
function limiterBlocks(src) {
  const out = [];
  const re = /(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*rateLimit\(\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    let i = re.lastIndex; let depth = 1;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth += 1;
      else if (src[i] === '}') depth -= 1;
      i += 1;
    }
    out.push({ name: m[1], body: src.slice(re.lastIndex, i - 1) });
  }
  return out;
}

/**
 * آیا این limiter روی مسیری سوار شده که میان‌افزارِ `auth` دارد؟
 *
 * ⚠️ تلهٔ اول که خودِ این تست در آن افتاد:
 * مسیرِ `'/api/auth/request-otp'` رشتهٔ «auth» را **داخل خودش** دارد.
 * نسخهٔ اولِ این تابع کلِ متنِ فراخوانی را با /\bauth\b/ می‌سنجید و
 * نتیجه‌اش این بود که `otpLimiter` را «پشتِ auth» می‌دید و بابتِ نداشتنِ
 * keyGenerator شکایت می‌کرد — در حالی که آن مسیر عمداً و درست روی IP است.
 *
 * پس اول همهٔ رشته‌های داخل فراخوانی حذف می‌شوند و بعد دنبالِ میان‌افزار
 * می‌گردیم. یعنی فقط «auth» به‌عنوانِ **آرگومان** به حساب می‌آید، نه
 * «auth» به‌عنوانِ بخشی از آدرس.
 */
function mountedBehindAuth(name, allSrc) {
  const re = new RegExp(`\\.(?:get|post|patch|put|delete)\\([^)]*?\\b${name}\\b`, 'g');
  let m; let found = false;
  while ((m = re.exec(allSrc))) {
    const withoutStrings = m[0].replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''");
    if (/\bauth\b|\badminAuth\b/.test(withoutStrings)) found = true;
  }
  return found;
}

const allSrc = files.map(([, s]) => s).join('\n');

console.log('\n══ هر limiter روی مسیرِ احراز هویت‌شده باید با کاربر کلید بخورد ══');

let checked = 0;
for (const [fname, src] of files) {
  for (const { name, body } of limiterBlocks(src)) {
    const hasKeyGen = /keyGenerator\s*:/.test(body);
    const behindAuth = mountedBehindAuth(name, allSrc);
    if (!behindAuth) continue;
    checked += 1;
    ok(`${fname} · ${name} کلیدِ کاربر دارد`, hasKeyGen,
      'پشتِ auth است ولی keyGenerator ندارد → کلید روی IP می‌افتد و CGNAT کاربران بی‌گناه را قفل می‌کند');
    if (hasKeyGen) {
      const usesUser = /req\.user\?\.id|perUserKey|req\.user\.id/.test(body);
      ok(`${fname} · ${name} کلیدش از req.user می‌آید`, usesUser,
        'keyGenerator دارد ولی به شناسهٔ کاربر نگاه نمی‌کند');
    }
  }
}
ok('حداقل یک limiterِ احراز هویت‌شده پیدا شد', checked > 0,
  'الگوی تشخیص شکسته — تست دارد بی‌صدا هیچ چیزی را بررسی نمی‌کند');

console.log('\n══ limiterهای عمومی عمداً روی IP می‌مانند ══');
// این‌ها **باید** روی IP یا IP+شناسه باشند: کاربر هنوز وارد نشده.
for (const pub of ['otpLimiter', 'otpVerifyLimiter', 'adminLoginLimiter', 'userLoginLimiter']) {
  const blk = limiterBlocks(serverSrc).find(b => b.name === pub);
  ok(`${pub} تعریف شده`, !!blk);
  if (blk && /keyGenerator\s*:/.test(blk.body)) {
    ok(`${pub} هنوز IP را در کلید دارد`, /req\.ip/.test(blk.body),
      'مسیرِ عمومی بدون IP در کلید یعنی مهاجم با شمارهٔ جعلیِ متفاوت بی‌نهایت تلاش می‌کند');
  }
}

console.log('\n══ سقف‌های «شماره‌محور» (خواستهٔ مالک، ۲۶ شهریور) ══');
// مالک: «سقفِ سختِ ورود/درخواستِ کد پیامکی، با شمارش روی **شمارهٔ خودِ
// کاربر** نه آی‌پی — مثلاً ۵ کد در ۱۰ دقیقه.»
//
// چرا این بخش لازم است: اگر روزی کسی keyGeneratorِ این‌ها را به `req.ip`
// برگرداند، سقفِ مالک بی‌صدا از کار می‌افتد (کاربرانِ CGNAT را می‌بندد و
// هندلرِ اسپمِ پیامک را باز می‌کند) و هیچ تستی قرمز نمی‌شود. این گارد همان
// دو چیز را قفل می‌کند: کلید از شماره بیاید، و روی مسیرِ درست سوار باشد.
{
  const blocks = limiterBlocks(serverSrc);
  const byName = (n) => blocks.find(b => b.name === n);
  const authSrc = files.find(([n]) => n === 'routes/auth.js')?.[1] || '';

  // ⚠️ تله‌ای که خودِ همین گارد در آن افتاد: دو تا از این limiterها کلیدشان
  // را از یک تابعِ مشترک (`otpMobileKey`) می‌گیرند، نه با فراخوانیِ درون‌خطیِ
  // `normalizeMobile`. نسخهٔ اول فقط متنِ بدنهٔ limiter را می‌سنجید و دروغ
  // قرمز می‌شد. حالا اگر `keyGenerator` به یک شناسه اشاره کند، تعریفِ همان
  // شناسه هم داخلِ متنِ بررسی‌شده می‌آید.
  const keySourceOf = (body) => {
    const m = body.match(/keyGenerator\s*:\s*([A-Za-z_$][\w$]*)\s*[,}]/);
    if (!m) return body;
    const def = serverSrc.match(new RegExp(`const\\s+${m[1]}\\s*=[^;]+;`));
    return `${body}\n${def ? def[0] : ''}`;
  };

  for (const name of ['otpMobileLimiter', 'otpDailyLimiter', 'userAccountLimiter']) {
    const blk = byName(name);
    ok(`${name} تعریف شده`, !!blk);
    if (!blk) continue;
    const src = keySourceOf(blk.body);
    ok(`${name} کلیدش از شمارهٔ کاربر است`,
      /keyGenerator\s*:/.test(blk.body) && /normalizeMobile\(req\.body\?\.mobile\)/.test(src),
      'کلید باید از `normalizeMobile(req.body.mobile)` بیاید، نه آی‌پی');
    ok(`${name} به آی‌پی وابسته نیست`, !/req\.ip/.test(src),
      'سقفِ شماره‌محور نباید آی‌پی را در کلید داشته باشد؛ وگرنه کاربرانِ یک اپراتور هم‌دیگر را قفل می‌کنند');
  }

  const mobileLimiter = byName('otpMobileLimiter');
  if (mobileLimiter) {
    ok('otpMobileLimiter = ۵ کد در ۱۰ دقیقهٔ هر شماره',
      /windowMs:\s*10\s*\*\s*60_000/.test(mobileLimiter.body) && /limit:\s*5\b/.test(mobileLimiter.body),
      'عددِ خواستهٔ مالک (۵ در ۱۰ دقیقه) عوض شده');
  }
  const dailyLimiter = byName('otpDailyLimiter');
  if (dailyLimiter) {
    ok('otpDailyLimiter سقفِ شبانه‌روز دارد (بیمهٔ صورتحسابِ پیامک)',
      /windowMs:\s*24\s*\*\s*60\s*\*\s*60_000/.test(dailyLimiter.body));
  }
  // آی‌پی عمداً *شل‌تر* از شماره است: نقشش فقط جلوگیری از پیمایشِ انبوهِ
  // شماره‌هاست؛ اگر سفت‌تر از شماره باشد، همان مشکلِ CGNAT برمی‌گردد.
  const ipLimiter = byName('otpLimiter');
  if (ipLimiter) {
    const m = ipLimiter.body.match(/limit:\s*(\d+)/);
    ok('otpLimiter (آی‌پی) شل‌تر از سقفِ شماره است', !!m && Number(m[1]) >= 20,
      `مقدارِ فعلی: ${m ? m[1] : '؟'} — باید ≥ ۲۰ باشد تا کاربرانِ CGNAT قفل نشوند`);
  }

  ok('مسیرِ /auth/request-otp هر سه سقف را دارد',
    /\/auth\/request-otp'\s*,\s*otpLimiter\s*,\s*otpMobileLimiter\s*,\s*otpDailyLimiter/.test(authSrc),
    'اگر یکی جا بیفتد، یا اسپمِ پیامک باز می‌شود یا پیمایشِ شماره‌ها');
  ok('مسیرِ /auth/login سقفِ حساب هم دارد',
    /\/auth\/login'\s*,\s*userLoginLimiter\s*,\s*userAccountLimiter/.test(authSrc),
    'بدونِ آن، حدسِ رمز روی یک حساب از چند آی‌پی محدود نمی‌شود');
}

console.log('\n══ perUserKey فقط یک بار تعریف شده ══');
// دو `const` هم‌نام در یک ماژول یعنی SyntaxError و سرور اصلاً بالا نمی‌آید.
// این دقیقاً چیزی است که موقع رفعِ باگِ بالا نزدیک بود اتفاق بیفتد.
const perUserDefs = (serverSrc.match(/^const perUserKey\s*=/gm) || []).length;
ok('perUserKey دقیقاً یک تعریف دارد', perUserDefs === 1, `${perUserDefs} تعریف پیدا شد`);

console.log('\n══ هیچ Store مشترکی بین limiterها نیست (ERR_ERL_STORE_REUSE) ══');
// express-rate-limit نسخهٔ ۷ یک نمونهٔ Store را که بین چند limiter به
// اشتراک گذاشته شود با ERR_ERL_STORE_REUSE رد می‌کند و این خطا هنگامِ
// تعریفِ میدلور (زمانِ بارگذاری ماژول) پرتاب می‌شود — یعنی پروسه در
// طوفانِ ری‌استارتِ دیپلوی می‌افتاد. قاعدهٔ ساختاری که باید قفل بماند:
//   ۱) نباید یک ثابتِ Store مشترک (مثل sharedRateStore) ساخته شود؛
//   ۲) هر limiter باید از helperِ rlStore('<prefix>') با یک آرگومانِ
//      رشته‌ایِ صریح استفاده کند؛
//   ۳) پیشوندها یکتا باشند تا شمارندهٔ limiterها در Redis به هم نخورد.
ok('ثابتِ Store مشترک (sharedRateStore/redisRateLimitStore) حذف شده',
  !/sharedRateStore|redisRateLimitStore/.test(serverSrc),
  'یک Store مشترک دوباره تعریف شده → خطای ERR_ERL_STORE_REUSE در بوت');

const rlStoreCalls = [...serverSrc.matchAll(/rlStore\(\s*['"`]([^'"`]+)['"`]\s*\)/g)].map(m => m[1]);
// limiterهای عملیاتی (opsRateLimit) باید Storeِ **ثابت** را یک‌بار بیرون از
// build() بسازند و در reload دوباره نسازند — وگرنه ذخیرهٔ تنظیمات ادمین با
// ERR_ERL_STORE_REUSE می‌مرد (باگِ واقعیِ کشف‌شده در بازسازی زنده).
ok('opsRateLimit Store را یک‌بار و ثابت می‌سازد (نه داخل build/reload)',
  /const store = makeRateStore\(`ops:\$\{name\}`\);[\s\S]{0,240}?const build = \(\) => \{[\s\S]{0,500}?\.\.\.\(store \? \{ store \} : \{\}\)/.test(serverSrc),
  'Store باید بالاتر از build ساخته و داخل build همان نمونهٔ ثابت استفاده شود');
ok('داخل build هیچ فراخوانیِ rlStore/makeRateStore نیست (reload فروشگاه نسازد)',
  !/const build = \(\) => \{[\s\S]{0,700}?(rlStore|makeRateStore)\(/.test(serverSrc),
  'ساخت Store داخل build باعث خطای reload زنده می‌شود');
// بازسازیِ عمدیِ همان Store (prefix ثابت) نباید با اعتبارسنجیِ unsharedStore
// رد شود؛ وگرنه ذخیرهٔ تنظیمات پنل ۵۰۰ می‌داد. باید در ops آن قاعده خاموش باشد.
// این قاعده باید درون همین تابع opsRateLimit (نه جای دیگر) باشد.
const opsFnBlock = serverSrc.match(/function opsRateLimit[\s\S]*?\n\}/)?.[0] || '';
ok('opsRateLimit اعتبارسنجیِ unsharedStore را برای بازسازیِ عمدی خاموش می‌کند',
  /unsharedStore:\s*false/.test(opsFnBlock),
  'reload زنده با Store ثابت به validate.unsharedStore=false نیاز دارد');
ok('حداقل چند limiter با rlStore فروشگاه اختصاصی می‌گیرند', rlStoreCalls.length >= 6,
  `فقط ${rlStoreCalls.length} فراخوانی صریح rlStore پیدا شد`);

const dupes = rlStoreCalls.filter((p, i) => rlStoreCalls.indexOf(p) !== i);
ok('پیشوندهای صریحِ rlStore یکتا هستند', dupes.length === 0,
  `پیشوند تکراری: ${[...new Set(dupes)].join(', ')}`);

// خودِ helper باید از makeRateStore استفاده کند (نه یک نمونهٔ مشترک).
const storeSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'rateLimitStore.js'), 'utf8');
ok('rateLimitStore تابعِ makeRateStore(prefix) می‌دهد',
  /function makeRateStore\s*\(\s*prefix\s*\)/.test(storeSrc)
  && /prefix:\s*`rl:\$\{prefix\}:`/.test(storeSrc),
  'هر limiter باید RedisStore تازه با پیشوندِ جدا بگیرد');

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} تست موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
