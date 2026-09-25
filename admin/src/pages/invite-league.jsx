// لیگ معرف‌ها — آفرِ زمان‌دارِ «بیشترین دعوت‌کننده».
//
// ── خواستهٔ مالک (۴ مهر ۱۴۰۵) ────────────────────────────────────────────────
//
//   «امکانش باشه که اگه ادمین از پنل یه آفر مثل لیگ دعوت‌کنندگان قرار داد و
//    کانفیگش کرد، داخل تب دعوت‌کنندگان لیگ معرف‌ها برگزار بشه.»
//
// پس این صفحه فقط دو کار می‌کند: آفر می‌سازد (بازه + رتبه‌ها + جایزهٔ دلخواهِ
// هر رتبه)، و بعد از پایانش برندگان را قفل و پرداخت‌ها را تأیید می‌کند.
//
// ── چرا «تأییدِ دستی» و نه واریزِ خودکار ─────────────────────────────────────
//
// تصمیمِ مالک: «جایزهٔ لیگِ معرف‌ها هم مثل لیگ با تأییدِ ادمین پرداخت شود.»
// بستنِ آفر فقط سند می‌سازد (`pending`)؛ پول با دکمهٔ تأیید حرکت می‌کند. یعنی
// مدیر فرصت دارد قبل از واریز، برندهٔ متخلف را با «لغو» کنار بگذارد — کاری که
// در واریزِ خودکار ممکن نبود.
//
// ── قاعده‌ای که این صفحه نباید بشکند ────────────────────────────────────────
//
// «فقط یک آفرِ فعال»: سرور با ایندکسِ یکتای دیتابیس اجازه نمی‌دهد آفرِ دوم
// بسازید و پیامِ ۴۰۹ می‌دهد. این‌جا آن پیام بدونِ تغییر به مدیر نشان داده
// می‌شود (بالای فرم)، چون تنها راهِ درست، ویرایش یا بستنِ آفرِ فعلی است.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Coins, Gift, Play, RotateCcw, Save, Sparkles,
  Ticket, Trophy, XCircle,
} from 'lucide-react';
import { fmtDateTime, fmtNumber } from '../lib/api.js';
import {
  Badge, Button, Card, EmptyState, Field, Input, Skeleton, Table,
} from '../components/ui.jsx';
import {
  JalaliDateInput, gregorianToJalali, jalaliToGregorian,
} from '../components/jalali-picker.jsx';
import { useToast } from '../lib/toast.jsx';

const MAX_ROWS = 50;

/** ردیفِ خالیِ جایزه — همهٔ چهار نوع جایزه کنارِ هم، تصمیمِ مالک. */
const emptyRow = (rank) => ({
  rank, label: '', points: 0, coins: 0, spins: 0, cash: 0,
});

const emptyForm = () => ({
  title: '',
  startsAt: '', startTime: '00:00:00',
  endsAt: '', endTime: '23:59:59',
  minInvites: 1,
  prizes: [emptyRow(1), emptyRow(2), emptyRow(3)],
});

/** «۵۰۰٬۰۰۰ تومان + ۲٬۰۰۰ امتیاز + ۳ چرخش» — همان ترتیبی که کاربر می‌بیند. */
function describePrize(p) {
  const parts = [];
  if (Number(p.cash) > 0) parts.push(`${fmtNumber(p.cash)} تومان`);
  if (Number(p.points) > 0) parts.push(`${fmtNumber(p.points)} امتیاز`);
  if (Number(p.coins) > 0) parts.push(`${fmtNumber(p.coins)} سکه`);
  if (Number(p.spins) > 0) parts.push(`${fmtNumber(p.spins)} چرخش`);
  return parts.length ? parts.join(' + ') : '—';
}

const STATUS_TONE = {
  active: 'success', finished: 'info', cancelled: 'neutral',
};
const STATUS_LABEL = {
  active: 'فعال', finished: 'تمام‌شده', cancelled: 'لغو‌شده',
};

