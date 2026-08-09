import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/badges.dart';
import '../../widgets/state_views.dart';
import 'support/attachment_picker.dart';
import 'support/ticket_thread.dart';

/// Support tickets, FAQ and Privacy / Fair-Play Terms.
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
      _toast('تیکت با موفقیت ثبت شد ✓');
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

  Future<void> _openThread(Map ticket) async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => TicketThreadPage(
        api: widget.api,
        ticket: Map<String, dynamic>.from(ticket),
      ),
    ));
    if (!mounted) return;
    try {
      await _load();
    } catch (_) {}
  }

  void _showPrivacyDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.security_rounded, color: Color(0xFF34D399), size: 22),
            SizedBox(width: 8),
            Text('حریم خصوصی و شفافیت بازی', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: const [
              Text(
                '۱. ماهیت پلتفرم سرگرمی و بازی مهارت‌محور:',
                style: TextStyle(fontWeight: FontWeight.w800, color: Color(0xFFFFD166), fontSize: 13),
              ),
              SizedBox(height: 4),
              Text(
                'اپلیکیشن قلقلی یک محیط سرگرمی، مسابقات مهارتی و کلکسیون فوتوکارت است. این پلتفرم هیچ‌گونه فعالیت شرط‌بندی، بخت‌آزمایی یا قمار نداشته و تمامی پاداش‌ها و امتیازات بر مبنای فعالیت، هوش و مهارت بازیکنان در بازی‌ها محاسبه می‌شود.',
                style: TextStyle(fontSize: 12, height: 1.5, color: Colors.white70),
              ),
              SizedBox(height: 12),
              Text(
                '۲. حفظ اطلاعات کاربری:',
                style: TextStyle(fontWeight: FontWeight.w800, color: Color(0xFFFFD166), fontSize: 13),
              ),
              SizedBox(height: 4),
              Text(
                'شماره تماس و اطلاعات هویتی شما کاملاً محفوظ بوده و به هیچ شخص ثالثی واگذار نمی‌شود. در محیط‌های عمومی (چت و لیگ) صرفاً نام مستعار و عکس انتخابی شما نمایش داده می‌شود.',
                style: TextStyle(fontSize: 12, height: 1.5, color: Colors.white70),
              ),
              SizedBox(height: 12),
              Text(
                '۳. شفافیت مالی و تسویه‌حساب:',
                style: TextStyle(fontWeight: FontWeight.w800, color: Color(0xFFFFD166), fontSize: 13),
              ),
              SizedBox(height: 4),
              Text(
                'جوایز و موجودی کیف پول کاربران طبق قوانین رسمی بانک مرکزی و از طریق شماره شبا به نام صاحب حساب تاییدشده تسویه می‌گردد.',
                style: TextStyle(fontSize: 12, height: 1.5, color: Colors.white70),
              ),
            ],
          ),
        ),
        actions: [
          FilledButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('متوجه شدم'),
          ),
        ],
      ),
    );
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

          // ── FAQ Accordion Section ──
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.help_outline_rounded, color: Color(0xFF38BDF8), size: 20),
                    Gaps.hXs,
                    Text('پرسش‌های متداول (FAQ)',
                        style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w900)),
                  ],
                ),
                const SizedBox(height: 8),
                const _FaqItem(
                  question: 'چگونه در قلقلی امتیاز کسب کنم؟',
                  answer: 'با ثبت کد و عکس فوتوکارت‌ها، برنده شدن در بازی‌های آنلاین (اتللو، جفت‌یاب، پنالتی)، پیشرفت در بازی ضربه‌زن، استریک ورود روزانه و چرخاندن گردونه شانس.',
                ),
                const _FaqItem(
                  question: 'جوایز و درآمد کیف پول چگونه تسویه می‌شوند؟',
                  answer: 'در بخش کیف پول با ثبت شماره شبا بانکی معتبر به نام خودتان، درخواست برداشت ثبت کنید تا در سیکل پایا واریز شود.',
                ),
                const _FaqItem(
                  question: 'اشتراک قلقلی پلاس چه امکاناتی می‌دهد؟',
                  answer: 'عضویت دائمی در ۱ باشگاه فوتبال، جوایز مسیر ویژه گذر نبرد به مدت ۱ ماه، ستاره طلایی درخشان کنار نام در همه بخش‌ها و دسترسی به تمام قاب‌ها و رنگ‌ها.',
                ),
                const _FaqItem(
                  question: 'آیا این اپلیکیشن شرط‌بندی یا قمار است؟',
                  answer: 'خیر؛ قلقلی کاملاً بازی مهارت‌محور، ورزشی و سرگرمی است و هیچ‌گونه فعالیت شرط‌بندی در آن وجود ندارد.',
                ),
                const SizedBox(height: 6),
                Center(
                  child: TextButton.icon(
                    onPressed: _showPrivacyDialog,
                    icon: const Icon(Icons.shield_outlined, size: 16, color: Color(0xFF34D399)),
                    label: const Text(
                      'مشاهده منشور حریم خصوصی و قوانین بازی جوانمردانه',
                      style: TextStyle(fontSize: 11.5, color: Color(0xFF34D399), fontWeight: FontWeight.w800),
                    ),
                  ),
                ),
              ],
            ),
          ),

          Gaps.vMd,

          // ── New Ticket Form / Quota Notice ──
          if (canCreate)
            AppCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Icon(Icons.support_agent_rounded, color: theme.colorScheme.primary, size: 20),
                      Gaps.hXs,
                      Text('ارسال تیکت به پشتیبانی',
                          style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w900)),
                    ],
                  ),
                  Gaps.vXxs,
                  Text('در هر روز می‌توانید ۱ تیکت جدید ثبت کنید.', style: theme.textTheme.bodySmall),
                  Gaps.vSm,
                  TextField(
                    controller: _subject,
                    decoration: const InputDecoration(
                      labelText: 'موضوع تیکت',
                      prefixIcon: Icon(Icons.label_outline_rounded),
                    ),
                  ),
                  Gaps.vSm,
                  TextField(
                    controller: _message,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      labelText: 'شرح مشکل یا سوال شما',
                      alignLabelWithHint: true,
                    ),
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
                            child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
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

          Gaps.vLg,

          // ── My Tickets List ──
          Text('تیکت‌های من (${faNum(_tickets.length)})',
              style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
          Gaps.vXs,
          if (_tickets.isEmpty)
            const AppCard(
              child: EmptyState(icon: Icons.inbox_outlined, title: 'هنوز تیکتی ثبت نکرده‌اید'),
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
                                style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
                            const SizedBox(height: 3),
                            Text(
                              closed ? 'گفتگو بسته‌شده است' : 'برای مشاهده و ادامه گفتگو لمس کنید',
                              style: theme.textTheme.bodySmall?.copyWith(color: Colors.white60),
                            ),
                          ],
                        ),
                      ),
                      StatusBadge(status: status, labels: _statusLabels),
                      const SizedBox(width: 4),
                      Icon(Icons.chevron_left_rounded, color: theme.colorScheme.outline),
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

class _FaqItem extends StatelessWidget {
  const _FaqItem({required this.question, required this.answer});
  final String question;
  final String answer;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: ExpansionTile(
        tilePadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 0),
        childrenPadding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
        title: Text(
          question,
          style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: Colors.white),
        ),
        children: [
          Text(
            answer,
            style: const TextStyle(fontSize: 11.5, color: Colors.white70, height: 1.5),
          ),
        ],
      ),
    );
  }
}

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
          Icon(hasOpen ? Icons.forum_rounded : Icons.timelapse_rounded, color: color, size: 22),
          Gaps.hSm,
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(hasOpen ? 'یک تیکت باز دارید' : 'سقف روزانه تکمیل شد',
                    style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800)),
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
