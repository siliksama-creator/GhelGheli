import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/assets.dart';
import '../../core/cosmetics.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/avatar_image.dart';
import '../../widgets/safe_image.dart';
import '../../widgets/state_views.dart';

/// Private profile editor: same fields & PATCH /api/profile payload as the
/// legacy `ProfilePage`.
class ProfilePage extends StatefulWidget {
  final ApiClient api;
  final Future<void> Function() reloadProfile;
  const ProfilePage(
      {super.key, required this.api, required this.reloadProfile});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  final _first = TextEditingController();
  final _last = TextEditingController();
  final _nick = TextEditingController();
  final _bank = TextEditingController();
  final _age = TextEditingController();
  final _city = TextEditingController();
  final _province = TextEditingController();
  final _currentPassword = TextEditingController();
  final _newPassword = TextEditingController();
  String _selectedAvatar = avatarFiles.first;
  bool _loaded = false;
  bool _saving = false;
  bool _changingPassword = false;
  String? _message;
  bool _messageIsError = false;
  String? _passwordMessage;
  bool _passwordMessageIsError = false;
  // Physical prizes the user has won. Cash rewards go straight to the wallet;
  // physical ones are displayed here so there is a visible record of them.
  List _trophies = const [];
  // Past league finishes. monthly_league_points is wiped each month, so this
  // is the only lasting record of "I came 3rd in Mordad and won 250,000".
  // Crests of clubs the user belongs to. They can be worn as an avatar, so
  // they live in the SAME picker as the bundled ones — to the user they are
  // just more avatars, and splitting them would feel like two settings.
  List _myClubs = const [];
  List _leagueHistory = const [];

  @override
  void initState() {
    super.initState();
    _load();
    _loadTrophies();
    _loadLeagueHistory();
    _loadClubs();
  }

  Future<void> _loadLeagueHistory() async {
    try {
      final r = await widget.api.get('/api/profile/league-history');
      if (!mounted) return;
      setState(() => _leagueHistory = (r['seasons'] as List?) ?? const []);
    } catch (_) {
      // Decorative; must not block the profile form.
    }
  }

  Future<void> _loadClubs() async {
    try {
      final r = await widget.api.get('/api/clubs');
      if (!mounted) return;
      setState(() => _myClubs = (r['mine'] as List?) ?? const []);
    } catch (_) {
      // Optional: a user in no club, or a failed call, just sees the ten
      // bundled avatars. It must never block the profile form.
    }
  }

