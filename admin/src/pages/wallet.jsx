import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Ban, Copy, Save, Search, Wallet } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Field, Input, Select } from '../components/ui.jsx';
import { useDialog } from '../components/dialog.jsx';
import { useToast } from '../lib/toast.jsx';

/**
 * مدیریت کیف پول و درخواست‌های برداشت.
 *
 * این تنها صفحهٔ پنل است که با آن **پول واقعی جابه‌جا می‌شود**، پس چند تصمیم
 * عمدی دارد که بقیهٔ صفحات ندارند:
 *   • شمارهٔ کارت و شبا با یک کلیک کپی می‌شوند — تایپ دستی ۱۶ رقم رایج‌ترین
 *     راه واریز به حساب اشتباه است.
 *   • هر اقدام یک گام تأیید صریح دارد.
 *   • «رد کردن» صریحاً می‌گوید مبلغ به کیف پول کاربر برمی‌گردد.
 */

const STATUS = {
  pending: ['در انتظار بررسی', 'warning'],
  approved: ['تأیید شده', 'info'],
  paid: ['پرداخت شده', 'success'],
  rejected: ['رد شده', 'danger'],
  canceled: ['لغو شده', 'neutral'],
};

const FILTERS = [
  ['pending', 'در انتظار'],
  ['approved', 'تأییدشده'],
  ['paid', 'پرداخت‌شده'],
  ['rejected', 'ردشده'],
  ['all', 'همه'],
];

// جداکنندهٔ هزارگان فارسی — همان قراردادی که اپ موبایل دارد
const money = (n) => new Intl.NumberFormat('fa-IR').format(Number(n || 0));
const groupCard = (s) =>
  String(s || '').length === 16 ? String(s).replace(/(\d{4})(?=\d)/g, '$1-') : String(s || '');

