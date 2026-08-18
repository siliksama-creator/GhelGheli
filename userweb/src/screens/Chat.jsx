// Public chat room: Categorized Canned Messages & Emoji Palette (no custom text typing, no stickers).
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';

import { req, asset, fa, avatarUrl, API } from '../lib/api.js';
import { CosmeticAvatarFrame, DisplayName } from '../components/Cosmetics.jsx';
import { SvgIcon } from '../components/IconAsset.jsx';

const EMOJIS = [
  '🔥', '⚽', '🏆', '😎', '😂', '👏', '🤝', '💪',
  '🎯', '⭐', '❤️', '🚀', '👑', '🥳', '🥇', '💯',
  '🧤', '⚡', '🤩', '👍', '🎮', '🍿', '🎩', '💎',
];

/* پیامی که فقط ایموجی است حباب نمی‌خواهد؛ بزرگ و بدون کادر قشنگ‌تر است.
   محدود به حداکثر سه ایموجی تا یک پیامِ متنیِ کوتاه اشتباه گرفته نشود. */
const ONLY_EMOJI = /^(?:\p{Extended_Pictographic}\uFE0F?){1,3}$/u;

/* ساعتِ پیام — سرور `sent_at` را همیشه می‌فرستد ولی هیچ‌کدام از دو کلاینت
   نشانش نمی‌دادند، پس کاربر نمی‌فهمید پیام مالِ پنج دقیقه پیش است یا دیروز.
   خروجی عمداً کوتاه است (فقط ساعت و دقیقه) تا کنارِ نام جا شود؛ برای پیامِ
   قدیمی‌تر از امروز، روز هم اضافه می‌شود وگرنه «۱۴:۳۲» گمراه‌کننده است.
   تاریخِ نامعتبر رشتهٔ خالی برمی‌گرداند تا هرگز «Invalid Date» دیده نشود. */
function msgTime(raw) {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' });
    const that = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Tehran' });
    const hm = d.toLocaleTimeString('fa-IR-u-nu-arabext', {
      timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit',
    });
    if (today === that) return hm;
    const day = d.toLocaleDateString('fa-IR-u-nu-arabext', {
      timeZone: 'Asia/Tehran', month: 'numeric', day: 'numeric',
    });
    return `${day} · ${hm}`;
  } catch {
    return '';
  }
}

