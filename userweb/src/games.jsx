// Multiplayer games for the web app, kept in their own module so main.jsx
// stays a shell. Speaks the same socket protocol as the Flutter client:
// join / waiting / start / update / over.
import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { play, isEnabled, setEnabled } from './gameAudio.js';
import MemorySolo, { MemoryGrid, runTime } from './memoryGame.jsx';
import TapGame from './tapGame.jsx';

// `bot: false` = جفت‌یاب never falls back to a computer opponent; the player
// stays queued for a human, or plays the solo time-attack mode instead.
const GAMES = [
  // Single-player: no lobby, no opponent, no bot. Mirrors the Flutter hub.
  { id: 'tap', title: 'ضربه‌زن', emoji: '👊', desc: '۵۰ لول ضربه بزن و شخصیت‌ها را باز کن', accent: '#84CC16', singlePlayer: true },
  { id: 'memory', title: 'جفت‌یاب', emoji: '🃏', desc: 'جفت‌ها را به خاطر بسپار و ببر', accent: '#A855F7', bot: false, solo: true },
  { id: 'connect4', title: 'چهار در یک ردیف', emoji: '🔴', desc: 'چهارتا رو ردیف کن', accent: '#F59E0B', bot: true },
  { id: 'reversi', title: 'اتللو', emoji: '⚫', desc: 'مهره‌ها را برگردان', accent: '#34D399', bot: true },
];

const MOVE_SFX = { memory: 'flip', connect4: 'drop', reversi: 'flip' };

const SYMBOLS = {
  memory: { X: '🟣', O: '🔵' },
  connect4: { X: '🔴', O: '🟡' },
  reversi: { X: '⚫', O: '⚪' },
};

