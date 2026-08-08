// شبکهٔ ایمنیِ سراسریِ خطا.
//
// ═══════════════════════════════════════════════════════════════════════════
// چه چیزی بدون این اتفاق می‌افتاد
// ═══════════════════════════════════════════════════════════════════════════
//
// فلاتر دو مسیرِ کاملاً جدا برای خطا دارد و اپ هیچ‌کدام را پوشش نداده
// بود:
//
//   ۱. **خطای داخل build/layout/paint** → فلاتر یک `ErrorWidget` رسم
//      می‌کند. در دیباگ این همان صفحهٔ قرمزِ معروف است؛ در **ریلیز** یک
//      مستطیلِ خاکستریِ خالی است بدون هیچ متنی. کاربر یک صفحهٔ خالی
//      می‌بیند و هیچ راهی برای ادامه ندارد — نه دکمه‌ای، نه توضیحی.
//      دقیقاً همان چیزی که با باگ «کادر خالیِ بزرگ با حاشیهٔ طلایی» در
//      گذر نبرد دیده شد.
//
//   ۲. **استثنای مدیریت‌نشدهٔ غیرهمگام** (یک Future رهاشده که reject
//      می‌کند) → هیچ اتفاقی روی صفحه نمی‌افتد. خطا در لاگ گم می‌شود و
//      کاربر فقط می‌بیند که «چیزی کار نکرد».
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا صفحهٔ خطا این شکلی است
// ═══════════════════════════════════════════════════════════════════════════
//
// دو اصل:
//
//   • **همیشه یک راه خروج بده.** یک صفحهٔ خطا بدون دکمه، از خودِ کرش
//     بدتر است: کاربر گیر می‌افتد و تنها کارش بستنِ اجباریِ اپ است.
//   • **جزئیاتِ فنی را پنهان کن ولی دور نینداز.** پیامِ خام برای کاربر
//     بی‌معنی و ترسناک است، ولی وقتی همان کاربر تیکت پشتیبانی می‌زند،
//     تنها سرنخِ ماست. پس زیر یک بخشِ جمع‌شده می‌ماند.
//
// هیچ سرویسِ گزارشِ کرشِ بیرونی (Crashlytics/Sentry) اینجا وصل نشده و
// این عمدی است: افزودنش یعنی یک SDK دیگر در APK و یک مسیرِ تازه برای
// خروج دادهٔ کاربر. وقتی واقعاً لازم شد، `onError` تنها جایی است که
// باید عوض شود.

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// یک صفحهٔ خطای فارسی و آبرومند، به‌جای مستطیلِ خاکستریِ فلاتر.
///
/// StatefulWidget است چون بخشِ «جزئیات فنی» باز و بسته می‌شود و این
/// حالت باید جایی نگه داشته شود. عمداً از `ExpansionTile` استفاده
/// **نمی‌شود** — دلیلش در `_DetailsPanel` توضیح داده شده.
class AppErrorView extends StatefulWidget {
  const AppErrorView({
    super.key,
    required this.details,
    this.onRetry,
  });

  final FlutterErrorDetails details;
  final VoidCallback? onRetry;

  @override
  State<AppErrorView> createState() => _AppErrorViewState();
}

class _AppErrorViewState extends State<AppErrorView> {
  bool _showDetails = false;

