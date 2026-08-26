#!/usr/bin/env node
//
// گاردِ صندوقِ کارت — «بک‌اندِ زنده‌ای که هیچ درِ ورودی ندارد».
//
// چرا این فایل وجود دارد
// ──────────────────────
// صندوقِ کارت کامل ساخته شد: جدول‌ها، قرعه‌کشیِ وزنی، روت‌های
// `overview`/`buy`/`history`، تحویلِ امتیاز، کمیسیونِ معرف. همه تست هم
// داشتند و همه سبز بودند. ولی **هیچ کلاینتی صدایش نمی‌زد** — نه وب، نه
// اندروید. نتیجه‌اش این بود:
//
//   کاربرِ بدونِ کارتِ فیزیکی → دوئل → «حداقل پنج کارت فعال لازم داری»
//   → و هیچ دکمه‌ای، هیچ لینکی، هیچ راهی. بن‌بستِ کامل.
//
// یعنی دقیقاً همان قابلیتی که برای شکستنِ این بن‌بست ساخته شده بود، خودش
// پشتِ در مانده بود. تستِ بک‌اند این را نمی‌گیرد چون بک‌اند سالم است؛
// چیزی که غایب است «سیم‌کشیِ کلاینت» است. این گارد همان سیم‌کشی را قفل
// می‌کند.
//
// درس کلی: یک اندپوینتِ کاربری که هیچ کلاینتی صدایش نمی‌زند، یا مرده است
// یا یک بن‌بستِ پنهان. هر دو حالت باید سر و صدا کند.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');

function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/\/?.*$/gm, '')
    .replace(/([^:])\/\/.*$/gm, '$1');
}
const read = p => strip(fs.readFileSync(path.join(root, p), 'utf8'));

let pass = 0;
const ok = (label, cond) => {
  assert.ok(cond, `✗ ${label}`);
  pass += 1;
  console.log(`  ✓ ${label}`);
};

console.log('\n== صندوق کارت ==');

const webBox = read('userweb/src/components/CardBox.jsx');
const webReveal = read('userweb/src/components/CardBoxReveal.jsx');
const andBox = read('mobile/lib/widgets/card_box.dart');
const webShop = read('userweb/src/screens/Shop.jsx');
const andShop = read('mobile/lib/screens/user/shop_page.dart');
const webDuel = read('userweb/src/cardDuelGame.jsx');
const andDuel = read('mobile/lib/screens/user/games/card_duel_page.dart');

// ── ۱. هر سه روت در هر دو کلاینت واقعاً صدا زده می‌شوند ───────────────
for (const [label, route] of [
  ['نمای کلی', '/api/card-box/overview'],
  ['خرید', '/api/card-box/buy'],
]) {
  ok(`وب روتِ «${label}» را صدا می‌زند`, webBox.includes(route));
  ok(`اندروید روتِ «${label}» را صدا می‌زند`, andBox.includes(route));
}

// خرید بدون راستی‌آزماییِ سرور یعنی کالای رایگان.
ok('وب بعد از پرداخت، سرور را برای تحویل صدا می‌زند',
  webBox.includes('/api/purchase/verify'));
ok('اندروید بعد از پرداخت، سرور را برای تحویل صدا می‌زند',
  andBox.includes('/api/purchase/verify'));

