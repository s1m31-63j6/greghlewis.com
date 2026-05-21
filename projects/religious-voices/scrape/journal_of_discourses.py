"""Journal of Discourses auto-harvester.

JoD has 26 volumes on Wikisource (1854-1886), each with ~50 sub-pages
for individual discourses by various early LDS leaders. Rather than
hand-listing each in wikisource_sources.yaml, this scraper:

  1. Iterates the configured JoD volumes
  2. Discovers each volume's discourse sub-pages
  3. Fetches each discourse, reads the attribution paragraph
  4. Maps the speaker to a leader_id from leaders.yaml
  5. Emits SourceText for matched discourses

Speakers we attribute (those in leaders.yaml):
  Brigham Young (1844-1877)        → brigham-young
  John Taylor (1877-1887)          → john-taylor
  Wilford Woodruff                 → wilford-woodruff
  Lorenzo Snow                     → lorenzo-snow
  Joseph F. Smith                  → joseph-f-smith

Discourses by other speakers (Heber C. Kimball, Orson Pratt, George A.
Smith, etc.) are skipped — they're significant early Mormon figures but
not in our leader manifest.

Per-leader cap is applied by build.py downstream; this scraper happily
returns hundreds of discourses if they exist.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass

import httpx
from rich.console import Console

from chunk import SourceText
from common import Leader
from scrape.wikisource import (
    API_URL,
    USER_AGENT,
    _extract_paragraphs,
    _fetch_html,
)

console = Console()

# Which JoD volumes to harvest. All 26 exist; 1-8 cover BY's most prolific
# period and are the highest-yield. Expand the range if a leader's chunk
# count is still thin after a first build.
JOD_VOLUMES = list(range(1, 27))

# Speaker patterns → leader_id. Order matters: more specific names first
# so "John Taylor" doesn't fire on a discourse by "Brigham Young" that
# happens to mention John Taylor.
SPEAKERS: list[tuple[str, str]] = [
    ("Wilford Woodruff", "wilford-woodruff"),
    ("Lorenzo Snow", "lorenzo-snow"),
    ("Joseph F. Smith", "joseph-f-smith"),
    ("John Taylor", "john-taylor"),
    ("Brigham Young", "brigham-young"),
]

# Year regex for the attribution paragraph (which usually has a date).
_YEAR_RE = re.compile(r"\b(18[5-8][0-9])\b")


@dataclass
class _Discourse:
    page: str
    leader_id: str
    work_title: str
    year: int | None


def _list_subpages(client: httpx.Client, parent: str) -> list[str]:
    """Discover discourse sub-pages of a JoD volume.

    MediaWiki returns links with spaces (not underscores). We normalize
    on the way out so downstream consumers see consistent underscored
    page names that map cleanly to Wikisource URLs.
    """
    r = client.get(
        API_URL,
        params={"action": "parse", "format": "json", "page": parent, "prop": "links"},
    )
    d = r.json()
    if "error" in d:
        return []
    links = d.get("parse", {}).get("links", [])
    prefix_spaces = parent.replace("_", " ") + "/"
    return [
        l["*"].replace(" ", "_")
        for l in links
        if l.get("*", "").startswith(prefix_spaces)
    ]


def _identify_speaker(head: str) -> str | None:
    """Return the leader_id whose name appears in the attribution head, or None."""
    head_lower = head.lower()
    for speaker_name, lid in SPEAKERS:
        if speaker_name.lower() in head_lower:
            return lid
    return None


def _extract_year(head: str) -> int | None:
    m = _YEAR_RE.search(head)
    return int(m.group(1)) if m else None


def scrape_journal_of_discourses(leaders: list[Leader]) -> list[SourceText]:
    leader_lookup = {l.leader_id: l for l in leaders}
    out: list[SourceText] = []
    with httpx.Client(timeout=30, headers={"User-Agent": USER_AGENT}) as client:
        for vol in JOD_VOLUMES:
            parent = f"Journal_of_Discourses/Volume_{vol}"
            subs = _list_subpages(client, parent)
            if not subs:
                console.log(f"[yellow]JoD Vol {vol}: no sub-pages (skipping)[/]")
                continue
            console.log(f"JoD Vol {vol}: {len(subs)} discourses")
            for sub in subs:
                try:
                    html = _fetch_html(sub)
                except Exception as e:
                    console.log(f"[yellow]  {sub}: fetch failed ({e})[/]")
                    time.sleep(0.3)
                    continue
                paragraphs = _extract_paragraphs(html)
                if not paragraphs:
                    time.sleep(0.3)
                    continue
                # Attribution is in the first 1-2 substantive paragraphs
                head = " ".join(paragraphs[:3])[:600]
                lid = _identify_speaker(head)
                if lid is None or lid not in leader_lookup:
                    time.sleep(0.2)
                    continue
                # Build the body — drop chrome paragraphs (attribution +
                # any "Reported by", "A Discourse" lines)
                body_start = 0
                while body_start < len(paragraphs):
                    h = paragraphs[body_start].lower()
                    if any(
                        h.startswith(p)
                        for p in (
                            "a discourse",
                            "a sermon",
                            "a speech",
                            "an address",
                            "an oration",
                            "remarks",
                            "delivered by",
                            "reported by",
                        )
                    ):
                        body_start += 1
                        continue
                    if "discourse" in h[:40] or "delivered" in h[:80]:
                        body_start += 1
                        continue
                    break
                body = "\n\n".join(paragraphs[body_start:])
                if len(body) < 400:
                    time.sleep(0.2)
                    continue
                # Derive a display title from the last path segment
                last = sub.rsplit("/", 1)[-1].replace("_", " ")
                year = _extract_year(head)
                source_url = f"https://en.wikisource.org/wiki/{sub}"
                out.append(
                    SourceText(
                        leader_id=lid,
                        religion=leader_lookup[lid].religion,
                        work_title=f"{last} — JoD Vol {vol}",
                        source_url=source_url,
                        text=body,
                        year=year,
                    )
                )
                time.sleep(0.2)
    # Report what we got
    from collections import Counter
    by_leader = Counter(s.leader_id for s in out)
    for lid, n in by_leader.most_common():
        console.log(f"  JoD harvested {n} discourses for {lid}")
    return out