// دسته‌بندیِ نمایشیِ پیام‌های آماده.
//
// ⚠️ منبعِ حقیقتِ *مجازبودن* یک پیام، `CANNED_MESSAGES` در
// `backend/src/server.js` است — سرور هر متنی خارج از آن فهرست را رد
// می‌کند. اینجا فقط تصمیم می‌گیریم هر پیام زیرِ کدام تب بنشیند.
//
// یک بار این دو از هم پاشیدند: سرور ۳۶ پیام می‌پذیرفت و کلاینت‌ها فقط ۲۱
// تا را نشان می‌دادند، یعنی ۱۵ پیام ساخته شده بود و هیچ‌کس نمی‌دید‌شان.
// گاردِ `chat-parity.mjs` حالا برابریِ این دو مجموعه را در CI می‌بندد،
// پس افزودن پیام به سرور بدون افزودنش به هر دو کلاینت، بیلد را می‌شکند.
const BASE_CATEGORIES = [
  { title: 'گفتگو', icon: 'chat', items: ['سلام بچه‌ها!', 'من اومدم!', 'چه خبر بچه‌ها؟', 'خداحافظ تا بعد!', 'مواظب خودتون باشید!', 'خوشبختم دوستان!', 'کجا زندگی می‌کنید؟', 'امروز چیکار کردید؟', 'ممنون از شما!', 'میشه کمکم کنید؟', 'تبریک میگم!', 'وای چقدر خنده‌دار بود!', 'ایول به همگی!', 'کسی کد جدید داره؟'] },
  { title: 'بازی', icon: 'football', items: ['کی پایه بازیه؟', 'بریم برای برد!', 'من عاشق این بازی‌ام!', 'منم می‌خوام بازی کنم!', 'دوباره امتحان می‌کنم!', 'بازی خیلی باحال بود!', 'عالی بود!', 'موفق باشی!', 'شگفت‌انگیز بود!'] },
  { title: 'رقابت', icon: 'game', items: ['بزن بریم بازی!', 'آماده‌ای برای مسابقه؟', 'این دست من می‌برم!', 'بازی عالی بود!', 'دوباره بازی کنیم؟', 'کارت خفن گرفتم!', 'حریف قوی می‌خوام!', 'پنالتی رو دریبل کردم!', 'خیلی خفن بود!', 'شما تو کدوم لیگ هستید؟', 'چقدر امتیازم بالا رفت!', 'کارت جدید پیدا کردم!', 'امروز روز منه!'] },
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
      title: pack.name,
      icon: 'sparkle',
      items: Array.isArray(pack.messages) ? pack.messages : [],
      premium: true,
    })),
    { title: 'ایموجی', icon: 'heart', items: [], isEmoji: true },
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
        // اندروید این را چک می‌کرد و وب نه: کاربرِ واجدشرایط‌نشده صفحهٔ
        // خالی می‌دید بدون هیچ توضیحی که چرا. سرور `eligible:false` را
        // در همین پاسخ می‌فرستد.
        if (res.config?.eligible === false) {
          setErr(`برای چت باید حداقل ${fa(res.config.minLifetimePoints)} امتیاز تاریخی داشته باشید.`);
          setLoading(false);
          return;
        }
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

    // سرور از همان اول `chat:new` را emit می‌کرد ولی هیچ کلاینتی گوش
    // نمی‌داد، پس چت عملاً هر ۵ ثانیه یک‌بار «زنده» می‌شد. حالا پیام
    // بی‌درنگ می‌رسد و polling فقط تورِ ایمنیِ قطعیِ سوکت است — با فاصلهٔ
    // ۱۵ ثانیه به‌جای ۵، چون دیگر مسیرِ اصلی نیست (⅓ ترافیک قبلی).
    let socket = null;
    try {
      socket = io(API, {
        auth: { token }, transports: ['websocket', 'polling'],
        forceNew: true, reconnection: true,
      });
      socket.on('chat:new', msg => {
        if (!alive.current || !msg?.id) return;
        setMessages(prev => {
          // سرور پیام را به فرستنده هم برمی‌گرداند و `sendCanned` خودش آن
          // را اضافه می‌کند؛ بدون این نگهبان، پیامِ خودت دو بار می‌نشست.
          if (prev.some(m => String(m.id) === String(msg.id))) return prev;
          const next = [...prev, msg];
          lastCount.current = next.length;
          return next;
        });
        scrollDown();
      });
    } catch { /* سوکت اختیاری است؛ polling پایین کار را ادامه می‌دهد */ }

    const timer = setInterval(() => {
      req('/api/chat/messages', 'GET', null, token).then(msgs => {
        if (!alive.current || !Array.isArray(msgs)) return;
        const grew = msgs.length > lastCount.current;
        lastCount.current = msgs.length;
        setMessages(msgs);
        if (grew) scrollDown();
      }).catch(() => {});
    }, 15000);

    return () => {
      clearInterval(timer);
      try { socket?.off('chat:new'); socket?.disconnect(); } catch { /* noop */ }
    };
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
          <span style={{ display: 'flex', color: '#FFC53D', flexShrink: 0 }}><SvgIcon name="pin" size={17} /></span>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#FFC53D' }}>اعلان مدیریت</div>
            <div style={{ fontSize: '13px', color: '#FFF' }}>{pinned.text}</div>
          </div>
        </div>
      )}

      {err && <div className="err" style={{ margin: '12px' }}>{err}</div>}

      <div ref={boxRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {messages.length === 0 && (
          /* بدونِ این، چتِ خالی یک مستطیلِ سیاه بود و کاربر فکر می‌کرد
             بارگذاری نشده. */
          <div className="chatEmpty">
            <span className="chatEmptyIcon"><SvgIcon name="chat" size={30} /></span>
            <b>هنوز پیامی نیست</b>
            <small>اولین نفری باش که سلام می‌کند — از دکمه‌های پایین انتخاب کن.</small>
          </div>
        )}
        {messages.map(m => {
          // سرور `is_mine` را حساب می‌کند (تک‌منبعِ حقیقت، آینهٔ اندروید).
          // مقایسه با `meId` به‌عنوان پشتیبان می‌ماند چون پیامی که از
          // broadcast سوکت می‌آید عمداً `is_mine` ندارد.
          const isMe = m.is_mine === true || String(m.user_id) === String(meId);
          const time = msgTime(m.sent_at);
          const onlyEmoji = ONLY_EMOJI.test((m.message_text || '').trim());
          return (
            <div key={m.id} className={`chatMsg${isMe ? ' me' : ''}`}>
              <CosmeticAvatarFrame frame={m.cosmetics?.frame} style={{width:38,height:38,padding:m.cosmetics?.frame?3:0,flexShrink:0}}>
                <img
                  src={m.profile_image_url ? asset(m.profile_image_url) : avatarUrl(m.profile_avatar_key)}
                  alt=""
                  style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover',cursor:'pointer',border:'1px solid #071522'}}
                  onClick={() => openProfile && openProfile(m.user_id)}
                />
              </CosmeticAvatarFrame>
              <div className="chatMsgBody">
                <div className="chatMsgHead">
                  {!isMe && <DisplayName name={m.nickname || m.first_name || 'کاربر'} cosmetics={m.cosmetics} level={m.level} />}
                  {isMe && <b className="chatMeTag">شما</b>}
                  {time && <span className="chatTime">{time}</span>}
                </div>

                {m.reply_text && (
                  <div className="chatQuote">
                    <b>{m.reply_nickname}</b>
                    <span>{m.reply_text}</span>
                  </div>
                )}

                <div className={`chatBubble${isMe ? ' me' : ''}${onlyEmoji ? ' emoji' : ''}`}>
                  {m.message_text}
                </div>

                <div className="chatMsgFoot">
                  <button type="button" onClick={() => toggleLike(m)}
                    className={`chatAct${m.liked_by_me ? ' liked' : ''}`}
                    aria-label="پسندیدن">
                    <SvgIcon name="heart" size={13} /> {m.like_count > 0 ? fa(m.like_count) : ''}
                  </button>
                  <button type="button" onClick={() => setReply(m)} className="chatAct" aria-label="پاسخ">
                    ↩ پاسخ
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {reply && (
        <div className="chatReplyBar">
          <span className="chatReplyIcon">↩</span>
          <div className="chatReplyText">
            <b>پاسخ به {reply.nickname}</b>
            <span>{reply.message_text}</span>
          </div>
          <button type="button" onClick={() => setReply(null)} className="chatReplyX" aria-label="لغو پاسخ">✕</button>
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
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                {cat.icon && <SvgIcon name={cat.icon} size={13} />}
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
