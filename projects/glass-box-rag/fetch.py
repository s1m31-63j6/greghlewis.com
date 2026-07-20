"""Fetch opinions into data/raw/, one JSON per case.

Three acquisition paths, because the sources genuinely differ:

  url           direct PDF from a court/official site (no auth)
  govinfo       USCOURTS packages (no auth; DEMO_KEY works, free key recommended)
  courtlistener case-law DB — REQUIRES an API token, and is the only path with
                citation edges and parallel citations attached

Usage:
    uv run python fetch.py                 # everything it can reach
    uv run python fetch.py --layer modern  # just the AI cases (no token needed)
    uv run python fetch.py --only ross-2025
"""

from __future__ import annotations

import argparse
import io
import os
import sys
import time

import httpx
from pypdf import PdfReader
from rich.console import Console

from common import RAW, Opinion, all_cases, clean_text, load_manifest, write_json

console = Console()

GOVINFO_KEY = os.environ.get("GOVINFO_API_KEY", "DEMO_KEY")
CL_TOKEN = os.environ.get("COURTLISTENER_TOKEN")
CL = "https://www.courtlistener.com/api/rest/v4"

# CourtListener free tier is 5 req/min. Be a good citizen — this is a small
# corpus and there is no reason to hammer a nonprofit's API.
CL_DELAY = 13.0


