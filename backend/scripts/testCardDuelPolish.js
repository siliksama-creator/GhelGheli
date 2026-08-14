#!/usr/bin/env node
/** نگهبانِ «بازی، نه صفحهٔ توضیحات» برای دوئل کارت. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const mobile = read('mobile/lib/screens/user/games/card_duel/card_duel_widgets.dart');
const mobilePage = read('mobile/lib/screens/user/games/card_duel_page.dart');
const web = read('userweb/src/cardDuelGame.jsx');
const webStyle = read('userweb/src/style.css');
let pass = 0;
function ok(condition, label) {
  assert.ok(condition, label);
  pass += 1;
  console.log(`  ✓ ${label}`);
}
function between(source, from, to) {
  return source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
}

console.log('\n== بودجهٔ متنِ صحنهٔ زنده ==');
const mobileClash = between(mobile, 'class _ClashStageState', 'class _ClashCardOwner');
const webClash = between(web, 'function RoundReveal(', '// ═');
ok(!/Text\(\s*winnerSummary/.test(mobileClash),
  'Android: توضیح بلند فقط در Semantics است، نه روی صحنه');
ok(/label: 'نتیجه راند[^\n]*\$winnerSummary'/.test(mobileClash),
  'Android: حذف متن دیداری، دسترس‌پذیری را حذف نکرده است');
ok(!/_RoundChip/.test(mobileClash) && !/اختلاف عدد نهایی/.test(mobileClash),
  'Android: چیپ‌های توضیحی از برخورد زنده حذف شده‌اند');
ok(!/<small>\{summary\}<\/small>/.test(webClash)
  && !/duelReasonChips/.test(webClash) && !/duelCinematic/.test(webClash),
  'Web: پاراگراف، چیپ دلیل و شعار از برخورد زنده حذف شده‌اند');
ok(/aria-label=\{`نتیجه راند[^`]*\$\{summary\}`\}/.test(webClash),
  'Web: خلاصهٔ کامل همچنان برای screen reader وجود دارد');
ok(/\? '\+۱ تو'/.test(mobileClash) && /\? '\+۱ تو'/.test(webClash),
  'حکم دیداری هر دو کلاینت به یک عبارت کوتاه محدود است');

console.log('\n== اعلانِ شروع راند ==');
const mobileIntro = between(mobile, 'class _RoundIntroOverlayState', 'class CardDuelRoundIntroForTest');
const webIntro = between(web, 'function RoundIntroOverlay(', '/** عددِ نهایی');
ok(/Text\(\s*statName/.test(mobileIntro) && /بالاترین عدد برنده است/.test(mobileIntro),
  'Android: معیار و قانون یک‌خطی در صحنهٔ مستقل برجسته‌اند');
ok(!/Text\(\s*hint/.test(mobileIntro) && /label:[\s\S]*\$hint/.test(mobileIntro),
  'Android: hint بلند فقط در Semantics مانده است');
ok(/<b>\{meta\.name/.test(webIntro) && /<em>بالاترین عدد برنده است<\/em>/.test(webIntro),
  'Web: صحنهٔ معیار Android را با همان قرارداد دنبال می‌کند');
ok(!/focus\?\.cry/.test(webIntro) && !/\{focus\?\.hint &&/.test(webIntro),
  'Web: شعار و پاراگراف آموزشی دیداری ندارد');

console.log('\n== تحلیل ترکیبِ ثابت و بدون اسکرول ==');
const mobileIntel = between(mobile, 'class _DeckIntelPanel', 'class _FinalRoundBreakdown');
const webIntel = between(web, 'function DeckIntel(', 'function RoundTimeline(');
ok(!/Wrap\(/.test(mobileIntel) && !/_IntelChip/.test(mobileIntel)
  && /maxLines: 1/.test(mobileIntel),
  'Android: تحلیل یک کارت دوخطی ثابت است، نه چیپ‌های چندردیفه');
ok(!/<details/.test(webIntel) && /duelIntelCompact/.test(webIntel),
  'Web: تحلیل details یا حالت بازشونده ندارد');
ok(!/_CollapsibleSection\([\s\S]{0,120}title: 'تحلیل ترکیب'/.test(mobilePage),
  'Android: تحلیل داخل پنل بازشونده جاسازی نشده است');

console.log('\n== دستِ زنده بدون اسکرول و نتیجهٔ استاندارد ==');
const mobileLive = between(mobile, 'class _LiveBattle', 'class _Scoreboard');
const handOverride = webStyle.slice(webStyle.lastIndexOf('دوئل ۱.۱.۱۳'));
ok(!/ListView\.separated/.test(mobileLive) && /return Stack\(/.test(mobileLive),
  'Android: کارت‌های باقی‌مانده در fan ثابت‌اند و اسکرول افقی ندارند');
ok(/\.duelHandV2\{[\s\S]*display:grid;[\s\S]*overflow:visible/.test(handOverride),
  'Web: دست زنده grid/fan ثابت است و overflow اسکرولی ندارد');
ok(/—/.test(between(mobile, 'class _Finale', 'class _StakePayoutFlight'))
  && /duelFinalScore[\s\S]{0,180}<i>—<\/i>/.test(web),
  'نتیجهٔ نهایی هر دو کلاینت با خط فاصله نمایش داده می‌شود، نه نقطه');
ok(/class _StakePayoutFlight/.test(mobile) && /function StakePayoutFlight/.test(web),
  'واریز مسابقهٔ امتیازی در هر دو کلاینت انیمیشن مستقل دارد');
ok(/if \(session\.resultHolding\)[\s\S]{0,100}_ClashStage/.test(mobileLive)
  && /resultHolding && <RoundReveal/.test(web)
  && !/duelOpponentHand/.test(web),
  'برخورد فقط هنگام اعلام نتیجه فضا می‌گیرد و تزئین دست حریف حذف شده است');

console.log('\n== HUD، انتخاب و پایان ==');
ok(!/کارت این راند را انتخاب کن/.test(mobileClash)
  && !/کارت این راند را انتخاب کن/.test(web),
  'پرامپت طولانی انتخاب از هر دو HUD حذف شده است');
ok(/'کارت را بزن'/.test(mobile) && /'کارت را بزن'/.test(web),
  'فراخوان انتخاب در هر دو کلاینت کوتاه است');
ok(!/_LiveBattle\([\s\S]{0,120}finalView/.test(mobilePage),
  'Android: HUD زنده در صفحهٔ نتیجه تکرار نمی‌شود');
ok(!/<LiveArena[^>]*final/.test(web),
  'Web: HUD زنده در صفحهٔ نتیجه تکرار نمی‌شود');
ok(/className="duelFinalScore"/.test(web)
  && /تو \$\{faNum\(score\[me\]\)\}/.test(mobile),
  'نتیجهٔ نهایی در هر دو کلاینت یک امتیاز خوانا و مالک‌دار دارد');
ok(!/تایم‌لاین کامل ۵ راند/.test(mobile)
  && !/تایم‌لاین کامل ۵ راند/.test(web)
  && /جزئیات راندها/.test(mobile) && /جزئیات راندها/.test(web),
  'جزئیات اختیاری با عنوان کوتاه و جمع‌شده باقی مانده است');

console.log(`\n✅ ${pass} نگهبانِ پولیش کم‌متن موفق بود\n`);
