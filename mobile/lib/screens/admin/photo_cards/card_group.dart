/// Builds the one-card administrative model while preserving each independent
/// recognition sample in `sides`.
List<Map<String, dynamic>> groupedPhotoCards(Map response) {
  final serverGroups = response['cards'];
  if (serverGroups is List) {
    return serverGroups
        .whereType<Map>()
        .map((card) => Map<String, dynamic>.from(card))
        .toList(growable: false);
  }

  // Compatibility with a backend from before the grouped response field.
  final groups = <String, Map<String, dynamic>>{};
  for (final raw in (response['designs'] as List? ?? const [])) {
    if (raw is! Map) continue;
    final design = Map<String, dynamic>.from(raw);
    final id = design['card_type_id']?.toString();
    if (id == null || id.isEmpty) continue;
    final card = groups.putIfAbsent(id, () => <String, dynamic>{
          ...design,
          'id': id,
          'card_type_id': id,
          'is_active': design['card_type_is_active'] != false &&
              design['is_active'] != false,
          'redeemed_count': 0,
          'sides': <Map<String, dynamic>>[],
        });
    card['is_active'] = card['is_active'] == true && design['is_active'] != false;
    card['redeemed_count'] =
        (card['redeemed_count'] as num? ?? 0) +
            (design['redeemed_count'] as num? ?? 0);
    (card['sides'] as List).add(<String, dynamic>{
      'id': design['id'],
      'side': design['side'] ?? 'alternate',
      'image_url': design['image_url'],
      'is_active': design['is_active'] != false,
      'created_at': design['created_at'],
    });
  }
  for (final card in groups.values) {
    final sides = card['sides'] as List;
    card['side_count'] = sides.length;
    Map? primary;
    for (final side in sides.whereType<Map>()) {
      if (side['side'] == 'front') {
        primary = side;
        break;
      }
    }
    if (primary == null && sides.isNotEmpty && sides.first is Map) {
      primary = sides.first as Map;
    }
    card['image_url'] = primary?['image_url'];
  }
  return groups.values.toList(growable: false);
}
