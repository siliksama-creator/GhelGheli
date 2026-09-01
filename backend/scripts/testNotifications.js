#!/usr/bin/env node
// تست‌های پوششِ اعلان‌ها.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این تست‌ها ساختاری‌اند و نه رفتاری
// ═══════════════════════════════════════════════════════════════════════════
//
// درخواست مالک چهار رخدادِ مشخص را نام می‌برد:
//
//   «اگر پشتیبانی پیام بده یا برداشت کسی انجام بشه یا از قسمت جوایز
//    فردی به جایزه ای برسه و یا اخر ماه وقتی لیگ تموم میشه فردی جایزه ای
//    ببره، زنگوله نوتیفیکیشن قرمز بشه»
//
// تستِ رفتاریِ این‌ها به یک دیتابیسِ زنده، یک فصلِ لیگ، و چند کاربرِ
// ساختگی نیاز دارد — یعنی در CI و روی ماشینِ توسعه‌دهنده اجرا نمی‌شود
// و دقیقاً جایی که باید رگرسیون را بگیرد ساکت می‌ماند.
//
// چیزی که واقعاً می‌خواهیم تضمین کنیم یک **قرارداد** است: هر کدام از
// این چهار مسیر باید `createNotification` را صدا بزند. اگر فردا کسی
// آن خط را در بازآرایی حذف کند، این تست‌ها قرمز می‌شوند.
//
// دو مورد از این چهار مورد **اصلاً وجود نداشتند** و همین تست‌ها
// پیدایشان کردند:
//   • برندهٔ لیگ: پول واریز می‌شد ولی هیچ خبری نمی‌رفت.
//   • برداشت: مدیر تأیید می‌کرد، پول می‌رفت، کاربر بی‌خبر می‌ماند.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.error(`  ✗ ${name}`); }
};

const read = (...p) =>
  fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

/// کامنت‌ها را حذف می‌کند تا تست به **توضیحات** گیر ندهد.
///
/// کامنت‌های این پروژه عمداً کدِ قدیمی و نقلِ درخواستِ مالک را در خود
/// دارند؛ بدون این پاک‌سازی، هر جست‌وجویی مثبتِ کاذب می‌داد.
const strip = (src) => src
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const serverRaw = [
  read('src', 'server.js'),
  read('src', 'routes', 'adminCommunications.js'),
  read('src', 'routes', 'adminWallet.js'),
  read('src', 'routes', 'adminRewards.js'),
  read('src', 'routes', 'adminLeague.js'),
  read('src', 'services', 'photoCardService.js'),
].join('\n');
const server = strip(serverRaw);
const league = strip(read('src', 'services', 'leagueService.js'));

console.log('\n== ۱. پاسخ پشتیبانی ==');
{
  ok(/support_answer/.test(server), 'اعلانِ پاسخ پشتیبانی وجود دارد');
  ok(/createNotification\([^)]*'support_answer'/.test(server)
     || /'support_answer'/.test(server),
    'با نوعِ support_answer ساخته می‌شود');
}

console.log('\n== ۲. برداشت از کیف پول ==');
{
  // این مسیر کاملاً بی‌صدا بود: مدیر تأیید می‌کرد، پول می‌رفت، و
  // کاربر هیچ خبری نداشت.
  const idx = server.indexOf("router.patch('/admin/wallet/withdrawals/:id'");
  ok(idx > 0, 'endpoint تصمیمِ برداشت پیدا شد');
  const block = server.slice(idx, idx + 3000);

  ok(/createNotification/.test(block),
    'تصمیمِ برداشت اعلان می‌فرستد');
  ok(/'paid'/.test(block), 'حالتِ پرداخت‌شده پوشش دارد');
  ok(/'rejected'/.test(block), 'حالتِ رد‌شده پوشش دارد');
  ok(/'approved'/.test(block), 'حالتِ تأییدشده پوشش دارد');

  // کدِ پیگیری باید در متنِ اعلان باشد، وگرنه کاربر باید جای دیگری
  // دنبالش بگردد.
  ok(/trackingCode/.test(block),
    'کدِ پیگیری در متنِ اعلانِ پرداخت می‌آید');
  ok(/adminNote/.test(block),
    'دلیلِ رد در متنِ اعلان می‌آید');
}

console.log('\n== ۳. رسیدن به جایزهٔ فردی ==');
{
  ok(/reward_threshold/.test(server), 'اعلانِ رسیدن به سطحِ جایزه هست');
  // و تصمیمِ مدیر روی درخواستِ جایزه هم باید خبر بدهد.
  ok(/درخواست جایزه رد شد/.test(serverRaw),
    'ردِ درخواستِ جایزه اعلان دارد');
  ok(/جایزهٔ نقدی به کیف پول اضافه شد/.test(serverRaw),
    'واریزِ جایزهٔ نقدی اعلان دارد');
}

