# Chess Coach — what's built and what's next

## Built

| Feature | Where |
|---|---|
| Calibrated difficulty dial, 600–2200 Elo | `weakening.py`, `calibrate.py` → `public/chess-coach/ladder.json` |
| Play the Coach | `src/app/projects/chess-coach/` |
| Live win-probability trendline | `WinTrend.tsx`, `engine/winProbability.ts` |
| Material tracker | `MaterialBar.tsx`, `material.ts` |
| Legal-move hints + square-control heatmap | `boardOverlays.ts` |
| Post-game review with narration | `engine/review.ts`, `GameReview.tsx` |
| Library: 44 concepts, 150 solvable puzzles | `library/`, `build_library.py` |
| Analysis board: both sides + move suggestions | `analysis/` |

## Built: Analysis Board ("Coach Me")

**Play or arrange both sides, and get the best move suggested at every turn.**

Shipped at `/projects/chess-coach/analysis`. Both-sides control, top-four
candidates with arrows and win percentages, click-to-play, FEN/PGN loading, line
navigation, adjustable depth, flip, plus the heatmap and move hints. Runs
entirely on WASM — no backend, as predicted.

**Still open here:** a drag-pieces-onto-an-empty-board editor. react-chessboard
exports `SparePiece` for exactly this, but it needs the board's provider
context, so it is a bit more than an afternoon. FEN and PGN cover the actual use
case (you have the position from somewhere) so it was not worth blocking on.

### Original scope, for reference

The point is a sandbox rather than a game: set a position up, push the pieces
around for either colour, and ask "what should I play here?" — the thing you
actually want when reviewing a position from your own club game, or when
following along with a book.

### Scope

- **Both-sides control.** No fixed player colour; whoever is to move can be
  moved. Essentially `allowDragging` without the `turn() === playerColor` gate.
- **Suggest the best move**, on demand or always-on: the engine's top choice,
  drawn as an arrow, with the resulting win probability.
- **Show the top few candidates**, not just the best — the MultiPV analysis
  already returns them, and seeing second and third best is where the learning is.
- **Position setup**: paste a FEN, paste a PGN and scrub through it, or drag
  pieces onto an empty board.
- **Reuse the overlays** already built: heatmap, legal-move hints, the
  win-probability trendline.

### Why this is a small job

Almost every part exists already and needs only rewiring:

| Need | Already have |
|---|---|
| Engine analysis, serialised | `engine/uci.ts` — `analyse()` returns ranked MultiPV candidates |
| Win probability | `engine/winProbability.ts` |
| Move quality verdicts + narration | `engine/review.ts` — classification and prose generation are position-local |
| Arrows for suggestions | react-chessboard's `arrows` prop, unused so far |
| Board overlays | `boardOverlays.ts` |
| Playful UI shell | `PlayCoach.tsx` components |

The real work is a new page and a state hook without the turn/colour
restrictions — call it a day, not a phase.

### Worth knowing: this needs no cloud

The original plan scoped "Coach Me" as a Cloud Run + Vertex AI feature. That was
over-scoped. Everything above runs on Stockfish WASM in the browser, offline,
free, with no GCP dependency at all.

**Only the conversational layer needs the backend** — a chat that answers "why
is that the best move?" in prose, rather than the deterministic templates
`review.ts` generates today. Splitting it this way means the analysis board can
ship immediately and the chat can arrive later without reworking it.

## Also outstanding

- **Methodology page** — the calibration curve, the `UCI_Elo` 1320 floor, and
  the reproducible anchor compression are all real results waiting to be written
  up. Data is in `results/tournament.json` and `ladder.json`.
- **Cloud Run + Vertex AI backend** — conversational commentary and the library
  walkthrough chatbot. Blocked on `GCP_SETUP.md`.
- **Browser-verified UI** — everything is typechecked, linted, and logic-tested
  headlessly, but the interactive pieces have only been eyeballed by Greg once.
