"""Machine-checkable claims about example positions.

The hand-authored positions in `library/positions.yaml` were written from
knowledge, which is exactly the kind of content that looks right and is subtly
wrong — a FEN that is legal and plausible but does not actually contain the
feature it is supposed to teach. Every authored example therefore carries
`assert` claims, and this module decides whether they hold.

The structural checks (isolated pawn, outpost, open file, …) are the valuable
ones: they verify the *teaching claim*, not merely that the position is legal.
Engine checks cover the evaluative claims.
"""

from __future__ import annotations

from dataclasses import dataclass

import chess
import chess.engine

FILES = "abcdefgh"

# A "decisive" evaluation. Deliberately generous: these are teaching positions,
# and the claim being checked is "this side is winning", not a precise score.
WIN_CP = 200
DRAW_CP = 80


@dataclass
class Failure:
    claim: str
    detail: str


def _colour(name: str) -> chess.Color:
    if name not in ("white", "black"):
        raise ValueError(f"colour must be 'white' or 'black', got {name!r}")
    return chess.WHITE if name == "white" else chess.BLACK


def _pawns_on_file(board: chess.Board, colour: chess.Color, file_index: int) -> list[int]:
    return [
        sq
        for sq in board.pieces(chess.PAWN, colour)
        if chess.square_file(sq) == file_index
    ]


def check_isolated_pawn(board: chess.Board, colour: str, square: str) -> Failure | None:
    """A pawn of `colour` on `square` with no friendly pawn on an adjacent file."""
    col = _colour(colour)
    sq = chess.parse_square(square)
    piece = board.piece_at(sq)
    if piece is None or piece.piece_type != chess.PAWN or piece.color != col:
        return Failure("isolated_pawn", f"no {colour} pawn on {square}")
    file_index = chess.square_file(sq)
    for neighbour in (file_index - 1, file_index + 1):
        if 0 <= neighbour <= 7 and _pawns_on_file(board, col, neighbour):
            return Failure(
                "isolated_pawn",
                f"{colour} still has a pawn on the {FILES[neighbour]}-file, so {square} is not isolated",
            )
    return None


def check_doubled_pawns(board: chess.Board, colour: str, file: str) -> Failure | None:
    col = _colour(colour)
    pawns = _pawns_on_file(board, col, FILES.index(file))
    if len(pawns) < 2:
        return Failure(
            "doubled_pawns", f"{colour} has {len(pawns)} pawn(s) on the {file}-file, not 2+"
        )
    return None


def check_open_file(board: chess.Board, file: str) -> Failure | None:
    """No pawns of either colour."""
    idx = FILES.index(file)
    white = _pawns_on_file(board, chess.WHITE, idx)
    black = _pawns_on_file(board, chess.BLACK, idx)
    if white or black:
        return Failure(
            "open_file",
            f"{file}-file still has pawns (white: {len(white)}, black: {len(black)})",
        )
    return None


def check_half_open_file(board: chess.Board, colour: str, file: str) -> Failure | None:
    """`colour` has no pawns on the file (so their rooks look down it)."""
    col = _colour(colour)
    pawns = _pawns_on_file(board, col, FILES.index(file))
    if pawns:
        return Failure(
            "half_open_file", f"{colour} still has a pawn on the {file}-file"
        )
    return None


def check_bishop_pair(board: chess.Board, colour: str) -> Failure | None:
    col = _colour(colour)
    mine = len(board.pieces(chess.BISHOP, col))
    theirs = len(board.pieces(chess.BISHOP, not col))
    if mine < 2:
        return Failure("bishop_pair", f"{colour} has {mine} bishop(s), not 2")
    if theirs >= 2:
        return Failure("bishop_pair", f"both sides have the pair ({colour} {mine}, other {theirs})")
    return None


def check_outpost(board: chess.Board, colour: str, square: str) -> Failure | None:
    """A knight of `colour` on `square` that no enemy pawn could ever attack.

    "Ever" is the operative word: an enemy pawn attacks the square only from the
    two files beside it, and only from behind it in its own direction of travel.
    A pawn that has already advanced past that rank can never come back.
    """
    col = _colour(colour)
    sq = chess.parse_square(square)
    piece = board.piece_at(sq)
    if piece is None or piece.piece_type != chess.KNIGHT or piece.color != col:
        return Failure("outpost", f"no {colour} knight on {square}")

    file_index, rank = chess.square_file(sq), chess.square_rank(sq)
    for neighbour in (file_index - 1, file_index + 1):
        if not 0 <= neighbour <= 7:
            continue
        for enemy_pawn in _pawns_on_file(board, not col, neighbour):
            enemy_rank = chess.square_rank(enemy_pawn)
            # A black pawn attacks downward, so it threatens the square if it is
            # still above it; a white pawn threatens it from below.
            can_reach = enemy_rank > rank if col == chess.WHITE else enemy_rank < rank
            if can_reach:
                return Failure(
                    "outpost",
                    f"enemy pawn on {chess.square_name(enemy_pawn)} can still attack {square}",
                )
    return None


