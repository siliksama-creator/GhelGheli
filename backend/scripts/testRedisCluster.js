// ============================================================================
//  تست آمادگی خوشه‌ای
// ============================================================================
//
//   node scripts/testRedisCluster.js
//
// این تست دو حالت دارد و هر دو مهم‌اند:
//
//   · بدون REDIS_URL  → باید ثابت کند که هیچ‌چیز خراب نشده و رفتار
//                        مو‌به‌مو همان تک‌پروسهٔ قبلی است. این حالت همیشه
//                        در CI اجرا می‌شود.
//   · با REDIS_URL    → رفتار واقعی چندپروسه‌ای را می‌سنجد: دو «پروسهٔ»
//                        شبیه‌سازی‌شده که دفترچهٔ حضور مشترک دارند.
//
// اگر ردیس در دسترس نباشد، بخش دوم با پیام روشن رد می‌شود — نه شکست
// دروغین در CI و نه سکوتی که وانمود کند تست شده است.

const assert = require('assert');

let pass = 0;
function ok(name) { pass += 1; console.log(`  ✔ ${name}`); }

async function testFallback() {
  console.log('\n── بدون REDIS_URL: باید دقیقاً مثل قبل کار کند ──');
  delete process.env.REDIS_URL;
  // پاک کردن کش تا ماژول با محیط تازه ارزیابی شود
  for (const k of Object.keys(require.cache)) {
    if (k.includes('/lib/redis') || k.includes('/lib/presenceStore')
        || k.includes('/lib/socketCluster')) delete require.cache[k];
  }

  const { redisEnabled } = require('../src/lib/redis');
  assert.strictEqual(redisEnabled(), false, 'بدون URL نباید فعال باشد');
  ok('redisEnabled() برابر false است');

  const { createPresenceStore } = require('../src/lib/presenceStore');
  const store = createPresenceStore();
  assert.strictEqual(store.shared, false);
  ok('store در حالت محلی است');

  const a = await store.add('u1', 's1');
  assert.strictEqual(a.first, true, 'اولین سوکت باید first باشد');
  const b = await store.add('u1', 's2');
  assert.strictEqual(b.first, false, 'سوکت دوم نباید first باشد');
  ok('تشخیص «اولین اتصال» درست است');

  assert.strictEqual(await store.isOnline('u1'), true);
  assert.strictEqual(await store.isOnline('ghost'), false);
  ok('isOnline درست جواب می‌دهد');

  const r1 = await store.remove('u1', 's1');
  assert.strictEqual(r1.last, false, 'هنوز یک سوکت مانده');
  const r2 = await store.remove('u1', 's2');
  assert.strictEqual(r2.last, true, 'حالا آخرین بود');
  ok('تشخیص «آخرین قطع اتصال» درست است');

  assert.strictEqual(await store.isOnline('u1'), false);
  assert.strictEqual(await store.onlineCount(), 0);
  ok('پس از قطع همه، شمارنده صفر است');

  const { attachRedisAdapter } = require('../src/lib/socketCluster');
  const fakeIo = { adapter: () => { throw new Error('نباید صدا زده شود'); } };
  assert.strictEqual(await attachRedisAdapter(fakeIo), false);
  ok('آداپتور بدون REDIS_URL بی‌صدا کنار می‌کشد');
}

async function testWithRedis(url) {
  console.log(`\n── با REDIS_URL: رفتار واقعی چندپروسه‌ای (${url}) ──`);
  process.env.REDIS_URL = url;
  for (const k of Object.keys(require.cache)) {
    if (k.includes('/lib/redis') || k.includes('/lib/presenceStore')) {
      delete require.cache[k];
    }
  }
  const { createPresenceStore } = require('../src/lib/presenceStore');

  // دو نمونهٔ مستقل = شبیه‌سازی دو پروسهٔ pm2
  const p1 = createPresenceStore();
  const p2 = createPresenceStore();
  assert.strictEqual(p1.shared, true, 'باید حالت مشترک باشد');
  ok('هر دو «پروسه» به ردیس وصل‌اند');

  const U = `test-${Date.now()}`;
  await p1.add(U, 'sock-A');

  // ⭐ قلب ماجرا: پروسهٔ ۲ باید کاربرِ متصل به پروسهٔ ۱ را آنلاین ببیند.
  assert.strictEqual(await p2.isOnline(U), true,
    'پروسهٔ دوم باید کاربر پروسهٔ اول را آنلاین ببیند');
  ok('حضور بین پروسه‌ها دیده می‌شود ← دعوت دوست دیگر «آفلاین است» نمی‌گوید');

  // کاربر از دستگاه دوم به پروسهٔ دیگری وصل می‌شود
  const second = await p2.add(U, 'sock-B');
  assert.strictEqual(second.first, false,
    'اتصال دوم نباید «اولین» شمرده شود، وگرنه دو بار رویداد آنلاین پخش می‌شود');
  ok('رویداد تکراری «آنلاین شد» پخش نمی‌شود');

  // قطع یکی نباید کاربر را آفلاین اعلام کند
  const d1 = await p1.remove(U, 'sock-A');
  assert.strictEqual(d1.last, false,
    'هنوز از پروسهٔ دیگر وصل است — نباید آفلاین اعلام شود');
  assert.strictEqual(await p1.isOnline(U), true);
  ok('قطع یک دستگاه، کاربر را آفلاین نمی‌کند');

  const d2 = await p2.remove(U, 'sock-B');
  assert.strictEqual(d2.last, true, 'حالا واقعاً آخرین بود');
  assert.strictEqual(await p2.isOnline(U), false);
  ok('پس از قطع آخرین دستگاه، آفلاین می‌شود');

  // نشتی: کلید باید پاک شده باشد
  const { makeClient } = require('../src/lib/redis');
  const probe = makeClient('probe');
  assert.strictEqual(await probe.exists(`presence:${U}`), 0,
    'کلید باید پس از خروج پاک شود، وگرنه ردیس به‌مرور پر می‌شود');
  ok('کلید ردیس نشت نمی‌کند');

  // TTL باید ست شده باشد تا مرگ ناگهانی پروسه کاربر را ابدی-آنلاین نکند
  await p1.add(U, 'sock-C');
  const ttl = await probe.ttl(`presence:${U}`);
  assert.ok(ttl > 0 && ttl <= 120, `TTL باید بین ۱ تا ۱۲۰ باشد، بود: ${ttl}`);
  ok(`TTL روی کلید ست شده است (${ttl}s) ← پروسهٔ kill شده کاربر یتیم نمی‌گذارد`);
  await p1.remove(U, 'sock-C');

  await probe.quit();
  await p1.drain();
  await p2.drain();
}

(async () => {
  console.log('=== تست آمادگی خوشه‌ای ===');
  const url = process.env.TEST_REDIS_URL || '';
  await testFallback();

  if (!url) {
    console.log('\n⏭  بخش ردیس رد شد: TEST_REDIS_URL تنظیم نشده.');
    console.log('   برای اجرای کامل:  TEST_REDIS_URL=redis://127.0.0.1:6379 node scripts/testRedisCluster.js');
  } else {
    await testWithRedis(url);
  }

  console.log(`\n✅ ${pass} بررسی موفق\n`);
  process.exit(0);
})().catch(e => {
  console.error('\n❌ شکست:', e.message);
  process.exit(1);
});
