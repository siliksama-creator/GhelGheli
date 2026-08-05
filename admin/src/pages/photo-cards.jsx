/**
 * پنل «ثبت کارت از طریق عکس».
 *
 * سه بخش، به همان ترتیبی که مدیر واقعاً کار می‌کند:
 *   ۱. آپلود عکس خام + تعیین امتیاز
 *   ۲. بانک کد مشترک (تولید، آمار، خروجی CSV برای چاپخانه)
 *   ۳. صف بررسی — عکس‌هایی که موتور تطبیق مطمئن نبوده
 *
 * صفحهٔ «کارت و کد» موجود عمداً دست‌نخورده ماند: آن سیستم دیگری است
 * (ثبت با کد تنها) و قاطی کردنشان در یک صفحه فقط باعث می‌شد مدیر کد را
 * در بانک اشتباه وارد کند.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Clock, Download, Image as ImageIcon,
  KeyRound, ScanLine, Upload, XCircle,
} from 'lucide-react';

import { assetUrl, fmtDateTime, fmtNumber } from '../lib/api.js';
import {
  Badge, Button, Card, EmptyState, Field, Input, Skeleton, Textarea,
} from '../components/ui.jsx';
import { useDialog } from '../components/dialog.jsx';
import { useToast } from '../lib/toast.jsx';

export function PhotoCardsPage({ request }) {
  const notify = useToast();
  const { confirmAction } = useDialog();

  const [designs, setDesigns] = useState(null);
  const [stats, setStats] = useState(null);
  const [batches, setBatches] = useState([]);
  const [subs, setSubs] = useState(null);
  const [subFilter, setSubFilter] = useState('pending');

  // فرم آپلود
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [name, setName] = useState('');
  const [points, setPoints] = useState('');
  const [cash, setCash] = useState('');
  const [uploading, setUploading] = useState(false);

  // فرم کد — مدیر خودش وارد می‌کند، سیستم نمی‌سازد
  const [rawCodes, setRawCodes] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [report, setReport] = useState(null);

  const loadDesigns = useCallback(
    () => request('/api/admin/photo-cards/designs')
      .then(r => setDesigns(r.designs || []))
      .catch(e => { setDesigns([]); notify(e.message, 'error'); }),
    [request, notify],
  );

  const loadCodes = useCallback(
    () => request('/api/admin/photo-cards/codes/stats')
      .then(r => { setStats(r.stats); setBatches(r.batches || []); })
      .catch(() => setStats(null)),
    [request],
  );

  const loadSubs = useCallback(
    (status) => request(`/api/admin/photo-cards/submissions?status=${status}`)
      .then(r => setSubs(r.submissions || []))
      .catch(() => setSubs([])),
    [request],
  );

  useEffect(() => { loadDesigns(); loadCodes(); }, [loadDesigns, loadCodes]);
  useEffect(() => { setSubs(null); loadSubs(subFilter); }, [subFilter, loadSubs]);

  // پیش‌نمایش محلی. بدون آن مدیر نمی‌داند فایل درست را انتخاب کرده یا نه.
  function pickFile(f) {
    setFile(f || null);
    // آزادسازی بلابِ قبلی، وگرنه با هر انتخاب یک شیء در حافظه می‌ماند.
    setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return f ? URL.createObjectURL(f) : ''; });
  }

  async function uploadDesign() {
    if (!file) return notify('عکس کارت را انتخاب کنید', 'error');
    if (!name.trim()) return notify('نام کارت را بنویسید', 'error');
    setUploading(true);
    try {
      const r = await request.postForm('/api/admin/photo-cards/designs', {
        file,
        fields: { name: name.trim(), pointValue: points || 0, cashAmount: cash || 0 },
      });
      notify(r.message || 'طرح ثبت شد', 'success');
      pickFile(null);
      setName(''); setPoints(''); setCash('');
      loadDesigns();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  async function toggleDesign(d) {
    try {
      await request(`/api/admin/photo-cards/designs/${d.id}`, {
        method: 'PATCH', body: { isActive: !d.is_active },
      });
      loadDesigns();
    } catch (e) { notify(e.message, 'error'); }
  }

  /**
   * کدها را همان‌طور که مدیر نوشته می‌فرستد.
   *
   * شمارشِ محلی فقط برای نمایش است؛ تفکیک و اعتبارسنجیِ واقعی سمت سرور
   * انجام می‌شود. اگر اینجا هم منطق تفکیک را می‌نوشتم، دو جا برای واگرا
   * شدن داشتیم و روزی یکی «۱۵۰۰۰ کد» می‌گفت و دیگری ۱۴۹۸۷ ثبت می‌کرد.
   */
  async function saveCodes() {
    if (!rawCodes.trim()) return notify('کدها را وارد کنید', 'error');
    setSaving(true);
    setReport(null);
    try {
      const r = await request('/api/admin/photo-cards/codes', {
        method: 'POST',
        body: { rawCodes, batchLabel: label.trim() || undefined },
      });
      setReport(r);
      notify(r.message, r.insertedCount ? 'success' : 'error');
      if (r.insertedCount) setRawCodes('');
      loadCodes();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  // شمارشِ تقریبی برای نمایشِ زنده زیر کادر. همان جداکننده‌های سرور.
  const typedCount = rawCodes.split(/[\n,;\t، ]+/).filter(Boolean).length;

  async function decide(sub, approve) {
    let reason = '';
    if (!approve) {
      const okGo = await confirmAction({
        title: 'رد کردن این ثبت',
        message: 'کد آزاد می‌شود و کاربر می‌تواند دوباره با عکس بهتر تلاش کند.',
        confirmText: 'رد کن',
        danger: true,
      });
      if (!okGo) return;
      reason = 'عکس با کارت مطابقت نداشت';
    }
    try {
      await request(`/api/admin/photo-cards/submissions/${sub.id}/decide`, {
        method: 'POST', body: { approve, reason },
      });
      notify(approve ? 'تأیید شد' : 'رد شد', 'success');
      loadSubs(subFilter);
      loadCodes();
    } catch (e) { notify(e.message, 'error'); }
  }

  const pendingCount = subFilter === 'pending' && subs ? subs.length : null;

  return (
    <div className="stack-lg">

      {/* ───────── ۱. آپلود عکس خام ───────── */}
      <Card
        title="آپلود عکس خام کارت"
        subtitle="عکس باکیفیت کارت را بگذارید. سیستم اثر انگشت تصویر را می‌سازد تا بعداً عکسِ کاربر را با آن تطبیق دهد."
      >
        <div className="photoUploadGrid">
          <div>
            <Field label="عکس کارت">
              {/* label به‌جای دکمه: کلیک روی کل ناحیه فایل را باز می‌کند */}
              <label className="photoDrop">
                {preview
                  ? <img src={preview} alt="پیش‌نمایش" />
                  : (
                    <span className="photoDropHint">
                      <ImageIcon size={26} />
                      <b>انتخاب عکس</b>
                      <small>PNG یا JPG — هرچه باکیفیت‌تر بهتر</small>
                    </span>
                  )}
                <input
                  type="file" accept="image/*" hidden
                  onChange={e => pickFile(e.target.files?.[0])}
                />
              </label>
            </Field>
          </div>
          <div className="stack">
            <Field label="نام کارت">
              <Input value={name} onChange={e => setName(e.target.value)}
                placeholder="مثلاً: امباپه — فرانسه" />
            </Field>
            <Field label="امتیاز این کارت">
              <Input type="number" min="0" value={points}
                onChange={e => setPoints(e.target.value)} placeholder="مثلاً 3000" />
            </Field>
            <Field label="جایزهٔ نقدی (تومان، اختیاری)">
              <Input type="number" min="0" value={cash}
                onChange={e => setCash(e.target.value)} placeholder="0" />
            </Field>
            <Button icon={Upload} loading={uploading} onClick={uploadDesign}>
              آپلود و ساخت اثر انگشت
            </Button>
            <p className="topbar-sub">
              تحلیل تصویر چند ثانیه طول می‌کشد. بعد از آن، هر کاربری که از
              این کارت عکس بگیرد به‌صورت خودکار شناسایی می‌شود.
            </p>
          </div>
        </div>
      </Card>

      {/* ───────── ۲. بانک کد ───────── */}
      <Card
        title="بانک کد مشترک"
        subtitle="کدهای چاپ‌شده روی کارت‌ها را وارد کنید. این بانک بین همهٔ طرح‌ها مشترک است — طرح جدید که اضافه شود، همین کدها پوششش می‌دهند."
        action={
          <Button
            variant="secondary" icon={Download}
            onClick={() => request.download(
              '/api/admin/photo-cards/codes/export', 'photo-card-codes.csv',
            ).catch(e => notify(e.message, 'error'))}
          >
            خروجی CSV
          </Button>
        }
      >
        {stats && (
          <div className="statRow">
            <div className="statPill"><b>{fmtNumber(stats.total)}</b><span>کل</span></div>
            <div className="statPill ok"><b>{fmtNumber(stats.unused)}</b><span>آزاد</span></div>
            <div className="statPill warn"><b>{fmtNumber(stats.reserved)}</b><span>در بررسی</span></div>
            <div className="statPill used"><b>{fmtNumber(stats.used)}</b><span>مصرف‌شده</span></div>
          </div>
        )}
        {/* ── ورودِ کد: دانه‌ای یا انبوه، در یک کادر ──
            کادر متنی چندخطی هر دو حالت را پوشش می‌دهد: یک کد در یک خط،
            یا ۱۵ هزار کد چسبانده‌شده از اکسل. دو فرم جدا فقط مدیر را
            مجبور می‌کرد بین دوتاشان انتخاب کند بدون اینکه سودی داشته
            باشد. */}
        <Field label="کدها — هر خط یک کد (یا با کاما/فاصله جدا کنید)">
          <Textarea
            rows={7}
            dir="ltr"
            className="codeInput"
            value={rawCodes}
            onChange={e => setRawCodes(e.target.value)}
            placeholder={'GHP-A2B3-C4D5\nGHP-X7K9-M1N2\n…'}
          />
        </Field>
        <div className="codeMetaRow">
          <span className="topbar-sub">
            {typedCount > 0
              ? `${fmtNumber(typedCount)} کد نوشته‌اید`
              : 'کدهایی که روی کارت‌ها چاپ شده را اینجا وارد کنید'}
          </span>
        </div>
        <div className="photoCodeForm">
          <Field label="برچسب دسته (اختیاری)">
            <Input value={label} onChange={e => setLabel(e.target.value)}
              placeholder="مثلاً: چاپ مهر ۱۴۰۵" />
          </Field>
          <Button icon={KeyRound} loading={saving} onClick={saveCodes}>
            ثبت کدها
          </Button>
        </div>

        {/* ── گزارش تفکیک‌شده ──
            «۱۴٬۹۸۷ کد ثبت شد» به‌تنهایی بی‌فایده است — مدیر باید بداند
            کدام‌ها جا افتادند و چرا. */}
        {report && (
          <div className="codeReport">
            <div className="crRow">
              <Badge tone="success">{fmtNumber(report.insertedCount)} ثبت شد</Badge>
              {report.duplicateInDbCount > 0 && (
                <Badge tone="warning">
                  {fmtNumber(report.duplicateInDbCount)} از قبل بود
                </Badge>
              )}
              {report.duplicateInFileCount > 0 && (
                <Badge tone="warning">
                  {fmtNumber(report.duplicateInFileCount)} تکراری در ورودی
                </Badge>
              )}
              {report.invalidCount > 0 && (
                <Badge tone="danger">{fmtNumber(report.invalidCount)} نامعتبر</Badge>
              )}
            </div>

            {/* هشدارِ برخورد با بانکِ سیستم قدیمی. سکوت اینجا یعنی یک
                کارت دو بار امتیاز می‌دهد و ماه‌ها بعد کشف می‌شود. */}
            {report.clashWithOldBankCount > 0 && (
              <div className="crWarn">
                <AlertTriangle size={15} />
                <div>
                  <b>{fmtNumber(report.clashWithOldBankCount)} کد در سیستم «ثبت کد کارت» هم وجود دارد.</b>
                  <span>
                    یعنی همان کارت یک بار با کد و یک بار با عکس قابل ثبت است
                    و دو بار امتیاز می‌دهد. اگر عمدی نیست، آن کدها را از یکی
                    از دو سیستم باطل کنید.
                  </span>
                  <code>{report.clashWithOldBank.join('، ')}</code>
                </div>
              </div>
            )}

            {report.invalidCount > 0 && (
              <p className="crList">
                نامعتبر: <code>{report.invalid.join('، ')}</code>
              </p>
            )}
            {report.duplicateInDbCount > 0 && (
              <p className="crList">
                از قبل موجود: <code>{report.duplicateInDb.join('، ')}</code>
              </p>
            )}
          </div>
        )}
        {batches.length > 0 && (
          <div className="batchList">
            {batches.map(b => (
              <div key={b.batch_label} className="batchItem">
                <b>{b.batch_label}</b>
                <span>{fmtNumber(b.count)} کد</span>
                <small>{fmtDateTime(b.created_at)}</small>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ───────── ۳. صف بررسی ───────── */}
      <Card
        title={`صف بررسی${pendingCount ? ` (${fmtNumber(pendingCount)})` : ''}`}
        subtitle="عکس‌هایی که سیستم مطمئن نبوده. تأیید یا رد شما نهایی است."
        action={
          <div className="segmented">
            {[['pending', 'در انتظار'], ['approved', 'تأییدشده'], ['rejected', 'ردشده']]
              .map(([k, t]) => (
                <button key={k} className={subFilter === k ? 'on' : ''}
                  onClick={() => setSubFilter(k)}>{t}</button>
              ))}
          </div>
        }
      >
        {subs === null && <Skeleton height={110} />}
        {subs && subs.length === 0 && (
          <EmptyState
            icon={CheckCircle2}
            title="چیزی در این فهرست نیست"
            message={subFilter === 'pending'
              ? 'همهٔ ثبت‌ها به‌صورت خودکار تعیین تکلیف شده‌اند.'
              : 'موردی یافت نشد.'}
          />
        )}
        {subs && subs.map(s => (
          <div key={s.id} className="reviewRow">
            <div className="reviewShots">
              <figure>
                <img src={assetUrl(s.userImageUrl)} alt="عکس کاربر" />
                <figcaption>عکس کاربر</figcaption>
              </figure>
              <ScanLine size={18} className="reviewArrow" />
              <figure>
                <img src={assetUrl(s.design_image)} alt="طرح پیشنهادی" />
                <figcaption>حدس سیستم</figcaption>
              </figure>
            </div>
            <div className="reviewBody">
              <b>{s.card_type_name || 'نامشخص'}</b>
              <div className="topbar-sub">
                {s.nickname || s.mobile} · کد {s.code || '—'}
                {s.point_value != null && ` · ${fmtNumber(s.point_value)} امتیاز`}
              </div>
              <div className="reviewMeta">
                {/* امتیاز تطبیق را نشان می‌دهیم چون مدیر باید بداند سیستم
                    چقدر مطمئن بوده — نه اینکه کورکورانه تأیید کند. */}
                <Badge tone={s.match_score >= 0.65 ? 'success' : 'warning'}>
                  شباهت {Math.round((s.match_score || 0) * 100)}٪
                </Badge>
                {s.match_margin != null && s.match_margin < 0.03 && (
                  <Badge tone="warning">
                    <AlertTriangle size={12} /> شبیه چند طرح
                  </Badge>
                )}
                <span className="topbar-sub">{fmtDateTime(s.created_at)}</span>
              </div>
              {s.reject_reason && <p className="topbar-sub">دلیل رد: {s.reject_reason}</p>}
            </div>
            {s.status === 'pending' && (
              <div className="reviewActions">
                <Button size="sm" icon={CheckCircle2}
                  onClick={() => decide(s, true)}>تأیید</Button>
                <Button size="sm" variant="danger" icon={XCircle}
                  onClick={() => decide(s, false)}>رد</Button>
              </div>
            )}
            {s.status !== 'pending' && (
              <Badge tone={s.status === 'approved' ? 'success' : 'danger'}>
                {s.status === 'approved' ? 'تأییدشده' : 'ردشده'}
              </Badge>
            )}
          </div>
        ))}
      </Card>

      {/* ───────── فهرست طرح‌ها ───────── */}
      <Card title="طرح‌های ثبت‌شده"
        subtitle="کارت غیرفعال دیگر با عکس کاربران تطبیق داده نمی‌شود.">
        {designs === null && <Skeleton height={90} />}
        {designs && designs.length === 0 && (
          <EmptyState icon={ImageIcon} title="هنوز طرحی نیست"
            message="اولین عکس خام را از بالا آپلود کنید." />
        )}
        <div className="designGrid">
          {designs && designs.map(d => (
            <div key={d.id} className={`designTile${d.is_active ? '' : ' off'}`}>
              <img src={assetUrl(d.image_url)} alt={d.card_type_name} loading="lazy" />
              <div className="designInfo">
                <b>{d.card_type_name}</b>
                <span>{fmtNumber(d.point_value)} امتیاز</span>
                <small>
                  <Clock size={11} /> {fmtNumber(d.redeemed_count)} بار ثبت شده
                </small>
              </div>
              <Button size="sm" variant="secondary" onClick={() => toggleDesign(d)}>
                {d.is_active ? 'غیرفعال کن' : 'فعال کن'}
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
