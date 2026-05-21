"""vatican.va scraper for papal encyclicals.

Wikisource has spotty coverage of papal encyclicals — most modern popes
(Pius XI onward) aren't fully transcribed there. The Vatican publishes
the official texts at vatican.va in clean HTML, freely usable.

Pages follow this structure:
  https://www.vatican.va/content/<pope>/<lang>/<doctype>/documents/<id>.html

The first ~5-10 paragraphs of each page are chrome (Holy See banner,
breadcrumbs, document metadata). We strip via a length+keyword filter.
"""

from __future__ import annotations

import re
import time
from urllib.parse import urlparse

import httpx
import yaml
from rich.console import Console

from chunk import SourceText
from common import PROJECT_ROOT, Leader

console = Console()

VATICAN_SOURCES_YAML = PROJECT_ROOT / "vatican_sources.yaml"
USER_AGENT = "religious-voices-corpus/0.1 (+https://greghlewis.com)"

_PARAGRAPH_RE = re.compile(r"<p[^>]*>(.*?)</p>", re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
_ENTITIES = {
    "&nbsp;": " ", "&#160;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
    "&quot;": '"', "&apos;": "'", "&#8217;": "’", "&#8220;": "“", "&#8221;": "”",
    "&#8211;": "–", "&#8212;": "—", "&times;": "", "&laquo;": "«", "&raquo;": "»",
}

# Vatican boilerplate that flags a paragraph as page chrome, not body.
_CHROME_MARKERS = (
    "the holy see",
    "[english]",
    "[ italiano",
    "back to top",
    "© libreria editrice vaticana",
    "copyright",
)


def _clean(html: str) -> str:
    text = _TAG_RE.sub("", html)
    for k, v in _ENTITIES.items():
        text = text.replace(k, v)
    return _WS_RE.sub(" ", text).strip()


def _is_chrome(text: str) -> bool:
    lower = text.lower()
    return any(m in lower for m in _CHROME_MARKERS)


def _fetch_paragraphs(url: str) -> list[str]:
    with httpx.Client(timeout=45, headers={"User-Agent": USER_AGENT}, follow_redirects=True) as c:
        r = c.get(url)
        if r.status_code != 200:
            return []
        html = r.text
    out: list[str] = []
    for raw in _PARAGRAPH_RE.findall(html):
        cleaned = _clean(raw)
        if not cleaned or len(cleaned) < 80:
            continue
        if _is_chrome(cleaned):
            continue
        out.append(cleaned)
    return out


def scrape_vatican(leaders: list[Leader]) -> list[SourceText]:
    if not VATICAN_SOURCES_YAML.exists():
        return []
    leader_lookup = {l.leader_id: l for l in leaders}
    with VATICAN_SOURCES_YAML.open() as f:
        raw = yaml.safe_load(f) or {}
    out: list[SourceText] = []
    for entry in raw.get("sources", []):
        lid = entry["leader_id"]
        if lid not in leader_lookup:
            continue
        url = entry["url"]
        work_title = entry["work_title"]
        year = entry.get("year")
        try:
            paragraphs = _fetch_paragraphs(url)
        except Exception as e:
            console.log(f"[yellow]vatican.va: {url} failed ({e})[/]")
            continue
        if len(paragraphs) < 5:
            host = urlparse(url).netloc
            console.log(f"[yellow]vatican.va: {host} {work_title[:50]} -> only {len(paragraphs)} paragraphs[/]")
            continue
        body = "\n\n".join(paragraphs)
        out.append(
            SourceText(
                leader_id=lid,
                religion=leader_lookup[lid].religion,
                work_title=work_title,
                source_url=url,
                text=body,
                year=year,
            )
        )
        console.log(f"  vatican.va fetched {work_title[:40]} ({len(paragraphs)} paras, leader={lid})")
        time.sleep(0.5)
    return out
