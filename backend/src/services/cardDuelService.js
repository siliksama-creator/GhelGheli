const crypto = require('crypto');
const { pool } = require('../config/db');
const points = require('./pointService');
const { createNotification } = require('./notificationService');

const DECK_SIZE = 3;
const GHOST_STAKE = Number(process.env.CARD_DUEL_STAKE_POINTS || 25);
const AUTO_DAILY_LIMIT = Number(process.env.CARD_DUEL_AUTO_DAILY_LIMIT || 10);

const RARITIES = Object.freeze(['normal', 'silver', 'gold', 'premium', 'legend']);
const EFFECTS = Object.freeze(['none', 'finisher', 'wall', 'speedster', 'playmaker', 'lucky_star']);
const RARITY_BONUS = Object.freeze({ normal: 0, silver: 5, gold: 10, premium: 16, legend: 24 });
const RARITY_LABEL = Object.freeze({ normal: 'معمولی', silver: 'نقره‌ای', gold: 'طلایی', premium: 'پرمیوم', legend: 'لجند' });
const EFFECT_LABEL = Object.freeze({
  none: 'بدون افکت', finisher: 'فینیشر', wall: 'دیوار دفاعی', speedster: 'سرعتی',
  playmaker: 'بازی‌ساز', lucky_star: 'ستاره خوش‌شانس',
});
const ROUND_FOCUS = Object.freeze([
  { key: 'duel_speed', label: 'ضدحمله سرعتی', userText: 'سرعت کارت، ضدحمله را ساخت' },
  { key: 'duel_technique', label: 'نبرد تکنیکی', userText: 'تکنیک کارت، دفاع را شکست' },
  { key: 'duel_goal_chance', label: 'لحظه گل', userText: 'شانس گل و حمله، ضربه نهایی را ساخت' },
]);

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
    Number(c.duel_attack || 0) * 0.28 +
    Number(c.duel_defense || 0) * 0.18 +
    Number(c.duel_speed || 0) * 0.16 +
    Number(c.duel_technique || 0) * 0.18 +
    Number(c.duel_goal_chance || 0) * 0.14 +
    Number(c.duel_energy || 0) * 0.06;
  const pointBoost = Math.min(22, Math.sqrt(Math.max(0, Number(c.point_value || 0))) / 3.2);
  return Math.round(weighted + pointBoost + (RARITY_BONUS[c.duel_rarity] || 0));
}

function publicCard(row) {
  const c = {
    cardTypeId: row.card_type_id || row.id,
    id: row.card_type_id || row.id,
    name: row.name,
    imageUrl: row.image_url,
    pointValue: int(row.point_value),
    quantity: int(row.quantity, 1),
    attack: int(row.duel_attack, 50),
    defense: int(row.duel_defense, 50),
    speed: int(row.duel_speed, 50),
    technique: int(row.duel_technique, 50),
    goalChance: int(row.duel_goal_chance, 50),
    energy: int(row.duel_energy, 100),
    rarity: rarityInput(row.duel_rarity),
    rarityLabel: RARITY_LABEL[rarityInput(row.duel_rarity)],
    effect: effectInput(row.duel_effect),
    effectLabel: EFFECT_LABEL[effectInput(row.duel_effect)],
    duel_attack: int(row.duel_attack, 50),
    duel_defense: int(row.duel_defense, 50),
    duel_speed: int(row.duel_speed, 50),
    duel_technique: int(row.duel_technique, 50),
    duel_goal_chance: int(row.duel_goal_chance, 50),
    duel_energy: int(row.duel_energy, 100),
    duel_rarity: rarityInput(row.duel_rarity),
    duel_effect: effectInput(row.duel_effect),
  };
  c.power = totalPower(c);
  return c;
}

