"""Human-like engine weakening.

The problem this file exists to solve:

Stockfish ships two ways to play below full strength, and neither one covers
what a difficulty dial actually needs.

  1. `UCI_LimitStrength` + `UCI_Elo` bottoms out at **UCI_Elo 1320**. It cannot
     represent the bottom half of a 600-2200 dial at all. There is no option
     value that means "play like a beginner".

  2. `Skill Level` (0-20) does go lower, but it weakens by injecting occasional
     catastrophic blunders into otherwise near-perfect play. That is *weaker*,
     not *more human*. A 700-rated human plays consistently mediocre moves; they
     do not alternate between grandmaster technique and hanging a queen.

So we build our own. Three levers, all applied on top of a MultiPV analysis:

  - **Search horizon** — cap depth, emulating how far ahead a human at that
    level actually calculates. This is what makes weak play *look* weak in the
    right way: missed tactics rather than random moves.

  - **Move sampling** — of the candidate moves within `band_cp` of the best,
    sample softmax-weighted by how much worse each one is. A wide temperature
    means "this player can't reliably tell a good move from a slightly worse
    one," which is the actual cognitive limitation being modelled.

  - **Blunder rate** — a small calibrated probability of stepping outside the
    band entirely. Humans do blunder; the claim is only that they don't blunder
    at the frequency `Skill Level` implies.

All three are driven by a **single scalar `s` in [0, 1]** (see `params_for`).
That is the design decision that makes calibration tractable: instead of tuning
32 free parameters against 8 rating targets, we measure strength as a function
of one variable, fit the curve, and invert it. It also means the calibration
curve on the methodology page is a real 1-D relationship rather than a
scatterplot of hand-tuned points.

Nothing here is deployed. This module defines the move-selection policy; the TS
port in the browser (`src/app/projects/chess-coach/engine/`) reimplements the
same policy against Stockfish WASM, reading the calibrated `s` values out of
`ladder.json`.
"""

from __future__ import annotations

import hashlib
import math
import random
from collections.abc import Callable
from dataclasses import asdict, dataclass

import chess
import chess.engine

# Mate scores get folded into centipawns so the sampler has a single ordering to
# work with. 10000 is far outside any real evaluation, so a mate always sorts
# above any material advantage, and mate-in-2 above mate-in-5.
MATE_SCORE = 10_000

# How many candidate moves to ask Stockfish for. Needs to be wide enough that a
# weak rung still has real choices inside its band, and wide enough that the
# blunder branch has somewhere to go.
#
# `bench.py` says width is close to free relative to depth (at depth 8, MultiPV
# 1 -> 12 barely moves the needle, and the ordering is inside the noise), so this
# is set by what the sampler needs rather than by cost.
#
# Raised 8 -> 12 after the first calibration run: the weakest setting measured
# 744 Elo and could not reach the 600 rung. With only 8 candidates, even a
# near-uniform choice is a choice among the engine's eight best moves, which
# puts a hard floor under how badly the policy can play. More candidates lowers
# that floor. Barely affects the strong end, where a narrow band filters the
# extra candidates out anyway.
MULTIPV = 12

# Depth ceiling at s = 1.0. This is a measured constraint, not a taste call:
# per-move cost explodes past depth 8 (bench.py, middlegame positions,
# single-threaded) --
#
#     depth 5 -> 12 ms | depth 8 -> 57 ms | depth 12 -> 901 ms
#
# A depth-12 ceiling would make the calibration tournament a multi-day run for no
# benefit, because the top rung is only 2200 Elo and Stockfish at depth 8 is
# already far stronger than that. At the top of our range, strength is set by the
# sampling noise, not by the search horizon -- so spending the search budget
# there buys nothing. Eight also happens to be a defensible model of a strong
# club player's calculation: about four moves ahead.
MAX_DEPTH = 8


@dataclass(frozen=True)
class Params:
    """Move-selection parameters at one point on the strength curve."""

    depth: int
    band_cp: float
    temperature_cp: float
    blunder_rate: float

    def to_json(self) -> dict:
        return asdict(self)


def params_for(s: float) -> Params:
    """Map a single strength scalar in [0, 1] onto the four sampling parameters.

    The shapes are chosen so that strength rises smoothly and monotonically, and
    so that the weak end is genuinely weak rather than merely noisy:

    - `depth` uses an exponent > 1 so the low end stays shallow across a decent
      stretch of `s`. Depth 1-2 is where "doesn't see the fork" lives, and that
      is most of the dial's useful range for a learner. It tops out at
      `MAX_DEPTH` for the cost reason documented there.
    - `band_cp` and `temperature_cp` decay together on the same exponential.
      Keeping them proportional means the *shape* of the choice distribution is
      scale-free: a rung considers moves within some window, and is confused
      within that window in proportion to its width.
    - `blunder_rate` decays faster than the others. Outright blunders should
      disappear from the higher rungs well before the search horizon maxes out.

    Constants here are the starting point for calibration, not the result of it.
    `calibrate.py` measures what each `s` actually plays like and inverts the
    curve; these only need to be monotone and to span a wide enough range.

    "Wide enough" is not a guess — it is a measured constraint. The first
    calibration run over 25,344 games produced a curve of 744..2322 Elo, which
    failed the coverage check because the 600 rung sits below the floor. The
    decay coefficients below were re-fitted to drop the weak end well under 600
    while leaving the strong end where it was: each constant is chosen so that
    its value at s = 1 is unchanged from that run (band 38, temperature 19,
    blunder 0.008).

    The re-run confirmed it: the curve now spans **420..2257 Elo**, covering
    every rung from 600 to 2200 with headroom at both ends, monotone throughout,
    and with 95% intervals of 19-33 Elo.
    """
    if not 0.0 <= s <= 1.0:
        raise ValueError(f"strength scalar must be in [0, 1], got {s}")

    return Params(
        depth=round(1 + (MAX_DEPTH - 1) * s**1.6),
        band_cp=1200 * math.exp(-3.44 * s),
        temperature_cp=600 * math.exp(-3.44 * s),
        blunder_rate=0.45 * math.exp(-4.03 * s),
    )


