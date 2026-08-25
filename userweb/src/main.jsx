// App shell: theme, auth gate, tab routing.
//
// Screen implementations live under ./screens, reusable pieces under
// ./components, and the HTTP layer under ./lib. This file used to hold all of
// it in ~250 lines whose longest single line was 1775 characters, which made
// every change risky — the "stuck on a loading spinner forever" bug in the
// league tab survived several passes precisely because it was invisible in
// that wall of text.
import React, { useEffect, useState, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';

import { API, req, fa } from './lib/api.js';
import { primeImageCache, registerImageCacheWorker } from './lib/imageCache.js';
import Notifications from './components/Notifications.jsx';
import Auth from './screens/Auth.jsx';
import Home from './screens/Home.jsx';
import { LoadingView, ErrorView } from './components/states.jsx';
import { UiIcon } from './components/IconAsset.jsx';

// ── چرا این‌ها تنبل بارگذاری می‌شوند ──────────────────────────────────────
//
// همه‌چیز ایستا import می‌شد، پس یک باندلِ ۴۸۸KB ساخته می‌شد که کاربر
// **قبل از دیدنِ صفحهٔ ورود** تمامش را دانلود می‌کرد — شاملِ موتورِ هر سه
// بازی. اندازه‌گیریِ پایه روی ۴G با CPU چهاربرابر کندتر: FCP = ۲۴۴۸ms.
//
// `Auth` و `Home` ایستا می‌مانند چون اولین چیزی هستند که دیده می‌شوند؛
// تنبل‌کردنشان فقط یک رفت‌وبرگشتِ اضافه اضافه می‌کرد. بقیه پشت تعاملِ
// کاربرند و تا کلیک‌نشدن هیچ‌کس به آن‌ها نیاز ندارد.
//
// هیچ امکانی حذف نشده — فقط زمانِ رسیدنش عوض شده.
const Profile = lazy(() => import('./screens/Profile.jsx'));
const League = lazy(() => import('./screens/League.jsx'));
const Chat = lazy(() => import('./screens/Chat.jsx'));
const PublicProfile = lazy(() => import('./screens/PublicProfile.jsx'));
const Rewards = lazy(() => import('./screens/Rewards.jsx'));
const Shop = lazy(() => import('./screens/Shop.jsx'));
const Wheel = lazy(() => import('./screens/Wheel.jsx'));
const Referral = lazy(() => import('./screens/Referral.jsx'));
const Pass = lazy(() => import('./screens/Pass.jsx'));
const GamesHub = lazy(() => import('./games.jsx'));
const GrowthHub = lazy(() => import('./GrowthHub.jsx'));
const Support = lazy(() => import('./support.jsx'));
const Wallet = lazy(() => import('./wallet.jsx'));
const Inventory = lazy(() => import('./screens/Inventory.jsx'));

// وقتی کاربر روی تبی می‌زند، چانکش تازه دانلود می‌شود. برای اینکه آن
// لحظه صفر حس شود، به‌محضِ بی‌کار شدنِ مرورگر چانک‌های پرتردد را از
// پیش می‌گیریم. کاربر هیچ‌وقت منتظر نمی‌ماند، ولی بایت‌ها هم جلوی
// رندرِ اول را نگرفته‌اند.
function prefetchTabs() {
  const warm = () => {
    import('./games.jsx');
    import('./screens/League.jsx');
    import('./screens/Rewards.jsx');
    import('./screens/Shop.jsx');
    import('./screens/Chat.jsx');
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(warm, { timeout: 4000 });
  else setTimeout(warm, 2500);
}

import './style.css';
// AFTER style.css on purpose: style.css is full of `font-weight:900` (and one
// 1000), which would otherwise win the cascade and force the browser to
// synthesise a smeared fake bold. Vazirmatn's heaviest real cut is 800.
// Enforced by tool/typography.mjs.
import './typography.css';
// LAST: the theme layer overrides style.css surface colours.
import './theme.css';

// ── ناوبری ────────────────────────────────────────────────────────────────
//
// پنج مقصد در نوار پایین، بقیه پشت «بیشتر».
//
// قبلاً هر هفت تب در یک نوار افقیِ اسکرول‌شونده بودند. روی موبایل یعنی
// دکمه‌های ۶۸ پیکسلی چسبیده به هم که باید اسکرول می‌شدند تا پیدا شوند —
// کاربر نمی‌دانست چند تب هست و «پشتیبانی» عملاً نامرئی بود. راهنمای متریال
// هم سقف پنج می‌گذارد، به همین دلیل.
//
// اپ اندروید از قبل همین کار را می‌کرد؛ این وب را با آن هم‌شکل می‌کند.
const NAV_TABS = [
  ['home', 'خانه', 'home'],
  ['rewards', 'جوایز', 'gift'],
  ['league', 'لیگ', 'trophy'],
  ['club', 'چت و بازی', 'game'],
];

const MORE_TABS = [
  // 🔴 دورِ ۳۲ — فروشگاه به اینجا اضافه شد.
  //
  // شکایتِ کاربر: «آیکون شاپ در وبِ موبایل درست وجود ندارد.» بررسی نشان
  // داد دکمه هست و مخفی هم نیست (۴۴×۴۴، opacity ۱)، ولی تنها راهِ رسیدن
  // به فروشگاه یک آیکونِ ۲۱ پیکسلیِ بی‌برچسب در ردیفِ شلوغِ هدر بود، کنارِ
  // زنگ و گردونه و گذرِ نبرد. آیکونِ بی‌متن در میان چهار آیکونِ دیگر عملاً
  // نامرئی است — کاربر آن را «نبودن» تجربه می‌کند، و حق دارد.
  //
  // اندروید فروشگاه را یک مقصدِ نام‌دارِ شماره‌دار دارد (`shopIndex = 9` در
  // `home_shell.dart`) که از شیتِ «بیشتر» با متنِ کامل باز می‌شود. وب باید
  // آینهٔ همان باشد. دکمهٔ هدر هم می‌ماند: میان‌بر برای کسی که بلد است.
  //
  // چرا اولِ فهرست: فروشگاه تنها مسیرِ درآمدیِ اپ است؛ ته‌فهرست‌گذاشتنش
  // همان اشتباهِ قبلی با ظاهرِ تازه است.
  ['shop', 'فروشگاه', 'shop'],
  ['inventory', 'کلکسیون کارت‌ها', 'card'],
  ['wallet', 'کیف پول', 'wallet'],
  // دعوت دوستان قبلاً فقط از میان‌بر داشبورد باز می‌شد؛ اگر کاربر آن
  // کارت را رد می‌کرد، صفحه عملاً گم می‌شد.
  ['invite', 'دعوت دوستان', 'group'],
  ['support', 'پشتیبانی', 'support'],
  ['profile', 'پروفایل', 'profile'],
];


// ═══════════════════════════════════════════════════════════════════════════
// تمِ روشن حذف شد
// ═══════════════════════════════════════════════════════════════════════════
//
// دو دلیل:
//
//   ۱. منبعِ پایدارِ باگ بود. هر رنگی باید دو بار سنجیده می‌شد و در عمل
//      نمی‌شد؛ ممیزیِ پیکسلیِ آخر چند متنِ ناخوانا **فقط** در تمِ روشن
//      پیدا کرد. هر کامپوننتِ جدید یک شاخهٔ CSS اضافه لازم داشت که
//      فراموش کردنش بی‌صدا خرابی می‌ساخت.
//
//   ۲. هویتِ بصریِ قلقلی تیره است — سبزِ نئونی و آبی روی سرمه‌ای.
//
// `data-theme` دیگر هرگز روی `light` تنظیم نمی‌شود و کلیدِ ذخیره‌شدهٔ
// قدیمی هم پاک می‌شود، وگرنه کاربری که قبلاً روشن انتخاب کرده بود
// برای همیشه با استایلِ نیمه‌کاره می‌ماند.
function useDarkOnly() {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#06101d');
    // پاکسازیِ ترجیحِ قدیمی — بدون این، `localStorage.theme` تا ابد
    // 'light' می‌ماند و اگر روزی کسی دوباره کد را بخواند گیج می‌شود.
    try { delete localStorage.theme; } catch { /* private mode */ }
  }, []);
}

