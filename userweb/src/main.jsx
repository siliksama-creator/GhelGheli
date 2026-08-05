// App shell: theme, auth gate, tab routing.
//
// Screen implementations live under ./screens, reusable pieces under
// ./components, and the HTTP layer under ./lib. This file used to hold all of
// it in ~250 lines whose longest single line was 1775 characters, which made
// every change risky — the "stuck on a loading spinner forever" bug in the
// league tab survived several passes precisely because it was invisible in
// that wall of text.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { API, req, fa } from './lib/api.js';
import Notifications from './components/Notifications.jsx';
import Auth from './screens/Auth.jsx';
import Home from './screens/Home.jsx';
import Profile from './screens/Profile.jsx';
import League from './screens/League.jsx';
import Chat from './screens/Chat.jsx';
import PublicProfile from './screens/PublicProfile.jsx';
import Rewards from './screens/Rewards.jsx';
import Shop from './screens/Shop.jsx';
import Wheel from './screens/Wheel.jsx';
import Referral from './screens/Referral.jsx';
import Pass from './screens/Pass.jsx';
import GamesHub from './games.jsx';
import Support from './support.jsx';
import Wallet from './wallet.jsx';
import { LoadingView, ErrorView } from './components/states.jsx';

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
  ['home', 'خانه', '🏠'],
  ['rewards', 'جوایز', '🎁'],
  ['league', 'لیگ', '🏆'],
  ['club', 'چت و بازی', '🎮'],
];

const MORE_TABS = [
  ['wallet', 'کیف پول', '👛'],
  // دعوت دوستان قبلاً فقط از میان‌بر داشبورد باز می‌شد؛ اگر کاربر آن
  // کارت را رد می‌کرد، صفحه عملاً گم می‌شد.
  ['invite', 'دعوت دوستان', '🤝'],
  ['support', 'پشتیبانی', '🎧'],
  ['profile', 'پروفایل', '👤'],
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

function App() {
  const [token, setToken] = useState(() => {
    try { return localStorage.token || ''; } catch { return ''; }
  });
  useDarkOnly();
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
  const [tab, setTab] = useState('home');
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
      });
      setRewards(boot.rewards || []);
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
          <b>{u.nickname || 'کاربر'}</b>
          <span>{fa(u.current_points)} امتیاز</span>
        </div>
        {/* گذر نبرد — نشانِ «جایزهٔ آماده» مهم‌ترین بخشش است: کاربر باید
            بدون باز کردن صفحه بفهمد چیزی منتظرش است. */}
        <button className={`iconBtn passShortcut${tab === 'pass' ? ' on' : ''}`}
          onClick={() => setTab('pass')} title="گذر نبرد فصلی">
          🏅
          {/* عددِ نشان = پله‌های باز شدهٔ **امروز** (۱ یا ۲)، نه کل
              جوایز. مالک همین را خواست: عددی که هر روز از صفر شروع
              می‌شود حس پیشرفت روزانه می‌سازد. */}
          {passBrief?.tiersToday > 0 ? (
            <span className="wheelBadge">
              {fa(Math.min(passBrief.tiersToday, passBrief.maxTiersPerDay || 2))}
            </span>
          ) : passBrief?.claimable > 0 ? (
            <span className="passDot" />
          ) : null}
        </button>
        {/* فروشگاه کنار گردونه — همان چیدمانی که در اپ اندروید هست، تا
            کاربری که هر دو را استفاده می‌کند دنبال دکمه نگردد. */}
        <button className={`iconBtn${tab === 'shop' ? ' on' : ''}`}
          onClick={() => setTab('shop')} title="فروشگاه">
          🛍️
        </button>
        <button className={`iconBtn wheelShortcut${tab === 'wheel' ? ' on' : ''}`}
          onClick={() => setTab('wheel')}
          title={spins === '∞' ? 'چرخش نامحدود (حساب تست)'
            : spins > 0 ? `${spins} چرخش گردونه داری` : 'گردونهٔ شانس'}>
          🎡
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
            <span className="navIcon">{icon}</span>
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
                <span>{icon}</span>{label}
              </button>
            ))}
            <button role="menuitem" className="sheetDanger"
              onClick={() => { setMoreOpen(false); logout(); }}>
              <span>⏻</span>خروج از حساب
            </button>
          </div>
        </>
      )}

      {msg && <div className="toast">{msg}</div>}

      <main className="tabPane" key={tab}>
        {tab === 'home' && (
          <Home token={token} p={p} rewards={rewards} load={load}
            setMsg={setMsg} openWallet={() => setTab('wallet')}
            openWheel={() => setTab('wheel')}
            openInvite={() => setTab('invite')} />
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
          <Club token={token} openProfile={setPublicUser} meId={u.id} />
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
      </main>

      {publicUser && (
        <PublicProfile token={token} userId={publicUser}
          close={() => setPublicUser(null)} />
      )}
    </div>
  );
}

function Club({ token, openProfile, meId }) {
  const [sub, setSub] = useState('chat');
  return (
    <div className="clubWrap">
      <div className="clubTabs">
        <button className={sub === 'chat' ? 'on' : ''}
          onClick={() => setSub('chat')}>💬 چت روم</button>
        <button className={sub === 'games' ? 'on' : ''}
          onClick={() => setSub('games')}>🎮 بازی‌ها</button>
      </div>
      {sub === 'chat'
        ? <Chat token={token} openProfile={openProfile} meId={meId} />
        : <GamesHub api={API} token={token} openProfile={openProfile} />}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
