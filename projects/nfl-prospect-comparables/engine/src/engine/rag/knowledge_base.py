"""Bedrock Knowledge Base RAG wrapper — two-step Retrieve + Generate.

We split retrieval and generation rather than using RetrieveAndGenerate
because the Bedrock-managed flow trades off prompt control for citation
extraction:
  - default prompt template -> citations work, but the model freely quotes
    licensed Brugler text (violation of the Athletic licensing rule).
  - custom prompt template (paraphrase + cite by name) -> Bedrock's
    citation parser misfires (returns refusal stub spans).

Two-step solution:
  1. `retrieve_chunks(query)` -> Bedrock Agent Runtime `Retrieve` returns
     retrieved chunks with their source S3 URIs.
  2. `generate(query, chunks)` -> Bedrock Runtime `InvokeModel` with Sonnet
     4.6 + the licensing-aware prompt template. Returns the narrative.
  3. `retrieve_and_generate(query)` composes both and returns narrative +
     source URIs of the chunks that fed the answer.

Methodology-page beat: "Managed retrieval (Bedrock KB: Titan v2,
hierarchical chunking, hybrid search) + custom synthesis (Sonnet 4.6 with
explicit licensing-aware system prompt). Splitting retrieval from
generation lets us enforce paraphrase + citation discipline that the
managed RetrieveAndGenerate path can't."
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any

import boto3


# us.* prefix = cross-region system-defined inference profile. Sonnet 4.6
# was cleared on the portfolio account during Phase 3.4.
DEFAULT_MODEL_ID = "us.anthropic.claude-sonnet-4-6"

KB_STACK = "NflComparablesKb"


SYSTEM_PROMPT = """\
You are a draft-prospect analyst answering questions using ONLY the
provided pre-draft scouting reports. Follow these rules without exception:

1. Cite the source by name in every claim — "Brugler" for "The Beast"
   profiles, "Walter Football" for walterfootball.com reports.
2. Paraphrase. Never reproduce more than four consecutive words from any
   provided report. The Brugler text is licensed and must not be quoted.
3. Ground every factual statement in the retrieved chunks. Do NOT add
   biographical details, school affiliations, teammate context, or
   stylistic comparisons that are not explicitly in the chunks. If a
   chunk says "comp: George Kittle" but does not say where Kittle played
   college, do not invent his school. Better to omit than to extrapolate.
4. If the retrieved chunks do not actually describe the prospect being
   asked about (e.g., a chunk only mentions the prospect in passing as a
   teammate of someone else), say "I don't have a scouting report on
   that prospect" and stop. Do not synthesize a profile from incidental
   mentions in other reports.
