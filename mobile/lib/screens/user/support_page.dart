import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/badges.dart';
import '../../widgets/state_views.dart';

/// User-facing support tickets: create + list, same contract as legacy
/// `SupportPage`.
class SupportPage extends StatefulWidget {
  final ApiClient api;
  const SupportPage({super.key, required this.api});

  @override
  State<SupportPage> createState() => _SupportPageState();
}

class _SupportPageState extends State<SupportPage> {
  final _subject = TextEditingController();
  final _message = TextEditingController();
  List _tickets = [];
  bool _loading = true;
  bool _sending = false;

  static const _statusLabels = {
    'open': 'باز',
    'pending': 'در انتظار',
    'resolved': 'حل‌شده',
    'closed': 'بسته‌شده'
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _subject.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final d = await widget.api.get('/api/support/tickets');
    if (mounted)
      setState(() {
        _tickets = d;
        _loading = false;
      });
  }

  Future<void> _submit() async {
    if (_subject.text.trim().isEmpty || _message.text.trim().isEmpty) return;
    setState(() => _sending = true);
    try {
      await widget.api.post('/api/support/tickets',
          {'subject': _subject.text, 'message': _message.text});
      _subject.clear();
      _message.clear();
      await _load();
    } catch (e) {
      if (mounted)
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(apiError(e))));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    final theme = Theme.of(context);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
        children: [
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('تیکت جدید پشتیبانی', style: theme.textTheme.titleLarge),
                Gaps.vMd,
                TextField(
                    controller: _subject,
                    decoration: const InputDecoration(
                        labelText: 'موضوع',
                        prefixIcon: Icon(Icons.subject_rounded))),
                Gaps.vSm,
                TextField(
                    controller: _message,
                    decoration: const InputDecoration(labelText: 'پیام'),
                    maxLines: 4),
                Gaps.vMd,
                FilledButton.icon(
                  onPressed: _sending ? null : _submit,
                  icon: _sending
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2.2, color: Colors.white))
                      : const Icon(Icons.send_rounded),
                  label: const Text('ارسال تیکت'),
                ),
              ],
            ),
          ),
          Gaps.vLg,
          if (_tickets.isEmpty)
            const AppCard(
                child: EmptyState(
                    icon: Icons.support_agent_rounded,
                    title: 'هنوز تیکتی ثبت نکرده‌اید'))
          else
            ..._tickets.map((t) => Padding(
                  padding: const EdgeInsets.only(bottom: Gaps.sm),
                  child: AppCard(
                    padding: const EdgeInsets.all(Gaps.md),
                    child: Row(
                      children: [
                        Expanded(
                            child: Text(t['subject'] ?? '',
                                style: theme.textTheme.titleSmall,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis)),
                        Gaps.hSm,
                        StatusBadge(
                            status: t['status'] ?? '', labels: _statusLabels),
                      ],
                    ),
                  ),
                )),
        ],
      ),
    );
  }
}
