import { useCallback, useEffect, useMemo, useState, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BarChart3, Bell, BookText, Coins, Gift, MessageCircle, LifeBuoy, ScanLine, Settings, Shield, Sigma, Trophy, Users, Gamepad2, Wallet, Activity, CircleDot, Package, Store, Layers, Target, SlidersHorizontal } from 'lucide-react';

import './theme.css';
import './styles.css';

import { createApi } from './lib/api.js';
import { canSeePage, isSuperAdmin } from './lib/roles.js';
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
const LiveCopyPage = lazy(() => import('./pages/live-copy.jsx').then(m => ({ default: m.LiveCopyPage })));
const AdminsPage = lazy(() => import('./pages/admins.jsx').then(m => ({ default: m.AdminsPage })));
const MetricsPage = lazy(() => import('./pages/metrics.jsx').then(m => ({ default: m.MetricsPage })));
const AnalyticsPage = lazy(() => import('./pages/analytics.jsx').then(m => ({ default: m.AnalyticsPage })));
// ── صفحاتِ دورِ عملیات: فروشگاه، گذر نبرد، ماموریت، اهرم‌های موتور ──
const ShopAdminPage = lazy(() => import('./pages/shop.jsx').then(m => ({ default: m.ShopAdminPage })));
const BattlePassPage = lazy(() => import('./pages/battle-pass.jsx').then(m => ({ default: m.BattlePassPage })));
const MissionsPage = lazy(() => import('./pages/missions.jsx').then(m => ({ default: m.MissionsPage })));
const EnginePage = lazy(() => import('./pages/engine.jsx').then(m => ({ default: m.EnginePage })));
// ── ۳.۲ گروه‌بندیِ منو (هر دو پنل) ────────────────────────────────────────
//
// چرا: ۲۳ قلمِ بی‌درجه در نوارِ کنار یعنی «بگرد تا پیدایش کنی». ترتیبِ
// *درونِ هر گروه* عمداً همان ترتیبِ قبلی مانده (فقط دسته‌ها اضافه شده‌اند):
// عضلهٔ حافظهٔ مدیر — «فلان صفحه کجا بود؟» — نباید با یک refactor بی‌کار
// شود. دو کلاینتِ پنل هم **همین ترتیب و همین نام‌ها** را دارند؛ ردیفِ ششمِ
// هر آیتم، کلیدِ گروه است و `NAV_GROUPS` نامِ فارسی‌اش را نگه می‌دارد.
//
// نام‌ها «تکنیکال» نیستند («پیکربندیِ متن و اپ»، نه «config»): این‌ها را همان
// مدیری می‌خواند که قرار است بی‌دانستنِ معماری، قیمت را عوض کند.
const NAV_GROUPS = {
  'today': 'امروزِ سیستم',
  'cards': 'کارت و فروشگاه',
  'rewards': 'جایزه و درآمد',
  'games': 'بازی‌ها',
  'people': 'کاربران',
  'talk': 'گفت‌وگو و اطلاع‌رسانی',
  'config': 'پیکربندیِ متن و اپ',
  'admin': 'حساب‌های ادمین',
};

