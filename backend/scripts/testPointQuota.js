// ═══════════════════════════════════════════════════════════════════════════
// گاردِ «سقفِ روزانهٔ امتیازِ کسب‌شده از بازی‌های شرطی»
// ═══════════════════════════════════════════════════════════════════════════
//
// خواستهٔ مالک (۴ مهر ۱۴۰۵): هر بازیکن روزانه حداکثر ۲۰۰۰ امتیاز از
// بازیِ آنلاین کسب می‌کند؛ بعد از آن برد سکه می‌دهد ولی امتیاز نه؛ باخت
// از شمارنده کم می‌کند و جا باز می‌کند؛ سقف هر کس مالِ خودش است.
//
// این گارد همان حفره‌ای را می‌بندد که اقتصاد را بلندمدت می‌شکند: جابه‌جاییِ
// امتیاز بین دو بازیکن هیچ سقفی نداشت و یک بازیکنِ ماهر می‌توانست بی‌نهایت
// امتیاز جمع کند و دیگر نیازی به ماموریت/صندوق نداشته باشد.
//
// چهار خطرِ واقعی که اینجا بسته می‌شوند:
//   ۱. واریزِ سودِ بیش از سقف (چاپِ امتیاز برای فارم‌کننده‌ها)
//   ۲. گیرنکردنِ اصلِ ورودیِ برنده پشتِ سقف (بُرد مساویِ باخت می‌شد)
//   ۳. فضاسازیِ باختِ عمدی (شمارنده زیرِ صفر نمی‌رود)
//   ۴. حذف‌شدنِ اتصال‌ها در رفرکتور (تسویه/موتور/بوت‌استرپ/کرون)
//
// بدونِ دیتابیسِ واقعی: `client` جعلی، مثلِ بقیهٔ گاردهای این پوشه.

const assert = require('assert');

