"""Per-position scouting-archetype trait schemas.

Replaces the blunt Titan-on-prose embedding with structured per-position
typed traits extracted by Sonnet. Each trait is scored 1-5 (1 = severely
below average for the position, 3 = average, 5 = elite) with a supporting
quote from the source text. Schemas drawn from expert-consensus dimensions
(QBASE 2.0 for QB, DuPont/RotoViz/PlayerProfiler for skill positions) so
the dims correspond to the archetype axes scouts actually use.

Usage:
    from engine.embedding.trait_schemas import schema_for, trait_names_for
    from engine.schema import Position
    schema = schema_for(Position.QB)         # pydantic model class
    names  = trait_names_for(Position.QB)    # alphabetical tuple of trait names
"""

from __future__ import annotations

from pydantic import BaseModel

from engine.schema import Position
from engine.embedding.trait_schemas.qb import QBTraits, QB_TRAIT_NAMES
from engine.embedding.trait_schemas.rb import RBTraits, RB_TRAIT_NAMES
from engine.embedding.trait_schemas.te import TETraits, TE_TRAIT_NAMES
from engine.embedding.trait_schemas.wr import WRTraits, WR_TRAIT_NAMES


_BY_POSITION: dict[Position, type[BaseModel]] = {
    Position.QB: QBTraits,
    Position.RB: RBTraits,
    Position.WR: WRTraits,
    Position.TE: TETraits,
}

_NAMES_BY_POSITION: dict[Position, tuple[str, ...]] = {
    Position.QB: QB_TRAIT_NAMES,
    Position.RB: RB_TRAIT_NAMES,
    Position.WR: WR_TRAIT_NAMES,
    Position.TE: TE_TRAIT_NAMES,
}


def schema_for(position: Position) -> type[BaseModel]:
    """Pydantic model for the position's trait schema."""
    return _BY_POSITION[position]


def trait_names_for(position: Position) -> tuple[str, ...]:
    """Alphabetical trait names for the position. Stable order — used for
    vectorization."""
    return _NAMES_BY_POSITION[position]


__all__ = [
    "schema_for",
    "trait_names_for",
    "QBTraits",
    "RBTraits",
    "WRTraits",
    "TETraits",
]
