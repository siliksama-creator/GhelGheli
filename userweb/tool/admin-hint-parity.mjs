#!/usr/bin/env node
/*
 * گاردِ «راهنمایِ فیلدها» — فاز ۳.۴
 * ════════════════════════════════════════════════════════════════
 * چرا این گارد لازم شد: ۱۱۳ توضیح در پنل وب و ۶۴ `helperText:` در پنل
 * اندروید، در زمان نوشتن «از فایلِ وب خوانده و درج شدند» — یعنی درستی‌شان به
 * حافظهٔ نویسنده گره خورده بود، نه به ابزار. «تطبیقِ لحظهٔ نوشتن» با
 * «تطبیقِ پایداری‌شده» یکی نیست: اگر فردا کسی یک طرف را عوض کند، هیچ‌چیز
 * قرمز نمی‌شد و مدیرِ اندروید با توضیحِ کهنه کار می‌کرد.
 *
 * دو قاعدهٔ سخت + یک گزارشِ بدهی:
 *  ۱) هیچ راهنمایِ اندرویدی نباید «بی‌ریشه» باشد: هر رشتهٔ ثابت باید یا عیناً
 *     یکی از hintهای وب باشد یا زیررشتهٔ یکی از آن‌ها (فرم‌هایِ کوتاهِ موبایل
 *     عمداً خلاصه‌ترند؛ «زیررشته» همان «هم‌محتوا» است). استثنائات صریح‌اند و
 *     سقفِ تعداد دارند — «تخفیفِ خاموش» نداریم.
 *  ۲) هیچ راهنمای وبی نباید «نصفه» حذف شود: اگر در فایلِ اندرویدِ همان صفحه
 *     هیچ `helperText` نیست، یعنی کلِ آن صفحه بی‌مستند شده (خطا)، ولی اگر بعضی
 *     فیلدها راهنما نداشته باشند، به‌عنوانِ «بدهیِ شمرده‌شده» گزارش می‌شود.
 *
 * و مهم‌تر از همه: این متن‌ها عمداً به live_copy نرفته‌اند. راهنمایِ فیلد،
 * مستنداتِ پنل است نه متنِ محصول؛ رفتنش به live_copy یعنی ساختنِ سطحِ
 * ویرایشِ جعلی برای چیزهایی که کاربر هیچ‌وقت نمی‌بیند (قاعدهٔ «ل»).
 */
import fs from 'node:fs';
import path from 'node:path';

// tool/ داخلِ userweb است؛ مخزن دو سطح بالاتر است (نه یکی — اشتباهِ همیشگیِ
// اسکریپت‌هایِ «نسبی از فایلِ خودم»).
const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const WEB_PAGES = path.join(ROOT, 'admin/src/pages');
const MOB_ADMIN = path.join(ROOT, 'mobile/lib/screens/admin');

// نامِ فایلِ دارت با نامِ صفحه یکی نیست (آندرشکور در برابرِ خط‌تیره)؛ فهرستِ
// صریح، بهتر از «حدسِ تبدیلِ کاراکتر» است، چون اگر روزی فایلی جابه‌جا شد باید
// همین‌جا ببینیم، نه اینکه گارد بی‌صدا بی‌کار شود.
const MOB_MAP = {
  'photo-cards': 'photo_cards',
  'game-economy': 'game_economy',
  'game-rewards': 'game_rewards',
  'battle-pass': 'pass',
  'chat-moderation': 'chat',
};

// قاعدهٔ ۱ — استثنایِ *شده*، هرکدام با دلیل.
const ALLOWED_ORPHANS = {
  'admin_engine.dart': 'فرمِ «ورودی‌ها» در وب نکتهٔ جداکردنِ اعداد را داخلِ برچسب آورده؛ جملهٔ اندروید مخصوصِ TextFormField است.',
  'admin_settings.dart': 'در وب همین مطلب داخلِ برچسب آمده («… خالی = لینکِ کافه‌بازار ساخته می‌شود»)؛ برچسبِ اندروید کوتاه‌تر است.',
  'admin_wallet.dart': 'فرمِ مرورِ وب با window.prompt ساخته می‌شود و هیچ Field ندارد؛ تنها جایِ این دو جمله در وب، کامنتِ کنارِ همان prompt است.',
};
const MAX_ORPHAN_FILES = 3;
const MAX_INTERP_HELPERS = 5; // «فعلی: ${…}» در shop (۴ ردیف) + پیش‌نمایشِ live-copy

let ok = 0;
const fail = [];
const info = [];
const check = (cond, msg) => (cond ? ok++ : fail.push(msg));

const read = (p) => fs.readFileSync(p, 'utf8');

/* ── hintهایِ وب، رشته‌به‌رشته + فایلِ مبدأ ── */
const webHints = new Map();
const webPages = {};
for (const file of fs.readdirSync(WEB_PAGES)) {
  if (!file.endsWith('.jsx')) continue;
  const page = file.replace(/\.jsx$/, '');
  const src = read(path.join(WEB_PAGES, file));
  webPages[page] = [];
  for (const m of src.matchAll(/hint="([^"]*)"/g)) {
    webHints.set(m[1], file);
    webPages[page].push(m[1]);
  }
}
check(webHints.size >= 100,
  'تعداد hintهای وب (' + webHints.size + ') از حدِ انتظارِ فاز ۳.۴ کمتر است — چیزی حذف شده؟');

