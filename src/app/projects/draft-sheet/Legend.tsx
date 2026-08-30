"use client";

/**
 * How to read a row.
 *
 * A dense board is only an advantage if the density is legible. Every column
 * here is a number without units, and the colors encode a comparison the
 * reader has no way to guess — so the key sits in the header rather than
 * behind a tooltip somebody discovers on pick nine.
 *
 * It starts collapsed. Opened it is 717px tall, which on a 390px phone is the
 * entire screen ahead of the board, and it stops being useful about ninety
 * seconds in either way.
 */

import { useState } from "react";

import { PLATFORMS } from "@/lib/draft-sheet/types";
import type { PlatformKey } from "@/lib/draft-sheet/types";

export function Legend({
  visible,
  onToggle,
}: {
  visible: PlatformKey[];
  onToggle: (key: PlatformKey) => void;
}) {
  // Closed by default. It is worth reading once and is in the way afterwards —
  // and on a phone an open key pushed the entire board below the fold.
  const [open, setOpen] = useState(false);

  return (
    <div className="ds-legend-bar">
      <div className="ds-legend-head">
        <span className="ds-legend-title-text">
          {open ? "How to read this" : "How to read this — show key"}
        </span>

        <div className="ds-platform-picks" role="group" aria-label="Platforms to show">
          <span className="ds-platform-label">Show</span>
          {PLATFORMS.map((p) => (
            <label key={p.key} className="ds-platform-check">
              <input
                type="checkbox"
                checked={visible.includes(p.key)}
                onChange={() => onToggle(p.key)}
              />
              {p.label}
            </label>
          ))}
        </div>

        {/* A minus sign in the corner reads as "collapse" at a glance. A line
            of prose saying "hide key" did not. */}
        <button
          type="button"
          className="ds-legend-min"
          aria-expanded={open}
          aria-label={open ? "Minimize the key" : "Show the key"}
          title={open ? "Minimize" : "Show the key"}
          onClick={() => setOpen((o) => !o)}
          data-tel="ds-legend"
        >
          {open ? "\u2212" : "+"}
        </button>
      </div>

      {open && (
        <div className="ds-legend-body">
          <dl className="ds-legend-items">
            <div><dt>★</dt><dd>Star a target. Saved in this browser.</dd></div>
            <div><dt className="ds-num">WR12</dt><dd>Rank within the position.</dd></div>
            <div><dt className="ds-num">MIN 6</dt><dd>Team and bye week.</dd></div>
            <div>
              <dt><span className="ds-inj ds-inj--out" style={{ display: "inline-block" }}>O</span></dt>
              <dd>Injury: <strong>O</strong> out, <strong>D</strong> doubtful, <strong>Q</strong> questionable. Hover for the injury and what the designation means.</dd>
            </div>
            <div><dt className="ds-num">ECR</dt><dd><strong>Expert consensus rank</strong> — the anchor. Every cell to its right is measured against it.</dd></div>
            <div><dt className="ds-num">×</dt><dd>Remove a keeper. Removed players change where each position runs dry.</dd></div>
          </dl>

          <div className="ds-legend-cells">
            <p className="ds-legend-title">
              One cell per platform — where that platform actually drafts him
            </p>
            <div className="ds-legend-swatches">
              <span className="ds-cell ds-cell--v2">42</span>
              <span>Goes <strong>much later</strong> than the experts rank him — wait, and take him a round late</span>
            </div>
            <div className="ds-legend-swatches">
              <span className="ds-cell ds-cell--v1">38</span>
              <span>Goes somewhat later — mild value here</span>
            </div>
            <div className="ds-legend-swatches">
              <span className="ds-cell">31</span>
              <span>This platform and the experts agree</span>
            </div>
            <div className="ds-legend-swatches">
              <span className="ds-cell ds-cell--r1">24</span>
              <span>Goes earlier — you will have to reach a little</span>
            </div>
            <div className="ds-legend-swatches">
              <span className="ds-cell ds-cell--r2">14</span>
              <span>Goes <strong>much earlier</strong> — on this platform he is gone before you think</span>
            </div>
            <p className="ds-legend-foot">
              Uncheck the platforms you are not drafting on. The color is a
              shortcut, never the only signal — every cell shows its real number,
              and hovering gives the exact gap.
            </p>
          </div>

          <div className="ds-legend-trend">
            <p className="ds-legend-title">Last 30 days</p>
            <div className="ds-legend-swatches">
              <svg className="ds-trend ds-trend--up" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2,6.5 L5,3 L8,6.5" /></svg>
              <span>Being drafted earlier than a month ago</span>
            </div>
            <div className="ds-legend-swatches">
              <svg className="ds-trend ds-trend--flat" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2,5 L8,5" /></svg>
              <span>Steady</span>
            </div>
            <div className="ds-legend-swatches">
              <svg className="ds-trend ds-trend--down" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2,3.5 L5,7 L8,3.5" /></svg>
              <span>Falling — the market has cooled on him</span>
            </div>
          </div>

          <div className="ds-legend-tiers">
            <p className="ds-legend-title">Tiers</p>
            <p>
              The bracket down the left spans a tier, so its <strong>length is how
              many are left</strong> before the drop. A heavier rule under the last
              name in a tier is the difference between reaching now and waiting a
              round.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
