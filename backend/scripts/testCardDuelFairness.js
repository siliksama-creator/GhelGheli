#!/usr/bin/env node
/**
 * نگهبانِ **انصافِ** منطقِ دوئل.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا این فایل جدا از testCardDuelBalance است
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `testCardDuelBalance.js` می‌سنجد که **ربات** چقدر سخت است — یعنی
 * نرخِ بردِ بازیکن در برابر حریفِ ماشینی.
 *
 * این فایل چیزِ دیگری می‌سنجد: آیا **خودِ قواعد** منصفانه‌اند؟ سؤالِ
 * مالک این بود:
 *
 *   «آیا در حالت سختگیرانه از ۱۰۰۰ میتونی ۱۰۰۰ بدی؟»
 *
 * یعنی: اگر دو بازیکن کارت‌های هم‌ارزش داشته باشند، آیا بازی واقعاً
 * برابر است یا مزیتِ پنهانی در کار است؟
 *
 * جوابِ اولیه **نه** بود. پنج نقص پیدا شد و همه رفع شدند. این نگهبان
 * تضمین می‌کند برنگردند.
 *
 * ⚠️ درسِ روش‌شناختی: نرخِ بردِ سالم در برابر ربات، انصافِ قواعد را
 *    اثبات نمی‌کند. یک بازی می‌تواند هم‌زمان «قابلِ برد» و «ناعادلانه»
 *    باشد — مثلاً اگر فقط استاتِ «حمله» ارزش داشته باشد.
 */
const duel = require('../src/services/cardDuelService');

const { publicCard, resolveRound, simulate, totalPower } = duel;

let pass = 0;
const failures = [];
function ck(name, cond, detail = '') {
  if (cond) { pass += 1; console.log('  ✓', name); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log('  ✗', name, detail ? `→ ${detail}` : ''); }
}

