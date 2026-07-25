// Multiplayer games for the web app, kept in their own module so main.jsx
// stays a shell. Speaks the same socket protocol as the Flutter client:
// join / waiting / start / update / over.
import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { play, isEnabled, setEnabled } from './gameAudio.js';

const GAMES = [
  { id: 'snakes', title: 'مار و پله', emoji: '🐍', desc: 'دو تاس بریز، هوشمندانه انتخاب کن', accent: '#A855F7' },
  { id: 'connect4', title: 'چهار در یک ردیف', emoji: '🔴', desc: 'چهارتا رو ردیف کن', accent: '#F59E0B' },
  { id: 'reversi', title: 'اتللو', emoji: '⚫', desc: 'مهره‌ها را برگردان', accent: '#34D399' },
];

const MOVE_SFX = { snakes: 'drop', connect4: 'drop', reversi: 'flip' };

const SYMBOLS = {
  snakes: { X: '🟣', O: '🔵' },
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
  const [searchLeft, setSearchLeft] = useState(0);
  const [searchSecs, setSearchSecs] = useState(15);
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
    const s = io(api, { auth: { token }, transports: ['websocket'], forceNew: true });
    ref.current = s;
    s.on('connect_error', () => setError('اتصال به سرور بازی برقرار نشد'));
    s.on('game:error', d => setError(d?.message || 'خطا در بازی'));
    s.on('game:waiting', d => {
      setError('');
      setPhase('waiting');
      if (d?.waitMs) setSearchSecs(Math.round(d.waitMs / 1000));
      searchEnd.current = performance.now() + (d?.remainingMs ?? d?.waitMs ?? 15000);
    });

    s.on('game:start', d => {
      room.current = d.roomId;
      searchEnd.current = null;
      meRef.current = d.yourSymbol;
      turnRef.current = d.turn;
      if (d.turnMs) setTurnSecs(Math.round(d.turnMs / 1000));
      turnEnd.current = d.remainingMs != null ? performance.now() + d.remainingMs : null;
      tickedAt.current = -1;
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
  useEffect(() => {
    const id = setInterval(() => {
      if (searchEnd.current) {
        setSearchLeft(Math.max(0, Math.ceil((searchEnd.current - performance.now()) / 1000)));
      }
      if (!turnEnd.current) { setLeft(0); return; }
      const secs = Math.max(0, Math.ceil((turnEnd.current - performance.now()) / 1000));
      setLeft(secs);
      const mine = turnRef.current && turnRef.current === meRef.current;
      if (mine && secs > 0 && secs <= 5 && tickedAt.current !== secs) {
        tickedAt.current = secs;
        play(secs <= 3 ? 'tick_urgent' : 'tick', 0.65);
      }
    }, 200);
    return () => clearInterval(id);
  }, []);

  return {
    phase, error, left, turnSecs, searchLeft, searchSecs, ...g,
    myTurn: phase === 'playing' && g.turn && g.turn === g.me,
    join: () => {
      setError('');
      tickedAt.current = -1;
      ref.current?.emit('game:join', { gameId });
      setPhase('waiting');
    },
    move: i => { play(MOVE_SFX[gameId] || 'move'); ref.current?.emit('game:move', { roomId: room.current, move: i }); },
    leave: () => {
      turnEnd.current = null;
      searchEnd.current = null;
      ref.current?.emit('game:leave', { roomId: room.current });
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

// Boustrophedon numbering: 1 bottom-left, rows alternate direction.
function squareAt(row, col) {
  const fromBottom = 9 - row;
  const ltr = fromBottom % 2 === 0;
  return fromBottom * 10 + (ltr ? col + 1 : 10 - col);
}

const DIE_FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

const EVENT_TEXT = {
  ladder: '🪜 نردبان! بالا رفتی',
  snake: '🐍 مار! پایین افتادی',
  bump: '💥 حریف را به عقب زدی',
  blocked: '⛔ حرکت ممکن نبود، نوبت رد شد',
  win: '🏁 رسیدی!',
};

function SnakesBoard({ g }) {
  const pos = g.state.pos || { X: 0, O: 0 };
  const ladders = g.state.ladders || {};
  const snakes = g.state.snakes || {};
  const dice = g.state.dice || [];
  const playable = g.state.playable || [];

  return (
    <div className="snakesWrap">
      <div className="snakesBoard">
        {Array.from({ length: 10 }, (_, row) =>
          Array.from({ length: 10 }, (_, col) => {
            const n = squareAt(row, col);
            const cls = [
              'sqr',
              ladders[n] ? 'ladder' : '',
              snakes[n] ? 'snake' : '',
              n === 100 ? 'finish' : '',
            ].join(' ');
            return (
              <div key={n} className={cls}>
                <span className="sqn">{n === 100 ? '🏁' : n}</span>
                {pos.X === n && <i className="tok x" />}
                {pos.O === n && <i className="tok o" />}
              </div>
            );
          }),
        )}
      </div>

      {g.state.event && EVENT_TEXT[g.state.event] && (
        <p className="snakeEvent">{EVENT_TEXT[g.state.event]}</p>
      )}

      <p className="hint">{g.myTurn ? 'یک تاس را انتخاب کن' : 'نوبت حریف...'}</p>
      <div className="diceRow">
        {dice.map((d, i) => (
          <button
            key={i}
            className={`die ${g.myTurn && playable.includes(i) ? 'on' : ''}`}
            disabled={!g.myTurn || !playable.includes(i)}
            onClick={() => g.move(i)}
          >
            {DIE_FACE[d] || d}
          </button>
        ))}
      </div>
    </div>
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

const BOARDS = { snakes: SnakesBoard, connect4: Connect4Board, reversi: ReversiBoard };

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

function GameRoom({ api, token, game, onBack, openProfile }) {
  const g = useGame(api, token, game.id);
  const Board = BOARDS[game.id];
  const sym = SYMBOLS[game.id];
  const [muted, setMuted] = useState(!isEnabled());

  return (
    <section className="card wide gamePage">
      <div className="gameHead">
        <button className="ghost" onClick={() => { g.leave(); onBack(); }}>‹ بازگشت</button>
        <h2>{game.emoji} {game.title}</h2>
        {g.vsBot && g.phase === 'playing' && <span className="botTag">🤖 با ربات</span>}
        <button className="ghost" title={muted ? 'وصل صدا' : 'قطع صدا'}
          onClick={() => setMuted(!setEnabled(muted))}>{muted ? '🔇' : '🔊'}</button>
      </div>

      {g.error && <p className="msg">{g.error}</p>}

      {g.phase === 'idle' && (
        <div className="gameCenter">
          <p>اگر حریفی پیدا نشود، با ربات هوشمند بازی می‌کنی.</p>
          <button className="main" onClick={g.join}>شروع بازی</button>
        </div>
      )}

      {g.phase === 'waiting' && (
        <div className="gameCenter">
          <div className="searchRing" style={{ '--pct': `${((g.searchLeft / (g.searchSecs || 15)) * 100).toFixed(0)}%` }}>
            <span>{g.searchLeft}</span>
          </div>
          <p><b>در حال جستجوی حریف واقعی...</b></p>
          <p className="hint">
            {g.searchLeft > 0
              ? `اگر حریفی پیدا نشود، بعد از ${g.searchLeft} ثانیه با ربات شروع می‌کنیم.`
              : 'در حال آماده‌سازی بازی با ربات...'}
          </p>
          <button className="danger" onClick={g.leave}>لغو</button>
        </div>
      )}

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
  if (active) {
    return <GameRoom api={api} token={token} game={active}
      onBack={() => setActive(null)} openProfile={openProfile} />;
  }
  return (
    <section className="card wide">
      <h2>بخش بازی‌ها 🎮</h2>
      <p className="hint">با کاربران دیگر آنلاین رقابت کن — اگر حریفی نبود، ربات وارد می‌شود.</p>
      <div className="gameGrid">
        {GAMES.map(g => (
          <button key={g.id} className="gameTile" style={{ '--accent': g.accent }}
            onClick={() => { play('tap'); setActive(g); }}>
            <span className="gEmoji">{g.emoji}</span>
            <b>{g.title}</b>
            <small>{g.desc}</small>
            <i>دو نفره · با ربات</i>
          </button>
        ))}
      </div>
    </section>
  );
}
