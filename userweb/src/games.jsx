// Full-Fidelity Games Hub for Web — 1:1 with Android (games_page.dart + game_scaffold.dart)
import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { isEnabled, setEnabled } from './gameAudio.js';
import MemorySolo, { MemoryGrid } from './memoryGame.jsx';
import PenaltyGame from './penaltyGame.jsx';
import TapGame from './tapGame.jsx';
import CardDuelWeb from './cardDuelGame.jsx';
import GrowthHub from './GrowthHub.jsx';
import { useGameSession } from './gameSession.js';
import { LevelBadge, DisplayName } from './components/Cosmetics.jsx';
import { fa, asset, avatarUrl, req } from './lib/api.js';
import './growth.css';

const GAMES = [
  { id: 'tap', title: 'ضربه‌زن', icon: '/games/tap/skin_1.webp', desc: '۵۰ لول ضربه بزن و شخصیت‌ها را باز کن', accent: '#84CC16', singlePlayer: true, art: '/games/tap/skin_1.webp' },
  { id: 'penalty', title: 'ضربات پنالتی', icon: '/games/penalty_icon.png', desc: 'شوت دقیق و مهار دروازه‌بان', accent: '#38BDF8', art: '/games/penalty.webp' },
  { id: 'card_duel', title: 'دوئل کارت‌ها', icon: '/games/card_duel_glow.png', desc: 'نبرد سه‌کارتی و کارت‌های کلکسیونی', accent: '#FFD166', art: '/games/card_duel_glow.png' },
  { id: 'memory', title: 'جفت‌یاب', icon: '/games/memory/medal.webp', desc: 'جفت‌های فوتبالی را به خاطر بسپار', accent: '#A855F7', art: '/games/memory.webp' },
];

function tierLabel(level){
  const n=Number(level||0);
  if(n>=90) return {label:'افسانه‌ای', color:'#A855F7'};
  if(n>=60) return {label:'طلایی', color:'#FFD166'};
  if(n>=30) return {label:'نقره‌ای', color:'#38BDF8'};
  if(n>=10) return {label:'برنزی', color:'#22E7A6'};
  return {label:'تازه‌کار', color:'#94A3B8'};
}

