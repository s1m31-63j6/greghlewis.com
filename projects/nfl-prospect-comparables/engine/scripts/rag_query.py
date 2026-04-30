"""RAG smoke test against the NFL comparables Bedrock Knowledge Base.

Run from engine/ (after `cdk deploy NflComparablesKb` and ingestion):
    uv run python scripts/rag_query.py --query "tell me about Fernando Mendoza"
    uv run python scripts/rag_query.py --query "what's Carnell Tate's archetype" --top-k 8
    uv run python scripts/rag_query.py --query "who looks like Bijan Robinson in the 2026 class"
"""

from __future__ import annotations

import argparse
import sys
import textwrap

from dotenv import load_dotenv

from engine.rag.knowledge_base import retrieve_and_generate
from engine.rag.name_index import resolve_name

load_dotenv()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Query the NFL comparables KB.")
    p.add_argument("--query", required=True, help="Natural-language question")
    p.add_argument("--top-k", type=int, default=6, help="Chunks to retrieve")
    p.add_argument(
        "--model",
        default=None,
        help="Override the inference profile (default: us.anthropic.claude-sonnet-4-6)",
    )
    p.add_argument(
        "--no-auto-filter",
        action="store_true",
        help="Skip name-resolution; retrieve over the whole KB unfiltered",
    )
    args = p.parse_args(argv)

    kwargs = {"num_results": args.top_k, "auto_filter": not args.no_auto_filter}
    if args.model:
        kwargs["model_id"] = args.model

    if not args.no_auto_filter:
        result = resolve_name(args.query)
        if result.primary is not None:
            print(f"  resolved [{result.tier}] → {result.primary.name} "
                  f"({result.primary.position}, "
                  f"player_id={result.primary.player_id}, "
                  f"{result.primary.cohort})")
            if len(result.candidates) > 1:
                others = [
                    f"{c.name} [{c.cohort.split('_')[0]}]"
                    for c in result.candidates[1:]
                ]
                print(f"  alternatives: {', '.join(others)}")
            for note in result.notes:
                print(f"  note: {note}")
            print()
        else:
            print("  no name match — vanilla retrieval\n")

    resp = retrieve_and_generate(args.query, **kwargs)

    print("─" * 72)
    print("ANSWER")
    print("─" * 72)
    print(textwrap.fill(resp.answer.strip(), width=72))
    print()
    print("─" * 72)
    print(f"RETRIEVED CHUNKS ({len(resp.chunks)})")
    print("─" * 72)
    for i, c in enumerate(resp.chunks, 1):
        path = c.source_uri.split("/", 3)[-1] if c.source_uri else "(no uri)"
        print(f"\n[{i}] {c.source_name}  score={c.score:.3f}")
        print(f"    {path}")
        print(f"    {textwrap.shorten(c.text.replace(chr(10), ' '), width=64)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
