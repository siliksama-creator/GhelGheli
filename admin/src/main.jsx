import { useCallback, useEffect, useMemo, useState, Suspense, lazy, Component } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, BarChart3, Bell, BookText, CircleDot, Coins, CreditCard, Gamepad2, Layers, LifeBuoy, Megaphone, MessageCircle, Package, ScanLine, Settings, Shield, ShieldCheck, Sigma, SlidersHorizontal, Smartphone, Store, Swords, Target, Trophy, UserPlus, Users, Wallet,
} from 'lucide-react';

import './theme.css';
import './styles.css';

import { createApi } from './lib/api.js';
import { installChunkRecovery, isChunkLoadError, loadLazy, recoverFromChunkError } from './lib/chunkRecovery.js';
import { installAdminErrorMonitor } from './lib/errorMonitor.js';
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
// چانکِ گم‌شده بعد از دیپلوی نباید صفحه را روی «خطا خورد» قفل کند.
installChunkRecovery();
if (typeof navigator !== 'undefined' && navigator.serviceWorker && location.protocol === 'https:') {
  navigator.serviceWorker.register('/chunk-recovery-sw.js', { updateViaCache: 'none' }).catch(() => {});
}
function lazyPage(importer) {
  return lazy(() => loadLazy(importer));
}
const PhotoCardsPage = lazyPage(() => import('./pages/photo-cards.jsx').then(m => ({ default: m.PhotoCardsPage })));
const PointsPage = lazyPage(() => import('./pages/points.jsx').then(m => ({ default: m.PointsPage })));
const LeaguePage = lazyPage(() => import('./pages/league.jsx').then(m => ({ default: m.LeaguePage })));
// «لیگ معرف‌ها» — آفرِ زمان‌دارِ بیشترین دعوت‌کننده. صفحهٔ مستقلی است چون
// معیارش تعدادِ دعوت است، نه سکه؛ در گروهِ «ماموریت و درآمد» می‌آید کنارِ
// «لیگ ماهانه» تا مدیر جای دیگری دنبالش نگردد.
const InviteLeaguePage = lazyPage(() => import('./pages/invite-league.jsx').then(m => ({ default: m.InviteLeaguePage })));
const WalletPage = lazyPage(() => import('./pages/wallet.jsx').then(m => ({ default: m.WalletPage })));
const UsersPage = lazyPage(() => import('./pages/users.jsx').then(m => ({ default: m.UsersPage })));
const ChatModerationPage = lazyPage(() => import('./pages/chat-moderation.jsx').then(m => ({ default: m.ChatModerationPage })));
const SupportPage = lazyPage(() => import('./pages/support.jsx').then(m => ({ default: m.SupportPage })));
const NotificationsPage = lazyPage(() => import('./pages/notifications.jsx').then(m => ({ default: m.NotificationsPage })));
const GameRewardsPage = lazyPage(() => import('./pages/game-rewards.jsx').then(m => ({ default: m.GameRewardsPage })));
// ── «مود دوئل کارت» — کلیدِ دستیِ مودِ دومِ دوئل ────────────────────────
// خواستهٔ مالک: «۲ تا مود ساخته شده؛ یکیش باید دستی از پنل فعال شه.»
// پس صفحهٔ اختصاصی شد تا کلیدِ `duelMayhem` از فهرستِ خامِ عددها بیرون
// بیاید و در NAV هم دیده شود.
const DuelModesPage = lazyPage(() => import('./pages/duel-modes.jsx').then(m => ({ default: m.DuelModesPage })));
const GameEconomyPage = lazyPage(() => import('./pages/game-economy.jsx').then(m => ({ default: m.GameEconomyPage })));
const WheelPage = lazyPage(() => import('./pages/wheel.jsx').then(m => ({ default: m.WheelAdminPage })));
const CardBoxPage = lazyPage(() => import('./pages/card-box.jsx').then(m => ({ default: m.CardBoxAdminPage })));
// «انتشار اپ» — آپلودِ نسخهٔ تازهٔ APK و ست‌کردنِ لینکِ به‌روزرسانی
// (تصمیمِ مالک: بدونِ کافه‌بازار، فایل از خودِ سرور سرو شود).
const AppReleasePage = lazyPage(() => import('./pages/app-release.jsx').then(m => ({ default: m.AppReleasePage })));
const SettingsPage = lazyPage(() => import('./pages/settings.jsx').then(m => ({ default: m.SettingsPage })));
const ZarinPalPage = lazyPage(() => import('./pages/zarinpal.jsx').then(m => ({ default: m.ZarinPalPage })));
const LiveCopyPage = lazyPage(() => import('./pages/live-copy.jsx').then(m => ({ default: m.LiveCopyPage })));
const AdminsPage = lazyPage(() => import('./pages/admins.jsx').then(m => ({ default: m.AdminsPage })));
const MetricsPage = lazyPage(() => import('./pages/metrics.jsx').then(m => ({ default: m.MetricsPage })));
const AnalyticsPage = lazyPage(() => import('./pages/analytics.jsx').then(m => ({ default: m.AnalyticsPage })));
// ── صفحاتِ دورِ عملیات: فروشگاه، گذر نبرد، ماموریت، اهرم‌های موتور ──
const ShopAdminPage = lazyPage(() => import('./pages/shop.jsx').then(m => ({ default: m.ShopAdminPage })));
const BattlePassPage = lazyPage(() => import('./pages/battle-pass.jsx').then(m => ({ default: m.BattlePassPage })));
const MissionsPage = lazyPage(() => import('./pages/missions.jsx').then(m => ({ default: m.MissionsPage })));
const CustomMissionPage = lazyPage(() => import('./pages/custom-mission.jsx').then(m => ({ default: m.CustomMissionPage })));
// سپرِ سرور (کلادفلر) — خواستهٔ مالک: آماده بماند، با تأیید روشن شود.
const CloudflarePage = lazyPage(() => import('./pages/cloudflare.jsx').then(m => ({ default: m.CloudflarePage })));
// برنامه‌های پیشنهادی — خواستهٔ مالک (۲۶ شهریور): «در قسمت (بیشتر) وب و
// اندروید، از پنل ادمین مدیریت بشه.»
const RecommendedAppsPage = lazyPage(() => import('./pages/recommended-apps.jsx').then(m => ({ default: m.RecommendedAppsPage })));
// شماره معکوسِ شروعِ لیگ — خواستهٔ مالک (۲۷ شهریور): «بازیِ آنلاین و ضربه‌زن
// تا شروعِ لیگ بسته باشد، شمارش در سه صفحه دیده شود و متنش از پنل عوض شود.»
const EnginePage = lazyPage(() => import('./pages/engine.jsx').then(m => ({ default: m.EnginePage })));

