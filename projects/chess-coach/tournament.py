"""Round-robin self-play tournament.

Measures the relative strength of a set of players by playing them against each
other. The players are a sweep across the weakening curve (`s = 0 .. 1`) plus a
few of Stockfish's own `UCI_Elo` settings, which serve as anchors to put the
resulting scale into Elo units (see `rating.py`).

Design notes worth keeping in mind if you change this:

- **Anchors are not ground truth.** They are included so the fitted scale has
  *some* external reference, but `UCI_Elo` labels are themselves only loosely
  calibrated. `rating.py` reports the residual of every anchor against its
  nominal label, which is the honest way to show how much to trust the anchoring.

- **Each worker owns three engine processes**: one per player plus a referee.
  The referee is needed because the playing engines may be configured with
  `UCI_LimitStrength`, so neither of them can be trusted to adjudicate.

- **Games are void, not defaulted, on engine failure.** Over a multi-hour run a
  subprocess will occasionally die. Recording a void and reporting the count is
  honest; silently scoring it as a draw would quietly bias the fit.
"""

from __future__ import annotations

import json
import multiprocessing as mp
import random
from dataclasses import asdict, dataclass
from itertools import combinations
from pathlib import Path

import chess
import chess.engine
from rich.console import Console
from rich.progress import BarColumn, Progress, TaskProgressColumn, TextColumn, TimeRemainingColumn

import openings
from weakening import MULTIPV, family_fingerprint, params_for, select_move

console = Console()

# Anchors play at a fixed short time control. `UCI_LimitStrength` is designed
# around real time controls, not depth caps, so giving it a depth limit instead
# would be measuring something other than what the option means.
ANCHOR_MOVETIME = 0.05

# Adjudication: past this ply, probe every `ADJUDICATE_EVERY` plies and stop the
# game once one side is decisively winning on two consecutive probes. Without
# this, the weakest rungs shuffle pieces until the ply cap and produce a pile of
# draws that say nothing about relative strength.
#
# Depth 8, not 12: `bench.py` measures a cold probe at ~1.5 ms (depth 8) against
# ~11 ms (depth 10) and ~11 ms (depth 12), and a 15-pawn threshold does not need
# a deep search to be confident.
#
# Careful reading bench.py numbers here: probe cost is very sensitive to
# transposition-table warmth, so a probe benchmarked right after other searches
# of the same position looks several times cheaper than it really is. The referee
# is a separate process with a cold table, so the cold figures are the ones that
# apply.
ADJUDICATE_AFTER = 80
ADJUDICATE_EVERY = 20
ADJUDICATE_CP = 1500
ADJUDICATE_DEPTH = 8
MAX_PLIES = 300

_ENGINES: dict[str, chess.engine.SimpleEngine] = {}


@dataclass(frozen=True)
class Player:
    """One competitor: either a point on our weakening curve, or a Stockfish anchor."""

    id: str
    kind: str  # "sampler" | "anchor"
    s: float | None = None
    uci_elo: int | None = None

    def to_json(self) -> dict:
        return asdict(self)


def _init_worker(engine_path: str) -> None:
    """Spin up this worker's three engine processes once, and reuse them."""
    for slot in ("white", "black", "referee"):
        engine = chess.engine.SimpleEngine.popen_uci(engine_path)
        engine.configure({"Threads": 1, "Hash": 64})
        _ENGINES[slot] = engine
    _ENGINES["referee"].configure({"UCI_LimitStrength": False})


def _configure(engine: chess.engine.SimpleEngine, player: Player) -> None:
    """Point an engine process at one player's strength setting.

    Do NOT set `MultiPV` here. python-chess treats it as a *managed* option and
    raises `EngineError: cannot set MultiPV which is automatically managed` --
    it sets MultiPV itself from the `multipv=` argument to `analyse()`. Setting
    it by hand is not a slow path or a warning, it fails every call.

    (That failure is also unusually nasty to diagnose: raised inside a pool
    worker, python-chess's background engine threads keep the worker process
    alive, so the symptom is the whole tournament hanging rather than a
    traceback. Hence `_smoke_configure` below, which surfaces it at startup.)
    """
    if player.kind == "anchor":
        engine.configure({"UCI_LimitStrength": True, "UCI_Elo": player.uci_elo})
    else:
        engine.configure({"UCI_LimitStrength": False})


def _smoke_configure(engine_path: str) -> None:
    """Fail loudly, in the parent, if the engine rejects our option set.

    Cheap insurance against the whole class of bug above: a misconfiguration
    that only manifests as a stalled pool an hour into a run.
    """
    engine = chess.engine.SimpleEngine.popen_uci(engine_path)
    try:
        engine.configure({"Threads": 1, "Hash": 64})
        _configure(engine, Player(id="probe", kind="anchor", uci_elo=1320))
        _configure(engine, Player(id="probe", kind="sampler", s=0.5))
        engine.analyse(chess.Board(), chess.engine.Limit(depth=1), multipv=MULTIPV)
    finally:
        engine.quit()


def _move(
    engine: chess.engine.SimpleEngine,
    board: chess.Board,
    player: Player,
    rng: random.Random,
) -> chess.Move:
    if player.kind == "anchor":
        result = engine.play(board, chess.engine.Limit(time=ANCHOR_MOVETIME))
        return result.move if result.move else rng.choice(list(board.legal_moves))
    return select_move(engine, board, params_for(player.s), rng)


