/**
 * The engine's Web Worker.
 *
 * A search is a few million play-steps and would otherwise freeze the page for
 * about a second on every decision. Running it here keeps the board responsive
 * and lets the UI show that it is thinking.
 *
 * The worker owns the models, so the JSON is fetched and parsed once per
 * session rather than once per decision.
 */

import { buildModels, fetchModels, type ModelBundle, type Models } from "./models";
import { evaluate, evaluateDefense, resolve, resolveDefense, resolveKickoff, resolvePat } from "./engine";
import { mulberry32 } from "./rng";
import type { Action, DefenseAction, Evaluation, GameState, Outcome } from "./types";

type Request =
  | { id: number; kind: "init"; base: string }
  | { id: number; kind: "evaluate"; state: GameState; side: "offense" | "defense"; n: number; seed: number; season: number }
  | { id: number; kind: "advance"; state: GameState; action: Action; side: "offense" | "defense"; seed: number; season: number };

type Response =
  | { id: number; ok: true; kind: "init" }
  | { id: number; ok: true; kind: "evaluate"; evals: Evaluation[] }
  | { id: number; ok: true; kind: "advance"; state: GameState; outcome: Outcome | null;
      offenseAction: Action | null }
  | { id: number; ok: false; error: string };

let bundle: ModelBundle | null = null;
const cache = new Map<number, Models>();

function models(season: number): Models {
  if (!bundle) throw new Error("worker used before init");
  let m = cache.get(season);
  if (!m) {
    m = buildModels(bundle, season);
    cache.set(season, m);
  }
  return m;
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const req = e.data;
  const post = (r: Response) => (self as unknown as Worker).postMessage(r);
  try {
    if (req.kind === "init") {
      bundle = await fetchModels(req.base);
      post({ id: req.id, ok: true, kind: "init" });
      return;
    }
    const m = models(req.season);
    if (req.kind === "evaluate") {
      const evals =
        req.side === "defense"
          ? evaluateDefense(req.state, m, null, req.n, req.seed)
          : evaluate(req.state, m, null, req.n, req.seed);
      post({ id: req.id, ok: true, kind: "evaluate", evals });
      return;
    }
    // advance — sample one real outcome for the action the player chose
    const rng = mulberry32(req.seed);
    const s = req.state;
    let state: GameState;
    let outcome: Outcome | null = null;
    // What the opposing offense chose, when the play was theirs.
    let offenseAction: Action | null = null;
    if (req.side === "defense") {
      [state, outcome, offenseAction] = resolveDefense(s, req.action as DefenseAction, m, rng);
    } else if (s.phase === "pat") {
      // Label these the same way resolveDefense does, so narration has
      // something to dispatch on whichever side of the ball you are.
      state = resolvePat(s, req.action, m, rng);
      outcome = "conversion";
    } else if (s.phase === "kickoff") {
      state = resolveKickoff(s, req.action, m, rng);
      outcome = "kickoff";
    } else if (req.action === "timeout") {
      state = { ...s, offTo: s.offTo - 1, clockRunning: false };
    } else {
      [state, outcome] = resolve(s, req.action, m, rng);
    }
    post({ id: req.id, ok: true, kind: "advance", state, outcome, offenseAction });
  } catch (err) {
    post({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
