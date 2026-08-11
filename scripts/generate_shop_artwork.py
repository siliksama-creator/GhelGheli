#!/usr/bin/env python3
"""Build the production Shop thumbnails from curated cinematic sprite sheets.

The eight source atlases are NOT bundled in Flutter/Web. They live under
`design/shop_atlases/` solely to make every 640x360 WebP deterministic and
reproducible. Output bytes are copied identically to both clients.
"""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "design" / "shop_atlases"
WEB = ROOT / "userweb" / "public" / "shop" / "cosmetics-v3"
MOBILE = ROOT / "mobile" / "assets" / "shop" / "cosmetics"

ATLASES = {
    "frames_a": [
        "frame_gold", "frame_neon", "frame_fire", "frame_ice",
        "frame_holo", "blue_fire", "stadium_frame", "animated_gold",
    ],
    "frames_b": [
        "club_neon", "season_champion", "champions_night",
        "pro_holographic", "annual_royal_frame",
    ],
    "names_a": [
        "color_gold", "color_emerald", "color_rose", "color_sky",
        "color_violet", "color_rainbow", "gold_gradient", "green_neon",
    ],
    "names_b": [
        "animated_fire", "calm_rainbow", "icy_glow", "digital_typing",
        "mvp_name", "social_team",
    ],
    "results": [
        "result_stadium", "result_champions", "result_fire", "result_ice",
        "result_gold_mvp", "result_friendly", "result_derby",
        "result_world_cup",
    ],
    "match": [
        "stadium_spotlight", "colored_smoke", "card_side_fire",
        "victory_confetti", "golden_cup", "tunnel_entry",
        "goal_celebration", "win_streak",
    ],
    "leftovers": [
        "annual_royal_result", "mvp_effect", "rematch_effect",
        "emote_respect", "emote_comeback", "emote_goal_club",
    ],
    "profiles": [
        "locker_room", "night_stadium", "player_tunnel",
        "champion_podium", "training_ground", "collection_room",
    ],
}

# Atlas files are a strict 2x4 grid. A small inset removes the navy dividers.
COLS, ROWS = 2, 4
INSET_X, INSET_Y = 8, 7


def panel(atlas: Image.Image, index: int) -> Image.Image:
    cell_w, cell_h = atlas.width // COLS, atlas.height // ROWS
    col, row = index % COLS, index // COLS
    box = (
        col * cell_w + INSET_X,
        row * cell_h + INSET_Y,
        (col + 1) * cell_w - INSET_X,
        (row + 1) * cell_h - INSET_Y,
    )
    crop = atlas.crop(box).convert("RGB")
    crop = ImageOps.fit(
        crop, (640, 360), method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.5),
    )
    crop = ImageEnhance.Color(crop).enhance(1.07)
    crop = ImageEnhance.Contrast(crop).enhance(1.045)
    return crop.filter(ImageFilter.UnsharpMask(radius=1.1, percent=65, threshold=3))


def main() -> None:
    WEB.mkdir(parents=True, exist_ok=True)
    MOBILE.mkdir(parents=True, exist_ok=True)
    expected = {slug for slugs in ATLASES.values() for slug in slugs}
    if len(expected) != 55:
        raise RuntimeError(f"expected 55 unique SKU artworks, got {len(expected)}")

    for key, slugs in ATLASES.items():
        source = SOURCE / f"shop_atlas_{key}.webp"
        if not source.exists():
            raise FileNotFoundError(source)
        atlas = Image.open(source).convert("RGB")
        if atlas.size != (1024, 1024):
            raise ValueError(f"{source.name}: expected 1024x1024, got {atlas.size}")
        for index, slug in enumerate(slugs):
            art = panel(atlas, index)
            target = WEB / f"{slug}.webp"
            art.save(target, "WEBP", quality=88, method=6)
            (MOBILE / target.name).write_bytes(target.read_bytes())

    for folder in (WEB, MOBILE):
        for old in folder.glob("*.webp"):
            if old.stem not in expected:
                old.unlink()
    legacy_web = ROOT / "userweb" / "public" / "shop" / "cosmetics"
    if legacy_web.exists():
        for old in legacy_web.glob("*.webp"):
            old.unlink()
        try:
            legacy_web.rmdir()
        except OSError:
            pass
    print(f"generated {len(expected)} cinematic Shop artworks for Web + Android")


if __name__ == "__main__":
    main()
