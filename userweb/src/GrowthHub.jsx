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
  const transferred = useRef(false);

  const load = () => req('/api/growth/overview', 'GET', null, token).then(setData).catch(e => setNotice(e.message));
  useEffect(() => { load(); const timer = setInterval(load, 30000); return () => clearInterval(timer); }, [token]);

  useEffect(() => {
    const s = io(api, { auth: { token }, transports: ['websocket', 'polling'], forceNew: true, reconnection: true });
    setSocket(s);
    s.on('friends:presence', load);
    s.on('friend:challenge', invite => {
      const yes = window.confirm(`${invite?.from?.nickname || 'دوستت'} تو را به دوئل کارت‌ها دعوت کرده. وارد می‌شوی؟`);
      if (yes) {
        s.emit('game:join_room', { roomCode: invite.roomCode });
        setNotice('در حال ورود به چالش…');
      }
    });
    s.on('game:start', start => {
      transferred.current = true;
      s.removeAllListeners('friends:presence');
      s.removeAllListeners('friend:challenge');
      s.removeAllListeners('game:start');
      onSocketGame?.(s, start);
    });
    s.on('game:error', d => setNotice(d?.message || 'عملیات بازی ناموفق بود'));
    return () => { if (!transferred.current && s.connected) s.disconnect(); };
  }, [api, token]);

  const run = async (key, fn) => {
    if (busy) return;
    setBusy(key); setNotice('');
    try { const response = await fn(); setNotice(response?.message || 'انجام شد'); await load(); }
    catch (error) { setNotice(error.message); }
    finally { setBusy(''); }
  };
  const search = async event => {
    event?.preventDefault();
    if (query.trim().length < 2) return;
    try { setResults(await req(`/api/friends/search?q=${encodeURIComponent(query.trim())}`, 'GET', null, token)); }
    catch (error) { setNotice(error.message); }
  };
  const challenge = friend => {
    if (!socket?.connected || busy) return;
    setBusy(`challenge-${friend.id}`); setNotice('در حال ساخت اتاق مستقیم…');
    socket.emit('game:create_room', { gameId: 'card_duel' }, room => {
      if (!room?.ok) { setBusy(''); setNotice(room?.error || 'ساخت اتاق ناموفق بود'); return; }
      socket.emit('friend:challenge', {
        targetUserId: friend.id, roomCode: room.roomCode, gameId: 'card_duel', platform: 'web',
      }, answer => {
        setBusy('');
        setNotice(answer?.ok ? `دعوت برای ${friend.nickname} ارسال شد؛ همین‌جا منتظر بمان` : answer?.error || 'ارسال دعوت ناموفق بود');
      });
    });
  };
  const claim = mission => run(`mission-${mission.key}`,
    () => req(`/api/missions/${mission.key}/claim`, 'POST', {}, token));

  const missions = data?.missions || [];
  return <section className="growthHub card">
    <header><div><b>ماموریت و دوستان</b><small>یک کار کوتاه، یک حریف واقعی، یک دلیل برای برگشتن</small></div>
      <span>{(data?.friends || []).filter(x => x.online).length} آنلاین</span></header>
    <div className="missionRail">
      {missions.map(m => <article key={m.key} className={m.claimed ? 'claimed' : m.complete ? 'complete' : ''}>
        <div><i>{m.period === 'daily' ? 'روزانه' : 'هفتگی'}</i><b>{m.title}</b><small>{m.description}</small></div>
        <progress max={m.goal} value={m.progress} />
        <footer><span>{m.progress}/{m.goal} · {m.reward} امتیاز</span>
          <button disabled={!m.complete || m.claimed || busy === `mission-${m.key}`} onClick={() => claim(m)}>
            {m.claimed ? 'گرفته شد' : m.complete ? 'دریافت' : 'در حال انجام'}
          </button></footer>
      </article>)}
    </div>
    <div className="friendRail">
      {(data?.incoming || []).map(friend => <div className="friendRow incoming" key={friend.friendshipId}>
        <span className="presence online" /><b>{friend.nickname}</b><small>درخواست دوستی</small>
        <button onClick={() => run(friend.friendshipId, () => req(`/api/friends/requests/${friend.friendshipId}/accept`, 'POST', {}, token))}>قبول</button>
      </div>)}
      {(data?.friends || []).map(friend => <div className="friendRow" key={friend.id}>
        <span className={`presence ${friend.online ? 'online' : ''}`} /><b>{friend.nickname}</b>
        <small>{friend.online ? 'آنلاین' : friend.lastSeenAt ? 'اخیراً دیده شده' : 'آفلاین'}</small>
        <button disabled={!friend.online || busy === `challenge-${friend.id}`} onClick={() => challenge(friend)}>چالش</button>
      </div>)}
      {!(data?.friends || []).length && !(data?.incoming || []).length && <p className="muted">هنوز دوستی اضافه نکرده‌ای؛ با نام قلقلی جستجو کن.</p>}
    </div>
    <form className="friendSearch" onSubmit={search}><input value={query} onChange={e => setQuery(e.target.value)} placeholder="جستجوی نام دوست…" />
      <button type="submit">پیدا کن</button></form>
    {results.map(user => <div className="friendRow searchResult" key={user.id}><span className={`presence ${user.online ? 'online' : ''}`} />
      <b>{user.nickname}</b><small>{user.relation === 'accepted' ? 'دوست شما' : user.relation === 'pending' ? 'در انتظار' : ''}</small>
      <button disabled={user.relation !== 'none'} onClick={() => run(user.id, () => req(`/api/friends/${user.id}/request`, 'POST', {}, token))}>افزودن</button></div>)}
    {notice && <p className="growthNotice">{notice}</p>}
  </section>;
}
