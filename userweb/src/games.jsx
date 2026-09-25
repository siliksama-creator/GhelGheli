// Full-Fidelity Games Hub for Web — 1:1 with Android (games_page.dart + game_scaffold.dart)
import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { isEnabled, setEnabled } from './gameAudio.js';
import MemorySolo, { MemoryGrid } from './memoryGame.jsx';
import PenaltyGame from './penaltyGame.jsx';
import TapGame from './tapGame.jsx';
import CardDuelWeb from './cardDuelGame.jsx';
import { useGameSession } from './gameSession.js';
import { CosmeticAvatarFrame, LevelBadge, DisplayName } from './components/Cosmetics.jsx';
// کارتِ شماره معکوسِ شروعِ لیگ + قفلِ مسیرهای سکه‌ای (خواستهٔ مالک).
// یک کامپوننت، سه صفحه را پوشش می‌دهد و یک درخواست می‌گیرد.
import LeagueCountdown, { useLeagueCountdown } from './components/LeagueCountdown.jsx';
import CoinAward from './components/CoinAward.jsx';
import { rewardMoment } from './lib/rewardMoment.js';
import CoinRateStrip from './components/CoinRateStrip.jsx';
import { ASSETS, SvgIcon } from './components/IconAsset.jsx';
import WinnerCelebration from './components/WinnerCelebration.jsx';
import { fa, asset, avatarUrl, req } from './lib/api.js';
import ShareResult from './components/ShareResult.jsx';
// «۵۰ لول»، «کد ۴ رقمی» و برچسب‌های بازی از این به بعد زنده‌اند (فاز ۲):
// عدد از live_rules و جمله از live_copy. این هاب یکی از fetchهای
// تکراریِ /api/config را هم داشت که به کشِ مشترک وصل شد.
import { text, ruleNumber, loadLiveConfig, useLive } from './lib/liveConfig.js';
import './growth.css';

const GAMES = [
  { id: 'tap', title: 'ضربه‌زن', icon: '/games/tap/skin_1.webp', desc: null, accent: '#84CC16', singlePlayer: true, art: '/games/tap/skin_1.webp' },
  { id: 'penalty', title: 'ضربات پنالتی', icon: '/games/penalty_icon.png', desc: 'شوت دقیق و مهار دروازه‌بان', accent: '#38BDF8', art: '/games/penalty.webp' },
  { id: 'card_duel', title: 'دوئل کارت‌ها', icon: '/games/card_duel_glow.webp', desc: 'نبرد پنج‌راندی و کارت‌های کلکسیونی', accent: '#FFD166', art: '/games/card_duel_glow.webp' },
  { id: 'memory', title: 'جفت‌یاب', icon: '/games/memory/medal.webp', desc: 'جفت‌های فوتبالی را به خاطر بسپار', accent: '#A855F7', art: '/games/memory.webp' },
];

// نامِ فارسیِ بازی از روی شناسهٔ فنی.
// باگ: لیستِ لابی‌ها `l.gameId` خام را چاپ می‌کرد و کاربر «card_duel»
// می‌دید، در حالی که همه‌جای دیگرِ برنامه نامِ فارسی است. سرور فقط
// شناسه می‌فرستد، پس ترجمه وظیفهٔ کلاینت است. اگر روزی بازیِ جدیدی
// اضافه شد و در GAMES نبود، خودِ شناسه برمی‌گردد نه رشتهٔ خالی.
export function gameTitle(id) {
  return GAMES.find(g => g.id === id)?.title || String(id || 'بازی');
}
function gameAccent(id) {
  return GAMES.find(g => g.id === id)?.accent || '#38BDF8';
}

/**
 * زیرعنوانِ بازی — زنده، با فول‌بکِ دقیقاً برابرِ متنِ امروز.
 *
 * چرا اینجا و نه در خودِ آرایهٔ `GAMES`؟ چون `GAMES` یک ثابتِ سطح‌ماژول است
 * و در زمانِ import ساخته می‌شود — یعنی **پیش از** رسیدنِ config. اگر
 * قالب‌ها را داخلش می‌گذاشتیم، همیشه متنِ کهنه نمایش داده می‌شد. هر چه
 * زنده است باید در زمانِ رندر خوانده شود.
 */
function gameSubtitle(g, tapLevels) {
  if (g.id === 'tap') {
    return text('games.tapSubtitle', `${fa(tapLevels)} لول ضربه بزن و شخصیت‌ها را باز کن`,
      { levelCount: tapLevels });
  }
  if (g.id === 'card_duel') {
    return text('games.duelSubtitle', g.desc);
  }
  if (g.id === 'memory') {
    return text('games.memorySubtitle', g.desc);
  }
  return g.desc;
}

/**
 * پاتِ خالصِ برنده برای یک ورودی — آینهٔ دقیقِ سرور.
 *
 * سرور در `gameStakeService.js` این‌طور حساب می‌کند:
 *   grossPot  = stake * 2
 *   commission = Math.ceil(grossPot * 0.10)
 *   netPot     = grossPot - commission
 *
 * ⚠️ `stake * 2 * 0.9` **همیشه** جوابِ درست را نمی‌دهد، چون سرور
 *    کمیسیون را به بالا گرد می‌کند. برای ورودی‌های فرد (مثلاً لابیِ
 *    ۱۲۵ امتیازی) عددِ ساده یک واحد بیشتر از واقعیت درمی‌آید و کاربر
 *    کمتر از چیزی که وعده دادیم می‌گیرد. همان `Math.ceil` را تکرار
 *    می‌کنیم تا عددِ روی صفحه دقیقاً همان چیزی باشد که واریز می‌شود.
 */
export function netPotFor(stake) {
  const s = Number(stake) || 0;
  if (s <= 0) return 0;
  const gross = s * 2;
  return gross - Math.ceil(gross * 0.10);
}

function tierLabel(level){
  const n=Number(level||0);
  if(n>=90) return {label:'افسانه‌ای', color:'#A855F7'};
  if(n>=60) return {label:'طلایی', color:'#FFD166'};
  if(n>=30) return {label:'نقره‌ای', color:'#38BDF8'};
  if(n>=10) return {label:'برنزی', color:'#22E7A6'};
  return {label:'تازه‌کار', color:'#94A3B8'};
}

