#!/usr/bin/env node
/**
 * نگهبانِ ریتمِ نمایشِ راند.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * باگی که این فایل جلویش را می‌گیرد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * گزارشِ مالک:
 *   «اون لحظه‌ای که مبارزه تو راندو میگه برای راند ها سریع میاد بدون
 *    اینکه لود بشه میره»
 *
 * ── اندازه‌گیریِ زنده که علت را نشان داد ──
 *
 * با مرورگرِ واقعی ۳۰ ثانیه از یک بازی ضبط شد:
 *
 *     راند ۱: ۲۳٫۳ ثانیه   (منتظرِ انتخابِ کاربر — طبیعی)
 *     راند ۲:  ۵٫۲ ثانیه   ← مشکل
 *
 *     فازهای نمایشِ نتیجه:
 *       charge ۰٫۵s · impact ۰٫۳s · numbers ۰٫۵s · verdict ۴٫۰s
 *
 * علت: `applyMove` راند را حل می‌کرد و `advance` **بلافاصله** ساعتِ
 * راندِ بعد را مسلح می‌کرد. اوورلیِ اعلانِ راندِ تازه روی انیمیشنِ
 * نتیجه می‌افتاد. در نبردِ انسان‌به‌انسان بدتر بود: اگر هر دو سریع
 * انتخاب می‌کردند، کاربر هرگز نمی‌فهمید چرا برد یا باخت.
 *
 * ── قواعدی که اینجا قفل می‌شوند ──
 *
 *   ۱. سرور بعد از هر راند مکث داشته باشد (`resultHoldMs`).
 *   ۲. مجموعِ فازهای انیمیشنِ **هر دو کلاینت** از آن مکث کمتر باشد،
 *      وگرنه راندِ بعد وسطِ انیمیشن شروع می‌شود.
 *   ۳. مکث فقط بعد از راندِ **حل‌شده** اعمال شود، نه راندِ اول.
 *   ۴. مکث به `turnMs` اضافه شود نه اینکه از آن کم شود — وگرنه فرصتِ
 *      فکرکردنِ کاربر کوتاه می‌شد و یک باگ با باگِ دیگر عوض می‌شد.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..', '..');
let pass = 0;
const failures = [];
function ck(name, cond, detail = '') {
  if (cond) { pass += 1; console.log('  ✓', name); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log('  ✗', name, detail ? `→ ${detail}` : ''); }
}
const read = p => fs.readFileSync(path.join(REPO, p), 'utf8');

const rules = read('backend/src/games/rules/cardDuel.js');
const engine = read('backend/src/games/engine.js');
const webGame = read('userweb/src/cardDuelGame.jsx');
const webSession = read('userweb/src/gameSession.js');
const droidWidgets = read('mobile/lib/screens/user/games/card_duel/card_duel_widgets.dart');
const droidSession = read('mobile/lib/screens/user/games/game_session.dart');

console.log('\n══ ۱. سرور بعد از هر راند مکث دارد ══');
const holdMs = Number((rules.match(/resultHoldMs:\s*(\d+)/) || [])[1] || 0);
const introMs = Number((rules.match(/introMs:\s*(\d+)/) || [])[1] || 0);
ck('resultHoldMs در قواعد تعریف شده', holdMs > 0, `مقدار=${holdMs}`);
ck('مکث دستِ‌کم ۳ ثانیه است', holdMs >= 3000,
  `${holdMs}ms — کمتر از این، انیمیشنِ نتیجه جا نمی‌شود`);
ck('موتور resultHoldMs را می‌خواند', /room\.rules\.resultHoldMs/.test(engine));
ck('مکث فقط بعد از راندِ حل‌شده اعمال می‌شود',
  /state\.lastRound[\s\S]{0,200}resultHoldMs/.test(engine),
  'وگرنه راندِ اول هم بی‌دلیل تأخیر می‌گیرد');
ck('مکث به deadline اضافه می‌شود (نه کم)',
  /deadline\s*=\s*Date\.now\(\)\s*\+\s*holdMs/.test(engine),
  'کم‌کردن یعنی کوتاه‌شدنِ فرصتِ فکرِ کاربر');

console.log('\n══ ۲. مهرهای زمانی به کلاینت می‌رسند ══');
ck('resultUntil در snapshot هست', /resultUntil:\s*room\.resultUntil/.test(engine));
ck('resultHoldMs در snapshot هست', /resultHoldMs:\s*room\.resultUntil/.test(engine));

console.log('\n══ ۳. انیمیشنِ وب از مکث کوتاه‌تر است ══');
{
  const block = webGame.slice(webGame.indexOf('REVEAL_PHASES'), webGame.indexOf('function useRevealPhase'));
  const nums = [...block.matchAll(/ms:\s*(\d+)/g)].map(m => Number(m[1]));
  const total = nums.reduce((a, b) => a + b, 0);
  ck('فازهای وب پیدا شدند', nums.length >= 3, `${nums.join('+')}`);
  ck('مجموعِ فازهای وب < مکثِ سرور', total < holdMs,
    `${total}ms در برابر ${holdMs}ms`);
  // اگر خیلی کوتاه باشد هم بد است: نتیجه بی‌حس رد می‌شود.
  ck('انیمیشنِ وب خیلی عجولانه نیست', total >= 1500, `${total}ms`);
}

console.log('\n══ ۴. انیمیشنِ اندروید از مکث کوتاه‌تر است ══');
{
  const total = Number((droidWidgets.match(/_total\s*=\s*Duration\(milliseconds:\s*(\d+)\)/) || [])[1] || 0);
  ck('مدتِ کلِ انیمیشنِ اندروید پیدا شد', total > 0, `${total}ms`);
  ck('مجموعِ فازهای اندروید < مکثِ سرور', total > 0 && total < holdMs,
    `${total}ms در برابر ${holdMs}ms`);
  ck('انیمیشنِ اندروید خیلی عجولانه نیست', total >= 1500, `${total}ms`);
  // ⚠️ دو کلاینت باید حسِ یکسانی بدهند؛ اختلافِ زیاد یعنی یکی‌شان
  //    عقب مانده است.
  const webBlock = webGame.slice(webGame.indexOf('REVEAL_PHASES'), webGame.indexOf('function useRevealPhase'));
  const webTotal = [...webBlock.matchAll(/ms:\s*(\d+)/g)].map(m => Number(m[1])).reduce((a, b) => a + b, 0);
  ck('ریتمِ وب و اندروید نزدیک است', Math.abs(webTotal - total) <= 300,
    `وب ${webTotal}ms · اندروید ${total}ms`);
}

console.log('\n══ ۵. کلاینت‌ها مکث را رعایت می‌کنند ══');
ck('وب resultUntil را می‌خواند', /resultUntil/.test(webSession));
ck('وب ساعت را در مکث یخ می‌کند',
  /held\s*\)?\s*\{[\s\S]{0,200}return;/.test(webSession)
  || /if \(held\)/.test(webSession));
ck('وب اعلانِ راند را فقط در مکث و پس از نتیجه نشان می‌دهد',
  /!resultHolding\s*&&\s*holding[\s\S]{0,120}RoundIntroOverlay/.test(webGame),
  'بدونِ آن، اعلانِ راندِ تازه روی نتیجه می‌افتد');
ck('اندروید resultHoldMs را به مکث اضافه می‌کند',
  /resultHoldMs[\s\S]{0,200}_introHoldMs\s*=/.test(droidSession));
ck('نشانِ دیداریِ مکث وجود دارد',
  /isHolding/.test(webGame) && /introHolding/.test(droidWidgets),
  'عددِ یخ‌زده بدونِ نشانه شبیهِ هنگ است');

console.log('\n══ ۶. معرفیِ معیار یک صحنهٔ مستقل و همگام است ══');
const webIntro = webGame.slice(webGame.indexOf('function RoundIntroOverlay'), webGame.indexOf('/** عددِ نهایی'));
const androidIntro = droidWidgets.slice(droidWidgets.indexOf('class _RoundIntroOverlayState'), droidWidgets.indexOf('class CardDuelRoundIntroForTest'));
const webIntroMs = Number((webIntro.match(/setTimeout\([^,]+,\s*(\d+)\)/) || [])[1] || 0);
const androidIntroMs = Number((androidIntro.match(/duration:\s*const Duration\(milliseconds:\s*(\d+)\)/) || [])[1] || 0);
ck('سرور برای معرفیِ خوانا دست‌کم ۲.۸ ثانیه مکث دارد', introMs >= 2800, `${introMs}ms`);
ck('معرفیِ وب ۲.۸ ثانیه دیده می‌شود', webIntroMs === 2800, `${webIntroMs}ms`);
ck('معرفیِ اندروید ۲.۸ ثانیه دیده می‌شود', androidIntroMs === 2800, `${androidIntroMs}ms`);
ck('هر دو کلاینت قبل از پایان مکث سرور جمع می‌شوند',
  webIntroMs < introMs && androidIntroMs < introMs,
  `سرور ${introMs} · وب ${webIntroMs} · اندروید ${androidIntroMs}`);
ck('هر دو صحنه شمارش ۳،۲،۱ و تحویل به انتخاب دارند',
  /'۳'[\s\S]*'۲'[\s\S]*'۱'[\s\S]*'انتخاب!'/.test(androidIntro)
    && />۳<[\s\S]*>۲<[\s\S]*>۱<[\s\S]*>انتخاب!</.test(webIntro));
ck('اندروید هم معرفی را فقط در مکث و پس از نتیجه نشان می‌دهد',
  /if \(_session\.introHolding && !_session\.resultHolding\)[\s\S]{0,160}Positioned\.fill/.test(read('mobile/lib/screens/user/games/card_duel_page.dart')));
ck('انتخاب در زمان معرفی روی هر دو کلاینت قفل است',
  /!session\.introHolding/.test(droidWidgets) && /disabled=\{holding \|\|/.test(webGame));
ck('مرز نتیجه→معرفی در هر دو کلاینت صدای مستقل دارد',
  /resultHolding[\s\S]{0,300}Sfx\.duelIntro/.test(droidSession)
    && /!rHeld[\s\S]{0,180}duel_intro/.test(webSession));

console.log(`\n${failures.length ? '✗' : '✓'} ${pass} موفق، ${failures.length} ناموفق`);
if (failures.length) {
  console.log('\nشکست‌ها:');
  failures.forEach(f => console.log('  ·', f));
  process.exit(1);
}
if (pass < 24) {
  console.log(`\n✗ فقط ${pass} سنجه اجرا شد — کمتر از انتظار`);
  process.exit(1);
}
