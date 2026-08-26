#!/usr/bin/env node
/**
 * نگهبان شانس صندوق در پنل ادمین + قرارداد parseOdds.
 *
 * بدون دیتابیس: اعداد را با parseOddsInput می‌سنجد تا جمع ناهماهنگ
 * بی‌صدا نرمال نشود، و هر دو پنل را به همان مسیر وصل می‌کند.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  parseOddsInput, parsePrice, RARITIES, WEIGHT_TOTAL, DEFAULT_ODDS,
} = require('../src/services/cardBoxService');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

console.log('\n== شانس صندوق در پنل ادمین ==');

const defSum = RARITIES.reduce((s, r) => s + DEFAULT_ODDS[r], 0);
ok(defSum === WEIGHT_TOTAL, 'پیش‌فرض تولید دقیقاً ۱۰۰۰ است');
ok(parseOddsInput(DEFAULT_ODDS).legend === 10, 'نقشهٔ پیش‌فرض قبول می‌شود');
ok(parseOddsInput(RARITIES.map((r) => ({ rarity: r, permille: DEFAULT_ODDS[r] }))).gold === 153,
  'آرایهٔ {rarity,permille} قبول می‌شود');
ok(parseOddsInput({ odds: RARITIES.map((r) => ({ rarity: r, percent: DEFAULT_ODDS[r] / 10 })) }).normal === 409,
  'درصد با یک رقم اعشار به در هزار تبدیل می‌شود');

function throws(fn, code, msg) {
  let err;
  try { fn(); } catch (e) { err = e; }
  ok(err && err.code === code && err.status === 400, msg);
}
throws(() => parseOddsInput({ normal: 500, silver: 500 }), 'ODDS_INCOMPLETE',
  'کلاس جاافتاده رد می‌شود نه صفرِ پنهان');
throws(() => parseOddsInput({ ...DEFAULT_ODDS, legend: 11 }), 'ODDS_MISMATCH',
  'جمع ناهماهنگ بی‌صدا نرمال نمی‌شود');
throws(() => parseOddsInput({ ...DEFAULT_ODDS, legend: -1 }), 'ODDS_RANGE',
  'شانس منفی رد می‌شود');
throws(() => parseOddsInput({ ...DEFAULT_ODDS, legend: 1001 }), 'ODDS_RANGE',
  'شانس بالای ۱۰۰٪ رد می‌شود');

ok(parsePrice(100000) === 100000, 'قیمت معتبر قبول می‌شود');
let priceErr;
try { parsePrice(0); } catch (e) { priceErr = e; }
ok(priceErr && priceErr.status === 400, 'قیمت صفر رد می‌شود');

const svc = read('backend/src/services/cardBoxService.js');
ok(/ODDS_MISMATCH/.test(svc) && /saveOdds/.test(svc) && /adminView/.test(svc),
  'سرویس ذخیره و نمای ادمین دارد');

const routes = read('backend/src/routes/adminCardBox.js');
ok(/router\.put\('\/admin\/card-box'/.test(routes) && /requireRole\(\)/.test(routes),
  'PUT صندوق فقط برای سوپرادمین است');
ok(/audit\(req\.admin\.id, 'update_card_box'/.test(routes),
  'تغییر شانس در audit ثبت می‌شود');

const server = read('backend/src/server.js');
ok(server.includes("require('./routes/adminCardBox')"),
  'مسیر ادمین صندوق در server.js mount شده');

const web = read('admin/src/pages/card-box.jsx');
const droid = read('mobile/lib/screens/admin/admin_card_box.dart');
ok(web.includes('/api/admin/card-box') && droid.includes('/api/admin/card-box'),
  'هر دو پنل همان مسیر را صدا می‌زنند');
ok(web.includes('CardBoxAdminPage') && droid.includes('class AdminCardBox'),
  'هر دو پنل صفحهٔ واقعی دارند نه دکمهٔ مرده');
ok(read('admin/src/main.jsx').includes('card-box')
  && read('mobile/lib/screens/admin/admin_shell.dart').includes('AdminCardBox'),
  'هر دو شل ادمین صفحه را نشان می‌دهند');

const shell = read('mobile/lib/screens/admin/admin_shell.dart');
const pages = shell.match(/Admin[A-Za-z]+\(api:/g) || [];
const titlesBlock = shell.split('static const _titles = [')[1].split('];')[0];
const titles = titlesBlock.match(/'[^']+'/g) || [];
const iconsBlock = shell.split('static const _icons = [')[1].split('];')[0];
const icons = iconsBlock.match(/Icons\.\w+/g) || [];
ok(pages.length === titles.length && titles.length === icons.length,
  `شل اندروید ${pages.length} صفحه/عنوان/آیکون هم‌اندازه دارد`);
ok(titles.some((t) => t.includes('صندوق کارت')),
  'عنوان صندوق کارت در ناوبری اندروید هست');

console.log(`\n✓ ${passed} بررسی موفق\n`);
