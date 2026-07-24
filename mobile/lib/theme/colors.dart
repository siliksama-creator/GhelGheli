// Brand color system for GhelGheli.
//
// Centralised so both light & dark themes stay perfectly in sync and any
// future rebrand only touches this file.
import 'package:flutter/material.dart';

class BrandColors {
  BrandColors._();

  // Core brand identity — emerald/teal (loyalty, growth) + electric blue
  // (energy, sport) + amber (rewards, gold tier).
  static const Color emerald = Color(0xFF00D49A);
  static const Color emeraldDeep = Color(0xFF00A87A);
  static const Color blue = Color(0xFF1C78FF);
  static const Color blueDeep = Color(0xFF0B4FCC);
  static const Color amber = Color(0xFFFFC94D);
  static const Color amberDeep = Color(0xFF7A4D00);

  // Dark theme surfaces — deep navy, never pure black, for a premium feel.
  static const Color darkBg = Color(0xFF060D18);
  static const Color darkSurface = Color(0xFF0E1826);
  static const Color darkSurfaceAlt = Color(0xFF141F30);
  static const Color darkSurfaceHigh = Color(0xFF1B2A40);
  static const Color darkBorder = Color(0x1FFFFFFF);

  // Light theme surfaces — soft cool white, not stark.
  static const Color lightBg = Color(0xFFF4F7FC);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightSurfaceAlt = Color(0xFFEEF2FA);
  static const Color lightSurfaceHigh = Color(0xFFE4EAF6);
  static const Color lightBorder = Color(0x14101A2C);

  // Semantic colors (consistent across themes).
  static const Color success = Color(0xFF22C58B);
  static const Color warning = Color(0xFFF2A93B);
  static const Color danger = Color(0xFFFF5D6C);
  static const Color info = Color(0xFF4EA1FF);

  static const List<Color> heroGradientDark = [emerald, blue];
  static const List<Color> heroGradientLight = [
    Color(0xFF00C398),
    Color(0xFF2C82FF)
  ];
  static const List<Color> goldGradient = [amber, amberDeep];
  static const List<Color> leagueGradientDark = [Color(0xFF172F56), emerald];
  static const List<Color> leagueGradientLight = [
    Color(0xFF23477F),
    Color(0xFF00C398)
  ];
  static const List<Color> cardGradient = [
    Color(0xFFFFD36B),
    Color(0xFF0B2B4F),
    emerald
  ];
}
