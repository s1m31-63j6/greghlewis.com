"""Sonnet structured trait extraction for the NFL prospect comparables engine.

Reads:
  - PlayerProfiles via engine.features.runner.load_cohort
  - Brugler + Walter Football text from corpus/brugler/<year>/<pid>.txt
    and corpus/walter_football/<pid>.txt

Writes:
  - JSON sidecars at corpus/sonnet_traits/<player_id>.json (per-trait score
    + supporting quote, anti-hallucination grounding)
  - Parquet at embeddings/trait_vectors/cohort=<X>/data.parquet with the
    numeric trait vector + observation mask, ready to plug into find_comps

Usage:
    # smoke: extract one prospect (no persistence)
    uv run python scripts/run_trait_extraction.py --smoke "Fernando Mendoza"

    # backfill a cohort (idempotent — skips prospects with existing sidecars)
    uv run python scripts/run_trait_extraction.py --cohort prediction_2026

    # force re-extract
    uv run python scripts/run_trait_extraction.py --cohort prediction_2026 --force
"""

from __future__ import annotations

import argparse
import io
import os
import sys
import time

import boto3
import polars as pl
from dotenv import load_dotenv

from engine.embedding import trait_extract
from engine.embedding.trait_schemas import trait_names_for
from engine.features import runner as feat_runner
from engine.schema import Position

load_dotenv()


DEFAULT_COHORTS = ("training_2014_2020", "validation_2021_2025", "prediction_2026")


def _persist_cohort_parquet(
    rows: list[dict], curated_bucket: str, cohort: str, *, s3
) -> str:
    df = pl.DataFrame(rows)
    key = f"embeddings/trait_vectors/cohort={cohort}/data.parquet"
    buf = io.BytesIO()
    df.write_parquet(buf)
    s3.put_object(Bucket=curated_bucket, Key=key, Body=buf.getvalue())
    return f"s3://{curated_bucket}/{key}"


def _print_traits(name: str, position: str, result) -> None:
    """Pretty-print one extraction result for human review."""
    print(f"\n  Traits for {name} ({position}):")
    names = trait_names_for(Position[position])
    for tn in names:
        twq = getattr(result.traits, tn)
        score = twq.score
        quote = twq.quote
        score_str = "--" if score is None else str(score)
        print(f"    {tn:28s}  {score_str:>3s}   {('"' + quote + '"') if quote else ''}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--smoke", help="Run on a single prospect by name (no persistence)")
    ap.add_argument(
        "--cohort",
        action="append",
        choices=DEFAULT_COHORTS,
        help="cohort to backfill (repeatable; default: all three)",
    )
    ap.add_argument(
        "--force",
        action="store_true",
        help="re-extract even if a sidecar already exists",
    )
    ap.add_argument("--region", default=None, help="Bedrock region (default: env)")
    ap.add_argument(
        "--limit", type=int, default=None,
        help="cap the number of prospects processed (for incremental runs)"
    )
    args = ap.parse_args()

    cur = os.environ["S3_CURATED_BUCKET"]
    region = args.region or os.environ.get("AWS_REGION", "us-east-1")
    s3 = boto3.client("s3")
    bedrock = boto3.client("bedrock-runtime", region_name=region)

    # ---- smoke path ----
    if args.smoke:
        # Search across all cohorts for the named prospect
        for cohort in DEFAULT_COHORTS:
            profiles = feat_runner.load_cohort(cur, cohort)
            match = next((p for p in profiles if p.name == args.smoke), None)
            if match is None:
                continue
            print(f"Found {args.smoke} in cohort {cohort} ({match.position.name})")
            print(f"Calling Sonnet 4.6 (temp=0)...")
            t0 = time.monotonic()
            result = trait_extract.extract_traits(
                match, s3=s3, curated_bucket=cur, bedrock_client=bedrock
            )
            elapsed = time.monotonic() - t0
            if result is None:
                print(f"  no scouting text available")
                return 1
            print(f"  done in {elapsed:.1f}s")
            _print_traits(match.name, match.position.name, result)
            print(f"\n  raw response: {result.raw_response[:200]}...")
            return 0
        print(f"prospect {args.smoke!r} not found in any cohort")
        return 1

    # ---- cohort backfill path ----
    cohorts = tuple(args.cohort) if args.cohort else DEFAULT_COHORTS
    for cohort in cohorts:
        print(f"\n=== {cohort} ===")
        profiles = feat_runner.load_cohort(cur, cohort)
        if args.limit:
            profiles = profiles[: args.limit]
        print(f"  loaded {len(profiles)} profiles")

        rows: list[dict] = []
        n_skip = 0
        n_extract = 0
        n_no_text = 0
        n_err = 0
        started = time.monotonic()

        for i, p in enumerate(profiles, 1):
            # Idempotent: skip if sidecar already exists
            existing = None if args.force else trait_extract.load_sidecar(
                p.player_id, s3=s3, curated_bucket=cur
            )
            if existing is not None:
                n_skip += 1
                # Still emit a row to the parquet from the persisted sidecar
                # so the parquet is the union of all known prospects.
                names = trait_names_for(p.position)
                vec = []
                mask = []
                for tn in names:
                    s = existing["traits"][tn].get("score")
                    if s is None:
                        vec.append(0.0)
                        mask.append(0.0)
                    else:
                        vec.append((float(s) - 3.0) / 2.0)
                        mask.append(1.0)
                rows.append({
                    "player_id": p.player_id,
                    "name": p.name,
                    "position": p.position.name,
                    "trait_vec": vec,
                    "trait_mask": mask,
                })
                continue

            try:
                result = trait_extract.extract_traits(
                    p, s3=s3, curated_bucket=cur, bedrock_client=bedrock
                )
            except Exception as e:
                n_err += 1
                print(f"  [{i}] ERROR on {p.name} ({p.player_id}): {e}")
                continue
            if result is None:
                n_no_text += 1
                continue
            trait_extract.persist_sidecar(result, s3=s3, curated_bucket=cur)
            rows.append({
                "player_id": result.player_id,
                "name": p.name,
                "position": result.position,
                "trait_vec": result.vec.tolist(),
                "trait_mask": result.mask.tolist(),
            })
            n_extract += 1
            if i % 10 == 0 or i == len(profiles):
                elapsed = time.monotonic() - started
                rate = (n_extract + 0.001) / max(elapsed, 0.001)
                print(
                    f"  [{i}/{len(profiles)}] extract={n_extract} skip={n_skip} "
                    f"no_text={n_no_text} err={n_err}  elapsed {elapsed/60:.1f} min  "
                    f"rate {rate:.1f}/s",
                    flush=True,
                )

        if rows:
            uri = _persist_cohort_parquet(rows, cur, cohort, s3=s3)
            print(f"  -> {uri}")
        print(
            f"  summary: extracted={n_extract} skipped={n_skip} "
            f"no_text={n_no_text} errors={n_err}"
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
