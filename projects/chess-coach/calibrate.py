"""Calibrate the difficulty dial.

    uv run python calibrate.py --smoke          # ~1 min, verifies the pipeline
    uv run python calibrate.py                  # the real run, overnight
    uv run python calibrate.py --from-results   # refit without replaying games

What this does, and why in this order:

1. Sweep the weakening curve at nine points (`s = 0 .. 1`) and add three of
   Stockfish's own `UCI_Elo` settings as anchors.
2. Play a full round-robin.
3. Fit Bradley-Terry ratings with standard errors, and shift the scale onto the
   anchors (`rating.py`).
4. Check the curve is monotone. If it is not, the one-parameter weakening family
   is broken and no amount of interpolation will fix it — stop and say so.
5. Invert the measured curve to find the `s` that hits each of the eight rung
   targets, and write `ladder.json` for the frontend.

The output the site actually consumes is `public/chess-coach/ladder.json`. The
calibration curve in the same file is what the methodology chart is drawn from.
"""

from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import shutil
import sys
from pathlib import Path

from rich.console import Console
from rich.table import Table

import rating
import tournament
from tournament import Player
from weakening import MULTIPV, family_fingerprint, params_for

console = Console()

REPO_ROOT = Path(__file__).resolve().parents[2]
LADDER_PATH = REPO_ROOT / "public" / "chess-coach" / "ladder.json"
SMOKE_LADDER_PATH = Path(__file__).parent / "results" / "ladder.smoke.json"
RESULTS_PATH = Path(__file__).parent / "results" / "tournament.json"

# The eight rungs the dial exposes, evenly spaced across the range Greg picked.
RUNG_TARGETS = [600, 830, 1060, 1290, 1520, 1740, 1970, 2200]

# Nine sample points across the weakening curve. More points at the weak end
# would be nice, but the curve is smooth by construction and nine is enough to
# interpolate eight rungs without the tournament size exploding (pairings grow
# quadratically in player count).
SAMPLE_S = [0.0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1.0]

# Stockfish's own weakening, for scale anchoring only. 1320 is the floor of
# `UCI_LimitStrength` — the fact that this is the *lowest* anchor available is
# itself the headline finding.
ANCHOR_ELOS = [1320, 1600, 2000]


def build_players(smoke: bool = False) -> list[Player]:
    sample_s = [0.0, 0.5, 1.0] if smoke else SAMPLE_S
    anchor_elos = [1320, 2000] if smoke else ANCHOR_ELOS
    samplers = [Player(id=f"s{s:.3f}", kind="sampler", s=s) for s in sample_s]
    anchors = [Player(id=f"sf{e}", kind="anchor", uci_elo=e) for e in anchor_elos]
    return samplers + anchors


def report(fitted: dict, points: list[dict]) -> None:
    table = Table(title="Measured strength curve", title_justify="left")
    table.add_column("s", justify="right")
    table.add_column("depth", justify="right")
    table.add_column("blunder %", justify="right")
    table.add_column("measured Elo", justify="right")
    table.add_column("± 95%", justify="right")
    for pt in points:
        p = params_for(pt["s"])
        table.add_row(
            f"{pt['s']:.3f}",
            str(p.depth),
            f"{p.blunder_rate * 100:.1f}",
            f"{pt['elo']:.0f}",
            f"{1.96 * pt['se']:.0f}",
        )
    console.print(table)

    residuals = fitted["anchor_residuals"]
    if residuals:
        anchor_table = Table(title="Anchor residuals", title_justify="left")
        anchor_table.add_column("anchor")
        anchor_table.add_column("nominal UCI_Elo", justify="right")
        anchor_table.add_column("measured", justify="right")
        anchor_table.add_column("residual", justify="right")
        for aid, row in sorted(residuals.items()):
            anchor_table.add_row(
                aid, f"{row['nominal']}", f"{row['measured']:.0f}", f"{row['residual']:+.0f}"
            )
        console.print(anchor_table)
        spread = max(r["residual"] for r in residuals.values()) - min(
            r["residual"] for r in residuals.values()
        )
        note = (
            "anchors are internally consistent — absolute Elo is credible"
            if spread < 100
            else "anchors disagree by more than 100 Elo — treat absolute numbers as approximate"
        )
        console.print(f"anchor residual spread: [bold]{spread:.0f}[/] Elo — {note}\n")


def coverage_gaps(points: list[dict]) -> list[int]:
    """Rung targets that fall outside the measured curve.

    `rating.invert` uses linear interpolation, which *silently clamps* outside
    the sampled range — an uncovered target would come back as `s = 0` or
    `s = 1` looking exactly like a real answer. Anything this returns is a rung
    the weakening family cannot actually reach, which means the parameter
    shapes need widening, not a quiet extrapolation.
    """
    low, high = points[0]["elo"], points[-1]["elo"]
    return [t for t in RUNG_TARGETS if t < low or t > high]


