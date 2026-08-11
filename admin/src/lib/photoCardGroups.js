// Administrative presentation model: recognition images are grouped by their
// shared card_type_id. The flat `designs` API remains supported for older
// backends, but no admin action should target one side as if it were a card.
export function groupPhotoCardDesigns(designs = []) {
  const grouped = new Map();
  for (const design of designs) {
    const typeId = design.card_type_id;
    if (!typeId) continue;
    let card = grouped.get(typeId);
    if (!card) {
      card = {
        ...design,
        id: typeId,
        card_type_id: typeId,
        is_active: design.card_type_is_active !== false && design.is_active !== false,
        redeemed_count: 0,
        sides: [],
      };
      grouped.set(typeId, card);
    }
    card.is_active = card.is_active && design.is_active !== false;
    card.redeemed_count += Number(design.redeemed_count || 0);
    card.sides.push({
      id: design.id,
      side: design.side || 'alternate',
      image_url: design.image_url,
      width: design.width,
      height: design.height,
      is_active: design.is_active !== false,
      created_at: design.created_at,
    });
  }
  return [...grouped.values()].map(card => ({
    ...card,
    side_count: card.sides.length,
    image_url: card.sides.find(side => side.side === 'front')?.image_url
      || card.sides[0]?.image_url || null,
  }));
}
