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

  /// زیرتبِ جاریِ «چت و بازی» — تور باید بتواند ماموریت/گذر نبرد را نشان
  /// دهد و آن صفحه به state خودش دسترسی از بیرون نمی‌دهد.
  ///
  /// چرا `ValueNotifier` جدا و نه `notifyListeners` سراسری: `requestReplay`
  /// نباید هر بار زیرتبِ کاربر را هم عوض کند؛ دو موضوعِ متفاوت‌اند.
  final ValueNotifier<int?> socialTab = ValueNotifier<int?>(null);

  /// نامِ زیرتب (همان idهای وب) → شمارهٔ زیرتبِ صفحهٔ اجتماعی.
  static const Map<String, int> _socialIndex = <String, int>{
    'chat': 0,
    'games': 1,
    'growth': 2,
    'pass': 3,
  };

  void setSocialTab(String name) {
    final i = _socialIndex[name];
    if (i != null) socialTab.value = i;
  }

  /// «دوباره ببین» — لایهٔ تور به این گوش می‌دهد و از بخشِ اول شروع می‌کند.
  void requestReplay() {
    _replayTick += 1;
    notifyListeners();
  }
}

/// گرفتنِ وضعیتِ تور از سرور. خطا هرگز پرتاب نمی‌شود — تور تجربهٔ اصلی نیست.
Future<TourData?> fetchTour(ApiClient api) async {
  try {
    final raw = await api.get('/api/onboarding');
    return TourData.fromJson(raw);
  } catch (e) {
    debugPrint('[tour] خواندنِ وضعیتِ آموزش ناموفق: $e');
    return null;
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