// ── ۲. صندوق از هر دو نقطه در دسترس است ───────────────────────────────
//
// فروشگاه تنها کافی نیست: کاربرِ گیرافتاده در دوئل، به فروشگاه فکر
// نمی‌کند. راهِ خروج باید همان‌جا باشد که بن‌بست رخ می‌دهد.
ok('صندوق در فروشگاهِ وب رندر می‌شود', /<CardBox\b/.test(webShop));
ok('صندوق در فروشگاهِ اندروید رندر می‌شود', /CardBox\(/.test(andShop));
ok('صندوق در بن‌بستِ دوئلِ وب رندر می‌شود', /<CardBox\b/.test(webDuel));
ok('صندوق در بن‌بستِ دوئلِ اندروید رندر می‌شود', /CardBox\(/.test(andDuel));

// ── ۳. بن‌بست دیگر بن‌بست نیست ─────────────────────────────────────────
//
// متنِ قدیمی فقط شرط را اعلام می‌کرد. متنِ تازه باید راه را هم نشان بدهد،
// وگرنه صندوق هست ولی کاربر نمی‌فهمد که همان است.
for (const [label, src] of [['وب', webDuel], ['اندروید', andDuel]]) {
  const m = src.match(/حداقل پنج کارت فعال[^'"]*/);
  ok(`پیامِ «پنج کارت» در ${label} هست`, Boolean(m));
  ok(`پیامِ «پنج کارت» در ${label} راهِ خروج را نشان می‌دهد`,
    /صندوق/.test(src.slice(src.indexOf(m[0]), src.indexOf(m[0]) + 400)));
}

// ── ۴. عددهای صندوق از سرور می‌آیند، نه هاردکد ────────────────────────
//
// همان اشتباهی که در `coin-parity` افتاد: عددِ کپی‌شده فردا دروغ است.
// قیمت و تعداد و شانس‌ها هر سه از `overview` می‌آیند.
for (const [label, src] of [['وب', webBox], ['اندروید', andBox]]) {
  ok(`${label}: قیمت را از سرور می‌خواند`, /\bprice\b/.test(src));
  ok(`${label}: تعدادِ کارت را از سرور می‌خواند`, /\bsize\b/.test(src));
  ok(`${label}: شانس‌ها را از سرور می‌خواند`, /\bodds\b/.test(src));
  ok(`${label}: قیمتِ ۱۰۰٬۰۰۰ را هاردکد نکرده`, !/100000|۱۰۰٬۰۰۰/.test(src));
  ok(`${label}: عددِ ۵ کارت را هاردکد نکرده`,
    !/(پنج کارت|۵ کارت)/.test(src));
}

// ── ۵. کارت‌های صندوق امتیاز می‌دهند و این به کاربر گفته می‌شود ────────
//
// تصمیمِ صریحِ مالک در دورِ ۲۶ (ناقضِ تصمیمِ قبلی): کارتِ صندوق باید
// `point_value` بدهد. اگر UI این را نگوید، کاربر ارزشِ خرید را نمی‌بیند.
ok('وب امتیازِ کارت‌ها را نشان می‌دهد',
  /pointValue/.test(webReveal) && /امتیاز/.test(webReveal) && /امتیاز/.test(webBox));
ok('اندروید امتیازِ کارت‌ها را نشان می‌دهد',
  /pointValue/.test(andBox) && /امتیاز/.test(andBox));

// ── ۶. برچسبِ سطح‌ها در دو کلاینت یکی است ─────────────────────────────
//
// کراس‌پلی: دو کاربر کنار هم صندوق باز می‌کنند. «لجند» در یکی و
// «افسانه‌ای» در دیگری یعنی دو بازیِ متفاوت.
const webRarity = read('userweb/src/lib/cards.js');
const andRarity = read('mobile/lib/widgets/rarity_card_frame.dart');
for (const label of ['معمولی', 'نقره‌ای', 'طلایی', 'پرمیوم', 'لجند']) {
  ok(`برچسبِ «${label}» در هر دو کلاینت یکسان است`,
    webRarity.includes(label) && andRarity.includes(label));
}
ok('وب برچسب‌ها را از منبعِ مشترک می‌گیرد',
  webBox.includes('CARD_RARITY_META'));
ok('اندروید برچسب‌ها را از منبعِ مشترک می‌گیرد',
  andBox.includes('rarityLabels'));

// ── ۷. روت‌ها واقعاً در سرور وجود دارند ───────────────────────────────
//
// گاردی که فقط کلاینت را ببیند، می‌تواند دو کلاینتِ هماهنگ را تأیید کند
// که هر دو یک روتِ ناموجود را صدا می‌زنند.
const server = read('backend/src/server.js');
for (const route of ['/api/card-box/overview', '/api/card-box/buy',
  '/api/card-box/history']) {
  ok(`سرور روتِ ${route} را دارد`, server.includes(route));
}

// ── ۸. تصویرِ صندوق در هر دو مقصد واقعاً وجود دارد ────────────────────
//
// دورِ ۲۸ صندوق را به بنرِ تصویری تبدیل کرد. تصویر برخلافِ کد، در بیلد
// خطا نمی‌دهد: وب یک آیکونِ شکسته نشان می‌دهد و اندروید یک مستطیلِ خاکستری،
// هر دو بی‌سر و صدا. پس وجودِ فایل باید همین‌جا سنجیده شود.
//
// دو مقصد جداست چون وب از `public/` سرو می‌کند و اندروید از `assets/` که
// در `pubspec.yaml` هم باید فهرست شده باشد. کپی‌کردن در یکی و یادرفتنِ
// دیگری، دقیقاً همان نقضِ آینگی است که این گارد برایش نوشته شده.
const bin = f => fs.existsSync(path.join(root, f));
for (const name of ['card_box_closed.webp', 'card_box_open.webp']) {
  ok(`وب تصویرِ ${name} را دارد`, bin(`userweb/public/shop/${name}`));
  ok(`اندروید تصویرِ ${name} را دارد`, bin(`mobile/assets/shop/${name}`));
  ok(`وب به ${name} ارجاع می‌دهد`, webBox.includes(`/shop/${name}`));
  ok(`اندروید به ${name} ارجاع می‌دهد`,
    andBox.includes(`assets/shop/${name}`));
}
ok('پوشهٔ assets/shop در pubspec فهرست شده است',
  /assets\/shop\//.test(read('mobile/pubspec.yaml')));

// ── ۹. باز شدنِ صندوق در هر دو کلاینت انیمیشن دارد ────────────────────
//
// خواستهٔ صریحِ مالک: باز شدن باید افکت داشته باشد و کارت‌ها جذاب رو
// بیایند. اگر یک کلاینت انیمیشن بگیرد و دیگری نه، همان دو-بازیِ متفاوت
// می‌شود که کراس‌پلی را می‌شکند — این بار در حسِ بازی، نه در قانونش.
//
// هر دو باید سه چیز داشته باشند: مرحلهٔ لرزش، تعویضِ تصویرِ بسته با باز،
// و رونماییِ پلکانیِ کارت‌ها.
ok('وب مرحلهٔ لرزش دارد', /shaking/.test(webBox));
ok('اندروید مرحلهٔ لرزش دارد', /shaking/.test(andBox));
ok('وب تصویرِ باز و بسته را عوض می‌کند',
  webBox.includes('card_box_open') && webBox.includes('card_box_closed'));
ok('اندروید تصویرِ باز و بسته را عوض می‌کند',
  andBox.includes('card_box_open') && andBox.includes('card_box_closed'));
ok('وب کارت‌ها را پلکانی رو می‌آورد', /revealed/.test(webBox));
ok('اندروید کارت‌ها را پلکانی رو می‌آورد', /_revealed/.test(andBox));

// فاصلهٔ رونماییِ هر کارت باید در دو کلاینت یکی باشد، وگرنه یک نفر
// جشنِ کندتری می‌گیرد. عدد از خودِ سورس خوانده می‌شود، نه کپی.
const webStep = webBox.match(/260\s*\*\s*i/);
const andStep = andBox.match(/260\s*\*\s*i/);
ok('گامِ رونمایی در هر دو کلاینت یکی است',
  Boolean(webStep) && Boolean(andStep));

// ── ۱۰. جایزهٔ گردونه/لیگ همان رونمایی خرید را دارد ──────────────────
//
// مسیر خرید از اول overlay سینمایی داشت. مسیر جایزه فقط نام کارت را
// در یک ردیف می‌نوشت. کاربر دو حس متفاوت از «باز شدن صندوق» می‌گرفت.
const webInv = read('userweb/src/screens/Inventory.jsx');
const webWheel = read('userweb/src/screens/Wheel.jsx');
ok('وب کلکسیون از GrantChestOpener استفاده می‌کند',
  /<GrantChestOpener/.test(webInv));
ok('وب گردونه از GrantChestOpener استفاده می‌کند',
  /<GrantChestOpener/.test(webWheel));
ok('رونمایی جایزه همان گام ۲۶۰ms خرید را دارد',
  /260\s*\*\s*i/.test(webReveal));
ok('رونمایی جایزه لرزش و تصویر صندوق دارد',
  /shaking/.test(webReveal) && /card_box_closed/.test(webReveal));

console.log(`\n✅ ${pass} تست صندوقِ کارت موفق بود\n`);
