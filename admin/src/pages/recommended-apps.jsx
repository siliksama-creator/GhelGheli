import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown, ArrowUp, Image as ImageIcon, Link2, Pencil, Plus, Smartphone, Trash2, Eye, EyeOff, Upload, X,
} from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, IconButton, Input, Select, Textarea } from '../components/ui.jsx';
import { assetUrl } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * برنامه‌های پیشنهادی — پنل ادمین
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * خواستهٔ مالک (۲۶ شهریور):
 *
 *   «یک قسمت برنامهٔ پیشنهادی در قسمت (بیشتر) وب و اندروید که از پنل ادمین
 *    مدیریت بشه؛ در صورتی که ادمین تیک فعال رو زد، این قسمت در اپلیکیشن و
 *    وب‌سایت نمایش داده بشه. ادمین می‌تونه برنامه یا سایت معرفی کنه با لینکِ
 *    دانلود یا لینکِ ورود به وب‌سایت، به همراه عکس و توضیحات.»
 *
 * ── سه ستونِ این صفحه ─────────────────────────────────────────────────────
 *
 *   ۱. **تیکِ کلی** — تا نخورده باشد، هیچ‌جای محصول (نه ردیفِ منو، نه صفحه)
 *      چیزی از این بخش نمی‌بیند. خاموش‌کردن، محتوا را پاک نمی‌کند.
 *   ۲. **فرمِ افزودن/ویرایش** — عنوان، توضیح، لینک، نوع (برنامه/وب‌سایت)،
 *      عکس (آپلودِ مستقیم)، و تیکِ فعالِ همان ردیف.
 *   ۳. **فهرست** — همان کادرهایی که کاربر می‌بیند، به‌علاوهٔ دکمه‌های
 *      بالا/پایین برای ترتیب، تیکِ خاموشِ تک‌ردیفی، ویرایش و حذف.
 *
 * ── چرا اینجا پیش‌نمایشِ زنده هست ─────────────────────────────────────────
 *
 * مالک چند بار گفته «پنل کار نمی‌کند» — و در همهٔ آن موارد، پنل کار می‌کرد
 * ولی نتیجه‌اش را نمی‌شد دید. پس کادرِ پیش‌نمایش عیناً همان کادرِ کاربر است؛
 * ادمین قبل از ذخیره می‌بیند چه چیزی به دستِ کاربر می‌رسد.
 *
 * ⚠️ سقف‌های عنوان/توضیح (۶۰/۴۰۰) همان‌هایی‌اند که سرور اعتبارسنجی می‌کند.
 *    اگر اینجا کمتر بود، کاربر بابت چیزی که ادمین نوشته بود سرزنش می‌شد؛
 *    اگر بیشتر بود، متن بی‌خبر بریده می‌شد. گاردِ
 *    `backend/scripts/testRecommendedApps.js` همین هم‌راستایی را می‌سنجد.
 */
const EMPTY_FORM = {
  id: null, title: '', description: '', linkUrl: '', kind: 'app', imageUrl: '', isActive: true,
};

