import 'package:flutter/material.dart';

/// The GhelGheli brand lockup (logo + wordmark) shown on splash and inside
/// the admin drawer header.
class HeroLogo extends StatelessWidget {
  final double logoWidth;
  final double logoHeight;
  final double titleSize;
  const HeroLogo(
      {super.key,
      this.logoWidth = 200,
      this.logoHeight = 168,
      this.titleSize = 30});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Image.asset(
            'assets/brand/logo.webp',
            width: logoWidth,
            height: logoHeight,
            fit: BoxFit.contain,
            // Derived from the requested width rather than hardcoded, so a
            // caller asking for a small logo gets a small decode. The source
            // is 720x595; at the default 200px width this cuts the resident
            // bitmap to about a quarter.
            //
            // Capped at the source width so a caller asking for something
            // huge never makes Flutter upscale — that would cost more memory
            // to produce a blurrier result.
            cacheWidth:
                (logoWidth * 3).round() > 720 ? 720 : (logoWidth * 3).round()),
        const SizedBox(height: 4),
        Text(
          'قلقلی',
          style: TextStyle(
              fontSize: titleSize,
              fontWeight: FontWeight.w800,
              fontFamily: 'Vazirmatn'),
        ),
      ],
    );
  }
}
