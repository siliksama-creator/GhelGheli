// ─────────────────────────────────────────────────────────────────────
// آموزشِ صوتیِ قلقلی — نگاشتِ «لنگر» و «مسیرِ ورود» هر بخش (سمتِ کلاینت)
//
// چرا این فایل جدا از متن‌هاست:
//   متن و ترتیب روی سرور است (`/api/onboarding`) تا ادمین بتواند بدونِ
//   آپدیتِ اپ عوضش کند. ولی «کدام تیغهٔ رابط» و «کدام تب» یک تصمیمِ
//   ظاهری است و فقط کلاینت می‌داند. پس `id` ها این‌جا به لنگرِ HTML و
//   مسیرِ رسیدن (تب/زیرتب) وصل می‌شوند و گاردِ
//   `backend/scripts/testOnboarding.js` قفل می‌کند که هر `id` سرور،
//   لنگرِ متناظر داشته باشد و برعکس — تا وب و اندروید هرگز از هم جدا نشوند.
//
// ── خواستهٔ مالک (۵ مهر ۱۴۰۵) ────────────────────────────────────────
//   «اون دکمه تاچ و لمسی که ساختیم وقتی قسمتی رو توضیح داره میده باید
//    دقیقا نشون بده که چطور اصلا وارد اون قسمت شده»
//
// یعنی فقط نشان‌دادنِ خودِ بخش کافی نیست؛ باید **راهِ رسیدن** هم دیده شود:
// روی تبِ نوار پایین می‌ایستد، تاچ می‌کند، تب عوض می‌شود، و انگشت از همان
// تیغه به سمتِ بخشِ مقصد می‌رود. سه بخشِ داده این کار را می‌کنند:
//
//   nav.tab / nav.sub → خودِ تور تب و زیرتب را عوض می‌کند (در موتور)
//   enter             → «درِ ورودی»؛ اگر نبود، `nav:<tab>` خودش در است.
//                        'more:<id>' یعنی از شیتِ «بیشتر» وارد می‌شود و
//                        همان آیتم هم نشان داده و باز می‌شود.
//   anchors           → مقصدِ نهایی (فهرست: اولی که پیدا شد برنده است).
//
// چرا `anchors` یک فهرست است: لنگرِ اول گاهی فقط در حالتی دیده می‌شود
// (مثلاً خطِ سقفِ امتیاز وقتی ورودی انتخاب شده). اگر پیدا نشد، سراغِ بعدی
// می‌رود و در بدترین حالت کارت وسطِ صفحه می‌ماند — تور هرگز روی یک لنگرِ
// غایب گیر نمی‌کند.
//
// ⚠️ لنگرهای پویا: `nav:${id}`، `league:tab:${id}` و `more:${id}` در کد با
//    رشتهٔ قالبی ساخته می‌شوند (نه رشتهٔ ثابت)، پس هر مقصدِ تازه‌ای که به
//    فهرستِ همان تیغه اضافه شود، لنگرش هم خودکار هست.
// ─────────────────────────────────────────────────────────────────────

export const TOUR_UI = Object.freeze({
  home: { nav: { tab: 'home' }, anchors: ['home:hero', 'nav:home'] },
  daily: { nav: { tab: 'home' }, anchors: ['home:streak'] },
  tap: { nav: { tab: 'home' }, anchors: ['home:tapTile'] },
  wheel: { nav: { tab: 'home' }, anchors: ['home:wheelTile'] },
  cards: { nav: { tab: 'cardreg' }, anchors: ['cardreg:top', 'nav:cardreg'] },
  league: { nav: { tab: 'league' }, anchors: ['league:tabs', 'nav:league'] },
  club: { nav: { tab: 'club', sub: 'chat' }, anchors: ['club:subtabs', 'nav:club'] },
  // دعوت: مسیرش از شیتِ «بیشتر» است (کاربر صفحهٔ معرف‌ها را همان‌جا پیدا
  // می‌کند، نه از کاشیِ خانه) — پس همان مسیرِ واقعی نشان داده می‌شود.
  invite: {
    nav: { tab: 'invite' }, enter: ['more:invite'],
    anchors: ['invite:top', 'more:invite', 'home:inviteTile'],
  },
  duel: { nav: { tab: 'club', sub: 'games' }, anchors: ['games:grid', 'club:tab:games'] },
  cap: { nav: { tab: 'club', sub: 'games' }, anchors: ['games:stakes', 'games:grid'] },
  missions: { nav: { tab: 'club', sub: 'growth' }, anchors: ['club:tab:growth', 'club:subtabs'] },
  pass: { nav: { tab: 'club', sub: 'pass' }, anchors: ['club:tab:pass', 'club:subtabs'] },
  coins: { nav: { tab: 'league', sub: 'vault' }, anchors: ['league:tab:vault', 'league:tabs'] },
  shop: { nav: { tab: 'shop' }, enter: ['more:shop'], anchors: ['shop:top', 'more:shop'] },
  wallet: { nav: { tab: 'wallet' }, enter: ['more:wallet'], anchors: ['wallet:top', 'more:wallet'] },
  profile: { nav: { tab: 'profile' }, enter: ['more:profile'], anchors: ['profile:top', 'more:profile'] },
  support: { nav: { tab: 'support' }, enter: ['more:support'], anchors: ['support:top', 'more:support'] },
  outro: { nav: { tab: 'home' }, anchors: ['home:hero', 'nav:home'] },
});

/** طولِ زنجیرهٔ صداها — گاردِ تست با این عدد تطبیق می‌دهد. */
export const TOUR_AUDIO_COUNT = 18;
