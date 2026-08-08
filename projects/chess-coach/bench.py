"""Where does tournament time actually go?

Run this before changing any performance constant in `weakening.py` or
`tournament.py`. The calibration run is tens of thousands of games, so a guess
about the bottleneck that is off by 5x is the difference between an overnight
run and a week.

    uv run python bench.py
"""

from __future__ import annotations

import random
import shutil
import time

import chess
import chess.engine

import openings
from weakening import MULTIPV, params_for, select_move

ENGINE = shutil.which("stockfish") or "stockfish"
SAMPLE_S = [0.0, 0.25, 0.5, 0.75, 1.0]
MOVES = 20


def bench_moves(engine: chess.engine.SimpleEngine) -> None:
    """Per-move cost across the strength curve, at MultiPV as configured."""
    print(f"per-move cost (MultiPV={MULTIPV}, {MOVES} moves each)")
    print(f"{'s':>6} {'depth':>6} {'ms/move':>9}")
    rng = random.Random(0)
    for s in SAMPLE_S:
        params = params_for(s)
        board = openings.starting_board(0)
        start = time.perf_counter()
        for _ in range(MOVES):
            if board.is_game_over():
                break
            board.push(select_move(engine, board, params, rng))
        elapsed = (time.perf_counter() - start) / MOVES * 1000
        print(f"{s:>6.2f} {params.depth:>6} {elapsed:>9.1f}")


def bench_protocol(engine: chess.engine.SimpleEngine) -> None:
    """Fixed UCI round-trip cost, isolated from search cost.

    A depth-1 MultiPV-1 analyse does essentially no searching, so whatever this
    costs is protocol and process overhead — the floor under every move.
    """
    board = openings.starting_board(0)
    start = time.perf_counter()
    for _ in range(50):
        engine.analyse(board, chess.engine.Limit(depth=1), multipv=1)
    print(f"\nUCI round-trip floor: {(time.perf_counter() - start) / 50 * 1000:.2f} ms/call")


def bench_multipv(engine: chess.engine.SimpleEngine) -> None:
    """How much MultiPV width costs at the top of the curve."""
    board = openings.starting_board(0)
    depth = params_for(1.0).depth
    print(f"\nMultiPV width cost at depth {depth}")
    for width in (1, 4, 6, 8, 12):
        start = time.perf_counter()
        for _ in range(10):
            engine.analyse(board, chess.engine.Limit(depth=depth), multipv=width)
        print(f"  MultiPV {width:>2}: {(time.perf_counter() - start) / 10 * 1000:>7.1f} ms")


def bench_adjudication(engine: chess.engine.SimpleEngine) -> None:
    print("\nadjudication probe cost")
    board = openings.starting_board(0)
    for depth in (8, 10, 12):
        start = time.perf_counter()
        for _ in range(10):
            engine.analyse(board, chess.engine.Limit(depth=depth))
        print(f"  depth {depth:>2}: {(time.perf_counter() - start) / 10 * 1000:>7.1f} ms")


def main() -> None:
    engine = chess.engine.SimpleEngine.popen_uci(ENGINE)
    engine.configure({"Threads": 1, "Hash": 64})
    try:
        bench_protocol(engine)
        bench_moves(engine)
        bench_multipv(engine)
        bench_adjudication(engine)
    finally:
        engine.quit()


if __name__ == "__main__":
    main()
