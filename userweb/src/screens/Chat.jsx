// Public chat room: Categorized Canned Messages & Emoji Palette (no custom text typing, no stickers).
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';

import { req, asset, fa, avatarUrl } from '../lib/api.js';
import { DisplayName } from '../components/Cosmetics.jsx';

const EMOJIS = [
  '🔥', '⚽', '🏆', '😎', '😂', '👏', '🤝', '💪',
  '🎯', '⭐', '❤️', '🚀', '👑', '🥳', '🥇', '💯',
  '🧤', '⚡', '🤩', '👍', '🎮', '🍿', '🎩', '💎',
];

const CATEGORIES = [
  { title: '💬 گفتگو', items: ['سلام بچه‌ها!', 'من اومدم!', 'چه خبر بچه‌ها؟', 'خداحافظ تا بعد!', 'مواظب خودتون باشید!', 'خوشبختم دوستان!', 'کجا زندگی می‌کنید؟', 'امروز چیکار کردید؟'] },
  { title: '⚽ بازی', items: ['کی پایه بازیه؟', 'بریم برای برد!', 'من عاشق این بازی‌ام!', 'منم می‌خوام بازی کنم!', 'دوباره امتحان می‌کنم!'] },
  { title: '🏆 کل‌کل', items: ['عالی بود!', 'خیلی خفن بود!', 'تبریک میگم!', 'شگفت‌انگیز بود!', 'چقدر امتیازم بالا رفت!', 'کارت جدید پیدا کردم!', 'امروز روز منه!', 'ایول به همگی!'] },
  { title: '😀 ایموجی', items: [] },
];

export default function Chat({ token, openProfile, meId }) {
  const [messages, setMessages] = useState([]);
  const [pinned, setPinned] = useState(null);
  const [err, setErr] = useState('');
  const [reply, setReply] = useState(null);
  const [cdLeft, setCdLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);

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
              <img
                src={m.profile_image_url ? asset(m.profile_image_url) : avatarUrl(m.profile_avatar_key)}
                alt=""
                style={{ width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer' }}
                onClick={() => openProfile && openProfile(m.user_id)}
              />
              <div style={{ flex: 1, maxWidth: '85%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                  <DisplayName name={m.nickname || m.first_name || 'کاربر'} cosmetics={m.cosmetics} level={m.level} />
                  <button type="button" onClick={() => setReply(m)} style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: '11px', cursor: 'pointer' }}>↩ پاسخ</button>
                </div>

                {m.reply_text && (
                  <div style={{ background: 'rgba(255,255,255,0.06)', borderRight: '2px solid #22E7A6', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', color: '#CBD5E1', marginBottom: '4px' }}>
                    {m.reply_nickname}: {m.reply_text}
                  </div>
                )}

                <div style={{ background: isMe ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255,255,255,0.05)', border: isMe ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(255,255,255,0.08)', padding: '8px 12px', borderRadius: '12px', color: '#FFF', fontSize: '13px' }}>
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
          <div style={{ display: 'flex', gap: '6px' }}>
            {CATEGORIES.map((cat, i) => (
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
                  cursor: 'pointer',
                }}
              >
                {cat.title}
              </button>
            ))}
          </div>
          {cdLeft > 0 && <span style={{ color: '#EF4444', fontSize: '11px', fontWeight: 'bold' }}>صبر کنید ({fa(cdLeft)} ثانیه)</span>}
        </div>

        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
          {tab === 3 ? (
            EMOJIS.map((em, idx) => (
              <button
                key={idx}
                type="button"
                disabled={cdLeft > 0}
                onClick={() => sendCanned(em)}
                style={{
                  background: '#1E293B',
                  border: '1px solid rgba(255,255,255,0.1)',
                  padding: '6px 12px',
                  borderRadius: '10px',
                  fontSize: '20px',
                  cursor: cdLeft > 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {em}
              </button>
            ))
          ) : (
            CATEGORIES[tab].items.map((txt, idx) => (
              <button
                key={idx}
                type="button"
                disabled={cdLeft > 0}
                onClick={() => sendCanned(txt)}
                style={{
                  background: cdLeft > 0 ? 'rgba(255,255,255,0.04)' : '#1E293B',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  color: cdLeft > 0 ? '#64748B' : '#FFF',
                  padding: '8px 12px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  whiteSpace: 'nowrap',
                  cursor: cdLeft > 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {txt}
              </button>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
