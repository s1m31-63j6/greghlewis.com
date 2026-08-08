"use client";

import { pieceSrc } from "./CutePieces";
import type { MaterialSummary } from "./material";

/**
 * Captured pieces and the material balance.
 *
 * Shows the pieces themselves rather than only a number, because "+3" tells you
 * the size of the lead while a row of little captured pieces tells you what it
 * is made of — a rook for a bishop and a pawn is a very different position from
 * a clean extra knight.
 */

function Mini({ colour, type }: { colour: "w" | "b"; type: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny fixed-size vector
    <img
      src={pieceSrc(`${colour}${type.toUpperCase()}`)}
      alt=""
      aria-hidden="true"
      className="h-5 w-5"
    />
  );
}

export function MaterialBar({
  summary,
  playerColor,
}: {
  summary: MaterialSummary;
  playerColor: "w" | "b";
}) {
  // Restate the balance from the player's point of view — "you're up 3" beats
  // "White is up 3" when you might be playing either colour.
  const lead = playerColor === "w" ? summary.diff : -summary.diff;
  const yourCaptures = playerColor === "w" ? summary.takenByWhite : summary.takenByBlack;
  const theirCaptures = playerColor === "w" ? summary.takenByBlack : summary.takenByWhite;
  const opponentColour = playerColor === "w" ? "b" : "w";

  const label =
    lead > 0 ? `You're up ${lead}` : lead < 0 ? `Coach is up ${-lead}` : "Material is level";
  const colour = lead > 0 ? "#58CC02" : lead < 0 ? "#FF4B4B" : "#AFAFAF";

  return (
    <section className="rounded-3xl bg-white p-5 shadow-[0_4px_0_0_#E5E5E5] ring-1 ring-[#E5E5E5]">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-[#777]">Material</h2>
        <span className="text-lg font-black" style={{ color: colour }}>
          {lead > 0 ? `+${lead}` : lead < 0 ? lead : "="}
        </span>
      </div>

      <p className="mt-1 text-sm font-bold" style={{ color: colour }}>
        {label}
      </p>

      <div className="mt-3 space-y-2">
        <div className="flex min-h-6 flex-wrap items-center gap-0.5">
          <span className="mr-1 w-14 text-[11px] font-extrabold uppercase text-[#AFAFAF]">You</span>
          {yourCaptures.length === 0 ? (
            <span className="text-xs font-bold text-[#D4D4D4]">nothing yet</span>
          ) : (
            yourCaptures.map((type, i) => <Mini key={i} colour={opponentColour} type={type} />)
          )}
        </div>
        <div className="flex min-h-6 flex-wrap items-center gap-0.5">
          <span className="mr-1 w-14 text-[11px] font-extrabold uppercase text-[#AFAFAF]">
            Coach
          </span>
          {theirCaptures.length === 0 ? (
            <span className="text-xs font-bold text-[#D4D4D4]">nothing yet</span>
          ) : (
            theirCaptures.map((type, i) => <Mini key={i} colour={playerColor} type={type} />)
          )}
        </div>
      </div>
    </section>
  );
}