  @override
  Widget build(BuildContext context) {
    // ═══════════════════════════════════════════════════════════════════
    // چرا اینجا به Theme.of(context) تکیه نمی‌کنیم
    // ═══════════════════════════════════════════════════════════════════
    //
    // این ویجت دقیقاً وقتی رسم می‌شود که چیزی در درخت شکسته است. اگر
    // خودِ آن شکستگی در MaterialApp یا Theme باشد، `Theme.of` یا
    // پرتاب می‌کند یا مقدارِ پیش‌فرضِ بی‌ربط می‌دهد — یعنی صفحهٔ خطا
    // هم می‌شکند و کاربر باز همان مستطیلِ خاکستری را می‌بیند.
    //
    // پس همه‌چیز اینجا خودکفاست: رنگ‌های ثابت، `Directionality` صریح،
    // و هیچ وابستگی به بالادست.
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Material(
        color: const Color(0xFF0B1220),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.sentiment_dissatisfied_rounded, size: 56),
                  const SizedBox(height: 16),
                  const Text(
                    'یک مشکل پیش آمد',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'این بخش درست بالا نیامد. می‌توانی دوباره تلاش کنی '
                    'یا به صفحهٔ قبل برگردی.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 14, color: Colors.white70),
                  ),
                  const SizedBox(height: 24),
                  if (widget.onRetry != null)
                    FilledButton.icon(
                      onPressed: widget.onRetry,
                      icon: const Icon(Icons.refresh_rounded),
                      label: const Text('تلاش دوباره'),
                      style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF38BDF8),
                        foregroundColor: const Color(0xFF06263A),
                        minimumSize: const Size(200, 48),
                      ),
                    ),
                  const SizedBox(height: 20),
                  // جزئیاتِ فنی: جمع‌شده، ولی در دسترسِ کسی که تیکت
                  // می‌زند. در ریلیز هم نگه داشته می‌شود چون تنها
                  // سرنخِ عیب‌یابیِ گزارشِ کاربر است.
                  _DetailsPanel(
                    open: _showDetails,
                    text: '${widget.details.exception}',
                    onToggle: () =>
                        setState(() => _showDetails = !_showDetails),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// همهٔ مسیرهای خطای فلاتر را به یک نقطه می‌آورد.
///
/// باید **پیش از** `runApp` صدا زده شود.
void installErrorHandlers() {
  // ── مسیر ۱: خطای درختِ ویجت ──
  //
  // به‌جای مستطیلِ خاکستری، صفحهٔ فارسیِ بالا. `ErrorWidget.builder`
  // در هر دو حالت دیباگ و ریلیز اعمال می‌شود.
  ErrorWidget.builder = (FlutterErrorDetails details) {
    // در دیباگ، خطای کامل را هم روی کنسول نگه دار — توسعه‌دهنده باید
    // استک‌تریس را ببیند، نه فقط یک صفحهٔ زیبا.
    if (kDebugMode) {
      FlutterError.dumpErrorToConsole(details);
    }
    return AppErrorView(details: details);
  };

  // ── مسیر ۲: گزارشِ خطاهای فریم‌ورک ──
  //
  // `presentError` رفتار پیش‌فرض است (چاپ روی کنسول). نگهش می‌داریم و
  // فقط یک قلابِ خودمان اضافه می‌کنیم، تا لاگِ عادی از دست نرود.
  final previous = FlutterError.onError;
  FlutterError.onError = (FlutterErrorDetails details) {
    previous?.call(details);
    _report('flutter', details.exception, details.stack);
  };

  // ── مسیر ۳: استثنای غیرهمگامِ خارج از فلاتر ──
  //
  // یک Future رهاشده که reject می‌کند اینجا می‌آید. بدون این، خطا
  // کاملاً بی‌صدا گم می‌شود. `true` یعنی «مدیریت شد» تا پروسه کشته
  // نشود — کاربری که وسط بازی است نباید به‌خاطر یک درخواستِ ناموفقِ
  // پس‌زمینه اپش بسته شود.
  PlatformDispatcher.instance.onError = (error, stack) {
    _report('platform', error, stack);
    return true;
  };
}

/// تک‌نقطهٔ گزارشِ خطا.
///
/// امروز فقط روی کنسول می‌نویسد. وقتی روزی سرویسِ گزارشِ کرش اضافه شد،
/// **این تنها تابعی است که باید عوض شود** — نه ده جای پراکنده.
void _report(String source, Object error, StackTrace? stack) {
  debugPrint('[$source] خطای مدیریت‌نشده: $error');
  if (stack != null && kDebugMode) {
    debugPrintStack(stackTrace: stack, maxFrames: 12);
  }
}

/// بخشِ «جزئیات فنی» — عمداً بدون هیچ ویجتِ Material که به
/// Localizations نیاز داشته باشد.
///
/// ═══════════════════════════════════════════════════════════════════════════
/// چرا ExpansionTile استفاده نشد — یک باگِ واقعی که تست گرفت
/// ═══════════════════════════════════════════════════════════════════════════
///
/// نسخهٔ اول `ExpansionTile` داشت. تست «بدون MaterialApp رسم می‌شود»
/// شکست خورد با:
///
///     No MaterialLocalizations found.
///     AnimatedBuilder widgets require MaterialLocalizations ...
///
/// یعنی دقیقاً همان فاجعه‌ای که این صفحه قرار بود جلویش را بگیرد:
/// اگر خودِ `MaterialApp` بشکند — که یکی از محتمل‌ترین دلایلِ رسیدنِ
/// کاربر به این صفحه است — آن‌وقت **صفحهٔ خطا هم می‌شکند** و کاربر باز
/// همان مستطیلِ خاکستری را می‌بیند.
///
/// درسش این است که یک صفحهٔ خطا باید تقریباً هیچ وابستگی‌ای نداشته
/// باشد. اینجا فقط `GestureDetector`، `Text` و `DecoratedBox` به کار
/// رفته که هیچ‌کدام به Localizations یا Theme نیاز ندارند.
class _DetailsPanel extends StatelessWidget {
  const _DetailsPanel({
    required this.open,
    required this.text,
    required this.onToggle,
  });

  final bool open;
  final String text;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onTap: onToggle,
          behavior: HitTestBehavior.opaque,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'جزئیات فنی',
                  style: TextStyle(fontSize: 12, color: Colors.white38),
                ),
                const SizedBox(width: 4),
                Icon(
                  open
                      ? Icons.keyboard_arrow_up_rounded
                      : Icons.keyboard_arrow_down_rounded,
                  size: 16,
                  color: Colors.white38,
                ),
              ],
            ),
          ),
        ),
        if (open)
          DecoratedBox(
            decoration: const BoxDecoration(color: Colors.black26),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                text,
                style: const TextStyle(
                  fontSize: 11,
                  color: Colors.white54,
                  fontFamily: 'monospace',
                ),
              ),
            ),
          ),
      ],
    );
  }
}
