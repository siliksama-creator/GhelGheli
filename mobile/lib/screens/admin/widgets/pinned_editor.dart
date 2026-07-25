// Admin control for the pinned chat announcement.
//
// Lives in its own file so admin_chat.dart stays a moderation list rather
// than growing a second responsibility.
import 'package:flutter/material.dart';

import '../../../api_client.dart';
import '../../../theme/tokens.dart';
import '../../../widgets/app_card.dart';
import '../../user/games/pinned_banner.dart';

class PinnedEditor extends StatefulWidget {
  const PinnedEditor({super.key, required this.api});
  final ApiClient api;

  @override
  State<PinnedEditor> createState() => _PinnedEditorState();
}

class _PinnedEditorState extends State<PinnedEditor> {
  final _text = TextEditingController();
  String _accent = 'gold';
  bool _active = false;
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final d = await widget.api.get('/api/admin/chat/pinned');
      if (!mounted) return;
      setState(() {
        _text.text = '${d['text'] ?? ''}';
        _accent = '${d['accent'] ?? 'gold'}';
        _active = d['active'] == true;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save({required bool active}) async {
    if (active && _text.text.trim().isEmpty) {
      _toast('ابتدا متن پیام را بنویسید');
      return;
    }
    setState(() => _saving = true);
    try {
      final d = await widget.api.patch('/api/admin/chat/pinned', {
        'text': _text.text.trim(),
        'accent': _accent,
        'active': active,
      });
      if (!mounted) return;
      setState(() => _active = d['active'] == true);
      _toast('${d['message'] ?? 'ذخیره شد'}');
    } catch (e) {
      _toast(apiError(e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _toast(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (_loading) {
      return const AppCard(
        child: SizedBox(
            height: 90, child: Center(child: CircularProgressIndicator())),
      );
    }
    final color = pinColor(_accent);

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.push_pin_rounded, color: color, size: 19),
              Gaps.hXs,
              Expanded(
                child: Text('پیام سنجاق‌شده چت روم',
                    style: theme.textTheme.titleSmall),
              ),
              if (_active)
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: Gaps.xs, vertical: 3),
                  decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.18),
                      borderRadius: Corners.rPill),
                  child: Text('فعال',
                      style: theme.textTheme.labelSmall?.copyWith(
                          color: color, fontWeight: FontWeight.w800)),
                ),
            ],
          ),
          Gaps.vXxs,
          Text(
            'این پیام بالای چت روم همه کاربران با رنگ متفاوت نمایش داده می‌شود.',
            style: theme.textTheme.bodySmall,
          ),
          Gaps.vSm,
          TextField(
            controller: _text,
            maxLines: 3,
            maxLength: 300,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
              labelText: 'متن اعلان',
              hintText: 'مثال: مسابقه ویژه این هفته آغاز شد 🎉',
              alignLabelWithHint: true,
            ),
          ),
          Gaps.vXs,
          Text('رنگ نمایش', style: theme.textTheme.labelMedium),
          Gaps.vXxs,
          Wrap(
            spacing: Gaps.xs,
            children: [
              for (final entry in pinAccents.entries)
                ChoiceChip(
                  selected: _accent == entry.key,
                  onSelected: (_) => setState(() => _accent = entry.key),
                  avatar: CircleAvatar(backgroundColor: entry.value, radius: 8),
                  label: Text(_accentLabel(entry.key)),
                ),
            ],
          ),
          Gaps.vSm,
          Text('پیش‌نمایش', style: theme.textTheme.labelMedium),
          Gaps.vXxs,
          // Live preview using the very same widget users will see.
          PinnedBanner(pinned: {
            'text': _text.text.trim().isEmpty
                ? 'متن اعلان اینجا نمایش داده می‌شود'
                : _text.text.trim(),
            'accent': _accent,
            'active': true,
          }),
          Gaps.vSm,
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: _saving ? null : () => _save(active: true),
                  icon: _saving
                      ? const SizedBox(
                          width: 15,
                          height: 15,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.push_pin_rounded, size: 18),
                  label: Text(_active ? 'به‌روزرسانی سنجاق' : 'سنجاق کن'),
                ),
              ),
              if (_active) ...[
                Gaps.hXs,
                OutlinedButton.icon(
                  onPressed: _saving ? null : () => _save(active: false),
                  icon: const Icon(Icons.remove_circle_outline_rounded,
                      size: 18),
                  label: const Text('برداشتن'),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  static String _accentLabel(String key) {
    switch (key) {
      case 'green':
        return 'سبز';
      case 'blue':
        return 'آبی';
      case 'red':
        return 'قرمز';
      default:
        return 'طلایی';
    }
  }
}
