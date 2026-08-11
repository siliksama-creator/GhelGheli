import React, { useEffect, useMemo, useState } from 'react';
import { asset, fa, req } from './lib/api.js';
import { useGameSession } from './gameSession.js';

const idOf = card => String(card?.cardTypeId || card?.id || '');
const num = value => Number(value || 0);
const rarityColor = rarity => ({
  legend: '#FF6B35', premium: '#FFD166', gold: '#F7C948',
  silver: '#C7D2FE', normal: '#22E7A6',
}[rarity] || '#22E7A6');

function modeCopy({ stake, vsBot, roomCode, initialStart }) {
  if (vsBot) return { title: 'تمرین با ربات', subtitle: 'رایگان و بدون جابه‌جایی امتیاز', color: '#22E7A6', icon: '🤖' };
  if (roomCode || initialStart?.matchMode === 'lobby') {
    return { title: 'لابی خصوصی', subtitle: stake ? `ورودی ${fa(stake)} امتیاز` : 'مسابقه دوستانه', color: '#A855F7', icon: '🔐' };
  }
  return { title: `نبرد آنلاین ${fa(stake)}`, subtitle: `باخت یعنی کسر ${fa(stake)} امتیاز`, color: stake === 1000 ? '#FFD166' : '#38BDF8', icon: '⚔️' };
}

function MiniStat({ label, value }) {
  return <span className="duelMini"><i>{label}</i>{fa(value)}</span>;
}

function HoloCard({ card, selected, disabled, compact = false, onClick }) {
  const color = rarityColor(card?.rarity);
  return (
    <button type="button"
      className={`duelCardV2${selected ? ' selected' : ''}${compact ? ' compact' : ''}`}
      style={{ '--duel-rarity': color }} disabled={disabled} onClick={onClick}>
      <span className="duelHolo" />
      <div className="duelArtV2">
        {card?.imageUrl
          ? <img src={asset(card.imageUrl)} alt={card.name || 'کارت'} loading="lazy" decoding="async" />
          : <span className="duelBotFace">{card?.id?.startsWith('bot-') ? '🤖' : '🃏'}</span>}
        <span className="duelPower">{fa(card?.power)}</span>
        {selected && <i className="duelPicked">✓</i>}
      </div>
      <b>{card?.name || 'کارت ناشناس'}</b>
      <div className="duelMeta">
        <span style={{ color }}>{card?.rarityLabel || card?.rarity}</span>
        <small>{card?.effectLabel || 'بدون افکت'}</small>
      </div>
      {!compact && <div className="duelStats">
        <MiniStat label="حمله" value={card?.attack} />
        <MiniStat label="دفاع" value={card?.defense} />
        <MiniStat label="سرعت" value={card?.speed} />
        <MiniStat label="تکنیک" value={card?.technique} />
        <MiniStat label="گل" value={card?.goalChance} />
      </div>}
    </button>
  );
}

function Lineup({ selected, cards, toggle }) {
  const byId = useMemo(() => new Map(cards.map(card => [idOf(card), card])), [cards]);
  const power = selected.reduce((sum, id) => sum + num(byId.get(id)?.power), 0);
  return (
    <section className="duelLineupV2">
      <div className="duelLineupTitle">
        <div><b>ترکیب اصلی</b><small>سه کارت با نقش‌های مکمل بچین</small></div>
        <strong>{fa(power)} <small>قدرت تیم</small></strong>
      </div>
      <div className="duelSlotsV2">
        {[0, 1, 2].map(index => {
          const id = selected[index];
          const card = id ? byId.get(id) : null;
          return <button type="button" key={index} className={card ? 'filled' : ''}
            onClick={() => card && toggle(id)}>
            {card ? <>
              {card.imageUrl ? <img src={asset(card.imageUrl)} alt="" /> : <span>🃏</span>}
              <b>{card.name}</b><i>{fa(card.power)}</i>
            </> : <><span>＋</span><small>کارت {fa(index + 1)}</small></>}
          </button>;
        })}
      </div>
    </section>
  );
}