  Future<void> _loadTrophies() async {
    try {
      final r = await widget.api.get('/api/profile/trophies');
      if (!mounted) return;
      setState(() => _trophies = (r['trophies'] as List?) ?? const []);
    } catch (_) {
      // The shelf is decorative; a failure must not block the profile form.
    }
  }

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    _nick.dispose();
    _bank.dispose();
    _age.dispose();
    _city.dispose();
    _province.dispose();
    _currentPassword.dispose();
    _newPassword.dispose();
    super.dispose();
  }


  Future<void> _load() async {
    final d = await widget.api.get('/api/profile');
    final u = Map<String, dynamic>.from(d['user']);
    _first.text = u['first_name'] ?? '';
    _last.text = u['last_name'] ?? '';
    _nick.text = u['nickname'] ?? '';
    _bank.text = u['bank_account'] ?? '';
    _age.text = '${u['age'] ?? ''}';
    _city.text = u['city'] ?? '';
    _province.text = u['province'] ?? '';
    _selectedAvatar = u['profile_avatar_key'] ?? avatarFiles.first;
    if (mounted) setState(() => _loaded = true);
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _message = null;
    });
    try {
      await widget.api.patch('/api/profile', {
        'firstName': _first.text,
        'lastName': _last.text,
        'nickname': _nick.text,
        'bankAccount': _bank.text,
        'age': int.tryParse(_age.text),
        'city': _city.text,
        'province': _province.text,
        'profileAvatarKey': _selectedAvatar,
      });
      await widget.reloadProfile();
      if (!mounted) return;
      setState(() {
        _message = 'پروفایل ذخیره شد';
        _messageIsError = false;
      });
    } catch (e) {
      setState(() {
        _message = apiError(e);
        _messageIsError = true;
      });
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  // Self-service password change. Since the SMS gateway isn't wired up yet,
  // there is no "forgot password" flow that can text a reset code — this is
  // the only safe way a signed-in user can change their password (support
  // can also set a temporary one from the admin panel if the user is
  // locked out entirely).
  Future<void> _changePassword() async {
    setState(() {
      _changingPassword = true;
      _passwordMessage = null;
    });
    try {
      await widget.api.post('/api/profile/change-password', {
        'currentPassword': _currentPassword.text,
        'newPassword': _newPassword.text,
      });
      _currentPassword.clear();
      _newPassword.clear();
      // The request can outlive this screen — the user may go back while it
      // is in flight. setState() after dispose() throws, and in a release
      // build that is a red error screen rather than a caught exception.
      if (!mounted) return;
      setState(() {
        _passwordMessage = 'رمز عبور با موفقیت تغییر کرد';
        _passwordMessageIsError = false;
      });
    } catch (e) {
      setState(() {
        _passwordMessage = apiError(e);
        _passwordMessageIsError = true;
      });
    } finally {
      if (mounted) setState(() => _changingPassword = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_loaded) return const LoadingView();
    final theme = Theme.of(context);

    return ListView(
      padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
      children: [
        if (_leagueHistory.isNotEmpty) ...[
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('سابقهٔ لیگ 🏆',
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w800)),
                Text(
                    'امتیاز لیگ آخر هر ماه صفر می‌شود، ولی رتبه و جایزه‌ات '
                    'اینجا می‌ماند.',
                    style: theme.textTheme.bodySmall),
                Gaps.vXs,
                for (final raw in _leagueHistory)
                  Builder(builder: (ctx) {
                    final h = Map<String, dynamic>.from(raw as Map);
                    final rank = h['rank'] as int? ?? 0;
                    final medal = rank == 1
                        ? '🥇'
                        : rank == 2
                            ? '🥈'
                            : rank == 3
                                ? '🥉'
                                : '🏅';
                    final prize = (h['prizeAmount'] as num?) ?? 0;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: Gaps.xs),
                      child: Row(
                        children: [
                          Text(medal, style: const TextStyle(fontSize: 19)),
                          Gaps.hXs,
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('${h['monthYear']} · رتبهٔ ${faNum(rank)}',
                                    style: theme.textTheme.titleSmall),
                                Text('${faNum(h['points'])} امتیاز',
                                    style: theme.textTheme.labelSmall),
                              ],
                            ),
                          ),
                          if (prize > 0)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: Gaps.xs, vertical: 3),
                              decoration: BoxDecoration(
                                color: const Color(0xFFB5EF58)
                                    .withValues(alpha: 0.14),
                                borderRadius: Corners.rPill,
                              ),
                              child: Text('${faNum(prize)} تومان',
                                  style: const TextStyle(
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w800,
                                      color: Color(0xFF84CC16))),
                            ),
                        ],
                      ),
                    );
                  }),
              ],
            ),
          ),
          Gaps.vMd,
        ],
        if (_trophies.isNotEmpty) ...[
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('جوایز دریافتی 🏆',
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w800)),
                Gaps.vXs,
                SizedBox(
                  height: 118,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: _trophies.length,
                    separatorBuilder: (_, __) => Gaps.hXs,
                    itemBuilder: (_, i) {
                      final t = Map<String, dynamic>.from(_trophies[i] as Map);
                      final pending = t['status'] == 'pending';
                      return SizedBox(
                        width: 92,
                        child: Column(
                          children: [
                            Stack(
                              children: [
                                ClipRRect(
                                  borderRadius: Corners.rMd,
                                  child: SafeImage(
                                      url: fullAssetUrl(t['image_url']),
                                      width: 92,
                                      height: 78,
                                      fallbackEmoji: '🎁'),
                                ),
                                if (pending)
                                  Positioned(
                                    top: 4,
                                    right: 4,
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                          horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: const Color(0xFFF2A93B),
                                        borderRadius: Corners.rPill,
                                      ),
                                      child: const Text('در انتظار',
                                          style: TextStyle(
                                              fontSize: 9,
                                              fontWeight: FontWeight.w800,
                                              color: Color(0xFF2A1A00))),
                                    ),
                                  ),
                              ],
                            ),
                            Gaps.vXxs,
                            Text('${t['name'] ?? 'جایزه'}',
                                maxLines: 2,
                                textAlign: TextAlign.center,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.labelSmall),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
          Gaps.vMd,
        ],
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ClipRRect(
                  borderRadius: Corners.rLg,
                  // cacheWidth, not cacheHeight: BoxFit.cover in a box wider
                  // than the source scales by WIDTH, so a height hint
                  // constrains the axis that does not bind. The asset is
                  // pre-cropped to the displayed aspect, so its native 820
                  // width is both cheaper and sharper than the old hint.
                  child: Image.asset('assets/brand/profile_banner.webp',
                      height: 128, fit: BoxFit.cover, cacheWidth: 820)),
              Gaps.vMd,
              Text('تکمیل پروفایل خصوصی', style: theme.textTheme.headlineSmall),
              Gaps.vXxs,
              Text(
                'این اطلاعات فقط برای مدیر قابل مشاهده است؛ در چت فقط نام مستعار و عکس پروفایل دیده می‌شود.',
                style: theme.textTheme.bodySmall,
              ),
              Gaps.vLg,
              Center(
                  child: AvatarImage(
                      keyName: _selectedAvatar, radius: 46, ring: true)),
              Gaps.vLg,
              Text('انتخاب آواتار', style: theme.textTheme.titleSmall),
              Gaps.vSm,
              Wrap(
                spacing: Gaps.sm,
                runSpacing: Gaps.sm,
                children: [
                  for (final a in avatarFiles)
                    _AvatarChoice(
                      selected: _selectedAvatar == a,
                      onTap: () => setState(() => _selectedAvatar = a),
                      child: CircleAvatar(
                          radius: 24,
                          backgroundImage: AssetImage(avatarAsset(a))),
                    ),
                  // Club crests the user has joined, in the same picker.
                  for (final c in _myClubs)
                    _AvatarChoice(
                      selected: _selectedAvatar == 'club:${c['slug']}',
                      onTap: () => setState(
                          () => _selectedAvatar = 'club:${c['slug']}'),
                      child: CircleAvatar(
                        radius: 24,
                        backgroundColor:
                            theme.colorScheme.onSurface.withValues(alpha: 0.06),
                        // A crest is not a photo: pad it inside the circle
                        // instead of letting a round clip eat the shield's
                        // corners.
                        child: Padding(
                          padding: const EdgeInsets.all(5),
                          child: Image.asset(clubAsset('${c['slug']}'),
                              fit: BoxFit.contain,
                              cacheWidth: 150,
                              errorBuilder: (_, __, ___) =>
                                  const Icon(Icons.shield_outlined, size: 22)),
                        ),
                      ),
                    ),
                ],
              ),
              if (_myClubs.isNotEmpty) ...[
                Gaps.vXs,
                Text(
                  '🛡️ نشان باشگاه‌هایی که عضوشان هستی هم می‌تواند عکس '
                  'پروفایلت باشد.',
                  style: theme.textTheme.labelSmall,
                ),
              ],
              Gaps.vXl,
              _FieldGroup(children: [
                TextField(
                    controller: _first,
                    decoration: const InputDecoration(
                        labelText: 'نام',
                        prefixIcon: Icon(Icons.badge_outlined))),
                TextField(
                    controller: _last,
                    decoration: const InputDecoration(
                        labelText: 'نام خانوادگی',
                        prefixIcon: Icon(Icons.badge_outlined))),
                TextField(
                    controller: _nick,
                    decoration: const InputDecoration(
                        labelText: 'نام مستعار عمومی',
                        prefixIcon: Icon(Icons.face_rounded))),
                TextField(
                    controller: _age,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'سن',
                        prefixIcon: Icon(Icons.cake_outlined))),
                TextField(
                    controller: _province,
                    decoration: const InputDecoration(
                        labelText: 'استان',
                        prefixIcon: Icon(Icons.map_outlined))),
                TextField(
                    controller: _city,
                    decoration: const InputDecoration(
                        labelText: 'محل زندگی / شهر',
                        prefixIcon: Icon(Icons.location_city_rounded))),
                TextField(
                    controller: _bank,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'شماره کارت بانکی / شبا',
                        prefixIcon: Icon(Icons.account_balance_outlined))),
              ]),
              Gaps.vLg,
              FilledButton.icon(
                onPressed: _saving ? null : _save,
                icon: _saving
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2.2, color: Colors.white))
                    : const Icon(Icons.save_rounded),
                label: const Text('ذخیره پروفایل'),
              ),
              if (_message != null) ...[
                Gaps.vSm,
                _messageIsError
                    ? ErrorBanner(message: _message!)
                    : Container(
                        padding: const EdgeInsets.all(Gaps.sm),
                        decoration: BoxDecoration(
                            color: theme.colorScheme.primary
                                .withValues(alpha: 0.12),
                            borderRadius: Corners.rMd),
                        child: Row(children: [
                          Icon(Icons.check_circle_rounded,
                              color: theme.colorScheme.primary, size: 18),
                          Gaps.hXs,
                          Expanded(
                              child: Text(_message!,
                                  style: theme.textTheme.bodySmall)),
                        ]),
                      ),
              ],
            ],
          ),
        ),
        Gaps.vMd,
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('تغییر رمز عبور', style: theme.textTheme.headlineSmall),
              Gaps.vXxs,
              Text(
                'چون فعلاً سامانه پیامک فعال نیست، بازیابی خودکار رمز در دسترس نیست. رمز را فقط با وارد کردن رمز فعلی می‌توانید عوض کنید. اگر رمز را فراموش کرده‌اید، از پشتیبانی بخواهید یک رمز موقت برایتان تنظیم کند.',
                style: theme.textTheme.bodySmall,
              ),
              Gaps.vLg,
              _FieldGroup(children: [
                TextField(
                    controller: _currentPassword,
                    obscureText: true,
                    decoration: const InputDecoration(
                        labelText: 'رمز فعلی',
                        prefixIcon: Icon(Icons.lock_outline_rounded))),
                TextField(
                    controller: _newPassword,
                    obscureText: true,
                    decoration: const InputDecoration(
                        labelText: 'رمز جدید (حداقل ۶ کاراکتر)',
                        prefixIcon: Icon(Icons.lock_reset_rounded))),
              ]),
              Gaps.vLg,
              FilledButton.icon(
                onPressed: _changingPassword ? null : _changePassword,
                icon: _changingPassword
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2.2, color: Colors.white))
                    : const Icon(Icons.key_rounded),
                label: const Text('تغییر رمز عبور'),
              ),
              if (_passwordMessage != null) ...[
                Gaps.vSm,
                _passwordMessageIsError
                    ? ErrorBanner(message: _passwordMessage!)
                    : Container(
                        padding: const EdgeInsets.all(Gaps.sm),
                        decoration: BoxDecoration(
                            color: theme.colorScheme.primary
                                .withValues(alpha: 0.12),
                            borderRadius: Corners.rMd),
                        child: Row(children: [
                          Icon(Icons.check_circle_rounded,
                              color: theme.colorScheme.primary, size: 18),
                          Gaps.hXs,
                          Expanded(
                              child: Text(_passwordMessage!,
                                  style: theme.textTheme.bodySmall)),
                        ]),
                      ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// Selection ring around one avatar option. Extracted so a bundled avatar
/// and a club crest get identical selection affordance rather than two
/// near-copies drifting apart.
class _AvatarChoice extends StatelessWidget {
  const _AvatarChoice(
      {required this.selected, required this.onTap, required this.child});

  final bool selected;
  final VoidCallback onTap;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: Motion.fast,
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(
            color: selected
                ? Theme.of(context).colorScheme.primary
                : Colors.transparent,
            width: 3,
          ),
        ),
        child: child,
      ),
    );
  }
}

class _FieldGroup extends StatelessWidget {
  final List<Widget> children;
  const _FieldGroup({required this.children});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) Gaps.vSm,
          children[i],
        ],
      ],
    );
  }
}