const NAV = [
  ['dashboard', 'داشبورد', BarChart3, Dashboard,
    'خلاصهٔ یک‌نگاهیِ سیستم: کاربران، فروش، بازی‌ها و هشدارها. همهٔ اعداد فقط خواندنی‌اند.',
    'today'],
  ['analytics', 'تحلیل رشد و خطا', BarChart3, AnalyticsPage,
    'نمودار رشد، قیف بازی‌ها و صندوق خطاهای اپ — فقط خواندنی، بدون دکمهٔ خطرناک.',
    'today'],
  ['metrics', 'مانیتورینگ سرور', Activity, MetricsPage,
    'سلامت سرور و سرویس‌ها — فقط مانیتورینگ؛ اینجا چیزی تغییر نمی‌کند.',
    'today'],
  ['photo-cards', 'ثبت کارت', ScanLine, PhotoCardsPage,
    'ثبت کارت‌های فیزیکی با عکس؛ کارتِ تأییدشده وارد کاتالوگِ صندوق و دوئل می‌شود.',
    'cards'],
  ['shop', 'فروشگاه', Store, ShopAdminPage,
    'آیتم‌های فروشگاه و صندوق کارت؛ هر تغییری همان لحظه در فروشگاهِ کاربران می‌نشیند — بدون آپدیت اپ.',
    'cards'],
  ['card-box', 'صندوق کارت', Package, CardBoxPage,
    'شانسِ هر کلاس، قیمت و روشن/خاموش‌کردن فروش صندوق + تاریخچهٔ خریدها.',
    'cards'],
  ['battle-pass', 'گذر نبرد', Layers, BattlePassPage,
    'فصل‌های گذر نبرد، پله‌های XP و جایزهٔ هر پله — همه قابل تغییر بدون آپدیت.',
    'rewards'],
  ['missions', 'ماموریت‌ها', Target, MissionsPage,
    'ماموریت‌های روزانه و هفتگی، جایزهٔ هر ماموریت و جایزهٔ تکمیلِ همه.',
    'rewards'],
  ['rewards', 'جوایز', Gift, RewardsPage,
    'ساخت و ویرایش جایزه‌ها (نقدی، فروشگاهی، فیزیکی) و تأیید درخواست‌های کاربران.',
    'rewards'],
  ['wallet', 'کیف پول', Wallet, WalletPage,
    'تراکنش‌های کیف پول، درخواست‌های برداشت و واریز/برداشت دستی.',
    'rewards'],
  ['league', 'لیگ ماهانه', Trophy, LeaguePage,
    'لیگ ماهانه: شروع و پایان فصل، جوایز نفرات برتر و تاریخچهٔ پرداخت‌ها.',
    'rewards'],
  ['game-rewards', 'امتیاز بازی', Gamepad2, GameRewardsPage,
    'امتیازِ هر بازی و ضریب‌های جایزه — عددها مستقیم به سرور می‌روند.',
    'games'],
  ['game-economy', 'اقتصاد بازی', Coins, GameEconomyPage,
    'اهرم‌های اقتصادی بازی‌ها: هزینه‌ها، جوایز و سقف‌های روزانه.',
    'games'],
  ['wheel', 'گردونه شانس', CircleDot, WheelPage,
    'جایزه‌های گردونه و شانسِ هر بخش؛ جمع شانس‌ها باید ۱۰۰٪ باشد.',
    'games'],
  ['users', 'کاربران', Users, UsersPage,
    'جست‌وجوی کاربر، پروفایل و موجودی او + ابزارهای دستی (امتیاز، بن، حذف).',
    'people'],
  ['points', 'ریز امتیازات', Sigma, PointsPage,
    'دفترِ امتیاز: هر کاربر چه مقدار، از کجا گرفت و کجا خرج کرد.',
    'people'],
  ['chat', 'چت', MessageCircle, ChatModerationPage,
    'پیامِ سنجاق‌شدهٔ بالای چت، فیلتر کلمات و گزارش‌های کاربران.',
    'talk'],
  ['support', 'پشتیبانی', LifeBuoy, SupportPage,
    'تیکت‌های کاربران: پاسخ بدهید یا ببندید — کاربر پاسخ را در اپ می‌بیند.',
    'talk'],
  ['notifications', 'اطلاعیه‌ها', Bell, NotificationsPage,
    'ارسال اطلاعیهٔ push به همه یا گروهی از کاربران — با پیش‌نمایشِ ساعت تهران.',
    'talk'],
  ['settings', 'تنظیمات', Settings, SettingsPage,
    'تنظیمات چت و پیامک + تنظیمات اپ: نسخهٔ اجباری، بنر اطلاعیه و چیدمان تب‌ها.',
    'config'],
  ['live-copy', 'متن‌های زنده', BookText, LiveCopyPage,
    'هرچه کاربر در وب و اندروید می‌خواند: جمله‌ها و عددهایش، با پیش‌نمایشِ زنده و بازگردانی.',
    'config'],
  ['engine', 'موتور', SlidersHorizontal, EnginePage,
    'سقف‌ها و اعدادِ عملیاتی سیستم — هر عدد توضیح دارد؛ با احتیاط تغییر دهید.',
    'config'],
  ['admins', 'ادمین‌ها', Shield, AdminsPage,
    'حساب‌های ادمین و نقش‌ها + کارنامهٔ تغییرات (Audit Log): چه کسی چه کرد.',
    'admin']
];

function App() {
  const [token, setToken] = useState(localStorage.getItem('adminToken') || '');
  // نقشِ ادمین از پاسخِ ورود خوانده و در sessionStorage می‌ماند تا با
  // رفرش صفحه از بین نرود. منبعِ حقیقتِ دسترسی بک‌اند است؛ این فقط برای
  // پنهان‌کردنِ صفحه/دکمه‌هایی است که سرور در هر صورت ۴۰۳ می‌دهد.
  const [role, setRole] = useState(() => sessionStorage.getItem('adminRole') || 'super_admin');
  const [page, setPage] = useState('dashboard');
  const notify = useToast();

  const logout = useCallback((message) => {
    localStorage.removeItem('adminToken');
    sessionStorage.removeItem('adminRole');
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
        onLogin={(t, admin) => {
          localStorage.setItem('adminToken', t);
          // نقش پیش‌فرض برای نشست‌های قدیمی (که نقشی ذخیره نشده)
          // super_admin است؛ پس از ورود، نقشِ واقعی می‌نشیند.
          const r = admin?.role || 'super_admin';
          sessionStorage.setItem('adminRole', r);
          setRole(r);
          setToken(t);
        }}
      />
    );
  }

  // صفحه‌ها و آیتم‌های منو را بر اساس نقش فیلتر می‌کنیم. اگر نشانی
  // ممنوع مستقیم تایپ شود، به نخستین صفحهٔ مجاز برمی‌گردد.
  const visibleNav = NAV.filter((x) => canSeePage(role, x[0]));
  const pageItem = NAV.find((x) => x[0] === page);
  const pageAllowed = pageItem && canSeePage(role, pageItem[0]);
  const effectiveKey = pageAllowed ? pageItem[0] : (visibleNav[0]?.[0] || 'dashboard');
  // `active` توصیفِ صفحهٔ مؤثر را نگه می‌دارد تا هم پایهٔ توضیحِ
  // زیرعنوان باشد و هم گاردِ استاتیکِ testCardBoxAdmin که روی
  // `active[4]` (ستون توضیح NAV) می‌خواند.
  const active = NAV.find((x) => x[0] === effectiveKey) || NAV[0];
  const ActivePage = active[3];
  // توضیحِ یک‌خطیِ هر صفحه زیر عنوانش — مدیر قبل از هر دکمه‌ای بداند
  // این صفحه چه می‌کند.
  const activeDesc = active[4] || '';

  return (
    <AppShell
      nav={visibleNav}
      navGroups={NAV_GROUPS}
      activePage={effectiveKey}
      onNavigate={setPage}
      onLogout={() => logout()}
      title={active[1]}
      subtitle={activeDesc}
    >
      <Suspense fallback={<div className="pageLoading" aria-busy="true" />}>
        <ActivePage request={request} onNavigate={setPage} isSuperAdmin={isSuperAdmin(role)} />
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

