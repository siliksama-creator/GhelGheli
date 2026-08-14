#!/usr/bin/env node
//
// Guards the SENSORY parity between the web client and Android: the sound and
// the vibration that fire at each game moment.
//
// Why this file exists
// ────────────────────
// Every logic-level parity tool we had was green while the two clients felt
// completely different to play. Android fires `HapticFeedback` at 19 points;
// the web build had `navigator.vibrate` at three, all inside Card Duel. Worse,
// Penalty on the web played NO SOUND AT ALL while `penalty_board.dart` plays
// four distinct cues. Nothing caught it, because nothing asserted on feedback
// — the games agreed on rules, scores and network payloads, so every existing
// check passed.
//
// The assertions below are deliberately about the PAIRING (this moment gets a
// cue on both platforms), not about exact durations. Flutter's impact levels
// are platform-tuned patterns with no millisecond equivalent, so pinning
// numbers would encode a fiction and break on the next Flutter release. What
// must not drift is that a goal thumps harder than a save on both clients.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const web = {
  haptics: read('userweb/src/haptics.js'),
  penalty: read('userweb/src/penaltyGame.jsx'),
  tap: read('userweb/src/tapGame.jsx'),
  memory: read('userweb/src/memoryGame.jsx'),
  session: read('userweb/src/gameSession.js'),
  duel: read('userweb/src/cardDuelGame.jsx'),
  wheel: read('userweb/src/screens/Wheel.jsx'),
};
const android = {
  penalty: read('mobile/lib/screens/user/games/penalty_board.dart'),
  tap: read('mobile/lib/screens/user/games/tap/tap_screen.dart'),
  memory: read('mobile/lib/screens/user/games/memory_board.dart'),
  session: read('mobile/lib/screens/user/games/game_session.dart'),
  scaffold: read('mobile/lib/screens/user/games/game_scaffold.dart'),
  card: read('mobile/lib/widgets/player_card.dart'),
  wheel: read('mobile/lib/screens/user/wheel_page.dart'),
};

let checks = 0;
const ok = (label, cond) => {
  assert.ok(cond, `✗ ${label}`);
  checks += 1;
  console.log(`  ✓ ${label}`);
};

