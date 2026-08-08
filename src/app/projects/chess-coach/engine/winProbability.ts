/**
 * Centipawns -> win probability.
 *
 * A raw evaluation is a terrible thing to show a player: "+1.4" means nothing
 * unless you already know chess, and the *same* +1.4 means something completely
 * different in a queenless endgame than in a sharp middlegame. A percentage is
 * immediately readable, and it compresses sensibly — the difference between +8
 * and +12 is nearly nothing, which is exactly how the curve behaves.
 *
 * The logistic constant is Lichess's, fitted against a large sample of real
 * games, so the numbers line up with what players are used to seeing.
 */

/** Logistic steepness, fitted by Lichess against millions of games. */
const K = 0.00368208;

/** Win probability for White, 0-100, from a centipawn score in White's frame. */
export function winProbability(centipawns: number): number {
  return 100 / (1 + Math.exp(-K * centipawns));
}

/** The same number, framed for whichever colour the human is playing. */
export function winProbabilityFor(centipawns: number, colour: "w" | "b"): number {
  const white = winProbability(centipawns);
  return colour === "w" ? white : 100 - white;
}
