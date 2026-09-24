import 'package:flutter/material.dart';

import '../api_client.dart';
import '../core/app_config.dart';
import '../theme/tokens.dart';
import 'state_views.dart';
import 'ui_icon.dart';

/// ═══════════════════════════════════════════════════════════════════════
/// «صندوق سکه» — تبِ چهارمِ صفحهٔ لیگ (آینهٔ `userweb/src/components/CoinVault.jsx`)
/// ═══════════════════════════════════════════════════════════════════════
///
/// ── خواستهٔ مالک (۱۴۰۵/۰۷/۰۲) ────────────────────────────────────────
///
/// «یه قسمت جدید به نام صندوق سکه… مجموع سکه موقت در لیگ جاری رو نشون
///  می‌ده، و یه قسمت هم سکه بدست آمده که اون ۱۰ درصد سکه بعد پایان لیگ
///  ذخیره بشه داخلش و دیگه به لیگ جدید منتقل نشه. این تب این امکان رو به
///  کاربر می‌ده که خودش با انتخاب خودش سکه بدست اومده رو به هر لیگ در
///  جریانی که خواست واریز کنه. و زیرش یک قسمت دریافت جوایز مخصوص سکه که
///  فعلاً بزودی است.»
///
/// ── دو نوع سکه ────────────────────────────────────────────────────────
///
///   • «سکهٔ موقت»      — رتبه می‌سازد، با پایانِ لیگ صفر می‌شود.
///   • «سکهٔ بدست‌آمده» — نمی‌سوزد، ولی تا واریز نشود رتبه هم نمی‌سازد.
///
/// همهٔ متن‌ها از کلیدهای `vault.*` می‌آیند تا با وب واژه‌به‌واژه یکی بمانند
/// و از پنل ادمین قابلِ تغییر باشند.
class CoinVaultTab extends StatefulWidget {
  const CoinVaultTab({super.key, required this.api, this.economy, this.onChanged});

  final ApiClient api;
  final Map<String, dynamic>? economy;

  /// بعد از واریز، جدولِ لیگ هم عوض شده و باید تازه شود.
  final VoidCallback? onChanged;

  @override
  State<CoinVaultTab> createState() => _CoinVaultTabState();
}

class _CoinVaultTabState extends State<CoinVaultTab> {
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;

