// تصویری که فقط **یک بار** از سرور گرفته می‌شود.
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا این ویجت کنارِ SafeImage وجود دارد و جایگزینش نشد
// ═══════════════════════════════════════════════════════════════════════════
//
// `SafeImage` برای هر تصویرِ شبکه‌ای در اپ است: آواتار، استیکرِ چت، عکسِ
// جایزه، پیوستِ تیکت. بعضی از آن‌ها **باید** تازه باشند — اگر کاربر
// آواتارش را عوض کند و ما نسخهٔ کش‌شده را نشان دهیم، به نظرش می‌رسد
// تغییرش ذخیره نشده.
//
// تصویرِ کارت فرق دارد و تفاوتش ساختاری است: فایلش با نامِ زمان‌دار ذخیره
// می‌شود و **هرگز بازنویسی نمی‌شود**. مدیر که تصویرِ طرح را عوض کند، فایلِ
// تازه با نامِ تازه ساخته می‌شود و URL عوض می‌شود — یعنی کشِ ما خودبه‌خود
// باطل می‌شود چون کلیدش خودِ URL است. برای همین کشِ دائمی اینجا امن است و
// روی آواتار نیست.
//
// سرور هم همین را می‌گوید:
//     Cache-Control: public, max-age=31536000, immutable
//
// ═══════════════════════════════════════════════════════════════════════════
// چرا FutureBuilder با یک مرحلهٔ همگام
// ═══════════════════════════════════════════════════════════════════════════
//
// اگر ساده‌لوحانه در `initState` یک `await` بزنیم، **حتی وقتی فایل روی
// دیسک هست** یک فریم اسپینر نشان داده می‌شود و بعد تصویر می‌پرد. در
// اینونتوری با ۳۰ کارت این یعنی هر بار اسکرول، سی‌تا چشمک.
//
// راه‌حل: `_syncHit` — نقشه‌ای در حافظه از URL به فایلی که قبلاً در همین
// نشست پیدا شده. بارِ اول اسپینر می‌بینی، بعد از آن هرگز.
import 'dart:io';

import 'package:flutter/material.dart';

import '../api_client.dart';
import '../services/image_disk_cache.dart';

/// URLهایی که در همین اجرای اپ روی دیسک پیدا شده‌اند.
///
/// چرا static: کش باید بینِ صفحه‌ها مشترک باشد. همان کارت هم در
/// اینونتوری است، هم در کارتِ جزئیات، هم در پروفایلِ عمومی — و نباید
/// در هر کدام دوباره منتظرِ خواندنِ دیسک بماند.
final Map<String, File> _syncHit = {};

/// سقفِ نقشهٔ بالا.
///
/// ── چرا اصلاً سقف لازم است ──
///
/// استدلالِ اولیه این بود که «رشدش با تعدادِ کارت‌های کاربر محدود است نه
/// با زمان». آن استدلال ناقص بود: کلید **URL** است، نه شناسهٔ کارت. هر
/// بار مدیر تصویرِ یک طرح را عوض کند، URL تازه‌ای ساخته می‌شود و کلیدِ
/// قدیمی تا بسته شدنِ اپ در نقشه می‌ماند. اپی که روزها باز بماند
/// (اندروید اپ را در پس‌زمینه زنده نگه می‌دارد) کلیدهای مرده جمع می‌کند.
///
/// هر ورودی چند صد بایت است، پس ۳۰۰ تا حتی در بدترین حالت زیرِ ۱۵۰
/// کیلوبایت می‌ماند — ناچیز، ولی **کراندار**. و از آنجا که ازدست‌رفتنِ
/// یک ورودی فقط یعنی «یک بار دیسک را دوباره بخوان»، حذفِ ساده کافی است
/// و به LRU دقیق نیازی نیست.
const int _kSyncHitMax = 300;

void _rememberHit(String url, File f) {
  if (_syncHit.length >= _kSyncHitMax) {
    // قدیمی‌ترین کلیدها (ترتیبِ درجِ Map در دارت حفظ می‌شود) تا رسیدن
    // به سه‌چهارمِ سقف حذف می‌شوند — نه دقیقاً تا سقف، وگرنه هر درجِ
    // بعدی دوباره پاکسازی را راه می‌اندازد.
    final drop = _syncHit.keys.take(_syncHit.length - (_kSyncHitMax * 3 ~/ 4))
        .toList();
    for (final k in drop) {
      _syncHit.remove(k);
    }
  }
  _syncHit[url] = f;
}

class CachedCardImage extends StatefulWidget {
  const CachedCardImage({
    super.key,
    required this.url,
    this.width,
    this.height,
    this.fit = BoxFit.contain,
    this.cacheWidth,
    this.placeholder,
  });

  /// آدرسِ مطلق یا مسیرِ `/uploads/...` نسبت به API.
  final Object? url;
  final double? width;
  final double? height;
  final BoxFit fit;

  /// عرضِ رمزگشایی. مثلِ `SafeImage` برای اینکه تصویرِ ۱۶۰۰ پیکسلی در
  /// خانهٔ ۱۶۸ پیکسلی حافظه هدر ندهد.
  final int? cacheWidth;

  /// چیزی که هنگامِ بارگذاری یا شکست نشان داده می‌شود.
  final Widget? placeholder;

  @override
  State<CachedCardImage> createState() => _CachedCardImageState();
}

