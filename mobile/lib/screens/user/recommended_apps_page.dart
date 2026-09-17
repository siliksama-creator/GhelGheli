import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/safe_image.dart';

/// ═══════════════════════════════════════════════════════════════════════════
/// برنامه‌های پیشنهادی — صفحهٔ مستقل، از شیتِ «بیشتر» باز می‌شود
/// ═══════════════════════════════════════════════════════════════════════════
///
/// ── خواستهٔ مالک (۲۶ شهریور) ───────────────────────────────────────────────
///
///   «یک قسمت برنامهٔ پیشنهادی در قسمت (بیشتر) وب و اندروید که از پنل ادمین
///    مدیریت بشه... با لینکِ دانلود یا لینکِ ورود به وب‌سایت، به همراه عکس و
///    توضیحات؛ بصورتِ خیلی زیبا و کادربندی‌شده. بدونِ نیاز به آپدیت اندروید و
///    وب‌سایت. اگه تعداد بیشتر از ۱۰ عدد شد، صفحه‌بندی‌شده.»
///
/// ── آینهٔ وب، واژه‌به‌واژه ─────────────────────────────────────────────────
///
/// همان مسیر (`/api/recommended-apps`)، همان اندازهٔ صفحه (`per_page=10`)،
/// همان برچسب‌ها (از سرور می‌آیند: `kindLabel`). گاردِ
/// `backend/scripts/testRecommendedApps.js` همین آینگی را قفل می‌کند تا روزی
/// که یک طرف عوض شد، تست قرمز شود نه اینکه کاربر دو رفتار متفاوت ببیند.
///
/// ── چرا همه‌چیز از سرور می‌آید ─────────────────────────────────────────────
///
/// هیچ عنوان/توضیح/لینکی داخل این فایل نیست. ادمین هر لحظه برنامه‌ای اضافه
/// یا حذف می‌کند و کاربر با همان نسخهٔ نصب‌شده می‌بیندش — تنها «امضای» این
/// صفحه در اپ، چیدمانِ کارت‌هاست.
///
/// ⚠️ بازکردنِ لینک با `try` محافظت شده: اگر کاربر اپِ مقصد را نداشته باشد
///    یا آدرس نامعتبر باشد، صفحه نباید بترکد. پیامِ خطا هم فارسی و کوتاه است.
// ⚠️ اندازهٔ صفحه **در خودِ آدرس** نوشته شده (`per_page=10`)، نه در یک ثابت:
//    گاردِ `backend/scripts/testRecommendedApps.js` همین رشته را در وب و
//    اندروید می‌سنجد تا دو کلاینت هرگز دو اندازهٔ صفحه نگیرند.

class RecommendedAppsPage extends StatefulWidget {
  const RecommendedAppsPage({super.key, required this.api});

  final ApiClient api;

  @override
  State<RecommendedAppsPage> createState() => _RecommendedAppsPageState();
}

class _RecommendedAppsPageState extends State<RecommendedAppsPage> {
  final List<Map<String, dynamic>> _items = [];
  int _page = 1;
  int _totalPages = 1;
  int _total = 0;
  bool _loading = true;
  String? _error;

  /// آیا بخش از پنل روشن است؟ `false` یعنی ادمین تیکِ «فعال» را برداشته —
  /// در آن حالت سرور فهرست را خالی می‌فرستد و پیامِ صفحه باید بگوید
  /// «غیرفعال است»، نه «هنوز چیزی نیست». این تفاوت برای کاربر مهم است:
  /// اولی یعنی منتظر نباش، دومی یعنی به‌زودی می‌آید.
  bool _enabled = true;

  @override
  void initState() {
    super.initState();
    _load(1);
  }

