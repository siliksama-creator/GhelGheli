#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════
// گاردِ آموزشِ صوتیِ قلقلی (۴ مهر ۱۴۰۵)
//
// چرا این تست وجود دارد: تور از سه تکه ساخته شده که هر کدام جای دیگری است —
// متن و ترتیب روی **سرور**، لنگرها در **وب**، و فایل‌های صدا در **public**.
// جدا‌شدن این سه با چشم دیده نمی‌شود (تور فقط یک بخش را نشان نمی‌دهد یا
// صدایش پخش نمی‌شود) و تا بازخوردِ کاربر معلوم نمی‌شود. این گارد همان
// جدایی را بی‌سدا نمی‌گذارد:
//
//   ۱. هر `id` سرور ⟷ لنگرِ وب (دو طرفه)
//   ۲. هر لنگر واقعاً در کد `data-tour="…"` دارد
//   ۳. هر فایلِ صدا روی دیسک هست و خالی نیست
//   ۴. مسیرها و مایگریشن سیم‌کشی شده‌اند
//   ۵. تور **کلیک نمی‌کند** (تصمیمِ آگاهانه: انگشت نمایشی است)
//   ۶. متن‌ها دو کلمهٔ ممنوعهٔ مالک را ندارند: «صفحه» و « است »
// ══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');           // /var/www/GhelGheli
const WEB = path.join(ROOT, 'userweb', 'src');
const SVC = path.join(__dirname, '..', 'src', 'services', 'onboardingService.js');
const AUDIO = path.join(__dirname, '..', 'public', 'onboarding');

let fail = 0;
const check = (label, ok, hint) => {
  if (ok) { console.log(`  ✓ ${label}`); return; }
  fail += 1;
  console.log(`  ✗ ${label}${hint ? ` — ${hint}` : ''}`);
};
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

console.log('[onboarding] گاردِ آموزشِ صوتی');

// ── ۱) متن‌های سرور ──────────────────────────────────────────────────────
const svc = read(SVC);
check('سرویسِ آموزش صوتی وجود دارد', svc.length > 1500);
const svcIds = [...svc.matchAll(/^\s{4}id: '([a-z][a-z0-9_-]*)',$/gm)].map(m => m[1]);
const svcAudios = [...svc.matchAll(/^\s{4}audio: '([^']+)',$/gm)].map(m => m[1]);
check('۱۸ بخش تعریف شده', svcIds.length === 18, `یافت شد: ${svcIds.length}`);
check('هر بخش فایلِ صدا دارد', svcAudios.length === svcIds.length);
check('شناسه‌ها یکتا هستند', new Set(svcIds).size === svcIds.length);

// ── ۲) لنگرهای کلاینت (دو طرفه) ──────────────────────────────────────────
const steps = read(path.join(WEB, 'tour', 'steps.js'));
check('نگاشتِ لنگرها وجود دارد', steps.includes('TOUR_UI'));
const webIds = [...steps.matchAll(/^\s{2}([a-z][a-z0-9_-]*):\s*\{\s*nav:/gm)].map(m => m[1]);
check('تعداد لنگرها با سرور یکی است', webIds.length === svcIds.length,
  `سرور: ${svcIds.length} · وب: ${webIds.length}`);
const missingInWeb = svcIds.filter(id => !webIds.includes(id));
const missingOnSrv = webIds.filter(id => !svcIds.includes(id));
check('هر بخشِ سرور لنگرِ وب دارد', missingInWeb.length === 0, missingInWeb.join(', '));
check('هر لنگرِ وب بخشِ سرور دارد', missingOnSrv.length === 0, missingOnSrv.join(', '));

// ── ۳) هر لنگر واقعاً در کد هست ─────────────────────────────────────────
const anchors = [...steps.matchAll(/'([a-z]+:[a-zA-Z:_-]+)'/g)].map(m => m[1]);
const webFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(jsx?|js)$/.test(e.name)) webFiles.push(p);
  }
}(WEB));
const corpus = webFiles.map(read).join('\n');
// دو خانوادهٔ لنگر «پویا»اند و با رشتهٔ ثابت در کد نمی‌آیند، چون از خودِ
// داده ساخته می‌شوند: تب‌های نوار پایین (`nav:${id}`) و تب‌های لیگ
// (`league:tab:${id}`). برای این دو، خودِ الگوی رشتهٔ قالبی گواه است —
// هر تبِ تازه‌ای که به فهرست اضافه شود، لنگرش هم خودکار ساخته می‌شود.
const DYNAMIC = {
  'nav:': 'data-tour={`nav:${id}`}',
  'league:tab:': 'data-tour={`league:tab:${id}`}',
  'more:': 'data-tour={`more:${id}`}',
};
const missingAnchors = [...new Set(anchors)].filter(a => {
  if (corpus.includes(`data-tour="${a}"`)) return false;
  for (const [prefix, snippet] of Object.entries(DYNAMIC)) {
    if (a.startsWith(prefix) && corpus.includes(snippet)) return false;
  }
  return true;
});
check('همهٔ لنگرها در کد `data-tour` دارند', missingAnchors.length === 0,
  missingAnchors.join(', '));

