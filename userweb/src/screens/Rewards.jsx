// Reward catalogue + claiming.
//
// FEATURE GAP THIS CLOSES: the Android app has always been able to claim a
// reward (POST /api/rewards/:id/claim) while the web could only LOOK at the
// list. A web-only user had no way to actually receive anything they had
// earned.
import React, { useState } from 'react';

import { req, asset, fa } from '../lib/api.js';
import { EmptyView } from '../components/states.jsx';

export default function Rewards({ rewards, points = 0, token, reload, setMsg }) {
  const [claiming, setClaiming] = useState(null);
  const [confirm, setConfirm] = useState(null);

  async function claim(r) {
    if (claiming) return;
    setClaiming(r.id);
    setConfirm(null);
    try {
      const d = await req(`/api/rewards/${r.id}/claim`, 'POST', {}, token);
      setMsg?.(d.message || 'درخواست جایزه ثبت شد');
      // Claiming spends every point and consumes the card inventory, so the
      // dashboard must be re-read rather than patched locally.
      reload?.();
    } catch (e) {
      setMsg?.(e.message);
    } finally {
      setClaiming(null);
    }
  }

  if (!rewards?.length) {
    return (
      <section className="card wide">
        <h2>جوایز</h2>
        <EmptyView icon="🎁">هنوز جایزه‌ای تعریف نشده است.</EmptyView>
      </section>
    );
  }

  return (
    <section className="card wide">
      <h2>جوایز</h2>
      <p className="hint">
        با رسیدن به امتیاز لازم می‌توانی جایزه را درخواست کنی. با ثبت درخواست،
        امتیاز فعلی و کارت‌های ثبت‌شده‌ات مصرف می‌شوند.
      </p>

      <div className="cards">
        {rewards.map(r => {
          const need = Number(r.required_points) || 0;
          const eligible = Number(points) >= need;
          const busy = claiming === r.id;
          return (
            <div className={`rewardCard${eligible ? ' eligible' : ''}`} key={r.id}>
              <img alt={r.name || 'جایزه'}
                src={asset(r.image_url) || '/avatars/avatar_2_trophy.png'} />
              <b>{r.name}</b>
              <p>{fa(need)} امتیاز</p>
              {r.reward_value && <small>{r.reward_value}</small>}

              {eligible ? (
                <button className="main rewardClaim" disabled={busy}
                  onClick={() => setConfirm(r)}>
                  {busy ? 'در حال ثبت...' : 'دریافت'}
                </button>
              ) : (
                <span className="rewardLocked">
                  {fa(Math.max(0, need - Number(points)))} امتیاز مانده
                </span>
              )}
            </div>
          );
        })}
      </div>

      {confirm && (
        <div className="modalShade" onClick={() => setConfirm(null)}>
          <div className="confirmBox" onClick={e => e.stopPropagation()}
            role="dialog" aria-label="تایید درخواست جایزه">
            <h3>درخواست «{confirm.name}»</h3>
            {/* Claiming is irreversible and zeroes the balance, so it must
                never happen on a single stray tap. */}
            <p>
              با ثبت این درخواست، <b>{fa(points)} امتیاز</b> فعلی و همهٔ
              کارت‌های ثبت‌شده‌ات مصرف می‌شوند و قابل بازگشت نیست. ادامه
              می‌دهی؟
            </p>
            <div className="confirmActions">
              <button className="ghost" onClick={() => setConfirm(null)}>
                انصراف
              </button>
              <button className="main" onClick={() => claim(confirm)}>
                بله، ثبت کن
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
