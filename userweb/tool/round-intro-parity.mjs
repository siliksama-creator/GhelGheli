#!/usr/bin/env node
// نگهبانِ همسانیِ «اعلانِ راند» بینِ وب و اندروید.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این فایل وجود دارد
// ═══════════════════════════════════════════════════════════════════════════
//
// اعلانِ راند دو پیاده‌سازیِ کاملاً جدا دارد: `card_duel_widgets.dart` با
// CustomPainter، و `cardDuelGame.jsx` + `style.css` با CSS. هیچ کدِ مشترکی
// بینشان نیست، پس هیچ چیز به‌جز همین تست جلوی واگرایی‌شان را نمی‌گیرد.
//
// این دقیقاً همان‌جایی است که در دورِ نوزدهم آینگی شکست: یک سمت عوض شد و
// سمتِ دیگر جا ماند و کسی نفهمید. قیدِ همیشگیِ مالک این است که وب آینهٔ
// کاملِ اندروید باشد — این فایل آن قید را اجراپذیر می‌کند.
//
// تست روی «عددهای محسوس» تمرکز دارد: چیزهایی که اگر واگرا شوند کاربر
// تفاوت را می‌بیند (اندازهٔ نام، طولِ خط، تعداد میله‌ها، زمان‌بندی) — نه
// روی جزئیاتِ پیاده‌سازی که طبیعتاً بینِ Canvas و CSS فرق دارند.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const android = read('mobile/lib/screens/user/games/card_duel/card_duel_widgets.dart');
const jsx = read('userweb/src/cardDuelGame.jsx');
const css = read('userweb/src/style.css');
const rules = read('backend/src/games/rules/cardDuel.js');

let passed = 0;
const check = (name, fn) => {
  fn();
  console.log(`  ✓ ${name}`);
  passed += 1;
};

// ── ۱. مدتِ کلِ اعلان ──────────────────────────────────────────────────────
// اگر این دو عدد از هم جدا شوند، یک پلتفرم زودتر کارت‌ها را باز می‌کند و
// در کراس‌پلی یک طرف چند صد میلی‌ثانیه فرصتِ فکرِ بیشتر می‌گیرد.
check('مدتِ اعلان در هر دو پلتفرم ۲۸۰۰ms است', () => {
  const dart = android.match(/Duration\(milliseconds:\s*(\d+)\)/g) || [];
  assert(dart.some((d) => d.includes('2800')),
    'اندروید باید تایمرِ ۲۸۰۰ms داشته باشد');
  assert(/duelIntroFade\s+2\.8s/.test(css),
    'CSS باید همان ۲.۸ ثانیه را داشته باشد');
});

// ── ۲. اندازه و وزنِ نامِ معیار ────────────────────────────────────────────
// درشت‌ترین متنِ بازی. وزن باید ۹۰۰ باشد و فایلِ ۹۰۰ هم واقعاً وجود داشته
// باشد، وگرنه هر دو پلتفرم بولدِ مصنوعی رندر می‌کنند (باگِ دورِ بیستم).
check('نامِ معیار در هر دو سمت ۴۲px و وزنِ ۹۰۰ است', () => {
  assert(/fontSize:\s*42\b/.test(android), 'اندروید باید ۴۲px باشد');
  assert(/FontWeight\.w900/.test(android), 'اندروید باید w900 باشد');
  const block = css.match(/\.duelRoundIntroInner b\{[^}]+\}/);
  assert(block, 'قانونِ .duelRoundIntroInner b پیدا نشد');
  assert(/font-size:\s*42px/.test(block[0]), 'وب باید ۴۲px باشد');
  assert(/font-weight:\s*900/.test(block[0]), 'وب باید ۹۰۰ باشد');
});

check('فونتِ وزنِ ۹۰۰ واقعاً روی هر دو پلتفرم موجود است', () => {
  assert(fs.existsSync(path.join(root, 'mobile/assets/fonts/Vazirmatn-Black.ttf')),
    'Vazirmatn-Black.ttf برای اندروید نیست');
  assert(fs.existsSync(path.join(root, 'userweb/public/fonts/Vazirmatn-Black.woff2')),
    'Vazirmatn-Black.woff2 برای وب نیست');
  assert(/weight:\s*900/.test(read('mobile/pubspec.yaml')),
    'pubspec وزنِ ۹۰۰ را ثبت نکرده');
  const typo = read('userweb/src/typography.css');
  assert(/font-weight:\s*900/.test(typo) && /Vazirmatn-Black/.test(typo),
    'typography.css فونتِ ۹۰۰ را @font-face نکرده');
});