// One hook drives every game; boards below are pure rendering.
function useGame(api, token, gameId) {
  const ref = useRef(null);
  const [phase, setPhase] = useState('idle');
  const [g, setG] = useState({
    state: {}, players: null, me: null, turn: null, winner: null,
    vsBot: false, timedOut: null,
  });
  const [error, setError] = useState('');
  const [left, setLeft] = useState(0);
  const [turnSecs, setTurnSecs] = useState(15);
  const [online, setOnline] = useState(true);
  const [searchLeft, setSearchLeft] = useState(0);
  const [searchSecs, setSearchSecs] = useState(15);
  // Does the server intend to hand us a bot when the window closes? For
  // جفت‌یاب the answer is no, and the UI must not promise one.
  const [botFallback, setBotFallback] = useState(true);
  const [stillSearching, setStillSearching] = useState(false);
  const room = useRef(null);
  // Monotonic timers: store "ms remaining" captured against performance.now()
  // instead of the server's absolute deadline. Subtracting a server timestamp
  // from a client Date.now() breaks whenever the device clock is off, which
  // froze the countdown at its maximum value.
  const turnEnd = useRef(null);   // performance.now() target
  const searchEnd = useRef(null); // performance.now() target
  const meRef = useRef(null);
  const turnRef = useRef(null);
  const tickedAt = useRef(-1);

  useEffect(() => {
    // Allow the polling fallback and enable reconnection: websocket-only
    // clients simply never connect behind some proxies, and without
    // reconnection a brief blip left the board frozen with no explanation.
    const s = io(api, {
      auth: { token },
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });
    ref.current = s;
    s.on('connect', () => setOnline(true));
    s.on('disconnect', () => setOnline(false));
    s.on('connect_error', () => setError('اتصال به سرور بازی برقرار نشد'));
    s.on('game:error', d => setError(d?.message || 'خطا در بازی'));
    s.on('game:waiting', d => {
      setError('');
      setPhase('waiting');
      setBotFallback(d?.botFallback !== false);
      setStillSearching(false);
      if (d?.waitMs) setSearchSecs(Math.round(d.waitMs / 1000));
      searchEnd.current = performance.now() + (d?.remainingMs ?? d?.waitMs ?? 15000);
    });

    // Only sent by bot-less games: the first window closed, we're still queued.
    s.on('game:still-waiting', () => {
      setBotFallback(false);
      setStillSearching(true);
      searchEnd.current = null;
      setSearchLeft(0);
    });

    s.on('game:start', d => {
      room.current = d.roomId;
      searchEnd.current = null;
      meRef.current = d.yourSymbol;
      turnRef.current = d.turn;
      if (d.turnMs) setTurnSecs(Math.round(d.turnMs / 1000));
      turnEnd.current = d.remainingMs != null ? performance.now() + d.remainingMs : null;
      tickedAt.current = -1;
      setStillSearching(false);
      play('match_found');
      setG({
        state: d.state || {}, players: d.players, me: d.yourSymbol,
        turn: d.turn, winner: null, vsBot: !!d.vsBot, timedOut: null,
      });
      setPhase('playing');
    });

    s.on('game:update', d => {
      const wasMine = turnRef.current && turnRef.current === meRef.current;
      turnRef.current = d.turn;
      turnEnd.current = d.remainingMs != null ? performance.now() + d.remainingMs : null;
      tickedAt.current = -1;
      if (d.timedOut) play('timeout');
      else if (!wasMine) play(MOVE_SFX[gameId] || 'move', 0.9);
      if (!wasMine && d.turn === meRef.current) play('your_turn');
      setG(p => ({ ...p, state: d.state || p.state, turn: d.turn, timedOut: d.timedOut || null }));
    });

    s.on('game:over', d => {
      turnEnd.current = null;
      setLeft(0);
      const won = d.winner && d.winner === meRef.current;
      play(d.winner === 'DRAW' ? 'draw' : won ? 'win' : 'lose');
      setG(p => ({ ...p, state: d.state || p.state, winner: d.winner }));
      setPhase('over');
    });

    return () => s.disconnect();
  }, [api, token, gameId]);

  // Countdown driven by the server deadline, so both players agree.
  //
  // IDLE COST. This used to call setState five times a second for the whole
  // life of the hook, including while sitting in the lobby with no game and
  // no deadline — `setLeft(0)` on an already-zero value still schedules a
  // React render, and the hook is mounted the entire time the games section
  // is open. Two guards fix that without changing a single visible frame:
  //
  //   * the interval only exists while there IS a deadline to count down to;
  //   * setLeft/setSearchLeft are skipped when the value has not changed —
  //     at 200ms the same whole second is computed five times in a row, so
  //     four of every five renders were redundant even mid-game.
  useEffect(() => {
    // Only phases that can HAVE a deadline run a timer. Checking the phase
    // rather than the refs is deliberate: a ref read during render sees
    // whatever value happens to be there at that instant, and `game:update`
    // reassigns turnEnd without touching phase — which is safe only because
    // it can just fire while already 'playing'. Keying off the phase makes
    // that guarantee explicit instead of incidental.
    if (phase !== 'playing' && phase !== 'waiting') return undefined;

    let lastLeft = null;
    let lastSearch = null;

    const id = setInterval(() => {
      if (searchEnd.current) {
        const s = Math.max(0,
          Math.ceil((searchEnd.current - performance.now()) / 1000));
        if (s !== lastSearch) { lastSearch = s; setSearchLeft(s); }
      }
      if (!turnEnd.current) {
        if (lastLeft !== 0) { lastLeft = 0; setLeft(0); }
        return;
      }
      const secs = Math.max(0,
        Math.ceil((turnEnd.current - performance.now()) / 1000));
      if (secs !== lastLeft) { lastLeft = secs; setLeft(secs); }
      const mine = turnRef.current && turnRef.current === meRef.current;
      if (mine && secs > 0 && secs <= 5 && tickedAt.current !== secs) {
        tickedAt.current = secs;
        play(secs <= 3 ? 'tick_urgent' : 'tick', 0.65);
      }
    }, 200);
    return () => clearInterval(id);
    // `phase` is the signal that a game started or ended, which is exactly
    // when a deadline appears or disappears. The refs themselves cannot be
    // dependencies — mutating a ref does not re-run an effect.
  }, [phase]);

  return {
    phase, error, online, left, turnSecs, searchLeft, searchSecs,
    botFallback, stillSearching, ...g,
    myTurn: phase === 'playing' && g.turn && g.turn === g.me,
    join: () => {
      setError('');
      setStillSearching(false);
      tickedAt.current = -1;
      ref.current?.emit('game:join', { gameId });
      setPhase('waiting');
    },
    move: i => { play(MOVE_SFX[gameId] || 'move'); ref.current?.emit('game:move', { roomId: room.current, move: i }); },
    leave: () => {
      turnEnd.current = null;
      searchEnd.current = null;
      ref.current?.emit('game:leave', { roomId: room.current });
      setStillSearching(false);
      setPhase('idle');
    },
  };
}

function resultText(winner, me) {
  if (winner === 'DRAW') return 'مساوی شد!';
  if (winner === 'DISCONNECT') return 'حریف بازی را ترک کرد';
  if (!winner) return 'پایان بازی';
  if (!me) return `برنده: ${winner}`;
  return winner === me ? 'شما بردید! 🎉' : 'شما باختید';
}

function MemoryBoard({ g }) {
  return (
    <MemoryGrid
      cards={g.state.cards}
      playable={g.state.playable}
      cols={g.state.cols}
      lastResult={g.state.lastResult}
      me={g.me}
      enabled={g.myTurn}
      onMove={g.move}
    />
  );
}

