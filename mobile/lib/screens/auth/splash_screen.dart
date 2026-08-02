import 'package:flutter/material.dart';
import '../../theme/colors.dart';
import '../../theme/tokens.dart';

/// The frame shown while the persisted auth token is being restored.
///
/// WHY IT LOOKS LIKE THIS — the launch used to be visibly ugly, and it was
/// four problems stacked on top of each other:
///
/// 1. TWO DIFFERENT SPLASHES, BACK TO BACK. Android draws the native splash
///    (`flutter_native_splash`, background `#060D18`) and then Flutter's
///    first frame replaced it with THIS screen, which painted its own
///    gradient starting at `#05090F`. Two near-black-but-not-equal colours
///    swapping produced a visible flicker at exactly the moment the app is
///    supposed to feel instant. This screen now opens on the same flat
///    `#060D18` the native splash uses, so the handover is invisible.
///
/// 2. IT ANIMATED FROM SCRATCH. A 900ms fade-and-scale entrance ran every
///    launch, starting at 86% scale. Token restore usually finishes in well
///    under 100ms, so the user watched a logo grow into place for the better
///    part of a second AFTER the app was already ready. The content is now
///    static; only a slow, subtle glow pulses, and the screen is gone before
///    most users see it at all.
///
/// 3. IT SHOWED A DIFFERENT PICTURE. The native splash shows the character;
///    this screen showed the logo lockup. Two brand marks in sequence read
///    as a loading error. Both now show the character.
///
/// 4. THE ART WAS NOT TRANSPARENT. Handled where it belongs — in the asset
///    pipeline (tools/make_splash.py) and the pubspec config.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  /// Exactly the colour of the native splash AND of the app's own scaffold.
  /// Taken from the shared constant rather than retyped: the flicker this
  /// screen exists to fix was caused by two hand-written near-black hexes
  /// drifting apart, and a literal here would let that happen again.
  /// The one copy that cannot import Dart — the `flutter_native_splash`
  /// block in pubspec.yaml — spells out the same value with a note.
  static const _bg = BrandColors.darkBg;

  // A slow breathing glow behind the character. Deliberately a LOOP, not an
  // entrance: an entrance animation has a start the user can catch mid-way,
  // whereas a loop looks the same no matter which frame they see first.
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2200),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _bg,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedBuilder(
              animation: _pulse,
              builder: (context, child) => Stack(
                alignment: Alignment.center,
                children: [
                  // The glow sits BEHIND the artwork and only changes opacity,
                  // so nothing ever moves — movement is what made the old
                  // splash feel slow.
                  Container(
                    width: 240,
                    height: 240,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(colors: [
                        const Color(0xFF00D49A)
                            .withValues(alpha: 0.10 + 0.10 * _pulse.value),
                        Colors.transparent,
                      ]),
                    ),
                  ),
                  child!,
                ],
              ),
              child: Image.asset(
                'assets/splash/splash_android12.png',
                width: 190,
                height: 190,
                fit: BoxFit.contain,
                // Same character the native splash just showed, so the two
                // frames look like one continuous screen.
              ),
            ),
            Gaps.vLg,
            const Text(
              'قلقلی',
              style: TextStyle(
                color: Color(0xFFB5EF58),
                fontWeight: FontWeight.w900,
                fontSize: 26,
              ),
            ),
            Gaps.vXxs,
            const Text(
              'کارت‌های فوتبالی، امتیاز، لیگ و جایزه',
              style: TextStyle(
                color: Colors.white70,
                fontWeight: FontWeight.w700,
                fontSize: 12.5,
              ),
            ),
            Gaps.vXl,
            const SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                strokeWidth: 2.2,
                color: Color(0xFF00D49A),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
