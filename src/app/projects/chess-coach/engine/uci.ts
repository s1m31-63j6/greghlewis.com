/**
 * Stockfish WASM, driven over UCI in a Web Worker.
 *
 * Build choice: `stockfish-18-lite-single`. The package ships five flavours;
 * this is the only one that is both small enough to serve (7 MB against 113 MB
 * for the full build) and single-threaded, which matters more than the size.
 *
 * The multi-threaded builds need `SharedArrayBuffer`, which needs COOP/COEP
 * headers on the document, which would block the cross-origin fetch this
 * project makes to Cloud Run for "Coach Me" unless that service also returned
 * `Cross-Origin-Resource-Policy`. Single-threaded sidesteps that entire
 * coupling, and costs nothing here: the strongest rung on the dial is 2200 Elo
 * and this build is far above that even on one thread.
 *
 * The engine is loaded lazily — 7 MB should not land on anyone who opens the
 * page to read the write-up and never starts a game.
 */

const ENGINE_URL = "/chess-coach/engine/stockfish-18-lite-single.js";

/** Mirrors MATE_SCORE in projects/chess-coach/weakening.py. */
export const MATE_SCORE = 10_000;

export type ScoredMove = {
  /** UCI long algebraic, e.g. "g1f3". */
  move: string;
  /** Centipawns from the side-to-move's perspective; larger is better for them. */
  cp: number;
};

/**
 * Fold one `info` line into the best-move-per-rank accumulator.
 *
 * Exported and pure so it can be tested against real Stockfish output without a
 * Worker — see `projects/chess-coach/uci_parse_test.py`. Protocol parsing is
 * where a realistic bug lives; the transport around it is thin.
 *
 * Every line carrying a `multipv` index overwrites that slot, so once the search
 * ends each slot holds the deepest completed iteration for that rank.
 */
export function applyInfoLine(best: Map<number, ScoredMove>, line: string): void {
  if (!line.startsWith("info ")) return;

  const tokens = line.split(/\s+/);
  const pvIndex = tokens.indexOf("pv");
  if (pvIndex === -1) return;
  const move = tokens[pvIndex + 1];
  if (!move) return;

  const cp = parseScore(tokens);
  if (cp === null) return;

  const rankIndex = tokens.indexOf("multipv");
  const rank = rankIndex === -1 ? 1 : Number(tokens[rankIndex + 1]);
  best.set(rank, { move, cp });
}

/**
 * Flatten the accumulator into a best-first candidate list, breaking ties on the
 * engine's own MultiPV rank.
 *
 * The explicit tie-break is defensive rather than corrective: in practice
 * Stockfish emits its multipv lines in ascending rank within each iteration, so
 * `Map` insertion order already equals rank order and a plain sort gives the
 * same answer (verified — removing the tie-break does not change the output on
 * real engine transcripts). It is here so the result does not silently depend on
 * that emission order, which is convention rather than specification.
 *
 * Worth the two extra tokens because tie order is load-bearing downstream: the
 * blunder branch of the sampler weights candidates by their position in this
 * list (`1 / (i + 1)`), so if the order ever did shift, a weak rung would blunder
 * into different moves with no other symptom.
 */
export function rankedMoves(best: Map<number, ScoredMove>): ScoredMove[] {
  return [...best.entries()]
    .sort(([rankA, a], [rankB, b]) => b.cp - a.cp || rankA - rankB)
    .map(([, move]) => move);
}

/** Parse `score cp -45` / `score mate 3` into centipawns, side-to-move relative. */
function parseScore(tokens: string[]): number | null {
  const i = tokens.indexOf("score");
  if (i === -1) return null;
  const kind = tokens[i + 1];
  const value = Number(tokens[i + 2]);
  if (!Number.isFinite(value)) return null;
  if (kind === "cp") return value;
  // Mate in N: keep the sign, and make faster mates score higher, so the
  // sampler's ordering puts mate-in-2 above mate-in-5.
  if (kind === "mate") return value > 0 ? MATE_SCORE - value : -MATE_SCORE - value;
  return null;
}

