#!/usr/bin/env node
//
// گاردِ همسانیِ «صفحهٔ چت» بین کلاینتِ وب و اندروید.
//
// چرا این فایل وجود دارد
// ──────────────────────
// چت تنها جای اپ است که دو کاربرِ وب و اندروید هم‌زمان یک چیزِ واحد را
// می‌بینند، و دقیقاً همین‌جا بیشترین واگرایی جمع شده بود:
//
//   ۱. سرور `sent_at` را می‌فرستاد ولی هیچ‌کدام از دو کلاینت ساعت را نشان
//      نمی‌دادند. کاربر نمی‌فهمید پیام مالِ الان است یا دیروز.
//   ۲. سرور اصلاً `is_mine` را select نمی‌کرد، ولی اندروید روی آن حساب
//      می‌کرد؛ یعنی `isMe` همیشه false بود و «پیامِ من» هرگز متمایز نمی‌شد.
//   ۳. اندروید `eligible=false` را با پیامِ فارسی نشان می‌داد، وب هیچ —
//      کاربرِ واجدشرایط‌نشدهٔ وب فقط یک صفحهٔ خالی می‌دید.
//   ۴. چتِ خالی در هیچ‌کدام حالتِ توضیحی نداشت.
//   ۵. سرور `chat:new` را emit می‌کرد و هیچ کلاینتی گوش نمی‌داد.
//
// این تست‌ها روی رفتار و قرارداد داده‌اند، نه روی رنگ و پیکسل: هدف این است
// که اگر کسی یکی از دو کلاینت را عوض کرد و دیگری را فراموش کرد، CI قرمز شود.
//
// ⚠️ گاردِ ایستا نباید کامنت را کد بخواند. `strip()` کامنت‌های هر دو زبان را
//    حذف می‌کند، وگرنه همین توضیحاتِ فارسی خودشان تست را سبز می‌کردند.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');

/** کامنت‌های `//`، `///` و بلوکی را حذف می‌کند. */
function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/\/?.*$/gm, '')
    .replace(/([^:])\/\/.*$/gm, '$1');
}

const read = p => strip(fs.readFileSync(path.join(root, p), 'utf8'));

const web = read('userweb/src/screens/Chat.jsx');
const android = read('mobile/lib/screens/user/chat_page.dart');
const server = read('backend/src/server.js');

let checks = 0;
function ok(label, cond) {
  assert.ok(cond, `❌ ${label}`);
  checks += 1;
  console.log(`  ✓ ${label}`);
}

// ── ۱. قراردادِ سرور ──────────────────────────────────────────────────
// هر چه کلاینت‌ها رسم می‌کنند باید واقعاً در پاسخِ API باشد. این سه تست
// جلوی «کلاینت فیلدی را می‌خواند که سرور نمی‌فرستد» را می‌گیرند — همان
// اشتباهی که `is_mine` را ماه‌ها بی‌صدا خراب نگه داشته بود.
console.log('\n== قراردادِ سرور ==');

const chatSelects = server.match(/\(m\.user_id=\$1\) AS is_mine/g) || [];
ok('سرور `is_mine` را در هر دو کوئریِ چت (bootstrap و messages) می‌فرستد',
  chatSelects.length === 2);

ok('پاسخِ POST هم `is_mine: true` دارد',
  /is_mine:\s*true/.test(server));

// broadcast نباید پرچمِ شخصی داشته باشد وگرنه همه پیام را «مالِ خودم»
// می‌بینند و در سمتِ اشتباه رندر می‌کنند.
ok('نسخهٔ broadcast پیش از `io.emit` پرچمِ `is_mine` را حذف می‌کند',
  /is_mine:\s*_mine,\s*\.\.\.publicMsg/.test(server)
  && /io\.emit\('chat:new',\s*publicMsg\)/.test(server));

// ── ۲. ساعتِ پیام ─────────────────────────────────────────────────────
console.log('\n== ساعتِ پیام ==');

