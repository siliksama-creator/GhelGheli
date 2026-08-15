// پرداخت درون‌برنامه‌ای کافه‌بازار (Poolakey)
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این لایه به‌صورت «پل» نوشته شده و نه وابستگی مستقیم
// ═══════════════════════════════════════════════════════════════════════════
//
// افزودن پکیج `poolakey` به pubspec یعنی:
//   • بیلد اندروید به سرویس بازار وابسته می‌شود
//   • تست‌های CI (که هیچ بازاری ندارند) باید mock بگیرند
//   • نسخهٔ وب اصلاً کامپایل نمی‌شود
//
// تا وقتی `RSA_PUBLIC_KEY` و شناسه‌های محصول از کنسول کافه‌بازار نیامده،
// وابستگیِ سخت اضافه‌کردن یعنی بیلدِ شکسته. این کلاس همان قرارداد نهایی
// را تعریف می‌کند و امروز صادقانه `BillingUnavailable` می‌دهد؛ روزی که
// کلید رسید، فقط بدنهٔ `_purchase` با فراخوانی واقعی Poolakey عوض می‌شود
// و **هیچ‌جای دیگر اپ تغییر نمی‌کند**.
//
// ═══════════════════════════════════════════════════════════════════════════
// جریان امن — چرا سرور دو بار درگیر می‌شود
// ═══════════════════════════════════════════════════════════════════════════
//
//   ۱. POST /api/wallet/topup/order   → سفارش pending + orderId
//   ۲. Poolakey.purchase(productId)   → purchaseToken از بازار
//   ۳. POST /api/wallet/topup/verify  → سرور توکن را از API بازار چک
//                                        می‌کند و تازه بعد شارژ می‌کند
//
// مرحلهٔ ۳ حیاتی است: اگر کلاینت خودش می‌گفت «پرداخت شد، شارژ کن»، هر
// کسی با یک اپ دست‌کاری‌شده می‌توانست کیف پولش را پر کند. سرور هرگز به
// کلاینت اعتماد نمی‌کند و مبلغ را هم از روی `productId` خودش تعیین می‌کند.
import 'dart:async';

/// خطای در دسترس نبودن پرداخت — با پیام فارسیِ قابل نمایش به کاربر.
class BillingUnavailable implements Exception {
  const BillingUnavailable([this.message = 'پرداخت درون‌برنامه‌ای هنوز فعال نشده است']);
  final String message;
  @override
  String toString() => message;
}

/// خطای لغو توسط کاربر — نباید مثل خطای واقعی قرمز نشان داده شود.
class BillingCancelled implements Exception {
  const BillingCancelled();
  @override
  String toString() => 'پرداخت لغو شد';
}

class BazaarBilling {
  const BazaarBilling._();

  /// وقتی کلید RSA و پکیج Poolakey اضافه شد، این به true تغییر می‌کند.
  ///
  /// عمداً یک ثابت است و نه خواندن از فایل پیکربندی: تا زمانی که کدِ
  /// واقعیِ خرید نوشته نشده، هیچ مسیری نباید بتواند این را روشن کند و
  /// به کاربر دکمه‌ای بدهد که بی‌صدا شکست می‌خورد.
  static const bool available = false;

  /// خرید یک محصول و برگرداندن `purchaseToken`.
  ///
  /// [productId] باید دقیقاً با شناسهٔ محصول در کنسول کافه‌بازار یکی باشد.
  /// [payload] شناسهٔ سفارش ماست؛ بازار آن را در `developerPayload`
  /// نگه می‌دارد و در پشتیبانی برای تطبیق سفارش به کار می‌آید.
  static Future<String> purchase({
    required String productId,
    required String payload,
  }) async {
    if (!available) throw const BillingUnavailable();

    // ── محل اتصال Poolakey ────────────────────────────────────────────
    // final payment = FlutterPoolakey();
    // await payment.connect(rsaPublicKey);
    // final result = await payment.purchase(productId, payload: payload);
    // if (result.purchaseState != PurchaseState.purchased) {
    //   throw const BillingCancelled();
    // }
    // // مصرفی است: تا مصرف نشود کاربر نمی‌تواند دوباره همان بسته را بخرد.
    // await payment.consume(result.purchaseToken);
    // return result.purchaseToken;
    throw const BillingUnavailable();
  }
}
