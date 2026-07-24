import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/state_views.dart';

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

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final rows = await widget.api.get('/api/admin/chat/messages');
    if (mounted)
      setState(() {
        _rows = rows;
        _loading = false;
      });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    final theme = Theme.of(context);
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
        children: _rows.isEmpty
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
                                  await widget.api.patch(
                                      '/api/admin/chat/users/${m['user_id']}/ban',
                                      {
                                        'minutes': 1440,
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
      ),
    );
  }
}