  Future<void> _load(int page) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // `fresh: true` = کش را دور بزن: ادمین ممکن است همین حالا برنامه‌ای
      // اضافه کرده باشد و کاربر انتظار دارد ببیندش.
      final res = await widget.api
          .get('/api/recommended-apps?page=$page&per_page=10', fresh: true);
      if (!mounted) return;
      final map = res is Map ? Map<String, dynamic>.from(res) : <String, dynamic>{};
      final fresh = (map['items'] as List? ?? const [])
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      final info = map['page'] is Map
          ? Map<String, dynamic>.from(map['page'] as Map)
          : const <String, dynamic>{};
      setState(() {
        _items
          ..clear()
          ..addAll(fresh);
        _page = (info['page'] as num?)?.toInt() ?? page;
        _totalPages = (info['totalPages'] as num?)?.toInt() ?? 1;
        _total = (info['total'] as num?)?.toInt() ?? fresh.length;
        _enabled = map['enabled'] != false;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = apiError(e);
      });
    }
  }

  Future<void> _openLink(String url) async {
    if (url.isEmpty) return;
    try {
      final uri = Uri.parse(url);
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('این لینک باز نشد')),
        );
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('این لینک باز نشد')),
      );
    }
  }

  Future<void> _goTo(int page) async {
    if (page < 1 || page > _totalPages || page == _page || _loading) return;
    await _load(page);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (_loading && _items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    return RefreshIndicator(
      onRefresh: () => _load(_page),
      child: ListView(
        padding: const EdgeInsets.all(Gaps.sm),
        children: [
          _header(theme),
          Gaps.vSm,
          if (_error != null) _errorCard(theme),
          if (_error == null && _items.isEmpty) _emptyCard(theme),
          if (_error == null)
            for (final app in _items) ...[
              _AppTile(
                app: app,
                onOpen: () => _openLink('${app['linkUrl'] ?? ''}'),
              ),
              Gaps.vSm,
            ],
          if (_error == null && _totalPages > 1) ...[
            Gaps.vXs,
            _pager(theme),
          ],
          const SizedBox(height: Gaps.xxl),
        ],
      ),
    );
  }

  Widget _header(ThemeData theme) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.link_rounded, size: 20, color: theme.colorScheme.primary),
              Gaps.hXs,
              Expanded(
                child: Text('برنامه‌های پیشنهادی',
                    style: theme.textTheme.titleMedium
                        ?.copyWith(fontWeight: FontWeight.w900)),
              ),
              if (_total > 0)
                Text(
                  _totalPages > 1
                      ? 'صفحهٔ ${faNum(_page)} از ${faNum(_totalPages)}'
                      : '${faNum(_total)} مورد',
                  style: theme.textTheme.labelSmall
                      ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
            ],
          ),
          Gaps.vXxs,
          Text(
            'برنامه‌ها و سایت‌هایی که به‌نظرِ ما به کارت می‌آید. با زدنِ هر کادر، لینکِ دانلود یا سایتش باز می‌شود.',
            style: theme.textTheme.bodySmall
                ?.copyWith(color: theme.colorScheme.onSurfaceVariant, height: 1.9),
          ),
        ],
      ),
    );
  }

  Widget _emptyCard(ThemeData theme) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_enabled ? 'هنوز برنامه‌ای معرفی نشده' : 'این بخش فعلاً غیرفعال است',
              style: theme.textTheme.bodyMedium
                  ?.copyWith(fontWeight: FontWeight.w800)),
          Gaps.vXxs,
          Text(
              _enabled
                  ? 'به‌زودی اینجا برنامه‌ها و سایت‌هایی که پیشنهاد می‌کنیم را می‌بینی.'
                  : 'مدیر می‌تواند هر وقت خواست از پنل روشنش کند.',
              style: theme.textTheme.bodySmall
                  ?.copyWith(color: theme.colorScheme.onSurfaceVariant, height: 1.9)),
        ],
      ),
    );
  }

  Widget _errorCard(ThemeData theme) {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_error ?? 'این بخش در دسترس نیست',
              style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w800, color: theme.colorScheme.error)),
          Gaps.vXs,
          OutlinedButton(
            onPressed: () => _load(_page),
            child: const Text('تلاش دوباره'),
          ),
        ],
      ),
    );
  }

  /// صفحه‌بندی — «قبلی / شماره‌ها / بعدی» (خواستهٔ صریحِ مالک).
  Widget _pager(ThemeData theme) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        TextButton(
          onPressed: _page > 1 ? () => _goTo(_page - 1) : null,
          child: const Text('قبلی'),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Gaps.xs),
          child: Text(
            '${faNum(_page)} / ${faNum(_totalPages)}',
            style: theme.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w900),
          ),
        ),
        TextButton(
          onPressed: _page < _totalPages ? () => _goTo(_page + 1) : null,
          child: const Text('بعدی'),
        ),
      ],
    );
  }
}

/// یک کادرِ معرفی — عکس، عنوان، برچسبِ نوع، توضیح و دکمهٔ بازکردن.
class _AppTile extends StatelessWidget {
  const _AppTile({required this.app, required this.onOpen});

  final Map<String, dynamic> app;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final title = '${app['title'] ?? ''}';
    final description = '${app['description'] ?? ''}';
    final kindLabel = '${app['kindLabel'] ?? ''}';
    final isSite = '${app['kind'] ?? ''}' == 'website';

    return AppCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: Corners.rMd,
            child: SizedBox(
              width: 64,
              height: 64,
              child: SafeImage(url: app['imageUrl'], width: 64, height: 64),
            ),
          ),
          Gaps.hSm,
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium
                            ?.copyWith(fontWeight: FontWeight.w900),
                      ),
                    ),
                    if (kindLabel.isNotEmpty) ...[
                      Gaps.hXs,
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.primary.withValues(alpha: 0.14),
                          borderRadius: Corners.rPill,
                          border: Border.all(
                              color: theme.colorScheme.primary.withValues(alpha: 0.35)),
                        ),
                        child: Text(kindLabel,
                            style: theme.textTheme.labelSmall?.copyWith(
                                color: theme.colorScheme.primary,
                                fontWeight: FontWeight.w800)),
                      ),
                    ],
                  ],
                ),
                if (description.isNotEmpty) ...[
                  Gaps.vXxs,
                  Text(
                    description,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant, height: 1.85),
                  ),
                ],
                Gaps.vXs,
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: FilledButton.tonalIcon(
                    onPressed: onOpen,
                    icon: Icon(isSite ? Icons.open_in_new_rounded : Icons.download_rounded,
                        size: 16),
                    label: Text(isSite ? 'ورود به سایت' : 'دریافت'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
