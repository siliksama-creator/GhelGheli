// Typography scale for GhelGheli — built on Vazirmatn (a modern, highly
// legible Persian/Latin variable typeface) instead of the default Tahoma,
// which reads as dated and has poor weight variety for hierarchy.
import 'package:flutter/material.dart';

class AppTypography {
  AppTypography._();

  static const String fontFamily = 'Vazirmatn';

  static TextTheme textTheme(Color onSurface, Color onSurfaceMuted) {
    return TextTheme(
      displaySmall: TextStyle(
        fontFamily: fontFamily,
        fontSize: 30,
        height: 1.25,
        fontWeight: FontWeight.w800,
        color: onSurface,
        letterSpacing: -0.2,
      ),
      headlineMedium: TextStyle(
        fontFamily: fontFamily,
        fontSize: 24,
        height: 1.3,
        fontWeight: FontWeight.w800,
        color: onSurface,
      ),
      headlineSmall: TextStyle(
        fontFamily: fontFamily,
        fontSize: 20,
        height: 1.3,
        fontWeight: FontWeight.w800,
        color: onSurface,
      ),
      titleLarge: TextStyle(
        fontFamily: fontFamily,
        fontSize: 18,
        height: 1.35,
        fontWeight: FontWeight.w700,
        color: onSurface,
      ),
      titleMedium: TextStyle(
        fontFamily: fontFamily,
        fontSize: 16,
        height: 1.4,
        fontWeight: FontWeight.w700,
        color: onSurface,
      ),
      titleSmall: TextStyle(
        fontFamily: fontFamily,
        fontSize: 14,
        height: 1.4,
        fontWeight: FontWeight.w700,
        color: onSurface,
      ),
      bodyLarge: TextStyle(
        fontFamily: fontFamily,
        fontSize: 16,
        height: 1.55,
        fontWeight: FontWeight.w500,
        color: onSurface,
      ),
      bodyMedium: TextStyle(
        fontFamily: fontFamily,
        fontSize: 14,
        height: 1.55,
        fontWeight: FontWeight.w500,
        color: onSurface,
      ),
      bodySmall: TextStyle(
        fontFamily: fontFamily,
        fontSize: 12.5,
        height: 1.5,
        fontWeight: FontWeight.w500,
        color: onSurfaceMuted,
      ),
      labelLarge: TextStyle(
        fontFamily: fontFamily,
        fontSize: 14,
        height: 1.3,
        fontWeight: FontWeight.w700,
        color: onSurface,
      ),
      labelMedium: TextStyle(
        fontFamily: fontFamily,
        fontSize: 12.5,
        height: 1.3,
        fontWeight: FontWeight.w700,
        color: onSurfaceMuted,
      ),
      labelSmall: TextStyle(
        fontFamily: fontFamily,
        fontSize: 11,
        height: 1.3,
        fontWeight: FontWeight.w700,
        color: onSurfaceMuted,
      ),
    );
  }
}
