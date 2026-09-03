#!/usr/bin/env node
// نگهبانِ `tools/reset_for_launch.py` — پاک‌سازیِ روزِ انتشار.
//
// چرا اصلاً گارد استاتیک برای یک اسکریپتِ SQL: بدترین حالتِ این ابزار
// «پاک‌کردنِ تنظیماتِ ادمین» یا «ول‌کردنِ ردیف‌هایِ یتیم» است، و هر دو در
// تستِ واحدِ بک‌اند نمی‌گردند (دیتابیسِ تستِ ما جدول‌هایِ config را پر ندارد)
// و رویِ پروداکشن هم فقط *یک‌بار* و *دیر* معلوم می‌شوند. تاریخچۀ همین مخزن
// سه بار همان خطا را دارد: `user_coin_quota`، `card_box_purchases`،
// `league_perk_awards` — هر سه جدولِ تازه‌ای بودند که مایگریشن ساخت و
// ابزارِ پاک‌سازی نمی‌شناختشان. این گارد همان «فراموشی» را قابل‌تست می‌کند.
//
// سه سنجه:
//   ۱) هر جدولی که مایگریشن‌ها *واقعاً* ساخته‌اند (و بعداً حذفش نکرده‌اند)
//      باید یا در `PURGE` باشد یا در فهرستِ «دست‌نخورده‌ها»ی docstring —
//      نه کمبودنش، نه سکوت درباره‌اش.
//   ۲) هیچ جدولِ «محصول»ی در `PURGE` نباشد، به‌خصوص `app_settings` و
//      `schema_migrations`.
//   ۳) خودِ ابزار سه شرطِ ایمنی را داشته باشد: dry-run پیش‌فرض، بکاپ
//      اجباری پیش از حذف، و شمارشِ دوباره پس از آن.
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const PY = path.join(root, 'tools/reset_for_launch.py');
const MIG = path.join(root, 'backend/migrations');
const src = fs.readFileSync(PY, 'utf8');

let passed = 0;
const fail = [];
const ok = (cond, msg) => {
  if (!cond) {
    fail.push(msg);
    console.error('✗ ' + msg);
    return;
  }
  passed += 1;
  console.log('  ✓ ' + msg);
};

