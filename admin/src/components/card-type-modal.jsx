import { useMemo, useState } from 'react';
import { ListPlus, Save, Upload, X } from 'lucide-react';
import { Badge, Button, Field, Input, Textarea } from './ui.jsx';

/**
 * مدیریت یکپارچهٔ یک نوع کارت: ویرایش مشخصات + افزودن کد دسته‌ای.
 *
 * پیش‌تر ویرایش با زنجیره‌ای از prompt های پشت‌سرهم انجام می‌شد (نام، بعد
 * امتیاز، بعد جایزهٔ نقدی، بعد توضیحات) و افزودن کد جای کاملاً دیگری بود.
 * برای تغییر فقط نامِ کارت، مدیر مجبور بود از چهار دیالوگ رد شود؛ و برای
 * افزودن کد باید همان کارت را از یک کشویی دوباره پیدا می‌کرد — با ده‌ها
 * کارت، انتخاب اشتباه یعنی هزار کد روی کارت غلط.
 */

/** باید با BULK_CODE_LIMIT سمت سرور یکی باشد. */
export const BULK_LIMIT = 1000;

const fa = (n) => new Intl.NumberFormat('fa-IR').format(Number(n || 0));

export function CardTypeModal({ cardType, request, notify, onClose, onSaved }) {
  const [tab, setTab] = useState('details');
  const [form, setForm] = useState({
    name: cardType.name || '',
    point: `${cardType.point_value ?? 0}`,
    cash: `${cardType.cash_amount ?? 0}`,
    desc: cardType.description || '',
    image: cardType.image_url || '',
  });
  const [imageFile, setImageFile] = useState(null);
  const [codes, setCodes] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingCodes, setSavingCodes] = useState(false);
  const [report, setReport] = useState(null);
  const [changed, setChanged] = useState(false);

  const codeCount = useMemo(
    () => codes.split(/[\n,;\t ]+/).filter((c) => c.trim()).length,
    [codes],
  );
  const tooMany = codeCount > BULK_LIMIT;

  async function saveDetails() {
    if (!form.name.trim()) {
      notify('نام کارت نمی‌تواند خالی باشد', 'error');
      return;
    }
    setSavingDetails(true);
    try {
      const body = {
        name: form.name.trim(),
        pointValue: Number(form.point) || 0,
        cashAmount: Number(form.cash) || 0,
        description: form.desc,
      };
      // عکس فقط وقتی فرستاده می‌شود که واقعاً عوض شده باشد. فرستادن رشتهٔ
      // خالی به سرور می‌گفت عکس فعلی را پاک کن.
      if (imageFile) body.imageUrl = await request.uploadImage(imageFile);
      else if (form.image.trim() && form.image !== cardType.image_url) {
        body.imageUrl = form.image.trim();
      }
      await request(`/api/admin/card-types/${cardType.id}`, { method: 'PATCH', body });
      setChanged(true);
      setImageFile(null);
      notify('اطلاعات کارت ذخیره شد');
      onSaved?.();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSavingDetails(false);
    }
  }

  async function submitCodes() {
    if (!codeCount) {
      notify('هیچ کدی وارد نشده است', 'error');
      return;
    }
    if (tooMany) {
      notify(`حداکثر ${fa(BULK_LIMIT)} کد در هر بار`, 'error');
      return;
    }
    // تأیید صریح با نام کارت مقصد: ثبت کد برگشت‌پذیر نیست (کدها فقط باطل
    // می‌شوند، حذف نمی‌شوند).
    if (!window.confirm(`${fa(codeCount)} کد به کارت «${cardType.name}» اضافه شود؟`)) return;

    setSavingCodes(true);
    setReport(null);
    try {
      const r = await request('/api/admin/card-codes/bulk', {
        method: 'POST',
        body: { cardTypeId: cardType.id, rawCodes: codes },
      });
      setReport(r);
      setChanged(true);
      if (r.insertedCount > 0) setCodes('');
      onSaved?.();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSavingCodes(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose(changed)}
    >
      <div className="modal-card" style={{ width: 'min(560px, 96vw)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div className="modal-title" style={{ marginBottom: 2 }}>{cardType.name}</div>
            <p className="topbar-sub" style={{ fontSize: 12, margin: 0 }}>
              {fa(cardType.code_count)} کد · {fa(cardType.unused_count)} مصرف‌نشده
              {' · '}{fa(cardType.used_count)} مصرف‌شده
            </p>
          </div>
          <Button variant="ghost" size="sm" icon={X} onClick={() => onClose(changed)} />
        </div>

        <div className="ct-tabs">
          <button className={tab === 'details' ? 'on' : ''} onClick={() => setTab('details')}>
            ویرایش کارت
          </button>
          <button className={tab === 'codes' ? 'on' : ''} onClick={() => setTab('codes')}>
            افزودن کد
          </button>
        </div>

        {tab === 'details' ? (
          <div>
            <Field label="نام کارت">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="امتیاز">
              <Input
                type="number"
                value={form.point}
                onChange={(e) => setForm({ ...form, point: e.target.value })}
              />
            </Field>
            <Field label="جایزهٔ نقدی (تومان)">
              <Input
                type="number"
                min="0"
                value={form.cash}
                onChange={(e) => setForm({ ...form, cash: e.target.value })}
              />
              <span className="topbar-sub" style={{ fontSize: 12 }}>
                {Number(form.cash) > 0
                  ? `با ثبت این کارت، ${fa(form.cash)} تومان به کیف پول کاربر اضافه می‌شود`
                  : 'صفر = بدون جایزهٔ نقدی'}
              </span>
            </Field>
            <Field label="عکس کارت">
              <div className="file-field">
                <Input
                  placeholder="آدرس عکس"
                  value={form.image}
                  onChange={(e) => setForm({ ...form, image: e.target.value })}
                />
                <label className="btn btn-secondary btn-icon" style={{ cursor: 'pointer' }}>
                  <Upload size={16} />
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
              {imageFile && <span className="topbar-sub">{imageFile.name}</span>}
            </Field>
            <Field label="توضیحات">
              <Textarea
                rows={2}
                value={form.desc}
                onChange={(e) => setForm({ ...form, desc: e.target.value })}
              />
            </Field>
            <Button icon={Save} loading={savingDetails} onClick={saveDetails} className="btn-block">
              ذخیرهٔ تغییرات
            </Button>
          </div>
        ) : (
          <div>
            <p className="topbar-sub" style={{ fontSize: 12, marginBottom: 8 }}>
              کدها به «<b>{cardType.name}</b>» اضافه می‌شوند. هر خط یک کد، یا جدا با کاما.
            </p>
            <Textarea
              rows={8}
              placeholder={'GHEL-0001\nGHEL-0002\n...'}
              value={codes}
              onChange={(e) => setCodes(e.target.value)}
              style={tooMany ? { borderColor: 'var(--gg-danger)' } : undefined}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                margin: '6px 0 10px',
              }}
            >
              <span className="topbar-sub">
                {fa(codeCount)} کد از {fa(BULK_LIMIT)}
              </span>
              {tooMany && (
                <span style={{ color: 'var(--gg-danger)', fontWeight: 700 }}>
                  حداکثر {fa(BULK_LIMIT)} کد در هر بار
                </span>
              )}
            </div>
            <Button
              icon={ListPlus}
              loading={savingCodes}
              disabled={tooMany || codeCount === 0}
              onClick={submitCodes}
              className="btn-block"
            >
              {codeCount === 0 ? 'ثبت کدها' : `ثبت ${fa(codeCount)} کد`}
            </Button>

            {report && (
              <div className="bulk-report">
                <ReportRow label="ثبت شد" value={report.insertedCount} tone="success" />
                <ReportRow label="تکراری در دیتابیس" value={report.duplicateInDbCount} tone="warning" />
                <ReportRow label="تکراری در متن ورودی" value={report.duplicateInFileCount} tone="warning" />
                <ReportRow label="فرمت نامعتبر" value={report.invalidCount} tone="danger" />
                {report.invalid?.length > 0 && (
                  <p className="topbar-sub" style={{ fontSize: 11, marginTop: 6 }}>
                    نمونهٔ نامعتبرها: {report.invalid.slice(0, 5).join('، ')}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ReportRow({ label, value, tone }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
      <span className="topbar-sub" style={{ fontSize: 13 }}>{label}</span>
      <Badge tone={tone}>{fa(value)}</Badge>
    </div>
  );
}
