"""Scrape additional ESPN articles that don't fit the H2 ranked-heading
parser used in run_corpus_espn.py.

Specifically, the "First-round grades + comps" article uses an h2 layout
of `Name, School (No. <rank>)` per prospect — different from the
`<rank>.Name, POS, School` format on Miller / Reid / Kiper / Legwold
boards. Each prospect H2 is followed by 3-6 paragraphs of prose including
ESPN's NFL pro comp.

Source label = `espn` (same as the ranked-board scraper) so retrieval
treats them as a unified ESPN voice.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import time

import boto3
from bs4 import BeautifulSoup, Tag
from dotenv import load_dotenv

from engine.corpus import cbs_sports as cbs
from engine.features import runner as feat_runner

load_dotenv()


# H2 like "Fernando Mendoza, Indiana (No. 2)" — name, school, parenthesized rank
_FR_HEADING_RE = re.compile(
    r"^(?P<name>[A-Z][A-Za-z'\.\-]+(?:\s+[A-Z][A-Za-z'\.\-]+){1,4})\s*,\s*"
    r"(?P<school>[^()]+?)\s*\((?:No\.\s+)?(?P<rank>\d+)\)\s*$"
)


def _text(node: Tag) -> str:
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()


def parse_first_round_grades(html: str) -> list[tuple[int, str, str, str]]:
    """Return [(rank, name, school, prose)]. Walks the DOM in document order,
    treats each FR-pattern H2 as a section start, and accumulates following
    <p> siblings until the next prospect H2."""
    soup = BeautifulSoup(html, "lxml")
    out: list[tuple[int, str, str, str]] = []
    current: tuple[int, str, str] | None = None
    buffer: list[str] = []

    def _flush() -> None:
        nonlocal buffer, current
        if current and buffer:
            prose = " ".join(b for b in buffer if b).strip()
            if prose:
                rank, name, school = current
                out.append((rank, name, school, prose))
        buffer = []

    for el in soup.find_all(["h1", "h2", "h3", "p"]):
        if not isinstance(el, Tag):
            continue
        text = _text(el)
        if not text:
            continue
        if el.name == "h2":
            m = _FR_HEADING_RE.match(text)
            if m:
                _flush()
                current = (int(m.group("rank")), m.group("name").strip(),
                           m.group("school").strip())
                continue
            # Position-group section headings ("Quarterback (1)") — flush
            # current entry and clear (no new prospect started).
            _flush()
            current = None
        elif el.name == "p" and current is not None:
            buffer.append(text)
    _flush()
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cohort", action="append", default=None)
    args = ap.parse_args()

    cohorts = args.cohort or ["prediction_2026"]
    cur = os.environ["S3_CURATED_BUCKET"]
    s3 = boto3.client("s3")
    session = cbs.make_session()

    cohort_players = []
    for name in cohorts:
        cohort_players.extend(feat_runner.load_cohort(cur, name))
    name_index: dict[str, list] = {}
    import unicodedata as _u
    def _norm(s: str) -> str:
        s = _u.normalize("NFKD", s)
        s = "".join(c for c in s if not _u.combining(c))
        return re.sub(r"[^\w\s]", " ", s.lower()).strip()
    for p in cohort_players:
        name_index.setdefault(_norm(p.name), []).append(p)

    # ----- ESPN First-Round Grades + Comps -----
    url = "https://www.espn.com/nfl/draft2026/story/_/id/47455728/2026-nfl-draft-board-prospects-first-round-grades-comps"
    html = session.get(url, timeout=30).text
    entries = parse_first_round_grades(html)
    print(f"first-round grades: {len(entries)} prospect entries")

    written = 0
    unmatched: list[str] = []
    for rank, name, school, prose in entries:
        candidates = name_index.get(_norm(name), [])
        if len(candidates) != 1:
            unmatched.append(name)
            continue
        prof = candidates[0]
        slug = "47455728-2026-nfl-draft-first-round-grades-comps"
        key = f"corpus/recency/espn/{prof.player_id}__{slug}.txt"
        text = (
            f"# ESPN First-Round Grades + Comps — {prof.name} (No. {rank})\n"
            f"School: {school}\n\n{prose}\n"
        )
        s3.put_object(Bucket=cur, Key=key, Body=text.encode("utf-8"))
        written += 1
    print(f"  wrote {written}, unmatched ({len(unmatched)})")

    # ----- ESPN 100 Skills/Traits article -----
    # H2 layout: "Most accurate passer: Fernando Mendoza, Indiana"
    skills_url = ("https://www.espn.com/nfl/draft2026/story/_/id/48428711/"
                  "2026-nfl-draft-best-prospects-skills-traits-standouts-positions-superlatives-best")
    html2 = session.get(skills_url, timeout=30).text
    soup = BeautifulSoup(html2, "lxml")
    skill_re = re.compile(
        r"^(?P<trait>[^:]+?):\s*(?P<name>[A-Z][A-Za-z'\.\-]+(?:\s+[A-Z][A-Za-z'\.\-]+){1,4})"
        r"\s*,\s*(?P<school>.+?)\s*$"
    )
    skill_written = 0
    skill_dedup: dict[str, int] = {}
    for h2 in soup.find_all("h2"):
        text = _text(h2)
        m = skill_re.match(text)
        if not m:
            continue
        name = m.group("name").strip()
        candidates = name_index.get(_norm(name), [])
        if len(candidates) != 1:
            continue
        prof = candidates[0]
        # Each prospect can have MULTIPLE traits — accumulate counter per
        # player_id so we don't overwrite across the article.
        counter = skill_dedup.get(prof.player_id, 0) + 1
        skill_dedup[prof.player_id] = counter
        slug = f"48428711-skill-{counter}"
        key = f"corpus/recency/espn/{prof.player_id}__{slug}.txt"
        # Capture the immediately-following <p> tags as the trait prose.
        prose_parts: list[str] = []
        for sib in h2.find_all_next(["h2", "p"], limit=4):
            if sib.name == "h2":
                break
            ptext = _text(sib)
            if ptext:
                prose_parts.append(ptext)
        prose = " ".join(prose_parts).strip()
        body = (
            f"# ESPN Skills/Traits — {prof.name}: {m.group('trait').strip()}\n"
            f"School: {m.group('school').strip()}\n\n"
            f"{prose if prose else m.group('trait').strip()}\n"
        )
        s3.put_object(Bucket=cur, Key=key, Body=body.encode("utf-8"))
        skill_written += 1
    print(f"skills/traits: wrote {skill_written} files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
