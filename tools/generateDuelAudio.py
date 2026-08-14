#!/usr/bin/env python3
"""Generate original, deterministic game music and SFX as 44.1 kHz MP3.

No samples or third-party music are used. Every waveform is synthesized here,
so Android and Web receive byte-identical assets and the build is reproducible.

Covers **all 23 clips** the games use:

  • 10 card-duel cues (music, lock, intro, round win/lose/draw, points,
    final draw, victory, defeat)
  • 13 shared game cues (move, move_opponent, drop, flip, match_found,
    your_turn, tick, tick_urgent, timeout, win, lose, draw, tap)

The 13 shared cues used to be checked-in binaries with no generator: flat
mono blips with a single dominant partial, no stereo image and no body.
They are now synthesized here to the same standard as the duel set —
stereo, layered, transient-shaped — so every sound in the app comes from
one reproducible source and one mastering chain.
"""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import soundfile as sf

SR = 44_100
RNG = np.random.default_rng(20260814)
ROOT = Path(__file__).resolve().parents[1]
OUTS = [ROOT / "mobile/assets/sfx", ROOT / "userweb/public/sfx"]


def midi(n: float) -> float:
    return 440.0 * 2 ** ((n - 69.0) / 12.0)


def env(n: int, attack=.01, decay=.08, sustain=.7, release=.12) -> np.ndarray:
    a, d, r = [max(1, int(v * SR)) for v in (attack, decay, release)]
    if a + d + r > n:
        scale = n / (a + d + r)
        a, d, r = [max(1, int(v * scale)) for v in (a, d, r)]
    s = max(0, n - a - d - r)
    return np.concatenate([
        np.linspace(0, 1, a, endpoint=False),
        np.linspace(1, sustain, d, endpoint=False),
        np.full(s, sustain),
        np.linspace(sustain, 0, r, endpoint=True),
    ])[:n]


def tone(freq: float, seconds: float, kind="sine", attack=.01, release=.1,
         decay=.08, sustain=.75, detune=0.0) -> np.ndarray:
    n = max(1, int(seconds * SR))
    t = np.arange(n) / SR
    f = freq * (2 ** (detune / 1200))
    phase = 2 * np.pi * f * t
    if kind == "saw":
        x = 2 * ((f * t) % 1) - 1
    elif kind == "triangle":
        x = 2 * np.abs(2 * ((f * t) % 1) - 1) - 1
    elif kind == "square":
        x = np.sign(np.sin(phase))
    else:
        x = np.sin(phase)
    return x * env(n, attack, decay, sustain, release)


def lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    alpha = 1 - math.exp(-2 * math.pi * cutoff / SR)
    y = np.empty_like(x)
    last = 0.0
    for i, sample in enumerate(x):
        last += alpha * (sample - last)
        y[i] = last
    return y


def stereo(x: np.ndarray, pan=0.0) -> np.ndarray:
    pan = float(np.clip(pan, -1, 1))
    left = math.cos((pan + 1) * math.pi / 4)
    right = math.sin((pan + 1) * math.pi / 4)
    return np.column_stack((x * left, x * right))


def add(bus: np.ndarray, x: np.ndarray, at: float, gain=1.0, pan=0.0) -> None:
    start = int(at * SR)
    if start >= len(bus):
        return
    sx = stereo(x, pan) if x.ndim == 1 else x
    end = min(len(bus), start + len(sx))
    bus[start:end] += sx[:end-start] * gain


def kick(seconds=.48) -> np.ndarray:
    n = int(seconds * SR)
    t = np.arange(n) / SR
    phase = 2 * np.pi * (42 * t + (120 - 42) * (1 - np.exp(-t * 30)) / 30)
    body = np.sin(phase) * np.exp(-t * 9)
    click = RNG.normal(0, 1, n) * np.exp(-t * 80)
    return body + .12 * click


def snare(seconds=.32) -> np.ndarray:
    n = int(seconds * SR)
    t = np.arange(n) / SR
    noise = RNG.normal(0, 1, n)
    noise = noise - lowpass(noise, 900)
    body = np.sin(2*np.pi*185*t) * np.exp(-t*16)
    return .72 * noise * np.exp(-t*13) + .3 * body


