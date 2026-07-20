"""Ablation harness: measure what each retrieval stage is actually worth.

Scored at CASE level, not chunk level. The question "did the system find Bartz?"
is what a lawyer cares about; which of Bartz's 28 chunks came back is an
implementation detail.

Metrics:
  critical_recall  fraction of `critical` cases retrieved. The headline number —
                   missing a critical case makes the answer wrong, not just thin.
  recall           fraction of all `gold` cases retrieved.
  precision        fraction of retrieved cases that are gold.
  mrr              1/rank of the first gold case.
  violations       count of `forbidden` cases retrieved (the anachronism trap).

Usage:
    uv run python evaluate.py                 # full ablation grid
    uv run python evaluate.py --top 5
    uv run python evaluate.py --json out.json # for the Evaluation tab
"""

from __future__ import annotations

import argparse
import json
import statistics as st
import sys
from dataclasses import asdict, dataclass

import yaml
from rich.console import Console
from rich.table import Table

from common import BUILD, ROOT
from retrieve import Config, Index, search

console = Console()


@dataclass
class Score:
    label: str
    critical_recall: float
    recall: float
    precision: float
    mrr: float
    violations: int


def cases_of(index: Index, hits) -> list[str]:
    """Retrieved case ids, first-occurrence order preserved."""
    out: list[str] = []
    for h in hits:
        cid = index.chunks[h.idx]["case_id"]
        if cid not in out:
            out.append(cid)
    return out


def score_one(index: Index, q: dict, cfg: Config) -> tuple[float, float, float, float, int]:
    hits = search(index, q["q"], cfg, as_of=q.get("as_of"))
    got = cases_of(index, hits)
    gold = set(q["gold"])
    crit = set(q.get("critical") or q["gold"])
    forbidden = set(q.get("forbidden") or [])

    crit_recall = len(crit & set(got)) / len(crit) if crit else 1.0
    recall = len(gold & set(got)) / len(gold) if gold else 1.0
    precision = len(gold & set(got)) / len(got) if got else 0.0
    mrr = 0.0
    for i, c in enumerate(got):
        if c in gold:
            mrr = 1.0 / (i + 1)
            break
    return crit_recall, recall, precision, mrr, len(forbidden & set(got))


def run_config(index: Index, questions: list[dict], cfg: Config) -> Score:
    rows = [score_one(index, q, cfg) for q in questions]
    return Score(
        label=cfg.label,
        critical_recall=st.mean(r[0] for r in rows),
        recall=st.mean(r[1] for r in rows),
        precision=st.mean(r[2] for r in rows),
        mrr=st.mean(r[3] for r in rows),
        violations=sum(r[4] for r in rows),
    )


GRID = [
    Config(use_bm25=True, use_dense=False, use_rerank=False, per_case=None),
    Config(use_bm25=False, use_dense=True, use_rerank=False, per_case=None),
    Config(use_bm25=True, use_dense=True, use_rerank=False, per_case=None),
    Config(use_bm25=True, use_dense=True, use_rerank=False, per_case=2),
    Config(use_bm25=False, use_dense=True, use_rerank=True, per_case=2),
    Config(use_bm25=True, use_dense=True, use_rerank=True, per_case=None),
    Config(use_bm25=True, use_dense=True, use_rerank=True, per_case=2),
    Config(use_bm25=True, use_dense=True, use_rerank=True, per_case=2,
           diversify_after_rerank=True),
    Config(use_bm25=True, use_dense=True, use_rerank=True, per_case=3,
           diversify_after_rerank=True),
    Config(use_bm25=True, use_dense=True, use_rerank=True, per_case=2,
           diversify_after_rerank=True, use_as_of=True),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=10)
    ap.add_argument("--json")
    args = ap.parse_args()

    questions = yaml.safe_load((ROOT / "golden.yaml").read_text())["questions"]
    index = Index()
    console.print(f"{len(questions)} golden questions | {len(index.chunks)} chunks | top-{args.top}\n")

    scores: list[Score] = []
    for cfg in GRID:
        cfg.top = args.top
        s = run_config(index, questions, cfg)
        scores.append(s)
        console.print(f"  [dim]{s.label}[/dim]")

    table = Table("configuration", "crit recall", "recall", "precision", "MRR", "anachronisms")
    best = max(s.critical_recall for s in scores)
    for s in scores:
        mark = " ←" if s.critical_recall == best else ""
        table.add_row(
            s.label + mark,
            f"{s.critical_recall:.3f}",
            f"{s.recall:.3f}",
            f"{s.precision:.3f}",
            f"{s.mrr:.3f}",
            str(s.violations),
        )
    console.print()
    console.print(table)

    out = args.json or (BUILD / "ablation.json")
    (BUILD).mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        json.dump({"top_k": args.top, "n_questions": len(questions),
                   "results": [asdict(s) for s in scores]}, f, indent=1)
    console.print(f"\n[green]wrote {out}[/green]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
