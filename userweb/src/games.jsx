// Multiplayer games for the web app (4 Modes: 100, 1000, Bot Practice, Private Rooms & Lobbies).
import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { play } from './gameAudio.js';
import MemorySolo, { MemoryGrid } from './memoryGame.jsx';
import PenaltyGame from './penaltyGame.jsx';
import TapGame from './tapGame.jsx';
import { AssetIcon, SvgIcon } from './components/IconAsset.jsx';
import { LevelBadge, DisplayName } from './components/Cosmetics.jsx';
import { fa, asset, avatarUrl, req } from './lib/api.js';

const GAMES = [
  { id: 'tap', title: 'ضربه‌زن', emoji: '⚽', desc: '۵۰ لول ضربه بزن و شخصیت‌ها را باز کن', accent: '#84CC16', singlePlayer: true },
  { id: 'penalty', title: 'ضربات پنالتی', emoji: '🥅', desc: 'شوت دقیق و مهار دروازه‌بان', accent: '#38BDF8' },
  { id: 'memory', title: 'جفت‌یاب', emoji: '🎁', desc: 'جفت‌های فوتبالی را به خاطر بسپار', accent: '#A855F7' },
  { id: 'reversi', title: 'اتللو', emoji: '⚪', desc: 'مهره‌ها را برگردان و تخته را فتح کن', accent: '#34D399' },
];

function useGame(api, token, gameId, stake = 0, vsBot = false, roomCode = null) {
  const ref = useRef(null);
  const [phase, setPhase] = useState('idle');
  const [g, setG] = useState({
    state: {}, players: null, me: null, turn: null, winner: null,
    vsBot: false, timedOut: null,
  });
  const [error, setError] = useState('');
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const s = io(api, {
      auth: { token },
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
    });
    ref.current = s;
    s.on('connect', () => {
      setOnline(true);
      if (vsBot) {
        s.emit('game:play_bot', { gameId });
        setPhase('waiting');
      } else if (roomCode) {
        s.emit('game:join_room', { roomCode });
        setPhase('waiting');
      } else if (stake > 0) {
        s.emit('game:join', { gameId, stake, vsBot: false });
        setPhase('waiting');
      }
    });
    s.on('disconnect', () => setOnline(false));
    s.on('connect_error', () => setError('اتصال برقرار نشد'));

    s.on('game:waiting', () => setPhase('waiting'));
    s.on('game:start', d => {
      setG({
        state: d.state || {},
        players: d.players || null,
        me: d.yourSymbol || null,
        turn: d.turn || null,
        winner: null,
        vsBot: Boolean(d.vsBot),
        timedOut: null,
      });
      setPhase('playing');
    });

    s.on('game:update', d => {
      setG(prev => ({
        ...prev,
        state: d.state || prev.state,
        turn: d.turn || prev.turn,
        timedOut: d.timedOut || null,
      }));
    });

    s.on('game:over', d => {
      setG(prev => ({
        ...prev,
        state: d.state || prev.state,
        winner: d.winner || null,
      }));
      setPhase('over');
    });

    s.on('game:error', d => setError(d.message || 'خطا در بازی'));

    return () => {
      s.emit('game:leave');
      s.disconnect();
    };
  }, [api, token, gameId, stake, vsBot, roomCode]);

  const move = payload => {
    if (phase !== 'playing') return;
    ref.current?.emit('game:move', { move: payload });
  };

  const leave = () => {
    ref.current?.emit('game:leave');
    setPhase('idle');
  };

  return { phase, g, error, online, move, leave };
}

