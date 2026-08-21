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

  // ── تنظیمات اپ (بدون آپدیت) ────────────────────────────────────────
  const [client, setClient] = useState({
    app: {
      minVersion: { android: '1.1.17', ios: '1.1.17' },
      forceUpdate: { android: false, ios: false },
      updateUrl: { android: '', ios: '' },
    },
    announcement: { active: false, text: '', link: null, accent: 'gold' },
  });
  const [savingClient, setSavingClient] = useState(false);

  useEffect(() => {
    request('/api/admin/settings/chat')
      .then(c => setChat({ ...c, badWordsText: (c.badWords || []).join('\n') }));
    request('/api/admin/settings/sms')
      .then(s => setSms({ ...s, apiKey: s.apiKeyMasked || '' }));
    request('/api/admin/settings/client-config').then(setClient);
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

  async function saveClientConfig(e) {
    e.preventDefault();
    setSavingClient(true);
    try {
      const saved = await request('/api/admin/settings/client-config', {
        method: 'PATCH',
        body: {
          ...client,
          announcement: {
            ...client.announcement,
            active: String(client.announcement.text || '').trim().length > 0,
          },
        },
      });
      setClient(saved);
      notify('تنظیمات اپ ذخیره شد — بدون آپدیت اعمال می‌شود');
    } finally {
      setSavingClient(false);
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

      {/* تنظیمات اپ — از /api/config خوانده می‌شود؛ بدون نیاز به آپدیت */}
      <Card title="تنظیمات اپ (بدون آپدیت)"
        subtitle="نسخهٔ حداقلی اندروید + بنر اطلاعیه — کلاینت‌ها در هر اجرا از /api/config می‌خوانند">
        <form onSubmit={saveClientConfig}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="حداقل نسخهٔ اندروید">
              <Input value={client.app.minVersion.android}
                onChange={e => setClient({ ...client, app: { ...client.app, minVersion: { ...client.app.minVersion, android: e.target.value } } })} />
            </Field>
            <Field label="حداقل نسخهٔ iOS">
              <Input value={client.app.minVersion.ios}
                onChange={e => setClient({ ...client, app: { ...client.app, minVersion: { ...client.app.minVersion, ios: e.target.value } } })} />
            </Field>
          </div>
          <label className="checkbox-row">
            <input type="checkbox" checked={!!client.app.forceUpdate.android}
              onChange={e => setClient({ ...client, app: { ...client.app, forceUpdate: { ...client.app.forceUpdate, android: e.target.checked } } })} />
            آپدیت اندروید اجباری باشد
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={!!client.app.forceUpdate.ios}
              onChange={e => setClient({ ...client, app: { ...client.app, forceUpdate: { ...client.app.forceUpdate, ios: e.target.checked } } })} />
            آپدیت iOS اجباری باشد
          </label>
          <Field label="لینک دانلود اندروید (اختیاری)">
            <Input value={client.app.updateUrl.android || ''}
              onChange={e => setClient({ ...client, app: { ...client.app, updateUrl: { ...client.app.updateUrl, android: e.target.value } } })} />
          </Field>
          <Field label="متن اطلاعیه (خالی = غیرفعال)">
            <Textarea rows={2} value={client.announcement.text || ''}
              onChange={e => setClient({ ...client, announcement: { ...client.announcement, text: e.target.value } })} />
          </Field>
          <Field label="لینک اطلاعیه (اختیاری)">
            <Input value={client.announcement.link || ''}
              onChange={e => setClient({ ...client, announcement: { ...client.announcement, link: e.target.value } })} />
          </Field>
          <Button type="submit" icon={Save} loading={savingClient}
            className="btn-block" style={{ marginTop: 8 }}>
            ذخیره تنظیمات اپ
          </Button>
        </form>
      </Card>
    </div>
  );
}
