"""thumbnail.py -> public/landing/bond-yields.png

The landing card: the timeline chart, drawn as SVG from the shipped
yields.json and rasterised with rsvg-convert. Run it after fetch.py.
"""

from __future__ import annotations

import json
import subprocess
from datetime import date
from pathlib import Path

HERE = Path(__file__).parent
DATA = HERE.parent.parent / "src" / "app" / "projects" / "bond-yields" / "data" / "yields.json"
OUT_SVG = HERE / "thumbnail.svg"
OUT_PNG = HERE.parent.parent / "public" / "landing" / "bond-yields.png"

W, H = 1600, 900
L, R, T, B = 90, 230, 150, 70
INK, FF = "#000000", "#4a6fa5"
Y_MAX = 7
MONO = "JetBrains Mono, Menlo, monospace"
SANS = "Archivo, Helvetica Neue, Arial, sans-serif"


def main() -> None:
    d = json.loads(DATA.read_text())
    t0 = date.fromisoformat(d["start"]).toordinal()
    t1 = date.fromisoformat(d["asOf"]).toordinal()
    x = lambda iso: L + (date.fromisoformat(iso).toordinal() - t0) / (t1 - t0) * (W - L - R)
    y = lambda v: H - B - v / Y_MAX * (H - B - T)
    path = lambda pts: " ".join(f"{'M' if i == 0 else 'L'}{x(a):.1f},{y(b):.1f}" for i, (a, b) in enumerate(pts))
    ten, ff = d["series"]["dgs10"], d["series"]["dff"]

    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
           f'<rect width="{W}" height="{H}" fill="#ffffff"/>']
    for v in range(1, Y_MAX + 1):
        out.append(f'<line x1="{L}" y1="{y(v):.1f}" x2="{W - R}" y2="{y(v):.1f}" stroke="#e6e6e6"/>')
        out.append(f'<text x="{L - 12}" y="{y(v) + 6:.1f}" text-anchor="end" font-family="{MONO}" font-size="18" fill="#6b6b6b">{v}%</text>')
    out.append(f'<line x1="{L}" y1="{y(0):.1f}" x2="{W - R}" y2="{y(0):.1f}" stroke="#000" stroke-width="1.5"/>')
    for yr in range(2000, 2027, 2):
        tx = x(f"{yr}-01-01")
        out.append(f'<text x="{tx:.1f}" y="{H - B + 32}" text-anchor="middle" font-family="{MONO}" font-size="18" fill="#6b6b6b">{yr}</text>')
    out.append(f'<path d="{path(ff)}" fill="none" stroke="{FF}" stroke-width="2.2" stroke-linejoin="round"/>')
    out.append(f'<path d="{path(ten)}" fill="none" stroke="{INK}" stroke-width="3.2" stroke-linejoin="round"/>')
    for pts, col, name in ((ten, INK, "10-year Treasury"), (ff, FF, "Fed funds")):
        lx, ly = x(pts[-1][0]) + 14, y(pts[-1][1])
        out.append(f'<text x="{lx:.1f}" y="{ly + 2:.1f}" font-family="{SANS}" font-weight="600" font-size="20" fill="{col}">{name}</text>')
        out.append(f'<text x="{lx:.1f}" y="{ly + 26:.1f}" font-family="{MONO}" font-size="20" fill="{col}">{pts[-1][1]:.2f}%</text>')
    out.append(f'<text x="{L}" y="72" font-family="{SANS}" font-weight="700" font-size="54" letter-spacing="-1.5" fill="#000">Intro to Bond Yields</text>')
    out.append(f'<text x="{L}" y="108" font-family="{MONO}" font-size="17" letter-spacing="2" fill="#6b6b6b">10-YEAR TREASURY AND FED FUNDS · WEEKLY · 2000 TO {d["asOf"][:4]}</text>')
    out.append("</svg>")
    OUT_SVG.write_text("\n".join(out))
    subprocess.run(["rsvg-convert", "-w", str(W), "-h", str(H), "-o", str(OUT_PNG), str(OUT_SVG)], check=True)
    print("wrote", OUT_PNG)


if __name__ == "__main__":
    main()
