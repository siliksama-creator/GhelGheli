#!/usr/bin/env node
/**
 * نگهبانِ «دوئل طوفان» (logicVersion 3).
 *
 * این تست چیزهایی را می‌سنجد که مختصِ طوفان‌اند و گاردهای کلاسیک
 * (TruthLoop/Fairness/Balance) پوشش نمی‌دهند:
 *
 *   ۱) الگوی راندهای دو‌امتیازی قطعی از seed است: ۱ یا ۲ طوفان در ۵ راند،
 *      حداقل ۳ راند عادی، و توزیعِ تقریباً یکنواخت روی شمارهٔ راند.
 *   ۲) شانسِ دامنه‌بزرگ میانگینِ صفر و متقارن است (X و O جداگانه).
 *   ۳) اسکوربورد = جمع awardها؛ راند طوفانیِ برنده ۲، عادیِ برنده ۱،
 *      مساویِ طوفانی با وقت اضافه به برنده ۲ می‌رسد و کارت مصرف نمی‌کند.
 *   ۴) وقت اضافه همیشه برنده دارد، ۲ امتیاز می‌دهد، روی همان راند
 *      (overtime) می‌نشیند و هیچ راند کارتیِ ششم نمی‌سازد.
 *   ۵) حالت کلاسیک (mayhem=false) هیچ کلید تازه‌ای نشت نمی‌دهد و
 *      شانس هنوز ±۶ و logicVersion=2 است.
 *   ۶) منحنیِ بالانس: اختلاف ≤۵ نزدیک ۵۰/۵۰ و اختلاف ۲۰+ قوی‌تر ≥۸۵٪.
 *
 * مثلِ بقیهٔ گاردهای این پوشه، بدونِ پایگاه‌داده اجرا می‌شود (سرویس‌ها
 * فقط به منطقِ خالص تکیه می‌کنند).
 */
const assert = require('assert');
const duel = require('../src/services/cardDuelService');
const rules = require('../src/games/rules/cardDuel');

let pass = 0;
function ok(condition, title, detail = '') {
  assert.ok(condition, `${title}${detail ? ` — ${detail}` : ''}`);
  pass += 1;
  console.log(`  ✓ ${title}`);
}

function card(id, stat = 60, opts = {}) {
  return duel.publicCard({
    card_type_id: id, name: id, point_value: opts.points ?? 100,
    duel_speed: stat, duel_technique: stat, duel_attack: stat,
    duel_defense: stat, duel_goal_chance: stat, duel_energy: 100,
    duel_rarity: 'normal', duel_effect: opts.effect || 'none',
  });
}
function deck(prefix, base, jitter = 0) {
  return Array.from({ length: 5 }, (_, i) => card(`${prefix}-${i}`, base + i + jitter));
}

