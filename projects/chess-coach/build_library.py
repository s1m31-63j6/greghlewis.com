"""Assemble and verify the tactics & strategy library.

    uv run python build_library.py            # verify everything, write library.json
    uv run python build_library.py --strict   # also fail the build on any bad example

Inputs
  library/concepts.yaml      the 44 concepts and their teaching prose
  library/positions.yaml     hand-authored example positions + claims
  data/selected_puzzles.json examples pulled from the Lichess DB by theme

Output
  public/chess-coach/library.json

Nothing reaches the output unverified. Lichess examples are replayed move by
move; authored examples must additionally satisfy every `assert` claim they
carry (see verify.py). A failing example is dropped and reported — an example
that quietly teaches the wrong thing is worse than a missing one.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

import chess
import chess.engine
import yaml
from rich.console import Console
from rich.table import Table

import verify

console = Console()

HERE = Path(__file__).parent
CONCEPTS = HERE / "library" / "concepts.yaml"
POSITIONS = HERE / "library" / "positions.yaml"
PUZZLES = HERE / "data" / "selected_puzzles.json"
OUT = HERE.parents[1] / "public" / "chess-coach" / "library.json"


def board_from(example: dict) -> tuple[chess.Board, list[str]]:
    """Build the position, from a FEN or by replaying SAN from the start.

    Returns the board and the SAN move list (empty for a literal FEN). Raises on
    anything illegal, which is the point of specifying positions by moves.
    """
    if "fen" in example:
        board = chess.Board(example["fen"])
        if not board.is_valid():
            raise ValueError(f"illegal position: {example['fen']}")
        return board, []

    board = chess.Board()
    moves = example["moves"].split()
    for san in moves:
        board.push_san(san)  # raises ValueError on an illegal move
    return board, moves


def verify_puzzle(example: dict) -> str | None:
    """Replay a Lichess example. Returns an error string, or None if sound."""
    board = chess.Board(example["fen"])
    if not board.is_valid():
        return "illegal position"
    for uci in example["solution_uci"]:
        move = chess.Move.from_uci(uci)
        if move not in board.legal_moves:
            return f"illegal solution move {uci}"
        board.push(move)
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--strict", action="store_true", help="exit non-zero if any example fails"
    )
    parser.add_argument("--depth", type=int, default=18, help="engine depth for eval claims")
    args = parser.parse_args()

    engine_path = shutil.which("stockfish")
    if not engine_path:
        console.print("[red]stockfish not found[/] — `brew install stockfish`")
        return 1

    concepts = yaml.safe_load(CONCEPTS.read_text())
    authored = {entry["slug"]: entry["examples"] for entry in yaml.safe_load(POSITIONS.read_text())}
    puzzles = json.loads(PUZZLES.read_text()) if PUZZLES.exists() else {}

    engine = chess.engine.SimpleEngine.popen_uci(engine_path)
    engine.configure({"Threads": 1, "Hash": 128})

    out_concepts = []
    problems: list[tuple[str, str, str]] = []
    counts = {"lichess": 0, "authored": 0}

    try:
        for concept in concepts:
            slug = concept["slug"]
            examples: list[dict] = []

            if concept["source"] == "lichess":
                for example in puzzles.get(slug, []):
                    error = verify_puzzle(example)
                    if error:
                        problems.append((slug, example["puzzle_id"], error))
                        continue
                    examples.append({**example, "kind": "puzzle"})
                    counts["lichess"] += 1
            else:
                for index, example in enumerate(authored.get(slug, [])):
                    label = f"authored[{index}]"
                    try:
                        board, moves = board_from(example)
                    except ValueError as cause:
                        problems.append((slug, label, str(cause)))
                        continue

                    failures = verify.run(board, example.get("assert", {}), engine)
                    if failures:
                        for failure in failures:
                            problems.append((slug, label, f"{failure.claim}: {failure.detail}"))
                        continue

                    examples.append(
                        {
                            "kind": "position",
                            "fen": board.fen(),
                            "moves_san": moves,
                            "caption": " ".join(example["caption"].split()),
                        }
                    )
                    counts["authored"] += 1

            out_concepts.append(
                {
                    "slug": slug,
                    "name": concept["name"],
                    "category": concept["category"],
                    "one_liner": concept["one_liner"],
                    "teaching": concept["teaching"].strip(),
                    "source": concept["source"],
                    "examples": examples,
                }
            )
    finally:
        engine.quit()

    table = Table(title="Library", title_justify="left")
    table.add_column("category")
    table.add_column("concepts", justify="right")
    table.add_column("examples", justify="right")
    table.add_column("no examples", justify="right")
    for category in ("tactics", "endgame", "strategy"):
        rows = [c for c in out_concepts if c["category"] == category]
        table.add_row(
            category,
            str(len(rows)),
            str(sum(len(c["examples"]) for c in rows)),
            str(sum(1 for c in rows if not c["examples"])),
        )
    console.print(table)
    console.print(
        f"{counts['lichess']} puzzle example(s) from Lichess, "
        f"{counts['authored']} hand-authored position(s)\n"
    )

    if problems:
        console.print(f"[yellow]{len(problems)} example(s) rejected:[/]")
        for slug, label, detail in problems:
            console.print(f"  [red]✗[/] {slug} {label} — {detail}")
        console.print()

    empty = [c["slug"] for c in out_concepts if not c["examples"]]
    if empty:
        console.print(f"[yellow]concepts with no examples:[/] {', '.join(empty)}\n")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "_note": (
                    "Generated by projects/chess-coach/build_library.py. Puzzle examples "
                    "are from the Lichess puzzle database (CC0). Every example is machine "
                    "verified; do not hand-edit."
                ),
                "concepts": out_concepts,
            },
            indent=2,
        )
    )
    console.print(f"[green]wrote[/] {OUT}")

    if args.strict and (problems or empty):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
