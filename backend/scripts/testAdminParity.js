#!/usr/bin/env node
// نگهبانِ قابلیت‌های پنل وب ادمین.
//
// قبلاً این فایل «برابریِ پنل ادمین اندروید با وب» را می‌سنجید. پنل ادمین از
// اپ موبایل کاملاً حذف شد (docs/ADMIN_PANEL_MOBILE_RETIREMENT.md) و مدیریت
// فقط از پنل وب است؛ پس این گارد حالا تضمین می‌کند که همهٔ قابلیت‌های مدیریتی
// در پنل وب موجود و به مسیر درست وصل‌اند (تا قابلیتی موقع حذف پنل موبایل جا
// نیفتد).
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
let passed = 0;
function check(condition, message) {
  assert.ok(condition, message);
  passed += 1;
  console.log(`  ✓ ${message}`);
}

console.log('\n== Admin Web capability audit (پنل وب، تنها راه مدیریت) ==');
const webAdmins = read('admin/src/pages/admins.jsx');
check(/admins\/\$\{a\.id\}\/status/.test(webAdmins), 'Web can revoke/reactivate admin accounts');

const webUsers = read('admin/src/pages/users.jsx');
for (const capability of ['grant-plus', 'grant-item', 'points', 'reset-password', 'notify']) {
  check(webUsers.includes(`/${capability}`), `Web user management exposes ${capability}`);
}
check(/\{grant &&/.test(webUsers) && /اعطا کن/.test(webUsers),
  'Web grant-item actually renders a form, not a dead button');
check(/unlimited-spins/.test(webUsers), 'web admin can toggle unlimited wheel spins');
check(/signup-gift/.test(read('admin/src/pages/settings.jsx')),
  'web admin exposes signup-gift settings');
check(read('admin/src/pages/analytics.jsx').includes('crashes/groups'),
  'web admin resolves crash groups via API');
check(read('admin/src/pages/analytics.jsx').includes('wheel/stats'),
  'web admin shows wheel stats');
check(/\/status/.test(webUsers), 'web admin can block/unblock users');

const webNotifications = read('admin/src/pages/notifications.jsx');
check(/notifications\/status/.test(webNotifications) && /fcmConfigured/.test(webNotifications),
  'Web displays authoritative notification transport status');
check(/send-segmented/.test(webNotifications),
  'web uses the segmented-notification endpoint');

const webRewards = read('admin/src/pages/rewards.jsx');
const rewardRoutes = read('backend/src/routes/adminRewards.js');
check(/rewards\/\$\{cardEditor\.tierId\}\/cards/.test(webRewards),
  'Web manages required cards on a reward tier');
check(/AS required_cards/.test(rewardRoutes) && /cardTypeId/.test(rewardRoutes),
  'reward admin API returns persisted card requirements');
check(/LEFT JOIN reward_tiers/.test(rewardRoutes) && /COALESCE\(c\.reward_name/.test(rewardRoutes),
  'deleted reward tiers do not hide historical claims');

const dialog = read('admin/src/components/dialog.jsx');
check(/state\.description \|\| state\.message/.test(dialog),
  'Web confirmations render both legacy and current description props');
check(/state\.confirmLabel \|\| state\.confirmText/.test(dialog),
  'Web confirmations render both legacy and current button-label props');

const webCards = read('admin/src/pages/photo-cards.jsx');
check(/GroupedCardTile/.test(webCards),
  'web admin renders one administrative tile per grouped photo card');
check(/method: 'DELETE'/.test(webCards), 'web admin exposes safe whole-card deletion');

const webWheel = read('admin/src/pages/wheel.jsx');
check(/admin\/wheel\/prizes/.test(webWheel), 'web admin edits wheel prizes');
check(/شانس/.test(webWheel), 'web admin edits wheel chances as percent, not raw weights');
check(/card_box/.test(webWheel), 'web admin can put a card box on the wheel');
check(/card_box/.test(read('admin/src/pages/league.jsx')),
  'web admin can award a card box as a league perk');

const webBox = read('admin/src/pages/card-box.jsx');
check(webBox.includes('/api/admin/card-box'), 'web admin edits card-box odds');
check(/weightTotal/.test(webBox), 'web admin refuses to save odds that do not sum to 100%');
check(/\['card-box', 'صندوق کارت'/.test(read('admin/src/main.jsx')),
  'web admin shell exposes the card-box page (menu entry, not just an import)');

// ═══ دورِ عملیات (۱۴۰۵): فروشگاه، گذر نبرد، ماموریت‌ها، اهرم‌های موتور ═══
const webShop = read('admin/src/pages/shop.jsx');
check(/admin\/shop/.test(webShop), 'web admin exposes shop item CRUD');
check(/admin\/shop\/plus/.test(webShop), 'web admin edits plus plans');
check(/method: 'DELETE'/.test(webShop), 'web admin exposes shop item deletion');
check(/'shop'/.test(read('admin/src/main.jsx')), 'web admin shell exposes the shop page');

const webPass = read('admin/src/pages/battle-pass.jsx');
check(/admin\/pass\/seasons/.test(webPass), 'web admin manages battle-pass seasons');
check(/admin\/pass\/tiers/.test(webPass), 'web admin edits battle-pass tier rewards');
check(/admin\/pass\/config/.test(webPass), 'web admin edits the pass XP curve');
check(/maxTiersPerDay/.test(webPass), 'web admin exposes the daily tier cap');
check(/'battle-pass'/.test(read('admin/src/main.jsx')), 'web admin shell exposes the battle-pass page');

const webMissions = read('admin/src/pages/missions.jsx');
check(/admin\/missions\/config/.test(webMissions), 'web admin edits the daily mission bonus');
check(/admin\/missions\/builtin/.test(webMissions), 'web admin overrides builtin missions');
check(/admin\/missions/.test(webMissions), 'web admin creates custom missions');
check(/'missions'/.test(read('admin/src/main.jsx')), 'web admin shell exposes the missions page');

const webEngine = read('admin/src/pages/engine.jsx');
check(/settings\/photo-match/.test(webEngine), 'web admin edits photo-match thresholds');
check(/settings\/levels/.test(webEngine), 'web admin edits the level curve');
check(/settings\/streak/.test(webEngine), 'web admin edits the login-streak cycle');
check(/chat\/canned/.test(webEngine), 'web admin edits canned chat messages');
check(/'engine'/.test(read('admin/src/main.jsx')), 'web admin shell exposes the engine page');

const webSettings = read('admin/src/pages/settings.jsx');
check(/client-config/.test(webSettings), 'web admin edits the client config');
check(/tabOrder/.test(webSettings), 'web admin edits the tab order');
// ترتیب تب‌ها را سرور می‌راند و هر دو کلاینتِ کاربر (وب و اندروید) می‌خوانندش.
check(/tabOrder/.test(read('userweb/src/main.jsx'))
    && /tabOrder/.test(read('mobile/lib/screens/user/home_shell.dart')),
  'both user clients read the server-driven tab order');

console.log(`\n✅ ${passed} admin web capability assertions passed\n`);
