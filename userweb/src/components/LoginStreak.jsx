import React, { useEffect, useMemo, useState } from 'react';

import { fa, req } from '../lib/api.js';

/** A premium seven-day claim card shared by the web dashboard. */
export default function LoginStreak({ token, initialData, setMsg, onClaimed }) {
  const [data, setData] = useState(initialData || null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setData(await req('/api/login-streak', 'GET', undefined, token));
    } catch (error) {
      setMsg?.(error.message || 'استریک ورود در دسترس نیست');
    }
  };

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      return;
    }
    if (token) load();
  }, [token, initialData]);

  const claim = async () => {
    if (busy || data?.claimedToday) return;
    setBusy(true);
    try {
      const next = await req('/api/login-streak/claim', 'POST', {}, token);
      setData(next);
      setMsg?.(next.message || 'امتیاز استریک دریافت شد');
      // The claim changes the visible points total in the hero header. The old
      // card only refreshed itself, so users saw their reward message while the
      // balance above it stayed stale.
      onClaimed?.();
    } catch (error) {
      setMsg?.(error.message || 'دریافت پاداش ناموفق بود');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const days = Array.isArray(data?.rewards) ? data.rewards : [];
  const nextDay = Number(data?.nextDay || 1);
  const currentDay = Number(data?.currentDay || 0);
  const progressDay = data?.claimedToday ? currentDay : Math.max(0, nextDay - 1);
  const progress = Math.max(0, Math.min(100, Math.round(progressDay / 7 * 100)));
  const totalReward = useMemo(
    () => days.reduce((sum, day) => sum + Number(day.amount || 0), 0),
    [days]);

  if (!data?.active) return null;

  return (
    <section className={`streakCard${data.claimedToday ? ' is-done' : ' is-ready'}`}
      aria-label="استریک ورود هفت روزه">
      <span className="streakAura one" aria-hidden="true" />
      <span className="streakAura two" aria-hidden="true" />
      <span className="streakOrbit" aria-hidden="true" />

      <div className="streakHead">
        <div className="streakCopy">
          <span className="streakKicker">
            {data.claimedToday ? 'امروز زنجیره محفوظ شد' : 'آمادهٔ دریافت امروز'}
          </span>
          <h3>استریک ورود ۷ روزه</h3>
          <p>
            {data.claimedToday
              ? 'فردا برای ادامهٔ زنجیره برگرد؛ هر روز جایزه بزرگ‌تر می‌شود.'
              : 'امروز را قفل کن، امتیاز فوری بگیر و تا جایزهٔ طلایی روز هفتم جلو برو.'}
          </p>
        </div>

        <div className="streakHeroArt" aria-hidden="true">
          <img src="/pass/streak_hero.webp" alt="" />
          <b>روز {fa(nextDay)}</b>
        </div>
      </div>

      <div className="streakStats">
        <span><b>{fa(data.totalClaims)}</b><small>دریافت کل</small></span>
        <span><b>{fa(progressDay)}/۷</b><small>پیشرفت هفته</small></span>
        <span><b>{fa(totalReward)}</b><small>امتیاز چرخه</small></span>
      </div>

      <div className="streakProgress" aria-hidden="true">
        <span style={{ width: `${Math.max(4, progress)}%` }} />
      </div>

      <div className="streakDays">
        {days.map(day => (
          <div
            key={day.day}
            className={`streakDay${day.claimed ? ' is-claimed' : ''}${day.current ? ' is-current' : ''}`}
            title={`${fa(day.amount)} امتیاز`}
          >
            <span className="streakDayIcon" aria-hidden="true">
              {day.claimed ? '✓' : day.current ? '◆' : day.day}
            </span>
            <small>روز {fa(day.day)}</small>
            <b>+{fa(day.amount)}</b>
          </div>
        ))}
      </div>

      <div className="streakFoot">
        <span>
          {data.claimedToday
            ? `روز ${fa(data.currentDay)} از ۷ تکمیل شد؛ زنجیره‌ات امن است.`
            : `روز ${fa(nextDay)} — پاداش ${fa(data.nextReward)} امتیاز آماده است.`}
        </span>
        <button
          className="streakClaim"
          type="button"
          disabled={busy || data.claimedToday}
          onClick={claim}
        >
          {!busy && !data.claimedToday && <img src="/pass/cta_spark.webp" alt="" />}
          <span>{busy ? 'در حال ثبت...' : data.claimedToday ? 'دریافت شد' : 'دریافت امروز'}</span>
        </button>
      </div>
    </section>
  );
}