export function WalletPage({ request }) {
  const notify = useToast();
  const { confirmAction, promptText } = useDialog();

  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [settings, setSettings] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const q = new URLSearchParams({ status: filter });
    if (search.trim()) q.set('search', search.trim());
    try {
      const [s, list, cfg] = await Promise.all([
        request('/api/admin/wallet/stats'),
        request(`/api/admin/wallet/withdrawals?${q}`),
        request('/api/admin/wallet/settings'),
      ]);
      setStats(s);
      setRows(list);
      setSettings(cfg);
    } catch (err) {
      notify(err.message, 'error');
    }
  }, [request, filter, search, notify]);

  useEffect(() => {
    load();
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(String(text));
      notify(`${label} کپی شد`);
    } catch {
      // clipboard نیاز به HTTPS یا اجازهٔ کاربر دارد؛ سکوت نکن
      notify('کپی نشد؛ دستی انتخاب کنید', 'error');
    }
  }

  async function decide(row, status) {
    const meta = {
      approved: ['تأیید درخواست', 'این درخواست تأیید می‌شود و در صف واریز قرار می‌گیرد.'],
      paid: ['ثبت واریز', 'یعنی پول را واقعاً به کارت کاربر واریز کرده‌اید. این عمل برگشت‌پذیر نیست.'],
      rejected: ['رد درخواست', 'مبلغ بلافاصله به کیف پول کاربر برمی‌گردد.'],
    }[status];

    const okToGo = await confirmAction({
      title: meta[0],
      message: `${money(row.amount)} تومان — ${row.cardHolder}\n\n${meta[1]}`,
      confirmLabel: meta[0],
    });
    if (!okToGo) return;

    // کد پیگیری هنگام واریز، دلیل هنگام رد — هر دو برای کاربر نمایش داده می‌شوند
    let extra = {};
    if (status === 'paid') {
      const code = await promptText({
        title: 'کد پیگیری واریز',
        message: 'اختیاری — برای کاربر نمایش داده می‌شود',
        placeholder: 'مثلاً 123456789',
      });
      if (code && code.trim()) extra.trackingCode = code.trim();
    }
    if (status === 'rejected') {
      const reason = await promptText({
        title: 'دلیل رد درخواست',
        message: 'برای کاربر ارسال می‌شود',
        placeholder: 'مثلاً اطلاعات کارت با نام کاربر یکی نیست',
      });
      if (reason && reason.trim()) extra.adminNote = reason.trim();
    }

    setBusy(true);
    try {
      const d = await request(`/api/admin/wallet/withdrawals/${row.id}`, {
        method: 'PATCH',
        body: { status, ...extra },
      });
      notify(d.message || 'ثبت شد');
      await load();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    setBusy(true);
    try {
      const d = await request('/api/admin/wallet/settings', {
        method: 'PATCH',
        body: settings,
      });
      // مقادیر اصلاح‌شدهٔ سرور را نشان بده، نه آنچه تایپ شده
      setSettings(d.settings);
      notify(d.message || 'ذخیره شد');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!stats) return <Card title="کیف پول"><p className="topbar-sub">در حال بارگذاری...</p></Card>;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* ── آمار ── */}
      <div className="card-grid cols-4">
        <StatBox label="در انتظار بررسی" amount={stats.pendingAmount} count={stats.pendingCount} tone="warning" />
        <StatBox label="تأییدشده (در صف واریز)" amount={stats.approvedAmount} count={stats.approvedCount} tone="info" />
        <StatBox label="واریزشده ۳۰ روز اخیر" amount={stats.paidAmount30d} tone="success" />
        <StatBox label="کل موجودی کیف پول‌ها" amount={stats.totalWalletLiability} tone="neutral" />
      </div>

      {/* ── درخواست‌ها ── */}
      <Card
        title="درخواست‌های برداشت"
        subtitle="شماره کارت را کپی کنید؛ تایپ دستی ۱۶ رقم منشأ اصلی واریز اشتباه است"
        action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
              {FILTERS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </div>
        }
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Input
            placeholder="جستجو: موبایل، نام مستعار، نام صاحب کارت یا شماره کارت"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
          <Button variant="secondary" icon={Search} onClick={load}>جستجو</Button>
        </div>

        {!rows.length ? (
          <EmptyState icon={Wallet} title="درخواستی در این وضعیت نیست" />
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {rows.map((r) => (
              <RequestCard
                key={r.id}
                row={r}
                busy={busy}
                onCopy={copy}
                onDecide={decide}
              />
            ))}
          </div>
        )}
      </Card>

      {/* ── تنظیمات ── */}
      {settings && (
        <Card title="تنظیمات کیف پول" subtitle="روی همهٔ کاربران اپ و وب اعمال می‌شود">
          <div className="card-grid cols-2">
            <Field label="وضعیت برداشت">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!settings.enabled}
                  onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                />
                <span>{settings.enabled ? 'برداشت فعال است' : 'برداشت غیرفعال است'}</span>
              </label>
            </Field>
            <Field label="حداقل مبلغ برداشت (تومان)">
              <Input
                type="number"
                value={settings.minWithdrawal}
                onChange={(e) => setSettings({ ...settings, minWithdrawal: e.target.value })}
              />
            </Field>
            <Field label="حداکثر هر برداشت (تومان)">
              <Input
                type="number"
                value={settings.maxWithdrawal}
                onChange={(e) => setSettings({ ...settings, maxWithdrawal: e.target.value })}
              />
            </Field>
            <Field label="حداکثر درخواست همزمان هر کاربر">
              <Input
                type="number"
                value={settings.maxPendingRequests}
                onChange={(e) => setSettings({ ...settings, maxPendingRequests: e.target.value })}
              />
            </Field>
            <Field label="یادداشت نمایشی به کاربر">
              <Input
                value={settings.note || ''}
                onChange={(e) => setSettings({ ...settings, note: e.target.value })}
              />
            </Field>
          </div>
          <Button icon={Save} loading={busy} onClick={saveSettings}>ذخیره تنظیمات</Button>
        </Card>
      )}
    </div>
  );
}

function StatBox({ label, amount, count, tone }) {
  // برچسب‌های فارسی اینجا بلندند («تأییدشده (در صف واریز)»). اگر برچسب و
  // مبلغ در یک ردیف flex باشند، برچسب مبلغ را له می‌کند و عدد به یک ستون
  // باریک می‌افتد. پس عمداً عمودی چیده شده‌اند و برچسب اجازهٔ دو خط دارد.
  return (
    <Card className="wallet-stat">
      <div className="wallet-stat-head">
        <span className="wallet-stat-label">{label}</span>
        {count ? <Badge tone={tone}>{money(count)}</Badge> : null}
      </div>
      <div className="wallet-stat-value">
        {money(amount)}<span>تومان</span>
      </div>
    </Card>
  );
}

