import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/brand_theme.dart';
import '../../theme/tokens.dart';
import '../../widgets/app_card.dart';
import '../../widgets/badges.dart';
import '../../widgets/state_views.dart';

/// User management & manual point adjustments. Same endpoints as legacy
/// `AdminUsers`.
class AdminUsers extends StatefulWidget {
  final ApiClient api;
  const AdminUsers({super.key, required this.api});

  @override
  State<AdminUsers> createState() => _AdminUsersState();
}

class _AdminUsersState extends State<AdminUsers> {
  List _rows = [];
  final _query = TextEditingController();
  bool _loading = true;
  String? _loadError;

  /// آیا درخواستِ «جزئیات کاربر» در راه است.
  ///
  /// بدون این، روی شبکهٔ کند هر تپ یک درخواست تازه می‌ساخت و در پایان
  /// چند دیالوگ روی هم باز می‌شد.
  bool _detailsBusy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    // بدون try، هر شکست شبکه‌ای `_loading` را برای همیشه true نگه می‌داشت
    // و فهرست کاربران تا ابد چرخنده نشان می‌داد. پاس قبلی این فایل را جا
    // انداخته بود چون نام متد با الگوی جست‌وجو نمی‌خواند.
    try {
      final rows = await widget.api
          .get('/api/admin/users?search=${Uri.encodeComponent(_query.text)}');
      if (!mounted) return;
      setState(() {
        _rows = rows;
        _loadError = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadError = apiError(e);
        _loading = false;
      });
    }
  }

  Future<void> _adjustPoints(String id) async {
    final controller = TextEditingController();
    final reasonController = TextEditingController();
    final formKey = GlobalKey<FormState>();

    final value = await showDialog<Map<String, String>>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('تغییر امتیاز کاربر'),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: controller,
                keyboardType: const TextInputType.numberWithOptions(signed: true),
                decoration: const InputDecoration(
                    labelText: 'مقدار امتیاز (منفی برای کسر)',
                    prefixIcon: Icon(Icons.exposure_rounded)),
                autofocus: true,
                validator: (v) {
                  final n = int.tryParse(v ?? '');
                  if (n == null || n == 0) return 'مقدار نامعتبر است';
                  if (n.abs() > 1000000) return 'حداکثر ۱٬۰۰۰٬۰۰۰ امتیاز';
                  return null;
                },
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: reasonController,
                decoration: const InputDecoration(
                    labelText: 'دلیل تغییر (برای کسر اجباری است)',
                    prefixIcon: Icon(Icons.comment_rounded)),
                validator: (v) {
                  final n = int.tryParse(controller.text);
                  if (n != null && n < 0 && (v == null || v.trim().length < 3)) {
                    return 'برای کسر امتیاز باید دلیل (حداقل ۳ حرف) بنویسید';
                  }
                  return null;
                },
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('لغو')),
          FilledButton(
              onPressed: () {
                if (formKey.currentState?.validate() == true) {
                  Navigator.pop(dialogContext, {
                    'points': controller.text,
                    'reason': reasonController.text,
                  });
                }
              },
              child: const Text('ثبت')),
        ],
      ),
    );

    try {
      if (value == null) return;
      final delta = int.tryParse(value['points']!.trim());
      final reasonText = value['reason']!.trim();
      if (delta == null || delta == 0) {
        _snack('عدد وارد‌شده معتبر نیست');
        return;
      }
      try {
        await widget.api.post('/api/admin/users/$id/points', {
          'points': delta,
          'reason': reasonText.isNotEmpty ? reasonText : 'تغییر امتیاز از اپ مدیریت',
        });
        await _load();
        _snack('امتیاز ثبت شد');
      } catch (e) {
        _snack(apiError(e));
      }
    } finally {
      controller.dispose();
      reasonController.dispose();
    }
  }

  void _snack(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // اصلاح دستی کیف پول (پول واقعی) — آینهٔ دقیقِ همین قابلیت در پنلِ وب
  // ═══════════════════════════════════════════════════════════════════════
  //
  // روتِ `POST /api/admin/wallet/users/:id/adjust` از ابتدا کامل بود
  // (تراکنشِ اتمیک، دفترِ کل، دلیلِ اجباری، ممیزی، اعلانِ کاربر) ولی در
  // هیچ‌کدام از دو پنل دکمه‌ای نداشت؛ پشتیبانی برای عودتِ یک پرداختِ
  // ناموفق مجبور بود مستقیم به دیتابیس دست بزند.
  //
  // برخلافِ امتیاز، اینجا دلیل برای **هر دو جهت** اجباری است: واریزِ
  // بی‌سند هم همان‌قدر مسئله‌ساز است که کسرِ بی‌سند.
  Future<void> _adjustWallet(Map user) async {
    final id = user['id'] as String;
    final balance = (user['wallet_balance'] as num?)?.toInt() ?? 0;
    final amountController = TextEditingController();
    final reasonController = TextEditingController();
    final formKey = GlobalKey<FormState>();

    final value = await showDialog<Map<String, String>>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('اصلاح موجودی کیف پول'),
        content: Form(
          key: formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: Text('موجودی فعلی: ${faNum(balance)} تومان',
                    style: const TextStyle(fontSize: 12.5)),
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: amountController,
                keyboardType:
                    const TextInputType.numberWithOptions(signed: true),
                decoration: const InputDecoration(
                    labelText: 'مبلغ به تومان (منفی برای کسر)',
                    prefixIcon: Icon(Icons.account_balance_wallet_rounded)),
                autofocus: true,
                validator: (v) {
                  final n = int.tryParse((v ?? '').trim());
                  if (n == null || n == 0) return 'مبلغ باید عددی مخالف صفر باشد';
                  // همان محافظِ سمتِ وب: کسرِ بیش از موجودی را پیش از
                  // رفتن به سرور می‌گیریم تا خطای گنگ نگیرد.
                  if (n < 0 && n.abs() > balance) {
                    return 'مبلغ کسر از موجودی کاربر بیشتر است';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: reasonController,
                decoration: const InputDecoration(
                    labelText: 'دلیل (الزامی، برای کاربر ارسال می‌شود)',
                    prefixIcon: Icon(Icons.comment_rounded)),
                validator: (v) => (v == null || v.trim().length < 3)
                    ? 'ثبت دلیل (حداقل ۳ حرف) الزامی است'
                    : null,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('لغو')),
          FilledButton(
              onPressed: () {
                if (formKey.currentState?.validate() == true) {
                  Navigator.pop(dialogContext, {
                    'amount': amountController.text,
                    'reason': reasonController.text,
                  });
                }
              },
              child: const Text('ادامه')),
        ],
      ),
    );

    try {
      if (value == null) return;
      final amount = int.tryParse(value['amount']!.trim());
      final reason = value['reason']!.trim();
      if (amount == null || amount == 0) {
        _snack('مبلغ وارد‌شده معتبر نیست');
        return;
      }
      if (!mounted) return;

      // تأییدِ دوم: تنها جای اپِ مدیریت که یک اشتباهِ تایپی مستقیماً
      // پولِ واقعی جابه‌جا می‌کند.
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: Text(amount > 0 ? 'تأیید واریز' : 'تأیید کسر'),
          content: Text(
              '${faNum(amount.abs())} تومان ${amount > 0 ? 'به' : 'از'} کیف پول '
              '«${user['nickname'] ?? user['mobile']}» ${amount > 0 ? 'اضافه' : 'کسر'} می‌شود. '
              'این عملیات برگشت‌پذیر نیست.'),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(c, false),
                child: const Text('لغو')),
            FilledButton(
                onPressed: () => Navigator.pop(c, true),
                child: Text(amount > 0 ? 'واریز کن' : 'کسر کن')),
          ],
        ),
      );
      if (confirmed != true) return;

      try {
        final r = await widget.api.post(
            '/api/admin/wallet/users/$id/adjust',
            {'amount': amount, 'reason': reason});
        await _load();
        _snack(r is Map && r['message'] != null
            ? '${r['message']}'
            : 'موجودی کیف پول تغییر کرد');
      } catch (e) {
        // پیامِ سرور («دسترسی کافی نیست» برای نقشِ غیرِ super_admin،
        // «موجودی کافی نیست» و ...) عیناً نمایش داده می‌شود.
        _snack(apiError(e));
      }
    } finally {
      amountController.dispose();
      reasonController.dispose();
    }
  }

  // SMS OTP isn't active yet, so users can't self-service a forgotten
  // password. Support can set a temporary one here after verifying the
  // user's identity by phone/in person — the action is written to the
  // audit log on the backend.

  Future<void> _toggleSpins(Map user) async {
    final on = user['unlimited_spins'] != true;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(on ? 'چرخش نامحدود گردونه' : 'قطع چرخش نامحدود'),
        content: Text(on
            ? 'این حساب دیگر سهمیهٔ روزانه ندارد — فقط برای تست مالک.'
            : 'سهمیهٔ روزانه دوباره اعمال می‌شود.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(c, false),
              child: const Text('لغو')),
          FilledButton(
              onPressed: () => Navigator.pop(c, true),
              child: Text(on ? 'فعال کن' : 'قطع کن')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      final r = await widget.api.post(
          '/api/admin/users/${user['id']}/unlimited-spins',
          {'enabled': on, 'reason': 'از اپ مدیریت'});
      _snack(r is Map ? '${r['message'] ?? 'ثبت شد'}' : 'ثبت شد');
      await _load();
    } catch (e) {
      _snack(apiError(e));
    }
  }

  Future<void> _grantPlus(String id) async {
    final controller = TextEditingController(text: '30');
    final value = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('اعطای اشتراک قلقلی پلاس'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('مدت زمان اشتراک پلاس را بر حسب روز وارد کنید:', style: TextStyle(fontSize: 12.5)),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'تعداد روز', prefixIcon: Icon(Icons.star_rounded)),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('لغو')),
          FilledButton(onPressed: () => Navigator.pop(dialogContext, controller.text), child: const Text('اعطا')),
        ],
      ),
    );
    if (value == null) return;
    final days = int.tryParse(value) ?? 30;
    try {
      final r = await widget.api.post('/api/admin/users/$id/grant-plus', {'days': days});
      _snack(r is Map ? '${r['message'] ?? 'پلاس فعال شد'}' : 'اشتراک پلاس فعال شد');
      await _load();
    } catch (e) {
      _snack(apiError(e));
    }
  }

  Future<void> _notifyUser(String id) async {
    final controller = TextEditingController();
    final message = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('پیام اختصاصی مدیریت'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: 'متن پیام',
            hintText: 'این پیام در زنگولهٔ کاربر نمایش داده می‌شود',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('انصراف'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, controller.text.trim()),
            child: const Text('ارسال'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (message == null || message.isEmpty) return;
    try {
      await widget.api.post('/api/admin/users/$id/notify', {
        'title': 'پیام اختصاصی مدیریت',
        'body': message,
      });
      _snack('پیام اختصاصی ارسال شد');
    } catch (error) {
      _snack(apiError(error));
    }
  }

  Future<void> _resetPassword(String id) async {
    final controller = TextEditingController();
    final value = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('تنظیم رمز موقت'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
                'چون پیامک هنوز فعال نیست، کاربر نمی‌تواند رمز را خودش بازیابی کند. فقط بعد از احراز هویت کاربر این کار را انجام دهید.',
                style: TextStyle(fontSize: 12.5)),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              decoration: const InputDecoration(
                  labelText: 'رمز جدید (حداقل ۶ کاراکتر)',
                  prefixIcon: Icon(Icons.key_rounded)),
              autofocus: true,
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('لغو')),
          FilledButton(
              onPressed: () => Navigator.pop(dialogContext, controller.text),
              child: const Text('ثبت')),
        ],
      ),
    );
    try {
      if (value == null || value.isEmpty) return;
      if (value.length < 6) {
        _snack('رمز باید حداقل ۶ کاراکتر باشد');
        return;
      }
      try {
        await widget.api.post('/api/admin/users/$id/reset-password', {
          'newPassword': value,
          'reason': 'بازیابی رمز توسط پشتیبانی',
        });
        _snack('رمز عبور کاربر تغییر کرد؛ رمز جدید را به او اطلاع دهید');
      } catch (e) {
        // Critical to report: support would otherwise tell the user a new
        // password that was never actually set.
        _snack(apiError(e));
      }
    } finally {
      controller.dispose();
    }
  }

  /// جزئیات یک کاربر را می‌گیرد و در دیالوگ نشان می‌دهد.
  ///
  /// ═══════════════════════════════════════════════════════════════════════
  /// دو باگِ واقعی که اینجا رفع شد
  /// ═══════════════════════════════════════════════════════════════════════
  ///
  /// ۱. **بدون هیچ try/catch بود.** این تابع از یک `onTap` صدا زده
  ///    می‌شود، یعنی هیچ‌کس بالادست منتظرش نیست. اگر درخواست شکست
  ///    می‌خورد — شبکهٔ قطع، توکنِ منقضی، کاربرِ حذف‌شده، ۵۰۰ سرور —
  ///    استثنا مستقیم به zone می‌رفت: در حالت دیباگ صفحهٔ قرمز، در
  ///    ریلیز یک تپِ کاملاً بی‌اثر که مدیر فکر می‌کرد اپ هنگ کرده.
  ///
  /// ۲. **`d['user']` بدون بررسی به Map تبدیل می‌شد.** اگر پاسخ شکل
  ///    دیگری داشت (خطای HTML یک پروکسی، پاسخ خالی، کلیدِ عوض‌شده)
  ///    همان‌جا `TypeError` می‌داد. حالا شکلِ پاسخ بررسی می‌شود.
  ///
  /// همچنین یک نشانگرِ بارگذاری اضافه شد: قبلاً بین تپ و باز شدن
  /// دیالوگ هیچ بازخوردی نبود و روی شبکهٔ کند، مدیر چند بار تپ می‌کرد
  /// و چند دیالوگ روی هم باز می‌شد.
  Future<void> _showDetails(String id) async {
    // جلوگیری از تپِ دوباره تا وقتی درخواستِ قبلی در راه است.
    if (_detailsBusy) return;
    setState(() => _detailsBusy = true);

    Map<String, dynamic> u;
    try {
      final d = await widget.api.get('/api/admin/users/$id');
      final raw = d is Map ? d['user'] : null;
      if (raw is! Map) {
        throw StateError('پاسخ سرور شکل مورد انتظار را ندارد');
      }
      u = Map<String, dynamic>.from(raw);
    } catch (e) {
      if (!mounted) return;
      setState(() => _detailsBusy = false);
      ScaffoldMessenger.maybeOf(context)?.showSnackBar(
        SnackBar(
          content: Text(apiError(e)),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    if (!mounted) return;
    setState(() => _detailsBusy = false);

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(u['nickname'] ?? u['mobile'] ?? 'کاربر'),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              _DetailRow('موبایل/نام کاربری', u['mobile']),
              _DetailRow('نام', u['first_name']),
              _DetailRow('نام خانوادگی', u['last_name']),
              _DetailRow('سن', u['age']),
              _DetailRow('استان', u['province']),
              _DetailRow('محل زندگی', u['city']),
              _DetailRow('شماره کارت/شبا', u['bank_account']),
              _DetailRow('امتیاز فعلی', faNum(u['current_points'])),
              _DetailRow('امتیاز تاریخی', faNum(u['lifetime_points'])),
            ],
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('بستن'))
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
      children: [
        AppCard(
          padding: const EdgeInsets.all(Gaps.sm),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _query,
                  onSubmitted: (_) => _load(),
                  decoration: const InputDecoration(
                      labelText: 'جستجوی کاربر',
                      prefixIcon: Icon(Icons.search_rounded),
                      border: InputBorder.none,
                      filled: false),
                ),
              ),
              IconButton.filled(
                  onPressed: _load, icon: const Icon(Icons.search_rounded)),
            ],
          ),
        ),
        Gaps.vMd,
        if (_loading)
          const Padding(
              padding: EdgeInsets.symmetric(vertical: Gaps.xxl),
              child: LoadingView())
        else if (_loadError != null)
          Padding(
            padding: const EdgeInsets.all(Gaps.lg),
            child: ErrorBanner(message: _loadError!, onRetry: _load),
          )
        else if (_rows.isEmpty)
          const AppCard(
              child: EmptyState(
                  icon: Icons.person_search_rounded, title: 'کاربری یافت نشد'))
        else
          // 300 rows is the server's cap here and each row carries an avatar,
          // so spreading them constructed all 300 subtrees on every rebuild —
          // and every status change calls _load(), rebuilding the lot.
          // shrinkWrap + NeverScrollable keeps the single outer scroll view
          // while letting Flutter build only the visible rows.
          ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            padding: EdgeInsets.zero,
            itemCount: _rows.length,
            itemBuilder: (context, index) {
              final u = _rows[index];
              return Padding(
                padding: const EdgeInsets.only(bottom: Gaps.sm),
                child: AppCard(
                  padding: const EdgeInsets.all(Gaps.md),
                  onTap: () => _showDetails(u['id']),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('${u['mobile']} — ${u['nickname'] ?? ''}',
                                style: theme.textTheme.titleSmall,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis),
                            const SizedBox(height: 3),
                            Row(
                              children: [
                                Text('${faNum(u['current_points'])} امتیاز',
                                    style: theme.textTheme.bodySmall),
                                Gaps.hSm,
                                // موجودی کیف پول کنارِ امتیاز — مدیر پیش
                                // از هر اصلاحی باید عدد فعلی را ببیند.
                                Text(
                                    '${faNum((u['wallet_balance'] as num?)?.toInt() ?? 0)} تومان',
                                    style: theme.textTheme.bodySmall?.copyWith(
                                      // `context.brand.success` نسخهٔ
                                      // سازگار با کنتراستِ تمِ فعلی را
                                      // می‌دهد (ثابتِ خام روی سطحِ روشن
                                      // زیر حداقلِ WCAG است).
                                      color: ((u['wallet_balance'] as num?) ?? 0) > 0
                                          ? context.brand.success
                                          : null,
                                    )),
                                Gaps.hSm,
                                Text('${faNum((u['coins'] as num?)?.toInt() ?? 0)} سکه',
                                    style: theme.textTheme.bodySmall),
                                if (u['has_plus'] == true) ...[
                                  Gaps.hSm,
                                  Text('پلاس',
                                      style: theme.textTheme.bodySmall
                                          ?.copyWith(
                                              color: const Color(0xFFFFD166),
                                              fontWeight: FontWeight.w800)),
                                ],
                                Gaps.hSm,
                                StatusBadge(
                                    status: u['status'] ?? '',
                                    labels: const {
                                      'active': 'فعال',
                                      'blocked': 'مسدود'
                                    }),
                              ],
                            ),
                          ],
                        ),
                      ),
                      PopupMenuButton<String>(
                        onSelected: (s) async {
                          if (s == 'grant_plus') {
                            await _grantPlus(u['id']);
                          } else if (s == 'spins') {
                            await _toggleSpins(u);
                          } else if (s == 'points') {
                            await _adjustPoints(u['id']);
                          } else if (s == 'wallet') {
                            await _adjustWallet(u);
                          } else if (s == 'reset_password') {
                            await _resetPassword(u['id']);
                          } else if (s == 'notify') {
                            await _notifyUser(u['id']);
                          } else {
                            await widget.api.patch(
                                '/api/admin/users/${u['id']}/status',
                                {'status': s, 'reason': 'از اپ مدیریت'});
                            await _load();
                          }
                        },
                        itemBuilder: (_) => [
                          const PopupMenuItem(
                              value: 'grant_plus', child: Text('اعطای اشتراک پلاس')),
                          PopupMenuItem(
                              value: 'spins',
                              child: Text(u['unlimited_spins'] == true
                                  ? 'قطع چرخش نامحدود'
                                  : 'چرخش نامحدود گردونه')),
                          const PopupMenuItem(
                              value: 'points', child: Text('تغییر امتیاز')),
                          const PopupMenuItem(
                              value: 'wallet',
                              child: Text('اصلاح کیف پول')),
                          const PopupMenuItem(
                              value: 'reset_password',
                              child: Text('بازیابی رمز عبور')),
                          const PopupMenuItem(
                              value: 'notify',
                              child: Text('ارسال پیام اختصاصی')),
                          PopupMenuItem(
                              value: u['status'] == 'active'
                                  ? 'blocked'
                                  : 'active',
                              child: Text(u['status'] == 'active'
                                  ? 'مسدود'
                                  : 'رفع مسدودی')),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
      ],
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final Object? value;
  const _DetailRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Text('$label: ', style: theme.textTheme.bodySmall),
          Expanded(
              child: Text('${value ?? ''}', style: theme.textTheme.bodyMedium)),
        ],
      ),
    );
  }
}
