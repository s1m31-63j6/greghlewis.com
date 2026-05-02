"""ESPN big-board scraper (Mel Kiper / Jeff Legwold).

ESPN publishes annual big-board rankings articles featuring per-prospect
scouting blurbs. The static article HTML is served free (the underlying
DRAFT++ database is paywalled, but the rankings articles render fully
server-side). Same article-style layout as DJ / Connor Rogers / B/R.

Output: per-player public S3 prefix
    corpus/espn/{player_id}.txt
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


_HEADING_RE = re.compile(r"^\s*(\d{1,3})[\.\)]\s+(.+?)\s*$")


def _text(node: Tag) -> str:
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()


_ESPN_PLAYER_LINK_RE = re.compile(r"/college-football/player/_/id/")


def parse_article(html: str) -> list[Entry]:
    """Parse ESPN big-board article into per-prospect blurbs.

    Strategy: ESPN big-board articles have two layouts inline:
      (a) detailed prose paragraphs for the top ~25 — multi-sentence
          analysis where 1-3 prospect links may appear (the subject plus
          referential mentions of related prospects), 200+ chars of prose.
      (b) listing paragraphs for ranks 26+ — a single <p> per position
          with 30-100 prospect links and almost no prose between them.

    We classify by link DENSITY: detailed paragraphs have <0.05 links per
    char; listings have >0.10. The first prospect link in a detailed
    paragraph is treated as the subject; we deduplicate so the same
    prospect doesn't get assigned twice if their name appears across
    multiple paragraphs.
    """
    soup = BeautifulSoup(html, "lxml")
    out: list[Entry] = []
    seen_ids: set[str] = set()
    rank = 0
    for p in soup.find_all("p"):
        text = _text(p)
        if len(text) < 200:
            continue
        links = p.find_all("a", href=_ESPN_PLAYER_LINK_RE)
        if not links:
            continue
        # Reject listing paragraphs by link density.
        if len(links) > max(1, len(text) // 200):
            continue
        link = links[0]
        name = link.get_text(strip=True)
        if not name or len(name.split()) < 2:
            continue
        m = re.search(r"/id/(\d+)/", link.get("href", ""))
        pid = m.group(1) if m else None
        if pid and pid in seen_ids:
            continue
        if pid:
            seen_ids.add(pid)
        rank += 1
        out.append(Entry(
            rank=rank,
            name=name,
            school="",
            position="",
            blurb=text,
        ))
    return out


def fetch_article(url: str, session: requests.Session) -> str:
    resp = session.get(url, timeout=30)
    resp.raise_for_status()
    return resp.text


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
    header = f"# ESPN {rank_str}: {entry.name}".strip()
    meta_bits = [b for b in (entry.school, entry.position) if b]
    meta = " · ".join(meta_bits)
    parts = [header]
    if meta:
        parts.append(meta)
    parts.append("")
    parts.append(entry.blurb.strip())
    return "\n".join(parts)
