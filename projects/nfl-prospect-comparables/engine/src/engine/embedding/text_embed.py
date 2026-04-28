"""Phase 2.5 — Bedrock Titan v2 text embedding + hybrid vector construction.

Per profile: read Wikipedia + Brugler text from curated bucket → concat with
section markers (Brugler first since it's the higher-quality scouting source)
→ truncate to fit Titan v2's 8K-token input → embed (1024-dim) → L2-normalize.

Hybrid vector: concat L2-normalized feature vector (from Phase 2.1) and
L2-normalized text embedding. Cosine similarity between two such vectors is
(feature_cos + text_cos) / 2 — equal weighting of the two halves, which lets
the Phase 3 ablation eval cleanly swap arms.

Profiles with no text (neither Wiki nor Brugler) get a zero text_vec; their
hybrid distance is dominated by the feature half.
"""

from __future__ import annotations

import io
import json
from dataclasses import dataclass

import boto3
import numpy as np
import polars as pl
from botocore.exceptions import ClientError

from engine.io import s3 as s3io
from engine.schema import PlayerProfile


# Titan v2 Embed Text — 1024-dim output, 8K input tokens (8192 max).
TITAN_MODEL_ID = "amazon.titan-embed-text-v2:0"
TITAN_DIM = 1024
# Default char cap. Titan's BPE tokenizer is closer to 3 chars/token for
# dense English (Brugler scouting prose has fewer common tokens than casual
# text). 22K chars fits ~7300 tokens with headroom; bedrock_embed
# automatically retries with progressively shorter text on token-overflow.
MAX_TEXT_CHARS = 22_000


# ---------- text consolidation ----------


def _read_or_none(s3, bucket: str, key: str) -> str | None:
    try:
        body = s3.get_object(Bucket=bucket, Key=key)["Body"].read().decode("utf-8")
        return body
    except ClientError:
        return None


def consolidate_text(
    profile: PlayerProfile,
    *,
    s3,
    bucket: str,
) -> tuple[str, dict[str, bool]]:
    """Read Wikipedia + Brugler text for `profile`, return concatenated text
    plus a dict of which sources were available.

    Brugler is placed first because it's pre-draft scouting (higher signal
    for prospect comparison than Wikipedia's retrospective bio). If Brugler
    truncation pushes Wikipedia content out of the input window, we still
    keep the more substantive source.
    """
    sources_present = {"brugler": False, "wikipedia": False}
    parts: list[str] = []

    year = profile.draft.draft_year if profile.draft else None
    if year is not None:
        brug_key = f"corpus/brugler/{year}/{profile.player_id}.txt"
        brug = _read_or_none(s3, bucket, brug_key)
        if brug:
            sources_present["brugler"] = True
            parts.append(f"## Pre-draft scouting profile (Brugler {year})\n\n{brug}")

    wiki_key = f"corpus/wikipedia/{profile.player_id}.txt"
    wiki = _read_or_none(s3, bucket, wiki_key)
    if wiki:
        sources_present["wikipedia"] = True
        parts.append(f"## Wikipedia bio\n\n{wiki}")

    text = "\n\n".join(parts)
    if len(text) > MAX_TEXT_CHARS:
        text = text[:MAX_TEXT_CHARS]
    return text, sources_present


# ---------- Bedrock embedding ----------


def bedrock_embed(text: str, *, bedrock_client=None) -> np.ndarray:
    """Embed `text` via Titan v2. Returns a 1024-dim numpy array.

    Retries with progressively shorter text on token-overflow. Titan's
    char-to-token ratio varies with text density (~3 chars/token for
    dense Brugler scouting prose, ~4 for casual text), so the default
    char cap can exceed 8192 tokens for some profiles.
    """
    if bedrock_client is None:
        bedrock_client = boto3.client("bedrock-runtime", region_name="us-east-1")
    if not text.strip():
        return np.zeros(TITAN_DIM, dtype=np.float64)

    cap = len(text)
    last_err: Exception | None = None
    for _ in range(5):  # 22K → 11K → 5.5K → 2.7K → 1.4K
        body = json.dumps({"inputText": text[:cap]})
        try:
            resp = bedrock_client.invoke_model(
                modelId=TITAN_MODEL_ID,
                body=body,
                contentType="application/json",
            )
            out = json.loads(resp["body"].read())
            return np.asarray(out["embedding"], dtype=np.float64)
        except ClientError as e:
            if "Too many input tokens" in str(e) or "input token count" in str(e):
                last_err = e
                cap = cap // 2
                continue
            raise
    raise last_err if last_err else RuntimeError("bedrock_embed: exhausted retries")


# ---------- vector composition ----------


def _l2_normalize(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    if n == 0:
        return v
    return v / n


@dataclass
class HybridVector:
    feature_vec: np.ndarray   # raw z-scored (from Phase 2.1)
    text_vec: np.ndarray      # raw Titan v2 output (1024-dim)
    feature_unit: np.ndarray  # L2-normalized feature_vec
    text_unit: np.ndarray     # L2-normalized text_vec
    hybrid: np.ndarray        # concat([feature_unit, text_unit])
    has_text: bool


def build_hybrid(
    feature_vec: np.ndarray, text_vec: np.ndarray, *, has_text: bool
) -> HybridVector:
    feature_unit = _l2_normalize(feature_vec)
    text_unit = _l2_normalize(text_vec)
    hybrid = np.concatenate([feature_unit, text_unit])
    return HybridVector(
        feature_vec=feature_vec,
        text_vec=text_vec,
        feature_unit=feature_unit,
        text_unit=text_unit,
        hybrid=hybrid,
        has_text=has_text,
    )


# ---------- persistence ----------


def persist_cohort_hybrid(
    df: pl.DataFrame, curated_bucket: str, cohort: str
) -> str:
    """Persist hybrid vectors for a cohort. Schema:
        player_id, name, position, has_text,
        feature_vec, text_vec, hybrid_vec  (all List[Float64])
    """
    key = f"embeddings/hybrid_vectors/cohort={cohort}/data.parquet"
    buf = io.BytesIO()
    df.write_parquet(buf)
    s3io._client().put_object(
        Bucket=curated_bucket, Key=key, Body=buf.getvalue()
    )
    return f"s3://{curated_bucket}/{key}"