def hat(seconds=.10, open_hat=False) -> np.ndarray:
    n = int(seconds * SR)
    t = np.arange(n) / SR
    noise = RNG.normal(0, 1, n)
    bright = noise - lowpass(noise, 5_500)
    return bright * np.exp(-t * (18 if open_hat else 48))


def impact(seconds=.75) -> np.ndarray:
    n = int(seconds * SR)
    t = np.arange(n) / SR
    sub = np.sin(2*np.pi*(70 - 30*t)*t) * np.exp(-t*5.5)
    noise = lowpass(RNG.normal(0, 1, n), 1_500) * np.exp(-t*8)
    click = (RNG.normal(0, 1, n) - lowpass(RNG.normal(0, 1, n), 6_000)) * np.exp(-t*55)
    return .8*sub + .38*noise + .08*click


def shimmer(seconds=1.1, up=True) -> np.ndarray:
    n = int(seconds * SR)
    t = np.arange(n) / SR
    start, end = (500, 2_500) if up else (1_600, 360)
    k = (end - start) / max(seconds, .001)
    phase = 2*np.pi*(start*t + .5*k*t*t)
    x = np.sin(phase) + .35*np.sin(phase*1.501)
    return x * np.sin(np.pi*np.clip(t/seconds, 0, 1)) ** 1.5


def delay(st: np.ndarray, seconds=.18, amount=.24) -> np.ndarray:
    shift = int(seconds * SR)
    out = st.copy()
    if shift < len(out):
        out[shift:, 0] += st[:-shift, 1] * amount
        out[shift:, 1] += st[:-shift, 0] * amount
    return out


def write(name: str, audio: np.ndarray, quality: float = .20) -> None:
    if audio.ndim == 1:
        audio = stereo(audio)
    # Soft saturation keeps transients punchy without digital clipping.
    audio = np.tanh(audio * 1.12)
    peak = float(np.max(np.abs(audio))) or 1.0
    audio = audio * (0.89 / peak)
    rms = float(np.sqrt(np.mean(audio * audio)))
    assert rms > .015 and float(np.max(np.abs(audio))) <= .90
    primary = OUTS[0] / name
    primary.parent.mkdir(parents=True, exist_ok=True)
    # VBR MP3 is universally supported by Android/Web and is ~85% smaller
    # than PCM WAV. Lower `quality` = better VBR tier: 0.20 is the standard
    # high-quality tier for short cues, and the 30 s looping soundtrack gets
    # 0.0 (top tier) because sustained pads and cymbals are where VBR
    # artefacts are actually audible on a phone speaker.
    sf.write(primary, audio.astype(np.float32), SR, format="MP3",
             subtype="MPEG_LAYER_III", compression_level=quality,
             bitrate_mode="VARIABLE")
    encoded = primary.read_bytes()
    for out in OUTS[1:]:
        out.mkdir(parents=True, exist_ok=True)
        (out / name).write_bytes(encoded)


