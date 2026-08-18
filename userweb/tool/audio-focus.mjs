#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// گاردِ «تمرکزِ صوتی» — دورِ ۳۱
// ═══════════════════════════════════════════════════════════════════════════
//
// ── باگی که این گارد جلویش را می‌گیرد ──
//
// کاربر گزارش داد «وسطِ بازیِ کارت صدا قطع می‌شود». ریشه‌اش یک پیش‌فرضِ
// کتابخانه بود، نه کدِ ما — و دقیقاً به همین دلیل هیچ تستی نمی‌گرفتش.
//
// `audioplayers` روی اندروید پیش‌فرضِ `AndroidAudioFocus.gain` دارد، یعنی
// «من تنها منبعِ صدای دستگاهم». ما اما همزمان دو چیز پخش می‌کنیم: موزیکِ
// لوپِ دوئل و افکت‌های کوتاه. زنجیره (از سورسِ `audioplayers_android`):
//
//   play() → maybeRequestAudioFocus() → requestAudioFocus(GAIN)
//          → دارندهٔ قبلی (موزیکِ خودمان) LOSS می‌گیرد → پکیج pause‌اش می‌کند
//   onCompletion() → releaseMode != LOOP ⇒ stop()
//          → focusManager.handleStop() → abandonAudioFocusRequest()
//
// یعنی هر افکت تمرکز را از موزیک می‌قاپید و هنگام تمام‌شدن رهایش می‌کرد.
//
// ── چرا گاردِ ایستا لازم است ──
//
// `mobile/test/game_audio_focus_test.dart` قرارداد را می‌سنجد (که
// mixWithOthers ⇒ none)، ولی نمی‌تواند بفهمد کسی در `game_audio.dart`
// آن را به `gain` برگردانده یا `setAudioContext` را حذف کرده. این گارد
// دقیقاً همان را می‌پاید.
//
// اجرا: `node tool/audio-focus.mjs` از ریشهٔ `userweb`.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd(), '..');
const FILE = 'mobile/lib/screens/user/games/game_audio.dart';

let src;
try {
  src = readFileSync(resolve(ROOT, FILE), 'utf8');
} catch {
  console.error(`✗ ${FILE} پیدا نشد.`);
  process.exit(1);
}

const problems = [];

// ── ۱. پیکربندی باید mixWithOthers باشد ──
if (!src.includes('AudioContextConfigFocus.mixWithOthers')) {
  problems.push(
    'پیکربندیِ تمرکز `mixWithOthers` نیست. هر چیزِ دیگری (gain یا\n' +
    '    duckOthers) یک AudioFocusRequest می‌فرستد و افکت‌ها موزیکِ دوئل\n' +
    '    را قطع می‌کنند.',
  );
}

// ── ۲. صراحتاً gain/duckOthers نباشد ──
for (const bad of ['AudioContextConfigFocus.gain', 'AudioContextConfigFocus.duckOthers']) {
  if (src.includes(bad)) {
    problems.push(`\`${bad}\` استفاده شده — همان باگِ قطعِ صدا برمی‌گردد.`);
  }
}

// ── ۳. متن باید واقعاً روی پخش‌کننده‌ها اعمال شود ──
//
// سه نقطه لازم است و هر سه دلیلِ جدا دارند:
//   • global      → همهٔ پخش‌کننده‌های آینده
//   • استخرِ افکت → چون load() در main.dart بدون await صدا زده می‌شود
//   • موزیک      → وگرنه خودش با اولین افکت تمرکز را می‌بازد
const applications = (src.match(/setAudioContext\(/g) || []).length;
if (applications < 3) {
  problems.push(
    `فقط ${applications} بار setAudioContext صدا زده شده؛ باید ۳ بار باشد\n` +
    '    (سراسری + استخرِ افکت + پخش‌کنندهٔ موزیک). توضیحِ هرکدام در\n' +
    '    بالای همان خط نوشته شده.',
  );
}

if (!src.includes('AudioPlayer.global.setAudioContext')) {
  problems.push('تنظیمِ سراسری (`AudioPlayer.global.setAudioContext`) حذف شده.');
}

// ── ۴. موزیک نباید در پس‌زمینه ادامه یابد (هر دو پلتفرم) ──
//
// نشانه‌اش با باگِ تمرکز فرق دارد ولی همان فایل‌ها را لمس می‌کند: کاربر از
// اپ بیرون می‌رود و موزیکِ دوئل پشتِ سرش می‌خواند. `dispose` این را
// نمی‌گیرد، چون پس‌زمینه رفتن صفحه را dispose نمی‌کند.
if (!src.includes('didChangeAppLifecycleState')) {
  problems.push(
    'ناظرِ چرخهٔ عمر حذف شده ⇒ موزیکِ دوئل در پس‌زمینه ادامه می‌یابد.\n' +
    '    باید در paused/detached موزیک pause و در resumed از سر گرفته شود.',
  );
}

const WEB = new URL('../src/gameAudio.js', import.meta.url);
const web = readFileSync(WEB, 'utf8');
if (!web.includes('visibilitychange')) {
  problems.push(
    'نسخهٔ وب ناظرِ visibilitychange ندارد ⇒ تبِ مخفی موزیک را ادامه\n' +
    '    می‌دهد. وب باید آینهٔ اندروید بماند (معیارِ پذیرشِ پروژه).',
  );
}

if (problems.length) {
  console.error('\n✗ گاردِ تمرکزِ صوتی شکست خورد.\n');
  console.error('  نشانهٔ کاربر: «وسطِ بازیِ کارت صدا قطع می‌شود».\n');
  for (const p of problems) console.error(`  • ${p}`);
  console.error(`\n  فایل‌ها: ${FILE}\n           userweb/src/gameAudio.js\n`);
  process.exit(1);
}

console.log('✓ تمرکزِ صوتی درست است (افکت‌ها موزیکِ دوئل را قطع نمی‌کنند)');
