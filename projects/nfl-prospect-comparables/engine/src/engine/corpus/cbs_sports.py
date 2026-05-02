"""CBS Sports big-board scraper (Mike Renner / Ryan Wilson).

CBS Sports's per-pick mock drafts are client-rendered, BUT their full
big-board / Top-N articles ARE server-rendered. Renner's Top 250 article
puts each ranked prospect in an `<h2>` heading like "1.Fernando Mendoza,
QB, Indiana" followed by 1-3 paragraphs of scouting prose. Same shape
applies to other CBS big-board articles (positional rankings etc.).

Output: per-player public S3 prefix
    corpus/recency/cbs_sports/<player_id>__<article_slug>.txt
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
HEADERS = {
    "User-Agent": UA,
    # CBS rejects requests without a sensible Accept header (returns 406).
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
    "Accept-Language": "en-US,en;q=0.9",
}


def make_session() -> requests.Session:
    s = requests.Session()
    s.headers.update(HEADERS)
    return s


def _normalize(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^\w\s]", " ", s.lower())
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _last_token(name: str) -> str:
    parts = name.replace(".", " ").split()
    while parts and parts[-1].rstrip(".") in {"Jr", "Sr", "II", "III", "IV"}:
        parts.pop()
    return parts[-1] if parts else name


@dataclass(frozen=True)
class Entry:
    rank: int | None
    name: str
    school: str
    position: str
    blurb: str


# Renner heading: "1.Fernando Mendoza, QB, Indiana" (no space after dot)
# Sometimes "1. Name, POS, School" (with spaces). Allow both.
_RANKED_HEADING_RE = re.compile(
    r"^\s*(?P<rank>\d{1,3})\.\s*(?P<name>[^,]+?)\s*,\s*"
    r"(?P<position>[A-Z]{1,5}(?:/[A-Z]{1,5})?)\s*,\s*(?P<school>.+?)\s*$"
)
# Wilson layout uses plain <p> tags with no rank prefix:
#   "Fernando Mendoza , QB, Indiana"  (note literal space before the first comma)
# Position values are ALL-CAPS short tokens (QB / EDGE / OT / etc.).
_UNRANKED_HEADING_RE = re.compile(
    r"^\s*(?P<name>[A-Z][A-Za-z'\.\-]+(?:\s+[A-Z][A-Za-z'\.\-]+){1,4})"
    r"\s*,\s*(?P<position>[A-Z]{1,5}(?:/[A-Z]{1,5})?)\s*,\s*"
    r"(?P<school>[A-Za-z][A-Za-z'\.\&\(\)\s]+?)\s*$"
)


def _text(node: Tag) -> str:
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()


def parse_article(html: str) -> list[Entry]:
    """Parse a CBS big-board article.

    Two heading layouts are supported:
      (a) Renner-style — h2/h3 with "1.Fernando Mendoza, QB, Indiana"
      (b) Wilson-style — plain <p> with "Fernando Mendoza, QB, Indiana"
          (no rank prefix; rank is implicit by document order)

    Following <p> siblings up to the next prospect heading are accumulated
    as the blurb, with sidebar/cross-link cards filtered out by length.
    """
    soup = BeautifulSoup(html, "lxml")
    out: list[Entry] = []
    current_rank: int | None = None
    current_name = ""
    current_school = ""
    current_position = ""
    buffer: list[str] = []
    implicit_rank = 0

    def _flush() -> None:
        nonlocal buffer
        if current_name:
            prose = " ".join(b for b in buffer if b).strip()
            if prose:
                out.append(Entry(
                    rank=current_rank,
                    name=current_name,
                    school=current_school,
                    position=current_position,
                    blurb=prose,
                ))
        buffer = []

    for el in soup.find_all(["h1", "h2", "h3", "h4", "h5", "p"]):
        if not isinstance(el, Tag):
            continue
        text = _text(el)
        if not text:
            continue
        # Try the ranked-heading pattern first (Renner-style).
        m = _RANKED_HEADING_RE.match(text)
        if m and el.name in ("h2", "h3", "h4", "h5"):
            _flush()
            current_rank = int(m.group("rank"))
            current_name = m.group("name").strip()
            current_school = m.group("school").strip()
            current_position = m.group("position").strip()
            continue
        # Wilson-style header lives in a <p> with no rank prefix. We only
        # accept it when the text is short (heading-shaped, not a prose
        # paragraph that happens to start with a name).
        if el.name == "p" and len(text) < 80:
            m2 = _UNRANKED_HEADING_RE.match(text)
            if m2:
                _flush()
                implicit_rank += 1
                current_rank = implicit_rank
                current_name = m2.group("name").strip()
                current_school = m2.group("school").strip()
                current_position = m2.group("position").strip()
                continue
        # Otherwise it's a prose paragraph attached to the current entry.
        if el.name == "p" and current_name:
            buffer.append(text)
    _flush()
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


def render_text(source_label: str, article_url: str, entry: Entry) -> str:
    rank_str = f"#{entry.rank}" if entry.rank else ""
    header = f"# {source_label} {rank_str}: {entry.name} ({article_url})".strip()
    meta_bits = [b for b in (entry.school, entry.position) if b]
    meta = " · ".join(meta_bits)
    parts = [header]
    if meta:
        parts.append(meta)
    parts.append("")
    parts.append(entry.blurb.strip())
    return "\n".join(parts)


def url_slug(url: str) -> str:
    m = re.search(r"/news/([^/?#]+)", url)
    if not m:
        return "article"
    return m.group(1).strip("/")[:80]
