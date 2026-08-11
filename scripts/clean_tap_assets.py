#!/usr/bin/env python3
"""Make Tap character artwork reliably transparent without trimming artwork.

The source cut-outs contain a handful of detached semi-opaque compression
pixels. On a dark phone background those pixels and their matte look like a
faint rectangular/dirty background even though the WebP advertises an alpha
channel. This script keeps the largest connected artwork component, preserves
its anti-aliased edge, clears detached residue, and normalizes fully transparent
pixels. Canvas size and the visible character are deliberately unchanged.

Requires Pillow. Run from the repository root:
    python3 scripts/clean_tap_assets.py
"""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ROOTS = (
    Path("mobile/assets/games/tap"),
    Path("userweb/public/games/tap"),
)
ALPHA_FLOOR = 8
MIN_RESIDUE_COMPONENT = 32


def components(alpha: Image.Image) -> list[list[tuple[int, int]]]:
    width, height = alpha.size
    px = alpha.load()
    seen = bytearray(width * height)
    result: list[list[tuple[int, int]]] = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            if seen[index] or px[x, y] <= ALPHA_FLOOR:
                continue
            seen[index] = 1
            queue = deque([(x, y)])
            component: list[tuple[int, int]] = []
            while queue:
                cx, cy = queue.popleft()
                component.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if not (0 <= nx < width and 0 <= ny < height):
                        continue
                    neighbor = ny * width + nx
                    if seen[neighbor] or px[nx, ny] <= ALPHA_FLOOR:
                        continue
                    seen[neighbor] = 1
                    queue.append((nx, ny))
            result.append(component)
    return result


def clean(path: Path) -> tuple[int, int]:
    image = Image.open(path).convert("RGBA")
    rgba = image.load()
    groups = components(image.getchannel("A"))
    if not groups:
        raise RuntimeError(f"{path}: no visible artwork")

    groups.sort(key=len, reverse=True)
    removed = 0
    # The character is one connected cut-out. Tiny detached groups are WebP
    # edge/compression residue; a larger group is retained defensively in case
    # a future skin intentionally contains a separate prop.
    for group in groups[1:]:
        if len(group) >= MIN_RESIDUE_COMPONENT:
            continue
        for x, y in group:
            rgba[x, y] = (0, 0, 0, 0)
            removed += 1

    normalized = 0
    width, height = image.size
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = rgba[x, y]
            if alpha <= ALPHA_FLOOR:
                if alpha != 0 or red != 0 or green != 0 or blue != 0:
                    rgba[x, y] = (0, 0, 0, 0)
                    normalized += 1

    # Quality 90 is at least as detailed as the supplied mobile artwork while
    # retaining exact alpha data and avoiding lossless files several times the
    # original size.
    image.save(path, "WEBP", quality=90, alpha_quality=100, method=6, exact=True)

    verified = Image.open(path).convert("RGBA")
    a = verified.getchannel("A")
    extrema = a.getextrema()
    if extrema[0] != 0 or extrema[1] != 255:
        raise RuntimeError(f"{path}: expected both transparent and opaque pixels, got {extrema}")
    border = []
    for x in range(width):
        border.extend((a.getpixel((x, 0)), a.getpixel((x, height - 1))))
    for y in range(height):
        border.extend((a.getpixel((0, y)), a.getpixel((width - 1, y))))
    if max(border) > ALPHA_FLOOR:
        raise RuntimeError(f"{path}: visible pixels touch the canvas border")
    return removed, normalized


def main() -> None:
    total_removed = 0
    for root in ROOTS:
        for path in sorted(root.glob("skin_*.webp")):
            removed, normalized = clean(path)
            total_removed += removed
            print(f"{path}: removed {removed} residue pixels; normalized {normalized}")
    print(f"Done: removed {total_removed} detached residue pixels from Tap artwork")


if __name__ == "__main__":
    main()
