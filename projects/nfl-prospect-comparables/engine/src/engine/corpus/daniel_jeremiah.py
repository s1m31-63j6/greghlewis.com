"""Daniel Jeremiah Top-N article scraper (NFL.com).

DJ publishes ranked-prospect articles on NFL.com — Top 50 (regular) and a
Top 150 around the combine. Each is one long article with consistent
per-prospect blocks: <h3> ranking heading, school/position/class line, then
a multi-paragraph blurb. Same parse strategy works for both.

URL examples (must be passed in — versions roll forward):
    https://www.nfl.com/news/daniel-jeremiah-s-top-50-2026-nfl-draft-prospect-rankings-4-0
    https://www.nfl.com/news/daniel-jeremiah-s-top-150-prospects-in-the-2026-nfl-draft-class

Output: per-player public S3 prefix
    corpus/daniel_jeremiah/{player_id}.txt
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


# ---------- name normalization (shared with other scrapers) ----------


def _normalize(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^\w\s]", " ", s.lower())
    s = re.sub(r"\s+", " ", s).strip()
    return s


# ---------- article parsing ----------


@dataclass(frozen=True)
class Entry:
    rank: int
    name: str
    school: str
    position: str
    blurb: str


# Heading pattern observed: "1) Fernando Mendoza" inside an <h3> (sometimes
# a numbered <h2>). The school/position line follows in the next element.
_HEADING_RE = re.compile(r"^\s*(\d{1,3})[\.\)]\s+(.+?)\s*$")


def _text(node: Tag) -> str:
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()


_PROSPECT_HREF_RE = re.compile(r"/prospects/([^/]+)/([a-f0-9-]{36})")
_INTRO_END_MARKERS = ("on to the rankings", "now, on to", "let's get to it",
                     "to the rankings", "without further ado")
_FIRST_WORD_RE = re.compile(r"^([A-Z][A-Za-z'\-]+(?:\.\s*[A-Z][A-Za-z'\-]+)?)\b")


def parse_article(html: str) -> list[tuple[int, str, str]]:
    """Parse a DJ Top-N article into [(rank, first_word, blurb)] tuples.

    DJ's article body is a sequence of `nfl-c-body-part--text` divs:
    a few intro paragraphs, then one body part per ranked prospect.
    Each prospect blurb starts with the prospect's last name followed by
    a verb ("Mendoza is...", "Love is...", "McNeil-Warren is...").

    We don't try to identify the prospect inside the parser — we just
    return the leading word + the full blurb, and the matcher resolves
    against the cohort separately. This keeps the parser dumb and
    robust: no prospect-link assumption, no fuzzy regex over body text.

    Returns a list ordered by rank (1-indexed). The "OUT" tail is
    skipped if present.
    """
    soup = BeautifulSoup(html, "lxml")
    article_body = (
        soup.find("div", class_="nfl-c-article__body")
        or soup.find("article")
        or soup
    )

    body_parts = article_body.find_all(class_="nfl-c-body-part--text")
    rankings: list[tuple[int, str, str]] = []
    started = False
    rank = 0
    for bp in body_parts:
        text = _text(bp)
        if not text:
            continue
        if not started:
            if any(m in text.lower() for m in _INTRO_END_MARKERS):
                started = True
            continue
        # Skip "OUT" / "IN" maintenance lines at the article tail.
        if text.startswith("OUT:") or text.startswith("IN:"):
            continue
        m = _FIRST_WORD_RE.match(text)
        if not m:
            continue
        first_word = m.group(1)
        rank += 1
        rankings.append((rank, first_word, text))
    return rankings


_META_SEP_RE = re.compile(r"\s*[·|·•–\-]\s*|\s*\|\s*")


def _split_meta(line: str) -> tuple[str, str]:
    """Split 'School · Position · Class' (or | separators) into school + position."""
    parts = [p for p in _META_SEP_RE.split(line) if p]
    if len(parts) < 2:
        return ("", "")
    school = parts[0].strip()
    position = parts[1].strip()
    # Position is typically 1-3 chars (QB, RB, WR, OT, EDGE, etc.). If we
    # got something long we probably split wrong.
    if len(position) > 6 or " " in position:
        return ("", "")
    return (school, position)


def fetch_article(url: str, session: requests.Session) -> str:
    resp = session.get(url, timeout=30)
    resp.raise_for_status()
    return resp.text


# ---------- cohort matching ----------


def _last_token(name: str) -> str:
    parts = name.replace(".", " ").split()
    while parts and parts[-1].rstrip(".") in {"Jr", "Sr", "II", "III", "IV"}:
        parts.pop()
    return parts[-1] if parts else name


def build_last_name_index(cohort: list[PlayerProfile]) -> dict[str, list[PlayerProfile]]:
    """normalized last-name → cohort player(s). For matching DJ blurbs
    that start with the last name (the article convention)."""
    out: dict[str, list[PlayerProfile]] = {}
    for p in cohort:
        ln = _normalize(_last_token(p.name))
        if ln:
            out.setdefault(ln, []).append(p)
    return out


def match_blurb(
    first_word: str,
    blurb: str,
    last_name_index: dict[str, list[PlayerProfile]],
) -> PlayerProfile | None:
    """Resolve a DJ blurb to a cohort prospect.

    `first_word` is the leading token of the blurb (DJ uses the last name
    here). On collision, fall back to scanning the blurb for any school
    name from the candidate set — this is enough to disambiguate common
    last names like "Hill" or "Williams" within a 2026 cohort.
    """
    key = _normalize(first_word)
    candidates = last_name_index.get(key, [])
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]
    # Heuristic disambiguation: search for the candidate's first name in
    # the blurb body. Names are mentioned later in the prose typically.
    blurb_n = _normalize(blurb)
    by_first = [
        p for p in candidates
        if _normalize(p.name.split()[0]) in blurb_n
    ]
    if len(by_first) == 1:
        return by_first[0]
    return None


def render_text(rank: int, name: str, blurb: str) -> str:
    """Render the per-player text we persist to S3."""
    header = f"# Daniel Jeremiah Top-{rank}: {name}"
    return f"{header}\n\n{blurb.strip()}\n"
