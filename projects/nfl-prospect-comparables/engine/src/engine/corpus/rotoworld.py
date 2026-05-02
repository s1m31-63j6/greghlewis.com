"""Rotoworld / NBC Sports prospect-rankings scraper (Connor Rogers).

Connor Rogers publishes ranked-prospect articles on nbcsports.com — a Top
335 big board and per-position rankings (QB, RB, WR, TE, OL, etc.). Each is
one long article with consistent per-prospect blocks: <h2>/<h3> heading,
school/position metadata, then prose blurb.

Article layout differs from NFL.com's DJ Top 50 in:
  - Headings often "<rank>. <Name>, <School>" inline rather than separate
  - Position is declared in the section header above each block

Output: per-player public S3 prefix
    corpus/rotoworld/{player_id}.txt
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

import requests
from bs4 import BeautifulSoup, Tag

from engine.schema import PlayerProfile


UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
)


def make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": UA})
    return s


def _normalize(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^\w\s]", " ", s.lower())
    s = re.sub(r"\s+", " ", s).strip()
    return s


@dataclass(frozen=True)
class Entry:
    rank: int | None
    name: str
    school: str
    position: str
    blurb: str


# Rank prefixed: "1. Fernando Mendoza" or "1) Fernando Mendoza"; Connor
# Rogers also uses en-dash separators: "Fernando Mendoza – QB". Strip
# everything after the FIRST dash variant so we don't pollute the name.
_HEADING_RE = re.compile(r"^\s*(\d{1,3})[\.\)]\s+(.+?)\s*$")
_NAME_META_RE = re.compile(r"^([^,]+?)(?:\s*,\s*([^,]+))?(?:\s*,\s*([A-Z]{1,4}\b.*))?$")
_NAME_DASH_SPLIT_RE = re.compile(r"\s*[–—-]\s*")  # en-dash, em-dash, hyphen


def _text(node: Tag) -> str:
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()


def parse_article(html: str) -> list[Entry]:
    """Parse Connor Rogers's ranked-prospect article."""
    soup = BeautifulSoup(html, "lxml")
    article = soup.find("article") or soup
    candidates = [
        n for n in article.find_all(["h1", "h2", "h3", "h4", "p"])
        if isinstance(n, Tag)
    ]

    out: list[Entry] = []
    current_rank: int | None = None
    current_name: str | None = None
    current_school: str = ""
    current_position: str = ""
    buffer: list[str] = []

    def _flush() -> None:
        nonlocal current_rank, current_name, current_school, current_position, buffer
        if current_name is None:
            buffer = []
            return
        prose = " ".join(b for b in buffer if b).strip()
        if prose:
            out.append(Entry(
                rank=current_rank,
                name=current_name.strip(),
                school=current_school,
                position=current_position,
                blurb=prose,
            ))
        buffer = []

    for node in candidates:
        text = _text(node)
        if not text:
            continue
        m = _HEADING_RE.match(text)
        if m and len(m.group(2).split()) <= 10:
            _flush()
            current_rank = int(m.group(1))
            head = m.group(2)
            # Connor Rogers's headings are typically "<Name> – <POS>" or
            # "<Name> – <POS>, <School>". Split on dash first to peel off
            # the position, then on comma for school.
            dash_parts = _NAME_DASH_SPLIT_RE.split(head, maxsplit=1)
            current_name = dash_parts[0].strip()
            current_position = ""
            current_school = ""
            if len(dash_parts) > 1:
                tail = dash_parts[1]
                tail_parts = [t.strip() for t in tail.split(",")]
                # First tail part is position
                pos_match = re.match(r"([A-Z]{1,5})", tail_parts[0])
                if pos_match:
                    current_position = pos_match.group(1)
                if len(tail_parts) > 1:
                    current_school = tail_parts[1]
            else:
                # No dash — try comma split
                mm = _NAME_META_RE.match(head)
                if mm:
                    current_name = mm.group(1).strip()
                    current_school = (mm.group(2) or "").strip()
                    pos_str = (mm.group(3) or "").strip()
                    pos_match = re.match(r"([A-Z]{1,5})\b", pos_str)
                    current_position = pos_match.group(1) if pos_match else ""
        else:
            if current_name is not None:
                buffer.append(text)
    _flush()
    return out


def fetch_article(url: str, session: requests.Session) -> str:
    resp = session.get(url, timeout=30)
    resp.raise_for_status()
    return resp.text


# ---------- cohort matching ----------


def build_match_index(cohort: list[PlayerProfile]) -> dict[str, list[PlayerProfile]]:
    out: dict[str, list[PlayerProfile]] = {}
    for p in cohort:
        out.setdefault(_normalize(p.name), []).append(p)
    return out


def match_entry(entry: Entry, index: dict[str, list[PlayerProfile]]) -> PlayerProfile | None:
    candidates = index.get(_normalize(entry.name), [])
    if len(candidates) == 1:
        return candidates[0]
    return None


def render_text(entry: Entry) -> str:
    rank_str = f"#{entry.rank}" if entry.rank else ""
    header = f"# Connor Rogers {rank_str}: {entry.name}".strip()
    meta_bits = [b for b in (entry.school, entry.position) if b]
    meta = " · ".join(meta_bits)
    parts = [header]
    if meta:
        parts.append(meta)
    parts.append("")
    parts.append(entry.blurb.strip())
    return "\n".join(parts)
