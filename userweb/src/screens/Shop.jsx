// Cosmetic shop + GhelGheli Plus.
//
// Sells appearance only. Nothing here affects points, prizes or league
// standing — that separation is deliberate and worth keeping.
import React, { useCallback, useState } from 'react';

import { req, fa } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { AsyncSection } from '../components/states.jsx';

const KINDS = [
  ['club_badge', 'نشان باشگاه', '🛡️', 'کنار اسمت در چت و لیگ دیده می‌شود'],
  ['card_frame', 'قاب کارت', '🖼️', 'دور کارت‌های داخل پروفایلت'],
  ['name_color', 'رنگ اسم', '🎨', 'رنگ اسمت در جدول لیگ'],
];

// Frame previews are pure CSS, so a new frame needs no artwork.
const FRAME_STYLE = {
  gold: 'linear-gradient(135deg,#FFD36B,#B8860B)',
  neon: 'linear-gradient(135deg,#B5EF58,#00D49A)',
  fire: 'linear-gradient(135deg,#FF8A3D,#F43F5E)',
  ice: 'linear-gradient(135deg,#7DD3FC,#2563EB)',
  holo: 'linear-gradient(135deg,#F472B6,#A855F7,#38BDF8,#34D399)',
};

export default function Shop({ token, setMsg, reloadProfile }) {
  const load = useCallback(() => req('/api/shop', 'GET', null, token), [token]);
  const state = useAsync(load, [load]);
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null);

  async function run(fn, key) {
    if (busy) return;
    setBusy(key);
    try {
      const d = await fn();
      setMsg?.(d.message);
      state.reload();
      reloadProfile?.();
    } catch (e) {
      setMsg?.(e.message);
    } finally {
      setBusy(null);
      setConfirm(null);
    }
  }

  const buy = it => run(
    () => req(`/api/shop/items/${it.id}/buy`, 'POST', {}, token), it.id);
  const equip = slug => run(
    () => req('/api/shop/equip', 'POST', { slug }, token), 'equip' + slug);
  const buyPlus = () => run(
    () => req('/api/shop/plus', 'POST', {}, token), 'plus');

  return (
    <AsyncSection state={state} loadingLabel="در حال بارگذاری فروشگاه...">
      {d => {
        const equippedFor = kind =>
          kind === 'club_badge' ? d.equipped.club
            : kind === 'card_frame' ? d.equipped.frame
              : d.equipped.color;

        return (
          <div className="shopWrap">
            {/* ── Plus ─────────────────────────────────────────────── */}
            <section className={`card wide plusCard${d.plus.active ? ' on' : ''}`}>
              <div className="plusHead">
                <span className="plusStar">⭐</span>
                <div>
                  <h2>قلقلی پلاس</h2>
                  <p className="hint">
                    {d.plus.active
                      ? `فعال — ${fa(d.plus.daysLeft)} روز باقی مانده`
                      : 'یک ماه دسترسی به همهٔ آیتم‌ها، با امکان تعویض هر روز'}
                  </p>
                </div>
                <b className="plusPrice">{fa(d.plus.price)} <i>تومان</i></b>
              </div>
              <ul className="plusList">
                <li>✅ همهٔ نشان‌های باشگاهی، قاب‌ها و رنگ‌ها</li>
                <li>🔄 هر وقت خواستی عوض کن، بدون خرید دوباره</li>
                <li>💾 آیتم‌هایی که جدا خریده‌ای برای همیشه مال توست</li>
              </ul>
              <button className="main" disabled={busy === 'plus'}
                onClick={buyPlus}>
                {busy === 'plus' ? 'در حال خرید...'
                  : d.plus.active ? 'تمدید یک ماه دیگر' : 'فعال‌سازی پلاس'}
              </button>
            </section>

            {/* ── Items by kind ────────────────────────────────────── */}
            {KINDS.map(([kind, label, icon, note]) => {
              const items = d.items.filter(i => i.kind === kind);
              if (!items.length) return null;
              const active = equippedFor(kind);

              return (
                <section className="card wide" key={kind}>
                  <div className="shopHead">
                    <span className="shopIcon">{icon}</span>
                    <div>
                      <h2>{label}</h2>
                      <p className="hint">{note}</p>
                    </div>
                    {active && (
                      <button className="ghost shopClear"
                        onClick={() => equip(null)}>برداشتن</button>
                    )}
                  </div>

                  <div className="shopGrid">
                    {items.map(it => {
                      const on = active === it.payload;
                      return (
                        <div className={`shopItem${on ? ' equipped' : ''}`}
                          key={it.id}>
                          <div className="shopArt">
                            {kind === 'name_color' ? (
                              <span className="colorChip" style={{
                                background: it.payload === 'rainbow'
                                  ? 'linear-gradient(90deg,#F472B6,#A855F7,#38BDF8,#34D399)'
                                  : it.payload,
                              }} />
                            ) : kind === 'card_frame' ? (
                              <span className="framePreview" style={{
                                background: FRAME_STYLE[it.payload] || '#334155',
                              }} />
                            ) : (
                              // Shop artwork ships WITH the web app, so it must
                              // not go through asset(): that prefixes the API
                              // domain and produced broken images.
                              <img src={it.imageUrl} alt={it.name}
                                loading="lazy" decoding="async"
                                width="72" height="72" />
                            )}
                            {on && <span className="shopOn">انتخاب‌شده</span>}
                          </div>

                          <b>{it.name}</b>

                          {it.owned ? (
                            <span className="shopTag owned">خریداری‌شده</span>
                          ) : it.unlockedByPlus ? (
                            <span className="shopTag plus">با پلاس</span>
                          ) : (
                            <span className="shopPrice">
                              {fa(it.price)} تومان
                            </span>
                          )}

                          {it.usable ? (
                            <button className="ghost shopBtn"
                              disabled={on || busy === 'equip' + it.slug}
                              onClick={() => equip(it.slug)}>
                              {on ? 'فعال' : 'انتخاب'}
                            </button>
                          ) : (
                            <button className="main shopBtn"
                              disabled={busy === it.id}
                              onClick={() => setConfirm(it)}>
                              {busy === it.id ? '...' : 'خرید'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            {confirm && (
              <div className="modalShade" onClick={() => setConfirm(null)}>
                <div className="confirmBox" onClick={e => e.stopPropagation()}
                  role="dialog" aria-label="تایید خرید">
                  <h3>خرید «{confirm.name}»</h3>
                  <p>
                    <b>{fa(confirm.price)} تومان</b> از کیف پولت کم می‌شود و این
                    آیتم برای همیشه مال تو می‌شود.
                    <br />
                    <small>موجودی فعلی: {fa(d.balance)} تومان</small>
                  </p>
                  <div className="confirmActions">
                    <button className="ghost" onClick={() => setConfirm(null)}>
                      انصراف
                    </button>
                    <button className="main" onClick={() => buy(confirm)}>
                      بله، بخر
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      }}
    </AsyncSection>
  );
}