async function playableCards(userId, client = pool) {
  const { rows } = await client.query(
    `SELECT t.id AS card_type_id, t.name, COALESCE(d.image_url, t.image_url) AS image_url,
            t.point_value, i.quantity,
            t.duel_attack, t.duel_defense, t.duel_speed, t.duel_technique,
            t.duel_goal_chance, t.duel_energy, t.duel_rarity, t.duel_effect
       FROM user_card_inventory i
       JOIN card_types t ON t.id = i.card_type_id
       LEFT JOIN photo_card_designs d ON d.id = i.display_design_id
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
    const e = new Error('سه کارت متفاوت انتخاب کنید'); e.status = 400; throw e;
  }
  const cards = await playableCards(userId, client);
  const byId = new Map(cards.map(c => [c.cardTypeId, c]));
  const picked = clean.map(id => byId.get(id));
  if (picked.some(Boolean) === false || picked.some(c => !c)) {
    const e = new Error('یکی از کارت‌های انتخابی در کلکسیون شما نیست'); e.status = 400; throw e;
  }
  return picked;
}

async function getDeck(userId, client = pool) {
  const { rows } = await client.query('SELECT * FROM card_duel_decks WHERE user_id=$1', [userId]);
  return rows[0] || null;
}

async function deckCards(userId, client = pool) {
  const deck = await getDeck(userId, client);
  if (!deck) return { deck: null, cards: [] };
  try {
    return { deck, cards: await validateDeck(userId, deck.card_type_ids, client) };
  } catch (_) {
    return { deck: { ...deck, ghost_enabled: false, invalid: true }, cards: [] };
  }
}

async function saveDeck(userId, ids, ghostEnabled = true) {
  const cards = await validateDeck(userId, ids);
  const clean = cards.map(c => c.cardTypeId);
  const { rows } = await pool.query(
    `INSERT INTO card_duel_decks(user_id, card_type_ids, ghost_enabled, updated_at)
     VALUES($1,$2,$3,NOW())
     ON CONFLICT(user_id) DO UPDATE SET
       card_type_ids=EXCLUDED.card_type_ids,
       ghost_enabled=EXCLUDED.ghost_enabled,
       updated_at=NOW()
     RETURNING *`, [userId, clean, ghostEnabled !== false]);
  return { deck: rows[0], cards, message: ghostEnabled !== false ? 'تیم Ghost آماده شد' : 'تیم ذخیره شد' };
}

function effectBonus(card, roundIndex, prevWon) {
  switch (card.duel_effect) {
    case 'speedster': return roundIndex === 0 ? 15 : 0;
    case 'playmaker': return roundIndex > 0 && prevWon ? 10 : 0;
    case 'finisher': return roundIndex === 2 ? 15 : 0;
    case 'lucky_star': return crypto.randomInt(0, 100) < 18 ? 12 : 0;
    default: return 0;
  }
}

function roundScore(card, opp, focus, roundIndex, prevWon) {
  const base = totalPower(card) * 0.56;
  const focusVal = Number(card[focus.key] || 50) * 0.36;
  const attackMix = (Number(card.duel_attack || 50) + Number(card.duel_goal_chance || 50)) * 0.10;
  const defensePenalty = Number(opp.duel_defense || 50) * 0.10;
  return Math.round(base + focusVal + attackMix - defensePenalty
    + effectBonus(card, roundIndex, prevWon)
    + crypto.randomInt(0, 13));
}

function simulate(userCards, opponentCards, { opponentName = 'حریف' } = {}) {
  let userScore = 0, opponentScore = 0;
  let prevUserWon = false, prevOppWon = false;
  const rounds = [];
  for (let i = 0; i < DECK_SIZE; i++) {
    const u = userCards[i];
    const o = opponentCards[i];
    const focus = ROUND_FOCUS[i];
    let us = roundScore(u, o, focus, i, prevUserWon);
    let os = roundScore(o, u, focus, i, prevOppWon);
    if (o.duel_effect === 'wall' && us > os && crypto.randomInt(0, 100) < 22) us -= 16;
    if (u.duel_effect === 'wall' && os > us && crypto.randomInt(0, 100) < 22) os -= 16;
    const diff = us - os;
    let outcome = 'draw';
    if (diff >= 6) { outcome = 'user_goal'; userScore += 1; }
    else if (diff <= -6) { outcome = 'opponent_goal'; opponentScore += 1; }
    prevUserWon = outcome === 'user_goal';
    prevOppWon = outcome === 'opponent_goal';
    rounds.push({
      round: i + 1, title: focus.label, text: focus.userText,
      userCard: publicCard(u), opponentCard: publicCard(o),
      userPower: us, opponentPower: os, outcome,
      cinematic: outcome === 'user_goal' ? 'گل قلقلی!' : outcome === 'opponent_goal' ? 'حریف گل زد' : 'نبرد نزدیک',
    });
  }
  const winnerSide = userScore > opponentScore ? 'user' : opponentScore > userScore ? 'opponent' : 'draw';
  const all = [...userCards.map(c => ({ side: 'user', card: c })), ...opponentCards.map(c => ({ side: 'opponent', card: c }))];
  const mvp = all.sort((a, b) => totalPower(b.card) - totalPower(a.card))[0];
  return {
    userScore, opponentScore, winnerSide, opponentName,
    mvp: { side: mvp.side, card: publicCard(mvp.card) }, rounds,
  };
}

function botDeck(userCards) {
  const avg = userCards.reduce((s, c) => s + totalPower(c), 0) / userCards.length;
  const rarities = ['normal', 'silver', avg > 92 ? 'gold' : 'silver'];
  return [0, 1, 2].map(i => {
    const base = Math.max(35, Math.min(88, Math.round(avg - 16 + i * 7 + crypto.randomInt(-6, 7))));
    const row = {
      card_type_id: `bot-${i + 1}`, id: `bot-${i + 1}`, name: ['بات سرعتی', 'بات تکنیکی', 'بات فینیشر'][i],
      image_url: null, point_value: Math.max(100, Math.round(avg * 7)), quantity: 1,
      duel_attack: base + (i === 2 ? 8 : 0), duel_defense: base + (i === 1 ? 5 : 0),
      duel_speed: base + (i === 0 ? 10 : 0), duel_technique: base + (i === 1 ? 10 : 0),
      duel_goal_chance: base + (i === 2 ? 10 : 0), duel_energy: 100,
      duel_rarity: rarities[i], duel_effect: ['speedster', 'playmaker', 'finisher'][i],
    };
    return publicCard(row);
  });
}

async function recentBattles(userId, limit = 10, client = pool) {
  const { rows } = await client.query(
    `SELECT b.*, u.nickname AS user_nickname, o.nickname AS opponent_nickname
       FROM card_duel_battles b
       JOIN users u ON u.id=b.user_id
       LEFT JOIN users o ON o.id=b.opponent_user_id
      WHERE b.user_id=$1 OR b.opponent_user_id=$1
      ORDER BY b.created_at DESC LIMIT $2`, [userId, Math.min(50, Math.max(1, Number(limit) || 10))]);
  return rows.map(r => ({
    id: r.id, mode: r.mode, userId: r.user_id, opponentUserId: r.opponent_user_id,
    userNickname: r.user_nickname, opponentNickname: r.opponent_nickname,
    userScore: r.user_score, opponentScore: r.opponent_score,
    winnerUserId: r.winner_user_id, stakePoints: r.stake_points,
    userDelta: r.user_delta, opponentDelta: r.opponent_delta,
    battleLog: r.battle_log, createdAt: r.created_at,
  }));
}

async function dailyAutoCount(userId, client = pool) {
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM card_duel_battles
      WHERE mode='auto_ghost'
        AND (user_id=$1 OR opponent_user_id=$1)
        AND created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Tehran') AT TIME ZONE 'Asia/Tehran')`,
    [userId]);
  return Number(rows[0]?.n || 0);
}

