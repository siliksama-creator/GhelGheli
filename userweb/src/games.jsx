// Multiplayer games for the web app, kept in their own module so main.jsx
// stays a shell. Speaks the same socket protocol as the Flutter client:
// join / waiting / start / update / over.
import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const GAMES = [
  { id: 'tictactoe', title: 'دوز', emoji: '❌', desc: 'کلاسیک سه‌تایی', accent: '#22D3EE' },
  { id: 'connect4', title: 'چهار در یک ردیف', emoji: '🔴', desc: 'چهارتا رو ردیف کن', accent: '#F59E0B' },
  { id: 'reversi', title: 'اتللو', emoji: '⚫', desc: 'مهره‌ها را برگردان', accent: '#34D399' },
];

const SYMBOLS = {
  tictactoe: { X: '❌', O: '⭕' },
  connect4: { X: '🔴', O: '🟡' },
  reversi: { X: '⚫', O: '⚪' },
};

// One hook drives every game; boards below are pure rendering.
function useGame(api, token, gameId) {
  const ref = useRef(null);
  const [phase, setPhase] = useState('idle');
  const [g, setG] = useState({ state: {}, players: null, me: null, turn: null, winner: null, vsBot: false });
  const [error, setError] = useState('');
  const room = useRef(null);

  useEffect(() => {
    const s = io(api, { auth: { token }, transports: ['websocket'], forceNew: true });
    ref.current = s;
    s.on('connect_error', () => setError('اتصال به سرور بازی برقرار نشد'));
    s.on('game:error', d => setError(d?.message || 'خطا در بازی'));
    s.on('game:waiting', () => { setError(''); setPhase('waiting'); });
    s.on('game:start', d => {
      room.current = d.roomId;
      setG({ state: d.state || {}, players: d.players, me: d.yourSymbol, turn: d.turn, winner: null, vsBot: !!d.vsBot });
      setPhase('playing');
    });
    s.on('game:update', d => setG(p => ({ ...p, state: d.state || p.state, turn: d.turn })));
    s.on('game:over', d => {
      setG(p => ({ ...p, state: d.state || p.state, winner: d.winner }));
      setPhase('over');
    });
    return () => s.disconnect();
  }, [api, token, gameId]);

  return {
    phase, error, ...g,
    myTurn: phase === 'playing' && g.turn && g.turn === g.me,
    join: () => { setError(''); ref.current?.emit('game:join', { gameId }); setPhase('waiting'); },
    move: i => ref.current?.emit('game:move', { roomId: room.current, move: i }),
    leave: () => { ref.current?.emit('game:leave', { roomId: room.current }); setPhase('idle'); },
  };
}

function resultText(winner, me) {
  if (winner === 'DRAW') return 'مساوی شد!';
  if (winner === 'DISCONNECT') return 'حریف بازی را ترک کرد';
  if (!winner) return 'پایان بازی';
  if (!me) return `برنده: ${winner}`;
  return winner === me ? 'شما بردید! 🎉' : 'شما باختید';
}

function TicTacToeBoard({ g }) {
  const board = g.state.board || Array(9).fill(null);
  return (
    <div className="ttt-board">
      {board.map((c, i) => (
        <button key={i} className="ttt-cell" disabled={!g.myTurn || c} onClick={() => g.move(i)}>
          {c === 'X' ? '❌' : c === 'O' ? '⭕' : ''}
        </button>
      ))}
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

const BOARDS = { tictactoe: TicTacToeBoard, connect4: Connect4Board, reversi: ReversiBoard };

function GameRoom({ api, token, game, onBack }) {
  const g = useGame(api, token, game.id);
  const Board = BOARDS[game.id];
  const sym = SYMBOLS[game.id];
  const scores = g.state.scores;

  return (
    <section className="card wide gamePage">
      <div className="gameHead">
        <button className="ghost" onClick={() => { g.leave(); onBack(); }}>‹ بازگشت</button>
        <h2>{game.emoji} {game.title}</h2>
        {g.vsBot && g.phase === 'playing' && <span className="botTag">🤖 با ربات</span>}
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
          <p>در حال جستجوی حریف...</p>
          <button className="danger" onClick={g.leave}>لغو</button>
        </div>
      )}

      {(g.phase === 'playing' || g.phase === 'over') && (
        <>
          <div className="scoreboard">
            <div className={`player ${g.turn === 'X' ? 'on' : ''}`}>
              <span>{sym.X}</span><b>{g.me === 'X' ? 'شما' : g.players?.X?.nickname || 'حریف'}</b>
              {scores && <i>{scores.X}</i>}
            </div>
            <div className="turn-indicator">
              {g.phase === 'over' ? 'پایان' : g.myTurn ? 'نوبت شماست' : 'نوبت حریف'}
            </div>
            <div className={`player ${g.turn === 'O' ? 'on' : ''}`}>
              <span>{sym.O}</span><b>{g.me === 'O' ? 'شما' : g.players?.O?.nickname || 'حریف'}</b>
              {scores && <i>{scores.O}</i>}
            </div>
          </div>

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

export default function GamesHub({ api, token }) {
  const [active, setActive] = useState(null);
  if (active) {
    return <GameRoom api={api} token={token} game={active} onBack={() => setActive(null)} />;
  }
  return (
    <section className="card wide">
      <h2>بخش بازی‌ها 🎮</h2>
      <p className="hint">با کاربران دیگر آنلاین رقابت کن — اگر حریفی نبود، ربات وارد می‌شود.</p>
      <div className="gameGrid">
        {GAMES.map(g => (
          <button key={g.id} className="gameTile" style={{ '--accent': g.accent }} onClick={() => setActive(g)}>
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
