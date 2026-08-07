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

  // ── تاریخِ فصل، به‌دستِ مدیر ──
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [savingDates, setSavingDates] = useState(false);

  // ── جوایزِ منتظرِ تأیید ──
  const [payouts, setPayouts] = useState([]);
  const [approving, setApproving] = useState('');

  const load = () =>
    request('/api/admin/league').then((x) => {
      setData(x);
      const table = x.season?.prize_table;
      if (table?.length) setPrizes(table);
      setWinnerCount(x.winnerCount || table?.length || 10);
      setStartsAt(toLocalInput(x.season?.starts_at));
      setEndsAt(toLocalInput(x.season?.ends_at));
    });

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
  useEffect(() => { load(); loadPayouts(); }, [request, loadPayouts]);

  function changeWinnerCount(n) {
    setWinnerCount(n);
    setPrizes((prev) => Array.from({ length: n }, (_, i) => prev[i] || { rank: i + 1, amount: 0 }));
  }

  async function save() {
    setSaving(true);
    try {
      await request('/api/admin/league/current/prizes', { method: 'PATCH', body: { prizeTable: prizes, winnerCount } });
      notify('جوایز لیگ ذخیره شد');
      load();
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

    <div className="card-grid cols-2">
      <Card title="لیدربرد زنده" subtitle="به‌روزرسانی خودکار بر اساس امتیاز ماه جاری">
        {data ? <RankList entries={data.entries} /> : null}
      </Card>
      <Card title="تعداد برندگان و جدول جوایز" subtitle="مبلغ هر رتبه در پایان ماه به کاربر تعلق می‌گیرد">
        <Field label="تعداد برندگان">
          <Input type="number" value={winnerCount} onChange={(e) => changeWinnerCount(Number(e.target.value) || 0)} />
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

      {/* ══ تاریخچهٔ واریزها ══ */}
      {!!payouts.filter((p) => p.paid_at).length && (
        <Card title="جوایز واریزشده">
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
