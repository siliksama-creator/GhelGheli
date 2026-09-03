# قراردادِ متن و عددِ زنده (`live_copy` / `live_rules`)

> سندِ فاز ۲ نقشه‌راه. این فایل **مرجعِ یکپارچهٔ** هر رشته‌ای است که در UI
> (وب دسکتاپ، وب موبایل، اندروید) از پنل ادمین خوانده می‌شود.
> پیش از آنکه رشته یا عددِ تازه‌ای به کلاینت وصل کنید، این جدول را بخوانید.
>
> منبعِ حقیقتِ کد: `backend/src/services/liveContent.js`
> (`DEFAULT_COPY`، `COPY_CONTRACT`، `RULE_DEFS`). این سند از روی همان جدول
> نوشته شده و اگر دو تا با هم نخواند، **کد** حرفِ آخر را می‌زند — ولی
> گاردها (`testLiveContent`, `live-copy-parity`) دقیقاً همین نخواندن را
> قرمز می‌کنند، پس در عمل نمی‌توانند از هم فاصله بگیرند.

---

## ۰) یک نگاهِ کلی: رشته از کجا می‌آید و به کجا می‌نشیند

```
پنل ادمین  ──PATCH──▶  live_copy / live_rules  (+ ردیفِ live_content_history)
                              │
                              ▼
                        GET /api/config      ←  بدنهٔ یکسان برای همهٔ کلاینت‌ها
                       copy · rules · avatars · stakes
                       economy · configVersion
              ┌───────────────┴────────────────┐
              ▼                                ▼
   userweb/src/lib/liveConfig.js      mobile/lib/core/app_config.dart
   text(key, fallback, vars)          AppConfig.text(key, fallback, vars:)
   rawText(key)                       AppConfig.rule(name, fb)
   ruleNumber(name, fb)               liveText(...) / liveRule(...)
   useLive() → بازسازی با رسیدنِ نسل   ChangeNotifier → بازسازی با رسیدنِ نسل
              │                                │
              ▼                                ▼
        همان رشته، همان رقم، همان طرح در هر دو پلتفرم
```

**سه قاعدهٔ ساختاری، نه سبکی:**

1. **متن هرگز از راهِ `fetch` تازه به UI نمی‌رسد.** هر دو کلاینت فقط
   بدنهٔ همان درخواستِ `/api/config` را که *از قبل* می‌زدند به مخزن
   می‌دهند (`prime()` در وب، `AppConfig.apply()` در `home_shell`).
   یک fetchِ سراسریِ تازه در اندروید ساختیم و پس دادیم:
   `mobile/test/home_shell_test.dart` سقفِ «حداکثر دو درخواست به هر مسیر»
   را دارد و `auth_screen` با `fresh: true` کش را دور می‌زند.
   `AppConfig.ensure()` به‌همین دلیل با پنجرهٔ ۱.۲ ثانیه‌ایِ `ApiClient`
   در همان لحظه ادغام می‌شود و درخواستِ دوم *نمی‌سازد*.
2. **هر عددی که *جا را می‌سازد* باید از بدنه بیاید، نه فقط هر عددی که در متن
   دیده می‌شود.** این تفاوتِ فاز ۲ با نسخهٔ اولش است. مثالِ واقعی:
   استریک — تا پیش از این اصلاح، حتی اگر متنِ «۷ روزه» زنده هم می‌شد،
   `for (i < 7)` تعدادِ گره‌ها را عوض نمی‌کرد و با چرخهٔ ۱۰ روزه سه روز آخر
   اصلاً رسم نمی‌شد.
3. **کلاینت هیچ واژه‌ای را با سرور نمی‌سازد.** اگر کلمه‌ای هم در قالبِ سرور
   باشد و هم در رشتهٔ کلاینت («ورودی {stakeLow}» ← `«ورودی ${fa(x)}»`)،
   ادمین واژه را عوض می‌کند و کلاینت عوض نمی‌کند. جای‌نگهدار باید **کلِ
   برچسبِ ساخته‌شده** را بگیرد: `{stakeLowText}`.

