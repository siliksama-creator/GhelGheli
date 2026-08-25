/// خواندنِ امن از JSON شبکه.
///
/// `jsonDecode` / Dio همیشه کلید را **رشته** می‌سازند (`"100"`). در Dart
/// `map[100]` با `map['100']` یکی نیست — برخلاف جاوااسکریپت. اگر با کلیدِ
/// عددی بخوانیم، مقدارِ زنده‌ای که ادمین در پنل گذاشته **بی‌صدا null**
/// می‌شود و کلاینت به پیش‌فرض برمی‌گردد. کاربرِ اندروید عددی می‌بیند که
/// وب همان لحظه چیز دیگری نشان می‌دهد.
///
/// این تابع هر دو شکل را می‌پذیرد تا یک منبعِ حقیقت برای همه‌ی نقشه‌های
/// اقتصاد (سکه، سهمیه، پاداشِ راند) بماند.
dynamic jsonGet(Map? map, Object key) {
  if (map == null) return null;
  if (map.containsKey(key)) return map[key];
  final asStr = '$key';
  if (map.containsKey(asStr)) return map[asStr];
  final asInt = int.tryParse(asStr);
  if (asInt != null && map.containsKey(asInt)) return map[asInt];
  return null;
}

Map<String, dynamic> jsonMap(dynamic value) {
  if (value is Map) return Map<String, dynamic>.from(value);
  return <String, dynamic>{};
}
