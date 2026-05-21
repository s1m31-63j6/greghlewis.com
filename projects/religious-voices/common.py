"""Shared types and leader-manifest loader for the corpus pipeline.

Mirrors the TypeScript types in /src/lib/religious-voices/types.ts. Keep
the two in lockstep — the corpus.json this pipeline emits is consumed by
the TS layer with no schema negotiation.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field

Religion = Literal[
    "Mormon",
    "Catholic",
    "Methodist",
    "Southern Baptist",
    "Jewish",
    "Buddhist",
    "Islam",
    "Hindu",
]


class Source(BaseModel):
    url: str
    type: str
    license: str


class Leader(BaseModel):
    leader_id: str
    religion: Religion
    full_name: str
    role: str
    dates: str
    era_start: int
    themes: list[str]
    sources: list[Source] = Field(default_factory=list)


class Chunk(BaseModel):
    id: str
    leader_id: str
    religion: Religion
    year: int | None = None
    work_title: str
    source_url: str
    text: str
    embedding: list[float] = Field(default_factory=list)


PROJECT_ROOT = Path(__file__).resolve().parent
REPO_ROOT = PROJECT_ROOT.parent.parent
LEADERS_YAML = PROJECT_ROOT / "leaders.yaml"
SEED_PASSAGES_YAML = PROJECT_ROOT / "seed_passages.yaml"
OUTPUT_DIR = REPO_ROOT / "src" / "lib" / "religious-voices"


def load_leaders() -> list[Leader]:
    """Parse leaders.yaml into pydantic Leader objects."""
    with LEADERS_YAML.open() as f:
        raw = yaml.safe_load(f)
    return [Leader(**entry) for entry in raw["leaders"]]
