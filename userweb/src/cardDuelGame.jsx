import React, { useEffect, useMemo, useState } from 'react';
import { asset, avatarUrl, fa, req } from './lib/api.js';
import { primeImageCache } from './lib/imageCache.js';
import { useGameSession } from './gameSession.js';
import { CosmeticAvatarFrame, CosmeticFrame, DisplayName, RESULT_PALETTES } from './components/Cosmetics.jsx';
import CosmeticMatchEffect, { matchEffectSupports } from './components/MatchEffectVisual.jsx';
import PlayerCard from './components/PlayerCard.jsx';
import { cardIdOf, cardPowerOf } from './lib/cards.js';

const idOf = card => cardIdOf(card);
const num = value => Number(value || 0);

function DuelEffectVisual({ slug, finish = false }) {
  return <div aria-hidden="true" style={{position:'absolute',zIndex:20,inset:0,display:'grid',placeItems:'center',pointerEvents:'none'}}>
    <CosmeticMatchEffect slug={slug} mode={finish ? 'finish' : 'entry'} />
  </div>;
}
const rarityColor = rarity => ({
  legend: '#FF6B35', premium: '#A855F7', gold: '#F7C948',
  silver: '#C7D2FE', normal: '#22E7A6',
}[rarity] || '#22E7A6');

function modeCopy({ stake, vsBot, roomCode, initialStart }) {
  if (vsBot) return { title: 'تمرین با ربات', subtitle: 'رایگان و بدون جابه‌جایی امتیاز', color: '#22E7A6', icon: '🤖' };
  if (roomCode || initialStart?.matchMode === 'lobby') {
    return { title: 'لابی خصوصی', subtitle: stake ? `ورودی ${fa(stake)} امتیاز` : 'مسابقه دوستانه', color: '#A855F7', icon: '🔐' };
  }
  return { title: `نبرد آنلاین ${fa(stake)}`, subtitle: `باخت یعنی کسر ${fa(stake)} امتیاز`, color: stake === 1000 ? '#FFD166' : '#38BDF8', icon: '⚔️' };
}

function HoloCard({ card, selected, disabled, compact = false, onClick, frame, winner = false, loser = false, badge = '' }) {
  const color = rarityColor(card?.rarity || card?.duel_rarity);
  const activate = event => { if (!disabled) navigator.vibrate?.(18); onClick?.(event); };
  const cardView = <PlayerCard
    item={card}
    compact={compact}
    selected={selected}
    disabled={disabled}
    winner={winner}
    loser={loser}
    badge={badge}
    showStats={!compact}
    onClick={activate}
    className="duelPlayerCard"
  />;
  return frame
    ? <CosmeticFrame cosmetics={{frame}} className={`duelEquippedFrame${compact ? ' compact' : ''}`} style={{ '--duel-rarity': color }}>{cardView}</CosmeticFrame>
    : <div className={`duelCardShell${compact ? ' compact' : ''}`} style={{ '--duel-rarity': color }}>{cardView}</div>;
}