export function InviteLeaguePage({ request }) {
  const notify = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [lastClose, setLastClose] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await request('/api/admin/invite-league'));
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [request, notify]);

  useEffect(() => { load(); }, [load]);

  const active = data?.active || null;
  const seasons = data?.seasons || [];
  const pending = data?.pendingPayouts || [];

  // ── اعتبارسنجیِ سمتِ کلاینت: سرور هم همین را چک می‌کند، ولی پیامِ
  //    زودهنگام بهتر از رفت‌وبرگشتِ شبکه است.
  const problems = useMemo(() => {
    const out = [];
    if (!form.title.trim()) out.push('عنوانِ آفر را بنویسید.');
    const start = jalaliToGregorian(form.startsAt, form.startTime);
    const end = jalaliToGregorian(form.endsAt, form.endTime);
    if (!start) out.push('تاریخِ شروع را از تقویم انتخاب کنید.');
    if (!end) out.push('تاریخِ پایان را از تقویم انتخاب کنید.');
    if (start && end && end <= start) out.push('تاریخِ پایان باید بعد از شروع باشد.');
    const filled = form.prizes.filter((r) => Number(r.rank) > 0
      && (Number(r.points) > 0 || Number(r.coins) > 0
          || Number(r.spins) > 0 || Number(r.cash) > 0));
    if (!filled.length) out.push('حداقل یک رتبه باید جایزه داشته باشد.');
    const ranks = form.prizes.map((r) => Number(r.rank));
    if (new Set(ranks).size !== ranks.length) out.push('دو ردیف رتبهٔ یکسان دارند.');
    return out;
  }, [form]);

  function setField(patch) { setForm((f) => ({ ...f, ...patch })); }

  function setRow(index, patch) {
    setForm((f) => {
      const prizes = f.prizes.map((r, i) => (i === index ? { ...r, ...patch } : r));
      return { ...f, prizes };
    });
  }

  function startNew() {
    setEditingId(null);
    setForm(emptyForm());
  }

  /** پرکردنِ فرم از آفرِ فعال — ویرایش به‌جای ساختِ آفرِ دوم. */
  function startEditing(season) {
    setEditingId(season.id);
    const s = gregorianToJalali(season.starts_at);
    const e = gregorianToJalali(season.ends_at);
    const prizes = Array.isArray(season.prize_table) ? season.prize_table : [];
    setForm({
      title: season.title || '',
      startsAt: s.date, startTime: s.time,
      endsAt: e.date, endTime: e.time,
      minInvites: Number(season.min_invites || 1),
      prizes: prizes.length ? prizes.map((p) => ({
        rank: Number(p.rank), label: p.label || '',
        points: Number(p.points || 0), coins: Number(p.coins || 0),
        spins: Number(p.spins || 0), cash: Number(p.cash || 0),
      })) : [emptyRow(1)],
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** میان‌بُرِ «۳ نفر اول / ۱۰ نفر اول» — رتبه‌های پشتِ‌سرهم با یک کلیک. */
  function fillRanks(count, patch = {}) {
    setForm((f) => ({
      ...f,
      prizes: Array.from({ length: count }, (_, i) => ({
        ...emptyRow(i + 1), ...patch, rank: i + 1,
      })),
    }));
  }

  async function save() {
    if (problems.length) { notify(problems[0], 'error'); return; }
    const startsAt = jalaliToGregorian(form.startsAt, form.startTime);
    const endsAt = jalaliToGregorian(form.endsAt, form.endTime);
    const body = {
      title: form.title.trim(),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      minInvites: Number(form.minInvites) || 1,
      prizes: form.prizes.map((r) => ({
        rank: Number(r.rank), label: r.label,
        points: Number(r.points) || 0, coins: Number(r.coins) || 0,
        spins: Number(r.spins) || 0, cash: Number(r.cash) || 0,
      })),
    };
    setSaving(true);
    try {
      if (editingId) {
        await request(`/api/admin/invite-league/${editingId}`, { method: 'PATCH', body });
        notify('آفر ویرایش شد.');
      } else {
        await request('/api/admin/invite-league', { method: 'POST', body });
        notify('آفر ساخته شد و از همین لحظه در تبِ «لیگ معرف‌ها» دیده می‌شود.');
      }
      await load();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function closeSeason(season) {
    const ok = window.confirm(
      `آفرِ «${season.title}» بسته شود؟\n\n`
      + 'برندگان همین حالا قفل می‌شوند و ردیف‌های پرداخت ساخته می‌شوند، '
      + 'ولی تا وقتی تأیید نکنید پولی جابه‌جا نمی‌شود.',
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await request(`/api/admin/invite-league/${season.id}/close`, { method: 'POST' });
      setLastClose({ title: season.title, ...res });
      notify(res.message);
      await load();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function approve(body, label) {
    setBusy(true);
    try {
      const res = await request('/api/admin/invite-league/payouts/approve', { method: 'POST', body });
      notify(res.message || `${label} انجام شد.`);
      await load();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function cancelPayout(payout) {
    if (!window.confirm(`جایزهٔ «${payout.nickname}» (رتبهٔ ${fmtNumber(payout.rank)}) لغو شود؟`)) return;
    setBusy(true);
    try {
      await request(`/api/admin/invite-league/payouts/${payout.id}/cancel`, { method: 'POST' });
      notify('جایزه لغو شد.');
      await load();
    } catch (e) {
      notify(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Skeleton height={220} />;

  return (
    <div className="stack">
      {/* ═══ ۱) آفرِ فعال / ساختِ آفر ═══ */}
      <Card
        title={editingId ? 'ویرایشِ لیگ معرف‌ها' : 'لیگ معرف‌ها'}
        subtitle="آفرِ «بیشترین دعوت‌کننده» — تاپ ۱۰ در تبِ «لیگ معرف‌ها» به کاربران نشان داده می‌شود و رتبهٔ هر نفر، حتی بیرونِ ده نفر، در پروفایل خودش دیده می‌شود."
        action={active && !editingId
          ? <Button variant="secondary" icon={RotateCcw} onClick={() => startEditing(active)}>ویرایش آفرِ فعال</Button>
          : (editingId
            ? <Button variant="ghost" icon={XCircle} onClick={() => { setEditingId(null); setForm(emptyForm()); }}>انصراف</Button>
            : null)}
      >
        {active && !editingId && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <Badge tone="success">فعال</Badge>
            <b>{active.title}</b>
            <span style={{ color: 'var(--gg-text-muted)' }}>{fmtDateTime(active.starts_at)} تا {fmtDateTime(active.ends_at)}</span>
            <span style={{ color: 'var(--gg-text-muted)' }}>حداقلِ دعوت: {fmtNumber(active.min_invites)}</span>
            <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8 }}>
              <Button variant="secondary" icon={Play} loading={busy} onClick={() => closeSeason(active)}>
                بستنِ دوره و ثبتِ برندگان
              </Button>
            </div>
          </div>
        )}

        {!active && !editingId && (
          <p style={{ marginBottom: 12, color: 'var(--gg-text-muted)' }}>
            همین حالا هیچ آفری فعال نیست؛ کاربران در تبِ «لیگ معرف‌ها» پیامِ
            «لیگ معرف‌ها ساخته نشده» را می‌بینند. با فرمِ زیر اولین آفر را بسازید.
          </p>
        )}

        {(editingId || !active) && (
          <>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
              <Field label="عنوانِ آفر" hint="همین متن بالای جدول به کاربر نشان داده می‌شود.">
                <Input value={form.title} maxLength={120}
                  placeholder="مثلاً: لیگ معرف‌های مهر"
                  onChange={(e) => setField({ title: e.target.value })} />
              </Field>
              <Field label="حداقلِ دعوتِ معتبر برای ورود به جدول"
                hint="۱ یعنی همه در جدول می‌آیند. فقط کاربرانِ فعال شمرده می‌شوند.">
                <Input type="number" min="1" value={form.minInvites}
                  onChange={(e) => setField({ minInvites: Number(e.target.value) })} />
              </Field>
              <Field label="تاریخِ شروع (شمسی)">
                <JalaliDateInput value={form.startsAt} placeholder="انتخاب تاریخ شروع"
                  onChange={(v) => setField({ startsAt: v })} />
                <Input type="time" step="1" value={form.startTime}
                  onChange={(e) => setField({ startTime: e.target.value })} />
              </Field>
              <Field label="تاریخِ پایان (شمسی)" hint="بعد از این لحظه آفر از تبِ کاربران برداشته می‌شود.">
                <JalaliDateInput value={form.endsAt} placeholder="انتخاب تاریخ پایان"
                  onChange={(v) => setField({ endsAt: v })} />
                <Input type="time" step="1" value={form.endTime}
                  onChange={(e) => setField({ endTime: e.target.value })} />
              </Field>
            </div>

            {/* ── جدولِ جوایز: هر رتبه با ترکیبِ دلخواهِ چهار نوع جایزه ── */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0 8px' }}>
              <Button variant="secondary" size="sm" icon={Sparkles} onClick={() => fillRanks(3)}>۳ رتبه</Button>
              <Button variant="secondary" size="sm" icon={Sparkles} onClick={() => fillRanks(10)}>۱۰ رتبه</Button>
              <Button variant="secondary" size="sm" icon={Ticket}
                onClick={() => setForm((f) => ({ ...f, prizes: [...f.prizes, emptyRow((f.prizes.at(-1)?.rank || 0) + 1)] }))}
                disabled={form.prizes.length >= MAX_ROWS}>
                افزودنِ رتبه
              </Button>
              <Button variant="ghost" size="sm" icon={RotateCcw}
                onClick={() => setField({ prizes: [emptyRow(1)] })}>
                پاک‌کردنِ جوایز
              </Button>
            </div>

            <Table head={['رتبه', 'برچسب (اختیاری)', 'امتیاز', 'سکهٔ قلقلی', 'چرخشِ گردونه', 'کیف پول (تومان)', 'حذف']}>
              {form.prizes.map((row, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <tr key={i}>
                  <td style={{ width: 90 }}>
                    <Input type="number" min="1" value={row.rank}
                      onChange={(e) => setRow(i, { rank: Number(e.target.value) })} />
                  </td>
                  <td>
                    <Input value={row.label} maxLength={60} placeholder="مثلاً نفر اول"
                      onChange={(e) => setRow(i, { label: e.target.value })} />
                  </td>
                  <td><Input type="number" min="0" value={row.points}
                    onChange={(e) => setRow(i, { points: Number(e.target.value) })} /></td>
                  <td><Input type="number" min="0" value={row.coins}
                    onChange={(e) => setRow(i, { coins: Number(e.target.value) })} /></td>
                  <td><Input type="number" min="0" max="1000" value={row.spins}
                    onChange={(e) => setRow(i, { spins: Number(e.target.value) })} /></td>
                  <td><Input type="number" min="0" value={row.cash}
                    onChange={(e) => setRow(i, { cash: Number(e.target.value) })} /></td>
                  <td>
                    <Button variant="ghost" size="sm" icon={XCircle}
                      onClick={() => setField({ prizes: form.prizes.filter((_, j) => j !== i) })}>
                      حذف
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>

            {problems.length > 0 && (
              <p style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, color: 'var(--gg-text-muted)' }}>
                <AlertTriangle size={14} /> {problems[0]}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Button icon={Save} loading={saving} onClick={save}>
                {editingId ? 'ذخیرهٔ تغییرات' : 'ساختِ آفر'}
              </Button>
            </div>
          </>
        )}
      </Card>

      {/* ═══ ۲) جدولِ زندهٔ آفر ═══ */}
      {active && (
        <Card title="جدولِ زندهٔ همین لحظه"
          subtitle="معیار: تعدادِ دعوتِ معتبر (کاربرِ فعال) از شروعِ آفر. تساوی = هر کس زودتر به آن عدد رسیده، بالاتر.">
          {(active.leaderboard || []).length === 0
            ? <EmptyState icon={Trophy} title="هنوز کسی دعوت نکرده"
                message="با شروعِ دعوت‌ها، این جدول پر می‌شود." />
            : (
              <Table head={['رتبه', 'کاربر', 'دعوتِ معتبر', 'جایزهٔ پیش‌بینی‌شده']}>
                {(active.leaderboard || []).map((row) => {
                  const win = (active.preview || []).find((p) => p.userId === row.userId);
                  return (
                    <tr key={row.userId}>
                      <td>{fmtNumber(row.rank)}</td>
                      <td>{row.nickname}</td>
                      <td>{fmtNumber(row.invites)}</td>
                      <td>{win ? describePrize(win) : '—'}</td>
                    </tr>
                  );
                })}
              </Table>
            )}
        </Card>
      )}

      {/* ═══ ۳) نتیجهٔ بستنِ دوره (اگر همین حالا بسته شده) ═══ */}
      {lastClose && (
        <Card title={`نتیجهٔ بستنِ «${lastClose.title}»`}
          subtitle={lastClose.message}>
          {lastClose.winners?.length > 0 && (
            <Table head={['رتبه', 'کاربر', 'دعوت', 'جایزه']}>
              {lastClose.winners.map((w) => (
                <tr key={w.userId}>
                  <td>{fmtNumber(w.rank)}</td>
                  <td>{w.userId.slice(0, 8)}…</td>
                  <td>{fmtNumber(w.invites)}</td>
                  <td>{describePrize(w)}</td>
                </tr>
              ))}
            </Table>
          )}
          {lastClose.skipped?.length > 0 && (
            <p style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', color: 'var(--gg-text-muted)' }}>
              <AlertTriangle size={14} />
              {lastClose.skipped.length} رتبه برنده نداشت (کسی به آن رتبه نرسید) و پرداخت نشد.
            </p>
          )}
        </Card>
      )}

      {/* ═══ ۴) صفِ پرداخت — تصمیمِ مالک: تأییدِ ادمین مثل لیگ ═══ */}
      <Card title="جوایزِ در انتظارِ تأیید"
        subtitle="با تأیید، جایزه به موجودیِ کاربر می‌رود و اعلانِ زنگوله می‌گیرد. تا تأیید نکنید هیچ پولی جابه‌جا نمی‌شود."
        action={pending.length > 0
          ? (
            <Button icon={CheckCircle2} loading={busy}
              onClick={() => approve(
                { seasonId: pending[0].seasonId },
                'پرداختِ همهٔ جوایزِ این دوره',
              )}>
              تأیید و پرداختِ همه
            </Button>
          ) : null}
      >
        {pending.length === 0
          ? <EmptyState icon={CheckCircle2} title="صف خالی است"
              message="جایزهٔ تأییدنشده‌ای وجود ندارد." />
          : (
            <Table head={['کاربر', 'دوره', 'رتبه', 'دعوت', 'جایزه', 'عملیات']}>
              {pending.map((p) => (
                <tr key={p.id}>
                  <td>{p.nickname}</td>
                  <td>{p.seasonTitle}</td>
                  <td>{fmtNumber(p.rank)}</td>
                  <td>{fmtNumber(p.invites)}</td>
                  <td>{describePrize(p.prizes)}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <Button size="sm" icon={Coins} loading={busy}
                      onClick={() => approve({ payoutId: p.id }, `پرداخت به ${p.nickname}`)}>
                      پرداخت
                    </Button>
                    <Button size="sm" variant="ghost" icon={XCircle} loading={busy}
                      onClick={() => cancelPayout(p)}>
                      لغو
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
      </Card>

      {/* ═══ ۵) تاریخچهٔ آفرها ═══ */}
      <Card title="تاریخچهٔ آفرهای معرف‌ها"
        subtitle="هر دوره یک سند است؛ برندگان و پرداخت‌ها بعداً از همین‌جا قابلِ رهگیری‌اند.">
        {seasons.length === 0
          ? <EmptyState icon={Gift} title="هنوز آفری ساخته نشده" />
          : (
            <Table head={['عنوان', 'بازه', 'وضعیت', 'حداقلِ دعوت', 'برنده', 'در انتظار', '']}>
              {seasons.map((s) => (
                <tr key={s.id}>
                  <td>{s.title}</td>
                  <td style={{ color: 'var(--gg-text-muted)' }}>{fmtDateTime(s.starts_at)} — {fmtDateTime(s.ends_at)}</td>
                  <td><Badge tone={STATUS_TONE[s.status] || 'neutral'}>
                    {STATUS_LABEL[s.status] || s.status}
                  </Badge></td>
                  <td>{fmtNumber(s.min_invites)}</td>
                  <td>{fmtNumber(s.winner_count || 0)}</td>
                  <td>{fmtNumber(s.pending_count || 0)}</td>
                  <td>
                    {s.status === 'active' && (
                      <Button size="sm" variant="secondary" icon={Play} loading={busy}
                        onClick={() => closeSeason(s)}>
                        بستن
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
      </Card>
    </div>
  );
}
