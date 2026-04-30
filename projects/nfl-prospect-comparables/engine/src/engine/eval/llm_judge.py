"""Phase 3.4 — LLM-as-judge for engine vs expert comp disagreements.

For each (prospect, candidate_comp) pair where the engine ranks
`candidate_comp` in the top-K but it isn't in the analyst-named comps,
score the pair's defensibility 1-5 via Bedrock Haiku 4.5 with a structured
rubric. Aggregate to answer: when engine and analysts disagree, is the
engine's pick *also* defensible?

Architectural pattern: Haiku 4.5 for high-volume judging behind a system
prompt that carries the rubric (cached for the run). Output parsed as
strict JSON.

Bedrock model: `us.anthropic.claude-haiku-4-5-20251001-v1:0` (US-region
inference profile — the on-demand model ID isn't directly invocable for
4.5+).
"""

from __future__ import annotations

import io
import json
import re
import time
from dataclasses import dataclass

import boto3
import polars as pl
from botocore.exceptions import ClientError

from engine.embedding import comps as comps_mod


# Original plan: Haiku 4.5 for high-volume judging. As of 2026-04-28 the
# portfolio account hasn't completed Bedrock's "Anthropic use case details"
# form for Claude 4.5+ Haiku, so Haiku 4.5 returns ResourceNotFoundException.
# Sonnet 4.6 is accessible and is a more capable judge for nuanced football
# evaluation — the cost delta is trivial at this scale (~700 calls).
# Greg can submit the use-case form in the AWS Bedrock console (us-east-1,
# account 397483229232) and swap back to Haiku 4.5 if cost ever matters.
JUDGE_MODEL_ID = "us.anthropic.claude-sonnet-4-6"

# System prompt carries the rubric. Marked as cache_control "ephemeral" so
# Bedrock prompt-caching slashes input cost across the per-prospect calls.
SYSTEM_PROMPT = """You are an NFL Draft analyst evaluating prospect comparables. Given a college prospect's pre-draft scouting profile and a proposed NFL comparable from a recent class, score how defensible the comparison is on a 1-5 rubric.

Rubric (consider archetype, role projection, build/measurables, play style, scheme fit, and projected NFL impact):
5 — Strong match: nearly all dimensions align; a comp an analyst would readily make
4 — Good match: most dimensions align; minor caveats on style or upside
3 — Plausible match: some alignment but notable differences; reasonable but not a first-choice comp
2 — Weak match: superficial similarity (same position / similar size) but archetype, role, or projected impact differ
1 — Bad match: fundamentally different player despite the position match

Important constraints:
- Use only your training knowledge of the named NFL comparable. Don't speculate beyond what's standardly known.
- The prospect's scouting text is paraphrased pre-draft analysis from public scouting sources. Use it to anchor archetype / role.
- Output STRICT JSON only — no preamble, no markdown fences. Schema:
  {"score": <int 1-5>, "reasoning": "<two-sentence justification under 320 chars>"}
- Don't quote the prospect's scouting text; paraphrase if you reference it.
"""


def make_bedrock_client(region_name: str = "us-east-1"):
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


@dataclass(frozen=True)
class JudgeQuery:
    prospect_name: str
    prospect_position: str
    prospect_college: str | None
    prospect_year: int | None
    prospect_text: str           # pre-draft scouting prose
    comp_name: str
    comp_position: str
    comp_year: int | None
    comp_college: str | None


@dataclass
class JudgeResponse:
    score: int       # 1-5; 0 if parse failed
    reasoning: str
    raw: str         # raw LLM text
    input_tokens: int
    output_tokens: int


def build_user_message(q: JudgeQuery) -> str:
    pros_meta = f"{q.prospect_name} ({q.prospect_position}"
    if q.prospect_college:
        pros_meta += f", {q.prospect_college}"
    if q.prospect_year:
        pros_meta += f", draft class {q.prospect_year}"
    pros_meta += ")"

    comp_meta = f"{q.comp_name} ({q.comp_position}"
    if q.comp_college:
        comp_meta += f", {q.comp_college}"
    if q.comp_year:
        comp_meta += f", drafted {q.comp_year}"
    comp_meta += ")"

    # Cap prospect text to keep the call cheap. ~4K chars ≈ 1.3K tokens.
    text = q.prospect_text or "(no pre-draft scouting text available — judge from name/position/college/year only)"
    if len(text) > 4000:
        text = text[:4000]

    return (
        f"Prospect: {pros_meta}\n\n"
        f"Pre-draft scouting profile:\n{text}\n\n"
        f"Proposed NFL comparable: {comp_meta}\n\n"
        f"Score this comparison."
    )


