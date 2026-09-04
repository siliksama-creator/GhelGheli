import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/badges.dart';
import '../../widgets/state_views.dart';

/// ریز امتیازات کاربران — جست‌وجو، تاریخچه، کسر امتیاز و برترین‌ها.
/// آیینهٔ کاملِ points.jsx در وب.
class AdminPoints extends StatefulWidget {
  final ApiClient api;
  const AdminPoints({super.key, required this.api});

  @override
  State<AdminPoints> createState() => _AdminPointsState();
}

class _AdminPointsState extends State<AdminPoints> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  // ── جست‌وجو ──
  final _searchQuery = TextEditingController();
  List _searchResults = [];
  bool _searching = false;
  bool _searched = false;

  // ── کاربرِ انتخاب‌شده ──
  Map? _selectedUser;
  Map? _userDetail;
  bool _loadingDetail = false;
  String _sourceFilter = '';
  int _page = 0;
  final int _pageSize = 25;

  // ── فرمِ تغییرِ امتیاز ──
  final _amountController = TextEditingController();
  final _reasonController = TextEditingController();
  bool _savingPoints = false;

  // ── هدیهٔ عضویت (تنظیمِ سراسری) ──
  //
  // یک رکورد در `app_settings` با کلیدِ `signup_gift`. هر کاربرِ تازه
  // همین مقدار را یک‌بار می‌گیرد. عمداً سراسری است نه per-user، چون
  // خواستهٔ مالک «هر کاربر جدید X امتیاز» بود.
  Map? _gift;
  bool _giftEnabled = false;
  final _giftPoints = TextEditingController();
  final _giftMessage = TextEditingController();
  bool _giftBusy = false;

  // ── برترین‌ها ──
  Map? _topData;
  String _topDays = '';
  bool _loadingTop = false;

  static const Map<String, String> _sourceFa = {
    'photo_card': 'ثبت کارت با عکس',
    'card_code': 'ثبت کارت با کد',
    'referral': 'کمیسیون معرفی',
    'game': 'بازی',
    'pass_reward': 'گذر نبرد',
    'wheel': 'گردونهٔ شانس',
    'reward_claim': 'جایزه',
    'admin_adjust': 'تنظیم مدیر',
    'admin_deduct': 'کسر مدیر',
    'signup_gift': 'هدیهٔ عضویت',
    'other': 'سایر',
  };

  String _srcFa(String? s) => _sourceFa[s] ?? s ?? '—';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _tabController.addListener(() {
      if (_tabController.index == 1 && _topData == null) {
        _loadTop();
      }
      if (_tabController.index == 2 && _gift == null) {
        _loadGift();
      }
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchQuery.dispose();
    _amountController.dispose();
    _reasonController.dispose();
    _giftPoints.dispose();
    _giftMessage.dispose();
    super.dispose();
  }

  Future<void> _doSearch() async {
    final t = _searchQuery.text.trim();
    if (t.length < 3) {
      _snack('حداقل ۳ نویسه وارد کنید');
      return;
    }
    setState(() {
      _searching = true;
      _searchResults = [];
      _searched = true;
    });
    try {
      final r = await widget.api.get('/api/admin/points/search?q=${Uri.encodeComponent(t)}');
      if (mounted) {
        setState(() {
          _searchResults = List.from(r['users'] ?? []);
          _searching = false;
        });
        if (_searchResults.isEmpty) _snack('کاربری پیدا نشد');
      }
    } catch (e) {
      if (mounted) {
        setState(() => _searching = false);
        _snack(apiError(e));
      }
    }
  }

  Future<void> _loadDetail(String userId, {int offset = 0, String source = ''}) async {
    setState(() => _loadingDetail = true);
    try {
      String path = '/api/admin/points/user/$userId?limit=$_pageSize&offset=$offset';
      if (source.isNotEmpty) path += '&source=$source';
      final d = await widget.api.get(path);
      if (mounted) {
        setState(() {
          _userDetail = d;
          _loadingDetail = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _loadingDetail = false);
        _snack(apiError(e));
      }
    }
  }

  Future<void> _loadTop() async {
    setState(() => _loadingTop = true);
    try {
      final path = _topDays.isNotEmpty ? '/api/admin/points/top?days=$_topDays' : '/api/admin/points/top';
      final d = await widget.api.get(path);
      if (mounted) {
        setState(() {
          _topData = d;
          _loadingTop = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _loadingTop = false);
        _snack(apiError(e));
      }
    }
  }

  void _pickUser(Map u) {
    setState(() {
      _selectedUser = u;
      _page = 0;
      _sourceFilter = '';
      _amountController.clear();
      _reasonController.clear();
      _userDetail = null;
    });
    _loadDetail(u['id']);
  }

  Future<void> _submitPoints() async {
    if (_selectedUser == null) return;
    final amountText = _amountController.text.trim();
    final reasonText = _reasonController.text.trim();
    final amountNum = int.tryParse(amountText);

    if (amountNum == null || amountNum == 0) {
      _snack('مقدار امتیاز معتبر نیست');
      return;
    }
    if (amountNum.abs() > 1000000) {
      _snack('حداکثر ۱,۰۰۰,۰۰۰ امتیاز');
      return;
    }
    final isDeduct = amountNum < 0;
    if (isDeduct && reasonText.length < 3) {
      _snack('برای کسر امتیاز باید دلیل (حداقل ۳ حرف) بنویسید');
      return;
    }

    if (isDeduct) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('تأیید کسر امتیاز'),
          content: Text(
              'آیا از کسر ${faNum(amountNum.abs())} امتیاز از «${_selectedUser!['nickname'] ?? _selectedUser!['mobile']}» مطمئن هستید؟\nدلیل زیر به صورت نوتیفیکیشن زنگوله به کاربر ارسال می‌شود:\n$reasonText'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext, false), child: const Text('لغو')),
            FilledButton(onPressed: () => Navigator.pop(dialogContext, true), child: const Text('تأیید')),
          ],
        ),
      );
      if (confirmed != true) return;
    }

    setState(() => _savingPoints = true);
    try {
      final r = await widget.api.post('/api/admin/users/${_selectedUser!['id']}/points', {
        'points': amountNum,
        'reason': reasonText,
      });
      _snack(r is Map ? '${r['message'] ?? 'ثبت شد'}' : 'ثبت شد');
      _amountController.clear();
      _reasonController.clear();
      await _loadDetail(_selectedUser!['id'], offset: 0, source: _sourceFilter);
      setState(() {
        _page = 0;
        // به‌روزرسانی مقدار در لیست نتایج جست‌وجو
        _searchResults = _searchResults.map((u) {
          if (u['id'] == _selectedUser!['id']) {
            return {...u, 'current_points': r['balanceAfter'] ?? u['current_points']};
          }
          return u;
        }).toList();
      });
    } catch (e) {
      _snack(apiError(e));
    } finally {
      if (mounted) setState(() => _savingPoints = false);
    }
  }

  // ── خواندنِ تنظیمِ هدیه ──
  Future<void> _loadGift() async {
    try {
      final d = await widget.api.get('/api/admin/signup-gift');
      if (!mounted || d is! Map) return;
      setState(() {
        _gift = d;
        _giftEnabled = d['enabled'] == true;
        _giftPoints.text = '${d['points'] ?? 0}';
        _giftMessage.text = '${d['message'] ?? ''}';
      });
    } catch (e) {
      _snack(apiError(e));
    }
  }

  // ── ذخیرهٔ تنظیمِ هدیه ──
  //
  // اعتبارسنجی اینجا فقط برای بازخوردِ سریع است؛ منبعِ حقیقت همچنان
  // بک‌اند است که سقفِ ۱M و عددِ صحیح را دوباره چک می‌کند.
  Future<void> _saveGift() async {
    final pts = int.tryParse(_giftPoints.text.trim());
    if (pts == null || pts < 0) {
      _snack('امتیاز باید عددی صحیح و نامنفی باشد');
      return;
    }
    if (pts > 1000000) {
      _snack('حداکثر ۱٬۰۰۰٬۰۰۰ امتیاز');
      return;
    }
    if (_giftEnabled && pts == 0) {
      _snack('برای فعال کردن، امتیاز باید بیشتر از صفر باشد');
      return;
    }
    setState(() => _giftBusy = true);
    try {
      final r = await widget.api.patch('/api/admin/signup-gift', {
        'enabled': _giftEnabled,
        'points': pts,
        'message': _giftMessage.text.trim(),
      });
      final saved = (r is Map && r['settings'] is Map) ? r['settings'] as Map : null;
      if (saved != null && mounted) {
        setState(() {
          _gift = saved;
          _giftEnabled = saved['enabled'] == true;
          _giftPoints.text = '${saved['points'] ?? 0}';
          _giftMessage.text = '${saved['message'] ?? ''}';
        });
      }
      _snack(r is Map ? '${r['message'] ?? 'ذخیره شد'}' : 'ذخیره شد');
    } catch (e) {
      _snack(apiError(e));
    } finally {
      if (mounted) setState(() => _giftBusy = false);
    }
  }

  void _snack(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(48),
        child: Material(
          color: Theme.of(context).colorScheme.surfaceContainerLow,
          child: TabBar(
            controller: _tabController,
            tabs: const [
              Tab(text: 'جست‌وجو و ریز امتیازات'),
              Tab(text: 'برترین‌ها و تراکنش‌های بزرگ'),
              Tab(text: 'هدیهٔ عضویت'),
            ],
          ),
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildSearchTab(),
          _buildTopTab(),
          _buildGiftTab(),
        ],
      ),
    );
  }

  Widget _buildSearchTab() {
    return ListView(
      padding: const EdgeInsets.all(Gaps.md),
      children: [
        AppCard(
          padding: const EdgeInsets.all(Gaps.sm),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _searchQuery,
                  onSubmitted: (_) => _doSearch(),
                  decoration: const InputDecoration(
                    labelText: 'جستجوی کاربر با موبایل، نام یا لقب',
                    prefixIcon: Icon(Icons.search_rounded),
                    border: InputBorder.none,
                    filled: false,
                  ),
                ),
              ),
              IconButton.filled(
                onPressed: _doSearch,
                icon: _searching
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.search_rounded),
              ),
            ],
          ),
        ),
        Gaps.vMd,
        if (_searching)
          const LoadingView()
        else if (_searched && _searchResults.isEmpty)
          const AppCard(
            child: EmptyState(
              icon: Icons.person_search_rounded,
              title: 'کاربری یافت نشد',
              message: 'شماره کامل یا بخشی از آن را امتحان کنید.',
            ),
          )
        else if (_searchResults.isNotEmpty && _selectedUser == null)
          _buildSearchResultsList(),
        if (_selectedUser != null) ...[
          _buildSelectedUserHeader(),
          Gaps.vMd,
          if (_loadingDetail && _userDetail == null)
            const LoadingView()
          else if (_userDetail != null) ...[
            _buildUserStatsCard(),
            Gaps.vMd,
            _buildBiggestGainsCard(),
            Gaps.vMd,
            _buildPointsBySourceCard(),
            Gaps.vMd,
            _buildChangePointsCard(),
            Gaps.vMd,
            _buildTransactionsHistoryCard(),
          ],
        ],
      ],
    );
  }

  Widget _buildSearchResultsList() {
    final theme = Theme.of(context);
    return AppCard(
      title: 'نتایج جست‌وجو',
      child: Column(
        children: [
          for (final u in _searchResults)
            ListTile(
              leading: const CircleAvatar(child: Icon(Icons.person_rounded)),
              title: Text(u['nickname'] ?? '${u['first_name'] ?? ''} ${u['last_name'] ?? ''}'.trim() == ''
                  ? 'بی‌نام'
                  : '${u['nickname'] ?? ''} ${u['first_name'] ?? ''} ${u['last_name'] ?? ''}'.trim()),
              subtitle: Text(u['mobile'] ?? ''),
              trailing: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('${faNum(u['current_points'])} امتیاز', style: theme.textTheme.titleSmall),
                  if (u['status'] != 'active')
                    const StatusBadge(status: 'blocked', labels: {'blocked': 'مسدود'}),
                ],
              ),
              onTap: () => _pickUser(u),
            ),
        ],
      ),
    );
  }

  Widget _buildSelectedUserHeader() {
    return Row(
      children: [
        IconButton(
          onPressed: () {
            setState(() {
              _selectedUser = null;
              _userDetail = null;
            });
          },
          icon: const Icon(Icons.arrow_back_rounded),
        ),
        Gaps.hSm,
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _selectedUser!['nickname'] ?? 'کاربر بی‌نام',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
              ),
              Text(_selectedUser!['mobile'] ?? ''),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildUserStatsCard() {
    final theme = Theme.of(context);
    final stats = _userDetail?['summary']?['totals'] ?? {};
    final user = _userDetail?['user'] ?? {};
    final ledgerMatches = _userDetail?['ledgerMatches'] == true;
    final ledgerSum = _userDetail?['ledgerSum'] ?? 0;

    return AppCard(
      title: 'خلاصه آمار امتیازات',
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _statItem('امتیاز فعلی', faNum(user['current_points'])),
              _statItem('مجموع کسب‌شده', faNum(stats['earned'])),
              _statItem('مجموع خرج‌شده', faNum(stats['spent'])),
            ],
          ),
          if (!ledgerMatches) ...[
            Gaps.vSm,
            Container(
              padding: const EdgeInsets.all(Gaps.sm),
              decoration: BoxDecoration(
                color: theme.colorScheme.errorContainer.withValues(alpha: 0.12),
                borderRadius: Corners.rMd,
                border: Border.all(color: theme.colorScheme.error.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  Icon(Icons.warning_amber_rounded, color: theme.colorScheme.error),
                  Gaps.hSm,
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('دفتر با موجودی مطابقت ندارد',
                            style: TextStyle(fontWeight: FontWeight.bold, color: theme.colorScheme.error)),
                        Text(
                          'جمع ردیف‌های دفتر کل ${faNum(ledgerSum)} است اما موجودی دیتابیس ${faNum(user['current_points'])} می‌باشد.',
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _statItem(String label, String value) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Text(label, style: theme.textTheme.labelMedium),
        const SizedBox(height: 4),
        Text(value, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
      ],
    );
  }

  Widget _buildBiggestGainsCard() {
    final list = List<Map>.from(_userDetail?['summary']?['biggestGains'] ?? []);
    if (list.isEmpty) return const SizedBox();

    return AppCard(
      title: 'بیشترین دریافت‌های یک‌باره (آنومالی)',
      subtitle: 'برای شناسایی ناهنجاری‌ها و بقیه موارد کسب سود بزرگ',
      child: Column(
        children: [
          for (final g in list)
            ListTile(
              dense: true,
              leading: const Icon(Icons.star_border_purple500_rounded, color: Colors.amber),
              title: Text('+${faNum(g['delta'])} امتیاز (${_srcFa(g['source'])})'),
              subtitle: Text(g['description'] ?? ''),
              trailing: Text(g['created_at'] != null ? '${DateTime.tryParse(g['created_at'])?.toLocal().toIso8601String().substring(0,10)}' : ''),
            ),
        ],
      ),
    );
  }

  Widget _buildPointsBySourceCard() {
    final list = List<Map>.from(_userDetail?['summary']?['bySource'] ?? []);
    if (list.isEmpty) return const SizedBox();

    return AppCard(
      title: 'امتیازهای کسب‌شده بر اساس منبع',
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final s in list)
            Chip(
              label: Text('${_srcFa(s['source'])}: ${s['total'] > 0 ? '+' : ''}${faNum(s['total'])}'),
              backgroundColor: Theme.of(context).colorScheme.surfaceContainerHigh,
            ),
        ],
      ),
    );
  }

  Widget _buildChangePointsCard() {
    final theme = Theme.of(context);
    return AppCard(
      title: 'تغییر امتیاز کاربر',
      subtitle: 'عدد منفی برای کسر امتیاز. دلیل برای کسر کردن اجباری است و برای کاربر ارسال می‌شود.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _amountController,
            keyboardType: const TextInputType.numberWithOptions(signed: true),
            decoration: const InputDecoration(
              labelText: 'مقدار (مثبت یا منفی)',
              helperText: 'منفی که باشد، «دلیل» اجباری می‌شود و همین جمله برای کاربر ارسال می‌شود؛ موجودیِ کاربر زیرِ صفر نمی‌رود.', helperMaxLines: 6,
              prefixIcon: Icon(Icons.exposure_rounded),
            ),
          ),
          Gaps.vSm,
          TextField(
            controller: _reasonController,
            decoration: const InputDecoration(
              labelText: 'دلیل تغییر (پیام به کاربر)',
              prefixIcon: Icon(Icons.chat_bubble_outline_rounded),
            ),
          ),
          Gaps.vMd,
          FilledButton.icon(
            onPressed: _savingPoints ? null : _submitPoints,
            style: FilledButton.styleFrom(
              backgroundColor: _amountController.text.startsWith('-') ? theme.colorScheme.error : null,
            ),
            icon: _savingPoints
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.save_rounded),
            label: const Text('ثبت و ارسال نوتیفیکیشن'),
          ),
        ],
      ),
    );
  }

  Widget _buildTransactionsHistoryCard() {
    final list = List<Map>.from(_userDetail?['transactions'] ?? []);
    final total = _userDetail?['total'] ?? 0;

    return AppCard(
      title: 'ریز تراکنش‌ها',
      subtitle: '${faNum(total)} ردیف تراکنش ثبت شده',
      action: DropdownButton<String>(
        value: _sourceFilter,
        items: [
          const DropdownMenuItem(value: '', child: Text('همهٔ منابع')),
          for (final entry in _sourceFa.entries)
            DropdownMenuItem(value: entry.key, child: Text(entry.value)),
        ],
        onChanged: (v) {
          if (v != null) {
            setState(() {
              _sourceFilter = v;
              _page = 0;
            });
            _loadDetail(_selectedUser!['id'], offset: 0, source: v);
          }
        },
      ),
      child: Column(
        children: [
          if (list.isEmpty)
            const EmptyState(icon: Icons.history_rounded, title: 'تراکنشی یافت نشد')
          else ...[
            for (final t in list) ...[
              const Divider(height: 1),
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                '${t['delta'] > 0 ? '+' : ''}${faNum(t['delta'])} امتیاز',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: t['delta'] > 0 ? Colors.green : Colors.red,
                                ),
                              ),
                              Gaps.hSm,
                              Text(_srcFa(t['source']), style: const TextStyle(fontSize: 12, color: Colors.grey)),
                            ],
                          ),
                          const SizedBox(height: 3),
                          Text(t['description'] ?? '—', style: const TextStyle(fontSize: 12.5)),
                          if (t['admin_username'] != null)
                            Text('توسط ادمین: ${t['admin_username']}', style: const TextStyle(fontSize: 11, color: Colors.grey)),
                        ],
                      ),
                    ),
                    Text(
                      t['created_at'] != null ? '${DateTime.tryParse(t['created_at'])?.toLocal().toIso8601String().substring(11,16)}' : '',
                      style: const TextStyle(color: Colors.grey),
                    ),
                  ],
                ),
              ),
            ],
            if (total > _pageSize) ...[
              Gaps.vSm,
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  TextButton(
                    onPressed: _page > 0
                        ? () {
                            final p = _page - 1;
                            setState(() => _page = p);
                            _loadDetail(_selectedUser!['id'], offset: p * _pageSize, source: _sourceFilter);
                          }
                        : null,
                    child: const Text('قبلی'),
                  ),
                  Text('صفحهٔ ${faNum(_page + 1)} از ${faNum((total / _pageSize).ceil())}'),
                  TextButton(
                    onPressed: (_page + 1) * _pageSize < total
                        ? () {
                            final p = _page + 1;
                            setState(() => _page = p);
                            _loadDetail(_selectedUser!['id'], offset: p * _pageSize, source: _sourceFilter);
                          }
                        : null,
                    child: const Text('بعدی'),
                  ),
                ],
              ),
            ],
          ],
        ],
      ),
    );
  }

  Widget _buildTopTab() {
    if (_loadingTop && _topData == null) {
      return const LoadingView();
    }
    final topList = List<Map>.from(_topData?['top'] ?? []);
    final biggestSingleList = List<Map>.from(_topData?['biggestSingle'] ?? []);
    final bySourceList = List<Map>.from(_topData?['bySource'] ?? []);

    return ListView(
      padding: const EdgeInsets.all(Gaps.md),
      children: [
        AppCard(
          title: 'برترین امتیازگیرندگان پلتفرم',
          action: DropdownButton<String>(
            value: _topDays,
            items: const [
              DropdownMenuItem(value: '', child: Text('از ابتدا')),
              DropdownMenuItem(value: '1', child: Text('۲۴ ساعت اخیر')),
              DropdownMenuItem(value: '7', child: Text('۷ روز اخیر')),
              DropdownMenuItem(value: '30', child: Text('۳۰ روز اخیر')),
            ],
            onChanged: (v) {
              if (v != null) {
                setState(() {
                  _topDays = v;
                  _topData = null;
                });
                _loadTop();
              }
            },
          ),
          child: Column(
            children: [
              if (topList.isEmpty)
                const EmptyState(icon: Icons.trending_up_rounded, title: 'امتیازی ثبت نشده')
              else
                ListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: topList.length,
                  itemBuilder: (context, idx) {
                    final u = topList[idx];
                    return ListTile(
                      dense: true,
                      leading: CircleAvatar(child: Text(faNum(idx + 1))),
                      title: Text(u['nickname'] ?? u['mobile'] ?? 'بی‌نام'),
                      subtitle: Text('${u['mobile']} · ${faNum(u['tx_count'])} تراکنش'),
                      trailing: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text('+${faNum(u['earned_in_window'])}', style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.green)),
                          Text('مانده: ${faNum(u['current_points'])}', style: const TextStyle(fontSize: 11, color: Colors.grey)),
                        ],
                      ),
                    );
                  },
                ),
            ],
          ),
        ),
        Gaps.vMd,
        if (biggestSingleList.isNotEmpty) ...[
          AppCard(
            title: 'بزرگ‌ترین دریافت‌های یک‌باره کل پلتفرم (آنومالی)',
            subtitle: 'برای شناسایی تقلب و یا ردیابی مبالغ خیلی غیرعادی',
            child: Column(
              children: [
                for (final t in biggestSingleList)
                  ListTile(
                    dense: true,
                    leading: const Icon(Icons.report_problem_rounded, color: Colors.orange),
                    title: Text('+${faNum(t['delta'])} امتیاز (${_srcFa(t['source'])})'),
                    subtitle: Text('${t['nickname'] ?? 'بی‌نام'} (${t['mobile']})\n${t['description'] ?? ''}'),
                    trailing: Text(t['created_at'] != null ? '${DateTime.tryParse(t['created_at'])?.toLocal().toIso8601String().substring(11,16)}' : ''),
                  ),
              ],
            ),
          ),
          Gaps.vMd,
        ],
        if (bySourceList.isNotEmpty) ...[
          AppCard(
            title: 'کل امتیازهای توزیع‌شده بر اساس منبع',
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final s in bySourceList)
                  Chip(
                    label: Text('${_srcFa(s['source'])}: +${faNum(s['total'])} (${faNum(s['n'])} بار)'),
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  // ═══ تبِ هدیهٔ عضویت ═══
  //
  // یک تنظیمِ سراسری: هر کاربرِ تازه‌ثبت‌نام یک‌بار این امتیاز را
  // می‌گیرد. عمداً یک کارتِ ساده است نه یک صفحهٔ کامل — یک عدد و یک
  // کلید. آینهٔ دقیقِ تبِ «هدیهٔ عضویت» در points.jsx.
  Widget _buildGiftTab() {
    if (_gift == null) return const LoadingView();

    final savedEnabled = _gift!['enabled'] == true;
    final savedPoints = '${_gift!['points'] ?? 0}';
    final savedMessage = '${_gift!['message'] ?? ''}';
    final dirty = savedEnabled != _giftEnabled ||
        savedPoints != _giftPoints.text.trim() ||
        savedMessage != _giftMessage.text.trim();

    return ListView(
      padding: const EdgeInsets.all(Gaps.md),
      children: [
        AppCard(
          title: 'هدیهٔ امتیاز برای عضویت',
          subtitle: 'هر کاربری که تازه ثبت‌نام کند، یک‌بار این امتیاز را می‌گیرد',
          // `StatusBadge` رنگ را از خودِ `status` می‌گیرد: `active` سبز،
          // `closed` خاکستریِ خنثی. برچسبِ فارسی را با `labels` می‌دهیم.
          action: StatusBadge(
            status: savedEnabled ? 'active' : 'closed',
            labels: {
              'active': 'فعال — ${faNum(_gift!['points'] ?? 0)} امتیاز',
              'closed': 'غیرفعال',
            },
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                value: _giftEnabled,
                onChanged: _giftBusy ? null : (v) => setState(() => _giftEnabled = v),
                title: const Text('فعال باشد',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                subtitle: Text(
                  _giftEnabled
                      ? 'به هر کاربر جدید هدیه داده می‌شود'
                      : 'کاربر جدید هدیه‌ای نمی‌گیرد',
                  style: const TextStyle(fontSize: 12),
                ),
              ),
              Gaps.vSm,
              TextField(
                controller: _giftPoints,
                keyboardType: TextInputType.number,
                enabled: !_giftBusy,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(
                  labelText: 'مقدار امتیاز',
              helperText: 'فقط به ثبت‌نام‌هایِ بعد از ذخیره داده می‌شود، یک‌بار برای هر کاربر، و در رتبه‌بندیِ لیگ حساب نمی‌شود.', helperMaxLines: 6,
                  hintText: 'مثلاً ۵۰۰',
                  border: OutlineInputBorder(),
                ),
              ),
              Gaps.vSm,
              TextField(
                controller: _giftMessage,
                maxLines: 2,
                maxLength: 200,
                enabled: !_giftBusy,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(
                  labelText: 'پیامِ اعلان به کاربر',
              helperText: 'حداکثر ۲۰۰ نویسه؛ همین متن در اعلانِ خوش‌آمدگوییِ کاربر خوانده می‌شود (جایِ متنِ پیش‌فرضِ سرور).', helperMaxLines: 6,
                  hintText: 'به قلقلی خوش آمدی! این امتیاز هدیهٔ عضویت توست.',
                  border: OutlineInputBorder(),
                ),
              ),
              Gaps.vSm,
              // ── چرا این هشدارها ──
              // مدیر باید بداند این تنظیم بر چه چیزی اثر دارد و بر چه
              // چیزی ندارد. مهم‌ترینش: گذشته را عوض نمی‌کند.
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: const Color(0xFF38BDF8).withValues(alpha: 0.07),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF38BDF8).withValues(alpha: 0.22)),
                ),
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _GiftHint('فقط برای ثبت‌نام‌های بعد از ذخیره — کاربرانِ فعلی چیزی نمی‌گیرند.'),
                    _GiftHint('هر کاربر فقط یک‌بار می‌گیرد؛ ورودِ مجدد هدیهٔ دوباره ندارد.'),
                    _GiftHint('این امتیاز در رتبه‌بندی لیگ حساب نمی‌شود و کمیسیون معرف ندارد.'),
                    _GiftHint('در ریز تراکنش‌ها با منبعِ «هدیهٔ عضویت» ثبت می‌شود.'),
                  ],
                ),
              ),
              Gaps.vMd,
              FilledButton(
                onPressed: (_giftBusy || !dirty) ? null : _saveGift,
                child: _giftBusy
                    ? const SizedBox(
                        width: 18, height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('ذخیرهٔ تنظیم'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// یک سطرِ راهنما با نقطهٔ ابتدایی. جدا شده تا `const` بماند.
class _GiftHint extends StatelessWidget {
  const _GiftHint(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('· ', style: TextStyle(fontSize: 12.5, height: 1.7)),
            Expanded(
              child: Text(text,
                  style: const TextStyle(fontSize: 12.5, height: 1.7)),
            ),
          ],
        ),
      );
}