function RequestCard({ row, busy, onCopy, onDecide }) {
  const [label, tone] = STATUS[row.status] || [row.status, 'neutral'];
  const actionable = row.status === 'pending' || row.status === 'approved';

  return (
    <div
      style={{
        border: '1px solid var(--border, rgba(255,255,255,.12))',
        borderRadius: 14,
        padding: 14,
        display: 'grid',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 18 }}>{money(row.amount)} تومان</strong>
        <Badge tone={tone}>{label}</Badge>
        <span className="topbar-sub" style={{ marginInlineStart: 'auto', fontSize: 12 }}>
          {new Date(row.createdAt).toLocaleString('fa-IR')}
        </span>
      </div>

      <div className="topbar-sub" style={{ fontSize: 13 }}>
        کاربر: <b>{row.user?.nickname || '—'}</b> · {row.user?.mobile}
        {' · '}موجودی فعلی: {money(row.user?.walletBalance)} تومان
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        <CopyRow label="شماره کارت" value={row.cardNumber} display={groupCard(row.cardNumber)} onCopy={onCopy} />
        <CopyRow label="صاحب کارت" value={row.cardHolder} display={row.cardHolder} onCopy={onCopy} />
        {row.cardBank && (
          <div style={{ fontSize: 13 }}><span className="topbar-sub">بانک: </span>{row.cardBank}</div>
        )}
        {row.cardSheba && (
          <CopyRow label="شبا" value={row.cardSheba} display={row.cardSheba} onCopy={onCopy} />
        )}
      </div>

      {row.trackingCode && (
        <div style={{ fontSize: 13 }}><span className="topbar-sub">کد پیگیری: </span>{row.trackingCode}</div>
      )}
      {row.adminNote && (
        <div style={{ fontSize: 13 }}><span className="topbar-sub">یادداشت: </span>{row.adminNote}</div>
      )}
      {!!row.timeline?.length && <div style={{ display:'grid', gap:6, padding:10, borderRadius:12, background:'rgba(255,255,255,.035)' }}>
        <b style={{ fontSize:12 }}>مسیر کامل وضعیت</b>
        {row.timeline.map((step,index)=><div key={`${step.toStatus}-${index}`} style={{ display:'flex', gap:8, alignItems:'center', fontSize:11 }}>
          <span style={{ width:8,height:8,borderRadius:'50%',background:index===row.timeline.length-1?'#34d399':'#64748b' }} />
          <strong>{step.statusLabel}</strong><span className="topbar-sub">{new Date(step.createdAt).toLocaleString('fa-IR')}{step.note?` · ${step.note}`:''}</span>
        </div>)}
      </div>}

      {actionable && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {row.status === 'pending' && (
            <Button icon={BadgeCheck} disabled={busy} onClick={() => onDecide(row, 'approved')}>
              تأیید
            </Button>
          )}
          {row.status === 'approved' && (
            <Button icon={BadgeCheck} disabled={busy} onClick={() => onDecide(row, 'paid')}>
              واریز کردم
            </Button>
          )}
          <Button variant="danger" icon={Ban} disabled={busy} onClick={() => onDecide(row, 'rejected')}>
            رد و برگشت وجه
          </Button>
        </div>
      )}
    </div>
  );
}

function CopyRow({ label, value, display, onCopy }) {
  return (
    <button
      type="button"
      onClick={() => onCopy(value, label)}
      title={`کپی ${label}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'transparent',
        border: 0,
        padding: 0,
        cursor: 'pointer',
        color: 'inherit',
        font: 'inherit',
        textAlign: 'start',
      }}
    >
      <span className="topbar-sub" style={{ fontSize: 13 }}>{label}:</span>
      <b style={{ letterSpacing: '.5px', fontSize: 14 }}>{display}</b>
      <Copy size={14} style={{ opacity: 0.7 }} />
    </button>
  );
}
