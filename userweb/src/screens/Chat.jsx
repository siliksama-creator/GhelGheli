// Public chat room.
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';

import { req, asset, fa, avatars, PIN_COLORS, avatarUrl } from '../lib/api.js';
import { DisplayName } from '../components/Cosmetics.jsx';

const POLL_MS = 8000;

export default function Chat({ token, openProfile, meId }) {
  const [messages, setMessages] = useState([]);
  const [stickers, setStickers] = useState([]);
  const [canned, setCanned] = useState([]);
  const [pinned, setPinned] = useState(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [reply, setReply] = useState(null);
  const [cannedOpen, setCannedOpen] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [cdLeft, setCdLeft] = useState(0);
  const [sending, setSending] = useState(false);

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
    // Fan out instead of awaiting in sequence.
    //
    // These used to run one after another, so the round trips ADDED UP on a
    // slow connection — and worse, a failure in the config call meant the
    // messages below it never loaded at all, leaving an empty room with one
    // error line. allSettled keeps each slice independent: stickers failing
    // must not hide the conversation.
    const [cfgR, msgsR, stickR, cannedR] = await Promise.allSettled([
      req('/api/chat/config', 'GET', null, token),
      req('/api/chat/messages', 'GET', null, token),
      req('/api/chat/stickers', 'GET', null, token),
      req('/api/chat/canned-messages', 'GET', null, token),
    ]);
    if (!alive.current) return;

    if (cfgR.status === 'fulfilled') {
      setPinned(cfgR.value.pinned || null);
      if (typeof cfgR.value.messageCooldownSeconds === 'number') {
        setCooldown(cfgR.value.messageCooldownSeconds);
      }
    }
    if (stickR.status === 'fulfilled') setStickers(stickR.value || []);
    if (cannedR.status === 'fulfilled') setCanned(cannedR.value || []);

    if (msgsR.status === 'fulfilled') {
      const msgs = msgsR.value || [];
      // Auto-scroll only when a NEW message arrives, and only if the reader
      // is already near the bottom — yanking the view while someone reads
      // history would be hostile.
      const grew = msgs.length > lastCount.current;
      lastCount.current = msgs.length;
      setMessages(msgs);
      setErr('');
      if (grew) scrollDown();
    } else {
      setErr(msgsR.reason?.message || 'خطا در دریافت پیام‌ها');
    }
  }, [token, scrollDown]);

  // Visible cooldown so the send button explains the wait instead of the
  // server silently rejecting the message.
  useEffect(() => {
    if (cdLeft <= 0) return;
    const t = setTimeout(() => setCdLeft(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cdLeft]);

  // Poll only while the tab is visible. A background tab polling every few
  // seconds hammers the API and drains mobile battery for updates nobody can
  // see.
  useEffect(() => {
    load();
    let t = null;
    const start = () => { if (!t) t = setInterval(load, POLL_MS); };
    const stop = () => { if (t) { clearInterval(t); t = null; } };
    const onVis = () => {
      if (document.hidden) stop();
      else { load(); start(); }
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  async function send(stickerId = null, msgText = text) {
    if (cdLeft > 0 || sending) return;
    if (!stickerId && !msgText.trim()) return;
    setSending(true);
    try {
      await req('/api/chat/messages', 'POST',
        { message: msgText, stickerId, replyTo: reply?.id }, token);
      setText('');
      setReply(null);
      setCannedOpen(false);
      setCdLeft(cooldown);
      await load();
      scrollDown(true);   // always show our own message
    } catch (e) {
      setErr(e.message);
    } finally {
      if (alive.current) setSending(false);
    }
  }

  async function like(m) {
    try {
      await req(`/api/chat/messages/${m.id}/like`, 'POST', {}, token);
      load();
    } catch (e) { setErr(e.message); }
  }

  async function report(m) {
    try {
      await req(`/api/chat/messages/${m.id}/report`, 'POST', {}, token);
      setErr('گزارش ثبت شد و برای مدیر ارسال می‌شود');
    } catch (e) { setErr(e.message); }
  }

  return (
    <section className="card wide chatPage">
      <div className="sectionHead">
        <div>
          <h2>چت روم قلقلی</h2>
          <p>با هواداران دیگر گفتگو کن</p>
        </div>
        <span className="liveBadge">زنده</span>
      </div>

      {/* `--pin-dark` نوشته می‌شود و theme.css آن را به `--pin` تبدیل
          می‌کند. چرا این حلقهٔ اضافه: استایلِ درون‌خطی در آبشار از هر
          قانونِ CSSی قوی‌تر است، پس اگر مستقیم `--pin` را بنویسیم هیچ
          شیوه‌نامه‌ای نمی‌تواند بازتعریفش کند. */}
      {pinned?.active && pinned.text && (
        <div className="pinnedBanner"
          style={{
            '--pin-dark': PIN_COLORS[pinned.accent] || PIN_COLORS.gold,
          }}>
          <span className="pinIcon"></span>
          <div><b>اعلان مدیریت</b><p>{pinned.text}</p></div>
        </div>
      )}

      {err && <p className="msg">{err}</p>}

      {reply && (
        <div className="replybar">
          در پاسخ به {reply.nickname || 'کاربر'}: {reply.message_text}
          <button onClick={() => setReply(null)}>×</button>
        </div>
      )}

      <div className="stickerTray">
        {stickers.map(st => (
          <button key={st.id} title={st.title} onClick={() => send(st.id)}>
            <img src={asset(st.image_url)} alt={st.title || 'استیکر'} />
          </button>
        ))}
        {!stickers.length &&
          <span className="hint">استیکری هنوز توسط مدیر اضافه نشده است.</span>}
      </div>

      <div className="chatbox" ref={boxRef}>
        {messages.map(m => (
          <Message key={m.id} m={m} mine={m.user_id === meId}
            onProfile={openProfile} onReply={setReply}
            onLike={like} onReport={report} />
        ))}
      </div>

      <div className="sendDock">
        <button className="emojiBtn" onClick={() => setCannedOpen(!cannedOpen)}>
          انتخاب پیام
        </button>
        {cannedOpen && (
          <div className="cannedPopover">
            {canned.map((c, i) => (
              <button key={i} onClick={() => { setText(c); setCannedOpen(false); }}>
                {c}
              </button>
            ))}
          </div>
        )}
        <input value={text} readOnly placeholder="یک پیام آماده انتخاب کنید..."
          onClick={() => setCannedOpen(true)} />
        <button className="main" disabled={cdLeft > 0 || sending}
          onClick={() => send(null, text)}>
          {cdLeft > 0 ? `${fa(cdLeft)} ثانیه` : sending ? '...' : 'ارسال'}
        </button>
      </div>
    </section>
  );
}


/**
 * One chat message.
 *
 * Memoised because the room re-polls every 8 seconds: without this, each poll
 * re-rendered every message and re-evaluated every avatar `src`, so a
 * 50-message room did 50 pointless subtree renders three times a minute. The
 * comparator only looks at the fields that can actually change.
 */
const Message = memo(function Message({ m, mine, onProfile, onReply, onLike, onReport }) {
  return (
    <div className={`chatmsg${mine ? ' mine' : ''}`}>
      <img alt="آواتار" onClick={() => onProfile(m.user_id)}
        width="40" height="40" loading="lazy" decoding="async"
        src={m.profile_image_url
          ? asset(m.profile_image_url)
          : avatarUrl(m.profile_avatar_key)} />
      <div className="chatbody">
        <DisplayName className="clickableText"
          onClick={() => onProfile(m.user_id)}
          name={m.nickname || m.first_name || 'کاربر'}
          cosmetics={m.cosmetics}
          level={m.level}
          // Suppress the inline crest when the avatar beside it is already
          // that same crest — otherwise the badge appears twice in a row.
          avatarKey={m.profile_image_url ? null : m.profile_avatar_key} />
        {m.reply_text && (
          <small className="reply">
            ↩ {m.reply_nickname || 'کاربر'}: {m.reply_text}
          </small>
        )}
        {m.message_type === 'sticker' && m.sticker_url
          ? <img className="stickerMsg" src={asset(m.sticker_url)} alt="استیکر"
              loading="lazy" decoding="async" />
          : <p>{m.message_text}</p>}
        {m.created_at && (
          <span className="chatTime">
            {new Date(m.created_at).toLocaleTimeString('fa-IR',
              { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        <div className="chatActions">
          <button onClick={() => onReply(m)}>ریپلای</button>
          <button onClick={() => onLike(m)}>پسند {fa(m.like_count)}</button>
          <button onClick={() => onReport(m)}>گزارش</button>
        </div>
      </div>
    </div>
  );
}, (a, b) =>
  a.m.id === b.m.id &&
  a.m.like_count === b.m.like_count &&
  a.m.message_text === b.m.message_text &&
  a.mine === b.mine &&
  // A user equipping a badge mid-session must re-render their messages.
  JSON.stringify(a.m.cosmetics) === JSON.stringify(b.m.cosmetics));
