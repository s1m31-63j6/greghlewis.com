"""Orchestrator: gather source texts → chunk → embed → emit corpus JSON.

Two modes:

  --seed     Use seed_passages.yaml only. Fast (no network scrapes),
             produces a small corpus suitable for local testing of the
             full stack before the proper scrapers are wired in.

  (default)  Run all configured scrapers + seed passages. Produces the
             full ~2K-chunk corpus committed to the repo for production.

Outputs to /src/lib/religious-voices/:
  corpus.json       — chunks with embeddings (~5-10 MB gzipped)
  corpus.meta.json  — leader list for SSR dropdown population
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
from collections import Counter

from rich.console import Console

from chunk import SourceText, cap_per_leader, chunk_source
from common import OUTPUT_DIR, Leader, load_leaders
from embed import embed_chunks
from scrape.archive_org import scrape_archive_org
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


def write_outputs(leaders: list[Leader], chunks: list, *, embedded: bool) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    now = dt.datetime.utcnow().isoformat() + "Z"

    # meta — small, no embeddings, safe for SSR import
    meta_path = OUTPUT_DIR / "corpus.meta.json"
    meta_path.write_text(
        json.dumps(
            {
                "generated_at": now,
                "leaders": [
                    {
                        "leader_id": l.leader_id,
                        "religion": l.religion,
                        "full_name": l.full_name,
                        "role": l.role,
                        "dates": l.dates,
                        "era_start": l.era_start,
                        "themes": l.themes,
                    }
                    for l in leaders
                ],
            },
            indent=2,
        )
    )
    console.log(f"wrote {meta_path}")

    # corpus — full chunks (with embeddings if --no-embed wasn't passed)
    corpus_path = OUTPUT_DIR / "corpus.json"
    corpus_path.write_text(
        json.dumps(
            {
                "generated_at": now,
                "embedded": embedded,
                "chunks": [c.model_dump() for c in chunks],
            },
            indent=None,  # single-line JSON shrinks the file ~25%
            separators=(",", ":"),
        )
    )
    console.log(f"wrote {corpus_path} ({corpus_path.stat().st_size / 1_000_000:.1f} MB)")


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
        console.log("[yellow]--no-embed set; emitting corpus.json without embeddings[/]")
    else:
        embed_chunks(chunks)

    # Only emit leaders that actually have chunks — a dropdown entry with
    # no corpus would just be a dead end for the user.
    leaders_with_chunks = [l for l in leaders if l.leader_id in by_leader]
    skipped = [l.leader_id for l in leaders if l.leader_id not in by_leader]
    if skipped:
        console.log(f"[dim]skipping {len(skipped)} leaders with no chunks: {', '.join(skipped)}[/]")

    write_outputs(leaders_with_chunks, chunks, embedded=not args.no_embed)


if __name__ == "__main__":
    main()
