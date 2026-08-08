"use client";

import { Chess, type Color, type Square } from "chess.js";

/**
 * Visual overlays for the board: where a picked-up piece may go, and who
 * controls each square.
 *
 * Both are computed from chess.js rather than the engine — they are facts about
 * the rules, not opinions about the position, so they should be instant and
 * should not queue behind a search.
 */

export const FILES = "abcdefgh";
export const RANKS = "12345678";

/** Palette — validated with the dataviz palette checker (all checks pass). */
export const HEAT_WHITE = "28, 176, 246"; // macaw blue
export const HEAT_BLACK = "255, 150, 0"; // fox orange
export const MOVE_DOT = "rgba(88, 204, 2, 0.55)"; // feather green
export const CAPTURE_RING = "rgba(255, 75, 75, 0.75)"; // cardinal red

export type Overlays = Record<string, React.CSSProperties>;

/**
 * Squares a piece on `from` may legally move to, split into quiet moves and
 * captures. Captures get a different treatment because "you can go here" and
 * "you can take this" are different pieces of information.
 */
export function legalTargets(game: Chess, from: string): { quiet: string[]; captures: string[] } {
  const quiet: string[] = [];
  const captures: string[] = [];
  for (const move of game.moves({ square: from as Square, verbose: true })) {
    (move.captured ? captures : quiet).push(move.to);
  }
  return { quiet, captures };
}

/** Square styles marking where the held piece can go. */
export function moveHints(game: Chess, from: string | null): Overlays {
  if (!from) return {};
  const { quiet, captures } = legalTargets(game, from);
  const styles: Overlays = {
    // The origin square gets a soft wash so it reads as "this is the one you
    // picked up" even while the piece is following the cursor.
    [from]: { boxShadow: "inset 0 0 0 4px rgba(88, 204, 2, 0.5)" },
  };
  for (const square of quiet) {
    styles[square] = {
      // A centred dot, drawn with a radial gradient so it needs no extra DOM.
      background: `radial-gradient(circle, ${MOVE_DOT} 18%, transparent 20%)`,
    };
  }
  for (const square of captures) {
    // A ring rather than a dot: the square is occupied, so the middle must stay
    // clear or the piece underneath is obscured.
    styles[square] = { boxShadow: `inset 0 0 0 5px ${CAPTURE_RING}`, borderRadius: "50%" };
  }
  return styles;
}

/**
 * How many pieces of each colour attack every square.
 *
 * Note this counts *attackers*, which includes defence of one's own pieces —
 * that is the intended reading of "who covers this square", and it is why a
 * square with your own piece on it can still be deeply shaded.
 */
export function controlMap(game: Chess): Record<string, { white: number; black: number }> {
  const map: Record<string, { white: number; black: number }> = {};
  for (const file of FILES) {
    for (const rank of RANKS) {
      const square = `${file}${rank}` as Square;
      map[square] = {
        white: game.attackers(square, "w" as Color).length,
        black: game.attackers(square, "b" as Color).length,
      };
    }
  }
  return map;
}

/**
 * Discrete shading tiers. A continuous ramp made neighbouring squares hard to
 * tell apart; three clearly separated steps are readable at a glance, which is
 * the whole point of a heatmap.
 */
export const TIERS = [0.22, 0.4, 0.62] as const;

/** 0 attackers -> null, 1 -> tier 1, 2 -> tier 2, 3+ -> tier 3. */
function tierAlpha(attackers: number): number | null {
  if (attackers <= 0) return null;
  return TIERS[Math.min(attackers, 3) - 1];
}

/**
 * Heatmap styles showing BOTH sides' coverage of every square.
 *
 * An earlier version shaded only the net difference, which hid the most
 * interesting squares on the board: a square attacked three times and defended
 * three times is the sharpest point in the position, and net-shading rendered
 * it as empty.
 *
 * So each square shows both. When only one side covers it, the square takes
 * that side's colour at the tier for its attacker count. When both do, the
 * square is split on the diagonal — top-left for White, bottom-right for Black
 * — each half carrying its own tier. Hard gradient stops, no blending, so the
 * split reads as two distinct facts rather than one muddy mixture.
 */
export function heatmap(game: Chess): Overlays {
  const control = controlMap(game);
  const styles: Overlays = {};

  for (const [square, { white, black }] of Object.entries(control)) {
    const w = tierAlpha(white);
    const b = tierAlpha(black);
    if (w === null && b === null) continue;

    if (w !== null && b !== null) {
      styles[square] = {
        backgroundImage:
          `linear-gradient(135deg, rgba(${HEAT_WHITE}, ${w}) 0 50%, ` +
          `rgba(${HEAT_BLACK}, ${b}) 50% 100%)`,
      };
    } else if (w !== null) {
      styles[square] = { backgroundColor: `rgba(${HEAT_WHITE}, ${w})` };
    } else {
      styles[square] = { backgroundColor: `rgba(${HEAT_BLACK}, ${b})` };
    }
  }
  return styles;
}

/** Merge overlay layers, with later layers winning on conflicting keys. */
export function mergeOverlays(...layers: Overlays[]): Overlays {
  const out: Overlays = {};
  for (const layer of layers) {
    for (const [square, style] of Object.entries(layer)) {
      out[square] = { ...out[square], ...style };
    }
  }
  return out;
}