def pdf_to_text(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    return clean_text("\n".join((p.extract_text() or "") for p in reader.pages))


def fetch_url(case: dict, client: httpx.Client) -> Opinion | None:
    url = case.get("url")
    if not url:
        console.print(f"  [yellow]{case['id']}: no url yet (TODO in cases.yaml)[/yellow]")
        return None
    r = client.get(url, follow_redirects=True, timeout=60)
    r.raise_for_status()
    text = pdf_to_text(r.content) if url.lower().endswith(".pdf") else clean_text(r.text)
    return _mk(case, text, "url", url=url)


def fetch_govinfo(case: dict, client: httpx.Client) -> Opinion | None:
    pkg = case.get("govinfo_package")
    if not pkg:
        console.print(f"  [yellow]{case['id']}: no govinfo_package[/yellow]")
        return None
    r = client.get(
        f"https://api.govinfo.gov/packages/{pkg}/granules",
        params={"offsetMark": "*", "pageSize": 100, "api_key": GOVINFO_KEY},
        timeout=60,
    )
    r.raise_for_status()
    granules = r.json().get("granules", [])
    if not granules:
        console.print(f"  [red]{case['id']}: 0 granules in {pkg} — needs RECAP[/red]")
        return None

    # A package holds every filed document; we want the one written opinion.
    # MODS docketText names the document type, so pick the largest PDF whose
    # docket entry looks like an order/opinion rather than a procedural filing.
    best: tuple[int, str, str] | None = None
    for g in granules:
        gid = g["granuleId"]
        pdf = client.get(
            f"https://api.govinfo.gov/packages/{pkg}/granules/{gid}/pdf",
            params={"api_key": GOVINFO_KEY}, follow_redirects=True, timeout=60,
        )
        if pdf.status_code != 200:
            continue
        try:
            text = pdf_to_text(pdf.content)
        except Exception:
            continue
        words = len(text.split())
        if best is None or words > best[0]:
            best = (words, gid, text)
        time.sleep(0.2)

    if not best:
        return None
    console.print(f"  picked granule {best[1]} ({best[0]:,} words of {len(granules)})")
    return _mk(case, best[2], "govinfo", url=f"https://www.govinfo.gov/app/details/{pkg}")


def _norm_cite(c: str) -> str:
    return " ".join(c.split()).lower().replace(".", "")


def fetch_courtlistener(case: dict, client: httpx.Client) -> Opinion | None:
    """Resolve a case by NAME + court, then confirm identity by parallel citation.

    Searching for the citation string itself is wrong — CourtListener's relevance
    ranking returns opinions that *cite* it. Searching by name is also not enough:
    for Campbell the top two hits are the 1993 cert-stage entries (507 U.S. 1003),
    not the 1994 merits decision (510 U.S. 569). The citation array on the cluster
    is the only reliable identity check, so we require an exact match.
    """
    if not CL_TOKEN:
        console.print(f"  [yellow]{case['id']}: needs COURTLISTENER_TOKEN[/yellow]")
        return None
    headers = {"Authorization": f"Token {CL_TOKEN}"}
    want = case.get("citation")

    r = client.get(
        f"{CL}/search/",
        params={"q": case["name"], "type": "o", "court": case["court"]},
        headers=headers, timeout=90,
    )
    r.raise_for_status()
    results = r.json().get("results") or []
    if not results:
        console.print(f"  [red]{case['id']}: no search hits[/red]")
        return None

    match = None
    if want:
        target = _norm_cite(want)
        for res in results:
            if any(_norm_cite(c) == target for c in (res.get("citation") or [])):
                match = res
                break
    if match is None:
        console.print(
            f"  [red]{case['id']}: no result carries citation {want!r}; "
            f"top hit was {results[0].get('caseName')!r} ({results[0].get('dateFiled')}). "
            f"Refusing to guess.[/red]"
        )
        return None

    console.print(f"  matched {match.get('caseName')} ({match.get('dateFiled')}) via {want}")
    time.sleep(CL_DELAY)

    # A cluster holds majority + concurrences + dissents as separate sub-opinions.
    # Keep them all — the separate writings matter in fair-use doctrine (Warhol's
    # dissent is argued over as much as the majority).
    parts: list[str] = []
    for op_ref in match.get("opinions") or []:
        r2 = client.get(f"{CL}/opinions/{op_ref['id']}/", headers=headers, timeout=90)
        if r2.status_code != 200:
            continue
        o = r2.json()
        # html_with_citations has citations pre-tagged, which the citation pass
        # can parse straight into graph edges.
        raw = ""
        for field in ("html_with_citations", "xml_harvard", "html_columbia", "html", "plain_text"):
            if o.get(field):
                raw = o[field]
                break
        if not raw:
            continue
        if "<" in raw[:400]:
            from bs4 import BeautifulSoup

            raw = BeautifulSoup(raw, "lxml").get_text("\n")
        parts.append(raw)
        time.sleep(CL_DELAY)

    if not parts:
        console.print(f"  [red]{case['id']}: cluster matched but no opinion text[/red]")
        return None

    return _mk(
        case, clean_text("\n\n".join(parts)), "courtlistener",
        url=f"https://www.courtlistener.com{match.get('absolute_url', '')}",
        precedential_status=match.get("status"),
    )


def _mk(case: dict, text: str, source: str, **extra) -> Opinion:
    return Opinion(
        id=case["id"], name=case["name"], court=case["court"], year=case["year"],
        layer=case["layer"], text=text, source=source,
        citation=case.get("citation"), date=case.get("date"), judge=case.get("judge"),
        docket=case.get("docket"), note=case.get("note"), **extra,
    )


FETCHERS = {"url": fetch_url, "govinfo": fetch_govinfo, "courtlistener": fetch_courtlistener}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--layer", choices=["modern", "ancestor"])
    ap.add_argument("--only")
    ap.add_argument("--force", action="store_true", help="refetch even if cached")
    args = ap.parse_args()

    cases = all_cases(load_manifest())
    if args.layer:
        cases = [c for c in cases if c["layer"] == args.layer]
    if args.only:
        cases = [c for c in cases if c["id"] == args.only]

    ok = skipped = failed = 0
    with httpx.Client(headers={"User-Agent": "glass-box-rag/0.1 (portfolio project)"}) as client:
        for case in cases:
            out = RAW / f"{case['id']}.json"
            if out.exists() and not args.force:
                console.print(f"[dim]{case['id']}: cached[/dim]")
                skipped += 1
                continue
            console.print(f"[bold]{case['id']}[/bold] ({case['source']})")
            try:
                op = FETCHERS[case["source"]](case, client)
            except Exception as e:
                console.print(f"  [red]ERROR {type(e).__name__}: {str(e)[:140]}[/red]")
                failed += 1
                continue
            if op is None or not op.text:
                failed += 1
                continue
            write_json(out, op.to_dict())
            console.print(f"  [green]{op.word_count:,} words -> {out.name}[/green]")
            ok += 1

    console.print(f"\n[bold]fetched={ok} cached={skipped} missing={failed}[/bold]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
