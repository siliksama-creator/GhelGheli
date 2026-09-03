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

// سوییچ فروش (خواستهٔ مالک: «مدیریت صندوق کارت فروشگاه از ادمین»).
ok(/saveEnabled/.test(svc) && /card_box_enabled/.test(svc),
  'سرویس سوییچ فروش را در app_settings ذخیره می‌کند');
ok(/body\.enabled/.test(routes) && /saveEnabled/.test(routes),
  'PUT ادمین سوییچ فروش را می‌پذیرد');
ok(web.includes('وضعیت فروش') && web.includes('enabled')
  && droid.includes('وضعیت فروش') && droid.includes("'enabled': _enabled"),
  'هر دو پنل سوییچ فروش را نشان می‌دهند و ذخیره می‌کنند');
const shopSvc = read('backend/src/services/shopService.js');
ok(/card_box_enabled/.test(shopSvc) && /BOX_DISABLED/.test(shopSvc),
  'خرید صندوق وقتی فروش بسته است در سرور رد می‌شود — نه فقط در ظاهر');
ok(read('userweb/src/components/CardBox.jsx').includes('موقتاً غیرفعال')
  && read('mobile/lib/widgets/card_box.dart').includes('موقتاً غیرفعال'),
  'هر دو کلاینت کاربر پیام بسته‌بودن فروش را نشان می‌دهند');

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

// ساده‌خوانیِ پنل: هر صفحه در هر دو کلاینت توضیحِ یک‌خطی دارد.
const subsMatch = shell.match(/_subtitles = \[([\s\S]*?)\];/);
const subCount = subsMatch ? (subsMatch[1].match(/'[^']+',/g) || []).length : 0;
ok(subCount === titles.length,
  `شل اندروید برای هر صفحه توضیح دارد (${subCount}/${titles.length})`);
const webNav = read('admin/src/main.jsx');
// قالبِ NAV از ۳.۲ به بعد سه‌سطری است: توضیح در سطرِ خودش و کلیدِ گروه در
// سطرِ بعد. الگوی قبلی «'],» را می‌خواست — یعنی خطای سینتکسِ JS نه، بلکه
// یک گاردِ قرمزِ بی‌دلیل: توضیح‌ها سرِ جایشان بودند و فقط آرایه پرانتزی‌تر
// شده بود. پس اینجا به‌جای regexِ چندسطری، خودِ سطرِ NAV را جدا می‌کنیم و
// هر سطر را ساده می‌شماریم (خطای قبلی دقیقاً از «$» چسبیده به کاما بود).
const navBody = webNav.slice(webNav.indexOf('const NAV = ['));
const navLines = navBody.split('\n');
// سطرِ توضیح: چهار فاصله، با «'» شروع و با «',» تمام می‌شود.
// سطرِ گروه:  همان چهار فاصله و با «'» شروع می‌شود ولی در پایان «]» دارد.
// همین دو تفاوت، بی‌هیچ regexِ چندسطری، دو شمارش را از هم جدا می‌کند.
const quotedLine = (l) => l.startsWith("    '");
// در قالبِ NAVِ امروز، «سطرِ گروه» تنها سطری است که با «]» بسته می‌شود و
// «سطرِ توضیح» تنها سطرِ نقل‌قولی است که با «',» تمام می‌شود. بی‌این تفکیک،
// سه تلاشِ regex‌پیچیده برای شمارش، سه بار عددِ غلط داد (۰، ۲۲، ۱) در حالی
// که فایلِ JS سالم بود — گاردِ قرمزِ کور هم مثلِ سبزِ کور بی‌ارزش است، پس
// اینجا دو قاعدهٔ ساده و قابل‌خواندن نشسته، نه الگویِ چندسطری.
const groupLines = navLines.filter((l) => quotedLine(l) && l.includes(']'));
const navDescs = navLines.filter((l) => quotedLine(l) && !l.includes(']')
  && l.endsWith("',")).length;
const navGroupsWeb = groupLines.length;
// هر گروهی که در NAV مصرف می‌شود باید در `NAV_GROUPS` نام داشته باشد، وگرنه
// سرتیترِ خالی در منو می‌بینیم (منوی نیمه‌کاره: نه خطا دارد، نه معنا).
const groupNameBlock = (webNav.match(/const NAV_GROUPS = \{([\s\S]*?)\n\};/) || [])[1] || '';
const namedGroups = (groupNameBlock.match(/'[a-z][\w-]*'\s*:/g) || []).length;
ok(/active\[4\]/.test(webNav) && navDescs >= 20,
  `پنل وب برای صفحات توضیحِ یک‌خطی دارد (${navDescs})`);
// گروه‌بندی نباید توضیح‌ها را ببلعد: هر قلم باید هم سطرِ توضیح و هم سطرِ
// کلیدِ گروه داشته باشد؛ برابرِ همین دو شمارش، همان قول است.
ok(navGroupsWeb === navDescs,
  `پنل وب: هر ${navDescs} قلم، عضوِ ششمِ گروه‌دار دارد (${navGroupsWeb})`);
ok(namedGroups >= new Set(groupLines.map((l) => /^\s*'([\w-]+)'/.exec(l)[1])).size && namedGroups > 0,
  `پنل وب: نامِ گروه‌هایِ مصرفی در جدول هست (${namedGroups} نامِ جدول، ${groupLines.length} ردیفِ گروه‌دار)`);

console.log(`\n✓ ${passed} بررسی موفق\n`);
