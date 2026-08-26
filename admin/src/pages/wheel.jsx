import { useEffect, useMemo, useState } from 'react';
import { CircleDot, Plus, Save, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Field, Input, Select } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

const KIND_LABEL = {
  points: 'امتیاز',
  cash: 'نقدی (تومان)',
  card_box: 'صندوق کارت',
  shop_item: 'آیتم فروشگاه',
  plus_days: 'روز پلاس',
};

const DEFAULT_COLORS = [
  '#84CC16', '#F59E0B', '#22D3EE', '#A855F7', '#38BDF8',
  '#F43F5E', '#FBBF24', '#FDE68A', '#FB7185', '#34D399',
];

function pctOf(weight, total) {
  const t = Number(total) || 0;
  if (t <= 0) return 0;
  return Math.round((Number(weight || 0) * 100 / t) * 1e5) / 1e5;
}
function weightOf(percent, total) {
  return Math.round(Number(percent || 0) * Number(total || 0) / 100);
}
function fmtPct(p) {
  const n = Number(p) || 0;
  if (n <= 0) return '۰';
  if (n >= 1) return (Math.round(n * 10) / 10).toLocaleString('fa-IR');
  if (n >= 0.01) return (Math.round(n * 100) / 100).toLocaleString('fa-IR');
  return n.toLocaleString('fa-IR', { maximumFractionDigits: 5 });
}

/**
 * ویرایشگر گردونه — ظاهر و درون.
 *
 * کلاینت‌های کاربر برش‌ها را از GET /api/wheel می‌خوانند (اندروید با
 * Canvas، وب با گرادیان زنده). پس عوض کردن برچسب/رنگ همین‌جا، بدون
 * انتشار نسخهٔ جدید روی گردونهٔ کاربر می‌نشیند.
 */
