import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../api_client.dart';
import '../../../core/assets.dart';
import '../../../theme/tokens.dart';

/// دیالوگ ساخت اتاق خصوصی و دوئل مستقیم ۱v۱ با دوست (با تعیین امتیاز و کسر ۱۰٪ کارمزد)
class PrivateMatchDialog extends StatefulWidget {
  const PrivateMatchDialog({
    super.key,
    required this.api,
    required this.onJoinRoom,
  });

  final ApiClient api;
  final void Function(String gameId, String roomCode, int stake) onJoinRoom;

  static Future<void> show(
    BuildContext context, {
    required ApiClient api,
    required void Function(String gameId, String roomCode, int stake) onJoinRoom,
  }) {
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
  int _selectedStake = 500;
  String? _createdCode;
  String? _shareUrl;
  final _joinCodeCtrl = TextEditingController();

  final _games = const [
    ('penalty', 'ضربات پنالتی', Icons.sports_soccer_rounded),
    ('card_duel', 'دوئل کارت‌ها', Icons.style_rounded),
    ('memory', 'جفت‌یاب', Icons.grid_view_rounded),
    ('reversi', 'اتللو', Icons.circle_outlined),
  ];

  final _presetStakes = const [100, 200, 500, 1000, 2000, 5000, 10000];

  int get _netPot => (_selectedStake * 2 * 0.9).floor();
  int get _commission => (_selectedStake * 2 * 0.1).ceil();

  void _createRoom() {
    final code = (1000 + (DateTime.now().millisecondsSinceEpoch % 9000)).toString();
    setState(() {
      _createdCode = code;
      _shareUrl = 'https://user.ghelghelishop.ir/?game=$_selectedGame&room=$code&stake=$_selectedStake';
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
                    child: Text('دوئل مستقیم و اتاق خصوصی',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w900, color: Colors.white)),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded, color: Colors.white70),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              // Game Selector
              const Text('۱. انتخاب بازی:', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12, fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              Row(
                children: [
                  for (final g in _games)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 2),
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
                                Text(g.$2, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: _selectedGame == g.$1 ? Colors.white : Colors.white70)),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 14),

              // Stake Selector (Up to 10,000 points, 10% commission)
              const Text('۲. تعیین امتیاز مسابقه (تا سقف ۱۰,۰۰۰):', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12, fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final s in _presetStakes)
                      Padding(
                        padding: const EdgeInsets.only(left: 6),
                        child: ChoiceChip(
                          label: Text('${faNum(s)} امتیاز', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
                          selected: _selectedStake == s,
                          selectedColor: const Color(0xFFFFD166),
                          onSelected: (val) {
                            if (val) setState(() { _selectedStake = s; _createdCode = null; });
                          },
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 10),

              // Live calculation card (10% commission)
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(12),
                  color: Colors.white.withValues(alpha: 0.05),
                  border: Border.all(color: Colors.white12),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('جایزه برنده: ${faNum(_netPot)} امتیاز',
                        style: const TextStyle(color: Color(0xFF22E7A6), fontWeight: FontWeight.w900, fontSize: 12)),
                    Text('۱۰٪ کارمزد: ${faNum(_commission)}',
                        style: const TextStyle(color: Colors.white54, fontSize: 11)),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              if (_createdCode == null) ...[
                FilledButton.icon(
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(48),
                    backgroundColor: const Color(0xFF38BDF8),
                    foregroundColor: const Color(0xFF002033),
                  ),
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
                        style: FilledButton.styleFrom(
                          minimumSize: const Size.fromHeight(44),
                          backgroundColor: const Color(0xFF22E7A6),
                          foregroundColor: const Color(0xFF00281D),
                        ),
                        icon: const Icon(Icons.share_rounded, size: 16),
                        label: const Text('ارسال لینک دعوت برای دوست', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
                        onPressed: () {
                          final msg = 'بیا در بازی قلقلی با هم دوئل کنیم! 🎮\nبازی: ${_selectedGame}\nامتیاز مسابقه: ${faNum(_selectedStake)}\nکد اتاق: $_createdCode\n$_shareUrl';
                          Clipboard.setData(ClipboardData(text: msg));
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('لینک و کد اتاق در کلیپ‌بورد کپی شد')));
                        },
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton(
                        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(40)),
                        onPressed: () {
                          Navigator.pop(context);
                          widget.onJoinRoom(_selectedGame, _createdCode!, _selectedStake);
                        },
                        child: const Text('ورود به اتاق و انتظار برای حریف'),
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
                    style: FilledButton.styleFrom(minimumSize: const Size(64, 48)),
                    onPressed: () {
                      final code = _joinCodeCtrl.text.trim();
                      if (code.isNotEmpty) {
                        Navigator.pop(context);
                        widget.onJoinRoom(_selectedGame, code, _selectedStake);
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
