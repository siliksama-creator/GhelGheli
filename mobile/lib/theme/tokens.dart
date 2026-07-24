// Design tokens for the GhelGheli app.
//
// Every spacing, radius and duration value used across the app is defined
// here so the whole UI stays consistent and can be tuned from one place.
// Spacing follows an 8dp grid (with 4dp half-steps for fine adjustments).
import 'package:flutter/widgets.dart';

class Gaps {
  Gaps._();

  static const double xxs = 4;
  static const double xs = 8;
  static const double sm = 12;
  static const double md = 16;
  static const double lg = 20;
  static const double xl = 24;
  static const double xxl = 32;
  static const double xxxl = 40;

  static const SizedBox vXxs = SizedBox(height: xxs);
  static const SizedBox vXs = SizedBox(height: xs);
  static const SizedBox vSm = SizedBox(height: sm);
  static const SizedBox vMd = SizedBox(height: md);
  static const SizedBox vLg = SizedBox(height: lg);
  static const SizedBox vXl = SizedBox(height: xl);
  static const SizedBox vXxl = SizedBox(height: xxl);

  static const SizedBox hXxs = SizedBox(width: xxs);
  static const SizedBox hXs = SizedBox(width: xs);
  static const SizedBox hSm = SizedBox(width: sm);
  static const SizedBox hMd = SizedBox(width: md);
  static const SizedBox hLg = SizedBox(width: lg);
  static const SizedBox hXl = SizedBox(width: xl);
}

class Corners {
  Corners._();

  static const double sm = 12;
  static const double md = 16;
  static const double lg = 20;
  static const double xl = 24;
  static const double xxl = 28;
  static const double pill = 999;

  static BorderRadius get rSm => BorderRadius.circular(sm);
  static BorderRadius get rMd => BorderRadius.circular(md);
  static BorderRadius get rLg => BorderRadius.circular(lg);
  static BorderRadius get rXl => BorderRadius.circular(xl);
  static BorderRadius get rXxl => BorderRadius.circular(xxl);
  static BorderRadius get rPill => BorderRadius.circular(pill);
}

class Motion {
  Motion._();

  static const Duration fast = Duration(milliseconds: 160);
  static const Duration normal = Duration(milliseconds: 260);
  static const Duration slow = Duration(milliseconds: 420);
  static const Duration hero = Duration(milliseconds: 900);

  static const Curve standard = Curves.easeOutCubic;
  static const Curve emphasized = Curves.easeOutQuint;
}

/// Breakpoints used to make layouts responsive between phones and tablets.
class Breakpoints {
  Breakpoints._();

  static const double tablet = 720;
  static const double desktop = 1080;

  static bool isTablet(double width) => width >= tablet;
  static bool isDesktop(double width) => width >= desktop;
}

/// Standard touch target minimum size (Material + Apple HIG agree on ~48dp,
/// we go slightly larger for a premium, comfortable one-handed feel).
class TouchTarget {
  TouchTarget._();
  static const double min = 48;
  static const double comfortable = 52;
}
