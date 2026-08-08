"use client";

import { Chess, type Color, type PieceSymbol } from "chess.js";

/** Conventional relative values. Kings are priceless and excluded. */
export const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

/** What each side starts with, used to work out what has been captured. */
const STARTING_COUNTS: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };

export type MaterialSummary = {
  white: number;
  black: number;
  /** Positive means White is up; negative means Black is. */
  diff: number;
  /** Black pieces White has taken, best piece first. */
  takenByWhite: PieceSymbol[];
  takenByBlack: PieceSymbol[];
};

const ORDER: PieceSymbol[] = ["q", "r", "b", "n", "p"] as PieceSymbol[];

function counts(game: Chess, colour: Color): Record<string, number> {
  const tally: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  for (const row of game.board()) {
    for (const square of row) {
      if (square && square.color === colour && square.type !== "k") {
        tally[square.type] += 1;
      }
    }
  }
  return tally;
}

/**
 * Material on the board and what has been captured.
 *
 * Counted from the position rather than from the move list, so it stays correct
 * when the board is rewound during a review — a captured-piece list accumulated
 * move by move would keep showing pieces that have not been taken yet.
 */
export function material(game: Chess): MaterialSummary {
  const w = counts(game, "w" as Color);
  const b = counts(game, "b" as Color);

  const score = (tally: Record<string, number>) =>
    Object.entries(tally).reduce((sum, [type, n]) => sum + PIECE_VALUE[type] * n, 0);

  const missing = (tally: Record<string, number>): PieceSymbol[] => {
    const out: PieceSymbol[] = [];
    for (const type of ORDER) {
      const gone = STARTING_COUNTS[type] - tally[type];
      // Promotions can push a count above its starting value; clamp so an extra
      // queen never renders as "-1 queens captured".
      for (let i = 0; i < Math.max(0, gone); i++) out.push(type);
    }
    return out;
  };

  const white = score(w);
  const black = score(b);
  return {
    white,
    black,
    diff: white - black,
    takenByWhite: missing(b),
    takenByBlack: missing(w),
  };
}
