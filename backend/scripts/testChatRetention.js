// ============================================================================
//  تستِ نگه‌داریِ ۲۰۰ پیامِ آخرِ چت
// ============================================================================
//
// این تست **بدونِ دیتابیس** اجرا می‌شود: یک کلاینتِ pg قلابی می‌سازد که
// کوئری‌ها را ثبت می‌کند. چرا؟ چون `npm test` باید روی هر ماشینی (و در
// CI) بدونِ Postgres سبز شود، و منطقی که اینجا مهم است — «کِی پاک‌سازی
// اجرا شود» و «کوئری چه شکلی باشد» — به دادهٔ واقعی نیاز ندارد.
//
// درستیِ خودِ DELETE جداگانه و روی دیتابیسِ واقعی تأیید شد.

const assert = require('assert');
const path = require('path');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

// ---------------------------------------------------------------------------
// کلاینتِ قلابی
// ---------------------------------------------------------------------------
function fakeClient({ rowCount = 0, throws = null } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (throws) throw new Error(throws);
      return { rowCount, rows: [] };
    },
  };
}

async function main() {
  console.log('نگه‌داریِ چت:');

  // چون سرویس ماژولِ db را require می‌کند و آن به Postgres وصل می‌شود،
  // مسیرش را با یک ماژولِ خالی جایگزین می‌کنیم تا تست آفلاین بماند.
  const dbPath = require.resolve(path.join(__dirname, '..', 'src', 'config', 'db.js'));
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { pool: fakeClient() },
  };

  const svcPath = path.join(__dirname, '..', 'src', 'services', 'chatRetentionService.js');
  delete require.cache[require.resolve(svcPath)];
  const svc = require(svcPath);

  // ── ۱. ثابت‌ها همان چیزی‌اند که مالک خواست ──
  check('سقف روی ۲۰۰ پیام تنظیم است', () => {
    assert.strictEqual(svc.CHAT_KEEP_LIMIT, 200);
  });

  check('فاصلهٔ پاک‌سازی عددی مثبت و معقول است', () => {
    assert.ok(Number.isInteger(svc.PRUNE_EVERY));
    assert.ok(svc.PRUNE_EVERY >= 1 && svc.PRUNE_EVERY <= 100,
      `PRUNE_EVERY=${svc.PRUNE_EVERY} خارج از بازهٔ معقول است`);
  });

  // ── ۲. شکلِ کوئریِ حذف ──
  {
    const c = fakeClient({ rowCount: 7 });
    const n = await svc.pruneChatHistory(c);
    assert.strictEqual(n, 7, 'تعداد حذف‌شده باید برگردد');
    assert.strictEqual(c.calls.length, 1, 'باید فقط یک کوئری بزند');
    const { sql, params } = c.calls[0];
    assert.ok(/DELETE\s+FROM\s+chat_messages/i.test(sql), 'باید DELETE باشد');
    assert.ok(/ORDER BY\s+sent_at\s+DESC/i.test(sql), 'باید بر اساس زمان مرتب کند');
    assert.ok(/OFFSET\s+\$1/i.test(sql), 'باید از OFFSET پارامتری استفاده کند');
    assert.deepStrictEqual(params, [200], 'پارامتر باید ۲۰۰ باشد');
    passed += 1;
    console.log('  ✓ کوئریِ حذف پارامتری و درست است');
  }

  // مرتب‌سازیِ قطعی: بدونِ tie-breaker، دو پیام با `sent_at` یکسان
  // می‌توانند هر بار جای‌به‌جا شوند و OFFSET نتیجهٔ ناپایدار بدهد.
  {
    const c = fakeClient();
    await svc.pruneChatHistory(c);
    assert.ok(/ORDER BY\s+sent_at\s+DESC\s*,\s*id\s+DESC/i.test(c.calls[0].sql),
      'مرتب‌سازی باید با id هم شکسته شود تا قطعی باشد');
    passed += 1;
    console.log('  ✓ مرتب‌سازی قطعی است (tie-breaker روی id)');
  }

  // ── ۳. منطقِ «کِی پاک کن» ──
  {
    svc._resetCounter();
    const c = fakeClient();
    // تا یکی مانده به آستانه، نباید هیچ کوئری‌ای بزند.
    for (let i = 0; i < svc.PRUNE_EVERY - 1; i += 1) {
      const n = await svc.onMessageInserted(c);
      assert.strictEqual(n, 0, `درجِ ${i + 1} نباید پاک‌سازی کند`);
    }
    assert.strictEqual(c.calls.length, 0,
      'قبل از رسیدن به آستانه نباید هیچ کوئری‌ای زده شود');
    passed += 1;
    console.log(`  ✓ تا ${svc.PRUNE_EVERY - 1} پیام هیچ کوئریِ اضافه‌ای نمی‌زند`);
  }

  {
    svc._resetCounter();
    const c = fakeClient({ rowCount: 3 });
    for (let i = 0; i < svc.PRUNE_EVERY; i += 1) await svc.onMessageInserted(c);
    assert.strictEqual(c.calls.length, 1,
      'دقیقاً در پیامِ آستانه باید یک‌بار پاک‌سازی شود');
    passed += 1;
    console.log(`  ✓ در پیامِ ${svc.PRUNE_EVERY} ام دقیقاً یک‌بار پاک‌سازی می‌کند`);
  }

  {
    // شمارنده باید ریست شود، وگرنه از آن به بعد هر پیام پاک‌سازی می‌کند.
    svc._resetCounter();
    const c = fakeClient();
    for (let i = 0; i < svc.PRUNE_EVERY * 3; i += 1) await svc.onMessageInserted(c);
    assert.strictEqual(c.calls.length, 3,
      `در ${svc.PRUNE_EVERY * 3} پیام باید دقیقاً ۳ بار پاک‌سازی شود، نه ${c.calls.length}`);
    passed += 1;
    console.log('  ✓ شمارنده بعد از هر پاک‌سازی ریست می‌شود');
  }

  // ── ۴. شکستِ پاک‌سازی نباید پیام را خراب کند ──
  {
    svc._resetCounter();
    const c = fakeClient({ throws: 'اتصال قطع شد' });
    let threw = false;
    let result;
    try {
      for (let i = 0; i < svc.PRUNE_EVERY; i += 1) result = await svc.onMessageInserted(c);
    } catch { threw = true; }
    assert.strictEqual(threw, false,
      'شکستِ پاک‌سازی هرگز نباید throw کند — پیامِ کاربر ثبت شده و نباید خطا بگیرد');
    assert.strictEqual(result, 0, 'در صورت خطا باید ۰ برگردد');
    passed += 1;
    console.log('  ✓ خطای پاک‌سازی بلعیده می‌شود و پیامِ کاربر سالم می‌ماند');
  }

  {
    // بعد از خطا هم شمارنده باید ریست شده باشد، وگرنه از آن لحظه هر
    // پیامْ یک DELETEِ شکست‌خورده می‌زند و لاگ را پر می‌کند.
    svc._resetCounter();
    const c = fakeClient({ throws: 'boom' });
    for (let i = 0; i < svc.PRUNE_EVERY; i += 1) await svc.onMessageInserted(c);
    const before = c.calls.length;
    await svc.onMessageInserted(c);
    assert.strictEqual(c.calls.length, before,
      'بعد از خطا نباید بلافاصله دوباره تلاش کند');
    passed += 1;
    console.log('  ✓ بعد از خطا هم شمارنده ریست می‌شود (طوفانِ لاگ رخ نمی‌دهد)');
  }

  console.log(`\nنگه‌داریِ چت: ${passed} بررسی موفق ✓`);
}

main().catch((e) => {
  console.error('\n✗ تستِ نگه‌داریِ چت شکست خورد:', e.message);
  process.exit(1);
});
