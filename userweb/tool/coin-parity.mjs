#!/usr/bin/env node
//
// گاردِ همسانیِ «سکهٔ لیگ» بین کلاینتِ وب و اندروید.
//
// چرا این فایل وجود دارد
// ──────────────────────
// سکه یک ارزِ تازه است که هم‌زمان به شش نقطهٔ UI در دو کلاینت اضافه شد:
// صفحهٔ نتیجهٔ بازی‌های عمومی، صفحهٔ نتیجهٔ دوئل کارت، پودیوم لیگ، ردیف‌های
// جدول، کارتِ «جایگاه شما» و خطِ سهمیهٔ روزانه. کراس‌پلی الزامی است، یعنی
// یک بازیکنِ وب و یک بازیکنِ اندروید در همان مسابقه‌اند و همان رویدادِ
// `game:settlement` را می‌گیرند. اگر یکی سکه را نشان بدهد و دیگری نه،
// بازنده‌ی اندرویدی فکر می‌کند حریفش چیزی نگرفته و برنده‌ی وبی فکر می‌کند
// سیستم به او بدهکار است.
//
// این تست‌ها عمداً روی سه چیزِ رفتاری‌اند، نه روی ظاهر:
//   ۱. هر دو کلاینت `coins` را از همان رویداد می‌خوانند.
//   ۲. هر دو، صفر را ساکت رد می‌کنند («۰ سکه» ممنوع است).
//   ۳. هر جا جدول با `coins DESC` مرتب می‌شود، سکه هم رسم می‌شود.
//
// ⚠️ گاردِ ایستا نباید کامنت را کد بخواند. `strip()` کامنت‌های هر دو زبان
//    را حذف می‌کند، وگرنه همین توضیحاتِ فارسی خودشان تست را سبز می‌کردند.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');

/** کامنت‌های `//` و `/* *\/` را حذف می‌کند تا متنِ توضیحی به‌جای کد شمرده نشود. */
function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/\/?.*$/gm, '')
    .replace(/([^:])\/\/.*$/gm, '$1');
}

const read = p => strip(fs.readFileSync(path.join(root, p), 'utf8'));

const web = {
  session: read('userweb/src/gameSession.js'),
  games: read('userweb/src/games.jsx'),
  duel: read('userweb/src/cardDuelGame.jsx'),
  award: read('userweb/src/components/CoinAward.jsx'),
  league: read('userweb/src/screens/League.jsx'),
  chip: read('userweb/src/components/CoinChip.jsx'),
  profile: read('userweb/src/screens/PublicProfile.jsx'),
  icons: read('userweb/src/components/IconAsset.jsx'),
};
const android = {
  session: read('mobile/lib/screens/user/games/game_session.dart'),
  scaffold: read('mobile/lib/screens/user/games/game_scaffold.dart'),
  duel: read('mobile/lib/screens/user/games/card_duel/card_duel_widgets.dart'),
  award: read('mobile/lib/screens/user/games/coin_award.dart'),
  chip: read('mobile/lib/widgets/coin_chip.dart'),
  league: read('mobile/lib/screens/user/league_page.dart'),
  tile: read('mobile/lib/screens/shared/rank_tile.dart'),
  sheet: read('mobile/lib/screens/shared/public_profile_sheet.dart'),
};
const backend = {
  engine: read('backend/src/games/engine.js'),
  league: read('backend/src/services/leagueService.js'),
};

let checks = 0;
function ok(label, cond) {
  assert.ok(cond, `✗ ${label}`);
  checks += 1;
  console.log(`  ✓ ${label}`);
}

// ── قرارداد رویداد ─────────────────────────────────────────────────────────
console.log('\n== خواندنِ coins از رویدادِ تسویه ==');
ok('سرور coins را در game:settlement می‌فرستد',
  /game:settlement[\s\S]{0,600}coins/.test(backend.engine));
ok('وب coins را از رویداد می‌خواند',
  /d\?\.coins/.test(web.session));
ok('اندروید هم coins را از همان رویداد می‌خواند',
  /m\['coins'\]/.test(android.session));
ok('وب نمادِ برنده را کنارِ سکه نگه می‌دارد',
  /coinsWinner/.test(web.session));
ok('اندروید هم نمادِ برنده را نگه می‌دارد',
  /coinsWinner/.test(android.session));

// ── «صفر یعنی سکوت» ────────────────────────────────────────────────────────
//
// مهم‌ترین بندِ قرارداد. سکه فقط به برندهٔ مسابقهٔ شرط‌دارِ آنلاین مقابل
// انسان می‌رسد و روزانه سقف دارد؛ مساوی، refund، ربات، تمرین و باخت همه
// صفرند. نمایشِ «۰ سکه» به کاربر می‌گوید چیزی خراب است.
console.log('\n== صفر یعنی هیچ نشانی ==');
ok('وب فقط وقتی coins > 0 است state را دست می‌زند',
  /coinsAwarded\s*>\s*0\s*\?/.test(web.session));
ok('اندروید هم فقط وقتی coins > 0 است state را دست می‌زند',
  /coins\s*>\s*0/.test(android.session));
ok('کامپوننتِ وب مقدارِ غیرمثبت را رسم نمی‌کند',
  /if\s*\(!\(n\s*>\s*0\)\)\s*return null/.test(web.award));
ok('ویجتِ اندروید هم مقدارِ غیرمثبت را رسم نمی‌کند',
  /if\s*\(amount\s*<=\s*0\)\s*return const SizedBox\.shrink\(\)/.test(android.award));
ok('صفحهٔ نتیجهٔ اندروید هم قبل از رسم شرط می‌گذارد',
  /session\.coinsAwarded\s*>\s*0/.test(android.scaffold));
