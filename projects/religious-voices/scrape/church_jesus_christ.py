"""churchofjesuschrist.org General Conference scraper (1971-present).

The site renders pages via a JS SPA, but the data we need IS in the
initial HTML — under `window.__INITIAL_STATE__ = "<base64>"` where the
base64 decodes to a JSON object containing the talk body HTML.

Strategy:

  1. For each (year, month) from 1971/04 to today, fetch the session
     index page. The manifest in `contentStore[uri].content.body`
     contains links + speaker names for every talk in that session.
  2. For each talk whose speaker maps to one of our prophet leader_ids,
     fetch the individual talk page. Decode the same INITIAL_STATE blob;
     this time the body is the full talk HTML.
  3. Strip the HTML to clean paragraphs and emit a SourceText.

Speaker → leader_id map covers the LDS prophets who served any portion
of their presidency in the General Conference era (1971+). Pre-1971
coverage comes from the Journal of Discourses harvester for the early
prophets (Brigham Young through Joseph F. Smith) and from
archive.org's Conference Report archive (Heber J. Grant through
Joseph Fielding Smith) — see scrape/conference_report.py.
"""

from __future__ import annotations

import base64
import datetime as dt
import json
import re
import time

import httpx
from rich.console import Console

from chunk import SourceText
from common import Leader

console = Console()

BASE = "https://www.churchofjesuschrist.org"
SESSION_URL_FMT = "/study/general-conference/{year}/{month:02d}?lang=eng"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) "
    "Version/17.0 Safari/605.1.15"
)

# Speakers we care about and the leader_id each maps to. The site uses
# canonical name strings like "Russell M. Nelson" with periodic
# variations ("President Russell M. Nelson"). We match by substring,
# case-sensitive, on the byline.
SPEAKERS: list[tuple[str, str]] = [
    ("Russell M. Nelson", "russell-m-nelson"),
    ("Thomas S. Monson", "thomas-s-monson"),
    ("Gordon B. Hinckley", "gordon-b-hinckley"),
    ("Howard W. Hunter", "howard-w-hunter"),
    ("Ezra Taft Benson", "ezra-taft-benson"),
    ("Spencer W. Kimball", "spencer-w-kimball"),
    ("Harold B. Lee", "harold-b-lee"),
    ("Joseph Fielding Smith", "joseph-fielding-smith"),
    ("Dallin H. Oaks", "dallin-h-oaks"),
]

# Year range to crawl. 1971 was the first April conference published in
# the modern Ensign/Liahona format on the site.
YEARS = range(1971, dt.datetime.now().year + 1)
MONTHS = (4, 10)

