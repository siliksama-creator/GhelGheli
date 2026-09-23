import { useCallback, useEffect, useState } from 'react';
import {
  Megaphone, Save, Link2, Eye, Plus, Trash2, ArrowUp, ArrowDown, RotateCcw, Users,
} from 'lucide-react';
import { Badge, Button, Card, Field, Input, Select, Textarea } from '../components/ui.jsx';
import { useToast } from '../lib/toast.jsx';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ماموریت‌های اختصاصی — چند کارتِ دلخواه، بدونِ آپدیتِ اپ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * خواستهٔ مالک (۱۷ شهریور): «قبلِ ماموریتِ امروز یک قسمت به‌عنوانِ ماموریتِ
 * اختصاصی قرار بگیرد. این ماموریت را ادمین در پنل مشخص و امتیازدهی کند.
 * اگر ادمین این ماموریت را فعال کرد، کاربران همه این ماموریت را می‌بینند.
 * ادمین بتواند یک لینکِ قابلِ کلیک هم بسازد و حتی لینک را پشتِ کلماتی مثلِ
 * «اینجا کلیک کنید» بگذارد — با رنگِ مثلاً آبی یا سبز.»
 *
 * و (۲۹ شهریور): «اگه ادمین خواست چند تا ماموریتِ اختصاصی بتونه قرار بده.»
 *
 * ── چه چیزی اینجا تعیین می‌شود ────────────────────────────────────────────
 *
 *   • فهرستی از ماموریت‌ها؛ هر کدام با کلیدِ روشن/خاموشِ خودش.
 *   • عنوان + توضیح — همان چیزی که کاربر در کارتِ بالای «ماموریت‌های امروز»
 *     می‌خواند. ترتیبِ فهرست، همان ترتیبی است که کاربر می‌بیند.
 *   • امتیاز — به ازای هر کاربر، در «دفتر امتیاز» با منبعِ «ماموریت» ثبت
 *     می‌شود (نه با تنظیمِ دستی، پس قابلِ ردیابی است).
 *   • لینکِ اختیاری: نشانی + متنِ روی لینک + رنگ. اگر متن خالی بماند،
 *     «اینجا کلیک کنید» می‌نشیند.
 *   • «دورهٔ تازه» — همان ماموریت با شناسهٔ نو: همه (حتی کسانی که گرفته‌اند)
 *     دوباره می‌توانند امتیاز بگیرند.
 *
 * ── ذخیره، و اینکه چه چیزی را عوض می‌کند ────────────────────────────────
 *
 * کلِ فهرست با یک `PUT` ذخیره می‌شود (اتمیک: یا همه یا هیچ‌کدام). شناسهٔ
 * ماموریت‌های موجود دست‌نخورده می‌ماند، پس ویرایشِ یک کلمه در متن به همه
 * امتیازِ تازه نمی‌دهد؛ ماموریتی که در فهرست نیست، حذف شده است.
 *
 * ── چرا سقف ──────────────────────────────────────────────────────────────
 *
 * هر ماموریت یک کارتِ تمام‌عرض بالای «ماموریت‌های امروز» است. بدونِ سقف،
 * کارت‌ها صفحهٔ کاربر را می‌پوشانند و خودِ ماموریت‌های روزانه از دید بیرون
 * می‌رود. سقف از سرور می‌آید (`max`)، نه هاردکد در UI — یک عدد، دو جا،
 * یعنی روزی دو عددِ متفاوت.
 */

const EMPTY_LINK = { url: '', text: '', color: 'blue' };

/** رقمِ فارسی — تا «حداکثر ۱۰» نوشته شود، نه «حداکثر 10». */
const fa = (n) => Number(n || 0).toLocaleString('fa-IR');

let draftSeq = 0;
/** یک ردیفِ قابلِ ویرایش از فهرست. `key` فقط برای React است (شناسهٔ خالی هم دارد). */
const draftOf = (m = {}) => ({
  key: m.id || `draft-${++draftSeq}`,
  id: m.id || '',
  // ⚠️ کارتِ **تازه** پیش‌فرض روشن است (درسِ ۲۹ شهریور).
  //
  // مالک دو ماموریت ساخت و بعد گفت «فقط یکی رو نشون میده»: کارتِ دوم با
  // `enabled:false` ذخیره شده بود، چون «افزودن ماموریت» کارتِ خاموش می‌ساخت
  // و کلیدِ فعال در **پایینِ** کارتِ بلند بود؛ پرکردنِ عنوان و امتیاز و زدنِ
  // «ذخیره و اعمال» ظاهراً یعنی «این را اضافه کن»، ولی کارت بی‌صدا خاموش
  // می‌ماند. حالا افزودن = نشان بده؛ اگر کسی کارتِ پیش‌نویس می‌خواهد،
  // خاموشش می‌کند و همان لحظه هم هشدار می‌گیرد.
  enabled: m.id ? m.enabled === true : true,
  title: m.title || '',
  body: m.body || '',
  points: Number(m.points || 0),
  linkUrl: m.link?.url || EMPTY_LINK.url,
  linkText: m.link?.text || EMPTY_LINK.text,
  linkColor: m.link?.color === 'green' ? 'green' : 'blue',
});

