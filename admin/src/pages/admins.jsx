import { useEffect, useState } from 'react';
import { History, ShieldOff, ShieldPlus, Users } from 'lucide-react';
import { fmtDateTime } from '../lib/api.js';
import { Badge, Button, Card, EmptyState, Field, Input, Select } from '../components/ui.jsx';
import { useDialog } from '../components/dialog.jsx';
import { useToast } from '../lib/toast.jsx';

const ROLE_LABEL = { super_admin: 'مدیر کل', support: 'پشتیبان', observer: 'ناظر' };

export function AdminsPage({ request }) {
  const notify = useToast();
  const { confirmAction } = useDialog();
  const [admins, setAdmins] = useState([]);
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState({ username: '', password: '', role: 'support' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    request('/api/admin/admins').then(setAdmins);
    request('/api/admin/audit-log').then(setLogs);
  };
  useEffect(load, [request]);

  async function add(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await request('/api/admin/admins', { method: 'POST', body: form });
      setForm({ username: '', password: '', role: 'support' });
      notify('ادمین ساخته شد');
      load();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  // Previously there was no way to revoke an admin account short of direct
  // DB access — a departing or compromised support account stayed usable
  // until its JWT naturally expired (up to 12h).
  async function toggleActive(a) {
    const activating = !a.is_active;
    const ok = await confirmAction({
      title: activating ? 'فعال‌سازی ادمین' : 'غیرفعال‌سازی ادمین',
      description: activating
        ? `${a.username} دوباره می‌تواند وارد پنل شود.`
        : `${a.username} دیگر نمی‌تواند وارد پنل شود و نشست‌های فعلی هم در اولین درخواست رد می‌شوند.`,
      danger: !activating,
      confirmLabel: activating ? 'فعال کن' : 'غیرفعال کن',
    });
    if (!ok) return;
    try {
      await request(`/api/admin/admins/${a.id}/status`, { method: 'PATCH', body: { isActive: activating } });
      notify(activating ? 'ادمین فعال شد' : 'ادمین غیرفعال شد');
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  }

  return (
    <div className="card-grid cols-2">
      <Card title="ادمین جدید">
        <form onSubmit={add}>
          <Field label="نام کاربری">
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          </Field>
          <Field label="رمز عبور">
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </Field>
          <Field label="نقش">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="super_admin">مدیر کل</option>
              <option value="support">پشتیبان</option>
              <option value="observer">ناظر</option>
            </Select>
          </Field>
          <Button type="submit" icon={ShieldPlus} loading={saving} className="btn-block">
            ایجاد ادمین
          </Button>
        </form>
        <div style={{ marginTop: 16 }}>
          {admins.length === 0 ? (
            <EmptyState icon={Users} title="ادمینی ثبت نشده" />
          ) : (
            admins.map((a) => (
              <div key={a.id} className="data-row">
                <div className="data-row-main">
                  <div className="data-row-title">{a.username}</div>
                  <div className="data-row-sub">{ROLE_LABEL[a.role] || a.role}</div>
                </div>
                <Badge tone={a.is_active ? 'success' : 'neutral'}>{a.is_active ? 'فعال' : 'غیرفعال'}</Badge>
                <div className="data-row-actions">
                  <Button size="sm" variant={a.is_active ? 'danger' : 'secondary'} icon={ShieldOff} onClick={() => toggleActive(a)}>
                    {a.is_active ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card title="گزارش فعالیت (Audit Log)">
        {logs.length === 0 ? (
          <EmptyState icon={History} title="رویدادی ثبت نشده" />
        ) : (
          <div style={{ maxHeight: 460, overflowY: 'auto' }}>
            {logs.slice(0, 80).map((l) => (
              <p key={l.id} className="log-line">
                <b style={{ color: 'var(--gg-text)' }}>{l.username || 'سیستم'}</b> — {l.action} — {fmtDateTime(l.created_at)}
              </p>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

