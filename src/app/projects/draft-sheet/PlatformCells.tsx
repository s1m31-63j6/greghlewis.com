"use client";

/**
 * One cell per platform: where that platform drafts a player, colored by how
 * that compares to the expert consensus rank.
 *
 * This replaced a four-lane micro-track. The track showed the SHAPE of the
 * disagreement but not its direction against anything a drafter acts on, and
 * you could not read a number off it. What actually matters on the clock is
 * "on MY platform, is this a bargain or a reach right now" — so each cell
 * carries the real ADP, and the tint answers the bargain/reach question.
 *
 *   green  — goes LATER here than the experts rank him. You can wait.
 *   red    — goes EARLIER here. You have to reach, or lose him.
 *   gray   — the market and the experts agree.
 *
 * Color is never the only channel: the number is always present, the exact
 * delta is in the title, and the sign is spelled out for screen readers. A
 * reader who cannot separate the hues still has every value on the page.
 */

import type { Adp, PlatformKey, Player } from "@/lib/draft-sheet/types";
import { PLATFORMS } from "@/lib/draft-sheet/types";

/*
 * Thresholds SCALE WITH DEPTH, and they have to.
 *
 * A flat cutoff painted a third of the board at full strength, because a
 * twenty-pick disagreement is enormous at pick 30 and pure noise at pick 250 —
 * the deep end of any board is mostly guesswork and every platform guesses
 * differently. Proportional bands keep the loud color for the picks a drafter
 * will actually agonise over.
 */
const MIN_NEUTRAL = 2;
const MIN_STRONG = 5;
const NEUTRAL_FRACTION = 0.16;
const STRONG_FRACTION = 0.42;

/**
 * `depth` must be the player's POSITION rank, not his overall rank — the delta
 * is measured in spots-at-position, and scaling those by an overall rank mixes
 * units. Three spots between running backs is a lot at RB5 and nothing at RB50.
 */
export function cellTone(
  delta: number | null,
  depthRank: number | null,
): "" | "v1" | "v2" | "r1" | "r2" {
  if (delta == null) return "";
  const depth = depthRank ?? 24;
  const soft = Math.max(MIN_NEUTRAL, depth * NEUTRAL_FRACTION);
  const hard = Math.max(MIN_STRONG, depth * STRONG_FRACTION);
  if (delta >= hard) return "v2";
  if (delta >= soft) return "v1";
  if (delta <= -hard) return "r2";
  if (delta <= -soft) return "r1";
  return "";
}

export function PlatformCells({
  player,
  adp,
  board,
  visible,
}: {
  player: Player;
  adp: Adp | undefined;
  board: string;
  visible: PlatformKey[];
}) {
  const ecr = (player.ecr as Record<string, number | null>)[board];
  const posEcr = adp?.posRankEcr ?? null;

  return (
    <>
      {visible.map((key) => {
        const spec = PLATFORMS.find((p) => p.key === key)!;
        const raw = adp?.raw[key] ?? null;
        const posRank = adp?.posRank[key] ?? null;
        // WITHIN POSITION, always. See the note on `posRank` in types.ts: an
        // overall-rank difference bakes in each platform's own ordering quirks
        // and reads them as market signal.
        const delta =
          posRank != null && posEcr != null ? Math.round(posRank - posEcr) : null;
        const tone = cellTone(delta, posEcr);
        // Sleeper publishes no ADP, so its cell shows where Sleeper ranks him
        // among his position rather than a pick number he does not have.
        // Auction shows money, which is neither.
        const shown = spec.kind === "rank" ? posRank : raw;

        if (shown == null) {
          return (
            <span key={key} className="ds-cell is-empty" aria-hidden="true">
              –
            </span>
          );
        }
        // A price has no consensus rank to be measured against, so the cell
        // carries no colour: there is no "goes later here" to report. Showing
        // it uncoloured is the honest version — the number is the whole signal.
        if (spec.kind === "cost") {
          return (
            <span
              key={key}
              className="ds-cell ds-cell--cost"
              title={`${spec.label}: average winning bid of $${shown.toFixed(2)} in Yahoo's default 12-team, $200 auction. Scale it to your own budget.`}
              aria-label={`${spec.label}, average winning bid ${Math.round(shown)} dollars`}
            >
              {`$${Math.round(shown)}`}
            </span>
          );
        }

        const unit =
          spec.kind === "adp"
            ? `drafted around ${Math.round(shown)}`
            : `ranked ${Math.round(shown)} at ${player.pos} (Sleeper publishes no ADP)`;
        const word =
          delta == null ? "" : delta > 0 ? "later" : delta < 0 ? "earlier" : "level";
        return (
          <span
            key={key}
            className={`ds-cell${tone ? ` ds-cell--${tone}` : ""}${
              spec.kind === "rank" ? " is-rank" : ""
            }`}
            title={
              delta == null
                ? `${spec.label}: ${unit}`
                : `${spec.label}: ${unit} — ${Math.abs(delta)} ${
                    Math.abs(delta) === 1 ? "spot" : "spots"
                  } ${word} than the experts have him at ${player.pos}`
            }
            aria-label={`${spec.label}, ${unit}${
              delta == null ? "" : `, ${Math.abs(delta)} spots ${word} than consensus`
            }`}
          >
            {Math.round(shown)}
          </span>
        );
      })}
    </>
  );
}

/**
 * Print carries one glyph instead of four cells: three ADP columns cost about
 * 0.62in per column, which forces the sheet from four columns to three and the
 * type down to a size that photocopies to mush.
 */
export function spreadGlyph(spread: number | null, median: number): string {
  if (spread == null) return "";
  if (spread > median * 2) return "«»";
  if (spread > median) return "‹›";
  return "·";
}