---

## ۱) جدولِ کلیدها

`جای‌نگهدار` = چیزهایی که باید در `vars` پاس دهید؛ اگر یکیش نیفتد،
`text()` **بی‌صدا** به فول‌بکِ کلاینت می‌افتد (بدونِ خطا!). این دقیقاً همان
چیزی است که گارد می‌گیرد: *نامِ متغیرهایِ پاس‌داده‌شده* باید با
`COPY_CONTRACT[key]` یکی باشد.

| کلید | جای‌نگهدار | عدد از کجا | وب | اندروید |
|---|---|---|---|---|
| `referral.dailySpinRule` | `invitesPerDailySpin`, `spinsPerDailyThreshold`, `maxInvitesForDaily` | `referral.invitesPerDaily` / `live_rules.spinsPerDailyThreshold` / `referral.maxDailyInvitesForSpin` | `Referral.jsx`, `Wheel.jsx` | `referral_page.dart` |
| `coinGuide.heading` · `lead` · `allEqual` · `noCoin` · `neverLost` · `carryoverZero` | — | — | `CoinGuide.jsx` | `widgets/coin_guide.dart` |
| `coinGuide.quota` | `qLow`, `stakeLowText`, `qHigh`, `stakeHighText` | `economy.dailyCoinQuota.lowTier/highTier` | `CoinGuide.jsx` | `coin_guide.dart` |
| `coinGuide.tapCoins` | `tapCoins` | `economy.tapCoinsPerLevel` (امروز: سرور مقدارِ ثابت می‌فرستد) | `CoinGuide.jsx` | `coin_guide.dart` |
| `coinGuide.league` | `carryover` | `economy.carryoverPercent` → `pctText` | `CoinGuide.jsx` | `coin_guide.dart` |
| `coinGuide.carryoverPercent` | `percent` | همان | `CoinRateStrip.jsx` | `coin_rate_strip.dart` |
| `coinGuide.stakeLabel` | `stake` | — (قالبِ *ساختِ برچسب*) | `lib/coinCopy.js → stakeLabel()` | `stakeLabel` در `coin_guide.dart` / `coin_rate_strip.dart` |
| `coinGuide.botNote` | `stakeLowText`, `stakeHighText` | `stakes.public.bot.low/high` | `CoinRateStrip.jsx` | `coin_rate_strip.dart` |
| `coinGuide.privateNote` | `stakeLowText`, `stakeHighText` | `stakes.public.private.low/high` | `CoinRateStrip.jsx` | `coin_rate_strip.dart` |
| `plus.monthlyBadge` | `days` | `durationDays`ِ خودِ پلن | `Shop.jsx` | ⬜ فقط به‌عنوانِ استثنا (تصمیمِ طرح) |
| `plus.annualBadge` | `savingPercent` | محاسبه از قیمتِ پلن‌ها (از سرور) | `Shop.jsx` | `shop_page.dart` |
| `plus.benefitsNote` | `days` | `durationDays` | ⬜ باقی‌مانده | ⬜ باقی‌مانده |
| `streak.cycleDone` | `days`, `day` | `days = len(rewards)` | — (طرحِ وب فرق دارد) | `login_streak_card.dart` |
| `streak.cycleNext` | `days`, `day`, `reward` | « | — | `screens/user/login_streak_card.dart` |
| `streak.webDone` | `day`, `days` | « | `components/LoginStreak.jsx` | — (طرحِ اندروید دو خطِ فشرده است) |
| `games.tapSubtitle` | `levelCount` | `config.tapLevelCount` ← `economy.tapCurve.levelCount` | `games.jsx` | `games_page.dart` |
| `games.memoryRule` | `memoryPairs` | `rules.memoryPairs` (فول‌بک ۸) | `games.jsx`, صفحهٔ بازی | `memory_board.dart` |
| `games.roomCodeLabel` | `codeLength` | `rules.roomCodeLength` (فول‌بک ۴) | `PrivateMatchDialog` | `private_match_dialog.dart` |
| `games.duelSubtitle` · `memorySubtitle` | — | — | `games.jsx` | `games_page.dart` |
| `reconnect.offlineNote` | `reconnectSeconds` | `rules.reconnectSeconds` (فول‌بک ۲۵) | `gameSession.js` | `game_session.dart` |
| `photoReview.pendingNote` | `slaHours` | `rules.reviewSlaHours` (فول‌بک ۲۴) | `PhotoCardBox.jsx` | `widgets/photo_card_box.dart` |
| `avatars.countLabel` | `count` | طولِ `config.avatars` | `screens/Profile.jsx` | `screens/user/profile_page.dart` |
| `wheel.resetNote` | — | — (ساعتِ ریست **منطقِ سرور** است، نه متن) | `Wheel.jsx` | `wheel_page.dart` |
| `support.ticketRule` | `ticketsPerDay` | `rules.ticketsPerDay` | ⬜ باقی‌مانده | ⬜ باقی‌مانده |
| `support.attachmentsFull` | `maxAttachments` | `rules.maxTicketAttachments` | ⬜ | ⬜ |
| `support.privacyTitle` / `privacySections` | — | — (آرایهٔ بندها؛ **ردیفِ قرارداد ندارد** چون جای‌نگهدار ندارد) | ⬜ | ⬜ |