export class StockfishEngine {
  private worker: Worker;
  private listeners = new Set<(line: string) => void>();
  private ready: Promise<void>;
  // UCI is a single conversation over one pipe: two searches in flight at once
  // would interleave their `info` lines and resolve on each other's `bestmove`.
  // Since there are now two callers — move selection and the win-probability
  // trendline — every search goes through this queue.
  private queue: Promise<unknown> = Promise.resolve();

  constructor() {
    this.worker = new Worker(ENGINE_URL);
    this.worker.onmessage = (event: MessageEvent) => {
      const line = typeof event.data === "string" ? event.data : String(event.data ?? "");
      for (const listener of [...this.listeners]) listener(line);
    };
    this.ready = this.handshake();
  }

  private send(command: string): void {
    this.worker.postMessage(command);
  }

  /** Resolve once `predicate` matches an output line. */
  private until(predicate: (line: string) => boolean): Promise<void> {
    return new Promise((resolve) => {
      const listener = (line: string) => {
        if (predicate(line)) {
          this.listeners.delete(listener);
          resolve();
        }
      };
      this.listeners.add(listener);
    });
  }

  private async handshake(): Promise<void> {
    const uciok = this.until((line) => line.startsWith("uciok"));
    this.send("uci");
    await uciok;
    await this.isReady();
  }

  private async isReady(): Promise<void> {
    const readyok = this.until((line) => line.startsWith("readyok"));
    this.send("isready");
    await readyok;
  }

  /** Wait until the engine has finished booting (including the WASM fetch). */
  async waitUntilReady(): Promise<void> {
    await this.ready;
  }

  /** Clear hash and search history — call between games, not between moves. */
  async newGame(): Promise<void> {
    await this.ready;
    this.send("ucinewgame");
    await this.isReady();
  }

  /** Serialize a search behind any already in flight. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Objective evaluation of `fen` in centipawns, from White's point of view.
   *
   * Deliberately independent of the coach's difficulty: the trendline should
   * show what is *actually* happening on the board, not what a 700-rated
   * opponent can see. A weak rung searching at depth 1 would otherwise draw a
   * win-probability line that is simply wrong.
   */
  evaluate(fen: string, depth = 12): Promise<number> {
    return this.enqueue(async () => {
      await this.ready;
      const best = new Map<number, ScoredMove>();
      const done = new Promise<void>((resolve) => {
        const listener = (line: string) => {
          if (line.startsWith("bestmove")) {
            this.listeners.delete(listener);
            resolve();
            return;
          }
          applyInfoLine(best, line);
        };
        this.listeners.add(listener);
      });

      this.send("setoption name MultiPV value 1");
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}`);
      await done;

      const top = rankedMoves(best)[0];
      if (!top) return 0;
      // UCI scores are relative to the side to move; the trendline wants a
      // single fixed frame, so flip when it is Black's turn.
      const blackToMove = fen.split(" ")[1] === "b";
      return blackToMove ? -top.cp : top.cp;
    });
  }

  /**
   * Analyse `fen` and return the top `multipv` moves, best first.
   */
  analyse(fen: string, depth: number, multipv: number): Promise<ScoredMove[]> {
    return this.enqueue(() => this.runAnalyse(fen, depth, multipv));
  }

  private async runAnalyse(fen: string, depth: number, multipv: number): Promise<ScoredMove[]> {
    await this.ready;

    const best = new Map<number, ScoredMove>();
    const done = new Promise<void>((resolve) => {
      const listener = (line: string) => {
        if (line.startsWith("bestmove")) {
          this.listeners.delete(listener);
          resolve();
          return;
        }
        applyInfoLine(best, line);
      };
      this.listeners.add(listener);
    });

    this.send(`setoption name MultiPV value ${multipv}`);
    this.send(`position fen ${fen}`);
    this.send(`go depth ${depth}`);
    await done;

    return rankedMoves(best);
  }

  terminate(): void {
    this.listeners.clear();
    this.worker.terminate();
  }
}
