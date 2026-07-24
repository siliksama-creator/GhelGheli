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
        Image.asset('assets/brand/logo.webp',
            width: logoWidth, height: logoHeight, fit: BoxFit.contain),
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
