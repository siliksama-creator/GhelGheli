import { useEffect, useState } from 'react';
import { Ban, CreditCard, Image as ImageIcon, ListChecks, Pencil, Upload } from 'lucide-react';
import { assetUrl, fmtNumber } from '../lib/api.js';
import { Badge, Button, Card, DataRow, EmptyState, Field, Input, Select, Textarea } from '../components/ui.jsx';
import { useDialog } from '../components/dialog.jsx';
import { CardTypeModal, BULK_LIMIT } from '../components/card-type-modal.jsx';
import { useToast } from '../lib/toast.jsx';

export function CardsPage({ request }) {
  const notify = useToast();
  const { confirmAction } = useDialog();
  const [types, setTypes] = useState([]);
  const [codes, setCodes] = useState([]);
  const [report, setReport] = useState(null);
  const [form, setForm] = useState({ name: '', point: '', cash: '', desc: '', image: '' });
  const [imageFile, setImageFile] = useState(null);
  const [uploadingFor, setUploadingFor] = useState('');
  const [bulkType, setBulkType] = useState('');
  const [bulkCodes, setBulkCodes] = useState('');
  const [singleCode, setSingleCode] = useState('');
  const [managing, setManaging] = useState(null);
  const [savingType, setSavingType] = useState(false);
  const [savingBulk, setSavingBulk] = useState(false);
  const [savingSingle, setSavingSingle] = useState(false);

  const load = () => {
    request('/api/admin/card-types').then((t) => {
      setTypes(t);
      setBulkType((prev) => prev || t[0]?.id || '');
    });
    request('/api/admin/card-codes').then(setCodes);
  };

  useEffect(load, [request]);

  /// Uploads a new picture for an existing card type. The file goes to the
  /// VPS (backend/uploads/images) and only the returned URL is stored.
  async function changeTypeImage(t, file) {
    if (!file) return;
    setUploadingFor(t.id);
    try {
      const imageUrl = await request.uploadImage(file);
      await request(`/api/admin/card-types/${t.id}`, { method: 'PATCH', body: { imageUrl } });
      notify('عکس کارت به‌روزرسانی شد');
      load();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setUploadingFor('');
    }
  }

  async function addType(e) {
    e.preventDefault();
    setSavingType(true);
    try {
      let imageUrl = form.image;
      if (imageFile) imageUrl = await request.uploadImage(imageFile);
      await request('/api/admin/card-types', {
        method: 'POST',
        body: {
          name: form.name,
          pointValue: Number(form.point),
          cashAmount: Number(form.cash) || 0,
          description: form.desc,
          imageUrl,
        },
      });
      setForm({ name: '', point: '', cash: '', desc: '', image: '' });
      setImageFile(null);
      notify('نوع کارت ساخته شد');
      load();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSavingType(false);
    }
  }

  async function addSingle() {
    if (!bulkType || !singleCode.trim()) return;
    setSavingSingle(true);
    try {
      await request('/api/admin/card-codes', { method: 'POST', body: { cardTypeId: bulkType, code: singleCode } });
      setSingleCode('');
      notify('کد ثبت شد');
      load();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSavingSingle(false);
    }
  }

  // همان قاعدهٔ جداسازی که سرور استفاده می‌کند، تا شمارنده با آنچه واقعاً
  // ثبت می‌شود یکی باشد.
  const bulkCount = bulkCodes.split(/[\n,;\t ]+/).filter((c) => c.trim()).length;

  async function bulk() {
    if (!bulkType || !bulkCodes.trim()) return;
    if (bulkCount > BULK_LIMIT) {
      notify(`حداکثر ${fmtNumber(BULK_LIMIT)} کد در هر بار`, 'error');
      return;
    }
    setSavingBulk(true);
    try {
      const r = await request('/api/admin/card-codes/bulk', { method: 'POST', body: { cardTypeId: bulkType, rawCodes: bulkCodes } });
      setReport(r);
      notify('گزارش ورود دسته‌جمعی آماده شد');
      load();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSavingBulk(false);
    }
  }

  // Void a code that leaked or was created by mistake before it's ever
  // redeemed — previously there was no way to disable a code once created.
  async function voidCode(c) {
    const ok = await confirmAction({
      title: 'ابطال کد',
      description: `کد «${c.code}» برای همیشه غیرقابل استفاده می‌شود. این کار قابل بازگشت نیست.`,
      danger: true,
      confirmLabel: 'ابطال کن',
    });
    if (!ok) return;
    await request(`/api/admin/card-codes/${c.id}/void`, { method: 'PATCH', body: { reason: 'ابطال دستی از پنل' } });
    notify('کد باطل شد');
    load();
  }

  return (
    <div className="card-grid cols-2">
      <div style={{ display: 'grid', gap: 20, alignContent: 'start' }}>
        <Card title="تعریف نوع کارت و عکس" subtitle="هر نوع کارت یک امتیاز و عکس مشخص دارد">
          <form onSubmit={addType}>
            <Field label="نام کارت">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="امتیاز">
              <Input type="number" value={form.point} onChange={(e) => setForm({ ...form, point: e.target.value })} required />
            </Field>
            <Field label="جایزهٔ نقدی (تومان)">
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={form.cash}
                onChange={(e) => setForm({ ...form, cash: e.target.value })}
              />
              <span className="topbar-sub" style={{ fontSize: 12 }}>
                {Number(form.cash) > 0
                  ? `با ثبت این کارت، ${new Intl.NumberFormat('fa-IR').format(Number(form.cash))} تومان به کیف پول کاربر اضافه می‌شود`
                  : 'صفر = کارت بدون جایزهٔ نقدی'}
              </span>
            </Field>
            <Field label="توضیحات">
              <Textarea value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} rows={3} />
            </Field>
            <Field label="عکس کارت">
              <div className="file-field">
                <Input placeholder="آدرس عکس آماده" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} />
                <label className="btn btn-secondary btn-icon" style={{ cursor: 'pointer' }}>
                  <Upload size={16} />
                  <input type="file" accept="image/*" hidden onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
                </label>
              </div>
              {imageFile && <span className="topbar-sub">{imageFile.name}</span>}
            </Field>
            <Button type="submit" loading={savingType} className="btn-block">
              ذخیره نوع کارت
            </Button>
          </form>
        </Card>

        <Card title="نوع کارت‌های موجود">
          {types.length === 0 ? (
            <EmptyState icon={CreditCard} title="هنوز نوع کارتی تعریف نشده" />
          ) : (
            types.map((t) => (
              <DataRow
                key={t.id}
                thumb={
                  t.image_url ? (
                    <img className="thumb" src={assetUrl(t.image_url)} alt="" />
                  ) : (
                    <div className="thumb" style={{ display: 'grid', placeItems: 'center' }}>
                      <ImageIcon size={18} />
                    </div>
                  )
                }
                title={t.name}
                subtitle={
                  `${Number(t.cash_amount) > 0
                    ? `${fmtNumber(t.point_value)} امتیاز + ${fmtNumber(t.cash_amount)} تومان`
                    : `${fmtNumber(t.point_value)} امتیاز`}`
                  + ` — ${fmtNumber(t.code_count || 0)} کد، ${fmtNumber(t.unused_count || 0)} مصرف‌نشده`
                }
                actions={
                  <div style={{ display: 'flex', gap: 8 }}>
                    <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                      {uploadingFor === t.id ? 'در حال آپلود...' : 'تغییر عکس'}
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        disabled={uploadingFor === t.id}
                        onChange={(e) => {
                          changeTypeImage(t, e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setManaging(t)}>
                      ویرایش و کد
                    </Button>
                  </div>
                }
              />
            ))
          )}
        </Card>
      </div>

      <div style={{ display: 'grid', gap: 20, alignContent: 'start' }}>
        <Card title="ثبت کد برای کارت" subtitle="یک کد تکی یا فهرست دسته‌جمعی وارد کنید">
          <Field label="نوع کارت">
            <Select value={bulkType} onChange={(e) => setBulkType(e.target.value)}>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {fmtNumber(t.point_value)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="ثبت تکی کد">
            <div className="field-row">
              <Input
                value={singleCode}
                onChange={(e) => setSingleCode(e.target.value.toUpperCase())}
                placeholder="کد کارت"
                style={{ textTransform: 'uppercase' }}
              />
              <Button variant="secondary" onClick={addSingle} loading={savingSingle} style={{ flex: '0 0 auto' }}>
                ثبت کد
              </Button>
            </div>
          </Field>
          <Field label="ثبت دسته‌جمعی">
            <Textarea
              value={bulkCodes}
              onChange={(e) => setBulkCodes(e.target.value.toUpperCase())}
              placeholder="هر خط یک کد یا جدا شده با کاما"
              rows={7}
              style={{
                textTransform: 'uppercase',
                ...(bulkCount > BULK_LIMIT ? { borderColor: 'var(--gg-danger)' } : {}),
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
              <span className="topbar-sub">
                {fmtNumber(bulkCount)} کد از {fmtNumber(BULK_LIMIT)}
              </span>
              {bulkCount > BULK_LIMIT && (
                <span style={{ color: 'var(--gg-danger)', fontWeight: 700 }}>
                  حداکثر {fmtNumber(BULK_LIMIT)} کد در هر بار
                </span>
              )}
            </div>
          </Field>
          <Button
            icon={ListChecks}
            onClick={bulk}
            loading={savingBulk}
            disabled={bulkCount > BULK_LIMIT}
            className="btn-block"
          >
            {bulkCount === 0 ? 'بررسی و ورود کدها' : `ورود ${fmtNumber(bulkCount)} کد`}
          </Button>
          {report && (
            <div className="report-grid">
              <div className="report-chip">
                موفق
                <b>{fmtNumber(report.insertedCount)}</b>
              </div>
              <div className="report-chip">
                تکراری فایل
                <b>{fmtNumber(report.duplicateInFileCount)}</b>
              </div>
              <div className="report-chip">
                تکراری دیتابیس
                <b>{fmtNumber(report.duplicateInDbCount)}</b>
              </div>
              <div className="report-chip">
                نامعتبر
                <b>{fmtNumber(report.invalidCount)}</b>
              </div>
            </div>
          )}
        </Card>

        <Card title="آخرین کدها">
          {codes.length === 0 ? (
            <EmptyState icon={ListChecks} title="هنوز کدی ثبت نشده" />
          ) : (
            codes
              .slice(0, 12)
              .map((c) => (
                <DataRow
                  key={c.id}
                  title={c.code}
                  subtitle={`${c.card_type_name} — ${c.used_by_mobile || ''}`}
                  trailing={
                    <Badge tone={c.status === 'used' ? 'neutral' : c.status === 'voided' ? 'danger' : 'success'}>
                      {c.status === 'used' ? 'استفاده‌شده' : c.status === 'voided' ? 'باطل‌شده' : 'استفاده‌نشده'}
                    </Badge>
                  }
                  actions={
                    c.status === 'unused' ? (
                      <Button size="sm" variant="danger" icon={Ban} onClick={() => voidCode(c)}>
                        ابطال
                      </Button>
                    ) : null
                  }
                />
              ))
          )}
        </Card>
      </div>
      {managing && (
        <CardTypeModal
          cardType={managing}
          request={request}
          notify={notify}
          onSaved={load}
          onClose={(changed) => {
            setManaging(null);
            if (changed) load();
          }}
        />
      )}
    </div>
  );
}
