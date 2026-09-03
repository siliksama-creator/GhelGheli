import { useEffect, useMemo, useState } from 'react';
import { Store, Plus, Save, Trash2, Pencil, ArrowUpDown } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, Input, Select, Table } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';
import { fmtNumber } from '../lib/api.js';

const KIND_LABEL = {
  club_badge: 'باشگاه',
  card_frame: 'قاب کارت',
  name_color: 'رنگ نام',
  profile_background: 'پس‌زمینهٔ پروفایل',
  emote_pack: 'پک ایموجی',
  profile_badge: 'نشان پروفایل',
  card_box: 'صندوق کارت',
};

const TIER_LABEL = { public: 'عمومی', plus: 'پلاس', annual: 'سالانه' };

/**
 * مدیریت کامل فروشگاه.
 *
 * تا امروز کاتالوگ فقط با مایگریشن SQL عوض می‌شد؛ حالا آیتم جدید،
 * قیمت، عکس، ترتیب و پلن‌های پلاس از همین صفحه ذخیره می‌شوند و
 * بلافاصله در اپ و وب کاربر می‌نشینند — بدون دپلوی.
 */
export function ShopAdminPage({ request }) {
  const notify = useToast();
  const [items, setItems] = useState([]);
  const [sales, setSales] = useState([]);
  const [plans, setPlans] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(null); // null | {} | item

  const load = () => {
    request('/api/admin/shop')
      .then((d) => {
        setItems(d.items || []);
        setSales(d.sales || []);
        setLoaded(true);
      })
      .catch((e) => notify(e.message || 'خواندن فروشگاه ناموفق بود', 'error'));
    request('/api/admin/shop/plus').then(setPlans).catch(() => {});
  };
  useEffect(load, [request]);

  const activeCount = useMemo(() => items.filter((i) => i.isActive).length, [items]);

  async function saveItem(e) {
    e.preventDefault();
    const form = e.target;
    const body = {
      kind: form.kind.value,
      slug: form.slug.value,
      name: form.name.value,
      description: form.description.value,
      imageUrl: form.imageUrl.value,
      payload: form.payload.value,
      price: Number(form.price.value),
      displayOrder: Number(form.displayOrder.value || 0),
      isActive: form.isActive.checked,
      accessTier: form.accessTier.value,
      isPurchasable: form.isPurchasable.checked,
    };
    try {
      if (editing?.id) {
        const r = await request(`/api/admin/shop/${editing.id}`, { method: 'PATCH', body });
        setItems((list) => list.map((i) => (i.id === editing.id ? r.item : i)));
        notify(r.message || 'آیتم ذخیره شد', 'success');
      } else {
        const r = await request('/api/admin/shop', { method: 'POST', body });
        setItems((list) => [...list, r.item]);
        notify(r.message || 'آیتم ساخته شد', 'success');
      }
      setEditing(null);
    } catch (err) {
      notify(err.message || 'ذخیره ناموفق بود', 'error');
    }
  }

  async function removeItem(item) {
    if (!window.confirm(`«${item.name}» حذف یا غیرفعال شود؟`)) return;
    try {
      const r = await request(`/api/admin/shop/${item.id}`, { method: 'DELETE' });
      notify(r.message, 'success');
      load();
    } catch (err) {
      notify(err.message || 'حذف ناموفق بود', 'error');
    }
  }

  async function savePlans(e) {
    e.preventDefault();
    const form = e.target;
    const body = {
      monthly: {
        price: Number(form.m_price.value),
        days: Number(form.m_days.value),
        label: form.m_label.value,
        savingPercent: Number(form.m_saving.value || 0),
      },
      annual: {
        price: Number(form.a_price.value),
        days: Number(form.a_days.value),
        label: form.a_label.value,
        savingPercent: Number(form.a_saving.value || 0),
      },
      // هر خط یک مزیت — همان‌طور که کلاینت‌ها لیست را نشان می‌دهند
      benefits: String(form.benefits?.value || '')
        .split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 30),
      annualBenefits: String(form.annualBenefits?.value || '')
        .split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 30),
    };
    try {
      const r = await request('/api/admin/shop/plus', { method: 'PATCH', body });
      setPlans(r);
      notify(r.message || 'پلن‌ها ذخیره شد', 'success');
    } catch (err) {
      notify(err.message || 'ذخیره پلن ناموفق بود', 'error');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // چرا key روی فرم اجباری است
  // ═══════════════════════════════════════════════════════════════════════
  //
  // فیلدها با defaultValue پر می‌شوند. React فقط در mount اول آن‌ها را
  // می‌گذارد. اگر ادمین «ویرایش بایرن» را باز کند و بعد بدون بستن،
  // «ویرایش صندوق» را بزند، state عوض می‌شود (عنوان درست می‌شود) ولی
  // inputها همان مقادیر بایرن را نگه می‌دارند — دقیقاً باگ اسکرین‌شات.
  //
  // key = id آیتم (یا 'new') فرم را از نو mount می‌کند تا defaultValue
  // با دادهٔ تازه هم‌خوان شود.
  const editorKey = editing == null ? null : (editing.id || editing.slug || 'new');
  const editor = editing !== null && (
    <Card
      key={`shop-editor-${editorKey}`}
      title={editing?.id ? `ویرایش «${editing.name || editing.slug || ''}»` : 'آیتم جدید'}
      subtitle="ذخیره یعنی همین حالا در فروشگاه اپ و وب دیده شود"
      action={<Button variant="ghost" onClick={() => setEditing(null)}>بستن</Button>}
    >
      <form
        key={`shop-form-${editorKey}`}
        onSubmit={saveItem}
        className="form-grid"
      >
        <Field label="نوع"><Select name="kind" defaultValue={editing?.kind || 'card_frame'}>
          {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select></Field>
        <Field label="شناسهٔ یکتا (انگلیسی)"
            hint="همان چیزی که در لینک‌ها و در دادهٔ خریدِ کاربران ثبت می‌شود؛ بعد از انتشار عوضش نکنید — نامِ نمایشی برای عوض‌کردن هست، شناسه نه."><Input name="slug" required defaultValue={editing?.slug || ''} placeholder="fire_frame" /></Field>
        <Field label="نام فارسی"><Input name="name" required defaultValue={editing?.name || ''} /></Field>
        <Field label="قیمت (تومان)"
            hint="همین عدد در اپ نشان داده و همان‌قدر هم از کیف پول کم می‌شود (بی‌تخفیفِ پنهان)؛ منفی مجاز نیست و سرور به ۰ می‌چسباندش."><Input name="price" type="number" min="0" required defaultValue={editing?.price ?? ''} /></Field>
        <Field label="ترتیب نمایش"
            hint="کوچک‌تر = بالاتر در شبکهٔ فروشگاه؛ فقط ترتیب را عوض می‌کند و رویِ قیمت یا دسترسی اثر ندارد."><Input name="displayOrder" type="number" defaultValue={editing?.displayOrder ?? items.length} /></Field>
        <Field label="مقدار/اثر (payload)"
            hint="همین رشته «اثرِ» آیتم است: برای قاب، طرح را می‌سازد و برای رنگِ نام، کدِ رنگ. اگر خالی بماند کلاینت به‌جایش شناسه را مصرف می‌کند."><Input name="payload" defaultValue={editing?.payload || ''} placeholder="برای رنگ نام: کد رنگ؛ برای باشگاه: همان slug" /></Field>
        <Field label="آدرس عکس"
            hint="مسیرِ نسبت‌به‌سایت از uploads/images شروع شود؛ پاک‌سازیِ فایل‌های یتیم فقط فایلِ بی‌ارجاع را می‌برد، پس این آدرس باید به فایلِ موجود برگردد."><Input name="imageUrl" defaultValue={editing?.imageUrl || ''} placeholder="/uploads/images/… یا آدرس کامل" /></Field>
        <Field label="توضیح"
            hint="زیرِ نامِ آیتم در فروشگاهِ کاربر چاپ می‌شود (وب و اندروید همان یک رشته را نشان می‌دهند)."><Input name="description" defaultValue={editing?.description || ''} /></Field>
        <Field label="دسترسی"
            hint="«فقط پلاس» و «پلاس سالانه» یعنی کاربرِ عادی آن را در فروشگاه نمی‌بیند، نه این‌که رایگان شده باشد. مقدارِ ناشناخته بی‌صدا «عمومی» می‌شود."><Select name="accessTier" defaultValue={editing?.accessTier || 'public'}>
          {Object.entries(TIER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select></Field>
        <label className="check-row"><input type="checkbox" name="isActive" defaultChecked={editing?.isActive !== false} /> فعال در فروشگاه</label>
        <label className="check-row"><input type="checkbox" name="isPurchasable" defaultChecked={editing?.isPurchasable !== false} /> قابل خرید</label>
        <Button type="submit" icon={Save}>{editing?.id ? 'ذخیره تغییرات' : 'ساخت آیتم'}</Button>
      </form>
    </Card>
  );

  return (
    <div className="page-stack">
      <Card title="فروشگاه" subtitle={`${items.length} آیتم · ${activeCount} فعال · کلاب‌ها خودکار از نوع «باشگاه» ساخته می‌شوند`}
        action={<Button icon={Plus} onClick={() => { setEditing({}); queueMicrotask(() => document.getElementById('shop-editor-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }}>آیتم جدید</Button>}>
        {!loaded ? <p>در حال خواندن…</p> : items.length === 0 ? (
          <EmptyState icon={Store} title="فروشگاه خالی است" message="اولین آیتم را بسازید." />
        ) : (
          <Table rows={items} cols={[
            { key: 'name', title: 'نام' },
            { key: 'kind', title: 'نوع', render: (r) => <Badge>{KIND_LABEL[r.kind] || r.kind}</Badge> },
            { key: 'price', title: 'قیمت', render: (r) => `${fmtNumber(r.price)} ت` },
            { key: 'soldCount', title: 'فروش', render: (r) => <Badge tone={r.soldCount ? 'success' : 'neutral'}>{r.soldCount}</Badge> },
            { key: 'isActive', title: 'وضعیت', render: (r) => <Badge tone={r.isActive ? 'success' : 'danger'}>{r.isActive ? 'فعال' : 'غیرفعال'}</Badge> },
            { key: 'actions', title: '', render: (r) => (
              <span className="row-actions">
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => { setEditing(r); queueMicrotask(() => document.getElementById('shop-editor-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }}>ویرایش</Button>
                <Button size="sm" variant="ghost" icon={Trash2} onClick={() => removeItem(r)}>حذف</Button>
              </span>
            ) },
          ]} />
        )}
      </Card>

      <div id="shop-editor-anchor">{editor}</div>

      <Card title="پلن‌های پلاس" subtitle="قیمت از همین لحظه روی سفارش‌های جدید اعمال می‌شود — کلاینت‌ها هر بار از سرور می‌خوانند">
        {!plans ? <p>در حال خواندن…</p> : (
          <form key={`plus-form-${plans?.monthly?.price}-${plans?.annual?.price}-${(plans?.benefits||[]).length}`} onSubmit={savePlans} className="form-grid">
            <Field label="قیمت ماهانه (تومان)"><Input name="m_price" type="number" required defaultValue={plans.monthly.price} /></Field>
            <Field label="مدت (روز)"><Input name="m_days" type="number" required defaultValue={plans.monthly.days} /></Field>
            <Field label="برچسب"><Input name="m_label" defaultValue={plans.monthly.label} /></Field>
            <Field label="درصد صرفه‌جویی" hint="فقط رویِ برچسبِ «حدود N٪ صرفه‌جویی» می‌نشیند و در محاسبهٔ قیمت کاری نمی‌کند؛ سرور آن را بینِ ۰ تا ۹۹ نگه می‌دارد و اگر خالی بماند کلاینت ۳۰ را نشان می‌دهد."><Input name="m_saving" type="number" defaultValue={plans.monthly.savingPercent} /></Field>
            <Field label="قیمت سالانه (تومان)"><Input name="a_price" type="number" required defaultValue={plans.annual.price} /></Field>
            <Field label="مدت (روز)"><Input name="a_days" type="number" required defaultValue={plans.annual.days} /></Field>
            <Field label="برچسب"><Input name="a_label" defaultValue={plans.annual.label} /></Field>
            <Field label="درصد صرفه‌جویی" hint="فقط رویِ برچسبِ «حدود N٪ صرفه‌جویی» می‌نشیند و در محاسبهٔ قیمت کاری نمی‌کند؛ سرور آن را بینِ ۰ تا ۹۹ نگه می‌دارد و اگر خالی بماند کلاینت ۳۰ را نشان می‌دهد."><Input name="a_saving" type="number" defaultValue={plans.annual.savingPercent} /></Field>
            <Field label="مزایای پلاس (هر خط یک مورد)"
            hint="زیرِ برچسبِ پلاس در اپ چاپ می‌شود؛ از خطِ ششم به بعد در پلنِ ماهانه و از دهم در سالانه نمایش داده نمی‌شود (برشِ خودِ کلاینت است، نه بی‌اعتناییِ پنل).">
              <textarea name="benefits" rows={5} defaultValue={(plans.benefits || []).join('\n')}
                style={{ width: '100%', borderRadius: 10, padding: 10, background: 'rgba(0,0,0,.25)', color: 'inherit', border: '1px solid rgba(255,255,255,.12)' }} />
            </Field>
            <Field label="مزایای اضافهٔ سالانه (هر خط یک مورد)">
              <textarea name="annualBenefits" rows={4} defaultValue={(plans.annualBenefits || []).join('\n')}
                style={{ width: '100%', borderRadius: 10, padding: 10, background: 'rgba(0,0,0,.25)', color: 'inherit', border: '1px solid rgba(255,255,255,.12)' }} />
            </Field>
            <Button type="submit" icon={Save}>ذخیره پلن‌ها</Button>
          </form>
        )}
      </Card>

      <Card title="فروش به تفکیک آیتم" subtitle="بر اساس خریدهای ثبت‌شده — درآمد برآوردی با قیمتِ پرداخت‌شده">
        {sales.length === 0 ? <p>هنوز خریدی ثبت نشده است.</p> : (
          <Table rows={sales} cols={[
            { key: 'name', title: 'آیتم' },
            { key: 'kind', title: 'نوع', render: (r) => <Badge>{KIND_LABEL[r.kind] || r.kind}</Badge> },
            { key: 'sold', title: 'تعداد' },
            { key: 'revenue', title: 'درآمد (تومان)', render: (r) => fmtNumber(r.revenue) },
          ]} />
        )}
      </Card>
    </div>
  );
}
