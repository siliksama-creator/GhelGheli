// Public chat room: Categorized Canned Messages & Emoji Palette (no custom text typing, no stickers).
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { req, asset, fa, avatarUrl } from '../lib/api.js';
import { CosmeticAvatarFrame, DisplayName } from '../components/Cosmetics.jsx';

const EMOJIS = [
  '🔥', '⚽', '🏆', '😎', '😂', '👏', '🤝', '💪',
  '🎯', '⭐', '❤️', '🚀', '👑', '🥳', '🥇', '💯',
  '🧤', '⚡', '🤩', '👍', '🎮', '🍿', '🎩', '💎',
];

const BASE_CATEGORIES = [
  { title: '💬 گفتگو', items: ['سلام بچه‌ها!', 'من اومدم!', 'چه خبر بچه‌ها؟', 'خداحافظ تا بعد!', 'مواظب خودتون باشید!', 'خوشبختم دوستان!', 'کجا زندگی می‌کنید؟', 'امروز چیکار کردید؟'] },
  { title: '⚽ بازی', items: ['کی پایه بازیه؟', 'بریم برای برد!', 'من عاشق این بازی‌ام!', 'منم می‌خوام بازی کنم!', 'دوباره امتحان می‌کنم!'] },
  { title: '🎮 رقابت', items: ['بزن بریم بازی!', 'آماده‌ای برای مسابقه؟', 'این دست من می‌برم!', 'بازی عالی بود!', 'دوباره بازی کنیم؟', 'کارت خفن گرفتم!', 'حریف قوی می‌خوام!', 'پنالتی رو دریبل کردم!'] },
];

