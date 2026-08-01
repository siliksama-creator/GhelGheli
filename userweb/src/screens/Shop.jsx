// Cosmetic shop + GhelGheli Plus.
//
// Sells appearance and club membership only. Nothing here affects points,
// prizes or league standing — that separation is deliberate and worth
// keeping: attaching cash rewards to a paid advantage would make the app
// pay-to-win and, legally, a game of chance.
//
// EVERY PURCHASE IS PERMANENT. Prices are set accordingly and the UI says so
// on the card, in the confirm dialog and in the receipt, because a user who
// only discovers the terms afterwards is a refund request.
import React, { useCallback, useState } from 'react';

import { req, fa } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { AsyncSection } from '../components/states.jsx';
import { FRAME_STYLE, clubImg } from '../components/Cosmetics.jsx';

const KINDS = [
  ['club_badge', 'باشگاه‌ها', '🛡️',
    'با خرید نشان، عضو دائمی باشگاه می‌شوی؛ اسمت در فهرست هواداران آن باشگاه '
    + 'می‌آید و می‌توانی نشان را عکس پروفایلت کنی.'],
  ['card_frame', 'قاب کارت', '🖼️', 'دور کارت‌های داخل پروفایلت'],
  ['name_color', 'رنگ اسم', '🎨', 'رنگ اسمت در جدول لیگ و چت'],
];

