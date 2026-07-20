"""Embed chunks via Bedrock into a binary vector store.

Model choice is a flag, not a constant, because it's an ablation the evaluation
harness should settle rather than something to assert up front.

Empirically (tested on a real 1,042-token / 4,511-char chunk):
  amazon.titan-embed-text-v2:0   OK, 1024 dims, 8k-token input  <-- DEFAULT
  cohere.embed-english-v3        REJECTS IT — Bedrock pre-validates Cohere v3 at
                                 2048 CHARACTERS and fails the whole batch. That's
                                 the model Religious Voices uses; reusing it here
                                 would have silently truncated ~half of every chunk.
  cohere.embed-v4:0              Accepts long input and embedded the whole corpus
                                 once, then began returning AccessDeniedException
                                 for every call while Titan, Cohere v3, and Cohere
                                 Rerank 3.5 all kept working. It needs a Marketplace
                                 subscription this account doesn't hold. Kept as an
                                 option, but do NOT depend on it without re-checking
                                 access first.

Vectors are written as a raw float32 .bin rather than JSON numbers: ~4x smaller and
far faster to load in the Lambda, which matters because the store is pulled from S3
on cold start.

Usage:
    uv run python embed.py                                 # default: titan v2
    uv run python embed.py --model titan --model cohere4   # both, for the ablation
"""

from __future__ import annotations

import argparse
import json
import sys
import time

import boto3
import numpy as np
from rich.console import Console
from rich.progress import track

from common import BUILD, write_json

console = Console()

MODELS = {
    "cohere4": {"id": "cohere.embed-v4:0", "dims": 1536, "batch": 96},
    "titan": {"id": "amazon.titan-embed-text-v2:0", "dims": 1024, "batch": 1},
}


def embed_batch(br, spec: dict, texts: list[str], input_type: str) -> list[list[float]]:
    mid = spec["id"]
    if mid.startswith("cohere"):
        body = {
            "texts": texts,
            "input_type": input_type,
            "output_dimension": spec["dims"],
        }
        r = br.invoke_model(modelId=mid, body=json.dumps(body))
        payload = json.loads(r["body"].read())
        emb = payload.get("embeddings")
        # v4 nests under {"float": [...]}, v3 returns a bare list
        if isinstance(emb, dict):
            emb = emb.get("float")
        return emb
    # Titan embeds one document per call.
    out = []
    for t in texts:
        r = br.invoke_model(
            modelId=mid,
            body=json.dumps({"inputText": t, "dimensions": spec["dims"], "normalize": True}),
        )
        out.append(json.loads(r["body"].read())["embedding"])
    return out


def run(model_key: str, chunks: list[dict]) -> None:
    spec = MODELS[model_key]
    br = boto3.client("bedrock-runtime", region_name="us-east-1")

    vectors: list[list[float]] = []
    batch = spec["batch"]
    t0 = time.time()
    for i in track(range(0, len(chunks), batch), description=f"embedding [{model_key}]"):
        texts = [c["text"] for c in chunks[i : i + batch]]
        for attempt in range(5):
            try:
                vectors.extend(embed_batch(br, spec, texts, "search_document"))
                break
            except Exception as e:
                if attempt == 4:
                    raise
                console.print(f"  [yellow]retry {attempt + 1}: {str(e)[:90]}[/yellow]")
                time.sleep(2**attempt)

    arr = np.asarray(vectors, dtype=np.float32)
    if arr.shape != (len(chunks), spec["dims"]):
        raise SystemExit(f"shape mismatch: {arr.shape} != {(len(chunks), spec['dims'])}")

    # L2-normalize once here so retrieval is a plain dot product at query time.
    norms = np.linalg.norm(arr, axis=1, keepdims=True)
    arr = arr / np.clip(norms, 1e-9, None)

    BUILD.mkdir(parents=True, exist_ok=True)
    bin_path = BUILD / f"vectors-{model_key}.bin"
    arr.tofile(bin_path)
    write_json(
        BUILD / f"vectors-{model_key}.meta.json",
        {
            "model": spec["id"],
            "model_key": model_key,
            "dims": spec["dims"],
            "count": len(chunks),
            "dtype": "float32",
            "normalized": True,
            "chunk_ids": [c["id"] for c in chunks],
        },
    )
    mb = bin_path.stat().st_size / 1e6
    console.print(
        f"[green]{model_key}: {len(chunks)} x {spec['dims']} -> {bin_path.name} "
        f"({mb:.1f} MB) in {time.time() - t0:.0f}s[/green]"
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", action="append", choices=list(MODELS), default=None)
    args = ap.parse_args()
    models = args.model or ["titan"]

    path = BUILD / "chunks.json"
    if not path.exists():
        console.print("[red]no chunks.json — run chunk.py first[/red]")
        return 1
    chunks = json.loads(path.read_text())
    console.print(f"{len(chunks)} chunks")

    for m in models:
        run(m, chunks)
    return 0


if __name__ == "__main__":
    sys.exit(main())
