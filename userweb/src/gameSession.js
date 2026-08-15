// Shared browser Socket.IO session for every live game.
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { play, startDuelMusic, stopDuelMusic } from './gameAudio.js';
import { heavyImpact, mediumImpact, victoryFanfare } from './haptics.js';

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
    stakePayoutAmount: 0, stakePayoutWinner: null, stakeWinnerBalanceAfter: null,
    stakePayoutSequence: 0,
    coinsAwarded: 0, coinsWinner: null,
    rematchAvailable: false, finishReason: null,
  } : {
    state: {}, players: null, me: null, turn: null, winner: null,
    gameId, stake, netPot: 0, commission: 0, vsBot: false, matchMode: null,
    roomId: null, matchId: null, timedOut: null, settlementStatus: 'settled',
    stakePayoutAmount: 0, stakePayoutWinner: null, stakeWinnerBalanceAfter: null,
    stakePayoutSequence: 0,
    coinsAwarded: 0, coinsWinner: null,
    rematchAvailable: false, finishReason: null,
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
  const payoutTimerRef = useRef(null);
  const announcedPayoutRef = useRef('');

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
      const startedGameId = d.gameId || gameId;
      if (startedGameId === 'card_duel') {
        startDuelMusic();
        play('duel_intro', 0.82);
      } else play('match_found');
      setG({
        state: d.state || {}, players: d.players || null,
        me: d.yourSymbol || null, turn: d.turn || null, winner: null,
        gameId: d.gameId || gameId, stake: Number(d.stake ?? stake ?? 0),
        netPot: Number(d.netPot || 0), commission: Number(d.commission || 0),
        vsBot: Boolean(d.vsBot), matchMode: d.matchMode || null,
        roomId: d.roomId, matchId: d.roomId, timedOut: null,
        settlementStatus: 'settled',
        stakePayoutAmount: 0, stakePayoutWinner: null, stakeWinnerBalanceAfter: null,
    stakePayoutSequence: 0,
        rematchAvailable: false, finishReason: null,
      });
      window.clearTimeout(payoutTimerRef.current);
      announcedPayoutRef.current = '';
      setPhase('playing'); setError(''); setStillSearching(false);
      setConnected(true); setConnectionNotice(''); setRematchWaiting(false);
      setClock(d);
      if (startedGameId !== 'card_duel' && d.turn === d.yourSymbol) play('your_turn');
    };
    const onUpdate = d => {
      if (disposed) return;
      setG(prev => {
        const wasMyTurn = prev.turn === prev.me;
        const isMyTurn = d?.turn === prev.me;
        if (gameId !== 'card_duel') {
          if (!wasMyTurn && isMyTurn) play('your_turn');
          else if (wasMyTurn && !isMyTurn) play('move');
        }

        const nextState = d?.state ?? prev.state;
        const previousRound = Number(prev.state?.roundIndex || 0);
        const currentRound = Number(nextState?.roundIndex || 0);
        const totalRounds = Number(nextState?.totalRounds || 0);
        // راند پنجم را game:over صداگذاری می‌کند؛ ۱..۴ همین‌جا بازخورد
        // برد/باخت و لرزش کوتاه می‌گیرند تا برخورد حسِ زنده داشته باشد.
        if (gameId === 'card_duel' && currentRound > previousRound
          && currentRound < totalRounds) {
          const roundWinner = nextState?.lastRound?.winner;
          play(roundWinner === 'DRAW' ? 'duel_round_draw'
            : roundWinner === prev.me ? 'duel_round_win' : 'duel_round_lose', 0.86);
          // Android: heavy for a round I won, medium otherwise.
          if (roundWinner === prev.me) heavyImpact(); else mediumImpact();
        }
        return { ...prev, state: nextState,
          turn: d?.turn ?? prev.turn, timedOut: d?.timedOut || null };
      });
      setClock(d || {});
    };
    const onOver = d => {
      if (disposed) return;
      deadlineRef.current = null; setSecondsLeft(0);
      activeRoomRef.current = null;
      setG(prev => {
        const rawWinner = d?.winner || null;
        const winner = d?.resolvedWinner || rawWinner;
        const finishReason = rawWinner === 'DISCONNECT' ? 'disconnect' : null;
        if (gameId === 'card_duel') {
          stopDuelMusic();
          play(winner === 'DRAW' ? 'duel_final_draw'
            : winner === prev.me ? 'duel_victory' : 'duel_defeat');
        } else play(winner === 'DRAW' ? 'draw' : (winner === prev.me ? 'win' : 'lose'));
        // The four-pulse celebration Android fires from the confetti overlay
        // (`game_scaffold.dart`), here for every game and not just the duel.
        // Losing gets nothing on purpose: Android is silent there too.
        if (winner === prev.me) victoryFanfare();
        return {
          ...prev, state: d?.state ?? prev.state, winner, finishReason,
          matchId: d?.matchId || prev.roomId,
          settlementStatus: d?.settlementStatus || (prev.stake ? 'pending' : 'settled'),
          rematchAvailable: d?.rematchAvailable !== false,
        };
      });
      setPhase('over'); setConnectionNotice('');
    };
    const onSettlement = d => {
      setG(prev => {
        if (d?.matchId && prev.matchId && d.matchId !== prev.matchId) return prev;
        // ── سکهٔ مسابقه ──
        //
        // سرور این را به **هر دو** بازیکن می‌فرستد تا هر دو ببینند سکه به
        // کدام سمت رفت. صفر یعنی سکه‌ای در کار نبود (سهمیهٔ برنده پر بود
        // یا لیگِ فعالی نیست) و UI باید کاملاً ساکت بماند — نشانِ «۰ سکه»
        // بدتر از نبودِ نشان است.
        const coinsAwarded = Number(d?.coins || 0);
        const next = {
          ...prev,
          settlementStatus: d?.status || prev.settlementStatus,
          netPot: Number(d?.netPot || prev.netPot || 0),
          coinsAwarded: coinsAwarded > 0 ? coinsAwarded : prev.coinsAwarded,
          coinsWinner: coinsAwarded > 0
            ? (d?.winner || null) : prev.coinsWinner,
        };
        const payoutId = String(d?.matchId || prev.matchId || '');
        const payoutWinner = String(d?.winner || '');
        const payoutAmount = Number(d?.netPot || prev.netPot || 0);
        if (gameId === 'card_duel' && d?.payout === true && d?.status === 'settled'
          && Number(prev.stake) > 0 && payoutAmount > 0
          && ['X', 'O'].includes(payoutWinner) && payoutId
          && announcedPayoutRef.current !== payoutId) {
          announcedPayoutRef.current = payoutId;
          window.clearTimeout(payoutTimerRef.current);
          payoutTimerRef.current = window.setTimeout(() => {
            play('duel_points', 0.92);
            heavyImpact();
            setG(current => current.matchId !== payoutId ? current : {
              ...current,
              stakePayoutAmount: payoutAmount,
              stakePayoutWinner: payoutWinner,
              stakeWinnerBalanceAfter: d?.balanceAfter != null
                && Number.isFinite(Number(d.balanceAfter)) ? Number(d.balanceAfter) : null,
              stakePayoutSequence: Number(current.stakePayoutSequence || 0) + 1,
            });
          }, 900);
        }
        return next;
      });
    };
    const onError = d => {
      if (disposed) return;
      setError(d?.message || 'خطا در بازی'); setPhase('error');
      deadlineRef.current = null; setSecondsLeft(0); setRematchWaiting(false);
      if (gameId === 'card_duel') stopDuelMusic();
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
        if (!rHeld && gameId === 'card_duel' && holdUntilRef.current > now) {
          play('duel_intro', 0.82);
        }
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
      window.clearTimeout(payoutTimerRef.current);
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
      if (gameId === 'card_duel') stopDuelMusic();
      if (socketRef.current === s) socketRef.current = null;
    };
  }, [api, token, gameId, stake, vsBot, roomCode, externalSocket, initialStart, enabled]);

  const move = payload => {
    if (phase !== 'playing' || !connected || holding) return;
    if ((g.gameId || gameId) === 'card_duel') play('duel_lock', 0.78);
    socketRef.current?.emit('game:move', { roomId: g.roomId, move: payload });
  };
  const startAnother = (event, payload) => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('game:leave', { roomId: activeRoomRef.current || undefined });
    window.clearTimeout(payoutTimerRef.current);
    if ((g.gameId || gameId) === 'card_duel') stopDuelMusic();
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
    window.clearTimeout(payoutTimerRef.current);
    if ((g.gameId || gameId) === 'card_duel') stopDuelMusic();
    socketRef.current?.disconnect(); activeRoomRef.current = null; setPhase('idle');
  };

  return {
    phase, g, error, secondsLeft, holding, resultHolding, move, leave, playBot, joinOnline, rematch,
    createChallenge, stillSearching, connected, connectionNotice, rematchWaiting,
  };
}
