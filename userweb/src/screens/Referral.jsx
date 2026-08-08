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
      setMsg?.('کد کپی شد ');
    } catch {
      setMsg?.('کپی نشد — کد را دستی بردار');
    }
  };

  const share = async () => {
    const text = `با کد دعوت من توی قلقلی عضو شو و ${fa(d.spinsPerReferral)}`
      + ` چرخش گردونهٔ شانس بگیر! کد: ${d.code}`;
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch { /* لغو شد */ }
    }
    copy();
  };

  if (err && !d) return <section className="card wide"><p className="hint">{err}</p></section>;
  if (!d) return <section className="card wide"><p className="hint">در حال بارگذاری…</p></section>;

  return (
    <section className="card wide refPage">
      <h2> دعوت دوستان</h2>
      <p className="hint">
        کدت را به دوستانت بده. هر کس موقع ثبت‌نام آن را وارد کند،
        {' '}<b>هر دوی شما {fa(d.spinsPerReferral)} چرخش گردونه</b> می‌گیرید.
      </p>

      {/* توضیح کامل قوانین — خواستهٔ مالک. بدون این، کاربر نمی‌فهمد چرا
          امتیازی به حسابش اضافه شده یا چرا سهمیهٔ گردونه‌اش بالا رفته. */}
      <ul className="refRules">
        <li>
          <b>{fa(d.commissionPercent)}٪ کمیسیون دائمی</b> — از امتیازی که
          دوستت با <b>ثبت کد کارت</b> یا <b>بازی ضربه‌زن</b> به دست می‌آورد،
          {' '}{fa(d.commissionPercent)}٪ به تو هم می‌رسد. از امتیاز او
          چیزی کم نمی‌شود؛ این را ما اضافه می‌کنیم.
        </li>
        <li>
          <b>هر {fa(d.invitesPerDailySpin)} دعوت = یک چرخش روزانهٔ دائمی</b>
          {' '}— با {fa(d.invitesPerDailySpin)} دوست، هر روز
          {' '}{fa(2)} چرخش داری به‌جای یکی. تا سقف
          {' '}{fa(d.maxInvitesForDaily)} دوست ادامه دارد.
        </li>
        <li>
          <b>دعوت نامحدود است</b> — هر چند نفر که بخواهی می‌توانی دعوت کنی.
        </li>
        <li>
          جایزهٔ {fa(d.spinsPerReferral)} چرخش فقط <b>یک بار</b> برای هر
          دوست داده می‌شود.
        </li>
      </ul>

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
        <div><b>{fa(d.dailySpins)}</b><span>چرخش روزانه</span></div>
      </div>

      {/* پیشرفت تا چرخش روزانهٔ بعدی. یک هدف نزدیک و قابل دیدن، خیلی
          مؤثرتر از یک قانون نوشته‌شده در متن است. */}
      {!d.atDailyCap && d.invitesToNextDailySpin != null && (
        <div className="refProgress">
          <div className="refProgressBar">
            <span style={{
              width: `${((d.invitesPerDailySpin - d.invitesToNextDailySpin)
                / d.invitesPerDailySpin) * 100}%`,
            }} />
          </div>
          <small>
            {fa(d.invitesToNextDailySpin)} دوست دیگر تا
            {' '}{fa(d.dailySpins + 1)} چرخش روزانه
          </small>
        </div>
      )}
      {d.atDailyCap && (
        <p className="hint refCapped">
           به سقف {fa(d.maxInvitesForDaily)} دوست رسیدی — هر روز
          {' '}{fa(d.dailySpins)} چرخش رایگان داری!
        </p>
      )}

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