console.log('\n== ۴. برندهٔ لیگ در پایان ماه ==');
{
  // ═══════════════════════════════════════════════════════════════════════
  // این مورد اصلاً وجود نداشت
  // ═══════════════════════════════════════════════════════════════════════
  //
  // بستنِ فصل پول را به کیف پول واریز می‌کرد و همان‌جا تمام می‌شد.
  // کاربر فقط اگر تصادفاً کیف پولش را باز می‌کرد می‌فهمید برنده شده —
  // یعنی بهترین لحظهٔ اپ بی‌صدا رد می‌شد.
  ok(/createNotification/.test(league),
    'سرویسِ لیگ اعلان می‌فرستد');
  ok(/winnersToNotify/.test(league),
    'برندگان برای اعلان جمع می‌شوند');

  // ── ترتیب حیاتی است ──
  //
  // اگر اعلان‌ها **داخل** تراکنش بودند و یکی شکست می‌خورد، کل بستنِ
  // فصل rollback می‌شد — یعنی هیچ‌کس پولش را نمی‌گرفت چون یک ردیفِ
  // اعلان ننشست.
  const commitAt = league.indexOf("client.query('COMMIT')");
  const notifyAt = league.indexOf('for (const w of winnersToNotify)');
  ok(commitAt > 0 && notifyAt > commitAt,
    'اعلان‌ها بعد از COMMIT فرستاده می‌شوند، نه داخلِ تراکنش');

  // شکستِ اعلان نباید بستنِ فصل را بشکند.
  //
  // ⚠️ قبلاً پنجرهٔ ثابتِ ۶۰۰ کاراکتری بریده می‌شد. با اضافه‌شدنِ متنِ
  //    جوایزِ غیرنقدی (دورِ ۲۶) بدنهٔ حلقه بلندتر شد و `.catch` از پنجره
  //    بیرون افتاد — تست قرمز شد بدونِ آنکه چیزی خراب شده باشد. حالا
  //    تا انتهای واقعیِ حلقه خوانده می‌شود.
  const notifyBlock = league.slice(notifyAt, league.indexOf('return {', notifyAt));
  ok(notifyBlock.length > 0 && /\.catch\(/.test(notifyBlock),
    'شکستِ اعلان بلعیده می‌شود — پول از قبل واریز شده');

  // متن باید رتبه و مبلغ را داشته باشد.
  ok(/rank/.test(notifyBlock) && /amount/.test(notifyBlock),
    'متنِ اعلان رتبه و مبلغ را دارد');
}

console.log('\n== ۵. اعلان هدفمند واقعاً به backend وصل است ==');
{
  const notifications = strip(read('src', 'services', 'notificationService.js'));
  ok(/\/admin\/notifications\/send-segmented/.test(server),
    'endpoint اعلان هدفمند روی سرور وجود دارد');
  ok(/sendSegmented/.test(server) && /sendSegmented/.test(notifications),
    'route به سرویس واقعی بخش‌بندی وصل است');
  for (const segment of ['inactive_3d', 'top20_league', 'near_cash_reward',
    'plus_users', 'free_users']) {
    ok(notifications.includes(`case '${segment}'`),
      `کوئری segment ${segment} تعریف شده است`);
  }
  ok(/Asia\/Tehran/.test(server) && /hour >= 10 && hour < 22/.test(server),
    'محافظ ساعت تهران سمت سرور است، نه فقط UI');
  ok(/req\.admin\.role !== 'super_admin'/.test(server),
    'دورزدن شبانه فقط برای super-admin است');
  ok(/firebase-admin\/app/.test(notifications)
      && /firebase-admin\/messaging/.test(notifications)
      && !/admin\.credential\.cert/.test(notifications),
    'Firebase Admin v14 از API ماژولار استفاده می‌کند');
}

console.log('\n== زنگوله شمارنده دارد ==');
{
  const bell = strip(read('..', 'mobile', 'lib', 'widgets',
    'notification_bell.dart'));
  // درخواست مالک: «به تعداد نوتیفیکیشن عدد بیاد مثلا ۱ یا ۲».
  ok(/_unread/.test(bell), 'شمارندهٔ خوانده‌نشده وجود دارد');
  ok(/_unread > 0/.test(bell), 'نشان فقط وقتی چیزی هست نمایش داده می‌شود');
  ok(/faNum\(_unread\)/.test(bell), 'عدد به فارسی نمایش داده می‌شود');
  ok(/is_read/.test(bell), 'خوانده‌نشده‌ها از روی پرچمِ سرور شمرده می‌شوند');
}

console.log('\n== هیچ اعلانی تراکنش را نمی‌شکند ==');
{
  // ═══════════════════════════════════════════════════════════════════════
  // چرا این قانونِ سراسری مهم است
  // ═══════════════════════════════════════════════════════════════════════
  //
  // `createNotification` یک نوشتنِ دیتابیسی است و می‌تواند شکست بخورد.
  // اگر خطایش مدیریت نشود، در بهترین حالت یک استثنای مدیریت‌نشده و در
  // بدترین حالت rollback شدنِ یک عملیاتِ مالی است.
  //
  // قرارداد: هر فراخوانی یا `await` با try دارد، یا `.catch()`.
  const raw = serverRaw;
  const calls = raw.split('createNotification(').length - 1;
  ok(calls >= 10, `${calls} فراخوانیِ اعلان در سرور هست`);

  // فراخوانی‌های بدونِ await باید .catch داشته باشند.
  let unguarded = 0;
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.includes('createNotification(')) continue;
    if (l.trim().startsWith('//')) continue;
    if (l.includes('await ') || l.includes('require(')) continue;
    // پنجرهٔ ۱۲ خطی: فراخوانیِ چندخطی هم پوشش داده شود.
    const window = lines.slice(i, i + 12).join('\n');
    if (!/\.catch\(/.test(window)) unguarded++;
  }
  ok(unguarded === 0,
    `همهٔ اعلان‌های غیرمنتظر catch دارند (${unguarded} مورد بدون محافظ)`);
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} تست موفق، ${fail} ناموفق`);
process.exit(fail === 0 ? 0 : 1);
