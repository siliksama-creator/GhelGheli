/* اشکال‌زدایی: کدام کارت‌ها با نام کامل رتبهٔ اول را می‌ربایند؟ (یک‌بار مصرف) */
const pi = require('../src/services/playerIdentity');
async function main() {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await pool.query(
    `SELECT id, name, player_lexemes FROM card_types
      WHERE is_active = true AND cardinality(COALESCE(player_lexemes,'{}'))>0 ORDER BY name`);
  const designs = rows.map(r => ({ id: r.id, card_type_id: r.id, playerLexemes: r.player_lexemes, _name: r.name }));

  let shown = 0;
  for (const d of designs) {
    const sur = d.playerLexemes[d.playerLexemes.length - 1].toUpperCase();
    const res = pi.identityAgainst({ textTokens: [sur], designs });
    const top = res.ranked[0];
    if (!top || top.design.card_type_id !== d.card_type_id) {
      console.log(`\n❓ درست=${d._name}  توکن=${sur}`);
      res.ranked.forEach((r, i) =>
        console.log(`   ${i + 1}. ${r.design._name}  score=${r.score.toFixed(3)}`));
      shown++;
      if (shown >= 12) break;
    }
  }
  if (!shown) console.log('همه نام‌ها درست رتبه اول شدند.');
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
