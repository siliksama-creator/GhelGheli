// نگهبان واقعیِ حفظ State تب‌ها.
//
// نگه داشتنِ Widget object در Map به‌تنهایی State را حفظ نمی‌کند؛ اگر
// AnimatedSwitcher آن را از درخت بردارد، dispose می‌شود و برگشت به تب دوباره
// initState/API/image-load را اجرا می‌کند. این دقیقاً باگی است که کاربر دید.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

final Map<int, int> initialized = {};
final Map<int, int> disposed = {};

class _FakePage extends StatefulWidget {
  const _FakePage(this.id);
  final int id;

  @override
  State<_FakePage> createState() => _FakePageState();
}

class _FakePageState extends State<_FakePage> {
  int localCounter = 0;

  @override
  void initState() {
    super.initState();
    initialized[widget.id] = (initialized[widget.id] ?? 0) + 1;
  }

  @override
  void dispose() {
    disposed[widget.id] = (disposed[widget.id] ?? 0) + 1;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextButton(
    key: ValueKey('button-${widget.id}'),
    onPressed: () => setState(() => localCounter++),
    child: Text('صفحه ${widget.id}:$localCounter'),
  );
}

class _PersistentShell extends StatefulWidget {
  const _PersistentShell({super.key});

  @override
  State<_PersistentShell> createState() => _PersistentShellState();
}

class _PersistentShellState extends State<_PersistentShell> {
  int index = 0;
  final Map<int, Widget> pages = {};

  Widget pageAt(int i) => pages.putIfAbsent(i, () => _FakePage(i));

  void go(int i) => setState(() => index = i);

  @override
  Widget build(BuildContext context) {
    pageAt(index); // فقط صفحهٔ دیده‌شده ساخته می‌شود.
    return Directionality(
      textDirection: TextDirection.rtl,
      child: Stack(
        children: [
          for (final entry in pages.entries)
            Offstage(
              key: ValueKey('slot-${entry.key}'),
              offstage: entry.key != index,
              child: TickerMode(
                enabled: entry.key == index,
                child: entry.value,
              ),
            ),
        ],
      ),
    );
  }
}

void main() {
  setUp(() {
    initialized.clear();
    disposed.clear();
  });

  testWidgets('اول فقط صفحهٔ فعال ساخته می‌شود', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: _PersistentShell()));
    expect(initialized, {0: 1});
  });

  testWidgets('تعویض تب State قبلی را dispose نمی‌کند', (tester) async {
    final key = GlobalKey<_PersistentShellState>();
    await tester.pumpWidget(MaterialApp(home: _PersistentShell(key: key)));

    await tester.tap(find.byKey(const ValueKey('button-0')));
    await tester.pump();
    expect(find.text('صفحه 0:1'), findsOneWidget);

    key.currentState!.go(4);
    await tester.pump();
    expect(initialized, {0: 1, 4: 1});
    expect(
      disposed,
      isEmpty,
      reason: 'تب پنهان باید Offstage شود، نه از درخت حذف',
    );

    key.currentState!.go(0);
    await tester.pump();
    expect(
      find.text('صفحه 0:1'),
      findsOneWidget,
      reason: 'counter محلی ثابت می‌کند همان State قبلی برگشته',
    );
    expect(
      initialized[0],
      1,
      reason: 'بازگشت نباید initState/API load را تکرار کند',
    );
  });

  testWidgets('ده جابه‌جایی فقط هر تب را یک بار init می‌کند', (tester) async {
    final key = GlobalKey<_PersistentShellState>();
    await tester.pumpWidget(MaterialApp(home: _PersistentShell(key: key)));
    for (var i = 0; i < 10; i++) {
      key.currentState!.go(i.isEven ? 1 : 0);
      await tester.pump();
    }
    expect(initialized, {0: 1, 1: 1});
    expect(disposed, isEmpty);
  });

  test(
    'source واقعی از Offstage+TickerMode استفاده می‌کند نه AnimatedSwitcher',
    () {
      final source = File('lib/screens/user/home_shell.dart')
          .readAsStringSync();
      expect(source.contains('Widget _buildPersistentPages()'), isTrue);
      expect(source.contains('Offstage('), isTrue);
      expect(source.contains('TickerMode('), isTrue);
      expect(
        source.contains('child: AnimatedSwitcher('),
        isFalse,
        reason: 'AnimatedSwitcher تب قبلی را dispose و دوباره load می‌کند',
      );
    },
  );
}
