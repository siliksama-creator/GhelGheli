/// استخراجِ بردارِ عصبیِ کارت روی **گوشی** (فاز ۲ — حالت سایه).
///
/// همان مدلِ MobileNetV3 که در وب/بک‌اند استفاده می‌شود
/// (`assets/ml/card_embed_mobilenetv3.onnx`) با onnxruntime (FFI) روی دستگاه
/// اجرا می‌شود؛ فقط بردارِ ۱۲۸۰تایی به سرور می‌رود و سرور هیچ مدل سنگینی اجرا
/// نمی‌کند. پیش‌پردازش دقیقاً مثل مرجع: برشِ مرکزیِ ۰.۸۷۵ → resize به ۲۲۴ →
/// نرمال‌سازی ImageNet → NCHW.
///
/// هر خطایی (مدل لود نشد، تصویر خراب، …) به `null` می‌انجامد تا جریانِ ثبت
/// کارت هرگز به‌خاطر این قابلیتِ افزوده نشکند.
library;

import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/services.dart' show rootBundle;
import 'package:onnxruntime/onnxruntime.dart';

class CardEmbedding {
  CardEmbedding._();
  static final CardEmbedding instance = CardEmbedding._();

  static const int dim = 1280;
  static const int size = 224;
  static const double cropPct = 0.875;
  static const String _asset = 'assets/ml/card_embed_mobilenetv3.onnx';

  static const List<double> _mean = [0.485, 0.456, 0.406];
  static const List<double> _std = [0.229, 0.224, 0.225];

  OrtSession? _session;
  bool _tried = false;

  Future<OrtSession?> _ensureSession() async {
    if (_session != null) return _session;
    if (_tried) return null;
    _tried = true;
    try {
      OrtEnv.instance.init();
      final opts = OrtSessionOptions()
        ..setIntraOpNumThreads(2)
        ..setSessionGraphOptimizationLevel(
            GraphOptimizationLevel.ortEnableAll);
      final bytes = await rootBundle.load(_asset);
      _session = OrtSession.fromBuffer(
          bytes.buffer.asUint8List(), opts);
      return _session;
    } catch (_) {
      return null;
    }
  }

  /// بردارِ L2-نرمال‌شده را از فایل تصویر می‌سازد، یا null.
  Future<List<double>?> embedFile(String path) async {
    try {
      final session = await _ensureSession();
      if (session == null) return null;

      final fileBytes = await File(path).readAsBytes();
      final codec = await ui.instantiateImageCodec(fileBytes);
      final frame = await codec.getNextFrame();
      final src = frame.image;
      final w = src.width;
      final h = src.height;
      final sc = math.min(w, h);
      final tw = (sc * cropPct).round();
      final cx = ((w - tw) / 2).round();
      final cy = ((h - tw) / 2).round();

      final recorder = ui.PictureRecorder();
      final canvas = ui.Canvas(recorder);
      // drawImageRect با src=ناحیهٔ برش و dst=کل بومِ ۲۲۴ → هم برش هم resize.
      canvas.drawImageRect(
        src,
        ui.Rect.fromLTWH(
            cx.toDouble(), cy.toDouble(), tw.toDouble(), tw.toDouble()),
        ui.Rect.fromLTWH(0, 0, size.toDouble(), size.toDouble()),
        ui.Paint()..filterQuality = ui.FilterQuality.low,
      );
      final pic = recorder.endRecording();
      final img = await pic.toImage(size, size);
      final rgba =
          await img.toByteData(format: ui.ImageByteFormat.rawRgba);
      src.dispose();
      img.dispose();
      if (rgba == null) return null;

      final raw = rgba.buffer.asUint8List();
      final n = size * size;
      final input = Float32List(3 * n);
      for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) {
          final s = (y * size + x) * 4;
          final d = y * size + x;
          input[0 * n + d] = (raw[s] / 255.0 - _mean[0]) / _std[0];
          input[1 * n + d] = (raw[s + 1] / 255.0 - _mean[1]) / _std[1];
          input[2 * n + d] = (raw[s + 2] / 255.0 - _mean[2]) / _std[2];
        }
      }

      final inputTensor = OrtValueTensor.createTensorWithDataList(
          input, [1, 3, size, size]);
      final runOpts = OrtRunOptions();
      final inputName = session.inputNames.first;
      final outputs =
          session.run(runOpts, {inputName: inputTensor});
      inputTensor.release();
      runOpts.release();

      final out = outputs.first;
      if (out is! OrtValueTensor) {
        return null;
      }
      final data = out.value;
      out.release();
      List<double> vec;
      if (data is List) {
        // خروجی [1,1280]: لایهٔ بیرونی تکی، لایهٔ داخلی بردار است.
        final flat = (data.isNotEmpty && data.first is List)
            ? data.first as List
            : data;
        vec = flat.map((e) => (e as num).toDouble()).toList();
      } else {
        return null;
      }
      if (vec.length != dim) return null;

      var norm = 0.0;
      for (final v in vec) {
        norm += v * v;
      }
      norm = math.sqrt(norm);
      if (norm == 0) return null;
      return vec.map((v) => v / norm).toList();
    } catch (_) {
      return null;
    }
  }
}