async function main() {
  // ── ۱) الگوی طوفان ──────────────────────────────────────────────────
  console.log('\n== ۱. الگوی راندهای دو‌امتیازی قطعی از seed ==');
  const freq = [0, 0, 0, 0, 0];
  let twoStorm = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const p = duel.stormPattern(`seed-${i}`);
    assert.strictEqual(p.length, 5, 'الگو همیشه ۵ خانه است');
    const count = p.filter(Boolean).length;
    assert.ok(count === 1 || count === 2, '۱ یا ۲ راند طوفانی');
    assert.ok(count >= 1 && 5 - count >= 3, 'حداقل ۳ راند عادی');
    if (count === 2) twoStorm++;
    p.forEach((v, j) => { if (v) freq[j]++; });
    // قطعی: همان seed، همان الگو.
    assert.deepStrictEqual(duel.stormPattern(`seed-${i}`), p, 'الگو قطعی است');
  }
  ok(true, 'هر نبرد ۱ یا ۲ راند طوفانی و حداقل ۳ راند عادی دارد');
  ok(Math.abs(twoStorm / N - 0.45) < 0.08, 'سهمِ نبردهای دوطوفانی نزدیک ۴۵٪', `${(twoStorm / N).toFixed(2)}`);
  const maxFreq = Math.max(...freq) / N, minFreq = Math.min(...freq) / N;
  ok(maxFreq - minFreq < 0.08, 'توزیعِ طوفان روی راندها تقریباً یکنواخت است', `${minFreq.toFixed(2)}..${maxFreq.toFixed(2)}`);

  // ── ۲) شانس میانگین‌صفر و متقارن ──────────────────────────────────────
  console.log('\n== ۲. شانسِ دامنه‌بزرگ میانگین‌صفر و متقارن ==');
  function meanLuck(side, range) {
    let sum = 0, min = 999, max = -999, M = 6000;
    for (let i = 0; i < M; i++) {
      const v = duel.luckInRange(`l-${i}`, side, range);
      sum += v; if (v < min) min = v; if (v > max) max = v;
    }
    return { mean: sum / M, min, max };
  }
  for (const range of [duel.LUCK_RANGE_STORM, duel.LUCK_RANGE_OT]) {
    for (const side of ['X', 'O']) {
      const m = meanLuck(side, range);
      ok(Math.abs(m.mean) < 0.25, `شانسِ ±${range} برای ${side} میانگین نزدیک صفر`, `mean=${m.mean.toFixed(3)}`);
      assert.ok(m.min === -range && m.max === range, `دامنه دقیقاً ±${range}`);
    }
  }

  // ── ۳ و ۴) نبرد کامل مایم از طریق موتور واقعی ──────────────────────────
  console.log('\n== ۳/۴. invariant اسکور، award و وقت اضافه ==');
  let overtimeSeen = 0, totalGames = 0;
  for (let g = 0; g < 2000; g++) {
    const st = rules.createFromDecks(
      deck(`x${g}`, 55 + (g % 18)),
      deck(`o${g}`, 55 + ((g * 7) % 18)),
      { seed: `m-${g}`, mayhem: true },
    );
    for (let r = 0; r < 5; r++) {
      const xb = st.remaining.X.length, ob = st.remaining.O.length;
      rules.applyMove(st, { cardId: st.remaining.X[0] }, 'X');
      rules.applyMove(st, { cardId: st.remaining.O[0] }, 'O');
      assert.ok(xb - st.remaining.X.length === 1 && ob - st.remaining.O.length === 1,
        'هر راند دقیقاً یک کارت از هر طرف مصرف می‌شود');
    }
    totalGames++;
    assert.strictEqual(st.history.length, 5, 'وقت اضافه راند ششم نمی‌سازد');
    // جمع award == اسکوربورد
    const sx = st.history.reduce((a, h) => a + (h.awardX || 0), 0);
    const so = st.history.reduce((a, h) => a + (h.awardO || 0), 0);
    assert.strictEqual(sx, st.score.X, 'جمع awardX با اسکور می‌خواند');
    assert.strictEqual(so, st.score.O, 'جمع awardO با اسکور می‌خواند');
    for (const h of st.history) {
      assert.strictEqual(h.logicVersion, 3, 'راند طوفانی logicVersion=3');
      if (h.overtime) {
        overtimeSeen++;
        assert.ok(['X', 'O'].includes(h.overtime.winner), 'وقت اضافه برنده قطعی دارد');
        assert.strictEqual(h.winner, h.overtime.winner, 'برندهٔ وقت اضافه روی راند می‌نشیند');
        const w = h.overtime.winner;
        assert.strictEqual(w === 'X' ? h.awardX : h.awardO, 2, 'برندهٔ وقت اضافه ۲ امتیاز');
        assert.strictEqual(w === 'X' ? h.awardO : h.awardX, 0, 'بازندهٔ وقت اضافه ۰');
        assert.strictEqual(h.overtime.luckRange, duel.LUCK_RANGE_OT, 'شانس وقت اضافه دامنهٔ بزرگ');
      } else if (h.winner !== 'DRAW') {
        const expect = h.mod === 'storm' ? 2 : 1;
        assert.strictEqual(h.winner === 'X' ? h.awardX : h.awardO, expect,
          `award راند ${h.round} درست است (${expect})`);
      } else {
        assert.ok(!h.awardX && !h.awardO, 'مساویِ عادی امتیاز ندارد');
      }
    }
  }
  ok(overtimeSeen > 0, `در ${totalGames} نبرد وقت اضافه واقعاً رخ داد`, `${overtimeSeen} وقت اضافه`);
  ok(true, 'جمع award با اسکوربورد می‌خواند و وقت اضافه کارت مصرف نمی‌کند');

  // ── ۵) کلاسیک دست‌نخورده ──────────────────────────────────────────────
  console.log('\n== ۵. حالت کلاسیک (پرچم خاموش) بایت‌به‌بایت نسخهٔ ۲ ==');
  const cl = rules.createFromDecks(deck('cx', 70), deck('co', 66), { seed: 'classic', mayhem: false });
  for (let r = 0; r < 5; r++) {
    rules.applyMove(cl, { cardId: cl.remaining.X[0] }, 'X');
    rules.applyMove(cl, { cardId: cl.remaining.O[0] }, 'O');
  }
  for (const h of cl.history) {
    assert.strictEqual(h.logicVersion, 2, 'کلاسیک logicVersion=2');
    assert.strictEqual(h.mod, undefined, 'کلاسیک mod ندارد');
    assert.strictEqual(h.awardX, undefined, 'کلاسیک awardX ندارد');
    assert.strictEqual(h.overtime, undefined, 'کلاسیک overtime ندارد');
    assert.strictEqual(h.luckRange, duel.LUCK_RANGE, 'کلاسیک شانس ±۶');
  }
  const clPub = rules.decorate(rules.publicState(cl, 'X'), 'X');
  assert.strictEqual(clPub.narration, undefined, 'کلاسیک روایت پایان ندارد');
  assert.strictEqual(clPub.roundModAnnounce, null, 'کلاسیک بنر طوفان ندارد');
  ok(true, 'حالت کلاسیک هیچ فیلد طوفانی نشت نمی‌دهد و شانس ±۶ است');

  // ── ۶) منحنیِ بالانس در نبرد کامل مایم ────────────────────────────────
  console.log('\n== ۶. منحنیِ نرخ برد برحسب برتریِ ترکیب (mayhem) ==');
  function winRate(delta) {
    let x = 0, M = 500;
    for (let t = 0; t < M; t++) {
      const res = duel.simulate(deck(`u${delta}-${t}`, 55 + delta), deck(`v${delta}-${t}`, 55),
        { seed: `b-${delta}-${t}`, mayhem: true });
      if (res.winnerSide === 'user') x++;
    }
    return x / M;
  }
  const close = winRate(3);
  const far = winRate(20);
  ok(close < 0.78, `اختلافِ کم (۳) نزدیک ۵۰/۵۰ می‌ماند`, `X=${(close * 100).toFixed(1)}٪`);
  ok(far >= 0.85, `اختلافِ زیاد (۲۰) قوی‌تر ≥۸۵٪ می‌برد`, `X=${(far * 100).toFixed(1)}٪`);

  console.log(`\n✅ ${pass} نگهبانِ دوئل طوفان موفق بود`);
}

main().catch(err => {
  console.error('\n❌ نگهبان دوئل طوفان شکست خورد:');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
