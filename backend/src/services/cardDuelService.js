const crypto = require('crypto');
const { pool } = require('../config/db');

// پنج راند = حس یک مسابقه واقعی، نه یک برخورد سه‌ثانیه‌ای.
// هر راند یک ویژگی متفاوت را می‌سنجد تا قوی‌ترین کارت همیشه برنده نباشد.
const DECK_SIZE = 5;
// فقط پنج نبرد امتیازی اخیر به کلاینت می‌رود؛ بقیه بعد از دو هفته پاک می‌شوند.
const HISTORY_KEEP = 5;
const HISTORY_TTL_DAYS = 14;
const ONLINE_STAKES = Object.freeze([100, 1000]);
const RARITIES = Object.freeze(['normal', 'silver', 'gold', 'premium', 'legend']);
const EFFECTS = Object.freeze(['none', 'finisher', 'wall', 'speedster', 'playmaker', 'lucky_star']);
const RARITY_BONUS = Object.freeze({ normal: 0, silver: 5, gold: 10, premium: 16, legend: 24 });
const RARITY_LABEL = Object.freeze({ normal: 'معمولی', silver: 'نقره‌ای', gold: 'طلایی', premium: 'پرمیوم', legend: 'لجند' });
const EFFECT_LABEL = Object.freeze({
  none: 'بدون افکت', finisher: 'فینیشر', wall: 'دیوار دفاعی', speedster: 'سرعتی',
  playmaker: 'بازی‌ساز', lucky_star: 'ستاره خوش‌شانس',
});
const ROUND_FOCUS = Object.freeze([
  { key: 'duel_speed', stat: 'speed', label: 'ضدحمله سرعتی', userText: 'سرعت کارت ضدحمله را ساخت' },
  { key: 'duel_technique', stat: 'technique', label: 'نبرد تکنیکی', userText: 'تکنیک کارت خط میانی را شکست' },
  { key: 'duel_attack', stat: 'attack', label: 'فشار حمله', userText: 'قدرت حمله خط دفاع را شکافت' },
  { key: 'duel_defense', stat: 'defense', label: 'دیوار دفاعی', userText: 'دفاع کارت جلوی ضدحمله را گرفت' },
  { key: 'duel_goal_chance', stat: 'goalChance', label: 'ضربه نهایی', userText: 'شانس گل ضربه آخر را ساخت' },
]);

// تصویر نمایشی باید همیشه طرح روی کارت باشد.
// قبلاً display_design_id گاهی پشت کارت را برمی‌داشت و کاربر به‌جای
// عکس واقعی بازیکن یک طرح نامرتبط می‌دید. روی کارت منبع حقیقت است.
const FRONT_IMAGE_SQL = `COALESCE(
  (SELECT pd.image_url FROM photo_card_designs pd
    WHERE pd.card_type_id = t.id AND pd.is_active = true
      AND COALESCE(pd.side, 'front') = 'front'
    ORDER BY pd.created_at DESC LIMIT 1),
  t.image_url
)`;

