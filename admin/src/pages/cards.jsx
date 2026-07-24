import { useEffect, useState } from 'react';
import { CreditCard, Image as ImageIcon, ListChecks, Pencil, Upload } from 'lucide-react';
import { assetUrl, fmtNumber } from '../lib/api.js';
import { Button, Card, DataRow, EmptyState, Field, Input, Select, Textarea } from '../components/ui.jsx';
import { useDialog } from '../components/dialog.jsx';
import { useToast } from '../lib/toast.jsx';

export function CardsPage({ request }) {
  const notify = useToast();
  const { promptText } = useDialog();
  const [types, setTypes] = useState([]);
  const [codes, setCodes] = useState([]);
  const [report, setReport] = useState(null);
  const [form, setForm] = useState({ name: '', point: '', desc: '', image: '' });
  const [imageFile, setImageFile] = useState(null);
  const [bulkType, setBulkType] = useState('');
  const [bulkCodes, setBulkCodes] = useState('');
  const [singleCode, setSingleCode] = useState('');
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

  async function editType(t) {
    const name = await promptText({ title: 'نام کارت', defaultValue: t.name });
    if (!name) return;
    const pointValue = await promptText({ title: 'امتیاز کارت', defaultValue: `${t.point_value}`, type: 'number' });
    const imageUrl = await promptText({ title: 'آدرس عکس کارت', defaultValue: t.image_url || '' });
    const description = await promptText({ title: 'توضیحات کارت', defaultValue: t.description || '', multiline: true });
    await request(`/api/admin/card-types/${t.id}`, {
      method: 'PATCH',
      body: { name, pointValue: Number(pointValue) || t.point_value, imageUrl: imageUrl || '', description: description || '' },
    });
    notify('کارت ویرایش شد');
    load();
  }

  async function addType(e) {
    e.preventDefault();
    setSavingType(true);
    try {
      let imageUrl = form.image;
      if (imageFile) imageUrl = await request.uploadImage(imageFile);
      await request('/api/admin/card-types', {
        method: 'POST',
        body: { name: form.name, pointValue: Number(form.point), description: form.desc, imageUrl },
      });
      setForm({ name: '', point: '', desc: '', image: '' });
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

  async function bulk() {
    if (!bulkType || !bulkCodes.trim()) return;
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
                subtitle={`${fmtNumber(t.point_value)} امتیاز`}
                actions={
                  <Button size="sm" variant="secondary" icon={Pencil} onClick={() => editType(t)}>
                    ویرایش
                  </Button>
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
              style={{ textTransform: 'uppercase' }}
            />
          </Field>
          <Button icon={ListChecks} onClick={bulk} loading={savingBulk} className="btn-block">
            بررسی و ورود کدها
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
              .map((c) => <DataRow key={c.id} title={c.code} subtitle={`${c.card_type_name} — ${c.status} — ${c.used_by_mobile || ''}`} />)
          )}
        </Card>
      </div>
    </div>
  );
}
