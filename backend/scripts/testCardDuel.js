#!/usr/bin/env node
// Guardrails for the three-card duel MVP.
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}`); } };
const root = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const mig = read('backend/migrations/047_card_duel.sql');
const svc = read('backend/src/services/cardDuelService.js');
const server = read('backend/src/server.js');
const photo = read('backend/src/routes/photoCards.js')
  + read('backend/src/routes/photoCards/adminUpload.js');
const mobile = read('mobile/lib/screens/user/games/card_duel_page.dart');
const games = read('mobile/lib/screens/user/games_page.dart');
const admin = read('mobile/lib/screens/admin/admin_photo_cards.dart');

console.log('\n== دیتابیس ==');
ok(/duel_attack/.test(mig) && /duel_goal_chance/.test(mig), 'استات‌های دوئل روی card_types اضافه می‌شود');
ok(/duel_rarity.*normal.*silver.*gold.*premium.*legend/s.test(mig), 'کلاس کارت محدود و قابل بالانس است');
ok(/card_duel_decks/.test(mig) && /array_length\(card_type_ids, 1\) = 3/.test(mig), 'تیم Ghost دقیقاً سه کارت دارد');
ok(/card_duel_battles/.test(mig) && /mode IN \('bot','ghost','auto_ghost'\)/.test(mig), 'تاریخچهٔ bot/ghost/auto ثبت می‌شود');

console.log('\n== سرور و اقتصاد ==');
ok(/const DECK_SIZE = 3/.test(svc), 'بازی سه‌کارتی است');
ok(/CARD_DUEL_STAKE_POINTS/.test(svc), 'استیک Ghost ثابت و قابل تنظیم است');
ok(/botBattle[\s\S]*stake_points,battle_log\)[\s\S]*VALUES\('bot'/.test(svc), 'بات تمرینی امتیاز جابه‌جا نمی‌کند');
ok(/source: 'game'[\s\S]*referenceType: 'card_duel_battles'[\s\S]*league: false/.test(svc), 'انتقال امتیاز Ghost از دفتر می‌گذرد و لیگ را دستکاری نمی‌کند');
ok(/runAutoGhostBattles/.test(server) && /'11 \* \* \* \*'/.test(server), 'کرون نبرد خودکار Ghost فعال است');
ok(/\/api\/card-duel\/deck/.test(server) && /\/api\/card-duel\/ghost/.test(server), 'APIهای بازی وصل شده‌اند');
ok(/duelFieldsFromBody/.test(photo), 'ثبت کارت از پنل ادمین استات دوئل را می‌گیرد');

console.log('\n== اندروید ==');
ok(/class CardDuelPage/.test(mobile), 'صفحهٔ دوئل کارت در Flutter وجود دارد');
ok(/\/api\/card-duel/.test(mobile), 'صفحهٔ Flutter به API جدید وصل است');
ok(/دوئل کارت‌ها/.test(games) && /CardDuelPage/.test(games), 'بازی در بخش بازی‌ها اضافه شده');
ok(/استات دوئل کارت/.test(admin) && /duelAttack/.test(admin), 'ادمین اندروید هنگام ثبت کارت استات‌ها را می‌فرستد');
ok(fs.existsSync(path.join(root, 'mobile/assets/games/card_duel_glow.png')), 'آیکون شفاف بازی ساخته شده است');

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} تست موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
