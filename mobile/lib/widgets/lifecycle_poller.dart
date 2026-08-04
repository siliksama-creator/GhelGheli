// A polling timer that pauses while the app is in the background.
//
// The chat and league screens each ran a `Timer.periodic` that kept firing
// network requests even when the app was minimised — burning battery and
// mobile data for updates nobody could see. This helper ties the timer to
// the app lifecycle and refreshes immediately on resume so the user never
// looks at stale data.
//
// Implemented with a small internal listener rather than by mixing
// WidgetsBindingObserver into every screen: that interface grows new members
// between Flutter releases, and implementing it by hand breaks the build on
// each upgrade.
import 'dart:async';

import 'package:flutter/widgets.dart';

class _LifecycleBridge with WidgetsBindingObserver {
  _LifecycleBridge(this.onState);
  final void Function(AppLifecycleState) onState;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) => onState(state);
}

mixin LifecyclePoller<T extends StatefulWidget> on State<T> {
  Timer? _pollTimer;
  Duration _interval = const Duration(seconds: 10);
  Future<void> Function()? _onPoll;
  _LifecycleBridge? _bridge;
  bool _paused = false;

  /// Starts polling [action] every [interval] while the app is foregrounded.
  void startPolling(Duration interval, Future<void> Function() action) {
    _interval = interval;
    _onPoll = action;
    _bridge ??= _LifecycleBridge(_handleLifecycle);
    WidgetsBinding.instance.addObserver(_bridge!);
    _restart();
  }

  void stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
    final b = _bridge;
    if (b != null) WidgetsBinding.instance.removeObserver(b);
    _bridge = null;
  }

  void _restart() {
    _pollTimer?.cancel();
    final action = _onPoll;
    if (action == null) return;
    _pollTimer = Timer.periodic(_interval, (_) {
      if (!mounted || _paused) return;
      action();
    });
  }

  void _handleLifecycle(AppLifecycleState state) {
    final wasPaused = _paused;
    _paused = state != AppLifecycleState.resumed;
    if (_paused) {
      _pollTimer?.cancel();
      _pollTimer = null;
    } else if (wasPaused && mounted) {
      // Catch up straight away, then resume the normal cadence.
      //
      // خطای این فراخوانی عمداً بلعیده می‌شود: این یک تازه‌سازیِ
      // خودکار در پس‌زمینه است و اگر شبکه در لحظهٔ برگشت به اپ در
      // دسترس نباشد، نباید به کاربر خطا نشان دهیم — تیکِ بعدی خودش
      // دوباره تلاش می‌کند. بدون این catch، یک استثنای مدیریت‌نشده
      // به zone می‌رفت.
      final f = _onPoll?.call();
      if (f != null) unawaited(f.catchError((_) {}));
      _restart();
    }
  }

  /// ═════════════════════════════════════════════════════════════════════
  /// شبکهٔ ایمنی: حتی اگر صفحه‌ای `stopPolling()` را فراموش کند
  /// ═════════════════════════════════════════════════════════════════════
  ///
  /// mixin قبلی کاملاً به این تکیه می‌کرد که هر صفحهٔ استفاده‌کننده،
  /// خودش در `dispose()` تمیزکاری کند. امروز هر سه استفاده‌کننده این
  /// کار را می‌کنند — ولی این یک قرارداد نانوشته است که چهارمین صفحه
  /// به‌راحتی می‌شکندش، و شکستنش **بی‌صدا** است:
  ///
  ///   • تایمر تا ابد هر ۱۰ ثانیه یک درخواست شبکه می‌زند،
  ///   • ناظرِ چرخهٔ عمر در `WidgetsBinding` می‌ماند و کلِ State و
  ///     درختِ ویجتِ مرده را زنده نگه می‌دارد،
  ///   • و چون `mounted` داخل تیک بررسی می‌شود، هیچ خطایی هم دیده
  ///     نمی‌شود. فقط اپ کم‌کم کند و پرمصرف می‌شود.
  ///
  /// با override کردنِ `dispose` در خودِ mixin، تمیزکاری تضمینی می‌شود
  /// و فراخوانیِ دستیِ `stopPolling()` در صفحه‌ها بی‌ضرر (idempotent)
  /// باقی می‌ماند.
  @override
  void dispose() {
    stopPolling();
    super.dispose();
  }
}
