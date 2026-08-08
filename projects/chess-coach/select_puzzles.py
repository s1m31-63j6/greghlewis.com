"""Pick teaching examples for the tactical concepts from the Lichess puzzle DB.

    uv run python select_puzzles.py

Source: https://database.lichess.org/lichess_db_puzzle.csv.zst — 6,057,356
puzzles, released under CC0 ("use them for research, commercial purpose,
publication, anything you like").

Two things about this dataset are easy to get wrong and both are load-bearing:

1. **The FEN is the position BEFORE the opponent's move.** The position to show
   a learner is the one after applying `Moves[0]`, and the solution starts at
   `Moves[1]`. Using the raw FEN would present every puzzle one ply early, with
   the "solution" beginning with the opponent's own move — subtly wrong in a way
   that still looks like a valid position.

2. **Solution moves are "only moves"** — any alternative considerably worsens
   the position — *except* for mate-in-1, where several moves may mate. That is
   what makes these usable as teaching examples without hand-checking each one.

Selection favours teachability over difficulty: heavily played, well-liked
puzzles inside a rating band appropriate to the concept, preferring puzzles
tagged with few *other* motifs so the example demonstrates one idea rather than
four at once.
"""

from __future__ import annotations

import csv
import io
import json
import subprocess
import sys
from pathlib import Path

import chess
import yaml
from rich.console import Console
from rich.progress import BarColumn, Progress, TextColumn, TimeElapsedColumn

console = Console()

HERE = Path(__file__).parent
PUZZLE_DB = HERE / "data" / "lichess_db_puzzle.csv.zst"
CONCEPTS = HERE / "library" / "concepts.yaml"
OUT = HERE / "data" / "selected_puzzles.json"

PER_CONCEPT = 6

# Quality gates. `popularity` runs -100..100 and is upvotes vs downvotes;
# `nb_plays` is how many times it has been attempted. Both high means a lot of
# people saw this puzzle and thought it was a good one.
MIN_POPULARITY = 90
MIN_PLAYS = 1000

# Themes that describe the puzzle's shape or provenance rather than its motif.
# They are excluded when counting how many *ideas* a puzzle mixes together.
META_THEMES = {
    "short", "long", "veryLong", "oneMove", "crushing", "advantage", "equality",
    "mate", "mateIn1", "mateIn2", "mateIn3", "mateIn4", "mateIn5",
    "opening", "middlegame", "endgame", "master", "masterVsMaster", "superGM",
}


def load_concepts() -> list[dict]:
    concepts = yaml.safe_load(CONCEPTS.read_text())
    return [c for c in concepts if c.get("source") == "lichess"]


def presented_position(fen: str, moves: list[str]) -> tuple[str, list[str], list[str]] | None:
    """Return (fen_to_show, solution_uci, solution_san), or None if malformed.

    Applies the opponent's setup move to the raw FEN — see the module docstring.
    Every move is replayed through python-chess, so a puzzle that does not
    validate is dropped rather than shipped.
    """
    if len(moves) < 2:
        return None
    try:
        board = chess.Board(fen)
        setup = chess.Move.from_uci(moves[0])
        if setup not in board.legal_moves:
            return None
        board.push(setup)

        shown = board.fen()
        san: list[str] = []
        for uci in moves[1:]:
            move = chess.Move.from_uci(uci)
            if move not in board.legal_moves:
                return None
            san.append(board.san(move))
            board.push(move)
    except (ValueError, AssertionError):
        return None
    return shown, moves[1:], san


def main() -> int:
    if not PUZZLE_DB.exists():
        console.print(f"[red]missing {PUZZLE_DB}[/] — see README for the download command")
        return 1

    concepts = load_concepts()
    wanted = {c["lichess_theme"]: c for c in concepts}
    console.print(f"selecting for [bold]{len(concepts)}[/] lichess-sourced concepts")

    # concept slug -> list of (score, row)
    picked: dict[str, list[tuple[float, dict]]] = {c["slug"]: [] for c in concepts}
    theme_seen: dict[str, int] = dict.fromkeys(wanted, 0)
    seen_games: dict[str, set[str]] = {c["slug"]: set() for c in concepts}
    scanned = 0

    proc = subprocess.Popen(
        ["zstd", "-dc", str(PUZZLE_DB)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
    )
    assert proc.stdout
    reader = csv.DictReader(io.TextIOWrapper(proc.stdout, encoding="utf-8"))

    with Progress(
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TextColumn("{task.completed:,} rows"),
        TimeElapsedColumn(),
        console=console,
    ) as progress:
        bar = progress.add_task("scanning", total=None)
        for row in reader:
            scanned += 1
            if scanned % 50_000 == 0:
                progress.update(bar, completed=scanned)

            themes = set(row["Themes"].split())
            for theme in themes & wanted.keys():
                theme_seen[theme] += 1
                concept = wanted[theme]
                slug = concept["slug"]

                if int(row["Popularity"]) < MIN_POPULARITY:
                    continue
                if int(row["NbPlays"]) < MIN_PLAYS:
                    continue
                low, high = concept["rating_band"]
                if not low <= int(row["Rating"]) <= high:
                    continue
                # One example per source game, so a concept's examples aren't
                # three positions from the same encounter.
                if row["GameUrl"] in seen_games[slug]:
                    continue

                motifs = themes - META_THEMES
                # Fewer competing motifs is better teaching; more plays and
                # higher popularity break ties.
                score = -len(motifs) * 1000 + int(row["Popularity"]) + min(int(row["NbPlays"]), 50_000) / 10_000
                picked[slug].append((score, row))
                seen_games[slug].add(row["GameUrl"])

        progress.update(bar, completed=scanned)

    proc.wait()

    # A theme that matched nothing is a typo in concepts.yaml, not an empty
    # category — fail loudly rather than shipping a concept with no examples.
    missing = [t for t, n in theme_seen.items() if n == 0]
    if missing:
        console.print(f"[red]unknown lichess theme(s) in concepts.yaml:[/] {missing}")
        return 1

    out: dict[str, list[dict]] = {}
    thin = []
    for concept in concepts:
        slug = concept["slug"]
        candidates = sorted(picked[slug], key=lambda pair: pair[0], reverse=True)
        examples = []
        for _score, row in candidates:
            parsed = presented_position(row["FEN"], row["Moves"].split())
            if parsed is None:
                continue
            shown_fen, solution_uci, solution_san = parsed
            examples.append(
                {
                    "puzzle_id": row["PuzzleId"],
                    "fen": shown_fen,
                    "solution_uci": solution_uci,
                    "solution_san": solution_san,
                    "rating": int(row["Rating"]),
                    "themes": sorted(set(row["Themes"].split()) - META_THEMES),
                    "game_url": row["GameUrl"],
                }
            )
            if len(examples) >= PER_CONCEPT:
                break
        out[slug] = examples
        if len(examples) < PER_CONCEPT:
            thin.append(f"{slug} ({len(examples)}/{PER_CONCEPT}, theme has {theme_seen[concept['lichess_theme']]:,} puzzles)")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2))

    total = sum(len(v) for v in out.values())
    console.print(f"scanned {scanned:,} puzzles → [green]{total}[/] examples across {len(out)} concepts")
    if thin:
        console.print("[yellow]under-filled concepts (loosen the band or gates):[/]")
        for line in thin:
            console.print(f"  {line}")
    console.print(f"[green]wrote[/] {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
