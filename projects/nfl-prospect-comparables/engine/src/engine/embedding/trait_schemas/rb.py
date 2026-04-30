"""RB scouting-archetype traits.

Dimensions chosen to match the public-data RB analytics frameworks
(Zachariason ZAP, Mike Clay, RotoViz, Frank DuPont): contact balance,
vision, breakaway, three-down versatility, pass-pro, receiving chops.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from engine.embedding.trait_schemas.qb import TraitWithQuote


class RBTraits(BaseModel):
    contact_balance: TraitWithQuote = Field(
        description="Yards-after-contact ability, breaking tackles, finishing runs through arm tackles."
    )
    vision: TraitWithQuote = Field(
        description="Setting up blocks, finding cutback lanes, patience to let plays develop."
    )
    breakaway_speed: TraitWithQuote = Field(
        description="Long speed when in space, ability to outrun angles for chunk gains and TDs."
    )
    pass_protection: TraitWithQuote = Field(
        description="Blitz pickup technique, willingness to engage, anchor against bigger rushers."
    )
    receiving_chops: TraitWithQuote = Field(
        description="Route running out of the backfield, hands, comfort as a receiving threat."
    )
    three_down_versatility: TraitWithQuote = Field(
        description="Trustworthy on all downs (early-down runner + 3rd-down passing-down RB)."
    )
    workload_durability: TraitWithQuote = Field(
        description="Frame, injury history, ability to handle a 200+ touch NFL workload."
    )
    elusiveness: TraitWithQuote = Field(
        description="Forced missed tackles, jukes, lateral agility in space."
    )
    ceiling: TraitWithQuote = Field(
        description="Best-case NFL outcome (1=committee back, 5=All-Pro bell-cow)."
    )
    floor: TraitWithQuote = Field(
        description="Worst-case downside risk (1=high bust, 5=safe rotational role)."
    )


RB_TRAIT_NAMES: tuple[str, ...] = (
    "breakaway_speed",
    "ceiling",
    "contact_balance",
    "elusiveness",
    "floor",
    "pass_protection",
    "receiving_chops",
    "three_down_versatility",
    "vision",
    "workload_durability",
)
