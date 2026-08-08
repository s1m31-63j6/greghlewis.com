"""Emit an UNCALIBRATED ladder so the frontend can be built before the real run.

    uv run python provisional_ladder.py

The real ladder comes from `calibrate.py`, which measures ~25,000 games. That
takes hours, and the UI should not be blocked on it. This writes a stand-in that
maps each rung target onto the strength scalar by a naive linear guess.

**The rung labels here are guesses, not measurements.** The file is stamped
`"provisional": true`, and the UI reads that flag and shows a warning banner, so
a stand-in ladder cannot quietly ship looking like calibrated output. `calibrate.py`
overwrites this file on success, without the flag, and the banner disappears.
"""

from __future__ import annotations

import json

from calibrate import LADDER_PATH, RUNG_TARGETS
from weakening import MULTIPV, params_for

LOW, HIGH = RUNG_TARGETS[0], RUNG_TARGETS[-1]


def main() -> None:
    rungs = []
    for target in RUNG_TARGETS:
        s = (target - LOW) / (HIGH - LOW)
        rungs.append(
            {"label": target, "s": round(s, 4), "params": params_for(s).to_json(), "ci95": None}
        )

    LADDER_PATH.parent.mkdir(parents=True, exist_ok=True)
    LADDER_PATH.write_text(
        json.dumps(
            {
                "_note": (
                    "PROVISIONAL — rung labels are a linear guess, not measurements. "
                    "Run calibrate.py to replace this with a measured ladder."
                ),
                "provisional": True,
                "games": 0,
                "multipv": MULTIPV,
                "rungs": rungs,
                "curve": [],
                "anchors": {},
            },
            indent=2,
        )
    )
    print(f"wrote provisional ladder to {LADDER_PATH}")


if __name__ == "__main__":
    main()