export function WheelAdminPage({ request }) {
  const notify = useToast();
  const [prizes, setPrizes] = useState([]);
  const [shopItems, setShopItems] = useState([]);
  const [weightTotal, setWeightTotal] = useState(10_000_000);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = () => {
    request('/api/admin/wheel/prizes')
      .then((d) => {
        setPrizes((d.prizes || []).map((p) => ({
          ...p,
          isActive: p.isActive !== false,
        })));
        setShopItems(d.shopItems || []);
        setWeightTotal(d.weightTotal || 10_000_000);
        setLoaded(true);
      })
      .catch((e) => notify(e.message || 'خواندن گردونه ناموفق بود', 'error'));
  };
  useEffect(load, [request]);

  const activeWeight = useMemo(
    () => prizes.filter((p) => p.isActive).reduce((s, p) => s + Number(p.weight || 0), 0),
    [prizes],
  );
  const remaining = weightTotal - activeWeight;
  const weightOk = remaining === 0 && prizes.filter((p) => p.isActive).length >= 2;

  function setPrize(i, patch) {
    setPrizes((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }

  function addSlice() {
    const nextOrder = prizes.reduce((m, p) => Math.max(m, Number(p.sliceOrder) || 0), 0) + 1;
    setPrizes((ps) => [...ps, {
      id: null,
      label: 'جایزه تازه',
      kind: 'points',
      value: 100,
      weight: Math.max(0, remaining),
      sliceOrder: nextOrder,
      color: DEFAULT_COLORS[ps.length % DEFAULT_COLORS.length],
      isActive: true,
      itemSlug: null,
    }]);
  }

  function removeSlice(i) {
    setPrizes((ps) => ps.filter((_, j) => j !== i));
  }

  async function save() {
    if (!weightOk) {
      notify('جمع شانس برش‌های فعال باید دقیقاً ۱۰۰٪ باشد', 'error');
      return;
    }
    setSaving(true);
    try {
      const d = await request('/api/admin/wheel/prizes', {
        method: 'PUT',
        body: { prizes },
      });
      setPrizes((d.prizes || []).map((p) => ({ ...p, isActive: p.isActive !== false })));
      notify(d.message || 'ذخیره شد');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <Card title="گردونهٔ شانس"><p className="topbar-sub">در حال بارگذاری...</p></Card>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CircleDot size={20} /> محتوای گردونه
          </h2>
          <p className="topbar-sub">
            برچسب، رنگ، نوع جایزه و شانس همین حالا روی اپ و وب می‌نشیند.
            جمع شانس برش‌های فعال باید دقیقاً ۱۰۰٪ باشد.
          </p>
        </div>
        <Button onClick={save} disabled={saving || !weightOk}>
          <Save size={15} /> {saving ? 'در حال ذخیره…' : 'ذخیرهٔ گردونه'}
        </Button>
      </div>

      <Card
        title="جمع شانس"
        action={weightOk
          ? <Badge tone="success">سالم</Badge>
          : <Badge tone="warning">نخواند</Badge>}
      >
        <p style={{ margin: 0, fontSize: 13 }}>
          فعال: <b>{fmtPct(pctOf(activeWeight, weightTotal))}٪</b>
          {' · '}هدف: <b>۱۰۰٪</b>
          {' · '}باقی: <b style={{ color: remaining === 0 ? 'var(--gg-success)' : 'var(--gg-danger)' }}>
            {fmtPct(pctOf(remaining, weightTotal))}٪
          </b>
        </p>
        <p className="topbar-sub" style={{ marginTop: 6 }}>
          اگر باقی منفی است شانس یکی را کم کن. اگر مثبت است به یکی اضافه کن.
          نرمال‌سازی خودکار نداریم — یک صفرِ جاافتاده می‌تواند جایزهٔ بزرگ را صد برابر کند.
        </p>
        <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', fontSize: 12 }}>
          {prizes.filter((p) => p.isActive).map((p) => {
            const pct = pctOf(p.weight, weightTotal);
            return (
              <li key={p.id || p.sliceOrder} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color }} />
                <span style={{ flex: 1 }}>{p.label}</span>
                <b>{fmtPct(pct)}٪</b>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="پیش‌نمایش برش‌ها" subtitle="همان چیزی که کاربر روی گردونه می‌بیند — رنگ و برچسب زنده است.">
        <WheelPreview prizes={prizes.filter((p) => p.isActive)} weightTotal={weightTotal} />
      </Card>

      {prizes.map((p, i) => (
        <Card
          key={p.id || `new-${i}`}
          title={`برش ${p.sliceOrder} — ${p.label || 'بدون نام'}`}
          action={p.isActive ? <Badge tone="success">فعال</Badge> : <Badge>خاموش</Badge>}
        >
          <div className="card-grid cols-3" style={{ gap: 10 }}>
            <Field label="برچسب (روی گردونه)">
              <Input value={p.label || ''} maxLength={64}
                onChange={(e) => setPrize(i, { label: e.target.value })} />
            </Field>
            <Field label="نوع جایزه">
              <Select value={p.kind} onChange={(e) => {
                const kind = e.target.value;
                setPrize(i, {
                  kind,
                  value: kind === 'points' ? 100
                    : kind === 'cash' ? 10000
                      : kind === 'plus_days' ? 7 : 1,
                  itemSlug: kind === 'shop_item'
                    ? (p.itemSlug || shopItems[0]?.slug || null) : null,
                });
              }}>
                {Object.entries(KIND_LABEL).map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </Select>
            </Field>
            <Field label="رنگ برش">
              <Input type="color" value={p.color || '#84CC16'}
                onChange={(e) => setPrize(i, { color: e.target.value })} />
            </Field>
            {p.kind === 'shop_item' ? (
              <Field label="آیتم فروشگاه">
                <Select value={p.itemSlug || ''}
                  onChange={(e) => setPrize(i, { itemSlug: e.target.value })}>
                  <option value="">— انتخاب —</option>
                  {shopItems.map((it) => (
                    <option key={it.slug} value={it.slug}>{it.name}</option>
                  ))}
                </Select>
              </Field>
            ) : (
              <Field label={p.kind === 'cash' ? 'مبلغ (تومان)'
                : p.kind === 'plus_days' ? 'تعداد روز'
                  : p.kind === 'card_box' ? 'تعداد صندوق' : 'مقدار امتیاز'}>
                <Input type="number" min="1"
                  value={p.value}
                  onChange={(e) => setPrize(i, { value: Number(e.target.value) || 0 })} />
              </Field>
            )}
            <Field label="شانس (٪)">
              <Input type="number" min="0" max="100" step="0.00001"
                value={pctOf(p.weight, weightTotal)}
                onChange={(e) => setPrize(i, { weight: weightOf(e.target.value, weightTotal) })} />
            </Field>
            <Field label="ترتیب برش">
              <Input type="number" min="1" max="24"
                value={p.sliceOrder}
                onChange={(e) => setPrize(i, { sliceOrder: Number(e.target.value) || 1 })} />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={Boolean(p.isActive)}
                onChange={(e) => setPrize(i, { isActive: e.target.checked })} />
              این برش روی گردونه باشد
            </label>
            <Button variant="ghost" size="sm" onClick={() => removeSlice(i)}>
              <Trash2 size={14} /> حذف از فهرست
            </Button>
          </div>
        </Card>
      ))}

      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="ghost" onClick={addSlice}><Plus size={15} /> افزودن برش</Button>
        <Button onClick={save} disabled={saving || !weightOk}>
          <Save size={15} /> {saving ? 'در حال ذخیره…' : 'ذخیرهٔ همه'}
        </Button>
      </div>
    </div>
  );
}

function WheelPreview({ prizes, weightTotal }) {
  if (!prizes.length) {
    return <p className="topbar-sub">هیچ برش فعالی نیست.</p>;
  }
  const total = Number(weightTotal) || prizes.reduce((s, p) => s + Number(p.weight || 0), 0);
  const n = prizes.length;
  const stops = prizes.map((p, i) => {
    const a0 = (i / n) * 360;
    const a1 = ((i + 1) / n) * 360;
    return `${p.color || '#84CC16'} ${a0}deg ${a1}deg`;
  }).join(', ');
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{
        width: 160, height: 160, borderRadius: '50%',
        background: `conic-gradient(from -90deg, ${stops})`,
        border: '4px solid #F59E0B',
        boxShadow: 'inset 0 0 0 28px #0B1220',
      }} />
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 12 }}>
        {prizes.map((p) => (
          <li key={p.id || p.sliceOrder} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: p.color }} />
            {p.label} · {KIND_LABEL[p.kind] || p.kind} · {fmtPct(p.weight)}٪
          </li>
        ))}
      </ul>
    </div>
  );
}
