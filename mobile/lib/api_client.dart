import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ApiClient {
  static const String defaultBaseUrl = String.fromEnvironment('API_BASE_URL',
      defaultValue: 'http://10.0.2.2:4000');
  final Dio dio = Dio(BaseOptions(
      baseUrl: defaultBaseUrl,
      connectTimeout: const Duration(seconds: 12),
      receiveTimeout: const Duration(seconds: 12)));
  String? token;
  bool isAdmin = false;

  ApiClient() {
    dio.interceptors.add(InterceptorsWrapper(onRequest: (options, handler) {
      if (token != null) options.headers['Authorization'] = 'Bearer $token';
      handler.next(options);
    }));
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
  Future<dynamic> post(String path, Map<String, dynamic> body) async =>
      (await dio.post(path, data: body)).data;
  Future<dynamic> patch(String path, Map<String, dynamic> body) async =>
      (await dio.patch(path, data: body)).data;

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
    if (data is Map && data['message'] != null)
      return data['message'].toString();
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

