/// خواندن امن از JSON سرور.
///
/// Dio بدنه را به‌صورت `Map<String, dynamic>` می‌دهد. تبدیلِ یک‌جای حدود
/// ۳۰۰ صفحه به مدلِ typed در یک دپلوی، اپ را می‌شکند — مسیر درست این است
/// که مرز API همین‌جا خوانده شود و صفحات به‌تدریج مدل بگیرند.
Map<String, Object?> asJsonMap(Object? raw) {
  if (raw is Map<String, Object?>) return raw;
  if (raw is Map) {
    return raw.map((k, v) => MapEntry(k.toString(), v));
  }
  return const <String, Object?>{};
}

String jsonStr(Object? raw, String key, [String fallback = '']) {
  final v = asJsonMap(raw)[key];
  if (v == null) return fallback;
  return v.toString();
}

int jsonInt(Object? raw, String key, [int fallback = 0]) {
  final v = asJsonMap(raw)[key];
  if (v is int) return v;
  if (v is num) return v.toInt();
  return int.tryParse('$v') ?? fallback;
}
