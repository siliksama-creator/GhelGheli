// نوار فشردهٔ اشتراک نتیجه — فقط تلگرام، واتس‌اپ، روبیکا، بله.
import 'dart:async';

import 'package:flutter/material.dart';

import '../api_client.dart';
import '../core/share_invite.dart';

class ResultShareStrip extends StatefulWidget {
  const ResultShareStrip({
    super.key,
    required this.api,
    required this.title,
    required this.gameTitle,
    required this.versus,
    this.gameId,
    this.matchId,
  });

  final ApiClient api;
  final String title;
  final String gameTitle;
  final String versus;
  final String? gameId;
  final String? matchId;

  @override
  State<ResultShareStrip> createState() => _ResultShareStripState();
}

class _ResultShareStripState extends State<ResultShareStrip> {
  String? _busy;
  String? _error;

  Future<void> _share(ShareTarget target) async {
    if (_busy != null) return;
    setState(() {
      _busy = target.id;
      _error = null;
    });
    try {
      String code = '';
      int spins = 3;
      try {
        final res = await widget.api.get('/api/referrals');
        if (res is Map) {
          code = '${res['code'] ?? ''}';
          final s = res['spinsPerReferral'];
          if (s is num && s > 0) spins = s.toInt();
        }
      } catch (_) {}
      final msg = gameShareMessage(
        title: widget.title,
        gameTitle: widget.gameTitle,
        versus: widget.versus,
        code: code,
        spins: spins,
      );
      final outcome = await shareText(target, msg);
      if (!mounted) return;
      if (outcome == ShareOutcome.copiedOnly) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('متن کپی شد؛ ${target.label} باز نشد')),
        );
      } else if (outcome == ShareOutcome.openedWithClipboard) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('متن کپی شد؛ ${target.label} را باز کن و بچسبان')),
        );
      }
      unawaited(widget.api.post('/api/analytics/events', {
        'event': 'share',
        'platform': 'android',
        'gameId': widget.gameId,
        'matchId': widget.matchId,
        'target': target.id,
      }).catchError((_) => <String, dynamic>{}));
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'اشتراک‌گذاری ناموفق بود');
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Text(
          'اشتراک نتیجه',
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Colors.white60),
        ),
        const SizedBox(height: 6),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            for (final t in shareTargets)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: InkWell(
                  onTap: _busy == null ? () => _share(t) : null,
                  borderRadius: BorderRadius.circular(18),
                  child: Opacity(
                    opacity: _busy != null && _busy != t.id ? 0.45 : 1,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        MessengerIcon(app: t.app, size: 32),
                        const SizedBox(height: 3),
                        Text(
                          _busy == t.id ? '…' : t.label,
                          style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w800),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              _error!,
              style: const TextStyle(color: Color(0xFFFB7185), fontSize: 11, fontWeight: FontWeight.w700),
            ),
          ),
      ],
    );
  }
}