function Lineup({ selected, cards, toggle }) {
  const byId = useMemo(() => new Map(cards.map(card => [idOf(card), card])), [cards]);
  const power = selected.reduce((sum, id) => sum + cardPowerOf(byId.get(id)), 0);
  return (
    <section className="duelLineupV2">
      <div className="duelLineupTitle">
        <div><b>ترکیب اصلی</b><small>پنج کارت با نقش‌های مکمل بچین</small></div>
        <strong>{fa(power)} <small>قدرت تیم</small></strong>
      </div>
      <div className="duelSlotsV2">
        {[0, 1, 2, 3, 4].map(index => {
          const id = selected[index];
          const card = id ? byId.get(id) : null;
          return card ? (
            <HoloCard key={index} card={card} compact frame={null} onClick={() => toggle(id)} />
          ) : (
            <button type="button" key={index} className="duelEmptySlot" aria-label={`اسلات کارت ${fa(index + 1)}`}>
              <span>＋</span><small>کارت {fa(index + 1)}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function RoundReveal({ round, me, myFrame, opponentFrame }) {
  if (!round) return null;
  const mine = me === 'O' ? round.cardO : round.cardX;
  const theirs = me === 'O' ? round.cardX : round.cardO;
  const myPower = me === 'O' ? round.powerO : round.powerX;
  const theirPower = me === 'O' ? round.powerX : round.powerO;
  const myFocus = me === 'O' ? round.focusStatO : round.focusStatX;
  const theirFocus = me === 'O' ? round.focusStatX : round.focusStatO;
  const mineWon = round.winner === me;
  const draw = round.winner === 'DRAW';
  return (
    <section className={`duelClash ${draw ? 'draw' : mineWon ? 'won' : 'lost'}`} key={round.round}>
      <HoloCard card={mine} compact disabled frame={myFrame} winner={mineWon} loser={!draw && !mineWon} />
      <div className="duelClashCore">
        <span>راند {fa(round.round)} · {round.focusLabel || round.title}</span>
        <b>{round.title}</b>
        <strong>{fa(myPower)} <i>VS</i> {fa(theirPower)}</strong>
        <div className="duelReasonChips">
          <i>{round.focusLabel || 'ویژگی راند'}: {fa(myFocus)} در برابر {fa(theirFocus)}</i>
          <i>قدرت نهایی: {fa(Math.abs(myPower - theirPower))} اختلاف</i>
        </div>
        <em className="duelWinnerStamp">{draw ? 'DRAW' : mineWon ? 'WINNER' : 'LOSS'}</em>
        <small>{round.reason || (draw ? 'برخورد برابر!' : mineWon ? 'این راند مال تو شد!' : 'حریف این راند را برد')}</small>
        {round.cinematic && <p className="duelCinematic">{round.cinematic}</p>}
      </div>
      <HoloCard card={theirs} compact disabled frame={opponentFrame} winner={!draw && !mineWon} loser={mineWon} />
    </section>
  );
}

function DuelIdentity({ player, fallback }) {
  const p = player || {};
  const imageUrl = p.profileImageUrl || p.profile_image_url;
  const avatarKey = p.profileAvatarKey || p.profile_avatar_key;
  return <span className="duelIdentity">
    {p.isBot ? <span aria-hidden="true">🤖</span> : (
      <CosmeticAvatarFrame frame={p.cosmetics?.frame} style={{width:30,height:30,padding:p.cosmetics?.frame?2:0}}>
        <img src={imageUrl ? asset(imageUrl) : avatarUrl(avatarKey)} alt="" />
      </CosmeticAvatarFrame>
    )}
    <small><DisplayName name={p.nickname || fallback} cosmetics={p.cosmetics} level={p.level}/></small>
  </span>;
}

function LiveArena({ session }) {
  const { phase, g, secondsLeft, move } = session;
  const state = g.state || {};
  const score = state.score || { X: 0, O: 0 };
  const mine = g.me || 'X';
  const opponent = mine === 'X' ? 'O' : 'X';
  const myCards = state.myDeck || [];
  const remaining = new Set((state.myRemainingCardIds || []).map(String));
  const pendingId = String(state.myPendingCardId || '');
  const myName = g.players?.[mine]?.nickname || 'تو';
  const opponentName = g.players?.[opponent]?.nickname || (g.vsBot ? 'ربات تاکتیکی' : 'حریف');
  const myFrame = g.players?.[mine]?.cosmetics?.frame;
  const opponentFrame = g.players?.[opponent]?.cosmetics?.frame;

  const history = state.history || [];
  const lastWinner = state.lastRound?.winner;
  const myAhead = num(score[mine]) > num(score[opponent]);
  const theirAhead = num(score[opponent]) > num(score[mine]);

  return <div className="duelLiveArena">
    <header className="duelScoreV2">
      <div className={myAhead ? 'lead' : lastWinner === mine ? 'pulse' : ''}><DuelIdentity player={g.players?.[mine]} fallback={myName}/><b>{fa(score[mine])}</b></div>
      <span><i>راند {fa(Math.min(num(state.totalRounds) || 5, num(state.roundIndex) + 1))} از {fa(num(state.totalRounds) || 5)}</i><strong>{state.roundTitle || 'پایان نبرد'}</strong><small>{lastWinner === 'DRAW' ? 'راند قبل مساوی شد' : lastWinner === mine ? 'امتیاز این راند برای تو بود' : lastWinner ? 'حریف راند قبل را برد' : 'امتیازها را بالا نگه دار'}</small></span>
      <div className={theirAhead ? 'lead' : lastWinner && lastWinner !== mine && lastWinner !== 'DRAW' ? 'pulse' : ''}><DuelIdentity player={g.players?.[opponent]} fallback={opponentName}/><b>{fa(score[opponent])}</b></div>
    </header>

    <div className="duelRoundPips">{Array.from({length: num(state.totalRounds) || 5}, (_, index) => {
      const result = history[index]?.winner;
      const className = result
        ? result === 'DRAW' ? 'draw' : result === mine ? 'won' : 'lost'
        : index === num(state.roundIndex) ? 'live' : '';
      return <i key={index} className={className} title={`راند ${fa(index + 1)}`} />;
    })}</div>

    <div className="duelOpponentHand" aria-label={`${state.opponentRemainingCount || 0} کارت حریف باقی مانده`}>
      {Array.from({ length: state.opponentRemainingCount || 0 }, (_, index) =>
        <span key={index}><img src="/games/card_duel_glow.png" alt="پشت کارت حریف" /></span>)}
    </div>

    <RoundReveal round={state.lastRound} me={mine} myFrame={myFrame} opponentFrame={opponentFrame} />

    {phase === 'playing' && <section className="duelChoicePanel">
      <div className="duelChoicePrompt">
        <div><b>{state.iChose ? 'انتخابت قفل شد' : 'کارت این راند را انتخاب کن'}</b>
          <small>{state.waitingForOpponent ? 'منتظر انتخاب حریف…' : state.opponentLocked ? 'حریف انتخاب کرده؛ تصمیم بگیر!' : 'انتخاب‌ها مخفی و هم‌زمان هستند'}</small></div>
        <strong>{fa(secondsLeft)}<small>ثانیه</small></strong>
      </div>
      <div className="duelHandV2">
        {myCards.map(card => <HoloCard key={idOf(card)} card={card} compact frame={myFrame}
          selected={pendingId === idOf(card)}
          disabled={state.iChose || !remaining.has(idOf(card))}
          onClick={() => move({ cardId: idOf(card) })} />)}
      </div>
    </section>}
  </div>;
}

function resultMvp(state) {
  const candidates = (state?.history || []).flatMap(round => [round?.cardX, round?.cardO]).filter(Boolean);
  return candidates.sort((a, b) => num(b.power) - num(a.power))[0] || null;
}

function loadShopArtwork(slug) {
  if (!slug) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = `/shop/cosmetics-v3/${slug}.webp`;
  });
}

async function renderResultCard({ result, score, mvp, opponent, url, template }) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  const colors = RESULT_PALETTES[template] || ['#071522', '#35105D'];
  const artwork = await loadShopArtwork(template);
  if (artwork) {
    ctx.drawImage(artwork, 0, 0, 1080, 1080);
    ctx.fillStyle = 'rgba(2,6,23,.60)'; ctx.fillRect(0, 0, 1080, 1080);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 1080, 1080);
    gradient.addColorStop(0, colors[0]); gradient.addColorStop(0.55, '#17304C'); gradient.addColorStop(1, colors[1]);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1080, 1080);
  }
  ctx.strokeStyle = '#FFD166'; ctx.lineWidth = 10; ctx.strokeRect(35, 35, 1010, 1010);
  ctx.textAlign = 'center'; ctx.direction = 'rtl';
  ctx.fillStyle = '#38BDF8'; ctx.font = '700 34px sans-serif'; ctx.fillText('GHELGHELI CARD ARENA', 540, 135);
  ctx.fillStyle = '#FFFFFF'; ctx.font = '900 78px sans-serif'; ctx.fillText(result, 540, 265);
  ctx.fillStyle = '#FFD166'; ctx.font = '900 122px sans-serif'; ctx.fillText(score, 540, 440);
  ctx.fillStyle = '#E2E8F0'; ctx.font = '700 36px sans-serif'; ctx.fillText(`مقابل ${opponent}`, 540, 520);
  ctx.fillStyle = 'rgba(255,209,102,.15)'; ctx.fillRect(135, 600, 810, 190);
  ctx.strokeStyle = 'rgba(255,209,102,.65)'; ctx.lineWidth = 3; ctx.strokeRect(135, 600, 810, 190);
  ctx.fillStyle = '#FFD166'; ctx.font = '900 34px sans-serif'; ctx.fillText('MVP مسابقه', 540, 655);
  ctx.fillStyle = '#FFFFFF'; ctx.font = '900 50px sans-serif'; ctx.fillText(mvp?.name || 'ستاره آرنا', 540, 725);
  ctx.fillStyle = '#94A3B8'; ctx.font = '600 26px sans-serif'; ctx.fillText(`قدرت ${fa(mvp?.power || 0)}`, 540, 767);
  ctx.fillStyle = '#22E7A6'; ctx.font = '900 34px sans-serif'; ctx.fillText('جرأت داری؟ از لینک زیر مستقیم به چالشم بیا', 540, 885);
  ctx.fillStyle = '#CBD5E1'; ctx.font = '500 23px sans-serif'; ctx.direction = 'ltr'; ctx.fillText(url, 540, 940);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.94));
}

