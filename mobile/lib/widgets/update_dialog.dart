// ═══════════════════════════════════════════════════════════════════════════
// دیالوگِ آپدیتِ داخل‌اپی: دانلودِ خودکار با نوارِ پیشرفتِ انیمیشنی
// ═══════════════════════════════════════════════════════════════════════════
//
// رفتار (خواستهٔ مالک، ۳ مهر ۱۴۰۵):
//
//   • به‌محض آمدنِ پیغام — اجباری یا غیراجباری — دانلود خودکار شروع
//     می‌شود و یک لودینگِ انیمیشنی (درصد + نوارِ براقِ متحرک) پر می‌شود.
//   • بعد از دانلود، نصب‌کنندهٔ سیستم خودکار باز می‌شود («خودشو نصب کنه»
//     در حدِ ممکنِ اندروید: نصبِ بی‌صدا برای اپِ عادی ممنوع است).
//   • در حالتِ اجباری، دیالوگ هیچ راهِ بستنی ندارد (نه دکمه، نه لمسِ
//     بیرون، نه دکمهٔ برگشت) تا کاربر بدونِ آپدیت نتواند با اپ کار کند.
//   • اگر کانالِ نصبِ بومی نباشد (بیلدِ محلیِ بدونِ پچ)، خودکار مرورگر
//     باز می‌شود تا کاربر هرگز گیر نکند.
//
// رشته‌ها از همان گروهِ `live_copy.update` می‌آیند؛ هشت کلیدِ تازه
// (downloading … forcedNote) در `backend/src/services/liveContent.js`
// ثبت‌اند و پنلِ «متن‌های زنده» آن‌ها را نشان می‌دهد.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api_client.dart';
import '../../core/app_config.dart';
import '../../services/app_updater.dart';

/// نمایشِ دیالوگِ آپدیت. `info` از `app.release` ساخته می‌شود.
Future<void> showAppUpdateDialog({
  required BuildContext context,
  required AppUpdateInfo info,
}) {
  return showDialog<void>(
    context: context,
    barrierDismissible: !info.forced,
    builder: (_) => _AppUpdateDialog(info: info),
  );
}

class _AppUpdateDialog extends StatefulWidget {
  final AppUpdateInfo info;

  const _AppUpdateDialog({required this.info});

  @override
  State<_AppUpdateDialog> createState() => _AppUpdateDialogState();
}

