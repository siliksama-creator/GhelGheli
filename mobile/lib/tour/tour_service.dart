// ══════════════════════════════════════════════════════════════════════════
// آموزشِ صوتیِ قلقلی — داده و وضعیت (سمتِ اندروید)
// ══════════════════════════════════════════════════════════════════════════
// متن و ترتیبِ بخش‌ها روی **سرور** است (`GET /api/onboarding`) — همان قاعدهٔ
// وب و همان قراردادِ `live-config-contract.md`: کلاینت متن نمی‌سازد. فایده‌اش
// برای اپ دو چندان است: اصلاحِ یک کلمه در متن، نه آپدیتِ اجباریِ APK
// می‌خواهد و نه انتشار در بازار.
//
// مسیرِ صدا هم همان `/api/onboarding/audio/<file>` است؛ چرا زیرِ `/api` و نه
// `/public`: روی همهٔ میزبان‌ها (وب، پنل، دامنهٔ api و اپ) پروکسی است — همان
// باگی که یک بار صدا را در وب خفه کرد.
import 'dart:async';

import 'package:flutter/foundation.dart';

import '../api_client.dart';

/// یک بخشِ آموزش.
class TourStep {
  const TourStep({
    required this.id,
    required this.title,
    required this.text,
    required this.audioUrl,
    required this.audioReady,
  });

  final String id;
  final String title;
  final String text;

  /// مسیرِ **نسبی** (مثل `/api/onboarding/audio/01-home.mp3`)؛ همین را به
  /// کلاینت می‌دهیم تا baseUrl خودش را بگذارد.
  final String audioUrl;

  /// اگر سرور بگوید صدا آماده نیست (یا متن عوض شده و صدا کهنه است)، اپ
  /// **هرگز** صدای ناهم‌خوان پخش نمی‌کند و متن را نشان می‌دهد.
  final bool audioReady;

  static TourStep? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final id = raw['id'];
    if (id is! String || id.isEmpty) return null;
    return TourStep(
      id: id,
      title: raw['title'] is String ? raw['title'] as String : id,
      text: raw['text'] is String ? raw['text'] as String : '',
      audioUrl: raw['audioUrl'] is String ? raw['audioUrl'] as String : '',
      audioReady: raw['audioReady'] != false,
    );
  }
}

/// پاسخِ `/api/onboarding`.
class TourData {
  const TourData({
    required this.enabled,
    required this.seen,
    required this.version,
    required this.steps,
  });

  final bool enabled;
  final bool seen;
  final int version;
  final List<TourStep> steps;

  static TourData? fromJson(Object? raw) {
    if (raw is! Map) return null;
    final list = raw['steps'];
    if (list is! List) return null;
    final steps = list
        .map(TourStep.fromJson)
        .whereType<TourStep>()
        .toList(growable: false);
    if (steps.isEmpty) return null;
    return TourData(
      enabled: raw['enabled'] != false,
      seen: raw['seen'] == true,
      version: raw['version'] is num ? (raw['version'] as num).toInt() : 1,
      steps: steps,
    );
  }
}

/// نگه‌دارندهٔ وضعیتِ تور برای بیرونِ لایه (پروفایل → «دوباره ببین»).
///
/// چرا `ChangeNotifier` سراسری و نه prop: دکمهٔ «دوباره ببین» در صفحهٔ
/// پروفایل است و لایهٔ تور در شلِ خانه؛ رساندنِ یک تابع از آن‌جا به این‌جا
/// یعنی زنجیرهٔ prop تا عمقِ پنج‌شش سطح. یک اعلانِ کوچک همان کار را می‌کند
/// و دقیقاً آینهٔ رویدادِ `gg:tour-replay` وب است.
class TourBus extends ChangeNotifier {
  TourBus._();

  static final TourBus instance = TourBus._();

  int _replayTick = 0;
  int get replayTick => _replayTick;

