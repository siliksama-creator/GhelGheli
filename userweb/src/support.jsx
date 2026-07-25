// Support tickets for the web app.
//
// Mirrors the mobile rules: one open ticket at a time, one new ticket per
// day, only an admin can close it, and every message may carry up to five
// images. Moved out of main.jsx (where it was a single cramped line) so the
// user area stops feeling thrown together.
import React, { useCallback, useEffect, useState } from 'react';

const MAX_SHOTS = 5;

const STATUS_LABEL = {
  open: 'باز',
  answered: 'پاسخ داده شد',
  pending: 'در انتظار',
  resolved: 'حل‌شده',
  closed: 'بسته‌شده',
};

export default function Support({ token, api, req, asset }) {
  const [tickets, setTickets] = useState([]);
  const [quota, setQuota] = useState(null);
  const [active, setActive] = useState(null);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [t, q] = await Promise.all([
        req('/api/support/tickets', 'GET', null, token),
        req('/api/support/quota', 'GET', null, token),
      ]);
      setTickets(t);
      setQuota(q);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setLoading(false);
    }
  }, [req, token]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <section className="card wide"><p>در حال بارگذاری...</p></section>;

  if (active) {
    return (
      <Thread
        token={token} api={api} req={req} asset={asset}
        ticket={active}
        onBack={() => { setActive(null); load(); }}
      />
    );
  }

  return (
    <section className="card wide">
      <div className="sectionHead">
        <div><h2>پشتیبانی</h2><p>در هر روز یک تیکت می‌توانید ثبت کنید</p></div>
      </div>
      {msg && <p className="msg">{msg}</p>}

      {quota?.canCreate
        ? <NewTicket token={token} api={api} req={req} asset={asset}
            onDone={() => { setMsg('تیکت ثبت شد'); load(); }}
            onError={setMsg} />
        : <div className="quotaBox">
            <b>{quota?.reason === 'open_ticket' ? 'یک تیکت باز دارید' : 'سقف روزانه تکمیل شد'}</b>
            <p>{quota?.message}</p>
            {quota?.openTicket && (
              <button className="main" onClick={() => setActive(quota.openTicket)}>
                رفتن به تیکت باز
              </button>
            )}
          </div>}

      <hr className="divider" />
      <h3>تیکت‌های من</h3>
      {tickets.length === 0 && <p className="hint">هنوز تیکتی ثبت نکرده‌اید.</p>}
      {tickets.map((t) => (
        <div className="row clickable" key={t.id} onClick={() => setActive(t)}>
          <span>{t.subject}</span>
          <b className={t.status === 'closed' ? 'muted' : ''}>
            {STATUS_LABEL[t.status] || t.status}
          </b>
        </div>
      ))}
    </section>
  );
}

function Shots({ urls, asset, onRemove }) {
  if (!urls.length) return null;
  return (
    <div className="shots">
      {urls.map((u, i) => (
        <span className="shot" key={u}>
          <img src={asset(u)} alt="" />
          {onRemove && <button type="button" onClick={() => onRemove(i)}>×</button>}
        </span>
      ))}
    </div>
  );
}

/// Shared upload button used by both the new-ticket form and the reply box.
function ShotPicker({ urls, setUrls, api, token, disabled }) {
  const [busy, setBusy] = useState(false);
  const room = MAX_SHOTS - urls.length;

  async function pick(files) {
    if (room <= 0) return;
    setBusy(true);
    const next = [...urls];
    for (const f of Array.from(files).slice(0, room)) {
      try {
        const fd = new FormData();
        fd.append('image', f);
        const res = await fetch(`${api}/api/support/uploads/image`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.message || 'خطای آپلود عکس');
        next.push(d.url);
      } catch (e) {
        alert(e.message);
      }
    }
    setUrls(next);
    setBusy(false);
  }

  return (
    <label className="shotBtn">
      {busy ? 'در حال آپلود...' : `افزودن عکس (${urls.length}/${MAX_SHOTS})`}
      <input type="file" accept="image/*" multiple hidden
        disabled={disabled || busy || room <= 0}
        onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
    </label>
  );
}

