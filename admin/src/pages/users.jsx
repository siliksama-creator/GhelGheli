import { useEffect, useState } from 'react';
import { Coins, MessageSquareText, Search, ShieldOff, UserRoundSearch } from 'lucide-react';
import { fmtNumber } from '../lib/api.js';
import { Badge, Button, Card, DataRow, EmptyState, Input } from '../components/ui.jsx';
import { useDialog } from '../components/dialog.jsx';
import { useToast } from '../lib/toast.jsx';

export function UsersPage({ request }) {
  const notify = useToast();
  const { promptText } = useDialog();
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    request(`/api/admin/users?search=${encodeURIComponent(query)}`)
      .then(setRows)
      .finally(() => setLoading(false));
  };
  useEffect(load, [request]);

  async function block(id, status) {
    await request(`/api/admin/users/${id}/status`, { method: 'PATCH', body: { status, reason: 'مدیریت پنل' } });
    notify('وضعیت کاربر ثبت شد');
    load();
  }

  async function changePoints(id) {
    const p = await promptText({ title: 'امتیاز دستی', placeholder: 'مقدار امتیاز مثبت یا منفی', type: 'number' });
    if (!p) return;
    await request(`/api/admin/users/${id}/points`, { method: 'POST', body: { points: Number(p) || 0, reason: 'تغییر دستی' } });
    notify('امتیاز کاربر به‌روزرسانی شد');
    load();
  }

  async function privateMessage(id) {
    const body = await promptText({ title: 'پیام اختصاصی برای کاربر', multiline: true });
    if (!body) return;
    await request(`/api/admin/users/${id}/notify`, { method: 'POST', body: { title: 'پیام اختصاصی مدیریت', body } });
    notify('پیام اختصاصی ارسال شد');
  }

  return (
    <Card>
      <div className="field-row" style={{ marginBottom: 16 }}>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجوی موبایل یا نام مستعار" onKeyDown={(e) => e.key === 'Enter' && load()} />
        <Button variant="secondary" icon={Search} onClick={load} style={{ flex: '0 0 auto' }}>
          جستجو
        </Button>
      </div>
      {loading ? null : rows.length === 0 ? (
        <EmptyState icon={UserRoundSearch} title="کاربری یافت نشد" />
      ) : (
        rows.map((u) => (
          <DataRow
            key={u.id}
            title={`${u.mobile} — ${u.nickname || 'بدون نام'}`}
            trailing={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12.5, color: 'var(--gg-text-muted)' }}>{fmtNumber(u.current_points)} امتیاز</span>
                <Badge tone={u.status === 'active' ? 'success' : 'danger'}>{u.status === 'active' ? 'فعال' : 'مسدود'}</Badge>
              </div>
            }
            actions={
              <>
                <Button size="sm" variant="secondary" icon={Coins} onClick={() => changePoints(u.id)}>
                  امتیاز
                </Button>
                <Button size="sm" variant="secondary" icon={MessageSquareText} onClick={() => privateMessage(u.id)}>
                  پیام
                </Button>
                <Button size="sm" variant={u.status === 'active' ? 'danger' : 'secondary'} icon={ShieldOff} onClick={() => block(u.id, u.status === 'active' ? 'blocked' : 'active')}>
                  {u.status === 'active' ? 'مسدود' : 'رفع مسدودی'}
                </Button>
              </>
            }
          />
        ))
      )}
    </Card>
  );
}