def family_fingerprint() -> str:
    """A short hash identifying this exact parameter family.

    Recorded alongside tournament results so a refit can tell whether the
    measured curve still describes the policy in the code. Without it,
    `calibrate.py --from-results` would happily fit an old curve and then stamp
    the rungs with today's `params_for()` — a ladder whose parameters were never
    measured, and which looks completely legitimate.
    """
    parts = [f"multipv={MULTIPV}", f"max_depth={MAX_DEPTH}"]
    for s in (0.0, 0.25, 0.5, 0.75, 1.0):
        p = params_for(s)
        parts.append(
            f"{s}:{p.depth}:{p.band_cp:.4f}:{p.temperature_cp:.4f}:{p.blunder_rate:.6f}"
        )
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:12]


def _cp(score: chess.engine.PovScore, board: chess.Board) -> float:
    """Evaluation in centipawns from the side-to-move's point of view."""
    return score.pov(board.turn).score(mate_score=MATE_SCORE)


def candidates(
    engine: chess.engine.SimpleEngine, board: chess.Board, params: Params
) -> list[tuple[chess.Move, float]]:
    """Analyse the position and return (move, centipawns) best-first.

    Centipawns are always from the side-to-move's perspective, so larger is
    better for the player about to move regardless of colour.
    """
    infos = engine.analyse(
        board,
        chess.engine.Limit(depth=params.depth),
        multipv=MULTIPV,
    )

    scored: list[tuple[chess.Move, float]] = []
    for info in infos:
        pv = info.get("pv")
        score = info.get("score")
        if not pv or score is None:
            continue
        scored.append((pv[0], _cp(score, board)))

    scored.sort(key=lambda pair: pair[1], reverse=True)
    return scored


def _sample(items: list, weights: list[float], draw: float):
    """Weighted choice driven by a single uniform draw in [0, 1).

    Deliberately hand-rolled rather than `random.choices`: the browser port in
    `src/app/projects/chess-coach/engine/weakening.ts` has to make the *same*
    choice given the same random stream, and that is only checkable if both
    implementations consume exactly one draw here and walk the cumulative
    weights the same way. `parity_test.py` asserts it.
    """
    total = sum(weights)
    if not total > 0:
        return items[0]
    r = draw * total
    for item, weight in zip(items, weights):
        r -= weight
        if r <= 0:
            return item
    return items[-1]


def choose_from(
    scored: list[tuple[chess.Move, float]],
    params: Params,
    draw: Callable[[], float],
) -> chess.Move | None:
    """The move-selection policy itself, as a pure function.

    Split out from `select_move` so it can be tested against the TypeScript port
    without an engine in the loop. `scored` must be best-first, centipawns
    relative to the side to move. `draw` returns uniforms in [0, 1).
    """
    if not scored:
        return None

    best_cp = scored[0][1]

    # Blunder branch: ignore the band and pick from the moves the player *should*
    # have rejected. Weighted toward the least-bad of them, because even a
    # blundering human is usually not choosing the single worst move on the
    # board — they are missing one specific idea.
    if draw() < params.blunder_rate:
        outside = [(m, cp) for m, cp in scored if cp < best_cp - params.band_cp]
        if outside:
            weights = [1.0 / (i + 1) for i in range(len(outside))]
            return _sample([m for m, _ in outside], weights, draw())

    # Normal branch: softmax over everything inside the band. A move `d`
    # centipawns worse than best is exp(-d / temperature) times as likely, so the
    # temperature is literally "how many centipawns of error this player can't
    # perceive".
    inside = [(m, cp) for m, cp in scored if cp >= best_cp - params.band_cp]
    if not inside:
        return scored[0][0]

    temperature = max(params.temperature_cp, 1.0)
    weights = [math.exp(-(best_cp - cp) / temperature) for _, cp in inside]
    return _sample([m for m, _ in inside], weights, draw())


def select_move(
    engine: chess.engine.SimpleEngine,
    board: chess.Board,
    params: Params,
    rng: random.Random,
) -> chess.Move:
    """Analyse the position and pick a move at the given strength.

    Falls back to a legal move in the pathological case of no MultiPV output
    rather than raising, because a tournament of tens of thousands of games
    should not die on one degenerate position.
    """
    move = choose_from(candidates(engine, board, params), params, rng.random)
    return move if move is not None else rng.choice(list(board.legal_moves))
