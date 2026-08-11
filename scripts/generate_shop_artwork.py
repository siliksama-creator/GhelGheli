#!/usr/bin/env python3
"""Generate the complete deterministic Shop artwork set for Web + Flutter.

Every SKU gets its own semantic 16:9 illustration. The source is vector and
contains no external font/image dependency; ImageMagick rasterises compact
WebP files so the same bytes ship on both clients.
"""
from __future__ import annotations

import html
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "userweb/public/shop/cosmetics"
MOBILE = ROOT / "mobile/assets/shop/cosmetics"

FRAME = {
    "frame_gold": ("#FFD166", "#B45309", "gold"),
    "frame_neon": ("#A3E635", "#06B6D4", "neon"),
    "frame_fire": ("#F97316", "#DC2626", "fire"),
    "frame_ice": ("#E0F2FE", "#0284C7", "ice"),
    "frame_holo": ("#22D3EE", "#F472B6", "holo"),
    "blue_fire": ("#38BDF8", "#1D4ED8", "blue_fire"),
    "stadium_frame": ("#22C55E", "#0EA5E9", "stadium"),
    "animated_gold": ("#FFF0A3", "#D97706", "gold"),
    "club_neon": ("#C026D3", "#22D3EE", "club"),
    "season_champion": ("#FFD166", "#DC2626", "champion"),
    "champions_night": ("#1D4ED8", "#A78BFA", "night"),
    "pro_holographic": ("#22D3EE", "#F472B6", "pro_holo"),
    "annual_royal_frame": ("#FFD166", "#7C3AED", "royal"),
}
NAME = {
    "color_gold": ("#FFD166", "#F59E0B", "gold"),
    "color_emerald": ("#A3E635", "#10B981", "neon"),
    "color_rose": ("#FB7185", "#DC2626", "rose"),
    "color_sky": ("#BAE6FD", "#0284C7", "sky"),
    "color_violet": ("#C084FC", "#7C3AED", "violet"),
    "color_rainbow": ("#F472B6", "#22D3EE", "rainbow"),
    "gold_gradient": ("#FFF0A3", "#F59E0B", "gold"),
    "green_neon": ("#D9F99D", "#10B981", "neon"),
    "animated_fire": ("#FDE047", "#EF4444", "fire"),
    "calm_rainbow": ("#60A5FA", "#F9A8D4", "rainbow"),
    "icy_glow": ("#E0F2FE", "#38BDF8", "ice"),
    "digital_typing": ("#67E8F9", "#22C55E", "digital"),
    "mvp_name": ("#FFFFFF", "#FFD166", "mvp"),
    "social_team": ("#FB7185", "#8B5CF6", "team"),
}
RESULT = {
    "result_stadium": ("#052E16", "#0EA5E9", "stadium"),
    "result_champions": ("#172554", "#7C3AED", "night"),
    "result_fire": ("#450A0A", "#F97316", "fire"),
    "result_ice": ("#082F49", "#7DD3FC", "ice"),
    "result_gold_mvp": ("#422006", "#FFD166", "mvp"),
    "result_friendly": ("#312E81", "#FB7185", "friendly"),
    "result_derby": ("#B91C1C", "#1D4ED8", "derby"),
    "result_world_cup": ("#064E3B", "#FACC15", "world"),
    "annual_royal_result": ("#1E1B4B", "#FFD166", "royal"),
}
MATCH = {
    "stadium_spotlight": ("#E2E8F0", "#38BDF8", "spotlight"),
    "colored_smoke": ("#F472B6", "#60A5FA", "smoke"),
    "card_side_fire": ("#F97316", "#EF4444", "side_fire"),
    "victory_confetti": ("#FFD166", "#22D3EE", "confetti"),
    "golden_cup": ("#FFD166", "#F59E0B", "cup"),
    "tunnel_entry": ("#94A3B8", "#F59E0B", "tunnel"),
    "goal_celebration": ("#22C55E", "#FFD166", "goal"),
    "win_streak": ("#EF4444", "#FFD166", "streak"),
    "mvp_effect": ("#FFD166", "#FFFFFF", "mvp"),
    "rematch_effect": ("#8B5CF6", "#22D3EE", "rematch"),
}
EMOTE = {
    "emote_respect": ("#22C55E", "#38BDF8", "GG", "WELL PLAYED"),
    "emote_comeback": ("#F59E0B", "#8B5CF6", "REMATCH?", "I'LL BE BACK"),
    "emote_goal_club": ("#22D3EE", "#F472B6", "GOOOAL!", "MY CLUB"),
}
PROFILE = {
    "locker_room": ("#3F2A1D", "#F59E0B", "locker"),
    "night_stadium": ("#020617", "#1D4ED8", "stadium"),
    "player_tunnel": ("#111827", "#F59E0B", "tunnel"),
    "champion_podium": ("#422006", "#FFD166", "podium"),
    "training_ground": ("#052E16", "#22C55E", "training"),
    "collection_room": ("#1E1B4B", "#A78BFA", "collection"),
}


