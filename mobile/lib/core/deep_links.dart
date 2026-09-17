// دریافتِ لینکِ دعوتِ اتاق خصوصی.
//
// ── چرا این فایل هست ──────────────────────────────────────────────────
// لینک دعوت (private_match_dialog) یک نشانی https روی دامنهٔ وب بود؛ دوستی
// که خودش اپ نصب داشت هم با کلیک به مرورگر می‌افتاد، نه داخل اپ. حالا
// مانیفست (tool/patch_android.sh) هم scheme اختصاصی `ghelgheli://join`
// و هم دامنهٔ وب را به MainActivity وصل می‌کند؛ اینجا آن لینک‌ها را به
// یک «کد اتاق در انتظار» تبدیل می‌کنیم.
//
// منطق عمداً یک‌خطی و بدون وابستگی به صفحه‌هاست:
//   • اپ از حالت سرد باز شد → getInitialJoin() کد را می‌دهد و پاکش می‌کند؛
//   • اپ باز بود و لینک رسید → استریمِ [joins] کد را می‌دهد.
// صفحهٔ بازی‌ها (games_page) این کد را می‌خواند، دیالوگ اتاق خصوصی را
// با همان کد باز می‌کند و join می‌زند.
//
// اگر پکیج app_links در دسترس نبود (یا خطای پلتفرمی پیش آمد)، کل لایه
// بی‌صدا غیرفعال می‌شود — لینک وب مثل قبل در مرورگر کار می‌کند.
import 'dart:async';

import 'package:app_links/app_links.dart';

/// دامنهٔ وبی که متنِ دعوت و لینکِ اتاق روی آن ساخته می‌شود.
///
/// همان کلیدِ `--dart-define=PUBLIC_WEB_URL` که `share_invite.dart` استفاده
/// می‌کند؛ پس با تغییرِ یک متغیر در CI، اپ به دامنهٔ نو منتقل می‌شود.
const String _publicWebUrlDefine = String.fromEnvironment(
  'PUBLIC_WEB_URL',
  defaultValue: 'https://user.ghelghelishop.ir',
);

/// دامنه‌هایی که لینکِ https آن‌ها داخلِ اپ پذیرفته می‌شود.
///
/// ⚠️ چرا فهرست و نه یک دامنه: مالک در حالِ انتقال به یک دامنهٔ `.com` است.
/// اگر فقط دامنهٔ نو پذیرفته شود، لینک‌های نصب‌شده/قدیمی می‌شکنند؛ اگر فقط
/// دامنهٔ قدیمی بماند، لینکِ نو داخلِ اپ باز نمی‌شود. پس هر دو پذیرفته
/// می‌شوند: دامنهٔ فعلی از تنظیماتِ بیلد، و دامنهٔ تاریخی همیشه.
const List<String> _legacyWebHosts = <String>[
  'ghelghelishop.ir',
  'user.ghelghelishop.ir',
  'www.ghelghelishop.ir',
];

final Set<String> _webHosts = _collectWebHosts();

Set<String> _collectWebHosts() {
  final hosts = <String>{..._legacyWebHosts};
  final uri = Uri.tryParse(_publicWebUrlDefine.trim());
  final host = uri?.host.toLowerCase() ?? '';
  if (host.isNotEmpty) {
    hosts.add(host);
    if (!host.startsWith('www.')) hosts.add('www.$host');
  }
  return hosts;
}

class PendingRoomJoin {
  const PendingRoomJoin({required this.roomCode, this.gameId});
  final String roomCode;
  final String? gameId;
}

class DeepLinks {
  DeepLinks._();
  static final DeepLinks instance = DeepLinks._();

  PendingRoomJoin? _initial;
  final StreamController<PendingRoomJoin> _controller =
      StreamController<PendingRoomJoin>.broadcast();
  bool _started = false;

  /// لینک‌هایی که وقتی اپ از قبل باز است می‌رسند.
  Stream<PendingRoomJoin> get joins => _controller.stream;

  PendingRoomJoin? _parse(Uri? uri) {
    if (uri == null) return null;
    String? room;
    String? game;
    // ghelgheli://join?room=1234&game=memory
    if (uri.scheme == 'ghelgheli' && uri.host == 'join') {
      room = uri.queryParameters['room'];
      game = uri.queryParameters['game'];
    } else if (uri.scheme == 'https' &&
        _webHosts.contains(uri.host.toLowerCase()) &&
        uri.queryParameters.containsKey('room')) {
      // https://user.ghelghelishop.ir/?game=card_duel&room=1234
      room = uri.queryParameters['room'];
      game = uri.queryParameters['game'];
    }
    if (room == null || room.trim().isEmpty) return null;
    return PendingRoomJoin(roomCode: room.trim(), gameId: game);
  }

  /// یک‌بار در شروع اپ صدا زده می‌شود.
  Future<void> start() async {
    if (_started) return;
    _started = true;
    try {
      final links = AppLinks();
      final initialUri = await links.getInitialLink();
      _initial = _parse(initialUri);
      links.uriLinkStream.listen((uri) {
        final join = _parse(uri);
        if (join != null) _controller.add(join);
      }, onError: (_) {/* لینک نامعتبر — بی‌خیال */});
    } catch (_) {
      // پلتفرم پشتیبانی نکرد: وب مسیر جایگزین است.
    }
  }

  /// کد اتاقی که اپ باهاش از حالت سرد باز شد (یک‌بار مصرف).
  Future<PendingRoomJoin?> consumeInitialJoin() async {
    final value = _initial;
    _initial = null;
    return value;
  }
}
