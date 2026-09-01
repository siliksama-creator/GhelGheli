import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Save, Trophy, Wallet } from 'lucide-react';
import { fmtDateTime, fmtNumber } from '../lib/api.js';
import {
  Badge, Button, Card, EmptyState, Field, Input, Table,
} from '../components/ui.jsx';
import { RankList } from '../components/rank-list.jsx';
import { useToast } from '../lib/toast.jsx';

/**
 * `datetime-local` قالبِ `YYYY-MM-DDTHH:mm` می‌خواهد و **بدونِ** منطقهٔ
 * زمانی. `toISOString()` به UTC تبدیل می‌کند و ساعت را ۳:۳۰ جابه‌جا
 * نشان می‌دهد — یعنی مدیر تاریخی را می‌بیند که خودش نگذاشته.
 *
 * این تابع زمانِ **محلی** را در همان قالب می‌سازد.
 */
function toLocalInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LeaguePage({ request }) {
  const notify = useToast();
  const [data, setData] = useState(null);
  const [winnerCount, setWinnerCount] = useState(10);
  const [prizes, setPrizes] = useState(Array.from({ length: 10 }, (_, i) => ({ rank: i + 1, amount: 0 })));
  const [saving, setSaving] = useState(false);

  // ── جوایزِ غیرنقدی (دورِ ۲۶) ──
  //
  // خواستهٔ مالک: «جایزه نقدی بین ۵۰ نفر، ۲۰ نفر بعدی جوایز غیرنقدی».
  // ردیف‌ها آزادند: مدیر خودش رتبه را می‌نویسد، پس اگر فردا خواست
  // رتبهٔ ۱ هم پلاس بگیرد، بدونِ تغییرِ کد ممکن است.
  const [perks, setPerks] = useState([]);
  const [shopItems, setShopItems] = useState([]);
  const [editingTitle, setEditingTitle] = useState('');

  // ── تاریخِ فصل، به‌دستِ مدیر ──
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [savingDates, setSavingDates] = useState(false);

  // ── جوایزِ منتظرِ تأیید ──
  const [payouts, setPayouts] = useState([]);
  const [approving, setApproving] = useState('');

  // ── چند لیگِ هم‌زمان ──
  //
  // خواستهٔ مالک: «ادمین بتونه ۲ لیگ رو هم زمان قرار بده و زمان شروع و
  // پایان رو ادمین مشخص کنه». جدول از قبل چند لیگِ فعال را می‌پذیرفت
  // ولی هیچ رابطی برای ساختنشان نبود — لیگِ دوم دستی با SQL درج شده بود.
  const [seasons, setSeasons] = useState([]);
  const [newLeague, setNewLeague] = useState({
    title: '', leagueType: 'weekly', startsAt: '', endsAt: '',
    minPointsEntry: 0, plusOnly: false,
  });
  const [creating, setCreating] = useState(false);
  const [closingId, setClosingId] = useState('');

  const load = () =>
    request('/api/admin/league').then((x) => {
      setData(x);
      // ⚠️ از `x.prizeTable` خوانده می‌شود نه `x.season.prize_table`.
      //    `season` در پاسخ، فصلی است که لیدربرد نشان می‌دهد؛ ذخیره اما
      //    روی فصلِ دیگری می‌نشیند. سرور حالا صریحاً جدولِ همان فصلی را
      //    که PATCH ویرایش می‌کند برمی‌گرداند.
      const table = x.prizeTable?.length ? x.prizeTable : x.season?.prize_table;
      if (table?.length) setPrizes(table);
      setWinnerCount(x.winnerCount || table?.length || 10);
      setPerks(Array.isArray(x.perkTable) ? x.perkTable : []);
      setShopItems(x.shopItems || []);
      setEditingTitle(x.editingSeasonTitle || '');
      setStartsAt(toLocalInput(x.season?.starts_at));
      setEndsAt(toLocalInput(x.season?.ends_at));
    });

  const loadSeasons = useCallback(() =>
    request('/api/admin/league/seasons')
      .then((x) => setSeasons(x.seasons || []))
      .catch(() => setSeasons([])), [request]);

  const loadPayouts = useCallback(
    () => request('/api/admin/league/payouts').then(setPayouts).catch(() => {}),
    [request]);
  // ═══════════════════════════════════════════════════════════════════
  // چرا () => { load(); } و نه useEffect(load, ...)
  // ═══════════════════════════════════════════════════════════════════
  //
  // اگر `load` یک Promise برگرداند (یعنی arrow بدون آکولاد)، ری‌اکت آن
  // مقدارِ برگشتی را **تابعِ پاک‌سازی** فرض می‌کند و هنگام خروج از صفحه
  // صدایش می‌زند. یک Promise تابع نیست، پس:
  //
  //     TypeError: n is not a function
  //
  // و کل پنل سفید می‌شود. روی سرور زنده بازتولید شد: رفتن به «لیگ
  // ماهانه» و بعد «کاربران» → پنل خالی، بدنهٔ صفحه صفر بایت.
  //
  // پیچیدنِ فراخوانی در آکولاد یعنی effect همیشه undefined برمی‌گرداند
  // و ری‌اکت هیچ‌وقت چیزی را به‌عنوان cleanup صدا نمی‌زند.
  useEffect(() => { load(); loadPayouts(); loadSeasons(); },
    [request, loadPayouts, loadSeasons]);

  async function createLeague() {
    const t = newLeague.title.trim();
    if (t.length < 3) { notify('عنوان لیگ حداقل ۳ نویسه باشد', 'error'); return; }
    if (!newLeague.startsAt || !newLeague.endsAt) {
      notify('تاریخ شروع و پایان را کامل کنید', 'error'); return;
    }
    if (new Date(newLeague.endsAt) <= new Date(newLeague.startsAt)) {
      notify('تاریخ پایان باید بعد از شروع باشد', 'error'); return;
    }
    setCreating(true);
    try {
      await request('/api/admin/league/seasons', {
        method: 'POST',
        body: {
          title: t,
          leagueType: newLeague.leagueType,
          startsAt: new Date(newLeague.startsAt).toISOString(),
          endsAt: new Date(newLeague.endsAt).toISOString(),
          minPointsEntry: Number(newLeague.minPointsEntry) || 0,
          plusOnly: newLeague.plusOnly,
        },
      });
      notify('لیگ تازه ساخته شد');
      setNewLeague({ title: '', leagueType: 'weekly', startsAt: '', endsAt: '',
        minPointsEntry: 0, plusOnly: false });
      loadSeasons(); load();
    } catch (e) {
      notify(e?.message || 'ساخت لیگ ناموفق بود', 'error');
    } finally { setCreating(false); }
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

  function changeWinnerCount(n) {
    setWinnerCount(n);
    setPrizes((prev) => Array.from({ length: n }, (_, i) => prev[i] || { rank: i + 1, amount: 0 }));
  }

  async function save() {
    setSaving(true);
    try {
      await request('/api/admin/league/current/prizes', {
        method: 'PATCH',
        body: { prizeTable: prizes, perkTable: perks, winnerCount },
      });
      notify('جوایز لیگ ذخیره شد');
      load();
    } catch (e) {
      // پیامِ اعتبارسنجیِ سرور باید دیده شود. بدونِ این، ردیفِ خرابِ
      // جدولِ غیرنقدی بی‌صدا ذخیره نمی‌شد و مدیر خیال می‌کرد شده.
      notify(e?.message || 'ذخیره جوایز ناموفق بود', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveDates() {
    if (!startsAt || !endsAt) {
      notify('هر دو تاریخ را وارد کنید', 'error');
      return;
    }
    if (new Date(endsAt) <= new Date(startsAt)) {
      notify('تاریخ پایان باید بعد از تاریخ شروع باشد', 'error');
      return;
    }
    setSavingDates(true);
    try {
      // ⚠️ `new Date(local).toISOString()` لازم است: ورودی زمانِ محلی
      //    است و سرور ISO با منطقهٔ زمانی می‌خواهد.
      await request('/api/admin/league/current/dates', {
        method: 'PATCH',
        body: {
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
        },
      });
      notify('تاریخ لیگ ذخیره شد');
      load();
    } finally {
      setSavingDates(false);
    }
  }

  async function approve(id) {
    const one = payouts.find((p) => p.id === id);
    if (one && !window.confirm(
      `واریز ${fmtNumber(one.amount)} تومان به «`
      + `${one.nickname || one.mobile}» تأیید شود؟\n\n`
      + 'این کار برگشت‌ناپذیر است.')) return;
    setApproving(id);
    try {
      const r = await request(`/api/admin/league/payouts/${id}/approve`,
        { method: 'POST', body: {} });
      notify(r.message || 'واریز شد');
      loadPayouts();
    } finally {
      setApproving('');
    }
  }

  async function approveAll() {
    const pending = payouts.filter((p) => !p.paid_at && Number(p.amount) > 0);
    const sum = pending.reduce((a, p) => a + Number(p.amount || 0), 0);
    if (!window.confirm(
      `واریز ${fmtNumber(pending.length)} جایزه به مجموع `
      + `${fmtNumber(sum)} تومان تأیید شود؟\n\nاین کار برگشت‌ناپذیر است.`)) return;
    setApproving('all');
    try {
      const r = await request('/api/admin/league/payouts/approve-all',
        { method: 'POST', body: {} });
      notify(r.message || 'واریز شد');
      loadPayouts();
    } finally {
      setApproving('');
    }
  }

  const pending = payouts.filter((p) => !p.paid_at && Number(p.amount) > 0);
  const pendingSum = pending.reduce((a, p) => a + Number(p.amount || 0), 0);

  const PERK_KINDS = [
    { id: 'plus_days', label: 'روز اشتراک پلاس', unit: 'روز' },
    { id: 'points', label: 'امتیاز', unit: 'امتیاز' },
    { id: 'shop_item', label: 'آیتم فروشگاه', unit: '' },
    { id: 'card_box', label: 'صندوق کارت', unit: 'صندوق' },
  ];

  function addPerkRow() {
    // رتبهٔ پیشنهادی: درست بعدِ آخرین رتبه‌ای که جایزه دارد. مدیری که
    // ۲۰ ردیف پشتِ هم می‌سازد نباید ۲۰ بار رتبه تایپ کند.
    const used = new Set(perks.map((p) => Number(p.rank)));
    let next = Number(winnerCount) + 1;
    while (used.has(next)) next += 1;
    setPerks((ps) => [...ps, {
      rank: next, kind: 'plus_days', value: 7, itemSlug: null, label: '',
    }]);
  }

  function setPerk(i, patch) {
    setPerks((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }

  // رتبهٔ تکراری را سرور رد می‌کند؛ اینجا هم نشان داده می‌شود تا مدیر
  // قبل از ذخیره ببیند.
  const perkRankCounts = perks.reduce((m, p) => {
    const k = Number(p.rank);
    m[k] = (m[k] || 0) + 1;
    return m;
  }, {});

  return (
    <div className="stack">
      {/* ══ جوایزِ منتظرِ تأیید ══
          خواستهٔ مالک: «جوایز لیگ بعد از تایید مدیریت به کیف پول ها
          داده میشه». بالای صفحه چون فوری‌ترین کارِ مدیر است. */}
      {!!pending.length && (
        <Card
          title={`${fmtNumber(pending.length)} جایزه منتظر تأیید شماست`}
          subtitle={`مجموع ${fmtNumber(pendingSum)} تومان — تا تأیید نکنید به کیف پول واریز نمی‌شود`}
          action={(
            <Button icon={CheckCircle2} loading={approving === 'all'}
              onClick={approveAll}>
              تأیید و واریز همه
            </Button>
          )}>
          <Table
            cols={['رتبه', 'کاربر', 'موبایل', 'مبلغ', 'ماه', '']}
            rows={pending.map((p) => [
              fmtNumber(p.rank),
              p.nickname || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'بی‌نام',
              p.mobile,
              <b key="a">{fmtNumber(p.amount)}</b>,
              p.month_year || '—',
              <Button key="b" size="sm" icon={Wallet}
                loading={approving === p.id}
                onClick={() => approve(p.id)}>واریز</Button>,
            ])}
          />
        </Card>
      )}

      {/* ══ تاریخِ فصل ══ */}
      <Card title="تاریخ شروع و پایان لیگ"
        subtitle={data?.season?.manual_dates
          ? 'تاریخ‌ها دستی تنظیم شده‌اند و خودکار تغییر نمی‌کنند'
          : 'در حال حاضر خودکار از تقویم شمسی محاسبه می‌شود'}
        action={data?.season?.manual_dates
          ? <Badge tone="success">دستی</Badge>
          : <Badge tone="neutral">خودکار</Badge>}>
        <div className="lgDates">
          <Field label="شروع فصل">
            <Input type="datetime-local" value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label="پایان فصل">
            <Input type="datetime-local" value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
        </div>
        <p className="lgHint">
          پس از رسیدن به تاریخ پایان، با زدن «بستن فصل» رتبه‌ها نهایی
          می‌شوند و جوایز در فهرست بالا برای تأیید شما قرار می‌گیرند.
        </p>
        <Button icon={CalendarClock} onClick={saveDates} loading={savingDates}>
          ذخیره تاریخ‌ها
        </Button>
      </Card>

      {/* ══ چند لیگِ هم‌زمان ══
          خواستهٔ مالک: «ادمین بتونه ۲ لیگ رو هم زمان قرار بده».
          امتیازِ هر بازی به **همهٔ** لیگ‌های فعالی می‌رود که بازهٔ
          زمانی‌شان باز است و کاربر شرطِ ورودشان را دارد. */}
      <Card title="لیگ‌های هم‌زمان"
        subtitle="می‌توانید تا سه لیگ فعال داشته باشید؛ امتیاز هر بازی به همهٔ آن‌ها می‌رود"
        action={<Badge tone={seasons.filter(x => x.status === 'active').length > 1 ? 'success' : 'neutral'}>
          {fmtNumber(seasons.filter(x => x.status === 'active').length)} لیگ فعال
        </Badge>}>
        {seasons.length ? (
          <Table head={['عنوان', 'نوع', 'بازه', 'بازیکن', 'وضعیت', '']}>
            {seasons.slice(0, 10).map((sn) => (
              <tr key={sn.id}>
                <td>{sn.title}</td>
                <td><Badge tone="neutral">{sn.league_type}</Badge></td>
                <td className="lgSpan">
                  {fmtDateTime(sn.starts_at)}
                  <span> تا </span>
                  {fmtDateTime(sn.ends_at)}
                </td>
                <td>{fmtNumber(sn.player_count || 0)}</td>
                <td>
                  <Badge tone={sn.status === 'active' ? 'success' : 'neutral'}>
                    {sn.status === 'active' ? 'فعال' : 'بسته'}
                  </Badge>
                </td>
                <td>
                  {sn.status === 'active' && (
                    <Button variant="ghost" loading={closingId === sn.id}
                      onClick={() => closeSeason(sn.id)}>بستن</Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState title="هنوز لیگی ثبت نشده"
            message="با فرم پایین اولین لیگ را بسازید." />
        )}

        <div className="lgNewLeague">
          <Field label="عنوان لیگ">
            <Input value={newLeague.title} placeholder="مثلاً لیگ هفتگی قهرمانان"
              onChange={(e) => setNewLeague({ ...newLeague, title: e.target.value })} />
          </Field>
          <Field label="نوع">
            <select className="input" value={newLeague.leagueType}
              onChange={(e) => setNewLeague({ ...newLeague, leagueType: e.target.value })}>
              <option value="weekly">هفتگی</option>
              <option value="monthly">ماهانه</option>
              <option value="seasonal">فصلی</option>
              <option value="special">ویژه</option>
            </select>
          </Field>
          <Field label="شروع">
            <Input type="datetime-local" value={newLeague.startsAt}
              onChange={(e) => setNewLeague({ ...newLeague, startsAt: e.target.value })} />
          </Field>
          <Field label="پایان">
            <Input type="datetime-local" value={newLeague.endsAt}
              onChange={(e) => setNewLeague({ ...newLeague, endsAt: e.target.value })} />
          </Field>
          <Field label="حداقل امتیاز ورود">
            <Input type="number" min="0" value={newLeague.minPointsEntry}
              onChange={(e) => setNewLeague({ ...newLeague, minPointsEntry: e.target.value })} />
          </Field>
          <Field label="ویژهٔ پلاس">
            <label className="lgCheck">
              <input type="checkbox" checked={newLeague.plusOnly}
                onChange={(e) => setNewLeague({ ...newLeague, plusOnly: e.target.checked })} />
              <span>فقط مشترکان پلاس امتیاز بگیرند</span>
            </label>
          </Field>
        </div>
        <Button icon={Trophy} onClick={createLeague} loading={creating}>
          ساخت لیگ تازه
        </Button>
      </Card>

    <div className="card-grid cols-2">
      <Card title="لیدربرد زنده" subtitle="به‌روزرسانی خودکار بر اساس امتیاز ماه جاری">
        {data ? <RankList entries={data.entries} /> : null}
      </Card>
      <Card title="تعداد برندگان و جدول جوایز" subtitle="مبلغ هر رتبه در پایان ماه به کاربر تعلق می‌گیرد">
        <Field label="تعداد برندگان نقدی (۱ تا ۳۰۰)">
          <Input type="number" min="1" max="300" value={winnerCount} onChange={(e) => changeWinnerCount(Number(e.target.value) || 0)} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {prizes.map((p, i) => (
            <Field key={p.rank} label={`رتبه ${fmtNumber(p.rank)}`}>
              <Input
                type="number"
                value={p.amount}
                onChange={(e) => setPrizes((ps) => ps.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) || 0 } : x)))}
              />
            </Field>
          ))}
        </div>
        <Button icon={Save} onClick={save} loading={saving} className="btn-block" style={{ marginTop: 8 }}>
          ذخیره جدول جوایز
        </Button>
      </Card>
    </div>

      {/* ══ جوایزِ غیرنقدی ══
          خواستهٔ مالک: «جایزه نقدی بین ۵۰ نفر، ۲۰ نفر بعدی جوایز
          غیرنقدی (پلاس، صندوق کارت، آیتم‌های شاپ)».

          مرزِ جایزه یک صخره است: نفرِ ۵۰ پول می‌برد و نفرِ ۵۱ هیچ. این
          رده صخره را به پله تبدیل می‌کند، بی‌آنکه یک ریال به هزینهٔ
          نقدی اضافه شود. */}
      <Card title="جوایز غیرنقدی"
        subtitle={`نفرات بعد از رتبهٔ ${fmtNumber(winnerCount)} — پلاس، صندوق کارت، آیتم فروشگاه یا امتیاز. بلافاصله پس از بستن فصل خودکار تحویل می‌شود و نیازی به تأیید مالی ندارد.`}
        action={<Badge tone={perks.length ? 'success' : 'neutral'}>
          {fmtNumber(perks.length)} رتبه
        </Badge>}>
        {perks.length ? (
          <Table head={['رتبه', 'نوع جایزه', 'مقدار', 'عنوان دلخواه', '']}>
            {perks.map((p, i) => (
              <tr key={`perk-${i}`}>
                <td style={{ width: 96 }}>
                  <Input type="number" min="1" max="100" value={p.rank}
                    onChange={(e) => setPerk(i, { rank: Number(e.target.value) || 0 })} />
                  {perkRankCounts[Number(p.rank)] > 1 && (
                    <small className="lgWarn">رتبهٔ تکراری</small>
                  )}
                </td>
                <td style={{ width: 168 }}>
                  <select className="input" value={p.kind}
                    onChange={(e) => setPerk(i, {
                      kind: e.target.value,
                      // مقدارِ پیش‌فرضِ منطقی برای هر نوع، وگرنه «۷ امتیاز»
                      // یا «۵۰۰۰ روز پلاس» ساخته می‌شود.
                      value: e.target.value === 'points' ? 5000
                        : e.target.value === 'plus_days' ? 7 : 1,
                      itemSlug: e.target.value === 'shop_item'
                        ? (p.itemSlug || shopItems[0]?.slug || null) : null,
                    })}>
                    {PERK_KINDS.map((k) => (
                      <option key={k.id} value={k.id}>{k.label}</option>
                    ))}
                  </select>
                </td>
                <td>
                  {p.kind === 'shop_item' ? (
                    <select className="input" value={p.itemSlug || ''}
                      onChange={(e) => setPerk(i, { itemSlug: e.target.value })}>
                      <option value="">— انتخاب آیتم —</option>
                      {shopItems.map((it) => (
                        <option key={it.slug} value={it.slug}>{it.name}</option>
                      ))}
                    </select>
                  ) : (
                    <Input type="number" min="1" value={p.value}
                      onChange={(e) => setPerk(i, { value: Number(e.target.value) || 0 })} />
                  )}
                </td>
                <td>
                  <Input value={p.label || ''} placeholder="اختیاری — مثلاً جایزه ویژه نوروز"
                    onChange={(e) => setPerk(i, { label: e.target.value })} />
                </td>
                <td style={{ width: 64 }}>
                  <Button variant="ghost" size="sm"
                    onClick={() => setPerks((ps) => ps.filter((_, j) => j !== i))}>
                    حذف
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState icon={Trophy} title="جایزه غیرنقدی ندارید"
            message={`با دکمهٔ پایین برای نفرات بعد از رتبهٔ ${fmtNumber(winnerCount)} جایزه بگذارید.`} />
        )}

        <div className="lgPerkActions">
          <Button variant="ghost" onClick={addPerkRow}>افزودن رتبه</Button>
          {/* میان‌بُر: دقیقاً همان چیزی که مالک خواست — ۲۰ نفرِ بعدی. */}
          <Button variant="ghost" onClick={() => {
            const start = Number(winnerCount) + 1;
            setPerks(Array.from({ length: 20 }, (_, i) => ({
              rank: start + i, kind: 'plus_days', value: 7,
              itemSlug: null, label: '',
            })));
          }}>
            ساخت ۲۰ رتبهٔ بعدی با ۷ روز پلاس
          </Button>
          <Button icon={Save} onClick={save} loading={saving}>
            ذخیره جوایز غیرنقدی
          </Button>
        </div>
        <p className="lgHint">
          جوایز غیرنقدی برخلاف جایزهٔ نقدی، منتظر تأیید نمی‌مانند و همان
          لحظهٔ بستن فصل به کاربر می‌رسند.
          {editingTitle ? ` این جدول برای «${editingTitle}» ذخیره می‌شود.` : ''}
        </p>
      </Card>

      {/* ══ تاریخچهٔ واریزها ══ */}
      {!!payouts.filter((p) => p.paid_at).length && (
        <Card title="جوایز واریزشده" subtitle="۳۰ واریز آخر — هر ردیف یعنی پول به کیف پول کاربر رفته است">
          <Table
            cols={['رتبه', 'کاربر', 'مبلغ', 'ماه', 'زمان واریز']}
            rows={payouts.filter((p) => p.paid_at).slice(0, 30).map((p) => [
              fmtNumber(p.rank),
              p.nickname || p.mobile,
              fmtNumber(p.amount),
              p.month_year || '—',
              fmtDateTime(p.paid_at),
            ])}
          />
        </Card>
      )}

      {!payouts.length && (
        <Card title="جوایز لیگ">
          <EmptyState icon={Trophy} title="هنوز جایزه‌ای ثبت نشده"
            message="پس از بستن فصل، جوایز اینجا برای تأیید نمایش داده می‌شوند." />
        </Card>
      )}
    </div>
  );
}
