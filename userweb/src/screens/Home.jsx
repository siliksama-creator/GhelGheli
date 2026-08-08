// Dashboard: points, next reward, wallet shortcut, card redemption, inventory.
import React, { useMemo, useState } from 'react';

import { req, asset, fa, avatars, avatarUrl } from '../lib/api.js';
import { EmptyView } from '../components/states.jsx';
import PhotoCardBox from '../components/PhotoCardBox.jsx';
import LoginStreak from '../components/LoginStreak.jsx';

// ═══════════════════════════════════════════════════════════════════════════
// منطقِ کلکسیون — آینهٔ inventory_page.dart در اندروید
// ═══════════════════════════════════════════════════════════════════════════
//
// گزارش مالک: کاربر ممکن است ~۵۰ نوع کارت داشته باشد و «ترتیب خوبی
// ندارد». گرید از قبل بود ولی ترتیب همیشه الفبایی و بدون جست‌وجو —
// یعنی کارتی که همین حالا ثبت شده وسطِ لیست گم می‌شد.
//
// این توابع عمداً با نسخهٔ دارت یکی‌اند (همان ترتیب‌ها، همان شکستنِ
// تساوی) تا کاربری که هم اپ و هم وب را باز می‌کند دو ترتیبِ متفاوت
// نبیند.
const asInt = v => {
  const n = parseInt(String(v ?? 0).split('.')[0], 10);
  return Number.isFinite(n) ? n : 0;
};

const sortDate = m => {
  const t = Date.parse(m.updated_at || m.created_at || '');
  return Number.isFinite(t) ? t : 0;
};

export function filterAndSort(items, query = '', sort = 'recent') {
  const q = String(query).trim().toLowerCase();
  const out = q
    ? items.filter(m => String(m.name || '').toLowerCase().includes(q))
    : [...items];
  const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fa');
  if (sort === 'recent') {
    // شکستنِ تساوی با نام: چند کارت می‌توانند دقیقاً یک زمان داشته
    // باشند و بدون این، ترتیبشان بین دو بارگذاری می‌پرد.
    out.sort((a, b) => (sortDate(b) - sortDate(a)) || byName(a, b));
  } else if (sort === 'value') {
    out.sort((a, b) => (asInt(b.point_value) - asInt(a.point_value)) || byName(a, b));
  } else {
    out.sort(byName);
  }
  return out;
}

export function collectionStats(items) {
  let total = 0; let points = 0;
  for (const m of items) {
    const q = asInt(m.quantity);
    total += q;
    // ضرب در تعداد: کسی که سه نسخه دارد سه برابر امتیاز گرفته.
    points += q * asInt(m.point_value);
  }
  return { kinds: items.length, total, points };
}

/** کارت در ۴۸ ساعت گذشته اضافه شده؟ */
export function isNewCard(item) {
  const t = Date.parse(item.updated_at || item.created_at || '');
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < 48 * 3600 * 1000;
}

const SORTS = [
  ['recent', 'تازه‌ترین'],
  ['value', 'باارزش‌ترین'],
  ['name', 'الفبا'],
];

function Avatar({ u, size = 72 }) {
  const src = u.profile_image_url
    ? asset(u.profile_image_url)
    : avatarUrl(u.profile_avatar_key);
  return (
    <img className="avatar" src={src} alt="آواتار"
      style={{ width: size, height: size }} />
  );
}

function CardLightbox({ item, close }) {
  return (
    <div className="modalShade" onClick={close}>
      <div className="cardBig" onClick={e => e.stopPropagation()}>
        <button className="close" onClick={close}>×</button>
        <img src={asset(item.image_url) || avatarUrl('avatar_1_football.png')}
          alt={item.name || 'کارت'} />
        <h2>{item.name || 'کارت'}</h2>
        <p>تعداد: {fa(item.quantity)} — {fa(item.point_value)} امتیاز</p>
        {item.description && <p className="hint">{item.description}</p>}
      </div>
    </div>
  );
}

