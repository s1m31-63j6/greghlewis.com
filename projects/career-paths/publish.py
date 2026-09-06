"""Where the generated artifacts go so the browser can fetch them.

Each script writes its JSON twice: once beside the script, for inspection and
for the parity test, and once into `public/career-paths/`, which is what the
app actually loads. Same convention as two-minute-drill.
"""

from __future__ import annotations

from pathlib import Path

PUBLIC = Path(__file__).parent.parent.parent / "public" / "career-paths"


def publish(name: str, blob: str) -> Path:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    dest = PUBLIC / name
    dest.write_text(blob)
    return dest