class _AppUpdateDialogState extends State<_AppUpdateDialog>
    with SingleTickerProviderStateMixin {
  late final AppUpdater _updater = AppUpdater();
  late final AnimationController _shimmer;

  /// نصب فقط یک بارِ خودکار شلیک می‌شود؛ اگر کاربر از نصب‌کننده
  /// برگردد، دکمهٔ «نصب» همان کار را دستی می‌کند.
  bool _installFired = false;

  /// مرورگرِ اضطراری هم فقط یک بارِ خودکار باز می‌شود.
  bool _browserFired = false;

  @override
  void initState() {
    super.initState();
    // برقِ متحرکِ روی نوارِ پیشرفت — حلقهٔ بی‌پایان تا بسته‌شدنِ دیالوگ.
    _shimmer = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat();
    _updater.addListener(_onUpdate);
    // دانلودِ خودکار: بدونِ منتظرِ لمسِ کاربر ماندن.
    unawaited(_updater.start(widget.info));
  }

  @override
  void dispose() {
    _updater.removeListener(_onUpdate);
    // dispose هم دانلودِ نیمه‌کاره را لغو می‌کند.
    _updater.dispose();
    _shimmer.dispose();
    super.dispose();
  }

  void _onUpdate() {
    final snap = _updater.value;
    if (snap.phase == AppUpdatePhase.readyToInstall && !_installFired) {
      _installFired = true;
      unawaited(_updater.install());
    } else if (snap.phase == AppUpdatePhase.error &&
        snap.errorCode == 'missing-plugin' &&
        !_browserFired) {
      _browserFired = true;
      unawaited(_openInBrowser());
    }
  }

  Future<void> _openInBrowser() async {
    final url = widget.info.url;
    if (url.isEmpty) return;
    try {
      await launchUrl(
        Uri.parse(url),
        mode: LaunchMode.externalApplication,
      );
    } catch (_) {
      // اگر مرورگر هم باز نشد، دکمه‌اش روی صفحه می‌ماند و کاربر
      // خودش دوباره می‌زند — بهتر از دیالوگِ بی‌دکمه.
    }
  }

  void _close() {
    _updater.cancel();
    if (mounted) Navigator.of(context).pop();
  }

  /// بدنهٔ دیالوگ — همان دو جملهٔ قبلی (notice + body) تا آینهٔ وب بماند.
  Widget _body(BuildContext context) {
    final theme = Theme.of(context);
    final min = widget.info.min.trim();
    if (min.isEmpty) {
      return Text(
        liveText(
          'update.body',
          'برای اینکه همه‌چیز درست کار کند، لطفاً به تازه‌ترین نسخه به‌روزرسانی کنید.',
        ),
        style: theme.textTheme.bodyMedium,
      );
    }
    final notice = liveText(
      'update.notice',
      '',
      vars: {'current': faNum(widget.info.current), 'min': faNum(min)},
    );
    final body = liveText(
      'update.body',
      'برای اینکه همه‌چیز درست کار کند، لطفاً به تازه‌ترین نسخه به‌روزرسانی کنید.',
    );
    return RichText(
      text: TextSpan(
        style: theme.textTheme.bodyMedium,
        children: [
          if (notice.trim().isNotEmpty) TextSpan(text: '$notice '),
          TextSpan(text: body),
        ],
      ),
    );
  }

  /// کارتِ «چی تازه است»: نسخه + پیامِ ادمین + حجم.
  Widget _releaseCard(BuildContext context) {
    final theme = Theme.of(context);
    final latest = widget.info.version.trim();
    final notes = widget.info.notes.trim();
    final size = widget.info.sizeBytes;
    final mb =
        size > 0 ? (size / (1024 * 1024)).toStringAsFixed(1) : '';
    if (latest.isEmpty && notes.isEmpty) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color:
            theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (latest.isNotEmpty)
            Text(
              mb.isEmpty
                  ? 'نسخهٔ تازه: ${faNum(latest)}'
                  : 'نسخهٔ تازه: ${faNum(latest)} — ${faNum(mb)} مگابایت',
              style: theme.textTheme.labelLarge,
            ),
          if (notes.isNotEmpty) ...[
            if (latest.isNotEmpty) const SizedBox(height: 6),
            Text(notes, style: theme.textTheme.bodySmall),
          ],
        ],
      ),
    );
  }

  String _mb(int bytes) => (bytes / (1024 * 1024)).toStringAsFixed(1);

  /// ناحیهٔ وضعیت: درصدِ بزرگ + نوارِ انیمیشنی + خطِ وضعیت + دکمه‌ها.
  Widget _status(BuildContext context, AppUpdateSnapshot snap) {
    final theme = Theme.of(context);
    switch (snap.phase) {
      case AppUpdatePhase.downloading:
      case AppUpdatePhase.verifying:
        final downloading = snap.phase == AppUpdatePhase.downloading;
        final known = snap.progress >= 0;
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 16),
            // درصدِ بزرگ — انیمیشنِ نرم بینِ به‌روزرسانی‌ها.
            if (downloading && known)
              Center(
                child: TweenAnimationBuilder<double>(
                  tween: Tween(begin: 0, end: snap.progress),
                  duration: const Duration(milliseconds: 250),
                  builder: (_, v, __) => Text(
                    '${faNum((v * 100).round())}٪',
                    style: theme.textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                ),
              ),
            if (downloading && known) const SizedBox(height: 8),
            _ProgressBar(progress: snap.progress, shimmer: _shimmer),
            const SizedBox(height: 8),
            Text(
              downloading
                  ? liveText(
                      'update.downloading', 'در حال دانلود نسخهٔ تازه…')
                  : liveText(
                      'update.verifying', 'در حال بررسی فایل دانلودشده…'),
              style: theme.textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
            if (downloading && snap.receivedBytes > 0) ...[
              const SizedBox(height: 4),
              Text(
                snap.totalBytes > 0
                    ? '${faNum(_mb(snap.receivedBytes))} از ${faNum(_mb(snap.totalBytes))} مگابایت'
                    : '${faNum(_mb(snap.receivedBytes))} مگابایت',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ],
        );
      case AppUpdatePhase.readyToInstall:
      case AppUpdatePhase.installing:
      case AppUpdatePhase.done:
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 16),
            const Center(
              child: SizedBox(
                width: 28,
                height: 28,
                child: CircularProgressIndicator(strokeWidth: 3),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              liveText(
                  'update.installing', 'در حال باز کردن نصب‌کننده…'),
              style: theme.textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            // اگر کاربر از نصب‌کننده برگشت (مثلاً رفت و اجازهٔ «نصبِ
            // برنامه‌های ناشناس» را داد)، همین دکمه دوباره شلیک می‌کند.
            OutlinedButton(
              onPressed: () => unawaited(_updater.install()),
              child: Text(liveText('update.install', 'نصب')),
            ),
          ],
        );
      case AppUpdatePhase.error:
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: 16),
            Row(
              children: [
                Icon(Icons.error_outline,
                    color: theme.colorScheme.error, size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    liveText('update.error',
                        'دانلود ناموفق بود. اتصال را بررسی کن و دوباره تلاش کن.'),
                    style: theme.textTheme.bodySmall,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => unawaited(_updater.start(widget.info)),
              child: Text(liveText('update.retry', 'تلاش مجدد')),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: _openInBrowser,
              child: Text(
                  liveText('update.browser', 'دانلود با مرورگر')),
            ),
          ],
        );
      case AppUpdatePhase.idle:
      case AppUpdatePhase.cancelled:
        return const SizedBox.shrink();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final forced = widget.info.forced;
    return PopScope(
      // اجباری: دکمهٔ برگشتِ اندروید هم دیالوگ را نبندد — وگرنه «اجبار»
      // فقط روی کاغذ است و کاربر با یک برگشت وارد اپ می‌شود.
      canPop: !forced,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) _updater.cancel();
      },
      child: Dialog(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    liveText('update.title', 'نسخهٔ تازه قلقلی آماده است'),
                    style: theme.textTheme.titleLarge,
                  ),
                  const SizedBox(height: 8),
                  _body(context),
                  const SizedBox(height: 12),
                  _releaseCard(context),
                  ValueListenableBuilder<AppUpdateSnapshot>(
                    valueListenable: _updater,
                    builder: (_, snap, __) => _status(context, snap),
                  ),
                  const SizedBox(height: 16),
                  if (!forced)
                    TextButton(
                      onPressed: _close,
                      child:
                          Text(liveText('update.later', 'بعداً')),
                    )
                  else
                    Text(
                      liveText('update.forcedNote',
                          'برای ادامهٔ کار با قلقلی، نصب نسخهٔ تازه لازم است.'),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                      textAlign: TextAlign.center,
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// نوارِ پیشرفت با برقِ متحرک.
///
/// چرا سفارشی و نه `LinearProgressIndicator`: آن ویجت فقط یک پرشدنِ ساده
/// می‌دهد؛ خواستهٔ مالک «لودینگِ انیمیشنیِ زیبا» بود — پس یک برقِ سفیدِ
/// متحرک روی گرادیانِ سبز می‌لغزد و حسِ «زنده‌بودن» می‌دهد، حتی وقتی
/// حجمِ کل نامشخص است (حالتِ indeterminate).
class _ProgressBar extends StatelessWidget {
  /// ۰ تا ۱؛ ‎-۱ یعنی نامشخص.
  final double progress;
  final Animation<double> shimmer;

  const _ProgressBar({required this.progress, required this.shimmer});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final known = progress >= 0;
    return LayoutBuilder(
      builder: (_, constraints) {
        final width = constraints.maxWidth;
        return ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: Container(
            height: 14,
            color: theme.colorScheme.surfaceContainerHighest,
            child: Stack(
              children: [
                if (known)
                  FractionallySizedBox(
                    widthFactor: progress.clamp(0.0, 1.0),
                    // در راست‌به‌چپ، پرشدن از راست شروع می‌شود.
                    alignment: AlignmentDirectional.centerStart,
                    child: Container(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            theme.colorScheme.primary,
                            theme.colorScheme.tertiary,
                          ],
                        ),
                      ),
                    ),
                  ),
                // برقِ متحرک — روی هر دو حالتِ معلوم و نامعلوم.
                AnimatedBuilder(
                  animation: shimmer,
                  builder: (_, __) {
                    const sweepWidth = 70.0;
                    final dx =
                        shimmer.value * (width + sweepWidth) - sweepWidth;
                    return Positioned(
                      left: dx,
                      top: 0,
                      bottom: 0,
                      width: sweepWidth,
                      child: Container(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [
                              Colors.white.withValues(alpha: 0),
                              Colors.white.withValues(alpha: 0.45),
                              Colors.white.withValues(alpha: 0),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
