import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../api_client.dart';
import '../../../core/app_config.dart';

/// دیالوگ ساخت اتاق خصوصی و دوئل مستقیم با دوست
class PrivateMatchDialog extends StatefulWidget {
  const PrivateMatchDialog({
    super.key,
    required this.api,
    required this.onJoinRoom,
  });

  final ApiClient api;
  final Function onJoinRoom;

  static Future<void> show(
    BuildContext context, {
    required ApiClient api,
    required Function onJoinRoom,
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
  int _selectedStake = 100;
  String? _createdCode;
  String? _shareUrl;
  final _joinCodeCtrl = TextEditingController();

  final _games = const [
    ('penalty', 'ضربات پنالتی', Icons.sports_soccer_rounded),
    ('card_duel', 'دوئل کارت‌ها', Icons.style_rounded),
    ('memory', 'جفت‌یاب', Icons.grid_view_rounded),
  ];

  List<int> _presetStakes = const [0, 100, 1000, 5000];
  @override
  void initState() {
    super.initState();
    _loadStakes();
  }
  Future<void> _loadStakes() async {
    try {
      final cfg = await widget.api.get('/api/config');
      if (!mounted || cfg is! Map) return;
      AppConfig.instance.apply(cfg);
      final st = cfg['stakes'];
      if (st is Map && st['lobby'] is List) {
        final list = (st['lobby'] as List).map((e) => (e as num).toInt()).toList();
        if (list.isNotEmpty) {
          setState(() {
            _presetStakes = list;
            if (!_presetStakes.contains(_selectedStake)) {
              _selectedStake = _presetStakes.firstWhere((s) => s > 0, orElse: () => _presetStakes.first);
            }
          });
        }
      }
    } catch (_) {}
  }

  /// طولِ کدِ اتاق — فول‌بک ۴، یعنی همان امروزِ محصول.
  static int get _codeLength => liveRule('roomCodeLength', 4);

  static int _pow10(int n) {
    var v = 1;
    for (var i = 0; i < n; i++) {
      v *= 10;
    }
    return v;
  }

  void _createRoom() {
    // عددِ کد باید همان طولی را بسازد که راهنما و `maxLength` وعده می‌دهند.
    // قبلاً «۱۰۰۰ + پیمانهٔ ۹۰۰۰» سفت نوشته شده بود (همیشه ۴ رقم)؛ اگر
    // ادمین کد را ۶ رقمی می‌کرد، کاربر کدِ ۴ رقمی می‌گرفت و سرور قبولش
    // نمی‌کرد — یعنی اتاقی که فقط روی کاغذ ساخته می‌شد.
    final n = _codeLength < 2 ? 2 : _codeLength;
    final lo = _pow10(n - 1);
    final code = (lo + (DateTime.now().millisecondsSinceEpoch % (lo * 9)))
        .toString();
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
                    child: Text('دوئل مستقیم با دوستان',
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

              // Stake Selector (Up to 10,000 points)
              const Text('۲. تعیین امتیاز مسابقه:', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 12, fontWeight: FontWeight.w700)),
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
                          final msg = 'بیا در بازی قلقلی با هم مسابقه بدیم!\nبازی: $_selectedGame\nکد اتاق: $_createdCode\n$_shareUrl';
                          Clipboard.setData(ClipboardData(text: msg));
                          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('لینک و کد اتاق در کلیپ‌بورد کپی شد')));
                        },
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton(
                        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(40)),
                        onPressed: () {
                          Navigator.pop(context);
                          if (widget.onJoinRoom is void Function(String, String, int)) {
                            (widget.onJoinRoom as dynamic)(_selectedGame, _createdCode!, _selectedStake);
                          } else {
                            (widget.onJoinRoom as dynamic)(_selectedGame, _createdCode!);
                          }
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
                      // آینهٔ `games_page.dart` و وب: راهنما و سقفِ ورودی
                      // هر دو از `live_rules.roomCodeLength` می‌آیند.
                      decoration: InputDecoration(
                        hintText: liveText('games.roomCodeLabel',
                            'کد ${faNum(_codeLength)} رقمی',
                            vars: {'codeLength': _codeLength}),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                      ),
                      maxLength: _codeLength,
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    style: FilledButton.styleFrom(minimumSize: const Size(64, 48)),
                    onPressed: () {
                      final code = _joinCodeCtrl.text.trim();
                      if (code.isNotEmpty) {
                        Navigator.pop(context);
                        if (widget.onJoinRoom is void Function(String, String, int)) {
                          (widget.onJoinRoom as dynamic)(_selectedGame, code, _selectedStake);
                        } else {
                          (widget.onJoinRoom as dynamic)(_selectedGame, code);
                        }
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
