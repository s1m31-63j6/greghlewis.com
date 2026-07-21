"""Project the corpus manifest into the frontend's cases.json.

The interactive page ships a small per-case table (Citations + Embedding tabs) with
exactly the fields the UI reads — id, name, court, year, layer, domain, citation, judge.
Everything else (text, notes, source URLs) stays server-side. This keeps the committed
`src/lib/glass-box-rag/cases.json` reproducible from `cases.yaml` instead of hand-edited.

Usage:
    uv run python frontend_data.py            # writes data/build/cases.json
    # then copy into the site bundle alongside the other build artifacts:
    #   cp data/build/cases.json ../../src/lib/glass-box-rag/cases.json
"""

from __future__ import annotations

from common import BUILD, all_cases, load_manifest, write_json

FIELDS = ("id", "name", "court", "year", "layer", "domain", "citation", "judge")


def main() -> None:
    cases = all_cases(load_manifest())
    rows = [{k: c.get(k) for k in FIELDS} for c in cases]
    write_json(BUILD / "cases.json", rows)
    print(f"wrote {len(rows)} cases -> data/build/cases.json")


if __name__ == "__main__":
    main()
