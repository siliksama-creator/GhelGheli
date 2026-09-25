// انتشار اپ — «از همین‌جا نسخهٔ تازهٔ APK را بگذار»
//
// ── چرا این صفحه وجود دارد (تصمیمِ مالک، ۱ مهر ۱۴۰۵) ─────────────────────
//
// با کنارگذاشتنِ کافه‌بازار، دکمهٔ «به‌روزرسانی» اپ و وب به صفحهٔ یک بستهٔ
// ناموجود اشاره می‌کرد. حالا خودِ سرور فایل را می‌دهد و ادمین فایل را از
// همین صفحه آپلود می‌کند؛ بعد از آپلود، لینکِ به‌روزرسانی (و اگر بخواهی
// حداقلِ نسخه و پرچمِ اجباری) **زنده** در `/api/config` می‌نشیند — بدونِ
// دیپلوی و بدونِ نیاز به انتشار دوبارهٔ وب.
//
// ── چرا آپلود با XHR و نه fetch ──────────────────────────────────────────
//
// فایلِ ~۶۰ مگابایتی است؛ با fetch هیچ راهی برای نشان‌دادنِ درصدِ پیشرفت
// نیست و ادمین فکر می‌کند صفحه هنگ کرده. XHR همان کار را با progress می‌کند.
import { useEffect, useRef, useState } from 'react';
import { Download, Package, RefreshCw, Trash2, Upload, Copy, ShieldCheck, AlertTriangle } from 'lucide-react';
import { API_BASE, fmtNumber } from '../lib/api.js';
import { Badge, Button, Card, Field, Input } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

