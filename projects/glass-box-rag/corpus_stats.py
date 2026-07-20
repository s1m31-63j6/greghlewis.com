"""Measure corpus diversity, so "we broadened it" is a number rather than a feeling.

Mean pairwise cosine similarity is the headline: a corpus where every document is
about the same doctrine scores high, and dense retrieval has little to discriminate
on. That is the current diagnosis — BM25 beats dense here, and HyDE drifts toward
whatever dominates the corpus.

Baseline before expansion (28 opinions, all AI-copyright fair use):
    chunks 759 | mean cosine 0.2808 | p90 0.4334 | ancestor:modern 528:231
"""

from __future__ import annotations

import json
from collections import Counter

import numpy as np
from rich.console import Console

from common import BUILD

console = Console()


def main() -> None:
    chunks = json.loads((BUILD / "chunks.json").read_text())
    meta = json.loads((BUILD / "vectors-titan.meta.json").read_text())
    V = np.fromfile(BUILD / "vectors-titan.bin", dtype=np.float32).reshape(
        meta["count"], meta["dims"]
    )

    S = V @ V.T
    iu = np.triu_indices(len(V), 1)
    sims = S[iu]

    # Same-case pairs are trivially similar; excluding them isolates whether the
    # CORPUS is varied rather than whether chunks of one opinion resemble each other.
    case_ids = np.array([c["case_id"] for c in chunks])
    cross = case_ids[iu[0]] != case_ids[iu[1]]

    console.print(f"[bold]{len(set(case_ids))} opinions | {len(chunks)} chunks[/bold]")
    console.print(f"  layer          {Counter(c['layer'] for c in chunks).most_common()}")
    console.print(f"  court level    {Counter(c['court_level'] for c in chunks).most_common()}")
    console.print(f"  decade         {sorted(Counter((c['year'] // 10) * 10 for c in chunks).items())}")
    console.print()
    console.print(f"  mean cosine (all pairs)        {sims.mean():.4f}")
    console.print(f"  mean cosine (different cases)  {sims[cross].mean():.4f}   <- diversity signal")
    console.print(f"  p90 cosine  (different cases)  {np.percentile(sims[cross], 90):.4f}")
    console.print(f"  p99 cosine  (different cases)  {np.percentile(sims[cross], 99):.4f}")


if __name__ == "__main__":
    main()
