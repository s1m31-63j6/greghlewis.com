"""Opening book for the calibration tournament.

Why a book at all: without one, every game starts from the same position and the
weak rungs in particular produce heavily correlated games. Correlated games
inflate the apparent precision of the rating fit — you get tight confidence
intervals that are measuring the opening, not the players.

Sixteen mainstream openings, each played twice per round with colours reversed,
so the book contributes no colour bias to any pairing.

Lines are deliberately short (4-10 plies). Long book lines would hide exactly
the phase of the game where weak play is most visible.
"""

from __future__ import annotations

import chess

# (name, UCI move sequence)
_BOOK: list[tuple[str, str]] = [
    ("Ruy Lopez", "e2e4 e7e5 g1f3 b8c6 f1b5 a7a6"),
    ("Italian Game", "e2e4 e7e5 g1f3 b8c6 f1c4 f8c5"),
    ("Scotch Game", "e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4"),
    ("Petroff Defence", "e2e4 e7e5 g1f3 g8f6 f3e5 d7d6"),
    ("Sicilian Najdorf", "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6"),
    ("Sicilian Dragon", "e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 g7g6"),
    ("French Defence", "e2e4 e7e6 d2d4 d7d5 b1c3 g8f6"),
    ("Caro-Kann", "e2e4 c7c6 d2d4 d7d5 b1c3 d5e4"),
    ("Scandinavian", "e2e4 d7d5 e4d5 d8d5 b1c3 d5a5"),
    ("Queen's Gambit Declined", "d2d4 d7d5 c2c4 e7e6 b1c3 g8f6"),
    ("Slav Defence", "d2d4 d7d5 c2c4 c7c6 g1f3 g8f6"),
    ("King's Indian", "d2d4 g8f6 c2c4 g7g6 b1c3 f8g7"),
    ("Nimzo-Indian", "d2d4 g8f6 c2c4 e7e6 b1c3 f8b4"),
    ("Grunfeld", "d2d4 g8f6 c2c4 g7g6 b1c3 d7d5"),
    ("English Opening", "c2c4 e7e5 b1c3 g8f6"),
    ("Reti Opening", "g1f3 d7d5 g2g3 g8f6 f1g2"),
]


def _parse(name: str, line: str) -> list[chess.Move]:
    """Replay a book line, failing loudly if it is not legal.

    This is a real boundary — a typo in a UCI string above would otherwise
    surface as a silently truncated opening, and every game from that book entry
    would start from a subtly wrong position.
    """
    board = chess.Board()
    moves: list[chess.Move] = []
    for token in line.split():
        move = chess.Move.from_uci(token)
        if move not in board.legal_moves:
            raise ValueError(f"illegal move {token!r} in opening {name!r} at ply {len(moves)}")
        board.push(move)
        moves.append(move)
    return moves


OPENINGS: list[tuple[str, list[chess.Move]]] = [(name, _parse(name, line)) for name, line in _BOOK]


def starting_board(index: int) -> chess.Board:
    """A fresh board with opening `index` already played out."""
    board = chess.Board()
    for move in OPENINGS[index][1]:
        board.push(move)
    return board