// ── ۴) فایل‌های صدا ─────────────────────────────────────────────────────
const missingAudio = svcAudios.filter(f => {
  try { return fs.statSync(path.join(AUDIO, f)).size < 8000; } catch { return true; }
});
check('۱۸ فایلِ صدا روی دیسک و سالم‌اند', missingAudio.length === 0,
  missingAudio.join(', '));

// ── ۵) سیم‌کشی ──────────────────────────────────────────────────────────
const server = read(path.join(__dirname, '..', 'src', 'server.js'));
check('روتِ آموزش در server.js mount شده', server.includes("routes/onboarding")
  && server.includes('onboarding: require'));
const route = read(path.join(__dirname, '..', 'src', 'routes', 'onboarding.js'));
check('سه مسیرِ وضعیت/دیده‌شد/دوباره‌ببین هست',
  route.includes("'/onboarding'") && route.includes("'/onboarding/seen'")
  && route.includes("'/onboarding/reset'"));
check('پرچمِ «دیده شد» جدول دارد',
  fs.existsSync(path.join(__dirname, '..', 'migrations', '103_onboarding_tour.sql')));
const main = read(path.join(WEB, 'main.jsx'));
check('موتورِ تور در ریشهٔ اپ mount شده', main.includes('<Tour '));
check('دکمهٔ «دوباره ببین» در پروفایل هست',
  read(path.join(WEB, 'screens', 'Profile.jsx')).includes('gg:tour-replay'));
check('پلِ زیرتبِ «چت و بازی» هست', main.includes('gg:tour-sub'));
check('پلِ زیرتبِ صندوقِ سکه هست',
  read(path.join(WEB, 'screens', 'League.jsx')).includes('gg:tour-sub'));

// ── ۶) تصمیمِ ایمنی: تور کلیک نمی‌کند ────────────────────────────────────
const engine = read(path.join(WEB, 'tour', 'Tour.jsx'));
const tourCss = read(path.join(WEB, 'tour', 'tour.css'));
check('موتورِ تور روی هدف کلیک نمی‌کند (فقط نشان می‌دهد)',
  !/\.click\(\)/.test(engine));
check('لایهٔ تار و هاله در موتور هست',
  engine.includes('tourShade') && engine.includes('tourRing') && engine.includes('tourFinger'));
check('پرچم روی سرور ثبت می‌شود', engine.includes('/api/onboarding/seen'));
// تورِ خودکار نباید وسطِ بازیِ زنده بیفتد: کسی که با لینکِ اتاقِ مشترک
// وارد می‌شود تبش «چت و بازی» است و تور نباید او را به خانه بکشد.
// مسیرِ صدا باید زیرِ `/api/` باشد: nginx روی vhostِ وب فقط `/api/` و
// چند مسیرِ دیگر را پروکسی می‌کند و `/public/...` به ریشهٔ استاتیکِ وب
// می‌خورد و ۴۰۴ می‌دهد — همان باگی که یک بار صدا را در وب خفه کرد.
check('صدا از مسیرِ پروکسی‌شدهٔ /api سرو می‌شود',
  svc.includes("AUDIO_URL_BASE = '/api/onboarding/audio'")
  && route.includes("router.get('/onboarding/audio/:file'")
  && svc.includes('AUDIO_FILES'));
