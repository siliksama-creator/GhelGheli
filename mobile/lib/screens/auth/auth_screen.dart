import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/assets.dart';
import '../../theme/tokens.dart';
import '../../widgets/badges.dart';
import '../../widgets/gradient_panel.dart';
import '../../widgets/hero_logo.dart';

/// Unified login / register / admin-login screen.
///
/// Functional contract preserved 1:1 from the legacy implementation:
/// - login:     POST /api/auth/login            {mobile, password}
/// - register:  POST /api/auth/register-password {mobile, password, nickname, profileAvatarKey}
/// - admin:     POST /api/admin/auth/login       {username, password}
class AuthScreen extends StatefulWidget {
  final ApiClient api;
  final VoidCallback onDone;
  const AuthScreen({super.key, required this.api, required this.onDone});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

enum _AuthMode { login, register, admin }

class _AuthScreenState extends State<AuthScreen> {
  final _mobile = TextEditingController(text: 'Admin');
  final _pass = TextEditingController();
  final _name = TextEditingController();
  final _currentPassword = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  _AuthMode _mode = _AuthMode.login;
  bool _loading = false;
  bool _obscure = true;
  String? _errorMessage;
  // The backend now requires proof of the current password when
  // re-registering an already-used mobile number (fixes an account-takeover
  // bug where anyone could overwrite someone else's password just by
  // knowing their phone number). It replies with 409 the first time; we
  // then reveal this field so the real owner can prove ownership and change
  // their password — a real SMS-based reset isn't available yet.
  bool _needsCurrentPassword = false;

