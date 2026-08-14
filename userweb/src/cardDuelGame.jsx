import React, { useEffect, useMemo, useState } from 'react';
import { asset, avatarUrl, fa, req } from './lib/api.js';
import { primeImageCache } from './lib/imageCache.js';
import { useGameSession } from './gameSession.js';
import { CosmeticAvatarFrame, CosmeticFrame, DisplayName } from './components/Cosmetics.jsx';
import PlayerCard from './components/PlayerCard.jsx';
import { cardIdOf, cardPowerOf } from './lib/cards.js';
import { matchVerdictForViewer, resultMvp, roundEffectBonus, roundForViewer } from './lib/cardDuelLogic.js';

const idOf = card => cardIdOf(card);
const num = value => Number(value || 0);

function StakePayoutFlight({ amount, winner, mine, opponentRole, sequence, balanceAfter }) {
  if (!amount || !winner || !sequence) return null;
  const mineWon = winner === mine;
  const owner = mineWon ? 'تو' : opponentRole;
  return <div className="duelStakeFlight" key={`payout-${sequence}`}
    aria-live="assertive" aria-label={`${fa(amount)} امتیاز به ${owner} اضافه شد`}>
    <div className="duelCoinStream" aria-hidden="true">
      {Array.from({ length: 14 }, (_, index) => <i key={index} style={{
        '--coin-left': `${7 + index * 6.5}%`,
        '--coin-delay': `${index * 42}ms`,
      }}>＋</i>)}
    </div>
    <strong>+{fa(amount)}</strong>
    <small>{mineWon && balanceAfter != null && Number.isFinite(Number(balanceAfter))
      ? `موجودی جدید: ${fa(balanceAfter)}` : `امتیاز به ${owner} اضافه شد`}</small>
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
    // کارت‌های صحنه/دست نباید lazy بمانند؛ transform و فازهای پنهان
    // می‌توانند شروع دانلود را عقب بیندازند و انیمیشن جلوتر از عکس برسد.
    eager={compact || winner || loser}
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
        <div><b>ترکیب ۵ کارتی</b></div>
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

/**
 * فازهای نمایشِ سینماتیکِ یک راند.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * چرا فاز، و نه نمایشِ یکبارهٔ نتیجه
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * نسخهٔ قبلی همهٔ اطلاعاتِ راند را در یک فریم روی صفحه می‌ریخت: دو کارت،
 * دو عدد، برنده، دلیل. از نظر اطلاعاتی کامل بود ولی **هیچ لحظهٔ تعلیقی
 * نداشت** — کاربر نتیجه را می‌دانست قبل از اینکه اصلاً بفهمد چه اتفاقی
 * افتاده.
 *
 * حالا چهار فاز داریم و هر کدام دقیقاً یک چیز را فاش می‌کند:
 *
 *   ۱. `charge` (۴۵۰ms) — دو کارت از دو طرف وارد می‌شوند و به هم نزدیک
 *      می‌شوند. هنوز هیچ عددی معلوم نیست.
 *   ۲. `impact` (۳۰۰ms) — لحظهٔ برخورد: فلاش، لرزش، و آشکار شدنِ ویژگیِ
 *      این راند (سرعت؟ تکنیک؟).
 *   ۳. `numbers` (۵۵۰ms) — دو عددِ قدرت با شمارشِ صعودی بالا می‌روند.
 *      اینجاست که کاربر می‌فهمد کدام جلوتر است.
 *   ۴. `verdict` — مهرِ برنده و توضیح.
 *
 * ── چرا با CSS و نه یک کتابخانهٔ انیمیشن ──
 *
 * افزودنِ framer-motion یعنی ~۴۰KB به باندلی که الان ۱۳۴KB gzip است، برای
 * کاری که `animation-delay` رایگان انجام می‌دهد. مهم‌تر: انیمیشنِ CSS روی
 * ترد کامپوزیتور اجرا می‌شود، پس روی گوشیِ ضعیف هم فریم نمی‌اندازد.
 *
 * ⚠️ `key={round.round}` حیاتی است: بدونِ آن React همان DOM را بازاستفاده
 * می‌کند و انیمیشن برای راندِ دوم به بعد **اصلاً اجرا نمی‌شود**. این دقیقاً
 * همان دسته باگی است که «سبز به نظر می‌رسد ولی کاربر چیزی نمی‌بیند».
 */
const REVEAL_PHASES = [
  // ── زمان‌بندیِ نمایشِ نتیجه ──
  //
  // جمعِ سه فازِ اول باید کمتر از `resultHoldMs` سرور (۳۲۰۰ms) باشد
  // وگرنه راندِ بعد وسطِ انیمیشن شروع می‌شود — همان باگی که مالک
  // گزارش کرد. با ۶۰۰+۴۰۰+۹۰۰=۱۹۰۰ms، فازِ «verdict» ۱٫۹ ثانیه
  // فرصتِ دیده‌شدن دارد.
  { key: 'charge', ms: 600 },
  { key: 'impact', ms: 400 },
  { key: 'numbers', ms: 900 },
  { key: 'verdict', ms: 0 },
];

function useRevealPhase(roundKey) {
  const [phase, setPhase] = useState('charge');
  useEffect(() => {
    // راندِ تازه = شروع دوباره از فاز اول.
    setPhase('charge');
    if (roundKey == null) return undefined;
    const timers = [];
    let elapsed = 0;
    for (let i = 0; i < REVEAL_PHASES.length - 1; i += 1) {
      elapsed += REVEAL_PHASES[i].ms;
      const next = REVEAL_PHASES[i + 1].key;
      timers.push(setTimeout(() => setPhase(next), elapsed));
    }
    // پاکسازیِ تایمرها اجباری است: اگر کاربر وسطِ انیمیشن صفحه را ترک کند،
    // setState روی کامپوننتِ unmount شده هشدار می‌دهد و در حالتِ بدتر
    // نشتیِ حافظه می‌سازد.
    return () => timers.forEach(clearTimeout);
  }, [roundKey]);
  return phase;
}

/** شمارندهٔ صعودی برای عددِ قدرت — حسِ «محاسبه شدن» می‌دهد. */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⚠️⚠️ باگِ لو رفتنِ نتیجه — تعلیقِ کلِ انیمیشن را از بین می‌برد
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── چیزی که اندازه‌گیری نشان داد ──
 *
 * نمونه‌برداریِ ۱۵۰ میلی‌ثانیه‌ای از یک راندِ واقعی روی سایتِ زنده:
 *
 *     ۰٫۹۳s  phase-charge    nums=[۹۴, ۹۰]   ← عددِ نهایی!
 *     ۱٫۵۴s  phase-impact    nums=[۹۴, ۹۰]   ← هنوز همان
 *     ۱٫۸۴s  phase-numbers   nums=[۱۷, ۱۶]   ← تازه شمارش شروع شد
 *     ۲٫۳۰s  phase-numbers   nums=[۹۴, ۹۰]
 *
 * یعنی کاربر **۹۰۰ میلی‌ثانیه قبل از شروعِ شمارش، جوابِ نهایی را
 * می‌دید**. بعد اعداد به ۱۷ برمی‌گشتند و دوباره تا ۹۴ بالا می‌رفتند.
 * نه‌فقط تعلیق از بین می‌رفت، بلکه پرشِ عدد به عقب شبیهِ باگ بود.
 *
 * ── علت ──
 *
 * مقدارِ اولیه `useState(active ? 0 : target)` بود و شاخهٔ `!active`
 * مستقیم `setShown(target)` می‌کرد. `active` فقط در فازِ `numbers`
 * درست است، پس در `charge` و `impact` عددِ نهایی روی صفحه بود.
 *
 * ── اپِ اندروید همین را درست دارد ──
 *
 *     Opacity(opacity: visible ? 1 : 0, child: Text(...))
 *
 * یعنی عدد تا لحظهٔ فاشِ رسمی **اصلاً دیده نمی‌شود**. حالا وب هم همین
 * قرارداد را دارد: پیش از فازِ اعداد، جای عدد با «؟» پر می‌شود تا
 * چیدمان نپرد ولی جواب لو نرود.
 *
 * ⚠️ چرا «؟» و نه رشتهٔ خالی: اگر عرضِ عنصر صفر شود، در لحظهٔ ظاهر
 *    شدنِ عدد کلِ ردیف جابه‌جا می‌شود و پرشِ چیدمان حس می‌شود.
 */
function CountUp({ value, active, revealed = true }) {
  const target = num(value);
  const [shown, setShown] = useState(active ? 0 : target);
  useEffect(() => {
    if (!active) { setShown(target); return undefined; }
    let raf = 0;
    const started = performance.now();
    const duration = 520;
    const tick = (now) => {
      const t = Math.min(1, (now - started) / duration);
      // easeOutCubic: سریع شروع می‌شود و نرم می‌ایستد.
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active]);
  // هنوز فاش نشده: جای عدد را نگه دار ولی مقدارش را نگو.
  if (!revealed) return <span className="duelPowerHidden" aria-hidden="true">؟</span>;
  return <>{fa(shown)}</>;
}

function RoundReveal({ round, me, myFrame, opponentFrame, opponentRole = 'حریف' }) {
  const phase = useRevealPhase(round ? round.round : null);
  if (!round) return null;
  const view = roundForViewer(round, me);
  const { mine, theirs, myPower, theirPower, mineWon, draw, contractValid } = view;
  const outcome = draw ? 'draw' : mineWon ? 'won' : 'lost';
  const showNumbers = phase === 'numbers' || phase === 'verdict';
  const showVerdict = phase === 'verdict';
  const verdict = !contractValid
    ? 'خطای همگام‌سازی'
    : draw ? 'مساوی' : mineWon ? '+۱ تو' : `+۱ ${opponentRole}`;
  const summary = draw
    ? `عدد نهایی تو و ${opponentRole} هر دو ${fa(myPower)} شد؛ امتیازی اضافه نشد.`
    : mineWon
      ? `کارت تو «${mine?.name || 'بدون نام'}» با ${fa(myPower)} در برابر ${fa(theirPower)} برد.`
      : `کارت ${opponentRole} «${theirs?.name || 'بدون نام'}» با ${fa(theirPower)} در برابر ${fa(myPower)} برد.`;
  return (
    <section
      className={`duelClash duelClashCine ${outcome} phase-${phase}${contractValid ? '' : ' invalid'}`}
      key={round.round}
      data-outcome={outcome}
      aria-label={`نتیجه راند ${fa(round.round)}؛ ${summary}`}
    >
      <span className="duelImpactRing" aria-hidden="true" />
      <span className="duelImpactFlash" aria-hidden="true" />
      {showVerdict && !draw && contractValid
        && <span className={`duelPointFlight ${mineWon ? 'mine' : 'theirs'}`} aria-hidden="true">+۱</span>}

      <div className="duelClashSide mine">
        <span className={`duelSideOwner${showVerdict && mineWon ? ' winner' : ''}`}>تو</span>
        <HoloCard card={mine} compact disabled frame={myFrame}
          winner={showVerdict && mineWon} loser={showVerdict && !draw && !mineWon} />
      </div>

      <div className="duelClashCore">
        <span>{fa(round.round)} • {round.focusLabel || round.title}</span>
        <strong className="duelPowerDuel" aria-live="polite">
          <span className={`duelPowerOwner mine ${showVerdict && mineWon ? 'lead' : ''}`}>
            <small>تو</small>
            <em className="duelPowerNum">
              <CountUp value={myPower} active={showNumbers} revealed={showNumbers} />
            </em>
          </span>
          <span className={`duelPowerOwner theirs ${showVerdict && !draw && !mineWon ? 'lead' : ''}`}>
            <small>{opponentRole}</small>
            <em className="duelPowerNum">
              <CountUp value={theirPower} active={showNumbers} revealed={showNumbers} />
            </em>
          </span>
        </strong>
        {showVerdict && <em className="duelWinnerStamp">{verdict}</em>}
      </div>

      <div className="duelClashSide theirs">
        <span className={`duelSideOwner${showVerdict && !draw && !mineWon ? ' winner' : ''}`}>
          {opponentRole}
        </span>
        <HoloCard card={theirs} compact disabled frame={opponentFrame}
          winner={showVerdict && !draw && !mineWon} loser={showVerdict && mineWon} />
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// بنرِ معیارِ راند — نسخهٔ وب، مو‌به‌مو مثلِ اندروید
// ═══════════════════════════════════════════════════════════════════════════
//
// گزارشِ مالک: «هر راند نوشته میشه که اون راند سر چی مبارزه میشه ولی انقدر
// کوچیک بدون هیچ انیمیشنی هستش که باعث میشه اصلا دیده نشه».
//
// این فقط زیباسازی نیست: عدد خامِ ویژگی و افکتِ آشکار با هم عدد نهایی را
// می‌سازند. همان عدد نهایی حکم را می‌دهد؛ این بنر قرارداد را پیش از انتخاب
// بزرگ و روشن اعلام می‌کند تا هیچ قانون پنهانی باقی نماند.
const FOCUS_META = {
  speed: { name: 'سرعت', icon: '⚡', color: '#38BDF8' },
  technique: { name: 'تکنیک', icon: '✨', color: '#A855F7' },
  attack: { name: 'حمله', icon: '🔥', color: '#FB7185' },
  defense: { name: 'دفاع', icon: '🛡️', color: '#22E7A6' },
  goalChance: { name: 'شانس گل', icon: '⚽', color: '#FFD166' },
};



// ═══════════════════════════════════════════════════════════════════════════
// اعلانِ سینماییِ شروعِ راند — وسطِ صفحه (هم‌تراز با اندروید)
// ═══════════════════════════════════════════════════════════════════════════
//
// خواستهٔ مالک: «وقتی راند شروع میشه اینکه مبارزه هر راند سر چی هستش باید
// با انیمیشن زیبا وسط صفحه نشون داده بشه».
//
// چرا overlay و نه بزرگ‌کردنِ همان بنر: بنر در جریانِ صفحه است و ارتفاع
// می‌گیرد — همان چیزی که کاربر را مجبور به اسکرول می‌کرد. این نسخه
// `position:fixed` است، ۲.۸ ثانیه معیار و شمارش را نگه می‌دارد، و صفر
// پیکسل از چیدمان می‌گیرد.
//
// این صحنه تا پایان مکث ورودی را می‌بندد؛ تایمر هم از سرور یخ است، پس
// کاربر پیش از دیدن معیار نه انتخاب گمراه‌کننده دارد و نه زمان از دست می‌دهد.
//
// ⚠️ `key` روی شمارهٔ راند حیاتی است: بدونِ آن React همان گره را نگه
//    می‌دارد و انیمیشن فقط یک بار در کلِ بازی اجرا می‌شود.
function RoundIntroOverlay({ focus, roundNumber, totalRounds }) {
  const stat = focus?.stat || '';
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!stat) return undefined;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2800);
    return () => clearTimeout(t);
  }, [stat, roundNumber]);

  if (!stat || !visible) return null;
  const meta = FOCUS_META[stat] || {};
  const color = meta.color || '#38BDF8';
  return (
    <div className="duelRoundIntro" key={`intro-${roundNumber}-${stat}`}
      style={{ '--focus-color': color }} aria-live="assertive"
      aria-label={`راند ${roundNumber} از ${totalRounds}، معیار ${meta.name || ''}. ${focus?.hint || ''}`}>
      <div className="duelIntroShards" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => <i key={index} style={{
          '--shard-angle': `${index * 30}deg`,
          '--shard-delay': `${index * 24}ms`,
        }} />)}
      </div>
      <div className="duelRoundIntroInner">
        <small>راند {fa(roundNumber)} از {fa(totalRounds)}</small>
        <span className="duelRoundIntroIcon" aria-hidden="true">
          <i>{meta.icon || '★'}</i>
        </span>
        <label>معیار این راند</label>
        <b>{meta.name || ''}</b>
        <em>بالاترین عدد برنده است</em>
        <div className="duelIntroBeats" aria-hidden="true">
          <span>۳</span><span>۲</span><span>۱</span><strong>انتخاب!</strong>
        </div>
      </div>
    </div>
  );
}

