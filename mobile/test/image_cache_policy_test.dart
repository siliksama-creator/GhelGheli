import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:ghelgheli_mobile/services/image_disk_cache.dart';

void main() {
  test('آپلود و public نسخه‌دارند؛ blob و data نیستند', () {
    expect(isVersionedImageUrl('https://api.ghelghelishop.ir/uploads/images/1-a.webp'), isTrue);
    expect(isVersionedImageUrl('/public/x.webp'), isTrue);
    expect(isVersionedImageUrl('blob:https://x/1'), isFalse);
    expect(isVersionedImageUrl('data:image/png;base64,xx'), isFalse);
    expect(isVersionedImageUrl(''), isFalse);
  });

  test('SafeImage برای آپلود CachedCardImage می‌سازد', () {
    final src = File('lib/widgets/safe_image.dart').readAsStringSync();
    expect(src.contains('isVersionedImageUrl(resolved)'), isTrue);
    expect(src.contains('CachedCardImage('), isTrue);
    expect(src.contains('Image.network('), isTrue);
  });

  test('آواتار ریموت از کش دیسک می‌آید', () {
    final src = File('lib/widgets/avatar_image.dart').readAsStringSync();
    expect(src.contains('CachedCardImage('), isTrue);
  });
}
