"""Generate and cache HyDE passages for the golden questions.

Cached rather than generated per-run so the ablation is deterministic and cheap:
HyDE is a model call, and re-rolling it every evaluation would make the grid
irreproducible and slow. Regenerate when the prompt changes.
"""

from __future__ import annotations

import json

import boto3
import yaml
from rich.console import Console

from common import BUILD, ROOT

console = Console()
REGION = "us-east-1"
ACCOUNT = "397483229232"
MODEL = f"arn:aws:bedrock:{REGION}:{ACCOUNT}:inference-profile/us.anthropic.claude-sonnet-4-6"

SYSTEM = """You write a short passage in the voice of a U.S. federal judicial opinion
that would answer the user's question, and a few alternative phrasings of the question.

The passage is never shown to anyone — it is used only as a retrieval probe, so it
should read like the TARGET documents (judicial prose, doctrinal vocabulary,
citations to factors) rather than like an answer to a user.

Return ONLY JSON:
{"hyde": "<120-200 words of judicial prose>", "variants": ["<rephrasing>", "<rephrasing>"]}"""


def parse_json(text: str) -> dict:
    start = min((i for i in (text.find("{"), text.find("[")) if i != -1), default=-1)
    end = text.rfind("}")
    return json.loads(text[start : end + 1])


def main() -> None:
    questions = yaml.safe_load((ROOT / "golden.yaml").read_text())["questions"]
    br = boto3.client("bedrock-runtime", region_name=REGION)
    out: dict[str, dict] = {}
    for q in questions:
        r = br.converse(
            modelId=MODEL,
            system=[{"text": SYSTEM}],
            messages=[{"role": "user", "content": [{"text": q["q"]}]}],
            inferenceConfig={"maxTokens": 700, "temperature": 0},
        )
        text = r["output"]["message"]["content"][0]["text"]
        data = parse_json(text)
        out[q["id"]] = {"hyde": data.get("hyde", ""), "variants": data.get("variants", [])}
        console.print(f"  {q['id']}: {len(out[q['id']]['hyde'])} chars, "
                      f"{len(out[q['id']]['variants'])} variants")
    path = BUILD / "hyde.json"
    path.write_text(json.dumps(out, indent=1))
    console.print(f"[green]wrote {path}[/green]")


if __name__ == "__main__":
    main()
