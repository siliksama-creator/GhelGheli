import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/assets.dart';
import '../../theme/tokens.dart';
import '../../widgets/badges.dart';
import '../../widgets/gradient_panel.dart';
import '../../widgets/animated_logo.dart';
import '../../core/app_config.dart';

/// صفحهٔ ورود / عضویت کاربر — فقط با شماره + کد یک‌بارمصرف (قراردادِ مهر ۱۴۰۵).
///
/// رمز عبور از جریانِ عادی حذف شده است؛ ورود و عضویت یکی شده‌اند:
/// تأییدِ کد یعنی ورود، و شمارهٔ تازه همان لحظه حساب می‌سازد.
/// فقط حسابِ مدیر یک بخشِ جداِ ورود با رمز دارد (درِ سمتِ سرور هم
/// همین است: /api/auth/login فقط برای مدیر ۲۰۰ می‌دهد).
///
/// قراردادهای کاربر:
/// - request-otp:  POST /api/auth/request-otp  {mobile, purpose:'register'}
/// - verify-otp:   POST /api/auth/verify-otp   {mobile, code, purpose}
/// - register:     POST /api/auth/register     {mobile, nickname?, referralCode?, profileAvatarKey}
/// - ورود مدیر:    POST /api/auth/login        {mobile, password}
class AuthScreen extends StatefulWidget {
  final ApiClient api;
  final VoidCallback onDone;
  const AuthScreen({super.key, required this.api, required this.onDone});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

enum _Step { mobile, code }

class _AuthScreenState extends State<AuthScreen> {
  final _mobile = TextEditingController();
  final _code = TextEditingController();
  final _name = TextEditingController();
  final _referral = TextEditingController();
  final _adminMobile = TextEditingController();
  final _adminPass = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  _Step _step = _Step.mobile;
  bool _adminOpen = false;
  bool _loading = false;
  String? _errorMessage;
  String? _infoMessage;
  // از /api/config — تا تغییر پنل بدون آپدیت اپ روی متن ثبت‌نام بنشیند.
  int _referralSpins = 3;

  @override
  void initState() {
    super.initState();
    _loadReferralHint();
  }

