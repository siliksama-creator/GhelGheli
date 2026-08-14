#!/usr/bin/env python3
"""Generate original, deterministic card-duel music and SFX as 44.1 kHz MP3.

No samples or third-party music are used. Every waveform is synthesized here,
so Android and Web receive byte-identical assets and the build is reproducible.
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


def write(name: str, audio: np.ndarray) -> None:
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
    # than PCM WAV. 0.20 asks libsndfile/lame for the high-quality VBR tier.
    sf.write(primary, audio.astype(np.float32), SR, format="MP3",
             subtype="MPEG_LAYER_III", compression_level=.20,
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


def main() -> None:
    write("duel_music.mp3", soundtrack())
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
    # Verify platform copies stay byte-identical.
    for name in ["duel_music.mp3", "duel_lock.mp3", "duel_intro.mp3", "duel_round_win.mp3",
                 "duel_round_lose.mp3", "duel_round_draw.mp3", "duel_points.mp3",
                 "duel_final_draw.mp3", "duel_victory.mp3", "duel_defeat.mp3"]:
        assert (OUTS[0] / name).read_bytes() == (OUTS[1] / name).read_bytes()
        print(name, (OUTS[0] / name).stat().st_size)


if __name__ == "__main__":
    main()
