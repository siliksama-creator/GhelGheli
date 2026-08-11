import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Button, Card, Field, Input, Textarea } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

// فقط تنظیمات واقعیِ چت و SMS. بخش «ساخت استیکر تصویری» عمداً حذف شد:
// چت فعلی محصول پیام‌های آماده + emoji است و هیچ‌یک از دو کلاینت کاربر
// تصویر استیکر را نمایش/ارسال نمی‌کنند. نگه داشتنِ فرم قبلی هم URLهای خراب
// می‌ساخت و هم به مدیر وانمود می‌کرد قابلیتی زنده است.
export function SettingsPage({ request }) {
  const notify = useToast();
  const [chat, setChat] = useState({
    minLifetimePoints: 0,
    messageCooldownSeconds: 5,
    badWordsText: '',
  });
  const [sms, setSms] = useState({
    provider: '', sender: '', apiKey: '', patternCode: '',
    enabled: false, testMode: true,
  });
  const [savingChat, setSavingChat] = useState(false);
  const [savingSms, setSavingSms] = useState(false);

  useEffect(() => {
    request('/api/admin/settings/chat')
      .then(c => setChat({ ...c, badWordsText: (c.badWords || []).join('\n') }));
    request('/api/admin/settings/sms')
      .then(s => setSms({ ...s, apiKey: s.apiKeyMasked || '' }));
  }, [request]);

  async function saveChat(e) {
    e.preventDefault();
    setSavingChat(true);
    try {
      await request('/api/admin/settings/chat', {
        method: 'PATCH',
        body: {
          minLifetimePoints: Number(chat.minLifetimePoints) || 0,
          messageCooldownSeconds: Number(chat.messageCooldownSeconds) || 0,
          badWordsText: chat.badWordsText,
          reason: 'تنظیم از پنل وب',
        },
      });
      notify('تنظیمات چت ذخیره شد');
    } finally {
      setSavingChat(false);
    }
  }

  async function saveSms(e) {
    e.preventDefault();
    setSavingSms(true);
    try {
      await request('/api/admin/settings/sms', { method: 'PATCH', body: sms });
      notify('تنظیمات پیامک ذخیره شد');
    } finally {
      setSavingSms(false);
    }
  }

  return (
    <div className="card-grid cols-2">
      <Card title="تنظیمات چت کاربران" subtitle="جلوگیری از اسپم و کلمات نامناسب">
        <form onSubmit={saveChat}>
          <Field label="حداقل امتیاز تاریخی برای چت">
            <Input type="number" value={chat.minLifetimePoints || 0}
              onChange={e => setChat({ ...chat, minLifetimePoints: e.target.value })} />
          </Field>
          <Field label="فاصله بین پیام‌ها (ثانیه)">
            <Input type="number" value={chat.messageCooldownSeconds ?? 5}
              onChange={e => setChat({ ...chat, messageCooldownSeconds: e.target.value })} />
          </Field>
          <Field label="کلمات رکیک/ممنوعه؛ هر خط یک کلمه">
            <Textarea value={chat.badWordsText}
              onChange={e => setChat({ ...chat, badWordsText: e.target.value })} rows={4} />
          </Field>
          <Button type="submit" icon={Save} loading={savingChat} className="btn-block">
            ذخیره تنظیمات چت
          </Button>
        </form>
      </Card>

      <Card title="تنظیمات پنل SMS" subtitle="تا اتصال سرویس‌دهنده، SMS غیرفعال بماند">
        <form onSubmit={saveSms}>
          <Field label="نام سرویس‌دهنده">
            <Input value={sms.provider || ''}
              onChange={e => setSms({ ...sms, provider: e.target.value })} />
          </Field>
          <Field label="شماره / فرستنده">
            <Input value={sms.sender || ''}
              onChange={e => setSms({ ...sms, sender: e.target.value })} />
          </Field>
          <Field label="API Key">
            <Input value={sms.apiKey || ''}
              onChange={e => setSms({ ...sms, apiKey: e.target.value })} />
          </Field>
          <Field label="کد پترن / قالب">
            <Input value={sms.patternCode || ''}
              onChange={e => setSms({ ...sms, patternCode: e.target.value })} />
          </Field>
          <label className="checkbox-row">
            <input type="checkbox" checked={!!sms.enabled}
              onChange={e => setSms({ ...sms, enabled: e.target.checked })} />
            فعال‌سازی SMS
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={!!sms.testMode}
              onChange={e => setSms({ ...sms, testMode: e.target.checked })} />
            حالت تست
          </label>
          <Button type="submit" icon={Save} loading={savingSms}
            className="btn-block" style={{ marginTop: 8 }}>
            ذخیره SMS
          </Button>
        </form>
      </Card>
    </div>
  );
}