class _CachedCardImageState extends State<CachedCardImage> {
  File? _file;
  bool _failed = false;
  String _resolved = '';

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void didUpdateWidget(covariant CachedCardImage old) {
    super.didUpdateWidget(old);
    // بدونِ این، بازاستفادهٔ ویجت در لیست (که فلاتر آزادانه انجام
    // می‌دهد) تصویرِ کارتِ قبلی را روی کارتِ بعدی نشان می‌داد.
    if (fullAssetUrl(widget.url) != _resolved) {
      _file = null;
      _failed = false;
      _start();
    }
  }

  void _start() {
    _resolved = fullAssetUrl(widget.url);
    if (_resolved.isEmpty) {
      _failed = true;
      return;
    }

    // مسیرِ سریع: در همین نشست قبلاً پیدا شده → بدونِ حتی یک فریم انتظار.
    final hit = _syncHit[_resolved];
    if (hit != null) {
      _file = hit;
      return;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  چرا URL در متغیرِ محلی گرفته می‌شود — باگی که اینجا بود
    // ═══════════════════════════════════════════════════════════════════
    //
    // نسخهٔ اول داخلِ callback از `_resolved` (فیلدِ کلاس) استفاده
    // می‌کرد. `didUpdateWidget` بالا نوشته شده بود که بازاستفادهٔ ویجت
    // را درست مدیریت کند — ولی خودش با این callbackِ ناهمگام خنثی
    // می‌شد:
    //
    //   t0  ویجت URL «الف» را می‌خواهد → fetch(الف) شروع (کندِ شبکه)
    //   t1  فلاتر ویجت را در لیست برای URL «ب» بازاستفاده می‌کند
    //       → didUpdateWidget → _resolved = ب → fetch(ب) شروع
    //   t2  fetch(الف) تمام می‌شود:
    //           _syncHit[_resolved] = f   ← _resolved حالا «ب» است،
    //                                        ولی f فایلِ «الف» است!
    //
    // دو نتیجه، دومی بدتر:
    //
    //   ۱. کارتِ «ب» تصویرِ کارتِ «الف» را نشان می‌دهد.
    //   ۲. `_syncHit` نقشه‌ای **استاتیک و مشترک** است، پس کلیدِ «ب»
    //      برای همیشه به فایلِ «الف» اشاره می‌کند و هر ویجتِ دیگری هم
    //      که «ب» را بخواهد تصویرِ غلط می‌گیرد. یعنی یک مسابقهٔ لحظه‌ای
    //      به خرابیِ **ماندگار** تبدیل می‌شود.
    //
    // این دقیقاً در اینونتوری رخ می‌دهد: اسکرولِ سریع در شبکه‌ای که
    // ویجت‌ها را بازاستفاده می‌کند، روی اینترنتِ کندِ موبایل.
    //
    // رفع: URL در `requested` قفل می‌شود و callback فقط وقتی چیزی را
    // اعمال می‌کند که هنوز همان URL خواسته شده باشد.
    final requested = _resolved;
    ImageDiskCache.instance
        .fetch(requested)
        // The disk-cache fetch used to keep the football placeholder visible
        // for up to 40 seconds on a weak connection. Eight seconds is enough
        // for these ~100 KB WebP files; after that render through Flutter's
        // proven Image.network path instead of making the card look missing.
        .timeout(const Duration(seconds: 8), onTimeout: () => null)
        .then((f) {
      if (!mounted) return;
      // نتیجهٔ درخواستِ کهنه دور ریخته می‌شود. `_syncHit` هم دست‌نخورده
      // می‌ماند تا خرابی ماندگار نشود.
      if (requested != _resolved) return;
      setState(() {
        if (f != null) {
          _rememberHit(requested, f);
          _file = f;
        } else {
          //  شکستِ کش پایانِ کار نیست: به `Image.network` عقب
          //    می‌نشینیم. رفتارِ بدترین‌حالت باید «مثلِ قبل از این
          //    ویجت» باشد، نه «تصویرِ خالی».
          _failed = true;
        }
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_resolved.isEmpty) return _fallback(context);

    if (_file != null) {
      return Image.file(
        _file!,
        width: widget.width,
        height: widget.height,
        fit: widget.fit,
        cacheWidth: widget.cacheWidth,
        filterQuality: FilterQuality.medium,
        // فایلی که بین خواندن و رندر پاک شود (پاکسازیِ LRU، یا اندروید
        // که پوشهٔ cache را در فشارِ فضا خالی کند) نباید جعبهٔ خطای
        // خاکستری بسازد.
        errorBuilder: (_, __, ___) {
          _syncHit.remove(_resolved);
          return _networkFallback();
        },
      );
    }

    if (_failed) return _networkFallback();

    return SizedBox(
      width: widget.width,
      height: widget.height,
      child: Center(
        child: widget.placeholder ??
            const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
      ),
    );
  }

  /// وقتی کش در دسترس نیست، همان رفتارِ قبلی.
  Widget _networkFallback() => Image.network(
        _resolved,
        width: widget.width,
        height: widget.height,
        fit: widget.fit,
        cacheWidth: widget.cacheWidth,
        filterQuality: FilterQuality.medium,
        loadingBuilder: (_, child, p) => p == null
            ? child
            : SizedBox(
                width: widget.width,
                height: widget.height,
                child: Center(
                  child: widget.placeholder ??
                      const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                ),
              ),
        errorBuilder: (_, __, ___) => _fallback(context),
      );

  Widget _fallback(BuildContext context) =>
      widget.placeholder ??
      SizedBox(
        width: widget.width,
        height: widget.height,
        child: const Center(
          child: Icon(Icons.image_not_supported_outlined,
              size: 34, color: Colors.white38),
        ),
      );
}
