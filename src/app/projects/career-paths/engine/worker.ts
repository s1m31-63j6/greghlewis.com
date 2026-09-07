/**
 * Simulation worker. Ten thousand careers per first job take a couple of
 * seconds on the main thread and would freeze every click; here they run off
 * it and the page keeps the previous cohorts on screen until the new ones
 * arrive. Params are sent once and cached.
 */

import { loadParams } from "./params.ts";
import { runCohort } from "./stats.ts";
import type { Career, Params, Persona, Stage, Track3 } from "./types.ts";

export interface SimRequest {
  type: "simulate";
  id: number;
  track: Track3;
  persona: Persona;
  stage: Stage | null;
  stay: boolean;
  seed: number;
  n: number;
  /** Raw params.json; only needed on the first request. */
  raw?: unknown;
}

export interface SimResponse {
  type: "result";
  id: number;
  track: Track3;
  careers: Career[];
}

let P: Params | null = null;

self.onmessage = (e: MessageEvent<SimRequest>) => {
  const req = e.data;
  if (req.raw) P = loadParams(req.raw);
  if (!P) return;
  const careers = runCohort(req.persona, req.track, P, req.n, { stage: req.stage, stay: req.stay, seed: req.seed });
  const res: SimResponse = { type: "result", id: req.id, track: req.track, careers };
  self.postMessage(res);
};