// ── مسیرِ ورود (خواستهٔ مالک، ۵ مهر) ─────────────────────────────────────
// «انگشت باید دقیقاً نشون بده چطور وارد اون قسمت شده.» سه شرط دارد:
//   الف) نگاشتِ `enter` در وب تعریف شده باشد
//   ب) شیتِ «بیشتر» لنگر و پل داشته باشد (وگرنه چهار بخش بی‌مسیر می‌شوند)
//   ج) موتور واقعاً مرحلهٔ «در» و «سفر» را اجرا کند
check('نگاشتِ «درِ ورودی» در وب تعریف شده',
  steps.includes('enter:') && steps.includes('more:invite'));
check('دکمهٔ «بیشتر» و آیتم‌های شیت لنگر دارند',
  main.includes('data-tour="nav:more"') && main.includes('data-tour={`more:${id}`}'));
check('پلِ شیتِ «بیشتر» در main.jsx هست',
  main.includes("'gg:tour-more'") && main.includes("'gg:tour-goto'"));
check('موتور مرحلهٔ «در→سفر→هدف» را اجرا می‌کند',
  engine.includes("setStage('door')") && engine.includes('tourFinger--travel')
  && engine.includes('DOOR_MS'));
// ── جای کارت (خواستهٔ مالک، ۵ مهر) ──────────────────────────────────────
// «کارت نباید روی بخشِ درحالِ‌توضیح بیفتد» → جای کارت باید حساب شود.
check('کارتِ متن قرینهِ هدف می‌نشیند',
  engine.includes('roomBelow') && engine.includes('roomAbove') && engine.includes('maxHeight: pos.maxH'));

// ── قابِ اپ (خواستهٔ مالک، ۵ مهر: «از سایز وب‌اپ و از کادر خارج می‌شه») ──
// اپ روی دسکتاپ یک ستونِ وسط‌چین است؛ تورِ `inset:0` روی کلِ پنجره از قاب
// بیرون می‌زد. حالا قاب از `main.tabPane` خوانده و با `visualViewport` بریده
// می‌شود و هر کادر به آن **دوخته** می‌شود. این چهار بررسی همان قرارداد است.
check('قابِ تور از ستونِ اپ خوانده می‌شود',
  engine.includes('main.tabPane') && engine.includes('visualViewport')
  && engine.includes('function readFrame'));
check('هر کادر به قاب دوخته می‌شود',
  engine.includes('function clampBox') && engine.includes('clampPoint')
  && engine.includes('function rectInFrame'));
// سرریزِ گذرا: انیمیشنِ انگشت بین دو فریم بالا می‌پرد و روی موبایلِ کوچک از
// قاب بیرون می‌زد (یک نمونه‌برداریِ تک آن را رد کرده بود). حالا اندازهٔ
// بلندشدن از فضای همان نقطه حساب می‌شود.
check('بلندشدنِ انگشت به قاب دوخته می‌شود',
  engine.includes('function safeLift') && tourCss.includes('var(--lift')
  && tourCss.includes('var(--endLift'));
check('تور به body پورتال می‌شود',
  engine.includes("createPortal") && engine.includes('document.body'));
check('لایه‌های تور داخلِ قاب‌اند (نه چسبیده به نما)',
  !/position:\s*fixed[^}]*inset:\s*0/.test(tourCss)
  && /\.tourRoot\s*\{[^}]*position:\s*fixed/.test(tourCss)
  && /\.tourRoot\s*\{[^}]*overflow:\s*hidden/.test(tourCss)
  && /\.tourCard\s*\{[^}]*position:\s*absolute/.test(tourCss)
  && /\.tourShade\s*\{[^}]*position:\s*absolute/.test(tourCss));