// ── ErrorBoundary برای جلوگیری از صفحه سیاه ──────────────────────────────
class AdminErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) {
    // لاگ به صندوق کرش (از قبل نصب شده) + کنسول
    try { console.error('[admin] ErrorBoundary:', error, info); } catch {}
    // پیامِ واقعی «Failed to fetch dynamically imported module» است و
    // کلمهٔ Chunk ندارد. یک رفرشِ cache-bust کافی است؛ دکمهٔ دستی force است.
    if (isChunkLoadError(error)) recoverFromChunkError();
  }
  handleRetry = () => {
    if (isChunkLoadError(this.state.error)) {
      recoverFromChunkError({ force: true });
      return;
    }
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '32px', textAlign: 'center', direction: 'rtl' }}>
          <div style={{ maxWidth: 480, margin: '40px auto', background: 'var(--surface, #0E1826)', border: '1px solid var(--border, rgba(255,255,255,0.1))', borderRadius: 16, padding: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>خطا خورد</div>
            <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 16, lineHeight: 1.7 }}>{isChunkLoadError(this.state.error) ? 'نسخهٔ ذخیره‌شدهٔ صفحه کهنه است. اگر خودش تازه نشد، این زبانه را ببند و دوباره باز کن.' : 'دوباره تلاش کن و صفحه رو رفرش کن'}</div>
            <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 16, direction: 'ltr', overflow: 'auto', maxHeight: 80 }}>{String(this.state.error?.message || '').slice(0, 300)}</div>
            <button onClick={this.handleRetry} style={{ background: 'var(--gg-emerald, #00D49A)', color: '#060D18', border: 'none', borderRadius: 999, padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}>تلاش دوباره</button>
            <button onClick={() => recoverFromChunkError({ force: true })} style={{ marginRight: 8, background: 'transparent', color: 'var(--text, #EAF1FB)', border: '1px solid var(--border)', borderRadius: 999, padding: '10px 20px', cursor: 'pointer' }}>رفرش کامل</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
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
  'rewards': 'ماموریت و درآمد',
  'games': 'بازی‌ها',
  'people': 'کاربران',
  'talk': 'گفت‌وگو و اطلاع‌رسانی',
  'config': 'پیکربندیِ متن و اپ',
  'admin': 'حساب‌های ادمین',
  'infra': 'زیرساخت و امنیت',
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
  // ── سپرِ سرور (کلادفلر) — خواستهٔ مالک، ۲۶ شهریور ────────────────────────
  //
  // «آماده باشه تو پنل ادمین، تا وقتی حمله نشده غیرفعال بمونه، بعداً با یک
  // ثبت و تایید فعالش کنم.» پس صفحهٔ پیروِ «مانیتورینگ» می‌آید: آن‌جا خطر را
  // می‌بینی، این‌جا جوابش را می‌دهی.
  ['cloudflare', 'سپرِ سرور (کلادفلر)', ShieldCheck, CloudflarePage,
    'سپرِ ضدحملهٔ کلادفلر: خاموش می‌ماند تا خودت با یک تأیید روشنش کنی (اپ و وب، هر دو).',
    'infra'],
  ['photo-cards', 'ثبت کارت', ScanLine, PhotoCardsPage,
    'ثبت کارت‌های فیزیکی با عکس؛ کارتِ تأییدشده وارد کاتالوگِ صندوق و دوئل می‌شود.',
    'cards'],
  ['shop', 'فروشگاه', Store, ShopAdminPage,
    'آیتم‌های فروشگاه و صندوق کارت؛ هر تغییری همان لحظه در فروشگاهِ کاربران می‌نشیند — بدون آپدیت اپ.',
    'cards'],
  ['zarinpal', 'درگاه زرین‌پال', CreditCard, ZarinPalPage,
    'فعال‌سازی و تست درگاه پرداختِ مشترک وب و اندروید؛ تنظیمات از اینجا زنده روی هر دو کلاینت می‌نشیند.',
    'cards'],
  ['card-box', 'صندوق کارت', Package, CardBoxPage,
    'شانسِ هر کلاس، قیمت و روشن/خاموش‌کردن فروش صندوق + تاریخچهٔ خریدها.',
    'cards'],
  ['battle-pass', 'گذر نبرد', Layers, BattlePassPage,
    'فصل‌های گذر نبرد، پله‌های XP و جایزهٔ هر پله — همه قابل تغییر بدون آپدیت.',
    'rewards'],
  // ── ماموریتِ اختصاصی — **قبلِ** «ماموریت‌ها» می‌آید ────────────────────
  //
  // خواستهٔ مالک: «قبلِ ماموریتِ امروز یک قسمت به‌عنوانِ ماموریتِ اختصاصی
  // قرار بگیرد.» همان ترتیب در منو هم رعایت شد تا مدیر دنبالش نگردد.
  ['custom-mission', 'ماموریت اختصاصی', Megaphone, CustomMissionPage,
    'چند کارتِ دلخواه (متن + امتیاز + لینکِ رنگی) برای همهٔ کاربران، بالای «ماموریت‌های امروز» — بدون آپدیت اپ.',
    'rewards'],
  ['missions', 'ماموریت‌ها', Target, MissionsPage,
    'ماموریت‌های روزانه و هفتگی، جایزهٔ هر ماموریت و جایزهٔ تکمیلِ همه.',
    'rewards'],
  ['wallet', 'کیف پول', Wallet, WalletPage,
    'تراکنش‌های کیف پول، درخواست‌های برداشت و واریز/برداشت دستی.',
    'rewards'],
  ['league', 'لیگ ماهانه', Trophy, LeaguePage,
    'لیگ ماهانه: شروع و پایان فصل، جوایز نفرات برتر و تاریخچهٔ پرداخت‌ها.',
    'rewards'],
  // ── «لیگ معرف‌ها» — خواستهٔ مالک (۴ مهر ۱۴۰۵) ───────────────────────────
  //
  // «در قسمت دعوت از دوستان باید یک تب جدید ایجاد کنی … و اگه ادمین از
  // پنل یه آفر مثل لیگ دعوت‌کنندگان قرار داد و کانفیگش کرد، داخل تب
  // دعوت‌کنندگان لیگ معرف‌ها برگزار بشه.»
  //
  // همان یک آفرِ فعال، در تبِ «لیگ معرف‌ها»ی وب و اندروید به کاربران
  // نشان داده می‌شود؛ پس صفحه‌اش هم بلافاصله بعدِ «لیگ ماهانه» می‌آید —
  // دو لیگِ متفاوت که مدیر باید پشتِ‌سرِ هم ببیند.
  ['invite-league', 'لیگ معرف‌ها', UserPlus, InviteLeaguePage,
    'آفرِ زمان‌دارِ بیشترین دعوت‌کننده: بازه، حداقلِ دعوت و جایزهٔ دلخواهِ هر رتبه (امتیاز/سکه/چرخش/کیف پول) — بستنِ دوره و تأییدِ پرداخت هم همین‌جاست.',
    'rewards'],
  // ── «مود دوئل کارت» — اولین ردیفِ گروهِ بازی‌ها ───────────────────────
  //
  // خواستهٔ مالک: «۲ تا مود ساخته شده؛ یکیش باید دستی از پنل فعال شه،
  // هرچی گشتم پیداش نکردم — یه جای توچشم قرارش بده.» کلیدِ آن مود
  // («دوئل طوفان») دو عددِ زندهٔ `duelMayhem` و `duelMayhemStage` است؛
  // پیش‌تر فقط وسطِ فهرستِ خامِ عددها بود. حالا صفحهٔ خودش را دارد و
  // در NAV هم زیرِ «بازی‌ها» می‌آید — همان گروهی که مدیر برای بازی‌ها
  // می‌رود. کامپوننتِ مشترکش در داشبورد هم سوار است.
  ['duel-modes', 'مود دوئل کارت', Swords, DuelModesPage,
    'دو مودِ دوئل کارت: «کلاسیک» همیشه روشن است و «دوئل طوفان» با کلیدِ همین صفحه روشن می‌شود — بدونِ انتشار نسخهٔ تازه.',
    'games'],
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
  // ── انتشار اپ — پیش از «تنظیمات» می‌آید ────────────────────────
  //
  // با کنارگذاشتنِ کافه‌بازار، دکمهٔ «به‌روزرسانی» باید به فایلِ
  // خودمان برود. این صفحه هم فایل را می‌گیرد و هم لینک/حداقلِ نسخه
  // را زنده ست می‌کند؛ پس جایش کنارِ «تنظیمات» است نه داخلِ آن.
  ['app-release', 'انتشار اپ', Smartphone, AppReleasePage,
    'نسخهٔ تازهٔ APK را از همین‌جا منتشر کن: فایل روی سرور می‌نشیند و لینکِ به‌روزرسانی اپ و وب زنده عوض می‌شود.',
    'config'],
  ['settings', 'تنظیمات', Settings, SettingsPage,
    'تنظیمات چت و پیامک + تنظیمات اپ: نسخهٔ اجباری، بنر اطلاعیه و چیدمان تب‌ها.',
    'config'],
  // ── برنامه‌های پیشنهادی — گروهِ «پیکربندیِ متن و اپ» ─────────────────────
  //
  // چرا این گروه: دقیقاً همان وعدهٔ گروه است — «محتوایی که بدونِ آپدیتِ اپ
  // عوض می‌شود». کنارِ «متن‌های زنده» می‌نشیند چون هر دو از یک جنس‌اند:
  // محتوای زنده‌ای که کاربر در وب و اندروید می‌بیند.
  ['recommended-apps', 'برنامه‌های پیشنهادی', Smartphone, RecommendedAppsPage,
    'کادرهای معرفیِ برنامه/سایت در بخشِ «بیشتر» اپ و وب — با عکس، توضیح و لینک؛ بدونِ نیاز به انتشار نسخهٔ تازه.',
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
      <AdminErrorBoundary key={effectiveKey} onReset={() => setPage(effectiveKey)}>
        <Suspense fallback={<div className="pageLoading" aria-busy="true" />}>
          <ActivePage request={request} onNavigate={setPage} isSuperAdmin={isSuperAdmin(role)} token={token} />
        </Suspense>
      </AdminErrorBoundary>
    </AppShell>
  );
}

// تلهٔ سراسریِ خطای پنل باید پیش از رندر نصب شود تا حتی خطای همان فریمِ
// اول هم به صندوقِ کرش برود. آینهٔ همان کاری که وب‌کاربر و اپ می‌کنند.
installAdminErrorMonitor();

createRoot(document.getElementById('root')).render(
  <ToastProvider>
    <DialogProvider>
      <App />
    </DialogProvider>
  </ToastProvider>,
);

