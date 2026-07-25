import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/badges.dart';
import '../../widgets/state_views.dart';
import '../user/support/attachment_picker.dart';

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
    'answered': 'پاسخ داده شد',
    'pending': 'در انتظار',
    'resolved': 'حل‌شده',
    'closed': 'بسته‌شده'
  };

  List<String> _attachments = [];
  bool _busy = false;

  bool get _selectedClosed => '${_selected?['status']}' == 'closed';

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
    if (mounted) {
      setState(() {
        _tickets = tickets;
        _loading = false;
      });
    }
  }

  Future<void> _open(Map t) async {
    final msgs =
        await widget.api.get('/api/admin/support/tickets/${t['id']}/messages');
    if (mounted) {
      setState(() {
        _selected = t;
        _messages = msgs;
      });
    }
  }

  Future<void> _send() async {
    if (_selected == null) return;
    if (_reply.text.trim().isEmpty && _attachments.isEmpty) {
      _toast('متن پاسخ یا حداقل یک عکس لازم است');
      return;
    }
    setState(() => _busy = true);
    try {
      await widget.api.post(
          '/api/admin/support/tickets/${_selected!['id']}/messages',
          {'message': _reply.text.trim(), 'attachments': _attachments});
      _reply.clear();
      setState(() => _attachments = []);
      await _open(_selected!);
      await _load();
    } catch (e) {
      _toast(apiError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Closing a ticket is what frees the user to open a new one, so it's an
  /// explicit action with a confirmation rather than a side effect.
  Future<void> _setClosed(bool close) async {
    if (_selected == null) return;
    if (close) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('بستن تیکت؟'),
          content: const Text(
              'با بستن تیکت، گفتگو پایان می‌یابد و کاربر می‌تواند تیکت جدیدی ثبت کند.'),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(c, false),
                child: const Text('انصراف')),
            FilledButton(
                onPressed: () => Navigator.pop(c, true),
                child: const Text('بستن تیکت')),
          ],
        ),
      );
      if (ok != true) return;
    }
    setState(() => _busy = true);
    try {
      await widget.api.patch(
          '/api/admin/support/tickets/${_selected!['id']}/${close ? 'close' : 'reopen'}',
          {});
      final refreshed = Map<String, dynamic>.from(_selected!)
        ..['status'] = close ? 'closed' : 'open';
      setState(() => _selected = refreshed);
      await _load();
      _toast(close ? 'تیکت بسته شد' : 'تیکت دوباره باز شد');
    } catch (e) {
      _toast(apiError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _toast(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
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
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if ('${m['message_text'] ?? ''}'.trim().isNotEmpty)
                              Text('${m['message_text']}'),
                            AttachmentGallery(
                                attachments:
                                    (m['attachments'] as List?) ?? const []),
                          ],
                        ),
                      ),
                    )),
                Gaps.vSm,
                if (_selectedClosed)
                  Row(
                    children: [
                      Icon(Icons.lock_outline_rounded,
                          size: 18, color: theme.colorScheme.outline),
                      Gaps.hXs,
                      Expanded(
                          child: Text('این تیکت بسته شده است.',
                              style: theme.textTheme.bodySmall)),
                      TextButton.icon(
                        onPressed: _busy ? null : () => _setClosed(false),
                        icon: const Icon(Icons.lock_open_rounded, size: 18),
                        label: const Text('بازکردن دوباره'),
                      ),
                    ],
                  )
                else ...[
                  TextField(
                      controller: _reply,
                      maxLines: 3,
                      decoration: const InputDecoration(labelText: 'پاسخ')),
                  Gaps.vSm,
                  AttachmentPicker(
                    api: widget.api,
                    urls: _attachments,
                    enabled: !_busy,
                    onChanged: (v) => setState(() => _attachments = v),
                  ),
                  Gaps.vSm,
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton.icon(
                            onPressed: _busy ? null : _send,
                            icon: const Icon(Icons.send_rounded),
                            label: const Text('ارسال پاسخ')),
                      ),
                      Gaps.hXs,
                      OutlinedButton.icon(
                        onPressed: _busy ? null : () => _setClosed(true),
                        icon: const Icon(Icons.check_circle_outline_rounded,
                            size: 18),
                        label: const Text('بستن تیکت'),
                      ),
                    ],
                  ),
                ],
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