_JSON_RE = re.compile(r"\{[^{}]*?\"score\"\s*:\s*(\d+)[^{}]*?\}", re.DOTALL)


def parse_response(raw: str) -> tuple[int, str]:
    """Parse the JSON the judge produced. Tolerant: if the response has
    markdown fences or stray text around the JSON, extract the first
    object containing a 'score' field."""
    raw = raw.strip()
    # Strip markdown fence
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-zA-Z]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
    try:
        obj = json.loads(raw)
        return int(obj.get("score", 0)), obj.get("reasoning", "")
    except Exception:
        pass
    m = _JSON_RE.search(raw)
    if not m:
        return 0, raw[:200]
    try:
        obj = json.loads(m.group(0))
        return int(obj.get("score", 0)), obj.get("reasoning", "")
    except Exception:
        return 0, raw[:200]


def call_judge(
    q: JudgeQuery,
    *,
    bedrock_client,
) -> JudgeResponse:
    user_msg = build_user_message(q)
    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 400,
        "system": [
            {"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}},
        ],
        "messages": [{"role": "user", "content": user_msg}],
    })
    last_err: Exception | None = None
    wait = 2.0
    for _ in range(8):
        try:
            resp = bedrock_client.invoke_model(
                modelId=JUDGE_MODEL_ID, body=body, contentType="application/json",
            )
            out = json.loads(resp["body"].read())
            content = out.get("content", [])
            text = "".join(c.get("text", "") for c in content if c.get("type") == "text")
            score, reasoning = parse_response(text)
            usage = out.get("usage", {})
            return JudgeResponse(
                score=score,
                reasoning=reasoning,
                raw=text,
                input_tokens=usage.get("input_tokens", 0) + usage.get("cache_read_input_tokens", 0),
                output_tokens=usage.get("output_tokens", 0),
            )
        except ClientError as e:
            msg = str(e)
            if "ThrottlingException" in msg or "Too many requests" in msg:
                last_err = e
                time.sleep(wait)
                wait = min(wait * 2, 30.0)
                continue
            raise
    raise last_err if last_err else RuntimeError("call_judge: exhausted retries")


# ---------- batch helpers ----------


def load_pool_with_metadata(
    curated_bucket: str, arm: str = "hybrid"
) -> tuple[comps_mod.CompPool, dict[str, dict]]:
    """Load engine pool + per-player metadata (name, position, college, year)."""
    pool = comps_mod.load_pool(curated_bucket, arm=arm)
    s3 = boto3.client("s3")
    meta: dict[str, dict] = {}
    for cohort in comps_mod.COHORTS_DEFAULT:
        try:
            body = s3.get_object(
                Bucket=curated_bucket, Key=f"profiles/{cohort}/data.jsonl"
            )["Body"].read().decode("utf-8")
        except Exception:
            continue
        for line in body.splitlines():
            if not line.strip():
                continue
            obj = json.loads(line)
            pid = obj.get("player_id")
            if not pid:
                continue
            college = (obj.get("bio") or {}).get("college")
            draft = obj.get("draft") or {}
            meta[pid] = {
                "name": obj.get("name", "?"),
                "position": (obj.get("position") or "").upper() if isinstance(obj.get("position"), str) else (obj.get("position") or {}).get("name", "?") if obj.get("position") else "?",
                "college": college,
                "draft_year": draft.get("draft_year"),
            }
    return pool, meta


def load_corpus_text(s3, curated_bucket: str, player_id: str, draft_year: int | None) -> str:
    """Read per-player scouting text — Brugler if available, else Walter Football."""
    keys = []
    if draft_year:
        keys.append(f"corpus/brugler/{draft_year}/{player_id}.txt")
    keys.append(f"corpus/walter_football/{player_id}.txt")
    for key in keys:
        try:
            body = s3.get_object(Bucket=curated_bucket, Key=key)["Body"].read().decode("utf-8")
            return body
        except Exception:
            continue
    return ""
