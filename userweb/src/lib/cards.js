export const CARD_RARITY_META = {
  normal: { label: 'معمولی', accent: '#34D399', icon: '●' },
  silver: { label: 'نقره‌ای', accent: '#E5EEF8', icon: '◆' },
  gold: { label: 'طلایی', accent: '#FFD166', icon: '★' },
  premium: { label: 'پرمیوم', accent: '#38BDF8', icon: '✦' },
  legend: { label: 'لجند', accent: '#F97316', icon: '♛' },
};

const BAD_ART = ['football', 'ball.webp', 'empty_collection', 'avatar_1_football'];

export function cardArtOf(item) {
  if (!item) return '';
  for (const key of ['imageUrl', 'image_url', 'frontImageUrl', 'front_image_url']) {
    const value = item[key];
    if (!value) continue;
    const text = String(value).trim();
    if (!text) continue;
    if (BAD_ART.some(mark => text.includes(mark))) continue;
    return text;
  }
  return '';
}

export function cardIdOf(item) {
  return String(item?.cardTypeId || item?.card_type_id || item?.id || '');
}

export function cardNameOf(item) {
  return String(item?.name || 'کارت');
}

export function cardQtyOf(item) {
  const raw = item?.quantity ?? item?.registered_count ?? 1;
  const n = Number.parseInt(String(raw).split('.')[0], 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function cardRarityOf(item) {
  const raw = String(item?.duel_rarity || item?.rarity || 'normal');
  return CARD_RARITY_META[raw] ? raw : 'normal';
}

export function cardStatsOf(item) {
  return [
    ['حمله', item?.duel_attack ?? item?.attack ?? 0],
    ['دفاع', item?.duel_defense ?? item?.defense ?? 0],
    ['سرعت', item?.duel_speed ?? item?.speed ?? 0],
    ['تکنیک', item?.duel_technique ?? item?.technique ?? 0],
    ['گل', item?.duel_goal_chance ?? item?.goalChance ?? 0],
    ['انرژی', item?.duel_energy ?? item?.energy ?? 0],
  ];
}

export function cardPointValueOf(item) {
  const n = Number.parseInt(String(item?.point_value ?? item?.pointValue ?? 0), 10);
  return Number.isFinite(n) ? n : 0;
}

export function cardPowerOf(item) {
  const n = Number.parseInt(String(item?.power ?? 0), 10);
  return Number.isFinite(n) ? n : 0;
}
