import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/assets.dart';
import '../../core/cosmetics.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/avatar_image.dart';
import '../../widgets/state_views.dart';

/// Private profile editor: dense 2-column layout + full avatar grid showing all 10 avatars and club crests.
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
  String? _loadError;
  bool _saving = false;
  bool _changingPassword = false;
  String? _message;
  bool _messageIsError = false;
  String? _passwordMessage;
  bool _passwordMessageIsError = false;
  List _myClubs = const [];
  List _leagueHistory = const [];
  Map<String, dynamic> _cosmetics = const {};

  @override
  void initState() {
    super.initState();
    _load();
    _loadLeagueHistory();
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

  Future<void> _loadLeagueHistory() async {
    try {
      final res = await widget.api.get('/api/profile/league-history');
      if (!mounted) return;
      setState(() {
        _leagueHistory = res is List
            ? res
            : (res is Map && res['seasons'] is List
                ? res['seasons'] as List
                : const []);
      });
    } catch (_) {}
  }

  Future<void> _load() async {
    try {
      final batch =
          await widget.api.getAll(['/api/profile', '/api/clubs']);
      if (!mounted) return;
      final profile = batch[0] is Map ? batch[0] as Map : const {};
      final u = profile['user'] ?? {};
      final clubs = (batch[1] is Map ? batch[1]['mine'] : null) ?? [];
      setState(() {
        _first.text = '${u['first_name'] ?? ''}';
        _last.text = '${u['last_name'] ?? ''}';
        _nick.text = '${u['nickname'] ?? ''}';
        _bank.text = '${u['bank_account'] ?? ''}';
        _age.text = u['age'] != null ? '${u['age']}' : '';
        _city.text = '${u['city'] ?? ''}';
        _province.text = '${u['province'] ?? ''}';
        final key = '${u['profile_avatar_key'] ?? ''}';
        if (key.isNotEmpty) _selectedAvatar = key;
        _myClubs = clubs is List ? clubs : const [];
        _cosmetics = profile['cosmetics'] is Map
            ? Map<String, dynamic>.from(profile['cosmetics'] as Map)
            : <String, dynamic>{};
        _loaded = true;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadError = apiError(e);
        _loaded = true;
      });
    }
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
        _message = 'پروفایل با موفقیت ذخیره شد';
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

    if (_loadError != null) {
      return RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(Gaps.md),
          children: [
            const SizedBox(height: 40),
            ErrorBanner(message: _loadError!, onRetry: _load),
          ],
        ),
      );
    }

    return Container(
      decoration: profileBackgroundDecoration(_cosmetics['profileBackground'] as String?),
      child: ListView(
      padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.sm, Gaps.md, Gaps.xxl),
      children: [
        // ── League History ──
        if (_leagueHistory.isNotEmpty) ...[
          AppCard(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  const Icon(Icons.emoji_events_rounded, color: Color(0xFFFFD166), size: 18),
                  Gaps.hXs,
                  Text('سابقه رتبه‌های لیگ ماهانه', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                ]),
                const SizedBox(height: 6),
                for (final raw in _leagueHistory)
                  Builder(builder: (ctx) {
                    final h = Map<String, dynamic>.from(raw as Map);
                    final rank = h['rank'] as int? ?? 0;
                    final prize = (h['prizeAmount'] as num?) ?? 0;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Row(
                        children: [
                          Image.asset(medalAsset(rank), width: 18, height: 18, fit: BoxFit.contain, cacheWidth: 40),
                          Gaps.hXs,
                          Expanded(
                            child: Text('${h['monthYear']} · رتبه ${faNum(rank)} (${faNum(h['points'])} امتیاز)',
                                style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700)),
                          ),
                          if (prize > 0)
                            Text('${faNum(prize)} تومان',
                                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w900, color: Color(0xFF84CC16))),
                        ],
                      ),
                    );
                  }),
              ],
            ),
          ),
          Gaps.vSm,
        ],

        // ── Main Profile Form ──
        AppCard(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  CosmeticAvatarFrame(
                    frame: _cosmetics['frame'] as String?,
                    child: AvatarImage(keyName: _selectedAvatar, radius: 26, ring: true),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('اطلاعات کاربری و پروفایل',
                            style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w900)),
                        const SizedBox(height: 2),
                        DisplayName(
                          name: _nick.text.isEmpty ? 'کاربر' : _nick.text,
                          cosmetics: _cosmetics,
                          showTitle: true,
                          style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w900),
                        ),
                        const SizedBox(height: 2),
                        const Text('اطلاعات شخصی فقط برای مدیریت جهت واریز جوایز محفوظ است.',
                            style: TextStyle(fontSize: 10.5, color: Colors.white60)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // ── All 10 Avatars Grid (100% visible & selectable) ──
              const Text('انتخاب آواتار پروفایل (۱۰ مدل اختصاصی):', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                alignment: WrapAlignment.start,
                children: [
                  for (final a in avatarFiles)
                    _AvatarChoice(
                      selected: _selectedAvatar == a,
                      onTap: () => setState(() => _selectedAvatar = a),
                      child: CircleAvatar(
                        radius: 21,
                        backgroundImage: ResizeImage(AssetImage(avatarAsset(a)), width: 90),
                      ),
                    ),
                ],
              ),

              if (_myClubs.isNotEmpty) ...[
                const SizedBox(height: 12),
                const Text('نشان باشگاه‌های فعال شما:', style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: Color(0xFFFFD166))),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final c in _myClubs)
                      _AvatarChoice(
                        selected: _selectedAvatar == 'club:${c['slug']}',
                        onTap: () => setState(() => _selectedAvatar = 'club:${c['slug']}'),
                        child: CircleAvatar(
                          radius: 21,
                          backgroundColor: Colors.white.withValues(alpha: 0.1),
                          child: Padding(
                            padding: const EdgeInsets.all(3),
                            child: Image.asset(clubAsset('${c['slug']}'), fit: BoxFit.contain, cacheWidth: 90),
                          ),
                        ),
                      ),
                  ],
                ),
              ],

              const SizedBox(height: 14),

              // ── 2-Column Fields Grid ──
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _first,
                      decoration: const InputDecoration(labelText: 'نام', isDense: true),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: _last,
                      decoration: const InputDecoration(labelText: 'نام خانوادگی', isDense: true),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    flex: 2,
                    child: TextField(
                      controller: _nick,
                      decoration: const InputDecoration(labelText: 'نام مستعار چت و بازی', isDense: true),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    flex: 1,
                    child: TextField(
                      controller: _age,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'سن', isDense: true),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _province,
                      decoration: const InputDecoration(labelText: 'استان', isDense: true),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: _city,
                      decoration: const InputDecoration(labelText: 'شهر', isDense: true),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _bank,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'شماره کارت یا شبا بانکی (جهت واریز جوایز نقدی)',
                  prefixIcon: Icon(Icons.credit_card_rounded, size: 20),
                  isDense: true,
                ),
              ),

              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: _saving ? null : _save,
                icon: _saving
                    ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.save_rounded, size: 18),
                label: const Text('ذخیره تغییرات پروفایل', style: TextStyle(fontWeight: FontWeight.w900)),
              ),
              if (_message != null) ...[
                const SizedBox(height: 6),
                Text(_message!,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: _messageIsError ? theme.colorScheme.error : const Color(0xFF34D399))),
              ],
            ],
          ),
        ),

        Gaps.vSm,

        // ── Password Change Section ──
        AppCard(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const Icon(Icons.lock_reset_rounded, size: 18, color: Color(0xFF38BDF8)),
                  Gaps.hXs,
                  Text('تغییر رمز عبور', style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _currentPassword,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: 'رمز فعلی', isDense: true),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: _newPassword,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: 'رمز جدید', isDense: true),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              ElevatedButton(
                onPressed: _changingPassword ? null : _changePassword,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.white.withValues(alpha: 0.12),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                child: Text(_changingPassword ? 'در حال تغییر...' : 'ثبت رمز عبور جدید',
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12)),
              ),
              if (_passwordMessage != null) ...[
                const SizedBox(height: 4),
                Text(_passwordMessage!,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        color: _passwordMessageIsError ? theme.colorScheme.error : const Color(0xFF34D399))),
              ],
            ],
          ),
        ),
      ],
    ));
  }
}

class _AvatarChoice extends StatelessWidget {
  const _AvatarChoice({
    required this.selected,
    required this.onTap,
    required this.child,
  });

  final bool selected;
  final VoidCallback onTap;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(30),
      child: Container(
        padding: const EdgeInsets.all(2),
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(
            color: selected ? const Color(0xFF22E7A6) : Colors.transparent,
            width: 2.2,
          ),
        ),
        child: child,
      ),
    );
  }
}
