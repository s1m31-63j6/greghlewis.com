"use client";

/**
 * One line between the toolbar and the board, in place of three blocks.
 *
 * There used to be a provenance paragraph, a storage paragraph and the key's
 * header stacked here — about five lines of prose before the first player name,
 * on every visit forever. All three were saying something true and worth
 * saying once, which is a description of a tour, not of permanent chrome.
 *
 * So the teaching moved to the tour and this strip keeps only what a returning
 * reader actually looks up: which board this is, what the colors mean, and the
 * platform switches. Nothing was deleted — the provenance sentence and the
 * storage explanation both live on as tooltips, because the provenance sentence
 * in particular is this project's central honesty claim and must stay reachable.
 */

import { useState } from "react";

import TourButton from "@/app/_tour/TourButton";
import { PLATFORMS } from "@/lib/draft-sheet/types";
import type { PlatformKey } from "@/lib/draft-sheet/types";
import { LegendBody } from "./Legend";
import { Tip } from "./Tip";

export function BoardStrip({
  boardLabel,
  departure,
  visible,
  onToggle,
}: {
  boardLabel: string;
  departure: number;
  visible: PlatformKey[];
  onToggle: (key: PlatformKey) => void;
}) {
  const [keyOpen, setKeyOpen] = useState(false);

  const provenance =
    departure === 0
      ? `Built on the ${boardLabel} expert consensus board. Your settings match what that board assumes, so this is consensus, unedited.`
      : `Built on the ${boardLabel} expert consensus board. Your roster shifts positions against each other by up to ${Math.round(departure)} places. Order within each position is untouched.`;

  return (
    <div className="ds-strip-wrap" data-tour="strip">
      <div className="ds-strip">
        <Tip label={provenance} className="ds-strip-chip">
          {boardLabel} consensus
        </Tip>

        {/* The colors are the one thing on the board with no units and no
            label, so the key to them is the part that stays on screen. */}
        <span className="ds-strip-key" data-tour="colorkey">
          <span className="ds-strip-key-label">Drafted later</span>
          <span className="ds-cell ds-cell--v2">42</span>
          <span className="ds-cell ds-cell--v1">38</span>
          <span className="ds-cell">31</span>
          <span className="ds-cell ds-cell--r1">24</span>
          <span className="ds-cell ds-cell--r2">14</span>
          <span className="ds-strip-key-label">earlier</span>
        </span>

        <span className="ds-platform-picks" role="group" aria-label="Platforms to show">
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
        </span>

        <span className="ds-strip-spacer" />

        <Tip
          label="Your settings, stars and removed players are saved in this browser only — there are no accounts. Clearing site data, or opening this on another device, starts fresh. Use Share settings to carry your league setup across."
          className="ds-strip-saved"
        >
          Saved in this browser
        </Tip>

        <TourButton className="ds-strip-btn" />

        <button
          type="button"
          className="ds-strip-btn"
          aria-expanded={keyOpen}
          onClick={() => setKeyOpen((o) => !o)}
          data-tel="ds-legend"
        >
          {keyOpen ? "Hide key" : "Full key"}
        </button>
      </div>

      {keyOpen && <LegendBody />}
    </div>
  );
}