function NewTicket({ token, api, req, asset, onDone, onError }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [shots, setShots] = useState([]);
  const [sending, setSending] = useState(false);

  async function send() {
    if (!subject.trim()) return onError('موضوع تیکت را وارد کنید');
    if (!message.trim() && !shots.length) return onError('متن پیام یا حداقل یک عکس لازم است');
    setSending(true);
    try {
      await req('/api/support/tickets', 'POST',
        { subject: subject.trim(), message: message.trim(), attachments: shots }, token);
      setSubject(''); setMessage(''); setShots([]);
      onDone();
    } catch (e) {
      onError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="ticketForm">
      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="موضوع" />
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="شرح مشکل" />
      <Shots urls={shots} asset={asset} onRemove={(i) => setShots(shots.filter((_, j) => j !== i))} />
      <div className="ticketActions">
        <ShotPicker urls={shots} setUrls={setShots} api={api} token={token} disabled={sending} />
        <button className="main" onClick={send} disabled={sending}>
          {sending ? 'در حال ارسال...' : 'ارسال تیکت'}
        </button>
      </div>
    </div>
  );
}

function Thread({ token, api, req, asset, ticket, onBack }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [shots, setShots] = useState([]);
  const [status, setStatus] = useState(ticket.status);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const closed = status === 'closed';

  const load = useCallback(async () => {
    try {
      const [m, list] = await Promise.all([
        req(`/api/support/tickets/${ticket.id}/messages`, 'GET', null, token),
        req('/api/support/tickets', 'GET', null, token),
      ]);
      setMessages(m);
      const fresh = list.find((t) => t.id === ticket.id);
      if (fresh) setStatus(fresh.status);
    } catch (e) {
      setErr(e.message);
    }
  }, [req, token, ticket.id]);

  useEffect(() => { load(); }, [load]);

  async function send() {
    if (!text.trim() && !shots.length) return setErr('متن پیام یا حداقل یک عکس لازم است');
    setSending(true);
    try {
      await req(`/api/support/tickets/${ticket.id}/messages`, 'POST',
        { message: text.trim(), attachments: shots }, token);
      setText(''); setShots([]); setErr('');
      load();
    } catch (e) {
      setErr(e.message);
      load();
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="card wide">
      <div className="gameHead">
        <button className="ghost" onClick={onBack}>‹ بازگشت</button>
        <h2>{ticket.subject}</h2>
        <span className={`ticketState ${closed ? 'off' : 'on'}`}>
          {STATUS_LABEL[status] || status}
        </span>
      </div>
      {err && <p className="msg">{err}</p>}

      <div className="thread">
        {messages.map((m) => (
          <div key={m.id} className={`tmsg ${m.sender_type === 'admin' ? 'admin' : 'me'}`}>
            <b>{m.sender_type === 'admin' ? 'پشتیبانی' : 'شما'}</b>
            {m.message_text && <p>{m.message_text}</p>}
            <Shots urls={m.attachments || []} asset={asset} />
          </div>
        ))}
        {messages.length === 0 && <p className="hint">پیامی وجود ندارد.</p>}
      </div>

      {closed ? (
        <p className="hint">این تیکت توسط پشتیبانی بسته شده است. اکنون می‌توانید تیکت جدیدی ثبت کنید.</p>
      ) : (
        <>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="پاسخ شما..." />
          <Shots urls={shots} asset={asset} onRemove={(i) => setShots(shots.filter((_, j) => j !== i))} />
          <div className="ticketActions">
            <ShotPicker urls={shots} setUrls={setShots} api={api} token={token} disabled={sending} />
            <button className="main" onClick={send} disabled={sending}>
              {sending ? 'در حال ارسال...' : 'ارسال پاسخ'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