/**
 * کوتاه‌کردنِ متنِ خطا بدون از دست دادنِ دو سرِ آن.
 *
 * پیام‌های خطای مرورگر گاهی یک رشتهٔ غول‌پیکر (مثلاً کلِ یک شیتِ CSS) را
 * داخل خود دارند و نکتهٔ تعیین‌کننده در انتهاست. بریدنِ ساده از ابتدا
 * همان نکته را دور می‌ریزد، پس وسط را حذف می‌کنیم.
 */
function squeeze(value, limit) {
  const text = String(value ?? '');
  if (text.length <= limit) return text;
  const head = Math.ceil((limit - 20) * 0.7);
  const tail = limit - 20 - head;
  return `${text.slice(0, head)} … [${text.length}] … ${text.slice(-tail)}`;
}

function App() {
  const [token, setToken] = useState(() => {
    try { return localStorage.token || ''; } catch { return ''; }
  });
  useDarkOnly();
  // پیکربندی کلاینت (بنر اطلاعیه و…) — از /api/config، بدون نیاز به آپدیت.
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    req('/api/config', 'GET', null, null).then(setCfg).catch(() => {});
  }, []);
  useEffect(() => {
    if (!token) return undefined;
    let reporting = false;
    const report = (source, message, stack) => {
      if (reporting) return;
      reporting = true;
      req('/api/telemetry/crash', 'POST', {
        platform: 'web', source, release: import.meta.env.VITE_APP_RELEASE || 'web',
        // بریدنِ سادهٔ ۲۰۰۰ کاراکترِ اول یک‌بار تحلیل را کور کرد: پیامِ
        // `TypeError: "<کل شیتِ CSS>" is not a function` دقیقاً سرِ ۲۰۰۰
        // بریده شد و همان تکهٔ تعیین‌کننده («is not a function») که علت را
        // می‌گفت از دست رفت. حالا وسط حذف می‌شود تا هم ابتدا هم انتهای
        // پیام برسد.
        message: squeeze(message || 'Unknown browser error', 2000),
        stack: String(stack || '').slice(0, 10000),
        context: { path: location.pathname },
      }, token).catch(() => {}).finally(() => { reporting = false; });
    };
    // `Script error.` تنها چیزی است که مرورگر از خطای یک اسکریپتِ
    // cross-origin (افزونه‌های مرورگر، اسکریپتِ تزریقیِ اپراتور) بیرون
    // می‌دهد: بدون پیام، بدون stack، بدون فایل. در تولید ۹ ردیف از این
    // نوع ثبت شده و هیچ‌کدام قابلِ پیگیری نیستند چون کدِ ما نیستند —
    // اسکریپت‌های خودمان same-origin و با crossorigin بارگذاری می‌شوند.
    //
    // نگه‌داشتنشان فقط صندوقِ کرش را کور می‌کند، پس ثبت نمی‌شوند.
    const isOpaqueForeignError = event =>
      (event.message === 'Script error.' || event.message === 'Script error')
      && !event.error && !event.filename;
    const onError = event => {
      if (isOpaqueForeignError(event)) return;
      report('window.error', event.message || event.error, event.error?.stack);
    };
    const onRejection = event => report('unhandledrejection', event.reason?.message || event.reason, event.reason?.stack);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [token]);
  const [mode, setMode] = useState(
    location.hostname.startsWith('register.') ? 'register' : 'login');

  function logout() {
    try {
      localStorage.removeItem('token');
      // Game progress is per-user. Leaving it behind meant the next person to
      // sign in on a shared browser saw (and briefly played as) the previous
      // user's save until the server corrected it.
      localStorage.removeItem('tap_game_progress_v1');
    } catch { /* private mode */ }
    setToken('');
  }

  return (
    <div className={`page ${token ? 'signedIn' : ''}`}>
      {cfg?.features?.maintenance?.active && (
        <div
          style={{
            display: 'block', textAlign: 'center', padding: '10px 14px',
            fontSize: 13, fontWeight: 800, color: '#1a0f02',
            background: 'linear-gradient(90deg,#F97316,#EF4444)',
          }}
        >
          {cfg.features.maintenance.message || 'سرویس موقتاً در دسترس نیست. کمی بعد دوباره سر بزن.'}
        </div>
      )}
      {cfg?.announcement?.active && cfg.announcement.text && (
        <a
          className="cfgBanner"
          href={cfg.announcement.link || undefined}
          target={cfg.announcement.link ? '_blank' : undefined}
          rel="noreferrer"
          style={{
            display: 'block', textAlign: 'center', padding: '9px 14px',
            fontSize: 12.5, fontWeight: 800, color: '#1a0f02',
            background: 'linear-gradient(90deg,#FFD166,#F97316)',
            textDecoration: 'none',
          }}
        >
          {cfg.announcement.text}
        </a>
      )}
      {/* The animated brand mark. Matches the Flutter AnimatedLogo widget:
          aurora behind, settle-in entrance, a specular sweep clipped to the
          logo's own shape, and phased sparkles. Built with CSS rather than a
          GIF/video so it stays crisp at any size and costs no extra download
          over the image that was already here. */}
      {!token && (
        <div className="hero heroAnim">
          <div className="heroAurora" aria-hidden="true" />
          <div className="heroMark">
            <img src="/logo.webp" alt="قلقلی" width="330" height="273" />
            {/* The sweep is a second copy of the artwork, masked to itself,
                so the highlight travels across the LETTERS instead of over
                an invisible rectangle. */}
            <span className="heroSweep" aria-hidden="true" />
            {/* One glint on the mascot's face, fired just after the sweep
                passes it — so it reads as the light catching a highlight,
                not as an unrelated effect. Replaced six generic dots
                scattered over the bounding box. */}
            <span className="heroGlint" aria-hidden="true" />
          </div>
          <b>قلقلی</b>
        </div>
      )}

      {token ? (
        <Portal token={token} logout={logout} />
      ) : (
        <>
          <Auth mode={mode} setMode={setMode}
            done={t => {
              try { localStorage.token = t; } catch { /* private mode */ }
              setToken(t);
            }} />
        </>
      )}
    </div>
  );
}

