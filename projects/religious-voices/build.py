"""Orchestrator: gather source texts → chunk → embed → write to Chroma.

Two modes:

  --seed     Use seed_passages.yaml only. Fast (no network scrapes).
  (default)  Run all configured scrapers + seed passages.

Output: a persistent Chroma DB at projects/religious-voices/chroma_db/,
read at query time by the FastAPI server (server/main.py).
"""

from __future__ import annotations

import argparse
from collections import Counter

from rich.console import Console

from chunk import SourceText, cap_per_leader, chunk_source
from common import Leader, load_leaders
from embed_chroma import embed_to_chroma
from scrape.archive_org import scrape_archive_org
from scrape.church_jesus_christ import scrape_general_conference
from scrape.journal_of_discourses import scrape_journal_of_discourses
from scrape.seed import load_seed_passages
from scrape.vatican_va import scrape_vatican
from scrape.wikisource import scrape_wikisource

console = Console()


def gather_sources(leaders: list[Leader], seed_only: bool) -> list[SourceText]:
    """Pull source texts from all configured scrapers + the seed file."""
    sources: list[SourceText] = []

    # The seed passages are always included — small, hand-curated set of
    # public-domain excerpts useful for smoke-testing.
    sources.extend(load_seed_passages(leaders))

    # Wikisource is always available — it's the cleanest single-source for
    # public-domain religious texts and is the primary corpus driver in
    # this initial build. Add entries to wikisource_sources.yaml to grow.
    sources.extend(scrape_wikisource(leaders))

    if seed_only:
        return sources

    # JoD auto-harvester: discovers discourses across all 26 Journal of
    # Discourses volumes, attributes each to a known leader by name, and
    # emits SourceText. Significantly extends Mormon coverage in a single
    # pass without hand-listing each discourse in wikisource_sources.yaml.
    sources.extend(scrape_journal_of_discourses(leaders))

    # General Conference: extends LDS coverage from 1971 forward —
    # Spencer W. Kimball through Russell M. Nelson + Dallin H. Oaks.
    # Decodes the base64 INITIAL_STATE blob each modern LDS page ships
    # to get the talk body without needing a JS-rendering scraper.
    sources.extend(scrape_general_conference(leaders))

    # archive.org plaintext: covers traditions Wikisource is thin on —
    # Buddhist (Olcott) and Southern Baptist (Spurgeon).
    sources.extend(scrape_archive_org(leaders))

    # vatican.va: papal encyclicals from Leo XIII through Francis. Modern
    # popes (Pius XI onward) aren't on Wikisource so vatican.va is the
    # only path to coverage for the bulk of the Catholic timeline.
    sources.extend(scrape_vatican(leaders))

    # TODO: additional per-source scrapers go here as they're built out.
    # from scrape.general_conference import scrape as scrape_gc
    # from scrape.vatican_va import scrape as scrape_vatican
    # sources.extend(scrape_gc(leaders))
    # sources.extend(scrape_vatican(leaders))

    return sources


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--seed", action="store_true", help="Use seed_passages.yaml only (skip network scrapers)."
    )
    parser.add_argument(
        "--no-embed",
        action="store_true",
        help="Skip Bedrock embedding step. Emits corpus.json with empty embeddings — useful for fast iteration on chunk shape.",
    )
    parser.add_argument(
        "--cap", type=int, default=80, help="Max chunks per leader (balance dense vs sparse traditions)."
    )
    args = parser.parse_args()

    leaders = load_leaders()
    console.log(f"loaded {len(leaders)} leaders from leaders.yaml")

    sources = gather_sources(leaders, seed_only=args.seed)
    console.log(f"gathered {len(sources)} source documents")

    raw_chunks: list = []
    for src in sources:
        raw_chunks.extend(chunk_source(src))
    console.log(f"chunked into {len(raw_chunks)} blocks (pre-cap)")

    chunks = cap_per_leader(raw_chunks, cap=args.cap)
    by_leader = Counter(c.leader_id for c in chunks)
    console.log(f"capped to {len(chunks)} chunks across {len(by_leader)} leaders")
    for lid, n in sorted(by_leader.items(), key=lambda kv: -kv[1]):
        console.log(f"  {lid}: {n}")

    if args.no_embed:
        console.log("[yellow]--no-embed set; skipping embedding step[/]")
    else:
        # New path: sentence-transformers + Chroma. The Python LangChain
        # server (server/main.py) reads from Chroma at query time.
        embed_to_chroma(chunks)

    # Report which leaders made it into the corpus and which were skipped.
    # The Python server's /leaders endpoint filters dynamically based on
    # which leader_ids show up in the Chroma collection, so no separate
    # meta file is needed.
    skipped = [l.leader_id for l in leaders if l.leader_id not in by_leader]
    if skipped:
        console.log(f"[dim]skipping {len(skipped)} leaders with no chunks: {', '.join(skipped)}[/]")
    console.log(f"[green]done — {len(by_leader)} leaders in Chroma at projects/religious-voices/chroma_db/[/]")


if __name__ == "__main__":
    main()