def _adjudicate(board: chess.Board) -> float | None:
    """Return a decisive score from White's perspective, or None to keep playing."""
    info = _ENGINES["referee"].analyse(board, chess.engine.Limit(depth=ADJUDICATE_DEPTH))
    score = info["score"].white().score(mate_score=10_000)
    if score is None:
        return None
    if score >= ADJUDICATE_CP:
        return 1.0
    if score <= -ADJUDICATE_CP:
        return 0.0
    return None


def _play_game(white: Player, black: Player, opening_index: int, seed: int) -> float | None:
    """Play one game. Returns White's score (1.0 / 0.5 / 0.0), or None if void."""
    rng = random.Random(seed)
    board = openings.starting_board(opening_index)

    # Verdict from the previous probe. Adjudication requires two consecutive
    # probes agreeing, so a single deep tactical spike neither player can see
    # doesn't end a game they would have gone on to draw.
    previous: float | None = None

    try:
        _configure(_ENGINES["white"], white)
        _configure(_ENGINES["black"], black)

        while not board.is_game_over(claim_draw=True) and board.ply() < MAX_PLIES:
            player = white if board.turn == chess.WHITE else black
            engine = _ENGINES["white"] if board.turn == chess.WHITE else _ENGINES["black"]
            board.push(_move(engine, board, player, rng))

            if board.ply() > ADJUDICATE_AFTER and board.ply() % ADJUDICATE_EVERY == 0:
                verdict = _adjudicate(board)
                if verdict is not None and verdict == previous:
                    return verdict
                previous = verdict
    except (chess.engine.EngineError, chess.engine.EngineTerminatedError):
        return None

    if board.is_game_over(claim_draw=True):
        outcome = board.outcome(claim_draw=True)
        if outcome is None or outcome.winner is None:
            return 0.5
        return 1.0 if outcome.winner == chess.WHITE else 0.0

    # Hit the ply cap with neither side decisively winning: a genuine draw for
    # rating purposes, and a signal that both players are too weak to convert.
    return 0.5


def _run_task(task: tuple[Player, Player, int, int]) -> tuple[str, str, float | None]:
    white, black, opening_index, seed = task
    return white.id, black.id, _play_game(white, black, opening_index, seed)


def build_schedule(
    players: list[Player], rounds: int, book_size: int | None = None
) -> list[tuple[Player, Player, int, int]]:
    """Every pair plays every opening twice per round, once with each colour.

    `book_size` trims the opening book, which is only for smoke runs — a short
    book correlates games and understates the true uncertainty.
    """
    n_openings = min(book_size or len(openings.OPENINGS), len(openings.OPENINGS))
    tasks: list[tuple[Player, Player, int, int]] = []
    seed = 0
    for a, b in combinations(players, 2):
        for _ in range(rounds):
            for opening_index in range(n_openings):
                tasks.append((a, b, opening_index, seed))
                seed += 1
                tasks.append((b, a, opening_index, seed))
                seed += 1
    return tasks


def run(
    players: list[Player],
    rounds: int,
    engine_path: str,
    workers: int,
    out_path: Path,
    book_size: int | None = None,
) -> dict:
    """Play the full schedule and write raw pairing results to `out_path`."""
    # Verify the engine accepts our options before committing to hours of work.
    _smoke_configure(engine_path)

    tasks = build_schedule(players, rounds, book_size)
    # `score[(a, b)]` accumulates a's points against b, over both colours.
    score: dict[tuple[str, str], float] = {}
    played: dict[tuple[str, str], int] = {}
    voids = 0

    n_openings = min(book_size or len(openings.OPENINGS), len(openings.OPENINGS))
    console.print(
        f"[bold]{len(players)} players[/bold] · {len(tasks):,} games · "
        f"{workers} workers · {rounds} round(s) of {n_openings} openings"
    )

    ctx = mp.get_context("spawn")
    with ctx.Pool(workers, initializer=_init_worker, initargs=(engine_path,)) as pool, Progress(
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        TextColumn("{task.completed:,}/{task.total:,}"),
        TimeRemainingColumn(),
        console=console,
    ) as progress:
        bar = progress.add_task("playing", total=len(tasks))
        for white_id, black_id, result in pool.imap_unordered(_run_task, tasks, chunksize=4):
            progress.advance(bar)
            if result is None:
                voids += 1
                continue
            for key, points in (
                ((white_id, black_id), result),
                ((black_id, white_id), 1.0 - result),
            ):
                score[key] = score.get(key, 0.0) + points
                played[key] = played.get(key, 0) + 1

    if voids:
        console.print(f"[yellow]{voids} void game(s) — engine failures, excluded from the fit[/]")

    payload = {
        "players": [p.to_json() for p in players],
        # Identifies the parameter family these games measured; calibrate.py
        # refuses to refit results produced by a different one.
        "family": family_fingerprint(),
        "rounds": rounds,
        "openings": n_openings,
        "voids": voids,
        "pairings": [
            {"a": a, "b": b, "score_a": score[(a, b)], "games": played[(a, b)]}
            for (a, b) in sorted(score)
        ],
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2))
    console.print(f"[green]wrote[/] {out_path}")
    return payload
