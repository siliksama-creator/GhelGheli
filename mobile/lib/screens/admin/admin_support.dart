import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/badges.dart';
import '../../widgets/state_views.dart';

/// Support-ticket inbox + reply thread. Same endpoints as legacy
/// `AdminSupport`. Uses a responsive two-pane layout on wide screens and a
/// stacked layout on phones (list, then the open thread below it).
class AdminSupport extends StatefulWidget {
  final ApiClient api;
  const AdminSupport({super.key, required this.api});

  @override
  State<AdminSupport> createState() => _AdminSupportState();
}

class _AdminSupportState extends State<AdminSupport> {
  List _tickets = [];
  List _messages = [];
  Map? _selected;
  bool _loading = true;
  final _reply = TextEditingController();

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
    _reply.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final tickets = await widget.api.get('/api/admin/support/tickets');
    if (mounted)
      setState(() {
        _tickets = tickets;
        _loading = false;
      });
  }

  Future<void> _open(Map t) async {
    final msgs =
        await widget.api.get('/api/admin/support/tickets/${t['id']}/messages');
    if (mounted)
      setState(() {
        _selected = t;
        _messages = msgs;
      });
  }

  Future<void> _send() async {
    if (_selected == null || _reply.text.trim().isEmpty) return;
    await widget.api.post(
        '/api/admin/support/tickets/${_selected!['id']}/messages',
        {'message': _reply.text});
    _reply.clear();
    await _open(_selected!);
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    final theme = Theme.of(context);
    final isWide = Breakpoints.isTablet(MediaQuery.sizeOf(context).width);

    final list = AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('تیکت‌ها', style: theme.textTheme.titleLarge),
          Gaps.vSm,
          if (_tickets.isEmpty)
            const EmptyState(
                icon: Icons.inbox_rounded, title: 'تیکتی وجود ندارد')
          else
            ..._tickets.map((t) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  selected: _selected?['id'] == t['id'],
                  selectedTileColor:
                      theme.colorScheme.primary.withValues(alpha: 0.1),
                  shape: RoundedRectangleBorder(borderRadius: Corners.rMd),
                  title: Text('${t['mobile']} — ${t['subject']}',
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  subtitle: Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: StatusBadge(
                          status: t['status'] ?? '', labels: _statusLabels)),
                  onTap: () => _open(Map.from(t)),
                )),
        ],
      ),
    );

    final thread = _selected == null
        ? const AppCard(
            child: EmptyState(
                icon: Icons.mark_email_read_outlined,
                title: 'یک تیکت را برای پاسخ انتخاب کنید'))
        : AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('پاسخ به: ${_selected!['subject']}',
                    style: theme.textTheme.titleLarge),
                Gaps.vSm,
                ..._messages.map((m) => Align(
                      alignment: m['sender_type'] == 'admin'
                          ? Alignment.centerLeft
                          : Alignment.centerRight,
                      child: Container(
                        margin: const EdgeInsets.symmetric(vertical: 4),
                        padding: const EdgeInsets.all(Gaps.sm),
                        constraints: const BoxConstraints(maxWidth: 320),
                        decoration: BoxDecoration(
                          color: m['sender_type'] == 'admin'
                              ? theme.colorScheme.primary
                                  .withValues(alpha: 0.18)
                              : theme.colorScheme.surfaceContainerHighest,
                          borderRadius: Corners.rMd,
                        ),
                        child: Text(m['message_text']),
                      ),
                    )),
                Gaps.vSm,
                TextField(
                    controller: _reply,
                    maxLines: 3,
                    decoration: const InputDecoration(labelText: 'پاسخ')),
                Gaps.vSm,
                FilledButton.icon(
                    onPressed: _send,
                    icon: const Icon(Icons.send_rounded),
                    label: const Text('ارسال پاسخ')),
              ],
            ),
          );

    if (isWide) {
      return Padding(
        padding: const EdgeInsets.all(Gaps.lg),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(flex: 2, child: list),
            Gaps.hMd,
            Expanded(flex: 3, child: thread),
          ],
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
      children: [list, Gaps.vMd, thread],
    );
  }
}