def soundtrack() -> np.ndarray:
    bpm = 128
    beat = 60 / bpm
    bars = 16
    length = bars * 4 * beat
    bus = np.zeros((int(length * SR), 2), dtype=np.float64)

    # D minor stadium-electronic harmony. Each four-bar section lifts energy.
    chords = [
        (50, 53, 57), (46, 50, 53), (48, 52, 55), (45, 48, 52),
    ]
    bass_roots = [38, 34, 36, 33]
    arp = [0, 2, 1, 2, 0, 1, 2, 1]
    for bar in range(bars):
        bar_t = bar * 4 * beat
        chord = chords[bar % 4]
        root = bass_roots[bar % 4]
        # Wide, filtered pad.
        for j, note in enumerate(chord):
            pad = (tone(midi(note), 4*beat, "saw", .18, .28, .25, .48, -6)
                   + tone(midi(note), 4*beat, "saw", .18, .28, .25, .48, 7)) * .22
            pad = lowpass(pad, 1_200 + (bar % 4) * 130)
            add(bus, pad, bar_t, .34, (-.55, 0, .55)[j])
        # Bass pulses, syncopated on the last beat.
        for step in [0, 1, 2, 3, 3.5]:
            b = tone(midi(root), beat*.42, "triangle", .006, .12, .05, .58)
            add(bus, b, bar_t + step*beat, .52, 0)
        # Bright arpeggio appears after the first two bars.
        if bar >= 2:
            for step in range(8):
                note = chord[arp[step]] + 12 + (12 if bar >= 12 and step in (3, 7) else 0)
                a = tone(midi(note), beat*.31, "triangle", .004, .10, .03, .42)
                add(bus, a, bar_t + step*beat/2, .20 + .03*(bar >= 8), -.45 if step % 2 else .45)
        # Four-on-floor sports pulse.
        for b in range(4):
            add(bus, kick(), bar_t + b*beat, .78)
            if b in (1, 3):
                add(bus, snare(), bar_t + b*beat, .34)
            add(bus, hat(), bar_t + b*beat, .12, -.25)
            add(bus, hat(), bar_t + (b+.5)*beat, .10, .25)
        if bar >= 8:
            for q in range(4):
                add(bus, hat(.19, True), bar_t + (q+.75)*beat, .07, .45)
        # Section riser into bars 4/8/12.
        if bar in (3, 7, 11, 15):
            add(bus, shimmer(beat*1.8), bar_t + 2.1*beat, .10, .2)

    # Gentle cross-channel delay and tiny loop-edge fades to prevent clicks.
    bus = delay(bus, beat * .375, .11)
    edge = int(.018 * SR)
    bus[:edge] *= np.linspace(0, 1, edge)[:, None]
    bus[-edge:] *= np.linspace(1, 0, edge)[:, None]
    return bus


def sfx_lock() -> np.ndarray:
    sec = .38; bus = np.zeros((int(sec*SR), 2))
    add(bus, impact(.34), 0, .28)
    add(bus, tone(midi(74), .22, "triangle", .002, .08, .03, .35), .03, .34, -.2)
    add(bus, tone(midi(81), .18, "triangle", .002, .07, .02, .30), .08, .28, .25)
    return bus


def sfx_intro() -> np.ndarray:
    sec = 1.15; bus = np.zeros((int(sec*SR), 2))
    add(bus, impact(.55), 0, .55)
    for i, note in enumerate([62, 65, 69, 74]):
        add(bus, tone(midi(note), .42, "triangle", .005, .19, .04, .48), .10+i*.12, .34, -.45+i*.3)
    add(bus, shimmer(.8), .18, .18)
    return delay(bus, .13, .18)


def sfx_round(win: str) -> np.ndarray:
    sec = 1.35; bus = np.zeros((int(sec*SR), 2))
    add(bus, impact(.78), 0, .78)
    notes = [62, 65, 69, 74] if win == "win" else [57, 53, 50, 45] if win == "lose" else [57, 62, 57]
    for i, note in enumerate(notes):
        add(bus, tone(midi(note), .48, "triangle", .004, .22, .05, .48), .18+i*.14, .36, -.45+i*.3)
    if win == "win": add(bus, shimmer(.9), .22, .20)
    if win == "lose": add(bus, shimmer(.8, False), .20, .12)
    return delay(bus, .16, .18)


def sfx_points() -> np.ndarray:
    sec = 1.75; bus = np.zeros((int(sec*SR), 2))
    # A rising cascade of short, glassy coin notes with a soft cash-in impact.
    for i, note in enumerate([74, 78, 81, 86, 90, 93]):
        at = .04 + i * .13
        ping = tone(midi(note), .38, "triangle", .002, .18, .025, .42)
        overtone = tone(midi(note + 12), .24, "sine", .002, .12, .02, .34)
        pan = -.72 + i * .28
        add(bus, ping, at, .34 + i * .018, pan)
        add(bus, overtone, at, .075, pan)
    add(bus, impact(.52), .70, .34)
    add(bus, shimmer(.82), .62, .16)
    return delay(bus, .115, .21)