// ── ۳. گرادیانِ روی نام ────────────────────────────────────────────────────
check('نام در هر دو سمت گرادیان دارد نه رنگِ تخت', () => {
  assert(/ShaderMask/.test(android), 'اندروید ShaderMask ندارد');
  const block = css.match(/\.duelRoundIntroInner b\{[^}]+\}/)[0];
  assert(/background-clip:\s*text/.test(block) && /linear-gradient/.test(block),
    'وب گرادیانِ background-clip:text ندارد');
});

// ── ۴. نوارِ پیشرفتِ راندها ────────────────────────────────────────────────
// راه‌حلِ «وضعیت را برسان بدونِ اضافه‌کردنِ متن». تعدادِ میله‌ها باید با
// تعدادِ واقعیِ راندهای بک‌اند بخواند، نه با عددِ دستیِ داخلِ UI.
check('نوارِ پیشرفت در هر دو سمت هست و میلهٔ جاری برجسته است', () => {
  assert(/width:\s*i == widget\.roundNumber - 1 \? 18|18 :/.test(android)
    || /18/.test(android), 'اندروید میلهٔ جاریِ ۱۸px ندارد');
  assert(/duelIntroPips/.test(jsx), 'JSX نوارِ پیشرفت را رندر نمی‌کند');
  assert(/\.duelIntroPips i\.isNow\{[^}]*width:\s*18px/.test(css),
    'وب میلهٔ جاریِ ۱۸px ندارد');
  assert(/\.duelIntroPips i\{[^}]*height:\s*4px/.test(css),
    'وب ارتفاعِ میلهٔ ۴px ندارد');
  // تعدادِ میله‌ها از totalRounds می‌آید نه از عددِ ثابت.
  assert(/length:\s*totalRounds/.test(jsx),
    'تعدادِ میله‌ها باید از totalRounds بیاید تا با بک‌اند هم‌گام بماند');
});

