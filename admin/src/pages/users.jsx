import { useEffect, useState } from 'react';
import { Coins, KeyRound, MessageSquareText, Search, ShieldOff, UserRoundSearch, Wallet } from 'lucide-react';
import { fmtNumber } from '../lib/api.js';
import { Badge, Button, Card, DataRow, EmptyState, Input } from '../components/ui.jsx';
import { useDialog } from '../components/dialog.jsx';
import { useToast } from '../lib/toast.jsx';

export function UsersPage({ request }) {
  const notify = useToast();
  const { promptText, confirmAction } = useDialog();
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  const load = () => {
    setLoading(true);
    request(`/api/admin/users?search=${encodeURIComponent(query)}`)
      .then(setRows)
      .finally(() => setLoading(false));
  };
  useEffect(load, [request]);

    async function grantPlus(id) {
    const days = await promptText({
      title: 'اعطای اشتراک قلقلی پلاس',
      description: 'مدت زمان اشتراک پلاس بر حسب روز را وارد کنید.',
      placeholder: 'تعداد روز (مثلاً ۳۰ یا ۹۰)',
      type: 'number',
    });
    if (!days) return;
    const r = await request(`/api/admin/users/${id}/grant-plus`, {
      method: 'POST',
      body: { days: Number(days) || 30, reason: 'اعطای دستی توسط مدیریت' },
    });
    notify(r?.message || 'اشتراک پلاس برای کاربر فعال شد');
    load();
  }

  async function block(id, status) {
    await request(`/api/admin/users/${id}/status`, { method: 'PATCH', body: { status, reason: 'مدیریت پنل' } });
    notify('وضعیت کاربر ثبت شد');
    load();
  }

  async function changePoints(id) {
    const p = await promptText({ title: 'امتیاز دستی', placeholder: 'مقدار امتیاز مثبت یا منفی', type: 'number' });
    if (!p) return;
    await request(`/api/admin/users/${id}/points`, { method: 'POST', body: { points: Number(p) || 0, reason: 'تغییر دستی' } });
    notify('امتیاز کاربر به‌روزرسانی شد');
    load();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // اصلاح دستی کیف پول (پول واقعی)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // بک‌اند (`POST /api/admin/wallet/users/:id/adjust`) از اول کامل بود —
  // تراکنش اتمیک، دفترِ کل، دلیلِ اجباری، ممیزی و اعلانِ کاربر — ولی هیچ
  // دکمه‌ای صدایش نمی‌زد. یعنی وقتی کاربری دوبار پول کم می‌شد یا پرداختی
  // ناموفق گیر می‌کرد، پشتیبانی هیچ راهی جز دست‌کاری مستقیمِ دیتابیس
  // نداشت (بدون ردِ ممیزی).
  //
  // دو نکتهٔ عمدی:
  //   • دلیل برای **هر دو جهت** اجباری است (بک‌اند هم همین را الزام
  //     می‌کند) — چون واریزِ بی‌دلیل هم دقیقاً همان‌قدر پولِ بی‌سند است.
  //   • تأییدِ نهایی مبلغ را دوباره نشان می‌دهد: این تنها جای پنل است که
  //     یک اشتباهِ تایپی مستقیماً پولِ واقعی جابه‌جا می‌کند.
  async function adjustWallet(u) {
    const raw = await promptText({
      title: 'اصلاح موجودی کیف پول',
      description: `موجودی فعلی: ${fmtNumber(u.wallet_balance || 0)} تومان. مبلغ مثبت واریز و مبلغ منفی کسر می‌کند.`,
      placeholder: 'مبلغ به تومان (مثلاً ۵۰۰۰۰ یا ۵۰۰۰۰-)',
      type: 'number',
    });
    if (!raw) return;
    const amount = Math.floor(Number(raw));
    if (!Number.isFinite(amount) || amount === 0) return notify('مبلغ باید عددی مخالف صفر باشد', 'error');
    if (amount < 0 && Math.abs(amount) > Number(u.wallet_balance || 0)) {
      return notify('مبلغ کسر از موجودی کاربر بیشتر است', 'error');
    }

    const reason = await promptText({
      title: 'دلیل این تغییر',
      description: 'این متن هم در دفتر مالی ثبت و هم برای کاربر نوتیفیکیشن می‌شود، پس واضح بنویسید.',
      placeholder: 'مثلاً: عودت وجه سفارش ناموفق شمارهٔ ۱۲۳',
    });
    if (!reason) return;
    if (reason.trim().length < 3) return notify('ثبت دلیل (حداقل ۳ حرف) الزامی است', 'error');

    const ok = await confirmAction({
      title: amount > 0 ? 'تأیید واریز به کیف پول' : 'تأیید کسر از کیف پول',
      message: `${fmtNumber(Math.abs(amount))} تومان ${amount > 0 ? 'به' : 'از'} کیف پول «${u.nickname || u.mobile}» ${amount > 0 ? 'اضافه' : 'کسر'} می‌شود. این عملیات برگشت‌پذیر نیست.`,
      confirmLabel: amount > 0 ? 'واریز کن' : 'کسر کن',
      danger: amount < 0,
    });
    if (!ok) return;

    try {
      const r = await request(`/api/admin/wallet/users/${u.id}/adjust`, {
        method: 'POST',
        body: { amount, reason: reason.trim() },
      });
      notify(r?.message || 'موجودی کیف پول تغییر کرد');
      load();
    } catch (e) {
      // پیامِ بک‌اند («دسترسی کافی نیست» برای نقشِ غیرِ super_admin،
      // «موجودی کافی نیست» و ...) باید عیناً دیده شود، نه یک خطای عمومی.
      notify(e?.message || 'تغییر موجودی ناموفق بود', 'error');
    }
  }

  async function privateMessage(id) {
    const body = await promptText({ title: 'پیام اختصاصی برای کاربر', multiline: true });
    if (!body) return;
    await request(`/api/admin/users/${id}/notify`, { method: 'POST', body: { title: 'پیام اختصاصی مدیریت', body } });
    notify('پیام اختصاصی ارسال شد');
  }

  // Since the SMS gateway isn't active yet, users can't reset a forgotten
  // password themselves via OTP. Support can set a temporary password here
  // after verifying the user's identity by phone/in person — every use is
  // recorded in the audit log.
  async function showDetails(id) {
    try {
      const d = await request(`/api/admin/users/${id}`);
      setDetail(d);
    } catch (e) {
      notify(e.message || 'جزئیات کاربر دریافت نشد', 'error');
    }
  }

  async function toggleSpins(u) {
    const on = !u.unlimited_spins;
    const ok = await confirmAction({
      title: on ? 'چرخش نامحدود گردونه' : 'قطع چرخش نامحدود',
      message: on
        ? `حساب «${u.nickname || u.mobile}» دیگر سهمیهٔ روزانه ندارد — فقط برای تست مالک.`
        : 'سهمیهٔ روزانه دوباره اعمال می‌شود.',
      confirmLabel: on ? 'فعال کن' : 'قطع کن',
      danger: on,
    });
    if (!ok) return;
    try {
      const r = await request(`/api/admin/users/${u.id}/unlimited-spins`, {
        method: 'POST',
        body: { enabled: on, reason: 'از پنل وب' },
      });
      notify(r.message || 'ثبت شد');
      load();
    } catch (e) {
      notify(e.message, 'error');
    }
  }

  async function resetPassword(id) {
    const pw = await promptText({
      title: 'تنظیم رمز موقت برای کاربر',
      description: 'چون پیامک هنوز فعال نیست، کاربر نمی‌تواند رمز را خودش بازیابی کند. فقط بعد از احراز هویت کاربر (تماس تلفنی و ...) این کار را انجام دهید.',
      placeholder: 'رمز جدید (حداقل ۶ کاراکتر)',
      type: 'text',
    });
    if (!pw) return;
    if (pw.length < 6) return notify('رمز باید حداقل ۶ کاراکتر باشد');
    await request(`/api/admin/users/${id}/reset-password`, { method: 'POST', body: { newPassword: pw, reason: 'بازیابی رمز توسط پشتیبانی' } });
    notify('رمز عبور کاربر تغییر کرد؛ رمز جدید را به او اطلاع دهید');
  }

  return (
    <Card>
      <div className="field-row" style={{ marginBottom: 16 }}>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجوی موبایل یا نام مستعار" onKeyDown={(e) => e.key === 'Enter' && load()} />
        <Button variant="secondary" icon={Search} onClick={load} style={{ flex: '0 0 auto' }}>
          جستجو
        </Button>
      </div>
      {loading ? null : rows.length === 0 ? (
        <EmptyState icon={UserRoundSearch} title="کاربری یافت نشد" />
      ) : (
        rows.map((u) => (
          <DataRow
            key={u.id}
            title={`${u.mobile} — ${u.nickname || 'بدون نام'}`}
            /* ═══════════════════════════════════════════════════════════
               چرا امتیاز/موجودی در `subtitle` است و نه `trailing`
               ═══════════════════════════════════════════════════════════
               `.data-row-title` تک‌خطی است و با ellipsis بریده می‌شود.
               وقتی موجودی کیف پول و دکمهٔ تازه‌اش به همان ردیف اضافه شد،
               ستونِ نام آن‌قدر فشرده شد که «۰۹۱۲۰۰۰۰۰۰۱ — کاربر تست» به
               «۰۰۱…» تبدیل شد؛ یعنی مدیر دیگر نمی‌فهمید ردیفِ چه کسی را
               می‌بیند. حالا اعدادِ کم‌اهمیت‌ترِ خط دوم را می‌گیرند و نام
               تمام‌عرضِ خط اول را دارد. */
            subtitle={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span>{fmtNumber(u.current_points)} امتیاز</span>
                {/* موجودی کیف پول: مدیر پیش از هر اصلاحی باید عدد فعلی را
                    ببیند. صفر عمداً کم‌رنگ می‌ماند تا حسابِ دارای موجودی
                    در فهرست فوراً به چشم بیاید. */}
                <span
                  title="موجودی کیف پول"
                  style={{
                    fontVariantNumeric: 'tabular-nums',
                    color: Number(u.wallet_balance) > 0 ? 'var(--gg-success)' : 'inherit',
                    fontWeight: Number(u.wallet_balance) > 0 ? 700 : 400,
                  }}
                >
                  {fmtNumber(u.wallet_balance || 0)} تومان
                </span>
                <span title="سکهٔ فصل" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmtNumber(u.coins || 0)} سکه
                </span>
                {u.has_plus && <span style={{ color: 'var(--gg-warning)', fontWeight: 800 }}>پلاس</span>}
                {u.unlimited_spins && <span style={{ color: 'var(--gg-info)' }}>∞ گردونه</span>}
              </span>
            }
            trailing={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {/* لولِ بازیکن — مدیر باید همان چیزی را ببیند که کاربر
                    می‌بیند. بدون این، پشتیبانی نمی‌تواند به سؤالِ
                    «چرا لولم بالا نرفت» جواب دهد، و حسابِ مشکوک
                    (لولِ خیلی بالا در چند روز) قابل تشخیص نیست. */}
                {u.level !== undefined && u.level !== null && (
                  <span
                    title={`لول ${u.level}`}
                    style={{
                      fontSize: 11,
                      fontWeight: 900,
                      padding: '1px 6px',
                      borderRadius: 6,
                      direction: 'ltr',
                      fontVariantNumeric: 'tabular-nums',
                      color: 'var(--gg-info)',
                      border: '1px solid var(--gg-info)',
                      background: 'color-mix(in srgb, var(--gg-info) 12%, transparent)',
                    }}
                  >
                    Lv {u.level}
                  </span>
                )}
                <Badge tone={u.status === 'active' ? 'success' : 'danger'}>{u.status === 'active' ? 'فعال' : 'مسدود'}</Badge>
              </div>
            }
            actions={
              <>
                <Button size="sm" variant="secondary" icon={UserRoundSearch} onClick={() => showDetails(u.id)}>
                  جزئیات
                </Button>
                <Button size="sm" variant="secondary" icon={Coins} onClick={() => changePoints(u.id)}>
                  امتیاز
                </Button>
                <Button size="sm" variant="secondary" icon={Wallet} onClick={() => adjustWallet(u)}>
                  کیف پول
                </Button>
                <Button size="sm" variant="secondary" onClick={() => grantPlus(u.id)}>
                  اعطای پلاس
                </Button>
                <Button size="sm" variant="secondary" icon={MessageSquareText} onClick={() => privateMessage(u.id)}>
                  پیام
                </Button>
                <Button size="sm" variant="secondary" onClick={() => toggleSpins(u)}>
                  {u.unlimited_spins ? 'قطع ∞' : '∞ گردونه'}
                </Button>
                <Button size="sm" variant="secondary" icon={KeyRound} onClick={() => resetPassword(u.id)}>
                  بازیابی رمز
                </Button>
                <Button size="sm" variant={u.status === 'active' ? 'danger' : 'secondary'} icon={ShieldOff} onClick={() => block(u.id, u.status === 'active' ? 'blocked' : 'active')}>
                  {u.status === 'active' ? 'مسدود' : 'رفع مسدودی'}
                </Button>
              </>
            }
          />
        ))
      )}
    </Card>
    {uDetail && (
      <div
        role="dialog"
        onClick={() => setDetail(null)}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80,
        }}
      >
        <Card
          title={`${uDetail.nickname || uDetail.mobile || 'کاربر'}`}
          subtitle="جزئیات حساب — کلیک بیرون می‌بندد"
          style={{ width: 'min(520px, 92vw)', maxHeight: '80vh', overflow: 'auto' }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'grid', gap: 8, fontSize: 13.5 }}>
            {[
              ['موبایل', uDetail.mobile],
              ['نام', `${uDetail.first_name || ''} ${uDetail.last_name || ''}`.trim() || '—'],
              ['استان / شهر', `${uDetail.province || '—'} / ${uDetail.city || '—'}`],
              ['امتیاز فعلی', fmtNumber(uDetail.current_points)],
              ['امتیاز تاریخی', fmtNumber(uDetail.lifetime_points)],
              ['سکه', fmtNumber(uDetail.coins)],
              ['کیف پول', `${fmtNumber(uDetail.wallet_balance)} تومان`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span className="topbar-sub">{k}</span>
                <b>{v}</b>
              </div>
            ))}
            <Button variant="secondary" onClick={() => setDetail(null)}>بستن</Button>
          </div>
        </Card>
      </div>
    )}
    </>
  );
}