def sfx_final_draw() -> np.ndarray:
    sec = 2.05; bus = np.zeros((int(sec*SR), 2))
    add(bus, impact(.8), 0, .62)
    for i, note in enumerate([50, 57, 62, 57, 50]):
        add(bus, tone(midi(note), .58, "triangle", .006, .24, .06, .50),
            .14+i*.22, .30, -.5+i*.25)
    add(bus, shimmer(1.15), .28, .10)
    add(bus, shimmer(1.15, False), .30, .08)
    return delay(bus, .19, .18)


def sfx_final(win: bool) -> np.ndarray:
    sec = 2.35; bus = np.zeros((int(sec*SR), 2))
    add(bus, impact(.9), 0, .72)
    notes = [50, 53, 57, 62, 65, 69] if win else [57, 53, 50, 45]
    for i, note in enumerate(notes):
        add(bus, tone(midi(note), .78, "triangle", .008, .30, .08, .58), .12+i*.20, .34, -.6+i*.22)
    if win:
        for t in np.arange(.35, 1.9, .19): add(bus, hat(.18, True), float(t), .045, float(RNG.uniform(-.8,.8)))
        add(bus, shimmer(1.7), .35, .24)
    else:
        add(bus, shimmer(1.25, False), .22, .14)
    return delay(bus, .21, .22)


# ── Shared game cues ────────────────────────────────────────────────────────
# Used by every game (tap, penalty, tic-tac-toe, card duel). These replace the
# old checked-in mono blips. Each one keeps the *identity* of the sound it
# replaces — same role, same rough pitch centre, same or shorter length, so no
# game timing shifts — but gains a stereo image, a real transient and a
# harmonic body instead of a lone sine partial.

def sfx_move() -> np.ndarray:
    """Own move: a soft, low wooden 'place'. Was a bare 220 Hz blip."""
    sec = .10; bus = np.zeros((int(sec*SR), 2))
    add(bus, tone(midi(57), .085, "triangle", .001, .03, .02, .30), 0, .52, -.12)
    add(bus, tone(midi(69), .05, "sine", .001, .02, .01, .25), 0, .20, .10)
    click = (RNG.normal(0, 1, int(.012*SR)) * np.exp(-np.arange(int(.012*SR))/SR*260))
    add(bus, lowpass(click, 4_200), 0, .30, 0)
    return bus


def sfx_move_opponent() -> np.ndarray:
    """Opponent move: same gesture as `move` but a fifth up and panned right,
    so the ear can tell whose turn just resolved without looking."""
    sec = .14; bus = np.zeros((int(sec*SR), 2))
    add(bus, tone(midi(64), .11, "triangle", .001, .04, .02, .32), 0, .50, .34)
    add(bus, tone(midi(76), .06, "sine", .001, .02, .01, .26), .004, .18, .22)
    click = (RNG.normal(0, 1, int(.014*SR)) * np.exp(-np.arange(int(.014*SR))/SR*230))
    add(bus, lowpass(click, 3_800), 0, .26, .3)
    return bus


def sfx_drop() -> np.ndarray:
    """Card/piece dropping onto the board: airy downward whoosh plus a thud."""
    sec = .12; bus = np.zeros((int(sec*SR), 2))
    n = int(.10*SR); t = np.arange(n)/SR
    air = lowpass(RNG.normal(0, 1, n), 5_000) * np.exp(-t*34)
    add(bus, air, 0, .38, -.2)
    add(bus, lowpass(RNG.normal(0, 1, n), 5_000) * np.exp(-t*34), .004, .34, .25)
    add(bus, tone(midi(45), .075, "sine", .001, .03, .015, .28), .02, .44, 0)
    return bus


def sfx_flip() -> np.ndarray:
    """Card flip: two-stage paper snap — edge lift, then the face landing."""
    sec = .12; bus = np.zeros((int(sec*SR), 2))
    n = int(.05*SR); t = np.arange(n)/SR
    snap = (RNG.normal(0, 1, n) - lowpass(RNG.normal(0, 1, n), 2_400)) * np.exp(-t*70)
    add(bus, snap, 0, .40, -.3)
    add(bus, tone(midi(78), .055, "triangle", .001, .02, .012, .26), .012, .30, .1)
    add(bus, tone(midi(85), .035, "sine", .001, .015, .008, .22), .045, .22, .32)
    return bus


