import { useEffect, useState } from 'react';
import { Coins, KeyRound, MessageSquareText, Search, ShieldOff, UserRoundSearch } from 'lucide-react';
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

    async function grantPlus(id) {
    const days = await promptText({
      title: 'اعطای اشتراک قلقلی پلاس',
      description: 'مدت زمان اشتراک پلاس بر حسب روز را وارد کنید.',
      placeholder: 'تعداد روز (مثلاً ۳۰ یا ۹۰)',
      type: 'number',
    });
    if (!days) return;
    const r = await request(`/api/admin/users/${id}/grant-plus`, {
      method: 'POST',
      body: { days: Number(days) || 30, reason: 'اعطای دستی توسط مدیریت' },
    });
    notify(r?.message || 'اشتراک پلاس برای کاربر فعال شد');
    load();
  }

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

  // Since the SMS gateway isn't active yet, users can't reset a forgotten
  // password themselves via OTP. Support can set a temporary password here
  // after verifying the user's identity by phone/in person — every use is
  // recorded in the audit log.
  async function resetPassword(id) {
    const pw = await promptText({
      title: 'تنظیم رمز موقت برای کاربر',
      description: 'چون پیامک هنوز فعال نیست، کاربر نمی‌تواند رمز را خودش بازیابی کند. فقط بعد از احراز هویت کاربر (تماس تلفنی و ...) این کار را انجام دهید.',
      placeholder: 'رمز جدید (حداقل ۶ کاراکتر)',
      type: 'text',
    });
    if (!pw) return;
    if (pw.length < 6) return notify('رمز باید حداقل ۶ کاراکتر باشد');
    await request(`/api/admin/users/${id}/reset-password`, { method: 'POST', body: { newPassword: pw, reason: 'بازیابی رمز توسط پشتیبانی' } });
    notify('رمز عبور کاربر تغییر کرد؛ رمز جدید را به او اطلاع دهید');
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
                {/* لولِ بازیکن — مدیر باید همان چیزی را ببیند که کاربر
                    می‌بیند. بدون این، پشتیبانی نمی‌تواند به سؤالِ
                    «چرا لولم بالا نرفت» جواب دهد، و حسابِ مشکوک
                    (لولِ خیلی بالا در چند روز) قابل تشخیص نیست. */}
                {u.level !== undefined && u.level !== null && (
                  <span
                    title={`لول ${u.level}`}
                    style={{
                      fontSize: 11,
                      fontWeight: 900,
                      padding: '1px 6px',
                      borderRadius: 6,
                      direction: 'ltr',
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--gg-info)',
                      border: '1px solid var(--gg-info)',
                      background: 'color-mix(in srgb, var(--gg-info) 12%, transparent)',
                    }}
                  >
                    Lv {u.level}
                  </span>
                )}
                <span style={{ fontSize: 12.5, color: 'var(--gg-text-muted)' }}>{fmtNumber(u.current_points)} امتیاز</span>
                <Badge tone={u.status === 'active' ? 'success' : 'danger'}>{u.status === 'active' ? 'فعال' : 'مسدود'}</Badge>
              </div>
            }
            actions={
              <>
                <Button size="sm" variant="secondary" icon={Coins} onClick={() => changePoints(u.id)}>
                  امتیاز
                </Button>
                <Button size="sm" variant="secondary" onClick={() => grantPlus(u.id)}>
                  اعطای پلاس
                </Button>
                <Button size="sm" variant="secondary" icon={MessageSquareText} onClick={() => privateMessage(u.id)}>
                  پیام
                </Button>
                <Button size="sm" variant="secondary" icon={KeyRound} onClick={() => resetPassword(u.id)}>
                  بازیابی رمز
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

