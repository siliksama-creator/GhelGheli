import { useState } from 'react';
import { Megaphone } from 'lucide-react';
import { Button, Card, Field, Input, Textarea } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

export function NotificationsPage({ request }) {
  const notify = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  async function send(e) {
    e.preventDefault();
    setSending(true);
    try {
      await request('/api/admin/notifications/broadcast', { method: 'POST', body: { title, body } });
      notify('اطلاعیه همگانی ثبت شد');
      setTitle('');
      setBody('');
    } finally {
      setSending(false);
    }
  }

  return (
    <Card title="ارسال اطلاعیه همگانی" subtitle="این پیام برای همه‌ی کاربران فعال ارسال می‌شود" style={{ maxWidth: 520 }}>
      <form onSubmit={send}>
        <Field label="عنوان">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="متن اعلان">
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} />
        </Field>
        <Button type="submit" icon={Megaphone} loading={sending} className="btn-block">
          ارسال
        </Button>
      </form>
    </Card>
  );
}
