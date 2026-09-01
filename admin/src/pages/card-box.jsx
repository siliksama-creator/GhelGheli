import { useEffect, useMemo, useState } from 'react';
import { History, Package, Save, RotateCcw } from 'lucide-react';
import { Badge, Button, Card, Field, Input } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';
import { fmtNumber } from '../lib/api.js';

const ACCENT = {
  normal: '#34D399',
  silver: '#E5EEF8',
  gold: '#FFD166',
  premium: '#38BDF8',
  legend: '#F97316',
};

const DEFAULT_ODDS = {
  normal: 409,
  silver: 306,
  gold: 153,
  premium: 122,
  legend: 10,
};

/**
 * مدیریت کامل صندوق کارتِ فروشگاه: شانس، قیمت، سوییچ فروش و تاریخچه.
 *
 * هر تغییری که اینجا ذخیره شود، بدون انتشار نسخهٔ جدید، روی فروشگاه وب
 * و اندروید می‌نشیند — کلاینت‌های کاربر عدد را از GET /api/card-box/overview
 * می‌خوانند.
 */
export function CardBoxAdminPage({ request }) {
  const notify = useToast();
  const [odds, setOdds] = useState([]);
  const [price, setPrice] = useState(100000);
  const [enabled, setEnabled] = useState(true);
  const [weightTotal, setWeightTotal] = useState(1000);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [purchases, setPurchases] = useState(null);

  // تاریخچهٔ خریدِ صندوق — همان جدولی که کاربر در اپ می‌بیند، با نام و
  // شمارهٔ پوشیده برای پنل.
  const loadPurchases = () => {
    request('/api/admin/card-box/purchases?limit=50')
      .then((d) => setPurchases(d.purchases || []))
      .catch(() => setPurchases([]));
  };

  const load = () => {
    request('/api/admin/card-box')
      .then((d) => {
        setOdds(d.odds || []);
        setPrice(Number(d.price || 100000));
        setEnabled(d.enabled !== false);
        setWeightTotal(Number(d.weightTotal || 1000));
        setLoaded(true);
      })
      .catch((e) => notify(e.message || 'خواندن شانس صندوق ناموفق بود', 'error'));
  };
  useEffect(load, [request]);
  useEffect(loadPurchases, [request]);

  const sum = useMemo(
    () => odds.reduce((s, o) => s + Number(o.permille || 0), 0),
    [odds],
  );
  const remaining = weightTotal - sum;
  const weightOk = remaining === 0 && odds.length === 5;

  function setRow(rarity, permille) {
    const n = Math.max(0, Math.min(weightTotal, Math.trunc(Number(permille) || 0)));
    setOdds((list) => list.map((o) => (o.rarity === rarity
      ? { ...o, permille: n, percent: Math.round((n / weightTotal) * 1000) / 10 }
      : o)));
  }

  async function save() {
    if (!weightOk) {
      notify('جمع شانس‌ها باید دقیقاً ۱۰۰٪ باشد', 'error');
      return;
    }
    setSaving(true);
    try {
      const d = await request('/api/admin/card-box', {
        method: 'PUT',
        body: { odds, price, enabled },
      });
      setOdds(d.odds || odds);
      setPrice(Number(d.price || price));
      notify(d.message || 'ذخیره شد');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <Card title="صندوق کارت"><p className="topbar-sub">در حال بارگذاری...</p></Card>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Package size={20} /> صندوق کارت فروشگاه
          </h2>
          <p className="topbar-sub">
            شانس هر کلاس، قیمت صندوق و روشن/خاموش‌کردن فروش. هر تغییری که
            ذخیره کنید همان لحظه روی فروشگاه کاربران می‌نشیند — بدون آپدیتِ اپ.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={() => {
            setOdds((list) => list.map((o) => {
              const n = DEFAULT_ODDS[o.rarity] ?? o.permille;
              return { ...o, permille: n, percent: Math.round((n / weightTotal) * 1000) / 10 };
            }));
          }}>
            <RotateCcw size={15} /> پیش‌فرض تولید
          </Button>
          <Button onClick={save} disabled={saving || !weightOk}>
            <Save size={15} /> {saving ? 'در حال ذخیره…' : 'ذخیرهٔ همه'}
          </Button>
        </div>
      </div>

      <Card
        title="وضعیت فروش صندوق"
        action={enabled
          ? <Badge tone="success">فروش باز است</Badge>
          : <Badge tone="warning">فروش بسته است</Badge>}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span style={{ fontWeight: 700 }}>کاربران می‌توانند صندوق بخرند</span>
        </label>
        <p className="topbar-sub" style={{ marginTop: 8 }}>
          وقتی خاموش باشد، خریدِ صندوق در فروشگاه وب و اندروید به‌طور کامل
          بسته می‌شود و پیام «فروش موقتاً غیرفعال است» را می‌بینند — حتی
          اگر کسی دکمهٔ کهنه‌ای را بزند، سرور سفارش نمی‌سازد. برای تعمیر
          یا تغییر قیمت، همین‌جا خاموشش کنید و بعد از ذخیره روشن.
        </p>
      </Card>

      <Card
        title="جمع شانس"
        action={weightOk
          ? <Badge tone="success">سالم</Badge>
          : <Badge tone="warning">نخواند</Badge>}
      >
        <p style={{ margin: 0, fontSize: 13 }}>
          مجموع: <b>{fmtNumber(sum / 10)}٪</b>
          {' · '}هدف: <b>۱۰۰٪</b>
          {' · '}باقی: <b style={{ color: remaining === 0 ? 'var(--gg-success)' : 'var(--gg-danger)' }}>
            {fmtNumber(remaining / 10)}٪
          </b>
        </p>
        <p className="topbar-sub" style={{ marginTop: 6 }}>
          اگر باقی منفی است یکی را کم کن. اگر مثبت است به یکی اضافه کن.
          یک صفرِ جاافتاده می‌تواند لجند را از صندوق حذف کند.
        </p>
      </Card>

      <Card title="قیمت صندوق" subtitle="قیمت به تومان — همان عددی که کاربر در فروشگاه می‌بیند (هم با کیف پول، هم با پرداخت کافه‌بازار).">
        <Field label="قیمت (تومان)" hint="مثلاً ۱۰۰۰۰۰ یعنی صندوق صد هزار تومان است.">
          <Input type="number" min="1" max="10000000" value={price}
            onChange={(e) => setPrice(Number(e.target.value) || 0)} />
        </Field>
      </Card>

      {odds.map((o) => {
        const accent = ACCENT[o.rarity] || '#94A3B8';
        const empty = Number(o.catalogueCount || 0) === 0;
        return (
          <Card
            key={o.rarity}
            title={o.label}
            action={empty
              ? <Badge tone="warning">بدون کارت زنده</Badge>
              : <Badge>{fmtNumber(o.catalogueCount)} کارت</Badge>}
          >
            <div className="card-grid cols-3" style={{ gap: 10 }}>
              <Field label="درصد شانس" hint="درصد کلاس — اعشار هم قبول است (مثلاً ۱٫۵).">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={Number.isFinite(o.percent) ? o.percent : 0}
                  onChange={(e) => setRow(o.rarity, Math.round(Number(e.target.value) * 10))}
                />
              </Field>
              <Field label="در هزار (دقیق)" hint="عدد اصلی ذخیره‌شده: از هر ۱۰۰۰ صندوق چند تا از این کلاس.">
                <Input
                  type="number"
                  min="0"
                  max={weightTotal}
                  value={o.permille}
                  onChange={(e) => setRow(o.rarity, e.target.value)}
                />
              </Field>
              <div style={{ alignSelf: 'end', paddingBottom: 8 }}>
                <div style={{
                  height: 10, borderRadius: 99, background: 'rgba(255,255,255,.08)', overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${Math.min(100, o.percent || 0)}%`,
                    height: '100%',
                    background: accent,
                  }} />
                </div>
                <p className="topbar-sub" style={{ margin: '6px 0 0', color: accent }}>
                  {fmtNumber(o.percent)}٪ · {o.label}
                </p>
              </div>
            </div>
            {empty && (
              <p className="topbar-sub" style={{ marginTop: 8, color: 'var(--gg-warning, #FBBF24)' }}>
                هیچ کارت فعالی در این کلاس نیست. وزنش موقع باز شدن بین بقیه پخش می‌شود.
              </p>
            )}
          </Card>
        );
      })}

      <div style={{ display: 'flex', gap: 8 }}>
        <Button onClick={save} disabled={saving || !weightOk}>
          <Save size={15} /> {saving ? 'در حال ذخیره…' : 'ذخیرهٔ همه'}
        </Button>
      </div>

      <Card
        title="خریدهای اخیر صندوق"
        subtitle="۵۰ صندوقِ آخر با نامِ کاربر و خلاصهٔ کارت‌های هر صندوق — همان تاریخچه‌ای که کاربر در اپ می‌بیند."
        action={<Button size="sm" variant="secondary" onClick={loadPurchases}><History size={13} /> تازه‌سازی</Button>}
      >
        {!purchases ? <p className="topbar-sub">در حال بارگذاری…</p>
          : !purchases.length ? <p className="topbar-sub">هنوز خریدی ثبت نشده است.</p>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ textAlign: 'right', color: 'rgba(255,255,255,.55)' }}>
                    <th style={{ padding: '6px 8px' }}>کاربر</th>
                    <th style={{ padding: '6px 8px' }}>شماره</th>
                    <th style={{ padding: '6px 8px' }}>مبلغ</th>
                    <th style={{ padding: '6px 8px' }}>امتیاز</th>
                    <th style={{ padding: '6px 8px' }}>کارت‌ها</th>
                    <th style={{ padding: '6px 8px' }}>تاریخ</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.id} style={{ borderTop: '1px solid rgba(255,255,255,.07)' }}>
                      <td style={{ padding: '7px 8px', fontWeight: 700 }}>{p.nickname}</td>
                      <td style={{ padding: '7px 8px', direction: 'ltr', textAlign: 'right', color: 'rgba(255,255,255,.6)' }}>{p.mobile}</td>
                      <td style={{ padding: '7px 8px', color: '#FFD166', fontWeight: 700 }}>{fmtNumber(p.pricePaid)}</td>
                      <td style={{ padding: '7px 8px', color: '#A3E635' }}>{fmtNumber(p.points)}</td>
                      <td style={{ padding: '7px 8px' }}>
                        <span style={{ display: 'inline-flex', gap: 4 }}>
                          {(p.cards || []).map((c, i) => (
                            <span key={i} title={`${c.name} · ${c.rarity}`} style={{
                              width: 12, height: 12, borderRadius: 4, display: 'inline-block',
                              background: ACCENT[c.rarity] || '#94A3B8',
                            }} />
                          ))}
                        </span>
                      </td>
                      <td style={{ padding: '7px 8px' }}>
                        {new Date(p.createdAt).toLocaleDateString('fa-IR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </div>
  );
}