def sfx_tap() -> np.ndarray:
    """Tap-game hit: must survive being fired ~10×/second, so it is short,
    bright and mostly transient — no lingering tail to smear into the next."""
    sec = .08; bus = np.zeros((int(sec*SR), 2))
    n = int(.03*SR); t = np.arange(n)/SR
    tick = (RNG.normal(0, 1, n) - lowpass(RNG.normal(0, 1, n), 3_000)) * np.exp(-t*115)
    add(bus, tick, 0, .34, 0)
    add(bus, tone(midi(72), .06, "triangle", .001, .022, .012, .24), 0, .46, -.08)
    add(bus, tone(midi(84), .03, "sine", .001, .012, .006, .20), .002, .20, .12)
    return bus


def sfx_tick() -> np.ndarray:
    """Neutral clock tick: dry, tiny, centred so it never pulls focus."""
    sec = .05; bus = np.zeros((int(sec*SR), 2))
    n = int(.02*SR); t = np.arange(n)/SR
    click = (RNG.normal(0, 1, n) - lowpass(RNG.normal(0, 1, n), 4_500)) * np.exp(-t*160)
    add(bus, click, 0, .30, 0)
    add(bus, tone(midi(93), .035, "sine", .0008, .014, .006, .18), 0, .34, 0)
    return bus


def sfx_tick_urgent() -> np.ndarray:
    """Last-seconds tick: same gesture, lower and harder, with a short
    dissonant partial that reads as pressure without being shrill."""
    sec = .06; bus = np.zeros((int(sec*SR), 2))
    n = int(.026*SR); t = np.arange(n)/SR
    click = (RNG.normal(0, 1, n) - lowpass(RNG.normal(0, 1, n), 3_200)) * np.exp(-t*130)
    add(bus, click, 0, .40, 0)
    add(bus, tone(midi(80), .05, "square", .0008, .02, .008, .22), 0, .30, -.1)
    add(bus, tone(midi(81), .04, "sine", .0008, .016, .006, .20), .002, .22, .12)
    return bus


def sfx_match_found() -> np.ndarray:
    """Opponent found: confident rising three-note fanfare (E-G-B)."""
    sec = .50; bus = np.zeros((int(sec*SR), 2))
    add(bus, impact(.22), 0, .26)
    for i, note in enumerate([64, 67, 71]):
        add(bus, tone(midi(note), .26, "triangle", .003, .10, .03, .42), .02+i*.10,
            .38, -.35+i*.35)
        add(bus, tone(midi(note+12), .16, "sine", .003, .07, .02, .30), .02+i*.10, .12, 0)
    add(bus, shimmer(.34), .10, .12)
    return delay(bus, .085, .16)


def sfx_your_turn() -> np.ndarray:
    """Your turn: a polite two-note prompt, deliberately softer than
    `match_found` because it repeats every round."""
    sec = .38; bus = np.zeros((int(sec*SR), 2))
    for i, note in enumerate([69, 76]):
        add(bus, tone(midi(note), .26, "triangle", .004, .11, .03, .40), .01+i*.09,
            .40, -.28+i*.5)
        add(bus, tone(midi(note+12), .14, "sine", .003, .06, .02, .28), .01+i*.09, .10, 0)
    return delay(bus, .075, .14)


def sfx_timeout() -> np.ndarray:
    """Clock ran out: a deflating two-step fall with a dull hit."""
    sec = .65; bus = np.zeros((int(sec*SR), 2))
    add(bus, impact(.36), 0, .40)
    for i, note in enumerate([64, 59, 52]):
        add(bus, tone(midi(note), .34, "triangle", .005, .14, .04, .44), .03+i*.14,
            .36, .3-i*.3)
    add(bus, shimmer(.42, False), .08, .10)
    return delay(bus, .11, .14)


