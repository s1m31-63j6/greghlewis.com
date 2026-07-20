"""Shared types and helpers for the Glass Box RAG corpus pipeline."""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path

import yaml

ROOT = Path(__file__).parent
RAW = ROOT / "data" / "raw"
BUILD = ROOT / "data" / "build"


@dataclass
class Opinion:
    """One judicial opinion, normalized across acquisition paths."""

    id: str
    name: str
    court: str
    year: int
    layer: str  # "modern" | "ancestor"
    text: str
    source: str  # "courtlistener" | "govinfo" | "url"
    citation: str | None = None
    date: str | None = None
    judge: str | None = None
    docket: str | None = None
    url: str | None = None
    precedential_status: str | None = None
    note: str | None = None
    # Citation edges to other opinions IN THIS CORPUS, filled in by the citation pass.
    cites: list[str] = field(default_factory=list)

    @property
    def word_count(self) -> int:
        return len(self.text.split())

    def to_dict(self) -> dict:
        return asdict(self)


# Court hierarchy. Drives the binding-vs-persuasive distinction, which is the
# single most useful legal-specific retrieval filter and the thing generic RAG
# gets wrong. SCOTUS binds everyone; a circuit binds its own districts; a
# district court binds no one.
COURT_LEVEL = {
    "scotus": "supreme",
    "ca2": "circuit", "ca3": "circuit", "ca9": "circuit", "cadc": "circuit",
    "cand": "district", "ded": "district", "nysd": "district", "cacd": "district",
    "mad": "district",
}

COURT_NAME = {
    "scotus": "Supreme Court of the United States",
    "ca2": "U.S. Court of Appeals, Second Circuit",
    "ca3": "U.S. Court of Appeals, Third Circuit",
    "ca9": "U.S. Court of Appeals, Ninth Circuit",
    "cadc": "U.S. Court of Appeals, D.C. Circuit",
    "cand": "N.D. Cal.",
    "ded": "D. Del.",
    "nysd": "S.D.N.Y.",
    "cacd": "C.D. Cal.",
    "mad": "D. Mass.",
}

# Which circuit each district sits in — needed to answer "is this binding here?"
DISTRICT_CIRCUIT = {"cand": "ca9", "cacd": "ca9", "ded": "ca3", "nysd": "ca2", "mad": "ca1"}


def binds(authority_court: str, forum_court: str) -> bool:
    """Is an opinion from `authority_court` binding on `forum_court`?"""
    if authority_court == "scotus":
        return True
    if COURT_LEVEL.get(authority_court) == "circuit":
        return DISTRICT_CIRCUIT.get(forum_court) == authority_court or forum_court == authority_court
    return authority_court == forum_court


def load_manifest() -> dict:
    return yaml.safe_load((ROOT / "cases.yaml").read_text())


def all_cases(manifest: dict) -> list[dict]:
    return [*manifest.get("ancestors", []), *manifest.get("modern", [])]


_WS = re.compile(r"[ \t]+")
_MULTINL = re.compile(r"\n{3,}")
# Page furniture that PDF extraction leaves behind in slip opinions.
_PAGE_NOISE = re.compile(
    r"^\s*(Case \d+:\d+-cv-\d+.*?Page \d+ of \d+|Page \d+ of \d+|\d+)\s*$",
    re.MULTILINE,
)


def clean_text(raw: str) -> str:
    """Normalize whitespace and strip PDF page furniture, preserving paragraph breaks."""
    text = raw.replace("\r\n", "\n").replace("\xa0", " ")
    # Rejoin words hyphenated across a line break ("PUBLISH-\nING" -> "PUBLISHING").
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    text = _PAGE_NOISE.sub("", text)
    text = _WS.sub(" ", text)
    text = _MULTINL.sub("\n\n", text)
    return text.strip()


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # default=str: PyYAML parses `date: 2025-02-11` into a datetime.date.
    path.write_text(json.dumps(obj, indent=1, ensure_ascii=False, default=str))
