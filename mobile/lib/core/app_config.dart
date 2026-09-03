// متن‌ها و اعدادِ زنده — منبعِ یکتای خواندنِ `/api/config` در اپ (فاز ۲).
//
// ═══════════════════════════════════════════════════════════════════════
// چرا این کلاس هست
// ═══════════════════════════════════════════════════════════════════════
//
// پیش از این `/api/config` در **هفت نقطهٔ پراکنده** از اپ زده می‌شد
// (home_shell، games_page، wheel_page، league_page، tap_screen،
// auth_screen، private_match_dialog) و هر صفحه فقط تکهٔ خودش را برمی‌داشت.
// نتیجه دو تا مشکل بود:
//
//   ۱. اگر fetchِ همان صفحه شکست می‌خورد، همان صفحه با متن/عددِ سفت‌شدهٔ
//      داخل APK می‌ماند — بدونِ هیچ نشانه‌ای. «اهرمِ بدون‌آپدیت» عملاً
//      برای آن صفحه کار نمی‌کرد.
//   ۲. هیچ‌کدام از متن‌های راهنما اصلاً از config نمی‌خواندند: «۵۰ لول»،
//      «۸ جفت»، «کد ۴ رقمی»، «۲۵ ثانیه»، «۱۰ مدل اختصاصی»، «چرخه ۷ روزه»
//      و «۱ چرخشِ» قانونِ دعوت داخل رشته‌ها نوشته شده بودند. افزودن یک
//      آواتار یا تغییر یک عدد یعنی بیلدِ APK و صفِ کافه‌بازار.
//
// این کلاس هر دو را حل می‌کند: **یک کشِ همگام** که هر صفحه‌ای می‌تواند
// بخواندش، و یک `ChangeNotifier` که وقتی config تازه می‌رسد، ویجت‌های
// گوش‌دهنده را بازسازی می‌کند.
//
// ═══════════════════════════════════════════════════════════════════════
// چرا «یک fetch اضافه» نمی‌سازد
// ═══════════════════════════════════════════════════════════════════════
//
// `apply()` همان بدنه‌ای را می‌گیرد که home_shell از قبل می‌گرفته است؛
// `ensure()` فقط وقتی خودش می‌زند که کش خالی باشد (مثلاً صفحه‌ای که مستقیم
// از deep-link باز شده). ApiClient هم پنجرهٔ ۱.۲ ثانیه‌ایِ حذفِ تکرار و
// ادغامِ در-flight دارد، پس چند `ensure()` هم‌زمان = یک درخواست.
// تستِ home_shell دقیقاً همین را می‌سنجد («هیچ مسیری بیش از دو بار»).
//
// ═══════════════════════════════════════════════════════════════════════
// قراردادِ فول‌بک (بند ۲ نقشه‌راه — غیرقابل‌انحنا)
// ═══════════════════════════════════════════════════════════════════════
//
// هر `text()` یک `fallback` می‌گیرد که **باید** عیناً همان رشته‌ای باشد که
// دیروز داخل فایل نوشته شده بود. سه دلیل:
//
//   • اولین رندر با امروزِ محصول واژه‌به‌واژه یکسان است؛ کاربر هیچ چیزی
//     را عوض‌شده نمی‌بیند مگر وقتی ادمین واقعاً چیزی را عوض کند.
//   • تست‌های فلاتر `find.text('…')` با رشتهٔ فارسی می‌زنند و شبکه ندارند؛
//     اگر فول‌بک فرق می‌داشت، ده‌ها تست بی‌دلیل قرمز می‌شدند.
//   • اگر config نرسد (آفلاین/سرور قدیمی)، رفتارِ امروز حفظ می‌شود.
//
// `text()` اگر **هر** جای‌نگهدارش پیدا نشود کلِ جمله را به فول‌بک می‌برد،
// نه فقط آن عدد را. «هر ۱۰ دعوت =  چرخش» بی‌عدد از جملهٔ دیروز بدتر است:
// کاربر فارسی‌زبان نمی‌فهمد چه چیزی کم است، ولی جملهٔ کاملِ دیروز را
// می‌فهمد. جای‌نگهدارِ خام (`{x}`) هم هرگز روی صفحه نمی‌آید.
// `ChangeNotifier` را `widgets.dart` هم صادر می‌کند؛ importِ
// `foundation.dart` بی‌مصرف بود. این فقط آرایش نبود: این پروژه در CI
// `flutter analyze --fatal-infos` می‌گیرد، پس هر هشدارِ بی‌مصرف هم
// شغل را قرمز می‌کند و یک بیلدِ سالم را بلوکه می‌کند.
import 'package:flutter/widgets.dart';

import '../api_client.dart';

/// متنِ زنده با جای‌نگهدارهای پرشده — شکلِ کوتاهِ `AppConfig.text`.
///
/// عمداً تابعِ آزاد است نه متد: صفحه‌ها داخل `build`‌هایشان به یک
/// `context` یا فیلدِ اضافی نیاز نداشته باشند.
String liveText(
  String key,
  String fallback, {
  Map<String, Object?> vars = const {},
}) =>
    AppConfig.instance.text(key, fallback, vars: vars);