async function status(userId) {
  const [cards, dc, recent] = await Promise.all([
    playableCards(userId), deckCards(userId), recentBattles(userId, 8),
  ]);
  const autoToday = await dailyAutoCount(userId);
  return {
    deckSize: DECK_SIZE, stakePoints: GHOST_STAKE, autoDailyLimit: AUTO_DAILY_LIMIT,
    playableCards: cards,
    activeDeck: dc.deck ? { ...dc.deck, cards: dc.cards } : null,
    autoToday, autoLeft: Math.max(0, AUTO_DAILY_LIMIT - autoToday),
    recentBattles: recent,
    rarities: RARITIES.map(id => ({ id, label: RARITY_LABEL[id], bonus: RARITY_BONUS[id] })),
    effects: EFFECTS.map(id => ({ id, label: EFFECT_LABEL[id] })),
  };
}

async function botBattle(userId, ids = null) {
  const userCards = ids ? await validateDeck(userId, ids) : (await deckCards(userId)).cards;
  if (userCards.length !== DECK_SIZE) { const e = new Error('اول تیم سه‌کارتی را آماده کن'); e.status = 400; throw e; }
  const opponentCards = botDeck(userCards);
  const sim = simulate(userCards, opponentCards, { opponentName: 'بات تمرینی' });
  const { rows } = await pool.query(
    `INSERT INTO card_duel_battles(mode,user_id,user_card_type_ids,opponent_card_type_ids,
       user_score,opponent_score,winner_user_id,stake_points,battle_log)
     VALUES('bot',$1,$2,NULL,$3,$4,NULL,0,$5) RETURNING *`,
    [userId, userCards.map(c => c.cardTypeId), sim.userScore, sim.opponentScore, JSON.stringify(sim)]);
  return { battle: rows[0], result: sim, message: 'بازی با بات تمرینی امتیازی ندارد' };
}

