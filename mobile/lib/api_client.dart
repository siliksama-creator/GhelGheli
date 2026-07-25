import 'dart:io';

import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ApiClient {
  static const String defaultBaseUrl = String.fromEnvironment('API_BASE_URL',
      defaultValue: 'https://api.ghelghelishop.ir');

  final Dio dio = Dio(BaseOptions(
    baseUrl: defaultBaseUrl,
    // Tightened from 12s: on a flaky mobile network a dead connection used to
    // hang the UI for 12 seconds before the user saw any error at all.
    connectTimeout: const Duration(seconds: 8),
    receiveTimeout: const Duration(seconds: 15),
    sendTimeout: const Duration(seconds: 20),
    // Ask for compressed responses — the league/chat payloads are pure JSON
    // and shrink dramatically over a slow mobile link.
    headers: {'Accept-Encoding': 'gzip'},
    // Let us handle non-2xx ourselves instead of paying for exception
    // construction on every expected 401/404.
    validateStatus: (code) => code != null && code < 500,
  ));

  String? token;
  bool isAdmin = false;

  /// Base URL of the backend (also used for the Socket.IO connection).
  String get baseUrl => dio.options.baseUrl;

  ApiClient() {
    _tuneConnection();
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        if (token != null) options.headers['Authorization'] = 'Bearer $token';
        handler.next(options);
      },
      onResponse: (response, handler) {
        // With validateStatus above, error codes arrive here rather than as
        // exceptions — turn them back into the DioException the app expects.
        final code = response.statusCode ?? 0;
        if (code >= 400) {
          handler.reject(DioException(
            requestOptions: response.requestOptions,
            response: response,
            type: DioExceptionType.badResponse,
          ));
          return;
        }
        handler.next(response);
      },
    ));
  }

  /// Keeps TLS connections alive between requests.
  ///
  /// Every call used to pay for a fresh TCP + TLS handshake (~2 round trips
  /// to the VPS). Reusing a pooled connection removes that entirely from the
  /// second request onward, which is the single biggest win for perceived
  /// speed on mobile networks.
  void _tuneConnection() {
    final adapter = dio.httpClientAdapter;
    if (adapter is IOHttpClientAdapter) {
      adapter.createHttpClient = () {
        final client = HttpClient()
          ..idleTimeout = const Duration(seconds: 30)
          ..connectionTimeout = const Duration(seconds: 8)
          // The app fans out several calls at once on the dashboard; the
          // default of 1-per-host would serialise them.
          ..maxConnectionsPerHost = 6
          ..autoUncompress = true;
        return client;
      };
    }
  }

  Future<void> loadToken() async {
    final sp = await SharedPreferences.getInstance();
    token = sp.getString('token');
    isAdmin = sp.getBool('isAdmin') ?? false;
  }

  Future<void> saveToken(String t, {bool admin = false}) async {
    token = t;
    isAdmin = admin;
    final sp = await SharedPreferences.getInstance();
    await sp.setString('token', t);
    await sp.setBool('isAdmin', admin);
  }

  Future<void> logout() async {
    token = null;
    isAdmin = false;
    final sp = await SharedPreferences.getInstance();
    await sp.remove('token');
    await sp.remove('isAdmin');
  }

  Future<dynamic> get(String path) async => (await dio.get(path)).data;

  /// Runs several GETs concurrently over the pooled connection.
  ///
  /// Screens used to `await` each endpoint one after another, so the user
  /// waited for the SUM of the round trips. Now they overlap and the wait is
  /// just the slowest one.
  Future<List<dynamic>> getAll(List<String> paths) =>
      Future.wait(paths.map(get));
  Future<dynamic> post(String path, Map<String, dynamic> body) async =>
      (await dio.post(path, data: body)).data;
  Future<dynamic> patch(String path, Map<String, dynamic> body) async =>
      (await dio.patch(path, data: body)).data;

  /// Uploads a support-ticket attachment (user-scoped route).
  Future<String> uploadSupportImage(String filePath) async {
    final form =
        FormData.fromMap({'image': await MultipartFile.fromFile(filePath)});
    final res = await dio.post('/api/support/uploads/image', data: form);
    return res.data['url'].toString();
  }

  Future<String> uploadAdminImage(String filePath) async {
    final form =
        FormData.fromMap({'image': await MultipartFile.fromFile(filePath)});
    final res = await dio.post('/api/admin/uploads/image', data: form);
    return res.data['url'].toString();
  }
}

String faNum(Object? value) {
  const en = '0123456789';
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  var s = '$value';
  for (var i = 0; i < 10; i++) {
    s = s.replaceAll(en[i], fa[i]);
  }
  return s;
}

String fullAssetUrl(Object? value) {
  final s = (value ?? '').toString();
  if (s.isEmpty) return '';
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  return '${ApiClient.defaultBaseUrl}$s';
}

String apiError(Object e) {
  try {
    final data = (e as dynamic).response?.data;
    if (data is Map && data['message'] != null) {
      return data['message'].toString();
    }
  } catch (_) {}
  return 'خطای ارتباط با سرور';
}

/// HTTP status code of a failed API call, or null if unavailable. Used by
/// the auth screen to detect "account already exists" (409) so it can offer
/// the current-password field instead of just showing a generic error.
int? apiStatusCode(Object e) {
  try {
    return (e as dynamic).response?.statusCode as int?;
  } catch (_) {
    return null;
  }
}