// ── the shared module ──────────────────────────────────────────────────────
console.log('\n== ماژول لرزش وب ==');
for (const fn of ['selectionClick', 'lightImpact', 'mediumImpact', 'heavyImpact',
  'victoryFanfare']) {
  ok(`haptics.js صادر می‌کند: ${fn}`, web.haptics.includes(`export const ${fn}`));
}
ok('هر لرزش داخل try/catch است (روی دسکتاپ و iOS نباید بازی را بشکند)',
  /try\s*\{[\s\S]*navigator\.vibrate/.test(web.haptics)
  && web.haptics.includes('catch'));

// ── penalty: four outcomes, sound AND haptic, on both ──────────────────────
console.log('\n== پنالتی: صدا و لرزش هر چهار لحظه ==');
ok('اندروید گل را با Sfx.win و heavyImpact اعلام می‌کند',
  android.penalty.includes('Sfx.win') && android.penalty.includes('heavyImpact'));
ok('وب هم گل را با صدای win و heavyImpact اعلام می‌کند',
  /play\('win'/.test(web.penalty) && /heavyImpact\(\)/.test(web.penalty));
ok('اندروید مهار را با Sfx.drop و mediumImpact اعلام می‌کند',
  android.penalty.includes('Sfx.drop') && android.penalty.includes('mediumImpact'));
ok('وب هم مهار را با صدای drop و mediumImpact اعلام می‌کند',
  /play\('drop'/.test(web.penalty) && /mediumImpact\(\)/.test(web.penalty));
ok('اندروید بیرون‌رفتن توپ را با Sfx.timeout و selectionClick اعلام می‌کند',
  android.penalty.includes('Sfx.timeout') && android.penalty.includes('selectionClick'));
ok('وب هم بیرون‌رفتن را با صدای timeout و selectionClick اعلام می‌کند',
  /play\('timeout'/.test(web.penalty) && /selectionClick\(\)/.test(web.penalty));
ok('اندروید خودِ شوت را با Sfx.tap و lightImpact اعلام می‌کند',
  android.penalty.includes('Sfx.tap') && android.penalty.includes('lightImpact'));
ok('وب هم خودِ شوت را با صدای tap و lightImpact اعلام می‌کند',
  /play\('tap'/.test(web.penalty) && /lightImpact\(\)/.test(web.penalty));
// The regression that started this file: penalty was entirely mute on the web.
ok('پنالتی وب دیگر بی‌صدا نیست (gameAudio را import کرده)',
  /import\s*\{[^}]*\bplay\b[^}]*\}\s*from\s*'\.\/gameAudio\.js'/.test(web.penalty));

// ── tap: four engine events + the throttled per-tap buzz ───────────────────
console.log('\n== ضربه‌زن: چهار رویداد و لرزشِ هر ضربه ==');
ok('اندروید برای هر ضربه selectionClick دارد',
  android.tap.includes('HapticFeedback.selectionClick'));
ok('وب هم برای هر ضربه selectionClick دارد',
  web.tap.includes('selectionClick()'));
ok('اندروید فاصلهٔ کمینهٔ ۱۲۵ms بین لرزش‌ها دارد',
  /_tapHapticMinGap\s*=\s*Duration\(milliseconds:\s*125\)/.test(android.tap));
ok('وب همان ۱۲۵ms را دارد',
  /TAP_HAPTIC_MIN_GAP_MS\s*=\s*125/.test(web.tap));
ok('وب لرزشِ ضربه را فقط بعد از پذیرفته‌شدن اجرا می‌کند (نه برای autoclicker)',
  web.tap.indexOf("verdict !== 'accepted'") < web.tap.indexOf('lastTapHaptic.current = hapticNow'));
ok('اندروید levelUp را mediumImpact می‌دهد', /levelUp:[\s\S]{0,120}mediumImpact/.test(android.tap));
ok('وب هم levelUp را mediumImpact می‌دهد', /mediumImpact\(\);\s*\/\/ levelUp/.test(web.tap));
ok('اندروید skinChanged را heavyImpact می‌دهد',
  /skinChanged:[\s\S]{0,120}heavyImpact/.test(android.tap));
// The web detects a skin change by comparing skin indexes rather than by an
// event enum, so the assertion pins that branch specifically: the heavy buzz
// must sit inside the `skinIndexForLevel(lv) !== prevSkin` block.
ok('وب هم تغییر شخصیت را heavyImpact می‌دهد',
  /skinIndexForLevel\(lv\) !== prevSkin\)[\s\S]{0,320}?heavyImpact\(\);\s*\n\s*\} else if/
    .test(web.tap));
ok('وب برای سقف روزانه هم لرزش دارد', /heavyImpact\(\);\s*\/\/ dailyCapHit/.test(web.tap));
ok('وب برای پایان بازی هم لرزش دارد', /heavyImpact\(\);\s*\/\/ gameCompleted/.test(web.tap));

// ── memory ─────────────────────────────────────────────────────────────────
console.log('\n== جفت‌یاب ==');
ok('اندروید برگرداندن کارت را selectionClick می‌دهد',
  /onTap:[\s\S]{0,80}HapticFeedback\.selectionClick/.test(android.memory));
ok('وب هم برگرداندن کارت را selectionClick می‌دهد',
  /selectionClick\(\);\s*onMove\(i\)/.test(web.memory));

// ── card duel ──────────────────────────────────────────────────────────────
console.log('\n== دوئل کارت ==');
ok('اندروید انتخاب کارت را selectionClick می‌دهد',
  android.card.includes('HapticFeedback.selectionClick'));
ok('وب هم انتخاب کارت را selectionClick می‌دهد',
  web.duel.includes('selectionClick()'));
ok('وب دیگر navigator.vibrate خام ندارد و از ماژول مشترک استفاده می‌کند',
  !web.duel.includes('navigator.vibrate') && !web.session.includes('navigator.vibrate'));
ok('اندروید بردِ راند را heavy و باختش را medium می‌دهد',
  /roundWinner == mine[\s\S]{0,120}heavyImpact[\s\S]{0,120}mediumImpact/.test(android.session));
ok('وب هم بردِ راند را heavy و باختش را medium می‌دهد',
  /roundWinner === prev\.me\) heavyImpact\(\); else mediumImpact\(\)/.test(web.session));
ok('اندروید پرداختِ پات را heavyImpact می‌دهد',
  /duelPoints[\s\S]{0,200}heavyImpact/.test(android.session));
ok('وب هم پرداختِ پات را heavyImpact می‌دهد',
  /play\('duel_points'[\s\S]{0,80}heavyImpact\(\)/.test(web.session));

// ── victory + wheel ────────────────────────────────────────────────────────
console.log('\n== پیروزی و گردونه ==');
ok('اندروید پیروزی را با چهار ضربهٔ پشت‌سرهم جشن می‌گیرد',
  (android.scaffold.match(/HapticFeedback\.heavyImpact/g) || []).length === 4);
ok('وب همان ریتم چهارضربه‌ای را دارد',
  (web.haptics.match(/45, 105/g) || []).length >= 1
  && web.session.includes('victoryFanfare()'));
ok('وب فقط برای برنده جشن می‌گیرد، نه بازنده',
  /if \(winner === prev\.me\) victoryFanfare\(\)/.test(web.session));
ok('اندروید بردِ گردونه را heavyImpact می‌دهد',
  android.wheel.includes('HapticFeedback.heavyImpact'));
ok('وب هم بردِ گردونه را heavyImpact می‌دهد',
  /playSfx\(res\.prize\.kind[\s\S]{0,80}heavyImpact\(\)/.test(web.wheel));

console.log(`\n✅ ${checks} تست parity حسی (صدا و لرزش) موفق بود\n`);
