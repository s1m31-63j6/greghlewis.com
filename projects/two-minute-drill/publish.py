"""Where the fitted artifacts go so the browser can fetch them.

Each fitter writes its JSON twice: once beside the script, for inspection and
for the parity test, and once into `public/two-minute-drill/`, which is what
the app actually loads. Keeping the copy inside the fitters means there is no
separate publish step anyone can forget and then spend an afternoon wondering
why the site is running last week's model.
"""

from __future__ import annotations

from pathlib import Path

PUBLIC = Path(__file__).parent.parent.parent / "public" / "two-minute-drill"


def publish(name: str, blob: str) -> Path:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    dest = PUBLIC / name
    dest.write_text(blob)
    return dest
