import 'package:flutter/material.dart';
import '../../widgets/gradient_panel.dart';
import '../../widgets/hero_logo.dart';
import '../../theme/tokens.dart';

/// Splash screen shown while the persisted auth token is being restored.
///
/// Polished on purpose: this is the very first frame every user sees when
/// they open the app, so it mirrors the same dark gradient + glow-orb + logo
/// language as the login screen instead of a plain white/loading screen —
/// with a soft fade + scale entrance so the brand mark feels alive rather
/// than just popping in.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..forward();

  late final Animation<double> _fade = CurvedAnimation(
    parent: _controller,
    curve: const Interval(0, 0.7, curve: Curves.easeOut),
  );
  late final Animation<double> _scale = Tween(begin: 0.86, end: 1.0).animate(
    CurvedAnimation(parent: _controller, curve: Curves.easeOutBack),
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xFF05090F), Color(0xFF0B1626), Color(0xFF070E18)],
              ),
            ),
          ),
          const Positioned(
              top: -70, right: -50, child: GlowOrb(color: Color(0xFF00D49A), size: 200)),
          const Positioned(
              bottom: -100, left: -70, child: GlowOrb(color: Color(0xFF1C78FF), size: 240)),
          Center(
            child: FadeTransition(
              opacity: _fade,
              child: ScaleTransition(
                scale: _scale,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const HeroLogo(),
                    Gaps.vLg,
                    FadeTransition(
                      opacity: CurvedAnimation(
                        parent: _controller,
                        curve: const Interval(0.45, 1, curve: Curves.easeOut),
                      ),
                      child: const Text(
                        'کارت‌های فوتبالی، امتیاز، لیگ و جایزه',
                        style: TextStyle(
                            color: Colors.white70,
                            fontWeight: FontWeight.w700,
                            fontSize: 13),
                      ),
                    ),
                    Gaps.vXl,
                    SizedBox(
                      width: 26,
                      height: 26,
                      child: CircularProgressIndicator(
                          strokeWidth: 2.4, color: const Color(0xFF00D49A)),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
