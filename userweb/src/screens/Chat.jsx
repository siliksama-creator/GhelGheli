// Public chat room.
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { req, asset, fa, avatars, PIN_COLORS } from '../lib/api.js';

const POLL_MS = 8000;

export default function Chat({ token, openProfile }) {
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
          <p>با هواداران دیگر گفتگو کن ⚽</p>
        </div>
        <span className="liveBadge">زنده</span>
      </div>

      {pinned?.active && pinned.text && (
        <div className="pinnedBanner"
          style={{ '--pin': PIN_COLORS[pinned.accent] || PIN_COLORS.gold }}>
          <span className="pinIcon">📌</span>
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
          <div className="chatmsg" key={m.id}>
            <img alt="آواتار" onClick={() => openProfile(m.user_id)}
              src={m.profile_image_url
                ? asset(m.profile_image_url)
                : `/avatars/${m.profile_avatar_key || avatars[0]}`} />
            <div className="chatbody">
              <b className="clickableText" onClick={() => openProfile(m.user_id)}>
                {m.nickname || m.first_name || 'کاربر'}
              </b>
              {m.reply_text && (
                <small className="reply">
                  ↩ {m.reply_nickname || 'کاربر'}: {m.reply_text}
                </small>
              )}
              {m.message_type === 'sticker' && m.sticker_url
                ? <img className="stickerMsg" src={asset(m.sticker_url)} alt="استیکر" />
                : <p>{m.message_text}</p>}
              <div className="chatActions">
                <button onClick={() => setReply(m)}>ریپلای</button>
                <button onClick={() => like(m)}>❤ {fa(m.like_count)}</button>
                <button onClick={() => report(m)}>گزارش</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="sendDock">
        <button className="emojiBtn" onClick={() => setCannedOpen(!cannedOpen)}>
          💬 انتخاب پیام
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