// ── جدول‌هایِ ساخته‌شده توسط مایگریشن‌ها، منهایِ حذف‌شده‌ها ────────────────
const created = new Set();
const dropped = new Set();
for (const f of fs.readdirSync(MIG).filter((x) => x.endsWith('.sql')).sort()) {
  const sql = fs.readFileSync(path.join(MIG, f), 'utf8');
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?["']?([a-z_][a-z0-9_]*)/gi)) created.add(m[1]);
  for (const m of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?["']?([a-z_][a-z0-9_]*)/gi)) dropped.add(m[1]);
}
for (const t of dropped) created.delete(t);
ok(created.size > 40 && dropped.size > 0,
  `مایگریشن‌ها ${created.size} جدولِ زنده می‌سازند و ${dropped.size} را حذف کرده‌اند (کف: ۴۰ زنده)`);

// ── PURGE: چه جدول‌هایی DELETE می‌شوند ─────────────────────────────────────
const purgeBlock = (src.match(/PURGE = f?"""([\s\S]*?)"""/) || [])[1] || '';
const purged = new Set([...purgeBlock.matchAll(/^\s*DELETE FROM ([a-z_][a-z0-9_]*)/gmi)].map((m) => m[1]));
ok(purged.size >= 30, `بلوکِ PURGE ${purged.size} جدول را صریح پاک می‌کند (کف: ۳۰)`);

// ── «دست‌نخورده‌ها»: فهرستِ docstring + اسنیپ‌شاتِ جدول‌هایِ پروداکشن ──────
const doc = (src.match(/"""([\s\S]*?)"""/) || [])[1] || '';
const keptList = new Set([...doc.matchAll(/`([a-z_][a-z0-9_]*)`/g)].map((m) => m[1]));
const FIX = path.join(root, 'backend/scripts/fixtures/live-tables.txt');
const live = fs.existsSync(FIX)
  ? fs.readFileSync(FIX, 'utf8').split('\n').map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
  : [...created];
ok(live.length >= 60, `اسنیپ‌شاتِ جدول‌هایِ پروداکشن خوانده شد (${live.length} جدول)`);

// جدول‌هایی که نه در PURGE نام برده شده‌اند و نه در docstring، ولی *راستش*
// با حذفِ `users` cascade می‌شوند؛ یعنی بی‌خطرند و صریح بخشوده شده‌اند.
// این allowlist عمداً کوتاه و مستند است: افزودنِ جدولِ تازه به آن یعنی
// «باور داریم cascade می‌شود» — تصمیمی که باید دیده شود، نه سکوت.
const CASCADE_OK = new Set([
  'user_card_inventory', 'user_item_grants', 'login_streaks', 'friendships',
  'user_mission_progress', 'user_entitlements', 'user_subscriptions',
  'user_clubs', 'user_shop_items', 'user_pass_progress', 'user_pass_claims',
  'user_reward_claims', 'user_group_progress', 'point_transactions',
  'referral_earnings', 'purchase_referral_commissions', 'withdrawal_requests',
  'withdrawal_status_history', 'support_tickets', 'support_ticket_messages',
  'otp_codes', 'tap_game_progress', 'tap_game_nonces', 'game_results',
  'game_xp_log', 'solo_records', 'wheel_spins', 'chat_messages',
  'chat_message_likes', 'analytics_events', 'app_crash_reports',
  'notifications', 'league_leaderboard_entries', 'league_payouts',
  'user_league_history', 'league_perk_awards', 'league_perk_grants',
  'card_box_openings', 'card_box_cards', 'card_box_purchases',
  'card_duel_decks', 'card_duel_battles', 'game_stake_matches',
  'photo_card_attempts', 'pass_xp_log',
]);
const unclassified = live.filter((t) => !purged.has(t) && !keptList.has(t)
  && !CASCADE_OK.has(t) && !(t === 'payment_orders' && purged.has('payment_orders')));
ok(unclassified.length === 0,
  `هر جدولِ پروداکشن یا در PURGE است یا در «دست‌نخورده‌ها» یا صریح cascade‌پذیر
    (${unclassified.length ? unclassified.join(', ') : '—'})`);

// ── خطِ قرمز: تنظیماتِ محصول در PURGE نباشد ────────────────────────────────
for (const t of ['app_settings', 'schema_migrations', 'admin_users', 'shop_items',
  'league_seasons', 'pass_tiers', 'wheel_prizes']) {
  ok(!purged.has(t), `«${t}» در PURGE نیست (تنظیماتِ محصول/سیستمی)`);
}
// `card_codes` نمونهٔ زندهٔ «جدولی که دیگر نیست»: اگر ابزارش بدونِ prune
// اجرا شود، رویِ پروداکشن می‌سوزد.
ok(/prune_missing/.test(src) && /existing_tables/.test(src),
  'جدول‌هایِ ناموجود (مثل card_codesِ حذف‌شده در ۰۸۰) پیش از اجرا حذف می‌شوند');
ok(!/DELETE FROM card_codes;\s*$/.test(src.split('prune_missing')[0].split('PURGE')[1] || '')
  || /prune_missing\(PURGE\)/.test(src),
  'PURGE از فیلترِ «جدولِ موجود» رد می‌شود، نه بی‌واسطه به psql می‌رود');

// ── سه شرطِ ایمنی ──────────────────────────────────────────────────────────
ok(/dry = '--yes' not in sys\.argv/.test(src),
  'حالتِ پیش‌فرض فقط‌خواندنی است (--yes لازم است)');
ok(/pg_dump/.test(src) && /stat -c%s/.test(src),
  'پیش از حذف، pg_dump گرفته و *حجمش* سنجیده می‌شود (exit code تنها کافی نیست)');
ok(/صفر نشدند/.test(src) && /leftovers/.test(src),
  'پس از حذف دوباره می‌شمارد و اگر چیزی مانده باشد با خطا می‌ایستد');
ok(/ON_ERROR_STOP=1/.test(src),
  'psql با ON_ERROR_STOP اجرا می‌شود (وگرنه خطایِ وسطِ تراکنش exit ۰ می‌داد)');
ok(!/\/home\/user\/tools\/rx\.py/.test(src),
  'ابزار به کمکیِ شخصیِ بیرونِ مخزن وابسته نیست (رویِ سرور اجرا می‌شود)');

if (fail.length) {
  console.error(`\n✗ ${fail.length} بررسی شکست (از ${passed + fail.length})`);
  process.exit(1);
}
console.log(`\n✓ ${passed} بررسی موفق\n`);