def defs(a: str, b: str) -> str:
    return f"""
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop stop-color="{a}"/><stop offset="1" stop-color="#050A12"/></linearGradient>
      <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%"><stop stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>
      <linearGradient id="shine" x1="0%" y1="0%" x2="100%" y2="0%"><stop stop-color="{a}"/><stop offset=".48" stop-color="#fff"/><stop offset="1" stop-color="{b}"/></linearGradient>
      <radialGradient id="halo"><stop stop-color="{b}" stop-opacity=".55"/><stop offset="1" stop-color="{b}" stop-opacity="0"/></radialGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="shadow"><feDropShadow dx="0" dy="9" stdDeviation="10" flood-color="#000" flood-opacity=".6"/></filter>
      <pattern id="grid" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" fill="none" stroke="#fff" stroke-opacity=".07"/></pattern>
    </defs>"""


def wrap(a: str, b: str, body: str, tag: str) -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    {defs(a,b)}
    <rect width="640" height="360" rx="34" fill="url(#bg)"/>
    <circle cx="515" cy="56" r="160" fill="url(#halo)"/>
    <rect x="1.5" y="1.5" width="637" height="357" rx="32.5" fill="none" stroke="{a}" stroke-opacity=".45" stroke-width="3"/>
    <rect x="18" y="18" width="604" height="324" rx="24" fill="url(#grid)" opacity=".45"/>
    {body}
    <g opacity=".76"><rect x="466" y="307" width="140" height="28" rx="14" fill="#020617" stroke="{a}" stroke-opacity=".55"/><text x="536" y="326" text-anchor="middle" font-family="DejaVu Sans,sans-serif" font-size="12" font-weight="700" letter-spacing="1.3" fill="#fff">{html.escape(tag)}</text></g>
    </svg>"""


def stars(a: str) -> str:
    pts = [(70,56,3),(128,94,2),(188,48,4),(454,72,3),(527,115,2),(583,48,4),(83,224,2),(565,246,3)]
    return "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{a}" filter="url(#glow)"/>' for x,y,r in pts)


def flames(color: str, blue: bool = False) -> str:
    cs = [color, "#FDE047" if not blue else "#BAE6FD", "#EF4444" if not blue else "#2563EB"]
    paths=[]
    for i,x in enumerate([84,130,174,432,476,520]):
        h=55+(i%3)*18
        paths.append(f'<path d="M{x} 306 C{x-22} {290-h/2} {x+12} {280-h} {x-2} {245-h/3} C{x+38} {269-h/2} {x+28} 295 {x} 306Z" fill="{cs[i%3]}" opacity=".8" filter="url(#glow)"/>')
    return ''.join(paths)


def cup_markup(color="#FFD166", x=274, y=72, scale=1.0) -> str:
    # Filled geometry rather than inherited SVG strokes: it rasterises
    # identically in ImageMagick, Chrome and Android's asset decoder.
    return f'''<g transform="translate({x} {y}) scale({scale})" fill="{color}">
      <path d="M18 8h92v46c0 41-18 66-46 66S18 95 18 54Z"/>
      <path d="M18 27H0v18c0 31 17 50 44 54V83C26 79 18 67 18 45ZM110 27h18v18c0 31-17 50-44 54V83c18-4 26-16 26-38Z"/>
      <rect x="57" y="114" width="14" height="39" rx="6"/><rect x="32" y="147" width="64" height="13" rx="6"/>
      <path d="M42 15h44v43c0 24-8 42-22 52-14-10-22-28-22-52Z" fill="#fff" fill-opacity=".2"/>
    </g>'''


def frame_art(slug: str, a: str, b: str, motif: str) -> str:
    deco = ""
    if motif in ("fire", "blue_fire"):
        deco += flames(a, motif == "blue_fire")
    if motif == "stadium":
        deco += '<path d="M25 250Q320 135 615 250V345H25Z" fill="#16A34A" opacity=".38"/><path d="M35 246Q320 118 605 246" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="8"/>'
        deco += ''.join(f'<g transform="translate({x} 45)"><rect width="62" height="18" rx="4" fill="#fff" opacity=".85" filter="url(#glow)"/><path d="M8 20 55 155" stroke="#fff" opacity=".16" stroke-width="32"/></g>' for x in (35,543))
    if motif in ("night", "royal"):
        deco += stars(a)
    if motif in ("holo", "pro_holo"):
        deco += '<path d="M34 304 180 25l96 279L382 34l218 270Z" fill="url(#accent)" opacity=".22"/><path d="M82 44 578 292M38 185 604 116" stroke="#fff" stroke-opacity=".23" stroke-width="5"/>'
    if motif == "pro_holo":
        deco += '<circle cx="320" cy="180" r="156" fill="none" stroke="#A3E635" stroke-width="5" stroke-dasharray="8 15" opacity=".55"/><path d="M70 40h105v28H70ZM465 270h105v28H465Z" fill="#22D3EE" opacity=".42"/>'
    if motif == "ice":
        deco += ''.join(f'<path d="M{x} {y}l{18+s} {32+s} -{30+s} 18Z" fill="#E0F2FE" opacity=".55"/>' for x,y,s in [(35,64,3),(526,58,9),(68,262,5),(548,247,0)])
    if motif in ("champion", "royal"):
        deco += cup_markup(a, 63, 92, .72)
        deco += f'<path d="M260 63 280 25l20 38 42-8-22 36 26 34-44-3-22 38-18-40-44-1 30-32-20-38Z" fill="{a}" opacity=".82"/>'
    if motif == "club":
        deco += '<path d="M68 88 128 61l60 27v72c0 58-34 92-60 105-26-13-60-47-60-105Z" fill="#C026D3" fill-opacity=".16" stroke="#22D3EE" stroke-width="8" filter="url(#glow)"/><path d="m99 142 20 20 42-51" fill="none" stroke="#fff" stroke-width="10"/>'
    if motif in ("gold", "champion"):
        deco += ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#FFF0A3" opacity=".7" filter="url(#glow)"/>' for x,y,r in [(61,73,4),(560,66,6),(105,282,3),(534,250,5)])
    crown = f'<path d="M258 61 278 31l42 31 42-31 20 30-13 35h-98Z" fill="{a}"/>' if motif == "royal" else ''
    card = f'''<g filter="url(#shadow)">
      <rect x="216" y="42" width="208" height="276" rx="34" fill="#071522" stroke="url(#shine)" stroke-width="12"/>
      <rect x="235" y="61" width="170" height="238" rx="24" fill="url(#bg)" stroke="#fff" stroke-opacity=".16"/>
      <circle cx="320" cy="123" r="34" fill="{a}" opacity=".72"/>
      <path d="M263 258v-66c0-37 25-57 57-57s57 20 57 57v66Z" fill="url(#accent)"/>
      <text x="320" y="222" text-anchor="middle" font-family="DejaVu Sans" font-size="54" font-weight="900" fill="#fff" opacity=".86">10</text>
      <path d="M249 79h34M357 79h34M249 282h34M357 282h34" stroke="#fff" stroke-opacity=".55" stroke-width="4" stroke-linecap="round"/>
    </g>'''
    return wrap(a,b,deco+card+crown,"PREMIUM FRAME")


def name_art(slug: str, a: str, b: str, motif: str) -> str:
    deco = stars(a) if motif in ("sky","violet") else ""
    if motif == "fire": deco += flames(b)
    if motif == "ice": deco += ''.join(f'<path d="M{x} {y}l25 44-42 12Z" fill="#E0F2FE" opacity=".45"/>' for x,y in [(55,75),(530,82),(90,252),(510,245)])
    if motif == "digital":
        deco += '<text x="46" y="84" fill="#22C55E" opacity=".55" font-family="monospace" font-size="17">0110 1011 0010</text><text x="420" y="268" fill="#67E8F9" opacity=".55" font-family="monospace" font-size="17">PLAYER.NAME_</text>'
    if motif == "mvp": deco += cup_markup("#FFD166",65,95,.65)
    if motif == "team": deco += '<path d="M52 112 112 72l59 40-20 48-21-16v103H92V144l-20 16Z" fill="#FB7185" opacity=".52"/><path d="M468 112 528 72l59 40-20 48-21-16v103h-38V144l-20 16Z" fill="#8B5CF6" opacity=".52"/>'
    if motif in ("rainbow","holo"):
        deco += '<path d="M34 284Q320 34 606 284" fill="none" stroke="url(#accent)" stroke-width="22" opacity=".25"/><path d="M72 302Q320 86 568 302" fill="none" stroke="#22D3EE" stroke-width="8" opacity=".22"/>'
    if motif in ("neon","rose"):
        deco += '<rect x="55" y="68" width="530" height="218" rx="56" fill="none" stroke="url(#accent)" stroke-width="5" opacity=".7" filter="url(#glow)"/>'
    badge = '<g transform="translate(465 73)"><path d="M0 0h112l-15 27 15 27H0Z" fill="#FFD166"/><text x="54" y="36" text-anchor="middle" font-family="DejaVu Sans" font-size="25" font-weight="900" fill="#422006">MVP</text></g>' if motif == "mvp" else ''
    cursor = '<rect x="491" y="165" width="7" height="72" fill="#67E8F9" filter="url(#glow)"/>' if motif == "digital" else ''
    body=f'''{deco}{badge}
      <rect x="56" y="105" width="528" height="150" rx="42" fill="#020617" fill-opacity=".72" stroke="{a}" stroke-opacity=".3"/>
      <text x="320" y="211" text-anchor="middle" font-family="DejaVu Sans,sans-serif" font-size="47" font-weight="900" letter-spacing="2" fill="{a}" stroke="{b}" stroke-width="2">GHELGHELI</text>{cursor}
      <path d="M166 235H474" stroke="url(#accent)" stroke-width="5" stroke-linecap="round" opacity=".8"/>'''
    return wrap(a,b,body,"NAME EFFECT")


def result_art(slug: str, a: str, b: str, motif: str) -> str:
    deco=""
    if motif == "stadium": deco += '<path d="M20 285Q320 120 620 285V350H20Z" fill="#16A34A" opacity=".42"/><path d="M42 268Q320 100 598 268" fill="none" stroke="#fff" stroke-width="9" opacity=".28"/>'
    if motif in ("night","royal"): deco += stars(a)
    if motif == "fire": deco += flames(b)
    if motif == "ice": deco += ''.join(f'<path d="M{x} {y}l35 62-58 18Z" fill="#E0F2FE" opacity=".35"/>' for x,y in [(40,60),(545,70),(75,236),(522,232)])
    if motif == "derby": deco += '<path d="M0 0H320V360H0Z" fill="#B91C1C" opacity=".26"/><path d="M320 0H640V360H320Z" fill="#1D4ED8" opacity=".26"/>'
    if motif == "world": deco += '<circle cx="100" cy="103" r="62" fill="none" stroke="#FACC15" stroke-width="5" opacity=".45"/><path d="M40 103h120M100 41c-26 35-26 89 0 124M100 41c26 35 26 89 0 124" fill="none" stroke="#FACC15" stroke-width="3" opacity=".45"/>'
    if motif in ("mvp","royal","world"): deco += cup_markup("#FFD166",475,76,.68)
    if motif == "friendly": deco += '<g fill="#FB7185" opacity=".32"><path d="M42 70h142a24 24 0 0 1 24 24v48a24 24 0 0 1-24 24h-78l-35 30 8-30H42a24 24 0 0 1-24-24V94a24 24 0 0 1 24-24Z"/><path d="M455 210h142a24 24 0 0 1 24 24v34a24 24 0 0 1-24 24h-40l8 30-35-30h-75a24 24 0 0 1-24-24v-34a24 24 0 0 1 24-24Z"/></g>'
    body=f'''{deco}<g filter="url(#shadow)">
      <rect x="128" y="44" width="384" height="272" rx="30" fill="#030712" fill-opacity=".89" stroke="url(#accent)" stroke-width="5"/>
      <text x="320" y="84" text-anchor="middle" fill="{a}" font-family="DejaVu Sans" font-size="15" font-weight="800" letter-spacing="3">FULL TIME</text>
      <circle cx="205" cy="153" r="39" fill="{a}" opacity=".28" stroke="{a}" stroke-width="4"/><path d="m184 153 16 16 28-36" fill="none" stroke="#fff" stroke-width="8"/>
      <circle cx="435" cy="153" r="39" fill="{b}" opacity=".28" stroke="{b}" stroke-width="4"/><path d="M416 136h38v34h-38Z" fill="none" stroke="#fff" stroke-width="7"/>
      <text x="320" y="184" text-anchor="middle" fill="#fff" font-family="DejaVu Sans" font-size="82" font-weight="900">3  –  2</text>
      <rect x="177" y="224" width="286" height="55" rx="17" fill="url(#accent)" opacity=".18" stroke="{a}" stroke-opacity=".45"/>
      <text x="320" y="258" text-anchor="middle" fill="#FFD166" font-family="DejaVu Sans" font-size="18" font-weight="900" letter-spacing="2">★  MATCH MVP  ★</text>
    </g>'''
    return wrap(a,b,body,"RESULT CARD")


def match_art(slug: str, a: str, b: str, motif: str) -> str:
    pitch='''<g opacity=".48"><rect x="84" y="56" width="472" height="246" rx="28" fill="#064E3B" stroke="#fff" stroke-width="4"/><path d="M320 57v244M84 179h472" stroke="#fff" stroke-width="3"/><circle cx="320" cy="179" r="48" fill="none" stroke="#fff" stroke-width="3"/><path d="M84 125h70v108H84M556 125h-70v108h70" fill="none" stroke="#fff" stroke-width="3"/></g>'''
    deco=""
    if motif == "spotlight": deco += '<path d="M85 28 268 286H136Z" fill="#fff" opacity=".18"/><path d="M555 28 372 286h132Z" fill="#38BDF8" opacity=".18"/><rect x="46" y="24" width="92" height="20" rx="5" fill="#fff" filter="url(#glow)"/><rect x="502" y="24" width="92" height="20" rx="5" fill="#BAE6FD" filter="url(#glow)"/>'
    if motif == "smoke": deco += ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{c}" opacity=".36" filter="url(#glow)"/>' for x,y,r,c in [(160,210,70,"#F472B6"),(230,180,58,"#60A5FA"),(418,188,65,"#A78BFA"),(486,220,75,"#22D3EE")])
    if motif == "side_fire": deco += flames(b)
    if motif == "confetti": deco += ''.join(f'<rect x="{40+i*52}" y="{35+(i%3)*32}" width="10" height="28" rx="4" fill="{a if i%2 else b}" transform="rotate({-28+i*7} {40+i*52} 50)"/>' for i in range(11))
    if motif == "cup": deco += cup_markup(a,247,66,1.12)
    if motif == "tunnel": deco += ''.join(f'<rect x="{70+i*38}" y="{35+i*22}" width="{500-i*76}" height="{290-i*44}" rx="{42-i*4}" fill="none" stroke="{a if i%2 else b}" stroke-width="{10-i}" opacity="{.25+i*.12}"/>' for i in range(5))
    if motif == "goal": deco += '<g transform="translate(188 78)"><path d="M0 0h264v164H0Z" fill="none" stroke="#fff" stroke-width="8"/><path d="M0 0 38 28h188L264 0M38 28v136M226 28v136" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="4"/><circle cx="186" cy="110" r="28" fill="#fff" stroke="#0F172A" stroke-width="5" filter="url(#glow)"/><path d="m172 102 16-10 16 12-6 19-20 1Z" fill="#111827"/></g>'
    if motif == "streak": deco += ''.join(f'<g transform="translate({100+i*120} {96-i*10})"><rect width="88" height="126" rx="18" fill="#0F172A" stroke="{a}" stroke-width="5"/><path d="m20 68 17 17 33-42" fill="none" stroke="#FFD166" stroke-width="10"/><text x="44" y="111" text-anchor="middle" fill="#fff" font-family="DejaVu Sans" font-size="18" font-weight="900">W{i+1}</text></g>' for i in range(4))
    if motif == "mvp": deco += f'<path d="M320 52 344 112l64 4-49 41 17 62-56-34-56 34 17-62-49-41 64-4Z" fill="{a}" stroke="#fff" stroke-opacity=".45" stroke-width="3"/><text x="320" y="276" text-anchor="middle" fill="#fff" font-family="DejaVu Sans" font-size="36" font-weight="900">MVP</text>'
    if motif == "rematch": deco += f'<text x="320" y="252" text-anchor="middle" fill="{a}" font-family="DejaVu Sans" font-size="210" font-weight="900">↻</text><circle cx="320" cy="175" r="55" fill="{b}" opacity=".25"/><text x="320" y="188" text-anchor="middle" fill="#fff" font-family="DejaVu Sans" font-size="28" font-weight="900">AGAIN</text>'
    if motif not in ("cup","tunnel","goal","streak","mvp","rematch"):
        deco = pitch + deco + f'<g filter="url(#glow)"><circle cx="245" cy="178" r="43" fill="{a}"/><circle cx="395" cy="178" r="43" fill="{b}"/><text x="320" y="192" text-anchor="middle" fill="#fff" font-family="DejaVu Sans" font-size="35" font-weight="900">VS</text></g>'
    label="MATCH ENTRY" if motif in ("spotlight","smoke","side_fire","tunnel") else "VICTORY EFFECT"
    return wrap(a,b,deco,label)


def emote_art(slug: str, a: str, b: str, one: str, two: str) -> str:
    body=f'''<g filter="url(#shadow)">
      <circle cx="92" cy="111" r="39" fill="url(#accent)"/><path d="M73 116q19 20 38 0" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/><circle cx="79" cy="100" r="4" fill="#fff"/><circle cx="105" cy="100" r="4" fill="#fff"/>
      <path d="M148 60h342a34 34 0 0 1 34 34v54a34 34 0 0 1-34 34H220l-46 38 12-38h-38a34 34 0 0 1-34-34V94a34 34 0 0 1 34-34Z" fill="#fff" fill-opacity=".94" stroke="{a}" stroke-width="5"/>
      <text x="321" y="134" text-anchor="middle" fill="#071522" font-family="DejaVu Sans" font-size="32" font-weight="900">{html.escape(one)}</text>
      <path d="M160 226h292a27 27 0 0 1 27 27v24a27 27 0 0 1-27 27H221l-34 25 9-25h-36a27 27 0 0 1-27-27v-24a27 27 0 0 1 27-27Z" fill="{b}" fill-opacity=".86"/>
      <text x="306" y="273" text-anchor="middle" fill="#fff" font-family="DejaVu Sans" font-size="20" font-weight="800">{html.escape(two)}</text>
    </g>'''
    return wrap(a,b,body,"CONTROLLED EMOTES")


def profile_art(slug: str, a: str, b: str, motif: str) -> str:
    body=""
    if motif == "locker":
        body += '<rect x="55" y="48" width="530" height="225" rx="22" fill="#2A1B13" stroke="#F59E0B" stroke-opacity=".35"/>'
        for i in range(5):
            x=72+i*102
            body += f'<rect x="{x}" y="67" width="84" height="169" rx="10" fill="#4B3224" stroke="#D6A76B" stroke-width="3"/><circle cx="{x+68}" cy="150" r="4" fill="#FFD166"/><path d="M{x+18} 91h48" stroke="#D6A76B" stroke-width="4"/>'
        body += '<rect x="94" y="249" width="452" height="32" rx="9" fill="#8B5A2B"/><path d="M130 281v34M510 281v34" stroke="#5B371C" stroke-width="12"/>'
    if motif == "stadium":
        body += stars("#fff")+'<path d="M20 272Q320 88 620 272v88H20Z" fill="#0F3D2E"/><path d="M35 252Q320 70 605 252" fill="none" stroke="#60A5FA" stroke-width="24" opacity=".25"/><path d="M50 245Q320 98 590 245" fill="none" stroke="#fff" stroke-width="8" opacity=".45"/><ellipse cx="320" cy="292" rx="210" ry="47" fill="#16A34A"/><ellipse cx="320" cy="292" rx="70" ry="47" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="3"/>'
    if motif == "tunnel":
        body += ''.join(f'<rect x="{45+i*44}" y="{28+i*24}" width="{550-i*88}" height="{300-i*48}" rx="{42-i*5}" fill="none" stroke="{b if i%2 else "#475569"}" stroke-width="{16-i*2}" opacity="{.25+i*.13}"/>' for i in range(5))
        body += '<path d="M210 340 278 192h84l68 148Z" fill="#16A34A" opacity=".52"/><path d="M320 197v143" stroke="#fff" stroke-opacity=".5" stroke-width="4"/>'
    if motif == "podium":
        body += '<path d="M110 300h140v-92h140v-66h140v158Z" fill="url(#accent)" opacity=".85" filter="url(#shadow)"/><text x="320" y="257" text-anchor="middle" font-family="DejaVu Sans" font-size="70" font-weight="900" fill="#422006">1</text><text x="180" y="276" text-anchor="middle" font-family="DejaVu Sans" font-size="48" font-weight="900" fill="#fff">2</text><text x="460" y="238" text-anchor="middle" font-family="DejaVu Sans" font-size="48" font-weight="900" fill="#fff">3</text>'+cup_markup("#FFD166",267,34,.84)+'<path d="M220 20 305 170H135ZM420 20 335 170h170Z" fill="#fff" opacity=".08"/>'
    if motif == "training":
        body += '<rect x="40" y="43" width="560" height="275" rx="26" fill="#15803D" stroke="#fff" stroke-opacity=".6" stroke-width="4"/><path d="M320 44v273M40 181h560" stroke="#fff" stroke-opacity=".55" stroke-width="4"/><circle cx="320" cy="181" r="62" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="4"/>'
        for x,y in [(160,110),(232,250),(408,108),(480,250)]: body += f'<path d="M{x} {y-24}  {x-17} {y+18}h34Z" fill="#F97316" stroke="#fff" stroke-width="3"/>'
        body += '<circle cx="322" cy="184" r="24" fill="#fff"/><path d="m309 178 14-9 14 10-5 17h-18Z" fill="#111827"/>'
    if motif == "collection":
        body += '<rect x="45" y="40" width="550" height="275" rx="22" fill="#17133A" stroke="#A78BFA" stroke-opacity=".5"/>'
        for y in (128,226): body += f'<rect x="63" y="{y}" width="514" height="9" rx="4" fill="#A78BFA" opacity=".5"/>'
        for x,y in [(90,62),(190,62),(390,62),(490,62),(110,156),(230,156),(410,156)]: body += f'<rect x="{x}" y="{y}" width="64" height="58" rx="10" fill="url(#accent)" opacity=".42" stroke="#fff" stroke-opacity=".45"/>'
        body += cup_markup("#FFD166",270,145,.72)
    return wrap(a,b,body,"PROFILE BACKGROUND")


def render(slug: str, svg: str) -> None:
    WEB.mkdir(parents=True, exist_ok=True)
    MOBILE.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        source=Path(td)/f"{slug}.svg"
        out=Path(td)/f"{slug}.webp"
        source.write_text(svg, encoding="utf-8")
        subprocess.run([
            "convert", str(source), "-resize", "640x360!", "-strip",
            "-define", "webp:method=6", "-quality", "84", str(out)
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        data=out.read_bytes()
    (WEB/f"{slug}.webp").write_bytes(data)
    (MOBILE/f"{slug}.webp").write_bytes(data)


def main() -> None:
    for slug,(a,b,motif) in FRAME.items(): render(slug, frame_art(slug,a,b,motif))
    for slug,(a,b,motif) in NAME.items(): render(slug, name_art(slug,a,b,motif))
    for slug,(a,b,motif) in RESULT.items(): render(slug, result_art(slug,a,b,motif))
    for slug,(a,b,motif) in MATCH.items(): render(slug, match_art(slug,a,b,motif))
    for slug,(a,b,one,two) in EMOTE.items(): render(slug, emote_art(slug,a,b,one,two))
    for slug,(a,b,motif) in PROFILE.items(): render(slug, profile_art(slug,a,b,motif))
    print(f"generated {len(FRAME)+len(NAME)+len(RESULT)+len(MATCH)+len(EMOTE)+len(PROFILE)} paired Shop artworks")

if __name__ == "__main__": main()