export default function Chat({ token, openProfile, meId }) {
  const [messages, setMessages] = useState([]);
  const [pinned, setPinned] = useState(null);
  const [err, setErr] = useState('');
  const [reply, setReply] = useState(null);
  const [cdLeft, setCdLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [emotePacks, setEmotePacks] = useState([]);
  const categories = useMemo(() => [
    ...BASE_CATEGORIES,
    ...emotePacks.map((pack) => ({
      title: `${pack.icon || '✨'} ${pack.name}`,
      items: Array.isArray(pack.messages) ? pack.messages : [],
      premium: true,
    })),
    { title: '😀 ایموجی', items: [], isEmoji: true },
  ], [emotePacks]);

  const boxRef = useRef(null);
  const lastCount = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const scrollDown = useCallback(force => {
    requestAnimationFrame(() => {
      const el = boxRef.current;
      if (!el) return;
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < 260;
      if (force || near) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await req('/api/chat/bootstrap', 'GET', null, token);
      if (!alive.current) return;
      if (res) {
        setPinned(res.config?.pinned || null);
        setEmotePacks(Array.isArray(res.config?.emotePacks) ? res.config.emotePacks : []);
        const msgs = res.messages || [];
        const grew = msgs.length > lastCount.current;
        lastCount.current = msgs.length;
        setMessages(msgs);
        setErr('');
        setLoading(false);
        if (grew) scrollDown();
      }
    } catch (e) {
      if (alive.current) {
        setErr(e.message || 'خطا در دریافت پیام‌ها');
        setLoading(false);
      }
    }
  }, [token, scrollDown]);

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      req('/api/chat/messages', 'GET', null, token).then(msgs => {
        if (!alive.current || !Array.isArray(msgs)) return;
        const grew = msgs.length > lastCount.current;
        lastCount.current = msgs.length;
        setMessages(msgs);
        if (grew) scrollDown();
      }).catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [load, token, scrollDown]);

  const sendCanned = async (text) => {
    if (cdLeft > 0) return;
    try {
      const payload = { message: text };
      if (reply) payload.replyTo = reply.id;
      const sent = await req('/api/chat/messages', 'POST', payload, token);
      setReply(null);
      setCdLeft(10);
      const cdTimer = setInterval(() => {
        setCdLeft(prev => {
          if (prev <= 1) { clearInterval(cdTimer); return 0; }
          return prev - 1;
        });
      }, 1000);
      if (sent) {
        setMessages(prev => [...prev, sent]);
        scrollDown(true);
      }
    } catch (e) {
      alert(e.message || 'خطا در ارسال پیام');
    }
  };

  const toggleLike = async (m) => {
    const liked = m.liked_by_me;
    setMessages(prev => prev.map(x => x.id === m.id ? { ...x, liked_by_me: !liked, like_count: (x.like_count || 0) + (liked ? -1 : 1) } : x));
    try {
      await req(`/api/chat/messages/${m.id}/like`, 'POST', {}, token);
    } catch (_) {
      setMessages(prev => prev.map(x => x.id === m.id ? { ...x, liked_by_me: liked, like_count: (x.like_count || 0) + (liked ? 1 : -1) } : x));
    }
  };

  if (loading) return <div className="card pad center muted">در حال بارگذاری چت...</div>;

  return (
    <section className="card wide chatPage" style={{ display: 'flex', flexDirection: 'column', height: '640px', padding: 0 }}>
      {pinned && pinned.active && (
        <div style={{ background: 'rgba(255, 197, 61, 0.12)', borderBottom: '1px solid rgba(255, 197, 61, 0.35)', padding: '10px 16px', display: 'flex', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>📌</span>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#FFC53D' }}>اعلان مدیریت</div>
            <div style={{ fontSize: '13px', color: '#FFF' }}>{pinned.text}</div>
          </div>
        </div>
      )}

      {err && <div className="err" style={{ margin: '12px' }}>{err}</div>}

      <div ref={boxRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {messages.map(m => {
          const isMe = String(m.user_id) === String(meId);
          return (
            <div key={m.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
              <CosmeticAvatarFrame frame={m.cosmetics?.frame} style={{width:42,height:42,padding:m.cosmetics?.frame?3:0}}>
                <img
                  src={m.profile_image_url ? asset(m.profile_image_url) : avatarUrl(m.profile_avatar_key)}
                  alt=""
                  style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover',cursor:'pointer',border:'1px solid #071522'}}
                  onClick={() => openProfile && openProfile(m.user_id)}
                />
              </CosmeticAvatarFrame>
              <div style={{ flex: 1, maxWidth: '85%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                  <DisplayName name={m.nickname || m.first_name || 'کاربر'} cosmetics={m.cosmetics} level={m.level} />
                  <button type="button" onClick={() => setReply(m)} style={{ background: 'none', border: 'none', color: '#D7DEE8', fontSize: '11px', cursor: 'pointer' }}>↩ پاسخ</button>
                </div>

                {m.reply_text && (
                  <div style={{ background: 'rgba(255,255,255,0.06)', borderRight: '2px solid #22E7A6', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', color: '#CBD5E1', marginBottom: '4px' }}>
                    {m.reply_nickname}: {m.reply_text}
                  </div>
                )}

                <div style={{ background: isMe ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255,255,255,0.05)', border: isMe ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(255,255,255,0.08)', padding: '8px 12px', borderRadius: '12px', color: '#FFF', fontSize: '13px', userSelect: 'text', WebkitUserSelect: 'text', cursor: 'text' }}>
                  {m.message_text}
                </div>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                  <button type="button" onClick={() => toggleLike(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: m.liked_by_me ? '#EF4444' : '#94A3B8' }}>
                    {m.liked_by_me ? '❤️' : '🤍'} {m.like_count > 0 ? fa(m.like_count) : ''}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {reply && (
        <div style={{ background: 'rgba(0,0,0,0.4)', padding: '6px 14px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
          <span>پاسخ به {reply.nickname}: {reply.message_text}</span>
          <button type="button" onClick={() => setReply(null)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Categorized Canned Messages & Emoji bar */}
      <div style={{ background: '#0F172A', borderTop: '1px solid rgba(255,255,255,0.12)', padding: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', flex: 1, paddingBottom: '2px' }}>
            {categories.map((cat, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setTab(i)}
                style={{
                  background: tab === i ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255,255,255,0.05)',
                  border: tab === i ? '1px solid #38BDF8' : '1px solid rgba(255,255,255,0.1)',
                  color: tab === i ? '#38BDF8' : '#CBD5E1',
                  padding: '4px 10px',
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
              >
                {cat.title}
              </button>
            ))}
          </div>
          {cdLeft > 0 && <span style={{ color: '#EF4444', fontSize: '11px', fontWeight: 'bold' }}>صبر کنید ({fa(cdLeft)} ثانیه)</span>}
        </div>

        <div style={{ height: '96px', overflowX: 'auto', overflowY: 'hidden', paddingBottom: '4px' }}>
          {categories[tab]?.isEmoji ? (
            <div style={{ display: 'grid', gridTemplateRows: 'repeat(2, 1fr)', gridAutoFlow: 'column', gap: '6px', height: '100%', gridAutoColumns: 'minmax(60px, auto)' }}>
              {EMOJIS.map((em, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={cdLeft > 0}
                  onClick={() => sendCanned(em)}
                  style={{
                    background: cdLeft > 0 ? 'rgba(255,255,255,0.02)' : '#1E293B',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    fontSize: '22px',
                    cursor: cdLeft > 0 ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    userSelect: 'text',
                  }}
                >
                  {em}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateRows: 'repeat(2, 1fr)', gridAutoFlow: 'column', gap: '8px', height: '100%', gridAutoColumns: 'max-content' }}>
              {(categories[tab]?.items || []).map((txt, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={cdLeft > 0}
                  onClick={() => sendCanned(txt)}
                  style={{
                    background: cdLeft > 0 ? 'rgba(255,255,255,0.03)' : '#1E293B',
                    border: cdLeft > 0 ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(56, 189, 248, 0.35)',
                    color: cdLeft > 0 ? '#64748B' : '#FFF',
                    padding: '8px 12px',
                    borderRadius: '12px',
                    fontSize: '11.5px',
                    fontWeight: '700',
                    whiteSpace: 'nowrap',
                    cursor: cdLeft > 0 ? 'not-allowed' : 'pointer',
                    userSelect: 'text',
                    WebkitUserSelect: 'text',
                  }}
                >
                  {txt}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