export default function Games({ api, token }) {
  const [active, setActive] = useState(null);
  const [mode, setMode] = useState(100); // 100, 1000, 0 (bot), -1 (private)
  const [customStake, setCustomStake] = useState(500);
  const [customGame, setCustomGame] = useState('penalty');
  const [customPass, setCustomPass] = useState('');
  const [lobbies, setLobbies] = useState([]);
  const [joinCode, setJoinCode] = useState('');
  const [user, setUser] = useState(null);
  const [level, setLevel] = useState(null);

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
    return <GamePlay api={api} token={token} gameId={active.id} stake={active.stake} vsBot={active.vsBot} roomCode={active.roomCode} onBack={() => setActive(null)} />;
  }

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ── User Header Card (Avatar, Nickname, Level, Total Points, and Subtitle) ── */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, #16345F, #071521)',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          padding: '16px 20px',
          borderRadius: '20px',
          display: 'flex',
          gap: '14px',
          alignItems: 'center',
        }}
      >
        <img
          src={user?.profile_image_url ? asset(user.profile_image_url) : avatarUrl(user?.profile_avatar_key)}
          alt=""
          style={{ width: '56px', height: '56px', borderRadius: '50%', border: '2px solid #38BDF8', objectFit: 'cover' }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ color: '#FFF', fontWeight: '900', margin: 0, fontSize: '16px' }}>{user?.nickname || 'قهرمان قلقلی'}</h3>
              {level && <LevelBadge level={level.level} />}
            </div>
            <div style={{ background: 'rgba(255, 209, 102, 0.18)', border: '1px solid #FFD166', color: '#FFD166', padding: '3px 10px', borderRadius: '20px', fontWeight: '900', fontSize: '12px' }}>
              {fa(user?.current_points || 0)} امتیاز
            </div>
          </div>
          <p style={{ color: '#E2E8F0', fontSize: '12px', margin: 0, lineHeight: 1.45, fontWeight: '600' }}>
            با هر بازی آنلاین XP میگیری و با برنده شدن امتیاز میگیری و با باخت امتیازت کم میشه پس دقت کن!
          </p>
        </div>
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
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h3 style={{ color: '#FFF', fontWeight: '900', margin: 0, fontSize: '15px' }}>بازی ضربه‌زن (تک‌نفره)</h3>
            <span style={{ background: '#84CC16', color: '#000', padding: '2px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>۵۰ لول</span>
          </div>
          <p style={{ color: '#CBD5E1', fontSize: '12px', margin: 0 }}>ضربه بزن، شخصیت‌های مخفی را باز کن و امتیاز بگیر</p>
        </div>
        <span style={{ fontSize: '28px' }}>⚽</span>
      </div>

      {/* Mode Selector (4 Tabs) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
        {[
          { id: 100, label: '۱۰۰ امتیاز', icon: '⚡' },
          { id: 1000, label: '۱۰۰۰ امتیاز', icon: '🌟' },
          { id: 0, label: 'تمرین با ربات', icon: '🤖' },
          { id: -1, label: 'اتاق خصوصی', icon: '🚪' },
        ].map(m => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            style={{
              padding: '12px 6px',
              borderRadius: '14px',
              border: mode === m.id ? '1.5px solid #38BDF8' : '1px solid rgba(255,255,255,0.1)',
              background: mode === m.id ? 'rgba(56, 189, 248, 0.22)' : 'rgba(255,255,255,0.04)',
              color: mode === m.id ? '#FFF' : '#94A3B8',
              fontWeight: '900',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span style={{ fontSize: '18px' }}>{m.icon}</span>
            <span>{m.label}</span>
          </button>
        ))}
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
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  {g.title}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginBottom: '12px' }}>
              {[100, 200, 500, 1000, 2000, 5000, 10000].map(s => (
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
                  {fa(s)} امتیاز
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="رمز عبور اتاق (اختیاری — در صورت خالی بودن عمومی است)"
              value={customPass}
              onChange={e => setCustomPass(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)', color: '#FFF', marginBottom: '12px' }}
            />

            <button
              type="button"
              onClick={() => {
                const s = io(api, { auth: { token }, transports: ['websocket', 'polling'] });
                s.emit('game:create_lobby', { gameId: customGame, stake: customStake, password: customPass });
                alert('لابی شما با موفقیت ساخته شد و در لیست قرار گرفت');
              }}
              style={{ width: '100%', padding: '12px', borderRadius: '12px', background: '#A855F7', color: '#FFF', fontWeight: '900', border: 'none', cursor: 'pointer' }}
            >
              ساخت لابی و ثبت در لیست
            </button>
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
                      <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>بازی: {l.gameId} · {fa(l.stake)} امتیاز</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        let pass = '';
                        if (l.hasPassword) {
                          pass = prompt('رمز عبور اتاق را وارد کنید:') || '';
                        }
                        const s = io(api, { auth: { token }, transports: ['websocket', 'polling'] });
                        s.emit('game:join_lobby', { lobbyId: l.lobbyId, password: pass });
                        setActive({ id: l.gameId, stake: l.stake });
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
                if (joinCode.trim()) setActive({ id: 'penalty', roomCode: joinCode.trim() });
              }}
              style={{ padding: '10px 20px', background: '#38BDF8', color: '#000', borderRadius: '10px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
            >
              ورود
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {GAMES.filter(g => !g.singlePlayer).map(g => (
            <div
              key={g.id}
              className="card"
              onClick={() => {
                if (mode === 0) {
                  setActive({ id: g.id, vsBot: true });
                } else {
                  setActive({ id: g.id, stake: mode });
                }
              }}
              style={{
                padding: '16px',
                borderRadius: '16px',
                border: '1px solid rgba(255,255,255,0.08)',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h4 style={{ color: '#FFF', fontWeight: '900', margin: '0 0 4px', fontSize: '15px' }}>{g.title}</h4>
                <p style={{ color: '#94A3B8', fontSize: '12px', margin: 0 }}>{g.desc}</p>
                <div style={{ marginTop: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', color: mode === 0 ? '#22E7A6' : '#FFD166', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '10px' }}>
                    {mode === 0 ? 'تمرین فوری با هوش مصنوعی' : `مسابقه آنلاین (${fa(mode)} امتیاز)`}
                  </span>
                </div>
              </div>
              <button
                type="button"
                style={{ background: '#38BDF8', color: '#000', border: 'none', padding: '8px 16px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer' }}
              >
                شروع بازی
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GamePlay({ api, token, gameId, stake, vsBot, roomCode, onBack }) {
  const { phase, g, error, move, leave } = useGame(api, token, gameId, stake, vsBot, roomCode);

  return (
    <div className="card wide" style={{ padding: '20px', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <button type="button" onClick={() => { leave(); onBack(); }} style={{ background: 'rgba(255,255,255,0.1)', color: '#FFF', border: 'none', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer' }}>
          ← بازگشت
        </button>
        <span style={{ fontWeight: 'bold', color: '#38BDF8' }}>
          {gameId === 'penalty' ? 'ضربات پنالتی' : (gameId === 'memory' ? 'جفت‌یاب' : 'اتللو')}
        </span>
      </div>

      {error && <div className="err" style={{ marginBottom: '12px' }}>{error}</div>}

      {phase === 'waiting' && (
        <div style={{ padding: '30px' }}>
          <div style={{ fontSize: '32px', marginBottom: '10px' }}>⏳</div>
          <h3>در حال اتصال به مسابقه...</h3>
        </div>
      )}

      {phase === 'playing' && (
        <div>
          {gameId === 'penalty' && (
            <PenaltyGame state={g.state} mySymbol={g.me} turn={g.turn} onMove={move} />
          )}

          {gameId === 'memory' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', maxWidth: '360px', margin: '0 auto' }}>
              {((g.state?.board) || Array(16).fill({})).map((c, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={g.turn !== g.me || c.claimed}
                  onClick={() => move(i)}
                  style={{
                    height: '70px',
                    borderRadius: '10px',
                    background: c.claimed ? 'rgba(255,255,255,0.05)' : (c.face ? '#A855F7' : '#1E1B4B'),
                    border: '1px solid rgba(255,255,255,0.2)',
                    fontSize: '20px',
                    color: '#FFF',
                    cursor: 'pointer',
                  }}
                >
                  {c.claimed ? '' : (c.face || '❓')}
                </button>
              ))}
            </div>
          )}

          {gameId === 'reversi' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '2px', maxWidth: '360px', margin: '0 auto', background: '#15803D', padding: '4px', borderRadius: '8px' }}>
              {((g.state?.board) || Array(64).fill(null)).map((cell, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => move(i)}
                  style={{
                    height: '40px',
                    background: '#166534',
                    border: 'none',
                    borderRadius: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  {cell === 'X' && <span style={{ width: '22px', height: '22px', background: '#000', borderRadius: '50%', display: 'inline-block' }} />}
                  {cell === 'O' && <span style={{ width: '22px', height: '22px', background: '#FFF', borderRadius: '50%', display: 'inline-block' }} />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {phase === 'over' && (
        <div style={{ padding: '30px' }}>
          <h2>{g.winner === 'DRAW' ? 'مساوی!' : (g.winner === g.me ? '🎉 شما بردید!' : 'باختید!')}</h2>
          <button type="button" onClick={() => { leave(); onBack(); }} style={{ background: '#38BDF8', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '12px', fontWeight: 'bold', marginTop: '16px', cursor: 'pointer' }}>
            بازگشت به منوی بازی‌ها
          </button>
        </div>
      )}
    </div>
  );
}