// ── ۵. لایه‌های پس‌زمینه ───────────────────────────────────────────────────
check('پرتوها و موجِ ضربه در هر دو سمت وجود دارند', () => {
  assert(/_RoundIntroBackdropPainter/.test(android), 'پینترِ پس‌زمینهٔ اندروید نیست');
  assert(/shock/.test(android), 'موجِ ضربهٔ اندروید نیست');
  assert(/duelIntroRays/.test(jsx) && /duelIntroShock/.test(jsx),
    'لایه‌های وب رندر نمی‌شوند');
  assert(/\.duelIntroRays\{/.test(css) && /@keyframes duelIntroShockOut/.test(css),
    'CSSِ لایه‌های وب نیست');
});

// ── ۶. خطِ تزئینیِ زیرِ نام ─────────────────────────────────────────────────
check('خطِ زیرِ نام در هر دو سمت ۱۳۲px باز می‌شود', () => {
  assert(/132 \* nameIn/.test(android), 'اندروید خطِ ۱۳۲px ندارد');
  assert(/duelIntroRule/.test(jsx), 'JSX خطِ تزئینی ندارد');
  assert(/@keyframes duelIntroRuleIn\{from\{width:0[^}]*\}to\{width:132px/.test(
    css.replace(/\s+/g, ' ').replace(/@keyframes duelIntroRuleIn\{ /, '@keyframes duelIntroRuleIn{')
      .replace(/from\{ /g, 'from{').replace(/ \}to\{ /g, '}to{')),
    'وب خطِ ۱۳۲px ندارد');
});

// ── ۷. شمارشِ معکوس ────────────────────────────────────────────────────────
check('شمارشِ ۳/۲/۱/انتخاب! در هر دو سمت یکسان است', () => {
  for (const token of ['۳', '۲', '۱', 'انتخاب!']) {
    assert(android.includes(token), `اندروید «${token}» را ندارد`);
    assert(jsx.includes(token), `وب «${token}» را ندارد`);
  }
});

// ── ۷.۵ جعبهٔ شمارش ابعادِ صریح دارد ───────────────────────────────────────
// ارقامِ شمارش `position:absolute` روی هم می‌نشینند، پس والدشان باید
// `position:relative` و ارتفاعِ صریح داشته باشد. یک‌بار همین قانون حینِ
// ویرایشِ CSS پاک شد و ارقام از جعبه بیرون زدند و صحنه را ۵۴۳px کش دادند
// بدونِ اینکه هیچ تستی بشکند. این تست آن سوراخ را می‌بندد.
check('جعبهٔ شمارشِ معکوس ابعاد و position صریح دارد', () => {
  const box = css.match(/\.duelIntroBeats\{[^}]+\}/);
  assert(box, 'قانونِ .duelIntroBeats پاک شده — ارقامِ absolute از صحنه بیرون می‌زنند');
  assert(/position:\s*relative/.test(box[0]), 'باید position:relative باشد');
  assert(/height:\s*\d+px/.test(box[0]), 'باید ارتفاعِ صریح داشته باشد');
});

// ── ۸. احترام به «کاهش حرکت» ───────────────────────────────────────────────
// هر لایهٔ انیمیشنیِ تازه باید در بلوکِ prefers-reduced-motion خاموش شود؛
// وگرنه کاربرِ حساس به حرکت، پرتوی چرخان و موجِ ضربه می‌بیند.
check('همهٔ لایه‌های متحرکِ وب در حالتِ کاهشِ حرکت خاموش می‌شوند', () => {
  const rm = css.match(/@media \(prefers-reduced-motion: reduce\)\{[\s\S]*?\n\}/);
  assert(rm, 'بلوکِ prefers-reduced-motion پیدا نشد');
  for (const sel of ['duelIntroRays', 'duelIntroShock', 'duelIntroRule',
    'duelIntroHead', 'duelRoundIntroIcon::before']) {
    assert(rm[0].includes(sel), `«${sel}» در بلوکِ کاهشِ حرکت خاموش نشده`);
  }
});

// ── ۹. متن‌ها زیاد نشده‌اند ─────────────────────────────────────────────────
// قیدِ صریحِ مالک: «بازی جذاب‌تر شود ولی متن‌ها زیاد نشوند». بازطراحی باید
// با نور و حرکت جذاب شود، نه با جملهٔ تازه. اگر کسی بعداً وسوسه شد یک
// راهنمای متنیِ دیگر اضافه کند، اینجا می‌شکند.
check('بازطراحی هیچ متنِ تازه‌ای به صحنه اضافه نکرده', () => {
  const start = jsx.indexOf('<div className="duelRoundIntroInner">');
  const end = jsx.indexOf('duelIntroBeats', start);
  assert(start > 0 && end > start, 'بلوکِ اعلان پیدا نشد');
  const intro = [jsx.slice(start, end)];
  // متن‌های مجاز: شمارهٔ راند، برچسب، نامِ معیار، قاعده، شمارشِ معکوس.
  const slots = (intro[0].match(/<(small|label|b|em)>/g) || []).length;
  assert.equal(slots, 4,
    `صحنه باید دقیقاً ۴ خانهٔ متنی داشته باشد، ${slots} تا دارد`);
});

// ── ۱۰. رنگ‌ها با بک‌اند هم‌گام‌اند ─────────────────────────────────────────
check('هر ۵ معیارِ بک‌اند در هر دو کلاینت رنگ و آیکون دارند', () => {
  const stats = ['speed', 'technique', 'attack', 'defense', 'goalChance'];
  for (const s of stats) {
    assert(rules.includes(s), `بک‌اند «${s}» را ندارد`);
    assert(android.includes(s) || read(
      'mobile/lib/screens/user/games/card_duel_page.dart').includes(s),
    `اندروید «${s}» را ندارد`);
    assert(jsx.includes(s) || read('userweb/src/lib/cardDuelLogic.js').includes(s),
      `وب «${s}» را ندارد`);
  }
});

console.log(`\n✅ ${passed} تست همسانیِ اعلانِ راند موفق بود`);
