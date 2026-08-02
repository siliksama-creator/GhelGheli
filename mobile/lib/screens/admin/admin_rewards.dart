import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../api_client.dart';
import '../../core/money.dart';
import '../../theme/colors.dart';
import '../../theme/tokens.dart';
import '../../widgets/badges.dart';
import '../../widgets/safe_image.dart';
import '../../widgets/state_views.dart';
import 'widgets/form_section.dart';
import 'widgets/image_url_field.dart';

/// Reward-tier + claims administration. Same endpoints as legacy
/// `AdminRewards` (max 30 tiers, cash/physical types, claim status updates).
class AdminRewards extends StatefulWidget {
  final ApiClient api;
  const AdminRewards({super.key, required this.api});

  @override
  State<AdminRewards> createState() => _AdminRewardsState();
}

class _AdminRewardsState extends State<AdminRewards> {
  List _rewards = [];
  List _claims = [];
  List _groups = [];
  String? _groupId;          // group for the tier being created
  final _groupName = TextEditingController();
  String _groupType = 'mixed';
  String _groupAccent = 'emerald';
  bool _groupSaving = false;
  bool _loading = true;
  bool _saving = false;

  final _name = TextEditingController();
  final _points = TextEditingController();
  final _value = TextEditingController();
  final _cash = TextEditingController();
  final _desc = TextEditingController();
  final _maxClaims = TextEditingController(text: '0');
  final _imageUrl = TextEditingController();
  bool _uploadingImage = false;
  String? _imageError;
  String _type = 'cash';

  static const _claimLabels = {
    'pending': 'در انتظار',
    'approved': 'تایید‌شده',
    'paid': 'پرداخت‌شده',
    'rejected': 'رد‌شده'
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    _points.dispose();
    _value.dispose();
    _cash.dispose();
    _desc.dispose();
    _maxClaims.dispose();
    _imageUrl.dispose();
    _groupName.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    // Fan out: three sequential awaits made the admin wait for the sum of the
    // round trips every time the page refreshed.
    final results = await Future.wait([
      widget.api.get('/api/admin/rewards'),
      widget.api.get('/api/admin/reward-claims'),
      widget.api.get('/api/admin/reward-groups'),
    ]);
    final rewards = results[0];
    final claims = results[1];
    final groups = (results[2] as Map)['groups'] as List? ?? [];
    if (mounted) {
      setState(() {
        _rewards = rewards;
        _claims = claims;
        _groups = groups.where((g) => g['id'] != null).toList();
        _loading = false;
      });
    }
  }

  Future<void> _pickRewardImage() async {
    final x = await ImagePicker()
        .pickImage(source: ImageSource.gallery, imageQuality: 82);
    // The gallery is a separate activity and can stay open for minutes; on a
    // low-memory device Android may destroy this one behind it. Checking
    // `x == null` is not enough — the widget itself may be gone.
    if (x == null || !mounted) return;
    setState(() {
      _uploadingImage = true;
      _imageError = null;
    });
    try {
      final url = await widget.api.uploadAdminImage(x.path);
      if (mounted) setState(() => _imageUrl.text = url);
    } catch (e) {
      if (mounted) setState(() => _imageError = apiError(e));
    } finally {
      if (mounted) setState(() => _uploadingImage = false);
    }
  }