export default function Games({ api, token, externalLaunch = null, initialActive = null }) {
  // `initialActive` از کاشیِ خانه می‌آید (main.jsx → Club → اینجا):
  // «tap» یعنی ضربه‌زن بی‌درنگ باز شود، نه فهرستِ بازی‌ها.
  const [active, setActive] = useState(initialActive ?? null);
  const [mode, setMode] = useState(100);
  // سهمیهٔ سکهٔ امروز از /api/bootstrap. تا وقتی نیامده `null` است و
  // چیزی رسم نمی‌شود — بهتر از رسمِ «۰ باقی‌مانده» که دروغ است.
  const [coinQuota, setCoinQuota] = useState(null);
  // سقفِ روزانهٔ امتیازِ کسب‌شده از بازیِ شرطی (۴ مهر ۱۴۰۵). قراردادش
  // آینهٔ سهمیهٔ سکه است: `cap` صفر یا `remaining: null` یعنی سقف غیرفعال
  // و هیچ خطی رسم نمی‌شود.
  const [pointQuota, setPointQuota] = useState(null);
  const [customStake, setCustomStake] = useState(500);
  const [tapLevels, setTapLevels] = useState(50);
  const [publicStakes, setPublicStakes] = useState([100, 1000]);
  const [lobbyStakes, setLobbyStakes] = useState([0, 100, 1000, 5000]);
  const [customGame, setCustomGame] = useState('penalty');
  const [customPass, setCustomPass] = useState('');
  const [lobbies, setLobbies] = useState([]);
  const [joinCode, setJoinCode] = useState('');
  const [user, setUser] = useState(null);
  const [level, setLevel] = useState(null);
  const [soundOn, setSoundOn] = useState(() => isEnabled());
  const lobbySocketRef = useRef(null);
  const [lobbyNotice, setLobbyNotice] = useState('');
  const [memoryRecords, setMemoryRecords] = useState(null);
  // اقتصادِ بازی‌ها (سکهٔ هر نتیجه، درصدِ انتقال بین لیگ‌ها، سکهٔ ضربه‌زن)
  // — از /api/config؛ وقتی ادمین در پنل عوض کند همین‌جا زنده عوض می‌شود.
  const [economy, setEconomy] = useState(null);
  const [gamePoints, setGamePoints] = useState(null);
  const [features, setFeatures] = useState(null);
  // وضعیتِ شماره معکوسِ لیگ: تا شروعِ لیگ، فقط مسیرهای **سکه‌ای** بسته‌اند
  // (بازیِ سریع و لابیِ عمومی). «تمرین با ربات» و اتاقِ کددار باز می‌مانند.
  const leagueCd = useLeagueCountdown();

  useEffect(() => {
    if (!externalLaunch?.start || !externalLaunch?.socket) return;
    setActive({
      id: externalLaunch.start.gameId || 'card_duel',
      stake: Number(externalLaunch.start.stake || 0),
      externalSocket: externalLaunch.socket,
      initialStart: externalLaunch.start,
    });
  }, [externalLaunch]);

  const loadMemoryRecords = async () => {
    try {
      const data = await req('/api/games/memory/solo', 'GET', null, token);
      setMemoryRecords(data || null);
    } catch {
      // Leaderboard failure must not block solo play.
      setMemoryRecords(null);
    }
  };

  const openMemorySolo = () => {
    setActive({ id: 'memory_solo' });
    loadMemoryRecords();
  };

  const toggleSound = () => {
    const next = setEnabled(!soundOn);
    setSoundOn(next);
  };

  const prepareLobbySocket = (onConnect) => {
    lobbySocketRef.current?.disconnect();
    const s = io(api || undefined, {
      auth: { token }, transports: ['websocket', 'polling'],
      forceNew: true, reconnection: true,
    });
    lobbySocketRef.current = s;
    const handleConnect = () => onConnect(s);
    const handleLobbyError = d =>
      setLobbyNotice(d?.message || 'عملیات اتاق ناموفق بود');
    const handleStart = d => {
      // همین socket عضو اتاق است؛ ساختنِ socket دوم کاربر را به صف دیگری
      // می‌فرستاد و صفحه‌ای نشان می‌داد که هیچ event بازی را نمی‌شنید.
      // listenerهای راه‌اندازی هم باید برداشته شوند تا reconnect وسط مسابقه
      // درخواست ساخت/عضویت لابی را دوباره نفرستد.
      s.off('connect', handleConnect);
      s.off('game:error', handleLobbyError);
      s.off('game:start', handleStart);
      setActive({
        id: d.gameId || customGame,
        stake: Number(d.stake || 0),
        externalSocket: s,
        initialStart: d,
      });
    };
    s.on('connect', handleConnect);
    s.on('game:error', handleLobbyError);
    s.on('game:start', handleStart);
    return s;
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomCode = String(params.get('room') || '').trim();
    if (!roomCode) return;
    setMode(-1);
    setJoinCode(roomCode);
    setLobbyNotice('در حال ورود از لینک دعوت…');
    prepareLobbySocket(s => s.emit('game:join_room', { roomCode }));
    // Prevent an ordinary refresh/back-navigation from joining the room a
    // second time after the one-shot invite has been consumed.
    params.delete('room');
    params.delete('game');
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    // The invite URL is intentionally a one-shot mount action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, token]);

  useEffect(() => () => lobbySocketRef.current?.disconnect(), [token]);

  useEffect(() => {
    req('/api/bootstrap', 'GET', null, token).then(d => {
      if (d?.user) setUser({ ...d.user, cosmetics: d.cosmetics || {} });
      if (d?.coinQuota) setCoinQuota(d.coinQuota);
      if (d?.pointQuota) setPointQuota(d.pointQuota);
      if (d?.economy) setEconomy(d.economy);
      if (d?.gamePoints) setGamePoints(d.gamePoints);
    }).catch(() => {});
    loadLiveConfig().then(d => {
      if (!d) return;
      if (d?.tapLevelCount) setTapLevels(d.tapLevelCount);
      if (Array.isArray(d?.stakes?.public)) {
        const scored = d.stakes.public.map(Number).filter(n => n > 0);
        if (scored.length) {
          setPublicStakes(scored);
          setMode(m => (scored.includes(m) || m <= 0 ? m : scored[0]));
        }
      }
      if (Array.isArray(d?.stakes?.lobby) && d.stakes.lobby.length) {
        setLobbyStakes(d.stakes.lobby.map(Number).filter(n => n >= 0));
      }
      if (d?.economy) setEconomy(d.economy);
      if (d?.gamePoints) setGamePoints(d.gamePoints);
      if (d?.features) setFeatures(d.features);
    }).catch(() => {});
    req('/api/level', 'GET', null, token).then(d => {
      if (d) setLevel(d);
    }).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (mode !== -1) return;
    const s = io(api || undefined, { auth: { token }, transports: ['websocket', 'polling'] });
    s.on('connect', () => s.emit('game:lobby_list'));
    s.on('game:lobby_list', list => setLobbies(list || []));
    s.on('game:lobby_updated', () => s.emit('game:lobby_list'));
    return () => s.disconnect();
  }, [api, token, mode]);

  if (active === 'tap') {
    return <TapGame token={token} economy={economy} onBack={() => setActive(null)} />;
  }

  if (active) {
    if (active.id === 'card_duel') {
      return <CardDuelWeb
        api={api}
        token={token}
        stake={Number(active.stake || 0)}
        vsBot={Boolean(active.vsBot)}
        roomCode={active.roomCode || null}
        externalSocket={active.externalSocket || null}
        initialStart={active.initialStart || null}
        onBack={() => setActive(null)}
      />;
    }
    if (active.id === 'memory_solo') {
      return <MemorySolo
        api={api}
        token={token}
        records={memoryRecords}
        reload={loadMemoryRecords}
        onBack={() => setActive(null)}
        onVersus={() => setActive({ id: 'memory', vsBot: true })}
      />;
    }
    return (
      <GameScaffold
        api={api}
        token={token}
        gameId={active.id}
        stake={active.stake}
        vsBot={active.vsBot}
        roomCode={active.roomCode}
        externalSocket={active.externalSocket}
        initialStart={active.initialStart}
        onSolo={active.id === 'memory' && Number(active.stake || 0) === 0
          ? openMemorySolo : null}
        economy={economy}
        soundOn={soundOn}
        onToggleSound={toggleSound}
        onBack={() => setActive(null)}
      />
    );
  }

  const gameOn = (id) => !features || features.games?.[id] !== false;
  const maintOn = features?.maintenance?.active === true;

  const lvl = level ? Number(level.level||0) : 0;
  const into = level ? Number(level.into||0) : 0;
  const needed = level ? Number(level.needed||0) : 0;
  const progress = level ? Number(level.progress||0) : 0;
  const isMax = level ? Boolean(level.isMax) : false;
  const t = tierLabel(lvl);

  return (
    <div style={{ width: '100%', minWidth: 0, maxWidth: '820px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* شماره معکوسِ شروعِ لیگ — بالاترین عنصرِ صفحه تا کاربر پیش از هر
          کلیکی بفهمد چرا بازیِ آنلاین بسته است. */}
      <LeagueCountdown />
      {/* ── Header ترکیبی: پروفایل + XP + لول (۲ باکس قبلی ترکیب شدند) ── */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, #16345F, #071521)',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          padding: '16px 20px',
          borderRadius: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          <CosmeticAvatarFrame frame={user?.cosmetics?.frame} style={{ width:60, height:60 }}>
            <img
              src={user?.profile_image_url ? asset(user.profile_image_url) : avatarUrl(user?.profile_avatar_key)}
              alt=""
              style={{ width:'100%', height:'100%', borderRadius:'50%', border:'2px solid #071522', objectFit:'cover' }}
            />
          </CosmeticAvatarFrame>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
              <h3 style={{ color: '#FFF', fontWeight: '900', margin: 0, fontSize: '15px', display:'flex', alignItems:'center', gap:'6px' }}>
                <DisplayName name={user?.nickname || 'قهرمان قلقلی'} cosmetics={user?.cosmetics} level={level?.level} />
              </h3>
              <div style={{ background: 'rgba(255, 209, 102, 0.18)', border: '1px solid #FFD166', color: '#FFD166', padding: '3px 10px', borderRadius: '20px', fontWeight: '900', fontSize: '12.5px' }}>
                {fa(user?.current_points || 0)} امتیاز
              </div>
            </div>
            <p style={{ color: '#E2E8F0', fontSize: '12.5px', margin: 0, lineHeight: 1.5, fontWeight: '600' }}>
              آنلاین بازی کن، XP بگیر
            </p>
          </div>
        </div>
        {level && (
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ background: t.color+'22', border: '1px solid '+t.color+'88', color: t.color, padding: '2px 8px', borderRadius: '6px', fontSize: '12.5px', fontWeight: '900' }}>Level {lvl}</span>
                <span style={{ color: t.color, fontWeight: '800', fontSize: '12px' }}>{t.label}</span>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12.5px', fontWeight: '700' }}>
                {isMax ? 'MAX' : `${fa(into)} / ${fa(needed)}`}
              </span>
            </div>
            <div style={{ height: '7px', background: 'rgba(255,255,255,0.10)', borderRadius: '99px', overflow:'hidden' }}>
              <div style={{ width: `${isMax ? 100 : Math.round(progress*100)}%`, height: '100%', background: `linear-gradient(90deg, ${t.color}99, ${t.color})`, transition:'width 0.7s cubic-bezier(0.2,0.8,0.2,1)' }} />
            </div>
          </div>
        )}
      </div>

      {maintOn && (
        <div className="card" style={{ padding: 14, border: '1px solid #F97316', color: '#FDBA74' }}>
          {features.maintenance.message || 'سرویس بازی موقتاً در دسترس نیست.'}
        </div>
      )}

      {/* Tap Game Hero Banner */}
      {gameOn('tap') && <div
        className="card"
        onClick={() => setActive('tap')}
        style={{
          background: 'linear-gradient(135deg, #2E5B09, #0B1702)',
          border: '1.5px solid #84CC16',
          padding: '16px 20px',
          borderRadius: '18px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 8px 24px rgba(132, 204, 22, 0.25)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h3 style={{ color: '#FFF', fontWeight: '900', margin: 0, fontSize: '15px' }}>بازی ضربه‌زن (تک‌نفره)</h3>
            <span style={{ background: '#84CC16', color: '#000', padding: '2px 8px', borderRadius: '6px', fontSize: '12.5px', fontWeight: 'bold' }}>{fa(tapLevels)} لول</span>
          </div>
          <p style={{ color: '#CBD5E1', fontSize: '12px', margin: 0 }}>ضربه بزن، شخصیت باز کن، امتیاز بگیر</p>
        </div>
        <span style={{ color:'#FFD166', display:'flex' }}><SvgIcon name="football" size={27} /></span>
      </div>}

      {/* نوارِ نرخِ سکه — پیش از انتخابِ ورودی، چون همین‌جا تصمیم گرفته
          می‌شود کدام بازی ارزش دارد. آینهٔ games_page.dart.
          دورِ ۳۲: `mode` پاس داده می‌شود تا در تمرین و لابی — که سکه
          نمی‌دهند — به‌جای جدولِ نرخ، دلیلش گفته شود. */}
      <CoinRateStrip mode={mode} economy={economy} gamePoints={gamePoints} />

      {/* Mode Selector (4 Tabs) — رنگ هر قرص مثل اندروید */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
        {[
          ...publicStakes.map((s, i) => ({
            id: s,
            label: `${fa(s)} امتیاز`,
            icon: s >= 1000 ? 'star' : 'bolt',
            color: s >= 1000 ? '#FFD166' : '#38BDF8',
          })),
          { id: 0, label: 'تمرین با ربات', icon: 'robot', color: '#22E7A6' },
          { id: -1, label: 'اتاق خصوصی', icon: 'door', color: '#A855F7' },
        ].map(m => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            style={{
              flex: '1 1 90px', minWidth: 90, padding: '12px 6px',
              borderRadius: '14px',
              border: mode === m.id ? `1.5px solid ${m.color}` : '1px solid rgba(255,255,255,0.1)',
              background: mode === m.id ? `${m.color}22` : 'rgba(255,255,255,0.04)',
              color: mode === m.id ? '#FFF' : '#94A3B8',
              fontWeight: '900',
              fontSize: '12.5px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              boxShadow: mode===m.id ? `0 6px 16px ${m.color}30` : 'none',
            }}
          >
            <span style={{ display: 'flex', color: mode===m.id ? m.color : '#94A3B8' }}><SvgIcon name={m.icon} size={18} /></span>
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      <div className={`gameStakeNotice ${mode === 0 ? 'practice' : mode === -1 ? 'lobby' : 'competitive'}`}>
        <span style={{ display:'flex' }}><SvgIcon name={mode === 0 ? 'robot' : mode === -1 ? 'key' : 'warning'} size={17} /></span>
        <div>
          <b>{mode === 0
            ? 'تمرین رایگان؛ بدون ریسک امتیاز'
            : mode === -1
              ? 'در لابی، سازنده مقدار ورودی را انتخاب می‌کند'
              : `برای ورود حداقل ${fa(mode)} امتیاز لازم داری`}</b>
          <small>{mode === 0
            ? 'بدون اثر روی موجودی و لیگ. تمرینِ جفت‌یاب فقط رکوردی است و روی ماموریت‌ها هم اثر ندارد.'
            : mode === -1
              ? 'ورودی امتیازی تا پایان بازی امن می‌ماند.'
              : `برنده ${fa(netPotFor(mode))} امتیاز می‌گیرد · بازنده ${fa(mode)} امتیاز می‌دهد.`}</small>
        </div>
      </div>

      {/* ── سهمیهٔ سکهٔ امروز ──
          سکه فقط به برنده می‌رسد و روزانه سقف دارد. بدون این خط، کاربری
          که سقفش پر شده می‌بُرد و سکه‌ای نمی‌گرفت و فکر می‌کرد باگ است.
          فقط در حالت شرط‌دار نشان داده می‌شود (نه تمرین، نه لابی) و فقط
          وقتی سرور واقعاً سهمیه‌ای برگردانده. یک خط، بدون شلوغی. */}
      {mode > 0 && coinQuota?.remaining && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', margin:'-2px 0 12px', fontSize:'13.5px', lineHeight:1.5, color: coinQuota.remaining[mode] > 0 ? '#CBD5E1' : '#F59E0B' }}>
          <img src={ASSETS.coin} alt="" width={22} height={22} style={{ display:'block', flexShrink:0, opacity: coinQuota.remaining[mode] > 0 ? 1 : 0.5 }} />
          {coinQuota.remaining[mode] > 0
            ? <span>امروز <b style={{ color:'#FFD166' }}>{fa(coinQuota.remaining[mode])}</b> برد دیگر سکه می‌دهد</span>
            : <span>سهمیهٔ سکهٔ امروزِ این ورودی پر شده — برد امتیاز دارد، سکه نه</span>}
        </div>
      )}

      {/* ── سقفِ امتیازِ امروز (۴ مهر ۱۴۰۵) ──
          امتیازِ کسب‌شده از بُردهای شرطی روزانه سقف دارد (پیش‌فرض ۲۰۰۰).
          بدون این خط، کاربری که سقفش پر شده می‌بَرد، امتیازِ کمی می‌گیرد
          و فکر می‌کند باگ است. دقیقاً کنارِ سهمیهٔ سکه — همان‌جا که ورودی
          انتخاب می‌شود. فقط در حالتِ شرط‌دار و فقط وقتی سرور عدد فرستاده. */}
      {mode > 0 && pointQuota?.cap > 0 && Number.isFinite(pointQuota.remaining) && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', margin:'-2px 0 12px', fontSize:'13.5px', lineHeight:1.5, color: pointQuota.remaining > 0 ? '#CBD5E1' : '#F59E0B' }}>
          <img src={ASSETS.points} alt="" width={22} height={22} style={{ display:'block', flexShrink:0, opacity: pointQuota.remaining > 0 ? 1 : 0.5 }} />
          {pointQuota.remaining > 0
            ? <span>امروز تا <b style={{ color:'#FFD166' }}>{fa(pointQuota.remaining)}</b> امتیاز دیگر از برد آنلاین می‌گیری</span>
            : <span>سقفِ امتیازِ امروز پر شده — برد سکه می‌دهد، امتیاز نه؛ باخت جا باز می‌کند</span>}
        </div>
      )}

      {/* Mode Content */}
      {mode === -1 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Create Lobby */}
          <div className="card" style={{ background: 'linear-gradient(135deg, #2E1065, #0F172A)', border: '1px solid rgba(168, 85, 247, 0.4)', padding: '18px', borderRadius: '18px' }}>
            <h3 style={{ color: '#FFF', fontWeight: '900', margin: '0 0 10px', fontSize: '15px' }}>ساخت اتاق و لابی اختصاصی</h3>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              {GAMES.filter(g => !g.singlePlayer).map(g => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setCustomGame(g.id)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    borderRadius: '10px',
                    border: customGame === g.id ? '1.5px solid #A855F7' : '1px solid rgba(255,255,255,0.1)',
                    background: customGame === g.id ? 'rgba(168, 85, 247, 0.3)' : 'rgba(255,255,255,0.05)',
                    color: '#FFF',
                    fontWeight: 'bold',
                    fontSize: '12.5px',
                    cursor: 'pointer',
                  }}
                >
                  {g.title}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginBottom: '12px' }}>
              {lobbyStakes.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setCustomStake(s)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '12px',
                    border: customStake === s ? '1.5px solid #A855F7' : '1px solid rgba(255,255,255,0.1)',
                    background: customStake === s ? '#A855F7' : 'rgba(255,255,255,0.05)',
                    color: '#FFF',
                    fontSize: '12.5px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s===0 ? 'رایگان' : fa(s)+' امتیاز'}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="رمز عبور اتاق (اختیاری)"
              value={customPass}
              onChange={e => setCustomPass(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#FFF', marginBottom: '12px' }}
            />

            <button
              type="button"
              onClick={() => {
                if (customStake > Number(user?.current_points || 0)) {
                  alert(`برای این لابی حداقل ${fa(customStake)} امتیاز لازم داری`);
                  return;
                }
                if (leagueCd.active) {
                  // لابیِ عمومی سهم دارد ⇒ سکه می‌دهد ⇒ بسته. (اتاقِ کددار
                  // که پایین‌تر ساخته می‌شود سهمِ صفر دارد و باز است.)
                  alert(leagueCd.message || 'تا شروعِ لیگ، ساخت لابی بسته است');
                  return;
                }
                setLobbyNotice('در حال ساخت لابی…');
                const s = prepareLobbySocket(sock => sock.emit('game:create_lobby', {
                  gameId: customGame, stake: customStake, password: customPass,
                }));
                s.once('game:lobby_created', d =>
                  setLobbyNotice(`${d?.message || 'لابی ساخته شد'}؛ منتظر حریف بمان`));
              }}
              style={{ width: '100%', padding: '12px', borderRadius: '12px', background: '#A855F7', color: '#FFF', fontWeight: '900', border: 'none', cursor: 'pointer' }}
            >
              ساخت لابی و ثبت در لیست
            </button>
            {lobbyNotice && <div className="hint" style={{ marginTop:8, textAlign:'center' }}>{lobbyNotice}</div>}
          </div>

          {/* Active Lobbies List */}
          <div className="card" style={{ padding: '18px', borderRadius: '18px' }}>
            <h4 style={{ color: '#38BDF8', fontWeight: '900', margin: '0 0 10px' }}>لابی‌های فعال:</h4>
            {lobbies.length === 0 ? (
              <div style={{ color: '#94A3B8', fontSize: '12px', textAlign: 'center', padding: '12px' }}>اتاقی در حال حاضر وجود ندارد. اولین لابی را بسازید!</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {lobbies.map(l => (
                  <div key={l.lobbyId} className="lobbyRow" style={{ '--lobby-accent': gameAccent(l.gameId) }}>
                    <span className="lobbyDot" aria-hidden="true"><SvgIcon name={l.hasPassword ? 'lock' : 'game'} size={15} /></span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="lobbyHost">
                        <span>{l.hostName}</span>
                        {l.hasPassword && <span className="lobbyLock" title="دارای رمز عبور">رمزدار</span>}
                      </div>
                      <div className="lobbyMeta">
                        <b>{gameTitle(l.gameId)}</b>
                        <span className="lobbySep">·</span>
                        <span className={l.stake === 0 ? 'lobbyFree' : 'lobbyStake'}>
                          {l.stake === 0 ? 'رایگان' : `${fa(l.stake)} امتیاز`}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (leagueCd.active) {
                          alert(leagueCd.message || 'تا شروعِ لیگ، این لابی بسته است');
                          return;
                        }
                        let pass = '';
                        if (l.hasPassword) {
                          pass = prompt('رمز عبور اتاق را وارد کنید:') || '';
                        }
                        if (Number(l.stake || 0) > Number(user?.current_points || 0)) {
                          alert(`برای این مسابقه حداقل ${fa(l.stake)} امتیاز لازم داری`);
                          return;
                        }
                        setLobbyNotice('در حال ورود به لابی…');
                        prepareLobbySocket(s => s.emit('game:join_lobby', {
                          lobbyId: l.lobbyId, password: pass,
                        }));
                      }}
                      className="lobbyJoin"
                    >
                      پیوستن
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Direct Code Join */}
          <div className="card" style={{ padding: '16px', borderRadius: '18px', display: 'flex', gap: '8px' }}>
            <input
              type="text"
              // طولِ کد از live_rules (فاز ۲): اگر ادمین کد را ۶ رقمی کند،
              // این راهنما و `maxLength` همان لحظه عوض می‌شوند.
              placeholder={text('games.roomCodeLabel',
                `کد ${fa(ruleNumber('roomCodeLength', 4))} رقمی اتاق دوست`,
                { codeLength: ruleNumber('roomCodeLength', 4) })}
              maxLength={ruleNumber('roomCodeLength', 4)}
              value={joinCode}
              onChange={e => setJoinCode(e.target.value)}
              style={{ flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#FFF' }}
            />
            <button
              type="button"
              onClick={() => {
                if (joinCode.trim()) {
                  // بازی واقعی از game:start خوانده می‌شود؛ حدسِ «همیشه
                  // پنالتی» باعث می‌شد اتاق جفت‌یاب با UI پنالتی باز شود.
                  setLobbyNotice('در حال ورود با کد اتاق…');
                  prepareLobbySocket(s => s.emit('game:join_room', {
                    roomCode: joinCode.trim(),
                  }));
                }
              }}
              style={{ padding: '10px 20px', background: '#38BDF8', color: '#000', borderRadius: '10px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
            >
              ورود
            </button>
          </div>
        </div>
      ) : (
        /* ── خواستهٔ مالک ──
           «بجای اینکه بنر بازی‌ها واید باشه بهتره باکس مربعی باشن که
            انقدر نیاز به اسکرول نباشه»

           اندازه‌گیری روی ۳۹۰×۸۴۴: سه بنرِ ۳۷۴×۱۴۳ روی هم = ۴۴۹px و
           کلِ صفحه ۱۱۳۴px (۲۹۰px اسکرول).

           با شبکهٔ دوستونیِ مربع: دو ردیف به‌جای سه، و هر کاشی مربع
           می‌ماند. `aspect-ratio:1` کار را به مرورگر می‌سپارد تا روی
           هر عرضی مربع بماند. */
        <div className="gameTileGrid">
          {GAMES.filter(g => g.id !== 'tap' && gameOn(g.id)).map(g => (
            <div
              key={g.id}
              className="card gameTileSquare"
              onClick={() => {
                // سهم‌دار = مسابقهٔ آنلاین = سکه‌دار ⇒ تا شروعِ لیگ بسته.
                // سرور هم همین را رد می‌کند؛ این فقط جلوی کلیکِ بی‌فایده را
                // می‌گیرد و دلیلش را به زبانِ خودِ ادمین می‌گوید.
                if (mode > 0 && leagueCd.active) {
                  alert(leagueCd.message || 'تا شروعِ لیگ، بازیِ آنلاین بسته است');
                  return;
                }
                if (mode > 0 && Number(user?.current_points || 0) < mode) {
                  alert(`برای این مسابقه حداقل ${fa(mode)} امتیاز لازم داری`);
                  return;
                }
                if (mode === 0) {
                  // جفت‌یاب در بخشِ «بازی با ربات» فقط حالتِ رکوردی دارد
                  // (خواستهٔ مالک، ۸ مهر ۱۴۰۵): تمرینِ با رباتِ جفت‌یاب
                  // حذف شد؛ کلیکِ کاشی مستقیم می‌رود روی تایم‌اتکِ رکوردی.
                  if (g.id === 'memory') { openMemorySolo(); return; }
                  setActive({ id: g.id, vsBot: true });
                } else {
                  setActive({ id: g.id, stake: mode });
                }
              }}
              style={{ '--tile-accent': g.accent }}
            >
              <div className="gameTileArt">
                <img src={g.art} alt="" loading="lazy" decoding="async" />
                <span className="gameTileMode">
                  {mode === 0 ? (g.id === 'memory' ? 'رکوردی' : 'تمرین') : `${fa(mode)} امتیاز`}
                </span>
              </div>
              <div className="gameTileBody">
                <h4>{g.title}</h4>
                <p>{gameSubtitle(g, tapLevels)}</p>
                <div className="gameTileFoot">
                  {/* در حالتِ رکوردی خودِ کاشی رکوردی است؛ دکمهٔ دوم حذف شد
                      تا دو راهِ متفاوت جلوی کاربر نباشد (خواستهٔ مالک). */}
                  <span className="gameTilePlay">
                    {g.id === 'memory' && mode === 0 ? 'رکوردی' : 'شروع'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}


async function makeGenericResultCard({ title, gameTitle, players }) {
  const colors = ['#071522', '#38BDF8'];
  const gradient = ctx.createLinearGradient(0, 0, 1080, 1080);
  gradient.addColorStop(0, colors[0]); gradient.addColorStop(1, colors[1]);
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1080, 1080);
  ctx.fillStyle = 'rgba(3,12,25,.58)'; ctx.fillRect(55, 55, 970, 970);
  ctx.strokeStyle = colors[1]; ctx.lineWidth = 12; ctx.strokeRect(55, 55, 970, 970);
  ctx.textAlign = 'center'; ctx.direction = 'rtl';
  ctx.fillStyle = '#FFD166'; ctx.font = '900 38px sans-serif'; ctx.fillText('GHELGHELI GAME CLUB', 540, 155);
  ctx.fillStyle = '#fff'; ctx.font = '900 78px sans-serif'; ctx.fillText(gameTitle, 540, 290);
  ctx.fillStyle = '#fff'; ctx.font = '900 88px sans-serif'; ctx.fillText(title, 540, 475);
  ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(130, 570, 820, 170);
  ctx.fillStyle = '#E2E8F0'; ctx.font = '800 44px sans-serif'; ctx.fillText(`${players[0]}  VS  ${players[1]}`, 540, 670);
  ctx.fillStyle = '#22E7A6'; ctx.font = '900 36px sans-serif'; ctx.fillText('تو هم بیا به چالش قلقلی!', 540, 850);
  ctx.fillStyle = '#CBD5E1'; ctx.font = '500 28px sans-serif'; ctx.direction = 'ltr'; ctx.fillText(window.location.origin, 540, 920);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png', .94));
}

function GamePlayerIdentity({ player, fallback }) {
  const p = player || {};
  const imageUrl = p.profileImageUrl || p.profile_image_url;
  const avatarKey = p.profileAvatarKey || p.profile_avatar_key;
  return <span style={{ display:'inline-flex', alignItems:'center', gap:6, minWidth:0, maxWidth:'100%' }}>
    {p.isBot ? <span aria-hidden="true" style={{display:'flex'}}><SvgIcon name="robot" size={22} /></span> : (
      <CosmeticAvatarFrame frame={p.cosmetics?.frame} style={{width:34,height:34,padding:p.cosmetics?.frame?2:0}}>
        <img src={imageUrl ? asset(imageUrl) : avatarUrl(avatarKey)} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%',border:'1px solid #071522'}}/>
      </CosmeticAvatarFrame>
    )}
    <span style={{minWidth:0,overflow:'hidden'}}><DisplayName name={p.nickname || fallback} cosmetics={p.cosmetics} level={p.level} /></span>
  </span>;
}

function GameScaffold({ api, token, gameId, stake, vsBot, roomCode, externalSocket, initialStart, onSolo, soundOn, onToggleSound, onBack, economy }) {
  const {
    phase, g, error, secondsLeft, move, leave, playBot, joinOnline, rematch,
    stillSearching, connectionNotice, rematchWaiting,
  } = useGameSession(
    api, token, gameId, stake, vsBot, roomCode, externalSocket, initialStart);
  // قفلِ شماره معکوس داخلِ صحنهٔ بازی: دکمهٔ «پیدا کردن حریف آنلاین» غیرفعال
  // می‌شود و «تلاش دوباره» به تمرین با ربات می‌رود، چون سهم‌دار بسته است.
  const cd = useLeagueCountdown();
  const activeGameId = g.gameId || gameId;
  const activeStake = Number(g.stake ?? stake ?? 0);
  const pX = g.players?.X || { nickname: 'کاربر ۱' };
  const pO = g.players?.O || (g.vsBot ? { nickname: 'هوش مصنوعی (ربات)', isBot: true } : { nickname: 'کاربر ۲' });
  const isOnlineMatch = activeStake === 100 || activeStake === 1000;
  const resultColors = ['#071522', '#38BDF8'];
  const gameTitle = activeGameId === 'penalty' ? 'ضربات پنالتی' : activeGameId === 'memory' ? 'جفت‌یاب' : 'دوئل کارت‌ها';

  // ── لحظهٔ نتیجهٔ جفت‌یاب ────────────────────────────────────────────────
  //
  // خواستهٔ مالک: «جای "شما بازی رو بردید"/"شما باختید" یه لحظه بیاد که
  // چیزی که گرفتی رو نشون بده.» ولی دوئل کارت و ضربات پنالتی **مستثنا**
  // شدند: صحنهٔ نتیجهٔ خودشان («در بازی پنالتی برندهٔ باید بزرگ و زیبا مشخص
  // بشه» — خواستهٔ دورِ ۳۳) دست‌نخورده می‌ماند. پس فقط جفت‌یاب از این
  // گذرگاه رد می‌شود.
  useEffect(() => {
    if (phase !== 'over' || activeGameId !== 'memory' || !g.winner) return;
    // ⚠️ کلمهٔ «باخت» هیچ‌جا ساخته نمی‌شود؛ `rewardMoment` با kind='loss'
    //    خودش جملهٔ نرم و آرامِ پنل را می‌آورد (تصمیمِ مالک: «نمی‌دونم چطوری
    //    بگم که اعصابش خورد نشه»).
    const kind = g.winner === 'DRAW' ? 'draw' : g.winner === g.me ? 'win' : 'loss';
    // فقط بردِ مسابقهٔ امتیازی عدد دارد: بازنده هیچ چیزی از دست نمی‌دهد
    // که روی کارت بیاید (چیپِ «−۵۰۰» پایین‌تر در حسابِ مسابقه می‌ماند) و
    // تساوی هم چیزی به کسی اضافه نمی‌کند.
    // ⚠️ از سقفِ روزانهٔ امتیاز (۴ مهر ۱۴۰۵) ممکن است واریزِ واقعی از پات
    // کمتر باشد؛ `payoutPoints` عددِ سرور است و پات فقط فال‌بک.
    const received = Number(g.payoutPoints || g.netPot || 0);
    const net = Math.max(0, received - Number(activeStake || 0));
    rewardMoment({
      source: 'memory',
      kind,
      points: kind === 'win' && !g.vsBot ? net : 0,
    });
  }, [phase, activeGameId, g.winner, g.me, g.netPot, g.payoutPoints, g.vsBot, activeStake]);


  /**
   * حسابِ پایانِ مسابقه و دکمه‌های ادامهٔ کار — **همان بلوک در هر دو
   * شاخه** (جفت‌یاب بدونِ صحنهٔ جشن، دوئل/پنالتی با صحنهٔ خودشان).
   *
   * چرا یک متغیر و نه دو نسخه: اگر دو بار نوشته می‌شد، یک روز یکی از
   * دو نسخه ویرایش می‌شد و «ادامهٔ کار» در دو بازی شکلِ متفاوتی
   * می‌گرفت — همان «بی‌اختلالی» که مالک رویش تأکید کرد.
   */
  const overActions = (
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', position:'relative', zIndex:5 }}>
          {/* ── امتیازِ مثبت برای برنده، منفی برای بازنده ──
              خواستهٔ مالک: «امتیاز مثبت رو بنویسه برای برنده، امتیاز منفی
              رو بنویسه برای بازنده». فقط در مسابقهٔ امتیازیِ واقعی (نه ربات،
              نه رایگان). برندهٔ واقعی: netPot منهای ورودیِ خودش؛ بازنده:
              منهایِ ورودی. */}
          {activeStake > 0 && !g.vsBot && g.winner && g.winner !== 'DISCONNECT' && (
            <div style={{
              display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center',
              fontSize: '13.5px', fontWeight: 900,
            }}>
              {g.winner === 'DRAW' ? (
                <span style={{ color: '#94A3B8', background: 'rgba(148,163,184,0.12)', padding: '5px 14px', borderRadius: 99 }}>
                  {/* ── تساویِ پنالتی (۳ مهر ۱۴۰۵) ─────────────────────
                      پیش از این «امتیاز تو: ۰ (ورودی کامل برگشت)» بود.
                      حالا در تساوی هم کمسیون کسر می‌شود، پس همان جمله
                      تبدیل به دروغ می‌شد. عددها از سرور می‌آیند
                      (`g.drawRefund`/`g.drawFee`) و اگر نرسیده باشند،
                      جملهٔ کلی نشان می‌دهیم — هرگز عددِ حدسی نمی‌سازیم. */}
                  {Number(g.drawRefund) > 0
                    ? `${fa(g.drawRefund)} امتیاز برگشت · کمسیون ${fa(g.drawFee)}`
                    : 'ورودی منهای کمسیون برگشت'}
                </span>
              ) : g.winner === g.me ? (
                <span style={{ color: '#22E7A6', background: 'rgba(34,231,166,0.14)', padding: '5px 14px', borderRadius: 99 }}>
                  {/* عددِ واقعیِ سرور بعد از سقفِ روزانه؛ پات فقط فال‌بک */}
                  +{fa(Math.max(0, Number(g.payoutPoints || g.netPot || 0) - Number(activeStake)))} امتیاز
                </span>
              ) : (
                <span style={{ color: '#FB7185', background: 'rgba(251,113,133,0.14)', padding: '5px 14px', borderRadius: 99 }}>
                  −{fa(activeStake)} امتیاز
                </span>
              )}
            </div>
          )}
          {/* سکهٔ لیگ. `coinsWinner` نمادِ برنده است (X/O) و با `g.me`
              مقایسه می‌شود، نه با `g.winner` — چون در قطعِ ارتباط،
              `g.winner` می‌تواند DISCONNECT باشد در حالی که تسویه واقعاً
              یک برنده داشته. مقایسه با نمادِ خودِ تسویه همیشه درست است. */}
          <CoinAward amount={g.coinsAwarded} mine={g.coinsWinner === g.me} />
          <div style={{ display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center' }}>
            <button type="button" disabled={rematchWaiting || !g.rematchAvailable} onClick={rematch}
              style={{ background:'linear-gradient(135deg,#22E7A6,#38BDF8)',color:'#03121f',border:0,padding:'12px 20px',borderRadius:16,fontWeight:900 }}>
              {rematchWaiting ? 'منتظر قبول حریف…' : 'دوباره با همین حریف'}
            </button>
            <ShareResult
              token={token}
              title={g.winner === 'DRAW' ? 'مسابقه مساوی شد!' : g.winner === g.me ? 'من برنده شدم!' : 'این بار حریف برد!'}
              gameTitle={gameTitle}
              versus={`${pX.nickname || 'بازیکن یک'} مقابل ${pO.nickname || 'بازیکن دو'}`}
              gameId={activeGameId}
              matchId={g.matchId}
            />
            <button
              type="button"
              onClick={() => { leave(); onBack(); }}
              style={{ background: 'linear-gradient(135deg, #38BDF8, #0284C7)', color: '#FFF', border: 'none', padding: '12px 28px', borderRadius: '16px', fontWeight: '900', fontSize: '14px', cursor: 'pointer' }}
            >بازگشت به باشگاه بازی‌ها</button>
          </div>
        </div>
  );

  return (
    /* `gameShell` جای `maxWidth:640px`ِ inline نشسته: روی گوشی همان ۶۴۰px
       است (آینهٔ اندروید، بدون تغییر)، ولی روی دسکتاپ CSS می‌تواند به
       چیدمان دو‌ستونه سوییچ کند — کاری که با استایلِ inline ممکن نبود.
       `isPlaying` فقط وقتی روشن است که تخته واقعاً رندر می‌شود؛ صفحه‌های
       idle/waiting/over تک‌ستونهٔ وسط‌چین می‌مانند. */
    <div className={`card wide gameShell gameShell-${activeGameId}${phase === 'playing' ? ' isPlaying' : ''}`}
      style={{ padding: '20px', textAlign: 'center', position:'relative', overflow:'hidden' }}>
      <div className="gameShellHead" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', position:'relative', zIndex:5 }}>
        <button type="button" onClick={() => { leave(); onBack(); }} style={{ background: 'rgba(255,255,255,0.1)', color: '#FFF', border: 'none', padding: '6px 14px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}>
          ← بازگشت
        </button>
        <span style={{ fontWeight: '900', color: '#38BDF8', fontSize: '16px' }}>
          {activeGameId === 'penalty' ? 'ضربات پنالتی' : (activeGameId === 'memory' ? 'جفت‌یاب' : 'دوئل کارت‌ها')}
        </span>
        <button type="button" onClick={onToggleSound} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>
          <SvgIcon name={soundOn ? 'soundOn' : 'soundOff'} size={17} />
        </button>
      </div>

      {error && <div className="err" style={{ marginBottom: '12px', background:'#EF444422', border:'1px solid #EF4444', color:'#FCA5A5', padding:'8px', borderRadius:'8px' }}>{error}</div>}
      {connectionNotice && <div className="gameReconnectBanner">{connectionNotice}</div>}

      {phase === 'playing' && (
        <div className="gameShellScore" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.35)', padding: '10px 16px', borderRadius: '16px', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display:'flex', flex:'1 1 0', minWidth:0, alignItems:'center', gap:'8px', borderBottom:g.turn==='X'?'2px solid #38BDF8':'none', paddingBottom:'4px' }}>
            <GamePlayerIdentity player={pX} fallback="کاربر ۱" />
            {g.turn === 'X' && <span style={{ background: '#38BDF8', color: '#000', padding: '2px 6px', borderRadius: '7px', fontSize: '12.5px', fontWeight: '900' }}>نوبت ({fa(secondsLeft)}s)</span>}
          </div>
          <span style={{ color: '#94A3B8', fontWeight: '900', fontSize: '14px' }}>VS</span>
          <div style={{ display:'flex', flex:'1 1 0', minWidth:0, justifyContent:'flex-end', alignItems:'center', gap:'8px', borderBottom:g.turn==='O'?'2px solid #F59E0B':'none', paddingBottom:'4px' }}>
            {g.turn === 'O' && <span style={{ background: '#F59E0B', color: '#000', padding: '2px 6px', borderRadius: '7px', fontSize: '12.5px', fontWeight: '900' }}>نوبت ({fa(secondsLeft)}s)</span>}
            <GamePlayerIdentity player={pO} fallback="کاربر ۲" />
          </div>
        </div>
      )}

      {activeStake>0 && !g.vsBot && phase==='playing' && (
        <div className="gameShellPot" style={{ margin:'0 auto 10px', display:'inline-flex', alignItems:'center', gap:'6px', background:'linear-gradient(90deg, #FFD70022, #FF9F4322)', border:'1px solid #FFD166', color:'#FFD166', padding:'4px 12px', borderRadius:'99px', fontSize:'11px', fontWeight:'900' }}>
          <span style={{ display:'inline-flex', verticalAlign:'-3px', color:'#FFD166' }}><SvgIcon name="trophy" size={16} /></span> جایزهٔ برنده: {fa(g.netPot || netPotFor(activeStake))} امتیاز
        </div>
      )}

      {phase === 'idle' && (
        <div style={{ padding:'36px 18px', display:'flex', flexDirection:'column', alignItems:'center', gap:'12px' }}>
          <div style={{ color:'#64748B', display:'flex', justifyContent:'center' }}><SvgIcon name="game" size={40} /></div>
          <h3 style={{ margin:0, color:'#FFF' }}>آماده‌ای شروع کنیم؟</h3>
          <p className="hint">آنلاین با حریف واقعی رقابت کن یا فوری با ربات تمرین کن.</p>
          {cd.active && (
            // دلیلِ غیرفعالی را همان متنی می‌گوید که ادمین نوشته — نه یک
            // جملهٔ هاردکدشده در این فایل که با تغییرِ پنل کهنه می‌شد.
            <p className="hint" style={{ color: '#FFD166' }}>{cd.message}</p>
          )}
          <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'center', gap:'8px' }}>
            <button className="main" type="button" onClick={joinOnline} disabled={cd.active}>پیدا کردن حریف آنلاین</button>
            <button type="button" onClick={playBot}>بازی فوری با ربات</button>
            {onSolo && <button type="button" onClick={onSolo}>بازی رکوردی با ساعت</button>}
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div style={{ padding:'28px 18px', display:'flex', justifyContent:'center', gap:'8px', flexWrap:'wrap' }}>
          <button type="button" className="main" onClick={(stake > 0 && !cd.active) ? joinOnline : playBot}>تلاش دوباره</button>
          <button type="button" onClick={() => { leave(); onBack(); }}>بازگشت</button>
        </div>
      )}

      {phase === 'waiting' && (
        vsBot ? null : (
          isOnlineMatch ? (
            <div style={{ padding: '50px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <div style={{ width:'96px', height:'96px', border:'6px solid rgba(255,255,255,0.12)', borderTopColor:'#38BDF8', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
              <h3 style={{ color: '#FFF', fontWeight: '900', margin: 0, fontSize:'16px' }}>در جستجوی حریف…</h3>
              <button type="button" onClick={() => { leave(); onBack(); }} style={{ padding:'10px 28px', borderRadius:'12px', border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.06)', color:'#FFF', fontWeight:'900', cursor:'pointer' }}>
                لغو
              </button>
            </div>
          ) : (
            <div style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <div style={{ fontSize: '40px' }}>⏳</div>
              <h3 style={{ color: '#FFF', fontWeight: '900', margin: 0 }}>{stillSearching ? 'هنوز در صف حریف واقعی هستی' : 'در حال جستجوی حریف آنلاین...'}</h3>
              <p style={{ color: '#94A3B8', fontSize: '12.5px', maxWidth: '380px', lineHeight: 1.5 }}>
                منتظر بمان یا با ربات تمرین کن.
              </p>
              <div style={{ display:'flex', gap:'8px', marginTop:'8px' }}>
                <button type="button" onClick={playBot} style={{ background:'#38BDF8', color:'#000', border:'none', padding:'10px 20px', borderRadius:'12px', fontWeight:'900', cursor:'pointer' }}>شروع با ربات</button>
                <button type="button" onClick={() => { leave(); onBack(); }} style={{ background:'rgba(255,255,255,0.06)', color:'#FFF', border:'1px solid rgba(255,255,255,0.12)', padding:'10px 20px', borderRadius:'12px', fontWeight:'900', cursor:'pointer' }}>لغو</button>
              </div>
            </div>
          )
        )
      )}

      {phase === 'playing' && (
        <div className="gameShellBoard">
          {activeGameId === 'penalty' && (
            <PenaltyGame state={g.state} mySymbol={g.me} turn={g.turn} onMove={move} />
          )}
          {activeGameId === 'memory' && (
            <MemoryGrid cards={g.state?.cards || []} playable={g.state?.playable || []} onMove={move} />
          )}
        </div>
      )}

      {phase === 'over' && (activeGameId === 'memory' ? (
        /* ── جفت‌یاب: نتیجهٔ «خشک» + لحظهٔ جایزه ──
           خواستهٔ مالک: تیترِ «تو برنده شدی»/«حریف برنده شد» در جفت‌یاب
           دیگر نباشد؛ جشن مالِ «لحظهٔ جایزه» است. ولی خودِ نتیجه (امتیازِ
           دو طرف، سکهٔ لیگ و دکمه‌های ادامهٔ کار) باید بماند: لحظه بعد از
           چند ثانیه می‌رود و کاربر نباید بی‌دلیل گیر کند. پس فقط لایهٔ
           جشنِ صحنه حذف شد، نه اطلاعات. */
        <div className="memoryResultPanel">
          <div className="winStageVs">
            <span className="winSide me">
              {pX.nickname || 'بازیکن یک'}
              {g.state?.scores && <b>{fa(Number(g.state.scores[g.me] ?? 0))}</b>}
            </span>
            <span className="winStageSep" aria-hidden="true" />
            <span className="winSide">
              {pO.nickname || (g.vsBot ? 'ربات هوشمند' : 'بازیکن دو')}
              {g.state?.scores && <b>{fa(Number(g.state.scores[g.me === 'X' ? 'O' : 'X'] ?? 0))}</b>}
            </span>
          </div>
          {overActions}
        </div>
      ) : (
        /* ── دوئل کارت و پنالتی: صحنهٔ نتیجهٔ خودشان، دست‌نخورده ──
           خواستهٔ مالک (دورِ ۳۳): «در بازی پنالتی برندهٔ بعد از پایانِ بازی
           باید بزرگ و به‌شکلِ زیبا و جذاب مشخص بشه» — این دو بازی از سیستمِ
           یکپارچه **مستثنا** شدند و جشنِ خودشان سرِ جایش ماند. */
        <WinnerCelebration
          outcome={g.winner === 'DRAW' ? 'draw' : (g.winner === g.me ? 'win' : 'loss')}
          myName={pX.nickname || 'بازیکن یک'} oppName={pO.nickname || (g.vsBot ? 'ربات هوشمند' : 'بازیکن دو')}
          vsBot={Boolean(g.vsBot)}
          myScore={g.state?.scores ? Number(g.state.scores[g.me] ?? 0) : undefined}
          oppScore={g.state?.scores ? Number(g.state.scores[g.me === 'X' ? 'O' : 'X'] ?? 0) : undefined}
        >
        {overActions}
      </WinnerCelebration>
      ))}
    </div>
  );
}
