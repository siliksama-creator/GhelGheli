// App shell: theme, auth gate, tab routing.
//
// Screen implementations live under ./screens, reusable pieces under
// ./components, and the HTTP layer under ./lib. This file used to hold all of
// it in ~250 lines whose longest single line was 1775 characters, which made
// every change risky — the "stuck on a loading spinner forever" bug in the
// league tab survived several passes precisely because it was invisible in
// that wall of text.
import React, { useCallback, useEffect, useRef, useState, Suspense, lazy, Component } from 'react';
import { createRoot } from 'react-dom/client';

// «دانلود / ورود» عمداً در `live_copy` نیست: این برچسب فقط در وب وجود
// دارد (اندروید یک دکمهٔ «به‌روزرسانی» دارد که همان کار را می‌کند) و
// ساختنِ کلیدِ یک‌طرفه برای یک برچسبِ تنها-در-یک-پلتفرم، همان الگویی
// است که فاز ۲ رد کرد: یک رشته که «از پنل» به‌نظر می‌رسد ولی در پنلِ
// دیگر هیچ معادلی ندارد و بعد فراموش می‌شود.
import { API, req, fa } from './lib/api.js';
// آموزشِ صوتیِ قلقلی: موتورِ تور در ریشهٔ اپ mount می‌شود تا در هر تبی
// قابل اجرا باشد (پرچمِ «دیده شد» روی سرور است).
import Tour from './tour/Tour.jsx';
// متن‌ها و اعداد زنده (فاز ۲): این fetchِ بنَاییِ config همان چیزی است که
// کشِ ماژول‌سطحِ liveConfig را پر می‌کند، پس هیچ صفحه‌ای برای دانستنِ یک
// برچسب درخواستِ دوم نمی‌زند.
import { primeLiveConfig, text, liveConfigVersion } from './lib/liveConfig.js';
import { primeImageCache, registerImageCacheWorker } from './lib/imageCache.js';
import Notifications from './components/Notifications.jsx';
import Auth from './screens/Auth.jsx';
import Home from './screens/Home.jsx';
import { LoadingView, ErrorView } from './components/states.jsx';
import SplashScreen, { SPLASH_STAGES, SPLASH_MIN_MS } from './components/SplashScreen.jsx';
import { UiIcon } from './components/IconAsset.jsx';
import RewardMomentHost from './components/RewardMoment.jsx';
import { CardBoxReveal } from './components/CardBoxReveal.jsx';
// راهنمای اسکرول — یک پیاده‌سازیِ واحد در وب/ادمین و آینهٔ آن در اندروید.
// خواستهٔ مالک (۲۹ شهریور): «هر تبی که کاربرا نیاز دارن به اسکرول کنن،
// راهنمایی نشون داده بشه؛ یکپارچه و برای همیشه درستش کن.»
import ScrollHint from './components/ScrollHint.jsx';

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
// بعد از دیپلوی، مرورگر چانکِ هشِ قدیمی را از کش می‌خواهد و
// «Failed to fetch dynamically imported module» می‌دهد. یک رفرش کافی است؛
// بدون این، کاربر روی صفحهٔ سفید/خطا می‌ماند تا دستی رفرش کند.
function lazyRetry(importer) {
  return lazy(() => importer().catch((err) => {
    const msg = String(err?.message || err || '');
    if (/Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed/i.test(msg)) {
      try {
        if (!sessionStorage.getItem('gg-chunk-reload')) {
          sessionStorage.setItem('gg-chunk-reload', '1');
          window.location.reload();
          return new Promise(() => {});
        }
      } catch { /* private mode */ }
    }
    throw err;
  }));
}
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    try { event.preventDefault(); } catch { /* ignore */ }
    try {
      if (sessionStorage.getItem('gg-chunk-reload')) return;
      sessionStorage.setItem('gg-chunk-reload', '1');
    } catch { return; }
    window.location.reload();
  });
}

const Profile = lazyRetry(() => import('./screens/Profile.jsx'));
const Ledger = lazyRetry(() => import('./screens/Ledger.jsx'));
const League = lazyRetry(() => import('./screens/League.jsx'));
const Chat = lazyRetry(() => import('./screens/Chat.jsx'));
const PublicProfile = lazyRetry(() => import('./screens/PublicProfile.jsx'));
const CardReg = lazyRetry(() => import('./screens/CardReg.jsx'));
const Shop = lazyRetry(() => import('./screens/Shop.jsx'));
const Wheel = lazyRetry(() => import('./screens/Wheel.jsx'));
const Referral = lazyRetry(() => import('./screens/Referral.jsx'));
const Pass = lazyRetry(() => import('./screens/Pass.jsx'));
const GamesHub = lazyRetry(() => import('./games.jsx'));
const GrowthHub = lazyRetry(() => import('./GrowthHub.jsx'));
// پرسشِ اعلانِ وب — فقط برای کاربرِ لاگین‌کرده، یک‌بار (کدِ تنبل تا
// به باندلِ اصلیِ ورود اضافه نشود؛ خودش هم بی‌صدا شرط‌ها را چک می‌کند).
const WebPushPrompt = lazyRetry(() => import('./components/WebPushPrompt.jsx'));
const Support = lazyRetry(() => import('./support.jsx'));
const Wallet = lazyRetry(() => import('./wallet.jsx'));
// برنامه‌های پیشنهادی — صفحهٔ مستقل، از «بیشتر» باز می‌شود (خواستهٔ مالک).
const RecommendedApps = lazyRetry(() => import('./screens/RecommendedApps.jsx'));

// وقتی کاربر روی تبی می‌زند، چانکش تازه دانلود می‌شود. برای اینکه آن
// لحظه صفر حس شود، به‌محضِ بی‌کار شدنِ مرورگر چانک‌های پرتردد را از
// پیش می‌گیریم. کاربر هیچ‌وقت منتظر نمی‌ماند، ولی بایت‌ها هم جلوی
// رندرِ اول را نگرفته‌اند.
function prefetchTabs() {
  const warm = () => {
    import('./games.jsx').catch(() => {});
    import('./screens/League.jsx').catch(() => {});
    import('./screens/CardReg.jsx').catch(() => {});
    import('./screens/Shop.jsx').catch(() => {});
    import('./screens/Chat.jsx').catch(() => {});
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(warm, { timeout: 4000 });
  else setTimeout(warm, 2500);
}

// ── ErrorBoundary برای جلوگیری از صفحه سیاه (آینهٔ admin) ────────────────
class UserErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) {
    try { console.error('[userweb] ErrorBoundary:', error, info); } catch {}
  }
  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    const m = String(this.state.error?.message || '');
    if (/Chunk|Loading|dynamically imported module/i.test(m)) {
      window.location.reload();
    } else {
      this.props.onReset?.();
    }
  };
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '32px', textAlign: 'center', direction: 'rtl' }}>
          <div style={{ maxWidth: 480, margin: '40px auto', background: 'var(--surface, #0E1826)', border: '1px solid var(--border, rgba(255,255,255,0.1))', borderRadius: 16, padding: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>خطا خورد</div>
            <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 16, lineHeight: 1.7 }}>دوباره تلاش کن و صفحه رو رفرش کن</div>
            <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 16, direction: 'ltr', overflow: 'auto', maxHeight: 80 }}>{String(this.state.error?.message || '').slice(0, 300)}</div>
            <button onClick={this.handleRetry} style={{ background: 'var(--gg-emerald, #00D49A)', color: '#060D18', border: 'none', borderRadius: 999, padding: '10px 20px', fontWeight: 700, cursor: 'pointer' }}>تلاش دوباره</button>
            <button onClick={() => window.location.reload()} style={{ marginRight: 8, background: 'transparent', color: 'var(--text, #EAF1FB)', border: '1px solid var(--border)', borderRadius: 999, padding: '10px 20px', cursor: 'pointer' }}>رفرش کامل</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
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
  ['cardreg', 'ثبت کارت', 'card'],
  ['league', 'لیگ', 'trophy'],
  ['club', 'چت و بازی', 'game'],
];

