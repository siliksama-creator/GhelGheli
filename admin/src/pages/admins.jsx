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
  const [logTotal, setLogTotal] = useState(0);
  const [logQ, setLogQ] = useState('');
  const [logDetail, setLogDetail] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', role: 'support' });
  const [saving, setSaving] = useState(false);

  const loadLogs = (q = logQ) => {
    const qs = new URLSearchParams({ limit: '50' });
    if (q.trim()) qs.set('q', q.trim());
    request(`/api/admin/audit-log?${qs}`)
      .then(d => {
        setLogs(Array.isArray(d) ? d : (d?.entries ?? []));
        setLogTotal(Array.isArray(d) ? d.length : (d?.total ?? 0));
      });
  };

  const load = () => {
    request('/api/admin/admins').then(setAdmins);
    loadLogs();
  };
  useEffect(load, [request]);

  async function openLog(id) {
    try {
      setLogDetail(await request(`/api/admin/audit-log/${id}`));
    } catch (err) {
      notify(err.message, 'error');
    }
  }

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
      <Card title="ادمین جدید" subtitle="نقش «پشتیبان» فقط تیکت‌ها را می‌بیند؛ بقیهٔ صفحه‌ها مخصوص سوپرادمین است">
        <form onSubmit={add}>
          <Field label="نام کاربری"
              hint="در دفترِ رخدادها کنارِ هر تغییرِ شما ثبت می‌شود («چه کسی این عدد را عوض کرد»)؛ نامِ اشتباه یعنی ردپایِ اشتباه.">
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          </Field>
          <Field label="رمز عبور"
              hint="برای حسابِ مدیر هیچ طولی در سرور چک نمی‌شود (برخلافِ حسابِ کاربر که ۶ تا ۷۲ نویسه لازم دارد)؛ خودتان مراقب باشید.">
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </Field>
          <Field label="نقش"
              hint="«مدیر کل» همه‌چیز را می‌بیند؛ «پشتیبان» فقط تیکت و چند صفحهٔ محدود؛ «ناظر» چیزی را نمی‌تواند عوض کند. بیشترِ صفحه‌هایِ این پنل فقط برای مدیر کل باز است.">
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

      <Card title="گزارش فعالیت (Audit Log)" subtitle={logTotal ? `${logTotal} رخداد` : 'جست‌وجو روی عمل، کاربر و دلیل'}>
        <div className="field-row" style={{ marginBottom: 12 }}>
          <Input
            value={logQ}
            onChange={(e) => setLogQ(e.target.value)}
            placeholder="جست‌وجو: عمل، کاربر، دلیل"
            onKeyDown={(e) => e.key === 'Enter' && loadLogs(logQ)}
          />
          <Button variant="secondary" icon={History} onClick={() => loadLogs(logQ)} style={{ flex: '0 0 auto' }}>
            جستجو
          </Button>
        </div>
        {logs.length === 0 ? (
          <EmptyState icon={History} title="رویدادی ثبت نشده" />
        ) : (
          <div style={{ maxHeight: 460, overflowY: 'auto' }}>
            {logs.slice(0, 80).map((l) => (
              <button
                key={l.id}
                type="button"
                className="log-line"
                onClick={() => l.has_detail && openLog(l.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'start',
                  background: 'transparent', border: 0, color: 'inherit',
                  cursor: l.has_detail ? 'pointer' : 'default', padding: '4px 0',
                }}
              >
                <b style={{ color: 'var(--gg-text)' }}>{l.username || 'سیستم'}</b> — {l.action}
                {l.reason ? ` — ${l.reason}` : ''} — {fmtDateTime(l.created_at)}
              </button>
            ))}
          </div>
        )}
        {logDetail && (
          <pre style={{
            marginTop: 12, padding: 12, borderRadius: 10, overflow: 'auto',
            background: 'rgba(0,0,0,.35)', fontSize: 11, direction: 'ltr', textAlign: 'left',
          }}>
            {JSON.stringify(logDetail.metadata || logDetail, null, 2)}
          </pre>
        )}
      </Card>
    </div>
  );
}