function Connect4Board({ g }) {
  const board = g.state.board || Array(42).fill(null);
  const win = g.state.winLine || [];
  return (
    <div className="c4-board">
      {Array.from({ length: 7 }, (_, c) => (
        <button key={c} className="c4-col" disabled={!g.myTurn} onClick={() => g.move(c)}>
          {Array.from({ length: 6 }, (_, r) => {
            const i = r * 7 + c;
            const v = board[i];
            return <span key={r} className={`c4-disc ${v === 'X' ? 'red' : v === 'O' ? 'yellow' : ''} ${win.includes(i) ? 'win' : ''}`} />;
          })}
        </button>
      ))}
    </div>
  );
}

function ReversiBoard({ g }) {
  const board = g.state.board || Array(64).fill(null);
  const legal = g.state.legal || [];
  return (
    <div className="rv-board">
      {board.map((v, i) => {
        const hint = g.myTurn && legal.includes(i);
        return (
          <button key={i} className="rv-cell" disabled={!hint} onClick={() => g.move(i)}>
            {v ? <span className={`rv-disc ${v === 'X' ? 'dark' : 'light'}`} /> : hint ? <span className="rv-hint" /> : null}
          </button>
        );
      })}
    </div>
  );
}

const BOARDS = { memory: MemoryBoard, connect4: Connect4Board, reversi: ReversiBoard };

function Seat({ g, sym, symbol, openProfile }) {
  const info = g.players?.[symbol];
  const isMe = g.me === symbol;
  const isBot = info?.isBot;
  const active = g.turn === symbol && g.phase === 'playing';
  const canOpen = !isMe && !isBot && info?.id;
  const urgent = active && g.left <= 5 && g.left > 0;
  const pct = active && g.turnSecs ? Math.max(0, Math.min(100, (g.left / g.turnSecs) * 100)) : 0;

  return (
    <div className={`player ${active ? 'on' : ''} ${canOpen ? 'clickable' : ''}`}
      onClick={canOpen ? () => openProfile(info.id) : undefined}
      title={canOpen ? 'مشاهده پروفایل' : undefined}>
      <span>{isBot ? '🤖' : sym[symbol]}</span>
      <b>{isMe ? 'شما' : info?.nickname || 'حریف'}{canOpen ? ' ⓘ' : ''}</b>
      {g.state.scores && <i>{g.state.scores[symbol]}</i>}
      {active && (
        <span className={`timer ${urgent ? 'urgent' : ''}`}>
          <span className="timerBar" style={{ width: `${pct}%` }} />
          <em>{g.left}</em>
        </span>
      )}
    </div>
  );
}

