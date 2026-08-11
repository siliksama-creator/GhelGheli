import React, { useEffect, useState } from 'react';
import { SvgIcon } from './components/IconAsset.jsx';

/**
 * کیف پول تومانی — نسخهٔ وب.
 *
 * آینهٔ کامل صفحهٔ کیف پول اپ اندروید: موجودی، ثبت کارت بانکی، درخواست
 * برداشت، تاریخچهٔ تراکنش‌ها و برداشت‌ها.
 *
 * اعتبارسنجی کارت بانکی (Luhn + شبا mod-97 + تشخیص بانک) عمداً همین‌جا هم
 * تکرار شده تا کاربر خطای شمارهٔ کارت را **حین تایپ** ببیند، نه بعد از
 * رفت‌وبرگشت شبکه. سرور همان بررسی‌ها را دوباره انجام می‌دهد؛ این نسخه فقط
 * برای بازخورد سریع است و هرگز جای آن را نمی‌گیرد.
 */

const fa = (n) => new Intl.NumberFormat('fa-IR').format(Number(n || 0));

// ── اعتبارسنجی کارت بانکی (آینهٔ backend/src/services/bankCardService.js) ──
const digitsOnly = (input) => {
  const faD = '۰۱۲۳۴۵۶۷۸۹';
  const arD = '٠١٢٣٤٥٦٧٨٩';
  let out = '';
  for (const ch of String(input || '')) {
    const f = faD.indexOf(ch);
    const a = arD.indexOf(ch);
    if (f > -1) out += f;
    else if (a > -1) out += a;
    else if (ch >= '0' && ch <= '9') out += ch;
  }
  return out;
};