export default function Home({ token, p, rewards, load, setMsg, openWallet,
  openWheel, openInvite }) {
  const [bigCard, setBigCard] = useState(null);
  const [invQuery, setInvQuery] = useState('');
  const [invSort, setInvSort] = useState('recent');

  const u = p.user;
  const sorted = [...rewards].sort(
    (a, b) => a.required_points - b.required_points);
  const next = sorted.find(r => u.current_points < r.required_points)
    || sorted.at(-1);
  const progress = next
    ? Math.min(1, u.current_points / next.required_points) : 0;

  const inventory = p.inventory || [];
  const invStats = useMemo(() => collectionStats(inventory), [inventory]);
  const invShown = useMemo(
    () => filterAndSort(inventory, invQuery, invSort),
    [inventory, invQuery, invSort]);

  return (
    <div className="grid">
      <section className="card heroCard">
        <Avatar u={u} />
        <h2>{u.nickname || u.mobile}</h2>
        <h1>{fa(u.current_points)} امتیاز</h1>
        <div className="bar"><span style={{ width: progress * 100 + '%' }} /></div>
        <p>
          {next
            ? `تا جایزه ${next.name}: ${fa(Math.max(0, next.required_points - u.current_points))} امتیاز مانده`
            : 'هنوز جایزه‌ای تعریف نشده'}
        </p>

        <button
          className={`walletEntry${Number(u.wallet_balance) > 0 ? ' hasMoney' : ''}`}
          onClick={openWallet}>
          <img className="weIcon" src="/pass/icon_points.png" alt="" />
          <span className="weBody">
            <small>کیف پول من</small>
            <b>{fa(u.wallet_balance)} <i>تومان</i></b>
          </span>
          <span className="weCta">
            {Number(u.wallet_balance) > 0 ? 'برداشت' : 'مشاهده'} ‹
          </span>
        </button>

        <h2>ثبت کارت‌های قلقلی</h2>
        <p className="hint">
          (پک کارت های قلقلی بصورت فیزیکی در فروشگاه ها و سوپرمارکت ها به فروش
          می رسند.)
        </p>

        {/* ══════════════════════════════════════════════════════════════
            چرا فرمِ «فقط کد» حذف شد
            ══════════════════════════════════════════════════════════════

            خواستهٔ صریح مالک: «در هر صورت کاربر باید عکس و کد رو باهم
            بفرسته».

            دو مسیرِ موازی دو مشکل داشت:

              ۱. دو کادرِ «کد» پشتِ سرِ هم روی یک صفحه با دو دکمهٔ
                 متفاوت — کاربر نمی‌دانست کدام را بزند.

              ۲. مهم‌تر: مسیرِ «فقط کد» عکس نمی‌خواست، پس هیچ مدرکی نبود
                 که کاربر کارتِ فیزیکی را دارد. کسی که فقط رشتهٔ کد را
                 از دوستش گرفته بود امتیاز می‌گرفت.

            مسیرِ `/api/cards/redeem` در سرور دست‌نخورده ماند (کدهای
            قدیمیِ در گردش) ولی دیگر از رابط صدا زده نمی‌شود. */}
        <PhotoCardBox token={token} setMsg={setMsg} onDone={load} />
      </section>

      {/* دو میان‌بر: گردونهٔ روزانه و دعوت دوستان. روی صفحهٔ اصلی‌اند چون
          هر دو کاری هستند که کاربر باید هر روز انجام دهد؛ اگر فقط در تب
          خودشان بودند، بیشترِ کاربرها هیچ‌وقت پیدایشان نمی‌کردند. */}
      <section className="card quickRow">
        <button className="quickTile wheelTile" onClick={openWheel}>
          <img className="quickIcon" src="/pass/wheel_icon.webp" alt="" />
          <b>گردونهٔ شانس</b>
          <small>هر روز یک چرخش رایگان</small>
        </button>
        <button className="quickTile inviteTile" onClick={openInvite}>
          <svg className="quickIcon inviteIcon" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="23" cy="22" r="9" />
            <circle cx="43" cy="22" r="9" />
            <path d="M8 52c1-11 8-17 15-17s14 6 15 17M26 52c1-8 6-13 13-13s12 5 14 13" />
            <path d="M32 31v14M25 38h14" />
          </svg>
          <b>دعوت دوستان</b>
          <small>۵٪ امتیازشان + ۳ چرخش</small>
        </button>
      </section>

      <LoginStreak
        token={token}
        initialData={p.loginStreak}
        setMsg={setMsg}
        onClaimed={load}
      />

      <section className="card">
        <h2>کلکسیون من</h2>
        {inventory.length ? (
          <>
            {/* نوارِ آمار: کلکسیون وقتی جذاب است که کاربر رشدش را ببیند. */}
            <div className="invStats">
              <div><b>{fa(invStats.kinds)}</b><span>نوع کارت</span></div>
              <div><b>{fa(invStats.total)}</b><span>کل کارت‌ها</span></div>
              <div><b>{fa(invStats.points)}</b><span>ارزش</span></div>
            </div>

            {/* جست‌وجو فقط وقتی معنا دارد که چیزی برای گشتن باشد. */}
            {inventory.length >= 8 && (
              <input className="invSearch" type="search"
                placeholder="جست‌وجو در کارت‌ها…"
                value={invQuery} onChange={e => setInvQuery(e.target.value)} />
            )}

            {inventory.length >= 2 && (
              <div className="invSorts">
                {SORTS.map(([k, label]) => (
                  <button key={k} type="button"
                    className={invSort === k ? 'on' : ''}
                    onClick={() => setInvSort(k)}>{label}</button>
                ))}
              </div>
            )}

            {invShown.length ? (
              <div className="invGrid">
                {invShown.map(i => (
                  <button className="invCard" key={i.id} title="نمایش بزرگ کارت"
                    onClick={() => setBigCard(i)}>
                    <span className="invArt">
                      <img src={asset(i.image_url) || avatarUrl('avatar_1_football.png')}
                        alt={i.name || 'کارت'} loading="lazy" />
                      {isNewCard(i) && <em className="invNew">جدید</em>}
                      {/* «×۱» روی هر کارت فقط نویز است. */}
                      {asInt(i.quantity) > 1 &&
                        <em className="invQty">×{fa(i.quantity)}</em>}
                    </span>
                    <b>{i.name}</b>
                    <small>{fa(i.point_value)} امتیاز</small>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyView icon="search">
                کارتی با این نام پیدا نشد.
              </EmptyView>
            )}
          </>
        ) : (
          <EmptyView icon="football">
            هنوز کارتی ثبت نکرده‌ای. کد پشت کارت را بالا وارد کن.
          </EmptyView>
        )}
      </section>

      {bigCard && <CardLightbox item={bigCard} close={() => setBigCard(null)} />}
    </div>
  );
}

export { Avatar };
