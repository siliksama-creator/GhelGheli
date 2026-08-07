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
///
/// ⚠️ این نقشه فقط `File`های **موجود** را نگه می‌دارد، پس رشدش با تعدادِ
///    کارت‌های کاربر محدود است نه با زمان.
final Map<String, File> _syncHit = {};

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

    ImageDiskCache.instance.fetch(_resolved).then((f) {
      if (!mounted) return;
      setState(() {
        if (f != null) {
          _syncHit[_resolved] = f;
          _file = f;
        } else {
          // ⚠️ شکستِ کش پایانِ کار نیست: به `Image.network` عقب
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
        child: const Center(child: Text('⚽', style: TextStyle(fontSize: 34))),
      );
}
