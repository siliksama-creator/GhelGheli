/**
 * تست‌های قفلِ ۳ ساعته پس از ۵ کدِ غلط.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا با pool ساختگی و نه دیتابیس واقعی
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * منطقِ این ماژول دربارهٔ **زمان** است: «۳ ساعت بعد قفل باز می‌شود».
 * با دیتابیس واقعی یا باید ۳ ساعت صبر کنیم یا ساعت سیستم را دست‌کاری
 * کنیم — هر دو غیرقابل‌قبول در یک تستِ خودکار.
 *
 * pool ساختگی اجازه می‌دهد `now` را پارامتری بدهیم و گذشتِ زمان را
 * شبیه‌سازی کنیم. رفتارِ SQL هم عمداً همان‌جا بازسازی شده تا اگر کوئری
 * عوض شد و با این مدل نخواند، تست بشکند.
 */
const assert = require('assert');
const lockout = require('../src/services/photoCardLockout');

let pass = 0;
let fail = 0;
const failures = [];

async function t(name, fn) {
  try {
    await fn();
    pass++;
  } catch (e) {
    fail++;
    failures.push(`✗ ${name}: ${e.message}`);
  }
}

/**
 * pool ساختگی که رفتارِ همان دو کوئریِ واقعی را تقلید می‌کند.
 *
 * منطقِ `ON CONFLICT DO UPDATE ... CASE` عیناً بازسازی شده، از جمله
 * شرطِ «اگر قفلِ قبلی منقضی شده، از ۱ شروع کن».
 */
function fakePool() {
  const rows = new Map();
  return {
    rows,
    async query(sql, params) {
      const s = sql.replace(/\s+/g, ' ').trim();

      if (s.startsWith('SELECT fail_streak, locked_until')) {
        const r = rows.get(params[0]);
        return { rows: r ? [{ ...r }] : [] };
      }

      if (s.startsWith('INSERT INTO photo_card_attempts')) {
        const [uid, now] = params;
        const cur = rows.get(uid);
        let streak;
        if (!cur) {
          streak = 1;
        } else if (cur.locked_until && cur.locked_until.getTime() <= now.getTime()) {
          // قفلِ منقضی‌شده: شمارنده ریست می‌شود.
          streak = 1;
        } else {
          streak = cur.fail_streak + 1;
        }
        rows.set(uid, {
          fail_streak: streak,
          locked_until: cur && !(cur.locked_until
            && cur.locked_until.getTime() <= now.getTime())
            ? cur.locked_until : null,
          last_fail_at: now,
        });
        return { rows: [{ fail_streak: streak }] };
      }

      if (s.startsWith('UPDATE photo_card_attempts SET locked_until')) {
        const [uid, until] = params;
        const cur = rows.get(uid) || { fail_streak: 0 };
        rows.set(uid, { ...cur, locked_until: until });
        return { rows: [] };
      }

      if (s.startsWith('UPDATE photo_card_attempts SET fail_streak=0')) {
        const [uid] = params;
        const cur = rows.get(uid);
        if (cur) rows.set(uid, { ...cur, fail_streak: 0, locked_until: null });
        return { rows: [] };
      }

      throw new Error('کوئری پیش‌بینی‌نشده: ' + s.slice(0, 70));
    },
  };
}

const U = 'user-1';