/** عددِ نهاییِ تعیین‌کننده روی کارتِ دست: ویژگی + افکت آشکار. */
function FocusStatRibbon({ card, stat, roundIndex = 0, previousRoundWon = false }) {
  if (!stat) return null;
  const meta = FOCUS_META[stat] || {};
  const fallbackKey = {
    speed: 'duel_speed', technique: 'duel_technique', attack: 'duel_attack',
    defense: 'duel_defense', goalChance: 'duel_goal_chance',
  }[stat];
  const value = num(card?.[stat] ?? card?.[fallbackKey]);
  const bonus = roundEffectBonus(card, roundIndex, previousRoundWon);
  const finalValue = value + bonus;
  return (
    <span className="duelFocusRibbon" style={{ '--focus-color': meta.color || '#38BDF8' }}
      aria-label={bonus ? `${fa(value)} به علاوه افکت ${fa(bonus)} برابر ${fa(finalValue)}` : `عدد نهایی ${fa(finalValue)}`}>
      <i aria-hidden="true">{meta.icon || '★'}</i>
      {bonus ? `${fa(value)}+${fa(bonus)}=${fa(finalValue)}` : fa(finalValue)}
    </span>
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

// HUD زنده فقط در phase=playing دیده می‌شود. نتیجه یک Finale مستقل است؛
// هیچ اسکوربورد یا برخوردی در پایان دوباره رندر نمی‌شود.
function LiveArena({ session }) {
  const { phase, g, secondsLeft, holding, resultHolding, move } = session;
  const state = g.state || {};
  const score = state.score || { X: 0, O: 0 };
  const mine = g.me || 'X';
  const opponent = mine === 'X' ? 'O' : 'X';
  const myCards = state.myDeck || [];
  const remaining = new Set((state.myRemainingCardIds || []).map(String));
  const pendingId = String(state.myPendingCardId || '');
  // کارت‌های مصرف‌شده دیگر تصمیمی در این راند نیستند. حذفشان از دستِ زنده
  // باعث می‌شود پنج کارتِ راند اول هم بدون اسکرول در یک fan ثابت جا شوند.
  const handCards = myCards.filter(card => remaining.has(idOf(card)) || pendingId === idOf(card));
  const myName = g.players?.[mine]?.nickname || 'تو';
  const opponentName = g.players?.[opponent]?.nickname || (g.vsBot ? 'ربات تاکتیکی' : 'حریف');
  const opponentRole = g.vsBot ? 'ربات' : 'حریف';
  const myFrame = g.players?.[mine]?.cosmetics?.frame;
  const opponentFrame = g.players?.[opponent]?.cosmetics?.frame;

  const history = state.history || [];
  const lastWinner = state.lastRound?.winner;
  const myAhead = num(score[mine]) > num(score[opponent]);
  const theirAhead = num(score[opponent]) > num(score[mine]);

  return <div className="duelLiveArena">
    <header className="duelScoreV2"
      aria-label={`امتیاز تو ${fa(score[mine])}، امتیاز ${opponentRole} ${fa(score[opponent])}`}>

      <div className={`mine ${myAhead ? 'lead' : lastWinner === mine ? 'pulse' : ''}`}>
        <DuelIdentity player={g.players?.[mine]} fallback={myName}/>
        <small>تو</small><b>{fa(score[mine])}</b>
      </div>
      {/* ⚠️ در پایانِ بازی «راند ۵ از ۵» و «امتیاز راند قبل برای تو بود»
          هر دو بی‌معنی‌اند: بازی تمام شده و کاربر عددِ نهایی می‌خواهد.
          همین ناسازگاری در اسکرین‌شاتِ مالک دیده می‌شد. */}
      <span>
        <i>{fa(Math.min(num(state.totalRounds) || 5, num(state.roundIndex) + 1))}/{fa(num(state.totalRounds) || 5)}</i>
        <strong>{state.roundTitle || 'پایان نبرد'}</strong>
      </span>
      <div className={`theirs ${theirAhead ? 'lead' : lastWinner && lastWinner !== mine && lastWinner !== 'DRAW' ? 'pulse' : ''}`}>
        <DuelIdentity player={g.players?.[opponent]} fallback={opponentName}/>
        <small>{opponentRole}</small><b>{fa(score[opponent])}</b>
      </div>
    </header>

    <div className="duelRoundPips">{Array.from({length: num(state.totalRounds) || 5}, (_, index) => {
      const result = history[index]?.winner;
      const className = result
        ? result === 'DRAW' ? 'draw' : result === mine ? 'won' : 'lost'
        : index === num(state.roundIndex) ? 'live' : '';
      return <i key={index} className={className} title={`راند ${fa(index + 1)}`} />;
    })}</div>

    {/* ── چرا بنرِ افقی جای خود را به اعلانِ وسطِ صفحه داد ──
        بنر ~۹۰ پیکسل ارتفاع می‌گرفت و از دلایلِ اصلیِ اسکرولِ صفحهٔ بازی
        بود. اعلانِ تازه `position:fixed` است: دیده می‌شود ولی هیچ فضایی
        از چیدمان نمی‌گیرد. اطلاعاتِ ماندگار روی خودِ کارت‌ها
        (`FocusStatRibbon`) و در نوارِ انتخاب باقی است. */}
    {/* ⚠️ اعلانِ راندِ تازه تا وقتی نتیجهٔ راندِ قبل روی صفحه است
        نمایش داده نمی‌شود. قبلاً بلافاصله می‌آمد و انیمیشنِ نتیجه را
        قطع می‌کرد — همان «سریع میاد بدون اینکه لود بشه میره». */}
    {phase === 'playing' && !resultHolding && holding && (
      <RoundIntroOverlay
        focus={state.roundFocus}
        roundNumber={Math.min(num(state.totalRounds) || 5, num(state.roundIndex) + 1)}
        totalRounds={num(state.totalRounds) || 5}
      />
    )}

    {/* ⚠️ در صفحهٔ پایان این صحنه دقیقاً بالای پنلِ VICTORY می‌نشست و
        «دو بلوک نتیجه هم‌زمان» می‌ساخت. جزئیاتِ راندِ پنجم از بین
        نمی‌رود: در «جزئیات راندها» همان پایین هست. */}
    {resultHolding && <RoundReveal round={state.lastRound} me={mine} myFrame={myFrame}
      opponentFrame={opponentFrame} opponentRole={opponentRole} />}

    {phase === 'playing' && <section className="duelChoicePanel">
      <div className="duelChoicePrompt">
        {/* نشانِ ماندگارِ ویژگیِ راند: اعلانِ وسطِ صفحه دو ثانیه‌ای است،
            این تا آخرِ راند می‌ماند تا کسی که اعلان را ندید هم بداند
            دنبالِ کدام عدد بگردد. */}
        {state.roundFocus?.stat && FOCUS_META[state.roundFocus.stat] && (
          <span className="duelFocusPill"
            style={{ '--focus-color': FOCUS_META[state.roundFocus.stat].color }}>
            <i aria-hidden="true">{FOCUS_META[state.roundFocus.stat].icon}</i>
            {FOCUS_META[state.roundFocus.stat].name}
          </span>
        )}
        <div><b>{state.iChose ? 'قفل شد' : state.opponentLocked ? 'حریف آماده‌ست' : 'کارت را بزن'}</b></div>
        {/* عددِ یخ‌زده بدونِ نشانه شبیهِ «هنگ» است؛ آیکنِ مکث می‌گوید
            عمدی است. */}
        <strong className={holding ? 'isHolding' : ''}
          aria-label={holding ? 'مکث' : `${secondsLeft} ثانیه`}>
          {holding ? <i className="duelHoldIcon" aria-hidden="true">⏸</i> : fa(secondsLeft)}
        </strong>
      </div>
      <div className="duelHandV2" style={{ '--hand-count': Math.max(1, handCards.length) }}>
        {handCards.map((card, index) => (
          <div className="duelHandCard" key={idOf(card)} style={{
            '--hand-index': index,
            '--hand-angle': `${(index - (handCards.length - 1) / 2) * 0.8}deg`,
          }}>
            <HoloCard card={card} compact frame={myFrame}
              selected={pendingId === idOf(card)}
              disabled={holding || state.iChose || !remaining.has(idOf(card))}
              onClick={() => move({ cardId: idOf(card) })} />
            <FocusStatRibbon card={card} stat={state.roundFocus?.stat}
              roundIndex={num(state.roundIndex)} previousRoundWon={lastWinner === mine} />
          </div>
        ))}
      </div>
    </section>}
  </div>;
}

async function renderResultCard({ result, score, mvp, opponent, url }) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 1080, 1080);
  gradient.addColorStop(0, '#071522');
  gradient.addColorStop(0.55, '#17304C');
  gradient.addColorStop(1, '#35105D');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1080, 1080);
  ctx.strokeStyle = '#FFD166'; ctx.lineWidth = 10; ctx.strokeRect(35, 35, 1010, 1010);
  ctx.textAlign = 'center'; ctx.direction = 'rtl';
  ctx.fillStyle = '#38BDF8'; ctx.font = '700 34px sans-serif'; ctx.fillText('GHELGHELI CARD ARENA', 540, 135);
  ctx.fillStyle = '#FFFFFF'; ctx.font = '900 78px sans-serif'; ctx.fillText(result, 540, 265);
  ctx.fillStyle = '#FFD166'; ctx.font = '900 82px sans-serif'; ctx.fillText(score, 540, 440);
  ctx.fillStyle = '#E2E8F0'; ctx.font = '700 36px sans-serif'; ctx.fillText(`مقابل ${opponent}`, 540, 520);
  ctx.fillStyle = 'rgba(255,209,102,.15)'; ctx.fillRect(135, 600, 810, 190);
  ctx.strokeStyle = 'rgba(255,209,102,.65)'; ctx.lineWidth = 3; ctx.strokeRect(135, 600, 810, 190);
  ctx.fillStyle = '#FFD166'; ctx.font = '900 34px sans-serif'; ctx.fillText('MVP مسابقه', 540, 655);
  ctx.fillStyle = '#FFFFFF'; ctx.font = '900 50px sans-serif'; ctx.fillText(mvp?.name || 'ستاره آرنا', 540, 725);
  ctx.fillStyle = '#94A3B8'; ctx.font = '600 26px sans-serif'; ctx.fillText(`عدد راند ${fa(mvp?.mvpRoundPower || 0)}`, 540, 767);
  ctx.fillStyle = '#22E7A6'; ctx.font = '900 34px sans-serif'; ctx.fillText('جرأت داری؟ از لینک زیر مستقیم به چالشم بیا', 540, 885);
  ctx.fillStyle = '#CBD5E1'; ctx.font = '500 23px sans-serif'; ctx.direction = 'ltr'; ctx.fillText(url, 540, 940);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png', 0.94));
}

