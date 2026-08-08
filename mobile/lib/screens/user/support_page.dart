import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/badges.dart';
import '../../widgets/state_views.dart';
import 'support/attachment_picker.dart';
import 'support/ticket_thread.dart';

/// Support tickets.
///
/// Rules enforced by the server and mirrored here so the UI can explain
/// them: one open ticket at a time, at most one new ticket per day, and only
/// an admin can close a ticket. While a ticket is open the user keeps the
/// conversation going inside that thread instead of filing new ones.
class SupportPage extends StatefulWidget {
  final ApiClient api;
  const SupportPage({super.key, required this.api});

  @override
  State<SupportPage> createState() => _SupportPageState();
}

class _SupportPageState extends State<SupportPage> {
  final _subject = TextEditingController();
  final _message = TextEditingController();
  List<String> _attachments = [];
  // نوعِ دقیق: جزئیات در ticket_thread.dart — یک تیکتِ بدشکل نباید
  // کل فهرست را از دسترس خارج کند.
  List<Map<String, dynamic>> _tickets = [];
  Map<String, dynamic>? _quota;
  bool _loading = true;
  bool _sending = false;
  String? _error;

  static const _statusLabels = {
    'open': 'باز',
    'answered': 'پاسخ داده شد',
    'pending': 'در انتظار',
    'resolved': 'حل‌شده',
    'closed': 'بسته‌شده',
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
    try {
      final batch =
          await widget.api.getAll(['/api/support/tickets', '/api/support/quota']);
      if (!mounted) return;
      setState(() {
        _tickets = (batch[0] is List ? batch[0] as List : const [])
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
        _quota = batch[1] is Map
            ? Map<String, dynamic>.from(batch[1] as Map)
            : <String, dynamic>{};
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = apiError(e);
        });
      }
    }
  }

  Future<void> _submit() async {
    if (_subject.text.trim().isEmpty) {
      _toast('موضوع تیکت را وارد کنید');
      return;
    }
    if (_message.text.trim().isEmpty && _attachments.isEmpty) {
      _toast('متن پیام یا حداقل یک عکس لازم است');
      return;
    }
    setState(() => _sending = true);
    try {
      await widget.api.post('/api/support/tickets', {
        'subject': _subject.text.trim(),
        'message': _message.text.trim(),
        'attachments': _attachments,
      });
      _subject.clear();
      _message.clear();
      if (!mounted) return;
      setState(() => _attachments = []);
      _toast('تیکت ثبت شد');
      await _load();
    } catch (e) {
      _toast(apiError(e));
      await _load(); // refresh the quota so the banner reflects reality
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _toast(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  Future<void> _openThread(Map ticket) async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => TicketThreadPage(
        api: widget.api,
        ticket: Map<String, dynamic>.from(ticket),
      ),
    ));
    // ═══════════════════════════════════════════════════════════════════
    // چرا `await` + بررسی mounted، به‌جای `.then()`
    // ═══════════════════════════════════════════════════════════════════
    //
    // شکل قبلی `.then((_) => _load())` بود که دو مشکل داشت:
    //
    //   ۱. کاربر می‌تواند داخل صفحهٔ تیکت باشد و از آنجا کل اپ را به
    //      عقب برگرداند؛ آن‌وقت `_load` روی یک State مرده صدا زده
    //      می‌شد. `_load` خودش `mounted` را بررسی می‌کند، ولی تکیه
    //      کردن به آن یک قرارداد نانوشته است.
    //   ۲. خطای `_load` هیچ‌جا گرفته نمی‌شد و به یک استثنای
    //      مدیریت‌نشده تبدیل می‌شد — این تازه‌سازی بعد از بازگشت از
    //      صفحهٔ تیکت است و شکستنش نباید به کاربر خطا نشان دهد.
    if (!mounted) return;
    try {
      await _load();
    } catch (_) {
      // تازه‌سازیِ پس‌زمینه؛ خودِ `_load` وضعیت خطا را در UI منعکس
      // می‌کند و پیام دومی لازم نیست.
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    final theme = Theme.of(context);
    final canCreate = _quota?['canCreate'] == true;
    final maxAttachments = (_quota?['maxAttachments'] as num?)?.toInt() ?? 5;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.sm, Gaps.md, Gaps.xxl),
        children: [
          if (_error != null) ...[
            ErrorBanner(message: _error!),
            Gaps.vMd,
          ],

          // ── new ticket, or an explanation of why not ──
          if (canCreate)
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Icon(Icons.support_agent_rounded,
                          color: theme.colorScheme.primary, size: 20),
                      Gaps.hXs,
                      Text('تیکت جدید', style: theme.textTheme.titleSmall),
                    ],
                  ),
                  Gaps.vXxs,
                  Text('در هر روز یک تیکت می‌توانید ثبت کنید.',
                      style: theme.textTheme.bodySmall),
                  Gaps.vSm,
                  TextField(
                    controller: _subject,
                    decoration: const InputDecoration(
                        labelText: 'موضوع',
                        prefixIcon: Icon(Icons.label_outline_rounded)),
                  ),
                  Gaps.vSm,
                  TextField(
                    controller: _message,
                    maxLines: 4,
                    decoration: const InputDecoration(
                        labelText: 'شرح مشکل', alignLabelWithHint: true),
                  ),
                  Gaps.vSm,
                  AttachmentPicker(
                    api: widget.api,
                    urls: _attachments,
                    max: maxAttachments,
                    enabled: !_sending,
                    onChanged: (v) => setState(() => _attachments = v),
                  ),
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
                    label: Text(_sending ? 'در حال ارسال...' : 'ارسال تیکت'),
                  ),
                ],
              ),
            )
          else
            _QuotaNotice(
              quota: _quota,
              onOpenTicket: () {
                final open = _quota?['openTicket'];
                if (open is Map) _openThread(open);
              },
            ),

          Gaps.vXl,
          Text('تیکت‌های من', style: theme.textTheme.titleSmall),
          Gaps.vXs,
          if (_tickets.isEmpty)
            const AppCard(
              child: EmptyState(
                  icon: Icons.inbox_outlined, title: 'هنوز تیکتی ثبت نکرده‌اید'),
            )
          else
            ..._tickets.map((t) {
              final status = '${t['status']}';
              final closed = status == 'closed';
              return Padding(
                padding: const EdgeInsets.only(bottom: Gaps.sm),
                child: AppCard(
                  onTap: () => _openThread(t),
                  padding: const EdgeInsets.all(Gaps.md),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${t['subject']}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.titleSmall),
                            const SizedBox(height: 3),
                            Text(
                              closed
                                  ? 'گفتگو بسته شده است'
                                  : 'برای ادامه گفتگو لمس کنید',
                              style: theme.textTheme.bodySmall,
                            ),
                          ],
                        ),
                      ),
                      StatusBadge(status: status, labels: _statusLabels),
                      Icon(Icons.chevron_left_rounded,
                          color: theme.colorScheme.outline),
                    ],
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }
}

/// Explains why the "new ticket" form is unavailable, and offers the right
/// next action instead of a dead end.
class _QuotaNotice extends StatelessWidget {
  const _QuotaNotice({required this.quota, required this.onOpenTicket});
  final Map<String, dynamic>? quota;
  final VoidCallback onOpenTicket;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final reason = quota?['reason'];
    final hasOpen = reason == 'open_ticket' && quota?['openTicket'] is Map;
    final color = hasOpen ? theme.colorScheme.primary : const Color(0xFFF59E0B);

    return AppCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(hasOpen ? Icons.forum_rounded : Icons.timelapse_rounded,
              color: color, size: 22),
          Gaps.hSm,
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(hasOpen ? 'یک تیکت باز دارید' : 'سقف روزانه تکمیل شد',
                    style: theme.textTheme.titleSmall),
                const SizedBox(height: 3),
                Text(
                  '${quota?['message'] ?? ''}',
                  style: theme.textTheme.bodySmall,
                ),
                if (hasOpen) ...[
                  Gaps.vSm,
                  FilledButton.icon(
                    onPressed: onOpenTicket,
                    icon: const Icon(Icons.open_in_new_rounded, size: 18),
                    label: const Text('رفتن به تیکت باز'),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