  @override
  void dispose() {
    _mobile.dispose();
    _pass.dispose();
    _name.dispose();
    _currentPassword.dispose();
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
      setState(() {
        _errorMessage = apiError(e);
        if (_mode == _AuthMode.register && apiStatusCode(e) == 409) {
          _needsCurrentPassword = true;
        }
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submit() async {
    await _run(() async {
      switch (_mode) {
        case _AuthMode.admin:
          final r = await widget.api.post('/api/admin/auth/login', {
            'username': _mobile.text,
            'password': _pass.text,
          });
          await widget.api.saveToken(r['token'], admin: true);
          break;
        case _AuthMode.register:
          final r = await widget.api.post('/api/auth/register-password', {
            'mobile': _mobile.text,
            'password': _pass.text,
            // PRIVACY FIX: previously defaulted to the mobile number itself
            // when left blank, which is shown publicly on the leaderboard
            // and in chat — leaking the user's phone number to everyone.
            // Omit it and let the backend assign an anonymous placeholder.
            if (_name.text.isNotEmpty) 'nickname': _name.text,
            'profileAvatarKey': avatarFiles.first,
            if (_needsCurrentPassword)
              'currentPassword': _currentPassword.text,
          });
          await widget.api.saveToken(r['token']);
          break;
        case _AuthMode.login:
          final r = await widget.api.post('/api/auth/login', {
            'mobile': _mobile.text,
            'password': _pass.text,
          });
          await widget.api.saveToken(r['token']);
          break;
      }
      widget.onDone();
    });
  }

  void _setMode(_AuthMode mode) {
    setState(() {
      _mode = mode;
      _needsCurrentPassword = false;
      _currentPassword.clear();
      if (mode == _AuthMode.admin) {
        _mobile.text = 'Admin';
        _pass.clear();
      } else if (_mobile.text == 'Admin') {
        _mobile.clear();
      }
      _errorMessage = null;

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
              child: Image.asset('assets/brand/login_hero.webp',
                  fit: BoxFit.cover)),
          Positioned.fill(
            child: DecoratedBox(
              decoration: const BoxDecoration(
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
                  child: _AuthGlassCard(
                    formKey: _formKey,
                    mode: _mode,
                    mobile: _mobile,
                    pass: _pass,
                    name: _name,
                    currentPassword: _currentPassword,
                    needsCurrentPassword: _needsCurrentPassword,
                    loading: _loading,
                    obscure: _obscure,
                    errorMessage: _errorMessage,
                    onToggleObscure: () => setState(() => _obscure = !_obscure),
                    onModeChanged: _setMode,
                    onSubmit: () {
                      if (_formKey.currentState?.validate() ?? true) _submit();
                    },
                    onQuickAdmin: () => _setMode(_AuthMode.admin),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AuthGlassCard extends StatelessWidget {
  final GlobalKey<FormState> formKey;
  final _AuthMode mode;
  final TextEditingController mobile;
  final TextEditingController pass;
  final TextEditingController name;
  final TextEditingController currentPassword;
  final bool needsCurrentPassword;
  final bool loading;
  final bool obscure;
  final String? errorMessage;
  final VoidCallback onToggleObscure;
  final ValueChanged<_AuthMode> onModeChanged;
  final VoidCallback onSubmit;
  final VoidCallback onQuickAdmin;

  const _AuthGlassCard({
    required this.formKey,
    required this.mode,
    required this.mobile,
    required this.pass,
    required this.name,
    required this.currentPassword,
    required this.needsCurrentPassword,
    required this.loading,
    required this.obscure,
    required this.errorMessage,
    required this.onToggleObscure,
    required this.onModeChanged,
    required this.onSubmit,
    required this.onQuickAdmin,
  });

  bool get isAdmin => mode == _AuthMode.admin;
  bool get isRegister => mode == _AuthMode.register;

  @override
  Widget build(BuildContext context) {
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
        key: formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Center(
                child:
                    HeroLogo(logoWidth: 168, logoHeight: 140, titleSize: 26)),
            Gaps.vXs,
            Text(
              'کارت‌های فوتبالی، امتیاز، لیگ و جایزه',
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
            _ModeSwitcher(mode: mode, onChanged: onModeChanged),
            Gaps.vLg,
            AnimatedSwitcher(
              duration: Motion.normal,
              child: Column(
                key: ValueKey(mode),
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextFormField(
                    controller: mobile,
                    style: const TextStyle(color: Colors.white),
                    keyboardType:
                        isAdmin ? TextInputType.text : TextInputType.phone,
                    validator: (v) => (v == null || v.trim().isEmpty)
                        ? 'این فیلد الزامی است'
                        : null,
                    decoration: _fieldDecoration(
                      icon: isAdmin
                          ? Icons.admin_panel_settings_rounded
                          : Icons.phone_android_rounded,
                      label: isAdmin ? 'نام کاربری مدیر' : 'شماره موبایل',
                    ),
                  ),
                  if (isRegister) ...[
                    Gaps.vSm,
                    TextFormField(
                      controller: name,
                      style: const TextStyle(color: Colors.white),
                      decoration: _fieldDecoration(
                          icon: Icons.badge_rounded,
                          label: 'نام مستعار اختیاری'),
                    ),
                    Gaps.vXs,
                    Text(
                      'ثبت‌نام سریع است؛ اطلاعات کامل را بعداً در پروفایل تکمیل کن. چون پیامک هنوز فعال نیست، اگر قبلاً با این شماره ثبت‌نام کرده‌ای رمز فعلی را هم وارد کن.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context)
                          .textTheme
                          .bodySmall
                          ?.copyWith(color: Colors.white60),
                    ),
                    if (needsCurrentPassword) ...[
                      Gaps.vSm,
                      TextFormField(
                        controller: currentPassword,
                        obscureText: true,
                        style: const TextStyle(color: Colors.white),
                        decoration: _fieldDecoration(
                            icon: Icons.lock_person_rounded,
                            label: 'رمز فعلی این شماره'),
                      ),
                    ],
                  ],
                  Gaps.vSm,
                  TextFormField(
                    controller: pass,
                    obscureText: obscure,
                    style: const TextStyle(color: Colors.white),
                    validator: (v) => (v == null || v.isEmpty)
                        ? 'رمز عبور را وارد کنید'
                        : null,
                    decoration: _fieldDecoration(
                            icon: Icons.lock_rounded, label: 'رمز عبور')
                        .copyWith(
                      suffixIcon: IconButton(
                        onPressed: onToggleObscure,
                        icon: Icon(
                            obscure
                                ? Icons.visibility_rounded
                                : Icons.visibility_off_rounded,
                            color: Colors.white54),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Gaps.vLg,
            FilledButton.icon(
              icon: Icon(isAdmin
                  ? Icons.dashboard_customize_rounded
                  : Icons.login_rounded),
              onPressed: loading ? null : onSubmit,
              style: FilledButton.styleFrom(
                backgroundColor:
                    isAdmin ? const Color(0xFF1C78FF) : const Color(0xFF00D49A),
                foregroundColor:
                    isAdmin ? Colors.white : const Color(0xFF00281D),
              ),
              label: Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: loading
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                            strokeWidth: 2.4, color: Colors.white),
                      )
                    : Text(isAdmin
                        ? 'ورود به مدیریت'
                        : isRegister
                            ? 'ساخت حساب'
                            : 'ورود به قلقلی'),
              ),
            ),
            if (!isAdmin) ...[
              Gaps.vXs,
              TextButton.icon(
                onPressed: onQuickAdmin,
                style: TextButton.styleFrom(foregroundColor: Colors.white70),
                icon: const Icon(Icons.bolt_rounded, size: 18),
                label: const Text('ورود مدیر تست با نام کاربری Admin'),
              ),
            ],
            AnimatedSwitcher(
              duration: Motion.fast,
              child: errorMessage == null
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
                              child: Text(errorMessage!,
                                  style: const TextStyle(color: Colors.white)),
                            ),
                          ],
                        ),
                      ),
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

class _ModeSwitcher extends StatelessWidget {
  final _AuthMode mode;
  final ValueChanged<_AuthMode> onChanged;
  const _ModeSwitcher({required this.mode, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: Corners.rPill,
        border: Border.all(color: Colors.white.withValues(alpha: 0.14)),
      ),
      child: Row(
        children: [
          _segment(context, _AuthMode.login, 'ورود', Icons.login_rounded),
          _segment(context, _AuthMode.register, 'ثبت‌نام',
              Icons.person_add_alt_1_rounded),
          _segment(context, _AuthMode.admin, 'مدیر', Icons.shield_rounded),
        ],
      ),
    );
  }

  Widget _segment(
      BuildContext context, _AuthMode value, String label, IconData icon) {
    final selected = mode == value;
    return Expanded(
      child: GestureDetector(
        onTap: () => onChanged(value),
        child: AnimatedContainer(
          duration: Motion.fast,
          padding: const EdgeInsets.symmetric(vertical: Gaps.sm),
          decoration: BoxDecoration(
            color: selected
                ? Colors.white.withValues(alpha: 0.95)
                : Colors.transparent,
            borderRadius: Corners.rPill,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon,
                  size: 18,
                  color: selected ? const Color(0xFF07111F) : Colors.white70),
              const SizedBox(height: 2),
              Text(
                label,
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w800,
                  color: selected ? const Color(0xFF07111F) : Colors.white70,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
