import 'package:flutter/material.dart';

import '../../api_client.dart';
import '../../theme/tokens.dart';

/// Football-card inventory tile shown in the horizontally-scrolling
/// "موجودی کارت‌ها" list on the dashboard.
class FootballCard extends StatelessWidget {
  final Map<String, dynamic> item;
  const FootballCard({super.key, required this.item});

  @override
  Widget build(BuildContext context) {
    final img = fullAssetUrl(item['image_url']);
    return Container(
      width: 168,
      padding: const EdgeInsets.all(Gaps.sm + 2),
      decoration: BoxDecoration(
        borderRadius: Corners.rXl,
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFFFD36B), Color(0xFF0B2B4F), Color(0xFF00D49A)],
        ),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.25),
              blurRadius: 20,
              offset: const Offset(0, 10))
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: ClipRRect(
              borderRadius: Corners.rMd,
              child: Container(
                width: double.infinity,
                color: Colors.black.withValues(alpha: 0.12),
                child: img.isNotEmpty
                    ? Image.network(
                        img,
                        width: double.infinity,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const Center(
                            child: Text('⚽', style: TextStyle(fontSize: 40))),
                      )
                    : const Center(
                        child: Text('⚽', style: TextStyle(fontSize: 40))),
              ),
            ),
          ),
          Gaps.vSm,
          Text(
            item['name'] ?? 'کارت',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
                color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16),
          ),
          const SizedBox(height: 2),
          Row(
            children: [
              const Icon(Icons.inventory_2_rounded,
                  size: 13, color: Colors.white70),
              const SizedBox(width: 4),
              Text('تعداد: ${faNum(item['quantity'])}',
                  style: const TextStyle(color: Colors.white, fontSize: 12.5)),
            ],
          ),
          Text('${faNum(item['point_value'])} امتیاز',
              style: const TextStyle(color: Colors.white70, fontSize: 12)),
        ],
      ),
    );
  }
}
