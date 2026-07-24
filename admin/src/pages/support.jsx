import { useEffect, useState } from 'react';
import { LifeBuoy, Send } from 'lucide-react';
import { Badge, Button, Card, DataRow, EmptyState, Textarea } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

const STATUS_TONE = { open: 'info', pending: 'warning', resolved: 'success', closed: 'neutral' };
const STATUS_LABEL = { open: 'باز', pending: 'در انتظار', resolved: 'حل‌شده', closed: 'بسته‌شده' };

export function SupportPage({ request }) {
  const notify = useToast();
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const load = () => request('/api/admin/support/tickets').then(setTickets);
  useEffect(load, [request]);

  useEffect(() => {
    if (selected) request(`/api/admin/support/tickets/${selected.id}/messages`).then(setMessages);
  }, [selected, request]);

  async function send() {
    if (!reply.trim() || !selected) return;
    setSending(true);
    try {
      await request(`/api/admin/support/tickets/${selected.id}/messages`, { method: 'POST', body: { message: reply } });
      setReply('');
      notify('پاسخ ارسال شد');
      setSelected({ ...selected });
      load();
    } finally {
      setSending(false);
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
                <p key={m.id} className={`bubble ${m.sender_type === 'admin' ? 'admin' : ''}`}>
                  {m.message_text}
                </p>
              ))}
            </div>
            <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="پاسخ پشتیبانی" rows={3} />
            <Button icon={Send} onClick={send} loading={sending} className="btn-block" style={{ marginTop: 10 }}>
              ارسال پاسخ
            </Button>
          </>
        ) : (
          <EmptyState icon={LifeBuoy} title="جزئیات گفتگو اینجا نمایش داده می‌شود" />
        )}
      </Card>
    </div>
  );
}
