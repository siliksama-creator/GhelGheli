import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';
import '../../widgets/state_views.dart';
import 'widgets/form_section.dart';
import 'widgets/image_url_field.dart';

/// Card-type + card-code administration. Same endpoints as legacy
/// `AdminCards`: create/edit card types, register single/bulk codes.
class AdminCards extends StatefulWidget {
  final ApiClient api;
  const AdminCards({super.key, required this.api});

  @override
  State<AdminCards> createState() => _AdminCardsState();
}

class _AdminCardsState extends State<AdminCards> {
  List _types = [];
  List _codes = [];
  Map? _report;
  String? _selectedType;
  bool _loading = true;

  final _name = TextEditingController();
  final _point = TextEditingController();
  final _desc = TextEditingController();
  final _imageUrl = TextEditingController();
  bool _uploadingImage = false;
  String? _imageError;
  final _singleCode = TextEditingController();
  final _bulkCodes = TextEditingController();
  bool _savingType = false;
  bool _savingSingle = false;
  bool _savingBulk = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    _point.dispose();
    _desc.dispose();
    _imageUrl.dispose();
    _singleCode.dispose();
    _bulkCodes.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final types = await widget.api.get('/api/admin/card-types');
    final codes = await widget.api.get('/api/admin/card-codes');
    _selectedType ??= types.isNotEmpty ? types.first['id'] : null;
    if (mounted) {
      setState(() {
        _types = types;
        _codes = codes;
        _loading = false;
      });
    }
  }

  Future<void> _pickImage() async {
    final x = await ImagePicker()
        .pickImage(source: ImageSource.gallery, imageQuality: 82);
    if (x == null) return;
    setState(() {
      _uploadingImage = true;
      _imageError = null;
    });
    try {
      final url = await widget.api.uploadAdminImage(x.path);
      if (mounted) setState(() => _imageUrl.text = url);
    } catch (e) {
      // Previously this threw into the void: the upload failed silently and
      // the admin went on to save a card with no picture.
      if (mounted) setState(() => _imageError = apiError(e));
    } finally {
      if (mounted) setState(() => _uploadingImage = false);
    }
  }

  Future<void> _createType() async {
    // RACE FIX: the image upload runs in the background, so tapping save a
    // moment after picking a photo used to create the card with an EMPTY
    // image_url even though the file had already reached the VPS (confirmed
    // in the production audit log). Wait for the upload instead.
    if (_uploadingImage) {
      _toast('لطفاً تا پایان آپلود عکس صبر کنید');
      return;
    }
    if (_imageUrl.text.trim().isEmpty) {
      final go = await _confirmNoImage();
      if (go != true) return;
    }
    setState(() => _savingType = true);
    try {
      await widget.api.post('/api/admin/card-types', {
        'name': _name.text,
        'pointValue': int.tryParse(_point.text) ?? 0,
        'description': _desc.text,
        'imageUrl': _imageUrl.text,
      });
      _name.clear();
      _point.clear();
      _desc.clear();
      _imageUrl.clear();
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(apiError(e))));
      }
    } finally {
      if (mounted) setState(() => _savingType = false);
    }
  }

  void _toast(String m) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));
  }

  /// Creating a card with no picture is almost always a mistake (the user's
  /// inventory then shows a generic ⚽ placeholder), so confirm it.
  Future<bool?> _confirmNoImage() => showDialog<bool>(
        context: context,
        builder: (c) => AlertDialog(
          title: const Text('بدون عکس ذخیره شود؟'),
          content: const Text(
              'برای این کارت عکسی انتخاب نشده است. در موجودی کاربران یک تصویر پیش‌فرض نمایش داده می‌شود.'),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(c, false),
                child: const Text('برگرد و عکس بگذار')),
            FilledButton(
                onPressed: () => Navigator.pop(c, true),
                child: const Text('بدون عکس ادامه بده')),
          ],
        ),
      );

  Future<void> _editType(Map t) async {
    final n = TextEditingController(text: t['name'] ?? '');
    final pts = TextEditingController(text: '${t['point_value'] ?? 0}');
    final img = TextEditingController(text: t['image_url'] ?? '');
    final ds = TextEditingController(text: t['description'] ?? '');
    var editUploading = false;
    String? editError;
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('ویرایش کارت'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                  controller: n,
                  decoration: const InputDecoration(labelText: 'نام کارت')),
              Gaps.vSm,
              TextField(
                  controller: pts,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'امتیاز')),
              Gaps.vSm,
              // Real picker instead of a bare URL box: typing/clearing this
              // by hand used to send an empty string, which wiped the card's
              // picture on the server.
              StatefulBuilder(
                builder: (ctx, setLocal) => ImageUrlField(
                  controller: img,
                  label: 'عکس کارت',
                  uploading: editUploading,
                  error: editError,
                  onPick: () async {
                    final x = await ImagePicker().pickImage(
                        source: ImageSource.gallery, imageQuality: 82);
                    if (x == null) return;
                    setLocal(() {
                      editUploading = true;
                      editError = null;
                    });
                    try {
                      final url = await widget.api.uploadAdminImage(x.path);
                      img.text = url;
                    } catch (e) {
                      editError = apiError(e);
                    } finally {
                      setLocal(() => editUploading = false);
                    }
                  },
                ),
              ),
              Gaps.vSm,
              TextField(
                  controller: ds,
                  decoration: const InputDecoration(labelText: 'توضیحات')),
            ],
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('لغو')),
          FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('ذخیره')),
        ],
      ),
    );
    if (ok == true) {
      if (editUploading) {
        _toast('آپلود عکس تمام نشده بود؛ تغییرات ذخیره نشد');
        return;
      }
      final body = <String, dynamic>{
        'name': n.text,
        'pointValue': int.tryParse(pts.text) ?? 0,
        'description': ds.text,
      };
      // Only send the image when there IS one. Sending '' told the server to
      // blank the existing picture — exactly how cards lost their artwork.
      final newImg = img.text.trim();
      if (newImg.isNotEmpty) body['imageUrl'] = newImg;
      await widget.api.patch('/api/admin/card-types/${t['id']}', body);
      await _load();
    }
  }

  Future<void> _addSingle() async {
    if (_selectedType == null || _singleCode.text.trim().isEmpty) return;
    setState(() => _savingSingle = true);
    try {
      await widget.api.post('/api/admin/card-codes',
          {'cardTypeId': _selectedType, 'code': _singleCode.text});
      _singleCode.clear();
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(apiError(e))));
      }
    } finally {
      if (mounted) setState(() => _savingSingle = false);
    }
  }

  Future<void> _addBulk() async {
    if (_selectedType == null || _bulkCodes.text.trim().isEmpty) return;
    setState(() => _savingBulk = true);
    try {
      final r = await widget.api.post('/api/admin/card-codes/bulk',
          {'cardTypeId': _selectedType, 'rawCodes': _bulkCodes.text});
      setState(() => _report = Map.from(r));
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(apiError(e))));
      }
    } finally {
      if (mounted) setState(() => _savingBulk = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingView();
    final theme = Theme.of(context);

    return ListView(
      padding: const EdgeInsets.fromLTRB(Gaps.lg, Gaps.md, Gaps.lg, Gaps.xxl),
      children: [
        FormSection(
          title: 'تعریف نوع کارت و عکس',
          children: [
            TextField(
                controller: _name,
                decoration: const InputDecoration(labelText: 'نام کارت')),
            TextField(
                controller: _point,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'امتیاز')),
            TextField(
                controller: _desc,
                decoration: const InputDecoration(labelText: 'توضیحات')),
            ImageUrlField(
              controller: _imageUrl,
              onPick: _pickImage,
              uploading: _uploadingImage,
              error: _imageError,
            ),
            FilledButton.icon(
              onPressed: _savingType ? null : _createType,
              icon: _savingType
                  ? const _MiniSpinner()
                  : const Icon(Icons.save_rounded),
              label: const Text('ذخیره کارت'),
            ),
          ],
        ),
        Gaps.vMd,
        FormSection(
          title: 'ثبت کد برای کارت',
          children: [
            DropdownButtonFormField<String>(
              initialValue: _selectedType,
              decoration: const InputDecoration(labelText: 'نوع کارت'),
              items: _types
                  .map<DropdownMenuItem<String>>((t) => DropdownMenuItem(
                      value: t['id'] as String,
                      child: Text('${t['name']} — ${faNum(t['point_value'])}')))
                  .toList(),
              onChanged: (v) => setState(() => _selectedType = v),
            ),
            TextField(
                controller: _singleCode,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(labelText: 'ثبت تکی کد')),
            FilledButton.tonalIcon(
              onPressed: _savingSingle ? null : _addSingle,
              icon: _savingSingle
                  ? const _MiniSpinner()
                  : const Icon(Icons.add_rounded),
              label: const Text('ثبت یک کد'),
            ),
            TextField(
              controller: _bulkCodes,
              textCapitalization: TextCapitalization.characters,
              minLines: 4,
              maxLines: 8,
              decoration: const InputDecoration(
                  labelText: 'ثبت دسته‌جمعی؛ هر خط یک کد یا جدا با کاما'),
            ),
            FilledButton.icon(
              onPressed: _savingBulk ? null : _addBulk,
              icon: _savingBulk
                  ? const _MiniSpinner()
                  : const Icon(Icons.upload_file_rounded),
              label: const Text('ثبت دسته‌جمعی کدها'),
            ),
            if (_report != null)
              Container(
                padding: const EdgeInsets.all(Gaps.sm),
                decoration: BoxDecoration(
                    color: theme.colorScheme.primary.withValues(alpha: 0.1),
                    borderRadius: Corners.rMd),
                child: Text(
                  'موفق: ${faNum(_report!['insertedCount'])} | تکراری فایل: ${faNum(_report!['duplicateInFileCount'])} | تکراری دیتابیس: ${faNum(_report!['duplicateInDbCount'])} | نامعتبر: ${faNum(_report!['invalidCount'])}',
                  style: theme.textTheme.bodySmall,
                ),
              ),
          ],
        ),
        Gaps.vMd,
        FormSection(
          title: 'نوع کارت‌ها',
          children: _types.isEmpty
              ? [
                  const EmptyState(
                      icon: Icons.credit_card_off_rounded,
                      title: 'هنوز نوع کارتی تعریف نشده')
                ]
              : _types
                  .take(20)
                  .map<Widget>((t) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: t['image_url'] != null &&
                                '${t['image_url']}'.isNotEmpty
                            ? ClipRRect(
                                borderRadius: Corners.rSm,
                                child: Image.network(
                                    fullAssetUrl(t['image_url']),
                                    width: 44,
                                    height: 44,
                                    fit: BoxFit.cover))
                            : const Icon(Icons.credit_card_rounded),
                        title: Text(t['name']),
                        subtitle: Text('${faNum(t['point_value'])} امتیاز'),
                        trailing: const Icon(Icons.edit_rounded),
                        onTap: () => _editType(Map<String, dynamic>.from(t)),
                      ))
                  .toList(),
        ),
        Gaps.vMd,
        FormSection(
          title: 'آخرین کدها',
          children: _codes.isEmpty
              ? [
                  const EmptyState(
                      icon: Icons.qr_code_2_rounded, title: 'هنوز کدی ثبت نشده')
                ]
              : _codes
                  .take(40)
                  .map<Widget>((x) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(x['code'] ?? ''),
                        subtitle: Text(
                            '${x['card_type_name']} — ${x['status']} — ${x['used_by_mobile'] ?? ''}'),
                      ))
                  .toList(),
        ),
      ],
    );
  }
}

class _MiniSpinner extends StatelessWidget {
  const _MiniSpinner();
  @override
  Widget build(BuildContext context) => const SizedBox(
      width: 16,
      height: 16,
      child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white));
}