ok('صفحهٔ نتیجهٔ دوئلِ اندروید هم شرط می‌گذارد',
  /session\.coinsAwarded\s*>\s*0/.test(android.duel));

// ── هر دو کلاینت نشان را در هر سه صفحه دارند ───────────────────────────────
console.log('\n== حضورِ نشان در هر سه صفحه ==');
ok('وب: صفحهٔ نتیجهٔ بازی‌های عمومی',
  /<CoinAward\s+amount=\{g\.coinsAwarded\}/.test(web.games));
ok('اندروید: صفحهٔ نتیجهٔ بازی‌های عمومی',
  /CoinAward\(\s*amount:\s*session\.coinsAwarded/.test(android.scaffold));
ok('وب: صفحهٔ نتیجهٔ دوئل کارت',
  /<CoinAward\s+amount=\{session\.g\.coinsAwarded\}/.test(web.duel));
ok('اندروید: صفحهٔ نتیجهٔ دوئل کارت',
  /CoinAward\(\s*amount:\s*session\.coinsAwarded/.test(android.duel));
ok('وب: خطِ سهمیهٔ روزانه در انتخاب ورودی',
  /coinQuota/.test(web.games));

// ── برنده و بازنده دو متنِ متفاوت می‌بینند، در هر دو کلاینت ────────────────
console.log('\n== تفکیکِ برنده و بازنده ==');
ok('وب برای بازنده متنِ «به حریف» دارد',
  /سکه به حریف/.test(web.award));
ok('اندروید هم همان متن را دارد',
  /سکه به حریف/.test(android.award));
ok('وب مالکیت را با نمادِ تسویه می‌سنجد نه با winner',
  /coinsWinner === g\.me/.test(web.games)
  && /coinsWinner === resultMine/.test(web.duel));
ok('اندروید هم مالکیت را با نمادِ تسویه می‌سنجد',
  /coinsWinner == session\.mySymbol/.test(android.scaffold)
  && /coinsWinner == me/.test(android.duel));

// ── جدولِ لیگ ──────────────────────────────────────────────────────────────
//
// سرور از دورِ دهم با `coins DESC, points DESC` مرتب می‌کند. اگر کلاینت فقط
// امتیاز را نشان بدهد، ترتیبِ جدول برای کاربر تصادفی به نظر می‌رسد.
console.log('\n== جدولِ لیگ سکه را نشان می‌دهد ==');
ok('سرور با coins DESC مرتب می‌کند',
  /e\.coins DESC,\s*e\.points DESC/.test(backend.league));
ok('وب: پودیوم سکه دارد',
  /CoinChip value=\{row\.coins\}/.test(web.league));
ok('وب: ردیف‌های جدول سکه دارند',
  /CoinChip value=\{r\.coins\}/.test(web.league));
ok('وب: کارتِ «جایگاه شما» سکه دارد',
  /CoinChip value=\{d\.myEntry\.coins\}/.test(web.league));
ok('اندروید: پودیوم سکه دارد',
  /CoinChip\(value:\s*r\['coins'\]/.test(android.league));
ok('اندروید: ردیف‌های جدول سکه دارند',
  /CoinChip\(value:\s*row\['coins'\]/.test(android.tile));
ok('اندروید: کارتِ «جایگاه شما» سکه دارد',
  /CoinChip\(value:\s*myCoins\)/.test(android.league));

// ── مقاومت در برابر دادهٔ ناجور ────────────────────────────────────────────
//
// یک cast-error در یک ردیفِ ListView کلِ صفحهٔ لیگ را سفید می‌کند.
console.log('\n== مقاومتِ جدول در برابر دادهٔ ناجور ==');
ok('اندروید سکه را با پارسِ نرم می‌خواند، نه cast خام',
  /int\.tryParse/.test(android.chip) && !/value as num/.test(android.chip));
ok('وب هم مقدار را با Number() نرم می‌خواند',
  /Number\(value \|\| 0\)/.test(web.chip) && /Number\.isFinite/.test(web.chip));

// ── پروفایلِ عمومی ─────────────────────────────────────────────────────────
//
// رتبه با سکه تعیین می‌شود؛ اگر پروفایل فقط رتبه را نشان بدهد، کاربر آن را
// با مجموعِ امتیازش می‌سنجد و به تناقضِ ظاهری می‌رسد.
console.log('\n== سکه در پروفایلِ عمومی ==');
ok('وب: کارتِ رتبه سکهٔ فصل را هم دارد',
  /<CoinChip value=\{u\.coins\}/.test(web.profile));
ok('اندروید: کارتِ رتبه سکهٔ فصل را هم دارد',
  /titleTrailing: CoinChip\(value: data\['coins'\]/.test(android.sheet));
ok('هر دو کلاینت یک کامپوننتِ مشترکِ چیپ دارند (نه کپیِ درون‌خطی)',
  /import CoinChip from/.test(web.league) && /import CoinChip from/.test(web.profile));

// ── اسِتِ آیکون ────────────────────────────────────────────────────────────
console.log('\n== آیکونِ مشترک ==');
ok('وب کلیدِ coin را در ASSETS دارد',
  /coin:\s*'\/pass\/icon_coin\.png'/.test(web.icons));
for (const p of ['userweb/public/pass/icon_coin.png', 'mobile/assets/pass/icon_coin.png']) {
  ok(`فایلِ ${p} موجود است`, fs.existsSync(path.join(root, p)));
}
ok('هر دو کلاینت دقیقاً یک فایلِ آیکون دارند (بایت‌به‌بایت یکسان)',
  fs.readFileSync(path.join(root, 'userweb/public/pass/icon_coin.png'))
    .equals(fs.readFileSync(path.join(root, 'mobile/assets/pass/icon_coin.png'))));

console.log(`\n✅ ${checks} تست همسانیِ سکه موفق بود\n`);
