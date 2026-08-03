// دعوت دوستان — کد اختصاصی، آمار، و فهرست دوستان.
import React, { useCallback, useEffect, useState } from 'react';
import { req } from '../lib/api.js';

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
      // navigator.clipboard فقط روی HTTPS یا localhost کار می‌کند و در
      // وب‌ویوهای قدیمی اصلاً وجود ندارد؛ پس fallback لازم است وگرنه دکمه
      // روی همان دستگاه‌هایی که بیشترین کاربر را دارند بی‌صدا کار نمی‌کند.
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
      setMsg?.('کد کپی شد ✅');
    } catch {
      setMsg?.('کپی نشد — کد را دستی بردار');
    }
  };

  const share = async () => {
    const text = `با کد دعوت من توی قلقلی عضو شو: ${d.code}`;
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch { /* لغو شد */ }
    }
    copy();
  };

  if (err && !d) return <section className="card wide"><p className="hint">{err}</p></section>;
  if (!d) return <section className="card wide"><p className="hint">در حال بارگذاری…</p></section>;

  return (
    <section className="card wide refPage">
      <h2>🤝 دعوت دوستان</h2>
      <p className="hint">
        کدت را به دوستانت بده. هر کس با آن عضو شود،
        {' '}<b>{fa(d.spinsPerReferral)} چرخش گردونه</b> می‌گیری و برای همیشه
        {' '}<b>{fa(d.commissionPercent)}٪</b> از تمام امتیازهایی که او به دست
        می‌آورد به تو هم می‌رسد — بدون اینکه از امتیاز او کم شود.
      </p>

      <div className="refCodeBox">
        <span className="refCode" dir="ltr">{d.code}</span>
        <div className="refCodeBtns">
          <button className="ghost" onClick={copy}>کپی</button>
          <button className="primary" onClick={share}>ارسال برای دوستان</button>
        </div>
      </div>

      <div className="refStats">
        <div><b>{fa(d.invitedCount)}</b><span>دوست دعوت‌شده</span></div>
        <div><b>{fa(d.totalEarned)}</b><span>امتیاز از دوستان</span></div>
        <div><b>{fa(d.bonusSpins)}</b><span>چرخش باقی‌مانده</span></div>
      </div>

      {d.friends.length > 0 ? (
        <div className="refList">
          <h3>دوستان تو</h3>
          <ul>
            {d.friends.map((f, i) => (
              <li key={i}>
                <span>{f.nickname}</span>
                <b>{fa(f.earnedFromThem)} امتیاز</b>
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
