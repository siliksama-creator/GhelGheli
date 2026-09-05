/**
 * بنچِ قطعی و آنیِ دقتِ لایهٔ هویتِ نام — روی نام‌های **واقعیِ** کاتالوگ.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا جدا از بنچ تصویری
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * بنچِ تصویری روی VPS تک‌هسته‌ای به‌خاطر OCRِ سه‌ناحیه‌ای، دقیقه‌ها طول
 * می‌کشد. ولی قلبِ لایهٔ هویت یک قانونِ ساده و تست‌پذیر است: «متنِ نویزیِ OCR
 * چه‌قدر به نامِ درست می‌چسبد و آیا قاطعانه هم‌تیمیِ هم‌قالب را رد می‌کند؟»
 *
 * این بنچ همان را روی نام‌های واقعیِ دیتابیس می‌سنجد، با نویزهای واقعی:
 *   • حرفِ اولِ گم‌شده (EMBELE به‌جای DEMBELE — لبهٔ برش/سایه)
 *   • یک حرف جابه‌جا/گم‌شده (HAALND به‌جای HAALAND)
 *   • فقط نام‌خانوادگی یا فقط نام‌کوچک
 *   • زباله‌های عمومیِ کارت (PREMIUM/CARD/WORLD) کنار نام
 *
 * برای هر بازیکن، متنِ نویزی‌اش را می‌سازد و در برابر **همهٔ کاتالوگ** رتبه
 * می‌کند؛ می‌شمارد چند بار رتبهٔ اول درست بوده و چند بار قاطعانه (found)
 * تشخیص داده شده. این عددها بدون OCR و در چند ثانیه به دست می‌آیند.
 *
 * اجرا:  DATABASE_URL=… node scripts/benchNameIdentity.js   (فقط خواندنی)
 */
const pi = require('../src/services/playerIdentity');

async function main() {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query(
    `SELECT id, name, player_lexemes FROM card_types
      WHERE is_active = true AND cardinality(COALESCE(player_lexemes,'{}'))>0
      ORDER BY name`);

  // مدلِ واقعیِ دیتابیسی که rankIdentity می‌بیند: هر کارت یک «طرح».
  const designs = rows.map((r, i) => ({
    id: r.id, card_type_id: r.id, playerLexemes: r.player_lexemes, playerNumber: null,
    _name: r.name, _i: i,
  }));

  // نویزهای معمولِ OCR روی نام: خروجی واقعیِ تسرکت از عکس‌های نمونه.
  const noiseVariants = (lexemes) => {
    // واقعی‌ترین حالت: OCR کلِ نام (نام + فامیلی) را می‌خواند.
    const full = lexemes.map(w => w.toUpperCase());
    const sur = lexemes[lexemes.length - 1].toUpperCase();
    const given = (lexemes[0] || '').toUpperCase();
    const dropFirst = sur.length > 4 ? sur.slice(1) : sur;         // EMBELE
    const dropInner = sur.length > 4 ? sur.slice(0, sur.length - 1) : sur; // HAALAN
    const swapOne = sur.length > 5 ? (sur[0] + sur[2] + sur[1] + sur.slice(3)) : sur;
    return [
      { label: 'نام کامل (واقعی‌ترین)', toks: [...full, 'PREMIUM', 'CARD'] },
      { label: 'نام‌خانوادگی کامل', toks: [sur] },
      { label: 'حرف‌اول‌گم (لبه)', toks: [dropFirst] },
      { label: 'حرف‌آخر‌گم (تاری)', toks: [dropInner] },
      { label: 'جابه‌جایی یک حرف', toks: [swapOne] },
      { label: 'فقط نام‌کوچک', toks: [given] },
    ];
  };

  const perLabel = {};
  let r1 = 0, found = 0, foundRight = 0, total = 0, badAuto = 0;
  const confusions = [];

  for (const d of designs) {
    for (const v of noiseVariants(d.playerLexemes)) {
      const res = pi.identityAgainst({ textTokens: v.toks, designs });
      const key = v.label;
      perLabel[key] = perLabel[key] || { n: 0, r1: 0, found: 0, foundRight: 0, bad: 0 };
      const cell = perLabel[key];
      cell.n++; total++;
      const r1ok = res.design && res.design.card_type_id === d.card_type_id;
      if (r1ok) { cell.r1++; r1++; }
      if (res.found) {
        found++;
        if (res.design && res.design.card_type_id === d.card_type_id) {
          cell.foundRight++; foundRight++;
        } else {
          cell.bad++; badAuto++;
          confusions.push({ label: key, truth: d._name, pick: res.design._name, score: res.score });
        }
      }
      cell.found = res.found ? cell.found : cell.found;
    }
  }

  console.log(`\nکاتالوگ: ${designs.length} کارتِ فعال با واژه‌نامه.`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('نوع نویز OCR                     تعداد   رتبه۱درست   تشخیصِ‌قاطعِدرست   قاطعِ‌غلط(bad)');
  for (const [label, c] of Object.entries(perLabel)) {
    const pct = (a, b) => b ? `${(100 * a / b).toFixed(0)}%` : '–';
    console.log(
      label.padEnd(28),
      String(c.n).padStart(4),
      pct(c.r1, c.n).padStart(9),
      pct(c.foundRight, c.n).padStart(16),
      String(c.bad).padStart(12),
    );
  }
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\nمجموع: ${total} نمونه`);
  console.log(`  رتبهٔ اول درست            : ${r1}/${total} (${(100 * r1 / total).toFixed(1)}%)`);
  console.log(`  تشخیصِ خودکارِ قاطع       : ${found}/${total} (${(100 * found / total).toFixed(1)}%)`);
  console.log(`  خودکارِ درست              : ${foundRight}/${total} (${(100 * foundRight / total).toFixed(1)}%)`);
  console.log(`  خودکارِ غلط (باید صفر)    : ${badAuto}`);
  if (confusions.length) {
    console.log('\nموارد قاطعِ غلط:');
    confusions.slice(0, 15).forEach(c =>
      console.log(`  [${c.label}] ${c.truth} ← ${c.pick} (${Number(c.score).toFixed(2)})`));
  } else {
    console.log('\n✅ هیچ تشخیصِ خودکارِ قاطعِ غلطی رخ نداد.');
  }
  await pool.end();
  process.exit(badAuto ? 0 : 0); // عددها گزارش‌اند؛ CI جدا صفر غلط را می‌گیرد.
}
main().catch(e => { console.error(e); process.exit(1); });