5. If the chunks contain enough info, keep the answer compact (3–6
   sentences). Lead with the prospect's archetype, then strengths and
   concerns, then any analyst comp the reports name."""


@dataclass
class Chunk:
    """A retrieved scouting-report chunk with its source."""
    text: str
    source_uri: str
    score: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def source_name(self) -> str:
        """Human-readable source name parsed from the S3 URI."""
        if "/corpus/brugler/" in self.source_uri:
            return "Brugler"
        if "/corpus/walter_football/" in self.source_uri:
            return "Walter Football"
        return "scouting report"


@dataclass
class RagResponse:
    answer: str
    chunks: list[Chunk]
    raw_retrieve: dict[str, Any]
    raw_generate: dict[str, Any]


def _resolve_kb_id(kb_id: str | None) -> str:
    if kb_id:
        return kb_id
    arn = os.environ.get("NFLCOMPARABLES_KB_ID")
    if arn:
        return arn
    region = os.environ.get("AWS_REGION", "us-east-1")
    cfn = boto3.client("cloudformation", region_name=region)
    outs = cfn.describe_stacks(StackName=KB_STACK)["Stacks"][0]["Outputs"]
    for o in outs:
        if o["OutputKey"] == "KnowledgeBaseId":
            return o["OutputValue"]
    raise RuntimeError(
        f"Could not resolve KB ID. Set NFLCOMPARABLES_KB_ID or deploy "
        f"the {KB_STACK} stack."
    )


def _model_id_for_invoke(model_id: str, region: str, account: str) -> str:
    """Convert friendly model ids to the form invoke_model expects."""
    if model_id.startswith("arn:"):
        return model_id
    if model_id.startswith(("us.", "eu.", "apac.")):
        return f"arn:aws:bedrock:{region}:{account}:inference-profile/{model_id}"
    return model_id


def _account_id(region: str) -> str:
    return boto3.client("sts", region_name=region).get_caller_identity()["Account"]


def retrieve_chunks(
    query: str,
    *,
    kb_id: str | None = None,
    num_results: int = 6,
    filter: dict[str, Any] | None = None,
) -> tuple[list[Chunk], dict[str, Any]]:
    """Hybrid-search the KB. Returns (chunks, raw_response).

    `filter` accepts the Bedrock `RetrievalFilter` shape — e.g.:
        {"equals": {"key": "player_id", "value": "cfb-4871023"}}
        {"andAll": [{"equals": ...}, {"equals": ...}]}

    Retries through Aurora SV2 auto-pause resume (~30s cold-start when
    min ACU=0).
    """
    import time

    from botocore.exceptions import ClientError

    region = os.environ.get("AWS_REGION", "us-east-1")
    resolved_kb_id = _resolve_kb_id(kb_id)
    client = boto3.client("bedrock-agent-runtime", region_name=region)
    vector_config: dict[str, Any] = {"numberOfResults": num_results}
    if filter is not None:
        vector_config["filter"] = filter

    last_err: Exception | None = None
    for _ in range(6):
        try:
            resp = client.retrieve(
                knowledgeBaseId=resolved_kb_id,
                retrievalQuery={"text": query},
                retrievalConfiguration={"vectorSearchConfiguration": vector_config},
            )
            break
        except ClientError as e:
            msg = str(e)
            if "is resuming" in msg or "is not currently available" in msg:
                last_err = e
                time.sleep(15)
                continue
            raise
    else:
        if last_err is not None:
            raise last_err
    chunks = [
        Chunk(
            text=r.get("content", {}).get("text", ""),
            source_uri=(
                r.get("location", {}).get("s3Location", {}).get("uri", "")
            ),
            score=r.get("score", 0.0),
            metadata=r.get("metadata", {}) or {},
        )
        for r in resp.get("retrievalResults", [])
    ]
    return chunks, resp


def _format_chunks(chunks: list[Chunk]) -> str:
    """Render retrieved chunks for the synthesis prompt."""
    return "\n\n".join(
        f"[{i + 1}] Source: {c.source_name}\n{c.text.strip()}"
        for i, c in enumerate(chunks)
    )


def generate(
    query: str,
    chunks: list[Chunk],
    *,
    model_id: str = DEFAULT_MODEL_ID,
    max_tokens: int = 800,
    system_prompt: str = SYSTEM_PROMPT,
) -> tuple[str, dict[str, Any]]:
    """Synthesize a narrative from retrieved chunks. Returns (text, raw)."""
    region = os.environ.get("AWS_REGION", "us-east-1")
    account = _account_id(region)
    invoke_id = _model_id_for_invoke(model_id, region, account)

    user_msg = (
        f"Question: {query}\n\n"
        f"Retrieved scouting reports:\n{_format_chunks(chunks)}\n\n"
        f"Answer (paraphrase + cite by source name):"
    )
    body = json.dumps(
        {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_msg}],
        }
    )

    client = boto3.client("bedrock-runtime", region_name=region)
    resp = client.invoke_model(modelId=invoke_id, body=body)
    payload = json.loads(resp["body"].read())
    text = "".join(
        block.get("text", "")
        for block in payload.get("content", [])
        if block.get("type") == "text"
    )
    return text, payload


def retrieve_and_generate(
    query: str,
    *,
    kb_id: str | None = None,
    model_id: str = DEFAULT_MODEL_ID,
    num_results: int = 6,
    system_prompt: str = SYSTEM_PROMPT,
    filter: dict[str, Any] | None = None,
    auto_filter: bool = True,
) -> RagResponse:
    """End-to-end: retrieve chunks, synthesize narrative, return both.

    If `auto_filter=True` (default) and `filter` isn't passed, scan the
    query for a known prospect name; if exactly one matches, scope the
    retrieval to that player's chunks via `player_id` filter. This
    sidesteps the failure mode where hybrid search ranks a prospect's
    own report below noise (e.g. stat tables in other reports).
    """
    resolved = None
    if filter is None and auto_filter:
        from engine.rag.name_index import resolve_name

        resolved = resolve_name(query)
        if resolved.primary is not None:
            ids = [c.player_id for c in resolved.candidates] or [resolved.primary.player_id]
            if len(ids) == 1:
                filter = {"equals": {"key": "player_id", "value": ids[0]}}
            else:
                filter = {
                    "orAll": [
                        {"equals": {"key": "player_id", "value": pid}}
                        for pid in ids
                    ]
                }

    chunks, raw_retrieve = retrieve_chunks(
        query, kb_id=kb_id, num_results=num_results, filter=filter
    )
    if not chunks:
        return RagResponse(
            answer="I don't have a scouting report on that prospect.",
            chunks=[],
            raw_retrieve=raw_retrieve,
            raw_generate={},
        )
    answer, raw_generate = generate(
        query, chunks, model_id=model_id, system_prompt=system_prompt
    )
    return RagResponse(
        answer=answer,
        chunks=chunks,
        raw_retrieve=raw_retrieve,
        raw_generate=raw_generate,
    )