function DeckIntel({ insights, suggestedDeck, onApply }) {
  if (!insights && !suggestedDeck?.insights) return null;
  const active = insights || suggestedDeck?.insights || {};
  const warnings = active.warnings || [];
  const strengths = active.strengths || [];
  const order = active.recommendedOrder || [];
  const warning = warnings[0] || '';
  const strength = strengths[0] || 'ترکیب متعادل';
  const opener = order[0]?.name || '';
  const summary = `${warning || strength}${opener ? ` • شروع: ${opener}` : ''}`;
  return <section className={`duelIntelCompact card ${warning ? 'warn' : 'ready'}`}>
    <span aria-hidden="true">{warning ? '⚡' : '✓'}</span>
    <div><b>{warning ? 'یک اصلاح پیشنهادی' : 'ترکیب آماده'}</b><small>{summary}</small></div>
    {suggestedDeck && <button type="button" className="ghost" aria-label="چیدن خودکار"
      onClick={onApply}>✦</button>}
  </section>;
}

function RoundTimeline({ history, mine, opponentRole = 'حریف' }) {
  if (!history?.length) return null;
  return <details className="duelTimelineV2">
    <summary>
      <div>
        <h3>جزئیات راندها</h3>
      </div>
    </summary>
    {history.map((round, index) => {
      const view = roundForViewer(round, mine);
      const { mineWon, draw, myPower, theirPower,
        myBreakdown: mineBreak, theirBreakdown: theirBreak } = view;
      const accent = draw ? '#FFD166' : mineWon ? '#22E7A6' : '#FB7185';
      return <article className="duelTimelineRow" key={round.seed || index} style={{ '--timeline-accent': accent }}>
        <header>
          <b>راند {fa(round.round || index + 1)} · {round.focusLabel || round.title}</b>
          <span>{draw ? 'مساوی' : mineWon ? '+۱ برای تو' : `+۱ برای ${opponentRole}`}</span>
        </header>
        <strong>تو {fa(myPower)} <i>•</i> {opponentRole} {fa(theirPower)}</strong>
        <div className="duelTimelineBreaks">
          <span><b>تو</b><small>{fa(mineBreak?.focus ?? 0)}{num(mineBreak?.effectBonus) ? ` + افکت ${fa(mineBreak.effectBonus)}` : ''} = {fa(mineBreak?.total ?? myPower)}</small></span>
          <span><b>{opponentRole}</b><small>{fa(theirBreak?.focus ?? 0)}{num(theirBreak?.effectBonus) ? ` + افکت ${fa(theirBreak.effectBonus)}` : ''} = {fa(theirBreak?.total ?? theirPower)}</small></span>
        </div>
        <p>{round.reason}</p>
      </article>;
    })}
  </details>;
}

