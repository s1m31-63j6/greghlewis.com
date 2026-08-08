"use client";

/**
 * The board's piece set: "rhosgfx" by RhosGFX, released under CC0 1.0.
 *
 * Chosen for licence as much as for looks. Most of the friendly, rounded piece
 * sets in circulation — staunty, gioco, cardinal, maestro, anarcandy — are
 * CC BY-NC-SA, and this site is a professional portfolio, which is exactly the
 * commercial-adjacent use an NC clause is meant to restrict. CC0 is a public
 * domain dedication with no conditions at all, so there is nothing to get wrong.
 *
 * Files live in `public/chess-coach/pieces/`, with provenance recorded in
 * `CREDITS.txt` beside them.
 */

/** Board pieces, keyed the way react-chessboard expects (`wP`, `bK`, …). */
export const PIECE_KEYS = [
  "wP", "wN", "wB", "wR", "wQ", "wK",
  "bP", "bN", "bB", "bR", "bQ", "bK",
] as const;

export type PieceKey = (typeof PIECE_KEYS)[number];

export function pieceSrc(key: string): string {
  return `/chess-coach/pieces/${key}.svg`;
}

export const cutePieces = Object.fromEntries(
  PIECE_KEYS.map((key) => [
    key,
    function Piece() {
      return (
        // Board pieces are fixed-size decorative SVGs. next/image adds a wrapper
        // that fights the board's own square sizing and buys nothing for a 4 KB
        // vector, so a plain <img> is the right call here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pieceSrc(key)}
          alt=""
          aria-hidden="true"
          draggable={false}
          style={{ width: "100%", height: "100%", display: "block" }}
        />
      );
    },
  ]),
);
