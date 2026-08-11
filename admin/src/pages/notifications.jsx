import { useState, useEffect } from 'react';
import { Megaphone, Clock, ShieldAlert } from 'lucide-react';
import { Button, Card, Field, Input, Textarea } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

export function NotificationsPage({ request }) {
  const notify = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [segment, setSegment] = useState('all');
  const [force, setForce] = useState(false);
  const [sending, setSending] = useState(false);
  const [tehranHour, setTehranHour] = useState(new Date().getHours());
  const [pushStatus, setPushStatus] = useState(null);

  useEffect(() => {
    try {
      const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', hour: 'numeric', hour12: false }).format(new Date()));
      setTehranHour(h);
    } catch {}
    request('/api/admin/notifications/status')
      .then(setPushStatus)
      .catch(() => setPushStatus({ fcmConfigured: false }));
  }, [request]);

  const isDaytime = tehranHour >= 10 && tehranHour < 22;

  async function send(e) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return notify('عنوان و متن را وارد کنید', 'error');
    setSending(true);
    try {
      const r = await request('/api/admin/notifications/send-segmented', {
        method: 'POST',
        body: { segment, title: title.trim(), body: body.trim(), force }
      });
      notify(r.message || 'اعلان هدفمند ارسال شد', 'success');
      setTitle('');
      setBody('');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="stack-lg" style={{ maxWidth: 580 }}>
      <Card
        title="استودیوی اعلان‌های هدفمند (بخش‌بندی کاربران)"
        subtitle="ارسال نوتیفیکیشن با رعایت ساعت تهران (۱۰:۰۰ تا ۲۲:۰۰) جهت حفظ رضایت و عدم ایجاد مزاحمت شبانه."
      >
        <div style={{
          padding: '10px 14px',
          borderRadius: 12,
          background: isDaytime ? 'rgba(34, 197, 94, 0.12)' : 'rgba(245, 158, 11, 0.14)',
          border: `1px solid ${isDaytime ? '#22C55E' : '#F59E0B'}`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 16
        }}>
          <Clock size={18} color={isDaytime ? '#22C55E' : '#F59E0B'} />
          <div style={{ fontSize: 12.5 }}>
            <b>ساعت فعلی تهران: {tehranHour}:00</b> — {isDaytime ? 'ساعت مجاز ارسال روزانه (۱۰ تا ۲۲) ✅' : 'ساعت شبانه (ارسال در صورت لزوم نیاز به تیک اجباری دارد) ⚠️'}
          </div>
        </div>

        {pushStatus && (
          <div style={{
            padding: '9px 12px', marginBottom: 14, borderRadius: 12,
            background: pushStatus.fcmConfigured ? 'rgba(34,197,94,.12)' : 'rgba(245,158,11,.14)',
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5,
          }}>
            <ShieldAlert size={17} />
            {pushStatus.fcmConfigured
              ? 'Firebase فعال است: اعلان درون‌برنامه‌ای و پوش ارسال می‌شود.'
              : 'Firebase فعال نیست: فقط اعلان درون‌برنامه‌ای ثبت می‌شود.'}
          </div>
        )}

        <form onSubmit={send} className="stack">
          <Field label="گروه هدف (سگمنت کاربران)">
            <select className="input" value={segment} onChange={e => setSegment(e.target.value)}>
              <option value="all">👥 همه کاربران فعال</option>
              <option value="inactive_3d">💤 کاربران غایب ۳ روز اخیر (یادآوری بازگشت)</option>
              <option value="top20_league">🏆 ۲۰ نفر اول جدول لیگ (رقابت داغ)</option>
              <option value="near_cash_reward">💰 کاربران نزدیک به جایزه نقدی (کمتر از ۱۰۰ امتیاز)</option>
              <option value="plus_users">⭐ کاربران دارای اشتراک پلاس</option>
              <option value="free_users">🎁 کاربران بدون اشتراک پلاس (تخفیف و ارتقا)</option>
            </select>
          </Field>

          <Field label="عنوان اعلان">
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="مثلاً: جایزه این هفته در انتظار شماست!" />
          </Field>

          <Field label="متن پیام">
            <Textarea value={body} onChange={e => setBody(e.target.value)} rows={4} placeholder="متن اعلان را بنویسید..." />
          </Field>

          {!isDaytime && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#F59E0B', cursor: 'pointer' }}>
              <input type="checkbox" checked={force} onChange={e => setForce(e.target.checked)} />
              ارسال اجباری در ساعات شبانه
            </label>
          )}

          <Button type="submit" icon={Megaphone} loading={sending} className="btn-block">
            ارسال به گروه هدف
          </Button>
        </form>
      </Card>
    </div>
  );
}