function RoundReveal({ round, me }) {
  if (!round) return null;
  const mine = me === 'O' ? round.cardO : round.cardX;
  const theirs = me === 'O' ? round.cardX : round.cardO;
  const myPower = me === 'O' ? round.powerO : round.powerX;
  const theirPower = me === 'O' ? round.powerX : round.powerO;
  const mineWon = round.winner === me;
  return (
    <section className={`duelClash ${round.winner === 'DRAW' ? 'draw' : mineWon ? 'won' : 'lost'}`} key={round.round}>
      <HoloCard card={mine} compact disabled />
      <div className="duelClashCore">
        <span>راند {fa(round.round)}</span>
        <b>{round.title}</b>
        <strong>{fa(myPower)} <i>VS</i> {fa(theirPower)}</strong>
        <small>{round.winner === 'DRAW' ? 'برخورد برابر!' : mineWon ? 'این راند مال تو شد!' : 'حریف این راند را برد'}</small>
      </div>
      <HoloCard card={theirs} compact disabled />
    </section>
  );
}

function LiveArena({ session }) {
  const { phase, g, secondsLeft, move } = session;
  const state = g.state || {};
  const score = state.score || { X: 0, O: 0 };
  const mine = g.me || 'X';
  const opponent = mine === 'X' ? 'O' : 'X';
  const myCards = state.myDeck || [];
  const remaining = new Set((state.myRemainingCardIds || []).map(String));
  const myName = g.players?.[mine]?.nickname || 'تو';
  const opponentName = g.players?.[opponent]?.nickname || (g.vsBot ? 'ربات تاکتیکی' : 'حریف');

  return <div className="duelLiveArena">
    <header className="duelScoreV2">
      <div><small>{myName}</small><b>{fa(score[mine])}</b></div>
      <span><i>راند {fa(Math.min(3, num(state.roundIndex) + 1))} از ۳</i><strong>{state.roundTitle || 'پایان نبرد'}</strong></span>
      <div><small>{opponentName}</small><b>{fa(score[opponent])}</b></div>
    </header>

    <div className="duelRoundPips">{[0, 1, 2].map(index => <i key={index}
      className={index < num(state.roundIndex) ? 'done' : index === num(state.roundIndex) ? 'live' : ''} />)}</div>

    <div className="duelOpponentHand" aria-label={`${state.opponentRemainingCount || 0} کارت حریف باقی مانده`}>
      {Array.from({ length: state.opponentRemainingCount || 0 }, (_, index) =>
        <span key={index}><img src="/games/card_duel_glow.png" alt="پشت کارت حریف" /></span>)}
    </div>

    <RoundReveal round={state.lastRound} me={mine} />

    {phase === 'playing' && <section className="duelChoicePanel">
      <div className="duelChoicePrompt">
        <div><b>{state.iChose ? 'انتخابت قفل شد' : 'کارت این راند را انتخاب کن'}</b>
          <small>{state.waitingForOpponent ? 'منتظر انتخاب حریف…' : state.opponentLocked ? 'حریف انتخاب کرده؛ تصمیم بگیر!' : 'انتخاب‌ها مخفی و هم‌زمان هستند'}</small></div>
        <strong>{fa(secondsLeft)}<small>ثانیه</small></strong>
      </div>
      <div className="duelHandV2">
        {myCards.map(card => <HoloCard key={idOf(card)} card={card} compact
          disabled={state.iChose || !remaining.has(idOf(card))}
          onClick={() => move({ cardId: idOf(card) })} />)}
      </div>
    </section>}
  </div>;
}

