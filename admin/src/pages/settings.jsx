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
      // نامِ بستهٔ کافه‌بازار: اگر «لینک دانلود» خالی بماند، سرور لینک را
      // از همین می‌سازد. تا پیش از این، لینکِ پیش‌فرض داخلِ کدِ وب سفت بود
      // (`|| 'https://ghelghelishop.ir'`) و ادمین هیچ راهی برای عوضش نداشت.
      bazaarPackage: '',
    },
    announcement: { active: false, text: '', link: null, accent: 'gold' },
    features: {
      maintenance: { active: false, message: '' },
      games: { memory: true, tap: true, penalty: true, card_duel: true },
      wheel: true,
    },
  });
  const [savingClient, setSavingClient] = useState(false);
  const [gift, setGift] = useState({ enabled: false, points: 0, message: '' });
  const [savingGift, setSavingGift] = useState(false);

  useEffect(() => {
    request('/api/admin/settings/chat')
      .then(c => setChat({ ...c, badWordsText: (c.badWords || []).join('\n') }));
    request('/api/admin/settings/sms')
      .then(s => setSms({ ...s, apiKey: s.apiKeyMasked || '' }));
    request('/api/admin/settings/client-config').then(setClient);
    request('/api/admin/signup-gift').then(setGift).catch(() => {});
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

  async function saveGift(e) {
    e.preventDefault();
    setSavingGift(true);
    try {
      const r = await request('/api/admin/signup-gift', {
        method: 'PATCH',
        body: {
          enabled: gift.enabled,
          points: Number(gift.points) || 0,
          message: gift.message,
        },
      });
      setGift(r.settings || gift);
      notify(r.message || 'هدیهٔ عضویت ذخیره شد');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSavingGift(false);
    }
  }

  return (
    <div className="card-grid cols-2">
      <Card title="تنظیمات چت کاربران" subtitle="جلوگیری از اسپم و کلمات نامناسب">
        <form onSubmit={saveChat}>
          <Field label="حداقل امتیاز تاریخی برای چت"
              hint="سنجیده می‌شود روی «امتیازِ کلِ عمر» نه موجودیِ امروز؛ کاربرِ کم‌تر از این، پیامش رد می‌شود با همین جمله: «برای ارسال پیام باید حداقل N امتیاز تاریخی داشته باشید».">
            <Input type="number" value={chat.minLifetimePoints || 0}
              onChange={e => setChat({ ...chat, minLifetimePoints: e.target.value })} />
          </Field>
          <Field label="فاصله بین پیام‌ها (ثانیه)"
              hint="۰ = بدونِ محدودیت؛ اگر خالی بماند ۵ ثانیه در نظر گرفته می‌شود و منفی به ۰ می‌چسبد.">
            <Input type="number" value={chat.messageCooldownSeconds ?? 5}
              onChange={e => setChat({ ...chat, messageCooldownSeconds: e.target.value })} />
          </Field>
          <Field label="کلمات رکیک/ممنوعه؛ هر خط یک کلمه"
              hint="با ویرگول یا ویرگولِ فارسی هم جدا می‌شود؛ پیامِ شاملِ هرکدام رد می‌شود و برای کاربر نوشته می‌شود «پیام شامل کلمات غیرمجاز است».">
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
          <Field label="نام سرویس‌دهنده"
              hint="برچسبِ یادداشت است؛ مسیرِ ارسال را عوض نمی‌کند (همیشه کاوه‌نگار).">
            <Input value={sms.provider || ''}
              onChange={e => setSms({ ...sms, provider: e.target.value })} />
          </Field>
          <Field label="شماره / فرستنده"
              hint="شماره‌ای که در پنلِ کاوه‌نگار ثبت شده؛ اگر نخواند، پیامک کاربر نمی‌رسد و فقط در لاگ دیده می‌شود.">
            <Input value={sms.sender || ''}
              onChange={e => setSms({ ...sms, sender: e.target.value })} />
          </Field>
          <Field label="API Key"
              hint="اینجا نمی‌تواند خوانده شود و اگر خالی باشد، ارسالِ پیامک بی‌سروصدا «پیکربندی‌نشده» برمی‌گردد؛ یعنی هیچ OTP واقعی فرستاده نمی‌شود.">
            <Input value={sms.apiKey || ''}
              onChange={e => setSms({ ...sms, apiKey: e.target.value })} />
          </Field>
          <Field label="کد پترن / قالب"
              hint="نامِ قالبِ OTP در کاوه‌نگار؛ اگر خالی بماند `ghelgheli-otp` مصرف می‌شود.">
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
            <Field label="حداقل نسخهٔ اندروید"
              hint="کاربرِ نسخه‌هایِ پایین‌تر، دیالوگِ «برای ادامه باید آپدیت کنید» را می‌بیند؛ قالب: ۱٫۲٫۳.">
              <Input value={client.app.minVersion.android}
                onChange={e => setClient({ ...client, app: { ...client.app, minVersion: { ...client.app.minVersion, android: e.target.value } } })} />
            </Field>
            <Field label="حداقل نسخهٔ iOS"
              hint="همان قاعده برای iOS؛ اگر اصلاً نسخه‌ای ننویسید، هیچ کاربری بیرون نمی‌ماند.">
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
          <Field label="لینک دانلود اندروید (خالی = لینکِ کافه‌بازار ساخته می‌شود)">
            <Input value={client.app.updateUrl.android || ''}
              onChange={e => setClient({ ...client, app: { ...client.app, updateUrl: { ...client.app.updateUrl, android: e.target.value } } })} />
          </Field>
          {/* فیلدِ تازهٔ فاز ۴. برچسبش عمداً «نامِ بسته» است نه package ID و
              در توضیح هم گفته شده کِی اصلاً استفاده می‌شود — وگرنه مدیر
              فکر می‌کند باید هر دو را پر کند. */}
          <Field label="نامِ بستهٔ اپ در کافه‌بازار (برای ساختنِ لینک، وقتی لینکِ بالا خالی است)">
            <Input value={client.app.bazaarPackage || ''}
              placeholder="ir.ghelgheli.shop"
              onChange={e => setClient({ ...client, app: { ...client.app, bazaarPackage: e.target.value } })} />
          </Field>
          <Field label="متن اطلاعیه (خالی = غیرفعال)"
              hint="همان متن در نوارِ بالایِ اپِ وب و اندروید نشسته و در `live_copy` هم قابلِ ویرایش است — این یکی برای «امشب» است، آن یکی برای متنِ همیشگی.">
            <Textarea rows={2} value={client.announcement.text || ''}
              onChange={e => setClient({ ...client, announcement: { ...client.announcement, text: e.target.value } })} />
          </Field>
          <Field label="لینک اطلاعیه (اختیاری)">
            <Input value={client.announcement.link || ''}
              onChange={e => setClient({ ...client, announcement: { ...client.announcement, link: e.target.value } })} />
          </Field>
          <Field label="چیدمان تب‌ها (ترتیب idها با ویرگول — خالی = پیش‌فرض)"
              hint="هر idِ ناشناخته بی‌صدا دور ریخته می‌شود؛ اگر همه بی‌اعتبار باشند، ترتیبِ پیش‌فرض برمی‌گردد.">
            <Input
              dir="ltr"
              value={(client.tabOrder || []).join(', ')}
              placeholder="home, rewards, league, social, shop, inventory, wallet, invite, support, profile"
              onChange={e => setClient({
                ...client,
                tabOrder: e.target.value.split(',').map(x => x.trim()).filter(Boolean),
              })} />
          </Field>
          <Field label="رنگ بنر اطلاعیه"
              hint="فقط یکی از رنگ‌هایِ همین فهرست مصرف می‌شود؛ نوشتنِ رنگِ دلخواه اینجا ممکن نیست و پیش‌فرض «طلایی» می‌ماند.">
            <select className="input" value={client.announcement.accent || 'gold'}
              onChange={e => setClient({ ...client, announcement: { ...client.announcement, accent: e.target.value } })}>
              <option value="gold">طلایی</option>
              <option value="green">سبز</option>
              <option value="blue">آبی</option>
              <option value="orange">نارنجی</option>
            </select>
          </Field>
          <Button type="submit" icon={Save} loading={savingClient}
            className="btn-block" style={{ marginTop: 8 }}>
            ذخیره تنظیمات اپ
          </Button>
        </form>
      </Card>

      <Card title="حالت تعمیر و خاموشی بازی‌ها"
        subtitle="بدون انتشار نسخهٔ جدید. سرور join را رد می‌کند؛ کلاینت‌های تازه کاشی را نشان نمی‌دهند.">
        <form onSubmit={saveClientConfig}>
          <label className="checkbox-row">
            <input type="checkbox" checked={!!client.features?.maintenance?.active}
              onChange={e => setClient({
                ...client,
                features: {
                  ...client.features,
                  maintenance: { ...(client.features?.maintenance || {}), active: e.target.checked },
                },
              })} />
            حالت تعمیر — ورود به بازی و گردونه بسته شود
          </label>
          <Field label="پیام حالت تعمیر (برای کاربر)"
              hint="همان جمله‌ای که کاربر هنگام ورود یا چرخشِ گردونه می‌بیند؛ کلیدِ خاموش/روشن کردنش در همین‌جا است، نه در فایلِ سرور.">
            <Input value={client.features?.maintenance?.message || ''}
              onChange={e => setClient({
                ...client,
                features: {
                  ...client.features,
                  maintenance: { ...(client.features?.maintenance || {}), message: e.target.value },
                },
              })} />
          </Field>
          <div style={{ display: 'grid', gap: 6, margin: '10px 0' }}>
            {[
              ['tap', 'ضربه‌زن'],
              ['penalty', 'ضربات پنالتی'],
              ['card_duel', 'دوئل کارت‌ها'],
              ['memory', 'جفت‌یاب'],
            ].map(([id, label]) => (
              <label key={id} className="checkbox-row">
                <input type="checkbox"
                  checked={client.features?.games?.[id] !== false}
                  onChange={e => setClient({
                    ...client,
                    features: {
                      ...client.features,
                      games: { ...(client.features?.games || {}), [id]: e.target.checked },
                    },
                  })} />
                {label} فعال باشد
              </label>
            ))}
            <label className="checkbox-row">
              <input type="checkbox" checked={client.features?.wheel !== false}
                onChange={e => setClient({
                  ...client,
                  features: { ...client.features, wheel: e.target.checked },
                })} />
              گردونه فعال باشد
            </label>
          </div>
          <Button type="submit" icon={Save} loading={savingClient} className="btn-block">
            ذخیره خاموشی‌ها
          </Button>
        </form>
      </Card>

      <Card title="هدیهٔ امتیاز عضویت"
        subtitle="از لحظهٔ ذخیره، هر کاربر تازه همین مقدار را می‌گیرد. پیش‌فرض خاموش است تا نصب تازه بی‌دعوت امتیاز پخش نکند.">
        <form onSubmit={saveGift}>
          <label className="checkbox-row">
            <input type="checkbox" checked={!!gift.enabled}
              onChange={e => setGift({ ...gift, enabled: e.target.checked })} />
            هدیهٔ عضویت فعال باشد
          </label>
          <Field label="امتیاز خوش‌آمدگویی"
              hint="فقط در لحظهٔ ساختنِ حسابِ تازه پرداخت می‌شود؛ عوض‌کردنش به حساب‌هایِ قبلی چیزی اضافه یا از آن‌ها کم نمی‌کند.">
            <Input type="number" min="0" max="1000000" value={gift.points || 0}
              onChange={e => setGift({ ...gift, points: e.target.value })} />
          </Field>
          <Field label="متن پیام (در دفتر امتیاز ثبت می‌شود)"
              hint="در ستونِ «توضیح»ِ دفترِ امتیازِ کاربر چاپ می‌شود؛ اگر خالی بماند متنِ پیش‌فرضِ سرور ثبت می‌شود.">
            <Input value={gift.message || ''}
              onChange={e => setGift({ ...gift, message: e.target.value })} />
          </Field>
          <Button type="submit" icon={Save} loading={savingGift} className="btn-block">
            ذخیره هدیهٔ عضویت
          </Button>
        </form>
      </Card>
    </div>
  );
}