function GameRoom({ api, token, game, onBack, openProfile, onSolo, records }) {
  const g = useGame(api, token, game.id);
  const Board = BOARDS[game.id];
  const sym = SYMBOLS[game.id];
  const [muted, setMuted] = useState(!isEnabled());
  // Offered in place of the bot for جفت‌یاب: an empty lobby means solo play,
  // not a fake "opponent".
  const solo = game.solo ? (
    <div className="soloOffer">
      <div>
        <b>⏱ بازی تنها (رکوردی)</b>
        <small>
          {records?.best
            ? `رکورد فعلی تو: ${runTime(records.best.durationMs)}`
            : 'با ساعت مسابقه بده و رکورد بزن'}
        </small>
      </div>
      <button className="ghost accent" onClick={() => { g.leave(); onSolo(); }}>
        شروع بازی تنها
      </button>
    </div>
  ) : null;

  return (
    <section className="card wide gamePage">
      <div className="gameHead">
        <button className="ghost" onClick={() => { g.leave(); onBack(); }}>‹ بازگشت</button>
        <h2>{game.emoji} {game.title}</h2>
        {g.vsBot && g.phase === 'playing' && <span className="botTag">🤖 با ربات</span>}
        <button className="ghost" title={muted ? 'وصل صدا' : 'قطع صدا'}
          onClick={() => setMuted(!setEnabled(muted))}>{muted ? '🔇' : '🔊'}</button>
      </div>

      {!g.online && <p className="offlineBar">اتصال قطع شد؛ در حال تلاش دوباره...</p>}
      {g.error && <p className="msg">{g.error}</p>}

      {g.phase === 'idle' && (
        <div className="gameCenter">
          <p>{game.bot === false
            ? 'با یک حریف واقعی بازی می‌کنی و امتیاز می‌گیری.'
            : 'اگر حریفی پیدا نشود، با ربات هوشمند بازی می‌کنی.'}</p>
          <button className="main" onClick={g.join}>
            {game.bot === false ? 'پیدا کردن حریف' : 'شروع بازی'}
          </button>
          {solo}
        </div>
      )}

      {g.phase === 'waiting' && (() => {
        // With no bot to fall back on, a countdown stuck at ۰ is a lie — we
        // keep hunting, so switch to an open-ended pulse instead.
        const open = g.stillSearching || (!g.botFallback && g.searchLeft <= 0);
        return (
          <div className="gameCenter">
            <div className={`searchRing${open ? ' open' : ''}`}
              style={{ '--pct': `${((g.searchLeft / (g.searchSecs || 15)) * 100).toFixed(0)}%` }}>
              <span>{open ? '🔎' : g.searchLeft}</span>
            </div>
            <p><b>{open ? 'هنوز در صف حریف واقعی هستی' : 'در حال جستجوی حریف واقعی...'}</b></p>
            <p className="hint">
              {open
                ? 'به محض اینکه بازیکنی وارد شود، بازی شروع می‌شود.'
                : !g.botFallback
                  ? 'در این بازی ربات نداریم — فقط حریف واقعی.'
                  : g.searchLeft > 0
                    ? `اگر حریفی پیدا نشود، بعد از ${g.searchLeft} ثانیه با ربات شروع می‌کنیم.`
                    : 'در حال آماده‌سازی بازی با ربات...'}
            </p>
            {solo}
            <button className="danger" onClick={g.leave}>لغو</button>
          </div>
        );
      })()}

      {(g.phase === 'playing' || g.phase === 'over') && (
        <>
          <div className="scoreboard">
            <Seat g={g} sym={sym} symbol="X" openProfile={openProfile} />
            <div className="turn-indicator">
              {g.phase === 'over' ? 'پایان' : g.myTurn ? 'نوبت شماست' : 'نوبت حریف'}
            </div>
            <Seat g={g} sym={sym} symbol="O" openProfile={openProfile} />
          </div>

          {g.timedOut && g.phase === 'playing' && (
            <p className="timeoutNote">
              {g.timedOut === g.me ? 'وقت شما تمام شد؛ یک حرکت خودکار انجام شد' : 'وقت حریف تمام شد'}
            </p>
          )}

          <Board g={g} />

          {g.phase === 'over' ? (
            <div className="gameCenter">
              <h3>{resultText(g.winner, g.me)}</h3>
              <button className="main" onClick={g.join}>بازی دوباره</button>
              <button className="ghost" onClick={() => { g.leave(); onBack(); }}>پایان</button>
            </div>
          ) : (
            <button className="danger" onClick={g.leave}>خروج از بازی</button>
          )}
        </>
      )}
    </section>
  );
}

export default function GamesHub({ api, token, openProfile = () => {} }) {
  const [active, setActive] = useState(null);
  const [mode, setMode] = useState('versus');
  const [records, setRecords] = useState(null);

  // Personal best + leaderboard for the solo mode. Loaded once per visit and
  // refreshed after a run; a failure must never block play.
  const loadRecords = React.useCallback(async () => {
    try {
      const r = await fetch(`${api}/api/games/memory/solo`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) setRecords(await r.json());
    } catch { /* leaderboard is optional */ }
  }, [api, token]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  if (active && active.id === 'tap') {
    return <TapGame token={token} onBack={() => setActive(null)} />;
  }

  if (active && mode === 'solo') {
    return <MemorySolo api={api} token={token} records={records}
      reload={loadRecords}
      onVersus={() => setMode('versus')}
      onBack={() => { setMode('versus'); setActive(null); }} />;
  }

  if (active) {
    return <GameRoom api={api} token={token} game={active} records={records}
      onSolo={() => setMode('solo')}
      onBack={() => setActive(null)} openProfile={openProfile} />;
  }

  return (
    <section className="card wide">
      <h2>بخش بازی‌ها 🎮</h2>
      <p className="hint">
        با کاربران دیگر آنلاین رقابت کن و امتیاز بگیر.
        جفت‌یاب را می‌توانی تنها هم بازی کنی و رکورد بزنی.
      </p>
      <div className="gameGrid">
        {GAMES.map(g => (
          <button key={g.id} className="gameTile" style={{ '--accent': g.accent }}
            onClick={() => { play('tap'); setMode('versus'); setActive(g); }}>
            <span className="gEmoji">{g.emoji}</span>
            <b>{g.title}</b>
            <small>{g.desc}</small>
            <i>
              {g.singlePlayer
                ? 'تک‌نفره · ۵۰ لول · ذخیرهٔ خودکار'
                : `${g.bot === false ? 'فقط حریف واقعی' : 'دو نفره · با ربات'}${g.solo ? ' · بازی تنها' : ''}`}
            </i>
          </button>
        ))}
      </div>
    </section>
  );
}
