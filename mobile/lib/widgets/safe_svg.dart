// SvgPicture.network در نسخه‌های قدیمی errorBuilder نداشت و SVG خراب
// با `Bad state: Invalid SVG data` کل صفحهٔ چت را می‌انداخت
// (۲۹ گزارش باز اندروید). flutter_svg 2.3 errorBuilder دارد؛ این
// ویجت همان را با fallback ثابت و URL خالی می‌پوشاند تا یک نقطهٔ
// تماس امن برای استیکر/آیکن شبکه داشته باشیم.
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

class SafeSvgNetwork extends StatelessWidget {
  const SafeSvgNetwork({
    super.key,
    required this.url,
    this.width,
    this.height,
    this.fit = BoxFit.contain,
    this.fallbackIcon = Icons.image_not_supported_outlined,
    this.fallbackColor = Colors.white30,
    this.placeholder,
  });

  final String url;
  final double? width;
  final double? height;
  final BoxFit fit;
  final IconData fallbackIcon;
  final Color fallbackColor;
  final Widget? placeholder;

  @override
  Widget build(BuildContext context) {
    if (url.isEmpty) return _fallback();

    final iconSize = ((height ?? 40) * 0.45).clamp(16.0, 48.0);

    return SvgPicture.network(
      url,
      width: width,
      height: height,
      fit: fit,
      placeholderBuilder: (_) =>
          placeholder ??
          SizedBox(
            width: width,
            height: height,
            child: Icon(Icons.image_outlined,
                size: iconSize, color: fallbackColor),
          ),
      errorBuilder: (_, __, ___) => _fallback(iconSize: iconSize),
    );
  }

  Widget _fallback({double? iconSize}) => SizedBox(
        width: width,
        height: height,
        child: Icon(
          fallbackIcon,
          size: iconSize ?? ((height ?? 40) * 0.45).clamp(16.0, 48.0),
          color: fallbackColor,
        ),
      );
}
