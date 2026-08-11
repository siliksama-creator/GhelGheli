import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { req } from './lib/api.js';

export default function GrowthHub({ api, token, onSocketGame }) {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [socket, setSocket] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const transferred = useRef(false);

  const load = () => req('/api/growth/overview', 'GET', null, token)
    .then(setData).catch(error => setNotice(error.message));

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [token]);

  useEffect(() => {
    const s = io(api, {
      auth: { token }, transports: ['websocket', 'polling'], forceNew: true, reconnection: true,
    });
    setSocket(s);
    s.on('friends:presence', load);
    s.on('friend:challenge', invite => {
      const accepted = window.confirm(`${invite?.from?.nickname || 'دوستت'} به دوئل دعوتت کرده؛ وارد می‌شوی؟`);
      if (accepted) {
        s.emit('game:join_room', { roomCode: invite.roomCode });
        setNotice('در حال ورود به چالش…');
      }
    });
    s.on('game:start', start => {
      transferred.current = true;
      for (const event of ['friends:presence', 'friend:challenge', 'game:start', 'game:error']) {
        s.removeAllListeners(event);
      }
      onSocketGame?.(s, start);
    });
    s.on('game:error', payload => setNotice(payload?.message || 'عملیات بازی ناموفق بود'));
    return () => { if (!transferred.current && s.connected) s.disconnect(); };
  }, [api, token]);

  const run = async (key, action) => {
    if (busy) return;
    setBusy(key); setNotice('');
    try {
      const response = await action();
      setNotice(response?.message || 'انجام شد');
      await load();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy('');
    }
  };

  const search = async event => {
    event?.preventDefault();
    if (query.trim().length < 2) return;
    try {
      setResults(await req(`/api/friends/search?q=${encodeURIComponent(query.trim())}`, 'GET', null, token));
    } catch (error) {
      setNotice(error.message);
    }
  };

  const challenge = friend => {
    if (!socket?.connected || busy) return;
    setBusy(`challenge-${friend.id}`); setNotice('در حال آماده‌سازی چالش…');
    socket.emit('game:create_room', { gameId: 'card_duel' }, room => {
      if (!room?.ok) {
        setBusy(''); setNotice(room?.error || 'ساخت اتاق ناموفق بود'); return;
      }
      socket.emit('friend:challenge', {
        targetUserId: friend.id, roomCode: room.roomCode, gameId: 'card_duel', platform: 'web',
      }, answer => {
        setBusy('');
        setNotice(answer?.ok ? `دعوت برای ${friend.nickname} ارسال شد` : answer?.error || 'ارسال دعوت ناموفق بود');
      });
    });
  };

  const claim = mission => run(`mission-${mission.key}`,
    () => req(`/api/missions/${mission.key}/claim`, 'POST', {}, token));
  const missions = [...(data?.missions || [])].sort((a, b) => Number(a.claimed) - Number(b.claimed)
    || Number(b.complete) - Number(a.complete));
  const friends = (data?.friends || []).slice(0, 4);
  const incoming = data?.incoming || [];
  const online = (data?.friends || []).filter(friend => friend.online).length;

  return <section className="growthHub card">
    <header className="growthHeader">
      <img src="/games/social_mission_badge.png" alt="" width="58" height="58" />
      <div><b>ماموریت و دوستان</b><small>پاداش بگیر؛ حریف آنلاین پیدا کن</small></div>
      <span>{online} آنلاین</span>
    </header>

    <div className="missionRail" aria-label="ماموریت‌ها">
      {missions.map(mission => <article key={mission.key}
        className={mission.claimed ? 'claimed' : mission.complete ? 'complete' : ''}>
        <div className="missionTop"><i>{mission.period === 'daily' ? 'روزانه' : 'هفتگی'}</i><strong>+{mission.reward}</strong></div>
        <b>{mission.title}</b>
        <small>{mission.description}</small>
        <progress max={mission.goal} value={mission.progress} />
        <footer><span>{mission.progress}/{mission.goal}</span>
          <button disabled={!mission.complete || mission.claimed || busy === `mission-${mission.key}`}
            onClick={() => claim(mission)}>
            {mission.claimed ? 'گرفته شد' : mission.complete ? 'دریافت' : 'ادامه'}
          </button></footer>
      </article>)}
    </div>

    {(incoming.length > 0 || friends.length > 0) && <div className="friendRail">
      {incoming.map(friend => <div className="friendRow incoming" key={friend.friendshipId}>
        <span className="presence online" /><b>{friend.nickname}</b><small>درخواست دوستی</small>
        <button onClick={() => run(friend.friendshipId,
          () => req(`/api/friends/requests/${friend.friendshipId}/accept`, 'POST', {}, token))}>قبول</button>
      </div>)}
      {friends.map(friend => <div className="friendRow" key={friend.id}>
        <span className={`presence ${friend.online ? 'online' : ''}`} /><b>{friend.nickname}</b>
        <small>{friend.online ? 'آنلاین' : 'آفلاین'}</small>
        <button disabled={!friend.online || busy === `challenge-${friend.id}`}
          onClick={() => challenge(friend)}>چالش</button>
      </div>)}
    </div>}

    <button className="friendSearchToggle" type="button" onClick={() => setSearchOpen(value => !value)}>
      {searchOpen ? 'بستن جستجو' : friends.length ? 'افزودن دوست' : 'پیدا کردن دوست'}
    </button>
    {searchOpen && <>
      <form className="friendSearch" onSubmit={search}>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="نام قلقلی دوست…" />
        <button type="submit">جستجو</button>
      </form>
      {results.map(user => <div className="friendRow searchResult" key={user.id}>
        <span className={`presence ${user.online ? 'online' : ''}`} /><b>{user.nickname}</b>
        <small>{user.relation === 'accepted' ? 'دوست شما' : user.relation === 'pending' ? 'در انتظار' : ''}</small>
        <button disabled={user.relation !== 'none'} onClick={() => run(user.id,
          () => req(`/api/friends/${user.id}/request`, 'POST', {}, token))}>افزودن</button>
      </div>)}
    </>}
    {notice && <p className="growthNotice">{notice}</p>}
  </section>;
}