export default function Shop({ token, setMsg, reloadProfile }) {
  const load = useCallback(() => req('/api/shop', 'GET', null, token), [token]);
  const state = useAsync(load, [load]);
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [plusConfirm, setPlusConfirm] = useState(false);
  // After buying a badge, offer to make it the profile picture rather than
  // silently changing it — the crest is the user's face, not ours to swap.
  const [avatarOffer, setAvatarOffer] = useState(null);

  async function run(fn, key) {
    if (busy) return;
    setBusy(key);
    try {
      const d = await fn();
      setMsg?.(d.message);
      state.reload();
      reloadProfile?.();
      return d;
    } catch (e) {
      setMsg?.(e.message);
    } finally {
      setBusy(null);
      setConfirm(null);
      setPlusConfirm(false);
    }
  }

  const buy = async (it) => {
    const d = await run(
      () => req(`/api/shop/items/${it.id}/buy`, 'POST', {}, token), it.id);
    if (d?.joinedClub) setAvatarOffer({ slug: d.joinedClub, name: it.name });
  };
  const equip = (slug, kind) => run(
    () => req('/api/shop/equip', 'POST', { slug, kind }, token),
    'equip' + (slug || kind));
  const buyPlus = () => run(
    () => req('/api/shop/plus', 'POST', {}, token), 'plus');
  const useAsAvatar = club => run(
    () => req('/api/shop/club-avatar', 'POST', { club }, token), 'avatar');

  return (
    <AsyncSection state={state} loadingLabel="در حال بارگذاری فروشگاه...">
      {d => {
        const equippedFor = kind =>
          kind === 'club_badge' ? d.equipped.club
            : kind === 'card_frame' ? d.equipped.frame
              : d.equipped.color;

        return (
          <div className="shopWrap">
            {/* ── How the shop works ───────────────────────────────── */}
            <section className="card wide shopIntro">
              <h2>🛒 فروشگاه قلقلی</h2>
              <p>
                هر آیتمی که <b>جداگانه</b> بخری، برای همیشه مال توست — با تمام
                شدن اشتراک هم از بین نمی‌رود. آیتم‌ها فقط ظاهر بازی را عوض
                می‌کنند و هیچ تأثیری روی امتیاز، جایزه یا رتبهٔ لیگ ندارند.
              </p>
              <p className="hint">
                موجودی کیف پول: <b>{fa(d.balance)} تومان</b>
              </p>
            </section>

            {/* ── Plus ─────────────────────────────────────────────── */}
            <section className={`card wide plusCard${d.plus.active ? ' on' : ''}`}>
              <div className="plusHead">
                <span className="plusStar">⭐</span>
                <div>
                  <h2>قلقلی پلاس</h2>
                  <p className="hint">
                    {d.plus.active
                      ? `فعال — ${fa(d.plus.daysLeft)} روز باقی مانده`
                      : `${fa(d.plus.days)} روز دسترسی به همهٔ آیتم‌ها`}
                  </p>
                </div>
                <b className="plusPrice">{fa(d.plus.price)} <i>تومان</i></b>
              </div>

              <ul className="plusList">
                {(d.plus.perks || []).map(p => <li key={p}>✅ {p}</li>)}
              </ul>

              {/* The honest small print, before the money leaves. */}
              <div className="plusNote">
                <b>⏳ بعد از پایان اشتراک چه می‌شود؟</b>
                <p>{d.plus.expiryNote}</p>
              </div>

              <button className="main" disabled={busy === 'plus'}
                onClick={() => setPlusConfirm(true)}>
                {busy === 'plus' ? 'در حال خرید...'
                  : d.plus.active ? 'تمدید یک ماه دیگر' : 'فعال‌سازی پلاس'}
              </button>
              {d.plus.active && (
                <p className="hint plusRenewHint">
                  اگر زودتر تمدید کنی، روزهای باقی‌مانده از بین نمی‌رود و
                  ۳۰ روز به آن اضافه می‌شود.
                </p>
              )}
            </section>

            {/* ── My clubs ─────────────────────────────────────────── */}
            {d.clubs?.length > 0 && (
              <section className="card wide myClubs">
                <h2>🏟️ باشگاه‌های من</h2>
                <div className="myClubGrid">
                  {d.clubs.map(c => (
                    <div className="myClub" key={c.slug}>
                      <img src={clubImg(c.slug)} alt={c.name}
                        width="46" height="46" loading="lazy" />
                      <b>{c.name}</b>
                      <span className={c.permanent ? 'clubTag own' : 'clubTag plus'}>
                        {c.permanent ? 'دائمی' : 'با پلاس'}
                      </span>
                      <button className="ghost tiny"
                        disabled={busy === 'avatar'}
                        onClick={() => useAsAvatar(c.slug)}>
                        عکس پروفایلم شود
                      </button>
                    </div>
                  ))}
                </div>
                {d.clubs.some(c => !c.permanent) && !d.plus.active && (
                  <p className="hint clubWarn">
                    ⚠️ باشگاه‌هایی که با پلاس عضو شده‌ای، بدون اشتراک فعال فقط
                    تا آخرین انتخابت باقی می‌مانند. برای دائمی‌شدن، نشانشان را
                    جداگانه بخر.
                  </p>
                )}
              </section>
            )}

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
                        // Scoped to THIS kind: the old call cleared all three
                        // slots, so removing a badge also wiped your frame.
                        onClick={() => equip(null, kind)}>برداشتن</button>
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
                            <span className="shopTag owned">دائمی</span>
                          ) : it.member ? (
                            <span className="shopTag plus">عضوی</span>
                          ) : it.unlockedByPlus ? (
                            <span className="shopTag plus">با پلاس</span>
                          ) : (
                            <span className="shopPrice">
                              {fa(it.price)} تومان
                            </span>
                          )}

                          {(it.usable || it.member) ? (
                            <button className="ghost shopBtn"
                              disabled={on || busy === 'equip' + it.slug}
                              onClick={() => equip(it.slug, kind)}>
                              {on ? 'فعال' : kind === 'club_badge' && !it.member
                                ? 'عضو شو' : 'انتخاب'}
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

            {/* ── Confirm: single item ─────────────────────────────── */}
            {confirm && (
              <div className="modalShade" onClick={() => setConfirm(null)}>
                <div className="confirmBox" onClick={e => e.stopPropagation()}
                  role="dialog" aria-label="تایید خرید">
                  <h3>خرید «{confirm.name}»</h3>
                  <p>
                    <b>{fa(confirm.price)} تومان</b> از کیف پولت کم می‌شود.
                    <br />
                    ✅ این آیتم <b>برای همیشه</b> مال تو می‌شود — حتی اگر
                    اشتراک پلاس نداشته باشی یا تمام شود.
                    {confirm.kind === 'club_badge' && (
                      <>
                        <br />
                        🏟️ هم‌زمان <b>عضو دائمی</b> این باشگاه می‌شوی و اسمت در
                        فهرست هوادارانش می‌آید.
                      </>
                    )}
                    <br />
                    <small>موجودی فعلی: {fa(d.balance)} تومان</small>
                    {d.balance < confirm.price && (
                      <>
                        <br />
                        <small className="short">
                          ⚠️ موجودی‌ات {fa(confirm.price - d.balance)} تومان کم است.
                        </small>
                      </>
                    )}
                  </p>
                  <div className="confirmActions">
                    <button className="ghost" onClick={() => setConfirm(null)}>
                      انصراف
                    </button>
                    <button className="main"
                      disabled={d.balance < confirm.price}
                      onClick={() => buy(confirm)}>
                      بله، بخر
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Confirm: Plus ────────────────────────────────────── */}
            {plusConfirm && (
              <div className="modalShade" onClick={() => setPlusConfirm(false)}>
                <div className="confirmBox" onClick={e => e.stopPropagation()}
                  role="dialog" aria-label="تایید اشتراک">
                  <h3>{d.plus.active ? 'تمدید قلقلی پلاس' : 'فعال‌سازی قلقلی پلاس'}</h3>
                  <p>
                    <b>{fa(d.plus.price)} تومان</b> برای <b>{fa(d.plus.days)} روز</b>.
                    <br />
                    {d.plus.expiryNote}
                    <br />
                    <small>موجودی فعلی: {fa(d.balance)} تومان</small>
                    {d.balance < d.plus.price && (
                      <>
                        <br />
                        <small className="short">
                          ⚠️ موجودی‌ات {fa(d.plus.price - d.balance)} تومان کم است.
                        </small>
                      </>
                    )}
                  </p>
                  <div className="confirmActions">
                    <button className="ghost" onClick={() => setPlusConfirm(false)}>
                      انصراف
                    </button>
                    <button className="main"
                      disabled={d.balance < d.plus.price}
                      onClick={buyPlus}>
                      بله، فعال کن
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── Offer the new crest as a profile picture ─────────── */}
            {avatarOffer && (
              <div className="modalShade" onClick={() => setAvatarOffer(null)}>
                <div className="confirmBox" onClick={e => e.stopPropagation()}
                  role="dialog" aria-label="عکس پروفایل">
                  <h3>عکس پروفایلت را عوض کنیم؟</h3>
                  <img className="offerCrest" src={clubImg(avatarOffer.slug)}
                    alt={avatarOffer.name} width="96" height="96" />
                  <p>
                    نشان «{avatarOffer.name}» می‌تواند عکس پروفایلت شود.
                    هر وقت خواستی از صفحهٔ پروفایل عوضش کن.
                  </p>
                  <div className="confirmActions">
                    <button className="ghost" onClick={() => setAvatarOffer(null)}>
                      نه، فعلاً نه
                    </button>
                    <button className="main" onClick={() => {
                      useAsAvatar(avatarOffer.slug);
                      setAvatarOffer(null);
                    }}>
                      بله، عوض کن
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
