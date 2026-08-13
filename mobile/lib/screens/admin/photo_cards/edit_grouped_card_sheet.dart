import 'package:flutter/material.dart';

import '../../../api_client.dart';

/// Shared metadata/code editor for one grouped card_type_id.
/// Recognition sides are intentionally not editable independently.
Future<void> showEditGroupedPhotoCardSheet({
required BuildContext context,
required ApiClient api,
required Map card,
required Future<void> Function() onSaved,
required ValueChanged<String> showMessage,
}) async {
  final typeId = card['card_type_id']?.toString() ?? '';
  final nameCtrl = TextEditingController(text: card['card_type_name']?.toString() ?? '');
  final pointsCtrl = TextEditingController(text: (card['point_value'] ?? 0).toString());
  final cashCtrl = TextEditingController(text: (card['cash_amount'] ?? 0).toString());
  final atkCtrl = TextEditingController(text: (card['duel_attack'] ?? 50).toString());
  final defCtrl = TextEditingController(text: (card['duel_defense'] ?? 50).toString());
  final spdCtrl = TextEditingController(text: (card['duel_speed'] ?? 50).toString());
  final tecCtrl = TextEditingController(text: (card['duel_technique'] ?? 50).toString());
  final goalCtrl = TextEditingController(text: (card['duel_goal_chance'] ?? 50).toString());
  final energyCtrl = TextEditingController(text: (card['duel_energy'] ?? 100).toString());
  final newCodesCtrl = TextEditingController();
  final newBatchCtrl = TextEditingController();
  bool saving = false;
  // کارتِ کلکسیونی — دقیقاً معادلِ چک‌باکسِ پنلِ وب.
  // `== true` و نه `!= false`: اگر سرور فیلد را نفرستد، پیش‌فرض باید
  // «کارتِ بازی» باشد یعنی رفتارِ قبلی، نه اینکه کارت بی‌صدا از آرنا حذف شود.
  bool collectible = card['is_collectible'] == true;

  await showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: const Color(0xFF0E1826),
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, setModalState) => Padding(
        padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(ctx).viewInsets.bottom + 16),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text('ویرایش کارت «${card['card_type_name']}»',
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900, color: Colors.white)),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded, color: Colors.white70),
                    onPressed: () => Navigator.pop(ctx),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: nameCtrl,
                decoration: const InputDecoration(labelText: 'نام کارت'),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: pointsCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'امتیاز کارت'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: cashCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'جایزه نقدی (تومان)'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              // ── نوعِ کارت ──
              // بالای استاتس، چون تیک خوردنش کلِ آن بخش را حذف می‌کند.
              CheckboxListTile(
                value: collectible,
                onChanged: (v) => setModalState(() => collectible = v ?? false),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                activeColor: const Color(0xFFF59E0B),
                title: const Text('کارت کلکسیونی است (برای بازی نیست)',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Colors.white)),
                subtitle: Text(
                  collectible
                      ? '🏅 از آرنای دوئل حذف می‌شود. اگر کاربری این کارت را در ترکیبش داشته باشد، از او خواسته می‌شود دوباره بچیند.'
                      : '⚔️ در آرنای دوئل قابل استفاده است.',
                  style: const TextStyle(fontSize: 11, color: Colors.white60, height: 1.6),
                ),
              ),
              if (!collectible) ...[
                const SizedBox(height: 4),
                const Text('استات دوئل کارت (۰ تا ۱۰۰)',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Color(0xFF38BDF8))),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Expanded(child: TextField(controller: atkCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'حمله'))),
                    const SizedBox(width: 6),
                    Expanded(child: TextField(controller: defCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'دفاع'))),
                    const SizedBox(width: 6),
                    Expanded(child: TextField(controller: spdCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'سرعت'))),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Expanded(child: TextField(controller: tecCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'تکنیک'))),
                    const SizedBox(width: 6),
                    Expanded(child: TextField(controller: goalCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'شانس گل'))),
                    const SizedBox(width: 6),
                    Expanded(child: TextField(controller: energyCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'انرژی'))),
                  ],
                ),
              ],
              const SizedBox(height: 12),
              TextField(
                controller: newCodesCtrl,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'افزودن کدهای جدید برای این کارت (اختیاری)',
                  hintText: 'هر خط یک کد\nGHP-A2B3-C4D5\n…',
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: newBatchCtrl,
                decoration: const InputDecoration(
                  labelText: 'برچسب دسته کدهای جدید (اختیاری)',
                ),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: saving ? null : () async {
                  setModalState(() => saving = true);
                  try {
                    // 1. Update card type
                    await api.patch('/api/admin/photo-cards/card-types/$typeId', {
                      'name': nameCtrl.text.trim(),
                      'pointValue': int.tryParse(pointsCtrl.text) ?? 0,
                      'cashAmount': int.tryParse(cashCtrl.text) ?? 0,
                      'duelAttack': int.tryParse(atkCtrl.text) ?? 50,
                      'duelDefense': int.tryParse(defCtrl.text) ?? 50,
                      'duelSpeed': int.tryParse(spdCtrl.text) ?? 50,
                      'duelTechnique': int.tryParse(tecCtrl.text) ?? 50,
                      'duelGoalChance': int.tryParse(goalCtrl.text) ?? 50,
                      'duelEnergy': int.tryParse(energyCtrl.text) ?? 100,
                      'isCollectible': collectible,
                    });

                    // 2. Add codes if typed
                    if (newCodesCtrl.text.trim().isNotEmpty) {
                      await api.post('/api/admin/photo-cards/card-types/$typeId/add-codes', {
                        'rawCodes': newCodesCtrl.text.trim(),
                        'batchLabel': newBatchCtrl.text.trim().isNotEmpty ? newBatchCtrl.text.trim() : null,
                      });
                    }
                    if (context.mounted) Navigator.pop(ctx);
                    showMessage('مشخصات کارت با موفقیت به‌روزرسانی شد');
                    await onSaved();
                  } catch (e) {
                    showMessage(apiError(e));
                  } finally {
                    if (ctx.mounted) setModalState(() => saving = false);
                  }
                },
                child: Text(saving ? 'در حال ذخیره...' : 'ذخیره تغییرات'),
              ),
            ],
          ),
        ),
      ),
    ),
  );

  for (final controller in [
    nameCtrl, pointsCtrl, cashCtrl, atkCtrl, defCtrl, spdCtrl, tecCtrl,
    goalCtrl, energyCtrl, newCodesCtrl, newBatchCtrl,
  ]) {
    controller.dispose();
  }
}