export function CustomMissionPage({ request }) {
  const notify = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState('');
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({});
  // مُهرِ زمانیِ فهرست روی سرور. هنگامِ ذخیره پس فرستاده می‌شود تا اگر
  // تب/پنلِ دیگری در این فاصله فهرست را عوض کرده باشد، ذخیرهٔ ما کارِ او را
  // بی‌صدا پاک نکند (سرور ۴۰۹ می‌دهد و ما پیام روشن نشان می‌دهیم).
  const [stamp, setStamp] = useState('');
  const [meta, setMeta] = useState({
    colors: ['blue', 'green'], defaultLinkText: 'اینجا کلیک کنید', max: 5, hint: '',
  });

  const applyMissions = useCallback((list, colors) => {
    const rows = Array.isArray(list) ? list : [];
    setItems(rows.map(m => draftOf({
      ...m,
      link: { ...EMPTY_LINK, ...(m.link || {}), color: colors?.includes(m.link?.color) ? m.link.color : 'blue' },
    })));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    request('/api/admin/custom-mission')
      .then((d) => {
        const colors = d.colors || ['blue', 'green'];
        setMeta({
          colors,
          defaultLinkText: d.defaultLinkText || 'اینجا کلیک کنید',
          max: Number(d.max) || 5,
          hint: d.hint || '',
        });
        // `missions` پاسخِ تازه است؛ `mission` شکلِ قدیمی (تک‌ماموریتی) که
        // برای پنلی که روی نسخهٔ قدیمیِ سرور باز مانده باشد هم کار می‌کند.
        applyMissions(d.missions ?? (d.mission ? [d.mission] : []), colors);
        setStats(d.stats || {});
        setStamp(d.updatedAt || '');
      })
      .catch((e) => notify(e.message || 'خواندنِ ماموریت‌ها ناموفق بود', 'error'))
      .finally(() => setLoading(false));
  }, [request, notify, applyMissions]);

  useEffect(() => { load(); }, [load]);

  const activeCount = items.filter(m => m.enabled && m.title.trim()).length;
  // کارتی که کاربر **نمی‌بیند** ولی ادمین فکر می‌کند ساخته: عنوان دارد ولی
  // خاموش است. این عدد باید روی صفحه فریاد بزند، نه اینکه در زیرنویسِ کارت
  // گم شود.
  const offTitled = items.filter(m => !m.enabled && m.title.trim());
  const patch = (key, p) => setItems(rows => rows.map(r => (r.key === key ? { ...r, ...p } : r)));

  /** همهٔ کارت‌های دارای عنوان را یک‌جا روشن کن. */
  function enableAll() {
    setItems(rows => rows.map(r => (r.title.trim() ? { ...r, enabled: true } : r)));
    notify('همهٔ کارت‌های دارای عنوان روشن شدند — یادت نرود «ذخیره و اعمال» را بزنی', 'success');
  }

  function addItem() {
    if (items.length >= meta.max) {
      notify(`حداکثر ${fa(meta.max)} ماموریت — اول یکی را حذف کن یا همان را ویرایش کن`, 'error');
      return;
    }
    setItems(rows => [...rows, draftOf()]);
  }

  function move(index, delta) {
    setItems((rows) => {
      const next = [...rows];
      const target = index + delta;
      if (target < 0 || target >= next.length) return rows;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeItem(key) {
    if (!window.confirm('این ماموریت حذف شود؟ امتیازهای گرفته‌شدهٔ کاربران پاک نمی‌شود.')) return;
    setItems(rows => rows.filter(r => r.key !== key));
  }

  /**
   * «ارسال دوباره به همه» — همان ماموریت، دورهٔ تازه.
   *
   * چرا لازم است: کاربری که امتیازِ یک ماموریت را گرفته، آن کارت را دیگر
   * نمی‌بیند (خواستهٔ مالک). اگر ادمین بخواهد همان کار را دوباره بخواهد،
   * نباید متن را از نو بنویسد؛ این دکمه شناسهٔ ماموریت را عوض می‌کند و به
   * این ترتیب **همه** — از جمله کسانی که قبلاً گرفته‌اند — دوباره می‌بینند.
   *
   * ⚠️ ویرایشِ متن این کار را **نمی‌کند**: شناسه دست‌نخورده می‌ماند تا
   *    اصلاحِ یک غلطِ تایپی، به همه امتیازِ تازه پخش نکند.
   */
  async function resend(item) {
    if (item.id && !window.confirm(
      'ارسال دوباره به همه: کاربرانی که این ماموریت را گرفته‌اند هم دوباره آن را می‌بینند و می‌توانند امتیاز بگیرند. ادامه؟')) return;
    if (!item.id) { notify('اول ذخیره کن تا ارسالِ دوباره ممکن شود', 'error'); return; }
    setResetting(item.key);
    try {
      const r = await request(`/api/admin/custom-mission/${item.id}/reset`, { method: 'POST' });
      // هشدارِ صریح: کارت‌هایی با عنوان که خاموش‌اند به کاربر نمی‌رسند.
      const offTitled = items.filter(m => !m.enabled && m.title.trim());
      notify(
        offTitled.length
          ? `${r.message} — ولی ${fa(offTitled.length)} ماموریت خاموش است و دیده `
            + `نمی‌شود: ${offTitled.map(m => `«${m.title.trim()}»`).join('، ')}`
          : r.message,
        offTitled.length ? 'error' : 'success',
      );
      if (r.missions) applyMissions(r.missions, meta.colors);
      if (r.stats) setStats(r.stats);
      if (r.updatedAt) setStamp(r.updatedAt);
    } catch (e) {
      notify(e.message || 'ارسالِ دوباره ناموفق بود', 'error');
    } finally {
      setResetting('');
    }
  }

  async function save() {
    if (busy) return;

    // ── گاردِ پیش از ارسال (درسِ «فقط یکی رو نشون میده») ──────────────────
    // سرور «روشن بدونِ عنوان» را رد می‌کند؛ ولی پیامِ سرور برای ادمین
    // انتزاعی است. این‌جا دقیقاً می‌گوییم کدام کارت مشکل دارد، و اگر کارتی
    // عنوان دارد ولی خاموش است، هشدار می‌دهیم که دیده نمی‌شود — همان چیزی
    // که باگِ گزارش‌شده بود.
    const untitled = items
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.enabled && !m.title.trim());
    if (untitled.length) {
      notify(
        `کارتِ ${untitled.map(({ i }) => fa(i + 1)).join(' و ')} عنوان ندارد؛ `
        + 'عنوان را بنویس یا خاموشش کن — وگرنه با عنوانِ خالی نمی‌شود ذخیره کرد',
        'error',
      );
      return;
    }

    setBusy(true);
    try {
      const r = await request('/api/admin/custom-mission', {
        method: 'PUT',
        body: {
          ifUnchangedSince: stamp || undefined,
          items: items.map(m => ({
            id: m.id || undefined,
            enabled: m.enabled,
            title: m.title,
            body: m.body,
            points: Number(m.points) || 0,
            link: { url: m.linkUrl, text: m.linkText, color: m.linkColor },
          })),
        },
      });
      notify(r.message, 'success');
      if (r.missions) applyMissions(r.missions, meta.colors);
      if (r.stats) setStats(r.stats);
      if (r.updatedAt) setStamp(r.updatedAt);
    } catch (e) {
      notify(e.message || 'ذخیره ناموفق بود', 'error');
      // ۴۰۹ یعنی «فهرستِ سرور عوض شده». ویرایش‌های همین صفحه دست‌نخورده
      // می‌ماند (ادمین نباید کارِ نوشته‌اش را از دست بدهد) ولی مُهر تازه
      // می‌شود تا ذخیرهٔ بعدی — با آگاهیِ او — کار کند.
      if (e?.status === 409) {
        try {
          const fresh = await request('/api/admin/custom-mission');
          if (fresh.updatedAt) setStamp(fresh.updatedAt);
          if (fresh.stats) setStats(fresh.stats);
        } catch { /* اگر نخواند، همان پیامِ خطا برای ادمین کافی است */ }
      }
    } finally {
      setBusy(false);
    }
  }

  const linkColor = (color) => (color === 'green' ? '#22E7A6' : '#7DD8FF');
  const preview = items.filter(m => m.enabled && m.title.trim());

  return (
    <div className="grid" style={{ display: 'grid', gap: 16 }}>
      <Card
        title="ماموریت‌های اختصاصی"
        subtitle={meta.hint || 'کارت‌های بالای «ماموریت‌های امروز» برای همهٔ کاربران — بدون آپدیت اپ.'}
        action={(
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Badge tone={activeCount ? 'success' : 'neutral'}>
              {activeCount
                ? `${fa(activeCount)} ماموریت فعال — کاربران می‌بینند`
                : 'خاموش — کسی نمی‌بیند'}
            </Badge>
            {offTitled.length > 0 && (
              <Badge tone="warning">
                {fa(offTitled.length)} ماموریتِ نوشته‌شده خاموش است — دیده نمی‌شود
              </Badge>
            )}
            {offTitled.length > 0 && (
              <Button variant="secondary" onClick={enableAll}>همه را فعال کن</Button>
            )}
            <Button variant="secondary" icon={Plus} onClick={addItem}>
              افزودن ماموریت
            </Button>
            <Button icon={Save} loading={busy} onClick={save}>ذخیره و اعمال</Button>
          </div>
        )}
      >
        {loading ? (
          <p style={{ color: 'var(--gg-muted)' }}>در حال خواندن…</p>
        ) : items.length === 0 ? (
          <p style={{ color: 'var(--gg-muted)' }}>
            هنوز ماموریتی نساخته‌اید. با «افزودن ماموریت» اولین کارت را بسازید؛
            کارتِ تازه <b>فعال</b> ساخته می‌شود و بعد از «ذخیره و اعمال» به
            کاربران نشان داده می‌شود. اگر می‌خواهید کارتی فعلاً دیده نشود،
            فقط کلیدِ «فعال باشد» را در پایینِ همان کارت بردارید.
          </p>
        ) : (
          <p style={{ color: 'var(--gg-muted)', fontSize: 13, lineHeight: 1.9 }}>
            ترتیبِ زیر، همان ترتیبی است که کاربر می‌بیند. حداکثر {fa(meta.max)} ماموریت؛
            هر کاربر برای هر ماموریت <b>یک‌بار</b> امتیاز می‌گیرد و بعد آن کارت
            برای او پنهان می‌شود. <b>ویرایشِ متن</b> کارت را برای کسانی که گرفته‌اند
            برنمی‌گرداند؛ فقط <b>«ارسال دوباره به همه»</b> این کار را می‌کند.
          </p>
        )}
      </Card>

      {items.map((item, index) => {
        const spent = item.id ? stats[item.id] : null;
        return (
          <Card
            key={item.key}
            title={`ماموریت ${index + 1}${item.title.trim() ? ` — ${item.title.trim()}` : ''}`}
            subtitle={item.enabled
              ? (item.title.trim() ? 'فعال — همین حالا به کاربران نشان داده می‌شود' : 'فعال، ولی بدونِ عنوان هیچ‌چیز نشان داده نمی‌شود')
              : 'خاموش — کاربران این کارت را نمی‌بینند'}
            action={(
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                {!item.enabled && item.title.trim() && (
                  <Badge tone="warning">خاموش — دیده نمی‌شود</Badge>
                )}
                {spent && (
                  <Badge tone="neutral">
                    <Users size={12} style={{ marginInlineEnd: 4, verticalAlign: '-2px' }} />
                    {Number(spent.claims || 0).toLocaleString('fa-IR')} دریافت
                  </Badge>
                )}
                <Button variant="ghost" icon={ArrowUp} onClick={() => move(index, -1)}
                  disabled={index === 0} title="یک پله بالا" />
                <Button variant="ghost" icon={ArrowDown} onClick={() => move(index, 1)}
                  disabled={index === items.length - 1} title="یک پله پایین" />
                <Button variant="secondary" icon={RotateCcw} loading={resetting === item.key}
                  onClick={() => resend(item)}
                  title="کاربرانی که این ماموریت را گرفته‌اند هم دوباره آن را می‌بینند">ارسال دوباره به همه</Button>
                <Button variant="danger" icon={Trash2} onClick={() => removeItem(item.key)}>حذف</Button>
              </div>
            )}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <Field label="عنوان ماموریت" hint="حداکثر ۶۰ نویسه — همان خطِ درشتِ کارت.">
                <Input
                  value={item.title}
                  maxLength={60}
                  placeholder="مثلاً: کانال ما را دنبال کن"
                  onChange={(e) => patch(item.key, { title: e.target.value })}
                />
              </Field>

              <Field label="امتیاز" hint="به ازای هر کاربر، یک‌بار برای هر دوره؛ در دفتر امتیاز با منبعِ «ماموریت» ثبت می‌شود.">
                <Input
                  type="number"
                  min={0}
                  value={item.points}
                  onChange={(e) => patch(item.key, { points: e.target.value })}
                />
              </Field>
            </div>

            <Field label="توضیح" hint="حداکثر ۳۰۰ نویسه — یک جملهٔ روشن که بگوید کاربر چه کار کند.">
              <Textarea
                rows={3}
                maxLength={300}
                value={item.body}
                placeholder="مثلاً: وارد کانال شو و ما را دنبال کن؛ بعد دکمهٔ دریافت را بزن."
                onChange={(e) => patch(item.key, { body: e.target.value })}
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <Field label="نشانی لینک (اختیاری)" hint="فقط http:// یا https:// پذیرفته می‌شود؛ لینکِ نامعتبر ذخیره نمی‌شود.">
                <Input
                  value={item.linkUrl}
                  placeholder="https://t.me/…"
                  onChange={(e) => patch(item.key, { linkUrl: e.target.value })}
                />
              </Field>
              <Field label="متنِ روی لینک" hint="اگر خالی بماند، «اینجا کلیک کنید» می‌نشیند.">
                <Input
                  value={item.linkText}
                  maxLength={24}
                  placeholder={meta.defaultLinkText}
                  onChange={(e) => patch(item.key, { linkText: e.target.value })}
                />
              </Field>
              <Field label="رنگ لینک" hint="رنگِ متنِ لینک در اپ و وب.">
                <Select
                  value={item.linkColor}
                  onChange={(e) => patch(item.key, { linkColor: e.target.value })}
                >
                  <option value="blue">آبی</option>
                  <option value="green">سبز</option>
                </Select>
              </Field>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <input
                type="checkbox"
                checked={item.enabled}
                onChange={(e) => patch(item.key, { enabled: e.target.checked })}
              />
              <span style={{ fontWeight: 800 }}>
                فعال باشد — همهٔ کاربرانِ وب و اندروید این ماموریت را می‌بینند
              </span>
            </label>
          </Card>
        );
      })}

      <Card
        title="پیش‌نمایشِ زنده"
        subtitle="دقیقاً همان چیزی که کاربر در اپ و وب می‌بیند، با همین ترتیب."
        action={<Button variant="secondary" icon={Eye} onClick={load} loading={loading}>تازه‌سازی</Button>}
      >
        {preview.length === 0 ? (
          <p style={{ color: 'var(--gg-muted)' }}>
            هنوز ماموریتِ فعالی وجود ندارد. عنوان را پر کنید و کلیدِ «فعال» را روشن
            کنید تا پیش‌نمایش ساخته شود. تا آن لحظه، هیچ کاربری چیزی نمی‌بیند.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 10, maxWidth: 420 }}>
            {preview.map(item => (
              <div key={item.key} style={{
                padding: 14, borderRadius: 16,
                background: 'linear-gradient(135deg, #241b45, #0c2135)',
                border: '1px solid rgba(255,209,102,0.5)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <Megaphone size={16} color="#FFD166" />
                  <strong style={{ color: '#FFD166', fontSize: 12.5 }}>ماموریت اختصاصی</strong>
                  <span style={{ marginInlineStart: 'auto', color: '#FFD166', fontWeight: 900 }}>
                    +{Number(item.points || 0).toLocaleString('fa-IR')}
                  </span>
                </div>
                <div style={{ color: '#fff', fontWeight: 900, fontSize: 14.5, marginBottom: 4 }}>{item.title}</div>
                {item.body.trim() && (
                  <div style={{ color: '#B6C6D8', fontSize: 12, lineHeight: 1.7 }}>{item.body}</div>
                )}
                {item.linkUrl.trim() && (
                  <div style={{ marginTop: 7 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      color: linkColor(item.linkColor), fontWeight: 900, fontSize: 13,
                      textDecoration: 'underline',
                    }}>
                      <Link2 size={14} /> {item.linkText.trim() || meta.defaultLinkText}
                    </span>
                  </div>
                )}
                {Number(item.points) > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <span style={{
                      display: 'inline-block', padding: '7px 14px', borderRadius: 10, fontWeight: 900, fontSize: 12,
                      background: 'rgba(132,204,22,0.16)', border: '1px solid rgba(132,204,22,0.45)', color: '#B8F06B',
                    }}>دریافت امتیاز</span>
                  </div>
                )}
              </div>
            ))}
            <div style={{ color: '#94A3B8', fontSize: 10.5, lineHeight: 1.9 }}>
              این {preview.length} کارت، در وب و اندروید بالای «ماموریت‌های امروز»
              و به همین ترتیب نشان داده می‌شود. کاربری که امتیازِ یکی را گرفته،
              تا وقتی ماموریتِ تازه‌ای نگذاری دیگر آن کارت را نمی‌بیند.
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
