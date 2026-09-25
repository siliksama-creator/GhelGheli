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
check('موتورِ تور روی هدف کلیک نمی‌کند (فقط نشان می‌دهد)',
  !/\.click\(\)/.test(engine));
check('لایهٔ تار و هاله در موتور هست',
  engine.includes('tourShade') && engine.includes('tourRing') && engine.includes('tourFinger'));
check('پرچم روی سرور ثبت می‌شود', engine.includes('/api/onboarding/seen'));

// ── ۷) کلمه‌های ممنوعهٔ مالک در متنِ صداها ──────────────────────────────
const texts = [...svc.matchAll(/^\s{4}text: '([^']*)',$/gm)].map(m => m[1]);
check('۱۸ متن خوانده شد', texts.length === 18, `یافت شد: ${texts.length}`);
const badWords = ['صفحه', ' است ', 'می‌شود'];
const offenders = texts.filter(t => badWords.some(w => t.includes(w)));
check('متن‌ها «صفحه»/«است»/رسمیِ بدتلفظ ندارند', offenders.length === 0,
  offenders.map(t => t.slice(0, 26)).join(' | '));

console.log(fail === 0
  ? '[onboarding] همهٔ بررسی‌ها ✓'
  : `[onboarding] ${fail} بررسی ناموفق`);
process.exit(fail === 0 ? 0 : 1);
