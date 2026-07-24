// GhelGheli — Flutter mobile app entry point.
//
// This file only wires together app-level concerns (theming, locale,
// routing between auth / user / admin shells). All screen implementations
// live under lib/screens, reusable UI primitives under lib/widgets, and the
// design system under lib/theme — see ARCHITECTURE.md for the full map.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'api_client.dart';
import 'screens/auth/auth_screen.dart';
import 'screens/auth/splash_screen.dart';
import 'screens/admin/admin_shell.dart';
import 'screens/user/home_shell.dart';
import 'theme/app_theme.dart';

void main() => runApp(const GhelGheliApp());

class GhelGheliApp extends StatefulWidget {
  const GhelGheliApp({super.key});

  @override
  State<GhelGheliApp> createState() => _GhelGheliAppState();
}

class _GhelGheliAppState extends State<GhelGheliApp> {
  final ApiClient api = ApiClient();
  bool _ready = false;
  ThemeMode _themeMode = ThemeMode.dark;

  bool get _isDark => _themeMode == ThemeMode.dark;

  @override
  void initState() {
    super.initState();
    api.loadToken().then((_) => setState(() => _ready = true));
  }

  void _toggleTheme() =>
      setState(() => _themeMode = _isDark ? ThemeMode.light : ThemeMode.dark);

  Future<void> _refresh() async => setState(() {});

  Future<void> _logout() async {
    await api.logout();
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'قلقلی',
      debugShowCheckedModeBanner: false,
      locale: const Locale('fa'),
      supportedLocales: const [Locale('fa')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: _themeMode,
      builder: (context, child) =>
          Directionality(textDirection: TextDirection.rtl, child: child!),
      home: !_ready
          ? const SplashScreen()
          : api.token == null
              ? AuthScreen(api: api, onDone: _refresh)
              : api.isAdmin
                  ? AdminShell(
                      api: api,
                      onLogout: _logout,
                      dark: _isDark,
                      onTheme: _toggleTheme)
                  : HomeShell(
                      api: api,
                      onLogout: _logout,
                      dark: _isDark,
                      onTheme: _toggleTheme),
    );
  }
}