export default function Games({ api, token }) {
  const [active, setActive] = useState(null);
  const [mode, setMode] = useState(100);
  const [customStake, setCustomStake] = useState(500);
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
    const s = io(api, {
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
      if (d?.user) setUser(d.user);
    }).catch(() => {});
    req('/api/level', 'GET', null, token).then(d => {
      if (d) setLevel(d);
    }).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (mode !== -1) return;
    const s = io(api, { auth: { token }, transports: ['websocket', 'polling'] });
    s.on('connect', () => s.emit('game:lobby_list'));
    s.on('game:lobby_list', list => setLobbies(list || []));
    s.on('game:lobby_updated', () => s.emit('game:lobby_list'));
    return () => s.disconnect();
  }, [api, token, mode]);

  if (active === 'tap') {
    return <TapGame token={token} onBack={() => setActive(null)} />;
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
        soundOn={soundOn}
        onToggleSound={toggleSound}
        onBack={() => setActive(null)}
      />
    );
  }

  const lvl = level ? Number(level.level||0) : 0;
  const into = level ? Number(level.into||0) : 0;
  const needed = level ? Number(level.needed||0) : 0;
  const progress = level ? Number(level.progress||0) : 0;
  const isMax = level ? Boolean(level.isMax) : false;
  const t = tierLabel(lvl);

  return (
    <div style={{ width: '100%', minWidth: 0, maxWidth: '820px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
          <img
            src={user?.profile_image_url ? asset(user.profile_image_url) : avatarUrl(user?.profile_avatar_key)}
            alt=""
            style={{ width: '52px', height: '52px', borderRadius: '50%', border: '2px solid #38BDF8', objectFit: 'cover' }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
              <h3 style={{ color: '#FFF', fontWeight: '900', margin: 0, fontSize: '15px', display:'flex', alignItems:'center', gap:'6px' }}>
                <span>{user?.nickname || 'قهرمان قلقلی'}</span>
              </h3>
              <div style={{ background: 'rgba(255, 209, 102, 0.18)', border: '1px solid #FFD166', color: '#FFD166', padding: '3px 10px', borderRadius: '20px', fontWeight: '900', fontSize: '11px' }}>
                {fa(user?.current_points || 0)} امتیاز
              </div>
            </div>
            <p style={{ color: '#E2E8F0', fontSize: '11px', margin: 0, lineHeight: 1.4, fontWeight: '600' }}>
              آنلاین بازی کن، XP بگیر
            </p>
          </div>
        </div>
        {level && (
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ background: t.color+'22', border: '1px solid '+t.color+'88', color: t.color, padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '900' }}>Level {lvl}</span>
                <span style={{ color: t.color, fontWeight: '800', fontSize: '12px' }}>{t.label}</span>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '11px', fontWeight: '700' }}>
                {isMax ? 'MAX' : `${fa(into)} / ${fa(needed)}`}
              </span>
            </div>
            <div style={{ height: '7px', background: 'rgba(255,255,255,0.10)', borderRadius: '99px', overflow:'hidden' }}>
              <div style={{ width: `${isMax ? 100 : Math.round(progress*100)}%`, height: '100%', background: `linear-gradient(90deg, ${t.color}99, ${t.color})`, transition:'width 0.7s cubic-bezier(0.2,0.8,0.2,1)' }} />
            </div>
          </div>
        )}
      </div>

      {/* Tap Game Hero Banner */}
      <div
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
            <span style={{ background: '#84CC16', color: '#000', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>۵۰ لول</span>
          </div>
          <p style={{ color: '#CBD5E1', fontSize: '12px', margin: 0 }}>ضربه بزن، شخصیت باز کن، امتیاز بگیر</p>
        </div>
        <span style={{ fontSize: '28px' }}>⚽</span>
      </div>

      {/* Mode Selector (4 Tabs) — رنگ هر قرص مثل اندروید */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
        {[
          { id: 100, label: '۱۰۰ امتیاز', icon: '⚡', color: '#38BDF8' },
          { id: 1000, label: '۱۰۰۰ امتیاز', icon: '🌟', color: '#FFD166' },
          { id: 0, label: 'تمرین با ربات', icon: '🤖', color: '#22E7A6' },
          { id: -1, label: 'اتاق خصوصی', icon: '🚪', color: '#A855F7' },
        ].map(m => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            style={{
              padding: '12px 6px',
              borderRadius: '14px',
              border: mode === m.id ? `1.5px solid ${m.color}` : '1px solid rgba(255,255,255,0.1)',
              background: mode === m.id ? `${m.color}22` : 'rgba(255,255,255,0.04)',
              color: mode === m.id ? '#FFF' : '#94A3B8',
              fontWeight: '900',
              fontSize: '11px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              boxShadow: mode===m.id ? `0 6px 16px ${m.color}30` : 'none',
            }}
          >
            <span style={{ fontSize: '18px', color: mode===m.id ? m.color : '#94A3B8' }}>{m.icon}</span>
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      <div className={`gameStakeNotice ${mode === 0 ? 'practice' : mode === -1 ? 'lobby' : 'competitive'}`}>
        <span>{mode === 0 ? '🤖' : mode === -1 ? '🔐' : '⚠️'}</span>
        <div>
          <b>{mode === 0
            ? 'تمرین رایگان؛ بدون ریسک امتیاز'
            : mode === -1
              ? 'در لابی، سازنده مقدار ورودی را انتخاب می‌کند'
              : `برای ورود حداقل ${fa(mode)} امتیاز لازم داری`}</b>
          <small>{mode === 0
            ? 'بدون اثر روی موجودی و لیگ.'
            : mode === -1
              ? 'ورودی امتیازی تا پایان بازی امن می‌ماند.'
              : `باخت: −${fa(mode)} · برد: پات پس از ۱۰٪ کارمزد.`}</small>
        </div>
      </div>

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
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  {g.title}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginBottom: '12px' }}>
              {[0, 100, 1000, 5000].map(s => (
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
                    fontSize: '11px',
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
                  <div key={l.lobbyId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div>
                      <div style={{ fontWeight: 'bold', color: '#FFF', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{l.hostName}</span>
                        {l.hasPassword && <span title="دارای رمز عبور">🔒</span>}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>بازی: {l.gameId} · {l.stake===0 ? 'رایگان' : fa(l.stake)+' امتیاز'}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
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
                      style={{ background: '#22E7A6', color: '#000', padding: '6px 14px', borderRadius: '16px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
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
              placeholder="کد ۴ رقمی اتاق دوست"
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {GAMES.filter(g => g.id !== 'tap').map(g => (
            <div
              key={g.id}
              className="card"
              onClick={() => {
                if (mode > 0 && Number(user?.current_points || 0) < mode) {
                  alert(`برای این مسابقه حداقل ${fa(mode)} امتیاز لازم داری`);
                  return;
                }
                if (mode === 0) {
                  setActive({ id: g.id, vsBot: true });
                } else {
                  setActive({ id: g.id, stake: mode });
                }
              }}
              style={{
                padding: '0',
                borderRadius: '16px',
                border: '1px solid rgba(255,255,255,0.08)',
                cursor: 'pointer',
                overflow: 'hidden',
              }}
            >
              <div style={{ height: '86px', background: `linear-gradient(135deg, ${g.accent}22, transparent)`, display: 'flex', alignItems: 'center', padding: '0 16px', gap: '12px', position:'relative' }}>
                <img src={g.icon} alt="" className="gameTileIcon" />
                <div style={{ flex:1 }}>
                  <h4 style={{ color: '#FFF', fontWeight: '900', margin: '0 0 2px', fontSize: '14px' }}>{g.title}</h4>
                  <p style={{ color: '#94A3B8', fontSize: '11px', margin: 0 }}>{g.desc}</p>
                </div>
                <span style={{ fontSize: '11px', fontWeight: '900', color: mode === 0 ? '#22E7A6' : (mode===1000 ? '#FFD166' : '#38BDF8'), background: 'rgba(255,255,255,0.06)', padding: '4px 8px', borderRadius: '10px', border: `1px solid ${mode===0 ? '#22E7A6' : (mode===1000 ? '#FFD166' : '#38BDF8')}66` }}>
                  {mode === 0
                    ? 'تمرین فوری'
                    : `آنلاین · ${fa(mode)} امتیاز`}
                </span>
              </div>
              <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap:'8px', background:'rgba(0,0,0,0.2)' }}>
                {g.id === 'memory' && mode === 0 ? (
                  <button type="button" onClick={e => { e.stopPropagation(); openMemorySolo(); }}
                    style={{ color:'#A855F7', border:'1px solid #A855F777', background:'#A855F71A', borderRadius:'10px', padding:'6px 10px', fontSize:'11px', fontWeight:'800', cursor:'pointer' }}>
                    رکوردی با ساعت
                  </button>
                ) : <span />}
                <span style={{ background: g.accent, color: '#000', padding: '7px 16px', borderRadius: '10px', fontWeight: '900', fontSize: '12px' }}>شروع</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <GrowthHub api={api} token={token} onSocketGame={(socket, start) => setActive({
        id: start.gameId || 'card_duel',
        stake: Number(start.stake || 0),
        externalSocket: socket,
        initialStart: start,
      })} />
    </div>
  );
}


function GameScaffold({ api, token, gameId, stake, vsBot, roomCode, externalSocket, initialStart, onSolo, soundOn, onToggleSound, onBack }) {
  const {
    phase, g, error, secondsLeft, move, leave, playBot, joinOnline, rematch,
    stillSearching, connectionNotice, rematchWaiting,
  } = useGameSession(
    api, token, gameId, stake, vsBot, roomCode, externalSocket, initialStart);
  const activeGameId = g.gameId || gameId;
  const activeStake = Number(g.stake ?? stake ?? 0);
  const pX = g.players?.X || { nickname: 'کاربر ۱' };
  const pO = g.players?.O || (g.vsBot ? { nickname: 'هوش مصنوعی (ربات)', isBot: true } : { nickname: 'کاربر ۲' });
  const isOnlineMatch = activeStake === 100 || activeStake === 1000;

  return (
    <div className="card wide" style={{ padding: '20px', textAlign: 'center', maxWidth: '640px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <button type="button" onClick={() => { leave(); onBack(); }} style={{ background: 'rgba(255,255,255,0.1)', color: '#FFF', border: 'none', padding: '6px 14px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}>
          ← بازگشت
        </button>
        <span style={{ fontWeight: '900', color: '#38BDF8', fontSize: '16px' }}>
          {activeGameId === 'penalty' ? 'ضربات پنالتی' : (activeGameId === 'memory' ? 'جفت‌یاب' : 'دوئل کارت‌ها')}
        </span>
        <button type="button" onClick={onToggleSound} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }}>
          {soundOn ? '🔊' : '🔇'}
        </button>
      </div>

      {error && <div className="err" style={{ marginBottom: '12px', background:'#EF444422', border:'1px solid #EF4444', color:'#FCA5A5', padding:'8px', borderRadius:'8px' }}>{error}</div>}
      {connectionNotice && <div className="gameReconnectBanner">{connectionNotice}</div>}

      {phase === 'playing' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.35)', padding: '10px 16px', borderRadius: '16px', marginBottom: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: g.turn === 'X' ? '2px solid #38BDF8' : 'none', paddingBottom: '4px' }}>
            <span style={{ fontWeight: '900', color: '#FFF' }}>{pX.nickname}</span>
            {g.turn === 'X' && <span style={{ background: '#38BDF8', color: '#000', padding: '2px 6px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold' }}>نوبت ({fa(secondsLeft)}s)</span>}
          </div>
          <span style={{ color: '#94A3B8', fontWeight: '900', fontSize: '14px' }}>VS</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: g.turn === 'O' ? '2px solid #F59E0B' : 'none', paddingBottom: '4px' }}>
            {g.turn === 'O' && <span style={{ background: '#F59E0B', color: '#000', padding: '2px 6px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold' }}>نوبت ({fa(secondsLeft)}s)</span>}
            <span style={{ fontWeight: '900', color: '#FFF' }}>{pO.nickname}</span>
          </div>
        </div>
      )}

      {activeStake>0 && !g.vsBot && phase==='playing' && (
        <div style={{ margin:'0 auto 10px', display:'inline-flex', alignItems:'center', gap:'6px', background:'linear-gradient(90deg, #FFD70022, #FF9F4322)', border:'1px solid #FFD166', color:'#FFD166', padding:'4px 12px', borderRadius:'99px', fontSize:'11px', fontWeight:'900' }}>
          <span>🏆</span> پات مسابقه: {fa(g.netPot||activeStake*2*0.9)} امتیاز (۱۰٪ کارمزد)
        </div>
      )}

      {phase === 'idle' && (
        <div style={{ padding:'36px 18px', display:'flex', flexDirection:'column', alignItems:'center', gap:'12px' }}>
          <div style={{ fontSize:'42px' }}>🎮</div>
          <h3 style={{ margin:0, color:'#FFF' }}>آماده‌ای شروع کنیم؟</h3>
          <p className="hint">آنلاین با حریف واقعی رقابت کن یا فوری با ربات تمرین کن.</p>
          <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'center', gap:'8px' }}>
            <button className="main" type="button" onClick={joinOnline}>پیدا کردن حریف آنلاین</button>
            <button type="button" onClick={playBot}>بازی فوری با ربات</button>
            {onSolo && <button type="button" onClick={onSolo}>بازی رکوردی با ساعت</button>}
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div style={{ padding:'28px 18px', display:'flex', justifyContent:'center', gap:'8px', flexWrap:'wrap' }}>
          <button type="button" className="main" onClick={stake > 0 ? joinOnline : playBot}>تلاش دوباره</button>
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
        <div>
          {activeGameId === 'penalty' && (
            <PenaltyGame state={g.state} mySymbol={g.me} turn={g.turn} onMove={move} />
          )}
          {activeGameId === 'memory' && (
            <MemoryGrid cards={g.state?.cards || []} playable={g.state?.playable || []} onMove={move} />
          )}
        </div>
      )}

      {phase === 'over' && (
        <div style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          <div style={{ fontSize: '48px' }}>{g.winner === 'DRAW' ? '🤝' : (g.winner === g.me ? '🎉' : '💔')}</div>
          <h2 style={{ color: g.winner === g.me ? '#22E7A6' : '#FFF', fontWeight: '900', margin: 0 }}>
            {g.winner === 'DRAW' ? 'مسابقه مساوی شد!' : (g.winner === g.me ? 'تبریک! شما برنده شدید' : 'متاسفانه باختید!')}
          </h2>
          <div style={{ display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center' }}>
            <button type="button" disabled={rematchWaiting || !g.rematchAvailable} onClick={rematch}
              style={{ background:'linear-gradient(135deg,#22E7A6,#38BDF8)',color:'#03121f',border:0,padding:'12px 20px',borderRadius:16,fontWeight:900 }}>
              {rematchWaiting ? 'منتظر قبول حریف…' : 'دوباره با همین حریف'}
            </button>
            <button
              type="button"
              onClick={() => { leave(); onBack(); }}
              style={{ background: 'linear-gradient(135deg, #38BDF8, #0284C7)', color: '#FFF', border: 'none', padding: '12px 28px', borderRadius: '16px', fontWeight: '900', fontSize: '14px', cursor: 'pointer' }}
            >بازگشت به باشگاه بازی‌ها</button>
          </div>
        </div>
      )}
    </div>
  );
}