def sfx_win() -> np.ndarray:
    """Generic game win (tap/penalty/tic-tac-toe). Shares the duel victory
    family — major arpeggio + hats + shimmer — but half the length, since
    these games return to the board immediately."""
    sec = 1.35; bus = np.zeros((int(sec*SR), 2))
    add(bus, impact(.62), 0, .60)
    for i, note in enumerate([60, 64, 67, 72, 76]):
        add(bus, tone(midi(note), .52, "triangle", .006, .22, .06, .52), .05+i*.13,
            .34, -.55+i*.26)
    for t in np.arange(.22, 1.10, .17):
        add(bus, hat(.15, True), float(t), .042, float(RNG.uniform(-.75, .75)))
    add(bus, shimmer(1.0), .18, .20)
    return delay(bus, .155, .20)


def sfx_lose() -> np.ndarray:
    """Generic game loss: descending minor line, no cymbals, softer top end
    so defeat never sounds louder than victory."""
    sec = 1.10; bus = np.zeros((int(sec*SR), 2))
    add(bus, impact(.58), 0, .55)
    for i, note in enumerate([60, 56, 51, 48]):
        add(bus, tone(midi(note), .50, "triangle", .008, .22, .06, .50), .05+i*.15,
            .34, .5-i*.25)
    add(bus, shimmer(.85, False), .14, .13)
    return delay(bus, .17, .17)


def sfx_draw() -> np.ndarray:
    """Generic draw: an unresolved open fifth that returns to where it began."""
    sec = .75; bus = np.zeros((int(sec*SR), 2))
    add(bus, impact(.40), 0, .42)
    for i, note in enumerate([57, 64, 57]):
        add(bus, tone(midi(note), .40, "triangle", .006, .17, .05, .46), .04+i*.16,
            .34, -.4+i*.4)
    add(bus, shimmer(.5), .12, .09)
    add(bus, shimmer(.5, False), .13, .07)
    return delay(bus, .14, .16)


def main() -> None:
    # Top VBR tier for the only long, sustained, looping asset.
    write("duel_music.mp3", soundtrack(), quality=.0)
    write("duel_lock.mp3", sfx_lock())
    write("duel_intro.mp3", sfx_intro())
    write("duel_round_win.mp3", sfx_round("win"))
    write("duel_round_lose.mp3", sfx_round("lose"))
    write("duel_round_draw.mp3", sfx_round("draw"))
    write("duel_final_draw.mp3", sfx_final_draw())
    write("duel_victory.mp3", sfx_final(True))
    write("duel_defeat.mp3", sfx_final(False))
    # Keep this last so adding the new noise-based cue never changes existing
    # release assets merely by advancing the deterministic RNG stream.
    write("duel_points.mp3", sfx_points())

    # Shared cues. Order is fixed for the same reason as above: the RNG stream
    # is shared, so appending a new cue must never disturb the ones before it.
    write("move.mp3", sfx_move())
    write("move_opponent.mp3", sfx_move_opponent())
    write("drop.mp3", sfx_drop())
    write("flip.mp3", sfx_flip())
    write("tap.mp3", sfx_tap())
    write("tick.mp3", sfx_tick())
    write("tick_urgent.mp3", sfx_tick_urgent())
    write("match_found.mp3", sfx_match_found())
    write("your_turn.mp3", sfx_your_turn())
    write("timeout.mp3", sfx_timeout())
    write("win.mp3", sfx_win())
    write("lose.mp3", sfx_lose())
    write("draw.mp3", sfx_draw())

    # Verify platform copies stay byte-identical.
    names = ["duel_music.mp3", "duel_lock.mp3", "duel_intro.mp3", "duel_round_win.mp3",
             "duel_round_lose.mp3", "duel_round_draw.mp3", "duel_points.mp3",
             "duel_final_draw.mp3", "duel_victory.mp3", "duel_defeat.mp3",
             "move.mp3", "move_opponent.mp3", "drop.mp3", "flip.mp3", "tap.mp3",
             "tick.mp3", "tick_urgent.mp3", "match_found.mp3", "your_turn.mp3",
             "timeout.mp3", "win.mp3", "lose.mp3", "draw.mp3"]
    for name in names:
        assert (OUTS[0] / name).read_bytes() == (OUTS[1] / name).read_bytes()
        print(f"{name:22s} {(OUTS[0] / name).stat().st_size:>9,} B")


if __name__ == "__main__":
    main()
