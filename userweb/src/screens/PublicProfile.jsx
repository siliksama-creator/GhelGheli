// Another player's profile, opened from chat, the league table or a game.
//
// Shows the whole picture in one compact sheet: cosmetics, league finishes,
// every prize won, and the card collection — without becoming a long scroll.
import React, { useCallback, useEffect, useState } from 'react';

import { req, asset, fa, avatarUrl } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { LoadingView, ErrorView } from '../components/states.jsx';

const CLUB_IMG = {
  esteghlal: '/shop/club_esteghlal.webp',
  persepolis: '/shop/club_persepolis.webp',
  sepahan: '/shop/club_sepahan.webp',
  tractor: '/shop/club_tractor.webp',
  malavan: '/shop/club_malavan.webp',
};

const FRAME_STYLE = {
  gold: 'linear-gradient(135deg,#FFD36B,#B8860B)',
  neon: 'linear-gradient(135deg,#B5EF58,#00D49A)',
  fire: 'linear-gradient(135deg,#FF8A3D,#F43F5E)',
  ice: 'linear-gradient(135deg,#7DD3FC,#2563EB)',
  holo: 'linear-gradient(135deg,#F472B6,#A855F7,#38BDF8,#34D399)',
};

const medal = r => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : '🏅');

export function nameColorStyle(color) {
  if (!color) return undefined;
  if (color === 'rainbow') {
    return {
      background: 'linear-gradient(90deg,#F472B6,#A855F7,#38BDF8,#34D399)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
    };
  }
  return { color };
}

export default function PublicProfile({ token, userId, close }) {
  const load = useCallback(
    () => req(`/api/users/${userId}/public`, 'GET', null, token),
    [userId, token]);
  const state = useAsync(load, [load]);
  const [tab, setTab] = useState('prizes');

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const u = state.data;
  const cos = u?.cosmetics || {};

  return (
    <div className="modalShade" onClick={close}>
      <div className="publicModal pp" onClick={e => e.stopPropagation()}
        role="dialog" aria-label="پروفایل کاربر">
        <button className="close" onClick={close}>×</button>

        {state.loading && <LoadingView />}
        {state.error && <ErrorView error={state.error} onRetry={state.reload} />}

        {u && (
          <>
            {/* ── header ───────────────────────────────────────────── */}
            <div className="ppHead">
              <div className="ppAvatarWrap"
                style={cos.frame
                  ? { background: FRAME_STYLE[cos.frame] || undefined }
                  : undefined}>
                <img className="ppAvatar" alt="آواتار"
                  src={u.profile_image_url
                    ? asset(u.profile_image_url)
                    : avatarUrl(u.profile_avatar_key)} />
                {cos.club && CLUB_IMG[cos.club] && (
                  <img className="ppClub" src={CLUB_IMG[cos.club]}
                    alt="نشان باشگاه" width="30" height="30" />
                )}
              </div>

              <div className="ppWho">
                <h2 style={nameColorStyle(cos.color)}>
                  {u.nickname || 'کاربر'}
                  {cos.plus && <span className="ppPlus" title="عضو پلاس">⭐</span>}
                </h2>
                <small>
                  عضویت {new Date(u.joined_at).toLocaleDateString('fa-IR')}
                </small>
                {u.bestRank && (
                  <span className="ppBest">
                    {medal(u.bestRank)} بهترین رتبهٔ لیگ: {fa(u.bestRank)}
                  </span>
                )}
              </div>
            </div>

            {/* ── headline stats ───────────────────────────────────── */}
            <div className="ppStats">
              <div><b>{fa(u.lifetime_points)}</b><span>امتیاز کل</span></div>
              <div><b>{fa(u.current_points)}</b><span>امتیاز فعلی</span></div>
              <div><b>{fa(u.monthly_league_points)}</b><span>امتیاز این ماه</span></div>
              {u.totalPrizeAmount > 0 && (
                <div className="ppMoney">
                  <b>{fa(u.totalPrizeAmount)}</b><span>مجموع جوایز لیگ</span>
                </div>
              )}
            </div>

            {/* ── tabs keep the sheet short ────────────────────────── */}
            <div className="ppTabs">
              <button className={tab === 'prizes' ? 'on' : ''}
                onClick={() => setTab('prizes')}>
                🎁 جوایز ({fa((u.trophies?.length || 0) + (u.rewards?.length || 0))})
              </button>
              <button className={tab === 'league' ? 'on' : ''}
                onClick={() => setTab('league')}>
                🏆 لیگ ({fa(u.leagueHistory?.length || 0)})
              </button>
              <button className={tab === 'cards' ? 'on' : ''}
                onClick={() => setTab('cards')}>
                🃏 کارت‌ها ({fa(u.cards?.length || 0)})
              </button>
            </div>

            <div className="ppPane">
              {tab === 'prizes' && (
                (u.trophies?.length || u.rewards?.length) ? (
                  <div className="ppGrid">
                    {(u.trophies || []).map((t, i) => (
                      <div className="ppPrize" key={'t' + i}>
                        <img src={asset(t.image_url)
                          || avatarUrl('avatar_2_trophy.png')} alt={t.name}
                          loading="lazy" />
                        <b>{t.name}</b>
                        {t.status === 'pending' && <em>در انتظار</em>}
                      </div>
                    ))}
                    {(u.rewards || [])
                      .filter(r => r.reward_type === 'cash')
                      .map((r, i) => (
                        <div className="ppPrize cash" key={'r' + i}>
                          <img src={asset(r.image_url)
                            || avatarUrl('avatar_2_trophy.png')} alt={r.name}
                            loading="lazy" />
                          <b>{r.name}</b>
                          <em>💰 نقدی</em>
                        </div>
                      ))}
                  </div>
                ) : <p className="hint">هنوز جایزه‌ای نگرفته است.</p>
              )}

              {tab === 'league' && (
                u.leagueHistory?.length ? (
                  <div className="ppLeague">
                    {u.leagueHistory.map((h, i) => (
                      <div className="ppLeagueRow" key={i}>
                        <span className="ppMedal">{medal(h.rank)}</span>
                        <span className="ppMonth">{h.monthYear}</span>
                        <span className="ppRank">رتبهٔ {fa(h.rank)}</span>
                        <span className="ppPts">{fa(h.points)} امتیاز</span>
                        {h.prizeAmount > 0 && (
                          <span className="ppPrizeTag">
                            {fa(h.prizeAmount)} تومان
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : <p className="hint">هنوز در لیگی رتبه نگرفته است.</p>
              )}

              {tab === 'cards' && (
                u.cards?.length ? (
                  <div className="ppGrid">
                    {u.cards.map(c => (
                      <div className="ppPrize" key={c.card_type_id}>
                        <img src={asset(c.image_url)
                          || avatarUrl('avatar_1_football.png')} alt={c.name}
                          loading="lazy" />
                        <b>{c.name}</b>
                        <em>{fa(c.registered_count)}× · {fa(c.point_value)} امتیاز</em>
                      </div>
                    ))}
                  </div>
                ) : <p className="hint">هنوز کارتی ثبت نکرده است.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