export function RecommendedAppsPage({ request }) {
  const notify = useToast();
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageFile, setImageFile] = useState(null);
  const [preview, setPreview] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await request('/api/admin/recommended-apps');
      setItems(Array.isArray(data?.items) ? data.items : []);
      setActive(data?.active !== false);
    } catch (e) {
      notify(e.message || 'خطا در خواندن فهرست', 'error');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // پیش‌نمایشِ عکس: تا وقتی فایل آپلود نشده، همان فایلِ محلی را نشان می‌دهیم
  // تا ادمین بدونِ ذخیره‌کردن ببیند عکسش درست است.
  useEffect(() => {
    if (!imageFile) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(imageFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const editing = form.id != null;
  const thumb = preview || (form.imageUrl ? assetUrl(form.imageUrl) : '');

  const counts = useMemo(() => ({
    total: items.length,
    on: items.filter((i) => i.isActive).length,
  }), [items]);

  async function toggleVisibility(next) {
    setActive(next);   // خوش‌بینانه: تیک فوری حس شود، بعد تأییدِ سرور
    try {
      const out = await request('/api/admin/recommended-apps/visibility', {
        method: 'POST', body: { active: next },
      });
      setActive(out?.active !== false);
      notify(next ? 'بخش در اپ و وب نمایش داده می‌شود' : 'بخش از اپ و وب پنهان شد');
    } catch (e) {
      setActive(!next);
      notify(e.message || 'ذخیره نشد', 'error');
    }
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      let imageUrl = form.imageUrl;
      if (imageFile) imageUrl = await request.uploadImage(imageFile);
      const body = {
        title: form.title, description: form.description, linkUrl: form.linkUrl,
        kind: form.kind, imageUrl, isActive: form.isActive,
      };
      if (editing) {
        await request(`/api/admin/recommended-apps/${form.id}`, { method: 'PUT', body });
        notify('تغییرات ذخیره شد');
      } else {
        await request('/api/admin/recommended-apps', { method: 'POST', body });
        notify('برنامه اضافه شد');
      }
      setForm(EMPTY_FORM);
      setImageFile(null);
      await load();
    } catch (err) {
      notify(err.message || 'ذخیره نشد', 'error');
    } finally { setSaving(false); }
  }

  async function toggleItem(item) {
    setBusyId(item.id);
    try {
      await request(`/api/admin/recommended-apps/${item.id}`, {
        method: 'PUT',
        body: { title: item.title, description: item.description, linkUrl: item.linkUrl, kind: item.kind, imageUrl: item.imageUrl, isActive: !item.isActive },
      });
      await load();
    } catch (e) { notify(e.message || 'ذخیره نشد', 'error'); } finally { setBusyId(null); }
  }

  async function move(item, direction) {
    setBusyId(item.id);
    try {
      await request(`/api/admin/recommended-apps/${item.id}/move`, { method: 'POST', body: { direction } });
      await load();
    } catch (e) { notify(e.message || 'جابه‌جا نشد', 'error'); } finally { setBusyId(null); }
  }

  async function remove(item) {
    if (!window.confirm(`«${item.title}» حذف شود؟ این کار برگشت‌پذیر نیست.`)) return;
    setBusyId(item.id);
    try {
      await request(`/api/admin/recommended-apps/${item.id}`, { method: 'DELETE' });
      if (form.id === item.id) { setForm(EMPTY_FORM); setImageFile(null); }
      notify('حذف شد');
      await load();
    } catch (e) { notify(e.message || 'حذف نشد', 'error'); } finally { setBusyId(null); }
  }

  function startEdit(item) {
    setForm({
      id: item.id, title: item.title, description: item.description || '',
      linkUrl: item.linkUrl, kind: item.kind, imageUrl: item.imageUrl || '', isActive: item.isActive !== false,
    });
    setImageFile(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title"><Smartphone size={20} /> برنامه‌های پیشنهادی</h1>
        <p className="page-sub">
          کادرهای معرفیِ برنامه/سایت که در بخشِ «بیشتر» اپ اندروید و وب‌سایت دیده می‌شوند —
          بدونِ نیاز به انتشار نسخهٔ تازه. هر تغییر همین حالا برای کاربران اعمال می‌شود.
        </p>
      </div>

      {/* ═════════════ تیکِ کلی ═════════════ */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 700 }}>
            <input type="checkbox" checked={active} onChange={(e) => toggleVisibility(e.target.checked)} />
            نمایش این بخش در اپ اندروید و وب‌سایت
          </label>
          <Badge tone={active ? 'success' : 'neutral'}>{active ? 'روشن' : 'خاموش'}</Badge>
          <span style={{ color: 'var(--gg-muted)', fontSize: 12 }}>
            {counts.on} برنامهٔ فعال از {counts.total}
          </span>
        </div>
        <p className="field-hint" style={{ marginTop: 8 }}>
          اگر خاموش باشد، نه ردیفش در «بیشتر» دیده می‌شود و نه صفحه‌اش بارگذاری می‌شود.
          محتوایی که ثبت کرده‌ای پاک نمی‌شود؛ با یک تیک برمی‌گردد.
        </p>
      </Card>

      {/* ═════════════ فرم ═════════════ */}
      <Card
        title={editing ? `ویرایش «${form.title || '...'}»` : 'افزودن برنامه یا سایت'}
        subtitle="عنوان و لینک اجباری‌اند؛ عکس و توضیح، کادر را کامل‌تر می‌کنند."
        action={editing ? (
          <Button variant="ghost" onClick={() => { setForm(EMPTY_FORM); setImageFile(null); }}>
            <X size={15} /> انصراف از ویرایش
          </Button>
        ) : null}
      >
        <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <Field label="عنوان (حداکثر ۶۰ حرف)">
              <Input value={form.title} maxLength={60} required
                placeholder="مثلاً: برنامهٔ تلگرام"
                onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="نوع">
              <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="app">برنامه (لینک دانلود از استور یا سایت)</option>
                <option value="website">وب‌سایت (لینک ورود به سایت)</option>
              </Select>
            </Field>
          </div>

          <Field label="لینک (باید با http:// یا https:// شروع شود)"
            hint="کاربر با زدنِ دکمهٔ کارت، همین آدرس را باز می‌کند.">
            <Input value={form.linkUrl} required dir="ltr" placeholder="https://example.com/app"
              onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} />
          </Field>

          <Field label="توضیح (حداکثر ۴۰۰ حرف)">
            <Textarea value={form.description} rows={3} maxLength={400}
              placeholder="در یک یا دو خط بگو چرا این برنامه را پیشنهاد می‌کنی."
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', alignItems: 'start' }}>
            <Field label="عکس یا لوگو" hint="PNG/JPG/WEBP/GIF — مربعی بهترین نتیجه را می‌دهد.">
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
                {(imageFile || form.imageUrl) && (
                  <Button variant="ghost" onClick={() => { setImageFile(null); setForm({ ...form, imageUrl: '' }); }}>
                    <Trash2 size={14} /> حذفِ عکس
                  </Button>
                )}
              </div>
              {!imageFile && (
                <Input style={{ marginTop: 8 }} dir="ltr" value={form.imageUrl}
                  placeholder="/uploads/images/... یا آدرس کامل"
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
              )}
            </Field>

            {/* پیش‌نمایشِ کادرِ کاربر — همان چیزی که در «بیشتر» دیده می‌شود */}
            <div>
              <span className="field" style={{ display: 'block', marginBottom: 6 }}>
                <span>پیش‌نمایش کارت کاربر</span>
              </span>
              <div style={{
                display: 'flex', gap: 10, alignItems: 'center', padding: 10,
                border: '1px dashed var(--gg-border, #334155)', borderRadius: 14,
              }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14, overflow: 'hidden', flexShrink: 0,
                  background: 'rgba(148,163,184,0.15)', display: 'grid', placeItems: 'center',
                }}>
                  {thumb
                    ? <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <ImageIcon size={20} />}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800 }}>{form.title || 'عنوان برنامه'}</div>
                  <div style={{ color: 'var(--gg-muted)', fontSize: 12 }}>
                    {form.description || 'توضیحِ کوتاه اینجا دیده می‌شود'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            فعال باشد (در فهرستِ کاربران دیده شود)
          </label>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button type="submit" loading={saving}>
              {editing ? <><Pencil size={15} /> ذخیرهٔ تغییرات</> : <><Plus size={15} /> افزودن</>}
            </Button>
            {imageFile && <Badge tone="info"><Upload size={12} /> عکس هنگامِ ذخیره آپلود می‌شود</Badge>}
          </div>
        </form>
      </Card>

      {/* ═════════════ فهرست ═════════════ */}
      <Card title="فهرستِ برنامه‌ها" subtitle="ترتیبِ همین فهرست، ترتیبِ نمایش به کاربر است.">
        {loading && <p style={{ color: 'var(--gg-muted)' }}>در حال بارگذاری…</p>}
        {!loading && items.length === 0 && (
          <EmptyState icon={Smartphone} title="هنوز برنامه‌ای اضافه نشده"
            message="با فرمِ بالا اولین برنامه یا سایت را معرفی کن؛ همان لحظه در «بیشتر» کاربران دیده می‌شود." />
        )}
        <div style={{ display: 'grid', gap: 8 }}>
          {items.map((item, i) => (
            <div key={item.id} style={{
              display: 'flex', gap: 10, alignItems: 'center', padding: 10,
              border: '1px solid var(--gg-border, #243044)', borderRadius: 14,
              opacity: item.isActive ? 1 : 0.55,
            }}>
              <div style={{
                width: 46, height: 46, borderRadius: 12, overflow: 'hidden', flexShrink: 0,
                background: 'rgba(148,163,184,0.15)', display: 'grid', placeItems: 'center',
              }}>
                {item.imageUrl
                  ? <img src={assetUrl(item.imageUrl)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <ImageIcon size={18} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {item.title}
                  <Badge tone={item.kind === 'website' ? 'info' : 'neutral'}>{item.kindLabel}</Badge>
                  {!item.isActive && <Badge tone="warning">خاموش</Badge>}
                </div>
                {item.description && (
                  <div style={{ color: 'var(--gg-muted)', fontSize: 12, marginTop: 2 }}>{item.description}</div>
                )}
                <a href={item.linkUrl} target="_blank" rel="noreferrer noopener"
                  style={{ color: 'var(--gg-accent, #84CC16)', fontSize: 12, display: 'inline-flex', gap: 4, alignItems: 'center', marginTop: 2 }}>
                  <Link2 size={12} /> {item.linkUrl}
                </a>
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <IconButton icon={ArrowUp} title="بالا" disabled={i === 0 || busyId === item.id}
                  onClick={() => move(item, 'up')} />
                <IconButton icon={ArrowDown} title="پایین" disabled={i === items.length - 1 || busyId === item.id}
                  onClick={() => move(item, 'down')} />
                <IconButton icon={item.isActive ? EyeOff : Eye}
                  title={item.isActive ? 'خاموش‌کردن' : 'روشن‌کردن'}
                  disabled={busyId === item.id} onClick={() => toggleItem(item)} />
                <IconButton icon={Pencil} title="ویرایش" onClick={() => startEdit(item)} />
                <IconButton icon={Trash2} title="حذف" disabled={busyId === item.id}
                  onClick={() => remove(item)} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
