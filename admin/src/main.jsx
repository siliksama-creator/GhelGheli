import { useCallback, useEffect, useMemo, useState, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BarChart3, Bell, Coins, Gift, MessageCircle, LifeBuoy, ScanLine, Settings, Shield, Sigma, Trophy, Users, Gamepad2, Wallet, Activity, CircleDot, Package } from 'lucide-react';

import './theme.css';
import './styles.css';

import { createApi } from './lib/api.js';
import { ToastProvider, useToast } from './lib/toast.jsx';
import { DialogProvider } from './components/dialog.jsx';
import { AppShell } from './components/app-shell.jsx';

import { LoginScreen } from './pages/login.jsx';
import { Dashboard } from './pages/dashboard.jsx';

// ── چرا صفحاتِ ادمین تنبل بارگذاری می‌شوند ────────────────────────────
//
// همه ایستا import می‌شدند، پس هر ادمین برای دیدنِ فرمِ ورود کلِ پنل را
// دانلود می‌کرد — از جمله `photo-cards.jsx` با ۱۲۳۵ خط که فقط یک نفر و
// فقط گاهی بازش می‌کند.
//
// `LoginScreen` و `Dashboard` ایستا می‌مانند: اولی همیشه اولین چیزِ
// دیده‌شده است و دومی بلافاصله بعد از ورود می‌آید؛ تنبل‌کردنشان فقط یک
// رفت‌وبرگشتِ اضافه می‌ساخت.
//
// هیچ صفحه‌ای حذف نشده — فقط لحظهٔ دانلودش عوض شده.
const PhotoCardsPage = lazy(() => import('./pages/photo-cards.jsx').then(m => ({ default: m.PhotoCardsPage })));
const PointsPage = lazy(() => import('./pages/points.jsx').then(m => ({ default: m.PointsPage })));
const RewardsPage = lazy(() => import('./pages/rewards.jsx').then(m => ({ default: m.RewardsPage })));
const LeaguePage = lazy(() => import('./pages/league.jsx').then(m => ({ default: m.LeaguePage })));
const WalletPage = lazy(() => import('./pages/wallet.jsx').then(m => ({ default: m.WalletPage })));
const UsersPage = lazy(() => import('./pages/users.jsx').then(m => ({ default: m.UsersPage })));
const ChatModerationPage = lazy(() => import('./pages/chat-moderation.jsx').then(m => ({ default: m.ChatModerationPage })));
const SupportPage = lazy(() => import('./pages/support.jsx').then(m => ({ default: m.SupportPage })));
const NotificationsPage = lazy(() => import('./pages/notifications.jsx').then(m => ({ default: m.NotificationsPage })));
const GameRewardsPage = lazy(() => import('./pages/game-rewards.jsx').then(m => ({ default: m.GameRewardsPage })));
const GameEconomyPage = lazy(() => import('./pages/game-economy.jsx').then(m => ({ default: m.GameEconomyPage })));
const WheelPage = lazy(() => import('./pages/wheel.jsx').then(m => ({ default: m.WheelAdminPage })));
const CardBoxPage = lazy(() => import('./pages/card-box.jsx').then(m => ({ default: m.CardBoxAdminPage })));
const SettingsPage = lazy(() => import('./pages/settings.jsx').then(m => ({ default: m.SettingsPage })));
const AdminsPage = lazy(() => import('./pages/admins.jsx').then(m => ({ default: m.AdminsPage })));
const MetricsPage = lazy(() => import('./pages/metrics.jsx').then(m => ({ default: m.MetricsPage })));
const AnalyticsPage = lazy(() => import('./pages/analytics.jsx').then(m => ({ default: m.AnalyticsPage })));

const NAV = [
  ['dashboard', 'داشبورد', BarChart3, Dashboard],
  // ═══════════════════════════════════════════════════════════════════════
  // چرا «کارت و کد» حذف شد و فقط «ثبت کارت» ماند
  // ═══════════════════════════════════════════════════════════════════════
  //
  // تا امروز دو صفحهٔ جدا وجود داشت که هر دو «کارت تعریف می‌کردند»:
  //
  //   • «کارت و کد»     → سیستمِ قدیمیِ کد-تنها (جدول `card_codes`)
  //   • «کارت با عکس»  → سیستمِ فعلی (جدول `photo_card_codes`)
  //
  // نگه داشتنِ هر دو زمانی منطقی بود که مسیرِ قدیمی هنوز در دستِ کاربر
  // بود. آن مسیر حذف شد: فرمِ «فقط کد» از وب‌اپ و اپ اندروید برداشته
  // شده و هیچ کاربری دیگر نمی‌تواند کدی را که در «کارت و کد» ثبت شود
  // خرج کند.
  //
  // یعنی آن صفحه به یک **تلهٔ بی‌صدا** تبدیل شده بود: مدیر کد را وارد
  // می‌کرد، پیامِ «ثبت شد» می‌گرفت، کد را روی کارت چاپ می‌کرد — و بعد
  // هیچ کاربری نمی‌توانست ازش استفاده کند. هیچ خطایی هم در کار نبود.
  //
  // مالک با اسکرین‌شات نشان داد که دو فرمِ «ثبت» کنار هم گیج‌کننده‌اند و
  // خواست اضافه‌اش حذف شود.
  //
  // ⚠️ فقط **رابط** حذف شد، نه داده. جدولِ `card_codes` و مسیرهای
  //    `/api/admin/card-*` دست‌نخورده ماندند: ۲۳ کدِ مصرف‌شده در
  //    تاریخچهٔ کاربران به آن‌ها ارجاع دارند و حذفشان تاریخچه را خراب
  //    می‌کرد. چیزی که رفت، فقط راهِ **ساختنِ** کدِ جدیدِ بی‌مصرف است.
  //
  // ⚠️ `card_types` همچنان از «ثبت کارت» ساخته می‌شود (در همان تراکنشِ
  //    آپلودِ طرح)، پس انتخابگرِ «کارت‌های لازم» در صفحهٔ جوایز بدونِ
  //    تغییر کار می‌کند.
  ['photo-cards', 'ثبت کارت', ScanLine, PhotoCardsPage],
  ['rewards', 'جوایز', Gift, RewardsPage],
  ['wallet', 'کیف پول', Wallet, WalletPage],
  ['league', 'لیگ ماهانه', Trophy, LeaguePage],
  ['users', 'کاربران', Users, UsersPage],
  // «ریز امتیازات» کنارِ «کاربران» می‌نشیند: هر دو دربارهٔ یک نفرند و
  // مدیر معمولاً از یکی به دیگری می‌رود.
  ['points', 'ریز امتیازات', Sigma, PointsPage],
  ['chat', 'چت', MessageCircle, ChatModerationPage],
  ['game-rewards', 'امتیاز بازی', Gamepad2, GameRewardsPage],
  ['game-economy', 'اقتصاد بازی', Coins, GameEconomyPage],
  ['wheel', 'گردونه شانس', CircleDot, WheelPage],
  ['support', 'پشتیبانی', LifeBuoy, SupportPage],
  ['notifications', 'اطلاعیه‌ها', Bell, NotificationsPage],
  ['settings', 'تنظیمات', Settings, SettingsPage],
  ['admins', 'ادمین‌ها', Shield, AdminsPage],
  ['analytics', 'تحلیل رشد و خطا', BarChart3, AnalyticsPage],
  ['metrics', 'مانیتورینگ سرور', Activity, MetricsPage],
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
      <Suspense fallback={<div className="pageLoading" aria-busy="true" />}>
        <ActivePage request={request} onNavigate={setPage} />
      </Suspense>
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

