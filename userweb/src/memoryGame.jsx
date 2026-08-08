// جفت‌یاب on the web: the shared board, plus the SOLO (time-attack) mode.
//
// Kept out of games.jsx so neither file grows heavy — games.jsx owns the hub
// and the multiplayer socket, this file owns the memory board itself and
// everything unique to playing it alone.
//
// Solo awards NO points on purpose: one player has no referee, so scoring it
// would just be a farm. The record is the reward.
import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { play } from './gameAudio.js';

// Server sends asset KEYS, not emoji. Emoji were a real bug: every OS/browser
// draws them from a different font, and on several Androids two distinct
// cards rendered as the same flat glyph, which made the game unwinnable.
export const FACE_ART = {
  ball: '/games/memory/ball.webp',
  trophy: '/games/memory/trophy.webp',
  medal: '/games/memory/medal.webp',
  jersey: '/games/memory/jersey.webp',
  glove: '/games/memory/glove.webp',
  boot: '/games/memory/boot.webp',
  whistle: '/games/memory/whistle.webp',
  stopwatch: '/games/memory/stopwatch.webp',
};

const FACE_TINT = {
  ball: '#38BDF8', trophy: '#FBBF24', medal: '#60A5FA', jersey: '#F87171',
  glove: '#FB923C', boot: '#818CF8', whistle: '#F472B6', stopwatch: '#2DD4BF',
};

const faNum = n => new Intl.NumberFormat('fa-IR').format(Number(n || 0));

/** `83214` -> `۱:۲۳٫۲۱` */
export function runTime(ms) {
  if (ms == null || ms < 0) return '—';
  const cs = Math.floor(ms / 10);
  const two = n => faNum(String(n).padStart(2, '0')).padStart(2, '۰');
  const m = Math.floor(cs / 6000);
  const s = Math.floor(cs / 100) % 60;
  const c = cs % 100;
  return m > 0 ? `${faNum(m)}:${two(s)}٫${two(c)}` : `${faNum(s)}٫${two(c)}`;
}

const EVENT_TEXT = { match: ' جفت شد!', miss: ' جفت نشد' };

