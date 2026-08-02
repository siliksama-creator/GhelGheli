// Threaded ticket conversation.
//
// The user can keep replying for as long as support leaves the ticket open;
// once an admin closes it the composer is replaced by a notice explaining
// that a new ticket can now be filed.
import 'package:flutter/material.dart';

import '../../../api_client.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/app_card.dart';
import '../../../widgets/state_views.dart';
import 'attachment_picker.dart';

class TicketThreadPage extends StatefulWidget {
  const TicketThreadPage({super.key, required this.api, required this.ticket});

  final ApiClient api;
  final Map<String, dynamic> ticket;

  @override
  State<TicketThreadPage> createState() => _TicketThreadPageState();
}

class _TicketThreadPageState extends State<TicketThreadPage> {
  final _reply = TextEditingController();
  final _scroll = ScrollController();
  List _messages = [];
  List<String> _attachments = [];
  Map<String, dynamic> _ticket = {};
  bool _loading = true;
  bool _sending = false;
  String? _error;

  bool get _closed => '${_ticket['status']}' == 'closed';

  @override
  void initState() {
    super.initState();
    _ticket = widget.ticket;
    _load();
  }

  @override
  void dispose() {
    _reply.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final batch = await widget.api.getAll([
        '/api/support/tickets/${_ticket['id']}/messages',
        '/api/support/tickets',
      ]);
      if (!mounted) return;
      final tickets = batch[1] as List;
      final fresh = tickets.firstWhere(
        (t) => '${t['id']}' == '${_ticket['id']}',
        orElse: () => _ticket,
      );
      setState(() {
        _messages = batch[0] as List;
        _ticket = Map<String, dynamic>.from(fresh as Map);
        _loading = false;
        _error = null;
      });
      _jumpToEnd();
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = apiError(e);
        });
      }
    }
  }

  void _jumpToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.jumpTo(_scroll.position.maxScrollExtent);
      }
    });
  }

  Future<void> _send() async {
    if (_reply.text.trim().isEmpty && _attachments.isEmpty) {
      _toast('متن پیام یا حداقل یک عکس لازم است');
      return;
    }
    setState(() => _sending = true);
    try {
      await widget.api.post('/api/support/tickets/${_ticket['id']}/messages', {
        'message': _reply.text.trim(),
        'attachments': _attachments,
      });
      _reply.clear();
      if (!mounted) return;
      setState(() => _attachments = []);
      await _load();
    } catch (e) {
      _toast(apiError(e));
      await _load();
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _toast(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text('${_ticket['subject'] ?? 'تیکت'}',
            overflow: TextOverflow.ellipsis),
        actions: [
          Padding(
            padding: const EdgeInsets.only(left: Gaps.md),
            child: Center(
              child: Text(
                _closed ? 'بسته‌شده' : 'باز',
                style: theme.textTheme.labelMedium?.copyWith(
                  color: _closed
                      ? theme.colorScheme.outline
                      : theme.colorScheme.primary,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          if (_error != null)
            Padding(
              padding: const EdgeInsets.all(Gaps.md),
              child: ErrorBanner(message: _error!),
            ),
          Expanded(
            child: _loading
                ? const LoadingView()
                : (_messages.isEmpty
                    ? const Center(
                        child: EmptyState(
                            icon: Icons.forum_outlined,
                            title: 'پیامی وجود ندارد'))
                    : ListView.builder(
                        controller: _scroll,
                        padding: const EdgeInsets.all(Gaps.md),
                        itemCount: _messages.length,
                        itemBuilder: (_, i) =>
                            _Bubble(message: _messages[i] as Map),
                      )),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                  Gaps.md, Gaps.xs, Gaps.md, Gaps.xs),
              child: _closed
                  ? AppCard(
                      padding: const EdgeInsets.all(Gaps.md),
                      child: Row(
                        children: [
                          Icon(Icons.lock_outline_rounded,
                              size: 18, color: theme.colorScheme.outline),
                          Gaps.hXs,
                          Expanded(
                            child: Text(
                              'این تیکت توسط پشتیبانی بسته شده است. اکنون می‌توانید تیکت جدیدی ثبت کنید.',
                              style: theme.textTheme.bodySmall,
                            ),
                          ),
                        ],
                      ),
                    )
                  : Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        AttachmentPicker(
                          api: widget.api,
                          urls: _attachments,
                          enabled: !_sending,
                          onChanged: (v) => setState(() => _attachments = v),
                        ),
                        Gaps.vXs,
                        Row(
                          children: [
                            Expanded(
                              child: TextField(
                                controller: _reply,
                                minLines: 1,
                                maxLines: 4,
                                decoration: const InputDecoration(
                                    hintText: 'پاسخ شما...',
                                    isDense: true),
                              ),
                            ),
                            Gaps.hXs,
                            FilledButton(
                              onPressed: _sending ? null : _send,
                              child: _sending
                                  ? const SizedBox(
                                      width: 16,
                                      height: 16,
                                      child: CircularProgressIndicator(
                                          strokeWidth: 2.2,
                                          color: Colors.white))
                                  : const Icon(Icons.send_rounded, size: 18),
                            ),
                          ],
                        ),
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message});
  final Map message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fromAdmin = '${message['sender_type']}' == 'admin';
    final text = '${message['message_text'] ?? ''}'.trim();
    final attachments = (message['attachments'] as List?) ?? const [];

    return Align(
      alignment: fromAdmin ? Alignment.centerLeft : Alignment.centerRight,
      child: Container(
        margin: const EdgeInsets.only(bottom: Gaps.sm),
        padding: const EdgeInsets.all(Gaps.sm),
        constraints: BoxConstraints(
            maxWidth: MediaQuery.of(context).size.width * 0.82),
        decoration: BoxDecoration(
          color: fromAdmin
              ? theme.colorScheme.surfaceContainerHighest
              : theme.colorScheme.primary.withValues(alpha: 0.16),
          borderRadius: Corners.rMd,
          border: Border.all(
            color: fromAdmin
                ? theme.colorScheme.outline.withValues(alpha: 0.25)
                : theme.colorScheme.primary.withValues(alpha: 0.4),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              fromAdmin ? 'پشتیبانی' : 'شما',
              style: theme.textTheme.labelSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: fromAdmin
                    ? theme.colorScheme.outline
                    : theme.colorScheme.primary,
              ),
            ),
            if (text.isNotEmpty) ...[
              const SizedBox(height: 3),
              Text(text, style: theme.textTheme.bodyMedium),
            ],
            AttachmentGallery(attachments: attachments),
          ],
        ),
      ),
    );
  }
}