function int(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
function clamp(n, min, max) { return Math.min(max, Math.max(min, int(n))); }
function statInput(v, fallback = 50) { return clamp(v === undefined || v === null || v === '' ? fallback : v, 0, 100); }
function rarityInput(v) { const s = String(v || 'normal'); return RARITIES.includes(s) ? s : 'normal'; }
function effectInput(v) { const s = String(v || 'none'); return EFFECTS.includes(s) ? s : 'none'; }

function duelFieldsFromBody(body, fallback = {}) {
  return {
    attack: statInput(body.duelAttack ?? body.attack, fallback.duel_attack ?? fallback.attack ?? 50),
    defense: statInput(body.duelDefense ?? body.defense, fallback.duel_defense ?? fallback.defense ?? 50),
    speed: statInput(body.duelSpeed ?? body.speed, fallback.duel_speed ?? fallback.speed ?? 50),
    technique: statInput(body.duelTechnique ?? body.technique, fallback.duel_technique ?? fallback.technique ?? 50),
    goalChance: statInput(body.duelGoalChance ?? body.goalChance, fallback.duel_goal_chance ?? fallback.goalChance ?? 50),
    energy: statInput(body.duelEnergy ?? body.energy, fallback.duel_energy ?? fallback.energy ?? 100),
    rarity: rarityInput(body.duelRarity ?? body.rarity ?? fallback.duel_rarity ?? fallback.rarity),
    effect: effectInput(body.duelEffect ?? body.effect ?? fallback.duel_effect ?? fallback.effect),
  };
}

function totalPower(c) {
  const weighted =
    Number(c.duel_attack || c.attack || 0) * 0.28 +
    Number(c.duel_defense || c.defense || 0) * 0.18 +
    Number(c.duel_speed || c.speed || 0) * 0.16 +
    Number(c.duel_technique || c.technique || 0) * 0.18 +
    Number(c.duel_goal_chance || c.goalChance || 0) * 0.14 +
    Number(c.duel_energy || c.energy || 0) * 0.06;
  const pointBoost = Math.min(22, Math.sqrt(Math.max(0, Number(c.point_value || c.pointValue || 0))) / 3.2);
  return Math.round(weighted + pointBoost + (RARITY_BONUS[c.duel_rarity || c.rarity] || 0));
}

function publicCard(row) {
  const c = {
    cardTypeId: row.card_type_id || row.cardTypeId || row.id,
    id: row.card_type_id || row.cardTypeId || row.id,
    name: row.name,
    imageUrl: row.image_url || row.imageUrl || null,
    pointValue: int(row.point_value ?? row.pointValue),
    quantity: int(row.quantity, 1),
    attack: int(row.duel_attack ?? row.attack, 50),
    defense: int(row.duel_defense ?? row.defense, 50),
    speed: int(row.duel_speed ?? row.speed, 50),
    technique: int(row.duel_technique ?? row.technique, 50),
    goalChance: int(row.duel_goal_chance ?? row.goalChance, 50),
    energy: int(row.duel_energy ?? row.energy, 100),
    rarity: rarityInput(row.duel_rarity ?? row.rarity),
    rarityLabel: RARITY_LABEL[rarityInput(row.duel_rarity ?? row.rarity)],
    effect: effectInput(row.duel_effect ?? row.effect),
    effectLabel: EFFECT_LABEL[effectInput(row.duel_effect ?? row.effect)],
    practiceOnly: row.practiceOnly === true,
  };
  c.duel_attack = c.attack;
  c.duel_defense = c.defense;
  c.duel_speed = c.speed;
  c.duel_technique = c.technique;
  c.duel_goal_chance = c.goalChance;
  c.duel_energy = c.energy;
  c.duel_rarity = c.rarity;
  c.duel_effect = c.effect;
  c.power = totalPower(c);
  return c;
}

async function playableCards(userId, client = pool) {
  const { rows } = await client.query(
    `SELECT t.id AS card_type_id, t.name, ${FRONT_IMAGE_SQL} AS image_url,
            t.point_value, i.quantity,
            t.duel_attack, t.duel_defense, t.duel_speed, t.duel_technique,
            t.duel_goal_chance, t.duel_energy, t.duel_rarity, t.duel_effect
       FROM user_card_inventory i
       JOIN card_types t ON t.id = i.card_type_id
      WHERE i.user_id=$1 AND i.consumed_in_reward=false AND i.quantity > 0 AND t.is_active=true
      ORDER BY t.point_value DESC, t.name`, [userId]);
  return rows.map(publicCard);
}

async function validateDeck(userId, ids, client = pool) {
  if (!Array.isArray(ids) || ids.length !== DECK_SIZE) {
    const e = new Error(`تیم باید دقیقاً ${DECK_SIZE} کارت داشته باشد`); e.status = 400; throw e;
  }
  const clean = ids.map(x => String(x || '').trim()).filter(Boolean);
  if (clean.length !== DECK_SIZE || new Set(clean).size !== DECK_SIZE) {
    const e = new Error('پنج کارت متفاوت انتخاب کنید'); e.status = 400; throw e;
  }
  const cards = await playableCards(userId, client);
  const byId = new Map(cards.map(c => [String(c.cardTypeId), c]));
  const picked = clean.map(id => byId.get(id));
  if (picked.some(c => !c)) {
    const e = new Error('یکی از کارت‌های انتخابی در کلکسیون شما نیست'); e.status = 400; throw e;
  }
  return picked;
}

async function getDeck(userId, client = pool) {
  const { rows } = await client.query(
    'SELECT user_id, card_type_ids, updated_at FROM card_duel_decks WHERE user_id=$1',
    [userId],
  );
  return rows[0] || null;
}

async function deckCards(userId, client = pool) {
  const deck = await getDeck(userId, client);
  if (!deck) return { deck: null, cards: [] };
  try {
    return { deck, cards: await validateDeck(userId, deck.card_type_ids, client) };
  } catch (_) {
    return { deck: { ...deck, invalid: true }, cards: [] };
  }
}

async function saveDeck(userId, ids) {
  const cards = await validateDeck(userId, ids);
  const clean = cards.map(c => c.cardTypeId);
  const { rows } = await pool.query(
    `INSERT INTO card_duel_decks(user_id, card_type_ids, ghost_enabled, updated_at)
     VALUES($1,$2,false,NOW())
     ON CONFLICT(user_id) DO UPDATE SET
       card_type_ids=EXCLUDED.card_type_ids,
       ghost_enabled=false,
       updated_at=NOW()
     RETURNING user_id, card_type_ids, updated_at`, [userId, clean]);
  return { deck: rows[0], cards, message: 'ترکیب پنج‌کارتی ذخیره شد' };
}

function randomInt(maxExclusive, random = null) {
  if (random) return Math.floor(random() * maxExclusive);
  return crypto.randomInt(0, maxExclusive);
}

function effectBonus(card, roundIndex, prevWon, random = null) {
  switch (card.duel_effect || card.effect) {
    case 'speedster': return roundIndex === 0 ? 15 : 0;
    case 'playmaker': return roundIndex > 0 && prevWon ? 10 : 0;
    case 'finisher': return roundIndex === DECK_SIZE - 1 ? 15 : 0;
    case 'lucky_star': return randomInt(100, random) < 18 ? 12 : 0;
    default: return 0;
  }
}

function focusValue(card, focus) {
  const key = focus.stat || 'power';
  return Number(card[key] ?? card[focus.key] ?? card[String(focus.key || '').replace('duel_', '')] ?? 50);
}

function roundScore(card, opp, focus, roundIndex, prevWon, random = null) {
  const base = totalPower(card) * 0.56;
  const focusVal = focusValue(card, focus) * 0.36;
  const attackMix = (Number(card.duel_attack ?? card.attack ?? 50)
    + Number(card.duel_goal_chance ?? card.goalChance ?? 50)) * 0.10;
  const defensePenalty = Number(opp.duel_defense ?? opp.defense ?? 50) * 0.10;
  return Math.round(base + focusVal + attackMix - defensePenalty
    + effectBonus(card, roundIndex, prevWon, random)
    + randomInt(13, random));
}

function winnerReason(winner, focus, cardX, cardO, powerX, powerO) {
  const focusX = focusValue(cardX, focus);
  const focusO = focusValue(cardO, focus);
  if (winner === 'DRAW') {
    return `در «${focus.label}» هر دو کارت خیلی نزدیک بودند: ${cardX.name} ${focusX} و ${cardO.name} ${focusO}؛ قدرت نهایی هم ${powerX} برابر ${powerO} شد`;
  }
  const champ = winner === 'X' ? cardX : cardO;
  const other = winner === 'X' ? cardO : cardX;
  const champPower = winner === 'X' ? powerX : powerO;
  const otherPower = winner === 'X' ? powerO : powerX;
  const champFocus = winner === 'X' ? focusX : focusO;
  const otherFocus = winner === 'X' ? focusO : focusX;
  const gap = Math.abs(champPower - otherPower);
  return `${champ.name} در «${focus.label}» با ${champFocus} در برابر ${otherFocus} جلو افتاد و راند را با قدرت نهایی ${champPower} به ${otherPower} برد`;
}

function resolveRound(cardX, cardO, roundIndex, previousWinner = null, random = null) {
  const x = publicCard(cardX);
  const o = publicCard(cardO);
  const focus = ROUND_FOCUS[roundIndex] || ROUND_FOCUS[ROUND_FOCUS.length - 1];
  let powerX = roundScore(x, o, focus, roundIndex, previousWinner === 'X', random);
  let powerO = roundScore(o, x, focus, roundIndex, previousWinner === 'O', random);
  if (o.effect === 'wall' && powerX > powerO && randomInt(100, random) < 22) powerX -= 16;
  if (x.effect === 'wall' && powerO > powerX && randomInt(100, random) < 22) powerO -= 16;
  const diff = powerX - powerO;
  const winner = diff >= 6 ? 'X' : diff <= -6 ? 'O' : 'DRAW';
  const focusStatX = focusValue(x, focus);
  const focusStatO = focusValue(o, focus);
  return {
    round: roundIndex + 1,
    title: focus.label,
    text: focus.userText,
    focusKey: focus.stat,
    focusLabel: focus.label,
    focusStatX,
    focusStatO,
    focusGap: Math.abs(focusStatX - focusStatO),
    cardX: x,
    cardO: o,
    powerX,
    powerO,
    powerGap: Math.abs(powerX - powerO),
    winner,
    reason: winnerReason(winner, focus, x, o, powerX, powerO),
    cinematic: winner === 'X' ? 'ضربه نهایی آبی!' : winner === 'O' ? 'پاسخ آتشین حریف!' : 'برخورد تماشایی!',
  };
}

function simulate(userCards, opponentCards, { opponentName = 'حریف', random = null } = {}) {
  const score = { X: 0, O: 0 };
  let previousWinner = null;
  const rounds = [];
  for (let i = 0; i < DECK_SIZE; i++) {
    const resolved = resolveRound(userCards[i], opponentCards[i], i, previousWinner, random);
    if (resolved.winner !== 'DRAW') score[resolved.winner] += 1;
    previousWinner = resolved.winner;
    rounds.push({
      round: resolved.round, title: resolved.title, text: resolved.text,
      userCard: resolved.cardX, opponentCard: resolved.cardO,
      userPower: resolved.powerX, opponentPower: resolved.powerO,
      outcome: resolved.winner === 'X' ? 'user_goal' : resolved.winner === 'O' ? 'opponent_goal' : 'draw',
      cinematic: resolved.cinematic,
      reason: resolved.reason,
    });
  }
  const winnerSide = score.X > score.O ? 'user' : score.O > score.X ? 'opponent' : 'draw';
  const all = [...userCards.map(c => ({ side: 'user', card: c })), ...opponentCards.map(c => ({ side: 'opponent', card: c }))];
  const mvp = all.sort((a, b) => totalPower(b.card) - totalPower(a.card))[0];
  return {
    userScore: score.X, opponentScore: score.O, winnerSide, opponentName,
    mvp: { side: mvp.side, card: publicCard(mvp.card) }, rounds,
  };
}

function starterDeck() {
  return [
    { id: '00000000-0000-4000-8000-000000000001', name: 'مهاجم تمرینی', stat: 62, rarity: 'normal', effect: 'speedster' },
    { id: '00000000-0000-4000-8000-000000000002', name: 'بازی‌ساز تمرینی', stat: 66, rarity: 'silver', effect: 'playmaker' },
    { id: '00000000-0000-4000-8000-000000000003', name: 'مدافع تمرینی', stat: 68, rarity: 'silver', effect: 'wall' },
    { id: '00000000-0000-4000-8000-000000000004', name: 'وینگر تمرینی', stat: 70, rarity: 'gold', effect: 'lucky_star' },
    { id: '00000000-0000-4000-8000-000000000005', name: 'فینیشر تمرینی', stat: 74, rarity: 'gold', effect: 'finisher' },
  ].map((item, index) => publicCard({
    card_type_id: item.id,
    name: item.name,
    image_url: null,
    point_value: 100 + index * 40,
    quantity: 1,
    duel_attack: item.stat + (index === 4 ? 8 : 0),
    duel_defense: item.stat + (index === 2 ? 8 : -4),
    duel_speed: item.stat + (index === 0 ? 10 : 0),
    duel_technique: item.stat + (index === 1 ? 10 : 0),
    duel_goal_chance: item.stat + (index === 4 ? 10 : 0),
    duel_energy: 100,
    duel_rarity: item.rarity,
    duel_effect: item.effect,
    practiceOnly: true,
  }));
}

function botDeck(userCards) {
  const avg = userCards.reduce((sum, card) => sum + totalPower(card), 0) / Math.max(1, userCards.length);
  const rarities = ['normal', 'silver', 'silver', avg > 92 ? 'gold' : 'silver', avg > 100 ? 'premium' : 'gold'];
  const names = ['ربات سرعتی', 'ربات تاکتیکی', 'ربات دیوار', 'ربات وینگر', 'ربات فینیشر'];
  const effects = ['speedster', 'playmaker', 'wall', 'lucky_star', 'finisher'];
  return [0, 1, 2, 3, 4].map(i => {
    const base = Math.max(35, Math.min(88, Math.round(avg - 18 + i * 6 + crypto.randomInt(-6, 7))));
    return publicCard({
      card_type_id: `bot-${i + 1}`, name: names[i],
      image_url: null, point_value: Math.max(100, Math.round(avg * 7)), quantity: 1,
      duel_attack: base + (i === 4 ? 8 : 0), duel_defense: base + (i === 2 ? 8 : 0),
      duel_speed: base + (i === 0 ? 10 : 0), duel_technique: base + (i === 1 ? 10 : 0),
      duel_goal_chance: base + (i === 4 ? 10 : 0), duel_energy: 100,
      duel_rarity: rarities[i], duel_effect: effects[i],
    });
  });
}

async function pruneBattleHistory(client = pool) {
  // تمرین با ربات لاگ نمی‌خواهد؛ ردیف‌های کهنه هم فقط جدول را سنگین می‌کنند.
  const bot = await client.query(`DELETE FROM card_duel_battles WHERE mode = 'bot'`);
  const old = await client.query(
    `DELETE FROM card_duel_battles WHERE created_at < NOW() - INTERVAL '14 days'`,
  );
  return (bot.rowCount || 0) + (old.rowCount || 0);
}

let lastHistoryPruneAt = 0;
async function maybePruneBattleHistory() {
  if (Date.now() - lastHistoryPruneAt < 30 * 60 * 1000) return;
  lastHistoryPruneAt = Date.now();
  try {
    const removed = await pruneBattleHistory();
    if (removed) console.log(`[card-duel] pruned ${removed} old battle log(s)`);
  } catch (err) {
    console.error('[card-duel] history prune failed:', err.message);
  }
}

async function recentBattles(userId, limit = HISTORY_KEEP, client = pool) {
  const { rows } = await client.query(
    `SELECT b.*, u.nickname AS user_nickname, o.nickname AS opponent_nickname,
            s.status AS stake_status
       FROM card_duel_battles b
       JOIN users u ON u.id=b.user_id
       LEFT JOIN users o ON o.id=b.opponent_user_id
       LEFT JOIN game_stake_matches s ON s.id=b.match_id
      WHERE (b.user_id=$1 OR b.opponent_user_id=$1)
        AND b.mode IN ('online','lobby')
      ORDER BY b.created_at DESC LIMIT $2`,
    [userId, Math.min(HISTORY_KEEP, Math.max(1, Number(limit) || HISTORY_KEEP))]);
  return rows.map(r => {
    const primary = String(r.user_id) === String(userId);
    return {
      id: r.id, mode: r.mode,
      userId, opponentUserId: primary ? r.opponent_user_id : r.user_id,
      userNickname: primary ? r.user_nickname : r.opponent_nickname,
      opponentNickname: primary ? r.opponent_nickname : r.user_nickname,
      userScore: primary ? r.user_score : r.opponent_score,
      opponentScore: primary ? r.opponent_score : r.user_score,
      winnerUserId: r.winner_user_id, stakePoints: r.stake_points,
      userDelta: primary ? r.user_delta : r.opponent_delta,
      opponentDelta: primary ? r.opponent_delta : r.user_delta,
      matchId: r.match_id,
      settlementStatus: Number(r.stake_points) === 0
        ? 'settled'
        : r.stake_status === 'reserved' ? 'pending'
          : r.stake_status === 'refunded' ? 'refunded' : 'settled',
      battleLog: r.battle_log, createdAt: r.created_at,
    };
  });
}

async function status(userId) {
  await maybePruneBattleHistory();
  const [cards, dc, recent] = await Promise.all([
    playableCards(userId), deckCards(userId), recentBattles(userId, HISTORY_KEEP),
  ]);
  return {
    deckSize: DECK_SIZE,
    totalRounds: DECK_SIZE,
    onlineStakes: ONLINE_STAKES,
    playableCards: cards,
    practiceCards: starterDeck(),
    activeDeck: dc.deck ? { ...dc.deck, cards: dc.cards } : null,
    recentBattles: recent,
    rarities: RARITIES.map(id => ({ id, label: RARITY_LABEL[id], bonus: RARITY_BONUS[id] })),
    effects: EFFECTS.map(id => ({ id, label: EFFECT_LABEL[id] })),
    focuses: ROUND_FOCUS,
  };
}

async function botBattle(userId, ids = null) {
  const userCards = ids ? await validateDeck(userId, ids) : (await deckCards(userId)).cards;
  if (userCards.length !== DECK_SIZE) { const e = new Error('اول ترکیب پنج‌کارتی را آماده کن'); e.status = 400; throw e; }
  const opponentCards = botDeck(userCards);
  const sim = simulate(userCards, opponentCards, { opponentName: 'ربات تمرینی' });
  // تمرین با ربات تاریخچه نمی‌سازد؛ جدول فقط نبرد امتیازی را نگه می‌دارد.
  return { battle: null, result: sim, message: 'تمرین با ربات رایگان است و در تاریخچه ثبت نمی‌شود' };
}

async function recordEngineBattle({ matchId = null, playerX, playerO, state, winner, stake = 0, netPot = 0, vsBot = false, matchMode = null }) {
  if (vsBot) return null;
  if (!playerX?.id || !state?.decks?.X?.length) return null;
  const draw = winner === 'DRAW';
  const winnerId = draw ? null : winner === 'X' ? playerX.id : (vsBot ? null : playerO?.id || null);
  const mode = vsBot ? 'bot' : (matchMode === 'lobby' ? 'lobby' : 'online');
  const xDelta = draw || !stake ? 0 : winner === 'X' ? Math.max(0, Number(netPot) - Number(stake)) : -Number(stake);
  const oDelta = draw || !stake || vsBot ? 0 : winner === 'O' ? Math.max(0, Number(netPot) - Number(stake)) : -Number(stake);
  const { rows } = await pool.query(
    `INSERT INTO card_duel_battles(match_id,mode,user_id,opponent_user_id,
       user_card_type_ids,opponent_card_type_ids,user_score,opponent_score,
       winner_user_id,stake_points,user_delta,opponent_delta,battle_log)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [matchId, mode, playerX.id, vsBot ? null : playerO?.id || null,
      state.decks.X.map(c => c.cardTypeId),
      vsBot ? null : state.decks.O.map(c => c.cardTypeId),
      Number(state.score?.X || 0), Number(state.score?.O || 0), winnerId,
      Number(stake || 0), xDelta, oDelta,
      JSON.stringify({ score: state.score, rounds: state.history || [] })],
  );
  return rows[0];
}

module.exports = {
  DECK_SIZE, ONLINE_STAKES, RARITIES, EFFECTS, ROUND_FOCUS, FRONT_IMAGE_SQL,
  RARITY_LABEL, EFFECT_LABEL, duelFieldsFromBody, publicCard, totalPower,
  playableCards, validateDeck, deckCards, status, saveDeck, botBattle,
  starterDeck, botDeck, resolveRound, simulate, recentBattles, recordEngineBattle,
};