async function pickOpponent(userId, client = pool) {
  const { rows } = await client.query(
    `SELECT d.user_id, d.card_type_ids, u.nickname, u.current_points
       FROM card_duel_decks d JOIN users u ON u.id=d.user_id
      WHERE d.ghost_enabled=true AND d.user_id<>$1 AND u.status='active'
        AND u.current_points >= $2
      ORDER BY random() LIMIT 12`, [userId, GHOST_STAKE]);
  for (const r of rows) {
    if (await dailyAutoCount(r.user_id, client) >= AUTO_DAILY_LIMIT) continue;
    const cards = await validateDeck(r.user_id, r.card_type_ids, client).catch(() => null);
    if (cards?.length === DECK_SIZE) return { userId: r.user_id, nickname: r.nickname || 'حریف', cards };
  }
  return null;
}

async function ghostBattle(userId, { auto = false } = {}) {
  const client = await pool.connect();
  let inserted, sim, opponent;
  try {
    await client.query('BEGIN');
    const me = await client.query('SELECT id,current_points,nickname FROM users WHERE id=$1 FOR UPDATE', [userId]);
    if (!me.rows[0] || Number(me.rows[0].current_points) < GHOST_STAKE) {
      throw Object.assign(new Error(`برای دوئل Ghost حداقل ${GHOST_STAKE.toLocaleString('fa-IR')} امتیاز لازم است`), { status: 400 });
    }
    if (auto && await dailyAutoCount(userId, client) >= AUTO_DAILY_LIMIT) {
      throw Object.assign(new Error('سهمیهٔ دوئل خودکار امروز کامل شده'), { status: 409 });
    }
    const own = await deckCards(userId, client);
    if (own.cards.length !== DECK_SIZE || own.deck?.ghost_enabled !== true) {
      throw Object.assign(new Error('اول تیم سه‌کارتی Ghost را فعال کن'), { status: 400 });
    }
    opponent = await pickOpponent(userId, client);
    if (!opponent) throw Object.assign(new Error('فعلاً حریف Ghost آماده‌ای پیدا نشد'), { status: 404 });
    const oppLock = await client.query('SELECT id,current_points FROM users WHERE id=$1 FOR UPDATE', [opponent.userId]);
    if (!oppLock.rows[0] || Number(oppLock.rows[0].current_points) < GHOST_STAKE) {
      throw Object.assign(new Error('حریف Ghost امتیاز کافی ندارد'), { status: 409 });
    }
    sim = simulate(own.cards, opponent.cards, { opponentName: opponent.nickname });
    let winnerId = null, userDelta = 0, opponentDelta = 0;
    const ins = await client.query(
      `INSERT INTO card_duel_battles(mode,user_id,opponent_user_id,user_card_type_ids,opponent_card_type_ids,
        user_score,opponent_score,winner_user_id,stake_points,battle_log)
       VALUES($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9) RETURNING *`,
      [auto ? 'auto_ghost' : 'ghost', userId, opponent.userId,
        own.cards.map(c => c.cardTypeId), opponent.cards.map(c => c.cardTypeId),
        sim.userScore, sim.opponentScore, GHOST_STAKE, JSON.stringify(sim)]);
    inserted = ins.rows[0];
    if (sim.winnerSide === 'user') {
      winnerId = userId; userDelta = GHOST_STAKE; opponentDelta = -GHOST_STAKE;
      await points.debit(client, { userId: opponent.userId, points: GHOST_STAKE, source: 'game', referenceType: 'card_duel_battles', referenceId: inserted.id, description: 'باخت در دوئل کارت Ghost', league: false });
      await points.credit(client, { userId, points: GHOST_STAKE, source: 'game', referenceType: 'card_duel_battles', referenceId: inserted.id, description: 'برد در دوئل کارت Ghost', league: false });
    } else if (sim.winnerSide === 'opponent') {
      winnerId = opponent.userId; userDelta = -GHOST_STAKE; opponentDelta = GHOST_STAKE;
      await points.debit(client, { userId, points: GHOST_STAKE, source: 'game', referenceType: 'card_duel_battles', referenceId: inserted.id, description: 'باخت در دوئل کارت Ghost', league: false });
      await points.credit(client, { userId: opponent.userId, points: GHOST_STAKE, source: 'game', referenceType: 'card_duel_battles', referenceId: inserted.id, description: 'برد در دوئل کارت Ghost', league: false });
    }
    const upd = await client.query(
      `UPDATE card_duel_battles SET winner_user_id=$2,user_delta=$3,opponent_delta=$4 WHERE id=$1 RETURNING *`,
      [inserted.id, winnerId, userDelta, opponentDelta]);
    inserted = upd.rows[0];
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  const title = auto ? 'نتیجهٔ دوئل خودکار Ghost' : 'نتیجهٔ دوئل Ghost';
  const bodyFor = (delta, mine, theirs) => delta > 0
    ? `بردی ${mine}-${theirs} و ${GHOST_STAKE.toLocaleString('fa-IR')} امتیاز گرفتی.`
    : delta < 0
      ? `باختی ${mine}-${theirs} و ${GHOST_STAKE.toLocaleString('fa-IR')} امتیاز کسر شد.`
      : `بازی ${mine}-${theirs} مساوی شد؛ امتیازی جابه‌جا نشد.`;
  createNotification(userId, 'card_duel', title, bodyFor(inserted.user_delta, inserted.user_score, inserted.opponent_score)).catch(() => {});
  if (opponent?.userId) {
    createNotification(opponent.userId, 'card_duel', title, bodyFor(inserted.opponent_delta, inserted.opponent_score, inserted.user_score)).catch(() => {});
  }
  return { battle: inserted, result: sim, message: 'دوئل Ghost ثبت شد' };
}

async function runAutoGhostBattles({ limit = 40 } = {}) {
  const { rows } = await pool.query(
    `SELECT d.user_id FROM card_duel_decks d JOIN users u ON u.id=d.user_id
      WHERE d.ghost_enabled=true AND u.status='active' AND u.current_points >= $1
      ORDER BY d.updated_at ASC LIMIT $2`, [GHOST_STAKE, Math.max(1, Math.min(200, Number(limit) || 40))]);
  let ok = 0, skipped = 0;
  for (const r of rows) {
    try {
      if (await dailyAutoCount(r.user_id) >= AUTO_DAILY_LIMIT) { skipped += 1; continue; }
      await ghostBattle(r.user_id, { auto: true });
      ok += 1;
    } catch (_) {
      skipped += 1;
    }
  }
  return { ok, skipped };
}

module.exports = {
  DECK_SIZE, GHOST_STAKE, AUTO_DAILY_LIMIT, RARITIES, EFFECTS,
  RARITY_LABEL, EFFECT_LABEL, duelFieldsFromBody, publicCard,
  status, saveDeck, botBattle, ghostBattle, runAutoGhostBattles,
};
