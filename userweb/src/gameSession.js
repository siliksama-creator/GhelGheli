// Shared browser Socket.IO session for every live game.
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { play } from './gameAudio.js';

export function useGameSession(api, token, gameId, stake = 0, vsBot = false, roomCode = null,
  externalSocket = null, initialStart = null, enabled = true) {
  const socketRef = useRef(null);
  const activeRoomRef = useRef(initialStart?.roomId || null);
  const requestedRef = useRef(Boolean(initialStart));
  const [phase, setPhase] = useState(initialStart ? 'playing' : (enabled ? 'waiting' : 'idle'));
  const [g, setG] = useState(() => initialStart ? {
    state: initialStart.state || {}, players: initialStart.players || null,
    me: initialStart.yourSymbol || null, turn: initialStart.turn || null,
    winner: null, gameId: initialStart.gameId || gameId,
    stake: Number(initialStart.stake ?? stake ?? 0), netPot: Number(initialStart.netPot || 0),
    commission: Number(initialStart.commission || 0), vsBot: Boolean(initialStart.vsBot),
    matchMode: initialStart.matchMode || null, roomId: initialStart.roomId,
    matchId: initialStart.roomId, timedOut: null, settlementStatus: 'settled',
    rematchAvailable: false,
  } : {
    state: {}, players: null, me: null, turn: null, winner: null,
    gameId, stake, netPot: 0, commission: 0, vsBot: false, matchMode: null,
    roomId: null, matchId: null, timedOut: null, settlementStatus: 'settled',
    rematchAvailable: false,
  });
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [stillSearching, setStillSearching] = useState(false);
  const [connected, setConnected] = useState(true);
  const [connectionNotice, setConnectionNotice] = useState('');
  const [rematchWaiting, setRematchWaiting] = useState(false);
  // ── مکثِ نتیجهٔ راند و اعلانِ راندِ بعد ──
  //
  // سرور دو مهرِ زمانی می‌فرستد:
  //   resultUntil → تا این لحظه نتیجهٔ راندِ قبل روی صفحه بماند
  //   introUntil  → تا این لحظه اعلانِ راندِ تازه نمایش داده شود
  //
  // ⚠️ نسخهٔ وب هیچ‌کدام را نمی‌خواند (فقط اندروید پیاده کرده بود).
  //    برای همین ساعت از لحظهٔ اول می‌رفت و کاربر هم نتیجه را از دست
  //    می‌داد هم فرصتِ خواندنِ اعلان را.
  const [holding, setHolding] = useState(false);
  // مکثِ مخصوصِ «نتیجهٔ راند» — جدا از مکثِ اعلانِ راندِ تازه، چون
  // کلاینت باید بداند کدام‌یک را نشان دهد.
  const [resultHolding, setResultHolding] = useState(false);
  const deadlineRef = useRef(null);
  const holdUntilRef = useRef(0);
  const holdingRef = useRef(false);
  const resultUntilRef = useRef(0);
  const resultHoldingRef = useRef(false);

  useEffect(() => {
    if (!enabled && !initialStart) {
      setPhase('idle');
      requestedRef.current = false;
      return undefined;
    }
    let disposed = false;
    const s = externalSocket || io(api, {
      auth: { token }, transports: ['websocket', 'polling'], forceNew: true,
      reconnection: true, reconnectionAttempts: 20, reconnectionDelay: 800,
      reconnectionDelayMax: 5000, timeout: 10000,
    });
    socketRef.current = s;

    const setClock = d => {
      const remaining = Number(d?.remainingMs);
      deadlineRef.current = Number.isFinite(remaining)
        ? Date.now() + Math.max(0, remaining) : (Number(d?.deadline) || null);
      // مهلتِ مکث = دیرترین مهرِ زمانیِ سرور. تا آن لحظه عددِ ساعت
      // یخ می‌ماند تا کاربر نتیجه و اعلان را کامل ببیند.
      const now = Date.now();
      const rUntil = Number(d?.resultUntil) || 0;
      const iUntil = Number(d?.introUntil) || 0;
      holdUntilRef.current = Math.max(rUntil, iUntil, 0);
      resultUntilRef.current = rUntil;
      setHolding(holdUntilRef.current > now);
      setResultHolding(rUntil > now);
      if (deadlineRef.current) {
        const target = Math.max(deadlineRef.current, holdUntilRef.current);
        setSecondsLeft(Math.max(0, Math.ceil((target - now) / 1000)));
      }
    };
    const onWaiting = d => {
      if (disposed) return;
      setPhase('waiting'); setError(''); setStillSearching(false);
      if (d?.deadline || d?.remainingMs != null) setClock(d);
    };
    const onStillWaiting = () => {
      if (disposed) return;
      setStillSearching(true); deadlineRef.current = null; setSecondsLeft(0);
    };
    const onStart = d => {
      if (disposed || !d) return;
      activeRoomRef.current = d.roomId;
      requestedRef.current = true;
      play('match_found');
      setG({
        state: d.state || {}, players: d.players || null,
        me: d.yourSymbol || null, turn: d.turn || null, winner: null,
        gameId: d.gameId || gameId, stake: Number(d.stake ?? stake ?? 0),
        netPot: Number(d.netPot || 0), commission: Number(d.commission || 0),
        vsBot: Boolean(d.vsBot), matchMode: d.matchMode || null,
        roomId: d.roomId, matchId: d.roomId, timedOut: null,
        settlementStatus: 'settled', rematchAvailable: false,
      });
      setPhase('playing'); setError(''); setStillSearching(false);
      setConnected(true); setConnectionNotice(''); setRematchWaiting(false);
      setClock(d);
      if (d.turn === d.yourSymbol) play('your_turn');
    };
    const onUpdate = d => {
      if (disposed) return;
      setG(prev => {
        const wasMyTurn = prev.turn === prev.me;
        const isMyTurn = d?.turn === prev.me;
        if (!wasMyTurn && isMyTurn) play('your_turn');
        else if (wasMyTurn && !isMyTurn) play('move');
        return { ...prev, state: d?.state ?? prev.state,
          turn: d?.turn ?? prev.turn, timedOut: d?.timedOut || null };
      });
      setClock(d || {});
    };
    const onOver = d => {
      if (disposed) return;
      deadlineRef.current = null; setSecondsLeft(0);
      activeRoomRef.current = null;
      setG(prev => {
        const winner = d?.winner || null;
        play(winner === 'DRAW' ? 'draw' : (winner === prev.me ? 'win' : 'lose'));
        return {
          ...prev, state: d?.state ?? prev.state, winner,
          matchId: d?.matchId || prev.roomId,
          settlementStatus: d?.settlementStatus || (prev.stake ? 'pending' : 'settled'),
          rematchAvailable: d?.rematchAvailable !== false,
        };
      });
      setPhase('over'); setConnectionNotice('');
    };
    const onSettlement = d => {
      setG(prev => d?.matchId && prev.matchId && d.matchId !== prev.matchId
        ? prev : { ...prev, settlementStatus: d?.status || prev.settlementStatus });
    };
    const onError = d => {
      if (disposed) return;
      setError(d?.message || 'خطا در بازی'); setPhase('error');
      deadlineRef.current = null; setSecondsLeft(0); setRematchWaiting(false);
    };
    const onConnectError = () => {
      if (disposed) return;
      if (activeRoomRef.current) {
        setConnected(false); setConnectionNotice('در حال بازیابی اتصال مسابقه…');
      } else setError('اتصال برقرار نشد');
    };
    const onDisconnect = () => {
      if (disposed) return;
      setConnected(false);
      if (activeRoomRef.current) setConnectionNotice('شبکه قطع شد؛ ۲۵ ثانیه برای بازگشت فرصت داری…');
    };
    const onOpponentReconnecting = d => setConnectionNotice(d?.message || 'منتظر بازگشت حریف…');
    const onOpponentReconnected = d => { setConnectionNotice(d?.message || 'حریف برگشت'); window.setTimeout(() => setConnectionNotice(''), 1800); };
    const onRematchStatus = d => setRematchWaiting(Boolean(d?.waitingForOpponent));
    const onRematchUnavailable = d => {
      setRematchWaiting(false);
      setG(prev => ({ ...prev, rematchAvailable: false }));
      setError(d?.message || 'حریف از صفحه مسابقه خارج شد');
    };
    const requestStart = () => {
      setConnected(true);
      // A reconnecting socket already owns an authoritative suspended seat.
      // Re-emitting join here would forfeit that seat and create a new queue.
      if (activeRoomRef.current || requestedRef.current || externalSocket || initialStart) return;
      requestedRef.current = true;
      if (vsBot) s.emit('game:play_bot', { gameId });
      else if (roomCode) s.emit('game:join_room', { roomCode });
      else s.emit('game:join', { gameId, stake, vsBot: false });
      setPhase('waiting');
    };

    s.on('connect', requestStart);
    s.on('disconnect', onDisconnect);
    s.on('connect_error', onConnectError);
    s.on('game:waiting', onWaiting);
    s.on('game:still-waiting', onStillWaiting);
    s.on('game:start', onStart);
    s.on('game:resume', onStart);
    s.on('game:update', onUpdate);
    s.on('game:over', onOver);
    s.on('game:settlement', onSettlement);
    s.on('game:opponent_reconnecting', onOpponentReconnecting);
    s.on('game:opponent_reconnected', onOpponentReconnected);
    s.on('game:rematch_status', onRematchStatus);
    s.on('game:rematch_unavailable', onRematchUnavailable);
    s.on('game:error', onError);
    if (s.connected) requestStart();
    if (initialStart) onStart(initialStart);

    const timer = window.setInterval(() => {
      if (!deadlineRef.current) return;
      const now = Date.now();
      // ── چرا ساعت در مکث یخ می‌زند ──
      //
      // تا وقتی نتیجهٔ راندِ قبل یا اعلانِ راندِ تازه روی صفحه است،
      // کاربر نمی‌تواند انتخاب کند؛ اگر عدد پایین برود یعنی «جریمهٔ
      // تماشا کردن». عددِ ثابت هم نباید شبیهِ هنگ باشد — پرچمِ
      // `holding` به کلاینت می‌گوید نشانِ «مکث» را نشان دهد.
      const held = holdUntilRef.current > now;
      if (held !== holdingRef.current) {
        holdingRef.current = held;
        setHolding(held);
      }
      const rHeld = resultUntilRef.current > now;
      if (rHeld !== resultHoldingRef.current) {
        resultHoldingRef.current = rHeld;
        setResultHolding(rHeld);
      }
      if (held) {
        // عددِ نمایش‌داده‌شده همان مهلتِ فکرکردن است، نه شمارشِ مکث.
        setSecondsLeft(Math.max(0, Math.ceil((deadlineRef.current - holdUntilRef.current) / 1000)));
        return;
      }
      setSecondsLeft(Math.max(0, Math.ceil((deadlineRef.current - now) / 1000)));
    }, 250);

    return () => {
      disposed = true; window.clearInterval(timer);
      for (const [event, handler] of [
        ['connect', requestStart], ['disconnect', onDisconnect], ['connect_error', onConnectError],
        ['game:waiting', onWaiting], ['game:still-waiting', onStillWaiting],
        ['game:start', onStart], ['game:resume', onStart], ['game:update', onUpdate],
        ['game:over', onOver], ['game:settlement', onSettlement],
        ['game:opponent_reconnecting', onOpponentReconnecting],
        ['game:opponent_reconnected', onOpponentReconnected],
        ['game:rematch_status', onRematchStatus],
        ['game:rematch_unavailable', onRematchUnavailable], ['game:error', onError],
      ]) s.off(event, handler);
      s.emit('game:leave', { roomId: activeRoomRef.current || undefined });
      s.disconnect();
      if (socketRef.current === s) socketRef.current = null;
    };
  }, [api, token, gameId, stake, vsBot, roomCode, externalSocket, initialStart, enabled]);

  const move = payload => {
    if (phase !== 'playing' || !connected) return;
    socketRef.current?.emit('game:move', { roomId: g.roomId, move: payload });
  };
  const startAnother = (event, payload) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('game:leave', { roomId: activeRoomRef.current || undefined });
    requestedRef.current = true; activeRoomRef.current = null;
    setError(''); setStillSearching(false); setPhase('waiting'); setRematchWaiting(false);
    socket.emit(event, payload);
  };
  const playBot = () => startAnother('game:play_bot', { gameId: g.gameId || gameId });
  const joinOnline = () => startAnother('game:join', { gameId: g.gameId || gameId, stake, vsBot: false });
  const rematch = () => {
    if (!g.rematchAvailable || !g.matchId) return;
    setError(''); setRematchWaiting(!g.vsBot);
    socketRef.current?.emit('game:rematch', { roomId: g.matchId }, response => {
      if (response?.ok === false) {
        setRematchWaiting(false); setError(response.error || 'نبرد دوباره ناموفق بود');
      }
    });
  };
  const createChallenge = () => new Promise((resolve, reject) => {
    const socket = socketRef.current;
    if (!socket?.connected) return reject(new Error('اتصال بازی برقرار نیست'));
    const timeout = window.setTimeout(() => reject(new Error('ساخت لینک چالش طول کشید')), 8000);
    socket.emit('game:create_room', { gameId: g.gameId || gameId }, response => {
      window.clearTimeout(timeout);
      if (response?.ok) resolve(response);
      else reject(new Error(response?.error || 'ساخت لینک چالش ناموفق بود'));
    });
  });
  const leave = () => {
    socketRef.current?.emit('game:leave', { roomId: activeRoomRef.current || undefined });
    socketRef.current?.disconnect(); activeRoomRef.current = null; setPhase('idle');
  };

  return {
    phase, g, error, secondsLeft, holding, resultHolding, move, leave, playBot, joinOnline, rematch,
    createChallenge, stillSearching, connected, connectionNotice, rematchWaiting,
  };
}
