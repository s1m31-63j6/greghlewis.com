"""archive.org plaintext scraper for public-domain religious texts.

Many historical religious works aren't on Wikisource (notably Olcott's
Buddhist Catechism and most of Spurgeon's sermons) but ARE on
archive.org with OCR'd plain text available at:

  https://archive.org/stream/<id>/<id>_djvu.txt

OCR quality is variable. We do light cleanup (de-hyphenate line breaks,
drop obvious page-number lines, strip running headers) but accept some
noise — the model is robust to it, and the alternative is no coverage
at all for these traditions.

Sources YAML format (`archive_org_sources.yaml`):

  sources:
    - leader_id: henry-olcott
      identifier: buddhistcatechis00olco
      work_title: The Buddhist Catechism
      year: 1881
      # Optional: split the text into N chunks if the source is very long
      # (a 26-sermon volume becomes ~26 SourceTexts rather than 1 giant one).
      split_into: 1
"""

from __future__ import annotations

import re
import time

import httpx
import yaml
from rich.console import Console

from chunk import SourceText
from common import PROJECT_ROOT, Leader

console = Console()

ARCHIVE_ORG_SOURCES_YAML = PROJECT_ROOT / "archive_org_sources.yaml"
USER_AGENT = "religious-voices-corpus/0.1 (https://greghlewis.com)"

_PAGE_NUMBER_LINE = re.compile(r"^\s*\d{1,4}\s*$")
_RUNNING_HEADER = re.compile(r"^\s*[A-Z][A-Z\s.,;'-]{3,}\s*$")
_HYPHEN_LINE_BREAK = re.compile(r"-\n\s*([a-z])")
_MULTI_SPACE = re.compile(r" {2,}")


def _fetch_text(identifier: str) -> str | None:
    url = f"https://archive.org/stream/{identifier}/{identifier}_djvu.txt"
    with httpx.Client(timeout=60, headers={"User-Agent": USER_AGENT}, follow_redirects=True) as c:
        r = c.get(url)
        if r.status_code != 200:
            return None
        return r.text


def _clean_ocr(text: str) -> str:
    """Light cleanup of archive.org OCR output."""
    # Fix hyphenated line breaks: "re-\nturn" -> "return"
    text = _HYPHEN_LINE_BREAK.sub(r"\1", text)
    # Strip standalone page numbers
    cleaned_lines: list[str] = []
    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped:
            cleaned_lines.append("")
            continue
        if _PAGE_NUMBER_LINE.match(stripped):
            continue
        # Drop short ALL-CAPS lines (running headers) unless they're
        # actually part of a heading paragraph (next-line continuity).
        if len(stripped) < 60 and _RUNNING_HEADER.match(stripped):
            continue
        cleaned_lines.append(line.rstrip())
    text = "\n".join(cleaned_lines)
    # Collapse 3+ blank lines into 2
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = _MULTI_SPACE.sub(" ", text)
    return text.strip()


def _split_into_n(text: str, n: int) -> list[str]:
    """Split a long source into n roughly-equal pieces at paragraph boundaries."""
    if n <= 1:
        return [text]
    paragraphs = text.split("\n\n")
    target = max(1, len(paragraphs) // n)
    out: list[str] = []
    for i in range(0, len(paragraphs), target):
        chunk = "\n\n".join(paragraphs[i : i + target])
        if len(chunk.strip()) > 200:
            out.append(chunk)
    return out


def scrape_archive_org(leaders: list[Leader]) -> list[SourceText]:
    if not ARCHIVE_ORG_SOURCES_YAML.exists():
        return []
    leader_lookup = {l.leader_id: l for l in leaders}
    with ARCHIVE_ORG_SOURCES_YAML.open() as f:
        raw = yaml.safe_load(f) or {}
    out: list[SourceText] = []
    for entry in raw.get("sources", []):
        lid = entry["leader_id"]
        if lid not in leader_lookup:
            console.log(f"[yellow]archive.org: skip {lid} (not in leaders.yaml)[/]")
            continue
        identifier = entry["identifier"]
        work_title = entry["work_title"]
        year = entry.get("year")
        split_into = entry.get("split_into", 1)

        text = _fetch_text(identifier)
        if not text:
            console.log(f"[yellow]archive.org: no plaintext for {identifier}[/]")
            continue
        cleaned = _clean_ocr(text)
        if len(cleaned) < 1000:
            console.log(f"[yellow]archive.org: {identifier} too short after clean ({len(cleaned)} chars)[/]")
            continue

        pieces = _split_into_n(cleaned, split_into)
        source_url = f"https://archive.org/details/{identifier}"
        for i, piece in enumerate(pieces):
            title = work_title if len(pieces) == 1 else f"{work_title} (part {i + 1}/{len(pieces)})"
            out.append(
                SourceText(
                    leader_id=lid,
                    religion=leader_lookup[lid].religion,
                    work_title=title,
                    source_url=source_url,
                    text=piece,
                    year=year,
                )
            )
        console.log(f"  archive.org fetched {identifier} -> {len(pieces)} part(s), {len(cleaned)} chars")
        time.sleep(0.5)
    return out
