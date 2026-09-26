// ══════════════════════════════════════════════════════════════════════════
// آموزشِ صوتیِ قلقلی — لنگرها (سمتِ اندروید)
// ══════════════════════════════════════════════════════════════════════════
// همان کاری که `data-tour` در وب می‌کند، این‌جا با یک رجیستریِ `GlobalKey`
// انجام می‌شود: هر تیغه‌ای که تور باید دورش هاله بکشد، خودش را با یک `id`
// ثبت می‌کند و تور فقط کادرِ همان را می‌خواند.
//
// چرا رجیستری و نه پاس‌دادنِ `GlobalKey` از والد به فرزند: تیغه‌های هدف در
// ده فایلِ مختلف‌اند (داشبورد، فروشگاه، لیگ، …) و بالا بردنِ کلیدها تا شلِ
// خانه یعنی ده امضاِ تازه و یک زنجیرهٔ prop که هر تغییرِ کوچک را می‌شکند.
// رجیستری همان نتیجه را بدونِ درگیرکردنِ درخت می‌دهد.
//
// ⚠️ قراردادِ نام‌گذاری دقیقاً همان idهای وب است (`home:tapTile`،
//    `league:tab:vault`، `nav:more`، …) تا دو کلاینت از هم جدا نشوند؛
//    گاردِ `backend/scripts/testOnboarding.js` همین را قفل می‌کند.
import 'package:flutter/widgets.dart';

/// رجیستریِ لنگرهای تور — سراسری و ایستا.
///
/// چرا `putIfAbsent` و نه `[]=`: اگر یک ویجت دو بار ساخته شود (که در اپ
/// عادی است — تب‌ها زنده می‌مانند)، کلیدِ قبلی باید حفظ شود؛ در غیرِ این
/// صورت `GlobalKey` بین دو درخت جابه‌جا می‌شود و خطای
/// «Duplicate GlobalKey» می‌دهد.
class TourAnchors {
  TourAnchors._();

  static final Map<String, GlobalKey> _keys = <String, GlobalKey>{};

  static GlobalKey keyFor(String id) =>
      _keys.putIfAbsent(id, () => GlobalKey(debugLabel: 'tour:$id'));

  /// کادرِ لنگر در مختصاتِ **پنجره** — یا `null` اگر روی صفحه نباشد.
  static Rect? rectOf(String id) {
    final ctx = _keys[id]?.currentContext;
    if (ctx == null) return null;
    final obj = ctx.findRenderObject();
    if (obj is! RenderBox || !obj.hasSize || !obj.attached) return null;
    final size = obj.size;
    if (size.width < 1 || size.height < 1) return null;
    final topLeft = obj.localToGlobal(Offset.zero);
    return topLeft & size;
  }

  /// آیا این لنگر همین حالا روی صفحه است؟ (برای انتخابِ لنگرِ جانشین)
  static bool visible(String id) => rectOf(id) != null;
}

/// یک لنگرِ تور: هر چیزی را بپیچید تا تور بتواند کادرش را پیدا کند.
///
/// کارِ زمانِ اجرا صفر است (فقط یک `KeyedSubtree`)؛ پس هر جای داغِ اپ هم
/// بی‌هزینه است.
class TourAnchor extends StatelessWidget {
  const TourAnchor({super.key, required this.id, required this.child});

  final String id;
  final Widget child;

  @override
  Widget build(BuildContext context) =>
      KeyedSubtree(key: TourAnchors.keyFor(id), child: child);
}
