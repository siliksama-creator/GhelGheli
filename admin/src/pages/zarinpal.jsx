// تنظیمِ درگاه زرین‌پال — زنده برای وب و اندروید
//
// مرچنت‌کد «رمز» نیست و در خودِ دیتابیس به‌صورت تنظیمِ ممیزی‌شده نگه
// داشته می‌شود. فعال‌سازی بدون UUID معتبر از سمت سرور رد می‌شود؛ بنابراین
// یک اشتباهِ تایپی هیچ‌وقت دکمهٔ خرید را نیمه‌فعال نمی‌کند.
import { useEffect, useState } from 'react';
import { CreditCard, RefreshCw, Save, ShieldCheck, TestTube2 } from 'lucide-react';
import { Badge, Button, Card, Field, Input } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

const EMPTY = { enabled: false, sandbox: false, merchantId: '' };

export function ZarinPalPage({ request, isSuperAdmin }) {
  const notify = useToast();
  const [settings, setSettings] = useState(EMPTY);
  const [orders, setOrders] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = async () => {
    try {
      const d = await request('/api/admin/payments/zarinpal');
      setSettings({ ...EMPTY, ...(d.settings || {}) });
      setOrders(Array.isArray(d.orders) ? d.orders : []);
      setLoaded(true);
    } catch (e) {
      notify(e.message || 'خواندن تنظیمات زرین‌پال ناموفق بود', 'error');
    }
  };
  useEffect(() => { load(); }, [request]);

  const save = async (e) => {
    e.preventDefault();
    if (!isSuperAdmin) return;
    setSaving(true);
    try {
      const d = await request('/api/admin/payments/zarinpal', {
        method: 'PUT',
        body: settings,
      });
      setSettings({ ...EMPTY, ...(d.settings || settings) });
      notify(d.message || 'تنظیمات زرین‌پال ذخیره شد');
    } catch (err) {
      notify(err.message || 'ذخیرهٔ تنظیمات ناموفق بود', 'error');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (!isSuperAdmin) return;
    setTesting(true);
    try {
      const d = await request('/api/admin/payments/zarinpal/test', { method: 'POST' });
      notify(d.ok ? d.message : (d.message || 'اتصال برقرار نشد'), d.ok ? 'success' : 'error');
    } catch (e) {
      notify(e.message || 'تست اتصال ناموفق بود', 'error');
    } finally {
      setTesting(false);
    }
  };

  const count = (status) => orders.find((x) => x.status === status)?.count || 0;

  if (!loaded) return <Card title="درگاه زرین‌پال"><p className="topbar-sub">در حال بارگذاری…</p></Card>;

  return (
    <div style={{ display: 'grid', gap: 14 }} dir="rtl">
      <Card
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><CreditCard size={20} /> درگاه زرین‌پال</span>}
        subtitle="یک تنظیم برای وب و اندروید؛ بعد از ذخیره، کلاینت‌ها از /api/config وضعیت تازه را می‌خوانند و اپ نیاز به انتشار دوباره ندارد."
        action={settings.enabled && settings.merchantId
          ? <Badge tone="success">فعال</Badge>
          : <Badge tone="warning">غیرفعال</Badge>}
      >
        <form onSubmit={save}>
          <Field label="مرچنت‌کد زرین‌پال (UUID)"
            hint="از پنل زرین‌پال کپی کن؛ سرور فقط UUID معتبر را قبول می‌کند. این مقدار کلید اتصال است، نه رمز عبور.">
            <Input
              dir="ltr"
              value={settings.merchantId || ''}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              disabled={!isSuperAdmin}
              onChange={(e) => setSettings({ ...settings, merchantId: e.target.value.trim() })}
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label className="checkbox-row">
              <input type="checkbox" checked={!!settings.enabled} disabled={!isSuperAdmin}
                onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
              پرداخت زرین‌پال در وب و اندروید فعال باشد
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={!!settings.sandbox} disabled={!isSuperAdmin}
                onChange={(e) => setSettings({ ...settings, sandbox: e.target.checked })} />
              حالت آزمایشی زرین‌پال
            </label>
          </div>
          <div className="card-grid cols-2" style={{ marginTop: 10 }}>
            <div className="field-hint" style={{ padding: 10, borderRadius: 10, background: 'rgba(56,189,248,.08)' }}>
              <b>کال‌بک خودکار:</b><br />
              <code dir="ltr">/api/payments/zarinpal/callback</code><br />
              مبلغِ تأیید از سفارشِ سرور خوانده می‌شود؛ مبلغِ URL قابل اعتماد نیست.
            </div>
            <div className="field-hint" style={{ padding: 10, borderRadius: 10, background: 'rgba(34,231,166,.08)' }}>
              <b>تحویل امن:</b><br />
              بعد از verify زرین‌پال، سفارش فقط یک‌بار از pending به paid می‌رود و تحویل کالا/پلاس داخل همان تراکنش انجام می‌شود.
            </div>
          </div>
          {isSuperAdmin && <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <Button type="submit" icon={Save} loading={saving}>ذخیره و اعمالِ زنده</Button>
            <Button type="button" variant="secondary" icon={TestTube2} loading={testing}
              onClick={test} disabled={!settings.enabled || !settings.merchantId}>
              تست اتصال بدون خرید واقعی
            </Button>
            <Button type="button" variant="ghost" icon={RefreshCw} onClick={load}>تازه‌سازی</Button>
          </div>}
          {!isSuperAdmin && <p className="topbar-sub" style={{ marginTop: 12 }}>این بخش برای مشاهده است؛ فقط مدیرکل می‌تواند درگاه را تغییر دهد.</p>}
        </form>
      </Card>

      <Card title="وضعیت سفارش‌های زرین‌پال" subtitle="این جدول فقط شمارش وضعیت‌هاست؛ جزئیات خرید در سابقهٔ خرید کاربر باقی می‌ماند.">
        <div className="card-grid cols-3">
          <div><Badge tone="warning">در انتظار: {String(count('pending'))}</Badge></div>
          <div><Badge tone="success">موفق: {String(count('paid'))}</Badge></div>
          <div><Badge>ناموفق/لغوشده: {String(count('failed'))}</Badge></div>
        </div>
      </Card>

      <Card title="نکتهٔ مهم قبل از فعال‌سازی" subtitle="چون کال‌بک باید از اینترنت به سرور برسد">
        <p style={{ margin: 0, lineHeight: 1.9, fontSize: 13 }}>
          در پنل زرین‌پال، آدرس دامنهٔ اصلی/API را طبق راهنمای همان حساب ثبت کن. سرور قلقلی کال‌بک را خودش برای هر خرید می‌سازد و پس از برگشت، هم وب و هم اندروید نتیجه را می‌گیرند. تا وقتی مرچنت‌کد واقعی وارد نشود، دکمه‌های زرین‌پال عمداً فعال نمی‌شوند.
        </p>
        <p className="topbar-sub" style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 0 }}>
          <ShieldCheck size={16} /> پرداخت لغوشده تحویل نمی‌شود؛ کال‌بک تکراری هم تحویل دوباره ندارد.
        </p>
      </Card>
    </div>
  );
}