// ── جملهٔ راهنمای اسکرول، برای هر تب ──────────────────────────────────────
//
// چرا متن‌ها فرق دارند (همان استدلالِ اندروید در `_scrollHints`): یک
// «پایین‌تر هم هست» عمومی بعد از دو بار دیده‌شدن نامرئی می‌شود؛ ولی «جوایز
// بیشتری پایین‌تر هست» به کاربر می‌گوید **چه چیزی** را دارد از دست می‌دهد و
// همین است که انگشتش را حرکت می‌دهد.
//
// ⚠️ گاردِ `tool/scroll-hint.mjs` این نقشه را با نسخهٔ Dart مقایسه می‌کند؛
//    اضافه‌کردنِ تبی در یک کلاینت و نه در کلاینتِ دیگر، CI را قرمز می‌کند.
// تب‌هایی که صفحهٔ خودشان تمام‌صفحه است و راهنمای عمومی رویشان معنی ندارد
// (بازی‌ها قواعد و صحنهٔ خودشان را دارند و در `gameShell` می‌نشینند).
const GAME_TABS = new Set(['games', 'penalty', 'duel']);

// فاصلهٔ امن از پایین برای نشانه‌های شناور: ارتفاعِ نوارِ ناوبری (۷۲px) +
// ناحیهٔ ایمنِ آیفون. یک عدد، یک‌جا — نه سه جا با سه مقدار.
const NAV_SAFE_PAD = 84;

const SCROLL_HINTS = {
  home: 'میان‌برها و کارت‌ها پایین‌ترند',
  cardreg: 'ثبت کارت و کلکسیون پایین‌ترند',
  league: 'ادامهٔ جدول پایین‌تر است',
  club: 'بازی‌ها و ماموریت‌ها پایین‌ترند',
  wheel: 'جوایز و شرایط پایین‌تر است',
  wallet: 'تاریخچهٔ تراکنش‌ها پایین‌تر است',
  ledger: 'ادامهٔ دفتر پایین‌تر است',
  pass: 'پله‌های گذر نبرد پایین‌تر است',
  shop: 'محصولات بیشتری پایین‌تر است',
  invite: 'راهنمای دعوت پایین‌تر است',
  apps: 'برنامه‌های بیشتری پایین‌تر است',
  support: 'تیکت‌ها و راهنما پایین‌ترند',
  profile: 'تنظیمات پروفایل پایین‌تر است',
};

// چیدمانِ سرور-درایوِ تب‌ها: GET /api/config یک آرایهٔ `tabOrder` از
// idهای قراردادی می‌فرستد (home, cardreg, league, social, shop, …).
// idِ وب برای «چت و بازی» club است که با socialِ قرارداد یکی می‌شود.
// ترتیبِ سرور را اعمال می‌کنیم و تب‌های جاافتاده به انتها می‌روند تا
// هیچ‌وقت تبی از نوار گم نشود — تغییرِ چیدمان بدون آپدیت.
const orderByServer = (tabs, idOf) => {
  const order = (window.__tabOrderServer || []);
  const pos = (id) => { const i = order.indexOf(id); return i === -1 ? 9999 : i; };
  return [...tabs].sort((a, b) => pos(idOf(a)) - pos(idOf(b)));
};

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
  ['wallet', 'کیف پول', 'wallet'],
  // دفتر امتیازات — خواستهٔ مالک (۱۷ شهریور): «این قسمت دفتر امتیازات رو
  // انتقال بده به قسمت بیشتر، در اپلیکیشن اندروید و وب.» قبلاً داخل پروفایل
  // بود و کاربر باید وارد فرمِ ویرایشِ اطلاعات شخصی می‌شد تا ببیند امتیازش
  // از کجا آمده. آینهٔ اندروید: `ledgerIndex` در home_shell.dart.
  ['ledger', 'دفتر امتیازات', 'star'],
  // ── برنامه‌های پیشنهادی — خواستهٔ مالک (۲۶ شهریور) ──────────────────────
  //
  // «در قسمت (بیشتر) وب و اندروید، از پنل ادمین مدیریت بشه؛ اگه ادمین تیکِ
  //  فعال رو زد، این قسمت نمایش داده بشه.»
  //
  // ⚠️ این ردیف **همیشه** نشان داده نمی‌شود: اگر ادمین تیک را بردارد یا
  //    هیچ برنامه‌ای ثبت نشده باشد، از فهرست حذف می‌شود (`appsReady`). آن
  //    تشخیص با همان یک درخواستِ کوچکی است که صفحه هم استفاده می‌کند، پس
  //    هیچ رفت‌وبرگشتِ اضافه‌ای ندارد.
  ['apps', 'برنامه‌های پیشنهادی', 'link'],
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

/// بریکپوینتِ چیدمانِ گوشی — **همان عددی که `base.css` استفاده می‌کند**.
///
/// اگر روزی آن مدیا کوئری عوض شود، این عدد هم باید عوض شود؛ به همین دلیل
/// یک گاردِ خودکار در `tool/smoke.mjs` رفتار را روی مرورگرِ واقعی می‌سنجد
/// (نمای ۱۴۴۰: پوشش نباید باشد — نمای ۳۹۰: باید باشد).
const PHONE_MAX_WIDTH = 900;

