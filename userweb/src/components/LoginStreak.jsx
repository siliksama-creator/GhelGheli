import React, { useEffect, useState } from 'react';

import { fa, req } from '../lib/api.js';

/** A seven-day claim card shared by the web dashboard. */
export default function LoginStreak({ token, setMsg }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setData(await req('/api/login-streak', 'GET', undefined, token));
    } catch (error) {
      setMsg?.(error.message || 'استریک ورود در دسترس نیست');
    }
  };

  useEffect(() => {
    if (token) load();
  }, [token]);

  const claim = async () => {
    if (busy || data?.claimedToday) return;
    setBusy(true);
    try {
      const next = await req('/api/login-streak/claim', 'POST', {}, token);
      setData(next);
      setMsg?.(next.message || 'امتیاز استریک دریافت شد');
    } catch (error) {
      setMsg?.(error.message || 'دریافت پاداش ناموفق بود');
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!data?.active) return null;
  const days = Array.isArray(data.rewards) ? data.rewards : [];
  const nextDay = data.nextDay || 1;

  return (
    <section className="streakCard" aria-label="استریک ورود هفت روزه">
      <div className="streakHead">
        <img src="/pass/streak_icon.webp" alt="" className="streakArt" />
        <div className="streakCopy">
          <h3>استریک ورود</h3>
          <p>
            {data.claimedToday
              ? 'امروز جایزه‌ات را گرفتی؛ فردا برای روز بعد برگرد.'
              : 'هر روز یک بار وارد شو و امتیاز بگیر.'}
          </p>
        </div>
        <strong>{fa(data.totalClaims)}</strong>
      </div>

      <div className="streakDays">
        {days.map(day => (
          <div
            key={day.day}
            className={`streakDay${day.claimed ? ' is-claimed' : ''}${day.current ? ' is-current' : ''}`}
            title={`${fa(day.amount)} امتیاز`}
          >
            <span className="streakDayMark">{day.claimed ? '' : day.day}</span>
            <small>روز {fa(day.day)}</small>
          </div>
        ))}
      </div>

      <div className="streakFoot">
        <span>
          {data.claimedToday
            ? `روز ${fa(data.currentDay)} از ۷ تکمیل شد`
            : `روز ${fa(nextDay)} — پاداش ${fa(data.nextReward)} امتیاز`}
        </span>
        <button
          className="streakClaim"
          type="button"
          disabled={busy || data.claimedToday}
          onClick={claim}
        >
          {busy ? 'در حال ثبت...' : data.claimedToday ? 'دریافت شد' : 'دریافت امتیاز'}
        </button>
      </div>
    </section>
  );
}
