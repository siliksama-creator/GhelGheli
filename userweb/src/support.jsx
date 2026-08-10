// Support tickets, FAQ, and Privacy / Fair-Play Terms for the web app.
import React, { useCallback, useEffect, useState } from 'react';

const MAX_SHOTS = 5;

const STATUS_LABEL = {
  open: 'باز',
  answered: 'پاسخ داده شد',
  pending: 'در انتظار',
  resolved: 'حل‌شده',
  closed: 'بسته‌شده',
};

const FAQ = [
  {
    q: 'چگونه در قلقلی امتیاز کسب کنم؟',
    a: 'با ثبت کد و عکس فوتوکارت‌ها، برنده شدن در بازی‌های آنلاین (جفت‌یاب)، پیشرفت در بازی ضربه‌زن، استریک ورود روزانه و چرخاندن گردونه شانس.',
  },
  {
    q: 'جوایز و درآمد کیف پول چگونه تسویه می‌شوند؟',
    a: 'در بخش کیف پول با ثبت شماره کارت و شبا معتبر به نام خودتان، درخواست تسویه ثبت کنید تا در سیکل پایا واریز شود.',
  },
  {
    q: 'اشتراک قلقلی پلاس چه امکاناتی می‌دهد؟',
    a: 'عضویت دائمی در ۱ باشگاه فوتبال، جوایز مسیر ویژه گذر نبرد به مدت ۱ ماه، ستاره طلایی درخشان کنار نام در همه بخش‌ها و دسترسی به تمام قاب‌ها و رنگ‌ها.',
  },
  {
    q: 'آیا این اپلیکیشن شرط‌بندی یا قمار است؟',
    a: 'خیر؛ قلقلی کاملاً بازی مهارت‌محور، ورزشی و سرگرمی است و هیچ‌گونه فعالیت شرط‌بندی یا بخت‌آزمایی در آن وجود ندارد.',
  },
];

export default function Support({ token, api, req, asset }) {
  const [tickets, setTickets] = useState([]);
  const [quota, setQuota] = useState(null);
  const [active, setActive] = useState(null);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [faqOpen, setFaqOpen] = useState(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);

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
        <div><h2>پشتیبانی و راهنمایی</h2><p>پاسخ به سوالات متداول و ثبت تیکت</p></div>
      </div>
      {msg && <p className="msg">{msg}</p>}

      {/* ── FAQ Section ── */}
      <div className="faqSection">
        <h3>پرسش‌های متداول (FAQ)</h3>
        <div className="faqList">
          {FAQ.map((item, idx) => (
            <div key={idx} className={`faqItem ${faqOpen === idx ? 'open' : ''}`}>
              <button className="faqQ" onClick={() => setFaqOpen(faqOpen === idx ? null : idx)}>
                <span>{item.q}</span>
                <i>{faqOpen === idx ? '▲' : '▼'}</i>
              </button>
              {faqOpen === idx && <p className="faqA">{item.a}</p>}
            </div>
          ))}
        </div>
        <button className="ghost privacyLink" onClick={() => setPrivacyOpen(true)}>
          منشور حریم خصوصی و شفافیت بازی جوانمردانه
        </button>
      </div>

      {privacyOpen && (
        <div className="modalShade" onClick={() => setPrivacyOpen(false)}>
          <div className="confirmBox" onClick={e => e.stopPropagation()}>
            <h3>حریم خصوصی و شفافیت بازی</h3>
            <p>
              <b>۱. ماهیت پلتفرم سرگرمی و بازی مهارت‌محور:</b><br />
              اپلیکیشن قلقلی یک محیط سرگرمی، مسابقات مهارتی و کلکسیون فوتوکارت است. این پلتفرم هیچ‌گونه فعالیت شرط‌بندی یا قمار نداشته و تمامی پاداش‌ها بر مبنای مهارت بازیکنان محاسبه می‌شود.<br /><br />
              <b>۲. حفظ اطلاعات کاربری:</b><br />
              شماره تماس و اطلاعات هویتی شما کاملاً محفوظ بوده و به هیچ شخص ثالثی واگذار نمی‌شود.<br /><br />
              <b>۳. شفافیت مالی و تسویه‌حساب:</b><br />
              جوایز کیف پول طبق قوانین شاپرک و پایا به نام صاحب حساب واریز می‌گردد.
            </p>
            <button className="main" onClick={() => setPrivacyOpen(false)}>متوجه شدم</button>
          </div>
        </div>
      )}

      <hr className="divider" />

      {quota?.canCreate
        ? <NewTicket token={token} api={api} req={req} asset={asset}
            onDone={() => { setMsg('تیکت با موفقیت ثبت شد ✓'); load(); }}
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
      <h3>تیکت‌های من ({tickets.length})</h3>
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
      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="موضوع تیکت" />
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="شرح مشکل یا پیام شما" />
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