/// آیا این بارگذاری روی «وبِ موبایل» است؟
///
/// ⚠️ عمداً **یک‌بار در شروع** خوانده می‌شود و به تغییرِ اندازهٔ پنجره
/// گوش نمی‌دهد. دو دلیل:
///
///   ۱. پوششِ راه‌اندازی یک چیزِ زمانِ بالا‌آمدن است. کسی که پنجره‌اش را
///      باریک می‌کند، وسطِ کارِ خودش نباید یک صفحهٔ بارگذاری ببیند.
///   ۲. اگر به تغییرِ اندازه گوش می‌داد، یک کاربرِ دسکتاپ با کوچک‌کردنِ
///      پنجره (یا چرخاندنِ تبلت) ناگهان پوشش را می‌دید — در حالی که
///      `bootGated` مدت‌ها پیش false شده و پوشش بلافاصله محو می‌شد؛ یعنی
///      یک فلاشِ بی‌معنی به‌جای یک انتقال.
function isPhoneViewport() {
  try {
    return window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH}px)`).matches;
  } catch {
    // نمی‌توانیم بپرسیم؟ رفتارِ پیش‌فرضِ محافظه‌کارانه: پوشش را نشان بده.
    // (نبودنِ پوشش یعنی صفحهٔ بارگذاریِ بی‌برند؛ نشان‌دادنش ضررِ کمتری دارد.)
    return true;
  }
}

function App() {
  const [token, setToken] = useState(() => {
    try {
      // ── دستِ‌به‌دستیِ توکن از فروشگاه (هروی دوتکه) ───────────────────────
      // کارتِ ورودِ ghelghelishop.com بعد از ورودِ موفق کاربر را با توکن در
      // fragment می‌فرستد (تصمیمِ مالک). fragment به سرور ارسال نمی‌شود و
      // همان لحظه از URL پاک می‌شود تا در تاریخچه/لاگ نماند.
      const m = /[#&]token=([^&]+)/.exec(window.location.hash || '');
      if (m && m[1]) {
        localStorage.token = decodeURIComponent(m[1]);
        history.replaceState(null, '', window.location.pathname + window.location.search);
        return localStorage.token;
      }
      return localStorage.token || '';
    } catch { return ''; }
  });
  useDarkOnly();
  // پیکربندی کلاینت (بنر اطلاعیه و…) — از /api/config، بدون نیاز به آپدیت.
  const [cfg, setCfg] = useState(null);
  const [forceGate, setForceGate] = useState(null); // {forced, url, min}

  // ═══════════════════════════════════════════════════════════════════════
  // دروازهٔ راه‌اندازی — صفحهٔ بارگذاریِ واقعی (۲۷ شهریور)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // پیش از این، اولین چیزی که کاربر وب می‌دید `LoadingView` بود: یک کارت با
  // چرخندهٔ عمومی و متنِ «در حال بارگذاری...» که **هیچ ربطی به کارِ واقعیِ
  // در جریان نداشت**. حالا سه کارِ واقعیِ بالا صریح شده‌اند و نوارِ پیشرفت
  // از تمام‌شدنِ خودشان پر می‌شود.
  //
  // ⚠️ «برنامه‌های پیشنهادی» عمداً پشتِ دروازه نیست (تصمیمِ مالک): آن یک
  //    کاوشِ پس‌زمینه با بایاس ۶۰ ثانیه‌ای است و اگر کند باشد، کاربر نباید
  //    منتظرش بماند.
  const [cfgSettled, setCfgSettled] = useState(false);
  const [artSettled, setArtSettled] = useState(false);
  const [portalSettled, setPortalSettled] = useState(false);
  const [floorDone, setFloorDone] = useState(false);
  const [splashLeaving, setSplashLeaving] = useState(false);
  const [splashGone, setSplashGone] = useState(false);

  /// آیا این بارگذاری حق دارد پوششِ سینمایی را نشان بدهد؟
  ///
  /// خواستهٔ مالک: «برای وب موبایل عالیه، برای دسکتاپ حذفش کن.» روی دسکتاپ
  /// صفحهٔ بارگذاری نشان داده **نمی‌شود** و کاربر همان چیزی را می‌بیند که
  /// قبل از ساخته‌شدنِ این قابلیت می‌دید: صفحهٔ ورود/پرتال که خودش حالتِ
  /// بارگذاریِ سبکِ خودش را دارد (`LoadingView` برای پرتال).
  const [splashEligible] = useState(isPhoneViewport);
  const showSplash = splashEligible && !splashGone;

  // کفِ لحظهٔ برند — همان ۶۰۰ms اپ اندروید.
  useEffect(() => {
    const t = setTimeout(() => setFloorDone(true), SPLASH_MIN_MS);
    return () => clearTimeout(t);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════
  //  گرم‌کردنِ پس‌زمینه — **بیرونِ** دروازه، عمداً
  // ═══════════════════════════════════════════════════════════════════════
  //
  // نسخهٔ اولِ این کد سه تصویر را **داخلِ** دروازه پیش‌دانلود می‌کرد
  // (۳۵۶ + ۱۲۵ + ۱۲۳ کیلوبایت ≈ ۶۰۰KB). اندازه‌گیریِ زنده روی سایت نشان داد
  // پوشش ۲٫۵ ثانیه می‌ماند و بیشترِ آن، دانلودِ تصویرهایی بود که کاربر در
  // صفحهٔ بارگذاری **هیچ‌وقت نمی‌بیند**. این دقیقاً همان «تأخیرِ ساختگی» است
  // که قرار بود این کار حذفش کند — فقط این بار پشتِ «کارِ واقعی» قایم شده
  // بود.
  //
  // قاعدهٔ ثابت‌شده: **دروازه فقط تا وقتی بسته می‌ماند که کاری که کاربر
  // می‌بیند تمام شود.** مرحلهٔ `art` حالا فقط رمزگشاییِ خودِ قهرمانِ
  // صفحهٔ بارگذاری است (که مرورگر به‌هرحال دانلودش می‌کند) و بقیه اینجا
  // بی‌صدا گرم می‌شوند.
  useEffect(() => {
    const imgs = ['/brand/login_hero.webp'].map((u) => { const i = new Image(); i.src = u; return i; });
    return () => { imgs.length = 0; };
  }, []);

  // مرحلهٔ «هنر» = تصویرِ خودِ قهرمانِ صفحهٔ بارگذاری، از زبانِ خودش.
  const onHeroReady = useCallback(() => setArtSettled(true), []);

  /// فهرستِ مرحله‌های دروازه، به ترتیبِ نمایش.
  ///
  /// `session` فقط وقتی هست که کاربر توکن دارد — همان قاعدهٔ اپ: مهمان
  /// نباید منتظرِ درخواستی بماند که برایش معنا ندارد.
  const bootSteps = [
    { key: 'config', label: SPLASH_STAGES.config, done: cfgSettled },
    ...(token
      ? [{ key: 'session', label: SPLASH_STAGES.session, done: portalSettled }]
      : []),
    // مرحلهٔ `art` = رمزگشاییِ خودِ قهرمان (تنها تصویری که کاربر اینجا
    // می‌بیند). متنش هم همین را می‌گوید.
    { key: 'art', label: SPLASH_STAGES.art, done: artSettled },
  ];
  const bootDoneCount = bootSteps.filter((x) => x.done).length;
  const bootProgress = bootDoneCount / bootSteps.length;
  const bootCurrent = bootSteps.find((x) => !x.done) || null;
  const bootGated = !(cfgSettled && artSettled && floorDone && (!token || portalSettled));

  // خروجِ سینمایی: پوشش محو می‌شود و بعد از درخت بیرون می‌آید.
  //
  // چرا دو حالت: اگر پوشش بلافاصله unmount شود، هیچ محوشدگی‌ای دیده نمی‌شود
  // و صفحهٔ خانه یک‌دفعه «کلیک» می‌کند. ۴۲۰ms همان عددِ انتقالِ اپ اندروید
  // است، پس دو کلاینت با یک ریتم باز می‌شوند.
  useEffect(() => {
    if (!splashEligible) {
      // دسکتاپ: پوششی وجود ندارد، پس فقط علامتِ «راه‌اندازی تمام شد» را
      // می‌گذاریم. آن علامت، انیمیشنِ ورودِ لوگوی صفحهٔ ورود را آزاد می‌کند
      // (قاعده‌اش در `splash.css` است و بدونِ این خط، لوگو روی دسکتاپ
      // بی‌حرکت می‌ماند — یعنی حذفِ پوشش، یک رگرسیونِ خاموش می‌ساخت).
      try { document.documentElement.setAttribute('data-booted', '1'); }
      catch { /* در محیطِ غیرمرورگر بی‌اهمیت */ }
      return undefined;
    }
    if (bootGated || splashGone) return undefined;
    setSplashLeaving(true);
    // علامتِ «راه‌اندازی تمام شد» روی خودِ ریشهٔ سند.
    //
    // چرا روی <html> و نه یک state: انیمیشنِ ورودِ نشانِ صفحهٔ ورود در CSS
    // نوشته شده و بیرونِ درختِ ری‌اکت است. تا این صفت نباشد، آن انیمیشن
    // «متوقف» می‌ماند (قاعده‌اش در splash.css است) و دقیقاً در لحظهٔ خروجِ
    // پوشش شروع می‌شود — همان دلیلی که بالای همان قاعده نوشته شده.
    try { document.documentElement.setAttribute('data-booted', '1'); }
    catch { /* در محیطِ غیرمرورگر (تست) بی‌اهمیت */ }
    const t = setTimeout(() => setSplashGone(true), 420);
    return () => clearTimeout(t);
  }, [bootGated, splashGone, splashEligible]);
  useEffect(() => {
    req('/api/config', 'GET', null, null).then((d) => {
      setCfg(d);
      // تک‌منبعِ متن/عدد: هر صفحه‌ای که `useLive()` می‌زند از همین کش
      // تازه می‌شود — چهار fetchِ پراکندهٔ قبلی لازم نبود.
      primeLiveConfig(d);
      if (Array.isArray(d?.tabOrder)) window.__tabOrderServer = d.tabOrder;
      // آپدیت نسخهٔ وب از سرور — بدون hardcode در بیلد
      try {
        const app = d?.app || {};
        // وب هیچ ربطی به آپدیتِ اندروید ندارد (خواستهٔ مالک، ۳ مهر ۱۴۰۵).
        // تا دیروز این‌جا کلیدهای `android` هم خوانده می‌شد: اگر ادمین
        // حداقلِ نسخهٔ اندروید را بالا می‌برد، کاربرانِ وب هم دروازهٔ
        // «به‌روزرسانی» می‌دیدند — در حالی که وب همیشه تازه است (از dist
        // سرو می‌شود و با هر دیپلوی نو می‌شود) و نسخه‌اش با pubspecِ
        // اندروید هیچ نسبتی ندارد. حالا فقط کلیدهای `web` خوانده می‌شود؛
        // سرور امروز کلیدِ وبی نمی‌فرستد، پس این دروازه خاموش می‌ماند.
        // اگر روزی آپدیتِ مستقلی برای وب لازم شد، همان کلیدها آن را روشن
        // می‌کنند — بدونِ دست‌زدن به اندروید.
        const min = String(app?.minVersion?.web || '');
        const forced = !!app?.forceUpdate?.web;
        const url = String(app?.updateUrl?.web || '');
        // نسخهٔ نمایشیِ وب (برای سطرِ «نسخهٔ شما …» و لاگِ کرش). با نسخهٔ
        // اندروید مقایسه نمی‌شود (بالا را ببین)؛ نسخهٔ واقعیِ دیپلوی از
        // طریق VITE_APP_RELEASE (شِمای git) تزریق می‌شود.
        const current = String(import.meta.env.VITE_APP_RELEASE || '1.1.20');
        const lower = (a, b) => {
          const parts = (v) => String(v).split('+')[0].trim().split('.').map((x) => parseInt(x, 10));
          const as = parts(a), bs = parts(b);
          if (as.some((x) => Number.isNaN(x)) || bs.some((x) => Number.isNaN(x))) return false;
          for (let i = 0; i < Math.max(as.length, bs.length); i++) {
            const x = as[i] || 0, y = bs[i] || 0;
            if (x < y) return true;
            if (x > y) return false;
          }
          return false;
        };
        if (min && lower(current, min)) {
          setForceGate({
            forced,
            url,
            min,
            current,
            // جای‌نگهدارها با همان `fa()` شماره‌گذاری می‌شوند که بقیهٔ
            // اعدادِ UI استفاده می‌کند؛ اگر ادمینِ فارسی‌پسند رقمِ لاتین
            // هم بپذیرد، باز خروجیِ ما یکدست است.
            notice: (() => {
              const t = text('update.notice', '', {
                current: fa(current), min: fa(min),
              });
              return t ? `${t} ` : '';
            })(),
          });
        }
      } catch (_) { /* ignore */ }
    })
      // حتی اگر config نیاید، دروازه باز می‌شود: اپ با پیش‌فرض‌های کد بالا
      // می‌آید. شکستِ یک درخواستِ غیرحیاتی نباید کاربر را روی اسپلش حبس
      // کند — همان قاعده‌ای که در `BootController` اپ هم پیاده شده.
      .catch(() => {})
      .finally(() => setCfgSettled(true));
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
        // `configVersion` در لاگِ کرش: «این خطا از کی شروع شد» بدونِ این
        // عدد حدس‌زدنی است. کرش‌هایِ روزِ فلان با «متن‌های زندهٔ version ۴۲»
        // وقتی تحلیل می‌شود که version در خودِ ردیف باشد، نه در ذهنِ تیم.
        // (فاز ۴ نقشه‌راه: به‌روزرسانیِ هوشمند = فهمیدنِ این‌که کاربر روی
        // کدام config نشسته بوده.)
        context: { path: location.pathname, configVersion: liveConfigVersion() },
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

  /// `useCallback` لازم است: `Portal` یک `useEffect(..., [])` دارد که `load`
  /// را صدا می‌زند؛ اگر این مرجع در هر رندر عوض شود، رفتارِ دروازه فقط
  /// شکننده می‌شود (نه اشتباه) — ولی یک تابعِ تازه در هر رندر، همان کلاسی
  /// از باگ است که بعداً کسی را زمین می‌زند.
  const onPortalSettled = useCallback(() => setPortalSettled(true), []);

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
      {forceGate && (
        <div className="forceGateModal" role="dialog" aria-modal="true">
          <div className="forceGateCard">
            {/* سه جمله، سه کلید از `live_copy.update`. چرا رشتهٔ کاملِ
                «نسخهٔ شما (X) …» را به‌عنوانِ فول‌بک نمی‌نویسیم: آن رشته
                جای‌نگهدارِ `notice` را ندارد و اگر config نرسیده باشد،
                عددِ نسخه را دستی در رشته می‌گذاشتیم = رقمِ سفتِ ممنوع.
                پس fallbackِ notice رشتهٔ *خالی* است و در همان حالتِ آفلاین،
                دقیقاً همان یک سطرِ امروزِ وب دیده می‌شود. به‌محض رسیدنِ
                config، سطرِ «نسخهٔ شما ۱.۱.۱۷ …» اضافه می‌شود و همین
                کلاینتِ اندروید هم همان رشته را در بدنهٔ دیالوگش می‌گذارد. */}
            <b>{text('update.title', 'نسخهٔ تازه قلقلی آماده است')}</b>
            <p>
              {forceGate.notice}
              {text('update.body',
                'برای اینکه همه‌چیز درست کار کند، لطفاً به تازه‌ترین نسخه به‌روزرسانی کنید.')}
            </p>
            <div className="forceGateActions">
              <button type="button" className="main" onClick={() => { location.reload(); }}>
                {text('update.reload', 'تازه‌سازی')}
              </button>
              {forceGate.url && (
                <a className="ghost" href={forceGate.url} target="_blank" rel="noreferrer">دانلود / ورود</a>
              )}
              {!forceGate.forced && (
                <button type="button" className="ghost" onClick={() => setForceGate(null)}>
                  {text('update.later', 'بعداً')}
                </button>
              )}
            </div>
          </div>
        </div>
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
        <Portal token={token} logout={logout} cfg={cfg} onBootSettled={onPortalSettled} onToken={t => {
          // توکنِ تازه (بعد از تغییرِ رمز) باید جایی بنشیند که رفرشِ صفحه هم
          // از آن استفاده کند — وگرنه کاربر با اولین رفرش بیرون می‌افتد.
          try { localStorage.token = t; } catch { /* private mode */ }
          setToken(t);
        }} />
      ) : (
        <>
          <Auth mode={mode} setMode={setMode}
            done={t => {
              try { localStorage.token = t; } catch { /* private mode */ }
              setToken(t);
            }} />
        </>
      )}

      {/* پوششِ صفحهٔ بارگذاری.
          عمداً **آخرین** فرزند است تا روی همه‌چیز بنشیند و اپ زیرش کامل
          مانت بماند (داده‌هایش را می‌گیرد، چانک‌هایش دانلود می‌شوند) —
          پوششِ `fixed` یعنی انتقال، «کشفِ صفحهٔ آماده» است، نه «شروعِ
          بارگذاریِ صفحه». */}
      {showSplash && (
        <SplashScreen
          stage={bootCurrent?.key || null}
          label={bootCurrent ? bootCurrent.label : ''}
          progress={bootProgress}
          leaving={splashLeaving}
          onHeroReady={onHeroReady}
        />
      )}
    </div>
  );
}

/** آیا «لحظهٔ جایزه» همین حالا روی صفحه است؟ */
function useMomentVisible() {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const check = () => {
      // `.momentCard` فقط وقتی هست که کارتی در حال نمایش باشد؛ خودِ میزبان
      // (`.momentHost`) هم فقط در همان لحظه در DOM می‌آید.
      const now = Boolean(document.querySelector('.momentCard'));
      setUp((prev) => (prev === now ? prev : now));
    };
    check();
    let mo;
    try {
      mo = new MutationObserver(check);
      mo.observe(document.body, { childList: true, subtree: true });
    } catch { /* بدون observer هم مقدارِ اولیه درست است */ }
    return () => { if (mo) mo.disconnect(); };
  }, []);
  return up;
}

function Portal({ token, logout, cfg, onToken, onBootSettled }) {
  const sharedRoom = new URLSearchParams(window.location.search).get('room');
  const [tab, setTabRaw] = useState(sharedRoom ? 'club' : 'home');
  // idهای میراثی: دیپ‌لینک/نوتیفیکیشن‌های دورانِ «جوایز» و تبِ جداگانهٔ
  // کلکسیون از این به بعد به همان تبِ «ثبت کارت» می‌رسند — صفحهٔ خالی نه.
  const setTab = (id) => setTabRaw(id === 'rewards' || id === 'inventory' ? 'cardreg' : id);
  // ── کاشیِ خانه → بازکردنِ مستقیمِ بازی (خواستهٔ مالک، ۳۱ شهریور ۱۴۰۵) ──
  // دوقلوی اندروید: _pendingGameId/_pendingGameNonce در home_shell.dart.
  const [gameLaunch, setGameLaunch] = useState(null);
  const [p, setP] = useState(null);
  const [msg, setMsg] = useState('');
  // نتیجهٔ بازگشت از درگاه (نوار «بازگشت به اپ» در اندروید) + صندوقِ
  // خریداری‌شده از درگاه برای رونمایی (null = چیزی برای نمایش نیست).
  const [payResult, setPayResult] = useState(null);
  const [payBox, setPayBox] = useState(null);
  const [payRevealed, setPayRevealed] = useState(0);
  const [publicUser, setPublicUser] = useState(null);
  const [loadError, setLoadError] = useState(null);
  // تعداد چرخش امروز، برای نشان کنار آیکون گردونه — خواستهٔ مالک:
  // «کنار آیکون گردونه در صفحه اصلی تعداد شانس روز گردونه مشخص باشه».
  const [spins, setSpins] = useState(null);
  // خلاصهٔ گذر نبرد برای نشانِ نوار بالا. از همان /api/bootstrap می‌آید،
  // پس هیچ رفت‌وبرگشت اضافه‌ای ندارد.
  const [passBrief, setPassBrief] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  // ── عوض‌کردنِ تب = برگشت به بالای تب ────────────────────────────────────
  //
  // بدونِ این، جای اسکرول از تبِ قبلی می‌ماند: کاربر تبی را باز می‌کند و
  // **وسطِ صفحه** فرود می‌آید؛ بالای تب (عنوان، خلاصه، دکمهٔ اصلی) دیده
  // نمی‌شود و راهنمای اسکرول هم درست است که چیزی نشان نمی‌دهد (چون پایینِ
  // صفحه است). خواستهٔ مالک دقیقاً همین بود: «بعضی چیزها در چشم نیستند.»
  // `behavior:auto` عمدی است: پرشِ نرمِ تبِ تازه، حرکتِ خودکار را با
  // اسکرولِ کاربر قاطی می‌کند و حسِ «پرید» می‌دهد.
  useEffect(() => {
    if ((window.scrollY || 0) > 0) window.scrollTo({ top: 0, behavior: 'auto' });
  }, [tab]);
  // اسکرولِ شیتِ «بیشتر»: محوشدگیِ بالا/پایین فقط وقتی لازم است نشان داده
  // شود — همان زبانی که راهنمای تب‌ها دارد.
  const [sheetScroll, setSheetScroll] = useState({ above: false, below: false });
  const momentUp = useMomentVisible();
  const sheetScrollRef = useRef(null);
  // ── برنامه‌های پیشنهادی ────────────────────────────────────────────────
  //
  // `probe` همان صفحهٔ اولِ فهرست است؛ هم برای تصمیمِ «ردیفِ منو را نشان
  // بده یا نه»، هم به‌عنوان دادهٔ اولیهٔ صفحه تا کاربر دو بار منتظر نماند.
  // `appsReady` = بخش روشن است **و** حداقل یک برنامهٔ فعال دارد.
  const [appsProbe, setAppsProbe] = useState(null);
  const [appsReady, setAppsReady] = useState(false);
  const appsProbedAt = useRef(0);
  // ⚠️ ترتیب مهم است: این دو خط **بعد** از `appsReady` می‌آیند. وقتی
  //    `visibleMore` بالای حالتِ `appsReady` بود، تابعِ filter در همان
  //    رندر به متغیری می‌رسید که هنوز ساخته نشده بود و کلِ اپ با
  //    «Cannot access … before initialization» سفید می‌شد — دقیقاً همان
  //    بالای صفحه‌ای که کاربر پشتش می‌ماند.
  const visibleMore = orderByServer(MORE_TABS, t => t[0]).filter(([id]) => id !== 'apps' || appsReady);
  // هر بار که شیت باز می‌شود، وضعیتِ محوشدگی از صفر سنجیده می‌شود (شیت
  // بین بازشدن‌ها از DOM می‌رود و برمی‌گردد، پس اسکرولش هم صفر است).
  useEffect(() => {
    if (!moreOpen) return;
    const el = sheetScrollRef.current;
    if (!el) return;
    setSheetScroll({ above: false, below: el.scrollHeight > el.clientHeight + 6 });
  }, [moreOpen, visibleMore.length]);

  // یک‌بار در شروع، و هر بار که کاربر شیتِ «بیشتر» را باز می‌کند اگر بیش از
  // یک دقیقه گذشته باشد. این «بدونِ آپدیت» بودن را واقعی می‌کند: ادمین
  // برنامه اضافه می‌کند و کاربر بدونِ رفرش صفحه می‌بیندش.
  async function probeApps(force = false) {
    if (!force && Date.now() - appsProbedAt.current < 60_000) return;
    appsProbedAt.current = Date.now();
    try {
      const data = await req('/api/recommended-apps?page=1&per_page=10', 'GET', null, null);
      const items = Array.isArray(data?.items) ? data.items : [];
      setAppsProbe({ enabled: data?.enabled !== false, items, page: data?.page || null });
      setAppsReady(data?.enabled !== false && items.length > 0);
    } catch {
      // شبکه لرزید؟ بخش را نشان نمی‌دهیم، ولی هیچ‌چیز دیگری نمی‌شکند.
      setAppsReady(false);
    }
  }

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
    } finally {
      // به دروازه می‌گوییم «این فاز تمام شد» — **هم در موفقیت و هم در
      // شکست**. اگر فقط در موفقیت خبر می‌دادیم، یک خطای شبکه کاربر را
      // برای همیشه پشتِ صفحهٔ بارگذاری نگه می‌داشت و هیچ‌وقت کارتِ خطا و
      // دکمهٔ «تلاش دوباره» را نمی‌دید.
      onBootSettled?.();
    }
  }

  // ── بارگذاریِ دادهٔ پرتال ──────────────────────────────────────────────
  //
  // 🔴 باگِ «ورود می‌چرخد و تمام نمی‌شود» (گزارشِ مالک، ۲۳ سپتامبر):
  // کامیتِ e2355de موقعِ اضافه‌کردنِ افکتِ نتیجهٔ پرداخت، افکتِ
  // `useEffect(() => { load(); }, [])` را **جایگزین** کرد نه اینکه کنارش
  // بگذارد. نتیجه: بعد از ورودِ موفق، Portal مونت می‌شد ولی هرگز
  // `/api/bootstrap` را صدا نمی‌زد؛ `p` تهی می‌ماند و
  // `if (!p) return <LoadingView />` کاربر را برای همیشه پشتِ اسپینر
  // نگه می‌داشت. روی موبایل بدتر هم بود: `onBootSettled` داخلِ `finally`ِ
  // خودِ `load` است، پس دروازهٔ اسپلش هم هرگز باز نمی‌شد.
  //
  // شاهد: لاگِ nginx از IP مالک — `POST /api/auth/login` با ۲۰۰ و توکن،
  // بعد از آن فقط `/api/recommended-apps` و **هیچ** درخواستِ bootstrap.
  // سرور سالم بود: همان مسیر با توکنِ معتبر روی هر پنج گره در ~۹۰ms
  // پاسخِ ۲۰۰ می‌داد. خرابی کاملاً سمتِ کلاینت و همین افکتِ گم‌شده بود.
  //
  // ⚠️ این افکت را حذف/جایگزین نکن؛ افکت‌های تازه **کنارش** اضافه شوند.
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('pay') !== 'result') return;
    const orderId = q.get('order');
    const status = q.get('status') || 'failed';
    // اگر مرورگر نشست را از دست داده، query را فعلاً نگه می‌داریم تا بعد
    // از ورود بتوانیم نتیجهٔ واقعیِ همان سفارش را بخوانیم.
    if (!token) return;
    // کال‌بک زرین‌پال خودش verify/تحویل را انجام داده؛ این درخواست فقط
    // برای نمایشِ نتیجهٔ واقعیِ سفارش است، نه اعتماد به query string.
    (async () => {
      try {
        const d = orderId
          ? await req(`/api/payments/zarinpal/order/${encodeURIComponent(orderId)}`, 'GET', null, token)
          : null;
        const paid = d?.order?.status === 'paid' && status === 'ok';
        setMsg(paid ? 'پرداخت با موفقیت انجام شد و خریدت تحویل شد.' : 'پرداخت انجام نشد یا لغو شد.');
        if (orderId) setPayResult({ ok: paid, orderId });
        // صندوقِ درگاهی هم باید رونمایی شود، مثل خریدِ کیف‌پولی — وگرنه
        // خریدار هرگز نمی‌بیند چه کارت‌هایی گرفته است.
        const box = d?.order?.box;
        if (paid && d?.order?.purchase_kind === 'card_box' && box?.cards?.length) setPayBox(box);
      } catch {
        setMsg(status === 'ok' ? 'نتیجهٔ پرداخت در حال بررسی است؛ صفحه را تازه کن.' : 'پرداخت انجام نشد یا لغو شد.');
      } finally {
        const clean = window.location.pathname + (q.get('room') ? `?room=${encodeURIComponent(q.get('room'))}` : '');
        window.history.replaceState(null, '', clean);
      }
    })();
  }, [token]);

  // ── رونمایی تدریجی صندوقِ درگاهی ──
  // همان ضرباهنگ خرید مستقیم (هر کارت ~۳۰۰ms) تا هر دو مسیر یک حس بدهند.
  useEffect(() => {
    if (!payBox?.cards?.length) return;
    setPayRevealed(0);
    const total = payBox.cards.length;
    const t = setInterval(() => setPayRevealed((n) => {
      if (n >= total) { clearInterval(t); return n; }
      return n + 1;
    }), 300);
    return () => clearInterval(t);
  }, [payBox]);

  // کاوشِ بخشِ «برنامه‌های پیشنهادی» — مستقل از ورود کاربر (مسیر عمومی است).
  useEffect(() => { probeApps(true); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      {cfg?.announcement?.active && cfg.announcement.text && (() => {
        const link = String(cfg.announcement.link || '');
        const text = String(cfg.announcement.text || '');
        const isShop = /shop|فروشگاه/i.test(link) || /فروشگاه/.test(text);
        const open = (e) => {
          if (!isShop) return;
          e.preventDefault();
          setTab('shop');
        };
        return (
          <a
            className="cfgBanner"
            href={isShop ? undefined : (link || undefined)}
            target={!isShop && link ? '_blank' : undefined}
            rel="noreferrer"
            onClick={open}
            role={isShop ? 'button' : undefined}
            style={{
              display: 'block', textAlign: 'center', padding: '9px 14px',
              fontSize: 12.5, fontWeight: 800, color: '#1a0f02',
              background: 'linear-gradient(90deg,#FFD166,#F97316)',
              textDecoration: 'none', cursor: 'pointer', width: '100%',
            }}
          >
            {cfg.announcement.text}
          </a>
        );
      })()}

      {/* ── بازگشت از درگاه در اندروید ──
          سرور بعد از پرداخت، مرورگر را با ۳۰۲ به همین صفحه برمی‌گرداند و
          چون اپ لینکِ تأییدشده (autoVerify) ندارد، اندروید روی ریدایرکتِ
          خودکار اپ را باز نمی‌کند — صفحه در مرورگر می‌ماند. این نوار فقط
          برای اندروید است و با intent صریح (package مشخص، بدون نیاز به
          تأیید دامنه) کاربر را به اپ برمی‌گرداند؛ اگر اپ نصب نباشد،
          fallback همان صفحه است و هیچ حلقه‌ای ساخته نمی‌شود. */}
      {payResult?.orderId && /Android/i.test(navigator.userAgent) && (() => {
        const pq = `?pay=result&status=${payResult.ok ? 'ok' : 'cancel'}&order=${encodeURIComponent(payResult.orderId)}`;
        const intent = `intent://${window.location.host}${pq}#Intent;scheme=https;package=ir.ghelghelishop.ghelgheli;S.browser_fallback_url=${encodeURIComponent(window.location.href)};end`;
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 14px', fontSize: 12.5, fontWeight: 800, color: '#071522', background: 'linear-gradient(90deg,#22E7A6,#38BDF8)' }}>
            <span>{payResult.ok ? 'پرداخت موفق بود و خریدت تحویل شد.' : 'پرداخت انجام نشد یا لغو شد.'}</span>
            <a href={intent} style={{ background: '#071522', color: '#fff', borderRadius: 10, padding: '7px 14px', textDecoration: 'none', fontWeight: 900 }}>بازگشت به اپ قلقلی</a>
            <button type="button" onClick={() => setPayResult(null)} style={{ background: 'transparent', border: '1px solid rgba(7,21,34,.4)', color: '#071522', borderRadius: 10, padding: '6px 10px', cursor: 'pointer', fontWeight: 800 }}>بستن</button>
          </div>
        );
      })()}
      {/* رونمایی صندوقِ خریداری‌شده از درگاه — همان انیمیشنی که خریدِ
          کیف‌پولی می‌دید؛ وگرنه خریدار درگاهی هرگز نمی‌دید چه گرفته. */}
      {payBox?.cards?.length > 0 && (
        <CardBoxReveal cards={payBox.cards} points={payBox.points} distinct={payBox.distinct}
          revealed={payRevealed} onClose={() => setPayBox(null)} title="صندوق باز شد" />
      )}

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
        {orderByServer(NAV_TABS, t => (t[0] === 'club' ? 'social' : t[0])).map(([id, label, icon]) => (
          <button key={id} className={tab === id ? 'on' : ''}
            data-tour={`nav:${id}`}
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
          onClick={() => { setMoreOpen(v => !v); probeApps(); }}>
          <span className="navIcon">⋯</span>
          <span className="navLabel">بیشتر</span>
        </button>
      </nav>

      {moreOpen && (
        <>
          {/* پشتِ شفاف: کلیک بیرون می‌بندد. بدون آن، تنها راه بستن، زدن
              دوبارهٔ خودِ دکمه است که کاربر حدس نمی‌زند. */}
          <div className="sheetShade" onClick={() => setMoreOpen(false)} />
          {/* ══ شیتِ «بیشتر» ══════════════════════════════════════════════
              خواستهٔ مالک (۲۹ شهریور): «این دکمهٔ بیشتر همه‌چیز رو کامل نشون
              نمی‌ده؛ یه سری چیزا خوب نشون داده نمی‌شن.»

              سه چیز عوض شد تا «کامل و در چشم» باشد:
               ۱. سرصفحهٔ ثابت («همهٔ بخش‌ها» + شمارِ بخش‌ها) تا کاربر بداند
                  چند مقصد وجود دارد، نه اینکه فکر کند همین چند ردیف است؛
               ۲. ناحیهٔ اسکرولِ جدا با محوشدگیِ بالا/پایینِ شرطی — بدونِ
                  این، ردیف‌های بیرونِ قاب هیچ نشانه‌ای نداشتند؛
               ۳. فاصلهٔ امن از نوارِ ناوبری و ناحیهٔ ایمنِ آیفون، تا ردیفِ
                  آخر (خروج از حساب) هرگز پشتِ داک گم نشود. */}
          <div className="moreSheet" role="menu" aria-label="همهٔ بخش‌ها">
            <div className="sheetGrip" />
            <div className="sheetHead">
              <b>همهٔ بخش‌ها</b>
              <span>{fa(visibleMore.length)} بخش</span>
            </div>
            <div
              className="sheetScroll"
              ref={sheetScrollRef}
              onScroll={(e) => {
                const el = e.currentTarget;
                const above = el.scrollTop > 6;
                const below = el.scrollTop + el.clientHeight < el.scrollHeight - 6;
                setSheetScroll((prev) => (
                  prev.above === above && prev.below === below ? prev : { above, below }
                ));
              }}
            >
              {visibleMore.map(([id, label, icon]) => (
                <button key={id} role="menuitem"
                  className={tab === id ? 'on' : ''}
                  onClick={() => { setTab(id); setMoreOpen(false); }}>
                  <span><UiIcon name={icon} size={20} /></span>{label}
                </button>
              ))}
              <div className="sheetDivider" aria-hidden="true"><span>حساب</span></div>
              <button role="menuitem" className="sheetDanger"
                onClick={() => { setMoreOpen(false); logout(); }}>
                <span><UiIcon name="close" size={20} /></span>خروج از حساب
              </button>
            </div>
            {sheetScroll.above && <div className="sheetFade top" aria-hidden="true" />}
            {sheetScroll.below && <div className="sheetFade bottom" aria-hidden="true" />}
          </div>
        </>
      )}

      {msg && <div className="toast">{msg}</div>}

      {/* لحظهٔ جایزه: یک لایهٔ `fixed` بالای همه‌چیز — پس روی بازی‌های
          تمام‌صفحه هم دیده می‌شود. میزبان این‌جا سوار می‌شود (نه داخلِ
          هر صفحه) تا هیچ مسیرِ جایزه‌ای بدونِ جشن نماند. */}
      <RewardMomentHost />

      {/* ── راهنمای اسکرول ────────────────────────────────────────────────
          یک لایهٔ `fixed` داخلِ ستونِ اپ (نه چسبیده به نما — درسِ دسکتاپِ
          به‌هم‌ریخته). جملهٔ هر تب از `SCROLL_HINTS` می‌آید و با عوض‌شدنِ تب
          دوباره فعال می‌شود.

          کِی خاموش است:
            • شیتِ «بیشتر» باز است (نشانه‌ها روی شیت می‌افتند)،
            • بازی‌های تمام‌صفحه (قواعد و صفحهٔ خودشان)،
            • لحظهٔ جایزه روی صفحه است (دو لایهٔ شناور روی هم ننشینند). */}
      {/* ⚠️ این‌جا **`key` نمی‌دهیم**. قبلاً `key={tab}` بود و همان
          کلیدِ `<main key={tab}>` را تکرار می‌کرد؛ React دو فرزندِ هم‌کلید
          را «تکراری» می‌بیند و عناصر را بدونِ حذفِ قبلی‌ها می‌سازد. نتیجهٔ
          سنجش‌شده: با هر بار عوض‌کردنِ تب یک `.scrollHintLayer` تازه به
          DOM اضافه می‌شد و قرص‌های تب‌های قبلی (با متنِ خودشان) روی هم
          می‌ماندند — سه تب که می‌رفتیم، چهار قرصِ روی‌هم‌افتاده.
          تازه‌سازیِ تب با `resetKey` انجام می‌شود و نیازی به remount نیست. */}
      <ScrollHint
        hintLabel={SCROLL_HINTS[tab] || 'پایین‌تر هم هست'}
        resetKey={tab}
        enabled={!moreOpen && !GAME_TABS.has(tab) && !momentUp}
        padBottom={NAV_SAFE_PAD}
        topOffset={72}
      />

      {/* `data-tab` وضعیتِ واقعیِ ناوبری را در DOM آشکار می‌کند.
          ابزارِ ممیزی قبلاً «رسیدن به تب» را از روی امضای متنِ صفحه حدس
          می‌زد و وقتی کلیک بی‌اثر می‌ماند، همان صفحهٔ قبلی را دوباره
          می‌سنجید و «موفق» گزارش می‌داد — نتیجه‌اش یافته‌های ساختگی بود.
          برای تبِ‌های داخلِ شیتِ «بیشتر» هم `aria-current` کافی نیست چون
          شیت پس از کلیک بسته می‌شود. این یک قلابِ خواندنی و بی‌اثر روی
          ظاهر است، نه تضعیفِ محصول برای آسان‌شدنِ تست. */}
      <main className="tabPane" key={tab} data-tab={tab}>
        <UserErrorBoundary key={tab} onReset={() => window.location.reload()}>
        <Suspense fallback={<div className="tabLoading" aria-busy="true" />}>
        {tab === 'home' && (
          <Home token={token} p={p} load={load}
            setMsg={setMsg} openProfile={() => setTab('profile')}
            openWallet={() => setTab('wallet')}
            openWheel={() => setTab('wheel')}
            openInvite={() => setTab('invite')}
            openCardReg={() => setTab('cardreg')}
            openTap={() => { setGameLaunch({ id: 'tap', nonce: Date.now() }); setTab('club'); }} />
        )}
        {tab === 'ledger' && (
          <Ledger token={token} setMsg={setMsg} />
        )}
        {tab === 'apps' && (
          <RecommendedApps
            initial={appsProbe}
            onAvailability={(info) => setAppsReady(!!info?.enabled && Number(info?.total || 0) > 0)}
          />
        )}
        {tab === 'profile' && (
          <Profile token={token} p={p} load={load} setMsg={setMsg} onToken={onToken} />
        )}
        {tab === 'cardreg' && (
          <CardReg items={p.inventory || []} grants={p.pendingGrants || []}
            token={token} reload={load} setMsg={setMsg} />
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
            launchGame={gameLaunch} onLaunchConsumed={() => setGameLaunch(null)}
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
        </UserErrorBoundary>
      </main>

      {publicUser && (
        <UserErrorBoundary>
        <Suspense fallback={null}>
        <PublicProfile token={token} userId={publicUser}
          close={() => setPublicUser(null)} />
        </Suspense>
        </UserErrorBoundary>
      )}

      {/* اعلانِ وب: وقتی توکن هست یعنی کاربر لاگین است — همان «اولین
          ورود» که مالک خواست پرسشِ اجازه نمایش داده شود. مهمان هرگز
          پرسش نمی‌بیند (بدونِ توکن، رندر نمی‌شود). mounts در ریشهٔ اپ
          (نه داخلِ یک صفحه) تا در هر تبی از اولین ورود دیده شود —
          درسِ بازبینیِ ۲۲ سپتامبر: قبلاً داخلِ صفحهٔ چت‌وبازی بود و
          فقط آن‌جا دیده می‌شد. */}
      {/* ── آموزشِ صوتیِ قلقلی (۴ مهر ۱۴۰۵) ──
          خواستهٔ مالک: بعد از ورود، صدا شروع کند و انگشت روی همان بخش
          تاچ کند. `tab` و `goTab` این‌جا داده می‌شوند تا تور بتواند
          خودش بین تب‌ها برود. */}
      {token ? (
        <Tour token={token} tab={tab} goTab={(id) => setTab(id)} />
      ) : null}

      {token ? (
        <Suspense fallback={null}>
          <WebPushPrompt token={token} />
        </Suspense>
      ) : null}
    </div>
  );
}

function Club({ token, openProfile, meId, openGames = false, launchGame = null, onLaunchConsumed, setMsg, openShop, passClaimable = 0 }) {
  const [sub, setSub] = useState(openGames || launchGame ? 'games' : 'chat');
  // نیتِ پرتابِ بازی یک‌بار در mount مصرف می‌شود: Games مقدارِ
  // initialActive را در useState خودش گرفت؛ اگر مصرف نکنیم، هر بارِ
  // بعدی که کاربر دستی به تبِ بازی‌ها برگردد بازی دوباره تحمیل می‌شود.
  useEffect(() => {
    if (launchGame && onLaunchConsumed) onLaunchConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [externalLaunch, setExternalLaunch] = useState(null);
  // نسلِ پنلِ ماموریت — آینهٔ `_growthGeneration` در اندروید.
  // با هر انتقالِ سوکت به تبِ بازی یکی زیاد می‌شود تا پنلِ قدیمی
  // (که سوکتش دیگر مالِ خودش نیست) هرگز دوباره mount نشود.
  const [growthGen, setGrowthGen] = useState(0);
  // ── پلِ زیرتب برای تورِ آموزشِ صوتی (۴ مهر ۱۴۰۵) ────────────────────
  // تور در ریشهٔ اپ است و به state داخلیِ این صفحه دسترسی ندارد؛ برای
  // «ماموریت‌ها» و «گذر نبرد» باید همین صفحه خودش زیرتب را عوض کند.
  // یک رویدادِ کوچک، جای بالا بردنِ state به ریشه (که هر رندرِ اپ را
  // سنگین می‌کرد) انتخاب شد.
  useEffect(() => {
    const onTour = (e) => {
      const s = e.detail?.sub;
      if (s && ['chat', 'games', 'growth', 'pass'].includes(s)) setSub(s);
    };
    window.addEventListener('gg:tour-sub', onTour);
    return () => window.removeEventListener('gg:tour-sub', onTour);
  }, []);
  return (
    <div className="clubWrap">
      <div className="clubTabs socialTripleTabs" data-tour="club:subtabs">
        <button className={sub === 'chat' ? 'on' : ''} data-tour="club:tab:chat"
          onClick={() => setSub('chat')}><UiIcon name="support" size={17} /> چت</button>
        <button className={sub === 'games' ? 'on' : ''} data-tour="club:tab:games"
          onClick={() => setSub('games')}><UiIcon name="game" size={17} /> بازی‌ها</button>
        <button className={sub === 'growth' ? 'on' : ''} data-tour="club:tab:growth"
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
          data-tour="club:tab:pass"
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
        externalLaunch={externalLaunch} initialActive={launchGame?.id || null} />}
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
