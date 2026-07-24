import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import 'widgets/form_section.dart';

/// Broadcast-notification composer. Same endpoint as legacy
/// `AdminNotifications`.
class AdminNotifications extends StatefulWidget {
  final ApiClient api;
  const AdminNotifications({super.key, required this.api});

  @override
  State<AdminNotifications> createState() => _AdminNotificationsState();
}

class _AdminNotificationsState extends State<AdminNotifications> {
  final _title = TextEditingController();
  final _body = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_title.text.trim().isEmpty && _body.text.trim().isEmpty) return;
    setState(() => _sending = true);
    try {
      await widget.api.post('/api/admin/notifications/broadcast',
          {'title': _title.text, 'body': _body.text});
      _title.clear();
      _body.clear();
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('اطلاعیه ارسال شد')));
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
          title: 'ارسال اطلاعیه همگانی',
          subtitle: 'به همه‌ی کاربران فعال ارسال می‌شود.',
          children: [
            TextField(
                controller: _title,
                decoration: const InputDecoration(
                    labelText: 'عنوان', prefixIcon: Icon(Icons.title_rounded))),
            TextField(
                controller: _body,
                maxLines: 5,
                decoration: const InputDecoration(labelText: 'متن')),
            FilledButton.icon(
              onPressed: _sending ? null : _send,
              icon: _sending
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2.2, color: Colors.white))
                  : const Icon(Icons.campaign_rounded),
              label: const Text('ارسال'),
            ),
          ],
        ),
      ],
    );
  }
}
