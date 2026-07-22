import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ApiClient {
  static const String defaultBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:4000');
  final Dio dio = Dio(BaseOptions(baseUrl: defaultBaseUrl, connectTimeout: const Duration(seconds: 12), receiveTimeout: const Duration(seconds: 12)));
  String? token;
  ApiClient() {
    dio.interceptors.add(InterceptorsWrapper(onRequest: (options, handler) {
      if (token != null) options.headers['Authorization'] = 'Bearer $token';
      handler.next(options);
    }));
  }
  Future<void> loadToken() async { token = (await SharedPreferences.getInstance()).getString('token'); }
  Future<void> saveToken(String t) async { token = t; await (await SharedPreferences.getInstance()).setString('token', t); }
  Future<void> logout() async { token = null; await (await SharedPreferences.getInstance()).remove('token'); }
  Future<dynamic> get(String path) async => (await dio.get(path)).data;
  Future<dynamic> post(String path, Map<String, dynamic> body) async => (await dio.post(path, data: body)).data;
  Future<dynamic> patch(String path, Map<String, dynamic> body) async => (await dio.patch(path, data: body)).data;
}
String faNum(Object? value) {
  const en = '0123456789'; const fa = '۰۱۲۳۴۵۶۷۸۹';
  var s = '$value'; for (var i=0;i<10;i++){ s = s.replaceAll(en[i], fa[i]); } return s;
}
