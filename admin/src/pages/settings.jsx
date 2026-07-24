import { useEffect, useState } from 'react';
import { Save, Smile, Sparkles } from 'lucide-react';
import { assetUrl } from '../lib/api.js';
import { Button, Card, DataRow, Field, Input, Select, Textarea } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

export function SettingsPage({ request }) {
  const notify = useToast();
  const [chat, setChat] = useState({ minLifetimePoints: 0, messageCooldownSeconds: 5, badWordsText: '' });
  const [sms, setSms] = useState({ provider: '', sender: '', apiKey: '', patternCode: '', enabled: false, testMode: true });
  const [stickers, setStickers] = useState([]);
  const [stickerForm, setStickerForm] = useState({ title: '', type: 'static', image: '' });
  const [stickerFile, setStickerFile] = useState(null);
  const [savingChat, setSavingChat] = useState(false);
  const [savingSms, setSavingSms] = useState(false);
  const [savingSticker, setSavingSticker] = useState(false);

  const loadStickers = () => request('/api/admin/chat/stickers').then(setStickers);

  useEffect(() => {
    request('/api/admin/settings/chat').then((c) => setChat({ ...c, badWordsText: (c.badWords || []).join('\n') }));
    request('/api/admin/settings/sms').then((s) => setSms({ ...s, apiKey: s.apiKeyMasked || '' }));
    loadStickers();
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

  async function addSticker(e) {
    e.preventDefault();
    setSavingSticker(true);
    try {
      let imageUrl = stickerForm.image;
      if (stickerFile) imageUrl = await request.uploadImage(stickerFile);
      await request('/api/admin/chat/stickers', { method: 'POST', body: { title: stickerForm.title, imageUrl, stickerType: stickerForm.type } });
      setStickerForm({ title: '', type: 'static', image: '' });
      setStickerFile(null);
      notify('استیکر اضافه شد');
      loadStickers();
    } finally {
      setSavingSticker(false);
    }
  }

  return (
    <div className="card-grid cols-2">
      <Card title="تنظیمات چت کاربران" subtitle="جلوگیری از اسپم و کلمات نامناسب">
        <form onSubmit={saveChat}>
          <Field label="حداقل امتیاز تاریخی برای چت">
            <Input type="number" value={chat.minLifetimePoints || 0} onChange={(e) => setChat({ ...chat, minLifetimePoints: e.target.value })} />
          </Field>
          <Field label="فاصله بین پیام‌ها (ثانیه)">
            <Input type="number" value={chat.messageCooldownSeconds ?? 5} onChange={(e) => setChat({ ...chat, messageCooldownSeconds: e.target.value })} />
          </Field>
          <Field label="کلمات رکیک/ممنوعه؛ هر خط یک کلمه">
            <Textarea value={chat.badWordsText} onChange={(e) => setChat({ ...chat, badWordsText: e.target.value })} rows={4} />
          </Field>
          <Button type="submit" icon={Save} loading={savingChat} className="btn-block">
            ذخیره تنظیمات چت
          </Button>
        </form>
      </Card>

      <Card title="تنظیمات پنل SMS">
        <form onSubmit={saveSms}>
          <Field label="نام سرویس‌دهنده">
            <Input value={sms.provider || ''} onChange={(e) => setSms({ ...sms, provider: e.target.value })} />
          </Field>
          <Field label="شماره / فرستنده">
            <Input value={sms.sender || ''} onChange={(e) => setSms({ ...sms, sender: e.target.value })} />
          </Field>
          <Field label="API Key">
            <Input value={sms.apiKey || ''} onChange={(e) => setSms({ ...sms, apiKey: e.target.value })} />
          </Field>
          <Field label="کد پترن / قالب">
            <Input value={sms.patternCode || ''} onChange={(e) => setSms({ ...sms, patternCode: e.target.value })} />
          </Field>
          <label className="checkbox-row">
            <input type="checkbox" checked={!!sms.enabled} onChange={(e) => setSms({ ...sms, enabled: e.target.checked })} />
            فعال‌سازی SMS
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={!!sms.testMode} onChange={(e) => setSms({ ...sms, testMode: e.target.checked })} />
            حالت تست
          </label>
          <Button type="submit" icon={Save} loading={savingSms} className="btn-block" style={{ marginTop: 8 }}>
            ذخیره SMS
          </Button>
        </form>
      </Card>

      <Card title="استیکرهای چت" subtitle="استیکرهایی که کاربران می‌توانند در چت روم استفاده کنند" className="span-2">
        <form onSubmit={addSticker} style={{ marginBottom: 16 }}>
          <div className="field-row">
            <Field label="نام استیکر">
              <Input value={stickerForm.title} onChange={(e) => setStickerForm({ ...stickerForm, title: e.target.value })} />
            </Field>
            <Field label="نوع">
              <Select value={stickerForm.type} onChange={(e) => setStickerForm({ ...stickerForm, type: e.target.value })}>
                <option value="static">ثابت</option>
                <option value="animated">متحرک</option>
              </Select>
            </Field>
          </div>
          <Field label="فایل استیکر">
            <div className="file-field">
              <Input placeholder="یا آدرس فایل" value={stickerForm.image} onChange={(e) => setStickerForm({ ...stickerForm, image: e.target.value })} />
              <label className="btn btn-secondary btn-icon" style={{ cursor: 'pointer' }}>
                <Sparkles size={16} />
                <input type="file" accept="image/*,.gif,.webp" hidden onChange={(e) => setStickerFile(e.target.files?.[0] || null)} />
              </label>
            </div>
          </Field>
          <Button type="submit" icon={Smile} loading={savingSticker} className="btn-block">
            افزودن استیکر
          </Button>
        </form>
        {stickers.map((st) => (
          <DataRow key={st.id} thumb={<img className="thumb" src={assetUrl(st.image_url)} alt="" />} title={st.title} subtitle={st.sticker_type} />
        ))}
      </Card>
    </div>
  );
}