**قانونِ خواندنِ این جدول:** هر کلیدی که در ستونِ «وب» یا «اندروید» علامت
⬜ دارد، هنوز رشته‌اش در آن کلاینت سفت است. فهرستِ کلِ این موارد در
`live_rules`/`live_copy` ثبت شده، پس *پنل* می‌تواند عوضش کند و فقط یک
کلاینت اجرا می‌کند — و این همان چیزی است که در تستِ «۲۰ تغییرِ پنل» باید
صفر شود.

---

## ۲) اعدادِ ساختاری (`live_rules`) و قاعدهٔ فول‌بک

| قاعده | امروز | بازهٔ مجاز | چه چیزی را در UI می‌سازد |
|---|---|---|---|
| `memoryPairs` | ۸ | ۴–۸ | تعدادِ کاشی‌ها، سطرهایِ برد، `gridCount/2` |
| `roomCodeLength` | ۴ | ۴–۸ | `maxLength` و `keyboardType`ِ فیلدِ کد، متنِ «۴ رقم» |
| `reconnectSeconds` | ۲۵ | ۱۰–۶۰ | تایمرِ اتصالِ دوباره + متنش |
| `ticketsPerDay` | ۱ | ۱–۱۰ | سهمیهٔ تیکت روزانه (متن + سرور) |
| `maxTicketAttachments` | ۵ | ۱–۱۰ | سقفِ پیوست (متن + سرور) |
| `reviewSlaHours` | ۲۴ | ۴–۷۲ | وعدهٔ «ظرفِ N ساعت» در چیپ/SnackBar |
| `spinsPerDailyThreshold` | ۱ | ۱–۵ | ضریبِ «هر آستانه = چند چرخش» در صفحهٔ دعوت و گردونه |

قاعدهٔ فول‌بک، بدونِ استثنا:

> **فول‌بک باید دقیقاً برابرِ «مقدارِ امروزِ محصول» باشد** (`RULE_DEFS.value`).
> نه کم‌تر، نه «یه عددِ امن». اگر روزی `reviewSlaHours` را ۳۶ کنید و فول‌بک
> روی ۲۴ بماند، در قطعیِ شبکه، کاربرِ واقعی عددِ ۲۴ را می‌بیند در حالی که
> تعهدِ سرور ۳۶ است — یعنی دروازهٔ بازِ دروغ.

گارد این برابری را از هر دو کلاینت می‌سنجد و اگر فول‌بکِ وب با اندروید فرق
کند، قرمز می‌شود (سنجهٔ «فول‌بکِ مشترک‌ها واژه‌به‌واژه یکی است»).

