import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../core/assets.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/avatar_image.dart';
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
  String _selectedAvatar = avatarFiles.first;
  bool _loaded = false;
  bool _saving = false;
  String? _message;
  bool _messageIsError = false;

  @override
  void initState() {
    super.initState();
    _load();
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

  @override
  Widget build(BuildContext context) {
    if (!_loaded) return const LoadingView();
    final theme = Theme.of(context);

    return ListView(
      padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
      children: [
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ClipRRect(
                  borderRadius: Corners.rLg,
                  child: Image.asset('assets/brand/profile_banner.webp',
                      height: 128, fit: BoxFit.cover)),
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
                children: avatarFiles
                    .map((a) => GestureDetector(
                          onTap: () => setState(() => _selectedAvatar = a),
                          child: AnimatedContainer(
                            duration: Motion.fast,
                            padding: const EdgeInsets.all(3),
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: _selectedAvatar == a
                                    ? theme.colorScheme.primary
                                    : Colors.transparent,
                                width: 3,
                              ),
                            ),
                            child: CircleAvatar(
                                radius: 24,
                                backgroundImage: AssetImage(avatarAsset(a))),
                          ),
                        ))
                    .toList(),
              ),
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
      ],
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