def check_passed_pawn(board: chess.Board, colour: str, square: str) -> Failure | None:
    col = _colour(colour)
    sq = chess.parse_square(square)
    piece = board.piece_at(sq)
    if piece is None or piece.piece_type != chess.PAWN or piece.color != col:
        return Failure("passed_pawn", f"no {colour} pawn on {square}")

    file_index, rank = chess.square_file(sq), chess.square_rank(sq)
    for neighbour in (file_index - 1, file_index, file_index + 1):
        if not 0 <= neighbour <= 7:
            continue
        for blocker in _pawns_on_file(board, not col, neighbour):
            blocker_rank = chess.square_rank(blocker)
            ahead = blocker_rank > rank if col == chess.WHITE else blocker_rank < rank
            if ahead:
                return Failure(
                    "passed_pawn",
                    f"enemy pawn on {chess.square_name(blocker)} still blocks or guards the path",
                )
    return None


def check_backward_pawn(board: chess.Board, colour: str, square: str) -> Failure | None:
    """A pawn with no friendly pawn beside it that is level or further back.

    That is what "left behind" means: its neighbours have advanced past it, so
    none of them can ever drop back to defend it.
    """
    col = _colour(colour)
    sq = chess.parse_square(square)
    piece = board.piece_at(sq)
    if piece is None or piece.piece_type != chess.PAWN or piece.color != col:
        return Failure("backward_pawn", f"no {colour} pawn on {square}")

    file_index, rank = chess.square_file(sq), chess.square_rank(sq)
    for neighbour in (file_index - 1, file_index + 1):
        if not 0 <= neighbour <= 7:
            continue
        for friend in _pawns_on_file(board, col, neighbour):
            friend_rank = chess.square_rank(friend)
            behind_or_level = friend_rank <= rank if col == chess.WHITE else friend_rank >= rank
            if behind_or_level:
                return Failure(
                    "backward_pawn",
                    f"friendly pawn on {chess.square_name(friend)} can still support {square}",
                )
    return None


def check_side_to_move(board: chess.Board, colour: str) -> Failure | None:
    actual = "white" if board.turn == chess.WHITE else "black"
    if actual != colour:
        return Failure("side_to_move", f"{actual} to move, expected {colour}")
    return None


def check_eval(
    board: chess.Board, engine: chess.engine.SimpleEngine, expected: str, depth: int = 18
) -> Failure | None:
    """Ask the engine whether the claimed evaluation holds."""
    info = engine.analyse(board, chess.engine.Limit(depth=depth))
    score = info["score"].white()
    cp = score.score(mate_score=10_000)
    if cp is None:
        return Failure("eval", "engine returned no score")

    verdicts = {
        "win_white": cp >= WIN_CP,
        "win_black": cp <= -WIN_CP,
        "draw": abs(cp) <= DRAW_CP,
        "equalish": abs(cp) <= WIN_CP,
    }
    if expected not in verdicts:
        return Failure("eval", f"unknown expectation {expected!r}")
    if not verdicts[expected]:
        return Failure("eval", f"engine says {cp:+d}cp (white POV), which is not {expected}")
    return None


def check_best_move(
    board: chess.Board, engine: chess.engine.SimpleEngine, expected_san: str, depth: int = 18
) -> Failure | None:
    info = engine.analyse(board, chess.engine.Limit(depth=depth))
    pv = info.get("pv")
    if not pv:
        return Failure("best_move", "engine returned no principal variation")
    actual = board.san(pv[0])
    if actual != expected_san:
        return Failure("best_move", f"engine prefers {actual}, not {expected_san}")
    return None


def run(
    board: chess.Board, claims: dict, engine: chess.engine.SimpleEngine
) -> list[Failure]:
    """Evaluate every claim, returning the ones that failed."""
    failures: list[Failure] = []
    for name, value in claims.items():
        if name == "side_to_move":
            failure = check_side_to_move(board, value)
        elif name == "eval":
            failure = check_eval(board, engine, value)
        elif name == "best_move":
            failure = check_best_move(board, engine, value)
        elif name == "isolated_pawn":
            failure = check_isolated_pawn(board, value["color"], value["square"])
        elif name == "doubled_pawns":
            failure = check_doubled_pawns(board, value["color"], value["file"])
        elif name == "open_file":
            failure = check_open_file(board, value)
        elif name == "half_open_file":
            failure = check_half_open_file(board, value["color"], value["file"])
        elif name == "bishop_pair":
            failure = check_bishop_pair(board, value)
        elif name == "outpost":
            failure = check_outpost(board, value["color"], value["square"])
        elif name == "passed_pawn":
            failure = check_passed_pawn(board, value["color"], value["square"])
        elif name == "backward_pawn":
            failure = check_backward_pawn(board, value["color"], value["square"])
        else:
            failure = Failure(name, "unknown assertion type")
        if failure:
            failures.append(failure)
    return failures
