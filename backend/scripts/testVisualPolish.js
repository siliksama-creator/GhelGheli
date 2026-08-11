#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(root, p));
const text = p => read(p).toString('utf8');
let pass = 0, fail = 0;
const check = (condition, label) => {
  console.log(`  ${condition ? '✓' : '✗'} ${label}`);
  condition ? pass++ : fail++;
};

console.log('\n== strict visual polish audit ==');
const mobileBadge = read('mobile/assets/games/social_mission_badge.png');
const webBadge = read('userweb/public/games/social_mission_badge.png');
check(mobileBadge.subarray(1, 4).toString() === 'PNG', 'new social/mission badge is a real PNG');
check(mobileBadge.includes(Buffer.from('tRNS')), 'badge has a real transparency table');
check(mobileBadge.length < 100 * 1024, 'transparent badge stays below 100KB');
check(crypto.createHash('sha256').update(mobileBadge).digest('hex')
  === crypto.createHash('sha256').update(webBadge).digest('hex'),
'Web and Android use the exact same polished badge');
const mobilePenaltyIcon = read('mobile/assets/games/penalty_icon.png');
const webPenaltyIcon = read('userweb/public/games/penalty_icon.png');
check(mobilePenaltyIcon.includes(Buffer.from('tRNS')) && mobilePenaltyIcon.length < 100 * 1024,
  'new penalty icon is transparent and size-budgeted');
check(crypto.createHash('sha256').update(mobilePenaltyIcon).digest('hex')
  === crypto.createHash('sha256').update(webPenaltyIcon).digest('hex'),
'penalty icon is identical on Web and Android');

const growthCss = text('userweb/src/growth.css');
const webGrowth = text('userweb/src/GrowthHub.jsx');
const mobileGrowth = text('mobile/lib/screens/user/games/growth_panel.dart');
check(/missionRail[^}]*display:flex[^}]*overflow-x:auto/s.test(growthCss),
  'mobile Web missions are a horizontal rail, not five tall cards');
check(webGrowth.includes('searchOpen') && mobileGrowth.includes('_searchOpen'),
  'friend search stays collapsed until requested on both clients');
check(webGrowth.includes('social_mission_badge.png') && mobileGrowth.includes('social_mission_badge.png'),
  'new visual identity is wired into both clients');

const webHome = text('userweb/src/screens/Home.jsx');
const mobileHome = text('mobile/lib/screens/user/dashboard_page.dart');
for (const obsolete of ['کارت داری اینجا ثبت کن !', 'کارت‌های فیزیکی قلقلی را می‌توانید از فروشگاه‌ها و سوپرمارکت‌ها تهیه کنید']) {
  check(!webHome.includes(obsolete) && !mobileHome.includes(obsolete), `removed redundant copy: ${obsolete}`);
}
const webShop = text('userweb/src/screens/Shop.jsx');
const mobileShop = text('mobile/lib/screens/user/shop_page.dart');
check(webShop.includes('showPlans') && webShop.includes('جمع کردن پلن‌ها')
  && mobileShop.includes('_showPlans') && mobileShop.includes('جمع کردن پلن‌ها'),
  'Plus plans use compact progressive disclosure on Web and Android');

const duelWidgets = text('mobile/lib/screens/user/games/card_duel/card_duel_widgets.dart');
const mobileGames = text('mobile/lib/screens/user/games_page.dart');
check(duelWidgets.includes('=> const AppCard('), 'card-duel const-constructor lint is fixed');
check(!mobileGames.includes("'${faNum(s)}'"), 'unnecessary Flutter string interpolation is fixed');
check(!mobileGames.includes('تمرین فوری با هوش مصنوعی')
  && !text('userweb/src/games.jsx').includes('تمرین فوری با هوش مصنوعی'),
  'repeated game-mode copy is shortened on both clients');

console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
