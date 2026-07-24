import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BarChart3, Bell, CreditCard, Gift, MessageCircle, LifeBuoy, Settings, Shield, Trophy, Users } from 'lucide-react';

import './theme.css';
import './styles.css';

import { createApi } from './lib/api.js';
import { ToastProvider } from './lib/toast.jsx';
import { DialogProvider } from './components/dialog.jsx';
import { AppShell } from './components/app-shell.jsx';

import { LoginScreen } from './pages/login.jsx';
import { Dashboard } from './pages/dashboard.jsx';
import { CardsPage } from './pages/cards.jsx';
import { RewardsPage } from './pages/rewards.jsx';
import { LeaguePage } from './pages/league.jsx';
import { UsersPage } from './pages/users.jsx';
import { ChatModerationPage } from './pages/chat-moderation.jsx';
import { SupportPage } from './pages/support.jsx';
import { NotificationsPage } from './pages/notifications.jsx';
import { SettingsPage } from './pages/settings.jsx';
import { AdminsPage } from './pages/admins.jsx';

const NAV = [
  ['dashboard', 'داشبورد', BarChart3, Dashboard],
  ['cards', 'کارت و کد', CreditCard, CardsPage],
  ['rewards', 'جوایز', Gift, RewardsPage],
  ['league', 'لیگ ماهانه', Trophy, LeaguePage],
  ['users', 'کاربران', Users, UsersPage],
  ['chat', 'چت', MessageCircle, ChatModerationPage],
  ['support', 'پشتیبانی', LifeBuoy, SupportPage],
  ['notifications', 'اطلاعیه‌ها', Bell, NotificationsPage],
  ['settings', 'تنظیمات', Settings, SettingsPage],
  ['admins', 'ادمین‌ها', Shield, AdminsPage],
];

function App() {
  const [token, setToken] = useState(localStorage.getItem('adminToken') || '');
  const [page, setPage] = useState('dashboard');
  const [theme, setTheme] = useState(localStorage.getItem('adminTheme') || 'dark');
  const request = useMemo(() => createApi(token), [token]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('adminTheme', theme);
  }, [theme]);

  if (!token) {
    return (
      <LoginScreen
        onLogin={(t) => {
          localStorage.setItem('adminToken', t);
          setToken(t);
        }}
      />
    );
  }

  const active = NAV.find((x) => x[0] === page);
  const ActivePage = active[3];

  return (
    <AppShell
      nav={NAV}
      activePage={page}
      onNavigate={setPage}
      onLogout={() => {
        localStorage.removeItem('adminToken');
        setToken('');
      }}
      theme={theme}
      onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      title={active[1]}
      subtitle="تمام تغییرات حساس در Audit Log ثبت می‌شود."
    >
      <ActivePage request={request} />
    </AppShell>
  );
}

createRoot(document.getElementById('root')).render(
  <ToastProvider>
    <DialogProvider>
      <App />
    </DialogProvider>
  </ToastProvider>,
);