function History({ battles }) {
  const labels = { online: 'نبرد آنلاین', lobby: 'لابی خصوصی' };
  const rows = (battles || []).filter(battle => battle.mode !== 'bot').slice(0, 5);
  return <details className="duelHistoryV2">
    <summary>
      <div>
        <h3>آخرین نبردها{rows.length ? ` (${fa(rows.length)})` : ''}</h3>
      </div>
    </summary>
    {rows.length ? rows.map(battle => {
      const delta = num(battle.userDelta);
      const won = delta > 0 || !battle.stakePoints && num(battle.userScore) > num(battle.opponentScore);
      const settlement = battle.settlementStatus || 'settled';
      const settlementLabel = { pending: 'تسویه در انتظار', settled: 'تسویه‌شده', refunded: 'برگشت‌خورده' }[settlement];
      return <div className="duelHistoryRow card" key={battle.id}>
        <span className={won ? 'up' : delta < 0 ? 'down' : ''}>{won ? '▲' : delta < 0 ? '▼' : '◆'}</span>
        <div><b>{labels[battle.mode] || 'دوئل کارت'}</b><small>تو {fa(battle.userScore)} · حریف {fa(battle.opponentScore)} · {settlementLabel}</small></div>
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
      const opponentRole = session.g.vsBot ? 'ربات' : 'حریف';
      const opponent = session.g.players?.[other]?.nickname || opponentRole;
      const scoreLabel = `تو ${fa(myScore)} — ${opponentRole} ${fa(theirScore)}`;
      const text = `${title}\nنتیجه: ${scoreLabel}\nMVP: ${mvp?.name || 'ستاره آرنا'} (عدد راند ${fa(mvp?.mvpRoundPower || 0)})\nمستقیم به چالشم بیا:`;
      const blob = await renderResultCard({ result: title, score: scoreLabel, mvp, opponent, url: invite.shareUrl });
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
  // deck در game:start و کارت‌های revealشده در پایان هر راند می‌رسند.
  // prewarm فقط با تغییر شماره راند اجرا می‌شود، نه با هر تیکِ ساعت.
  const revealedRound = session.g.state?.lastRound?.round ?? -1;
  useEffect(() => {
    primeImageCache(session.g.state).catch(() => {});
  }, [session.g.matchId, revealedRound]);

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
  const resultMine = session.g.me || 'X';
  const resultOther = resultMine === 'X' ? 'O' : 'X';
  const resultScore = session.g.state?.score || {};
  const resultOpponentRole = session.g.vsBot ? 'ربات' : 'حریف';
  const finalVerdict = matchVerdictForViewer({
    winner,
    me: resultMine,
    finishReason: session.g.finishReason,
    opponentRole: resultOpponentRole,
  });
  const iWon = finalVerdict.iWon;
  const resultPalette = ['#071522', '#FFD166'];

  return <main className="duelPageV2" style={{ '--mode-color': mode.color, position:'relative', overflow:'hidden' }}>
    {/* ═══════════════════════════════════════════════════════════════════
        سربرگ: بزرگ در چیدمان، نوارِ باریک هنگام بازی
        ═══════════════════════════════════════════════════════════════════

        ── خواستهٔ مالک ──
        «حذف کامل نیاز به اسکرول در صفحهٔ بازی» — سه بار تکرار شده.

        ── اندازه‌گیری روی گوشیِ ۳۹۰×۸۴۴ ──
        صفحهٔ بازی ۹۹۶px بود در نمای ۸۴۴px، یعنی ۱۵۲px اضافه. و
        `duelHeroV2` دقیقاً **۲۰۸px** از آن را می‌گرفت.

        آن بنر (لوگوی متحرک ۹۰px + تیتر ۳۶px + شعار + کارتِ حالت) در
        صفحهٔ چیدمان معنا دارد؛ ولی وقتی بازی شروع شده و کاربر باید
        کارت انتخاب کند و تایمر را ببیند، فقط جا اشغال می‌کند.

        نسخهٔ اندروید همین کار را با `_CompactMatchBar` انجام داد
        (۹۶dp → ۳۴dp). این همان الگو در وب است تا دو کلاینت یکی باشند.

        ۲۰۸px → ۴۴px یعنی **۱۶۴px آزاد** — بیشتر از ۱۵۲px کسری. */}
    {activeGame ? (
      <header className="duelCompactBar">
        <button type="button" className="ghost" aria-label="بازگشت"
          onClick={() => { session.leave(); onBack(); }}>←</button>
        <b>دوئل کارت‌ها</b>
        <span>{mode.icon} {mode.title}</span>
      </header>
    ) : (
      <header className="duelHeroV2">
        <button type="button" className="ghost" onClick={() => { session.leave(); onBack(); }}>← بازگشت</button>
        <div className="duelHeroIcon"><img src="/games/card_duel_glow.png" alt="" /></div>
        <div><h1>دوئل کارت‌ها</h1></div>
        <aside><span>{mode.icon}</span><b>{mode.title}</b><small>{mode.subtitle}</small></aside>
      </header>
    )}

    {!activeGame && <>
      {/* راهنمای سه‌مرحله‌ای: بار اول باز، بعد از آن جمع.
          ۱۵۲px برای متنی که کاربرِ تکراری از بر است، هزینهٔ زیادی است.
          `open` فقط وقتی است که کاربر هنوز کارتی نچیده — یعنی احتمالاً
          تازه‌وارد. کسی که ترکیب دارد، راهنما را جمع می‌بیند. */}
      {/* ⚠️ پیش‌فرضِ `open` برداشته شد.
          حتی تک‌ستونه، این راهنما روی موبایل **۳۶۶px** می‌گیرد — یعنی
          ۴۳٪ کلِ نما. کاربرِ تازه‌وارد هم اول می‌خواهد کارت‌ها را
          ببیند، نه سه پاراگراف توضیح.
          حالا همیشه بسته است (۵۴px) و هرکس خواست باز می‌کند. */}
      <details className="duelRuleStrip">
        <summary><b>قوانین</b></summary>
        <div className="duelRuleSteps">
          <div><span>۱</span><b>۵ کارت</b></div>
          <i>›</i><div><span>۲</span><b>انتخاب مخفی</b></div>
          <i>›</i><div><span>۳</span><b>۵ راند</b></div>
        </div>
      </details>
      <Lineup selected={selected} cards={cards} toggle={toggle} />
      {/* ── چرا وقتی هیچ کارتی انتخاب نشده پنهان است ──
          «تحلیل بالانس ترکیب» دربارهٔ ترکیبی حرف می‌زند که هنوز وجود
          ندارد. با ترکیبِ خالی، محتوایش تهی است ولی ۷۸px از ارتفاعِ
          صفحه را می‌گیرد — درست همان‌جا که کاربر باید کارت‌ها را
          ببیند. به‌محضِ انتخابِ اولین کارت ظاهر می‌شود. */}
      {selected.length > 0 && (
        <DeckIntel insights={data?.deckInsights} suggestedDeck={data?.suggestedDeck} onApply={applySuggested} />
      )}
      <button type="button" className="duelLaunch" disabled={busy || selected.length !== 5} onClick={saveAndStart}>
        <span>{busy ? 'در حال قفل ترکیب…' : `ورود به ${mode.title}`}</span>
        <small>{vsBot ? 'بدون ریسک امتیاز' : stake ? `ورودی ${fa(stake)} امتیاز` : 'مسابقه خصوصی'}</small>
      </button>
      {error && <div className="err duelMessage">{error}</div>}
      {practiceFallback && <div className="gameStakeNotice practice"><span>🎁</span><div>
        <b>کارت‌های تمرینی رایگان</b>
      </div></div>}
      {/* ── چرا کلکسیون جمع‌شونده شد ──
          اندازه‌گیری: این بخش ۳۸۱px می‌گرفت — بزرگ‌ترین بلوکِ صفحه — و
          **زیرِ** دکمهٔ شروع است. یعنی کاربری که ترکیبش آماده است
          هیچ‌وقت لازمش ندارد ولی همیشه هزینهٔ اسکرولش را می‌دهد.

          `open` وقتی است که ترکیب هنوز کامل نیست؛ آن‌وقت کاربر
          **واقعاً** باید کارت انتخاب کند و باید باز باشد. */}
      <details className="duelCollection" open={selected.length < 5}>
        <summary>
          <h3 className="duelSectionTitle">
            {practiceFallback ? 'کارت‌های قرضی تمرین' : 'کلکسیون آماده نبرد'}
          </h3>
          <small>{fa(cards.length)} کارت</small>
        </summary>
        {cards.length < 5 ? <div className="card pad center muted">برای بازی حداقل پنج کارت فعال در کلکسیون لازم داری.</div>
          : <div className="duelGridV2">{cards.map(card => <HoloCard key={idOf(card)} card={card}
            selected={selected.includes(idOf(card))} onClick={() => toggle(idOf(card))} />)}</div>}
      </details>
      <History battles={data?.recentBattles || []} />
    </>}

    {enabled && session.phase === 'waiting' && <section className="duelMatchmaking card">
      <div className="duelRadar"><img src="/games/card_duel_glow.png" alt="" /></div>
      <h2>{vsBot ? 'آماده‌سازی ربات…' : 'جستجوی حریف…'}</h2>
      <button type="button" onClick={() => { session.leave(); setEnabled(false); }}>لغو و ویرایش ترکیب</button>
    </section>}

    {enabled && session.connectionNotice && <div className="gameReconnectBanner">{session.connectionNotice}</div>}
    {enabled && session.phase === 'playing' && <LiveArena session={session} />}

    {enabled && session.phase === 'over' && <section className={`duelFinale ${winner === 'DRAW' ? 'draw' : iWon ? 'won' : 'lost'}`}
      style={{'--duel-result-a':resultPalette[0],'--duel-result-b':resultPalette[1],
        background:`radial-gradient(circle at 50% 15%,${resultPalette[1]}44,transparent 42%),${resultPalette[0]}`}}>
      <StakePayoutFlight amount={session.g.stakePayoutAmount}
        winner={session.g.stakePayoutWinner} mine={resultMine}
        opponentRole={resultOpponentRole} sequence={session.g.stakePayoutSequence}
        balanceAfter={session.g.stakeWinnerBalanceAfter}/>
      <div className="duelFinalePanel">
        <span>{winner === 'DRAW' ? '🤝' : iWon ? '🏆' : '🛡️'}</span>
        <h2>{winner === 'DRAW' ? 'DRAW' : iWon ? 'VICTORY' : 'DEFEAT'}</h2>
        <strong className="duelFinalScore">
          تو {fa(resultScore[resultMine])} <i>—</i> {resultOpponentRole} {fa(resultScore[resultOther])}
        </strong>
        {(!session.g.vsBot || session.g.finishReason === 'disconnect') && (
          <div className={`duelSettlement ${session.g.settlementStatus || 'settled'}`}>
            {session.g.finishReason === 'disconnect'
              ? finalVerdict.label
              : winner === 'DRAW' ? 'ورودی برگشت'
                : iWon ? ({ pending: 'در حال تسویه', settled: 'تسویه شد', refunded: 'ورودی برگشت' }[session.g.settlementStatus || 'settled'])
                  : `−${fa(session.g.stake || stake)} امتیاز`}
          </div>
        )}
        <small className="duelMvpLine">MVP • {resultMvp(session.g.state)?.name || 'ستاره آرنا'}</small>
        <RoundTimeline history={session.g.state?.history || []} mine={resultMine} opponentRole={resultOpponentRole} />
        <button className="duelShareButton" type="button" onClick={shareResult} disabled={sharing}>
          {sharing ? 'در حال ساخت…' : 'اشتراک'}
        </button>
        {shareNotice && <i className="duelShareNotice">{shareNotice}</i>}
        <div><button className="main" type="button" disabled={session.rematchWaiting || !session.g.rematchAvailable} onClick={session.rematch}>
          {session.rematchWaiting ? 'منتظر حریف…' : 'دوباره'}
        </button>
          <button type="button" onClick={() => { session.leave(); setEnabled(false); }}>ترکیب</button></div>
      </div>
    </section>}

    {enabled && session.phase === 'error' && <section className="card pad center">
      <div className="err">{session.error || error}</div>
      <button type="button" onClick={() => { session.leave(); setEnabled(false); }}>بازگشت به ترکیب</button>
    </section>}
  </main>;
}