  String? _seasonId;
  final _amount = TextEditingController();
  bool _busy = false;
  String? _msg;
  String? _formError;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    // بدونِ این، هر بار که کاربر تب را عوض می‌کند یک کنترلر نشت می‌کند.
    _amount.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final r = await widget.api.get('/api/coin-vault', fresh: true);
      if (!mounted) return;
      setState(() {
        _data = Map<String, dynamic>.from(r as Map);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _loading = false;
      });
    }
  }

  int get _vaultCoins =>
      num.tryParse('${_data?['vaultCoins'] ?? 0}')?.toInt() ?? 0;

  int get _leagueCoins =>
      num.tryParse('${_data?['leagueCoins'] ?? 0}')?.toInt() ?? 0;

  List<Map<String, dynamic>> get _leagues =>
      ((_data?['activeLeagues'] as List?) ?? const [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();

  String get _chosen {
    final list = _leagues;
    if (_seasonId != null && _seasonId!.isNotEmpty) return _seasonId!;
    return list.isEmpty ? '' : '${list.first['seasonId']}';
  }

  Future<void> _deposit() async {
    setState(() {
      _msg = null;
      _formError = null;
    });
    final want = int.tryParse(_amount.text.trim()) ?? 0;
    if (want <= 0) {
      setState(() => _formError = 'مبلغ واریز را بنویس.');
      return;
    }
    if (want > _vaultCoins) {
      setState(() => _formError = 'موجودی صندوق کافی نیست.');
      return;
    }
    setState(() => _busy = true);
    try {
      final r = Map<String, dynamic>.from(
          await widget.api.post('/api/coin-vault/deposit', {
        'seasonId': _chosen,
        'amount': want,
      }) as Map);
      if (!mounted) return;
      setState(() {
        _busy = false;
        _amount.clear();
        _msg = liveText(
          'vault.depositDone',
          '${faNum(r['deposited'])} سکه به ${r['seasonTitle']} واریز شد',
          vars: {'amount': r['deposited'], 'league': r['seasonTitle']},
        );
      });
      await _load();
      widget.onChanged?.call();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _formError = '$e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _data == null) return const LoadingView();
    if (_error != null && _data == null) {
      return ErrorBanner(message: _error!, onRetry: _load);
    }

    final pct = num.tryParse('${widget.economy?['coinCarryoverPercent'] ?? ''}')
            ?.toInt() ??
        10;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(Gaps.md, Gaps.sm, Gaps.md, Gaps.xxl),
        children: [
          _stat(
            icon: 'coins',
            tone: const Color(0xFF38BDF8),
            label: liveText('vault.leagueCoinsLabel', 'سکهٔ موقت در لیگ جاری'),
            value: _leagueCoins,
            note: liveText('vault.leagueCoinsNote',
                'این سکه رتبهٔ تو را در لیگ می‌سازد و با پایانِ لیگ صفر می‌شود.'),
          ),
          Gaps.vSm,
          _stat(
            icon: 'shield',
            tone: const Color(0xFFFFD166),
            label: liveText('vault.earnedLabel', 'سکهٔ بدست آمده'),
            value: _vaultCoins,
            note: liveText('vault.earnedNote',
                'سهمی که از لیگ‌های پایان‌یافته ذخیره شده. صفر نمی‌شود و هر وقت خواستی به لیگِ دلخواهت واریزش کن.'),
          ),
          Gaps.vMd,
          _depositBox(pct),
          Gaps.vMd,
          _soonBox(),
        ],
      ),
    );
  }

  Widget _stat({
    required String icon,
    required Color tone,
    required String label,
    required int value,
    required String note,
  }) =>
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: tone.withValues(alpha: 0.12),
          border: Border.all(color: tone.withValues(alpha: 0.32)),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Center(child: UiIcon(icon, size: 22, color: tone)),
            ),
            Gaps.hSm,
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label,
                      style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF9FB6D0))),
                  Text(faNum(value),
                      style: const TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.w900,
                          color: Colors.white)),
                  Text(note,
                      style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          height: 1.55,
                          color: Color(0xFF8EA6BD))),
                ],
              ),
            ),
          ],
        ),
      );

  Widget _depositBox(int pct) {
    final leagues = _leagues;
    final children = <Widget>[
      Text(liveText('vault.depositTitle', 'واریز به لیگ'),
          style: const TextStyle(
              fontSize: 14, fontWeight: FontWeight.w900, color: Colors.white)),
      const SizedBox(height: 6),
    ];

    if (_vaultCoins <= 0) {
      children.add(Text(
        liveText('vault.empty',
            'هنوز سکه‌ای در صندوق نداری. با پایانِ هر لیگ، ${faNum(pct)}٪ سکه‌ات اینجا ذخیره می‌شود.',
            vars: {'percent': pct}),
        style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            height: 1.7,
            color: Color(0xFF9FB6D0)),
      ));
    } else if (leagues.isEmpty) {
      children.add(Text(
        liveText('vault.noLeague',
            'الان هیچ لیگی در جریان نیست. به‌محضِ شروعِ لیگِ بعدی می‌توانی واریز کنی.'),
        style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            height: 1.7,
            color: Color(0xFF9FB6D0)),
      ));
    } else {
      children.addAll([
        Text(
          liveText('vault.depositHint',
              'لیگ را انتخاب کن و مبلغ را بنویس. بعد از واریز، سکه واردِ رتبه‌بندیِ همان لیگ می‌شود و برگشت ندارد.'),
          style: const TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              height: 1.6,
              color: Color(0xFF8EA6BD)),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: leagues.map((l) {
            final id = '${l['seasonId']}';
            final on = _chosen == id;
            return InkWell(
              onTap: () => setState(() => _seasonId = id),
              borderRadius: BorderRadius.circular(14),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                decoration: BoxDecoration(
                  color: on ? const Color(0xFFB5EF58) : const Color(0xFF0B2039),
                  border: Border.all(
                      color: on
                          ? Colors.transparent
                          : Colors.white.withValues(alpha: 0.10)),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('${l['title']}',
                        style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w900,
                            color: on
                                ? const Color(0xFF10210A)
                                : const Color(0xFFDBEEFF))),
                    Text('سکهٔ تو: ${faNum(l['myCoins'])}',
                        style: TextStyle(
                            fontSize: 10.5,
                            color: on
                                ? const Color(0xFF2C4A12)
                                : const Color(0xFF8EA6BD))),
                  ],
                ),
              ),
            );
          }).toList(),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _amount,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(hintText: 'مقدار سکه'),
              ),
            ),
            Gaps.hSm,
            OutlinedButton(
              onPressed: () => setState(
                  () => _amount.text = '$_vaultCoins'),
              child: Text(liveText('vault.depositAll', 'همه')),
            ),
          ],
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _busy ? null : _deposit,
            child: Text(_busy
                ? 'در حال واریز...'
                : liveText('vault.depositCta', 'واریز به این لیگ')),
          ),
        ),
      ]);
    }

    if (_msg != null) {
      children.addAll([
        const SizedBox(height: 10),
        Text(_msg!,
            style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: Color(0xFFB5EF58))),
      ]);
    }
    if (_formError != null) {
      children.addAll([
        const SizedBox(height: 10),
        Text(_formError!,
            style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: Color(0xFFFF9DB0))),
      ]);
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        border: Border.all(color: Colors.white.withValues(alpha: 0.09)),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
    );
  }

  /// «بزودی» — عمداً بی‌تعامل، تا وعده با دکمهٔ فعال اشتباه نشود.
  Widget _soonBox() => Opacity(
        opacity: 0.72,
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.025),
            border: Border.all(
                color: Colors.white.withValues(alpha: 0.15),
                style: BorderStyle.solid),
            borderRadius: BorderRadius.circular(18),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                        liveText('vault.prizesTitle', 'دریافت جوایز مخصوص سکه'),
                        style: const TextStyle(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w900,
                            color: Color(0xFFDBEEFF))),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 11, vertical: 3),
                    decoration: BoxDecoration(
                      color: const Color(0x22FFD166),
                      border: Border.all(color: const Color(0x55FFD166)),
                      borderRadius: BorderRadius.circular(99),
                    ),
                    child: Text(liveText('vault.prizesSoon', 'بزودی'),
                        style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w900,
                            color: Color(0xFFFFD166))),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                liveText('vault.prizesNote',
                    'به‌زودی می‌توانی سکه‌هایت را مستقیم با جوایزِ ویژه عوض کنی.'),
                style: const TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    height: 1.6,
                    color: Color(0xFF8EA6BD)),
              ),
            ],
          ),
        ),
      );
}