function DeckIntel({ insights, suggestedDeck, onApply }) {
  if (!insights && !suggestedDeck?.insights) return null;
  const active = insights || suggestedDeck?.insights;
  const strengths = active?.strengths || [];
  const warnings = active?.warnings || [];
  const order = active?.recommendedOrder || [];
  return <section className="duelIntel card">
    <div className="duelIntelHead">
      <div><b>تحلیل بالانس ترکیب</b><small>هوش آرنا قبل از شروع نقاط قوت و ضعف deck را خلاصه می‌کند</small></div>
      {suggestedDeck && <button type="button" className="ghost" onClick={onApply}>چیدن خودکار</button>}
    </div>
    {!!strengths.length && <div className="duelIntelFlow good">{strengths.map((item, index) => <i key={index}>{item}</i>)}</div>}
    {!!warnings.length && <div className="duelIntelFlow bad">{warnings.map((item, index) => <i key={index}>{item}</i>)}</div>}
    {!!order.length && <div className="duelIntelOrder">{order.map(item => <span key={`${item.round}-${item.cardTypeId}`}><b>راند {fa(item.round)}</b>{item.name}</span>)}</div>}
  </section>;
}

function History({ battles }) {
  const labels = { online: 'نبرد آنلاین', lobby: 'لابی خصوصی' };
  const rows = (battles || []).filter(battle => battle.mode !== 'bot').slice(0, 5);
  return <details className="duelHistoryV2">
    <summary>
      <div>
        <h3>آخرین نبردها{rows.length ? ` (${fa(rows.length)})` : ''}</h3>
        <small>فقط پنج بازی آنلاین اخیر؛ تمرین با ربات ثبت نمی‌شود</small>
      </div>
    </summary>
    {rows.length ? rows.map(battle => {
      const delta = num(battle.userDelta);
      const won = delta > 0 || !battle.stakePoints && num(battle.userScore) > num(battle.opponentScore);
      const settlement = battle.settlementStatus || 'settled';
      const settlementLabel = { pending: 'تسویه در انتظار', settled: 'تسویه‌شده', refunded: 'برگشت‌خورده' }[settlement];
      return <div className="duelHistoryRow card" key={battle.id}>
        <span className={won ? 'up' : delta < 0 ? 'down' : ''}>{won ? '▲' : delta < 0 ? '▼' : '◆'}</span>
        <div><b>{labels[battle.mode] || 'دوئل کارت'}</b><small>{fa(battle.userScore)} - {fa(battle.opponentScore)} · {settlementLabel}</small></div>
        <strong className={delta >= 0 ? 'up' : 'down'}>{delta > 0 ? `+${fa(delta)}` : fa(delta)}</strong>
      </div>;
    }) : <div className="card pad center muted">هنوز نبرد آنلاینی نداری. تاریخچه اینجا جمع نمی‌شود تا صفحه سبک بماند.</div>}
  </details>;
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
  const [sharing, setSharing] = useState(false);
  const [shareNotice, setShareNotice] = useState('');

  const shareResult = async () => {
    if (sharing) return;
    setSharing(true); setShareNotice('در حال ساخت لینک چالش…');
    try {
      const invite = await session.createChallenge();
      const scoreState = session.g.state?.score || {};
      const mine = session.g.me || 'X';
      const other = mine === 'X' ? 'O' : 'X';
      const myScore = num(scoreState[mine]);
      const theirScore = num(scoreState[other]);
      const title = session.g.winner === 'DRAW' ? 'نبرد برابر!' : session.g.winner === mine ? 'من آرنا را بردم!' : 'این بار حریف برد!';
      const mvp = resultMvp(session.g.state);
      const opponent = session.g.players?.[other]?.nickname || 'حریف';
      const text = `${title}\nنتیجه ${fa(myScore)} - ${fa(theirScore)}\nMVP: ${mvp?.name || 'ستاره آرنا'}\nمستقیم به چالشم بیا:`;
      const myCosmetics = session.g.players?.[mine]?.cosmetics || {};
      const blob = await renderResultCard({ result: title, score: `${fa(myScore)} - ${fa(theirScore)}`, mvp, opponent, url: invite.shareUrl, template: myCosmetics.resultTemplate });
      const file = blob ? new File([blob], 'ghelgheli-result.png', { type: 'image/png' }) : null;
      if (navigator.share && (!file || !navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: 'نتیجه دوئل قلقلی', text, url: invite.shareUrl, ...(file ? { files: [file] } : {}) });
        setShareNotice('کارت نتیجه آماده و ارسال شد ');
      } else {
        await navigator.clipboard.writeText(`${text}\n${invite.shareUrl}`);
        if (blob) {
          const href = URL.createObjectURL(blob);
          const anchor = document.createElement('a'); anchor.href = href; anchor.download = 'ghelgheli-result.png'; anchor.click();
          window.setTimeout(() => URL.revokeObjectURL(href), 2000);
        }
        setShareNotice('متن چالش کپی و کارت نتیجه دانلود شد');
      }
      req('/api/analytics/events', 'POST', {
        event: 'share', platform: 'web', gameId: 'card_duel',
        matchId: session.g.matchId, target: navigator.share ? 'system_share' : 'clipboard',
      }, token).catch(() => {});
    } catch (shareError) {
      if (shareError?.name !== 'AbortError') setShareNotice(shareError.message || 'اشتراک‌گذاری ناموفق بود');
    } finally { setSharing(false); }
  };

  const load = async () => {
    try {
      const response = await req('/api/card-duel', 'GET', null, token);
      setData(response);
      primeImageCache(response).catch(() => {});
      if (!enabled) {
        const owned = response?.playableCards || [];
        const prepared = response?.activeDeck?.cards || [];
        const initial = vsBot && owned.length < 5 ? (response?.practiceCards || []) : prepared;
        setSelected(initial.map(idOf).filter(Boolean).slice(0, 5));
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
  const practiceFallback = vsBot && ownedCards.length < 5;
  const cards = practiceFallback ? (data?.practiceCards || []) : ownedCards;
  const toggle = id => setSelected(previous => previous.includes(id)
    ? previous.filter(value => value !== id)
    : previous.length < 5 ? [...previous, id] : previous);
  const applySuggested = () => {
    const ids = (data?.suggestedDeck?.cardTypeIds || []).map(String).filter(Boolean).slice(0, 5);
    if (ids.length === 5) setSelected(ids);
  };

  const saveAndStart = async () => {
    if (selected.length !== 5 || busy) return;
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
  const myCosmetics = session.g.players?.[session.g.me]?.cosmetics || {};
  const resultPalette = RESULT_PALETTES[myCosmetics.resultTemplate] || ['#071522', '#FFD166'];

  return <main className="duelPageV2" style={{ '--mode-color': mode.color, position:'relative', overflow:'hidden' }}>
    {enabled && session.phase === 'playing' && myCosmetics.matchEffect && matchEffectSupports(myCosmetics.matchEffect, 'entry') && <DuelEffectVisual key={`${myCosmetics.matchEffect}-entry`} slug={myCosmetics.matchEffect} />}
    {enabled && session.phase === 'over' && iWon && myCosmetics.matchEffect && matchEffectSupports(myCosmetics.matchEffect, 'finish') && <DuelEffectVisual key={`${myCosmetics.matchEffect}-finish`} slug={myCosmetics.matchEffect} finish />}
    <header className="duelHeroV2">
      <button type="button" className="ghost" onClick={() => { session.leave(); onBack(); }}>← بازگشت</button>
      <div className="duelHeroIcon"><img src="/games/card_duel_glow.png" alt="" /></div>
      <div><span>GHELGHELI CARD ARENA</span><h1>دوئل کارت‌ها</h1><p>انتخاب مخفی، ضدترکیب هوشمند و پنج راند نفس‌گیر</p></div>
      <aside><span>{mode.icon}</span><b>{mode.title}</b><small>{mode.subtitle}</small></aside>
    </header>

    {!activeGame && <>
      <section className="duelRuleStrip">
        <div><span>۱</span><b>پنج کارت بچین</b><small>سرعت، تکنیک، حمله، دفاع و گل را متعادل کن</small></div>
        <i>›</i><div><span>۲</span><b>مخفی انتخاب کن</b><small>حریف کارتت را تا قفل شدن نمی‌بیند</small></div>
        <i>›</i><div><span>۳</span><b>۵ راند نفس‌گیر</b><small>هر راند ویژگی متفاوتی می‌سنجد</small></div>
      </section>
      <Lineup selected={selected} cards={cards} toggle={toggle} />
      <DeckIntel insights={data?.deckInsights} suggestedDeck={data?.suggestedDeck} onApply={applySuggested} />
      <button type="button" className="duelLaunch" disabled={busy || selected.length !== 5} onClick={saveAndStart}>
        <span>{busy ? 'در حال قفل ترکیب…' : `ورود به ${mode.title}`}</span>
        <small>{vsBot ? 'بدون ریسک امتیاز' : stake ? `ورودی ${fa(stake)} امتیاز` : 'مسابقه خصوصی'}</small>
      </button>
      {error && <div className="err duelMessage">{error}</div>}
      {practiceFallback && <div className="gameStakeNotice practice"><span>🎁</span><div>
        <b>دستهٔ تمرینی رایگان برای شروع سریع</b>
        <small>این کارت‌ها فقط مقابل ربات فعال‌اند؛ برای آنلاین باید پنج کارت واقعی جمع کنی.</small>
      </div></div>}
      <h3 className="duelSectionTitle">{practiceFallback ? 'کارت‌های قرضی تمرین' : 'کلکسیون آماده نبرد'}</h3>
      {cards.length < 5 ? <div className="card pad center muted">برای بازی حداقل پنج کارت فعال در کلکسیون لازم داری.</div>
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

    {enabled && session.connectionNotice && <div className="gameReconnectBanner">{session.connectionNotice}</div>}
    {enabled && session.phase === 'playing' && <LiveArena session={session} />}

    {enabled && session.phase === 'over' && <section className={`duelFinale ${winner === 'DRAW' ? 'draw' : iWon ? 'won' : 'lost'}`}
      style={{'--duel-result-a':resultPalette[0],'--duel-result-b':resultPalette[1],background:myCosmetics.resultTemplate
        ? `linear-gradient(rgba(2,6,23,.38),rgba(2,6,23,.76)),url('/shop/cosmetics-v3/${myCosmetics.resultTemplate}.webp') center/cover,${resultPalette[0]}`
        : `radial-gradient(circle at 50% 15%,${resultPalette[1]}44,transparent 42%),${resultPalette[0]}`}}>
      <LiveArena session={session} />
      <div className="duelFinalePanel">
        <span>{winner === 'DRAW' ? '🤝' : iWon ? '🏆' : '🛡️'}</span>
        <h2>{winner === 'DRAW' ? 'DRAW' : iWon ? 'VICTORY' : 'DEFEAT'}</h2>
        <p>{winner === 'DRAW' ? 'نبرد برابر!' : iWon ? 'فرمانروای آرنا شدی!' : 'این نبرد تمام شد؛ ترکیبت را هوشمندتر کن'}</p>
        <p>{session.g.vsBot ? 'تمرین تمام شد؛ امتیازی جابه‌جا نشد.'
          : winner === 'DRAW' ? 'ورودی کامل هر دو نفر برمی‌گردد.'
            : iWon ? `پات مسابقه پس از کسر کارمزد برایت تسویه می‌شود.`
              : `${fa(session.g.stake || stake)} امتیاز ورودی از دست رفت.`}</p>
        <div className={`duelSettlement ${session.g.settlementStatus || 'settled'}`}>
          {{ pending: ' در حال تسویه امن', settled: ' تسویه کامل شد', refunded: ' ورودی برگشت خورد' }[session.g.settlementStatus || 'settled']}
        </div>
        <div className="duelSharePreview">
          <b>کارت نتیجه + لینک چالش مستقیم</b>
          <small>MVP: {resultMvp(session.g.state)?.name || 'ستاره آرنا'}</small>
          <button type="button" onClick={shareResult} disabled={sharing}>{sharing ? 'در حال ساخت…' : ' اشتراک نتیجه و دعوت به چالش'}</button>
          {shareNotice && <i>{shareNotice}</i>}
        </div>
        <div><button className="main" type="button" disabled={session.rematchWaiting || !session.g.rematchAvailable} onClick={session.rematch}>
          {session.rematchWaiting ? 'منتظر قبول حریف…' : session.g.vsBot ? 'نبرد دوباره فوری' : 'نبرد دوباره با همین حریف'}
        </button>
          <button type="button" onClick={() => { session.leave(); setEnabled(false); }}>تغییر ترکیب</button></div>
      </div>
    </section>}

    {enabled && session.phase === 'error' && <section className="card pad center">
      <div className="err">{session.error || error}</div>
      <button type="button" onClick={() => { session.leave(); setEnabled(false); }}>بازگشت به ترکیب</button>
    </section>}
  </main>;
}