_INITIAL_STATE_RE = re.compile(r'__INITIAL_STATE__="([^"]+)"')
_PARAGRAPH_RE = re.compile(r"<p[^>]*>(.*?)</p>", re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")
_ENTITIES = {
    "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
    "&apos;": "'", "&#8217;": "’", "&#8220;": "“", "&#8221;": "”",
    "&#8212;": "—", "&#8211;": "–",
}
_DROP_PARA_HINTS = (
    "list-tile",  # session-index list cards
    "Notes",      # footnote section header
)


def _decode_state(html: str) -> dict | None:
    m = _INITIAL_STATE_RE.search(html)
    if not m:
        return None
    try:
        decoded = base64.b64decode(m.group(1)).decode("utf-8")
        return json.loads(decoded)
    except Exception:
        return None


def _clean(html_fragment: str) -> str:
    text = _TAG_RE.sub("", html_fragment)
    for k, v in _ENTITIES.items():
        text = text.replace(k, v)
    return _WS_RE.sub(" ", text).strip()


def _extract_session_manifest(state: dict, uri: str) -> list[tuple[str, str, str]]:
    """Return list of (talk_uri, speaker, title) tuples from a session index."""
    cs = state.get("reader", {}).get("contentStore", {})
    container = cs.get(uri, {})
    body = container.get("content", {}).get("body", "")
    if not body:
        return []
    # Each talk is a <li> with primaryMeta=speaker, title=title, and an <a>.
    pattern = re.compile(
        r'<a href="(/study/general-conference/\d{4}/\d{2}/[^"]+)"[^>]*class="list-tile"[^>]*>'
        r"(.*?)</a>",
        re.DOTALL,
    )
    out: list[tuple[str, str, str]] = []
    for href, inner in pattern.findall(body):
        title_m = re.search(r'class="title"[^>]*>(.*?)</p>', inner, re.DOTALL)
        speaker_m = re.search(r'class="primaryMeta"[^>]*>(.*?)</p>', inner, re.DOTALL)
        if not title_m or not speaker_m:
            continue
        out.append((href.split("?")[0], _clean(speaker_m.group(1)), _clean(title_m.group(1))))
    return out


def _extract_talk_body(state: dict) -> str:
    """Return the cleaned paragraph body of a talk page."""
    cs = state.get("reader", {}).get("contentStore", {})
    if not cs:
        return ""
    # The talk page has exactly one entry in contentStore — use it.
    key = next(iter(cs))
    body_html = cs[key].get("content", {}).get("body", "")
    paragraphs: list[str] = []
    for raw in _PARAGRAPH_RE.findall(body_html):
        cleaned = _clean(raw)
        if not cleaned or len(cleaned) < 60:
            continue
        if any(h in cleaned for h in _DROP_PARA_HINTS):
            continue
        # Skip byline and intro-summary paragraphs from the head of the talk.
        if cleaned.startswith(("By ", "President of The Church", "Of the Quorum of")):
            continue
        paragraphs.append(cleaned)
    return "\n\n".join(paragraphs)


def _identify(speaker: str) -> str | None:
    for needle, lid in SPEAKERS:
        if needle in speaker:
            return lid
    return None


def scrape_general_conference(leaders: list[Leader]) -> list[SourceText]:
    leader_lookup = {l.leader_id: l for l in leaders}
    out: list[SourceText] = []
    today = dt.date.today()

    with httpx.Client(
        timeout=30, headers={"User-Agent": USER_AGENT}, follow_redirects=True
    ) as client:
        for year in YEARS:
            for month in MONTHS:
                # Don't fetch sessions that haven't happened yet
                if (year, month) > (today.year, today.month):
                    continue
                sess_path = SESSION_URL_FMT.format(year=year, month=month)
                try:
                    r = client.get(BASE + sess_path)
                except Exception as e:
                    console.log(f"[yellow]GC {year}/{month:02d}: fetch failed ({e})[/]")
                    continue
                if r.status_code != 200:
                    continue
                state = _decode_state(r.text)
                if not state:
                    continue
                uri = f"/eng/general-conference/{year}/{month:02d}"
                manifest = _extract_session_manifest(state, uri)
                target_talks = [(u, s, t) for (u, s, t) in manifest if _identify(s)]
                if not target_talks:
                    continue
                console.log(
                    f"GC {year}/{month:02d}: {len(manifest)} talks, "
                    f"{len(target_talks)} match target speakers"
                )
                for talk_uri, speaker, title in target_talks:
                    lid = _identify(speaker)
                    if lid is None or lid not in leader_lookup:
                        continue
                    try:
                        tr = client.get(BASE + talk_uri + "?lang=eng")
                    except Exception as e:
                        console.log(f"[yellow]  {talk_uri}: fetch failed ({e})[/]")
                        continue
                    if tr.status_code != 200:
                        continue
                    talk_state = _decode_state(tr.text)
                    if not talk_state:
                        continue
                    body = _extract_talk_body(talk_state)
                    if len(body) < 400:
                        continue
                    out.append(
                        SourceText(
                            leader_id=lid,
                            religion=leader_lookup[lid].religion,
                            work_title=f"{title} — General Conference {year}",
                            source_url=f"{BASE}{talk_uri}?lang=eng",
                            text=body,
                            year=year,
                        )
                    )
                    time.sleep(0.25)
                time.sleep(0.3)
    # Report
    from collections import Counter
    by_leader = Counter(s.leader_id for s in out)
    for lid, n in by_leader.most_common():
        console.log(f"  GC harvested {n} talks for {lid}")
    return out
