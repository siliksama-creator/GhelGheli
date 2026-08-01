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

const TABS = [
  ['home', 'خانه', '🏠'],
  ['rewards', 'جوایز', '🎁'],
  ['wallet', 'کیف پول', '👛'],
  ['league', 'لیگ', '🏆'],
  ['club', 'چت و بازی', '🎮'],
  ['support', 'پشتیبانی', '🎧'],
  ['profile', 'پروفایل', '👤'],
];

// Light/dark theme. Mirrors the Flutter app, which has had a switch since
// launch while the web was dark-only. Persisted so it survives a reload.
function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.theme === 'light' ? 'light' : 'dark'; }
    catch { return 'dark'; }
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content',
      theme === 'light' ? '#f4f7fc' : '#06101d');
    try { localStorage.theme = theme; } catch { /* private mode */ }
  }, [theme]);
  return [theme, () => setTheme(t => (t === 'light' ? 'dark' : 'light'))];
}

function App() {
  const [token, setToken] = useState(() => {
    try { return localStorage.token || ''; } catch { return ''; }
  });
  const [theme, toggleTheme] = useTheme();
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
      {!token && (
        <div className="hero">
          <img src="/logo.png" alt="قلقلی" />
          <b>قلقلی</b>
        </div>
      )}

      {token ? (
        <Portal token={token} theme={theme} toggleTheme={toggleTheme}
          logout={logout} />
      ) : (
        <>
          <Auth mode={mode} setMode={setMode}
            done={t => {
              try { localStorage.token = t; } catch { /* private mode */ }
              setToken(t);
            }} />
          <button className="themeToggleFloat" onClick={toggleTheme}
            title={theme === 'light' ? 'حالت تیره' : 'حالت روشن'}>
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </>
      )}
    </div>
  );
}

function Portal({ token, logout, theme, toggleTheme }) {
  const [tab, setTab] = useState('home');
  const [p, setP] = useState(null);
  const [rewards, setRewards] = useState([]);
  const [msg, setMsg] = useState('');
  const [publicUser, setPublicUser] = useState(null);
  const [loadError, setLoadError] = useState(null);

  async function load() {
    try {
      setLoadError(null);
      // Fan out: the profile and the reward list are independent, so awaiting
      // them in sequence made the user wait for the SUM of both round trips.
      const [profile, rw] = await Promise.all([
        req('/api/profile', 'GET', null, token),
        req('/api/rewards', 'GET', null, token),
      ]);
      setP(profile);
      setRewards(rw || []);
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
        <img className="appLogo" src="/logo.png" alt="" />
        <div className="appWho">
          <b>{u.nickname || 'کاربر'}</b>
          <span>{fa(u.current_points)} امتیاز</span>
        </div>
        <button className="iconBtn" onClick={toggleTheme}
          title={theme === 'light' ? 'حالت تیره' : 'حالت روشن'}>
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        <Notifications token={token} />
        <button className="iconBtn danger" onClick={logout} title="خروج">⏻</button>
      </header>

      <nav className="mobileNav">
        {TABS.map(([id, label, icon]) => (
          <button key={id} className={tab === id ? 'on' : ''}
            onClick={() => setTab(id)}>
            <span className="navIcon">{icon}</span>
            <span className="navLabel">{label}</span>
          </button>
        ))}
      </nav>

      {msg && <div className="toast">{msg}</div>}

      <main className="tabPane" key={tab}>
        {tab === 'home' && (
          <Home token={token} p={p} rewards={rewards} load={load}
            setMsg={setMsg} openWallet={() => setTab('wallet')} />
        )}
        {tab === 'profile' && (
          <Profile token={token} p={p} load={load} setMsg={setMsg} />
        )}
        {tab === 'rewards' && (
          <Rewards token={token} setMsg={setMsg} reloadProfile={load} />
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
