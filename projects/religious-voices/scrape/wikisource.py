"""Wikisource scraper — pulls public-domain religious texts.

Wikisource is the cleanest single-source for this project: a structured
MediaWiki API, conservative editing standards, explicit licensing
(CC BY-SA + PD for older works), and consistent paragraph formatting.

The MediaWiki `action=parse&prop=text` endpoint returns rendered HTML.
We strip non-prose chrome (attribution paragraphs, page-break markers,
footnotes) and emit clean paragraphs as the body of each SourceText.

Sources YAML format (`wikisource_sources.yaml`):

  sources:
    - leader_id: joseph-smith
      page: King_Follett_Discourse
      work_title: King Follett Discourse
      year: 1844
      # Optional: substring that must appear in the page's attribution
      # paragraph. If set and not found, the scraper logs a warning and
      # skips the page — guards against grabbing the wrong speaker's
      # discourse from a multi-author volume.
      attribution_contains: "Joseph Smith"
"""

from __future__ import annotations

import re
import time
from pathlib import Path
from typing import Iterable

import httpx
import yaml
from rich.console import Console

from chunk import SourceText
from common import PROJECT_ROOT, Leader

console = Console()

API_URL = "https://en.wikisource.org/w/api.php"
USER_AGENT = "religious-voices-corpus/0.1 (https://greghlewis.com; greghlewis@gmail.com)"

# Re-exported for use by journal_of_discourses.py (so the JoD harvester
# can use the same fetch + paragraph-extraction logic).
__all__ = [
    "API_URL",
    "USER_AGENT",
    "scrape_wikisource",
    "_fetch_html",
    "_extract_paragraphs",
]

WIKISOURCE_SOURCES_YAML = PROJECT_ROOT / "wikisource_sources.yaml"

_PARAGRAPH_RE = re.compile(r"<p[^>]*>(.*?)</p>", re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
# Wikisource MW class injected for page-break scan markers; not body text.
_PAGEBREAK_HINT = "mw-parser-output .wst-pagebreak"
# Scan-note line that JoD pages append to their attribution paragraph.
# Stripped (not used as a drop predicate) so the attribution above it
# survives.
_SCAN_NOTE_RE = re.compile(r"\s*\(Online document scan[^)]*\)\s*", re.IGNORECASE)


def _fetch_html(page: str) -> str:
    # URL-decode the page name before passing to the API — httpx re-encodes
    # for us, and a doubly-encoded ? (e.g. %3F) breaks the lookup.
    from urllib.parse import unquote

    decoded = unquote(page)
    params = {
        "action": "parse",
        "format": "json",
        "page": decoded,
        "prop": "text",
        "redirects": "1",
        "disableeditsection": "1",
        "disabletoc": "1",
    }
    with httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=30) as client:
        r = client.get(API_URL, params=params)
        r.raise_for_status()
        data = r.json()
    if "error" in data:
        raise RuntimeError(f"wikisource error for {decoded}: {data['error']}")
    return data["parse"]["text"]["*"]


def _clean(html: str) -> str:
    text = _TAG_RE.sub("", html)
    text = text.replace("&nbsp;", " ").replace("&#160;", " ")
    text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    text = text.replace("&quot;", '"').replace("&apos;", "'").replace("&#8217;", "’")
    return _WS_RE.sub(" ", text).strip()


def _extract_paragraphs(html: str) -> list[str]:
    """Pull substantive paragraphs out of the rendered Wikisource HTML."""
    paras: list[str] = []
    for raw in _PARAGRAPH_RE.findall(html):
        cleaned = _clean(raw)
        # Strip the embedded scan-note line that JoD glues onto its
        # attribution paragraph. Without this strip, the attribution gets
        # dropped along with the scan note and downstream attribution
        # checks fail.
        cleaned = _SCAN_NOTE_RE.sub(" ", cleaned).strip()
        if not cleaned:
            continue
        if len(cleaned) < 80:
            continue
        if _PAGEBREAK_HINT in cleaned:
            continue
        paras.append(cleaned)
    return paras


def scrape_wikisource(leaders: list[Leader]) -> list[SourceText]:
    """Scrape every page listed in wikisource_sources.yaml."""
    if not WIKISOURCE_SOURCES_YAML.exists():
        console.log("[yellow]no wikisource_sources.yaml — skipping wikisource scrape[/]")
        return []
    leader_lookup = {l.leader_id: l for l in leaders}
    with WIKISOURCE_SOURCES_YAML.open() as f:
        raw = yaml.safe_load(f) or {}

    out: list[SourceText] = []
    for entry in raw.get("sources", []):
        lid = entry["leader_id"]
        if lid not in leader_lookup:
            console.log(f"[yellow]skip {lid}: not in leaders.yaml[/]")
            continue
        page = entry["page"]
        work_title = entry["work_title"]
        year = entry.get("year")
        attribution_contains = entry.get("attribution_contains")

        try:
            html = _fetch_html(page)
        except Exception as e:
            console.log(f"[red]fetch failed for {page}: {e}[/]")
            continue

        paragraphs = _extract_paragraphs(html)
        if not paragraphs:
            console.log(f"[yellow]{page}: no substantive paragraphs[/]")
            continue

        # Attribution check — the first 1-2 paragraphs of a JoD page name
        # the speaker. If we require a substring and don't find it, skip
        # rather than misattribute. Case-insensitive (JoD is sometimes all-caps).
        if attribution_contains:
            # Scan a wider window — sometimes the attribution is the 3rd or
            # 4th paragraph (after a chapter heading, a TOC link, etc.).
            head = " ".join(paragraphs[:6]).lower()
            if attribution_contains.lower() not in head:
                console.log(
                    f"[yellow]{page}: expected '{attribution_contains}' not in head[:200] = "
                    f"{head[:200]!r} — skipping[/]"
                )
                continue

        # Drop the first 1-2 paragraphs if they are clearly chrome
        # (attribution / scan note), then concatenate the body. Case-insensitive
        # prefix check since JoD sometimes capitalizes the entire attribution.
        chrome_prefixes = (
            "a discourse",
            "a sermon",
            "a speech",
            "an address",
            "an oration",
            "delivered by",
            "reported by",
        )
        body_start = 0
        while body_start < len(paragraphs):
            head = paragraphs[body_start].lower()
            if any(head.startswith(p) for p in chrome_prefixes):
                body_start += 1
                continue
            if "discourse" in head[:40] or "delivered" in head[:80]:
                body_start += 1
                continue
            break
        body = "\n\n".join(paragraphs[body_start:])

        if len(body) < 400:
            console.log(f"[yellow]{page}: body too short ({len(body)} chars) after chrome strip[/]")
            continue

        source_url = f"https://en.wikisource.org/wiki/{page}"
        out.append(
            SourceText(
                leader_id=lid,
                religion=leader_lookup[lid].religion,
                work_title=work_title,
                source_url=source_url,
                text=body,
                year=year,
            )
        )
        console.log(f"  fetched {page} ({len(body)} chars, leader={lid})")
        time.sleep(0.3)  # polite to Wikisource

    return out
