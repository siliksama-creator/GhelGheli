import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import 'widgets/form_section.dart';

/// استودیوی اعلان‌های هدفمند (بخش‌بندی کاربران با رعایت ساعت تهران ۱۰ تا ۲۲)
class AdminNotifications extends StatefulWidget {
  final ApiClient api;
  const AdminNotifications({super.key, required this.api});

  @override
  State<AdminNotifications> createState() => _AdminNotificationsState();
}

class _AdminNotificationsState extends State<AdminNotifications> {
  final _title = TextEditingController();
  final _body = TextEditingController();
  String _segment = 'all';
  bool _force = false;
  bool _sending = false;
  bool? _fcmConfigured;

  final _segments = const [
    ('all', 'همه کاربران فعال'),
    ('inactive_3d', 'کاربران غایب ۳ روز اخیر (یادآوری بازگشت)'),
    ('top20_league', '۲۰ نفر اول جدول لیگ (رقابت داغ)'),
    ('near_cash_reward', 'کاربران نزدیک به جایزه نقدی'),
    ('plus_users', 'کاربران دارای اشتراک پلاس'),
    ('free_users', 'کاربران بدون اشتراک پلاس'),
  ];

  @override
  void initState() {
    super.initState();
    widget.api.get('/api/admin/notifications/status').then((result) {
      if (!mounted) return;
      setState(() => _fcmConfigured = result is Map && result['fcmConfigured'] == true);
    }).catchError((_) {
      if (mounted) setState(() => _fcmConfigured = false);
    });
  }

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final title = _title.text.trim();
    final body = _body.text.trim();
    if (title.isEmpty || body.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('عنوان و متن را وارد کنید')));
      return;
    }
    setState(() => _sending = true);
    try {
      final r = await widget.api.post('/api/admin/notifications/send-segmented', {
        'segment': _segment,
        'title': title,
        'body': body,
        'force': _force,
      });
      _title.clear();
      _body.clear();
      if (mounted) {
        final msg = r is Map ? r['message']?.toString() : 'اعلان با موفقیت ارسال شد';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg ?? 'ارسال شد')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(apiError(e))));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
      children: [
        FormSection(
          title: 'استودیوی اعلان‌های هدفمند',
          subtitle: 'ارسال نوتیفیکیشن با رعایت ساعت تهران (۱۰:۰۰ تا ۲۲:۰۰) جهت عدم مزاحمت شبانه.',
          children: [
            if (_fcmConfigured != null)
              Container(
                padding: const EdgeInsets.all(Gaps.sm),
                decoration: BoxDecoration(
                  borderRadius: Corners.rMd,
                  color: (_fcmConfigured! ? const Color(0xFF22C55E) : const Color(0xFFF59E0B))
                      .withValues(alpha: 0.12),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.notifications_active_outlined, size: 18),
                    const SizedBox(width: Gaps.xs),
                    Expanded(
                      child: Text(_fcmConfigured!
                          ? 'Firebase فعال است: اعلان درون‌برنامه‌ای و پوش ارسال می‌شود.'
                          : 'Firebase فعال نیست: فقط اعلان درون‌برنامه‌ای ثبت می‌شود.'),
                    ),
                  ],
                ),
              ),
            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: _segment,
              decoration: const InputDecoration(labelText: 'گروه هدف (سگمنت)'),
              items: _segments.map((s) => DropdownMenuItem(value: s.$1, child: Text(s.$2, style: const TextStyle(fontSize: 12.5)))).toList(),
              onChanged: (v) => setState(() => _segment = v ?? 'all'),
            ),
            TextField(
              controller: _title,
              decoration: const InputDecoration(
                labelText: 'عنوان اعلان',
                prefixIcon: Icon(Icons.title_rounded),
              ),
            ),
            TextField(
              controller: _body,
              maxLines: 4,
              decoration: const InputDecoration(labelText: 'متن پیام'),
            ),
            Row(
              children: [
                Checkbox(
                  value: _force,
                  onChanged: (v) => setState(() => _force = v ?? false),
                ),
                const Expanded(
                  child: Text('ارسال اجباری حتی در ساعات شبانه تهران (۲۲ تا ۱۰)',
                      style: TextStyle(fontSize: 11.5, color: Color(0xFFF59E0B))),
                ),
              ],
            ),
            FilledButton.icon(
              onPressed: _sending ? null : _send,
              icon: _sending
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2.2, color: Colors.white))
                  : const Icon(Icons.campaign_rounded),
              label: const Text('ارسال به گروه هدف'),
            ),
          ],
        ),
      ],
    );
  }
}