`spinsPerDailyThreshold` دو بارِ عمدی دارد — در `referral.spinsPerDailyThreshold`
(که سرور می‌سازد) و در `rules`. کلاینت‌ها **از `rules`** می‌خوانند؛ این
انتخابِ آگاهانه است، چون `referral` از مسیرِ `rules` ساخته می‌شود و اگر
سرورِ قدیمی آن فیلد را نداشت، دو کلاینت باز هم یک عدد می‌دیدند.

---

## ۳) استثناهایِ طرح (چیزی که عمداً وصل نشده)

این‌ها **بدهی نیستند**؛ تصمیم‌اند، و در گارد تحتِ `EXEMPT_ONE_SIDE` ثبت شده‌اند
(گاردها اگر روزی آن رشته *در آن کلاینت ظاهر شود*، خودِ استثنا را با «کهنه»
شدن قرمز می‌کنند — تا فهرست، محلِ پنهان‌کردنِ باگ نشود):

| کلید | کلاینتِ محروم | چرا |
|---|---|---|
| `plus.monthlyBadge` | اندروید | کارتِ پلنِ اندروید به‌طورِ تاریخی نشانِ «روز» ندارد؛ اضافه‌کردنش یعنی **عوض‌شدنِ طرح**، و بندِ «طرحِ کاربر عوض نشود» قطعی است. |
| `streak.webDone` | اندروید | نوارِ اندروید دو خطِ فشرده است، وب یک جملهٔ کامل؛ هر دو از یک ردیفِ سرور تغذیه می‌شوند، پس واژه یکی است و چیدمان نه. |
| `streak.cycleDone` / `cycleNext` | وب | دلیلِ معکوسِ همین. |
فهرستِ بالا دقیقاً همان چهار ردیفِ `EXEMPT_ONE_SIDE` است، نه کمتر و نه بیشتر. گاردها از دو سو مراقبش‌اند: اگر ردیفی کهنه شود (کلید از سرور حذف شود) قرمز می‌شود، و اگر روزی رشته در آن کلاینت ظاهر شود، ردیفِ استثنا باید دستی پاک شود — پس این جدول محلِ پنهان‌کردنِ باگ نیست.

مواردی که این‌جا **نیستند**، استثنا نیستند؛ بدهی‌اند. امروز در هر دو کلاینت سفت‌شده مانده: `support.ticketRule`، `support.attachmentsFull`، `support.privacyTitle`/`privacySections` و `plus.benefitsNote`. وصل‌کردنِ این چهار تا طرح را عوض نمی‌کند، پس باید در فاز ۳/۴ بسته شوند نه اینکه به این جدول اضافه شوند.

---

## ۴) اگر می‌خواهید رشتهٔ تازه‌ای وصل کنید (چک‌لیستِ هفت قدم)

۱. **در `DEFAULT_COPY` قالب بگذارید** — بیِش از هر کارِ کلاینتی.
   رشته‌ای که جای‌نگهدار دارد، ردیفِ `COPY_CONTRACT` هم لازم دارد؛
   اگر بی‌ردیف بگذارید، `testLiveContent.js` قرمز می‌شود و درسته قرمز می‌شود.
۲. **اگر عددی در متن می‌آید که *منطق* هم به آن نیاز دارد، آن را به
   `RULE_DEFS` بدهید** (با بازهٔ امنِ برحسبِ واقعیتِ کد، نه بازهٔ آرزویی:
   `memoryPairs` را ۴–۸ گرفتیم چون `_makeDeck` برای جفت‌هایِ فرد کارتِ
   یک‌تنه می‌سازد و بردِ ۹×۵ روی گوشی می‌سوزد).
۳. **اول سرور، بعد کلاینت‌ها، در آخر پنل.** به همین ترتیب. اگر برعکس کنید،
   چند دقیقه پنلی دارید که فیلدش را هیچ کلاینتی نمی‌خواند و هیچ گاردی
   نمی‌بیند.
۴. **جای‌نگهدارها را از `COPY_CONTRACT` کپی کنید، نه از حافظه.** `text()`
   در برابرِ نامِ غلط خطا نمی‌دهد؛ کلِ جمله را از فول‌بک می‌سازد و شما یک
   «سبزِ کور» دارید. (این باگ، نسخهٔ اولِ `coinGuide.quota` را ماه‌ها
   زنده نگه داشت.)