  /// پلِ زیرتبِ «چت و بازی» — خودِ صفحهٔ اجتماعی این‌جا ثبت می‌کند.
  ///
  /// چرا **callback** و نه `ValueNotifier`: نوتیفایرِ مقداری وقتی مقدار
  /// عوض نشود خبر نمی‌دهد. بارِ اول تور «بازی‌ها» را انتخاب می‌کند (مقدار
  /// ۱ می‌شود)؛ اگر کاربر بعداً دستی به «چت» برگردد، مقدارِ نوتیفایر همچنان
  /// ۱ است — پس دفعهٔ دوم هیچ خبری نمی‌رسد، زیرتب جابه‌جا نمی‌شود، لنگرِ
  /// شبکهٔ بازی‌ها پیدا نمی‌شود و تور به جانشینِ کم‌دقت می‌افتد. این باگِ
  /// «بارِ دوم کار نمی‌کند» را همین‌جا بستیم.
  void Function(int index)? socialTabHandler;

  /// نامِ زیرتب (همان idهای وب) → شمارهٔ زیرتبِ صفحهٔ اجتماعی.
  static const Map<String, int> _socialIndex = <String, int>{
    'chat': 0,
    'games': 1,
    'growth': 2,
    'pass': 3,
  };

  void setSocialTab(String name) {
    final i = _socialIndex[name];
    if (i != null) socialTabHandler?.call(i);
  }

  /// «دوباره ببین» — لایهٔ تور به این گوش می‌دهد و از بخشِ اول شروع می‌کند.
  void requestReplay() {
    _replayTick += 1;
    notifyListeners();
  }
}

/// نتیجهٔ خواندنِ وضعیت — با این تفکیک که «ارزشِ تلاشِ دوباره دارد یا نه».
///
/// چرا جدا از خودِ داده: تلاشِ دوباره فقط برای خطاهای **گذرا** معنا دارد.
/// اگر سرور بگوید ۴۰۴ (مثلاً روت هنوز مستقر نشده) یا ۴۰۳، دفعهٔ دوم هم
/// همان جواب را می‌دهد؛ تلاشِ دوباره فقط ترافیک و لاگِ الکی است.
///
/// این تفکیک از یک شکستِ واقعیِ تست آمد: تستِ «هر صفحه فقط یک بار داده
/// می‌گیرد» دید که `/api/onboarding` دو بار صدا زده می‌شود — چون شبیه‌سازِ
/// تست ۴۰۴ می‌داد و ما بی‌قید تلاش می‌کردیم.
class TourFetch {
  const TourFetch({this.data, this.retryable = false});

  final TourData? data;

  /// خطا گذرا بود (تایم‌اوت/قطعِ شبکه/۵xx/۴۲۹)؟ فقط این‌جا تلاشِ دوباره.
  final bool retryable;
}

/// گرفتنِ وضعیتِ تور از سرور. خطا هرگز پرتاب نمی‌شود — تور تجربهٔ اصلی نیست.
Future<TourFetch> fetchTour(ApiClient api) async {
  try {
    final raw = await api.get('/api/onboarding');
    final data = TourData.fromJson(raw);
    if (data == null) {
      // سرور جواب داد ولی شکلی نداد که بشود با آن کار کرد (بدنهٔ ۴۰۴ یا
      // طرحِ عوض‌شده). تلاشِ دوباره بی‌فایده است.
      debugPrint('[tour] پاسخِ سرور برای آموزش قابلِ استفاده نبود');
      return const TourFetch();
    }
    return TourFetch(data: data);
  } catch (e) {
    debugPrint('[tour] خواندنِ وضعیتِ آموزش ناموفق: $e');
    return TourFetch(retryable: isTransient(e));
  }
}

/// ثبتِ «دیده شد» روی سرور (تا با عوض‌کردنِ گوشی، آموزش از اول شروع نشود).
Future<void> markTourSeen(ApiClient api, int version, {bool skipped = false}) async {
  try {
    await api.post('/api/onboarding/seen', <String, dynamic>{
      'version': version,
      'skipped': skipped,
    });
  } catch (e) {
    // ثبتِ پرچم نباید تجربه را بشکند؛ دفعهٔ بعد دوباره می‌پرسد.
    debugPrint('[tour] ثبتِ «دیده شد» ناموفق: $e');
  }
}