/* ── helperTextهای اندروید ── */
const mobHelpers = {};
for (const file of fs.readdirSync(MOB_ADMIN)) {
  if (!file.endsWith('.dart')) continue;
  const src = read(path.join(MOB_ADMIN, file));
  const fixed = [];
  const interp = [];
  for (const m of src.matchAll(/helperText:\s*'((?:[^'\\]|\\.)*)'/g)) {
    const t = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    (t.includes('${') ? interp : fixed).push(t);
  }
  mobHelpers[file] = { fixed, interp };
}
const allFixed = new Set(Object.values(mobHelpers).flatMap((v) => v.fixed));

/* ── قاعدهٔ ۱ ── */
const orphanFiles = new Set();
for (const [file, { fixed }] of Object.entries(mobHelpers)) {
  for (const t of fixed) {
    if (webHints.has(t) || [...webHints.keys()].some((h) => h.includes(t))) continue;
    orphanFiles.add(file);
    check(Boolean(ALLOWED_ORPHANS[file]),
      'راهنمایِ بی‌ریشه در ' + file + ' («' + t.slice(0, 60) + '…») — یا با وب یکی‌اش کنید یا در ALLOWED_ORPHANS دلیلش را بنویسید');
  }
}
for (const [file, reason] of Object.entries(ALLOWED_ORPHANS)) {
  // استثنایِ بی‌مصرف هم خطاست: یعنی روزی متن یکی شده ولی ردیفش مانده.
  check(orphanFiles.has(file),
    'استثنایِ ' + file + ' در ALLOWED_ORPHANS بی‌مصرف است — راهنمایِ بی‌ریشه‌ای در آن فایل نیست؛ حذفش کنید.');
  check(reason.length > 30, 'استثنایِ ' + file + ' دلیلِ کافی ندارد');
}
check(orphanFiles.size <= MAX_ORPHAN_FILES,
  'تعداد فایل‌هایِ دارایِ راهنمایِ بی‌ریشه (' + orphanFiles.size + ') از سقفِ مستند (' + MAX_ORPHAN_FILES + ') بیشتر شد — «استثنایِ تازه» یعنی «ناهمسانیِ تازه».');

const interpTotal = Object.values(mobHelpers).reduce((s, v) => s + v.interp.length, 0);
check(interpTotal <= MAX_INTERP_HELPERS,
  'تعداد helperTextهایِ داینامیک (' + interpTotal + ') از سقف (' + MAX_INTERP_HELPERS + ') رفت — اینها مقایسه نمی‌شوند، پس نباید بی‌رویه زیاد شوند.');
ok++;

/* ── قاعدهٔ ۲: حذفِ نیمه‌کاردها + بدهیِ شمرده ── */
const noMobileFile = [];
let missingOnMobile = 0;
for (const [page, hints] of Object.entries(webPages)) {
  if (!hints.length) continue;
  const mobFile = 'admin_' + (MOB_MAP[page] || page) + '.dart';
  const mobPath = path.join(MOB_ADMIN, mobFile);
  if (!fs.existsSync(mobPath)) {
    noMobileFile.push(page);
    continue;
  }
  const mob = read(mobPath);
  check(mob.includes('helperText') || /hint:/.test(mob),
    'صفحهٔ ' + page + ' در اندروید هیچ راهنمایی ندارد، ولی وب ' + hints.length + ' تا دارد — حذفِ نیمه‌کارده؟');
  for (const t of hints) {
    if (!mob.includes(t) && ![...allFixed].some((h) => t.includes(h))) missingOnMobile++;
  }
}
if (missingOnMobile) info.push('بدهیِ شناخته‌شده: ' + missingOnMobile + ' توضیحِ وب در اندرویدِ همان صفحه همتایِ هم‌متن ندارد (فیلدهایی که در پنلِ اندروید یا برچسبشان فرق دارد یا نبودن‌شان عمدی است).');

/* ── قاعدهٔ ۳ (بازگشتی): راهنماها نباید به live_copy رفته باشند ── */
const live = read(path.join(ROOT, 'backend/src/services/liveContent.js'));
for (const t of webHints.keys()) {
  check(!live.includes(t.slice(0, 24)),
    'یک «راهنمایِ پنل» به liveContent.js راه یافته («' + t.slice(0, 24) + '…») — راهنما متنِ محصول نیست.');
}

/* ── گزارشِ شمارش‌ها (نه صرفاً ✅/❌؛ همان درسی که از گاردِ کهنه گرفتیم) ── */
console.log('  hint وب: ' + webHints.size + ' رشته در ' +
  Object.keys(webPages).filter((p) => webPages[p].length).length + ' صفحه');
console.log('  helperText اندروید: ثابت ' + allFixed.size + ' + داینامیک ' + interpTotal);
console.log('  فایل‌هایِ دارایِ استثنایِ مستند: ' + orphanFiles.size + ' (سقف ' + MAX_ORPHAN_FILES + ')' +
  (noMobileFile.length ? ' · صفحاتِ بی‌فایلِ اندروید: ' + noMobileFile.join(', ') : ''));
for (const m of info) console.log('  ' + m);

if (fail.length) {
  console.error('\n❌ ' + fail.length + ' ناهمسانیِ راهنما:');
  for (const m of [...new Set(fail)].filter(Boolean)) console.error('   • ' + m);
  process.exit(1);
}
console.log('\n✅ ' + ok + ' بررسیِ همسانیِ «راهنمایِ فیلدها» (هر دو پنل) موفق بود');
