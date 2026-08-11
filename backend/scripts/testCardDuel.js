#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const rules = require('../src/games/rules/cardDuel');

let pass = 0;
function ok(condition, name) {
  assert.ok(condition, name);
  pass += 1;
  console.log(`  ✓ ${name}`);
}
const root = path.join(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function card(id, stat, effect = 'none') {
  return {
    id, cardTypeId: id, name: id, imageUrl: null, pointValue: 100,
    attack: stat, defense: stat, speed: stat, technique: stat,
    goalChance: stat, energy: 100, rarity: 'normal', effect,
  };
}

const migration = read('backend/migrations/050_card_duel_live_online.sql');
const service = read('backend/src/services/cardDuelService.js');
const server = read('backend/src/server.js');
const engine = read('backend/src/games/engine.js');
const registry = read('backend/src/games/index.js');
const mobile = read('mobile/lib/screens/user/games/card_duel_page.dart')
  + read('mobile/lib/screens/user/games/card_duel/card_duel_widgets.dart');
const mobileHub = read('mobile/lib/screens/user/games_page.dart');
const web = read('userweb/src/cardDuelGame.jsx');
const webHub = read('userweb/src/games.jsx');
const mobileWheel = read('mobile/lib/screens/user/wheel_page.dart');
const webWheel = read('userweb/src/screens/Wheel.jsx');

console.log('\n== منطق زندهٔ سه‌کارتی ==');
const state = rules.createFromDecks(
  [card('x1', 90), card('x2', 75), card('x3', 60)],
  [card('o1', 80), card('o2', 70), card('o3', 55)],
);
ok(state.remaining.X.length === 3 && state.remaining.O.length === 3,
  'هر بازیکن دقیقاً سه کارت آماده دارد');
ok(rules.simultaneous === true, 'انتخاب دو بازیکن هم‌زمان است');
ok(rules.isValidMove(state, { cardId: 'x1' }, 'X'), 'کارت باقی‌مانده حرکت معتبر است');
rules.applyMove(state, { cardId: 'x1' }, 'X');
const viewO = rules.publicState(state, 'O');
ok(!JSON.stringify(viewO).includes('x1'), 'انتخاب قفل‌نشده به حریف نشت نمی‌کند');
ok(viewO.opponentLocked === true, 'حریف فقط می‌فهمد انتخاب انجام شده است');
ok(!rules.isValidMove(state, { cardId: 'x2' }, 'X'), 'یک بازیکن در هر راند فقط یک انتخاب دارد');
rules.applyMove(state, { cardId: 'o1' }, 'O');
ok(state.roundIndex === 1 && state.history.length === 1, 'بعد از دو انتخاب راند دقیقاً یک بار حل می‌شود');
ok(!state.remaining.X.includes('x1') && !state.remaining.O.includes('o1'), 'کارت بازی‌شده دوباره قابل استفاده نیست');
for (const [x, o] of [['x2', 'o2'], ['x3', 'o3']]) {
  rules.applyMove(state, { cardId: x }, 'X');
  rules.applyMove(state, { cardId: o }, 'O');
}
ok(['X', 'O', 'DRAW'].includes(rules.result(state)), 'سه راند همیشه نتیجه نهایی معتبر می‌سازد');
const botState = rules.createFromDecks(
  [card('x1', 70), card('x2', 71), card('x3', 72)],
  [card('o1', 70), card('o2', 71), card('o3', 72)],
);
ok(rules.isValidMove(botState, rules.botMove(botState, 'O'), 'O'), 'ربات حرکت قانونی و بدون تقلب می‌سازد');

console.log('\n== سرور، اقتصاد و حذف Ghost ==');
ok(/card_duel: cardDuel/.test(registry), 'دوئل کارت داخل موتور مشترک آنلاین ثبت شده است');
ok(!/singlePlayer:\s*true/.test(registry.split("id: 'card_duel'")[1].split('},')[0]),
  'دوئل کارت دیگر بازی مستقل تک‌نفره نیست');
ok(/ONLINE_STAKES = Object\.freeze\(\[100, 1000\]\)/.test(service), 'حالت‌های عمومی ۱۰۰ و ۱۰۰۰ تعریف شده‌اند');
ok(/mode IN \('bot','online','lobby','ghost','auto_ghost'\)/.test(migration),
  'تاریخچه آنلاین/لابی اضافه و تاریخچه قدیمی حفظ می‌شود');
ok(/UPDATE card_duel_decks SET ghost_enabled=false/.test(migration), 'تمام تیم‌های Ghost قبلی غیرفعال می‌شوند');
ok(!/\/api\/card-duel\/ghost/.test(server), 'endpoint ساخت نبرد Ghost حذف شده است');
ok(!/runAutoGhostBattles|auto_ghost/.test(server), 'کرون Ghost خودکار حذف شده است');
ok(!/ghostBattle|runAutoGhostBattles/.test(service), 'سرویس دیگر نبرد Ghost تولید نمی‌کند');
ok(/createWithContext[\s\S]*reserveMatch/.test(engine), 'ترکیب‌ها قبل از رزرو امتیاز اعتبارسنجی می‌شوند');
ok(engine.indexOf('const initialState = rules.createWithContext') < engine.indexOf('reservation = await stakes.reserveMatch'),
  'شکست ترکیب نمی‌تواند امتیاز را در escrow گیر بیندازد');
ok(/matchMode: room\.matchMode/.test(engine), 'نوع آنلاین/لابی به کلاینت اعلام می‌شود');
ok(/recordEngineBattle/.test(service) && /rules\.onFinish/.test(engine), 'تاریخچهٔ نبرد زنده ثبت می‌شود');
ok(/league: false/.test(read('backend/src/services/gameStakeService.js')),
  'تسویه مسابقه رتبه لیگ را دستکاری نمی‌کند');

console.log('\n== تجربهٔ Web و Android ==');
for (const [source, platform] of [[mobile, 'Android'], [web, 'Web']]) {
  ok(!/Ghost|دوئل Ghost/.test(source), `${platform}: هیچ حالت Ghost در UI نمانده است`);
  ok(/تمرین با ربات/.test(source), `${platform}: تمرین با ربات وجود دارد`);
  ok(/انتخاب.*مخفی|مخفی.*انتخاب/.test(source), `${platform}: انتخاب مخفی هم‌زمان توضیح داده شده است`);
  ok(/راند/.test(source) && /ترکیب/.test(source), `${platform}: راند و ترکیب سه‌کارتی طراحی شده‌اند`);
}
ok(/stake: _activeStake/.test(mobileHub) && !/بازی مستقل با کارت/.test(mobileHub),
  'Android دوئل کارت را با حالت انتخاب‌شده ۱۰۰/۱۰۰۰ اجرا می‌کند');
ok(/stake=\{Number\(active\.stake/.test(webHub) && !/بازی مستقل با کارت/.test(webHub),
  'Web دوئل کارت را با حالت انتخاب‌شده ۱۰۰/۱۰۰۰ اجرا می‌کند');
ok(/card_duel.*دوئل کارت‌ها/.test(mobileHub) && /card_duel.*دوئل کارت‌ها/.test(webHub),
  'دوئل کارت در لابی هر دو کلاینت قابل انتخاب است');
ok(/در صورت باخت/.test(mobileHub) && /در صورت باخت/.test(webHub),
  'ریسک کسر امتیاز قبل از ورود در هر دو کلاینت روشن است');
ok(/بچرخون/.test(mobileWheel) && !/بچرخان/.test(mobileWheel), 'Android: متن دکمه گردونه «بچرخون» است');
ok(/بچرخون/.test(webWheel) && !/بچرخان/.test(webWheel), 'Web: متن دکمه گردونه «بچرخون» است');
ok(fs.existsSync(path.join(root, 'mobile/assets/games/card_duel_glow.png')), 'آیکون شفاف آرنای کارت حفظ شده است');

console.log(`\n✅ ${pass} تست دوئل کارت موفق بود\n`);
