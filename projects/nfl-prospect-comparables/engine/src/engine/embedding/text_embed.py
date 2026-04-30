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
import re
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


_NAME_SUFFIXES = {"Jr.", "Jr", "Sr.", "Sr", "II", "III", "IV"}

# Common school name aliases — first match wins, all variants get masked.
# Keeps the embedding from picking up "Notre Dame" / "Fighting Irish" /
# "Bloomington" as cohort signals.
_SCHOOL_ALIASES: dict[str, tuple[str, ...]] = {
    "Notre Dame": ("Fighting Irish",),
    "Ohio State": ("Buckeyes", "OSU"),
    "Michigan": ("Wolverines",),
    "Alabama": ("Crimson Tide", "Bama"),
    "Georgia": ("Bulldogs", "UGA"),
    "Texas": ("Longhorns",),
    "USC": ("Trojans", "Southern California"),
    "Indiana": ("Hoosiers",),
    "Oregon": ("Ducks",),
    "LSU": ("Tigers", "Louisiana State"),
    "Florida": ("Gators",),
    "Penn State": ("Nittany Lions",),
    "Tennessee": ("Volunteers", "Vols"),
    "Stanford": ("Cardinal",),
    "Clemson": ("Tigers",),
    "Miami": ("Hurricanes",),
}


def _mask_pii(text: str, profile: PlayerProfile) -> str:
    """Replace prospect's name and school with placeholder tokens so the
    Titan v2 embedding doesn't pick up name/school frequency as a comp
    signal. Without this, two prospects who share a surname (Bryce Love
    vs Jeremiyah Love) or a school (Mendoza/JSN both at Ohio State... no,
    different schools — but two Notre Dame RBs would) cluster together
    on text similarity even when their archetypes diverge.
    """
    if not text:
        return text

    name = profile.name
    if name:
        # Replace the full name first (longest match) so we don't double-replace
        text = re.sub(re.escape(name), "<PROSPECT>", text, flags=re.IGNORECASE)
        # Then individual first / last name tokens
        parts = name.replace(".", " ").replace("-", " ").split()
        while parts and parts[-1] in _NAME_SUFFIXES:
            parts.pop()
        for token in parts:
            if len(token) < 3:
                continue
            text = re.sub(
                rf"\b{re.escape(token)}\b",
                "<PROSPECT>",
                text,
                flags=re.IGNORECASE,
            )

    college = (profile.bio.college or "") if profile.bio else ""
    if college and len(college) >= 3:
        text = re.sub(
            rf"\b{re.escape(college)}\b",
            "<SCHOOL>",
            text,
            flags=re.IGNORECASE,
        )
        for canonical, aliases in _SCHOOL_ALIASES.items():
            if canonical.lower() in college.lower():
                for alias in aliases:
                    text = re.sub(
                        rf"\b{re.escape(alias)}\b",
                        "<SCHOOL>",
                        text,
                        flags=re.IGNORECASE,
                    )

    return text


def _read_or_none(s3, bucket: str, key: str) -> str | None:
    try:
        body = s3.get_object(Bucket=bucket, Key=key)["Body"].read().decode("utf-8")
        return body
    except ClientError:
        return None


# Pre-draft (snapshot) sources we use in the text corpus. Wikipedia is
# excluded — its bios are continuously edited after the draft, leaking
# post-draft career signal back into a "pre-draft" embedding (see
# feedback_no_wikipedia_text_corpus.md). The text_wikipedia_vec column
# persisted in older parquets is dead weight and not read here.
CLEAN_SOURCES = ("brugler", "walter_football")


def read_corpus_texts(
    profile: PlayerProfile,
    *,
    s3,
    bucket: str,
    sources: tuple[str, ...] = CLEAN_SOURCES,
) -> dict[str, str | None]:
    """Read pre-draft scouting text for `profile` from each named source.

    Source keys → S3 prefixes:
      - brugler         → corpus/brugler/{year}/{player_id}.txt
      - walter_football → corpus/walter_football/{player_id}.txt
      - wikipedia       → corpus/wikipedia/{player_id}.txt   (DO NOT USE — see comment above)

    Returns a dict keyed by source name; each value is the raw text or None.
    """
    year = profile.draft.draft_year if profile.draft else None
    out: dict[str, str | None] = {s: None for s in sources}
    for source in sources:
        if source == "brugler":
            if year is not None:
                out["brugler"] = _read_or_none(
                    s3, bucket, f"corpus/brugler/{year}/{profile.player_id}.txt"
                )
        elif source == "walter_football":
            out["walter_football"] = _read_or_none(
                s3, bucket, f"corpus/walter_football/{profile.player_id}.txt"
            )
        elif source == "wikipedia":
            out["wikipedia"] = _read_or_none(
                s3, bucket, f"corpus/wikipedia/{profile.player_id}.txt"
            )
        else:
            raise ValueError(f"unknown corpus source: {source!r}")
    return out


