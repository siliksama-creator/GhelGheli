import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Save, Trophy, Wallet } from 'lucide-react';
import { fmtDateTime, fmtNumber } from '../lib/api.js';
import {
  Badge, Button, Card, EmptyState, Field, Input, Select, Table,
} from '../components/ui.jsx';
import { RankList } from '../components/rank-list.jsx';
import {
  JalaliDateInput, gregorianToJalali, jalaliToGregorian,
} from '../components/jalali-picker.jsx';
import { useToast } from '../lib/toast.jsx';

const MAX_PRIZE_RANK = 50;

/**
 * `datetime-local` قالب `YYYY-MM-DDTHH:mm:ss` و زمانِ **محلی** می‌خواهد.
 * `toISOString()` مستقیم، ساعت را به UTC می‌برد و مدیر تاریخی می‌بیند که
 * خودش نگذاشته.
 */

const KIND_OPTIONS = [
  { id: 'cash', label: 'نقدی (تومان)', unit: 'تومان', minValue: 0 },
  { id: 'points', label: 'امتیازی', unit: 'امتیاز', minValue: 1 },
  { id: 'plus_days', label: 'روز قلقلی پلاس', unit: 'روز', minValue: 1 },
];

function kindMeta(kind) {
  return KIND_OPTIONS.find((k) => k.id === kind) || KIND_OPTIONS[0];
}

/** یک ردیف را به جمله‌ای برای مدیر تبدیل می‌کند: «رتبهٔ ۳ → ۷ روز پلاس». */
function describeRow(row) {
  const value = Number(row?.value || 0);
  if (!value) return '—';
  const meta = kindMeta(row.kind);
  if (row.kind === 'cash') return `${fmtNumber(value)} تومان`;
  if (row.kind === 'plus_days') return `${fmtNumber(value)} روز پلاس`;
  return `${fmtNumber(value)} امتیاز`;
}

/** دو ستونِ ذخیره‌شدهٔ سرور → ردیف‌های یکپارچهٔ پنل (آینهٔ تابعِ هم‌نام در بک‌اند). */
function toPrizeRows(prizeTable, perkTable) {
  const rows = [];
  for (const p of prizeTable || []) {
    rows.push({ rank: Number(p.rank), kind: 'cash', value: Number(p.amount || 0), label: p.label || '' });
  }
  for (const p of perkTable || []) {
    rows.push({
      rank: Number(p.rank), kind: p.kind, value: Number(p.value || 0),
      itemSlug: p.itemSlug || p.item_slug || null, label: p.label || '',
    });
  }
  return rows.sort((a, b) => a.rank - b.rank);
}

const emptyForm = () => ({
  title: '', leagueType: 'monthly',
  startsAt: '', endsAt: '', startTime: '00:00:00', endTime: '23:59:59',
  countdownEnabled: true, plusOnly: false, minPointsEntry: 0,
});

function makeRows(count) {
  return Array.from({ length: count }, (_, i) => ({
    rank: i + 1, kind: 'cash', value: 0, label: '',
  }));
}

