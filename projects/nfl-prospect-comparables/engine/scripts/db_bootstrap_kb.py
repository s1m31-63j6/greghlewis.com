"""Bootstrap the Bedrock-KB chunks table.

Must run BEFORE deploying the NflComparablesKb CDK stack — Bedrock refuses
to create a Knowledge Base whose target table doesn't exist. Idempotent.

Run from engine/:
    AWS_PROFILE=portfolio uv run python scripts/db_bootstrap_kb.py
"""

from __future__ import annotations

import sys

from dotenv import load_dotenv

from engine.db import schema as db_schema

load_dotenv()


def main() -> int:
    print("[1/1] bootstrapping Bedrock-KB schema (bedrock_kb_chunks + hnsw index)...")
    db_schema.bootstrap_kb_schema()
    print("      ✓ table + indexes ready")
    print("\nNext: cdk deploy NflComparablesKb (from infra/)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
