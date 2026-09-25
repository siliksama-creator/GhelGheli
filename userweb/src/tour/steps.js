// ─────────────────────────────────────────────────────────────────────
// آموزشِ صوتیِ قلقلی — نگاشتِ «لنگر» هر بخش (سمتِ کلاینت)
//
// چرا این فایل جدا از متن‌هاست:
//   متن و ترتیب روی سرور است (`/api/onboarding`) تا ادمین بتواند بدونِ
//   آپدیتِ اپ عوضش کند. ولی «کدام تیغهٔ رابط» و «کدام تب» یک تصمیمِ
//   ظاهری است و فقط کلاینت می‌داند. پس `id` ها این‌جا به لنگرِ HTML و
//   مسیرِ رسیدن (تب/زیرتب) وصل می‌شوند و گاردِ
//   `backend/scripts/testOnboarding.js` قفل می‌کند که هر `id` سرور،
//   لنگرِ متناظر داشته باشد و برعکس — تا وب و اندروید هرگز از هم جدا نشوند.
//
// `anchors` یک فهرست است، نه یک مقدار: لنگرِ اول گاهی فقط در حالتی دیده
// می‌شود (مثلاً خطِ سقفِ امتیاز وقتی ورودی انتخاب شده). اگر پیدا نشد،
// سراغِ بعدی می‌رود و در بدترین حالت کارت وسطِ صفحه می‌ماند — تور هرگز
// روی یک لنگرِ غایب گیر نمی‌کند.
// ─────────────────────────────────────────────────────────────────────

export const TOUR_UI = Object.freeze({
  home: { nav: { tab: 'home' }, anchors: ['home:hero', 'nav:home'] },
  daily: { nav: { tab: 'home' }, anchors: ['home:streak'] },
  tap: { nav: { tab: 'home' }, anchors: ['home:tapTile'] },
  wheel: { nav: { tab: 'home' }, anchors: ['home:wheelTile'] },
  cards: { nav: { tab: 'cardreg' }, anchors: ['cardreg:top', 'nav:cardreg'] },
  league: { nav: { tab: 'league' }, anchors: ['league:tabs', 'nav:league'] },
  club: { nav: { tab: 'club', sub: 'chat' }, anchors: ['club:subtabs', 'nav:club'] },
  invite: { nav: { tab: 'home' }, anchors: ['home:inviteTile'] },
  duel: { nav: { tab: 'club', sub: 'games' }, anchors: ['games:grid', 'club:tab:games'] },
  cap: { nav: { tab: 'club', sub: 'games' }, anchors: ['games:stakes', 'games:grid'] },
  missions: { nav: { tab: 'club', sub: 'growth' }, anchors: ['club:tab:growth', 'club:subtabs'] },
  pass: { nav: { tab: 'club', sub: 'pass' }, anchors: ['club:tab:pass', 'club:subtabs'] },
  coins: { nav: { tab: 'league', sub: 'vault' }, anchors: ['league:tab:vault', 'league:tabs'] },
  shop: { nav: { tab: 'shop' }, anchors: ['shop:top'] },
  wallet: { nav: { tab: 'wallet' }, anchors: ['wallet:top'] },
  profile: { nav: { tab: 'profile' }, anchors: ['profile:top'] },
  support: { nav: { tab: 'support' }, anchors: ['support:top'] },
  outro: { nav: { tab: 'home' }, anchors: ['home:hero'] },
});

/** طولِ زنجیرهٔ صداها — گاردِ تست با این عدد تطبیق می‌دهد. */
export const TOUR_AUDIO_COUNT = 18;