/** حجمِ خوانا برای چشمِ انسان. */
function humanSize(bytes) {
  const n = Number(bytes) || 0;
  if (n > 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} مگابایت`;
  if (n > 1024) return `${Math.round(n / 1024)} کیلوبایت`;
  return `${n} بایت`;
}

export function AppReleasePage({ request, token, isSuperAdmin, onNavigate }) {
  const notify = useToast();
  // توکن برای آپلودِ XHR لازم است (fetch نمی‌تواند درصدِ پیشرفت بدهد).
  // پنل توکن را در localStorage نگه می‌دارد؛ اگر به‌عنوان prop هم برسد
  // همان اولویت دارد تا این صفحه به نحوهٔ ذخیره‌سازی وابسته نباشد.
  const authToken = token || (typeof localStorage !== 'undefined' ? localStorage.getItem('adminToken') : '') || '';
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [file, setFile] = useState(null);
  const [version, setVersion] = useState('');
  const [versionCode, setVersionCode] = useState('');
  const [notes, setNotes] = useState('');
  const [setUpdateUrl, setSetUpdateUrl] = useState(true);
  // خاموش به‌صورت پیش‌فرض: انتشارِ معمولی حقِ انتخاب را از کاربر نمی‌گیرد.
  // دستورِ مالک: «لطفا apk رو موقع انتشار فورس اپدیت نکن.»
  const [promoteMin, setPromoteMin] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(false);
  const [minVersion, setMinVersion] = useState('');
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  const load = async () => {
    try {
      const d = await request('/api/admin/apk');
      setData(d);
      setVersion((v) => v || d?.release?.version || '');
      setMinVersion((v) => v || d?.release?.version || '');
      setLoaded(true);
    } catch (e) {
      notify(e.message || 'خواندنِ وضعیتِ انتشار ناموفق بود', 'error');
    }
  };
  useEffect(() => { load(); }, [request]);

  const pickFile = (f) => {
    setFile(f || null);
    if (f) {
      // نام فایل‌های خروجیِ CI (`app-arm64-v8a-release.apk`) نسخه ندارد؛ اما
      // اگر کاربر فایلی با نسخه در نام انتخاب کرد، همان را پیشنهاد می‌دهیم.
      const m = /(\d+\.\d+\.\d+)/.exec(f.name || '');
      if (m && !version) setVersion(m[1]);
      if (m && !minVersion) setMinVersion(m[1]);
    }
  };

  /** آپلود با progress (XHR) — تنها راهِ نشان‌دادنِ درصد برای فایلِ بزرگ. */
  const upload = () => new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('version', version);
    fd.append('versionCode', versionCode);
    fd.append('notes', notes);
    fd.append('setUpdateUrl', setUpdateUrl ? 'true' : 'false');
    fd.append('promoteMinVersion', promoteMin ? 'true' : 'false');
    fd.append('forceUpdate', forceUpdate ? 'true' : 'false');
    fd.append('minVersion', minVersion || version);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/api/admin/apk/upload`);
    if (authToken) xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText || '{}'); } catch { /* خالی */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new Error(body.message || `آپلود ناموفق بود (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('ارتباط هنگام آپلود قطع شد'));
    xhr.send(fd);
  });

  const submit = async (e) => {
    e.preventDefault();
    if (!isSuperAdmin) return;
    if (!file) return notify('اول فایل APK را انتخاب کن', 'error');
    setBusy(true); setProgress(0);
    try {
      const d = await upload();
      notify(d.message || 'منتشر شد');
      pickFile(null);
      if (fileInput.current) fileInput.current.value = '';
      setNotes('');
      await load();
    } catch (err) {
      notify(err.message || 'انتشار ناموفق بود', 'error');
    } finally {
      setBusy(false); setProgress(0);
    }
  };

  const remove = async (name) => {
    if (!isSuperAdmin) return;
    try {
      const d = await request('/api/admin/apk/delete', { method: 'POST', body: { name } });
      notify(d.message || 'حذف شد');
      await load();
    } catch (e) {
      notify(e.message || 'حذف ناموفق بود', 'error');
    }
  };

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${label} کپی شد`);
    } catch {
      notify('کپی نشد؛ دستی انتخاب کن', 'error');
    }
  };

  if (!loaded) return <Card title="انتشار اپ"><p className="topbar-sub">در حال بارگذاری…</p></Card>;

  const release = data?.release;
  const files = data?.files || [];

  return (
    <div style={{ display: 'grid', gap: 14 }} dir="rtl">
      <Card
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Package size={20} /> انتشار اپ (APK)</span>}
        subtitle="فایلِ ساختهٔ «Build APK» را این‌جا بگذار. بعد از انتشار، لینکِ به‌روزرسانی اپ و وب از همین دامنه داده می‌شود و کافه‌بازار دیگر در مسیرِ کاربر نیست."
        action={release
          ? <Badge tone="success">نسخهٔ {release.version} منتشرشده</Badge>
          : <Badge tone="warning">هنوز نسخه‌ای منتشر نشده</Badge>}
      >
        {release ? (
          <div className="card-grid cols-2">
            <div>
              <Field label="لینکِ دانلود (اپ)"><Input dir="ltr" readOnly value={release.url} onFocus={(e) => e.target.select()} /></Field>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <Button variant="secondary" size="sm" icon={Copy} onClick={() => copy(release.url, 'لینکِ اپ')}>کپی لینک</Button>
                <a className="btn btn-ghost btn-sm" href={release.url} target="_blank" rel="noreferrer">
                  <Download size={14} /> دانلود
                </a>
                <Button variant="ghost" size="sm" icon={RefreshCw} onClick={load}>تازه‌سازی</Button>
              </div>
            </div>
            <div>
              <Field label="لینکِ دانلود (وب — هم‌مبدأ)"><Input dir="ltr" readOnly value={release.webUrl || ''} onFocus={(e) => e.target.select()} /></Field>
              <div style={{ marginTop: 8 }} className="field-hint">
                کاربرِ وب همین را می‌بیند؛ چون از دامنهٔ خودِ سایت است، به دامنهٔ دوم وابسته نیست.
              </div>
            </div>
            <div className="field-hint" style={{ padding: 10, borderRadius: 10, background: 'rgba(56,189,248,.08)' }}>
              <b>SHA-256</b>
              <div dir="ltr" style={{ wordBreak: 'break-all', fontSize: 12 }}>{release.sha256}</div>
              <div style={{ marginTop: 6 }}>
                <Button variant="ghost" size="sm" icon={Copy} onClick={() => copy(release.sha256, 'هش')}>کپی هش</Button>
              </div>
            </div>
            <div className="field-hint" style={{ padding: 10, borderRadius: 10, background: 'rgba(34,231,166,.08)' }}>
              <b>مشخصات</b>
              <div>نسخه: <span dir="ltr">{release.version}</span>{release.versionCode ? ` (+${release.versionCode})` : ''}</div>
              <div>حجم: {humanSize(release.sizeBytes)}</div>
              <div>انتشار: {new Date(release.publishedAt).toLocaleString('fa-IR')}</div>
              {release.publishedBy && <div>توسط: {release.publishedBy}</div>}
              {release.minVersionApplied && (
                <div style={{ marginTop: 4 }}>
                  حداقلِ نسخه: <span dir="ltr">{release.minVersionApplied}</span>
                  {release.forceUpdateApplied ? ' — اجباری' : ' — اختیاری'}
                </div>
              )}
              {release.notes && (
                <div style={{ marginTop: 4 }}>پیام به کاربران: {release.notes}</div>
              )}
            </div>
          </div>
        ) : (
          <p className="topbar-sub">هنوز فایلی منتشر نشده. اولین APK را از پایین آپلود کن.</p>
        )}
        {/* فوترِ فروشگاه به همین انتشار وصل است (مهر ۱۴۰۵): دکمهٔ دانلودِ
            فوترِ سایت، لینک و نسخه را زنده از `/api/app/latest` می‌خواند —
            پس با هر انتشارِ تازه، سایت خودکار به‌روز می‌شود و نیازی به
            ویرایشِ دستیِ وردپرس نیست. */}
        <div className="field-hint" style={{ marginTop: 12, padding: 10, borderRadius: 10, background: 'rgba(181,239,88,.08)' }}>
          <b>فوترِ فروشگاه وصل است</b>
          <div>
            دکمهٔ «دانلود اپلیکیشن» در فوترِ سایت، لینک و نسخه را زنده از همین انتشار می‌خواند
            (<span dir="ltr">/api/app/latest</span>) — با هر انتشارِ تازه، سایت خودکار به‌روز
            می‌شود و نیازی به ویرایشِ دستی نیست.
          </div>
        </div>
      </Card>

      <Card
        title="کاربران این پیام را کجا می‌بینند؟"
        subtitle="لازم نیست کار خاصی بکنی؛ فقط بدان کجا را نگاه کنی."
      >
        <div className="field-hint" style={{ lineHeight: 1.95 }}>
          <div>
            <b>۱) داخلِ اپ (مهم‌ترین جا):</b> کاربر اپ را باز می‌کند و اگر نسخهٔ منتشرشدهٔ این صفحه
            از نسخهٔ نصب‌شدهٔ گوشی تازه‌تر باشد، پنجره‌ای با تیتر «نسخهٔ تازه قلقلی آماده است» بالا
            می‌آید. دکمهٔ «به‌روزرسانی» همان فایلِ بالای همین صفحه را دانلود می‌کند.
          </div>
          <div style={{ marginTop: 6 }}>
            <b>۲) وب:</b> همین پنجره در وب فقط وقتی می‌آید که «حداقلِ نسخه» را بالا برده باشی؛
            کاربرِ وب با «تازه‌سازی» صفحه به‌روز می‌شود و فایل APK نمی‌خواهد.
          </div>
          <div style={{ marginTop: 6 }}>
            <b>۳) اعلان (نوتیفیکیشن):</b> برای خبرکردنِ دستی، از صفحهٔ «اطلاعیه‌ها» →
            «استودیوی اعلان‌های هدفمند» می‌توانی هر متنی را به همهٔ کاربران بفرستی.
          </div>
          <div style={{ marginTop: 8 }}>
            متنِ کادرِ «پیامِ نسخهٔ تازه به کاربران» مخصوصِ همین نسخه است؛ تیتر و متنِ ثابتِ پنجره و
            برچسبِ دکمه‌ها در صفحهٔ «متن‌های زنده» → گروهِ «پیامِ نسخهٔ تازه» قابل ویرایشاند.
          </div>
          {typeof onNavigate === 'function' && (
            <div style={{ marginTop: 10 }}>
              <Button variant="secondary" size="sm" onClick={() => onNavigate('live-copy')}>
                ویرایشِ متن‌های پنجره
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Upload size={18} /> آپلودِ نسخهٔ تازه</span>}
        subtitle="APK را از GitHub → Actions → «Build APK» → Artifacts (پوشهٔ app-release-apks) بگیر (حالا یک فایلِ یونیورسال است که روی هر گوشی نصب می‌شود). سرور خودش بررسی می‌کند فایل سالم و امضاشده باشد."
      >
        <form onSubmit={submit}>
          <Field label="فایل APK" hint="فقط فایلِ امضاشدهٔ ریلیز پذیرفته می‌شود؛ خروجیِ دیباگ روی گوشیِ کاربر نصب نمی‌شود.">
            <input
              ref={fileInput}
              type="file"
              accept=".apk,application/vnd.android.package-archive"
              disabled={!isSuperAdmin}
              onChange={(e) => pickFile(e.target.files?.[0] || null)}
            />
          </Field>
          <div className="card-grid cols-2">
            <Field label="نسخه" hint="مثل 1.1.20 — همین در نامِ فایل و کارتِ انتشار می‌نشیند.">
              <Input dir="ltr" value={version} disabled={!isSuperAdmin} onChange={(e) => setVersion(e.target.value.trim())} placeholder="1.1.20" />
            </Field>
            <Field label="کدِ نسخه (versionCode)" hint="اختیاری — از pubspec یا خروجیِ بیلد. فقط برای ثبتِ داخلی است.">
              <Input dir="ltr" value={versionCode} disabled={!isSuperAdmin} onChange={(e) => setVersionCode(e.target.value.trim())} placeholder="22" />
            </Field>
          </div>
          <Field
            label="پیامِ نسخهٔ تازه به کاربران (اختیاری)"
            hint="این جمله در پنجرهٔ به‌روزرسانی داخلِ اپ به کاربر نشان داده می‌شود — همان‌جا که نصب‌کنندگان می‌فهمند نسخهٔ تازه آمده. مثل «رفع مشکل ورود و سرعت بیشتر»."
          >
            <Input value={notes} disabled={!isSuperAdmin} onChange={(e) => setNotes(e.target.value)} maxLength={400} />
          </Field>

          <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
            <label className="checkbox-row">
              <input type="checkbox" checked={setUpdateUrl} disabled={!isSuperAdmin}
                onChange={(e) => setSetUpdateUrl(e.target.checked)} />
              این فایل «نسخهٔ زنده» شود (لینکِ به‌روزرسانیِ اپ و وب به آن وصل شود)
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={promoteMin} disabled={!isSuperAdmin}
                onChange={(e) => setPromoteMin(e.target.checked)} />
              حداقلِ نسخه هم بالا برود (کاربرانِ قدیمی‌تر وادار به به‌روزرسانی می‌شوند)
            </label>
            {promoteMin && (
              <div className="card-grid cols-2">
                <Field label="حداقلِ نسخه" hint="نسخه‌های پایین‌تر از این، دیالوگِ به‌روزرسانی می‌بینند.">
                  <Input dir="ltr" value={minVersion} disabled={!isSuperAdmin}
                    onChange={(e) => setMinVersion(e.target.value.trim())} placeholder={version || '1.1.20'} />
                </Field>
                <label className="checkbox-row" style={{ alignSelf: 'end' }}>
                  <input type="checkbox" checked={forceUpdate} disabled={!isSuperAdmin}
                    onChange={(e) => setForceUpdate(e.target.checked)} />
                  به‌روزرسانی اجباری (کاربر تا آپدیت نکردن، استفاده نکند)
                </label>
              </div>
            )}
          </div>

          {busy && (
            <div style={{ marginTop: 10 }}>
              <div style={{ height: 8, borderRadius: 6, background: 'rgba(255,255,255,.12)', overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: '#22e7a6', transition: 'width .2s' }} />
              </div>
              <div className="topbar-sub" style={{ marginTop: 6 }}>در حال آپلود… {progress}٪</div>
            </div>
          )}

          {isSuperAdmin ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <Button type="submit" icon={Upload} loading={busy}>انتشار نسخه</Button>
              <Button variant="ghost" icon={RefreshCw} onClick={load} disabled={busy}>تازه‌سازی</Button>
            </div>
          ) : (
            <p className="topbar-sub" style={{ marginTop: 12 }}>این بخش برای مشاهده است؛ فقط مدیرکل می‌تواند نسخه منتشر کند.</p>
          )}
        </form>
      </Card>

      <Card
        title="فایل‌های روی سرور"
        subtitle={`پوشهٔ ${data?.dir?.path || ''} — حجمِ مصرفی ${humanSize(data?.dir?.totalBytes)}${data?.dir?.freeBytes ? ` · فضای آزادِ دیسک ${humanSize(data.dir.freeBytes)}` : ''}`}
      >
        {files.length === 0 ? (
          <p className="topbar-sub">فایلی نیست.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {files.map((f) => (
              <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Badge tone={f.isLatest ? 'success' : 'neutral'}>{f.isLatest ? 'آخرین نسخه' : 'نسخهٔ آرشیوی'}</Badge>
                <code dir="ltr" style={{ fontSize: 12 }}>{f.name}</code>
                <span className="topbar-sub">{humanSize(f.sizeBytes)}</span>
                <span className="topbar-sub">{new Date(f.modifiedAt).toLocaleString('fa-IR')}</span>
                <a className="btn btn-ghost btn-sm" href={f.url} target="_blank" rel="noreferrer"><Download size={14} /> دانلود</a>
                {isSuperAdmin && !f.isLatest && (
                  <Button variant="ghost" size="sm" icon={Trash2} onClick={() => remove(f.name)}>حذف</Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="چطور APK را بسازم؟" subtitle="ترتیبِ کار، بدونِ کافه‌بازار.">
        <ol className="topbar-sub" style={{ lineHeight: 2, paddingInlineStart: 18 }}>
          <li>در گیت‌هاب → تب <b>Actions</b> → ورک‌فلوی <b>Build APK</b> → <b>Run workflow</b>.</li>
          <li>بعد از موفقیت، از همان اجرا بخش <b>Artifacts</b> فایل <code dir="ltr">app-release-apks</code> را دانلود کن (داخلش دو APK است: <code dir="ltr">arm64</code> برای گوشی‌های امروزی و <code dir="ltr">armeabi-v7a</code> برای قدیمی‌ترها).</li>
          <li>همان فایل را همین‌جا آپلود کن؛ سرور امضا و سلامتِ فایل را خودش بررسی می‌کند.</li>
          <li>اگر می‌خواهی آپدیت را به کاربر نشان دهی، تیکِ «حداقلِ نسخه هم بالا برود» را بزن — وگرنه فقط لینکِ دانلود عوض می‌شود.</li>
        </ol>
        <div className="field-hint" style={{ padding: 10, borderRadius: 10, background: 'rgba(250,204,21,.10)', display: 'flex', gap: 8 }}>
          <AlertTriangle size={16} style={{ flex: '0 0 auto', marginTop: 3 }} />
          <span>
            کلیدِ امضای اپ باید همیشه بیرون از سرور هم پشتیبان داشته باشد؛ اگر گم شود، <b>دیگر هیچ‌وقت</b> نمی‌توانی نسخهٔ تازه منتشر کنی و کاربران هم قابل به‌روزرسانی نیستند.
          </span>
        </div>
        <div className="field-hint" style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <ShieldCheck size={16} style={{ flex: '0 0 auto', marginTop: 3 }} />
          <span>
            کاربر می‌تواند اصالتِ فایل را با هشِ SHA-256 بررسی کند؛ همان هش کنارِ فایل هم سرو می‌شود
            (<code dir="ltr">/app/ghelgheli-latest.apk.sha256</code>).
          </span>
        </div>
        <p className="topbar-sub" style={{ marginTop: 8 }}>
          اندازهٔ فایل‌های روی سرور: {files.length} فایل · {fmtNumber(Math.round((data?.dir?.totalBytes || 0) / (1024 * 1024)))} مگابایت
        </p>
      </Card>
    </div>
  );
}