/// عددِ ساختاریِ زنده از `live_rules` با فول‌بکِ برابرِ مقدارِ امروز.
int liveRule(String name, int fallback) =>
    AppConfig.instance.rule(name, fallback);

class AppConfig extends ChangeNotifier {
  AppConfig._();

  static final AppConfig instance = AppConfig._();

  static const String configPath = '/api/config';

  Map<String, dynamic>? _raw;
  ApiClient? _api;
  Future<void>? _pending;

  /// آماده یعنی چیزی از سرور رسیده (حتی اگر بعضی کلیدها نباشند).
  bool get ready => _raw != null;

  /// شمارهٔ نسلِ تنظیمات. برای لاگِ کرش/خطا — وقتی کاربر می‌گوید
  /// «متنم کهنه است»، همین عدد جواب می‌دهد با چه نسلی اجرا شده.
  int? get configVersion {
    final v = _raw?['configVersion'];
    return v is num ? v.toInt() : null;
  }

  /// اتصالِ ApiClientِ خودِ اپ (نه یک کلاینتِ تازه).
  ///
  /// چرا: یک کلاینتِ تازه یعنی یک کشِ ETag جدا و یک درخواستِ اضافه در هر
  /// اجرا — یعنی همان فشاری که `home_shell_perf_test` و `etag_cache_test`
  /// جلوی بازگشتش را گرفته‌اند.
  void attach(ApiClient api) {
    _api = api;
  }

  /// پرکردنِ کش از بدنه‌ای که از قبل در دست است (مسیرِ اصلیِ اپ).
  void apply(Object? body) {
    if (body is! Map) return;
    final m = Map<String, dynamic>.from(body);
    // یکسان‌بیننده = بی‌سر‌و‌صدا؛ config هر ۵ ثانیه هم بیاید درخت را
    // بازسازی نمی‌کند.
    if (_raw != null && mapEqualsDeep(_raw, m)) return;
    _raw = m;
    notifyListeners();
  }

  /// اگر کش خالی است، یک بار fetch می‌کند (ادغام‌شده در ApiClient).
  Future<void> ensure([ApiClient? api]) async {
    if (_raw != null) return;
    final client = api ?? _api;
    if (client == null) return; // بدون شبکه، فول‌بک‌ها کار می‌کنند.
    _pending ??= () async {
      try {
        apply(await client.get(configPath));
      } catch (_) {
        // خطای شبکه در اینجا **باید** بی‌صدا بماند: همه‌چیز فول‌بک دارد و
        // یک config نرسیده نباید صفحهٔ کاربر را با پیام خطا پر کند.
      } finally {
        _pending = null;
      }
    }();
    return _pending!;
  }

  /// تازه‌سازیِ اجباری — وقتی ادمین چیزی را در پنل عوض کرد و کاربر وسطِ
  /// استفاده است. مسیرِ داغِ خودش fetch نمی‌زند؛ این را `home_shell` در
  /// `resumed` صدا می‌زند (رفتارِ «برگشتن به اپ = تازه‌شدن»).
  Future<void> refresh() async {
    final client = _api;
    if (client == null) return;
    try {
      apply(await client.get(configPath, fresh: true));
    } catch (_) {}
  }

  Object? _at(String path) {
    final raw = _raw;
    if (raw == null) return null;
    Object? cur = raw;
    for (final seg in path.split('.')) {
      final m = cur;
      if (m is! Map) return null;
      cur = m[seg];
    }
    return cur;
  }

  /// اعدادِ ساختاریِ زنده (`live_rules`)؛ نبودِ سرور = فول‌بکِ همان عدد.
  int rule(String name, int fallback) {
    final v = _at('rules.$name');
    final n = v is num ? v.toInt() : null;
    return (n != null && n > 0) ? n : fallback;
  }

  /// متنِ زنده — توضیحِ قرارداد در بالای فایل.
  String text(String key, String fallback, {Map<String, Object?> vars = const {}}) {
    final raw = _at('copy.$key');
    final template = (raw is String && raw.trim().isNotEmpty) ? raw : null;
    if (template == null) return fallback;
    if (!template.contains('{')) return template;
    var missing = false;
    final out = template.replaceAllMapped(
      RegExp(r'\{([a-zA-Z][a-zA-Z0-9_]*)\}'),
      (m) {
        final v = vars[m.group(1)];
        if (v == null) {
          missing = true;
          return '';
        }
        if (v is num) return faNum(v);
        final s = v.toString();
        if (s.isEmpty) missing = true;
        return s;
      },
    );
    return missing ? fallback : out;
  }

