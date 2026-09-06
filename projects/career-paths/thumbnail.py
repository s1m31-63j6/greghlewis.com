"""thumbnail.py -> public/landing/career-paths.png

The landing card: the settled plinko histogram, drawn as SVG from a fixed-seed
run and rasterised with rsvg-convert. Not part of the check pipeline; run it
when the model or the palette changes.
"""

from __future__ import annotations

import math
import subprocess
from pathlib import Path

from engine import avg_first, simulate
from params import PARAMS, plain
from rng import Mulberry32

HERE = Path(__file__).parent
OUT_SVG = HERE / "results" / "thumbnail.svg"
OUT_PNG = HERE.parent.parent / "public" / "landing" / "career-paths.png"

W, H = 1600, 900
COLORS = {"startup": "#d55e00", "corporate": "#0072b2", "consulting": "#009e73"}
X_MIN, X_MAX, NB = 30_000, 10_000_000, 60


def unit(v: float) -> float:
    if v <= X_MIN:
        return 0.0
    if v >= X_MAX:
        return 1.0
    return math.log(v / X_MIN) / math.log(X_MAX / X_MIN)


def main() -> None:
    P = plain(PARAMS)
    left, right = 80, W - 60
    rows_top, row_pitch = 150, 12
    band_top, band_bottom = rows_top + 30 * row_pitch + 40, H - 70
    span = right - left
    binw = span / NB
    sub = binw / 3
    counts: dict[tuple[int, int], int] = {}
    balls = []
    for ti, track in enumerate(("startup", "corporate", "consulting")):
        rng = Mulberry32(20260906 + ti)
        for _ in range(1000):
            c = simulate("nontechnical", track, P, rng)
            a = avg_first(c, 30)
            b = min(NB - 1, int(unit(a) * NB))
            k = counts.get((b, ti), 0)
            counts[(b, ti)] = k + 1
            balls.append((ti, b, k, c.realized[:30]))
    max_count = max(counts.values())
    pitch = min(5.0, (band_bottom - band_top - 6) / max_count)
    ball = 4.2

    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
           f'<rect width="{W}" height="{H}" fill="#ffffff"/>']
    for r in range(30):
        y = rows_top + r * row_pitch + 0.5
        out.append(f'<line x1="{left}" y1="{y}" x2="{right}" y2="{y}" stroke="#eeeeee" stroke-width="1"/>')
    rng = Mulberry32(99)
    # A thin rain of balls mid-drop across the rows, one in eight, so the card
    # reads as a drop and not only as a histogram.
    for ti, b, k, realized in balls:
        if rng.random() < 0.125:
            r = int(rng.random() * 30)
            x = left + unit(realized[r]) * span
            y = rows_top + r * row_pitch
            out.append(f'<rect x="{x - ball / 2:.1f}" y="{y - ball / 2:.1f}" width="{ball}" height="{ball}" fill="{list(COLORS.values())[ti]}" opacity="0.85"/>')
    for ti, b, k, _ in balls:
        x = left + b * binw + ti * sub + sub / 2
        y = band_bottom - 3 - k * pitch - ball / 2
        out.append(f'<rect x="{x - ball / 2:.1f}" y="{y:.1f}" width="{ball}" height="{ball}" fill="{list(COLORS.values())[ti]}"/>')
    out.append(f'<line x1="{left}" y1="{band_bottom + 0.5}" x2="{right}" y2="{band_bottom + 0.5}" stroke="#000" stroke-width="1.5"/>')
    out.append('<text x="80" y="72" font-family="Archivo, Helvetica Neue, Arial, sans-serif" font-weight="700" font-size="54" letter-spacing="-1.5" fill="#000">Should You Join a Startup?</text>')
    out.append('<text x="80" y="108" font-family="JetBrains Mono, Menlo, monospace" font-size="17" letter-spacing="2" fill="#6b6b6b">3,000 SIMULATED CAREERS · 30 YEARS · REALIZED PAY, LOG SCALE</text>')
    lx = W - 60
    for name, col in reversed(list(COLORS.items())):
        out.append(f'<text x="{lx}" y="108" text-anchor="end" font-family="JetBrains Mono, Menlo, monospace" font-size="17" letter-spacing="2" fill="{col}">{name.upper()}</text>')
        lx -= 190
    for v, lab in ((50_000, "$50K"), (100_000, "$100K"), (200_000, "$200K"), (500_000, "$500K"), (1_000_000, "$1M"), (5_000_000, "$5M")):
        x = left + unit(v) * span
        out.append(f'<line x1="{x:.1f}" y1="{band_bottom}" x2="{x:.1f}" y2="{band_bottom + 8}" stroke="#000"/>')
        out.append(f'<text x="{x:.1f}" y="{band_bottom + 32}" text-anchor="middle" font-family="JetBrains Mono, Menlo, monospace" font-size="16" fill="#6b6b6b">{lab}</text>')
    out.append("</svg>")
    OUT_SVG.parent.mkdir(exist_ok=True)
    OUT_SVG.write_text("\n".join(out))
    subprocess.run(["rsvg-convert", "-w", str(W), "-h", str(H), "-o", str(OUT_PNG), str(OUT_SVG)], check=True)
    print("wrote", OUT_PNG)


if __name__ == "__main__":
    main()
