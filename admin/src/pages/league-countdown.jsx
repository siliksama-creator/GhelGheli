import { useEffect, useState } from 'react';
import { CalendarClock, Clock, Eye, Save, Unlock, Trophy } from 'lucide-react';
import { Badge, Button, Card, Field, Input, Select, Textarea } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * شماره معکوسِ شروعِ لیگ — پنل ادمین
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── خواستهٔ مالک (۲۷ شهریور) ────────────────────────────────────────────────
 *
 *   «در پنل ادمین بساز که ادمین بتونه شماره معکوسِ استارتِ لیگ بسازه. اگر فعال
 *    کرد، کاربرها نتونن آنلاین یا ضربه‌زن بازی کنن (وب و اندروید)؛ فقط اتاق
 *    بسازن و با ربات بازی کنن. شماره معکوس در قسمتِ لیگ/بازیِ آنلاین/ضربه‌زن
 *    نمایش داده بشه. متنش هم این‌جا قابلِ تغییر باشه.»
 *
 * ── چهار چیزی که این صفحه کنترل می‌کند ─────────────────────────────────────
 *
 *   ۱. **تیکِ فعال + زمانِ شروع** — روشن‌بودن به‌تنهایی کافی نیست؛ تا وقتی
 *      ساعت به «زمانِ شروع» نرسیده، مسیرهای سکه‌ای بسته‌اند. رسیدن به صفر
 *      خودکار آزاد می‌کند، پس هیچ‌وقت قفلِ فراموش‌شده نمی‌ماند.
 *   ۲. **متن‌ها** — عنوان، زیرعنوان، یادداشت و پیامِ خطا. این‌ها در سرور
 *      ذخیره می‌شوند و کلاینت‌ها فقط نمایششان می‌دهند؛ پس کاربرِ اندروید هم
 *      بدونِ نصبِ نسخهٔ تازه، متنِ تازه را می‌بیند.
 *   ۳. **لیگِ انتخابی** — سرِ ساعتِ صفر همان لیگ فعال می‌شود.
 *   ۴. **«لیگِ خودکار»** — اگر خاموش باشد، سرور خودش لیگ نمی‌سازد؛ یعنی
 *      هیچ لیگی بدونِ ساختِ ادمین در جریان نیست (خواستهٔ صریحِ مالک).
 *
 * ⚠️ چرا این صفحه فقط برای مدیرکلِ پنل است: یک کلیک در آن، دسترسیِ همهٔ
 *    کاربران به بازیِ سکه‌ای را می‌بندد. همان قاعده‌ای که در بک‌اند اجرا
 *    شده (`requireRole()` بدونِ آرگومان = فقط super_admin).
 */
const EMPTY = {
  enabled: false,
  startsAt: '',
  title: '',
  subtitle: '',
  note: '',
  message: '',
  leagueAutostart: false,
  seasonId: '',
};

/**
 * `datetime-local` قالبِ `YYYY-MM-DDTHH:mm:ss` و زمانِ **محلی** می‌خواهد؛ ثانیه هم قابل تنظیم است.
 * `toISOString()` مستقیم، ساعت را به UTC می‌برد و ادمین تاریخی می‌بیند که
 * خودش نگذاشته (همان درسی که در صفحهٔ «لیگ ماهانه» نوشته شده).
 */
function toLocalInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** «۲ روز و ۳ ساعت» — خوانا، به‌جای عددِ خامِ میلی‌ثانیه. */
function humanLeft(ms) {
  if (!(ms > 0)) return 'رسیده است';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} روز و ${h} ساعت`;
  if (h > 0) return `${h} ساعت و ${m} دقیقه`;
  if (m > 0) return `${m} دقیقه و ${sec} ثانیه`;
  return `${sec} ثانیه`;
}

export function LeagueCountdownPage({ request }) {
  const notify = useToast();
  const [form, setForm] = useState(EMPTY);
  const [state, setState] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [limits, setLimits] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // تیکِ یک‌ثانیه‌ای فقط برای نمایشِ زندهٔ زمانِ باقی‌مانده؛ خودِ شمارش در
  // مرورگرِ کاربر است و اینجا فقط برای اطمینانِ ادمین.
  const [, setTick] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const data = await request('/api/admin/league-countdown');
      const s = data?.settings || {};
      setForm({
        enabled: !!s.enabled,
        startsAt: toLocalInput(s.startsAt),
        title: s.title || '',
        subtitle: s.subtitle || '',
        note: s.note || '',
        message: s.message || '',
        leagueAutostart: !!s.leagueAutostart,
        seasonId: s.seasonId || '',
      });
      setState(data?.state || null);
      setSeasons(Array.isArray(data?.seasons) ? data.seasons : []);
      setLimits(data?.limits || {});
    } catch (e) {
      notify(e?.message || 'بارگذاریِ تنظیمات ناموفق بود', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  useEffect(() => {
    if (!form.enabled) return undefined;
    const t = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(t);
  }, [form.enabled]);

  // زمانِ باقی‌مانده از «همین لحظه» حساب می‌شود، نه از پاسخِ سرور: ادمین
  // باید ببیند شمارش واقعاً جلو می‌رود. تیکِ ثانیه‌ای بالا (setTick) باعثِ
  // رندرِ دوباره می‌شود و همین خط با هر رندر دوباره حساب می‌شود — نیازی به
  // useMemo نیست، چون محاسبه‌اش هزینه‌ای ندارد.
  const startMs = form.startsAt ? new Date(form.startsAt).getTime() : NaN;
  const leftMs = Number.isFinite(startMs) ? Math.max(0, startMs - Date.now()) : 0;

  const active = form.enabled && leftMs > 0;

  const set = (key) => (e) => {
    const value = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const bump = (minutes) => () => {
    const base = new Date();
    setForm((f) => ({ ...f, startsAt: toLocalInput(new Date(base.getTime() + minutes * 60_000).toISOString()) }));
  };

  async function save() {
    if (form.enabled && !form.startsAt) {
      notify('برای فعال‌کردن، زمانِ شروع را هم تعیین کن', 'error');
      return;
    }
    setSaving(true);
    try {
      // ⚠️ زمانِ محلی → ISO کامل: سرور منطقهٔ زمانی می‌خواهد، نه قالبِ ورودی.
      const body = {
        enabled: form.enabled,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        title: form.title,
        subtitle: form.subtitle,
        note: form.note,
        message: form.message,
        leagueAutostart: form.leagueAutostart,
        seasonId: form.seasonId || null,
      };
      const data = await request('/api/admin/league-countdown', { method: 'PUT', body });
      setState(data?.state || null);
      notify(form.enabled ? 'شماره معکوس ذخیره شد و روی وب و اپ اعمال می‌شود' : 'شماره معکوس خاموش شد');
    } catch (e) {
      notify(e?.message || 'ذخیره ناموفق بود', 'error');
    } finally {
      setSaving(false);
    }
  }

  const chosenSeason = seasons.find((s) => s.id === form.seasonId) || null;

  return (
    <div className="card-grid cols-2">
      {/* ═══ ۱) وضعیت و ذخیره ═══ */}
      <Card
        title="شماره معکوسِ شروعِ لیگ"
        subtitle="تا رسیدنِ این ساعت، بازیِ آنلاین و ضربه‌زن بسته است؛ اتاقِ خصوصی و بازی با ربات باز می‌مانند."
        action={active ? <Badge tone="success">فعال</Badge>
          : form.enabled ? <Badge tone="warning">زمانش گذشته است</Badge> : <Badge>خاموش</Badge>}
      >
        <Field
          label="فعال باشد"
          hint="با تیک‌زدن، بلافاصله روی وب و اپ اعمال می‌شود (بدونِ انتشارِ نسخهٔ تازه). سرِ ساعتِ تعیین‌شده خودکار باز می‌شود و کارتِ شمارش پنهان می‌شود."
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.enabled} onChange={set('enabled')} />
            <span>مسیرهای سکه‌ای را تا زمانِ زیر ببند</span>
          </label>
        </Field>

        <Field
          label="زمانِ شروعِ لیگ (با ثانیه)"
          hint="زمان را با دقتِ ثانیه وارد کنید؛ دقیقاً در همین لحظه شمارش به صفر می‌رسد و لیگِ انتخابی آزاد می‌شود."
        >
          <Input type="datetime-local" step="1" value={form.startsAt} onChange={set('startsAt')} />
        </Field>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <Button variant="secondary" size="sm" onClick={bump(60)}>۱ ساعت بعد</Button>
          <Button variant="secondary" size="sm" onClick={bump(1440)}>۱ روز بعد</Button>
          <Button variant="secondary" size="sm" onClick={bump(7 * 1440)}>۱ هفته بعد</Button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Button icon={Save} onClick={save} loading={saving} disabled={loading}>
            ذخیره
          </Button>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <Clock size={15} />
            {form.enabled
              ? (leftMs > 0 ? `باقی‌مانده: ${humanLeft(leftMs)}` : 'زمانش رسیده است')
              : 'خاموش است'}
          </span>
        </div>

        {state?.seasonActivatedAt && (
          <p style={{ marginTop: 10, fontSize: 13 }}>
            آخرین فعال‌سازیِ خودکارِ لیگ: {new Date(state.seasonActivatedAt).toLocaleString('fa-IR')}
          </p>
        )}
      </Card>

      {/* ═══ ۲) متن‌ها (بدونِ آپدیتِ اپ عوض می‌شوند) ═══ */}
      <Card
        title="متن‌های کارت"
        subtitle="همین جمله‌ها در وب و اندروید نشان داده می‌شوند — بدونِ نیاز به انتشارِ نسخهٔ تازه."
        action={<Badge tone="neutral">بدونِ آپدیت</Badge>}
      >
        <Field label="عنوانِ کارت" hint={`تا ${limits.title || 60} نویسه. کوتاه بنویسید؛ روی موبایل در دو خط جا شود.`}>
          <Input value={form.title} maxLength={limits.title || 60} onChange={set('title')} />
        </Field>
        <Field label="زیرعنوان" hint={`تا ${limits.subtitle || 160} نویسه — یک خطِ توضیح زیرِ عنوان.`}>
          <Textarea rows={2} value={form.subtitle} maxLength={limits.subtitle || 160} onChange={set('subtitle')} />
        </Field>
        <Field
          label="یادداشت (زیرِ شمارش)"
          hint={`تا ${limits.note || 240} نویسه. این‌جا بنویسید کاربر در این فاصله چه کاری می‌تواند بکند (اتاقِ خصوصی، بازی با ربات).`}
        >
          <Textarea rows={2} value={form.note} maxLength={limits.note || 240} onChange={set('note')} />
        </Field>
        <Field
          label="پیامِ خطا"
          hint={`تا ${limits.message || 200} نویسه. اگر کسی دکمهٔ بازیِ آنلاین را بزند، همین جمله را می‌بیند.`}
        >
          <Textarea rows={2} value={form.message} maxLength={limits.message || 200} onChange={set('message')} />
        </Field>
        <p style={{ fontSize: 12.5, opacity: 0.75, margin: '4px 0 0', lineHeight: 1.7 }}>
          متن‌های خالی، خودکار به جملهٔ پیش‌فرضِ سرور برمی‌گردند؛ پس هیچ‌وقت کارتِ بی‌متن نشان داده نمی‌شود.
        </p>
      </Card>

      {/* ═══ ۳) لیگ: کدام لیگ سرِ ساعتِ صفر شروع شود ═══ */}
      <Card
        title="لیگی که سرِ ساعتِ صفر شروع می‌شود"
        subtitle="اگر لیگی انتخاب نشود، فقط قفل باز می‌شود و لیگی شروع نمی‌شود."
        action={<Badge tone="neutral">لیگ</Badge>}
      >
        <Field
          label="لیگِ پیش‌فرض"
          hint="فهرست، لیگ‌های ساخته‌شدهٔ فعال/زمان‌بندی‌شدهٔ صفحهٔ «لیگ ماهانه» است. سرِ ساعتِ صفر همین لیگ فعال می‌شود و شمارشِ سکه‌اش شروع."
        >
          <Select value={form.seasonId} onChange={set('seasonId')}>
            <option value="">— انتخاب نشده —</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title || s.month_year} ({s.status === 'active' ? 'فعال' : 'زمان‌بندی‌شده'})
              </option>
            ))}
          </Select>
        </Field>

        {chosenSeason && (
          <p style={{ fontSize: 13, lineHeight: 1.8 }}>
            شروعِ ثبت‌شدهٔ این لیگ: {chosenSeason.starts_at ? new Date(chosenSeason.starts_at).toLocaleString('fa-IR') : '—'}
            <br />
            پایان: {chosenSeason.ends_at ? new Date(chosenSeason.ends_at).toLocaleString('fa-IR') : '—'}
          </p>
        )}

        <Field
          label="ساختِ خودکارِ لیگ"
          hint="پیش‌فرض خاموش است: تا ادمین لیگ نسازد، هیچ لیگی در جریان نیست. روشن‌کردنش رفتارِ قدیمی را برمی‌گرداند (سرور خودش هر ماه یک فصل می‌سازد)."
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.leagueAutostart} onChange={set('leagueAutostart')} />
            <span>سرور خودش لیگِ تازه بسازد (پیشنهاد: خاموش)</span>
          </label>
        </Field>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 6 }}>
          <Trophy size={16} style={{ marginTop: 3, flex: '0 0 auto' }} />
          <p style={{ fontSize: 12.5, opacity: 0.8, margin: 0, lineHeight: 1.8 }}>
            اگر لیگ انتخابی «زمان‌بندی‌شده» باشد، سرِ ساعتِ صفر فعال می‌شود؛ اگر «فعال» باشد، فقط
            پنجرهٔ زمانی‌اش تازه می‌شود. لیگِ بسته‌شده هیچ‌وقت دوباره باز نمی‌شود.
          </p>
        </div>
      </Card>

      {/* ═══ ۴) پیش‌نمایشِ همان کارتی که کاربر می‌بیند ═══ */}
      <Card
        title="پیش‌نمایشِ کارتِ کاربر"
        subtitle="همان کارتی که در صفحهٔ لیگ، بازیِ آنلاین و ضربه‌زن نشان داده می‌شود."
        action={<Badge tone="neutral"><Eye size={14} /> پیش‌نمایش</Badge>}
      >
        <div
          style={{
            borderRadius: 20,
            padding: '14px 14px 12px',
            border: '1px solid rgba(255,209,102,.42)',
            background: 'linear-gradient(150deg, #1a2a4e 0%, #0c1830 46%, #2a163a 100%)',
            color: '#fff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 36, height: 36, borderRadius: 12, display: 'grid', placeItems: 'center',
              background: 'linear-gradient(135deg, #FFD166, #f59e0b)', color: '#21160a',
            }}>
              <Clock size={19} />
            </span>
            <div style={{ display: 'grid', gap: 2 }}>
              <b style={{ fontSize: 15 }}>{form.title || 'لیگ به‌زودی شروع می‌شود'}</b>
              <span style={{ fontSize: 12.5, color: '#b9cbe0' }}>
                {form.subtitle || 'تا شروعِ لیگ، بازیِ آنلاین و ضربه‌زن موقتاً بسته است'}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7, margin: '12px 0 10px' }}>
            {(() => {
              const s = Math.floor(leftMs / 1000);
              const parts = [
                [Math.floor(s / 86400), 'روز'],
                [Math.floor((s % 86400) / 3600), 'ساعت'],
                [Math.floor((s % 3600) / 60), 'دقیقه'],
                [s % 60, 'ثانیه'],
              ];
              return parts.map(([v, label]) => (
                <div key={label} style={{
                  display: 'grid', justifyItems: 'center', gap: 2, padding: '8px 2px 6px',
                  borderRadius: 14, background: 'rgba(255,255,255,.08)',
                  border: '1px solid rgba(255,255,255,.12)',
                }}>
                  <strong style={{ fontSize: 21 }}>{String(v).padStart(2, '۰')}</strong>
                  <span style={{ fontSize: 12, color: '#9fb4cc' }}>{label}</span>
                </div>
              ));
            })()}
          </div>

          <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,.1)', overflow: 'hidden' }}>
            <i style={{
              display: 'block', height: '100%', width: '35%',
              background: 'linear-gradient(90deg, #FFD166, #22e7a6)',
            }} />
          </div>

          <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#cfe0f2' }}>
            {form.note || 'در این فاصله می‌توانی در اتاقِ خصوصی با دوستت یا مقابلِ ربات تمرین کنی.'}
          </p>
        </div>

        <Field label="پس از رسیدن به صفر چه می‌شود؟"
          hint="همین سه اتفاق خودکار می‌افتد — کاری لازم نیست.">
          <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 13, lineHeight: 2 }}>
            <li><Unlock size={14} /> بازیِ آنلاین و ضربه‌زن آزاد می‌شوند.</li>
            <li>کارتِ شماره معکوس در وب و اندروید پنهان می‌شود.</li>
            <li>
              {form.seasonId
                ? 'لیگِ انتخاب‌شده فعال می‌شود و امتیاز/سکهٔ کاربران در آن ثبت می‌گردد.'
                : 'لیگی فعال نمی‌شود، چون در این صفحه لیگی انتخاب نشده است.'}
            </li>
          </ul>
        </Field>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <CalendarClock size={16} style={{ marginTop: 3, flex: '0 0 auto' }} />
          <p style={{ fontSize: 12.5, opacity: 0.8, margin: 0, lineHeight: 1.8 }}>
            در این فاصله کاربر می‌تواند اتاقِ خصوصی بسازد یا با ربات بازی کند؛ در آن دو حالت
            فقط امتیاز ثبت می‌شود و سکه‌ای پرداخت نمی‌شود.
          </p>
        </div>
      </Card>
    </div>
  );
}