/** The 4x4 grid. Shared by the versus board and the solo board. */
export function MemoryGrid({ cards = [], playable = [], cols = 4, lastResult,
  me, solo = false, enabled = true, onMove }) {
  return (
    <div className="memWrap">
      {/* Reserved height so the grid doesn't jump when the line appears. */}
      <p className={`memEvent ${lastResult || 'none'}`}>
        {EVENT_TEXT[lastResult] || '\u00a0'}
      </p>
      <div className="memGrid" style={{ '--cols': cols }}>
        {cards.map((c, i) => {
          const revealed = c.up || c.matched;
          const mine = c.matched && (solo || c.matched === me);
          const can = enabled && playable.includes(i);
          const tint = FACE_TINT[c.face] || '#fff';
          return (
            <button
              key={i}
              type="button"
              className={`memCard${revealed ? ' up' : ''}${c.matched ? (solo ? ' won' : mine ? ' mine' : ' theirs') : ''}${can ? ' can' : ''}`}
              style={{ '--tint': tint }}
              disabled={!can}
              aria-label={revealed ? `کارت ${c.face || ''}` : 'کارت پشت‌رو'}
              onClick={() => onMove(i)}
            >
              <span className="inner">
                <span className="back" aria-hidden="true" />
                <span className="front">
                  {c.face && FACE_ART[c.face]
                    ? <img src={FACE_ART[c.face]} alt="" loading="lazy" draggable="false" />
                    : null}
                  {c.matched && <i className="claim" aria-hidden="true" />}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Solo mode ─────────────────────────────────────────────────────────────
function useSolo(api, token, gameId) {
  const sock = useRef(null);
  const [phase, setPhase] = useState('idle');
  const [state, setState] = useState({});
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);
  // Monotonic: performance.now() rather than Date.now() arithmetic against a
  // server timestamp, which froze the old clocks on devices with a bad clock.
  const startedAt = useRef(null);

  useEffect(() => {
    const s = io(api, {
      auth: { token },
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 20,
      timeout: 10000,
    });
    sock.current = s;
    s.on('connect_error', () => setError('اتصال به سرور بازی برقرار نشد'));
    s.on('solo:error', d => { setError(d?.message || 'خطا در بازی'); setPhase('idle'); });
    s.on('solo:start', d => {
      setError(''); setResult(null);
      setState(d.state || {});
      startedAt.current = performance.now();
      setElapsed(0);
      setPhase('playing');
      play('match_found');
    });
    s.on('solo:update', d => { setState(d.state || {}); play('flip', 0.85); });
    s.on('solo:over', d => {
      startedAt.current = null;
      setState(d.state || {});
      setResult(d);
      setPhase('over');
      play(d.isRecord ? 'win' : 'draw');
    });
    return () => s.disconnect();
  }, [api, token, gameId]);

  useEffect(() => {
    const id = setInterval(() => {
      if (startedAt.current != null) {
        setElapsed(Math.round(performance.now() - startedAt.current));
      }
    }, 100);
    return () => clearInterval(id);
  }, []);

  return {
    phase, state, error, elapsed, result,
    start: () => { setError(''); sock.current?.emit('solo:start', { gameId }); },
    move: i => sock.current?.emit('solo:move', { move: i }),
    leave: () => {
      startedAt.current = null;
      sock.current?.emit('solo:leave', {});
      setPhase('idle');
    },
  };
}

function Hud({ s, bestMs }) {
  const cards = s.state.cards || [];
  const found = Math.floor(cards.filter(c => c.matched).length / 2);
  const total = cards.length ? cards.length / 2 : 8;
  const ahead = bestMs != null && s.phase === 'playing' && s.elapsed < bestMs;
  return (
    <div className="soloHud">
      <div className="soloStats">
        <span className={ahead ? 'ahead' : ''}>
          <em>زمان</em><b className="soloTime">{runTime(s.elapsed)}</b>
        </span>
        <span>
          <em>برگرداندن</em><b>{faNum(s.state.flips || 0)}</b>
        </span>
        <span>
          <em>جفت</em><b>{faNum(found)}/{faNum(total)}</b>
        </span>
      </div>
      {bestMs != null && (
        <p className={`soloChase${ahead ? ' ahead' : ''}`}>
          {ahead
            ? `جلوتر از رکوردت (${runTime(bestMs)})`
            : `رکورد تو: ${runTime(bestMs)}`}
        </p>
      )}
    </div>
  );
}

function Board({ rows, myRank }) {
  if (!rows?.length) {
    return <div className="empty">هنوز رکوردی ثبت نشده — اولین نفر باش!</div>;
  }
  return (
    <div className="soloBoard">
      <h3>
        سریع‌ترین‌ها
        {myRank ? <small>رتبه تو: {faNum(myRank)}</small> : null}
      </h3>
      {rows.map((r, i) => (
        <div key={r.userId} className={`soloRow${myRank === i + 1 ? ' me' : ''}`}>
          {/* Rank number always; the top three get a CSS medal disc behind
              it, so nothing depends on an emoji font being present. */}
          <span className="rk">{faNum(i + 1)}</span>
          <b>{r.nickname}</b>
          <span className="soloTime">{runTime(r.durationMs)}</span>
          <small>{faNum(r.flips)} برگرداندن</small>
        </div>
      ))}
    </div>
  );
}

export default function MemorySolo({ api, token, onVersus, onBack, records, reload }) {
  const s = useSolo(api, token, 'memory');
  const best = records?.best?.durationMs ?? null;

  useEffect(() => {
    // A finished run changes the standings.
    if (s.phase === 'over') reload?.();
  }, [s.phase]);

  return (
    <section className="card wide gamePage">
      <div className="gameHead">
        <button className="ghost" onClick={() => { s.leave(); onBack(); }}>‹ بازگشت</button>
        <h2>جفت‌یاب · تنها</h2>
        <button className="ghost" disabled={s.phase === 'playing'} onClick={onVersus}>
          حریف واقعی
        </button>
      </div>

      {s.error && <p className="msg">{s.error}</p>}

      {s.phase === 'idle' && (
        <>
          <div className="gameCenter soloIntro">
            <span className="soloIcon clock" aria-hidden="true" />
            <h3>مسابقه با ساعت</h3>
            <p className="hint">
              همه‌ی ۸ جفت را در کمترین زمان و کمترین برگرداندن پیدا کن.
              <br />این حالت امتیاز ندارد؛ فقط رکوردت ثبت می‌شود.
            </p>
            {best != null && <span className="countdown">بهترین رکورد تو: {runTime(best)}</span>}
            <button className="main" onClick={s.start}>شروع</button>
          </div>
          <Board rows={records?.leaderboard} myRank={records?.rank} />
        </>
      )}

      {(s.phase === 'playing' || s.phase === 'over') && (
        <>
          <Hud s={s} bestMs={best} />
          <MemoryGrid
            cards={s.state.cards}
            playable={s.state.playable}
            cols={s.state.cols}
            lastResult={s.state.lastResult}
            solo
            enabled={s.phase === 'playing'}
            onMove={s.move}
          />
          {s.phase === 'over' ? (
            <>
              <div className={`gameCenter soloResult${s.result?.isRecord ? ' record' : ''}`}>
                <span className={`soloIcon ${s.result?.isRecord ? 'medal' : s.result?.perfect ? 'bullseye' : 'clap'}`} aria-hidden="true" />
                <h3>{s.result?.isRecord ? 'رکورد جدید شخصی!' : 'آفرین، تمام شد'}</h3>
                <div className="soloPills">
                  <span>زمان: {runTime(s.result?.durationMs)}</span>
                  <span>{faNum(s.result?.flips)} برگرداندن</span>
                  {s.result?.perfect && <span className="gold">بی‌نقص!</span>}
                  {s.result?.rank && <span className="good">رتبه {faNum(s.result.rank)} در جدول</span>}
                </div>
                <p className="hint">
                  بازی تنها امتیاز ندارد — فقط رکورد ثبت می‌شود.
                  برای امتیاز با یک حریف واقعی بازی کن.
                </p>
                <div className="soloActions">
                  <button className="main" onClick={s.start}>دوباره</button>
                  <button className="ghost" onClick={s.leave}>پایان</button>
                </div>
              </div>
              <Board rows={records?.leaderboard} myRank={records?.rank} />
            </>
          ) : (
            <div className="gameCenter">
              <button className="danger" onClick={s.leave}>پایان زودهنگام</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
