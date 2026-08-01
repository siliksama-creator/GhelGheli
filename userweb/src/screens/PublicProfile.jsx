// Another player's public profile, opened from chat or the league table.
import React, { useCallback, useEffect } from 'react';

import { req, asset, fa, avatars } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { LoadingView, ErrorView } from '../components/states.jsx';

export default function PublicProfile({ token, userId, close }) {
  const load = useCallback(
    () => req(`/api/users/${userId}/public`, 'GET', null, token),
    [userId, token]);
  const state = useAsync(load, [load]);

  // A modal with no keyboard escape traps desktop users.
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const u = state.data;

  return (
    <div className="modalShade" onClick={close}>
      <div className="publicModal" onClick={e => e.stopPropagation()}
        role="dialog" aria-label="پروفایل کاربر">
        <button className="close" onClick={close}>×</button>

        {state.loading && <LoadingView />}
        {state.error && <ErrorView error={state.error} onRetry={state.reload} />}

        {u && (
          <>
            <div className="publicHead">
              <img alt="آواتار"
                src={u.profile_image_url
                  ? asset(u.profile_image_url)
                  : `/avatars/${u.profile_avatar_key || avatars[0]}`} />
              <div>
                <h2>{u.nickname || 'کاربر'}</h2>
                <p>عضویت: {new Date(u.joined_at).toLocaleDateString('fa-IR')}</p>
                <p>
                  امتیاز کسب‌شده: {fa(u.lifetime_points)} | امتیاز فعلی:{' '}
                  {fa(u.current_points)}
                </p>
              </div>
            </div>

            <h3>کارت‌های ثبت‌شده</h3>
            {!u.cards?.length &&
              <p className="hint">هنوز کارتی ثبت نکرده است.</p>}
            {(u.cards || []).map(c => (
              <div className="reward" key={c.card_type_id}>
                <img alt={c.name || 'کارت'}
                  src={asset(c.image_url) || '/avatars/avatar_1_football.png'} />
                <div>
                  <b>{c.name}</b>
                  <p>
                    تعداد ثبت: {fa(c.registered_count)} — {fa(c.point_value)} امتیاز
                  </p>
                </div>
              </div>
            ))}

            <h3>جوایز دریافت‌شده</h3>
            {!u.rewards?.length &&
              <p className="hint">هنوز جایزه تاییدشده‌ای ندارد.</p>}
            {(u.rewards || []).map((r, i) => (
              <div className="reward" key={i}>
                <img alt={r.name || 'جایزه'}
                  src={asset(r.image_url) || '/avatars/avatar_2_trophy.png'} />
                <div><b>{r.name}</b><p>{r.status}</p></div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
