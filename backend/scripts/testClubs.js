// Pure-logic tests for club membership.
//
// The interesting rules are all SQL (effective_club_memberships), so these
// cover the JS decisions around it: what the catalogue exposes, how the
// clients derive a crest path, and — most importantly — the lapse rule,
// modelled here so a regression in the intent is caught before it reaches a
// database.
//
// The live database is exercised separately by tools/test_clubs.py.

let pass = 0, fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      expected ${e}\n      got      ${a}`); }
}

// ── the lapse rule, as a model ────────────────────────────────────────────
// A membership survives if it was bought, or Plus is live, or it is the most
// recently joined row. Mirrors the WHERE clause of the SQL view.
function effective(rows, plusActive) {
  if (!rows.length) return [];
  const newest = [...rows].sort(
    (a, b) => b.joinedAt - a.joinedAt || (a.id < b.id ? -1 : 1))[0];
  return rows.filter(r =>
    r.source === 'purchase' || plusActive || r.id === newest.id);
}

console.log('\nقانون انقضای اشتراک پلاس');

const bought = { id: 'a', source: 'purchase', joinedAt: 1 };
const plusOld = { id: 'b', source: 'plus', joinedAt: 2 };
const plusNew = { id: 'c', source: 'plus', joinedAt: 3 };

check('با پلاس فعال، همهٔ باشگاه‌ها می‌مانند',
  effective([bought, plusOld, plusNew], true).map(r => r.id),
  ['a', 'b', 'c']);

check('بعد از انقضا: خریداری‌شده + آخرین انتخاب',
  effective([bought, plusOld, plusNew], false).map(r => r.id),
  ['a', 'c']);

check('کاربر بدون خرید، فقط آخرین باشگاه را نگه می‌دارد',
  effective([plusOld, plusNew], false).map(r => r.id),
  ['c']);

check('کاربر با هیچ عضویتی، هیچ‌چیز نمی‌گیرد',
  effective([], false), []);

check('عضویت خریداری‌شده هرگز از بین نمی‌رود',
  effective([bought], false).map(r => r.id), ['a']);

// The subtle one: if the NEWEST row is a purchase, the user does not also
// keep an older plus row as a "bonus". They keep exactly what they paid for.
check('اگر آخرین عضویت خریداری‌شده باشد، عضویت پلاسِ قدیمی‌تر می‌رود',
  effective([
    { id: 'b', source: 'plus', joinedAt: 2 },
    { id: 'd', source: 'purchase', joinedAt: 5 },
  ], false).map(r => r.id),
  ['d']);

// ── crest paths ───────────────────────────────────────────────────────────
// Both clients derive the path from the slug; a stale hand-written map is
// exactly the bug this replaced.
const webPath = slug => `/shop/club_${slug}.webp`;
const appPath = slug => `assets/shop/club_${slug}.webp`;
const avatarKey = slug => `club:${slug}`;

console.log('\nمسیر تصویر نشان');
check('وب', webPath('real_madrid'), '/shop/club_real_madrid.webp');
check('اپ', appPath('real_madrid'), 'assets/shop/club_real_madrid.webp');
check('کلید آواتار', avatarKey('psg'), 'club:psg');

// Reverse: an avatar key must resolve back to the same artwork, or a crest
// set as a profile picture renders a broken image.
const resolveAvatar = (key) => (String(key).startsWith('club:')
  ? `/shop/club_${String(key).slice(5)}.webp`
  : `/avatars/${String(key).replace(/\.png$/, '.webp')}`);

check('کلید باشگاه به همان عکس نشان می‌رسد',
  resolveAvatar('club:bayern'), webPath('bayern'));
check('آواتار معمولی دست‌نخورده می‌ماند',
  resolveAvatar('avatar_3_star.png'), '/avatars/avatar_3_star.webp');

// A bundled avatar filename must never be mistaken for a club key.
check('نام فایل آواتار با club: اشتباه گرفته نمی‌شود',
  resolveAvatar('avatar_1_football.png').startsWith('/avatars/'), true);

// ── avatar key validation (mirrors safeAvatarKey in server.js) ────────────
const AVATAR_KEYS = new Set([
  'avatar_1_football.png', 'avatar_2_trophy.png', 'avatar_3_star.png',
  'avatar_4_rocket.png', 'avatar_5_lion.png', 'avatar_6_tiger.png',
  'avatar_7_eagle.png', 'avatar_8_target.png', 'avatar_9_bolt.png',
  'avatar_10_crown.png',
]);
const CLUB_AVATAR_RE = /^club:[a-z0-9_]{1,40}$/;
const safeAvatarKey = (v) => {
  if (!v) return null;
  const s = String(v);
  if (AVATAR_KEYS.has(s)) return s;
  return CLUB_AVATAR_RE.test(s) ? s : null;
};

console.log('\nاعتبارسنجی کلید آواتار');
check('آواتار مجاز', safeAvatarKey('avatar_5_lion.png'), 'avatar_5_lion.png');
check('نشان باشگاه مجاز', safeAvatarKey('club:juventus'), 'club:juventus');
check('پیمایش مسیر رد می‌شود', safeAvatarKey('../../etc/passwd'), null);
check('پیمایش با پیشوند club رد می‌شود',
  safeAvatarKey('club:../../etc/passwd'), null);
check('اسلاگ با حروف بزرگ رد می‌شود', safeAvatarKey('club:REAL'), null);
check('اسلاگ خالی رد می‌شود', safeAvatarKey('club:'), null);
check('اسلاگ بیش از حد بلند رد می‌شود',
  safeAvatarKey('club:' + 'a'.repeat(41)), null);
check('آواتار ناشناخته رد می‌شود', safeAvatarKey('avatar_99.png'), null);

// ── pricing coherence ─────────────────────────────────────────────────────
// Plus must stay the better deal for variety while a single item stays
// reachable. If someone edits a price into an incoherent place, say so.
const PRICES = { badge: 49000, frame: 39000, frameHolo: 59000,
  color: 29000, colorRainbow: 49000, plus: 99000 };

// The intended shape of the offer:
//   1 item  → clearly cheaper than Plus, so "I only want my own club" is
//             an easy, permanent purchase.
//   2 items → about the same as Plus. This is the deliberate crossover: at
//             two items the user genuinely chooses between permanence and
//             variety, rather than one option dominating.
//   3 items → more than Plus, so anyone who wants to experiment subscribes.
console.log('\nانسجام قیمت‌ها');
check('پلاس از هر آیتم تکی گران‌تر است',
  Object.entries(PRICES)
    .filter(([k]) => k !== 'plus')
    .every(([, v]) => v < PRICES.plus),
  true);
check('دو نشان تقریباً برابر یک ماه پلاس است (نقطهٔ تصمیم)',
  Math.abs(PRICES.badge * 2 - PRICES.plus) / PRICES.plus < 0.05, true);
check('سه نشان گران‌تر از پلاس است (پس تنوع‌طلب، پلاس می‌گیرد)',
  PRICES.badge * 3 > PRICES.plus, true);
check('یک نشان کمتر از یک ماه پلاس است (پس خرید تکی هم منطقی است)',
  PRICES.badge < PRICES.plus, true);
check('نسخهٔ ویژهٔ هر دسته گران‌تر از نسخهٔ معمولی است',
  PRICES.frameHolo > PRICES.frame
  && PRICES.colorRainbow > PRICES.color, true);

console.log(`\n${pass} تست موفق، ${fail} ناموفق\n`);
process.exit(fail ? 1 : 0);
