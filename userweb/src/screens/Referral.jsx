// دعوت دوستان — کد اختصاصی، آمار، و اشتراک مستقیم در پیام‌رسان‌ها
import React, { useCallback, useEffect, useState } from 'react';
import { req } from '../lib/api.js';
import { SvgIcon } from '../components/IconAsset.jsx';

const fa = n => new Intl.NumberFormat('fa-IR').format(Number(n || 0));

export default function Referral({ token, setMsg }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      setD(await req('/api/referrals', 'GET', null, token));
      setErr('');
    } catch (e) {
      setErr(e?.data?.message || 'دریافت اطلاعات ناموفق بود');
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(d.code);
      } else {
        const ta = document.createElement('textarea');
        ta.value = d.code;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setMsg?.('کد دعوت کپی شد ✓');
    } catch {
      setMsg?.('کپی نشد — کد را دستی کپی کنید');
    }
  };

  const inviteMsg = (code) =>
    `کد دعوت من به قلقلی: ${code}\nبا این کد ثبت‌نام کن؛ هر دومون ۳ چرخش هدیه می‌گیریم و من از خریدهای مستقیم تو ۵٪ درآمد معرفی می‌گیرم.\nhttps://ghelghelishop.ir`;

  const shareTo = (target) => {
    const text = encodeURIComponent(inviteMsg(d.code));
    let url = '';
    if (target === 'telegram') url = `https://t.me/share/url?url=${text}`;
    else if (target === 'whatsapp') url = `https://wa.me/?text=${text}`;
    else if (target === 'rubika') { copy(); url = 'https://rubika.ir'; }
    else if (target === 'bale') { copy(); url = 'https://web.bale.ai'; }

    if (url) window.open(url, '_blank');
  };

  if (err && !d) return <section className="card wide"><p className="hint">{err}</p></section>;
  if (!d) return <section className="card wide"><p className="hint">در حال بارگذاری…</p></section>;

  return (
    <section className="card wide refPage">
      <div className="refHead">
        <h2>دعوت از دوستان</h2>
        <p className="hint">
          کدت را به دوستانت بده. هر کس موقع ثبت‌نام آن را وارد کند،
          {' '}<b>هر دوی شما {fa(d.spinsPerReferral)} چرخش گردونه</b> هدیه می‌گیرید.
        </p>
      </div>

      <div className="refCodeBox">
        <div className="refCodeInner">
          <span className="refLabel">کد اختصاصی شما:</span>
          <span className="refCode" dir="ltr">{d.code}</span>
        </div>
        <button className="btn primary" onClick={copy}>کپی کد</button>
      </div>

      <div className="refMessengers">
        <span>ارسال مستقیم برای دوستان:</span>
        <div className="refBtnGroup">
          <button className="msgBtn tg" onClick={() => shareTo('telegram')}>
            <span className="msgDot" /> تلگرام
          </button>
          <button className="msgBtn wa" onClick={() => shareTo('whatsapp')}>
            <span className="msgDot" /> واتس‌اپ
          </button>
          <button className="msgBtn rb" onClick={() => shareTo('rubika')}>
            <span className="msgDot" /> روبیکا
          </button>
          <button className="msgBtn bl" onClick={() => shareTo('bale')}>
            <span className="msgDot" /> بله
          </button>
        </div>
      </div>

      <div style={{ margin:'12px 0', padding:'14px', borderRadius:'16px', border:'1px solid rgba(34,231,166,.38)', background:'linear-gradient(135deg,rgba(34,231,166,.12),rgba(56,189,248,.08))' }}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:'12px', alignItems:'center', flexWrap:'wrap' }}>
          <div><small style={{color:'#9FB0C3'}}>درآمد نقدی معرفی از خریدها</small><div style={{fontSize:'24px',fontWeight:950,color:'#22E7A6'}}>{fa(d.cashCommissionEarned)} تومان</div></div>
          <div style={{textAlign:'left'}}><small style={{color:'#9FB0C3'}}>موجودی کیف پول</small><div style={{fontWeight:900}}>{fa(d.walletBalance)} تومان</div></div>
          <span style={{padding:'6px 9px',borderRadius:'999px',fontSize:'10px',fontWeight:900,background:d.cashWithdrawReady?'rgba(34,197,94,.18)':'rgba(255,209,102,.14)',color:d.cashWithdrawReady?'#4ADE80':'#FFD166'}}>
            {d.cashWithdrawReady ? 'آماده درخواست برداشت' : `تا برداشت: حداقل ${fa(d.withdrawalThreshold)} تومان`}
          </span>
        </div>
        <p style={{margin:'9px 0 0',fontSize:'10px',color:'#B8C5D4'}}>۵٪ هر خرید دوست مستقیم، اتمیک و قابل رهگیری به کیف پولت واریز می‌شود. سطح دوم و کمیسیون زنجیره‌ای نداریم.</p>
      </div>

      <div className="refStats">
        <div><b>{fa(d.invitedCount)}</b><span>دوست دعوت‌شده</span></div>
        <div><b>{fa(d.totalEarned)}</b><span>امتیاز از دوستان</span></div>
        <div><b>{fa(d.dailySpins)}</b><span>چرخش روزانه</span></div>
      </div>

      <div className="refRulesBox">
        <b>مزایای معرفی دوستان:</b>
        <ul>
          <li><b>{fa(d.purchaseCommissionPercent)}٪ درآمد نقدی</b> از تمام خریدهای دوستان مستقیم، با آستانه برداشت {fa(d.withdrawalThreshold)} تومان.</li>
          <li><b>{fa(d.commissionPercent)}٪ کمیسیون امتیازی</b> از امتیازات حاصل از ثبت کارت و بازی ضربه‌زن دوست شما.</li>
          <li><b>هر {fa(d.invitesPerDailySpin)} دعوت</b> = ۱ چرخش روزانه دائمی به گردونه شانس (تا سقف {fa(d.maxInvitesForDaily)} نفر).</li>
          <li><b>دعوت نامحدود</b> برای دریافت چرخش‌های هدیه و جوایز.</li>
        </ul>
      </div>

      {d.friends.length > 0 ? (
        <div className="refList">
          <h3>دوستان تو ({fa(d.friends.length)})</h3>
          <ul>
            {d.friends.map((f, i) => (
              <li key={i}>
                <span>{f.nickname}</span>
                <b style={{display:'flex',gap:'8px',flexWrap:'wrap',justifyContent:'flex-end'}}><span>+{fa(f.earnedFromThem)} امتیاز</span><span style={{color:'#22E7A6'}}>+{fa(f.cashEarnedFromThem)} تومان</span></b>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="hint refEmpty">
          هنوز کسی با کد تو عضو نشده. اولین نفر را دعوت کن!
        </p>
      )}
    </section>
  );
}