  Future<void> _loadReferralHint() async {
    try {
      final res = await widget.api.get('/api/config', fresh: true);
      if (!mounted || res is! Map) return;
      AppConfig.instance.apply(res);
      final ref = res['referral'];
      if (ref is Map) {
        final n = (ref['spinsPerReferral'] as num?)?.toInt();
        if (n != null && n >= 0) setState(() => _referralSpins = n);
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _mobile.dispose();
    _code.dispose();
    _name.dispose();
    _referral.dispose();
    _adminMobile.dispose();
    _adminPass.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() fn) async {
    setState(() {
      _loading = true;
      _errorMessage = null;
    });
    try {
      await fn();
    } catch (e) {
      // A failed request can resolve after the user has already navigated
      // away; guard before touching state.
      if (!mounted) return;
      setState(() => _errorMessage = apiError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String get _cleanMobile => normalizeMobileInput(_mobile.text);

  Future<void> _requestCode() async {
    if (_cleanMobile.isEmpty) {
      setState(() => _errorMessage = 'شماره موبایل را وارد کنید');
      return;
    }
    await _run(() async {
      final r = await widget.api.post('/api/auth/request-otp', {
        'mobile': _cleanMobile,
        'purpose': 'register',
      });
      if (!mounted) return;
      if (r['smsDisabled'] == true) {
        setState(() {
          _errorMessage =
              'سامانهٔ پیامک هنوز فعال نشده است؛ ورود با کد به‌زودی فعال می‌شود.';
        });
        return;
      }
      setState(() {
        _step = _Step.code;
        _infoMessage = r['devCode'] != null
            ? 'کد آزمایشی شما: ${r['devCode']}'
            : 'کد تایید به شماره‌تان ارسال شد';
      });
    });
  }

  Future<void> _submitCode() async {
    final code = normalizeMobileInput(_code.text);
    if (code.isEmpty) {
      setState(() => _errorMessage = 'کد تایید را وارد کنید');
      return;
    }
    await _run(() async {
      await widget.api.post('/api/auth/verify-otp', {
        'mobile': _cleanMobile,
        'code': code,
        'purpose': 'register',
      });
      final r = await widget.api.post('/api/auth/register', {
        'mobile': _cleanMobile,
        if (_name.text.trim().isNotEmpty) 'nickname': _name.text.trim(),
        if (_referral.text.trim().isNotEmpty)
          'referralCode': _referral.text.trim(),
        'profileAvatarKey': avatarFiles.first,
      });
      await widget.api.saveToken(r['token']);
      // اگر کد دعوت گرفت، جایزه‌اش را بگو. یک ورود بی‌صدا، جایزه را
      // نامرئی می‌کند و کاربر فکر می‌کند کد کار نکرد.
      if (r is Map && r['referralApplied'] == true && mounted) {
        final n = (r['referralSpins'] as num?)?.toInt() ?? 3;
        ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(
          content: Text(' ${faNum(n)} چرخش گردونهٔ شانس گرفتی!'),
          behavior: SnackBarBehavior.floating,
        ));
      }
      widget.onDone();
    });
  }

  Future<void> _adminLogin() async {
    if (_adminMobile.text.isEmpty || _adminPass.text.isEmpty) {
      setState(() => _errorMessage = 'شماره و رمز مدیر را وارد کنید');
      return;
    }
    await _run(() async {
      final r = await widget.api.post('/api/auth/login', {
        'mobile': normalizeMobileInput(_adminMobile.text),
        'password': _adminPass.text,
      });
      await widget.api.saveToken(r['token']);
      widget.onDone();
    });
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.sizeOf(context);
    final isTablet = Breakpoints.isTablet(media.width);

    return Scaffold(
      resizeToAvoidBottomInset: true,
      body: Stack(
        fit: StackFit.expand,
        children: [
          Positioned.fill(
              // Full-bleed backdrop behind a translucent card — see the old
              // revision history for why cacheWidth 360 is enough here.
              child: Image.asset('assets/brand/login_hero.webp',
                  fit: BoxFit.cover, cacheWidth: 360)),
          const Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Color(0xCC05090F),
                    Color(0xEE070E18),
                    Color(0xFF070E18)
                  ],
                ),
              ),
            ),
          ),
          const Positioned(
              top: -80,
              right: -60,
              child: GlowOrb(color: Color(0xFF00D49A), size: 220)),
          const Positioned(
              bottom: -110,
              left: -80,
              child: GlowOrb(color: Color(0xFF1C78FF), size: 260)),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(
                    horizontal: Gaps.lg, vertical: Gaps.xl),
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: isTablet ? 460 : 440),
                  child: _buildCard(context),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCard(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(Gaps.xl, Gaps.xxl, Gaps.xl, Gaps.xl),
      decoration: BoxDecoration(
        borderRadius: Corners.rXxl,
        gradient: LinearGradient(
          colors: [
            Colors.white.withValues(alpha: 0.14),
            Colors.white.withValues(alpha: 0.045)
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.45),
              blurRadius: 60,
              offset: const Offset(0, 30))
        ],
      ),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Center(child: AnimatedLogo(width: 230)),
            Gaps.vXs,
            Text(
              _step == _Step.code
                  ? 'کد تایید را وارد کن'
                  : 'کارت‌های فوتبالی، امتیاز، لیگ و جایزه',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Colors.white70, fontWeight: FontWeight.w700),
            ),
            Gaps.vMd,
            const Wrap(
              alignment: WrapAlignment.center,
              spacing: Gaps.xs,
              runSpacing: Gaps.xs,
              children: [
                FeaturePill(icon: Icons.style_rounded, text: 'کارت فیزیکی'),
                FeaturePill(
                    icon: Icons.emoji_events_rounded, text: 'لیگ ماهانه'),
                FeaturePill(icon: Icons.chat_bubble_rounded, text: 'چت روم'),
              ],
            ),
            Gaps.vXl,
            AnimatedSwitcher(
              duration: Motion.normal,
              child: Column(
                key: ValueKey(_step),
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (_step == _Step.mobile) ...[
                    TextFormField(
                      controller: _mobile,
                      style: const TextStyle(color: Colors.white),
                      keyboardType: TextInputType.phone,
                      validator: (v) => (v == null || v.trim().isEmpty)
                          ? 'این فیلد الزامی است'
                          : null,
                      decoration: _fieldDecoration(
                        icon: Icons.phone_android_rounded,
                        label: 'شماره موبایل',
                      ),
                    ),
                    Gaps.vSm,
                    TextFormField(
                      controller: _name,
                      style: const TextStyle(color: Colors.white),
                      decoration: _fieldDecoration(
                          icon: Icons.badge_rounded,
                          label: 'نام مستعار اختیاری'),
                    ),
                    Gaps.vSm,
                    // کد دعوت. keyboardType عددی است چون کد فقط رقم است،
                    // و maxLength جلوی تایپ اضافه را می‌گیرد. ارقام فارسی
                    // هم پذیرفته می‌شوند — سرور نرمال‌سازی می‌کند.
                    TextFormField(
                      controller: _referral,
                      keyboardType: TextInputType.number,
                      maxLength: 4,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 6,
                      ),
                      decoration: _fieldDecoration(
                        icon: Icons.card_giftcard_rounded,
                        label: 'کد دعوت دوستت (اختیاری)',
                      ).copyWith(counterText: ''),
                    ),
                    Gaps.vXs,
                    // خواستهٔ مالک: «در قسمت ثبت نام نوشته باشه که در صورت
                    // استفاده از کد دعوت بقیه ۳ شانس گردونه بدست میارن».
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: Gaps.sm, vertical: Gaps.xs),
                      decoration: BoxDecoration(
                        color: const Color(0xFF84CC16).withValues(alpha: 0.10),
                        borderRadius: Corners.rMd,
                        border: Border.all(
                          color: const Color(0xFF84CC16)
                              .withValues(alpha: 0.35),
                        ),
                      ),
                      child: Text(
                        ' اگر کد دعوت یکی از دوستانت را وارد کنی، '
                        'هر دوی شما $_referralSpins چرخش گردونهٔ شانس می‌گیرید.',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: const Color(0xFFBEF264),
                              height: 1.7,
                            ),
                      ),
                    ),
                  ] else ...[
                    TextFormField(
                      controller: _code,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 8,
                      ),
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      textAlign: TextAlign.center,
                      decoration: _fieldDecoration(
                        icon: Icons.sms_rounded,
                        label: 'کد ۶ رقمی پیامک',
                      ).copyWith(counterText: ''),
                    ),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        TextButton(
                          onPressed: _loading
                              ? null
                              : () => setState(() {
                                    _step = _Step.mobile;
                                    _infoMessage = null;
                                    _errorMessage = null;
                                  }),
                          child: const Text('تغییر شماره',
                              style: TextStyle(fontSize: 12.5)),
                        ),
                        TextButton(
                          onPressed: _loading ? null : _requestCode,
                          child: const Text('ارسال دوبارهٔ کد',
                              style: TextStyle(fontSize: 12.5)),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            if (_infoMessage != null) ...[
              Gaps.vSm,
              Container(
                padding: const EdgeInsets.all(Gaps.sm),
                decoration: BoxDecoration(
                  color: const Color(0xFF00D49A).withValues(alpha: 0.12),
                  borderRadius: Corners.rMd,
                  border: Border.all(
                      color: const Color(0xFF00D49A).withValues(alpha: 0.3)),
                ),
                child: Text(_infoMessage!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Color(0xFF7BF1C8))),
              ),
            ],
            Gaps.vLg,
            FilledButton.icon(
              icon: const Icon(Icons.login_rounded),
              onPressed: _loading
                  ? null
                  : () {
                      if (_formKey.currentState?.validate() ?? true) {
                        if (_step == _Step.code) {
                          _submitCode();
                        } else {
                          _requestCode();
                        }
                      }
                    },
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF00D49A),
                foregroundColor: const Color(0xFF00281D),
              ),
              label: Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: _loading
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                            strokeWidth: 2.4, color: Colors.white),
                      )
                    : Text(_step == _Step.code
                        ? 'ورود / عضویت'
                        : 'دریافت کد یک‌بارمصرف'),
              ),
            ),
            AnimatedSwitcher(
              duration: Motion.fast,
              child: _errorMessage == null
                  ? const SizedBox.shrink()
                  : Padding(
                      padding: const EdgeInsets.only(top: Gaps.xs),
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(Gaps.sm),
                        decoration: BoxDecoration(
                          color: Colors.redAccent.withValues(alpha: 0.16),
                          borderRadius: Corners.rMd,
                          border: Border.all(
                              color: Colors.redAccent.withValues(alpha: 0.3)),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.error_outline_rounded,
                                color: Colors.redAccent, size: 18),
                            Gaps.hXs,
                            Expanded(
                              child: Text(_errorMessage!,
                                  style: const TextStyle(color: Colors.white)),
                            ),
                          ],
                        ),
                      ),
                    ),
            ),
            Gaps.vMd,
            Container(
              padding: const EdgeInsets.only(top: Gaps.sm),
              decoration: const BoxDecoration(
                border: Border(
                  top: BorderSide(color: Colors.white12, width: 1),
                ),
              ),
              child: Column(
                children: [
                  TextButton(
                    onPressed: () => setState(() {
                      _adminOpen = !_adminOpen;
                      _errorMessage = null;
                    }),
                    child: Text(
                      _adminOpen
                          ? 'بستنِ ورودِ مدیر ▲'
                          : 'ورود با رمز عبور (فقط حساب مدیر) ▼',
                      style: const TextStyle(
                          fontSize: 12, color: Colors.white38),
                    ),
                  ),
                  if (_adminOpen) ...[
                    TextFormField(
                      controller: _adminMobile,
                      style: const TextStyle(color: Colors.white),
                      decoration: _fieldDecoration(
                          icon: Icons.shield_rounded, label: 'شماره / نام مدیر'),
                    ),
                    Gaps.vSm,
                    TextFormField(
                      controller: _adminPass,
                      obscureText: true,
                      style: const TextStyle(color: Colors.white),
                      decoration: _fieldDecoration(
                          icon: Icons.lock_rounded, label: 'رمز عبور مدیر'),
                    ),
                    Gaps.vSm,
                    OutlinedButton(
                      onPressed: _loading ? null : _adminLogin,
                      child: const Text('ورود مدیر'),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  InputDecoration _fieldDecoration(
      {required IconData icon, required String label}) {
    return InputDecoration(
      prefixIcon: Icon(icon, color: Colors.white70),
      labelText: label,
      labelStyle: const TextStyle(color: Colors.white70),
      filled: true,
      fillColor: Colors.white.withValues(alpha: 0.08),
      enabledBorder: OutlineInputBorder(
        borderRadius: Corners.rMd,
        borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.16)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: Corners.rMd,
        borderSide: const BorderSide(color: Color(0xFF00D49A), width: 1.6),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: Corners.rMd,
        borderSide: const BorderSide(color: Colors.redAccent),
      ),
    );
  }
}
