import 'package:flutter/material.dart';

import '../../../theme/tokens.dart';

/// Text field + inline "pick from gallery" action used for every
/// admin image-URL input (card types, rewards, stickers, etc.).
class ImageUrlField extends StatelessWidget {
  final TextEditingController controller;
  final VoidCallback onPick;
  final String label;

  const ImageUrlField(
      {super.key,
      required this.controller,
      required this.onPick,
      this.label = 'عکس / آدرس آپلودشده'});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: TextField(
              controller: controller,
              decoration: InputDecoration(
                  labelText: label,
                  prefixIcon: const Icon(Icons.link_rounded))),
        ),
        Gaps.hSm,
        IconButton.filledTonal(
            onPressed: onPick, icon: const Icon(Icons.photo_library_rounded)),
      ],
    );
  }
}
