import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BarChart3, Bell, CreditCard, Gift, MessageCircle, LifeBuoy, ScanLine, Settings, Shield, Trophy, Users, Gamepad2, Wallet } from 'lucide-react';

import './theme.css';
import './styles.css';

import { createApi } from './lib/api.js';
import { ToastProvider, useToast } from './lib/toast.jsx';
import { DialogProvider } from './components/dialog.jsx';
import { AppShell } from './components/app-shell.jsx';

import { LoginScreen } from './pages/login.jsx';
import { Dashboard } from './pages/dashboard.jsx';
import { CardsPage } from './pages/cards.jsx';
import { PhotoCardsPage } from './pages/photo-cards.jsx';
import { RewardsPage } from './pages/rewards.jsx';
import { LeaguePage } from './pages/league.jsx';
import { WalletPage } from './pages/wallet.jsx';
import { UsersPage } from './pages/users.jsx';
import { ChatModerationPage } from './pages/chat-moderation.jsx';
import { SupportPage } from './pages/support.jsx';
import { NotificationsPage } from './pages/notifications.jsx';
import { GameRewardsPage } from './pages/game-rewards.jsx';
import { SettingsPage } from './pages/settings.jsx';
import { AdminsPage } from './pages/admins.jsx';

const NAV = [
  ['dashboard', 'داشبورد', BarChart3, Dashboard],
  ['cards', 'کارت و کد', CreditCard, CardsPage],
  // قابلیت جدید. عمداً صفحهٔ جدا از «کارت و کد»: آن سیستمِ ثبت با کدِ
  // تنهاست و قاطی کردنشان باعث می‌شد مدیر کد را در بانک اشتباه وارد کند.
  ['photo-cards', 'کارت با عکس', ScanLine, PhotoCardsPage],
  ['rewards', 'جوایز', Gift, RewardsPage],
  ['wallet', 'کیف پول', Wallet, WalletPage],
  ['league', 'لیگ ماهانه', Trophy, LeaguePage],
  ['users', 'کاربران', Users, UsersPage],
  ['chat', 'چت', MessageCircle, ChatModerationPage],
  ['game-rewards', 'امتیاز بازی', Gamepad2, GameRewardsPage],
  ['support', 'پشتیبانی', LifeBuoy, SupportPage],
  ['notifications', 'اطلاعیه‌ها', Bell, NotificationsPage],
  ['settings', 'تنظیمات', Settings, SettingsPage],
  ['admins', 'ادمین‌ها', Shield, AdminsPage],
];

function App() {
  const [token, setToken] = useState(localStorage.getItem('adminToken') || '');
  const [page, setPage] = useState('dashboard');
  const notify = useToast();

  const logout = useCallback((message) => {
    localStorage.removeItem('adminToken');
    setToken('');
    if (message) notify(message, 'error');
  }, [notify]);

  // Session expired / revoked (e.g. deactivated by another super admin) —
  // previously the panel just silently failed requests with a generic
  // error toast on whatever page was open, with no way to tell the admin
  // *why* or get them back to a working login screen.
  const request = useMemo(
    () => createApi(token, () => logout('نشست شما منقضی یا لغو شده است؛ دوباره وارد شوید')),
    [token, logout],
  );

  // ═════════════════════════════════════════════════════════════════════
  // تمِ روشن حذف شد
  // ═════════════════════════════════════════════════════════════════════
  //
  // منبعِ پایدارِ باگ بود: هر رنگ باید دو بار سنجیده می‌شد و در عمل
  // نمی‌شد. آخرین ممیزی هم یک متنِ ناخوانا (کنتراست ۳.۹۶) در همین پنل
  // پیدا کرد. ضمناً پنل کنارِ اپِ تیره استفاده می‌شود و یکدستی بهتر است.
  //
  // ترجیحِ ذخیره‌شدهٔ قدیمی پاک می‌شود، وگرنه مدیری که قبلاً روشن را
  // انتخاب کرده بود برای همیشه با استایلِ نیمه‌کاره می‌ماند.
  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
    localStorage.removeItem('adminTheme');
  }, []);

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
      onLogout={() => logout()}
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