def write_ladder(points: list[dict], fitted: dict, payload: dict, out_path: Path) -> None:
    rungs = []
    for target in RUNG_TARGETS:
        s = rating.invert(points, target)
        nearest = min(points, key=lambda pt: abs(pt["elo"] - target))
        rungs.append(
            {
                "label": target,
                "s": round(s, 4),
                "params": params_for(s).to_json(),
                "ci95": round(1.96 * nearest["se"], 1),
            }
        )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(
            {
                "_note": (
                    "Generated by projects/chess-coach/calibrate.py. Each rung's `s` was "
                    "found by inverting an empirically measured strength curve, not assigned. "
                    "Do not hand-edit."
                ),
                "games": sum(p["games"] for p in payload["pairings"]) // 2,
                # Single source of truth for the browser: the policy was measured
                # at this width, so the browser must analyse at it too.
                "multipv": MULTIPV,
                "rungs": rungs,
                "curve": points,
                "anchors": fitted["anchor_residuals"],
            },
            indent=2,
        )
    )
    console.print(f"[green]wrote[/] {out_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rounds", type=int, default=12, help="round-robin rounds (default 12)")
    # Only one of a worker's three engines searches at a time (the referee is
    # idle except during adjudication probes), so workers map roughly 1:1 onto
    # busy cores. Leave two for the OS and the progress renderer.
    parser.add_argument("--workers", type=int, default=max(1, mp.cpu_count() - 2))
    parser.add_argument("--engine", default=shutil.which("stockfish") or "stockfish")
    parser.add_argument(
        "--smoke",
        action="store_true",
        help="tiny run to verify the pipeline end to end; ratings will be meaningless",
    )
    parser.add_argument(
        "--from-results",
        action="store_true",
        help="skip the tournament and refit from the last saved results",
    )
    args = parser.parse_args()

    if not shutil.which(args.engine) and not Path(args.engine).exists():
        console.print(f"[red]stockfish not found at {args.engine!r}[/] — `brew install stockfish`")
        return 1

    if args.from_results:
        if not RESULTS_PATH.exists():
            console.print(f"[red]no saved results at {RESULTS_PATH}[/]")
            return 1
        payload = json.loads(RESULTS_PATH.read_text())
        saved, current = payload.get("family"), family_fingerprint()
        if saved != current:
            console.print(
                f"[red]those results measured a different parameter family[/] "
                f"(saved {saved or 'unrecorded'}, current {current})."
            )
            console.print(
                "Refitting them would produce rung parameters that were never measured. "
                "Re-run the tournament instead."
            )
            return 1
        console.print(f"[dim]refitting from {RESULTS_PATH}[/]")
    else:
        players = build_players(smoke=args.smoke)
        rounds = 1 if args.smoke else args.rounds
        book = 2 if args.smoke else None
        payload = tournament.run(
            players, rounds, args.engine, args.workers, RESULTS_PATH, book_size=book
        )

    fitted = rating.fit(payload)
    points = rating.curve(payload, fitted["ratings"])
    report(fitted, points)

    ok = True

    breaks = rating.monotonicity_breaks(points)
    if breaks:
        console.print(
            "[red]the weakening curve is not monotone[/] at: "
            + ", ".join(f"{a} → {b}" for a, b in breaks)
        )
        console.print(
            "Interpolating this would produce meaningless rung parameters. "
            "Fix the parameter shapes in weakening.params_for and re-run."
        )
        ok = False

    gaps = coverage_gaps(points)
    if gaps:
        console.print(
            f"[red]rung target(s) outside the measured curve:[/] {gaps} — "
            f"measured range is {points[0]['elo']:.0f}..{points[-1]['elo']:.0f} Elo"
        )
        console.print(
            "Interpolation would silently clamp these to the end of the curve. "
            "Widen the parameter range in weakening.params_for (MAX_DEPTH at the "
            "top end, band/temperature at the bottom) and re-run."
        )
        ok = False

    # Smoke runs are far too small to mean anything, so their ladder goes to a
    # scratch path — a bogus ladder.json under public/ could be committed and
    # shipped, and it would look exactly like a real one.
    out_path = SMOKE_LADDER_PATH if args.smoke else LADDER_PATH
    if not ok and not args.smoke:
        return 1
    if args.smoke:
        console.print("[yellow]--smoke: ratings are noise; ladder written to scratch only[/]")

    write_ladder(points, fitted, payload, out_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