function History({ battles }) {
  const labels = { bot: 'تمرین با ربات', online: 'نبرد آنلاین', lobby: 'لابی خصوصی' };
  return <section className="duelHistoryV2">
    <h3>آخرین نبردها</h3>
    {(battles || []).length ? (battles || []).slice(0, 6).map(battle => {
      const delta = num(battle.userDelta);
      const won = delta > 0 || !battle.stakePoints && num(battle.userScore) > num(battle.opponentScore);
      return <div className="duelHistoryRow card" key={battle.id}>
        <span className={won ? 'up' : delta < 0 ? 'down' : ''}>{won ? '▲' : delta < 0 ? '▼' : '◆'}</span>
        <div><b>{labels[battle.mode] || 'دوئل کارت'}</b><small>{fa(battle.userScore)} - {fa(battle.opponentScore)}</small></div>
        <strong className={delta >= 0 ? 'up' : 'down'}>{delta > 0 ? `+${fa(delta)}` : fa(delta)}</strong>
      </div>;
    }) : <div className="card pad center muted">اولین نبردت را شروع کن؛ تاریخچه اینجا ساخته می‌شود.</div>}
  </section>;
}

export default function CardDuelWeb({ api, token, stake = 0, vsBot = false,
  roomCode = null, externalSocket = null, initialStart = null, onBack }) {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [enabled, setEnabled] = useState(Boolean(initialStart));
  const mode = modeCopy({ stake, vsBot, roomCode, initialStart });
  const session = useGameSession(api, token, 'card_duel', stake, vsBot,
    roomCode, externalSocket, initialStart, enabled);

  const load = async () => {
    try {
      const response = await req('/api/card-duel', 'GET', null, token);
      setData(response);
      if (!enabled) {
        const owned = response?.playableCards || [];
        const prepared = response?.activeDeck?.cards || [];
        const initial = vsBot && owned.length < 3 ? (response?.practiceCards || []) : prepared;
        setSelected(initial.map(idOf).filter(Boolean).slice(0, 3));
      }
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [token]);
  useEffect(() => { if (session.phase === 'over') load(); }, [session.phase]);

  const ownedCards = data?.playableCards || [];
  const practiceFallback = vsBot && ownedCards.length < 3;
  const cards = practiceFallback ? (data?.practiceCards || []) : ownedCards;
  const toggle = id => setSelected(previous => previous.includes(id)
    ? previous.filter(value => value !== id)
    : previous.length < 3 ? [...previous, id] : previous);

  const saveAndStart = async () => {
    if (selected.length !== 3 || busy) return;
    setBusy(true); setError('');
    try {
      if (!practiceFallback) {
        await req('/api/card-duel/deck', 'POST', { cardTypeIds: selected }, token);
        await load();
      }
      setEnabled(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !initialStart) return <div className="card pad center">در حال آماده‌سازی آرنا…</div>;
  const activeGame = enabled && ['waiting', 'playing', 'over', 'error'].includes(session.phase);
  const winner = session.g.winner;
  const iWon = winner && winner === session.g.me;

  return <main className="duelPageV2" style={{ '--mode-color': mode.color }}>
    <header className="duelHeroV2">
      <button type="button" className="ghost" onClick={() => { session.leave(); onBack(); }}>← بازگشت</button>
      <div className="duelHeroIcon"><img src="/games/card_duel_glow.png" alt="" /></div>
      <div><span>GHELGHELI CARD ARENA</span><h1>دوئل کارت‌ها</h1><p>انتخاب مخفی، ضدترکیب هوشمند و سه راند نفس‌گیر</p></div>
      <aside><span>{mode.icon}</span><b>{mode.title}</b><small>{mode.subtitle}</small></aside>
    </header>

    {!activeGame && <>
      <section className="duelRuleStrip">
        <div><span>۱</span><b>سه کارت بچین</b><small>سرعت، تکنیک و گل را متعادل کن</small></div>
        <i>›</i><div><span>۲</span><b>مخفی انتخاب کن</b><small>حریف کارتت را تا قفل شدن نمی‌بیند</small></div>
        <i>›</i><div><span>۳</span><b>دو راند ببر</b><small>هر راند ویژگی متفاوتی می‌سنجد</small></div>
      </section>
      <Lineup selected={selected} cards={cards} toggle={toggle} />
      <button type="button" className="duelLaunch" disabled={busy || selected.length !== 3} onClick={saveAndStart}>
        <span>{busy ? 'در حال قفل ترکیب…' : `ورود به ${mode.title}`}</span>
        <small>{vsBot ? 'بدون ریسک امتیاز' : stake ? `ورودی ${fa(stake)} امتیاز` : 'مسابقه خصوصی'}</small>
      </button>
      {error && <div className="err duelMessage">{error}</div>}
      {practiceFallback && <div className="gameStakeNotice practice"><span>🎁</span><div>
        <b>دستهٔ تمرینی رایگان برای شروع سریع</b>
        <small>این کارت‌ها فقط مقابل ربات فعال‌اند؛ برای آنلاین باید سه کارت واقعی جمع کنی.</small>
      </div></div>}
      <h3 className="duelSectionTitle">{practiceFallback ? 'کارت‌های قرضی تمرین' : 'کلکسیون آماده نبرد'}</h3>
      {cards.length < 3 ? <div className="card pad center muted">برای بازی حداقل سه کارت فعال در کلکسیون لازم داری.</div>
        : <div className="duelGridV2">{cards.map(card => <HoloCard key={idOf(card)} card={card}
          selected={selected.includes(idOf(card))} onClick={() => toggle(idOf(card))} />)}</div>}
      <History battles={data?.recentBattles || []} />
    </>}

    {enabled && session.phase === 'waiting' && <section className="duelMatchmaking card">
      <div className="duelRadar"><img src="/games/card_duel_glow.png" alt="" /></div>
      <h2>{vsBot ? 'ربات تاکتیکی وارد آرنا می‌شود…' : 'در جستجوی حریف هم‌سطح…'}</h2>
      <p>ترکیب تو قفل و محفوظ است؛ هیچ‌کس کارت‌ها را قبل از نبرد نمی‌بیند.</p>
      <button type="button" onClick={() => { session.leave(); setEnabled(false); }}>لغو و ویرایش ترکیب</button>
    </section>}

    {enabled && session.phase === 'playing' && <LiveArena session={session} />}

    {enabled && session.phase === 'over' && <section className={`duelFinale ${winner === 'DRAW' ? 'draw' : iWon ? 'won' : 'lost'}`}>
      <LiveArena session={session} />
      <div className="duelFinalePanel">
        <span>{winner === 'DRAW' ? '🤝' : iWon ? '🏆' : '🛡️'}</span>
        <h2>{winner === 'DRAW' ? 'نبرد برابر!' : iWon ? 'فرمانروای آرنا شدی!' : 'این نبرد تمام شد؛ ترکیبت را هوشمندتر کن'}</h2>
        <p>{session.g.vsBot ? 'تمرین تمام شد؛ امتیازی جابه‌جا نشد.'
          : winner === 'DRAW' ? 'ورودی کامل هر دو نفر برمی‌گردد.'
            : iWon ? `پات مسابقه پس از کسر کارمزد برایت تسویه می‌شود.`
              : `${fa(session.g.stake || stake)} امتیاز ورودی از دست رفت.`}</p>
        <div><button className="main" type="button" onClick={() => {
          if (session.g.matchMode === 'lobby') onBack(); else if (vsBot) session.playBot(); else if (stake > 0) session.joinOnline(); else onBack();
        }}>{session.g.matchMode === 'lobby' ? 'بازگشت به لابی' : 'نبرد دوباره'}</button>
          <button type="button" onClick={() => { session.leave(); setEnabled(false); }}>تغییر ترکیب</button></div>
      </div>
    </section>}

    {enabled && session.phase === 'error' && <section className="card pad center">
      <div className="err">{session.error || error}</div>
      <button type="button" onClick={() => { session.leave(); setEnabled(false); }}>بازگشت به ترکیب</button>
    </section>}
  </main>;
}
