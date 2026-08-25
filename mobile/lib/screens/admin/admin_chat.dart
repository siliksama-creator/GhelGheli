import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/state_views.dart';
import 'widgets/pinned_editor.dart';

/// Chat moderation: delete messages / ban users. Same endpoints as legacy
/// `AdminChat`.
class AdminChat extends StatefulWidget {
  final ApiClient api;
  const AdminChat({super.key, required this.api});

  @override
  State<AdminChat> createState() => _AdminChatState();
}

class _AdminChatState extends State<AdminChat> {
  List _rows = [];
  bool _loading = true;
  String? _loadError;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {

    // بدون try، هر شکست شبکه‌ای این صفحه را تا ابد روی چرخنده نگه می‌داشت:
    // استثنا بالا می‌رفت و خط `_loading = false` هرگز اجرا نمی‌شد. همان
    // باگی که کاربر با «صفحات لود نمیشن» گزارش داد.
    try {
      final rows = await widget.api.get('/api/admin/chat/messages');
      if (mounted) {
        setState(() {
          _rows = rows;
          _loading = false;
        });
      }
  
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadError = apiError(e);
        _loading = false;
      });
    }
  }

  Future<int?> _askBanMinutes() async {
    final picked = await showDialog<int>(
      context: context,
      builder: (c) => SimpleDialog(
        title: const Text('مدت محرومیت چت'),
        children: [
          SimpleDialogOption(
              onPressed: () => Navigator.pop(c, 60),
              child: const Text('یک ساعت')),
          SimpleDialogOption(
              onPressed: () => Navigator.pop(c, 1440),
              child: const Text('یک روز')),
          SimpleDialogOption(
              onPressed: () => Navigator.pop(c, 10080),
              child: const Text('یک هفته')),
        ],
      ),
    );
    return picked;
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    if (_loadError != null) {
      return RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: const EdgeInsets.all(20), children: [
          const SizedBox(height: 40),
          ErrorBanner(message: _loadError!, onRetry: _load),
        ]),
      );
    }
    final theme = Theme.of(context);
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
        children: [
          PinnedEditor(api: widget.api),
          Gaps.vLg,
          ..._rows.isEmpty
            ? const [
                AppCard(
                    child: EmptyState(
                        icon: Icons.forum_outlined, title: 'پیامی وجود ندارد'))
              ]
            : _rows
                .map<Widget>((m) => Padding(
                      padding: const EdgeInsets.only(bottom: Gaps.sm),
                      child: AppCard(
                        padding: const EdgeInsets.all(Gaps.md),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(m['nickname'] ?? m['mobile'] ?? '',
                                      style: theme.textTheme.titleSmall),
                                  const SizedBox(height: 3),
                                  Text(m['message_text'] ?? '',
                                      style: theme.textTheme.bodyMedium,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis),
                                ],
                              ),
                            ),
                            PopupMenuButton<String>(
                              onSelected: (s) async {
                                if (s == 'delete') {
                                  await widget.api.patch(
                                      '/api/admin/chat/messages/${m['id']}/delete',
                                      {'reason': 'از اپ مدیریت'});
                                }
                                if (s == 'ban') {
                                  final minutes = await _askBanMinutes();
                                  if (minutes == null) return;
                                  await widget.api.patch(
                                      '/api/admin/chat/users/${m['user_id']}/ban',
                                      {
                                        'minutes': minutes,
                                        'reason': 'از اپ مدیریت'
                                      });
                                }
                                await _load();
                              },
                              itemBuilder: (_) => const [
                                PopupMenuItem(
                                    value: 'delete', child: Text('حذف پیام')),
                                PopupMenuItem(
                                    value: 'ban', child: Text('بن چت ۲۴ ساعت')),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ))
                .toList(),
        ],
      ),
    );
  }
}