(async () => {
  // ── شمارش ──
  await t('اولین خطا قفل نمی‌کند', async () => {
    const p = fakePool();
    const r = await lockout.registerFailure(p, U);
    assert.strictEqual(r.locked, false);
    assert.strictEqual(r.triesLeft, 4);
  });

  await t('چهار خطا هنوز قفل نمی‌کند', async () => {
    const p = fakePool();
    let r;
    for (let i = 0; i < 4; i++) r = await lockout.registerFailure(p, U);
    assert.strictEqual(r.locked, false, 'در خطای چهارم نباید قفل شود');
    assert.strictEqual(r.triesLeft, 1);
  });

  await t('خطای پنجم قفل می‌کند', async () => {
    const p = fakePool();
    let r;
    for (let i = 0; i < 5; i++) r = await lockout.registerFailure(p, U);
    assert.strictEqual(r.locked, true, 'خطای پنجم باید قفل کند');
    assert.strictEqual(r.remainingMs, lockout.LOCK_MS);
  });

  await t('مدت قفل دقیقاً ۳ ساعت است', async () => {
    // خواستهٔ صریح مالک. اگر کسی این عدد را عوض کرد، تست بگیردش.
    assert.strictEqual(lockout.LOCK_MS, 3 * 60 * 60 * 1000);
    assert.strictEqual(lockout.maxFails(), 5);
  });

  // ── وضعیت ──
  await t('کاربرِ تازه قفل نیست', async () => {
    const p = fakePool();
    const st = await lockout.getState(p, U);
    assert.strictEqual(st.locked, false);
    assert.strictEqual(st.triesLeft, 5);
  });

  await t('بعد از قفل، getState قفل بودن را گزارش می‌کند', async () => {
    const p = fakePool();
    for (let i = 0; i < 5; i++) await lockout.registerFailure(p, U);
    const st = await lockout.getState(p, U);
    assert.strictEqual(st.locked, true);
    assert.ok(st.remainingMs > 0);
    assert.strictEqual(st.triesLeft, 0);
  });

  // ── گذشتِ زمان ──
  await t('بعد از ۳ ساعت قفل باز می‌شود', async () => {
    const p = fakePool();
    const t0 = new Date('2026-01-01T10:00:00Z');
    for (let i = 0; i < 5; i++) await lockout.registerFailure(p, U, t0);

    const during = await lockout.getState(p, U,
      new Date(t0.getTime() + 2 * 60 * 60 * 1000));
    assert.strictEqual(during.locked, true, 'بعد از ۲ ساعت هنوز باید قفل باشد');

    const after = await lockout.getState(p, U,
      new Date(t0.getTime() + 3 * 60 * 60 * 1000 + 1000));
    assert.strictEqual(after.locked, false, 'بعد از ۳ ساعت باید باز شود');
  });

  await t('بعد از انقضای قفل، شمارنده از یک شروع می‌شود', async () => {
    // ── مهم‌ترین تستِ این فایل ──
    // بدون ریست، کاربری که سه ساعت صبر کرده با **یک** خطای دیگر
    // بلافاصله دوباره سه ساعت قفل می‌شد. یعنی عملاً برای همیشه قفل.
    const p = fakePool();
    const t0 = new Date('2026-01-01T10:00:00Z');
    for (let i = 0; i < 5; i++) await lockout.registerFailure(p, U, t0);

    const later = new Date(t0.getTime() + 3 * 60 * 60 * 1000 + 60000);
    const r = await lockout.registerFailure(p, U, later);
    assert.strictEqual(r.locked, false, 'نباید بلافاصله دوباره قفل شود');
    assert.strictEqual(r.failStreak, 1, 'شمارنده باید از ۱ شروع شود');
    assert.strictEqual(r.triesLeft, 4);
  });

  // ── پاک کردن ──
  await t('ثبت موفق شمارنده را صفر می‌کند', async () => {
    const p = fakePool();
    for (let i = 0; i < 3; i++) await lockout.registerFailure(p, U);
    await lockout.clearFailures(p, U);
    const st = await lockout.getState(p, U);
    assert.strictEqual(st.failStreak, 0);
    assert.strictEqual(st.triesLeft, 5);
  });

  await t('ثبت موفق قفلِ فعال را هم باز می‌کند', async () => {
    // اگر کاربر قفل بود ولی به‌هرطریق کدِ درست ثبت کرد (مثلاً مدیر
    // دستی آزادش کرد)، نباید بقایای قفل بماند.
    const p = fakePool();
    for (let i = 0; i < 5; i++) await lockout.registerFailure(p, U);
    await lockout.clearFailures(p, U);
    const st = await lockout.getState(p, U);
    assert.strictEqual(st.locked, false);
  });

  await t('پاک کردنِ کاربرِ بدون سابقه کرش نمی‌کند', async () => {
    const p = fakePool();
    await lockout.clearFailures(p, 'ghost');
  });

  // ── جدا بودنِ کاربران ──
  await t('قفلِ یک کاربر روی دیگری اثر ندارد', async () => {
    const p = fakePool();
    for (let i = 0; i < 5; i++) await lockout.registerFailure(p, 'a');
    const other = await lockout.getState(p, 'b');
    assert.strictEqual(other.locked, false);
    assert.strictEqual(other.triesLeft, 5);
  });

  // ── متنِ زمان ──
  await t('متنِ باقی‌مانده خوانا است', async () => {
    assert.strictEqual(lockout.humanRemaining(3 * 3600 * 1000), '3 ساعت');
    assert.strictEqual(
      lockout.humanRemaining(2 * 3600 * 1000 + 15 * 60 * 1000),
      '2 ساعت و 15 دقیقه');
    assert.strictEqual(lockout.humanRemaining(5 * 60 * 1000), '5 دقیقه');
  });

  await t('زمانِ صفر یا منفی کرش نمی‌کند', async () => {
    assert.strictEqual(typeof lockout.humanRemaining(0), 'string');
    assert.strictEqual(typeof lockout.humanRemaining(-5000), 'string');
  });

  await t('ثانیه‌های باقی‌مانده به بالا گرد می‌شوند', async () => {
    // ۳۰ ثانیه نباید «۰ دقیقه» شود — کاربر فکر می‌کند قفل باز است.
    assert.strictEqual(lockout.humanRemaining(30 * 1000), '1 دقیقه');
  });

  for (const f of failures) console.log(f);
  console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} تست موفق، ${fail} ناموفق`);
  process.exit(fail === 0 ? 0 : 1);
})();