export function LeaguePage({ request }) {
  const notify = useToast();

  const [data, setData] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [shopItems, setShopItems] = useState([]);

  const [form, setForm] = useState(emptyForm());
  const [rows, setRows] = useState(() => makeRows(10));
  const [editingId, setEditingId] = useState('');
  const [saving, setSaving] = useState(false);
  const [closingId, setClosingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [approving, setApproving] = useState('');

  const load = useCallback(() =>
    request('/api/admin/league').then((x) => {
      setData(x);
      setShopItems(x.shopItems || []);
      // جدولِ یکپارچه از سرور می‌آید؛ اگر خالی بود همان پیش‌فرضِ ۱۰ رتبه.
      const loaded = Array.isArray(x.prizeRows) ? x.prizeRows : [];
      setRows(loaded.length
        ? loaded.map((r) => ({ ...r, label: r.label || '' }))
        : makeRows(10));
    }).catch(() => {}), [request]);

  const loadSeasons = useCallback(() =>
    request('/api/admin/league/seasons')
      .then((x) => setSeasons(x.seasons || []))
      .catch(() => setSeasons([])), [request]);

  const loadPayouts = useCallback(() =>
    request('/api/admin/league/payouts').then(setPayouts).catch(() => {}), [request]);

  // ⚠️ حتماً با آکولاد: اگر این effect یک Promise برگرداند، ری‌اکت آن را
  //    تابعِ پاک‌سازی فرض می‌کند و هنگام خروج از صفحه صدایش می‌زند →
  //    `TypeError: n is not a function` و پنل سفید می‌شود. روی سرور زنده
  //    بازتولید شده بود.
  useEffect(() => { load(); loadPayouts(); loadSeasons(); },
    [request, load, loadPayouts, loadSeasons]);

  function setField(patch) { setForm((f) => ({ ...f, ...patch })); }

  function startEditing(sn) {
    setEditingId(sn.id);
    const s = gregorianToJalali(sn.starts_at);
    const e = gregorianToJalali(sn.ends_at);
    setForm({
      title: sn.title || '',
      leagueType: sn.league_type || 'monthly',
      startsAt: s.date, startTime: s.time,
      endsAt: e.date, endTime: e.time,
      countdownEnabled: false,
      plusOnly: Boolean(sn.plus_only),
      minPointsEntry: Number(sn.min_points_entry || 0),
    });
    // ── جوایزِ همان لیگ ──
    //
    // ⚠️ مسیرِ جداگانه‌ای صدا نمی‌شود: فهرستِ لیگ‌ها (`seasons`) خودش
    //    `prize_table` و `perk_table` را دارد. یک درخواستِ تازه برای هر
    //    کلیک روی «ویرایش» یعنی رفت‌وبرگشتِ اضافه برای چیزی که از قبل
    //    در دست است — و مسیرِ تازه یعنی ثبت در مانیفست و گاردِ احراز.
    const loaded = toPrizeRows(sn.prize_table, sn.perk_table);
    setRows(loaded.length ? loaded : makeRows(10));
  }

  function startNew() { setEditingId(''); setForm(emptyForm()); setRows(makeRows(10)); }

  function changeRowCount(n) {
    const count = Math.max(1, Math.min(MAX_PRIZE_RANK, Number(n) || 1));
    setRows((prev) => Array.from({ length: count },
      (_, i) => prev[i] || { rank: i + 1, kind: 'cash', value: 0, label: '' }));
  }

  function setRow(i, patch) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  // خطاهایی که مدیر باید **قبل از ذخیره** ببیند، نه بعد از ۴۰۰ِ سرور.
  const rowProblems = rows.reduce((acc, r) => {
    const v = Number(r.value || 0);
    if (!Number.isFinite(v) || v < 0) acc.push(`مقدارِ رتبهٔ ${r.rank} معتبر نیست`);
    else if (r.kind !== 'cash' && v <= 0) acc.push(`جایزهٔ رتبهٔ ${r.rank} باید بزرگ‌تر از صفر باشد`);
    return acc;
  }, []);

  async function saveLeague() {
    const startAt = jalaliToGregorian(form.startsAt, form.startTime);
    const endAt = jalaliToGregorian(form.endsAt, form.endTime);

    if (rowProblems.length) { notify(rowProblems[0], 'error'); return; }

    if (editingId) {
      // ویرایشِ یک لیگِ موجود: فقط جوایز (تاریخ‌ها مسیرِ خودشان را دارند).
      setSaving(true);
      try {
        await request('/api/admin/league/current/prizes', {
          method: 'PATCH',
          body: { seasonId: editingId, prizeRows: rows },
        });
        notify('جوایزِ این لیگ ذخیره شد');
        load(); loadSeasons();
      } catch (e) {
        notify(e?.message || 'ذخیرهٔ جوایز ناموفق بود', 'error');
      } finally { setSaving(false); }
      return;
    }

    const title = form.title.trim();
    if (title.length < 3) { notify('نام لیگ حداقل ۳ نویسه باشد', 'error'); return; }
    if (!startAt || !endAt) {
      notify('تاریخ شمسیِ شروع و پایان را به شکل ۱۴۰۵/۰۷/۰۲ وارد کنید', 'error');
      return;
    }
    if (endAt <= startAt) { notify('تاریخ پایان باید بعد از شروع باشد', 'error'); return; }

    setSaving(true);
    try {
      const r = await request('/api/admin/league/seasons', {
        method: 'POST',
        body: {
          title,
          leagueType: form.leagueType,
          startsAt: startAt.toISOString(),
          endsAt: endAt.toISOString(),
          countdownEnabled: form.countdownEnabled,
          plusOnly: form.plusOnly,
          minPointsEntry: Number(form.minPointsEntry) || 0,
          prizeRows: rows,
        },
      });
      notify(r?.message || 'لیگ ساخته شد');
      startNew();
      load(); loadSeasons();
    } catch (e) {
      notify(e?.message || 'ساخت لیگ ناموفق بود', 'error');
    } finally { setSaving(false); }
  }

  async function closeSeason(id) {
    setClosingId(id);
    try {
      await request(`/api/admin/league/seasons/${id}/close`, { method: 'POST' });
      notify('لیگ بسته شد؛ جوایز برای تأیید آماده‌اند');
      loadSeasons(); loadPayouts(); load();
    } catch (e) {
      notify(e?.message || 'بستن لیگ ناموفق بود', 'error');
    } finally { setClosingId(''); }
  }

  /**
   * حذفِ کاملِ لیگ — برای گرفتنِ تستِ لیگ.
   *
   * جدا از «بستن» است: بستن لیگ را تمام‌شده اعلام می‌کند و صفِ جوایز را
   * پر می‌کند، ولی حذف طوری برش می‌دارد که انگار هرگز نبوده. برای لیگِ
   * آزمایشی همین لازم است. سرور اگر جایزه‌ای واقعاً پرداخت شده باشد
   * جلویش را می‌گیرد؛ اینجا فقط از مدیر تأیید می‌گیریم چون برگشت ندارد.
   */
  async function deleteSeason(sn) {
    if (!window.confirm(
      `لیگ «${sn.title || sn.month_year}» و همهٔ داده‌هایش حذف شود؟\n\n`
      + 'جدولِ امتیازها و جوایزِ تأییدنشدهٔ این لیگ هم پاک می‌شوند.\n'
      + 'این کار برگشت‌ناپذیر است.')) return;
    setDeletingId(sn.id);
    try {
      const r = await request(`/api/admin/league/seasons/${sn.id}`, { method: 'DELETE' });
      notify(r?.message || 'لیگ حذف شد');
      if (editingId === sn.id) startNew();
      loadSeasons(); loadPayouts(); load();
    } catch (e) {
      notify(e?.message || 'حذف لیگ ناموفق بود', 'error');
    } finally { setDeletingId(''); }
  }

  async function approve(id) {
    const one = payouts.find((p) => p.id === id);
    if (one && !window.confirm(
      `جایزهٔ «${one.nickname || one.mobile}» تأیید و تحویل شود؟\n\n`
      + `${prizeText(one)}\n\nاین کار برگشت‌ناپذیر است.`)) return;
    setApproving(id);
    try {
      const r = await request(`/api/admin/league/payouts/${id}/approve`, { method: 'POST', body: {} });
      notify(r.message || 'تأیید شد');
      loadPayouts();
    } catch (e) {
      notify(e?.message || 'تأیید ناموفق بود', 'error');
    } finally { setApproving(''); }
  }

  async function approveAll() {
    if (!window.confirm(
      `${fmtNumber(pending.length)} جایزه تأیید و تحویل شود؟\n\nاین کار برگشت‌ناپذیر است.`)) return;
    setApproving('all');
    try {
      const r = await request('/api/admin/league/payouts/approve-all', { method: 'POST', body: {} });
      notify(r.message || 'تأیید شد');
      loadPayouts();
    } catch (e) {
      notify(e?.message || 'تأیید ناموفق بود', 'error');
    } finally { setApproving(''); }
  }

  const pending = payouts.filter((p) => !p.paid_at
    && (Number(p.amount) > 0 || p.perk_kind));
  const paid = payouts.filter((p) => p.paid_at);
  const activeCount = seasons.filter((x) => x.status === 'active').length;

  return (
    <div className="stack">
      {data?.noActiveLeague && (
        <Card title="هیچ لیگی در جریان نیست"
          subtitle="کاربر در وب و اندروید پیام «هنوز لیگی ساخته نشده» را می‌بیند">
          <p className="lgHint">
            تا لیگی نسازید، امتیازِ بازی‌ها جایی جمع نمی‌شود. فرمِ پایین را پر کنید
            و دکمهٔ «ساخت لیگ» را بزنید.
          </p>
        </Card>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          بخش ۱ — کانفیگِ لیگ
          ══════════════════════════════════════════════════════════════════ */}
      <Card
        title={editingId ? 'ویرایشِ لیگ' : 'کانفیگ لیگ جدید'}
        subtitle="نام، تاریخ شمسیِ شروع و پایان، ثانیه‌شمار، ویژهٔ پلاس و جوایزِ رتبه‌ها"
        action={<Badge tone={activeCount ? 'success' : 'neutral'}>
          {fmtNumber(activeCount)} لیگ فعال
        </Badge>}
      >
        {seasons.length ? (
          <Table head={['عنوان', 'نوع', 'بازه', 'بازیکن', 'وضعیت', '']}>
            {seasons.slice(0, 10).map((sn) => (
              <tr key={sn.id} style={sn.id === editingId ? { background: 'rgba(255,255,255,.06)' } : undefined}>
                <td>{sn.title || sn.month_year}</td>
                <td><Badge tone="neutral">{sn.league_type}</Badge></td>
                <td className="lgSpan">
                  {fmtDateTime(sn.starts_at)}<span> تا </span>{fmtDateTime(sn.ends_at)}
                </td>
                <td>{fmtNumber(sn.player_count || 0)}</td>
                <td>
                  <Badge tone={sn.status === 'active' ? 'success' : 'neutral'}>
                    {sn.status === 'active' ? 'فعال' : 'بسته'}
                  </Badge>
                </td>
                <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {sn.status === 'active' && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => startEditing(sn)}>
                        ویرایش
                      </Button>
                      <Button variant="ghost" size="sm" loading={closingId === sn.id}
                        onClick={() => closeSeason(sn.id)}>بستن</Button>
                    </>
                  )}
                  {/* حذف برای لیگِ جاری هم هست — خواستهٔ مالک برای تست. */}
                  <Button variant="danger" size="sm" loading={deletingId === sn.id}
                    onClick={() => deleteSeason(sn)}>حذف</Button>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState icon={Trophy} title="هنوز لیگی ثبت نشده"
            message="با فرم پایین اولین لیگ را بسازید." />
        )}

        {editingId && (
          <p className="lgHint">
            در حال ویرایشِ یک لیگِ موجود — فقط جدولِ جوایز ذخیره می‌شود.
            <Button variant="ghost" size="sm" onClick={startNew} style={{ marginInlineStart: 8 }}>
              ساختِ لیگِ تازه
            </Button>
          </p>
        )}

        <div className="lgNewLeague">
          <Field label="نام لیگ"
            hint="بین ۳ تا ۱۲۰ نویسه. همین نام در وبِ کاربر و اندروید بالای جدول دیده می‌شود.">
            <Input value={form.title} placeholder="مثلاً لیگ برتر ماهانه"
              onChange={(e) => setField({ title: e.target.value })} />
          </Field>

          <Field label="نوع لیگ">
            <Select value={form.leagueType}
              onChange={(e) => setField({ leagueType: e.target.value })}>
              <option value="monthly">ماهانه</option>
              <option value="weekly">هفتگی</option>
              <option value="seasonal">فصلی</option>
              <option value="special">ویژه</option>
            </Select>
          </Field>

          <Field label="تاریخ شروع لیگ (شمسی)" hint="از تقویم انتخاب کنید؛ نیازی به تایپ نیست.">
            <JalaliDateInput value={form.startsAt} placeholder="انتخاب تاریخ شروع"
              onChange={(v) => setField({ startsAt: v })} />
            <Input type="time" step="1" value={form.startTime}
              onChange={(e) => setField({ startTime: e.target.value })} />
          </Field>

          <Field label="تاریخ پایان لیگ (شمسی)" hint="از تقویم انتخاب کنید؛ ساعتِ پایان را دقیق بگذارید.">
            <JalaliDateInput value={form.endsAt} placeholder="انتخاب تاریخ پایان"
              onChange={(v) => setField({ endsAt: v })} />
            <Input type="time" step="1" value={form.endTime}
              onChange={(e) => setField({ endTime: e.target.value })} />
          </Field>

          {/* ── ثانیه‌شمارِ خودکار ──
              خواستهٔ مالک: «اگه این تیک بخوره مثلاً زده باشیم لیگ ۷ مهر
              شروع میشه؛ هر چقدر تا ۷ مهر مونده اتوماتیک به عنوان ثانیه‌شمار
              قرار می‌گیره و تمامی قسمت‌هایی که سکه میدن بسته میشه.»
              پس زمانِ شمارش از همان تاریخِ شروع گرفته می‌شود و مدیر چیزی
              جداگانه وارد نمی‌کند که با تاریخِ لیگ ناهماهنگ بماند. */}
          <Field label="ثانیه‌شمارِ معکوس تا شروع لیگ"
            hint="از همین لحظه تا تاریخِ شروع، شمارشِ معکوس در صفحهٔ لیگِ وب و اندروید نمایش داده می‌شود و مسیرهایی که سکه می‌دهند (بازیِ آنلاینِ سهم‌دار و ضربه‌زن) بسته می‌مانند.">
            {!editingId && (
              <label className="lgCheck">
                <input type="checkbox" checked={form.countdownEnabled}
                  onChange={(e) => setField({ countdownEnabled: e.target.checked })} />
                <span>فعال باشد</span>
              </label>
            )}
            {editingId && <p className="lgHint">ثانیه‌شمار هنگامِ ساختِ لیگ تنظیم می‌شود.</p>}
          </Field>

          <Field label="ویژهٔ پلاس"
            hint="با این تیک، فقط مشترکانِ پلاس در این لیگ امتیاز می‌گیرند.">
            <label className="lgCheck">
              <input type="checkbox" checked={form.plusOnly}
                onChange={(e) => setField({ plusOnly: e.target.checked })} />
              <span>فقط مشترکان پلاس</span>
            </label>
          </Field>

          <Field label="حداقل امتیازِ ورود"
            hint="با امتیازِ کلِ عمرِ کاربر سنجیده می‌شود؛ ۰ یعنی بدونِ شرط.">
            <Input type="number" min="0" value={form.minPointsEntry}
              onChange={(e) => setField({ minPointsEntry: e.target.value })} />
          </Field>
        </div>

        {/* ── جدولِ جوایز: دونه‌دونهِ رتبه‌ها ── */}
        <div style={{ marginTop: 14, padding: 12, borderRadius: 14,
          background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <b>جوایزِ رتبه‌ها</b>
            <label className="lgHint" style={{ margin: 0 }}>تعداد رتبه‌های جایزه‌دار:</label>
            <Input type="number" min="1" max={MAX_PRIZE_RANK} value={rows.length}
              style={{ width: 84 }}
              onChange={(e) => changeRowCount(Number(e.target.value) || 1)} />
            <span className="lgHint">
              تا نفر {fmtNumber(MAX_PRIZE_RANK)} — هر رتبه می‌تواند نقدی، امتیازی
              یا چند روز قلقلی پلاس باشد
            </span>
          </div>

          <div style={{ marginTop: 10, overflowX: 'auto' }}>
            <Table head={['رتبه', 'نوع جایزه', 'مقدار', 'توضیح (اختیاری)', '']}>
              {rows.map((r, i) => {
                const meta = kindMeta(r.kind);
                const bad = r.kind !== 'cash' && Number(r.value || 0) <= 0;
                return (
                  <tr key={`row-${i}`}>
                    <td style={{ width: 72 }}>{fmtNumber(r.rank)}</td>
                    <td style={{ width: 168 }}>
                      <Select value={r.kind}
                        onChange={(e) => setRow(i, {
                          kind: e.target.value,
                          // مقدارِ پیش‌فرضِ منطقی برای هر نوع؛ وگرنه «۷ امتیاز»
                          // یا «۵۰۰۰ روز پلاس» ساخته می‌شود.
                          value: e.target.value === 'cash' ? 0
                            : e.target.value === 'points' ? 5000 : 7,
                        })}>
                        {KIND_OPTIONS.map((k) => (
                          <option key={k.id} value={k.id}>{k.label}</option>
                        ))}
                      </Select>
                    </td>
                    <td style={{ width: 140 }}>
                      <Input type="number" min={meta.minValue} value={r.value}
                        onChange={(e) => setRow(i, { value: Number(e.target.value) || 0 })} />
                      <span className="lgHint">{meta.unit}</span>
                      {bad && <small className="lgWarn">باید بزرگ‌تر از صفر باشد</small>}
                    </td>
                    <td>
                      <Input value={r.label || ''} placeholder={describeRow(r)}
                        onChange={(e) => setRow(i, { label: e.target.value })} />
                    </td>
                    <td style={{ width: 64 }}>
                      <Button variant="ghost" size="sm"
                        onClick={() => setRow(i, { kind: 'cash', value: 0, label: '' })}>
                        پاک‌کردن
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </div>

          {!!rowProblems.length && (
            <p className="lgWarn" style={{ marginTop: 8 }}>
              {rowProblems.join(' · ')}
            </p>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <Button icon={Save} onClick={saveLeague} loading={saving}>
            {editingId ? 'ذخیرهٔ جوایزِ این لیگ' : 'ساخت لیگ'}
          </Button>
        </div>
      </Card>

      {/* ══════════════════════════════════════════════════════════════════
          بخش ۲ — جوایزِ منتظرِ تأیید
          ══════════════════════════════════════════════════════════════════ */}
      <Card
        title="جوایز منتظر تأیید"
        subtitle="با تأیید، هر جایزه متناسب با نوعش تحویل می‌شود: نقدی به کیف پول، امتیازی به امتیازِ کاربر، پلاس به اشتراک"
        action={!!pending.length && (
          <Button icon={CheckCircle2} loading={approving === 'all'} onClick={approveAll}>
            تأیید و تحویل همه
          </Button>
        )}
      >
        {pending.length ? (
          <Table head={['رتبه', 'کاربر', 'جایزه', 'ماه', '']}>
            {pending.map((p) => (
              <tr key={p.id}>
                <td>{fmtNumber(p.rank)}</td>
                <td>
                  {p.nickname || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'بی‌نام'}
                  <div className="lgHint">{p.mobile}</div>
                </td>
                <td>{prizeText(p)}</td>
                <td>{p.month_year || '—'}</td>
                <td>
                  <Button size="sm" icon={Wallet} loading={approving === p.id}
                    onClick={() => approve(p.id)}>تأیید و تحویل</Button>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState icon={Trophy} title="جایزهٔ منتظری ندارید"
            message="پس از بستنِ یک لیگ، جوایزِ برندگان اینجا برای تأیید می‌آیند." />
        )}
      </Card>

      {/* ══════════════════════════════════════════════════════════════════
          بخش ۳ — لیدربرد زنده
          ══════════════════════════════════════════════════════════════════ */}
      <Card title="لیدربرد زنده" subtitle="به‌روزرسانی خودکار بر اساس امتیازِ لیگِ جاری">
        {data ? <RankList entries={data.entries} /> : null}
        {data && !data.entries?.length && !data.noActiveLeague && (
          <EmptyState icon={Trophy} title="هنوز امتیازی ثبت نشده" />
        )}
      </Card>

      {!!paid.length && (
        <Card title="جوایز تحویل‌شده" subtitle="۳۰ موردِ آخر">
          <Table
            cols={['رتبه', 'کاربر', 'جایزه', 'ماه', 'زمان تحویل']}
            rows={paid.slice(0, 30).map((p) => [
              fmtNumber(p.rank),
              p.nickname || p.mobile,
              prizeText(p),
              p.month_year || '—',
              fmtDateTime(p.paid_at),
            ])}
          />
        </Card>
      )}
    </div>
  );
}

/**
 * متنِ یک ردیفِ جایزه برای مدیر.
 *
 * یک برنده می‌تواند هم‌زمان نقدی و غیرنقدی داشته باشد (مثلاً رتبهٔ ۱:
 * ۵۰۰ هزار تومان + ۳۰ روز پلاس)؛ هر دو در یک ردیف نشسته‌اند و مدیر باید
 * هر دو را ببیند، وگرنه نصفِ جایزه از چشمش پنهان می‌ماند.
 */
function prizeText(p) {
  const parts = [];
  const amount = Number(p.amount || 0);
  if (amount > 0) parts.push(`${fmtNumber(amount)} تومان — کیف پول`);
  const kind = p.perk_kind;
  const value = Number(p.perk_value || 0);
  if (kind === 'points') parts.push(`${fmtNumber(value)} امتیاز`);
  else if (kind === 'plus_days') parts.push(`${fmtNumber(value)} روز قلقلی پلاس`);
  else if (kind === 'shop_item') parts.push(`آیتم فروشگاه: ${p.perk_item_slug || '—'}`);
  else if (kind === 'card_box') parts.push(`${fmtNumber(value)} صندوق کارت`);
  return parts.length ? parts.join(' + ') : '—';
}