check('تورِ خودکار فقط از خانه شروع می‌شود',
  engine.includes("tabRef.current !== 'home'") && engine.includes('blockedRef')
  && engine.includes('bootKey'));

// ── ۷) کلمه‌های ممنوعهٔ مالک در متنِ صداها ──────────────────────────────
const texts = [...svc.matchAll(/^\s{4}text: '([^']*)',$/gm)].map(m => m[1]);
check('۱۸ متن خوانده شد', texts.length === 18, `یافت شد: ${texts.length}`);
const badWords = ['صفحه', ' است ', 'می‌شود'];
const offenders = texts.filter(t => badWords.some(w => t.includes(w)));
check('متن‌ها «صفحه»/«است»/رسمیِ بدتلفظ ندارند', offenders.length === 0,
  offenders.map(t => t.slice(0, 26)).join(' | '));


// ── ۸) پورتِ اندروید (فلاتر) ─────────────────────────────────────────────
//
// تورِ وب سه تکه دارد؛ با آمدنِ اندروید تکهٔ «لنگر» دو نسخه شد. این بخش
// همان کاری را می‌کند که بخش‌های ۱–۶ برای وب می‌کردند: هر id سرور باید در
// نقشهٔ فلاتر باشد، هر مقصد باید در نگاشتِ تبِ پوسته باشد، و مسیرِ صدا باید
// همان `/api/onboarding/audio` باشد (باگِ خفه‌کنندهٔ صدا در وب از `/public`
// می‌آمد — این خط همان را برای اپ قفل می‌کند).
const MOB = path.join(ROOT, 'mobile', 'lib');
const OV = read(path.join(MOB, 'tour', 'tour_overlay.dart'));
const SVC2 = read(path.join(MOB, 'tour', 'tour_service.dart'));
const ANC = read(path.join(MOB, 'tour', 'tour_anchors.dart'));
const SHELL = read(path.join(MOB, 'screens', 'user', 'home_shell.dart'));
const PROF = read(path.join(MOB, 'screens', 'user', 'profile_page.dart'));
const SOC = read(path.join(MOB, 'screens', 'user', 'social_page.dart'));

check('سه فایلِ تورِ اندروید موجود و پرِ محتواست',
  OV.length > 8000 && SVC2.length > 2000 && ANC.length > 800,
  `overlay=${OV.length} service=${SVC2.length} anchors=${ANC.length}`);

check('اندروید هم وضعیت را از همان روتِ سرور می‌خواند و «دیده شد» را همان‌جا ثبت می‌کند',
  SVC2.includes("'/api/onboarding'") && SVC2.includes("'/api/onboarding/seen'")
  && SVC2.includes('version') && SVC2.includes('skipped'));

check('صدای اندروید از پایهٔ api ساخته می‌شود، نه از مسیرِ /public',
  OV.includes('ApiClient.defaultBaseUrl') && !OV.includes("'/public/"));