۵. **در اندروید `const` نسازید.** `const Text(...)` و `const [TextSpan]`
   نمی‌توانند `liveText()` صدا کنند؛ `const` را بردارید.
۶. **فول‌بکِ هر دو کلاینت واژه‌به‌واژه یکی باشد** (برای کلیدهایی که جای‌نگهدار
   ندارند). در وب `text()`، در اندروید رشتهٔ پیش‌فرضِ `liveText()`.
   وگرنه در قطعیِ شبکه دو پلتفرم دو جملهٔ متفاوت می‌گویند.
۷. **گاردها را محلی بگیرید و به *منطقِ خودِ گارد* هم شک کنید:**

```bash
cd userweb && node tool/live-copy-parity.mjs && node tool/coin-parity.mjs && npm run build
cd backend  && node scripts/testLiveContent.js && node scripts/testLiveWiring.js
```

> اگر گارد قرمز شد، **اول** با یک پروبِ کوچک ثابت کنید که گارد دارد درست
> می‌خواند (یک فراخوانیِ شناخته‌شده را جداگانه پارس کنید). گاردی که خودِ
> مینی‌پارسرش با `…` داخل template-literal می‌جنگد، کارِ جعلی تولید می‌کند:
> یعنی شما می‌روید کدِ درست را عوض می‌کنید تا ابزار راضی شود — و این
> ممنوع‌ترین جهتِ کار در این پروژه است. این دقیقاً همان چیزی بود که در
> شش نسخهٔ پیاپیِ پارسرِ `live-copy-parity.mjs` اتفاق افتاد.

---

## ۵) چه چیزی *وصل نمی‌شود* (و چرا این فهرست مهم است)

- **جمله‌هایِ غنیِ RichText/`TextSpan` با `<b>` و بدونِ جای‌نگهدار** —
  وصل‌کردنشان یعنی یا ریختنِ HTML در `RichText` (کدِ شکننده) یا از دست
  دادنِ بولد. تا وقتی رشته‌ای جای‌نگهدار ندارد، سفت ماندنش *بدهیِ طرح* است،
  نه بدهیِ پنل. (تصمیمِ قطعیِ فاز ۲.)
- **`DECK_SIZE` دوئل = ۵** — منطقِ بازی، متنش زنده است.
- **ساعتِ ریستِ گردونه** — منطقِ سرور؛ به‌جز آن یک جمله، چیزی به کلاینت
  داده نمی‌شود.
- **سقفِ OTP و محدودیتِ نرخِ ورود** — در پنلِ این بخش **فقط‌خواندنی‌اند**؛
  تغییرشان درِ حمله است، نه امکانات.
- **رقمِ فارسی در فول‌بک‌ها**: مجاز است اگر همان رقم در قالبِ سرور هم باشد.
  گارد، رقمِ فول‌بکِ بی‌قرارداد را می‌گیرد («هیچ رقمِ سفت‌شده‌ای در
  فول‌بک‌ها نمانده که پنل نداند»). رقمِ بازار (`۴`) در متنِ UI ممنوع است؛
  `۴`ِ فارسیِ استاندارد، آری — و هیچ‌وقت دستی نوشته نمی‌شود، از `fa()`/`faNum()`
  می‌آید.

---

## ۶) بازگشتِ تغییرات

هر `PATCH` روی `live_copy`/`live_rules` یک ردیف در `live_content_history`
می‌گذارد و `POST /admin/settings/live-content/history/:key/revert` همان کلید
 را به مقدارِ قبلی برمی‌گرداند (audited). در UI پنل هم دکمهٔ «بازگردانیِ آخرین
 تغییر» هست. تا امروز `live_content_history` خالی است، یعنی هنوز ادمینی
 دستی چیزی عوض نکرده — و این یعنی **تستِ ۲۰ تغییرِ پنل هنوز با دادهٔ واقعی
 انجام نشده است**؛ این بندِ پذیرش، نه این سند.
