// Shared browser Socket.IO session for every live game.
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { play } from './gameAudio.js';

export function useGameSession(api, token, gameId, stake = 0, vsBot = false, roomCode = null,
  externalSocket = null, initialStart = null, enabled = true) {
  const socketRef = useRef(null);
  const [phase, setPhase] = useState(initialStart ? 'playing' : (enabled ? 'waiting' : 'idle'));
  const [g, setG] = useState(() => initialStart ? {
    state: initialStart.state || {},
    players: initialStart.players || null,
    me: initialStart.yourSymbol || null,
    turn: initialStart.turn || null,
    winner: null,
    gameId: initialStart.gameId || gameId,
    stake: Number(initialStart.stake ?? stake ?? 0),
    netPot: Number(initialStart.netPot || 0),
    commission: Number(initialStart.commission || 0),
    vsBot: Boolean(initialStart.vsBot),
    matchMode: initialStart.matchMode || null,
    roomId: initialStart.roomId,
    timedOut: null,
  } : {
    state: {}, players: null, me: null, turn: null, winner: null,
    gameId, stake, netPot: 0, commission: 0, vsBot: false, matchMode: null,
    roomId: null, timedOut: null,
  });
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [stillSearching, setStillSearching] = useState(false);
  const deadlineRef = useRef(null);

  useEffect(() => {
    if (!enabled && !initialStart) {
      setPhase('idle');
      return undefined;
    }
    let disposed = false;
    const s = externalSocket || io(api, {
      auth: { token },
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
    });
    socketRef.current = s;

    const setClock = d => {
      const remaining = Number(d?.remainingMs);
      deadlineRef.current = Number.isFinite(remaining)
        ? Date.now() + Math.max(0, remaining)
        : (Number(d?.deadline) || null);
      if (deadlineRef.current) {
        setSecondsLeft(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
      }
    };
    const onWaiting = d => {
      if (disposed) return;
      setPhase('waiting');
      setError('');
      setStillSearching(false);
      if (d?.deadline || d?.remainingMs != null) setClock(d);
    };
    const onStillWaiting = () => {
      if (disposed) return;
      setStillSearching(true);
      deadlineRef.current = null;
      setSecondsLeft(0);
    };
    const onStart = d => {
      if (disposed || !d) return;
      play('match_found');
      setG({
        state: d.state || {},
        players: d.players || null,
        me: d.yourSymbol || null,
        turn: d.turn || null,
        winner: null,
        gameId: d.gameId || gameId,
        stake: Number(d.stake ?? stake ?? 0),
        netPot: Number(d.netPot || 0),
        commission: Number(d.commission || 0),
        vsBot: Boolean(d.vsBot),
        matchMode: d.matchMode || null,
        roomId: d.roomId,
        timedOut: null,
      });
      setPhase('playing');
      setError('');
      setStillSearching(false);
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
        return {
          ...prev,
          state: d?.state ?? prev.state,
          turn: d?.turn ?? prev.turn,
          timedOut: d?.timedOut || null,
        };
      });
      setClock(d || {});
    };
    const onOver = d => {
      if (disposed) return;
      deadlineRef.current = null;
      setSecondsLeft(0);
      setG(prev => {
        const winner = d?.winner || null;
        play(winner === 'DRAW' ? 'draw' : (winner === prev.me ? 'win' : 'lose'));
        return { ...prev, state: d?.state ?? prev.state, winner };
      });
      setPhase('over');
    };
    const onError = d => {
      if (disposed) return;
      setError(d?.message || 'خطا در بازی');
      setPhase('error');
      deadlineRef.current = null;
      setSecondsLeft(0);
    };
    const onConnectError = () => {
      if (!disposed) setError('اتصال برقرار نشد');
    };
    const requestStart = () => {
      // A lobby/private-room socket already emitted its create/join request.
      if (externalSocket || initialStart) return;
      if (vsBot) s.emit('game:play_bot', { gameId });
      else if (roomCode) s.emit('game:join_room', { roomCode });
      else s.emit('game:join', { gameId, stake, vsBot: false });
      setPhase('waiting');
    };

    s.on('connect', requestStart);
    s.on('connect_error', onConnectError);
    s.on('game:waiting', onWaiting);
    s.on('game:still-waiting', onStillWaiting);
    s.on('game:start', onStart);
    s.on('game:update', onUpdate);
    s.on('game:over', onOver);
    s.on('game:error', onError);
    if (s.connected) requestStart();
    if (initialStart) onStart(initialStart);

    const timer = window.setInterval(() => {
      if (!deadlineRef.current) return;
      setSecondsLeft(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
    }, 250);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      s.off('connect', requestStart);
      s.off('connect_error', onConnectError);
      s.off('game:waiting', onWaiting);
      s.off('game:still-waiting', onStillWaiting);
      s.off('game:start', onStart);
      s.off('game:update', onUpdate);
      s.off('game:over', onOver);
      s.off('game:error', onError);
      s.emit('game:leave');
      s.disconnect();
      if (socketRef.current === s) socketRef.current = null;
    };
  }, [api, token, gameId, stake, vsBot, roomCode, externalSocket, initialStart, enabled]);

  const move = payload => {
    if (phase !== 'playing') return;
    socketRef.current?.emit('game:move', { roomId: g.roomId, move: payload });
  };
  const playBot = () => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('game:leave', { roomId: g.roomId });
    setError('');
    setStillSearching(false);
    setPhase('waiting');
    socket.emit('game:play_bot', { gameId: g.gameId || gameId });
  };
  const joinOnline = () => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('game:leave', { roomId: g.roomId });
    setError('');
    setStillSearching(false);
    setPhase('waiting');
    socket.emit('game:join', { gameId: g.gameId || gameId, stake, vsBot: false });
  };
  const leave = () => {
    socketRef.current?.emit('game:leave', { roomId: g.roomId });
    socketRef.current?.disconnect();
    setPhase('idle');
  };

  return {
    phase, g, error, secondsLeft, move, leave, playBot, joinOnline,
    stillSearching,
  };
}