function luhn(n) {
  if (n.length !== 16) return false;
  if (/^(\d)\1{15}$/.test(n)) return false;
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    let d = Number(n[i]);
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

function validSheba(input) {
  const s = digitsOnly(input);
  if (s.length !== 24) return false;
  const re = `${s.slice(4)}1827${s.slice(0, 4)}`;
  let r = 0;
  for (const ch of re) r = (r * 10 + Number(ch)) % 97;
  return r === 1;
}

const BANK_BINS = {
  603799: 'بانک ملی ایران', 589210: 'بانک سپه', 627648: 'بانک توسعه صادرات',
  627961: 'بانک صنعت و معدن', 603770: 'بانک کشاورزی', 639217: 'بانک کشاورزی',
  628023: 'بانک مسکن', 627760: 'پست بانک ایران', 502908: 'بانک توسعه تعاون',
  627412: 'بانک اقتصاد نوین', 622106: 'بانک پارسیان', 639194: 'بانک پارسیان',
  627884: 'بانک پارسیان', 502229: 'بانک پاسارگاد', 639347: 'بانک پاسارگاد',
  627488: 'بانک کارآفرین', 502910: 'بانک کارآفرین', 621986: 'بانک سامان',
  639346: 'بانک سینا', 639607: 'بانک سرمایه', 636214: 'بانک آینده',
  502806: 'بانک شهر', 504706: 'بانک شهر', 502938: 'بانک دی',
  603769: 'بانک صادرات ایران', 610433: 'بانک ملت', 991975: 'بانک ملت',
  589463: 'بانک رفاه کارگران', 627381: 'بانک انصار', 639370: 'بانک مهر اقتصاد',
  606373: 'بانک قرض‌الحسنه مهر ایران', 505416: 'بانک گردشگری',
  585983: 'بانک تجارت', 627353: 'بانک تجارت', 505785: 'بانک ایران زمین',
  504172: 'بانک رسالت', 606256: 'موسسه ملل',
};
const detectBank = (d) => (d.length < 6 ? null : BANK_BINS[Number(d.slice(0, 6))] || null);

const SOURCE_LABEL = {
  card_cash: 'جایزهٔ نقدی کارت',
  wheel: 'گردونهٔ شانس',
  reward: 'جایزهٔ نقدی',
  league: 'جایزهٔ لیگ',
  admin_credit: 'افزایش توسط مدیریت',
  admin_debit: 'کسر توسط مدیریت',
  withdrawal_hold: 'درخواست برداشت',
  withdrawal_refund: 'برگشت وجه',
};

const STATUS_CLASS = {
  pending: 'wPending', approved: 'wApproved', paid: 'wPaid',
  rejected: 'wRejected', canceled: 'wCanceled',
};

export default function Wallet({ token, req, reloadProfile, setMsg }) {
  const [w, setW] = useState(null);
  const [txs, setTxs] = useState([]);
  const [reqs, setReqs] = useState([]);
  const [tab, setTab] = useState('tx');
  const [showCard, setShowCard] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    try {
      const [a, b, c] = await Promise.all([
        req('/api/wallet', 'GET', null, token),
        req('/api/wallet/transactions?limit=50', 'GET', null, token),
        req('/api/wallet/withdrawals', 'GET', null, token),
      ]);
      setW(a); setTxs(b); setReqs(c); setErr('');
    } catch (e) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function cancel(r) {
    if (!confirm(`لغو درخواست ${fa(r.amount)} تومانی؟ مبلغ به کیف پول برمی‌گردد.`)) return;
    try {
      await req(`/api/wallet/withdrawals/${r.id}/cancel`, 'POST', {}, token);
      setMsg('درخواست لغو شد و مبلغ برگشت');
      await load(); await reloadProfile?.();
    } catch (e) { setMsg(e.message); }
  }

  if (err && !w) return <section className="card wide"><p className="msg">{err}</p></section>;
  if (!w) return <div className="card loadingCard"><span className="spinner" />در حال بارگذاری کیف پول...</div>;

  const canWithdraw = w.canWithdraw === true;

  return (
    <section className="card wide walletPage">
      {/* ── کارت موجودی ── */}
      <div className="walletHero">
        <div className="walletHeroTop">
          <span className="walletChip" />
          <b>کیف پول قلقلی</b>
        </div>
        <p className="walletLabel">موجودی قابل برداشت</p>
        <h1 className="walletBalance">{fa(w.balance)} <small>تومان</small></h1>
        {w.pendingAmount > 0 && (
          <span className="walletPill"><SvgIcon name="support" size={16} /> {fa(w.pendingAmount)} تومان در حال بررسی</span>
        )}
        <div className="walletStats">
          <div><span>کل دریافتی</span><b>{fa(w.totalIn)}</b></div>
          <div><span>کل برداشتی</span><b>{fa(w.totalOut)}</b></div>
        </div>
        <button className="walletCardRow" onClick={() => setShowCard(true)}>
          <span className="wcIcon"></span>
          <span className="wcBody">
            <b>{w.card ? w.card.maskedNumber : 'کارت بانکی ثبت نشده'}</b>
            <small>{w.card ? (w.card.bank || w.card.holder || '') : 'برای برداشت لازم است'}</small>
          </span>
          <span className="wcArrow">‹</span>
        </button>
      </div>

      <div className="walletActions">
        <button className="main" onClick={() => (canWithdraw ? setShowWithdraw(true) : setShowCard(!w.card))}>
          درخواست برداشت
        </button>
        <button onClick={() => setShowCard(true)}>{w.card ? 'تغییر کارت' : 'ثبت کارت'}</button>
      </div>

      {!canWithdraw && w.blockReason && (
        <p className="walletNote">ℹ {w.blockReason}</p>
      )}

      {/* ── راهنمای کسب درآمد وقتی کیف پول خالی است ── */}
      {Number(w.balance) === 0 && !txs.length && (
        <div className="walletGuide">
          <h3>چطور کیف پولم پر می‌شود؟</h3>
          <ul>
            <li> ثبت کارت‌هایی که جایزهٔ نقدی دارند</li>
            {/* گردونه فعال است و نقدی به کیف پول واریز می‌کند — برچسب
                «به‌زودی» قدیمی و گمراه‌کننده بود. */}
            <li> گردونهٔ شانس — جایزهٔ نقدی مستقیم به کیف پول</li>
            <li> جوایز نقدی با امتیازهایت</li>
            <li> جایزهٔ لیگ ماهانه</li>
          </ul>
        </div>
      )}

      {/* ── تب‌ها ── */}
      <div className="clubTabs walletTabs">
        <button className={tab === 'tx' ? 'on' : ''} onClick={() => setTab('tx')}>
          تراکنش‌ها ({fa(txs.length)})
        </button>
        <button className={tab === 'wd' ? 'on' : ''} onClick={() => setTab('wd')}>
          برداشت‌ها ({fa(reqs.length)})
        </button>
      </div>

      {tab === 'tx' ? (
        !txs.length ? <div className="empty">هنوز تراکنشی نداری.</div> : (
          <div className="walletList">
            {txs.map((t) => (
              <div className="walletTx" key={t.id}>
                <span className={`txDot ${t.direction === 'credit' ? 'in' : 'out'}`} />
                <div className="txBody">
                  <b>{SOURCE_LABEL[t.source] || 'تراکنش'}</b>
                  {t.description && <small>{t.description}</small>}
                  <small className="txDate">{new Date(t.created_at).toLocaleString('fa-IR')}</small>
                </div>
                <div className="txAmt">
                  <b className={t.direction === 'credit' ? 'in' : 'out'}>
                    {t.direction === 'credit' ? '+' : '−'} {fa(t.amount)}
                  </b>
                  <small>مانده {fa(t.balance_after)}</small>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        !reqs.length ? <div className="empty">هنوز درخواست برداشتی نداری.</div> : (
          <div className="walletList">
            {reqs.map((r) => (
              <div className="walletWd" key={r.id}>
                <div className="wdHead">
                  <b>{fa(r.amount)} تومان</b>
                  <span className={`wdBadge ${STATUS_CLASS[r.status] || ''}`}>{r.statusLabel}</span>
                </div>
                <small> <bdi dir="ltr">{r.cardMasked}</bdi>{r.cardBank ? ` — ${r.cardBank}` : ''}</small>
                <small className="txDate">{new Date(r.createdAt).toLocaleString('fa-IR')}</small>
                {r.trackingCode && <small className="wdOk">کد پیگیری: {r.trackingCode}</small>}
                {r.adminNote && <small className="wdNote">پیام مدیریت: {r.adminNote}</small>}
                {!!r.timeline?.length && <div className="withdrawalTimeline">{r.timeline.map((step, index) => <div key={`${step.toStatus}-${index}`}>
                  <i className={index === r.timeline.length - 1 ? 'active' : ''} />
                  <span><b>{step.statusLabel}</b><small>{new Date(step.createdAt).toLocaleString('fa-IR')}{step.note ? ` · ${step.note}` : ''}</small></span>
                </div>)}</div>}
                {r.status === 'pending' && (
                  <button className="wdCancel" onClick={() => cancel(r)}>لغو درخواست</button>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {showCard && (
        <BankCardModal
          token={token} req={req} existing={w.card}
          close={() => setShowCard(false)}
          done={async () => { setShowCard(false); setMsg('کارت بانکی ذخیره شد'); await load(); await reloadProfile?.(); }}
        />
      )}
      {showWithdraw && (
        <WithdrawModal
          token={token} req={req} wallet={w}
          close={() => setShowWithdraw(false)}
          done={async () => { setShowWithdraw(false); setMsg('درخواست برداشت ثبت شد'); setTab('wd'); await load(); await reloadProfile?.(); }}
        />
      )}
    </section>
  );
}

function BankCardModal({ token, req, existing, close, done }) {
  const [num, setNum] = useState('');
  const [holder, setHolder] = useState(existing?.holder || '');
  const [sheba, setSheba] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const d = digitsOnly(num);
  const bank = detectBank(d);
  const complete = d.length === 16 && luhn(d);
  // حین تایپ سرزنش نکن؛ فقط وقتی ۱۶ رقم کامل شد و غلط بود
  const numError = d.length === 16 && !complete ? 'شماره کارت معتبر نیست؛ ارقام را دوباره بررسی کنید' : '';
  const shebaError = sheba.trim() && !validSheba(sheba) ? 'شماره شبا معتبر نیست' : '';

  async function save() {
    if (!complete) { setErr('شماره کارت باید ۱۶ رقم و معتبر باشد'); return; }
    if (holder.trim().length < 3) { setErr('نام و نام خانوادگی صاحب کارت را کامل وارد کنید'); return; }
    if (shebaError) { setErr(shebaError); return; }
    setBusy(true); setErr('');
    try {
      await req('/api/wallet/bank-card', 'POST',
        { cardNumber: d, cardHolder: holder.trim(), ...(sheba.trim() ? { sheba: sheba.trim() } : {}) }, token);
      done();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm('کارت بانکی حذف شود؟ بدون کارت نمی‌توانید برداشت کنید.')) return;
    setBusy(true);
    try { await req('/api/wallet/bank-card', 'DELETE', null, token); done(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const grouped = d.padEnd(16, '•').replace(/(.{4})/g, '$1 ').trim();

  return (
    <div className="modalShade" onClick={close}>
      <div className="publicModal walletModal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={close}>×</button>
        <h2>{existing ? 'تغییر کارت بانکی' : 'ثبت کارت بانکی'}</h2>
        <p className="hint">واریز جوایز فقط به کارتی انجام می‌شود که به نام خودتان باشد.</p>

        <div className={`cardPreview ${complete ? 'ok' : ''}`}>
          <div className="cpTop"><span className="walletChip" /><b>{bank || 'بانک'}</b></div>
          <div className="cpNum" dir="ltr">{grouped}</div>
          <div className="cpHolder">{holder.trim() || 'نام صاحب کارت'}</div>
        </div>

        <input dir="ltr" inputMode="numeric" placeholder="شماره کارت ۱۶ رقمی"
          value={num} onChange={(e) => setNum(e.target.value)} />
        {numError && <p className="msg">{numError}</p>}
        {bank && !numError && <p className="hint okHint">{bank}</p>}

        <input placeholder="نام و نام خانوادگی صاحب کارت"
          value={holder} onChange={(e) => setHolder(e.target.value)} />

        <input dir="ltr" placeholder="شماره شبا (اختیاری) — IR..."
          value={sheba} onChange={(e) => setSheba(e.target.value)} />
        {shebaError && <p className="msg">{shebaError}</p>}

        {err && <p className="msg">{err}</p>}
        <button className="main" disabled={busy} onClick={save}>
          {busy ? 'در حال ذخیره...' : existing ? 'به‌روزرسانی کارت' : 'ذخیرهٔ کارت'}
        </button>
        {existing && <button className="wdCancel" disabled={busy} onClick={remove}>حذف کارت</button>}
      </div>
    </div>
  );
}

function WithdrawModal({ token, req, wallet, close, done }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const s = wallet.settings || {};
  const min = Number(s.minWithdrawal || 50000);
  const max = Number(s.maxWithdrawal || 50000000);
  const bal = Number(wallet.balance || 0);
  const effMax = Math.min(bal, max);
  const val = Number(digitsOnly(amount) || 0);

  const presets = [min, min * 2, min * 4].filter((v, i, a) => v <= effMax && a.indexOf(v) === i);

  function validate() {
    if (!val) return 'مبلغ برداشت را وارد کنید';
    if (val < min) return `حداقل مبلغ قابل برداشت ${fa(min)} تومان است`;
    if (val > bal) return `موجودی کیف پول شما ${fa(bal)} تومان است`;
    if (val > max) return `حداکثر مبلغ هر برداشت ${fa(max)} تومان است`;
    return '';
  }

  async function submit() {
    const v = validate();
    if (v) { setErr(v); return; }
    if (!confirm(`برداشت ${fa(val)} تومان به کارت ${wallet.card?.maskedNumber}؟\n\nاین مبلغ بلافاصله از موجودی کسر و تا زمان بررسی بلوکه می‌شود.`)) return;
    setBusy(true); setErr('');
    try { await req('/api/wallet/withdrawals', 'POST', { amount: val }, token); done(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="modalShade" onClick={close}>
      <div className="publicModal walletModal" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={close}>×</button>
        <h2>درخواست برداشت</h2>
        <p className="hint">موجودی شما: <b>{fa(bal)} تومان</b></p>

        <input inputMode="numeric" placeholder={`مبلغ برداشت (حداقل ${fa(min)} تومان)`}
          value={amount} onChange={(e) => { setAmount(e.target.value); setErr(''); }} />

        <div className="presetRow">
          {presets.map((p) => (
            <button key={p} type="button" onClick={() => setAmount(String(p))}>{fa(p)}</button>
          ))}
          {effMax >= min && (
            <button type="button" onClick={() => setAmount(String(effMax))}>همهٔ موجودی</button>
          )}
        </div>

        <div className="wdTarget">
          <b>واریز به کارت</b>
          <span dir="ltr">{wallet.card?.maskedNumber}</span>
          <small>{[wallet.card?.holder, wallet.card?.bank].filter(Boolean).join(' — ')}</small>
        </div>

        {s.note && <p className="hint">{s.note}</p>}
        {err && <p className="msg">{err}</p>}
        <button className="main" disabled={busy} onClick={submit}>
          {busy ? 'در حال ثبت...' : 'ثبت درخواست برداشت'}
        </button>
      </div>
    </div>
  );
}
