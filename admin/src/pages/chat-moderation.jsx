import { useEffect, useState } from 'react';
import { Ban, Flag, MessageCircle, Trash2 } from 'lucide-react';
import { Badge, Card, DataRow, EmptyState, IconButton } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

export function ChatModerationPage({ request }) {
  const notify = useToast();
  const [rows, setRows] = useState([]);

  const load = () => request('/api/admin/chat/messages').then(setRows);
  useEffect(load, [request]);

  async function del(id) {
    await request(`/api/admin/chat/messages/${id}/delete`, { method: 'PATCH', body: { reason: 'پیام نامناسب' } });
    notify('پیام حذف شد');
    load();
  }

  async function ban(uid) {
    await request(`/api/admin/chat/users/${uid}/ban`, { method: 'PATCH', body: { minutes: 1440, reason: 'اسپم/تخلف' } });
    notify('کاربر از چت محروم شد');
  }

  return (
    <Card title="پیام‌های اخیر چت روم" subtitle="حذف پیام و محرومیت ۲۴ ساعته کاربر از چت">
      {rows.length === 0 ? (
        <EmptyState icon={MessageCircle} title="پیامی وجود ندارد" />
      ) : (
        rows.map((m) => (
          <DataRow
            key={m.id}
            title={m.nickname || m.mobile}
            subtitle={m.message_text}
            trailing={m.is_reported ? <Badge tone="warning"><Flag size={11} /> گزارش‌شده</Badge> : null}
            actions={
              <>
                <IconButton icon={Trash2} variant="ghost" title="حذف پیام" onClick={() => del(m.id)} />
                <IconButton icon={Ban} variant="danger" title="بن چت" onClick={() => ban(m.user_id)} />
              </>
            }
          />
        ))
      )}
    </Card>
  );
}
