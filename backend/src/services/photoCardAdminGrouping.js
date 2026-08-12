/**
 * Flat recognition-design rows -> one administrative card per card_type_id.
 * Fingerprints stay in their own database rows; this model is presentation
 * and whole-card administration only.
 */
function groupAdminCards(rows) {
  const groups = new Map();
  for (const row of rows) {
    let card = groups.get(row.card_type_id);
    if (!card) {
      card = {
        id: row.card_type_id,
        card_type_id: row.card_type_id,
        card_type_name: row.card_type_name,
        point_value: row.point_value,
        cash_amount: row.cash_amount,
        duel_attack: row.duel_attack,
        duel_defense: row.duel_defense,
        duel_speed: row.duel_speed,
        duel_technique: row.duel_technique,
        duel_goal_chance: row.duel_goal_chance,
        duel_energy: row.duel_energy,
        duel_rarity: row.duel_rarity,
        duel_effect: row.duel_effect,
        is_active: Boolean(row.card_type_is_active),
        code_count: Number(row.code_count || 0),
        unused_code_count: Number(row.unused_code_count || 0),
        redeemed_count: 0,
        created_at: row.created_at,
        sides: [],
      };
      groups.set(row.card_type_id, card);
    }
    card.redeemed_count += Number(row.redeemed_count || 0);
    card.sides.push({
      id: row.id,
      side: row.side || 'alternate',
      image_url: row.image_url,
      width: row.width,
      height: row.height,
      is_active: Boolean(row.is_active),
      created_at: row.created_at,
      text_token_count: Number(row.text_token_count || 0),
      fingerprint_complete: Boolean(row.fingerprint_complete),
    });
    card.is_active = card.is_active && Boolean(row.is_active);
  }
  return [...groups.values()].map(card => ({
    ...card,
    image_url: card.sides.find(side => side.side === 'front')?.image_url
      || card.sides[0]?.image_url || null,
    side_count: card.sides.length,
    analysis_complete: card.sides.length > 0 && card.sides.every(side => side.fingerprint_complete),
    ocr_token_count: card.sides.reduce((sum, side) => sum + side.text_token_count, 0),
  }));
}

module.exports = { groupAdminCards };
