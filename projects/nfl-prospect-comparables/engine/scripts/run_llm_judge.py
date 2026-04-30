"""Phase 3.4 — LLM-as-judge eval (Bedrock Haiku 4.5).

For each cohort prospect with both engine top-K and expert-named comps,
classify each pair as one of:
  AGREED:      engine top-K ∩ expert names  (sanity check — should score high)
  ENGINE_ONLY: engine picks not in expert    (the headline question)
  EXPERT_ONLY: expert names not in engine top-K

Score every pair 1-5 via Haiku 4.5 with a structured rubric, aggregate,
and report. Answer: when engine and analysts disagree, is the engine's
pick *also* defensible? Or are the analysts strictly correct?

Run from engine/:
    uv run python scripts/run_llm_judge.py --limit 30
    uv run python scripts/run_llm_judge.py --arm hybrid --top-k 5
    uv run python scripts/run_llm_judge.py --persist-results
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from collections import defaultdict
from dataclasses import asdict

import boto3
from dotenv import load_dotenv

from engine.eval import expert_jaccard, llm_judge
from engine.io import s3 as s3io

load_dotenv()


CATEGORY_AGREED = "AGREED"
CATEGORY_ENGINE_ONLY = "ENGINE_ONLY"
CATEGORY_EXPERT_ONLY = "EXPERT_ONLY"


def build_query(
    prospect_id: str,
    candidate_id: str,
    pool_meta: dict,
    pool,
    s3,
    curated_bucket: str,
):
    """Construct a JudgeQuery from in-pool metadata + S3 corpus text."""
    pm = pool_meta.get(prospect_id, {})
    cm = pool_meta.get(candidate_id, {})
    if not pm or not cm:
        return None
    text = llm_judge.load_corpus_text(
        s3, curated_bucket, prospect_id, pm.get("draft_year")
    )
    return llm_judge.JudgeQuery(
        prospect_name=pm.get("name", "?"),
        prospect_position=pm.get("position", "?"),
        prospect_college=pm.get("college"),
        prospect_year=pm.get("draft_year"),
        prospect_text=text,
        comp_name=cm.get("name", "?"),
        comp_position=cm.get("position", "?"),
        comp_year=cm.get("draft_year"),
        comp_college=cm.get("college"),
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--arm", default="hybrid", help="engine arm (default: hybrid)")
    ap.add_argument("--top-k", type=int, default=5)
    ap.add_argument("--limit", type=int, default=0, help="cap to first N prospects (0 = all)")
    ap.add_argument("--examples", type=int, default=8, help="show N example judgments")
    ap.add_argument("--persist-results", action="store_true",
                    help="write per-judgment JSON to s3://<curated>/eval/llm_judge/<run_ts>.json")
    args = ap.parse_args()

    cur = os.environ["S3_CURATED_BUCKET"]
    s3 = boto3.client("s3")
    bedrock = llm_judge.make_bedrock_client()

    print("=" * 78)
    print(f"Phase 3.4 — LLM-as-judge (arm={args.arm}, top_k={args.top_k}, limit={args.limit or 'all'})")
    print(f"  model: {llm_judge.JUDGE_MODEL_ID}")
    print("=" * 78)

    print("\nloading engine pool + metadata + expert comps...")
    pool, pool_meta = llm_judge.load_pool_with_metadata(cur, arm=args.arm)
    name_idx = expert_jaccard.build_name_index(pool)
    expert_data = expert_jaccard.load_expert_comps(cur)
    print(f"  pool: {pool.df.height} players  |  expert-comp records: {len(expert_data)}")

    # Build per-prospect (engine_pids, expert_pids) sets
    eval_targets = []
    for pid, rec in expert_data.items():
        if pid not in pool_meta:
            continue
        all_expert = []
        for src in ("brugler", "walter_football"):
            for name in rec.get(src, []):
                if name not in all_expert:
                    all_expert.append(name)
        if not all_expert:
            continue
        expert_pids, _ = expert_jaccard.resolve_expert_names_to_pool(all_expert, name_idx)
        if not expert_pids:
            continue
        # engine top-K
        from engine.embedding import comps as comps_mod
        engine_results = comps_mod.find_comps(
            pool, query_player_id=pid, top_k=args.top_k, same_position_only=True
        )
        if not engine_results:
            continue
        engine_pids = {c.player_id for c in engine_results}
        agreed = engine_pids & expert_pids
        engine_only = engine_pids - expert_pids
        expert_only = expert_pids - engine_pids
        eval_targets.append({
            "prospect_id": pid,
            "agreed": agreed,
            "engine_only": engine_only,
            "expert_only": expert_only,
        })

    if args.limit > 0:
        eval_targets = eval_targets[:args.limit]
    print(f"  {len(eval_targets)} prospects in eval set")

    # Score each pair
    judgments: list[dict] = []
    n_calls = 0
    started = time.monotonic()
    total_pairs = sum(
        len(t["agreed"]) + len(t["engine_only"]) + len(t["expert_only"])
        for t in eval_targets
    )
    print(f"  total pairs to score: {total_pairs}")

    in_token_total = 0
    out_token_total = 0
    for i, tgt in enumerate(eval_targets, 1):
        for category, pids in (
            (CATEGORY_AGREED, tgt["agreed"]),
            (CATEGORY_ENGINE_ONLY, tgt["engine_only"]),
            (CATEGORY_EXPERT_ONLY, tgt["expert_only"]),
        ):
            for cid in pids:
                q = build_query(tgt["prospect_id"], cid, pool_meta, pool, s3, cur)
                if q is None:
                    continue
                try:
                    r = llm_judge.call_judge(q, bedrock_client=bedrock)
                except Exception as e:
                    print(f"  judge error {q.prospect_name} → {q.comp_name}: {e}")
                    continue
                n_calls += 1
                in_token_total += r.input_tokens
                out_token_total += r.output_tokens
                judgments.append({
                    "prospect_id": tgt["prospect_id"],
                    "prospect_name": q.prospect_name,
                    "prospect_position": q.prospect_position,
                    "comp_id": cid,
                    "comp_name": q.comp_name,
                    "category": category,
                    "score": r.score,
                    "reasoning": r.reasoning,
                })
        if i % 5 == 0 or i == len(eval_targets):
            elapsed = time.monotonic() - started
            print(
                f"  [{i}/{len(eval_targets)}] calls={n_calls}  elapsed {elapsed/60:.1f} min  "
                f"in_toks={in_token_total} out_toks={out_token_total}",
                flush=True,
            )

    # Aggregate
    print("\n" + "=" * 78)
    print(f"LLM JUDGE SUMMARY ({n_calls} judgments)")
    print("=" * 78)
    by_cat: dict[str, list[int]] = defaultdict(list)
    for j in judgments:
        if j["score"] > 0:
            by_cat[j["category"]].append(j["score"])

    for cat in (CATEGORY_AGREED, CATEGORY_ENGINE_ONLY, CATEGORY_EXPERT_ONLY):
        scores = by_cat.get(cat, [])
        n = len(scores)
        avg = sum(scores) / n if n else 0
        defended = sum(1 for s in scores if s >= 3) / n if n else 0
        strong = sum(1 for s in scores if s >= 4) / n if n else 0
        print(
            f"  {cat:>14}  n={n:>3d}  avg={avg:.2f}  "
            f"defended (≥3)={100*defended:.0f}%  strong (≥4)={100*strong:.0f}%"
        )

    # By position breakdown for ENGINE_ONLY
    print("\n--- ENGINE_ONLY by position ---")
    by_pos: dict[str, list[int]] = defaultdict(list)
    for j in judgments:
        if j["category"] == CATEGORY_ENGINE_ONLY and j["score"] > 0:
            by_pos[j["prospect_position"]].append(j["score"])
    for pos, scores in sorted(by_pos.items()):
        n = len(scores)
        avg = sum(scores) / n if n else 0
        defended = sum(1 for s in scores if s >= 3) / n if n else 0
        print(f"  {pos}: n={n:>3d}  avg={avg:.2f}  defended (≥3)={100*defended:.0f}%")

    # Examples
    if args.examples > 0:
        print(f"\n--- {args.examples} ENGINE_ONLY examples (highest score first) ---")
        engine_only_judgments = [j for j in judgments if j["category"] == CATEGORY_ENGINE_ONLY]
        engine_only_judgments.sort(key=lambda j: -j["score"])
        for j in engine_only_judgments[:args.examples]:
            print(f"  [{j['score']}] {j['prospect_name']} ({j['prospect_position']}) → {j['comp_name']}")
            print(f"      {j['reasoning']}")

    if args.persist_results and judgments:
        run_ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
        key = f"eval/llm_judge/{run_ts}.json"
        s3io._client().put_object(
            Bucket=cur,
            Key=key,
            Body=json.dumps({
                "arm": args.arm, "top_k": args.top_k,
                "model": llm_judge.JUDGE_MODEL_ID,
                "judgments": judgments,
                "input_tokens": in_token_total,
                "output_tokens": out_token_total,
            }, indent=2).encode("utf-8"),
            ContentType="application/json",
        )
        print(f"\n  → s3://{cur}/{key}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
