"""Bootstrap pgvector + schema, bulk-load vectors, build kNN indexes.

Idempotent — safe to re-run. Run AFTER `cdk deploy NflComparablesDb`.

Required env (`engine/.env`):
    NFLCOMPARABLES_DB_SECRET_ARN=<arn from CFN output>
    AWS_REGION=us-east-1                     # if not us-east-1 default

Run from engine/:
    uv run python scripts/db_bootstrap.py
"""

from __future__ import annotations

import sys

from dotenv import load_dotenv

from engine.db import load as db_load
from engine.db import schema as db_schema

load_dotenv()


def main() -> int:
    print("[1/3] bootstrapping schema...")
    db_schema.bootstrap_schema()
    print("      ✓ extension + tables ready")

    print("[2/3] bulk-loading vectors from S3...")
    counts = db_load.load_all()
    for c, n in counts.items():
        print(f"      ✓ {c}: {n} vectors loaded")

    print("[3/3] building ivfflat indexes...")
    db_schema.build_indexes()
    print("      ✓ indexes ready")

    print("\nDB ready. Try:")
    print('    uv run python scripts/db_query_comps.py --player "Patrick Mahomes"')
    return 0


if __name__ == "__main__":
    sys.exit(main())