// هر ۱۸ id سرور باید کلیدِ نقشهٔ فلاتر باشد و برعکس — وگرنه سرور بخشی را
// می‌فرستد که اپ نمی‌داند کجا نشان دهد (و برعکسش کدِ مرده است).
const dartIds = [...OV.matchAll(/^\s{4}'([a-z][a-z0-9_-]*)': TourPlan\(/gm)].map(m => m[1]);
check('۱۸ بخشِ سرور در نقشهٔ فلاتر هست', svcIds.every(id => dartIds.includes(id)),
  `سرور: ${svcIds.length} / فلاتر: ${dartIds.length} — گمشده: ${svcIds.filter(i => !dartIds.includes(i)).join(',')}`);
check('نقشهٔ فلاتر id اضافه‌ای ندارد', dartIds.every(id => svcIds.includes(id)),
  `اضافه: ${dartIds.filter(i => !svcIds.includes(i)).join(',')}`);

// مقصدهای ناوبری: هر نامی که نقشه به آن اشاره می‌کند باید در نگاشتِ تبِ
// پوسته ترجمه شده باشد، وگرنه تور پخش می‌شود ولی از جای اشتباه.
const navNames = [...OV.matchAll(/TourPlan\('([a-z]+)'/g)].map(m => m[1]);
const navSet = [...new Set(navNames)];
const missingNav = navSet.filter(n => !SHELL.includes(`case '${n}':`));
check('همهٔ مقصدهای تور در پوسته تب دارند', missingNav.length === 0,
  `بی‌تب: ${missingNav.join(',')}`);
check('لایهٔ تور در پوسته سوار شده و به نگاشت وصل است',
  SHELL.includes('TourOverlay(') && SHELL.includes('indexFor: _tourIndexFor')
  && SHELL.includes('onSubTab: TourBus.instance.setSocialTab'));
check('زیرتب‌ها از بیرون قابلِ عوض‌کردن‌اند (پلِ ماموریت/گذر نبرد)',
  SOC.includes('socialTab.addListener') && SOC.includes('tour_service.dart'));
check('«دوباره ببین» در پروفایل هست', PROF.includes('requestReplay')
  && PROF.includes("id: 'profile:top'"));
check('شیتِ «بیشتر» لنگرِ ردیف دارد (انگشت روی همان ردیف می‌نشیند)',
  SHELL.includes("id: 'more:${widget.tourNameOf(page)}'"));
check('تور کلیک نمی‌کند (حلقه و انگشت لمس را نمی‌گیرند)',
  OV.includes('IgnorePointer') && !OV.includes('child.onTap'));
check('تورِ خودکارِ اندروید هم فقط از خانه شروع می‌شود',
  OV.includes('_pendingAuto') && OV.includes('widget.currentIndex != 0'));

// هندسهٔ «در» باید پیش از نخستین await حساب شود، وگرنه لینتِ
// use_build_context_synchronously قرمز می‌شود و ممکن است روی قابِ
// عوض‌شده حساب کند.
const iSlot = OV.indexOf('_slotRect(slot)');
const iAwait = OV.indexOf('await _player?.stop()');
check('هندسهٔ در پیش از نخستین await حساب می‌شود',
  iSlot > 0 && iAwait > 0 && iSlot < iAwait);

// ترازِ پرانتز: فلاتر روی هاست نیست، پس سینتکسِ شکسته باید همین‌جا بگیرد.
// (یک بار همین کلاسِ خطا در `profile_page.dart` رخ داد: یک `(` کم بود.)
const strip = (src) => {
  let out = '';
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { const j = src.indexOf('\n', i); i = j < 0 ? src.length : j; continue; }
    if (c === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? src.length : j + 1; continue; }
    if (c === '"' || c === "'") {
      const raw = src[i - 1] === 'r';
      i += 1;
      while (i < src.length) {
        if (!raw && src[i] === '\\') { i += 2; continue; }
        if (src[i] === c) break;
        i += 1;
      }
      continue;
    }
    out += c;
  }
  return out;
};
const files = ['tour/tour_overlay.dart', 'tour/tour_service.dart', 'tour/tour_anchors.dart',
  'screens/user/home_shell.dart', 'screens/user/social_page.dart', 'screens/user/profile_page.dart'];
const unbalanced = files.filter((f) => {
  const s = strip(read(path.join(MOB, f)));
  if (!s) return true;
  return (s.split('(').length !== s.split(')').length)
    || (s.split('{').length !== s.split('}').length)
    || (s.split('[').length !== s.split(']').length);
});
check('ترازِ پرانتزِ شش فایلِ دست‌خوردهٔ اندروید', unbalanced.length === 0,
  unbalanced.join(', '));

console.log(fail === 0
  ? '[onboarding] همهٔ بررسی‌ها ✓'
  : `[onboarding] ${fail} بررسی ناموفق`);
process.exit(fail === 0 ? 0 : 1);
