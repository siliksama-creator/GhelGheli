#!/usr/bin/env node
// Static guardrails for the strict 5-tier polish/performance loop.
// These are intentionally source-level: they catch the exact regressions that
// make the app feel slower even when functionality still works.
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}`); } };
const root = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const tapEngine = read('mobile/lib/screens/user/games/tap/tap_engine.dart');
const tapScreen = read('mobile/lib/screens/user/games/tap/tap_screen.dart');
const tapChar = read('mobile/lib/screens/user/games/tap/tap_character.dart');
const webTap = read('userweb/src/tapGame.jsx');
const home = read('userweb/src/screens/Home.jsx');
const css = read('userweb/src/style.css');
const homeShell = read('mobile/lib/screens/user/home_shell.dart');
const scrollHint = read('mobile/lib/widgets/scroll_hint.dart');

console.log('\n== ۱. ضربه‌زن اندروید: مسیر داغ کم‌هزینه ==');
ok(/ValueNotifier<int> _uiTick/.test(tapScreen), 'صفحه با ValueNotifier تیک می‌خورد، نه setState سراسری');
ok(/_rejectedUiNotifyGapMs = 250/.test(tapEngine), 'ضربه‌های ردشده repaint نامحدود نمی‌سازند');
ok(!/GameAudio\.instance|Sfx\./.test(tapScreen)
  && /_tapHapticMinGap = Duration\(milliseconds: 125\)/.test(tapScreen),
  'صدای Tap کاملاً حذف و هپتیک ضربه محدود شده است');
ok(/CustomPainter[\s\S]*_FloaterPainter/.test(tapChar), 'شناورهای +۱ با Painter واحد هستند، نه ویجت/تیکر جدا');
ok(/cacheWidth: 320/.test(tapChar), 'تصویر کاراکتر با decode کوچک‌تر رندر می‌شود');

console.log('\n== ۲. ضربه‌زن وب: پاریتی و کاهش رندر ==');
ok(/levelsPerSkin:\s*5/.test(webTap), 'وب با اندروید: هر ۵ لول یک اسکین');
ok(/skin_10\.webp/.test(webTap), 'وب همهٔ ۱۰ اسکین را می‌شناسد');
ok(/lastRejectedUi/.test(webTap) && />= 250/.test(webTap), 'وب هم ضربهٔ ردشده را throttle می‌کند');
ok(!/playSfx|gameAudio/.test(webTap) && /areaRef\.current\?\.animate/.test(webTap),
  'وب Tap بدون صدا و بدون setState انیمیشن ضربه را اجرا می‌کند');

console.log('\n== ۳. وب یوزر و پوستهٔ اندروید: رندر سبک‌تر و کلاس کاری ==');
ok(/loading="lazy" decoding="async"/.test(home), 'تصاویر کارت‌های کلکسیون lazy + async هستند');
ok(/decoding="async"/.test(home), 'آواتار/تصاویر خانه async decode دارند');
ok(/button:not\(:disabled\):active/.test(css), 'دکمه‌های وب feedback حرکتی دارند');
ok(/quickTile::after/.test(css), 'کاشی‌های اصلی وب شاین/پولیش دارند');
ok(/حذفِ دکمهٔ تکراری/.test(homeShell), 'دکمهٔ خروج تکراری از اپ‌بار کاربر حذف شده تا عنوان‌ها بریده نشوند');
ok(/right:\s*18/.test(scrollHint) && /maxWidth:\s*148/.test(scrollHint), 'قرص راهنمای اسکرول از مرکز محتوا به گوشهٔ کم‌مزاحمت منتقل شده');

console.log('\n== ۴. دوئل کارت: مستقل از لیگ اصلی ==');
const duel = read('backend/src/services/cardDuelService.js');
ok(/mode='auto_ghost'/.test(duel), 'نبرد خودکار Ghost ثبت می‌شود');
ok(/league:\s*false/.test(duel), 'انتقال امتیاز دوئل، لیگ اصلی را تکان نمی‌دهد');
ok(/botBattle/.test(duel) && /VALUES\('bot'/.test(duel), 'بات تمرینی بدون امتیاز است');

console.log('\n== ۵. دارایی‌ها و حجم ==');
for (let i = 1; i <= 10; i++) {
  ok(fs.existsSync(path.join(root, `userweb/public/games/tap/skin_${i}.webp`)), `اسکین وب ${i} موجود است`);
}
const totalTapWeb = fs.readdirSync(path.join(root, 'userweb/public/games/tap'))
  .filter(f => f.endsWith('.webp'))
  .reduce((sum, f) => sum + fs.statSync(path.join(root, 'userweb/public/games/tap', f)).size, 0);
ok(totalTapWeb < 900_000, `اسکین‌های وب فشرده‌اند (${Math.round(totalTapWeb / 1024)}KB)`);

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} تست موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
