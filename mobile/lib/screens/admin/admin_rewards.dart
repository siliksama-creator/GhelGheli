import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/badges.dart';
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
  bool _loading = true;
  bool _saving = false;

  final _name = TextEditingController();
  final _points = TextEditingController();
  final _value = TextEditingController();
  final _desc = TextEditingController();
  final _imageUrl = TextEditingController();
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
    _desc.dispose();
    _imageUrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final rewards = await widget.api.get('/api/admin/rewards');
    final claims = await widget.api.get('/api/admin/reward-claims');
    if (mounted)
      setState(() {
        _rewards = rewards;
        _claims = claims;
        _loading = false;
      });
  }

  Future<void> _pickRewardImage() async {
    final x = await ImagePicker()
        .pickImage(source: ImageSource.gallery, imageQuality: 82);
    if (x != null) {
      final url = await widget.api.uploadAdminImage(x.path);
      if (mounted) setState(() => _imageUrl.text = url);
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
        'description': _desc.text,
        'imageUrl': _imageUrl.text,
        'displayOrder': _rewards.length + 1,
      });
      _name.clear();
      _points.clear();
      _value.clear();
      _desc.clear();
      _imageUrl.clear();
      await _load();
    } catch (e) {
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(apiError(e))));
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
          title: 'جایزه جدید (${faNum(_rewards.length)}/۳۰)',
          children: [
            TextField(
                controller: _name,
                decoration: const InputDecoration(labelText: 'نام جایزه')),
            TextField(
                controller: _points,
                keyboardType: TextInputType.number,
                decoration:
                    const InputDecoration(labelText: 'امتیاز مورد نیاز')),
            ImageUrlField(
                controller: _imageUrl,
                onPick: _pickRewardImage,
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
                                child: Image.network(
                                    fullAssetUrl(r['image_url']),
                                    width: 48,
                                    height: 48,
                                    fit: BoxFit.cover))
                            : const Icon(Icons.card_giftcard_rounded),
                        title: Text(r['name']),
                        subtitle: Text(
                            '${faNum(r['required_points'])} امتیاز — ${r['reward_value']}'),
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
