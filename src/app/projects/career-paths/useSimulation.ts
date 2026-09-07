"use client";

import { useEffect, useRef, useState } from "react";

import type { SimRequest, SimResponse } from "./engine/worker.ts";
import type { Career, Persona, Stage, Track3 } from "./engine/types.ts";
import { TRACKS3 } from "./engine/types.ts";

/** Careers per first job. The reference cohorts checked by tie_out.mts stay at 1,000. */
export const N_BALLS = 3000;

export interface TrackRun {
  track: Track3;
  /** Replaced only when its own inputs change, so array identity says whether it moved. */
  careers: Career[];
}

export interface SimSettings {
  persona: Persona;
  stage: Stage | null;
  stay: boolean;
  seed: number;
}

function trackKey(track: Track3, s: SimSettings): string {
  const stage = track === "startup" ? s.stage ?? "blended" : "-";
  return `${track}|${s.persona}|${stage}|${s.stay}|${s.seed}`;
}

function trackSeed(track: Track3, seed: number): number {
  return (seed + (track === "startup" ? 1 : track === "corporate" ? 2 : 3)) >>> 0;
}

/**
 * Three thousand careers per first job, simulated in a Web Worker. Each track
 * re-runs only when its own inputs change (a stage change touches startup
 * alone). Results are published only once every requested track has landed,
 * so a reroll re-drops all three cohorts together rather than one by one as
 * the worker finishes them; the previous cohorts stay on screen meanwhile.
 */
export function useSimulation(raw: unknown, s: SimSettings): { runs: TrackRun[] | null; busy: boolean } {
  const worker = useRef<Worker | null>(null);
  const sentParams = useRef(false);
  const keys = useRef<Record<Track3, string>>({ startup: "", corporate: "", consulting: "" });
  const pending = useRef<Record<Track3, number>>({ startup: 0, corporate: 0, consulting: 0 });
  const arrived = useRef<Partial<Record<Track3, Career[]>>>({});
  const nextId = useRef(1);
  const [careers, setCareers] = useState<Record<Track3, Career[] | null>>({ startup: null, corporate: null, consulting: null });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const w = new Worker(new URL("./engine/worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<SimResponse>) => {
      const res = e.data;
      if (pending.current[res.track] !== res.id) return; // superseded
      pending.current[res.track] = 0;
      arrived.current[res.track] = res.careers;
      if (TRACKS3.some((t) => pending.current[t] !== 0)) return; // wait for the batch
      const batch = arrived.current;
      arrived.current = {};
      setCareers((c) => ({ ...c, ...batch }));
      setBusy(false);
    };
    worker.current = w;
    return () => {
      w.terminate();
      worker.current = null;
      sentParams.current = false;
      keys.current = { startup: "", corporate: "", consulting: "" };
    };
  }, []);

  const { persona, stage, stay, seed } = s;
  useEffect(() => {
    const w = worker.current;
    if (!w || !raw) return;
    let asked = false;
    for (const track of TRACKS3) {
      const key = trackKey(track, { persona, stage, stay, seed });
      if (keys.current[track] === key) continue;
      keys.current[track] = key;
      const id = nextId.current++;
      pending.current[track] = id;
      const req: SimRequest = {
        type: "simulate", id, track, persona, stay, n: N_BALLS,
        stage: track === "startup" ? stage : null,
        seed: trackSeed(track, seed),
        raw: sentParams.current ? undefined : raw,
      };
      sentParams.current = true;
      w.postMessage(req);
      asked = true;
    }
    if (asked) setBusy(true);
  }, [raw, persona, stage, stay, seed]);

  const ready = TRACKS3.every((t) => careers[t] !== null);
  const runs = ready ? TRACKS3.map((t) => ({ track: t, careers: careers[t] as Career[] })) : null;
  return { runs, busy };
}
