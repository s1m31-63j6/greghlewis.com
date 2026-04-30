"""Sonnet-driven structured trait extraction from pre-draft scouting prose.

Per-position pydantic schemas (see `trait_schemas/`) describe ~10 archetype
dimensions per position. Sonnet 4.6 reads the consolidated Brugler + Walter
Football text for each prospect, scores each trait 1-5, and includes a
short verbatim quote from the source as anti-hallucination grounding.

Output:
    1) JSON sidecar at S3: corpus/sonnet_traits/<player_id>.json
    2) Numeric trait_vec + observation mask (vectorize for similarity)

Anti-drift:
- temperature=0
- prompt explicitly forbids fabrication of quotes
- pydantic strict validation; out-of-range scores raise

Cost: ~$0.003 per prospect at Sonnet 4.6 pricing for ~3K input tokens
+ ~600 output tokens. ~1000 prospects -> ~$3 total per backfill pass.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass

import boto3
import numpy as np
from botocore.exceptions import ClientError
from pydantic import BaseModel

from engine.embedding.text_embed import _mask_pii, consolidate_text
from engine.embedding.trait_schemas import schema_for, trait_names_for
from engine.schema import PlayerProfile, Position


SONNET_MODEL_ID = "us.anthropic.claude-sonnet-4-6"
SONNET_MAX_TOKENS = 1500


SYSTEM_PROMPT = (
    "You are an NFL scouting analyst extracting structured archetype traits "
    "from pre-draft scouting reports. Score each trait on a 1-5 integer scale:\n"
    "  1 = severely below NFL replacement level for the position\n"
    "  2 = below average\n"
    "  3 = average / serviceable\n"
    "  4 = above average / quality starter trait\n"
    "  5 = elite for the position\n\n"
    "For EACH trait, provide:\n"
    "  - score: integer 1-5, or null if the reports don't address the trait\n"
    "  - quote: a near-verbatim excerpt (<= 25 words) from the reports that supports your score, "
    "or null if score is null\n\n"
    "ABSOLUTE RULES:\n"
    "  - NEVER fabricate quotes. Quotes must be substrings or near-paraphrases of the source.\n"
    "  - If the reports don't discuss a trait directly, set both score and quote to null. "
    "Do NOT infer scores from athletic measurements or generic football knowledge.\n"
    "  - The prospect's name has been masked as <PROSPECT> and school as <SCHOOL>. "
    "Treat these as the subject; do not infer who they are.\n"
    "  - Output ONLY a single JSON object matching the requested schema. "
    "No prose before/after, no markdown fences, no explanation."
)


@dataclass
class TraitExtractionResult:
    """Output of one extraction. `traits` is the validated pydantic model.
    `vec` is the numeric trait vector (alphabetical), `mask` is observation
    indicator (1.0 if score not None, else 0.0). `raw_response` is the
    pre-validation Sonnet output for debugging.
    """
    player_id: str
    position: str
    traits: BaseModel
    vec: np.ndarray
    mask: np.ndarray
    citations: dict[str, str | None]
    raw_response: str


def _build_user_prompt(text: str, position: Position) -> str:
    """Compose the user message for one extraction call."""
    SchemaCls = schema_for(position)
    names = trait_names_for(position)
    schema_skeleton = {
        name: {"score": None, "quote": None} for name in names
    }
    # JSON-mode prompt: ask for the exact skeleton filled in.
    schema_json = json.dumps(schema_skeleton, indent=2)
    descriptions: list[str] = []
    for name in names:
        field_info = SchemaCls.model_fields[name]
        desc = field_info.description or ""
        descriptions.append(f"  - {name}: {desc}")
    return (
        f"Position: {position.name}\n\n"
        f"Trait definitions:\n" + "\n".join(descriptions) + "\n\n"
        f"Scouting reports:\n---\n{text}\n---\n\n"
        f"Return ONLY this JSON, with score (1-5 int or null) and quote "
        f"(<= 25 word excerpt from source or null) for each trait:\n"
        f"{schema_json}"
    )


def _extract_json_object(payload_text: str) -> dict:
    """Extract a JSON object from Sonnet output. Sonnet sometimes wraps the
    JSON in code fences or adds a brief leading sentence despite the system
    prompt; this strips that gracefully.
    """
    # Strip code fences if present
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", payload_text, re.DOTALL)
    if fenced:
        return json.loads(fenced.group(1))
    # Find the first balanced `{...}` block
    depth = 0
    start = -1
    for i, ch in enumerate(payload_text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start >= 0:
                return json.loads(payload_text[start : i + 1])
    raise ValueError(f"could not find JSON object in payload: {payload_text!r}")


def extract_traits(
    profile: PlayerProfile,
    *,
    s3,
    curated_bucket: str,
    bedrock_client=None,
) -> TraitExtractionResult | None:
    """Extract structured traits for one prospect from their Brugler + Walter
    Football scouting text. Returns None if the prospect has no usable text.
    `curated_bucket` is the S3 bucket holding `corpus/brugler/...` and
    `corpus/walter_football/...` text files (same bucket text_embed.py reads).
    """
    text, presence = consolidate_text(profile, s3=s3, bucket=curated_bucket)
    if not any(presence.values()) or not text.strip():
        return None
    text = _mask_pii(text, profile)

    if bedrock_client is None:
        region = os.environ.get("AWS_REGION", "us-east-1")
        bedrock_client = boto3.client("bedrock-runtime", region_name=region)

    user_msg = _build_user_prompt(text, profile.position)
    body = json.dumps(
        {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": SONNET_MAX_TOKENS,
            "temperature": 0,
            "system": SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": user_msg}],
        }
    )

    # Bedrock cross-region inference profile ID expects the bare model id
    # (Sonnet inference profile is enabled in this account, see knowledge_base.py).
    resp = bedrock_client.invoke_model(modelId=SONNET_MODEL_ID, body=body)
    payload = json.loads(resp["body"].read())
    payload_text = "".join(
        block.get("text", "")
        for block in payload.get("content", [])
        if block.get("type") == "text"
    )

    parsed = _extract_json_object(payload_text)
    SchemaCls = schema_for(profile.position)
    traits = SchemaCls.model_validate(parsed)

    names = trait_names_for(profile.position)
    n = len(names)
    vec = np.zeros(n, dtype=np.float64)
    mask = np.zeros(n, dtype=np.float64)
    citations: dict[str, str | None] = {}
    for i, name in enumerate(names):
        twq = getattr(traits, name)
        if twq.score is not None:
            # Center on 3 (average) and scale to roughly [-1, 1]
            vec[i] = (float(twq.score) - 3.0) / 2.0
            mask[i] = 1.0
        citations[name] = twq.quote

    return TraitExtractionResult(
        player_id=profile.player_id,
        position=profile.position.name,
        traits=traits,
        vec=vec,
        mask=mask,
        citations=citations,
        raw_response=payload_text,
    )


def persist_sidecar(
    result: TraitExtractionResult, *, s3, curated_bucket: str
) -> str:
    """Persist the structured trait JSON to S3. Independent of the parquet —
    sidecars are the methodology-page evidence (each score with a citation).
    """
    payload = {
        "player_id": result.player_id,
        "position": result.position,
        "traits": result.traits.model_dump(),
        "model_id": SONNET_MODEL_ID,
    }
    body = json.dumps(payload, indent=2).encode("utf-8")
    key = f"corpus/sonnet_traits/{result.player_id}.json"
    s3.put_object(Bucket=curated_bucket, Key=key, Body=body)
    return f"s3://{curated_bucket}/{key}"


def load_sidecar(
    player_id: str, *, s3, curated_bucket: str
) -> dict | None:
    """Load a previously-persisted trait sidecar; None if not found.
    Used by the run script to skip already-extracted prospects (idempotent
    backfills)."""
    key = f"corpus/sonnet_traits/{player_id}.json"
    try:
        body = s3.get_object(Bucket=curated_bucket, Key=key)["Body"].read()
        return json.loads(body)
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in {"NoSuchKey", "404"}:
            return None
        raise