let pass = 0;
let fail = 0;
function ok(cond, label, detail = '') {
  if (cond) { pass += 1; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`); } else { fail += 1; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

// ── pool جعلی که قبل از require تزریق می‌شود ─────────────────────────────
const log = [];
// رفتار ردیفِ سهمیه را تست‌ها پیش از هر فراخوانی تنظیم می‌کنند:
//   null = ردیفی برای امروز نیست؛ عدد = ردیف با همین مقدارِ earned.
let quotaRow = null;

const fakeClient = {
  async query(sql, params) {
    log.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
    if (/SELECT earned FROM user_point_quota/.test(sql)) {
      return { rows: quotaRow === null ? [] : [{ earned: quotaRow }] };
    }
    return { rowCount: 1, rows: [] };
  },
  release() {},
};

require.cache[require.resolve('../src/config/db')] = {
  id: require.resolve('../src/config/db'),
  filename: require.resolve('../src/config/db'),
  loaded: true,
  exports: { pool: { query: async () => ({ rows: [] }) } },
};
require.cache[require.resolve('../src/lib/cache')] = {
  id: require.resolve('../src/lib/cache'),
  filename: require.resolve('../src/lib/cache'),
  loaded: true,
  exports: {
    cacheDelPrefix: async () => {}, cacheGet: async () => null,
    cacheSet: async () => {}, cacheDel: async () => {},
  },
};

const economy = require('../src/services/gameEconomyService');
const quota = require('../src/services/pointQuotaService');

(async () => {
  console.log('\n══ ۱. منطقِ خالصِ کسب (computeEarn) ══');
  {
    const r1 = quota.computeEarn(0, 80, 2000);
    ok(r1.granted === 80 && r1.earnedAfter === 80 && r1.capped === false,
      'زیرِ سقف: کلِ سود واریز می‌شود', JSON.stringify(r1));

    const r2 = quota.computeEarn(1950, 80, 2000);
    ok(r2.granted === 50 && r2.earnedAfter === 2000 && r2.capped === true,
      'سودِ بزرگ‌تر از جای مانده: ناقص واریز می‌شود (۵۰ از ۸۰)', JSON.stringify(r2));

    const r3 = quota.computeEarn(2000, 80, 2000);
    ok(r3.granted === 0 && r3.earnedAfter === 2000 && r3.capped === true,
      'سقفِ پُر: سود صفر است ولی «بُرد» باقی است', JSON.stringify(r3));

    const r4 = quota.computeEarn(0, 80, 0);
    ok(r4.granted === 80 && r4.capped === false,
      'سقفِ صفر یعنی بی‌سقف (قراردادِ همیشگیِ پنل)', JSON.stringify(r4));

    const r5 = quota.computeEarn(100, 0, 2000);
    ok(r5.granted === 0 && r5.earnedAfter === 100 && r5.capped === false,
      'سودِ صفر (تساویِ پات با ورودی) شمارنده را تکان نمی‌دهد', JSON.stringify(r5));

    const r6 = quota.computeEarn(-5, 80.9, 2000);
    ok(r6.granted === 80 && r6.earnedAfter === 80,
      'کفِ صفر برای ورودی‌های خراب + کف‌کردنِ اعشار', JSON.stringify(r6));
  }

  console.log('\n══ ۲. منطقِ خالصِ باخت (computeRelease) ══');
  {
    ok(quota.computeRelease(500, 100) === 400, 'باخت جا باز می‌کند (۵۰۰ ← ۴۰۰)');
    ok(quota.computeRelease(60, 100) === 0, 'زیرِ صفر نمی‌رود (۶۰ - ۱۰۰ = ۰، نه ۴۰-)');
    ok(quota.computeRelease(0, 1000) === 0, 'باختِ عمدی فضایی بیش از سقف نمی‌سازد');
    ok(quota.computeRelease(undefined, 100) === 0, 'ورودیِ خراب = صفر، نه NaN');
  }

  console.log('\n══ ۳. تنظیمِ اقتصاد: پیش‌فرض و محدوده ══');
  {
    ok(economy.DEFAULTS.dailyPointQuota === 2000,
      'پیش‌فرض همان ۲۰۰۰ امتیازِ خواستهٔ مالک است');
    economy.setCachedForTest(economy.merge({}));
    ok((await economy.load()).dailyPointQuota === 2000,
      'بدونِ تنظیمِ ادمین هم پیش‌فرض ۲۰۰۰ خوانده می‌شود');
    const v = economy.merge({ dailyPointQuota: -50 });
    ok(v.dailyPointQuota === 0, 'منفی به صفر (= بی‌سقف) می‌چسبد');
    const v2 = economy.merge({ dailyPointQuota: 99_999_999 });
    ok(v2.dailyPointQuota === 1_000_000, 'یک میلیون سقفِ بالا است');
    const pub = economy.publicView ? await economy.publicView() : null;
    ok(pub && pub.dailyPointQuota === 2000,
      'publicView (بوت‌استرپ و /api/config) عدد را به کلاینت می‌فرستد');
  }

  console.log('\n══ ۴. مسیرِ دیتابیسِ earn ══');
  {
    economy.setCachedForTest(economy.merge({ dailyPointQuota: 2000 }));

    log.length = 0; quotaRow = null;
    let r = await quota.earn(fakeClient, 'u1', 80);
    ok(r.granted === 80 && r.remainingAfter === 1920,
      'روزِ تازه: ردیف ساخته می‌شود و ۸۰ کسب می‌شود', JSON.stringify(r));
    ok(log.some(l => /INSERT INTO user_point_quota/.test(l.sql)),
      'ردیفِ نبود → INSERT');

    log.length = 0; quotaRow = 1950;
    r = await quota.earn(fakeClient, 'u1', 80);
    ok(r.granted === 50 && r.capped === true && r.remainingAfter === 0,
      'نزدیکِ سقف: فقط جای مانده (۵۰) واریز می‌شود', JSON.stringify(r));
    ok(log.some(l => /UPDATE user_point_quota/.test(l.sql)
      && /earned=\$3/.test(l.sql)),
      'ردیفِ بود → UPDATE با مقدارِ تازه');

    log.length = 0; quotaRow = 2000;
    r = await quota.earn(fakeClient, 'u1', 80);
    ok(r.granted === 0 && r.capped === true,
      'سقفِ پُر: هیچ امتیازی کسب نمی‌شود (بازی ولی ادامه دارد)');

    log.length = 0; quotaRow = null;
    economy.setCachedForTest(economy.merge({ dailyPointQuota: 0 }));
    r = await quota.earn(fakeClient, 'u1', 5000);
    ok(r.granted === 5000 && r.capped === false && log.length === 0,
      'بی‌سقف: بدونِ لمسِ جدول، همهٔ سود می‌رسد');
  }

  console.log('\n══ ۵. مسیرِ دیتابیسِ release ══');
  {
    economy.setCachedForTest(economy.merge({ dailyPointQuota: 2000 }));

    log.length = 0;
    await quota.release(fakeClient, 'u1', 100);
    ok(log.length === 1 && /GREATEST\(earned - \$3, 0\)/.test(log[0].sql),
      'باخت با GREATEST در خودِ SQL کم می‌شود (همزمانی‌امن)');

    log.length = 0;
    await quota.release(fakeClient, 'u1', 0);
    ok(log.length === 0, 'باختِ صفر کوئری نمی‌زند');

    log.length = 0;
    economy.setCachedForTest(economy.merge({ dailyPointQuota: 0 }));
    await quota.release(fakeClient, 'u1', 100);
    ok(log.length === 0, 'بی‌سقف: چیزی برای کم‌کردن نیست');
  }

  console.log('\n══ ۶. اتصال‌ها — حذف نشوند ══');
  {
    // ⚠️ این‌ها گاردهای متنی‌اند: همان دامی که «گاردِ ساکت» می‌نامیم —
    // اگر روزی رفرکتوری این اتصالات را بردارد، باید اینجا قرمز شود.
    const fs = require('fs');
    const path = require('path');
    const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

    const stake = read('src/services/gameStakeService.js');
    ok(/pointQuota\.earn\(client, winnerUserId, profit\)/.test(stake),
      'تسویه: سودِ برنده از نقطه‌سهمیه رد می‌شود');
    ok(/pointQuota\.release\(client, loserUserId, stake\)/.test(stake),
      'تسویه: باختِ بازنده جا باز می‌کند');
    ok(/lifetimeGain: earnRes\.granted/.test(stake),
      'تاریخچه فقط سودِ **واقعی** را می‌گیرد، نه پات را');
    ok(/payoutAmount = stake \+ earnRes\.granted/.test(stake),
      'اصلِ ورودیِ برنده هرگز پشتِ سقف نمی‌ماند');
    ok((stake.match(/pointQuota\.release\(client, userId, fee\)/g) || []).length === 1,
      'تساوی به‌اندازهٔ کمسیونِ هر طرف جا باز می‌کند');

    const engine = read('src/games/engine.js');
    ok(/payoutPoints/.test(engine) && /pointCapped/.test(engine),
      'موتور مبلغِ واقعی و پرچمِ سقف را به هر دو سوکت می‌فرستد');

    const profile = read('src/routes/profile.js');
    ok(/pointQuota\.getQuota\(req\.user\.id\)/.test(profile),
      'بوت‌استرپ سهمیهٔ امتیاز را کنارِ سهمیهٔ سکه می‌فرستد');

    const cron = read('src/cron.js');
    ok(/pointQuotaService'\)\.pruneQuota\(7\)/.test(cron),
      'کرون ردیف‌های کهنهٔ سهمیه را پاک می‌کند');

    const mig = fs.readFileSync(
      path.join(__dirname, '..', 'migrations', '102_point_earn_quota.sql'), 'utf8');
    ok(/CREATE TABLE IF NOT EXISTS user_point_quota/.test(mig)
      && /CHECK \(earned >= 0\)/.test(mig),
      'مایگریشن ۱۰۲ جدول را با کفِ صفر می‌سازد');

    const reset = read('../tools/reset_for_launch.py');
    ok(/DELETE FROM user_point_quota;/.test(reset),
      'پاک‌سازیِ روزِ انتشار جدولِ تازه را می‌شناسد');
  }

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} سنجه، ${fail} شکست`);
  assert.ok(fail === 0, 'pointQuota guard failed');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