  /// فهرستِ آواتارهای سرو‌شده؛ `null` یعنی سرور نگفته — همان ۱۰تای
  /// باندل استفاده می‌شود (رفتارِ امروزِ اپ).
  List<String>? get avatarKeys {
    final items = _at('avatars.keys');
    if (items is! List || items.isEmpty) return null;
    final out = <String>[];
    for (final it in items) {
      if (it is String && it.isNotEmpty) {
        out.add(it);
      } else if (it is Map && it['key'] is String) {
        out.add(it['key'] as String);
      }
    }
    return out.isEmpty ? null : out;
  }

  /// تعداد آواتارها برای برچسب «N مدل اختصاصی».
  int avatarCount(int fallback) {
    final v = _at('avatars.count');
    final n = v is num ? v.toInt() : null;
    return (n != null && n > 0) ? n : fallback;
  }

  /// لایه‌های ورودیِ مسابقه از `stakes.public` (پیش‌فرض ۱۰۰ و ۱۰۰۰).
  ///
  /// چرا این هم اینجا می‌آید: جدولِ «سکه» و جملهٔ «سهمیهٔ روزانه» هر دو به
  /// همین لیست نیاز دارند. وقتی هر کدام از جای خودش می‌خواندند، افزودنِ
  /// یک لایه در پنل یعنی جدولِ سه‌ستونه و متنِ دودانه — همان ناهمسانی‌ای
  /// که گاردِ `coin-parity` باید بگیرد.
  List<int> get stakeTiers {
    final raw = _at('stakes.public');
    if (raw is! List) return const [100, 1000];
    final out = <int>[];
    for (final e in raw) {
      if (e is num && e.toInt() >= 0) out.add(e.toInt());
    }
    return out.isEmpty ? const [100, 1000] : out;
  }

  /// تکه‌های config که صفحه‌های مختلف از قبل می‌خواندند — از همین کش هم
  /// در دسترس‌اند تا هر صفحه fetchِ جدا نزند.
  Map<String, dynamic>? section(String name) {
    final v = _at(name);
    return v is Map ? Map<String, dynamic>.from(v) : null;
  }

  /// فهرستِ **اشیاء** درونِ `copy.<group>.<field>` — مثلِ بندهای منشورِ حریم
  /// خصوصی که هر بند `{title, body}` است.
  ///
  /// چرا یک getterِ جدا و نه `text()`: رشتهٔ بی‌جای‌نگهدار با `text()` می‌آید
  /// ولی فهرستِ ساختارمند را `text()` نمی‌تواند برگرداند؛ اگر کلاینت‌ها
  /// مجبور شوند چنین فهرست‌هایی را دستی در کد بنویسند، همان چیزهایی که
  /// «از پنل» به‌نظر می‌رسند در واقع سفت‌اند. `null` یعنی «config نرسیده» و
  /// فراخواننده به فول‌بکِ خودش می‌رود — و `[]` یعنی «سرور صراحتاً خالی‌اش
  /// گذاشت»؛ تفکیکِ این دو لازم است چون «پنل خالی‌اش کرد» با «سرورِ قدیمی»
  /// دو پاسخِ متفاوت می‌خواهد.
  List<dynamic>? copySection(String group, String field) {
    final v = _at('copy.$group.$field');
    return v is List ? v : null;
  }

  /// ثبتِ چرخهٔ عمر — همان الگوی `MemoryGuard.instance.install()`.
  ///
  /// چرا لازم است: وعدهٔ نقشه‌راه «تغییرِ پنل = بدونِ نصب دیدنی است» و
  /// کاربرِ اندروید ساعت‌ها اپ را **باز** نگه می‌دارد (پیش‌زمینه، نه خروج).
  /// بدونِ این، متنِ تازه فقط با کشتنِ اپ دیده می‌شد.
  void install() {
    if (_installed) return;
    _installed = true;
    WidgetsBinding.instance.addObserver(_Lifecycle());
  }

  bool _installed = false;

  @override
  void dispose() {
    // تک‌نمونه هرگز dispose نمی‌شود؛ override فقط برای این است که اگر
    // روزی کسی آن را در `Provider` گذارد، خطای فلاترِ «used after dispose»
    // بی‌معنی نماند.
    super.dispose();
  }
}

/// بازگشت از پس‌زمینه = یک `refresh()`؛ فقط همین.
///
/// عمداً هیچ `setState` یا ناوبری‌ای اینجا نیست: اگر شبکه قطع باشد
/// `refresh()` بی‌صدا می‌خورد و همان متنِ کش‌شده می‌ماند.
class _Lifecycle extends WidgetsBindingObserver {
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      AppConfig.instance.refresh();
    }
  }
}

/// مقایسهٔ عمیقِ ساده برای JSON (بدون وابستگی به package:collection).
bool mapEqualsDeep(Object? a, Object? b) {
  if (identical(a, b)) return true;
  if (a is Map && b is Map) {
    if (a.length != b.length) return false;
    for (final k in a.keys) {
      if (!b.containsKey(k)) return false;
      if (!mapEqualsDeep(a[k], b[k])) return false;
    }
    return true;
  }
  if (a is List && b is List) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (!mapEqualsDeep(a[i], b[i])) return false;
    }
    return true;
  }
  return a == b;
}
