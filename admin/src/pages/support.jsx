import { useEffect, useState } from 'react';
import { CheckCircle2, ImagePlus, LifeBuoy, LockOpen, Send, X } from 'lucide-react';
import { Badge, Button, Card, DataRow, EmptyState, Textarea } from '../components/ui.jsx';
import { assetUrl } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';

const STATUS_TONE = { open: 'info', answered: 'success', pending: 'warning', resolved: 'success', closed: 'neutral' };
const STATUS_LABEL = { open: 'باز', answered: 'پاسخ داده شد', pending: 'در انتظار', resolved: 'حل‌شده', closed: 'بسته‌شده' };
const MAX_ATTACHMENTS = 5;

export function SupportPage({ request }) {
  const notify = useToast();
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);

  const closed = selected?.status === 'closed';

  const load = () => request('/api/admin/support/tickets').then(setTickets);
  useEffect(load, [request]);

  useEffect(() => {
    if (selected) request(`/api/admin/support/tickets/${selected.id}/messages`).then(setMessages);
  }, [selected, request]);

  async function send() {
    if (!selected) return;
    if (!reply.trim() && attachments.length === 0) {
      notify('متن پاسخ یا حداقل یک عکس لازم است', 'error');
      return;
    }
    setSending(true);
    try {
      await request(`/api/admin/support/tickets/${selected.id}/messages`, {
        method: 'POST',
        body: { message: reply.trim(), attachments },
      });
      setReply('');
      setAttachments([]);
      notify('پاسخ ارسال شد');
      setSelected({ ...selected });
      load();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSending(false);
    }
  }

  async function upload(files) {
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) return;
    setUploading(true);
    const next = [...attachments];
    try {
      for (const f of Array.from(files).slice(0, room)) {
        next.push(await request.uploadImage(f));
      }
      setAttachments(next);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  // Closing is what lets the user file a new ticket, so it's deliberate and
  // confirmed rather than an automatic consequence of replying.
  async function setClosed(close) {
    if (!selected) return;
    if (close && !window.confirm('با بستن تیکت، گفتگو پایان می‌یابد و کاربر می‌تواند تیکت جدیدی ثبت کند. ادامه می‌دهید؟')) return;
    try {
      await request(`/api/admin/support/tickets/${selected.id}/${close ? 'close' : 'reopen'}`, { method: 'PATCH' });
      setSelected({ ...selected, status: close ? 'closed' : 'open' });
      notify(close ? 'تیکت بسته شد' : 'تیکت دوباره باز شد');
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  return (
    <div className="card-grid cols-2">
      <Card title="تیکت‌های پشتیبانی">
        {tickets.length === 0 ? (
          <EmptyState icon={LifeBuoy} title="تیکتی وجود ندارد" />
        ) : (
          tickets.map((t) => (
            <DataRow
              key={t.id}
              selected={selected?.id === t.id}
              onClick={() => setSelected(t)}
              title={`${t.mobile} — ${t.subject}`}
              trailing={<Badge tone={STATUS_TONE[t.status] || 'neutral'}>{STATUS_LABEL[t.status] || t.status}</Badge>}
            />
          ))
        )}
      </Card>
      <Card title={selected ? selected.subject : 'یک تیکت را انتخاب کنید'}>
        {selected ? (
          <>
            <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 12 }}>
              {messages.map((m) => (
                <div key={m.id} className={`bubble ${m.sender_type === 'admin' ? 'admin' : ''}`}>
                  {m.message_text && <p style={{ margin: 0 }}>{m.message_text}</p>}
                  {(m.attachments || []).length > 0 && (
                    <div className="ticketShots">
                      {m.attachments.map((a) => (
                        <a key={a} href={assetUrl(a)} target="_blank" rel="noreferrer">
                          <img src={assetUrl(a)} alt="" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {closed ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="topbar-sub" style={{ flex: 1 }}>این تیکت بسته شده است.</span>
                <Button variant="secondary" icon={LockOpen} onClick={() => setClosed(false)}>بازکردن دوباره</Button>
              </div>
            ) : (
              <>
                <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="پاسخ پشتیبانی" rows={3} />
                <div className="ticketShots" style={{ marginTop: 8 }}>
                  {attachments.map((a, i) => (
                    <span key={a} className="shotWrap">
                      <img src={assetUrl(a)} alt="" />
                      <button type="button" onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                    <ImagePlus size={15} />
                    {uploading ? 'در حال آپلود...' : `افزودن عکس (${attachments.length}/${MAX_ATTACHMENTS})`}
                    <input type="file" accept="image/*" multiple hidden disabled={uploading || attachments.length >= MAX_ATTACHMENTS}
                      onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
                  </label>
                  <Button icon={Send} onClick={send} loading={sending}>ارسال پاسخ</Button>
                  <Button variant="secondary" icon={CheckCircle2} onClick={() => setClosed(true)}>بستن تیکت</Button>
                </div>
              </>
            )}
          </>
        ) : (
          <EmptyState icon={LifeBuoy} title="جزئیات گفتگو اینجا نمایش داده می‌شود" />
        )}
      </Card>
    </div>
  );
}