def _format_source(source: str, text: str, year: int | None) -> str:
    if source == "brugler":
        label = f"Brugler {year}" if year is not None else "Brugler"
        return f"## Pre-draft scouting profile ({label})\n\n{text}"
    if source == "walter_football":
        label = f"WalterFootball {year}" if year is not None else "WalterFootball"
        return f"## Pre-draft scouting report ({label})\n\n{text}"
    if source == "wikipedia":
        return f"## Wikipedia bio\n\n{text}"
    raise ValueError(f"unknown corpus source: {source!r}")


def consolidate_text(
    profile: PlayerProfile,
    *,
    s3,
    bucket: str,
    sources: tuple[str, ...] = CLEAN_SOURCES,
) -> tuple[str, dict[str, bool]]:
    """Read pre-draft text for `profile` from `sources`, concat in source order
    with section headers, cap to MAX_TEXT_CHARS. Returns (text, presence_dict).

    Default `sources` is CLEAN_SOURCES (Brugler + Walter Football). The
    legacy "Brugler+Wikipedia" embedding is reproducible by passing
    sources=("brugler", "wikipedia") for ablation comparisons.
    """
    raw = read_corpus_texts(profile, s3=s3, bucket=bucket, sources=sources)
    sources_present = {s: raw.get(s) is not None for s in sources}
    year = profile.draft.draft_year if profile.draft else None
    parts: list[str] = []
    for s in sources:  # respect source order — first listed gets priority on truncation
        if raw.get(s):
            parts.append(_format_source(s, raw[s], year))
    text = "\n\n".join(parts)
    text = _mask_pii(text, profile)
    if len(text) > MAX_TEXT_CHARS:
        text = text[:MAX_TEXT_CHARS]
    return text, sources_present


def consolidate_text_per_source(
    profile: PlayerProfile,
    *,
    s3,
    bucket: str,
    sources: tuple[str, ...] = CLEAN_SOURCES,
) -> dict[str, str]:
    """Return one formatted+capped text string per source, plus the combined
    text. Used by `run_text_embeddings` to embed each source separately for
    per-source ablation arms (text_brugler / text_walter_football / etc.).

    Returned dict has keys: "combined" + each name in `sources`. Values
    are empty strings when the source is absent.
    """
    raw = read_corpus_texts(profile, s3=s3, bucket=bucket, sources=sources)
    year = profile.draft.draft_year if profile.draft else None

    formatted: dict[str, str] = {}
    parts: list[str] = []
    for s in sources:
        text = _format_source(s, raw[s], year) if raw.get(s) else ""
        text = _mask_pii(text, profile)
        if len(text) > MAX_TEXT_CHARS:
            text = text[:MAX_TEXT_CHARS]
        formatted[s] = text
        if text:
            parts.append(text)

    combined = "\n\n".join(parts)
    if len(combined) > MAX_TEXT_CHARS:
        combined = combined[:MAX_TEXT_CHARS]
    formatted["combined"] = combined
    return formatted


# ---------- Bedrock embedding ----------


def make_bedrock_client(region_name: str = "us-east-1"):
    """Create a Bedrock runtime client with adaptive retry. Adaptive mode
    backs off on ThrottlingException with growing delays — important when
    embedding ~1K profiles in a single run.
    """
    from botocore.config import Config
    return boto3.client(
        "bedrock-runtime",
        region_name=region_name,
        config=Config(
            retries={"max_attempts": 10, "mode": "adaptive"},
            read_timeout=60,
            connect_timeout=10,
        ),
    )


def bedrock_embed(text: str, *, bedrock_client=None) -> np.ndarray:
    """Embed `text` via Titan v2. Returns a 1024-dim numpy array.

    Retries with progressively shorter text on token-overflow. Titan's
    char-to-token ratio varies with text density (~3 chars/token for
    dense Brugler scouting prose, ~4 for casual text), so the default
    char cap can exceed 8192 tokens for some profiles.

    Adds an explicit backoff loop on ThrottlingException on top of
    botocore's adaptive retry (defense-in-depth — observed both retry
    layers needed when running parallel embed jobs against the same
    Bedrock account).
    """
    if bedrock_client is None:
        bedrock_client = make_bedrock_client()
    if not text.strip():
        return np.zeros(TITAN_DIM, dtype=np.float64)

    import time as _time

    cap = len(text)
    last_err: Exception | None = None
    throttle_wait = 2.0
    for _ in range(8):  # 22K → 11K → 5.5K → 2.7K → 1.4K, plus throttle retries
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
            msg = str(e)
            if "Too many input tokens" in msg or "input token count" in msg:
                last_err = e
                cap = cap // 2
                continue
            if "ThrottlingException" in msg or "Too many requests" in msg:
                last_err = e
                _time.sleep(throttle_wait)
                throttle_wait = min(throttle_wait * 2, 30.0)
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
