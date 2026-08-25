#!/usr/bin/env node
/**
 * نگهبان جایزهٔ بازنشده + ویرایشگر گردونه.
 *
 * بدون دیتابیس: قرارداد فایل‌ها و مسیرها را قفل می‌کند تا صندوقِ گردونه
 * دوباره «همان لحظه باز» نشود و پنل ادمین از کلاینت‌ها جدا نیفتد.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

console.log('\n== جایزهٔ بازنشده و گردونهٔ ادمین ==');

const grant = read('backend/src/services/grantService.js');
ok(/kind === 'card_box'/.test(grant) && /opened_at IS NULL/.test(grant),
  'صندوق تا باز شدن pending می‌ماند');
ok(/grantBox/.test(grant) && /opened_at/.test(grant),
  'باز کردن از grantBox می‌گذرد نه از مسیر جدا');
ok(/league:\s*false/.test(grant),
  'امتیاز صندوقِ جایزه به لیگ اضافه نمی‌شود');

const wheel = read('backend/src/services/wheelService.js');
ok(/PRIZE_KINDS/.test(wheel) && /card_box/.test(wheel) && /shop_item/.test(wheel),
  'گردونه انواع صندوق/آیتم/پلاس را می‌شناسد');
ok(/grants\.award/.test(wheel),
  'چرخشِ صندوق از grantService می‌گذرد نه grantBox مستقیم');
ok(/async function saveAll/.test(wheel) && /WEIGHT_TOTAL/.test(wheel),
  'ذخیرهٔ ادمین جمع وزن را با WEIGHT_TOTAL می‌سنجد');
ok(/WEIGHT_MISMATCH/.test(wheel),
  'وزن ناهماهنگ بی‌صدا نرمال نمی‌شود');

const routes = read('backend/src/routes/adminWheel.js');
ok(/router\.put\('\/admin\/wheel\/prizes'/.test(routes)
  && /requireRole\(\)/.test(routes),
  'PUT گردونه فقط برای سوپرادمین است');

const server = read('backend/src/server.js');
ok(/app\.get\('\/api\/grants'/.test(server)
  && /app\.post\('\/api\/grants\/:id\/open'/.test(server),
  'مسیر باز کردن صندوقِ جایزه وجود دارد');
ok(/pendingGrants/.test(server),
  'bootstrap جایزه‌های بازنشده را می‌فرستد');
ok(/gamePoints/.test(server),
  'bootstrap امتیاز بازی آنلاین را می‌فرستد');
ok(/صندوق کارت بردی/.test(server),
  'چرخشِ صندوق اعلان «بازش کن» می‌فرستد');

const cfg = read('backend/src/routes/clientConfig.js');
ok(/features: featureFlags\.normalizeFeatures/.test(cfg),
  'PATCH بنر، پرچم features را پاک نمی‌کند');
ok(/gamePoints/.test(cfg),
  'GET /api/config امتیاز بازی را هم می‌دهد');

const league = read('backend/src/services/leagueService.js');
ok(/perk\.kind === 'card_box'/.test(league) && /grants\.award/.test(league),
  'جایزهٔ لیگ می‌تواند صندوق کارت باشد');

const mig = read('backend/migrations/077_grants_wheel_kinds_league_box.sql');
ok(/user_item_grants/.test(mig) && /card_box/.test(mig),
  'مایگریشن جدول grants و نوع card_box را می‌سازد');

const webInv = read('userweb/src/screens/Inventory.jsx');
ok(/\/api\/grants\/\$\{id\}\/open/.test(webInv),
  'وب صندوق جایزه را از کلکسیون باز می‌کند');
const droidInv = read('mobile/lib/screens/user/inventory_page.dart');
ok(/\/api\/grants\/\$id\/open/.test(droidInv),
  'اندروید صندوق جایزه را از کلکسیون باز می‌کند');

const webWheelUi = read('userweb/src/screens/Wheel.jsx');
ok(/<LiveWheelDisc\s+prizes/.test(webWheelUi) && /conic-gradient/.test(webWheelUi),
  'وب گردونه را واقعاً از جوایز سرور می‌کشد');
ok(!/<img className="wheelDisc"/.test(webWheelUi),
  'وب دیگر تصویر ثابت /wheel/wheel.svg را به‌جای دیسک زنده نمی‌گذارد');
ok(/\/api\/grants\/\$\{id\}\/open/.test(webWheelUi)
  || /\/api\/grants\/\$\{.*grantId/.test(webWheelUi),
  'وب از صفحهٔ گردونه هم صندوق را باز می‌کند');

const webMain = read('userweb/src/main.jsx');
ok(/pendingGrants:\s*boot\.pendingGrants/.test(webMain),
  'وب pendingGrants را از bootstrap دور نمی‌ریزد');

ok(/gamePoints=\{gamePoints\}/.test(read('userweb/src/games.jsx')),
  'وب امتیاز بازی آنلاین را به نوار راهنما پاس می‌دهد');

ok(/_PendingChests\(/.test(droidInv) && /grants: widget\.grants/.test(droidInv),
  'اندروید ویجت صندوقِ جایزه را در کلکسیون رسم می‌کند');

const dash = read('mobile/lib/screens/user/dashboard_page.dart');
ok((dash.match(/pendingGrants/g) || []).length >= 3,
  'اندروید داشبورد pendingGrants را بعد از شبکه هم نگه می‌دارد');

ok(/require\('\.\/routes\/adminWheel'\)/.test(server),
  'مسیر ادمین گردونه در server.js mount شده');
ok(/require\('\.\/routes\/clientConfig'\)[\s\S]{0,500}gameRewards:/.test(server),
  'GET /api/config به سرویس امتیاز بازی وصل است');
ok(/user_clubs/.test(grant) && /club_badge/.test(grant),
  'جایزهٔ نشان باشگاه عضویت هم می‌سازد');

const shopWeb = read('userweb/src/screens/Shop.jsx');
ok(/کیف پول با خرید شارژ نمی‌شود/.test(shopWeb),
  'وب نمی‌گوید کیف پول با خرید شارژ می‌شود');
const shopDroid = read('mobile/lib/screens/user/shop_page.dart');
ok(/کیف پول با خرید شارژ نمی‌شود/.test(shopDroid),
  'اندروید نمی‌گوید کیف پول با خرید شارژ می‌شود');

console.log(`\n✓ ${passed} بررسی موفق\n`);