function Portal({ token, logout }) {
  const sharedRoom = new URLSearchParams(window.location.search).get('room');
  const [tab, setTab] = useState(sharedRoom ? 'club' : 'home');
  const [p, setP] = useState(null);
  const [rewards, setRewards] = useState([]);
  const [msg, setMsg] = useState('');
  const [publicUser, setPublicUser] = useState(null);
  const [loadError, setLoadError] = useState(null);
  // تعداد چرخش امروز، برای نشان کنار آیکون گردونه — خواستهٔ مالک:
  // «کنار آیکون گردونه در صفحه اصلی تعداد شانس روز گردونه مشخص باشه».
  const [spins, setSpins] = useState(null);
  // خلاصهٔ گذر نبرد برای نشانِ نوار بالا. از همان /api/bootstrap می‌آید،
  // پس هیچ رفت‌وبرگشت اضافه‌ای ندارد.
  const [passBrief, setPassBrief] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);

  async function load() {
    try {
      setLoadError(null);
      // Fan out: the profile and the reward list are independent, so awaiting
      // them in sequence made the user wait for the SUM of both round trips.
      // یک درخواست به‌جای سه تا. /api/bootstrap پروفایل، جوایز، وضعیت
      // گردونه و خلاصهٔ گذر نبرد را با هم می‌دهد — تا ایران هر
      // رفت‌وبرگشت حدود نیم ثانیه است، پس سه‌تا کردنش سه برابر انتظار
      // بود برای دیتایی که سرور در چند میلی‌ثانیه آماده می‌کند.
      const boot = await req('/api/bootstrap', 'GET', null, token);
      setP({
        user: boot.user,
        inventory: boot.inventory || [],
        leaguePayouts: boot.leaguePayouts || [],
        // استریک از bootstrap می‌آید؛ دیگر برای کارت روزانه یک درخواست
        // جدا نمی‌زنیم و بعد از claim هم همین load امتیاز هدر را تازه می‌کند.
        loginStreak: boot.loginStreak || null,
        cosmetics: boot.cosmetics || null,
        level: boot.level || null,
        // بدون این، بنر خانه و دکمهٔ باز کردن صندوق در کلکسیون همیشه
        // خالی می‌ماند — سرور می‌فرستاد و کلاینت دور می‌ریخت.
        pendingGrants: boot.pendingGrants || [],
      });
      setRewards(boot.rewards || []);
      primeImageCache(boot).catch(() => {});
      // کاربر وارد شده و صفحهٔ اول رندر شده؛ حالا وقتِ گرم‌کردنِ بقیه است.
      prefetchTabs();
      const wheel = boot.wheel;
      if (wheel) setSpins(wheel.unlimited ? '∞' : (wheel.spinsLeft ?? 0));
      setPassBrief(boot.pass || null);
    } catch (e) {
      // A failure here used to leave the app on its loading card forever with
      // no error and no way out. An expired session in particular looked
      // like a hang.
      setLoadError(e);
      if (e.status === 401) logout();
    }
  }

  useEffect(() => { load(); }, []);

  // Auto-dismiss toasts; they used to stay on screen forever and pile up.
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(''), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  if (loadError && !p) {
    return <ErrorView error={loadError} onRetry={load} />;
  }
  if (!p) return <LoadingView />;

  const u = p.user || {};

  return (
    <div className="portal">
      <header className="appBar">
        {/* لوگوی درخشان — همان چیزی که در اپ اندروید هست، تا دو کلاینت
            یک حس بدهند. درخشش با CSS (کلاس .appLogo) ساخته می‌شود. */}
        <img className="appLogo glow" src="/logo.webp" alt="" width="32" height="32" />
        <div className="appWho">
          <b>{u.nickname || 'کاربر'}{(u.has_plus || p?.cosmetics?.plus) ? <span className="plusStarSm" title="عضو طلایی قلقلی پلاس" style={{ color: '#FFD166', textShadow: '0 0 10px rgba(255,209,102,0.85)', fontSize: '13px', marginInlineStart: '4px' }}>★</span> : null}</b>
          <span>{fa(u.current_points)} امتیاز</span>
        </div>
        {/* گذر نبرد — نشانِ «جایزهٔ آماده» مهم‌ترین بخشش است: کاربر باید
            بدون باز کردن صفحه بفهمد چیزی منتظرش است. */}
        <button className={`iconBtn passShortcut${tab === 'pass' ? ' on' : ''}`}
          onClick={() => setTab('pass')} title="گذر نبرد فصلی"
          style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src="/pass/pass_shield.png" alt="" width="26" height="26" style={{ filter: 'drop-shadow(0 0 8px #00E5FF)', objectFit: 'contain' }} />
          {/* عددِ نشان = پله‌های باز شدهٔ **امروز** (۱ یا ۲)، نه کل
              جوایز. مالک همین را خواست: عددی که هر روز از صفر شروع
              می‌شود حس پیشرفت روزانه می‌سازد. */}
          {passBrief?.claimable > 0 ? (
            <span className="wheelBadge">
              {fa(Math.min(passBrief.claimable, 2))}
            </span>
          ) : null}
        </button>
        {/* فروشگاه کنار گردونه — همان چیدمانی که در اپ اندروید هست، تا
            کاربری که هر دو را استفاده می‌کند دنبال دکمه نگردد. */}
        <button className={`iconBtn${tab === 'shop' ? ' on' : ''}`}
          onClick={() => setTab('shop')} title="فروشگاه">
          <UiIcon name="shop" size={21} />
        </button>
        <button className={`iconBtn wheelShortcut${tab === 'wheel' ? ' on' : ''}`}
          onClick={() => setTab('wheel')}
          title={spins === '∞' ? 'چرخش نامحدود (حساب تست)'
            : spins > 0 ? `${spins} چرخش گردونه داری` : 'گردونهٔ شانس'}>
          <UiIcon name="wheel" size={24} />
          {(spins === '∞' || spins > 0) && (
            <span className="wheelBadge">
              {spins === '∞' ? '∞' : fa(spins)}
            </span>
          )}
        </button>
        <Notifications token={token} />
      </header>

      <nav className="mobileNav" aria-label="ناوبری اصلی">
        {NAV_TABS.map(([id, label, icon]) => (
          <button key={id} className={tab === id ? 'on' : ''}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => setTab(id)}>
            <span className="navIcon"><UiIcon name={icon} size={20} /></span>
            <span className="navLabel">{label}</span>
          </button>
        ))}
        <button
          className={MORE_TABS.some(([id]) => id === tab) ? 'on' : ''}
          aria-haspopup="true"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(v => !v)}>
          <span className="navIcon">⋯</span>
          <span className="navLabel">بیشتر</span>
        </button>
      </nav>

      {moreOpen && (
        <>
          {/* پشتِ شفاف: کلیک بیرون می‌بندد. بدون آن، تنها راه بستن، زدن
              دوبارهٔ خودِ دکمه است که کاربر حدس نمی‌زند. */}
          <div className="sheetShade" onClick={() => setMoreOpen(false)} />
          <div className="moreSheet" role="menu">
            <div className="sheetGrip" />
            {MORE_TABS.map(([id, label, icon]) => (
              <button key={id} role="menuitem"
                className={tab === id ? 'on' : ''}
                onClick={() => { setTab(id); setMoreOpen(false); }}>
                <span><UiIcon name={icon} size={20} /></span>{label}
              </button>
            ))}
            <button role="menuitem" className="sheetDanger"
              onClick={() => { setMoreOpen(false); logout(); }}>
              <span><UiIcon name="close" size={20} /></span>خروج از حساب
            </button>
          </div>
        </>
      )}

      {msg && <div className="toast">{msg}</div>}

      {/* `data-tab` وضعیتِ واقعیِ ناوبری را در DOM آشکار می‌کند.
          ابزارِ ممیزی قبلاً «رسیدن به تب» را از روی امضای متنِ صفحه حدس
          می‌زد و وقتی کلیک بی‌اثر می‌ماند، همان صفحهٔ قبلی را دوباره
          می‌سنجید و «موفق» گزارش می‌داد — نتیجه‌اش یافته‌های ساختگی بود.
          برای تبِ‌های داخلِ شیتِ «بیشتر» هم `aria-current` کافی نیست چون
          شیت پس از کلیک بسته می‌شود. این یک قلابِ خواندنی و بی‌اثر روی
          ظاهر است، نه تضعیفِ محصول برای آسان‌شدنِ تست. */}
      <main className="tabPane" key={tab} data-tab={tab}>
        {/* fallback عمداً `LoadingView` نیست: چانک‌ها معمولاً چند ده
            میلی‌ثانیه می‌آیند و اسپینرِ کوتاه‌مدت بیشتر از نبودش آزار
            دارد. یک ظرفِ هم‌ارتفاع می‌گذاریم تا صفحه نپرد. */}
        <Suspense fallback={<div className="tabLoading" aria-busy="true" />}>
        {tab === 'home' && (
          <Home token={token} p={p} rewards={rewards} load={load}
            setMsg={setMsg} openProfile={() => setTab('profile')}
            openWallet={() => setTab('wallet')}
            openWheel={() => setTab('wheel')}
            openInvite={() => setTab('invite')}
            openInventory={() => setTab('inventory')} />
        )}
        {tab === 'inventory' && (
          <Inventory items={p.inventory || []} grants={p.pendingGrants || []}
            token={token} reload={load} />
        )}
        {tab === 'profile' && (
          <Profile token={token} p={p} load={load} setMsg={setMsg} />
        )}
        {tab === 'rewards' && (
          <Rewards token={token} setMsg={setMsg} reloadProfile={load} />
        )}
        {tab === 'shop' && (
          <Shop token={token} setMsg={setMsg} reloadProfile={load} />
        )}
        {tab === 'pass' && (
          <Pass token={token} setMsg={setMsg} openShop={() => setTab('shop')} />
        )}
        {tab === 'wallet' && (
          <Wallet token={token} req={req} reloadProfile={load} setMsg={setMsg} />
        )}
        {tab === 'league' && (
          <League token={token} openProfile={setPublicUser} />
        )}
        {tab === 'club' && (
          <Club token={token} openProfile={setPublicUser} meId={u.id}
            openGames={Boolean(sharedRoom)} setMsg={setMsg}
            openShop={() => setTab('shop')}
            passClaimable={Number(passBrief?.claimable || 0)} />
        )}
        {tab === 'wheel' && (
          <Wheel token={token} setMsg={setMsg} reloadProfile={load}
            onSpinsChange={setSpins} />
        )}
        {tab === 'invite' && (
          <Referral token={token} setMsg={setMsg} />
        )}
        {tab === 'support' && (
          <Support token={token} api={API} req={req} asset={v =>
            (!v ? '' : String(v).startsWith('http') ? v : API + v)} />
        )}
        </Suspense>
      </main>

      {publicUser && (
        <Suspense fallback={null}>
        <PublicProfile token={token} userId={publicUser}
          close={() => setPublicUser(null)} />
        </Suspense>
      )}
    </div>
  );
}