ok('وب تابعِ زمانِ پیام دارد', /function msgTime\(/.test(web));
ok('اندروید تابعِ زمانِ پیام دارد', /String chatTime\(/.test(android));

ok('هر دو `sent_at` را می‌خوانند',
  /msgTime\(m\.sent_at\)/.test(web) && /chatTime\(message\['sent_at'\]\)/.test(android));

// هر دو باید به وقتِ تهران نشان بدهند، وگرنه دو بازیکنِ یک مسابقه دو ساعتِ
// متفاوت روی یک پیامِ واحد می‌بینند.
ok('وب زمان را با منطقهٔ تهران قالب می‌کند', /Asia\/Tehran/.test(web));
ok('اندروید افستِ تهران را اعمال می‌کند',
  /_tehranOffset/.test(android) && /hours:\s*3,\s*minutes:\s*30/.test(android));

// تاریخِ خراب نباید «Invalid Date» یا استثنا بدهد.
ok('وب تاریخِ نامعتبر را به رشتهٔ خالی تبدیل می‌کند',
  /Number\.isNaN\(d\.getTime\(\)\)\s*\)\s*return\s*''/.test(web));
ok('اندروید تاریخِ نامعتبر را به رشتهٔ خالی تبدیل می‌کند',
  /DateTime\.tryParse/.test(android) && /if \(parsed == null\) return '';/.test(android));

// ── ۳. تفکیکِ پیامِ خودی ──────────────────────────────────────────────
console.log('\n== تفکیکِ چپ و راست ==');

ok('وب پیامِ خودی را با کلاسِ جدا رندر می‌کند',
  /chatMsg\$\{isMe \? ' me' : ''\}/.test(web));
ok('اندروید جهتِ ردیف را بر اساس isMe برعکس می‌کند',
  /textDirection:\s*isMe \? TextDirection\.ltr : TextDirection\.rtl/.test(android));

ok('وب `is_mine` سرور را مبنا می‌گیرد', /m\.is_mine === true/.test(web));
ok('اندروید `is_mine` سرور را مبنا می‌گیرد', /m\['is_mine'\] == true/.test(android));

const css = read('userweb/src/style.css');
ok('CSS وب پیامِ خودی را به سمتِ مقابل می‌برد',
  /\.chatMsg\.me\{[^}]*row-reverse/.test(css));

// ── ۴. حالتِ خالی ─────────────────────────────────────────────────────
console.log('\n== چتِ خالی ==');

ok('وب حالتِ خالی دارد', /messages\.length === 0/.test(web) && /chatEmpty/.test(web));
ok('اندروید حالتِ خالی دارد', /_messages\.isEmpty/.test(android));

for (const phrase of ['هنوز پیامی نیست', 'اولین نفری باش که سلام می‌کند']) {
  ok(`متنِ «${phrase}» در هر دو کلاینت یکی است`,
    web.includes(phrase) && android.includes(phrase));
}

// ── ۵. پیامِ عدمِ دسترسی ──────────────────────────────────────────────
console.log('\n== شرطِ ورود به چت ==');

ok('هر دو کلاینت `eligible=false` را می‌سنجند',
  /eligible === false/.test(web) && /cfg\['eligible'\] == false/.test(android));

ok('متنِ فارسیِ حداقلِ امتیاز در هر دو یکی است',
  web.includes('امتیاز تاریخی داشته باشید') && android.includes('امتیاز تاریخی داشته باشید'));

ok('هر دو عدد را از `minLifetimePoints` سرور می‌خوانند',
  /minLifetimePoints/.test(web) && /minLifetimePoints/.test(android));

// ── ۶. زندهٔ سوکت ─────────────────────────────────────────────────────
console.log('\n== دریافتِ زندهٔ پیام ==');

ok('سرور رویدادِ chat:new را emit می‌کند', /io\.emit\('chat:new'/.test(server));
ok('وب به chat:new گوش می‌دهد', /socket\.on\('chat:new'/.test(web));
ok('اندروید به chat:new گوش می‌دهد', /s\.on\('chat:new'/.test(android));

// پیامِ تکراری نباید دوبار بنشیند: فرستنده هم پاسخِ HTTP را دارد هم رویداد را.
ok('وب پیامِ تکراری را رد می‌کند',
  /prev\.some\(m => String\(m\.id\) === String\(msg\.id\)\)/.test(web));
ok('اندروید پیامِ تکراری را رد می‌کند',
  /_messages\.any\(\(m\) => m is Map && '\$\{m\['id'\]\}' == '\$id'\)/.test(android));

// سوکت که مسیرِ اصلی شد، polling باید کند شود وگرنه صرفاً بار اضافه است.
ok('polling وب به ۱۵ ثانیه رفت', /\}, 15000\)/.test(web));
ok('polling اندروید به ۱۵ ثانیه رفت',
  /startPolling\(const Duration\(seconds:\s*15\)/.test(android));

// هر دو باید موقعِ بسته‌شدنِ صفحه سوکت را ببندند، وگرنه نشتیِ اتصال داریم.
ok('وب سوکت را در cleanup می‌بندد', /socket\?\.disconnect\(\)/.test(web));
ok('اندروید سوکت را در dispose می‌بندد', /_socket\?\.dispose\(\)/.test(android));

// ── ۷. خوانایی ────────────────────────────────────────────────────────
// خواستهٔ صریحِ مالک: هیچ متنی نباید ریزتر از ۱۰.۵ باشد و متنِ اصلیِ حباب
// باید دستِ‌کم ۱۳.۵ باشد.
console.log('\n== خوانایی ==');

ok('متنِ حبابِ وب دستِ‌کم ۱۳.۵ است', /\.chatBubble\{[^}]*font-size:13\.5px/.test(css));
ok('متنِ حبابِ اندروید دستِ‌کم ۱۳.۵ است', /fontSize:\s*13\.5,\s*height:\s*1\.55/.test(android));

// در CSS فقط بلوک‌هایی سنجیده می‌شوند که سلکتورشان با `.chat` یا `.lobby`
// شروع می‌شود؛ گرفتنِ «از اولین .chat تا آخرِ فایل» بقیهٔ استایل‌ها را هم
// بی‌دلیل وارد دامنه می‌کرد.
const scopedBlocks = [...css.matchAll(/(\.(?:chat|lobby)[^{}]*)\{([^{}]*)\}/g)];
const cssSmall = scopedBlocks
  .flatMap(([, sel, body]) => [...body.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)]
    .map(m => [sel.trim(), Number(m[1])]))
  // ۱۰.۵ کفِ مجاز است و فقط برای ساعت و برچسب‌های ریزِ کمکی به کار می‌رود.
  .filter(([, n]) => n < 10.5);
ok(`هیچ فونتِ زیر ۱۰.۵ در چت/لابیِ وب نمانده — یافت: [${cssSmall.map(x => x.join(':')).join(', ')}]`,
  cssSmall.length === 0);

const dartSmall = [...android.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)]
  .map(m => Number(m[1]))
  .filter(n => n > 0 && n < 10.5);
ok(`هیچ فونتِ زیر ۱۰.۵ در چتِ اندروید نمانده — یافت: [${dartSmall.join(', ')}]`,
  dartSmall.length === 0);

// همان قاعده برای صفحهٔ بازی، که در همین دور بازطراحی شد.
const gamesWeb = read('userweb/src/games.jsx');
const gamesAnd = read('mobile/lib/screens/user/games_page.dart');
for (const [name, src] of [['وب', gamesWeb], ['اندروید', gamesAnd]]) {
  const re = name === 'وب' ? /fontSize:\s*'(\d+(?:\.\d+)?)px'/g : /fontSize:\s*(\d+(?:\.\d+)?)/g;
  const small = [...src.matchAll(re)].map(m => Number(m[1])).filter(n => n > 0 && n < 10.5);
  ok(`هیچ فونتِ زیر ۱۰.۵ در صفحهٔ بازیِ ${name} نمانده — یافت: [${small.join(', ')}]`,
    small.length === 0);
}

// ── پیام‌های آماده: یک فهرست، سه جا ───────────────────────────────────
//
// چرا این بلوک لازم شد
// ────────────────────
// «پیام آماده» سه نسخهٔ مستقل داشت که هیچ‌کدام همدیگر را نمی‌شناختند:
//
//   ۱. `CANNED_MESSAGES` در سرور — تنها مرجعِ *مجازبودن*. هر متنِ خارج از
//      این فهرست در `isAllowedChatMessage` رد می‌شود.
//   ۲. `BASE_CATEGORIES` در `Chat.jsx` — چیزی که کاربرِ وب می‌بیند.
//   ۳. `_categories` در `chat_page.dart` — چیزی که کاربرِ اندروید می‌بیند.
//
// نتیجه‌اش این بود که سرور ۳۶ پیام می‌پذیرفت و هر دو کلاینت فقط ۲۱ تا را
// نشان می‌دادند: ۱۵ پیام نوشته شده بود، تست می‌شد، مجاز بود و هیچ کاربری
// در هیچ پلتفرمی نمی‌توانست بفرستدشان.
//
// جهتِ خطرناک‌ترش عکسِ این است: اگر کلاینتی پیامی را نشان بدهد که سرور
// نمی‌شناسد، کاربر دکمه را می‌زند و «پیام مجاز نیست» می‌گیرد — دکمه‌ای که
// خودِ ما گذاشته‌ایم. پس تساویِ دقیقِ هر سه مجموعه را می‌بندیم.
const serverCanned = new Set(
  [...(server.match(/const CANNED_MESSAGES = \[[\s\S]*?\n\];/) || [''])[0]
    .matchAll(/"([^"]+)"/g)].map(m => m[1]));

const webCanned = new Set(
  [...(web.match(/const BASE_CATEGORIES = \[[\s\S]*?\n\];/) || [''])[0]
    .matchAll(/'([^']+!?)'/g)].map(m => m[1])
    .filter(t => !['chat', 'football', 'game', 'گفتگو', 'بازی', 'رقابت'].includes(t)));

// فقط سه ردیفِ `('icon', 'عنوان', const [...])` را می‌خوانیم. پک‌های
// ویژه از سرور می‌آیند (نه فهرستِ ثابت) و رشته‌های کدشان نباید به‌عنوان
// پیام شمرده شوند.
const andCanned = new Set(
  [...(android.match(/List<\(String, String, List<String>\)> get _categories[\s\S]*?\n  \}/) || [''])[0]
    .matchAll(/\(\s*'[a-z]+',\s*'[^']+',\s*const \[([^\]]*)\]\s*\)/g)]
    .flatMap(m => [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])));

ok(`فهرستِ سرور خالی نیست (${serverCanned.size} پیام)`, serverCanned.size > 20);
ok(`فهرستِ وب خالی نیست (${webCanned.size} پیام)`, webCanned.size > 20);
ok(`فهرستِ اندروید خالی نیست (${andCanned.size} پیام)`, andCanned.size > 20);

const webExtra = [...webCanned].filter(t => !serverCanned.has(t));
ok(`هیچ پیامی در وب نیست که سرور ردش کند — یافت: [${webExtra.join(' | ')}]`,
  webExtra.length === 0);

const andExtra = [...andCanned].filter(t => !serverCanned.has(t));
ok(`هیچ پیامی در اندروید نیست که سرور ردش کند — یافت: [${andExtra.join(' | ')}]`,
  andExtra.length === 0);

const webMissing = [...serverCanned].filter(t => !webCanned.has(t));
ok(`هیچ پیامِ مجازی در وب جا نمانده — یافت: [${webMissing.join(' | ')}]`,
  webMissing.length === 0);

const andMissing = [...serverCanned].filter(t => !andCanned.has(t));
ok(`هیچ پیامِ مجازی در اندروید جا نمانده — یافت: [${andMissing.join(' | ')}]`,
  andMissing.length === 0);

console.log(`\n✅ ${checks} تست همسانیِ چت موفق بود\n`);