function card(o = {}) {
  return publicCard({
    card_type_id: o.id || 'c', name: o.name || 'کارت',
    point_value: o.pv ?? 0,
    duel_attack: o.a ?? 50, duel_defense: o.d ?? 50, duel_speed: o.s ?? 50,
    duel_technique: o.t ?? 50, duel_goal_chance: o.g ?? 50,
    duel_energy: o.e ?? 100,
    duel_rarity: o.r || 'normal', duel_effect: o.f || 'none',
  });
}
function deck(tag, o) {
  return [0, 1, 2, 3, 4].map(i => card({ ...o, id: `${tag}${i}`, name: `${tag}${i}` }));
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ ۱. صفر واقعاً صفر است (نه ۵۰) ══');
// ── باگی که بود ──
// `focusValue` می‌نوشت `focusStatOf(...) || 50`. در جاوااسکریپت `0`
// مقدارِ falsy است، پس کارتی با استاتِ **صفر** مقدارِ ۵۰ می‌گرفت.
// یعنی عددی که روی کارت نوشته شده با عددی که در محاسبه می‌رفت فرق
// داشت — دقیقاً همان حسِ «منطقِ بازی درست نیست».
// اندازه‌گیری: کارتِ «سرعت ۰» فقط ۵۷٪ به «سرعت ۵۰» می‌باخت.
{
  const zero = card({ id: 'Z', s: 0 });
  const fifty = card({ id: 'F', s: 50 });
  const r = resolveRound(zero, fifty, 0);
  ck('استاتِ صفر به‌صورت صفر خوانده می‌شود', r.focusStatX === 0,
    `focusStatX=${r.focusStatX} (اگر ۵۰ است یعنی || 50 برگشته)`);

  let zeroWins = 0;
  for (let i = 0; i < 4000; i += 1) {
    if (resolveRound(zero, fifty, 0).winner === 'X') zeroWins += 1;
  }
  ck('کارتِ صفر تقریباً همیشه می‌بازد', zeroWins / 4000 < 0.02,
    `${(zeroWins / 40).toFixed(0)}٪ برد`);

  // ولی مقدارِ **غایب** هنوز باید ۵۰ شود، وگرنه کارت‌های قدیمیِ بدونِ
  // ستونِ duel_* ناگهان صفر می‌شوند و همه‌شان می‌بازند.
  const missing = publicCard({ card_type_id: 'M', name: 'قدیمی' });
  const rm = resolveRound(missing, fifty, 0);
  ck('استاتِ غایب هنوز ۵۰ فرض می‌شود', rm.focusStatX === 50,
    `focusStatX=${rm.focusStatX}`);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ ۲. هر پنج استات ارزشِ برابر دارند ══');
// ── باگی که بود ──
// وزن‌ها نامتقارن بودند: حمله ۰٫۲۸ ولی شانسِ گل ۰٫۱۴. چون هر استات
// دقیقاً **یک** راند دارد، این یعنی «حمله» دو برابر ارزش داشت بدونِ
// اینکه راندِ بیشتری ببرد — پس برای بازیکنِ باهوش همیشه انتخابِ برتر
// بود و چهار استاتِ دیگر تزئینی می‌شدند.
{
  const powers = [];
  for (const k of ['a', 'd', 's', 't', 'g']) {
    const o = { pv: 1000, a: 70, d: 70, s: 70, t: 70, g: 70, r: 'gold' };
    o[k] = 95;
    powers.push(totalPower(card(o)));
  }
  const spread = Math.max(...powers) - Math.min(...powers);
  ck('سرمایه‌گذاری در هر استات، قدرتِ یکسان می‌دهد', spread === 0,
    `اختلاف ${spread} → ${powers.join('، ')}`);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ ۳. ۱۰۰۰ در برابر ۱۰۰۰ — سؤالِ مالک ══');
{
  // (الف) دو دستِ کاملاً یکسان
  const w = { user: 0, opp: 0, draw: 0 };
  for (let i = 0; i < 3000; i += 1) {
    const r = simulate(
      deck('a', { pv: 1000, a: 80, d: 80, s: 80, t: 80, g: 80, r: 'gold' }),
      deck('b', { pv: 1000, a: 80, d: 80, s: 80, t: 80, g: 80, r: 'gold' }),
      { seed: `same${i}` });
    if (r.userScore > r.opponentScore) w.user += 1;
    else if (r.userScore < r.opponentScore) w.opp += 1;
    else w.draw += 1;
  }
  const bias = Math.abs(w.user - w.opp) / 3000;
  ck('دو دستِ یکسان: هیچ سمتی مزیتِ ساختاری ندارد', bias < 0.04,
    `سوگیری ${(bias * 100).toFixed(2)}٪ (کاربر ${(w.user / 30).toFixed(0)}٪ / حریف ${(w.opp / 30).toFixed(0)}٪)`);

  // (ب) دو دستِ هم‌ارزش با تخصص‌های متفاوت — هرکدام یک راندِ تخصصی
  const w2 = { user: 0, opp: 0, draw: 0 };
  for (let i = 0; i < 3000; i += 1) {
    const r = simulate(
      deck('s', { pv: 1000, a: 72, d: 72, s: 95, t: 72, g: 72, r: 'gold' }),
      deck('g', { pv: 1000, a: 72, d: 72, s: 72, t: 72, g: 95, r: 'gold' }),
      { seed: `spec${i}` });
    if (r.userScore > r.opponentScore) w2.user += 1;
    else if (r.userScore < r.opponentScore) w2.opp += 1;
    else w2.draw += 1;
  }
  const bias2 = Math.abs(w2.user - w2.opp) / 3000;
  ck('تخصصِ سرعت و تخصصِ گل هم‌ارزشند', bias2 < 0.05,
    `سوگیری ${(bias2 * 100).toFixed(2)}٪`);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ ۴. مهارت بر افکت غلبه می‌کند ══');
// ── باگی که بود ──
// بونوسِ افکت ۱۵ بود در برابر آستانهٔ تعیینِ برنده که ۲ است. نتیجه:
// دو کارتِ **کاملاً یکسان** که یکی افکت داشت → افکت‌دار **۱۰۰٪** برنده.
// یعنی در آن راند استاتِ کارت اصلاً مهم نبود.
// حالا با ۷، هشت واحد برتریِ استات کافی است تا افکت را بشکند.
{
  const plain = st => card({ id: 'P', a: st, d: st, s: st, t: st, g: st });
  const speedy = card({ id: 'S', a: 80, d: 80, s: 80, t: 80, g: 80, f: 'speedster' });

  let winsWith10 = 0;
  for (let i = 0; i < 4000; i += 1) {
    if (resolveRound(plain(90), speedy, 0).winner === 'X') winsWith10 += 1;
  }
  ck('۱۰ واحد برتریِ استات بر افکت غلبه می‌کند', winsWith10 / 4000 > 0.9,
    `${(winsWith10 / 40).toFixed(0)}٪ برد`);

  // و برعکس: افکت نباید بی‌اثر شود.
  let winsEqual = 0;
  for (let i = 0; i < 4000; i += 1) {
    if (resolveRound(speedy, plain(80), 0).winner === 'X') winsEqual += 1;
  }
  ck('افکت در استاتِ برابر هنوز مزیت می‌دهد', winsEqual / 4000 > 0.6,
    `${(winsEqual / 40).toFixed(0)}٪ برد`);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ ۵. تمرکزِ راند بر قدرتِ کل غالب است ══');
// اگر «قدرتِ کل» بر «ویژگیِ راند» غلبه کند، انتخابِ کارت بی‌معنی
// می‌شود و بازی به «هرکس کارتِ گران‌تری دارد می‌برد» تبدیل می‌شود.
{
  const weak = card({ id: 'W', pv: 0, a: 40, d: 40, s: 90, t: 40, g: 40 });
  const strong = card({ id: 'T', pv: 1000, a: 85, d: 85, s: 50, t: 85, g: 85, r: 'legend' });
  ck('کارتِ «قوی» واقعاً قدرتِ کلِ بیشتری دارد',
    totalPower(strong) > totalPower(weak) + 30,
    `${totalPower(weak)} در برابر ${totalPower(strong)}`);

  let weakWins = 0;
  for (let i = 0; i < 4000; i += 1) {
    if (resolveRound(weak, strong, 0).winner === 'X') weakWins += 1;
  }
  // راند ۰ = سرعت. کارتِ ضعیف سرعتِ ۹۰ دارد و قوی ۵۰.
  ck('کارتِ ضعیف با برتری در ویژگیِ راند می‌برد', weakWins / 4000 > 0.8,
    `${(weakWins / 40).toFixed(0)}٪ — اگر کم است یعنی قدرتِ کل غالب شده`);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ ۶. سازگاریِ عدد و برنده ══');
// همان چیزی که مالک اول گزارش کرد: «وقتی امتیاز من بیشتر می‌شود ربات
// می‌برد». هیچ راندی نباید عددِ بزرگ‌تر را بازنده اعلام کند.
{
  const rnd = () => card({
    id: 'r', pv: Math.floor(Math.random() * 2000),
    a: 20 + Math.floor(Math.random() * 80), d: 20 + Math.floor(Math.random() * 80),
    s: 20 + Math.floor(Math.random() * 80), t: 20 + Math.floor(Math.random() * 80),
    g: 20 + Math.floor(Math.random() * 80),
    r: ['normal', 'silver', 'gold', 'premium', 'legend'][Math.floor(Math.random() * 5)],
    f: ['none', 'speedster', 'finisher', 'wall', 'lucky_star'][Math.floor(Math.random() * 5)],
  });
  let contradiction = 0;
  let drawWithGap = 0;
  let sumMismatch = 0;
  for (let i = 0; i < 30000; i += 1) {
    const r = resolveRound(rnd(), rnd(), i % 5);
    if (r.powerX > r.powerO && r.winner === 'O') contradiction += 1;
    if (r.powerX < r.powerO && r.winner === 'X') contradiction += 1;
    if (r.winner === 'DRAW' && Math.abs(r.powerX - r.powerO) >= 2) drawWithGap += 1;
    const parts = r.breakdownX;
    const sum = Math.round(parts.base + parts.focus - parts.defensePenalty
      + parts.effectBonus + parts.luck) + (parts.wallAdjustment || 0);
    if (sum !== parts.total) sumMismatch += 1;
  }
  ck('هرگز عددِ بیشتر بازنده نمی‌شود', contradiction === 0, `${contradiction} مورد`);
  ck('هرگز اختلافِ ≥۲ مساوی اعلام نمی‌شود', drawWithGap === 0, `${drawWithGap} مورد`);
  ck('مجموعِ اجزا با عددِ نهایی می‌خواند', sumMismatch === 0, `${sumMismatch} مورد`);
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══ ۷. بازی به نتیجه می‌رسد (۰-۰ نادر است) ══');
{
  let scoreless = 0;
  for (let i = 0; i < 2000; i += 1) {
    const r = simulate(
      deck('a', { pv: 1000, a: 80, d: 80, s: 80, t: 80, g: 80, r: 'gold' }),
      deck('b', { pv: 1000, a: 78, d: 78, s: 78, t: 78, g: 78, r: 'gold' }),
      { seed: `sc${i}` });
    if (r.userScore === 0 && r.opponentScore === 0) scoreless += 1;
  }
  ck('نتیجهٔ ۰-۰ کمتر از ۱۰٪ است', scoreless / 2000 < 0.1,
    `${(scoreless / 20).toFixed(1)}٪ — بازیِ بی‌گل حسِ «موتور خراب است» می‌دهد`);
}

console.log(`\n${failures.length ? '✗' : '✓'} ${pass} موفق، ${failures.length} ناموفق`);
if (failures.length) {
  console.log('\nشکست‌ها:');
  failures.forEach(f => console.log('  ·', f));
  process.exit(1);
}
if (pass < 14) {
  console.log(`\n✗ فقط ${pass} سنجه اجرا شد — کمتر از انتظار`);
  process.exit(1);
}