function Club({ token, openProfile, meId, openGames = false, setMsg, openShop, passClaimable = 0 }) {
  const [sub, setSub] = useState(openGames ? 'games' : 'chat');
  const [externalLaunch, setExternalLaunch] = useState(null);
  // نسلِ پنلِ ماموریت — آینهٔ `_growthGeneration` در اندروید.
  // با هر انتقالِ سوکت به تبِ بازی یکی زیاد می‌شود تا پنلِ قدیمی
  // (که سوکتش دیگر مالِ خودش نیست) هرگز دوباره mount نشود.
  const [growthGen, setGrowthGen] = useState(0);
  return (
    <div className="clubWrap">
      <div className="clubTabs socialTripleTabs">
        <button className={sub === 'chat' ? 'on' : ''}
          onClick={() => setSub('chat')}><UiIcon name="support" size={17} /> چت</button>
        <button className={sub === 'games' ? 'on' : ''}
          onClick={() => setSub('games')}><UiIcon name="game" size={17} /> بازی‌ها</button>
        <button className={sub === 'growth' ? 'on' : ''}
          onClick={() => setSub('growth')}><UiIcon name="group" size={17} /> ماموریت</button>
        {/* گذر نبرد از این‌جا هم در دسترس است.
            دلیل: تنها راه ورودش یک آیکون کوچک در نوار بالا بود و عملاً
            دیده نمی‌شد. گذر نبرد مهم‌ترین دلیلِ خریدِ «پلاس» است، پس
            باید دقیقاً کنار بازی‌ها — جایی که کاربر XP می‌گیرد — دیده شود. */}
        {/* آلرتِ قرمز: وقتی جایزه‌ای در گذر نبرد آماده است، تب یک نشانِ
            قرمزِ نبض‌دار می‌گیرد. قرمز عمدی است — نوار خودش سبز/آبی است و
            هر رنگِ دیگری در آن گم می‌شد. دوقلوی اندروید: `_TabIcon` در
            `social_page.dart`. */}
        <button className={`${sub === 'pass' ? 'on' : ''} passTabBtn`}
          onClick={() => setSub('pass')}>
          <span className="passTabIcon">
            <UiIcon name="trophy" size={17} />
            {passClaimable > 0 && (
              <i className="passAlertDot" aria-hidden="true">
                {fa(Math.min(passClaimable, 9))}
              </i>
            )}
          </span> گذر نبرد
          {passClaimable > 0 && (
            <span className="srOnly">{fa(passClaimable)} جایزهٔ آمادهٔ دریافت</span>
          )}
        </button>
      </div>
      {sub === 'chat' && <Chat token={token} openProfile={openProfile} meId={meId} />}
      {sub === 'games' && <GamesHub api={API} token={token} openProfile={openProfile}
        externalLaunch={externalLaunch} />}
      {/* ⚠️ چرا `key` روی GrowthHub — و چرا رندرِ شرطی این‌جا یک باگِ واقعی بود:
          کاربر از تبِ «ماموریت و دوستان» دوستی را به دوئل دعوت می‌کند؛
          `game:start` می‌آید، سوکت به تبِ بازی منتقل می‌شود و تب عوض
          می‌شود. اما چون این‌جا رندرِ شرطی است، GrowthHub از DOM حذف
          می‌شود و cleanup اجرا می‌گردد. `transferred.current` جلوی
          disconnect را می‌گیرد — ولی همین که کاربر بعد از بازی به تب
          ماموریت برگردد، کامپوننت **دوباره از صفر** ساخته می‌شود و
          `transferred` به false برمی‌گردد، در حالی که سوکتِ منتقل‌شده
          هنوز زندهٔ تبِ بازی است. رفتِ‌وبرگشتِ بعدی، همان سوکت را
          disconnect می‌کرد و مسابقهٔ در جریان قطع می‌شد.
          اندروید این مشکل را نداشت چون `IndexedStack` + `ValueKey(_growthGeneration)`
          دارد: هر انتقال، نسلِ تازه‌ای از پنل می‌سازد و نسلِ قبلی —
          همان که سوکتش رفته — دیگر برنمی‌گردد. وب حالا دقیقاً همان
          کار را می‌کند تا آینهٔ اندروید بماند. */}
      {sub === 'pass' && <Pass token={token} setMsg={setMsg} openShop={openShop} />}
      {sub === 'growth' && <GrowthHub key={growthGen} api={API} token={token} onSocketGame={(socket, start) => {
        setGrowthGen(g => g + 1);
        setExternalLaunch({ socket, start, nonce: Date.now() });
        setSub('games');
      }} />}
    </div>
  );
}

registerImageCacheWorker();
createRoot(document.getElementById('root')).render(<App />);
