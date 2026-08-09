import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../api_client.dart';
import '../core/share_invite.dart';
import '../theme/tokens.dart';

/// دیالوگ چالش مستقیم ۱ به ۱ با دوستان
class PrivateMatchDialog extends StatefulWidget {
  const PrivateMatchDialog({super.key, required this.api, required this.onJoinRoom});
  final ApiClient api;
  final void Function(String gameId, String roomCode) onJoinRoom;

  static Future<void> show(BuildContext context, {required ApiClient api, required void Function(String, String) onJoinRoom}) {
    return showDialog(
      context: context,
      builder: (ctx) => PrivateMatchDialog(api: api, onJoinRoom: onJoinRoom),
    );
  }

  @override
  State<PrivateMatchDialog> createState() => _PrivateMatchDialogState();
}

class _PrivateMatchDialogState extends State<PrivateMatchDialog> {
  String _selectedGame = 'penalty';
  String? _createdCode;
  String? _shareUrl;
  final _joinCodeCtrl = TextEditingController();

  final _games = const [
    ('penalty', 'ضربات پنالتی', Icons.sports_soccer_rounded),
    ('reversi', 'اتللو', Icons.circle_outlined),
    ('memory', 'جفت‌یاب', Icons.style_rounded),
  ];

  void _createRoom() {
    final code = (1000 + (DateTime.now().millisecondsSinceEpoch % 9000)).toString();
    setState(() {
      _createdCode = code;
      _shareUrl = 'https://user.ghelghelishop.ir/?game=$_selectedGame&room=$code';
    });
  }

  @override
  void dispose() {
    _joinCodeCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: const Color(0xFF0E1826),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const Icon(Icons.sports_esports_rounded, size: 24, color: Color(0xFF38BDF8)),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text('دوئل مستقیم با دوستان (۱v۱)',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Colors.white)),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded, color: Colors.white70),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              // Game Selector
              const Text('انتخاب بازی:', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12, fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              Row(
                children: [
                  for (final g in _games)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 3),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(10),
                          onTap: () => setState(() { _selectedGame = g.$1; _createdCode = null; }),
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(10),
                              color: _selectedGame == g.$1 ? const Color(0xFF38BDF8).withValues(alpha: 0.2) : Colors.white.withValues(alpha: 0.04),
                              border: Border.all(color: _selectedGame == g.$1 ? const Color(0xFF38BDF8) : Colors.white12),
                            ),
                            child: Column(
                              children: [
                                Icon(g.$3, size: 18, color: _selectedGame == g.$1 ? const Color(0xFF38BDF8) : Colors.white70),
                                const SizedBox(height: 3),
                                Text(g.$2, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: _selectedGame == g.$1 ? Colors.white : Colors.white70)),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 16),

              if (_createdCode == null) ...[
                FilledButton.icon(
                  style: FilledButton.styleFrom(backgroundColor: const Color(0xFF38BDF8), foregroundColor: const Color(0xFF002033)),
                  icon: const Icon(Icons.add_circle_outline_rounded),
                  label: const Text('ساخت اتاق بازی و دریافت کد', style: TextStyle(fontWeight: FontWeight.w900)),
                  onPressed: _createRoom,
                ),
              ] else ...[
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    color: Colors.white.withValues(alpha: 0.05),
                    border: Border.all(color: const Color(0xFF38BDF8)),
                  ),
                  child: Column(
                    children: [
                      const Text('کد اتاق شما:', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12)),
                      const SizedBox(height: 4),
                      Text(_createdCode!, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, color: Color(0xFF38BDF8), letterSpacing: 4)),
                      const SizedBox(height: 8),
                      FilledButton.icon(
                        style: FilledButton.styleFrom(backgroundColor: const Color(0xFF22E7A6), foregroundColor: const Color(0xFF00281D)),
                        icon: const Icon(Icons.share_rounded, size: 16),
                        label: const Text('ارسال لینک دعوت برای دوست', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
                        onPressed: () {
                          final msg = 'بیا در بازی قلقلی با هم دوئل کنیم! 🎮\nکد اتاق: $_createdCode\n$_shareUrl';
                          ShareInvite.shareText(msg);
                        },
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 16),
              const Divider(color: Colors.white12),
              const SizedBox(height: 10),

              // Join friend room
              const Text('یا وارد کردن کد اتاق دوست:', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12, fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _joinCodeCtrl,
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, letterSpacing: 3),
                      decoration: const InputDecoration(hintText: 'کد ۴ رقمی', contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 10)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: () {
                      final code = _joinCodeCtrl.text.trim();
                      if (code.isNotEmpty) {
                        Navigator.pop(context);
                        widget.onJoinRoom(_selectedGame, code);
                      }
                    },
                    child: const Text('ورود'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