  Future<void> _addGroup() async {
    if (_groupName.text.trim().isEmpty) return;
    setState(() => _groupSaving = true);
    try {
      await widget.api.post('/api/admin/reward-groups', {
        'name': _groupName.text.trim(),
        'groupType': _groupType,
        'accent': _groupAccent,
        'displayOrder': _groups.length + 1,
      });
      _groupName.clear();
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('گروه ساخته شد')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(apiError(e))));
    } finally {
      if (mounted) setState(() => _groupSaving = false);
    }
  }

  Future<void> _toggleGroup(Map g) async {
    try {
      await widget.api.patch('/api/admin/reward-groups/${g['id']}',
          {'isActive': !(g['is_active'] == true)});
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(apiError(e))));
    }
  }

  Future<void> _moveTier(String tierId, String? groupId) async {
    try {
      await widget.api
          .patch('/api/admin/rewards/$tierId', {'groupId': groupId});
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('گروه جایزه تغییر کرد')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(apiError(e))));
    }
  }

  Future<void> _add() async {
    if (_rewards.length >= 30) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('حداکثر ۳۰ جایزه قابل تعریف است')));
      return;
    }
    setState(() => _saving = true);
    try {
      await widget.api.post('/api/admin/rewards', {
        'name': _name.text,
        'requiredPoints': int.tryParse(_points.text) ?? 0,
        'rewardType': _type,
        'rewardValue': _value.text,
        'cashAmount': _type == 'cash' ? (Money.parse(_cash.text) ?? 0) : 0,
        'description': _desc.text,
        'imageUrl': _imageUrl.text,
        'displayOrder': _rewards.length + 1,
        'groupId': _groupId,
        'maxClaimsPerUser': int.tryParse(_maxClaims.text) ?? 0,
      });
      _name.clear();
      _points.clear();
      _value.clear();
      _cash.clear();
      _desc.clear();
      _imageUrl.clear();
      _maxClaims.text = '0';
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(apiError(e))));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _setClaimStatus(String id, String s) async {
    await widget.api.patch('/api/admin/reward-claims/$id', {'status': s});
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();

    return ListView(
      padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
      children: [
        FormSection(
          title: 'گروه‌های جایزه',
          children: [
            Text(
              'هر گروه نوار پیشرفت مستقل دارد؛ بعد از دریافت جایزه، نوار همان '
              'گروه از ابتدا شروع می‌شود.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            Gaps.vXs,
            TextField(
                controller: _groupName,
                decoration: const InputDecoration(labelText: 'نام گروه')),
            Gaps.vXs,
            Row(children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _groupType,
                  decoration: const InputDecoration(labelText: 'نوع گروه'),
                  items: const [
                    DropdownMenuItem(value: 'mixed', child: Text('ترکیبی')),
                    DropdownMenuItem(value: 'cash', child: Text('نقدی')),
                    DropdownMenuItem(value: 'physical', child: Text('فیزیکی')),
                  ],
                  onChanged: (v) => setState(() => _groupType = v ?? 'mixed'),
                ),
              ),
              Gaps.hXs,
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _groupAccent,
                  decoration: const InputDecoration(labelText: 'رنگ'),
                  items: const [
                    DropdownMenuItem(value: 'emerald', child: Text('زمردی')),
                    DropdownMenuItem(value: 'gold', child: Text('طلایی')),
                    DropdownMenuItem(value: 'blue', child: Text('آبی')),
                    DropdownMenuItem(value: 'purple', child: Text('بنفش')),
                    DropdownMenuItem(value: 'rose', child: Text('قرمز')),
                  ],
                  onChanged: (v) =>
                      setState(() => _groupAccent = v ?? 'emerald'),
                ),
              ),
            ]),
            Gaps.vXs,
            FilledButton(
              onPressed: _groupSaving ? null : _addGroup,
              child: Text(_groupSaving ? 'در حال ذخیره...' : 'ساخت گروه'),
            ),
            if (_groups.isNotEmpty) ...[
              Gaps.vSm,
              for (final g in _groups)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  title: Text('${g['name']}'),
                  subtitle: Text(g['group_type'] == 'cash'
                      ? 'نقدی'
                      : g['group_type'] == 'physical'
                          ? 'فیزیکی'
                          : 'ترکیبی'),
                  trailing: TextButton(
                    onPressed: () => _toggleGroup(g),
                    child: Text(
                        g['is_active'] == true ? 'غیرفعال کن' : 'فعال کن'),
                  ),
                ),
            ],
          ],
        ),
        Gaps.vMd,
        FormSection(
          title: 'جایزه جدید (${faNum(_rewards.length)}/۳۰)',
          children: [
            DropdownButtonFormField<String?>(
              initialValue: _groupId,
              decoration: const InputDecoration(labelText: 'گروه جایزه'),
              items: [
                const DropdownMenuItem<String?>(
                    value: null, child: Text('بدون گروه')),
                for (final g in _groups)
                  DropdownMenuItem<String?>(
                      value: g['id'] as String, child: Text('${g['name']}')),
              ],
              onChanged: (v) => setState(() => _groupId = v),
            ),
            TextField(
                controller: _name,
                decoration: const InputDecoration(labelText: 'نام جایزه')),
            TextField(
                controller: _maxClaims,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                    labelText: 'حداکثر دریافت هر کاربر (۰ = نامحدود)')),
            TextField(
                controller: _points,
                keyboardType: TextInputType.number,
                decoration:
                    const InputDecoration(labelText: 'امتیاز مورد نیاز')),
            ImageUrlField(
                controller: _imageUrl,
                onPick: _pickRewardImage,
                uploading: _uploadingImage,
                error: _imageError,
                label: 'عکس جایزه / آدرس آپلودشده'),
            DropdownButtonFormField<String>(
              initialValue: _type,
              decoration: const InputDecoration(labelText: 'نوع جایزه'),
              items: const [
                DropdownMenuItem(value: 'cash', child: Text('نقدی')),
                DropdownMenuItem(value: 'physical', child: Text('فیزیکی')),
              ],
              onChanged: (v) => setState(() => _type = v!),
            ),
            TextField(
                controller: _value,
                decoration:
                    const InputDecoration(labelText: 'مبلغ / توضیح جایزه')),
            // فقط برای جایزهٔ نقدی: مبلغ عددی که واقعاً به کیف پول واریز
            // می‌شود. فیلد «مبلغ / توضیح» بالا متن آزاد است و ماشین نمی‌تواند
            // رویش حساب کند، پس مبلغ واریزی جدا و عددی گرفته می‌شود.
            if (_type == 'cash')
              TextField(
                controller: _cash,
                keyboardType: TextInputType.number,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  labelText: 'مبلغ واریز به کیف پول (تومان)',
                  prefixIcon: const Icon(Icons.account_balance_wallet_rounded),
                  helperText: (Money.parse(_cash.text) ?? 0) > 0
                      ? 'هنگام «پرداخت شد»، ${Money.withUnit(Money.parse(_cash.text))} به کیف پول واریز می‌شود'
                      : 'صفر = واریز خودکار انجام نمی‌شود',
                  helperStyle: TextStyle(
                      color: (Money.parse(_cash.text) ?? 0) > 0
                          ? BrandColors.emerald
                          : null),
                ),
              ),
            TextField(
                controller: _desc,
                decoration: const InputDecoration(labelText: 'توضیحات')),
            FilledButton.icon(
              onPressed: (_saving || _rewards.length >= 30) ? null : _add,
              icon: _saving
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2.2, color: Colors.white))
                  : const Icon(Icons.save_rounded),
              label: const Text('ذخیره جایزه'),
            ),
          ],
        ),
        Gaps.vMd,
        FormSection(
          title: 'سطح‌های جایزه',
          children: _rewards.isEmpty
              ? [
                  const EmptyState(
                      icon: Icons.card_giftcard_rounded,
                      title: 'هنوز جایزه‌ای تعریف نشده')
                ]
              : _rewards
                  .map<Widget>((r) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: r['image_url'] != null &&
                                '${r['image_url']}'.isNotEmpty
                            ? ClipRRect(
                                borderRadius: Corners.rSm,
                                child: SafeImage(
                                    url: r['image_url'],
                                    width: 48,
                                    height: 48,
                                    fallbackEmoji: '🎁'))
                            : const Icon(Icons.card_giftcard_rounded),
                        title: Text(r['name']),
                        subtitle: Text(
                          (r['cash_amount'] ?? 0) > 0
                              ? '${faNum(r['required_points'])} امتیاز — ${Money.withUnit(r['cash_amount'])}'
                              : '${faNum(r['required_points'])} امتیاز — ${r['reward_value']}',
                        ),
                        trailing: SizedBox(
                          width: 132,
                          child: DropdownButtonFormField<String?>(
                            initialValue: r['group_id'] as String?,
                            isDense: true,
                            decoration: const InputDecoration(
                                labelText: 'گروه', isDense: true),
                            items: [
                              const DropdownMenuItem<String?>(
                                  value: null, child: Text('بدون گروه')),
                              for (final g in _groups)
                                DropdownMenuItem<String?>(
                                    value: g['id'] as String,
                                    child: Text('${g['name']}',
                                        overflow: TextOverflow.ellipsis)),
                            ],
                            onChanged: (v) =>
                                _moveTier(r['id'] as String, v),
                          ),
                        ),
                      ))
                  .toList(),
        ),
        Gaps.vMd,
        FormSection(
          title: 'درخواست‌های جایزه',
          children: _claims.isEmpty
              ? [
                  const EmptyState(
                      icon: Icons.inbox_rounded, title: 'درخواستی وجود ندارد')
                ]
              : _claims
                  .map<Widget>((r) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text('${r['mobile']} — ${r['reward_name']}'),
                        subtitle: Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: StatusBadge(
                                status: r['status'] ?? '',
                                labels: _claimLabels)),
                        trailing: PopupMenuButton<String>(
                          onSelected: (s) => _setClaimStatus(r['id'], s),
                          itemBuilder: (_) => const [
                            PopupMenuItem(
                                value: 'approved', child: Text('تایید')),
                            PopupMenuItem(
                                value: 'paid', child: Text('پرداخت‌شده')),
                            PopupMenuItem(value: 'rejected', child: Text('رد')),
                          ],
                        ),
                      ))
                  .toList(),
        ),
      ],
    );
  }
}
