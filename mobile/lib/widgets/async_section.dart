import 'package:flutter/material.dart';
import '../api_client.dart';
import 'state_views.dart';

/// Generic async data loader/guard used across admin & user screens instead
/// of the original ad-hoc `AdminGuard`/`FutureBuilder` duplication. Handles
/// loading, error (with the shared [apiError] formatter) and success states
/// consistently everywhere.
class AsyncSection<T> extends StatelessWidget {
  final Future<T> future;
  final Widget Function(BuildContext context, T data) builder;
  final VoidCallback? onRetry;

  const AsyncSection(
      {super.key, required this.future, required this.builder, this.onRetry});

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<T>(
      future: future,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done)
          return const LoadingView();
        if (snapshot.hasError) {
          return Padding(
            padding: const EdgeInsets.all(20),
            child: ErrorBanner(
                message: apiError(snapshot.error!), onRetry: onRetry),
          );
        }
        return builder(context, snapshot.data as T);
      },
    );
  }
}
